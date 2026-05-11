import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import {
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  getLatestReworkComment,
  listRoadmapReportArtifactsForSynthesis,
  persistTaskPlanForTask,
  setTaskFields,
  summarizeRoadmapBatch,
  type RoadmapBatchArtifactRow,
  type TaskRow,
} from "@aif/data";
import {
  logger,
  formatAttachmentsForPrompt,
  formatTaskIntentContractForPrompt,
  looksLikeFullPlanUpdate,
  getProjectConfig,
  validateAuditReportArtifact,
} from "@aif/shared";
import { createRuntimeWorkflowSpec } from "@aif/runtime";
import { logActivity } from "../hooks.js";
import { executeSubagentQuery } from "../subagentQuery.js";
import { computePendingPlanLayers, computePlanLayers } from "../planLayers.js";
import { assertCurrentBranch, restorePersistedBranch } from "../gitBranch.js";

const log = logger("implementer");
const AGENT_NAME = "implement-coordinator";
// Keep user prompt below the 27K prompt-token envelope so Qwen profiles with
// max_tokens=5000 still have room for system text and tool schemas in 32K ctx.
const IMPLEMENT_COORDINATOR_INPUT_TOKEN_BUDGET = 26_000;
const PROMPT_BUDGET_CHARS_PER_TOKEN = 3;
const IMPLEMENT_COORDINATOR_CHAR_BUDGET =
  IMPLEMENT_COORDINATOR_INPUT_TOKEN_BUDGET * PROMPT_BUDGET_CHARS_PER_TOKEN;
const PROMPT_SECTION_LIMITS = {
  reworkComment: 8_000,
  reworkCommentMessage: 5_000,
  reworkCommentAttachments: 2_000,
  blockedReason: 3_000,
  reviewComments: 8_000,
  blockingFindingsSnapshot: 8_000,
  blockingFindingText: 900,
  blockingFindingCount: 20,
  taskDescription: 12_000,
  taskAttachments: 4_000,
  validatedAuditBatchInput: 18_000,
  validatedAuditArtifactContentMin: 2_000,
  validatedAuditArtifactContentMax: 8_000,
};

function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / PROMPT_BUDGET_CHARS_PER_TOKEN);
}

function compactTextForPrompt(label: string, text: string, maxChars: number): string {
  const value = text.trim();
  if (value.length <= maxChars) return value;

  const note = `\n\n[... ${label} compacted: omitted ${
    value.length - maxChars
  } characters to stay within implementer prompt budget ...]\n\n`;
  const available = Math.max(0, maxChars - note.length);
  if (available <= 0) {
    return `[... ${label} omitted to stay within implementer prompt budget ...]`;
  }

  const headLength = Math.ceil(available * 0.6);
  const tailLength = available - headLength;
  return `${value.slice(0, headLength).trimEnd()}${note}${value
    .slice(value.length - tailLength)
    .trimStart()}`;
}

function compactPromptBetweenMarkers(prompt: string, marker: string, maxChars: number): string {
  const startMarker = `<<<${marker}\n`;
  const start = prompt.indexOf(startMarker);
  if (start < 0) return prompt;
  const contentStart = start + startMarker.length;
  const end = prompt.indexOf(`\n${marker}`, contentStart);
  if (end < 0) return prompt;

  const content = prompt.slice(contentStart, end);
  const compacted = compactTextForPrompt(marker, content, maxChars);
  if (compacted === content.trim()) return prompt;
  return `${prompt.slice(0, contentStart)}${compacted}${prompt.slice(end)}`;
}

function compactPromptBetween(
  prompt: string,
  startMarker: string,
  endMarker: string,
  label: string,
  maxChars: number,
): string {
  const start = prompt.indexOf(startMarker);
  if (start < 0) return prompt;
  const contentStart = start + startMarker.length;
  const end = prompt.indexOf(endMarker, contentStart);
  if (end < 0) return prompt;

  const content = prompt.slice(contentStart, end);
  const compacted = compactTextForPrompt(label, content, maxChars);
  if (compacted === content.trim()) return prompt;
  return `${prompt.slice(0, contentStart)}${compacted}${prompt.slice(end)}`;
}

function compactImplementerPromptToBudget(prompt: string): {
  prompt: string;
  compacted: boolean;
  originalEstimatedTokens: number;
  estimatedTokens: number;
} {
  const originalEstimatedTokens = estimatePromptTokens(prompt);
  if (originalEstimatedTokens <= IMPLEMENT_COORDINATOR_INPUT_TOKEN_BUDGET) {
    return {
      prompt,
      compacted: false,
      originalEstimatedTokens,
      estimatedTokens: originalEstimatedTokens,
    };
  }

  let compacted = prompt;
  compacted = compactPromptBetweenMarkers(compacted, "VALIDATED_AUDIT_BATCH_INPUTS", 10_000);
  compacted = compactPromptBetweenMarkers(compacted, "FULL_REVIEW_COMMENTS", 5_000);
  compacted = compactPromptBetweenMarkers(compacted, "BLOCKING_FINDINGS_SNAPSHOT", 5_000);
  compacted = compactPromptBetweenMarkers(compacted, "REWORK_COMMENT", 5_000);
  compacted = compactPromptBetweenMarkers(compacted, "REWORK_BLOCKED_REASON", 2_000);
  compacted = compactPromptBetween(
    compacted,
    "Description: ",
    "\nTask attachments:",
    "TASK_DESCRIPTION",
    6_000,
  );
  compacted = compactPromptBetween(
    compacted,
    "Task attachments:\n",
    "\n\nValidated audit batch inputs:",
    "TASK_ATTACHMENTS",
    2_000,
  );

  if (estimatePromptTokens(compacted) > IMPLEMENT_COORDINATOR_INPUT_TOKEN_BUDGET) {
    compacted = compactTextForPrompt(
      "IMPLEMENT_COORDINATOR_PROMPT",
      compacted,
      IMPLEMENT_COORDINATOR_CHAR_BUDGET,
    );
  }

  return {
    prompt: compacted,
    compacted: compacted !== prompt,
    originalEstimatedTokens,
    estimatedTokens: estimatePromptTokens(compacted),
  };
}

function formatReworkCommentForPrompt(
  comment: {
    author: string;
    createdAt: string;
    message: string;
    attachments: string | null;
  } | null,
): string {
  if (!comment) return "No rework comments found for rework request.";
  return compactTextForPrompt(
    "REWORK_COMMENT",
    [
      `[${comment.createdAt}] ${comment.author}`,
      `message: ${compactTextForPrompt(
        "REWORK_COMMENT_MESSAGE",
        comment.message,
        PROMPT_SECTION_LIMITS.reworkCommentMessage,
      )}`,
      "attachments:",
      compactTextForPrompt(
        "REWORK_COMMENT_ATTACHMENTS",
        formatAttachmentsForPrompt(comment.attachments),
        PROMPT_SECTION_LIMITS.reworkCommentAttachments,
      ),
    ].join("\n"),
    PROMPT_SECTION_LIMITS.reworkComment,
  );
}

function formatAutoReviewStateForPrompt(
  state:
    | {
        strategy: string;
        iteration: number;
        findings: Array<{ id: string; text: string; source: string }>;
      }
    | null
    | undefined,
): string {
  if (!state || state.findings.length === 0) {
    return "No persisted blocking findings snapshot.";
  }

  const visibleFindings = state.findings.slice(0, PROMPT_SECTION_LIMITS.blockingFindingCount);
  const omittedCount = Math.max(0, state.findings.length - visibleFindings.length);
  const lines = [
    `strategy: ${state.strategy}`,
    `iteration: ${state.iteration}`,
    "findings:",
    ...visibleFindings.map((finding) => {
      const text = compactTextForPrompt(
        "BLOCKING_FINDING_TEXT",
        finding.text,
        PROMPT_SECTION_LIMITS.blockingFindingText,
      );
      return `- [${finding.id}] ${finding.source} | ${text}`;
    }),
  ];
  if (omittedCount > 0) {
    lines.push(`- [... ${omittedCount} additional blocking finding(s) omitted ...]`);
  }

  return compactTextForPrompt(
    "BLOCKING_FINDINGS_SNAPSHOT",
    lines.join("\n"),
    PROMPT_SECTION_LIMITS.blockingFindingsSnapshot,
  );
}

function isBlockedImplementationResult(resultText: string): boolean {
  const normalized = resultText.toLowerCase();
  return (
    normalized.includes("status: blocked") ||
    normalized.includes("permission system") ||
    normalized.includes("permission denied") ||
    normalized.includes("write permission") ||
    normalized.includes("cannot proceed") ||
    normalized.includes("blocked —")
  );
}

function readCanonicalPlan(
  task: { isFix: boolean; planPath: string },
  projectRoot: string,
): string | null {
  const cfg = getProjectConfig(projectRoot);
  const preferredPath = resolve(
    projectRoot,
    task.isFix ? cfg.paths.fix_plan : task.planPath || cfg.paths.plan,
  );
  if (existsSync(preferredPath)) {
    const content = readFileSync(preferredPath, "utf8").trim();
    if (content.length > 0) return content;
  }

  const fallbackPath = resolve(projectRoot, task.isFix ? cfg.paths.plan : cfg.paths.fix_plan);
  if (existsSync(fallbackPath)) {
    const content = readFileSync(fallbackPath, "utf8").trim();
    if (content.length > 0) return content;
  }

  return null;
}

function getChecklistProgress(planText: string | null): {
  parsedTaskCount: number;
  pendingTaskCount: number;
} {
  if (!planText) return { parsedTaskCount: 0, pendingTaskCount: 0 };
  const parsed = computePlanLayers(planText);
  const pending = computePendingPlanLayers(planText);
  return {
    parsedTaskCount: parsed.tasks.length,
    pendingTaskCount: pending.tasks.length,
  };
}

function normalizeArtifactGitPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function readValidatedArtifactContent(input: {
  artifactPath: string;
  projectRoot: string;
  branchName: string | null;
  worktreePath: string | null;
}): { content: string; source: string } {
  const gitPath = normalizeArtifactGitPath(input.artifactPath);
  if (
    isAbsolute(input.artifactPath) ||
    gitPath === ".." ||
    gitPath.startsWith("../") ||
    gitPath.includes("/../")
  ) {
    throw new Error(`synthesis_not_ready: invalid validated artifact path: ${input.artifactPath}`);
  }

  if (input.worktreePath) {
    const artifactPath = resolve(input.worktreePath, input.artifactPath);
    if (!existsSync(artifactPath)) {
      throw new Error(
        `synthesis_not_ready: validated artifact is unavailable: ${input.artifactPath}`,
      );
    }
    return {
      content: readFileSync(artifactPath, "utf8").trim(),
      source: input.worktreePath,
    };
  }

  if (input.branchName) {
    try {
      return {
        content: execFileSync(
          "git",
          ["-c", `safe.directory=${input.projectRoot}`, "show", `${input.branchName}:${gitPath}`],
          {
            cwd: input.projectRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          },
        ).trim(),
        source: `${input.branchName}:${gitPath}`,
      };
    } catch {
      throw new Error(
        `synthesis_not_ready: validated artifact is unavailable on branch ${input.branchName}: ${input.artifactPath}`,
      );
    }
  }

  const artifactPath = resolve(input.projectRoot, input.artifactPath);
  if (!existsSync(artifactPath)) {
    throw new Error(
      `synthesis_not_ready: validated artifact is unavailable: ${input.artifactPath}`,
    );
  }
  return {
    content: readFileSync(artifactPath, "utf8").trim(),
    source: input.projectRoot,
  };
}

interface ValidatedAuditArtifactContent {
  artifactPath: string;
  taskId: string;
  source: string;
  content: string;
}

interface WeakAuditArtifactSummary {
  artifactPath: string;
  taskId: string;
  state: RoadmapBatchArtifactRow["state"];
  failureFamily: string | null;
  validationDetails: string | null;
}

interface AuditSynthesisInputs {
  validatedArtifacts: ValidatedAuditArtifactContent[];
  weakArtifacts: WeakAuditArtifactSummary[];
}

interface AuditFindingSection {
  artifactPath: string;
  taskId: string;
  content: string;
}

interface AuditSourceReportSummary {
  artifact: ValidatedAuditArtifactContent;
  includedFindings: AuditFindingSection[];
  omittedFindingCount: number;
}

const AUDIT_EVIDENCE_REPAIR_MARKER = "audit_evidence_repair_required";
const AUDIT_EVIDENCE_REPAIR_SIGNAL_PATTERNS: RegExp[] = [
  new RegExp(AUDIT_EVIDENCE_REPAIR_MARKER, "i"),
  /\b(?:low_quality_report_evidence|insufficient_report_evidence)\b/i,
  /\bAudit report validator blocked completion\b/i,
  /\breport artifact contains\b/i,
  /\b(?:synthetic-looking git|synthetic git|placeholder commit hash|fake command output)\b/i,
  /\b(?:governance\/documentation observations|not actionable technical-quality findings|non-actionable audit observations)\b/i,
];

const LOW_QUALITY_SYNTHESIS_FINDING_PATTERNS: RegExp[] = [
  /\b(?:123abc|abc123|1234567890abcdef)\b/i,
  /\b(?:Author:\s+Your Name|your\.email@example\.com)\b/i,
  /\b(?:root-commit|Date:\s+Mon May 10 12:34:56 2026|Author:\s+qwen-local-agent\s+<>|Signed-off-by:\s+qwen-local-agent\s+<>|commit\s+[0-9a-f]*0c0c[0-9a-f]*\b)/i,
  /\b(?:too large to (?:be )?(?:read|inspect)|reported as too large|file is too large|bytes\s*>\s*\d+\s*byte limit|could not (?:read|inspect|access)|not visible|would show|should show|expected to show)\b/i,
  /\b(?:will be committed|created and will be committed|has been created and will be committed)\b/i,
  /\b(?:may contain|likely used|likely indicates|no evidence of sensitive content|confirmed (?:the )?file exists|confirmed .* exists)\b/i,
];
const SYNTHESIS_LINE_EVIDENCE_REF_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z0-9]{1,12}):(\d+)(?::\d+)?(?=$|[\s`'"\]),.;])/gi;
const SYNTHESIS_IGNORED_EVIDENCE_PATH_PARTS = new Set(["__pycache__", "node_modules", ".git"]);
const SYNTHESIS_IGNORED_EVIDENCE_EXTENSIONS = new Set([
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".pdf",
  ".png",
  ".pyc",
  ".pyo",
  ".sqlite",
  ".sqlite3",
  ".webp",
]);

function formatArtifactValidationDetails(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function readAuditSynthesisInputs(taskId: string, fallbackRoot: string): AuditSynthesisInputs {
  const synthesisArtifact = findRoadmapBatchArtifactByTaskId(taskId);
  if (!synthesisArtifact || synthesisArtifact.role !== "synthesis") {
    return { validatedArtifacts: [], weakArtifacts: [] };
  }

  const summary = summarizeRoadmapBatch(synthesisArtifact.batchId);
  if (!summary?.synthesisReady) {
    const valid = summary?.counts.valid ?? 0;
    const total = summary?.counts.total ?? 0;
    throw new Error(
      `synthesis_not_ready: waiting for validated audit batch artifacts (${valid}/${total} valid)`,
    );
  }

  const reports = listRoadmapReportArtifactsForSynthesis(synthesisArtifact.batchId);
  if (reports.length === 0) {
    throw new Error("synthesis_not_ready: no terminal audit report artifacts are available");
  }

  const validatedArtifacts = reports
    .filter((artifact) => artifact.state === "valid")
    .map((artifact) => {
      const root = artifact.projectRoot ?? fallbackRoot;
      const { content, source } = readValidatedArtifactContent({
        artifactPath: artifact.artifactPath,
        branchName: artifact.branchName,
        worktreePath: artifact.worktreePath,
        projectRoot: root,
      });
      if (!content) {
        throw new Error(
          `synthesis_not_ready: validated artifact is empty: ${artifact.artifactPath}`,
        );
      }
      return {
        artifactPath: artifact.artifactPath,
        taskId: artifact.taskId,
        source,
        content,
      };
    });
  const weakArtifacts = reports
    .filter((artifact) => artifact.state !== "valid")
    .map((artifact) => ({
      artifactPath: artifact.artifactPath,
      taskId: artifact.taskId,
      state: artifact.state,
      failureFamily: artifact.failureFamily,
      validationDetails: formatArtifactValidationDetails(artifact.validationDetailsJson),
    }));

  return { validatedArtifacts, weakArtifacts };
}

function isAuditEvidenceRepairSignal(text: string | null | undefined): boolean {
  if (!text) return false;
  return AUDIT_EVIDENCE_REPAIR_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function extractReviewIterationFromText(text: string | null | undefined): number {
  if (!text) return 0;
  const iterations = [...text.matchAll(/\bReview Iteration\s*:\s*(\d+)/gi)]
    .map((match) => Number(match[1]))
    .filter((iteration) => Number.isInteger(iteration) && iteration > 0);
  return iterations.length > 0 ? Math.max(...iterations) : 0;
}

function reviewCommentsDeclareNoBlockingFindings(text: string | null | undefined): boolean {
  if (!text) return false;
  const section = text.match(/## Blocking Findings\s*\r?\n([\s\S]*?)(?=\r?\n## |\s*$)/i)?.[1];
  return Boolean(section && /^\s*-\s*none\s*$/im.test(section));
}

function isAuditEvidenceRepairMode(
  task: Pick<TaskRow, "reworkRequested" | "blockedReason" | "reviewComments"> & {
    autoReviewState?: { findings: Array<{ text: string }> } | null;
  },
  artifactPath: string | null,
): boolean {
  if (!task.reworkRequested || !artifactPath) return false;
  if (isAuditEvidenceRepairSignal(task.blockedReason)) return true;
  if (isAuditEvidenceRepairSignal(task.reviewComments)) return true;
  return (
    task.autoReviewState?.findings.some((finding) => isAuditEvidenceRepairSignal(finding.text)) ??
    false
  );
}

function shouldUseDeterministicAuditReportRepair(
  task: Pick<TaskRow, "blockedReason" | "reviewComments"> & {
    autoReviewState?: { iteration?: number; findings: Array<{ text: string }> } | null;
  },
  currentReportIssueCodes: string[] = [],
): boolean {
  const text = [
    task.blockedReason ?? "",
    task.reviewComments ?? "",
    ...(task.autoReviewState?.findings.map((finding) => finding.text) ?? []),
  ].join("\n");
  if (
    /\b(?:governance_observation_as_finding|governance\/documentation observations|synthetic-looking git|placeholder commit hash|fake command output)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  const reviewIteration = Math.max(
    task.autoReviewState?.iteration ?? 0,
    extractReviewIterationFromText(task.reviewComments),
  );
  const validatorIssuePattern =
    /\b(?:contradictory_findings_and_no_findings|invalid_or_missing_file_references|missing_report_file_references|missing_scope_coverage|missing_substantive_evidence|unverified_inspection_claim|low_quality_report_evidence|insufficient_report_evidence)\b/i;
  const deterministicReportIssuePattern =
    /\b(?:contradictory_findings_and_no_findings|invalid_line_reference|missing_declared_scope_root|missing_report_file_references|missing_scope_coverage|missing_substantive_evidence|unverified_inspection_claim)\b/i;
  if (
    reviewIteration >= 1 &&
    currentReportIssueCodes.some((code) => deterministicReportIssuePattern.test(code))
  ) {
    return true;
  }

  return (
    reviewIteration >= 2 &&
    ((/\bAudit report validator blocked completion\b/i.test(text) &&
      validatorIssuePattern.test(text)) ||
      currentReportIssueCodes.some((code) => validatorIssuePattern.test(code)))
  );
}

function normalizeAuditScopeRoot(path: string): string | null {
  const trimmed = path
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[),.;\]]+$/g, "");
  if (!trimmed || /^[a-z]+:\/\//i.test(trimmed) || trimmed.includes("*")) return null;
  const normalized = trimmed
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("..") ||
    /\s/.test(normalized) ||
    !/^[\w.@-]+(?:\/[\w.@-]+)*$/.test(normalized)
  ) {
    return null;
  }
  return normalized.replace(/\/+$/g, "");
}

function parseAuditScopeRoots(description: string | null): string[] {
  if (!description) return [];
  const roots = new Set<string>();
  const scopeLine = description
    .split(/\r?\n/)
    .find((line) => /^\s*(?:[-*]\s*)?Scope\s*:/i.test(line));
  const scopeText = scopeLine?.replace(/^\s*(?:[-*]\s*)?Scope\s*:\s*/i, "") ?? "";
  for (const token of scopeText.split(/[,;]+/)) {
    const normalized = normalizeAuditScopeRoot(token);
    if (normalized) roots.add(normalized);
  }
  return [...roots].sort();
}

const AUDIT_REPAIR_IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage"]);

function collectAuditRepairEvidenceFiles(
  projectRoot: string,
  scopeRoot: string,
  limit = 3,
): string[] {
  const absPath = resolve(projectRoot, scopeRoot);
  if (!existsSync(absPath)) return [];
  const stat = statSync(absPath);
  if (stat.isFile()) return [scopeRoot];
  if (!stat.isDirectory()) return [];

  const files: string[] = [];
  const visit = (absoluteDirectory: string): void => {
    if (files.length >= limit) return;
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      if (files.length >= limit) return;
      const child = resolve(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        if (!AUDIT_REPAIR_IGNORED_DIRS.has(entry.name)) visit(child);
        continue;
      }
      if (entry.isFile()) {
        files.push(
          child
            .replace(projectRoot, "")
            .replace(/^[/\\]+/, "")
            .replaceAll("\\", "/"),
        );
      }
    }
  };
  visit(absPath);
  return files;
}

function runGitText(projectRoot: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (err && typeof err === "object" && "stderr" in err) {
      const stderr = String((err as { stderr?: unknown }).stderr ?? "").trim();
      if (stderr) return stderr;
    }
    return "command failed without captured output";
  }
}

function buildDeterministicAuditReportRepairContent(input: {
  task: TaskRow;
  projectRoot: string;
  artifactPath: string;
}): string {
  const scopeRoots = parseAuditScopeRoots(input.task.description);
  const roots = scopeRoots.length > 0 ? scopeRoots : ["."];
  const evidenceByRoot = roots.map((root) => ({
    root,
    files: collectAuditRepairEvidenceFiles(input.projectRoot, root),
    gitLsFilesOutput: runGitText(input.projectRoot, ["ls-files", "--", root]),
  }));
  const checkedFiles = [...new Set(evidenceByRoot.flatMap((entry) => entry.files))].sort();
  const lines = [
    `# ${input.task.title}`,
    "",
    "No validated findings.",
    "",
    "The previous candidate findings did not meet the audit finding contract for concrete technical defects. They were removed instead of being rephrased.",
    "",
    "## Evidence Register",
    "",
    "| Scope | Checked evidence | Verification |",
    "| --- | --- | --- |",
    ...evidenceByRoot.map((entry) => {
      const evidence =
        entry.files.length > 0
          ? entry.files.map((file) => `\`${file}:1\``).join(", ")
          : "No tracked file evidence found";
      const firstOutputLine = entry.gitLsFilesOutput.split(/\r?\n/).find(Boolean) ?? "<empty>";
      return `| \`${entry.root}\` | ${evidence} | Command \`git ls-files -- ${entry.root}\` output includes \`${firstOutputLine}\` |`;
    }),
    "",
    "## Checked Files",
    "",
    ...(checkedFiles.length > 0
      ? checkedFiles.map((file) => `- \`${file}:1\``)
      : ["- No tracked files were found for the declared scope."]),
    "",
    "## Checked Commands",
    "",
    ...evidenceByRoot.flatMap((entry) => [
      `- Command \`git ls-files -- ${entry.root}\` output:`,
      "```",
      entry.gitLsFilesOutput || "<empty>",
      "```",
    ]),
    "",
  ];

  return `${lines.join("\n").trim()}\n`;
}

function formatValidatedAuditSynthesisInput(
  artifacts: ValidatedAuditArtifactContent[],
  weakArtifacts: WeakAuditArtifactSummary[] = [],
): string {
  if (artifacts.length === 0 && weakArtifacts.length === 0) {
    return "No validated audit batch input required for this task.";
  }

  const artifactContentLimit = Math.max(
    PROMPT_SECTION_LIMITS.validatedAuditArtifactContentMin,
    Math.min(
      PROMPT_SECTION_LIMITS.validatedAuditArtifactContentMax,
      Math.floor(PROMPT_SECTION_LIMITS.validatedAuditBatchInput / Math.max(artifacts.length, 1)),
    ),
  );
  const sections = artifacts.map((artifact) => {
    return [
      `--- artifact: ${artifact.artifactPath}`,
      `task: ${artifact.taskId}`,
      `source: ${artifact.source}`,
      "---",
      compactValidatedAuditArtifactContent(artifact.content, artifactContentLimit),
    ].join("\n");
  });

  if (weakArtifacts.length > 0) {
    sections.push(
      [
        "--- weak_or_invalid_artifacts ---",
        "These report artifacts are terminal batch sources but did not pass validation.",
        "Use them only to report audit coverage gaps; do not promote their findings as source-of-truth audit findings.",
        ...weakArtifacts.map((artifact) => {
          const details = artifact.validationDetails
            ? `\n  validationDetails: ${artifact.validationDetails}`
            : "";
          return [
            `- artifact: ${artifact.artifactPath}`,
            `  task: ${artifact.taskId}`,
            `  state: ${artifact.state}`,
            `  failureFamily: ${artifact.failureFamily ?? "none"}`,
            details,
          ]
            .filter(Boolean)
            .join("\n");
        }),
      ].join("\n"),
    );
  }

  return compactTextForPrompt(
    "VALIDATED_AUDIT_BATCH_INPUTS",
    sections.join("\n\n"),
    PROMPT_SECTION_LIMITS.validatedAuditBatchInput,
  );
}

function compactValidatedAuditArtifactContent(content: string, maxChars: number): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const findingSections = splitAuditFindingSections(trimmed);
  if (findingSections.length === 0) {
    return compactTextForPrompt("VALIDATED_AUDIT_ARTIFACT_CONTENT", trimmed, maxChars);
  }

  const selected: string[] = [];
  let usedChars = 0;
  for (const section of findingSections) {
    const nextLength = section.length + 2;
    if (selected.length > 0 && usedChars + nextLength > maxChars) break;
    selected.push(section);
    usedChars += nextLength;
  }
  const omitted = Math.max(0, findingSections.length - selected.length);
  const summarized = [
    `[validated audit report compacted for implementer prompt budget; included finding sections: ${selected.length}; omitted finding sections: ${omitted}]`,
    ...selected,
  ].join("\n\n");
  return compactTextForPrompt("VALIDATED_AUDIT_ARTIFACT_CONTENT", summarized, maxChars);
}

function splitAuditFindingSections(content: string): string[] {
  return content
    .split(/\n(?=#{2,4}\s+)/)
    .map((section) => section.trim())
    .filter((section) => {
      return (
        /\bEvidence\s*:/i.test(section) &&
        /\bRisk\s*:/i.test(section) &&
        /\bVerification\s*:/i.test(section)
      );
    });
}

function hasLowQualitySynthesisFindingEvidence(section: string): boolean {
  return LOW_QUALITY_SYNTHESIS_FINDING_PATTERNS.some((pattern) => pattern.test(section));
}

function hasConcreteRepositoryLineEvidence(section: string): boolean {
  return /(?:^|[\s`'"\[(])(?:\.{1,2}\/)?(?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z0-9]{1,12}:\d+(?::\d+)?(?=$|[\s`'"\]),.;])/i.test(
    section,
  );
}

function hasProposedFix(section: string): boolean {
  return /\bProposed fix\s*:/i.test(section);
}

function normalizeSynthesisEvidenceRef(rawPath: string, rawLine: string): string | null {
  const line = Number(rawLine);
  if (!Number.isInteger(line) || line <= 0) return null;
  const normalizedPath = rawPath
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/[),.;\]]+$/g, "");
  if (
    !normalizedPath ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../") ||
    normalizedPath.includes("*")
  ) {
    return null;
  }
  const pathParts = normalizedPath.split("/");
  if (pathParts.some((part) => SYNTHESIS_IGNORED_EVIDENCE_PATH_PARTS.has(part))) {
    return null;
  }
  const extensionMatch = normalizedPath.match(/(\.[A-Za-z0-9]+)$/);
  if (
    extensionMatch &&
    SYNTHESIS_IGNORED_EVIDENCE_EXTENSIONS.has(extensionMatch[1].toLowerCase())
  ) {
    return null;
  }
  return `${normalizedPath}:${line}`;
}

function pathFromLineEvidenceRef(ref: string): string {
  return ref.replace(/:\d+(?::\d+)?$/, "");
}

function collectSynthesisLineEvidenceRefs(input: {
  content: string;
  projectRoot: string;
  limit?: number;
}): string[] {
  const refs = new Set<string>();
  for (const match of input.content.matchAll(SYNTHESIS_LINE_EVIDENCE_REF_PATTERN)) {
    const ref = normalizeSynthesisEvidenceRef(match[1] ?? "", match[2] ?? "");
    if (!ref) continue;
    const evidencePath = pathFromLineEvidenceRef(ref);
    if (!existsSync(resolve(input.projectRoot, evidencePath))) continue;
    refs.add(ref);
    if (refs.size >= (input.limit ?? 8)) break;
  }
  return [...refs];
}

function collectSynthesisNoFindingsEvidence(input: {
  artifacts: ValidatedAuditArtifactContent[];
  projectRoot: string;
}): Map<string, string[]> {
  const refsByArtifact = new Map<string, string[]>();
  for (const artifact of input.artifacts) {
    refsByArtifact.set(
      artifact.artifactPath,
      collectSynthesisLineEvidenceRefs({
        content: artifact.content,
        projectRoot: input.projectRoot,
      }),
    );
  }
  return refsByArtifact;
}

function firstOutputLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "<empty>";
}

function formatSynthesisCheckedCommand(projectRoot: string, evidencePath: string): string[] {
  const output = runGitText(projectRoot, ["ls-files", "--", evidencePath]);
  return [
    `- Command \`git ls-files -- ${evidencePath}\` output:`,
    "```",
    output || "<empty>",
    "```",
  ];
}

function summarizeValidatedAuditArtifactsForSynthesis(
  artifacts: ValidatedAuditArtifactContent[],
): AuditSourceReportSummary[] {
  return artifacts.map((artifact) => {
    const findingSections = splitAuditFindingSections(artifact.content);
    const includedFindings = findingSections
      .filter(
        (section) =>
          hasConcreteRepositoryLineEvidence(section) &&
          hasProposedFix(section) &&
          !hasLowQualitySynthesisFindingEvidence(section),
      )
      .map((section) => ({
        artifactPath: artifact.artifactPath,
        taskId: artifact.taskId,
        content: section,
      }));
    return {
      artifact,
      includedFindings,
      omittedFindingCount: findingSections.length - includedFindings.length,
    };
  });
}

function commitArtifactIfChanged(
  projectRoot: string,
  artifactPath: string,
  commitMessage = "Audit: synthesize validated reports",
): string {
  const gitPath = normalizeArtifactGitPath(artifactPath);
  execFileSync("git", ["add", "--", gitPath], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = execFileSync("git", ["status", "--short", "--", gitPath], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (status) {
    execFileSync("git", ["commit", "--no-verify", "-m", commitMessage], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  return execFileSync("git", ["log", "-1", "--name-only", "--oneline", "--", gitPath], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function buildDeterministicAuditSynthesisContent(
  artifacts: ValidatedAuditArtifactContent[],
  weakArtifacts: WeakAuditArtifactSummary[] = [],
  projectRoot: string,
): string {
  const sourceSummaries = summarizeValidatedAuditArtifactsForSynthesis(artifacts);
  const totalIncluded = sourceSummaries.reduce(
    (sum, summary) => sum + summary.includedFindings.length,
    0,
  );
  const totalOmitted = sourceSummaries.reduce(
    (sum, summary) => sum + summary.omittedFindingCount,
    0,
  );

  if (totalIncluded === 0) {
    const refsByArtifact = collectSynthesisNoFindingsEvidence({ artifacts, projectRoot });
    const checkedRefs = [
      ...new Set(
        [...refsByArtifact.values()].flatMap((refs) => refs).filter((ref) => ref.length > 0),
      ),
    ].sort();
    const checkedPaths = [...new Set(checkedRefs.map(pathFromLineEvidenceRef))].slice(0, 12);
    const lines = [
      "# Audit Summary",
      "",
      "No validated findings.",
      "",
      "Generated from terminal audit batch report artifacts. Source report findings were included only when they carried concrete path:line Evidence, Risk, Proposed fix, and Verification sections.",
      "",
      "## Source Reports Checked",
      "",
      sourceSummaries.length > 0
        ? sourceSummaries
            .map((summary) => {
              return [
                `- ${summary.artifact.artifactPath} (task ${summary.artifact.taskId})`,
                `  - Included findings: ${summary.includedFindings.length}`,
                `  - Omitted findings: ${summary.omittedFindingCount}`,
              ].join("\n");
            })
            .join("\n")
        : "- No validated source reports were available.",
      "",
      "## Evidence Register",
      "",
      "| Source report | Checked evidence | Verification |",
      "| --- | --- | --- |",
      ...sourceSummaries.map((summary) => {
        const refs = refsByArtifact.get(summary.artifact.artifactPath) ?? [];
        const evidence =
          refs.length > 0
            ? refs.map((ref) => `\`${ref}\``).join(", ")
            : "No concrete line evidence was available in this source report.";
        const firstEvidencePath = refs.length > 0 ? pathFromLineEvidenceRef(refs[0]) : null;
        const verification = firstEvidencePath
          ? `Command \`git ls-files -- ${firstEvidencePath}\` output includes \`${firstOutputLine(
              runGitText(projectRoot, ["ls-files", "--", firstEvidencePath]),
            )}\``
          : "Source report provided no concrete repository line evidence to carry forward.";
        return `| \`${summary.artifact.artifactPath}\` | ${evidence} | ${verification} |`;
      }),
      "",
      "## Checked Files",
      "",
      ...(checkedRefs.length > 0
        ? checkedRefs.map((ref) => `- \`${ref}\``)
        : ["- No checked repository files were available from the validated source reports."]),
      "",
      "## Checked Commands",
      "",
      ...(checkedPaths.length > 0
        ? checkedPaths.flatMap((path) => formatSynthesisCheckedCommand(projectRoot, path))
        : ["- No repository command outputs were available from the validated source reports."]),
      "",
      "## Weak Or Invalid Reports",
      "",
    ];

    if (weakArtifacts.length === 0) {
      lines.push("No weak or invalid report artifacts were present in the batch.");
    } else {
      weakArtifacts.forEach((artifact) => {
        lines.push(`- ${artifact.artifactPath} (task ${artifact.taskId})`);
        lines.push(`  - State: ${artifact.state}`);
        lines.push(`  - Failure family: ${artifact.failureFamily ?? "none"}`);
        if (artifact.validationDetails) {
          lines.push(
            `  - Validation details: ${artifact.validationDetails.replace(/\n/g, "\n    ")}`,
          );
        }
      });
    }

    lines.push("");
    lines.push("## Synthesis Quality Notes");
    lines.push("");
    lines.push(`Included source findings: ${totalIncluded}.`);
    lines.push(`Omitted source findings: ${totalOmitted}.`);
    lines.push(`Weak or invalid source reports: ${weakArtifacts.length}.`);
    lines.push("");

    return `${lines.join("\n").trim()}\n`;
  }

  const lines = [
    "# Audit Summary",
    "",
    "Generated from terminal audit batch report artifacts.",
    "Only findings with concrete path:line Evidence, Risk, Proposed fix, and Verification sections were included.",
    "Weak or invalid source reports are listed as coverage gaps only.",
    "",
    "## Source Reports",
    "",
    sourceSummaries.length > 0
      ? sourceSummaries
          .map((summary) => {
            return [
              `- ${summary.artifact.artifactPath} (task ${summary.artifact.taskId})`,
              `  - Included findings: ${summary.includedFindings.length}`,
              `  - Omitted findings: ${summary.omittedFindingCount}`,
            ].join("\n");
          })
          .join("\n")
      : "- No validated source reports were available.",
    "",
    "## Findings By Source Report",
    "",
  ];

  sourceSummaries.forEach((summary, sourceIndex) => {
    lines.push(`### Source Report ${sourceIndex + 1}: ${summary.artifact.artifactPath}`);
    lines.push("");
    if (summary.includedFindings.length === 0) {
      lines.push("No findings from this source report passed the synthesis evidence filter.");
      lines.push("");
      lines.push(`Evidence: \`${summary.artifact.artifactPath}\` was a validated source report.`);
      lines.push("Risk: Source report evidence was too weak to include as an audit finding.");
      lines.push(
        "Verification: Command `git log -1 --name-only --oneline -- <artifact>` output is recorded in the implementation log for this synthesis artifact.",
      );
      lines.push("");
      return;
    }
    summary.includedFindings.forEach((finding, findingIndex) => {
      lines.push(`#### Finding ${sourceIndex + 1}.${findingIndex + 1}`);
      lines.push("");
      lines.push(`Source report: \`${finding.artifactPath}\` (task ${finding.taskId})`);
      lines.push("");
      lines.push(finding.content.trim());
      lines.push("");
    });
  });

  if (sourceSummaries.length === 0) {
    lines.push("No validated source reports were available for finding synthesis.");
    lines.push("");
  }

  lines.push("## Weak Or Invalid Reports");
  lines.push("");
  if (weakArtifacts.length === 0) {
    lines.push("No weak or invalid report artifacts were present in the batch.");
  } else {
    weakArtifacts.forEach((artifact) => {
      lines.push(`- ${artifact.artifactPath} (task ${artifact.taskId})`);
      lines.push(`  - State: ${artifact.state}`);
      lines.push(`  - Failure family: ${artifact.failureFamily ?? "none"}`);
      if (artifact.validationDetails) {
        lines.push(
          `  - Validation details: ${artifact.validationDetails.replace(/\n/g, "\n    ")}`,
        );
      }
    });
  }
  lines.push("");

  lines.push("## Synthesis Quality Notes");
  lines.push("");
  lines.push(`Included source findings: ${totalIncluded}.`);
  lines.push(`Omitted source findings: ${totalOmitted}.`);
  lines.push(`Weak or invalid source reports: ${weakArtifacts.length}.`);
  lines.push("");

  return `${lines.join("\n").trim()}\n`;
}

function runDeterministicAuditSynthesisRework(input: {
  task: TaskRow;
  projectRoot: string;
  artifactPath: string;
  artifacts: ValidatedAuditArtifactContent[];
  weakArtifacts: WeakAuditArtifactSummary[];
}): string {
  const artifactPath = resolve(input.projectRoot, input.artifactPath);
  mkdirSync(dirname(artifactPath), { recursive: true });
  const content = buildDeterministicAuditSynthesisContent(
    input.artifacts,
    input.weakArtifacts,
    input.projectRoot,
  );
  writeFileSync(artifactPath, content, "utf8");
  const gitLog = commitArtifactIfChanged(input.projectRoot, input.artifactPath);
  return [
    "Deterministic audit synthesis rework completed from validated report artifacts.",
    `Report artifact: ${input.artifactPath}`,
    "Verification: Command `git log -1 --name-only --oneline -- <artifact>` output:",
    gitLog,
  ].join("\n");
}

function runDeterministicAuditReportRepair(input: {
  task: TaskRow;
  projectRoot: string;
  artifactPath: string;
}): string {
  const artifactPath = resolve(input.projectRoot, input.artifactPath);
  mkdirSync(dirname(artifactPath), { recursive: true });
  const content = buildDeterministicAuditReportRepairContent(input);
  writeFileSync(artifactPath, content, "utf8");
  const gitLog = commitArtifactIfChanged(
    input.projectRoot,
    input.artifactPath,
    "Audit: repair report evidence",
  );
  return [
    "Deterministic audit report repair completed from declared scope evidence.",
    `Report artifact: ${input.artifactPath}`,
    "Rejected prior candidate findings that did not meet the technical finding contract.",
    "Verification: Command `git log -1 --name-only --oneline -- <artifact>` output:",
    gitLog,
  ].join("\n");
}

function validateExistingAuditReportArtifact(input: {
  projectRoot: string;
  artifactPath: string;
  taskDescription: string | null;
}): ReturnType<typeof validateAuditReportArtifact> | null {
  const artifactPath = resolve(input.projectRoot, input.artifactPath);
  if (!existsSync(artifactPath)) return null;
  return validateAuditReportArtifact({
    text: readFileSync(artifactPath, "utf8"),
    projectRoot: input.projectRoot,
    taskDescription: input.taskDescription,
    reportArtifactPaths: [input.artifactPath],
    requireProposedFix: true,
  });
}

async function runChecklistSyncQuery(input: {
  task: TaskRow;
  projectRoot: string;
  planText: string;
  implementationResult: string;
}): Promise<string> {
  const prompt = `You are finalizing task checklist state in a markdown implementation plan.

TASK TITLE:
${input.task.title}

TASK DESCRIPTION:
${input.task.description}

IMPLEMENTATION RESULT LOG (source of truth for what was done):
${input.implementationResult}

CURRENT PLAN MARKDOWN:
<<<CURRENT_PLAN
${input.planText}
CURRENT_PLAN

Requirements:
1) Return the FULL updated plan markdown.
2) Update only checkbox states ("- [ ]" / "- [x]") to reflect implemented work from the log.
3) Do not rewrite structure, titles, ordering, prose, or dependencies.
4) Preserve all unchecked tasks that are not completed yet.
5) Output markdown only.
6) Do not use tools or subagents.`;

  const workflowSpec = createRuntimeWorkflowSpec({
    workflowKind: "implementer_checklist_sync",
    prompt,
    requiredCapabilities: [],
    sessionReusePolicy: "never",
    systemPromptAppend: "Do not use tools or subagents. Reply directly with markdown only.",
    metadata: {
      checklistSync: true,
    },
  });

  const { resultText } = await executeSubagentQuery({
    taskId: input.task.id,
    projectRoot: input.projectRoot,
    agentName: "implement-checklist-sync",
    prompt,
    workflowSpec,
    workflowKind: "implementer_checklist_sync",
  });
  const normalizedResult = resultText.trim();
  if (!normalizedResult) {
    throw new Error("Checklist sync did not return plan markdown");
  }
  return normalizedResult;
}

export async function runImplementer(taskId: string, projectRoot: string): Promise<void> {
  const task = findTaskById(taskId);

  if (!task) {
    log.error({ taskId }, "Task not found for implementation");
    throw new Error(`Task ${taskId} not found`);
  }

  // Branch restore MUST happen before any repo/config/plan read. If the
  // planner prepared a feature branch but auto-queue (or a chat/manual
  // action) moved HEAD between stages, every downstream read — config,
  // canonical plan, pending-task detection, no-op early return — would
  // operate on the wrong branch and silently ship incorrect state.
  //
  // `task.branchName` is a source-of-truth contract: once planner set it,
  // every subsequent stage MUST land on that branch or fail loud. Config
  // drift (git.enabled / create_branches toggled off between stages) cannot
  // release us to the current HEAD — `restorePersistedBranch` throws instead
  // of the "skipped" shortcut `ensureFeatureBranch` uses.
  if (task.branchName && !task.isFix) {
    restorePersistedBranch({
      projectRoot,
      taskId,
      persistedBranchName: task.branchName,
    });
    logActivity(taskId, "Agent", `Restored feature branch: ${task.branchName}`);
  }

  const project = findProjectById(task.projectId);
  const implementerBudget = project?.implementerMaxBudgetUsd ?? null;
  const useSubagents = task.useSubagents;
  const executionName = useSubagents ? AGENT_NAME : "aif-implement";
  const cfg = getProjectConfig(projectRoot);
  const canonicalPlan = readCanonicalPlan(task, projectRoot);
  const selectedPlan = canonicalPlan ?? task.plan;
  const effectivePlanPath = task.isFix ? cfg.paths.fix_plan : task.planPath || cfg.paths.plan;
  const planSection = `@${effectivePlanPath}`;
  const layerComputation = selectedPlan
    ? computePendingPlanLayers(selectedPlan)
    : { tasks: [], layers: [] };
  const parsedPlanComputation = selectedPlan
    ? computePlanLayers(selectedPlan)
    : { tasks: [], layers: [] };
  const parsedTaskCount = parsedPlanComputation.tasks.length;
  const pendingTaskCount = layerComputation.tasks.length;
  const latestReworkComment = task.reworkRequested
    ? (getLatestReworkComment(taskId) ?? null)
    : null;
  const blockingFindingsSnapshot = task.reworkRequested
    ? formatAutoReviewStateForPrompt(task.autoReviewState)
    : "No persisted blocking findings snapshot.";
  const reworkBlockedReasonForPrompt = compactTextForPrompt(
    "REWORK_BLOCKED_REASON",
    task.blockedReason ?? "No blocked reason available.",
    PROMPT_SECTION_LIMITS.blockedReason,
  );
  const reviewCommentsForPrompt = compactTextForPrompt(
    "FULL_REVIEW_COMMENTS",
    task.reviewComments ?? "No review comments available.",
    PROMPT_SECTION_LIMITS.reviewComments,
  );
  const taskDescriptionForPrompt = compactTextForPrompt(
    "TASK_DESCRIPTION",
    task.description ?? "",
    PROMPT_SECTION_LIMITS.taskDescription,
  );
  const taskAttachmentsForPrompt = compactTextForPrompt(
    "TASK_ATTACHMENTS",
    formatAttachmentsForPrompt(task.attachments),
    PROMPT_SECTION_LIMITS.taskAttachments,
  );
  const roadmapArtifact = findRoadmapBatchArtifactByTaskId(taskId);
  const isAuditSynthesisTask = roadmapArtifact?.role === "synthesis";
  const expectedSynthesisArtifactPath = isAuditSynthesisTask ? roadmapArtifact.artifactPath : null;
  const expectedAuditReportArtifactPath =
    roadmapArtifact?.role === "report" ? roadmapArtifact.artifactPath : null;
  const auditEvidenceRepairMode = isAuditEvidenceRepairMode(task, expectedAuditReportArtifactPath);
  const auditSynthesisInputs = isAuditSynthesisTask
    ? readAuditSynthesisInputs(taskId, projectRoot)
    : { validatedArtifacts: [], weakArtifacts: [] };
  const validatedAuditArtifacts = auditSynthesisInputs.validatedArtifacts;
  const weakAuditArtifacts = auditSynthesisInputs.weakArtifacts;
  const validatedAuditSynthesisInput = formatValidatedAuditSynthesisInput(
    validatedAuditArtifacts,
    weakAuditArtifacts,
  );
  const currentAuditReportValidation =
    expectedAuditReportArtifactPath && task.reworkRequested
      ? validateExistingAuditReportArtifact({
          projectRoot,
          artifactPath: expectedAuditReportArtifactPath,
          taskDescription: task.description,
        })
      : null;
  const currentAuditReportIssueCodes =
    currentAuditReportValidation?.issues.map((issue) => issue.code) ?? [];
  const currentReportNeedsDeterministicRepair = currentAuditReportIssueCodes.some((code) =>
    /\b(?:contradictory_findings_and_no_findings|invalid_line_reference|missing_declared_scope_root|missing_report_file_references|missing_scope_coverage|missing_substantive_evidence|unverified_inspection_claim)\b/i.test(
      code,
    ),
  );

  if (selectedPlan && parsedTaskCount > 0 && pendingTaskCount === 0 && !task.reworkRequested) {
    const nowIso = new Date().toISOString();
    const noOpResult =
      "No pending tasks detected in plan (all tasks already completed). " +
      "Implementer skipped coordinator execution.";
    persistTaskPlanForTask({
      taskId,
      planText: selectedPlan,
      projectRoot,
      isFix: task.isFix,
      planPath: task.planPath,
      updatedAt: nowIso,
    });
    setTaskFields(taskId, {
      implementationLog: noOpResult,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    logActivity(taskId, "Agent", `${executionName} skipped — no pending tasks in plan`);
    log.info({ taskId }, "Implementer no-op: all plan tasks already completed");
    return;
  }

  if (
    expectedAuditReportArtifactPath &&
    task.reworkRequested &&
    currentAuditReportValidation?.ok &&
    reviewCommentsDeclareNoBlockingFindings(task.reviewComments) &&
    (task.autoReviewState?.findings.length ?? 0) === 0
  ) {
    const nowIso = new Date().toISOString();
    const resultText = [
      "Audit report evidence already valid before rework implementation; skipped runtime repair.",
      `Report artifact: ${expectedAuditReportArtifactPath}`,
    ].join("\n");
    setTaskFields(taskId, {
      implementationLog: resultText,
      reworkRequested: false,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    logActivity(
      taskId,
      "Agent",
      "Audit report evidence already valid before rework implementation",
    );
    log.info(
      { taskId, artifactPath: expectedAuditReportArtifactPath },
      "Audit report rework skipped because existing artifact already validates",
    );
    return;
  }

  log.info({ taskId, title: task.title, useSubagents }, "Starting implementation stage");

  if (expectedSynthesisArtifactPath && task.reworkRequested) {
    const nowIso = new Date().toISOString();
    const resultText = runDeterministicAuditSynthesisRework({
      task,
      projectRoot,
      artifactPath: expectedSynthesisArtifactPath,
      artifacts: validatedAuditArtifacts,
      weakArtifacts: weakAuditArtifacts,
    });
    setTaskFields(taskId, {
      implementationLog: resultText,
      reworkRequested: false,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    logActivity(taskId, "Agent", "Deterministic audit synthesis rework complete");
    log.info(
      { taskId, artifactPath: expectedSynthesisArtifactPath },
      "Audit synthesis rework completed deterministically",
    );
    return;
  }

  if (
    expectedAuditReportArtifactPath &&
    (auditEvidenceRepairMode || currentReportNeedsDeterministicRepair) &&
    shouldUseDeterministicAuditReportRepair(task, currentAuditReportIssueCodes)
  ) {
    const nowIso = new Date().toISOString();
    const resultText = runDeterministicAuditReportRepair({
      task,
      projectRoot,
      artifactPath: expectedAuditReportArtifactPath,
    });
    setTaskFields(taskId, {
      implementationLog: resultText,
      reworkRequested: false,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    logActivity(taskId, "Agent", "Deterministic audit report repair complete");
    log.info(
      { taskId, artifactPath: expectedAuditReportArtifactPath },
      "Audit report rework completed deterministically",
    );
    return;
  }

  const scopeConstraint = `IMPORTANT: Your working directory is ${projectRoot}
All files must be created and modified inside this directory. Do NOT create files outside of it.`;
  const implementSlashCommand = `/aif-implement ${planSection}`;

  const isRework = task.reworkRequested;

  // Rework header is surfaced loudly so the model cannot miss that this is
  // a reopened task with an explicit human/agent rework comment.
  const reworkHeaderBlock = isRework
    ? `================================================
  REWORK REQUEST — THIS IS THE PRIMARY TASK
================================================

You are addressing a REWORK REQUEST on a previously-completed task. The rework comment below is your PRIMARY instruction — it supersedes the checklist state of the plan. The task was previously marked DONE, but the reviewer is NOT satisfied and has requested changes. Address EXACTLY the request below. Do not re-do previously completed work unless the request explicitly asks for it.

<<<REWORK_COMMENT
${formatReworkCommentForPrompt(latestReworkComment)}
REWORK_COMMENT

<<<REWORK_BLOCKED_REASON
${reworkBlockedReasonForPrompt}
REWORK_BLOCKED_REASON

<<<FULL_REVIEW_COMMENTS
${reviewCommentsForPrompt}
FULL_REVIEW_COMMENTS

<<<BLOCKING_FINDINGS_SNAPSHOT
${blockingFindingsSnapshot}
BLOCKING_FINDINGS_SNAPSHOT

================================================
`
    : "";

  const reworkProtocolBlock = isRework
    ? `

Rework handling protocol:
1) FIRST, restate the rework request in your own words (1-2 sentences) so it's clear you understood it. Reference specific files, functions, or plan items mentioned in the request.
2) Identify which files in the codebase and/or plan items need to change to satisfy the request.
3) Make the minimal set of changes required. Do NOT refactor unrelated code.
4) If the rework request cannot be satisfied (e.g. it asks for something impossible or contradicts an earlier decision), say so EXPLICITLY in the final result text — do not silently skip it or claim "already done".
5) If the plan checklist shows all items completed, do not interpret that as "nothing to do" — the rework comment is the source of truth for this run.
6) Treat REWORK_BLOCKED_REASON as actionable guard feedback. If it names invalid or missing report references, edit the report artifact to remove or replace those exact references before closing.
7) If REWORK_BLOCKED_REASON says invalid_or_missing_file_references, you MUST remove every exact bad reference token named there from the report artifact. Do not only describe the change in your final answer. Use repository tools to read the report, write the corrected report, run a command or read-back check proving the bad tokens are absent, git add/commit the report artifact, and verify with git log -1 --name-only --oneline.
8) In diagnostic audit/report tasks, every Evidence reference must be an existing file under the project root with a concrete line or line range. Do not cite directories such as src:1-2 or src/bot_intevra:1-20; cite specific files instead.
9) If REWORK_BLOCKED_REASON says low_quality_report_evidence, remove every placeholder, speculative claim, and fake command output from the report artifact. Replace it with exact output from tools you actually ran, or remove the finding.
10) If the exact invalid tokens from REWORK_BLOCKED_REASON still appear in the report artifact, the rework is not complete. Continue editing until they are gone or explicitly report why the report cannot be corrected.
11) In the final result text, explicitly list which blocking finding IDs from BLOCKING_FINDINGS_SNAPSHOT were addressed and which IDs remain unresolved, and include the git log verification for any report artifact commit.`
    : "";

  const reworkSystemAppend = isRework
    ? `\n\nREWORK MODE: A previously-completed task has been reopened. The rework comment inside the prompt is the primary instruction. Do not treat a fully-checked plan as 'nothing to do'.${
        auditEvidenceRepairMode
          ? "\nAUDIT EVIDENCE REPAIR MODE: repair the report artifact from observed repository evidence before closing."
          : ""
      }`
    : "";

  const effectiveSystemAppend = `${scopeConstraint}${reworkSystemAppend}`;

  // For coordinator mode the rework header goes at the very top of the prompt
  // so it cannot be buried below the lead line. For skill mode we keep the
  // slash command on the first line so Claude Code still expands it, and
  // surface the rework header inside the body instead.
  const topReworkHeader = useSubagents ? reworkHeaderBlock : "";
  const bodyReworkHeader = useSubagents ? "" : reworkHeaderBlock;
  const auditEvidenceRepairBlock = auditEvidenceRepairMode
    ? `Audit evidence repair mode:
- The completion evidence guard has seen repeated weak audit evidence. This run is a focused report repair, not normal implementation.
- Edit only the expected audit report artifact: ${expectedAuditReportArtifactPath}. Do not edit source, config, test, dependency, or runtime files.
- Rebuild the report from observed evidence. Remove speculative claims, placeholder command output, "could not read", "would show", "likely", "may contain", and any fake commit hashes or synthetic tool output.
- Add an "Evidence Register" section near the top with a markdown table: ID | Claim | Evidence | Verification. Each row must tie one claim to concrete existing repository file references such as \`path/to/file.ext:line\` and/or exact command output you actually observed.
- Every finding kept in the report must include these labels: Evidence:, Risk:, Proposed fix:, Verification:. Evidence must include concrete existing file:line references. Verification must name the exact command or tool used and paste the observed output or a concise exact excerpt.
- Do not preserve review-rejected findings. If FULL_REVIEW_COMMENTS or BLOCKING_FINDINGS_SNAPSHOT says a finding is governance/documentation-only, non-actionable, speculative, or based on fake git output, delete that finding entirely instead of rephrasing it.
- If all existing findings are rejected by that filter, rewrite the report as "No validated findings" with an Evidence Register that lists the scoped files and exact commands checked. This is better than inventing weak findings.
- If a scoped file is large, inspect it with targeted commands such as \`rg -n\`, \`nl -ba | sed -n\`, \`head\`, or \`tail\`; do not write that it was too large or inaccessible unless a real command proves that limitation.
- If no actionable finding survives this evidence check, write "No validated findings" and keep the Evidence Register with the files and commands checked.
- Before closing, run exactly one bounded report-only git transaction: self-check ${expectedAuditReportArtifactPath}, stage only ${expectedAuditReportArtifactPath}, commit only that artifact if it changed, then verify with \`git log -1 --name-only --oneline -- ${expectedAuditReportArtifactPath}\`.
- Never type an example git hash into the report. The only acceptable git hash text is exact output from the git tool/command you just ran. If you cannot observe the git output, do not include a Git Verification block in the report; state the unresolved verification gap in the final result instead.
- Do not create repeated empty commits. If there are no report changes to commit, record \`git status --short -- ${expectedAuditReportArtifactPath}\` and \`git log -1 --name-only --oneline -- ${expectedAuditReportArtifactPath}\`, then stop.
`
    : "";

  const rawPrompt = `${topReworkHeader}${useSubagents ? "Implement the task using the provided plan." : implementSlashCommand}

${scopeConstraint}

${bodyReworkHeader}Title: ${task.title}
Task intent contract:
${formatTaskIntentContractForPrompt(task.taskIntent)}

Description: ${taskDescriptionForPrompt}
Task attachments:
${taskAttachmentsForPrompt}

Validated audit batch inputs:
<<<VALIDATED_AUDIT_BATCH_INPUTS
${validatedAuditSynthesisInput}
VALIDATED_AUDIT_BATCH_INPUTS

${
  expectedSynthesisArtifactPath
    ? `Audit synthesis mode:
- Use VALIDATED_AUDIT_BATCH_INPUTS as the source of truth. Do not synthesize from unrelated repository files or old report-like files.
- Validated report artifacts may contribute audit findings. Weak or invalid report artifacts may only be summarized in a Weak/Invalid Reports section as coverage gaps with their state and failure reason.
- Write only the expected synthesis artifact: ${expectedSynthesisArtifactPath}.
- For each summarized finding, cite the concrete repository path+line evidence contained in the validated source reports. Mention source report artifact names only as provenance, not as the only Evidence reference.
- After writing ${expectedSynthesisArtifactPath}, use git_status and git_commit for that artifact, then verify with git log -1 --name-only --oneline.
- Do not repeat identical ls/pwd/status checks. Once the artifact is written and committed, stop using tools and return the concise result.
`
    : ""
}

Plan path:
${planSection}

${isRework ? "Rework mode: true (requested from done/request_changes)." : "Rework mode: false."}

${auditEvidenceRepairBlock}

Execution rules:
- Respect task dependencies and checklist state from the plan file.
- Keep plan checklist state accurate while implementing.
- Run tests/lint/verification relevant to the changes.
- For diagnostic-only audit/review/discovery/validation plans that produce a report artifact, do not edit source/config/test files; write the report with concrete existing file \`path:line\` evidence, \`Risk:\`, \`Proposed fix:\`, and \`Verification: Command ... output ...\` markers, then commit the report artifact on the current task branch and verify it with \`git log -1 --name-only --oneline\`.
- Audit findings must be actionable technical-quality defects, regressions, unsafe operational assumptions, or clearly owned remediation items. Do not count inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, or speculative may/might/could claims as findings.
- If no actionable finding is found, write "No validated findings" and include checked files and commands with observed outputs instead of inventing weak findings.
- Audit report verification must be observed, not invented. Paste only command output or tool results you actually obtained. Never use placeholders such as \`123abc\`, \`1234567890abcdef\`, \`Your Name <your.email@example.com>\`, synthetic commit metadata, or generic text like \`All tests passed\` unless that exact output came from a tool.
- If a scoped file is large, inspect it with targeted tools such as \`rg -n\`, \`nl -ba | sed -n\`, \`head\`, or \`tail\`; do not write "too large to read", "would show", "likely", or "may contain" as evidence. If you cannot inspect an area, record it as an explicit audit limitation, not as a finding.
- If you claim a file or directory is missing, verify it with a real command first and include the exact output. Do not claim missing paths when \`git ls-files\`, \`ls\`, or \`test -e\` shows they exist.
- Do not loop on \`git_commit\`. For diagnostic audit/report work, make one bounded report-only commit attempt after writing the report artifact; stage only the report artifact, never broad-stage unrelated changes. If it reports no changes or the artifact is already committed, run \`git_status\` and \`git log -1 --name-only --oneline\`, record the observed result, then stop using tools and return.
- Before closing diagnostic audit/report work, verify every cited repository path exists under the project root. Replace directory references, nonexistent paths, and placeholders with concrete existing file references and line numbers.
- When VALIDATED_AUDIT_BATCH_INPUTS contains report artifacts, use those exact validated report contents as the synthesis source of truth; do not synthesize from unvalidated report-like files.
- IMPORTANT: The plan file is ${effectivePlanPath}. Always read from and annotate this exact file — do not create plan files at other paths.${reworkProtocolBlock}`;
  const promptBudget = compactImplementerPromptToBudget(rawPrompt);
  const prompt = promptBudget.prompt;
  if (promptBudget.compacted) {
    log.warn(
      {
        taskId,
        originalEstimatedTokens: promptBudget.originalEstimatedTokens,
        estimatedTokens: promptBudget.estimatedTokens,
        tokenBudget: IMPLEMENT_COORDINATOR_INPUT_TOKEN_BUDGET,
        promptLength: prompt.length,
      },
      "Compacted implementer prompt to stay within input token budget",
    );
  }
  const workflowSpec = createRuntimeWorkflowSpec({
    workflowKind: "implementer",
    prompt,
    requiredCapabilities: useSubagents
      ? ["supportsAgentDefinitions", "supportsRepositoryTools"]
      : ["supportsRepositoryTools"],
    agentDefinitionName: useSubagents ? AGENT_NAME : undefined,
    fallbackSlashCommand: implementSlashCommand,
    fallbackStrategy: useSubagents ? "slash_command" : "none",
    // Rework must always start a fresh session — resuming an old thread
    // leads Claude to treat the completed work as authoritative and ignore
    // the new rework request.
    sessionReusePolicy: isRework ? "never" : "resume_if_available",
    systemPromptAppend: effectiveSystemAppend,
    metadata: {
      reworkRequested: task.reworkRequested,
      skipReview: task.skipReview ?? false,
    },
  });

  const { resultText } = await executeSubagentQuery({
    taskId,
    projectRoot,
    agentName: executionName,
    prompt,
    maxBudgetUsd: implementerBudget,
    agent: useSubagents ? AGENT_NAME : undefined,
    skipReview: task.skipReview ?? false,
    workflowSpec,
    workflowKind: "implementer",
    fallbackSlashCommand: implementSlashCommand,
  });

  // Post-run drift check: if the subagent switched branches during execution
  // (e.g. a rogue skill ran `git checkout` or plan-polisher followed legacy
  // Step 1.4), we MUST block before persisting plan/log — otherwise we
  // attribute diffs from a different branch to this task.
  if (task.branchName && !task.isFix) {
    assertCurrentBranch(projectRoot, task.branchName);
  }

  let finalResultText = resultText;

  if (isBlockedImplementationResult(resultText)) {
    throw new Error("Implementer blocked by permissions");
  }

  let syncedPlan = readCanonicalPlan(task, projectRoot) ?? task.plan;
  let checklistAutoSynced = false;
  const checklistBeforeSync = getChecklistProgress(syncedPlan);

  if (
    syncedPlan &&
    checklistBeforeSync.parsedTaskCount > 0 &&
    checklistBeforeSync.pendingTaskCount > 0
  ) {
    const repairedPlan = await runChecklistSyncQuery({
      task,
      projectRoot,
      planText: syncedPlan,
      implementationResult: finalResultText,
    });
    if (looksLikeFullPlanUpdate(syncedPlan, repairedPlan)) {
      syncedPlan = repairedPlan;
      checklistAutoSynced = true;
    } else {
      log.warn(
        { taskId },
        "Checklist auto-sync returned non-plan-like response, keeping original plan",
      );
    }
  }

  // Second post-run drift check: `runChecklistSyncQuery` itself spawns a
  // subagent. Even if the main implementer ended on the right HEAD, the sync
  // pass can switch branches mid-flow. Re-assert before persisting plan/log.
  if (task.branchName && !task.isFix) {
    assertCurrentBranch(projectRoot, task.branchName);
  }

  const checklistAfterSync = getChecklistProgress(syncedPlan);
  const checklistWarning =
    syncedPlan && checklistAfterSync.parsedTaskCount > 0 && checklistAfterSync.pendingTaskCount > 0
      ? `[warning] Checklist remains incomplete after auto-sync: ${checklistAfterSync.pendingTaskCount} pending task(s).`
      : null;
  if (checklistWarning) {
    log.warn(
      { taskId, pendingTaskCount: checklistAfterSync.pendingTaskCount },
      "Checklist remains incomplete after auto-sync; continuing without blocking",
    );
  }

  const finalResultNotes: string[] = [];
  if (checklistAutoSynced) {
    finalResultNotes.push("[note] Plan checklist auto-synced after implementation.");
  }
  if (checklistWarning) {
    finalResultNotes.push(checklistWarning);
  }
  const enrichedResult =
    finalResultNotes.length > 0
      ? `${finalResultText}\n\n${finalResultNotes.join("\n")}`
      : finalResultText;

  const nowIso = new Date().toISOString();
  if (syncedPlan) {
    persistTaskPlanForTask({
      taskId,
      planText: syncedPlan,
      projectRoot,
      isFix: task.isFix,
      planPath: task.planPath,
      updatedAt: nowIso,
    });
  }

  setTaskFields(taskId, {
    implementationLog: enrichedResult,
    reworkRequested: false,
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });

  log.debug({ taskId }, "Implementation log saved to task");
}
