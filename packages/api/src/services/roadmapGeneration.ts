import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, isAbsolute, relative } from "node:path";
import { z } from "zod";
import {
  TASK_INTENT_CONTRACTS,
  TASK_INTENTS,
  AUDIT_NO_TRACKED_SCOPE_SENTINEL,
  AUDIT_NO_FINDINGS_PROOF_GUARDRAIL,
  AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT,
  AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT,
  formatTaskIntentContractForPrompt,
  defaultsForMode,
  getEnv,
  getProjectConfig,
  generatePlanPath,
  isTaskIntent,
  isGitRepo,
  logger,
  extractAuditPathTokens,
  isAuditReportArtifactPath,
  isAuditSynthesisTitle,
  isLowSignalAuditEvidenceLine,
  parseAuditScopeRoots,
  parseExpectedAuditReportArtifactPath,
  projectSupportsTaskWorktrees,
  projectUsesSharedBranchIsolation,
  resolveTaskIntentDefaults,
  validateGeneratedAuditCard,
  validateGeneratedTaskIntent,
  classifyAuditDecompositionRequest,
  type AuditDecompositionClassification,
  type TaskIntent,
} from "@aif/shared";
import {
  createTask,
  findRoadmapBatchByProjectAlias,
  findProjectById,
  findTasksByRoadmapAlias,
  getMinBacklogPosition,
  listTasks,
  createRoadmapBatchContract,
  setTaskFields,
  type RoadmapBatchExecutionPolicy,
  type RoadmapBatchSummary,
  type TaskRow,
} from "@aif/data";
import { UsageSource } from "@aif/runtime";
import { resolveApiLightModel, runApiRuntimeOneShot } from "./runtime.js";
import { createRoadmapWorkflowPackResolver } from "./roadmapWorkflowPacks.js";

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

type AuditArea = {
  title: string;
  scope: string;
  mandate: string;
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
  auditDecomposition?: AuditDecompositionClassification;
}

export interface RoadmapGitCommitResult {
  committed: boolean;
  remainingDirty: string | null;
  commitSha?: string;
  skippedReason?: string;
}

type RoadmapGenerationPromptContext = {
  description: string | null;
  architecture: string | null;
  vision: string | null;
  roadmapAlias?: string | null;
  auditDecomposition?: AuditDecompositionClassification | null;
};

type RoadmapContentNormalizationContext = {
  projectRoot: string;
  description: string | null;
  architecture: string | null;
  vision: string | null;
  roadmapAlias?: string | null;
};

type RoadmapImportArtifactInput = {
  taskId: string;
  role: "report" | "synthesis";
  artifactPath: string;
  branchName?: string | null;
  worktreePath?: string | null;
  projectRoot?: string | null;
};

type RoadmapImportTaskOverrides = {
  extraTags?: string[];
  skipReview?: boolean;
  useSubagents?: boolean;
  paused?: boolean;
  blockedReason?: string | null;
};

type RoadmapWorkflowHooks = {
  assertIntentMatchesRequest?: (
    input: {
      roadmapAlias?: string | null;
      taskIntent?: string | null;
      vision?: string | null;
    },
    resolvedIntent: TaskIntent,
  ) => void;
  rejectReusedAlias?: (input: { projectId: string; roadmapAlias: string }) => string | null;
  classifyGenerationRequest?: (
    ctx: RoadmapGenerationPromptContext,
  ) => AuditDecompositionClassification | undefined;
  buildGenerationPrompt?: (ctx: RoadmapGenerationPromptContext) => string;
  normalizeGeneratedRoadmapContent?: (input: {
    content: string;
    context: RoadmapContentNormalizationContext;
    source: "file" | "output";
  }) => string;
  convertRoadmapContentToTasks?: (input: {
    roadmapContent: string;
    roadmapAlias: string;
    priorContext?: string | null;
  }) => RoadmapGenerationResult;
  buildExtractionPrompt?: (input: { roadmapContent: string; alias: string }) => string;
  extractPriorContext?: (input: {
    roadmapAlias?: string | null;
    vision?: string | null;
    description?: string | null;
    architecture?: string | null;
    roadmapContent?: string | null;
  }) => string | null;
  validateGeneratedBatch?: (input: {
    generation: RoadmapGenerationResult;
    priorContext?: string | null;
  }) => string[];
  getImportTaskOverrides?: (input: { task: GeneratedTask }) => RoadmapImportTaskOverrides;
  collectImportArtifact?: (input: {
    generatedTask: GeneratedTask;
    task: TaskRow;
    projectRoot: string;
  }) => RoadmapImportArtifactInput;
  createImportBatchSummary?: (input: {
    projectId: string;
    roadmapAlias: string;
    taskIntent: TaskIntent;
    projectRoot: string;
    createdTaskIds: string[];
    synthesisTaskId: string | null;
    artifacts: RoadmapImportArtifactInput[];
  }) => RoadmapBatchSummary;
};

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

function isAuditShapedRoadmapAlias(roadmapAlias: string | null | undefined): boolean {
  const normalized = roadmapAlias?.trim().toLowerCase();
  return normalized ? /^audit(?:[-_]v\d+|\.\d+|[-_]\d{8})?$/.test(normalized) : false;
}

function isAuditOnlyRoadmapVision(vision: string | null | undefined): boolean {
  const normalized = vision?.trim().toLowerCase();
  if (!normalized) return false;
  return [
    "only audit",
    "audit only",
    "diagnostic audit",
    "do not fix code",
    "\u0442\u043e\u043b\u044c\u043a\u043e \u0430\u0443\u0434\u0438\u0442",
    "\u043d\u0435 \u0438\u0441\u043f\u0440\u0430\u0432\u043b\u044f\u0442\u044c \u043a\u043e\u0434",
  ].some((signal) => normalized.includes(signal));
}

function cleanPriorAuditContextFragment(value: string): string {
  let cleaned = value
    .replace(/^\s*(?:[-*]\s+|\[[ xX]\]\s+|#+\s*|>\s*)+/g, "")
    .replace(
      /\b(?:prior audit context|roadmap context|project description|architecture|roadmap alias|vision)\s*:\s*/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  for (let previous = ""; previous !== cleaned; ) {
    previous = cleaned;
    cleaned = cleaned
      .replace(
        /^\s*(?:prior audit context|roadmap context|project description|architecture|roadmap alias|vision)\s*:\s*/i,
        "",
      )
      .replace(/\s+/g, " ")
      .trim();
  }
  return cleaned;
}

function mentionsPriorInconclusiveAudit(value: string): boolean {
  const normalized = value.toLowerCase();
  if (
    normalized.includes("synthesis outcome requirement") ||
    normalized.includes("classify the final audit") ||
    normalized.includes("validated no-findings") ||
    normalized.includes("validated findings present") ||
    normalized.includes("source reports are weak") ||
    normalized.includes("weak, missing, or inventory-only")
  ) {
    return false;
  }
  return /\baudit[\w.-]*\b/.test(normalized) && /\binconclusive\b/.test(normalized);
}

function extractPriorInconclusiveAuditContext(input: {
  roadmapAlias?: string | null;
  vision?: string | null;
  description?: string | null;
  architecture?: string | null;
  roadmapContent?: string | null;
}): string | null {
  const fragments: string[] = [];
  const pushFragments = (label: string, value: string | null | undefined) => {
    if (!value) return;
    const parts = value.split(/\r?\n|[.!?]\s+/).map(cleanPriorAuditContextFragment);
    for (const part of parts) {
      if (!part || !mentionsPriorInconclusiveAudit(part)) continue;
      const fragment = `${label}: ${part}`;
      if (!fragments.includes(fragment)) fragments.push(fragment);
      if (fragments.length >= 3) return;
    }
  };

  pushFragments("roadmap alias", input.roadmapAlias);
  pushFragments("vision", input.vision);
  pushFragments("roadmap context", input.roadmapContent);
  pushFragments("project description", input.description);
  pushFragments("architecture", input.architecture);

  return fragments.length > 0 ? fragments.join(" ").slice(0, 500) : null;
}

function formatPriorAuditContextLine(priorContext: string): string {
  return `Prior audit context: ${priorContext}`;
}

function normalizeRoadmapPriorAuditContextLines(
  roadmapContent: string,
  priorContext: string | null,
): string {
  const expected = priorContext ? normalizeAuditContextText(priorContext) : null;
  return roadmapContent
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^(\s*[-*]\s+)prior audit context\s*:\s*(.+?)\s*$/i);
      if (!match) return true;
      if (!expected) return false;
      const cleaned = cleanPriorAuditContextFragment(match[2] ?? "");
      if (normalizeAuditContextText(cleaned) !== expected) return false;
      return true;
    })
    .join("\n");
}

function normalizeAuditContextText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasMatchingPriorAuditContext(text: string, priorContext: string | null): boolean {
  if (!priorContext) return true;
  const normalizedText = normalizeAuditContextText(text);
  const normalizedLine = normalizeAuditContextText(formatPriorAuditContextLine(priorContext));
  return normalizedText.includes(normalizedLine);
}

export function assertRoadmapIntentMatchesRequest(input: {
  roadmapAlias?: string | null;
  taskIntent?: string | null;
  vision?: string | null;
}): TaskIntent {
  const intent = resolveExplicitRoadmapIntent(input.taskIntent);
  for (const pack of roadmapWorkflowPacks.list()) {
    pack.hooks?.assertIntentMatchesRequest?.(input, intent);
  }
  return intent;
}

export function rejectReusedRoadmapAlias(input: {
  projectId: string;
  roadmapAlias: string;
  taskIntent?: string | null;
}): string | null {
  const intent = resolveExplicitRoadmapIntent(input.taskIntent);
  return (
    roadmapWorkflowPacks.get(intent).hooks?.rejectReusedAlias?.({
      projectId: input.projectId,
      roadmapAlias: input.roadmapAlias,
    }) ?? null
  );
}

const AUDIT_ROADMAP_VALIDATION_MESSAGE =
  "Audit roadmap generation produced implementation-shaped milestones; no tasks imported.";
const AUDIT_CHILD_REPORT_STATUS_REQUIREMENT =
  "Child report status: final synthesis must include a table listing every source report artifact with status passed, failed, or inconclusive and must not claim a stronger outcome than child reports support.";

function toProjectRelativeGitPath(projectRoot: string, absolutePath: string): string | null {
  const rel = relative(projectRoot, absolutePath).replaceAll("\\", "/");
  if (!rel || rel.startsWith("../") || rel === ".." || isAbsolute(rel)) return null;
  return rel;
}

function formatDirtyPreview(statusOutput: string): string | null {
  const lines = statusOutput
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const preview = lines.slice(0, 5).join(", ");
  return lines.length > 5 ? `${preview}, +${lines.length - 5} more` : preview;
}

function runRoadmapGit(
  projectRoot: string,
  args: string[],
  opts: { ignoreExit?: boolean; commitIdentity?: boolean } = {},
): { stdout: string; stderr: string; status: number } {
  const configArgs = ["-c", `safe.directory=${projectRoot}`];
  if (opts.commitIdentity) {
    configArgs.push("-c", "user.name=AIF Handoff", "-c", "user.email=aif-handoff@local");
  }

  try {
    const stdout = execFileSync("git", [...configArgs, ...args], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout: stdout.trim(), stderr: "", status: 0 };
  } catch (err) {
    const error = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    const stdout = error.stdout ? error.stdout.toString().trim() : "";
    const stderr = error.stderr ? error.stderr.toString().trim() : String(err);
    const status = typeof error.status === "number" ? error.status : 1;
    if (opts.ignoreExit) return { stdout, stderr, status };
    throw new RoadmapGenerationError(
      "GIT_COMMIT_FAILED",
      `git ${args.join(" ")} failed: ${stderr || stdout || "unknown error"}`,
    );
  }
}

export function commitGeneratedRoadmapIfNeeded(input: {
  projectRoot: string;
  roadmapPath: string;
  roadmapAlias?: string;
}): RoadmapGitCommitResult {
  const roadmapRelPath = toProjectRelativeGitPath(input.projectRoot, input.roadmapPath);
  if (!roadmapRelPath) {
    return {
      committed: false,
      remainingDirty: null,
      skippedReason: "roadmap_path_outside_project",
    };
  }

  const repo = runRoadmapGit(input.projectRoot, ["rev-parse", "--is-inside-work-tree"], {
    ignoreExit: true,
  });
  if (repo.status !== 0 || repo.stdout.trim() !== "true") {
    return { committed: false, remainingDirty: null, skippedReason: "not_git_worktree" };
  }

  const roadmapStatus = runRoadmapGit(
    input.projectRoot,
    ["status", "--porcelain", "--", roadmapRelPath],
    { ignoreExit: true },
  );
  if (roadmapStatus.status !== 0) {
    return {
      committed: false,
      remainingDirty: null,
      skippedReason: "roadmap_status_failed",
    };
  }

  if (roadmapStatus.stdout.length > 0) {
    runRoadmapGit(input.projectRoot, ["add", "--", roadmapRelPath]);
    const staged = runRoadmapGit(
      input.projectRoot,
      ["diff", "--cached", "--quiet", "--", roadmapRelPath],
      { ignoreExit: true },
    );
    if (staged.status !== 0) {
      const suffix = input.roadmapAlias ? ` (${input.roadmapAlias})` : "";
      runRoadmapGit(
        input.projectRoot,
        ["commit", "-m", `docs: update generated roadmap${suffix}`, "--", roadmapRelPath],
        { commitIdentity: true },
      );
    }
  }

  const status = runRoadmapGit(input.projectRoot, ["status", "--porcelain"], {
    ignoreExit: true,
  });
  const commit = runRoadmapGit(input.projectRoot, ["rev-parse", "--short", "HEAD"], {
    ignoreExit: true,
  });
  const result = {
    committed: roadmapStatus.stdout.length > 0,
    remainingDirty: status.status === 0 ? formatDirtyPreview(status.stdout) : null,
    commitSha: commit.status === 0 && commit.stdout ? commit.stdout : undefined,
  };
  log.info({ ...result, roadmapRelPath }, "Generated roadmap git state resolved");
  return result;
}

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
  const guardrailLine =
    /^\s*(?:[-*]\s*)?(?:proposed\s+fix|evidence requirements|evidence id rule|path rule|rejected finding shapes|inconclusive rule)\s*:/i;
  const candidateText = text
    .split(/\r?\n/)
    .filter((line) => !guardrailLine.test(line.trim()))
    .join("\n");

  return splitAuditTextLines(candidateText).some((line) => {
    if (/\b(?:do not|must not|forbid|forbidden|no source|no config|no test)\b/i.test(line)) {
      return false;
    }
    if (
      /\b(?:proposed\s+fix|evidence requirements|evidence id rule|path rule|rejected finding shapes|inconclusive rule)\s*:/i.test(
        line,
      )
    ) {
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

function hasNonReportAllowedChangeTarget(value: string): boolean {
  const explicitPaths = extractAuditPathTokens(value);
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
    const path = extractAuditPathTokens(value)[0];
    if (!path || !isAuditReportArtifactPath(path)) {
      issues.push(`${label} is missing a report artifact path`);
    }
  }
}

function applyPriorAuditContextToRoadmapContent(
  roadmapContent: string,
  priorContext: string | null,
): string {
  if (!priorContext) return roadmapContent;

  const lines = roadmapContent.split(/\r?\n/);
  const output: string[] = [];
  let current: string[] | null = null;

  const flush = () => {
    if (!current) return;
    const text = current.join("\n");
    if (!hasMatchingPriorAuditContext(text, priorContext)) {
      const detailIndex = current.findIndex((line, index) => index > 0 && /^\s*[-*]\s+/.test(line));
      const auditMandateIndex = current.findIndex((line) =>
        /^\s*[-*]\s+audit mandate\s*:/i.test(line.trim()),
      );
      const insertAfter =
        auditMandateIndex >= 0 ? auditMandateIndex : detailIndex >= 0 ? detailIndex : 0;
      const detailPrefix =
        detailIndex >= 0 ? current[detailIndex].match(/^\s*[-*]\s+/)?.[0] : "  - ";
      current.splice(
        insertAfter + 1,
        0,
        `${detailPrefix}${formatPriorAuditContextLine(priorContext)}`,
      );
    }
    output.push(...current);
    current = null;
  };

  for (const line of lines) {
    if (/^\s*[-*]\s+\[\s\]\s+/.test(line)) {
      flush();
      current = [line];
      continue;
    }
    if (/^\s*[-*]\s+\[[xX]\]\s+/.test(line)) {
      flush();
      output.push(line);
      continue;
    }
    if (current) {
      current.push(line);
    } else {
      output.push(line);
    }
  }
  flush();

  return output.join("\n");
}

function validateAuditRoadmapReadableScopeRoots(
  roadmapContent: string,
  projectRoot: string | null | undefined,
  issues: string[],
): void {
  if (!projectRoot) return;
  for (const item of extractAuditRoadmapItems(roadmapContent)) {
    if (isAuditSynthesisTitle(item.title)) continue;
    const label = `item "${item.title}"`;
    const roots = parseAuditScopeRoots(auditDescriptionFromItem(item));
    for (const root of roots) {
      if (root === AUDIT_NO_TRACKED_SCOPE_SENTINEL) continue;
      if (existingConcreteAuditScopeFiles(projectRoot, [root], 1).length === 0) {
        issues.push(`${label} Scope root ${root} has no readable project evidence`);
      }
    }
  }
}

function validateAuditRoadmapSource(roadmapContent: string, projectRoot?: string | null): void {
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
      "audit mandate:",
      "quality bar:",
      "no-findings rule:",
      "evidence:",
      "risk:",
      "proposed fix:",
      "verification:",
      "git status --short",
      "git commit",
      "git log -1 --name-only --oneline",
    ];
    const missing = requiredMarkers.filter((marker) => !lower.includes(marker));
    if (missing.length > 0) {
      issues.push(`${label} is missing ${missing.join(", ")}`);
    }
    const cardValidation = validateGeneratedAuditCard({
      title: item.title,
      description: auditDescriptionFromItem(item),
    });
    for (const issue of cardValidation.issues) {
      const detail = `${label} ${issue}`;
      if (!issues.includes(detail)) issues.push(detail);
    }
    validateAuditReportArtifactText(item.text, issues, label);
    if (hasImplementationShapedAuditContent(`${item.title}\n${item.text}`)) {
      issues.push(`${label} describes implementation work`);
    }
    validateAuditAllowedChangesText(item.text, issues, label);
  }
  validateAuditRoadmapReadableScopeRoots(roadmapContent, projectRoot, issues);

  if (issues.length > 0) {
    throw new RoadmapGenerationError(
      "VALIDATION_ERROR",
      `${AUDIT_ROADMAP_VALIDATION_MESSAGE} ${issues.slice(0, 5).join("; ")}`,
    );
  }
}

function validateAuditGeneratedBatch(
  tasks: GeneratedTask[],
  priorContext: string | null = null,
): string[] {
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
    if (!hasMatchingPriorAuditContext(`${task.title}\n${task.description ?? ""}`, priorContext)) {
      issues.push(`task "${task.title}" is missing ${formatPriorAuditContextLine(priorContext!)}`);
    }
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

function formatAuditRiskHypotheses(title: string, scope: string): string {
  const riskPrefix = auditSlug(title).replace(/^audit-/, "risk-");
  const areaSlug = auditSlug(title).replace(/^audit-/, "");
  const riskTemplate = auditRiskTemplateForArea(areaSlug);
  return scope
    .split(/\s*,\s*/)
    .map((scopeRoot, index) => {
      const riskId = `${riskPrefix}-${index + 1}`;
      return `${riskId} ${scopeRoot} ${riskTemplate}`;
    })
    .join("; ");
}

function auditRiskTemplateForArea(areaSlug: string): string {
  if (areaSlug.includes("security") || areaSlug.includes("configuration")) {
    return "may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths";
  }
  if (areaSlug.includes("performance") || areaSlug.includes("runtime")) {
    return "may perform repeated blocking work, omit timeout handling, leak resources, or grow runtime state without bounds";
  }
  if (areaSlug.includes("persistence") || areaSlug.includes("data")) {
    return "may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates";
  }
  if (areaSlug.includes("integration") || areaSlug.includes("orchestration")) {
    return "may mishandle retries, idempotency, external contract errors, or cross-service state handoff";
  }
  if (areaSlug.includes("test") || areaSlug.includes("operations")) {
    return "may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable";
  }
  if (areaSlug.includes("architecture") || areaSlug.includes("ownership")) {
    return "may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe";
  }
  return "may hide actionable technical-quality risks tied to the requested audit area";
}

function buildAuditRoadmapItem(
  title: string,
  scope: string,
  reportPath: string,
  mandate: string,
  options: { role?: "report" | "synthesis"; priorContext?: string | null } = {},
): string {
  const role = options.role ?? "report";
  return [
    `- [ ] **${title}** - Diagnostic-only audit.`,
    `  - Scope: ${scope}`,
    `  - Audit mandate: ${mandate}`,
    ...(role === "report"
      ? [`  - Risk hypotheses: ${formatAuditRiskHypotheses(title, scope)}`]
      : []),
    ...(options.priorContext ? [`  - ${formatPriorAuditContextLine(options.priorContext)}`] : []),
    `  - Allowed changes: only create/update ${reportPath}.`,
    `  - Report artifact: ${reportPath}`,
    "  - Acceptance criteria: inspect the scoped files, record only actionable technical-quality findings, and classify each accepted finding as blocking or advisory.",
    "  - Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
    "  - Manifest requirements: include a fenced `audit-report-manifest` JSON block with version 1, auditPlanId `task:<task-id>` or `batch:<batch-id>:task:<task-id>`, taskId, batchId when assigned, roadmapAlias when assigned, artifactPath, contentSha256 for the markdown body without the manifest block, sourceSnapshot commit/tree/id, outcome, scopeCoverage, riskHypotheses, findings or noFindingsClaims, and evidenceRefs.",
    "  - Evidence ID rule: manifest evidenceRefs, scopeCoverage[].evidenceRefs, findings[].evidenceRefs, and noFindingsClaims[].evidenceRefs must cite actual runtime audit ledger IDs (`ev_*`) only; finding labels such as AOB-001 or invented IDs are never evidenceRefs.",
    "  - Path rule: every repository reference must use an existing scoped path plus line/range; do not use basename-only references such as `config.py`, future files such as `cli_context.py`, or generated `.ai-factory/*` files as source evidence.",
    '  - Quality bar: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims are not findings.',
    "  - Rejected finding shapes: line counts, import counts, central-hub/monolithic-file claims, duplicated initialization/DRY/refactor-helper claims, import-chain/tight-coupling claims without a real cycle or runtime failure, private-method/direct-store/abstraction-bypass smells, missing facade, missing `__all__`, optional-dependency grouping, README/AGENTS ownership notes, and generated planning artifacts are not trusted findings unless tied to a concrete broken runtime behavior proven by scoped source evidence.",
    "  - Inconclusive rule: a partially inspected or `source_inconclusive` observation is not a finding. Either inspect enough scoped source to validate it, omit it, or set the whole report outcome to `source_inconclusive` with the exact coverage gap.",
    '  - No-findings rule: if no actionable finding is found, write "No validated findings" plus checked files and commands with observed outputs.',
    "  - No-findings shape: do not write `### Finding` or `### Risk` subsections for no-findings claims; use a concise checklist/table and manifest `noFindingsClaims` tied to scoped evidenceRefs.",
    `  - ${AUDIT_NO_FINDINGS_PROOF_GUARDRAIL}`,
    `  - ${AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT}`,
    ...(role === "synthesis"
      ? [
          `  - ${AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT}`,
          `  - ${AUDIT_CHILD_REPORT_STATUS_REQUIREMENT}`,
        ]
      : []),
    "  - Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.",
    "  - Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
  ].join("\n");
}

function existingConcreteAuditScopeFiles(
  projectRoot: string,
  candidates: string[],
  max = 6,
): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  const add = (path: string): void => {
    const normalized = normalizeAuditScopePath(path);
    if (paths.length >= max || seen.has(normalized)) return;
    if (!isConcreteAuditScopeFile(projectRoot, normalized)) return;
    seen.add(normalized);
    paths.push(normalized);
  };
  const addFromDirectory = (directory: string): void => {
    const dirPath = join(projectRoot, directory);
    try {
      for (const entry of readdirSync(dirPath, { withFileTypes: true }).sort((left, right) =>
        left.name.localeCompare(right.name),
      )) {
        if (paths.length >= max) return;
        const child = normalizeAuditScopePath(`${directory}/${entry.name}`);
        if (entry.isDirectory()) {
          const segment = entry.name;
          if (!AUDIT_SCOPE_IGNORED_ROOT_ENTRIES.has(segment) && !segment.startsWith(".")) {
            addFromDirectory(child);
          }
        } else if (entry.isFile()) {
          add(child);
        }
      }
    } catch {
      // Candidate disappeared or is unreadable; skip it.
    }
  };

  for (const candidate of candidates) {
    const normalized = normalizeAuditScopePath(candidate);
    if (!normalized || normalized.startsWith("../") || normalized.includes("*")) continue;
    try {
      const stat = statSync(join(projectRoot, normalized));
      if (stat.isFile()) add(normalized);
      if (stat.isDirectory()) addFromDirectory(normalized);
    } catch {
      continue;
    }
    if (paths.length >= max) break;
  }
  return paths;
}

function listScopedChildren(projectRoot: string, root: string, max = 8): string[] {
  const rootPath = join(projectRoot, root);
  if (!existsSync(rootPath)) return [];
  try {
    return readdirSync(rootPath)
      .filter((name) => ![".git", ".venv", "node_modules", "__pycache__"].includes(name))
      .map((name) => `${root}/${name}`.replaceAll("\\", "/"))
      .filter((path) => {
        try {
          return statSync(join(projectRoot, path)).isDirectory() || /\.[a-z0-9]+$/i.test(path);
        } catch {
          return false;
        }
      })
      .slice(0, max);
  } catch {
    return [];
  }
}

const AUDIT_SCOPE_IGNORED_ROOT_ENTRIES = new Set([
  ".git",
  ".agents",
  ".ai-factory",
  ".claude",
  ".codex",
  ".github",
  ".venv",
  "node_modules",
  "__pycache__",
  ".pytest_cache",
  "dist",
  "build",
  "coverage",
  "audit",
  "data",
  "report",
  "reports",
  "aif-plan",
]);

const AUDIT_SCOPE_IGNORED_FILE_EXTENSIONS = new Set([
  ".bmp",
  ".class",
  ".dll",
  ".exe",
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".pdf",
  ".png",
  ".pyc",
  ".so",
  ".wasm",
  ".webp",
  ".zip",
]);

function normalizeAuditScopePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function isConcreteAuditScopeFile(projectRoot: string, path: string): boolean {
  const normalized = normalizeAuditScopePath(path);
  if (!normalized || normalized.startsWith("../") || normalized.includes("*")) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => AUDIT_SCOPE_IGNORED_ROOT_ENTRIES.has(segment))) return false;
  if (segments.some((segment) => segment.startsWith(".") && segment !== ".env.example")) {
    return false;
  }
  const lower = normalized.toLowerCase();
  if ([...AUDIT_SCOPE_IGNORED_FILE_EXTENSIONS].some((extension) => lower.endsWith(extension))) {
    return false;
  }
  try {
    const stat = statSync(join(projectRoot, normalized));
    if (!stat.isFile() || stat.size === 0) return false;
    const content = readFileSync(join(projectRoot, normalized), "utf8");
    return content.split(/\r?\n/).some((line, index) => {
      if (!line.trim()) return false;
      return !isLowSignalAuditEvidenceLine({
        path: normalized,
        line: index + 1,
        text: line,
      });
    });
  } catch {
    return false;
  }
}

function listTrackedReadableAuditScopeFiles(projectRoot: string): string[] {
  const result = runRoadmapGit(projectRoot, ["ls-files", "-z"], { ignoreExit: true });
  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout
    .split("\0")
    .map(normalizeAuditScopePath)
    .filter((path) => isConcreteAuditScopeFile(projectRoot, path))
    .sort((left, right) => left.localeCompare(right));
}

function hasUsableGitIndex(projectRoot: string): boolean {
  const result = runRoadmapGit(projectRoot, ["rev-parse", "--is-inside-work-tree"], {
    ignoreExit: true,
  });
  return result.status === 0 && result.stdout.trim() === "true";
}

function selectAuditScopeFilesFromTracked(
  projectRoot: string,
  candidates: string[],
  fallback: string[],
  max = 6,
): string[] {
  const trackedFiles = listTrackedReadableAuditScopeFiles(projectRoot);
  if (trackedFiles.length === 0) return [];
  const selected: string[] = [];
  const add = (path: string) => {
    if (selected.length >= max || selected.includes(path)) return;
    selected.push(path);
  };
  const addMatches = (candidate: string) => {
    const normalized = normalizeAuditScopePath(candidate);
    if (!normalized) return;
    if (trackedFiles.includes(normalized)) {
      add(normalized);
      return;
    }
    for (const path of trackedFiles) {
      if (path.startsWith(`${normalized}/`)) add(path);
      if (selected.length >= max) return;
    }
  };

  for (const candidate of candidates) addMatches(candidate);
  for (const candidate of fallback) addMatches(candidate);
  for (const path of trackedFiles) add(path);

  return selected.slice(0, max);
}

function listConcreteRootScopeFallbackPaths(projectRoot: string, max = 4): string[] {
  try {
    const rootEntries = readdirSync(projectRoot, { withFileTypes: true })
      .filter((entry) => !AUDIT_SCOPE_IGNORED_ROOT_ENTRIES.has(entry.name))
      .filter((entry) => !entry.name.startsWith("."))
      .filter((entry) => entry.isFile() && /\.[a-z0-9]+$/i.test(entry.name))
      .map((entry) => entry.name.replaceAll("\\", "/"))
      .filter((path) => isConcreteAuditScopeFile(projectRoot, path))
      .slice(0, max);
    if (rootEntries.length > 0) return rootEntries;
  } catch {
    // Fall back to managed project context below.
  }

  return existingConcreteAuditScopeFiles(projectRoot, ["README.md", "package.json"], max);
}

function scopeText(projectRoot: string, candidates: string[], fallback: string[]): string {
  const trackedFiles = selectAuditScopeFilesFromTracked(projectRoot, candidates, fallback, 6);
  if (trackedFiles.length > 0) return trackedFiles.join(", ");
  if (hasUsableGitIndex(projectRoot)) return AUDIT_NO_TRACKED_SCOPE_SENTINEL;
  const paths = existingConcreteAuditScopeFiles(projectRoot, candidates, 6);
  if (paths.length > 0) return paths.join(", ");
  const fallbackPaths = existingConcreteAuditScopeFiles(projectRoot, fallback, 4);
  if (fallbackPaths.length > 0) return fallbackPaths.join(", ");
  const concreteRootFallbackPaths = listConcreteRootScopeFallbackPaths(projectRoot, 4);
  return concreteRootFallbackPaths.length > 0 ? concreteRootFallbackPaths.join(", ") : "README.md";
}

function isCodeOnlyAuditRequest(input: {
  vision?: string | null;
  description?: string | null;
  architecture?: string | null;
}): boolean {
  const text = [input.vision, input.description, input.architecture].filter(Boolean).join("\n");
  return (
    /\b(?:code\s+only|source\s+only|source\s+code\s+only|repo\s+code\s+only)\b/i.test(text) ||
    /(?:только|лишь)\s+(?:код|исходн(?:ый|ики|ого)?\s+код)/i.test(text)
  );
}

function auditRoadmapHasCodeOnlyScopeViolation(roadmapContent: string): boolean {
  for (const item of extractAuditRoadmapItems(roadmapContent)) {
    if (isAuditSynthesisTitle(item.title)) continue;
    const scopeMatch = item.text.match(/^\s*[-*]\s+scope\s*:\s*(.+)$/im);
    if (!scopeMatch) continue;
    const scope = scopeMatch[1] ?? "";
    const paths = extractAuditPathTokens(scope);
    if (paths.some((path) => filterCodeOnlyAuditScopeCandidates([path]).length === 0)) {
      return true;
    }
  }
  return false;
}

function filterCodeOnlyAuditScopeCandidates(candidates: string[]): string[] {
  return candidates.filter(
    (path) =>
      !/^(?:readme(?:\.md)?|agents\.md|docs(?:\/|$)|\.ai-factory(?:\/|$)|\.agents(?:\/|$)|\.codex(?:\/|$)|\.github(?:\/|$)|audit(?:\/|$)|pyproject\.toml|package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|turbo\.json|docker-compose(?:\.[\w-]+)?\.ya?ml|scripts(?:\/|$)|\.env)/i.test(
        path,
      ),
  );
}

function buildAuditAreasForProject(
  projectRoot: string,
  options: { codeOnly?: boolean } = {},
): AuditArea[] {
  const srcChildren = listScopedChildren(projectRoot, "src", 6);
  const packageChildren = listScopedChildren(projectRoot, "packages", 6);
  const testChildren = [
    ...listScopedChildren(projectRoot, "tests", 6),
    ...listScopedChildren(projectRoot, "test", 4),
  ];
  const docsOpsChildren = [
    ...listScopedChildren(projectRoot, "docs/ops", 5),
    ...listScopedChildren(projectRoot, "docs", 5),
  ];
  const fallback = options.codeOnly
    ? ["src", "packages", "apps", "lib", "server", "tests", "test"]
    : [
        "README.md",
        "AGENTS.md",
        "pyproject.toml",
        "package.json",
        "packages",
        "apps",
        "lib",
        "server",
        "src",
        "tests",
        ".ai-factory/config.yaml",
      ];
  const architectureScopeCandidates = options.codeOnly
    ? [
        "src/bot_intevra/bot.py",
        "src/bot_intevra/service.py",
        "src/bot_intevra/attachments.py",
        "src/bot_intevra/backup_crypto.py",
        "src",
        ...srcChildren.slice(0, 4),
        ...packageChildren.slice(0, 2),
      ]
    : [
        "README.md",
        "AGENTS.md",
        "pyproject.toml",
        "package.json",
        "turbo.json",
        ".ai-factory/config.yaml",
        "src",
        ...srcChildren.slice(0, 2),
        ...packageChildren.slice(0, 2),
      ];
  const scopeFor = (candidates: string[]): string => {
    const raw = scopeText(
      projectRoot,
      options.codeOnly ? filterCodeOnlyAuditScopeCandidates(candidates) : candidates,
      fallback,
    );
    if (!options.codeOnly) return raw;
    const filtered = filterCodeOnlyAuditScopeCandidates(
      raw
        .split(/\s*,\s*/)
        .map((path) => path.trim())
        .filter(Boolean),
    );
    return filtered.length > 0 ? filtered.join(", ") : raw;
  };

  return [
    {
      title: "Audit: architecture and ownership boundaries",
      scope: scopeFor(architectureScopeCandidates),
      mandate:
        "Act as the architecture owner; verify concrete runtime module-boundary failures such as circular imports, import-time side effects, duplicated state transitions, bypassed shared services, and error propagation gaps. Do not treat line count, central hub shape, missing facade, missing __all__, or ownership documentation as findings by themselves.",
    },
    {
      title: "Audit: security and configuration controls",
      scope: scopeFor([
        ".env.example",
        ".ai-factory/config.yaml",
        "src/bot_intevra/config.py",
        "src/bot_intevra/secret_scan.py",
        "src",
        "docs/ops",
        ...docsOpsChildren.slice(0, 2),
      ]),
      mandate:
        "Act as the security owner; verify secrets handling, configuration defaults, unsafe local endpoints, shell/file boundaries, and deployment-time security assumptions.",
    },
    {
      title: "Audit: performance and runtime behavior",
      scope: scopeFor([
        "src",
        "src/bot_intevra/service.py",
        "src/bot_intevra/bot.py",
        "src/bot_intevra/llm_client.py",
        "src/bot_intevra/status_server.py",
        "pyproject.toml",
        ...srcChildren.slice(0, 3),
      ]),
      mandate:
        "Act as the runtime owner; verify slow paths, timeout behavior, repeated work, resource growth, and failure modes under realistic production usage.",
    },
    {
      title: "Audit: persistence and data safety",
      scope: scopeFor([
        "src/bot_intevra/db.py",
        "src/bot_intevra/models.py",
        "data",
        "migrations",
        "src",
        "pyproject.toml",
        ...srcChildren.slice(0, 3),
      ]),
      mandate:
        "Act as the data owner; verify migrations, transactions, backup/restore, concurrent writes, data loss risks, and irreversible operations.",
    },
    {
      title: "Audit: integration and orchestration boundaries",
      scope: scopeFor([
        "src",
        "src/bot_intevra/cli.py",
        "src/bot_intevra/bot.py",
        "src/bot_intevra/service.py",
        "src/bot_intevra/memory_client.py",
        "src/bot_intevra/transcription_client.py",
        ...srcChildren.slice(0, 3),
      ]),
      mandate:
        "Act as the integration owner; verify external-service contracts, retries, idempotency, error propagation, and boundary assumptions between subsystems.",
    },
    {
      title: "Audit: test and operations readiness",
      scope: scopeFor([
        "tests",
        "test",
        "pyproject.toml",
        "package.json",
        "docker-compose.yml",
        "docker-compose.production.yml",
        "docs/ops",
        "scripts",
        ...packageChildren.slice(0, 2),
        ...testChildren.slice(0, 3),
        ...docsOpsChildren.slice(0, 2),
      ]),
      mandate:
        "Act as the QA and operations owner; verify tests prove critical behavior, release commands are executable, runbooks are actionable, and smoke checks cover production risks.",
    },
  ];
}

function buildDeterministicAuditRoadmapContent(ctx: {
  projectRoot: string;
  description: string | null;
  architecture: string | null;
  vision: string | null;
  roadmapAlias?: string | null;
}): string {
  const reportDate = new Date().toISOString().slice(0, 10);
  const goal =
    ctx.vision?.trim().replace(/\s+/g, " ").slice(0, 180) ||
    "Audit the project for security, performance, correctness, and operational readiness";
  const codeOnly = isCodeOnlyAuditRequest(ctx);
  const areas = buildAuditAreasForProject(ctx.projectRoot, { codeOnly });
  const priorContext = extractPriorInconclusiveAuditContext(ctx);

  const tasks = areas.map((area) =>
    buildAuditRoadmapItem(
      area.title,
      area.scope,
      `audit/${reportDate}-${auditSlug(area.title)}-audit.md`,
      area.mandate,
      { priorContext },
    ),
  );
  tasks.push(
    buildAuditRoadmapItem(
      "Synthesize audit findings",
      `all audit/${reportDate}-*-audit.md reports from this audit batch`,
      `audit/${reportDate}-summary.md`,
      "Act as the synthesis owner reviewing area reports; include only actionable findings that meet the evidence contract and call out weak reports by source.",
      { role: "synthesis", priorContext },
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
    projectRoot: string;
    description: string | null;
    architecture: string | null;
    vision: string | null;
    roadmapAlias?: string | null;
  },
  source: "file" | "output",
): string {
  const priorContext = extractPriorInconclusiveAuditContext(ctx);
  const sanitizedContent = normalizeRoadmapPriorAuditContextLines(content, priorContext);
  const contentWithContext = applyPriorAuditContextToRoadmapContent(sanitizedContent, priorContext);
  try {
    if (isCodeOnlyAuditRequest(ctx) && auditRoadmapHasCodeOnlyScopeViolation(contentWithContext)) {
      throw new RoadmapGenerationError(
        "VALIDATION_ERROR",
        "code-only audit roadmap included documentation, governance, generated, or prior audit paths in source scopes",
      );
    }
    validateAuditRoadmapSource(contentWithContext, ctx.projectRoot);
    return contentWithContext;
  } catch (err) {
    log.warn(
      {
        err,
        source,
      },
      "Generated audit roadmap failed validation; using deterministic diagnostic fallback",
    );
    const fallback = buildDeterministicAuditRoadmapContent(ctx);
    validateAuditRoadmapSource(fallback, ctx.projectRoot);
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

function collectAuditImportArtifact(input: {
  generatedTask: GeneratedTask;
  task: TaskRow;
  projectRoot: string;
}): RoadmapImportArtifactInput {
  const artifactPath = parseExpectedAuditReportArtifactPath(input.generatedTask.description ?? "");
  if (!artifactPath) {
    throw new RoadmapGenerationError(
      "VALIDATION_ERROR",
      `Audit task "${input.generatedTask.title}" is missing a concrete report artifact path`,
    );
  }
  return {
    taskId: input.task.id,
    role: isAuditSynthesisTitle(input.generatedTask.title) ? "synthesis" : "report",
    artifactPath,
    branchName: input.task.branchName,
    worktreePath: input.task.worktreePath,
    projectRoot: input.projectRoot,
  };
}

const auditRoadmapHooks: RoadmapWorkflowHooks = Object.freeze({
  assertIntentMatchesRequest(input, resolvedIntent) {
    if (
      resolvedIntent !== "audit" &&
      (isAuditShapedRoadmapAlias(input.roadmapAlias) || isAuditOnlyRoadmapVision(input.vision))
    ) {
      throw new RoadmapGenerationError(
        "ROADMAP_INTENT_MISMATCH",
        'Audit-shaped roadmap requests must set taskIntent: "audit".',
      );
    }
  },
  rejectReusedAlias(input) {
    const existingCount = findTasksByRoadmapAlias(input.projectId, input.roadmapAlias).length;
    const existingBatch = findRoadmapBatchByProjectAlias(input.projectId, input.roadmapAlias);
    if (existingCount === 0 && !existingBatch) return null;
    if (existingCount === 0 && existingBatch) {
      return `Audit roadmap alias "${input.roadmapAlias}" already has roadmap batch metadata (${existingBatch.id}). Delete the existing audit batch tasks before reusing the alias, or use a new roadmap alias for a fresh audit run.`;
    }
    return `Audit roadmap alias "${input.roadmapAlias}" already has ${existingCount} task(s). Use a new roadmap alias for a fresh audit run.`;
  },
  classifyGenerationRequest(ctx) {
    return classifyAuditDecompositionRequest({
      title: ctx.roadmapAlias ?? "Audit roadmap",
      description: [ctx.vision ?? null, ctx.description, ctx.architecture]
        .filter(Boolean)
        .join("\n"),
    });
  },
  buildGenerationPrompt: buildAuditRoadmapGenerationPrompt,
  normalizeGeneratedRoadmapContent(input) {
    return ensureGeneratedAuditRoadmapContent(input.content, input.context, input.source);
  },
  convertRoadmapContentToTasks(input) {
    const sanitizedRoadmapContent = normalizeRoadmapPriorAuditContextLines(
      input.roadmapContent,
      input.priorContext ?? null,
    );
    const auditRoadmapContent = applyPriorAuditContextToRoadmapContent(
      sanitizedRoadmapContent,
      input.priorContext ?? null,
    );
    validateAuditRoadmapSource(auditRoadmapContent);
    return buildAuditRoadmapGenerationResult(auditRoadmapContent, input.roadmapAlias);
  },
  buildExtractionPrompt(input) {
    return buildAuditExtractionPrompt(input.roadmapContent, input.alias);
  },
  extractPriorContext: extractPriorInconclusiveAuditContext,
  validateGeneratedBatch(input) {
    return validateAuditGeneratedBatch(input.generation.tasks, input.priorContext ?? null);
  },
  getImportTaskOverrides(input) {
    const synthesis = isAuditSynthesisTitle(input.task.title);
    return {
      extraTags: ["diagnostic-only"],
      skipReview: false,
      useSubagents: true,
      paused: synthesis,
      blockedReason: synthesis
        ? "synthesis_not_ready: waiting for validated audit batch artifacts"
        : null,
    };
  },
  collectImportArtifact: collectAuditImportArtifact,
  createImportBatchSummary(input) {
    return createRoadmapBatchContract({
      projectId: input.projectId,
      roadmapAlias: input.roadmapAlias,
      taskIntent: input.taskIntent,
      executionPolicy: resolveAuditBatchExecutionPolicy(input.projectRoot),
      createdTaskIds: input.createdTaskIds,
      synthesisTaskId: input.synthesisTaskId,
      artifacts: input.artifacts,
    });
  },
});

const roadmapWorkflowPacks = createRoadmapWorkflowPackResolver<RoadmapWorkflowHooks>({
  audit: auditRoadmapHooks,
});

export async function generateRoadmapFile(
  input: GenerateRoadmapFileInput,
): Promise<GenerateRoadmapFileResult> {
  const { projectId, roadmapAlias, taskIntent, vision } = input;

  log.info({ projectId }, "Starting roadmap file generation");

  const project = findProjectById(projectId);
  if (!project) {
    throw new RoadmapGenerationError("PROJECT_NOT_FOUND", `Project ${projectId} not found`);
  }
  const intent = assertRoadmapIntentMatchesRequest({ roadmapAlias, taskIntent, vision });

  // Read project context
  const projectCfg = getProjectConfig(project.rootPath);
  const descriptionPath = join(project.rootPath, projectCfg.paths.description);
  const architecturePath = join(project.rootPath, projectCfg.paths.architecture);

  const description = existsSync(descriptionPath) ? readFileSync(descriptionPath, "utf8") : null;
  const architecture = existsSync(architecturePath) ? readFileSync(architecturePath, "utf8") : null;
  const roadmapHooks = roadmapWorkflowPacks.get(intent).hooks;
  const generationContext: RoadmapGenerationPromptContext = {
    description,
    architecture,
    vision: vision ?? null,
    roadmapAlias: roadmapAlias ?? null,
  };
  const auditDecomposition = roadmapHooks?.classifyGenerationRequest?.(generationContext);

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

  const basePrompt = buildRoadmapGenerationPrompt(
    {
      ...generationContext,
      auditDecomposition,
    },
    intent,
  );
  let rawResult = "";
  try {
    const { result } = await runApiRuntimeOneShot({
      projectId,
      projectRoot: project.rootPath,
      profileMode: "plan",
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
  const auditContext = {
    projectRoot: project.rootPath,
    description,
    architecture,
    vision: vision ?? null,
    roadmapAlias: roadmapAlias ?? null,
  };
  const normalizeRoadmapContent = (input: { content: string; source: "file" | "output" }) =>
    roadmapHooks?.normalizeGeneratedRoadmapContent?.({
      content: input.content,
      context: auditContext,
      source: input.source,
    }) ?? input.content;

  if (existsSync(roadmapPath)) {
    const fileContent = readFileSync(roadmapPath, "utf8").trim();
    // Verify agent wrote a real roadmap, not just a stub
    if (fileContent.length > 100 && (fileContent.includes("- [") || fileContent.includes("##"))) {
      content = normalizeRoadmapContent({ content: fileContent, source: "file" });
      if (content !== fileContent) writeFileSync(roadmapPath, content, "utf8");
      log.info({ projectId, roadmapPath, source: "file" }, "Using roadmap file written by agent");
    } else {
      content = extractRoadmapContent(rawResult);
      content = normalizeRoadmapContent({ content, source: "output" });
      writeFileSync(roadmapPath, content, "utf8");
    }
  } else if (rawResult) {
    content = extractRoadmapContent(rawResult);
    content = normalizeRoadmapContent({ content, source: "output" });
    writeFileSync(roadmapPath, content, "utf8");
  } else {
    throw new RoadmapGenerationError("EMPTY_RESPONSE", "Agent returned empty roadmap");
  }

  log.info({ projectId, roadmapPath, contentLength: content.length }, "Roadmap file generated");

  return { roadmapPath, content, auditDecomposition };
}

function buildAuditRoadmapGenerationPrompt(ctx: RoadmapGenerationPromptContext): string {
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

  const reportDate = new Date().toISOString().slice(0, 10);
  const priorContext = extractPriorInconclusiveAuditContext(ctx);
  const priorContextRule = priorContext
    ? `- Preserve this prior context in every audit and synthesis card: ${formatPriorAuditContextLine(priorContext)}`
    : "- Do not add `Prior audit context:` unless the alias, vision, or project description explicitly names a previous/prior/follow-up inconclusive audit.";
  const priorContextLine = priorContext ? `  - ${formatPriorAuditContextLine(priorContext)}\n` : "";
  const codeOnlyRule = isCodeOnlyAuditRequest(ctx)
    ? "Code-only audit requested: source report scopes must exclude README, AGENTS, docs, generated planning paths, prior audit artifacts, and governance-only metadata unless the user explicitly names one of those files."
    : "If the user asks for code-only/source-only audit, keep source report scopes to code, tests, and runtime config files; exclude README, AGENTS, docs, generated planning paths, and prior audit artifacts.";
  const decompositionRule = ctx.auditDecomposition
    ? `Request decomposition mode: ${ctx.auditDecomposition.mode}; requires decomposition: ${
        ctx.auditDecomposition.requiresDecomposition ? "yes" : "no"
      }; reasons: ${ctx.auditDecomposition.reasonCodes.join(", ") || "none"}.`
    : "Request decomposition mode: decomposed_report_batch; reasons: audit roadmap generation.";
  return `You are creating an owner-grade diagnostic audit decomposition roadmap based on the project context below.

${sections.join("\n\n")}

Operating model:
- Treat the user request as a high-level suspicion that technical quality may be poor.
- ${decompositionRule}
- Decompose the audit into owner-area checks; the user should not need to provide detailed audit instructions.
- Each owner area must produce actionable findings or a rigorous "No validated findings" report.
- A weak area report should be rejected later, so encode the quality bar directly in every card.
- ${codeOnlyRule}
${priorContextRule}

Generate a ROADMAP.md file with the following format:

# Project Audit Roadmap

> <one-line audit goal>

## Audit Tasks

- [ ] **Audit: <small area name>** - Diagnostic-only audit.
  - Scope: <3-10 concrete files or directories to inspect>
  - Audit mandate: <owner role and concrete quality risks to investigate>
  - Risk hypotheses: risk-<area>-1 <scope root> may contain <specific actionable risk>; risk-<area>-2 <scope root> may contain <specific actionable risk>
${priorContextLine}  - Allowed changes: only create/update one report artifact.
  - Report artifact: audit/${reportDate}-<short-name>-audit.md
  - Acceptance criteria: inspect the scoped files, record only actionable technical-quality findings, and classify each accepted finding as blocking or advisory.
  - Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...
  - Evidence ID rule: manifest evidenceRefs, scopeCoverage[].evidenceRefs, findings[].evidenceRefs, and noFindingsClaims[].evidenceRefs must cite actual runtime audit ledger IDs (ev_*) only; finding labels such as AOB-001 or invented IDs are never evidenceRefs.
  - Path rule: every repository reference must use an existing scoped path plus line/range; do not use basename-only references such as config.py, future files such as cli_context.py, or generated .ai-factory/* files as source evidence.
  - Quality bar: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims are not findings.
  - Rejected finding shapes: line counts, import counts, central-hub/monolithic-file claims, duplicated initialization/DRY/refactor-helper claims, import-chain/tight-coupling claims without a real cycle or runtime failure, private-method/direct-store/abstraction-bypass smells, missing facade, missing __all__, optional-dependency grouping, README/AGENTS ownership notes, and generated planning artifacts are not trusted findings unless tied to a concrete broken runtime behavior proven by scoped source evidence.
  - Inconclusive rule: a partially inspected or source_inconclusive observation is not a finding. Either inspect enough scoped source to validate it, omit it, or set the whole report outcome to source_inconclusive with the exact coverage gap.
  - No-findings rule: if no actionable finding is found, write "No validated findings" plus checked files and commands with observed outputs.
  - No-findings shape: do not write ### Finding or ### Risk subsections for no-findings claims; use a concise checklist/table and manifest noFindingsClaims tied to scoped evidenceRefs.
  - ${AUDIT_NO_FINDINGS_PROOF_GUARDRAIL}
  - ${AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT}
  - Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.
  - Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.

- [ ] **Synthesize audit findings** - Diagnostic-only synthesis.
  - Scope: all audit/${reportDate}-*-audit.md reports from this audit batch.
  - Audit mandate: act as the synthesis owner reviewing area reports; include only actionable findings that meet the evidence contract and call out weak reports by source.
${priorContextLine}  - Allowed changes: only create/update audit/${reportDate}-summary.md.
  - Report artifact: audit/${reportDate}-summary.md
  - Acceptance criteria: summarize blocking findings, advisory findings, omitted weak findings by source, and remediation backlog.
  - Evidence requirements: every summarized finding must include Evidence: <source repo path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...
  - Quality bar: do not promote weak source-report observations, inventory notes, speculative risks, or findings without concrete path:line evidence.
  - No-findings rule: if no source finding meets the bar, write "No validated findings" and list source reports inspected with observed commit/output evidence.
  - ${AUDIT_NO_FINDINGS_PROOF_GUARDRAIL}
  - ${AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT}
  - ${AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT}
  - ${AUDIT_CHILD_REPORT_STATUS_REQUIREMENT}
  - Git requirements: run git status --short; git add the summary artifact; git commit the summary artifact; verify with git log -1 --name-only --oneline.
  - Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.

Rules:
- Create 6-12 small audit tasks plus exactly one final synthesis task.
- Every task must be diagnostic-only.
- Do not create implementation, fixing, refactoring, hardening, test-expansion, deployment, or documentation tasks.
- Prefer narrow scopes such as project structure, configuration, persistence, integrations, orchestration, error handling, security, tests, packaging, and ops readiness.
- Source audit task Scope values must be concrete files or directories; never use Scope: ., ./, *, globs, "all files", "entire repository", or natural-language-only scope.
- Every source audit task must include a locally parseable Risk hypotheses: line with risk-* IDs, and every declared Scope root must appear in at least one risk hypothesis.
- Synthesis tasks do not need product risk hypotheses; their Scope must stay limited to all audit/${reportDate}-*-audit.md reports from this audit batch.
- Each audit task must be independently runnable and must have exactly one report artifact.
- The final synthesis task must list every child report artifact with a passed, failed, or inconclusive status before stating the overall audit outcome.
- Output ONLY the markdown content for ROADMAP.md, nothing else`;
}

function buildRoadmapGenerationPrompt(
  ctx: RoadmapGenerationPromptContext,
  intent: TaskIntent,
): string {
  const hookPrompt = roadmapWorkflowPacks.get(intent).hooks?.buildGenerationPrompt?.(ctx);
  if (hookPrompt) return hookPrompt;

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
  const intent = assertRoadmapIntentMatchesRequest({ roadmapAlias, taskIntent });

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

  // 2. Query Agent SDK for strict JSON conversion, unless the pack owns a deterministic path.
  const roadmapHooks = roadmapWorkflowPacks.get(intent).hooks;
  const priorContext = roadmapHooks?.extractPriorContext?.({ roadmapAlias, roadmapContent });
  const deterministicResult = roadmapHooks?.convertRoadmapContentToTasks?.({
    roadmapContent,
    roadmapAlias,
    priorContext,
  });
  if (deterministicResult) {
    validateRoadmapTasks(deterministicResult, intent, { priorContext });
    log.info(
      {
        projectId,
        roadmapAlias,
        taskCount: deterministicResult.tasks.length,
        workflowPack: roadmapWorkflowPacks.get(intent).workflowPack.id,
        source: "deterministic-workflow-pack",
      },
      "Roadmap generation complete through workflow pack",
    );
    return deterministicResult;
  }
  const prompt = buildExtractionPrompt(roadmapContent, roadmapAlias, intent);

  let rawResult = "";
  try {
    const lightModel = await resolveApiLightModel(projectId, trackingTaskId);
    const { result } = await runApiRuntimeOneShot({
      projectId,
      projectRoot: project.rootPath,
      taskId: trackingTaskId ?? null,
      profileMode: "plan",
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

function buildAuditExtractionPrompt(roadmapContent: string, alias: string): string {
  const priorContext = extractPriorInconclusiveAuditContext({
    roadmapAlias: alias,
    roadmapContent,
  });
  const priorContextRule = priorContext
    ? `- Preserve this prior context in every task description: ${formatPriorAuditContextLine(priorContext)}`
    : "- Do not add `Prior audit context:` unless the roadmap explicitly names a previous/prior/follow-up inconclusive audit.";
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
      "description": "Scope: packages/api/src/services/roadmapGeneration.ts, packages/shared/src/auditRoadmapContract.ts\\nAudit mandate: ...\\nRisk hypotheses: risk-roadmap-1 packages/api/src/services/roadmapGeneration.ts may contain extraction gaps; risk-roadmap-2 packages/shared/src/auditRoadmapContract.ts may contain validation gaps\\nAllowed changes: ...\\nReport artifact: audit/YYYY-MM-DD-name-audit.md\\nAcceptance criteria: ...\\nEvidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...\\nQuality bar: ...\\nNo-findings rule: ...\\n${AUDIT_NO_FINDINGS_PROOF_GUARDRAIL}\\n${AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT}\\nGit requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.\\nConstraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
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
- Every task description must include Scope:, Audit mandate:, Allowed changes:, Report artifact:, Acceptance criteria:, Evidence requirements:, Quality bar:, No-findings rule:, Git requirements:, and Constraint:.
- Source audit task descriptions must include concrete Scope roots and Risk hypotheses: with risk-* IDs that mention every Scope root; never use Scope: ., ./, *, globs, all files, entire repository, or natural-language-only scope.
- Synthesis descriptions must keep Scope: all audit/YYYY-MM-DD-*-audit.md reports from this audit batch and report-only allowed changes.
- Every task description must include: ${AUDIT_NO_FINDINGS_PROOF_GUARDRAIL}
- Every task description must include: ${AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT}
- Synthesis task descriptions must include: ${AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT}
- Synthesis task descriptions must include: ${AUDIT_CHILD_REPORT_STATUS_REQUIREMENT}
${priorContextRule}
- Every task description must require Evidence: <path>:<line>, Risk:, Proposed fix:, Verification: Command ... output ..., git status --short, git commit, and git log -1 --name-only --oneline.
- Return ONLY valid JSON, no explanatory text`;
}

function buildExtractionPrompt(roadmapContent: string, alias: string, intent: TaskIntent): string {
  const hookPrompt = roadmapWorkflowPacks
    .get(intent)
    .hooks?.buildExtractionPrompt?.({ roadmapContent, alias });
  if (hookPrompt) return hookPrompt;

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
  options: { priorContext?: string | null } = {},
): void {
  const roadmapHooks = roadmapWorkflowPacks.get(requestedIntent).hooks;
  const packBatchIssues =
    roadmapHooks?.validateGeneratedBatch?.({
      generation,
      priorContext: options.priorContext ?? null,
    }) ?? [];
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

  if (invalid.length > 0 || packBatchIssues.length > 0) {
    const details = invalid
      .slice(0, 5)
      .map((entry) => `${entry.task.title} (${entry.issues.join("; ")})`)
      .join(", ");
    const allDetails = [details, ...packBatchIssues].filter(Boolean).join("; ");
    if (roadmapHooks?.validateGeneratedBatch) {
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

function resolveAuditBatchExecutionPolicy(projectRoot: string): RoadmapBatchExecutionPolicy {
  if (
    isGitRepo(projectRoot) &&
    projectUsesSharedBranchIsolation(projectRoot) &&
    getEnv().AIF_TASK_WORKTREES_ENABLED &&
    projectSupportsTaskWorktrees(projectRoot)
  ) {
    return "worktree_isolated";
  }
  return "serialized_shared_checkout";
}

// -- Dedupe + batch creation --

export interface ImportResult {
  roadmapAlias: string;
  created: number;
  skipped: number;
  taskIds: string[];
  byPhase: Record<number, { created: number; skipped: number }>;
  batchSummary?: RoadmapBatchSummary;
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
  assertRoadmapIntentMatchesRequest({ roadmapAlias: alias, taskIntent: generation.taskIntent });
  const roadmapHooks = roadmapWorkflowPacks.get(importIntent).hooks;
  const priorContext = roadmapHooks?.extractPriorContext?.({ roadmapAlias: alias }) ?? null;
  const cfg = getProjectConfig(project.rootPath);

  const validationGeneration: RoadmapGenerationResult = hasExplicitTypedImportIntent
    ? generation
    : {
        ...generation,
        taskIntent: "general",
        tasks: generatedTasks.map((task) => ({ ...task, taskIntent: "general" as const })),
      };
  validateRoadmapTasks(validationGeneration, importIntent, { priorContext });

  // Load existing tasks for this alias for dedupe
  const existing = findTasksByRoadmapAlias(projectId, alias);
  const reusedAliasError = roadmapHooks?.rejectReusedAlias?.({ projectId, roadmapAlias: alias });
  if (reusedAliasError) {
    throw new RoadmapGenerationError("ROADMAP_ALIAS_EXISTS", reusedAliasError);
  }
  const existingByTitle = new Map(existing.map((task) => [normalizeTitle(task.title), task]));
  const existingTitles = new Set(existingByTitle.keys());

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
  const workflowArtifactInputs: RoadmapImportArtifactInput[] = [];
  let synthesisTaskId: string | null = null;

  for (const { task: genTask } of orderedTasks) {
    const phaseStats = result.byPhase[genTask.phase] ?? { created: 0, skipped: 0 };
    result.byPhase[genTask.phase] = phaseStats;

    const normalized = normalizeTitle(genTask.title);
    if (existingTitles.has(normalized)) {
      const existingTask = existingByTitle.get(normalized);
      if (existingTask) {
        const artifact = roadmapHooks?.collectImportArtifact?.({
          generatedTask: genTask,
          task: existingTask,
          projectRoot: project.rootPath,
        });
        if (artifact) {
          workflowArtifactInputs.push(artifact);
          if (artifact.role === "synthesis") synthesisTaskId = existingTask.id;
        }
      }
      log.debug({ title: genTask.title, alias, phase: genTask.phase }, "Task skipped (duplicate)");
      phaseStats.skipped++;
      result.skipped++;
      continue;
    }

    const taskIntent = hasExplicitTypedImportIntent ? importIntent : "general";
    const tags = buildTaskTags(alias, genTask);
    tags.push(`kind:${taskIntent}`);
    const importOverrides = roadmapHooks?.getImportTaskOverrides?.({ task: genTask }) ?? {};
    tags.push(...(importOverrides.extraTags ?? []));
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
      skipReview: importOverrides.skipReview ?? defaults.skipReview,
      useSubagents:
        importOverrides.useSubagents ?? (taskIntent === "spike" ? true : defaults.useSubagents),
      position: importPositionStart + createdPositionIndex * 100,
      paused: importOverrides.paused ?? false,
    });

    if (created) {
      createdPositionIndex++;
      result.taskIds.push(created.id);
      phaseStats.created++;
      result.created++;
      existingTitles.add(normalized);
      existingByTitle.set(normalized, created);
      const artifact = roadmapHooks?.collectImportArtifact?.({
        generatedTask: genTask,
        task: created,
        projectRoot: project.rootPath,
      });
      if (artifact) {
        workflowArtifactInputs.push(artifact);
        if (artifact.role === "synthesis") synthesisTaskId = created.id;
      }
      if (importOverrides.blockedReason) {
        setTaskFields(created.id, {
          blockedReason: importOverrides.blockedReason,
        });
      }
    }
  }

  const batchSummary = roadmapHooks?.createImportBatchSummary?.({
    projectId,
    roadmapAlias: alias,
    taskIntent: importIntent,
    projectRoot: project.rootPath,
    createdTaskIds: result.taskIds,
    synthesisTaskId,
    artifacts: workflowArtifactInputs,
  });
  if (batchSummary) result.batchSummary = batchSummary;

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
