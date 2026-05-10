import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { z } from "zod";
import {
  TASK_INTENT_CONTRACTS,
  TASK_INTENTS,
  formatTaskIntentContractForPrompt,
  defaultsForMode,
  getEnv,
  getProjectConfig,
  generatePlanPath,
  isTaskIntent,
  logger,
  resolveTaskIntentDefaults,
  validateGeneratedTaskIntent,
  type TaskIntent,
} from "@aif/shared";
import {
  createTask,
  findProjectById,
  findTasksByRoadmapAlias,
  getMinBacklogPosition,
  listTasks,
} from "@aif/data";
import { UsageSource } from "@aif/runtime";
import { resolveApiLightModel, runApiRuntimeOneShot } from "./runtime.js";

const log = logger("roadmap-generation");

// -- Zod schemas for agent response validation --

const generatedTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().default(""),
  taskIntent: z.enum(TASK_INTENTS).optional(),
  phase: z.number().int().min(1),
  phaseName: z.string().default(""),
  sequence: z.number().int().min(1),
});

const roadmapResponseSchema = z.object({
  alias: z.string().min(1).max(200),
  tasks: z.array(generatedTaskSchema).min(1),
});

export type GeneratedTask = z.infer<typeof generatedTaskSchema>;
export type RoadmapResponse = z.infer<typeof roadmapResponseSchema>;

export interface RoadmapGenerationInput {
  projectId: string;
  roadmapAlias: string;
  /** Explicit typed intent for generated roadmap tasks; aliases remain generic labels. */
  taskIntent?: TaskIntent;
  /** Optional task ID for tracking token usage */
  trackingTaskId?: string;
}

export interface RoadmapGenerationResult {
  alias: string;
  taskIntent?: TaskIntent;
  tasks: GeneratedTask[];
}

type IndexedGeneratedTask = {
  task: GeneratedTask;
  index: number;
};

type AuditRoadmapItem = {
  index: number;
  title: string;
  headline: string;
  text: string;
};

export interface GenerateRoadmapFileInput {
  projectId: string;
  /** Optional label for the generated roadmap. It does not imply task intent. */
  roadmapAlias?: string;
  /** Explicit typed intent for roadmap generation; omitted means generic. */
  taskIntent?: TaskIntent;
  /** Optional user-provided vision/requirements to guide generation */
  vision?: string;
}

export interface GenerateRoadmapFileResult {
  roadmapPath: string;
  content: string;
}

/**
 * Generate a ROADMAP.md file for the project using Agent SDK.
 * Reads DESCRIPTION.md and ARCHITECTURE.md for context, then produces
 * a strategic milestone roadmap.
 */
/** Extract roadmap content from agent outputText, stripping markdown fences if present. */
function extractRoadmapContent(raw: string): string {
  const fenceMatch = raw.match(/```(?:markdown)?\s*\n([\s\S]*?)\n\s*```/);
  return fenceMatch ? fenceMatch[1].trim() : raw.trim();
}

function resolveExplicitRoadmapIntent(taskIntent: string | null | undefined): TaskIntent {
  const normalized = taskIntent?.trim().toLowerCase();
  return isTaskIntent(normalized) ? normalized : "general";
}

const AUDIT_ROADMAP_VALIDATION_MESSAGE =
  "Audit roadmap generation produced implementation-shaped milestones; no tasks imported.";

function splitAuditTextLines(text: string): string[] {
  return text
    .split(/\r?\n|[.;]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasImplementationShapedAuditContent(text: string): boolean {
  const implementationPatterns = [
    /\bcritical\s+bug\s+resolution\b/i,
    /\bbug\s+resolution\b/i,
    /\barchitecture\s+refactoring\b/i,
    /\bsecurity\s+hardening\b/i,
    /\btest\s+suite\s+expansion\b/i,
    /\b(?:fix|fixing|resolve|resolving|implement|implementing|refactor|refactoring|harden|hardening|deploy|deploying|document|documenting)\b/i,
    /\bexpand(?:ing)?\s+(?:the\s+)?(?:test\s+suite|tests?|coverage)\b/i,
  ];
  const diagnosticFrame =
    /\b(?:diagnostic|findings?\s+(?:about|for|on)|report\s+(?:about|on)|review\s+(?:of|for)|inventory\s+(?:of|for)|evidence\s+(?:of|for)|risk\s+(?:in|of|from))\b/i;

  return splitAuditTextLines(text).some((line) => {
    if (/\b(?:do not|must not|forbid|forbidden|no source|no config|no test)\b/i.test(line)) {
      return false;
    }
    if (!implementationPatterns.some((pattern) => pattern.test(line))) {
      return false;
    }
    return !diagnosticFrame.test(line);
  });
}

function extractAuditRoadmapItems(roadmapContent: string): AuditRoadmapItem[] {
  const items: AuditRoadmapItem[] = [];
  const lines = roadmapContent.split(/\r?\n/);
  let current: { headline: string; lines: string[]; index: number } | null = null;

  const flush = () => {
    if (!current) return;
    const headline = current.headline.trim();
    const boldTitle = headline.match(/\*\*([^*]+)\*\*/)?.[1]?.trim();
    const withoutCheckbox = headline.replace(/^\s*[-*]\s+\[\s\]\s+/, "").trim();
    const title = (boldTitle ?? withoutCheckbox.split(/\s+(?:-|--|\u2013|\u2014)\s+/)[0]).trim();
    items.push({
      index: current.index,
      title,
      headline,
      text: current.lines.join("\n").trim(),
    });
  };

  lines.forEach((line, index) => {
    const unchecked = line.match(/^\s*[-*]\s+\[\s\]\s+(.+)$/);
    const checked = /^\s*[-*]\s+\[[xX]\]\s+/.test(line);
    if (unchecked) {
      flush();
      current = { headline: unchecked[1], lines: [line], index: index + 1 };
      return;
    }
    if (checked) {
      flush();
      current = null;
      return;
    }
    current?.lines.push(line);
  });
  flush();

  return items;
}

function isAuditSynthesisTitle(title: string): boolean {
  return /\b(?:synthesi[sz]e|synthesis|summary|summari[sz]e|final\s+audit|audit\s+findings\s+summary)\b/i.test(
    title,
  );
}

function getAuditAllowedChangesLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s+allowed changes\s*:/i.test(line) || /^allowed changes\s*:/i.test(line));
}

function getAuditReportArtifactLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s+report artifact\s*:/i.test(line) || /^report artifact\s*:/i.test(line));
}

function extractPathTokens(text: string): string[] {
  return [...text.matchAll(/`?([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[A-Za-z0-9]+)`?/g)].map(
    (match) => match[1],
  );
}

function isAuditReportArtifactPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".md") &&
    (lower.startsWith("audit/") ||
      lower.includes("/audit/") ||
      /\b(?:audit|report|summary|findings)\b/.test(lower))
  );
}

function hasNonReportAllowedChangeTarget(value: string): boolean {
  const explicitPaths = extractPathTokens(value);
  if (explicitPaths.some((path) => !isAuditReportArtifactPath(path))) {
    return true;
  }

  return (
    /\b(?:edit|modify|change|update|create)\s+(?:source|config|test|tests|package|packages|src|app|apps|runtime|api|web|shared|code)\b/i.test(
      value,
    ) ||
    /\b(?:source|config|test|tests|package|packages|src|app|apps|runtime|api|web|shared|code)\s+(?:file|files|paths?|changes?|edits?)\b/i.test(
      value,
    )
  );
}

function validateAuditAllowedChangesText(text: string, issues: string[], label: string): void {
  const lines = getAuditAllowedChangesLines(text);
  if (lines.length === 0) {
    issues.push(`${label} is missing Allowed changes`);
    return;
  }

  for (const line of lines) {
    const value = line.replace(/^-?\s*allowed changes\s*:\s*/i, "").trim();
    if (/^(?:none|no changes|n\/a|nothing)\.?$/i.test(value)) {
      issues.push(`${label} uses contradictory Allowed changes: None`);
      continue;
    }
    const reportOnly =
      /\bonly\b/i.test(value) &&
      /\b(?:create\/update|create or update|create|update)\b/i.test(value) &&
      /\b(?:report artifact|summary artifact|audit\/[\w./-]+\.md|[\w./-]+\.md)\b/i.test(value);
    if (!reportOnly || hasNonReportAllowedChangeTarget(value)) {
      issues.push(`${label} must limit Allowed changes to the report artifact`);
    }
  }
}

function validateAuditReportArtifactText(text: string, issues: string[], label: string): void {
  const lines = getAuditReportArtifactLines(text);
  if (lines.length === 0) {
    issues.push(`${label} is missing a report artifact path`);
    return;
  }

  for (const line of lines) {
    const value = line.replace(/^-?\s*report artifact\s*:\s*/i, "").trim();
    const path = extractPathTokens(value)[0];
    if (!path || !isAuditReportArtifactPath(path)) {
      issues.push(`${label} is missing a report artifact path`);
    }
  }
}

function validateAuditRoadmapSource(roadmapContent: string): void {
  const items = extractAuditRoadmapItems(roadmapContent);
  const issues: string[] = [];

  if (items.length === 0) {
    issues.push("no unchecked audit items found");
  }

  const synthesisItems = items.filter((item) => isAuditSynthesisTitle(item.title));
  if (synthesisItems.length !== 1) {
    issues.push(`expected exactly one final synthesis card, found ${synthesisItems.length}`);
  }

  for (const item of items) {
    const label = `item "${item.title}"`;
    const lower = item.text.toLowerCase();
    const requiredMarkers = [
      "scope:",
      "allowed changes:",
      "report artifact:",
      "acceptance criteria:",
      "evidence requirements:",
      "git requirements:",
      "constraint:",
      "diagnostic-only",
      "evidence:",
      "risk:",
      "verification:",
      "git status --short",
      "git commit",
      "git log -1 --name-only --oneline",
    ];
    const missing = requiredMarkers.filter((marker) => !lower.includes(marker));
    if (missing.length > 0) {
      issues.push(`${label} is missing ${missing.join(", ")}`);
    }
    validateAuditReportArtifactText(item.text, issues, label);
    if (hasImplementationShapedAuditContent(`${item.title}\n${item.text}`)) {
      issues.push(`${label} describes implementation work`);
    }
    validateAuditAllowedChangesText(item.text, issues, label);
  }

  if (issues.length > 0) {
    throw new RoadmapGenerationError(
      "VALIDATION_ERROR",
      `${AUDIT_ROADMAP_VALIDATION_MESSAGE} ${issues.slice(0, 5).join("; ")}`,
    );
  }
}

function validateAuditGeneratedBatch(tasks: GeneratedTask[]): string[] {
  const issues: string[] = [];
  const synthesisCount = tasks.filter((task) => isAuditSynthesisTitle(task.title)).length;
  if (synthesisCount !== 1) {
    issues.push(`expected exactly one final synthesis card, found ${synthesisCount}`);
  }

  for (const task of tasks) {
    validateAuditAllowedChangesText(
      `${task.title}\n${task.description ?? ""}`,
      issues,
      `task "${task.title}"`,
    );
    validateAuditReportArtifactText(
      `${task.title}\n${task.description ?? ""}`,
      issues,
      `task "${task.title}"`,
    );
  }

  return issues;
}

function auditSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "area"
  );
}

function buildAuditRoadmapItem(title: string, scope: string, reportPath: string): string {
  return [
    `- [ ] **${title}** - Diagnostic-only audit.`,
    `  - Scope: ${scope}`,
    `  - Allowed changes: only create/update ${reportPath}.`,
    `  - Report artifact: ${reportPath}`,
    "  - Acceptance criteria: inspect the scoped files and record concrete findings or explicitly record no findings.",
    "  - Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, and Verification: Command ... output ...",
    "  - Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.",
    "  - Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
  ].join("\n");
}

function buildDeterministicAuditRoadmapContent(ctx: {
  description: string | null;
  architecture: string | null;
  vision: string | null;
}): string {
  const reportDate = new Date().toISOString().slice(0, 10);
  const goal =
    ctx.vision?.trim().replace(/\s+/g, " ").slice(0, 180) ||
    "Audit the project for security, performance, correctness, and operational readiness";
  const areas = [
    {
      title: "Audit: project structure and task routing",
      scope: "package.json, turbo.json, packages/api/src, packages/web/src, packages/shared/src",
    },
    {
      title: "Audit: security and configuration controls",
      scope: ".env.example, docs/configuration.md, packages/shared/src/env.ts, packages/api/src",
    },
    {
      title: "Audit: performance and realtime behavior",
      scope: "packages/api/src, packages/web/src, packages/runtime/src, docs/api.md",
    },
    {
      title: "Audit: persistence and migration safety",
      scope: "packages/shared/src, packages/data/src, docs/api.md",
    },
    {
      title: "Audit: runtime orchestration boundaries",
      scope: "packages/runtime/src, packages/agent/src, docs/providers.md",
    },
    {
      title: "Audit: test and operations readiness",
      scope:
        "packages/api/src/__tests__, packages/shared/src/__tests__, docker-compose.yml, docker-compose.production.yml, docs/ops",
    },
  ];

  const tasks = areas.map((area) =>
    buildAuditRoadmapItem(
      area.title,
      area.scope,
      `audit/${reportDate}-${auditSlug(area.title)}-audit.md`,
    ),
  );
  tasks.push(
    buildAuditRoadmapItem(
      "Synthesize audit findings",
      `all audit/${reportDate}-*-audit.md reports from this audit batch`,
      `audit/${reportDate}-summary.md`,
    ),
  );

  return [
    "# Project Audit Roadmap",
    "",
    `> ${goal}`,
    "",
    "## Audit Tasks",
    "",
    tasks.join("\n\n"),
  ].join("\n");
}

function ensureGeneratedAuditRoadmapContent(
  content: string,
  ctx: {
    description: string | null;
    architecture: string | null;
    vision: string | null;
  },
  source: "file" | "output",
): string {
  try {
    validateAuditRoadmapSource(content);
    return content;
  } catch (err) {
    log.warn(
      {
        err,
        source,
      },
      "Generated audit roadmap failed validation; using deterministic diagnostic fallback",
    );
    const fallback = buildDeterministicAuditRoadmapContent(ctx);
    validateAuditRoadmapSource(fallback);
    return fallback;
  }
}

function auditDescriptionFromItem(item: AuditRoadmapItem): string {
  return item.text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().replace(/^-\s+/, ""))
    .filter(Boolean)
    .join("\n");
}

function buildAuditRoadmapGenerationResult(
  roadmapContent: string,
  alias: string,
): RoadmapGenerationResult {
  let auditSequence = 0;
  let synthesisSequence = 0;
  return {
    alias,
    taskIntent: "audit",
    tasks: extractAuditRoadmapItems(roadmapContent).map((item) => {
      const synthesis = isAuditSynthesisTitle(item.title);
      const sequence = synthesis ? ++synthesisSequence : ++auditSequence;
      return {
        title: item.title,
        taskIntent: "audit" as const,
        description: auditDescriptionFromItem(item),
        phase: synthesis ? 2 : 1,
        phaseName: synthesis ? "Synthesis" : "Audit",
        sequence,
      };
    }),
  };
}

export async function generateRoadmapFile(
  input: GenerateRoadmapFileInput,
): Promise<GenerateRoadmapFileResult> {
  const { projectId, taskIntent, vision } = input;

  log.info({ projectId }, "Starting roadmap file generation");

  const project = findProjectById(projectId);
  if (!project) {
    throw new RoadmapGenerationError("PROJECT_NOT_FOUND", `Project ${projectId} not found`);
  }

  // Read project context
  const projectCfg = getProjectConfig(project.rootPath);
  const descriptionPath = join(project.rootPath, projectCfg.paths.description);
  const architecturePath = join(project.rootPath, projectCfg.paths.architecture);

  const description = existsSync(descriptionPath) ? readFileSync(descriptionPath, "utf8") : null;
  const architecture = existsSync(architecturePath) ? readFileSync(architecturePath, "utf8") : null;

  if (!description && !vision) {
    throw new RoadmapGenerationError(
      "NO_CONTEXT",
      "No DESCRIPTION.md found and no vision provided. Cannot generate roadmap without project context.",
    );
  }

  log.debug(
    {
      hasDescription: !!description,
      hasArchitecture: !!architecture,
      hasVision: !!vision,
    },
    "Project context loaded for roadmap generation",
  );

  const intent = resolveExplicitRoadmapIntent(taskIntent);
  const basePrompt = buildRoadmapGenerationPrompt(
    {
      description,
      architecture,
      vision: vision ?? null,
    },
    intent,
  );
  let rawResult = "";
  try {
    const { result } = await runApiRuntimeOneShot({
      projectId,
      projectRoot: project.rootPath,
      prompt: basePrompt,
      workflowKind: "roadmap-generate",
      systemPromptAppend:
        "Do not spawn subagents. Reply directly with the ROADMAP.md content in markdown format. No JSON, no code fences around the entire output.",
      usageContext: { source: UsageSource.ROADMAP_GENERATE },
    });
    rawResult = (result.outputText ?? "").trim();
  } catch (err) {
    log.error({ err, projectId }, "Agent SDK roadmap generation error");
    throw new RoadmapGenerationError(
      "AGENT_UNAVAILABLE",
      `Agent SDK unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Write ROADMAP.md — agent may have already written the file via tools (CLI mode),
  // so check the file first before falling back to outputText.
  const cfg = getProjectConfig(project.rootPath);
  const roadmapPath = join(project.rootPath, cfg.paths.roadmap);
  mkdirSync(dirname(roadmapPath), { recursive: true });

  let content: string;
  const auditContext = { description, architecture, vision: vision ?? null };
  if (existsSync(roadmapPath)) {
    const fileContent = readFileSync(roadmapPath, "utf8").trim();
    // Verify agent wrote a real roadmap, not just a stub
    if (fileContent.length > 100 && (fileContent.includes("- [") || fileContent.includes("##"))) {
      if (intent === "audit") {
        content = ensureGeneratedAuditRoadmapContent(fileContent, auditContext, "file");
        writeFileSync(roadmapPath, content, "utf8");
      } else {
        content = fileContent;
      }
      log.info({ projectId, roadmapPath, source: "file" }, "Using roadmap file written by agent");
    } else {
      content = extractRoadmapContent(rawResult);
      if (intent === "audit") {
        content = ensureGeneratedAuditRoadmapContent(content, auditContext, "output");
      }
      writeFileSync(roadmapPath, content, "utf8");
    }
  } else if (rawResult) {
    content = extractRoadmapContent(rawResult);
    if (intent === "audit") {
      content = ensureGeneratedAuditRoadmapContent(content, auditContext, "output");
    }
    writeFileSync(roadmapPath, content, "utf8");
  } else {
    throw new RoadmapGenerationError("EMPTY_RESPONSE", "Agent returned empty roadmap");
  }

  log.info({ projectId, roadmapPath, contentLength: content.length }, "Roadmap file generated");

  return { roadmapPath, content };
}

function buildRoadmapGenerationPrompt(
  ctx: {
    description: string | null;
    architecture: string | null;
    vision: string | null;
  },
  intent: TaskIntent,
): string {
  const sections: string[] = [];

  if (ctx.description) {
    sections.push(`PROJECT DESCRIPTION:\n<<<DESC\n${ctx.description}\nDESC`);
  }
  if (ctx.architecture) {
    sections.push(`ARCHITECTURE:\n<<<ARCH\n${ctx.architecture}\nARCH`);
  }
  if (ctx.vision) {
    sections.push(`USER VISION / REQUIREMENTS:\n<<<VISION\n${ctx.vision}\nVISION`);
  }

  if (intent === "audit") {
    const reportDate = new Date().toISOString().slice(0, 10);
    return `You are creating a diagnostic audit decomposition roadmap based on the project context below.

${sections.join("\n\n")}

Generate a ROADMAP.md file with the following format:

# Project Audit Roadmap

> <one-line audit goal>

## Audit Tasks

- [ ] **Audit: <small area name>** - Diagnostic-only audit.
  - Scope: <3-10 concrete files or directories to inspect>
  - Allowed changes: only create/update one report artifact.
  - Report artifact: audit/${reportDate}-<short-name>-audit.md
  - Acceptance criteria: <specific checks this audit must complete>
  - Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, and Verification: Command ... output ...
  - Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.
  - Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.

- [ ] **Synthesize audit findings** - Diagnostic-only synthesis.
  - Scope: all audit/${reportDate}-*-audit.md reports from this audit batch.
  - Allowed changes: only create/update audit/${reportDate}-summary.md.
  - Report artifact: audit/${reportDate}-summary.md
  - Acceptance criteria: summarize blocking findings, non-blocking findings, and remediation backlog.
  - Evidence requirements: every summarized finding must include Evidence: audit/${reportDate}-<source>-audit.md, Risk:, and Verification: Command ... output ...
  - Git requirements: run git status --short; git add the summary artifact; git commit the summary artifact; verify with git log -1 --name-only --oneline.
  - Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.

Rules:
- Create 6-12 small audit tasks plus exactly one final synthesis task.
- Every task must be diagnostic-only.
- Do not create implementation, fixing, refactoring, hardening, test-expansion, deployment, or documentation tasks.
- Prefer narrow scopes such as project structure, configuration, persistence, integrations, orchestration, error handling, security, tests, packaging, and ops readiness.
- Each audit task must be independently runnable and must have exactly one report artifact.
- Output ONLY the markdown content for ROADMAP.md, nothing else`;
  }

  if (intent !== "general") {
    const contract = TASK_INTENT_CONTRACTS[intent];
    return `You are creating a typed ${intent} task decomposition roadmap based on the project context below.

${sections.join("\n\n")}

Intent contract:
${formatTaskIntentContractForPrompt(intent)}

Generate a ROADMAP.md file with the following format:

# Project ${contract.label} Roadmap

> <one-line ${intent} goal>

## ${contract.label} Tasks

- [ ] **<small task title>** - ${contract.decomposition}
  - Task intent: ${intent}
  - Acceptance criteria: <specific done conditions>
  - Verification: <specific command or manual verification and expected outcome>
  - Dependencies: <previous task titles or "none">
  - Scope: <specific files, directories, or user-facing behavior>
  - Evidence requirements: ${contract.evidenceRequirements}
  - Allowed changes: ${contract.allowedFileChanges}

Rules:
- Every unchecked item must be a ${intent} task.
- Keep tasks small enough to implement or validate independently.
- Preserve dependency order.
- Do not create tasks for a different intent.
- Output ONLY the markdown content for ROADMAP.md, nothing else`;
  }

  return `You are creating a strategic project roadmap based on the project context below.

${sections.join("\n\n")}

Generate a ROADMAP.md file with the following format:

# Project Roadmap

> <one-line project vision>

## Milestones

- [ ] **Milestone Name** — short description of what this achieves
- [ ] **Milestone Name** — short description of what this achieves

## Completed

| Milestone | Date |
|-----------|------|

Rules:
- Each milestone is a HIGH-LEVEL goal, not a granular task
- 5-15 milestones is the sweet spot
- Order by logical sequence (dependencies first)
- If something appears already built based on the description, mark it [x] and add to Completed table with today's date
- Milestones should be specific and actionable, not vague
- Cover the full scope of the project from current state to production-ready
- Output ONLY the markdown content for ROADMAP.md, nothing else`;
}

/**
 * Read ROADMAP.md from the project root and use Agent SDK to extract
 * structured task data as JSON. Validates the result via zod.
 */
export async function generateRoadmapTasks(
  input: RoadmapGenerationInput,
): Promise<RoadmapGenerationResult> {
  const { projectId, roadmapAlias, taskIntent, trackingTaskId } = input;

  log.info({ projectId, roadmapAlias }, "Starting roadmap generation");

  // 1. Resolve project root and verify roadmap file
  const project = findProjectById(projectId);
  if (!project) {
    throw new RoadmapGenerationError("PROJECT_NOT_FOUND", `Project ${projectId} not found`);
  }

  const tasksCfg = getProjectConfig(project.rootPath);
  const roadmapPath = join(project.rootPath, tasksCfg.paths.roadmap);
  if (!existsSync(roadmapPath)) {
    throw new RoadmapGenerationError(
      "ROADMAP_NOT_FOUND",
      `Roadmap file not found at ${roadmapPath}`,
    );
  }

  const roadmapContent = readFileSync(roadmapPath, "utf8");
  log.debug({ roadmapPath, contentLength: roadmapContent.length }, "Roadmap file read");

  // 2. Query Agent SDK for strict JSON conversion
  const intent = resolveExplicitRoadmapIntent(taskIntent);
  if (intent === "audit") {
    validateAuditRoadmapSource(roadmapContent);
    const result = buildAuditRoadmapGenerationResult(roadmapContent, roadmapAlias);
    validateRoadmapTasks(result, intent);
    log.info(
      { projectId, roadmapAlias, taskCount: result.tasks.length, source: "deterministic-audit" },
      "Audit roadmap generation complete",
    );
    return result;
  }
  const prompt = buildExtractionPrompt(roadmapContent, roadmapAlias, intent);

  let rawResult = "";
  try {
    const lightModel = await resolveApiLightModel(projectId, trackingTaskId);
    const { result } = await runApiRuntimeOneShot({
      projectId,
      projectRoot: project.rootPath,
      taskId: trackingTaskId ?? null,
      prompt,
      workflowKind: "roadmap-extract",
      modelOverride: lightModel,
      systemPromptAppend:
        "Do not spawn subagents. Reply directly with JSON only. No markdown fences, no explanatory text.",
      usageContext: { source: UsageSource.ROADMAP_EXTRACT },
    });

    // Usage recorded automatically by the runtime registry wrapper via the DB
    // sink (runApiRuntimeOneShot stamps projectId + taskId into usageContext).

    rawResult = (result.outputText ?? "").trim();
  } catch (err) {
    log.error({ err, projectId, roadmapAlias }, "Agent SDK query error");
    throw new RoadmapGenerationError(
      "AGENT_UNAVAILABLE",
      `Agent SDK unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  log.debug({ rawResultLength: rawResult.length }, "Raw agent output received");

  if (!rawResult) {
    throw new RoadmapGenerationError("EMPTY_RESPONSE", "Agent returned empty response");
  }

  // 3. Parse and validate response
  const parsed = parseAgentResponse(rawResult, roadmapAlias, intent);
  const result =
    intent === "general"
      ? {
          ...parsed,
          taskIntent: intent,
          tasks: parsed.tasks.map((task) => ({ ...task, taskIntent: "general" as const })),
        }
      : parsed;
  validateRoadmapTasks(result, intent);
  log.info(
    { projectId, roadmapAlias, taskCount: result.tasks.length },
    "Roadmap generation complete",
  );

  return result;
}

function buildExtractionPrompt(roadmapContent: string, alias: string, intent: TaskIntent): string {
  if (intent === "audit") {
    return `You are converting a diagnostic audit roadmap markdown into structured JSON for task creation.

ROADMAP CONTENT:
<<<ROADMAP
${roadmapContent}
ROADMAP

ALIAS: ${alias}

Convert every unchecked diagnostic audit item into the following JSON structure.
Each item becomes one task. Preserve all task constraints in the description.
Group by phase (numbered sequentially from 1).
Assign each task a sequence number within its phase (starting from 1).

Required output format (JSON only, no markdown fences):
{
  "alias": "${alias}",
  "tasks": [
    {
      "title": "Audit: short area name",
      "taskIntent": "audit",
      "description": "Scope: ...\\nAllowed changes: ...\\nReport artifact: audit/YYYY-MM-DD-name-audit.md\\nAcceptance criteria: ...\\nEvidence requirements: every finding must include Evidence: <path>:<line>, Risk:, and Verification: Command ... output ...\\nGit requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.\\nConstraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
      "phase": 1,
      "phaseName": "Audit",
      "sequence": 1
    }
  ]
}

Rules:
- Only include unchecked audit/synthesis items (- [ ]). Skip completed items (- [x]) entirely.
- Do not create tasks whose primary action is fix, resolve, implement, refactor, harden, expand tests, deploy, or document.
- Every task must remain diagnostic-only.
- Every task must set "taskIntent": "audit".
- Every task description must include Scope:, Allowed changes:, Report artifact:, Acceptance criteria:, Evidence requirements:, Git requirements:, and Constraint:.
- Every task description must require Evidence: <path>:<line>, Risk:, Verification: Command ... output ..., git status --short, git commit, and git log -1 --name-only --oneline.
- Return ONLY valid JSON, no explanatory text`;
  }

  if (intent !== "general") {
    const contract = TASK_INTENT_CONTRACTS[intent];
    const descriptionRequirements: Record<Exclude<TaskIntent, "general" | "audit">, string> = {
      feature:
        "Acceptance criteria: ...\\nVerification: Command ... expected outcome ...\\nDependencies: ...\\nScope: ...",
      fix: "Reproduction: ...\\nRoot cause hypothesis: ...\\nPatch scope: ...\\nRegression: Command ... expected outcome ...",
      spike:
        "Time-box: ...\\nResearch artifact: docs/...\\nQuestions: ...\\nTradeoffs: ...\\nRecommendation: ...\\nExit criteria: ...",
      docs: "Documentation target: docs/... or README.md\\nSource references: ...\\nVerification: Command or manual check ... expected outcome ...",
      tests:
        "Target behavior: ...\\nTest files: ...\\nCommand: npm test -- ...\\nCoverage/regression outcome: ...",
    };
    const descriptionTemplate =
      descriptionRequirements[intent as Exclude<TaskIntent, "general" | "audit">];
    return `You are converting a typed ${intent} roadmap markdown into structured JSON for task creation.

ROADMAP CONTENT:
<<<ROADMAP
${roadmapContent}
ROADMAP

ALIAS: ${alias}

Intent contract:
${formatTaskIntentContractForPrompt(intent)}

Convert every unchecked ${intent} item into the following JSON structure.
Each item becomes one task. Preserve all task constraints in the description.
Group by phase (numbered sequentially from 1).
Assign each task a sequence number within its phase (starting from 1).

Required output format (JSON only, no markdown fences):
{
  "alias": "${alias}",
  "tasks": [
    {
      "title": "Short ${intent} task title",
      "taskIntent": "${intent}",
      "description": "${descriptionTemplate}",
      "phase": 1,
      "phaseName": "${contract.label}",
      "sequence": 1
    }
  ]
}

Rules:
- Only include unchecked items (- [ ]). Skip completed items (- [x]) entirely.
- Every task must set "taskIntent": "${intent}".
- Do not create tasks for another intent.
- Every task description must include the required markers shown in the output example.
- Return ONLY valid JSON, no explanatory text`;
  }

  return `You are converting a project roadmap markdown into structured JSON for task creation.

ROADMAP CONTENT:
<<<ROADMAP
${roadmapContent}
ROADMAP

ALIAS: ${alias}

Convert all milestones/tasks from the roadmap into the following JSON structure.
Each item becomes a task. Group by phase (numbered sequentially from 1).
Assign each task a sequence number within its phase (starting from 1).

Required output format (JSON only, no markdown fences):
{
  "alias": "${alias}",
  "tasks": [
    {
      "title": "short imperative task title",
      "taskIntent": "general",
      "description": "detailed description of what needs to be done",
      "phase": 1,
      "phaseName": "Phase Name",
      "sequence": 1
    }
  ]
}

Rules:
- Only include unchecked milestones (- [ ]). Skip completed milestones (- [x]) entirely — do NOT create tasks for them
- Task titles should be short, imperative, and specific
- Descriptions should include enough context for implementation
- Set "taskIntent" to "general" for every task in a generic roadmap import
- Phase numbers must be sequential (1, 2, 3, ...)
- Sequence numbers restart at 1 for each phase
- Return ONLY valid JSON, no explanatory text`;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseAgentResponse(
  raw: string,
  expectedAlias: string,
  requestedIntent: TaskIntent,
): RoadmapGenerationResult {
  // Extract JSON from markdown fences — agent may include extra text after the closing fence
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  let jsonObj: unknown;
  try {
    jsonObj = JSON.parse(cleaned);
  } catch (initialErr) {
    // Fallback: agent may have prepended prose before the JSON object
    const extracted = extractJsonObject(cleaned);
    if (extracted) {
      try {
        jsonObj = JSON.parse(extracted);
      } catch (err) {
        log.error({ raw: raw.slice(0, 500), err }, "Failed to parse agent response as JSON");
        throw new RoadmapGenerationError(
          "PARSE_ERROR",
          `Agent response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      log.error(
        { raw: raw.slice(0, 500), err: initialErr },
        "Failed to parse agent response as JSON",
      );
      throw new RoadmapGenerationError(
        "PARSE_ERROR",
        `Agent response is not valid JSON: ${initialErr instanceof Error ? initialErr.message : String(initialErr)}`,
      );
    }
  }

  const validated = roadmapResponseSchema.safeParse(jsonObj);
  if (!validated.success) {
    log.error(
      { issues: validated.error.issues, raw: raw.slice(0, 500) },
      "Agent response failed zod validation",
    );
    throw new RoadmapGenerationError(
      "VALIDATION_ERROR",
      `Response validation failed: ${validated.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  // Normalize alias to match input
  return {
    alias: expectedAlias,
    taskIntent: requestedIntent,
    tasks: validated.data.tasks.map((task) => ({
      ...task,
      taskIntent: requestedIntent === "general" ? "general" : (task.taskIntent ?? requestedIntent),
    })),
  };
}

function validateRoadmapTasks(
  generation: RoadmapGenerationResult,
  requestedIntent: TaskIntent,
): void {
  const auditBatchIssues =
    requestedIntent === "audit" ? validateAuditGeneratedBatch(generation.tasks) : [];
  const invalid = generation.tasks
    .map((task) => {
      const taskIntent = task.taskIntent ?? generation.taskIntent ?? "general";
      const issues = validateGeneratedTaskIntent({
        title: task.title,
        description: task.description,
        taskIntent,
      }).issues;
      if (requestedIntent !== "general" && taskIntent !== requestedIntent) {
        issues.push(`expected taskIntent ${requestedIntent} but received ${taskIntent}`);
      }
      return { task, issues };
    })
    .filter((entry) => entry.issues.length > 0);

  if (invalid.length > 0 || auditBatchIssues.length > 0) {
    const details = invalid
      .slice(0, 5)
      .map((entry) => `${entry.task.title} (${entry.issues.join("; ")})`)
      .join(", ");
    const allDetails = [details, ...auditBatchIssues].filter(Boolean).join("; ");
    if (requestedIntent === "audit") {
      throw new RoadmapGenerationError(
        "VALIDATION_ERROR",
        `${AUDIT_ROADMAP_VALIDATION_MESSAGE} ${allDetails}`,
      );
    }
    throw new RoadmapGenerationError(
      "VALIDATION_ERROR",
      `Roadmap extraction produced invalid typed tasks: ${details}`,
    );
  }
}

// -- Tag enrichment --

/**
 * Build the required tag set for a generated roadmap task.
 * Tags: roadmap, rm:<alias>, phase:<number>, phase:<name>, seq:<nn>
 */
export function buildTaskTags(alias: string, task: GeneratedTask): string[] {
  const tags: string[] = ["roadmap", `rm:${alias}`];
  tags.push(`phase:${task.phase}`);
  if (task.phaseName) {
    tags.push(`phase:${task.phaseName.toLowerCase().replace(/\s+/g, "-")}`);
  }
  tags.push(`seq:${String(task.sequence).padStart(2, "0")}`);
  return tags;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function compareRoadmapImportOrder(a: IndexedGeneratedTask, b: IndexedGeneratedTask): number {
  return a.task.phase - b.task.phase || a.task.sequence - b.task.sequence || a.index - b.index;
}

// -- Dedupe + batch creation --

export interface ImportResult {
  roadmapAlias: string;
  created: number;
  skipped: number;
  taskIds: string[];
  byPhase: Record<number, { created: number; skipped: number }>;
}

/**
 * Import generated tasks into the database, deduplicating by
 * projectId + normalizedTitle + roadmapAlias.
 */
export function importGeneratedTasks(
  projectId: string,
  generation: RoadmapGenerationResult,
): ImportResult {
  const { alias, tasks: generatedTasks } = generation;
  const importIntent: TaskIntent = generation.taskIntent ?? "general";
  const hasExplicitTypedImportIntent =
    generation.taskIntent !== undefined && generation.taskIntent !== "general";

  log.info({ projectId, alias, totalTasks: generatedTasks.length }, "Starting task import");

  // Resolve project config so every imported task gets a unique slug-based
  // planPath. Without this each task would fall back to the shared default
  // `cfg.paths.plan` and overwrite the previous task's plan on disk
  // (see lee-to/aif-handoff#55). planPath is decoupled from plannerMode here:
  // the task keeps whatever planner mode the project defaults to, we only
  // ensure the plan file path itself is unique for bulk imports.
  const project = findProjectById(projectId);
  if (!project) {
    throw new RoadmapGenerationError("PROJECT_NOT_FOUND", `Project ${projectId} not found`);
  }
  const cfg = getProjectConfig(project.rootPath);

  const validationGeneration: RoadmapGenerationResult = hasExplicitTypedImportIntent
    ? generation
    : {
        ...generation,
        taskIntent: "general",
        tasks: generatedTasks.map((task) => ({ ...task, taskIntent: "general" as const })),
      };
  validateRoadmapTasks(validationGeneration, importIntent);

  // Load existing tasks for this alias for dedupe
  const existing = findTasksByRoadmapAlias(projectId, alias);
  const existingTitles = new Set(existing.map((t) => normalizeTitle(t.title)));

  // Reserve every planPath already used by any task in this project (across
  // all aliases), so collision suffixes don't accidentally overwrite an
  // existing plan file. The shared default is excluded because it's not
  // owned by any single task and stays safe to collide against.
  const usedPlanPaths = new Set<string>(
    listTasks(projectId)
      .map((t) => t.planPath)
      .filter((p): p is string => !!p && p !== cfg.paths.plan),
  );
  const minBacklogPosition = getMinBacklogPosition(projectId);
  const importPositionStart = (minBacklogPosition ?? 1000) - generatedTasks.length * 100;

  // Compute a unique plan path per task using the shared slug helper, and
  // append `-2`, `-3`, … before `.md` if the base path collides with an
  // already-reserved one. This covers both intra-batch collisions (two titles
  // slugifying to the same string) and cross-import collisions (repeat
  // imports or different aliases hitting the same slug).
  const reserveUniquePlanPath = (title: string): string => {
    const base = generatePlanPath(title, "full", {
      plansDir: cfg.paths.plans,
      defaultPlanPath: cfg.paths.plan,
    });
    if (!usedPlanPaths.has(base)) {
      usedPlanPaths.add(base);
      return base;
    }
    const suffixMatch = base.match(/^(.*)\.md$/);
    const stem = suffixMatch ? suffixMatch[1] : base;
    let counter = 2;
    let candidate = `${stem}-${counter}.md`;
    while (usedPlanPaths.has(candidate)) {
      counter++;
      candidate = `${stem}-${counter}.md`;
    }
    usedPlanPaths.add(candidate);
    return candidate;
  };

  const result: ImportResult = {
    roadmapAlias: alias,
    created: 0,
    skipped: 0,
    taskIds: [],
    byPhase: {},
  };

  const orderedTasks = generatedTasks
    .map((task, index) => ({ task, index }))
    .sort(compareRoadmapImportOrder);

  let createdPositionIndex = 0;

  for (const { task: genTask } of orderedTasks) {
    const phaseStats = result.byPhase[genTask.phase] ?? { created: 0, skipped: 0 };
    result.byPhase[genTask.phase] = phaseStats;

    const normalized = normalizeTitle(genTask.title);
    if (existingTitles.has(normalized)) {
      log.debug({ title: genTask.title, alias, phase: genTask.phase }, "Task skipped (duplicate)");
      phaseStats.skipped++;
      result.skipped++;
      continue;
    }

    const taskIntent = hasExplicitTypedImportIntent ? importIntent : "general";
    const tags = buildTaskTags(alias, genTask);
    tags.push(`kind:${taskIntent}`);
    if (taskIntent === "audit") {
      tags.push("diagnostic-only");
    }
    // Roadmap import bypasses POST /tasks, so mode-driven defaults must be
    // applied here too. Intent defaults keep generated cards aligned with the
    // typed task contract; general roadmap imports preserve the historical
    // fast + skip-review batch behavior unless the project forces full mode.
    const planPath = reserveUniquePlanPath(genTask.title);
    const intentDefaults = resolveTaskIntentDefaults(taskIntent, {
      envUseSubagents: getEnv().AGENT_USE_SUBAGENTS,
    });
    const plannerMode =
      project.parallelEnabled && taskIntent === "general" ? "full" : intentDefaults.plannerMode;
    const defaults =
      taskIntent === "general" && project.parallelEnabled
        ? { ...intentDefaults, ...defaultsForMode("full"), skipReview: true }
        : intentDefaults;
    const created = createTask({
      projectId,
      title: genTask.title,
      description: genTask.description,
      taskIntent,
      roadmapAlias: alias,
      tags,
      planPath,
      plannerMode,
      planDocs: defaults.planDocs,
      planTests: defaults.planTests,
      skipReview: taskIntent === "audit" ? false : defaults.skipReview,
      useSubagents: taskIntent === "audit" || taskIntent === "spike" ? true : defaults.useSubagents,
      position: importPositionStart + createdPositionIndex * 100,
    });

    if (created) {
      createdPositionIndex++;
      result.taskIds.push(created.id);
      phaseStats.created++;
      result.created++;
      existingTitles.add(normalized);
    }
  }

  log.info(
    {
      projectId,
      alias,
      created: result.created,
      skipped: result.skipped,
    },
    "Task import complete with distinct plan paths",
  );

  return result;
}

export class RoadmapGenerationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RoadmapGenerationError";
  }
}
