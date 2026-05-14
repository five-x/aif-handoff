import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import {
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  getLatestReworkComment,
  listAuditEvidenceEvents,
  listRoadmapReportArtifactsForSynthesis,
  persistTaskPlanForTask,
  setTaskFields,
  summarizeRoadmapBatch,
  updateRoadmapBatchArtifactState,
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
  buildAuditEvidencePayload,
  classifyAuditSourceEvidence,
  classifyAuditSynthesisSourceReports,
  computeAuditReportContentSha256,
  extractAuditSynthesisCommandEvidence,
  formatAuditSynthesisOutcomeForArtifact,
  resolveAuditPlanId,
  type AutoReviewState,
  type AuditEvidenceUnit,
  type AuditSourceClassification,
  type AuditReportSourceSnapshot,
} from "@aif/shared";
import { createRuntimeWorkflowSpec } from "@aif/runtime";
import { logActivity, persistAuditEvidencePayload } from "../hooks.js";
import { executeSubagentQuery } from "../subagentQuery.js";
import { computePendingPlanLayers, computePlanLayers } from "../planLayers.js";
import { assertCurrentBranch, restorePersistedBranch } from "../gitBranch.js";
import { buildTaskMemoryContext } from "../memoryContext.js";

const log = logger("implementer");
const AGENT_NAME = "implement-coordinator";
// Keep user prompt below the 27K prompt-token envelope so Qwen profiles with
// max_tokens=5000 still have room for system text and tool schemas in 32K ctx.
const IMPLEMENT_COORDINATOR_INPUT_TOKEN_BUDGET = 26_000;
const PROMPT_BUDGET_CHARS_PER_TOKEN = 3;
const IMPLEMENT_COORDINATOR_CHAR_BUDGET =
  IMPLEMENT_COORDINATOR_INPUT_TOKEN_BUDGET * PROMPT_BUDGET_CHARS_PER_TOKEN;
const DETERMINISTIC_SYNTHESIS_NO_FINDINGS_RISK_ID = "risk-deterministic-synthesis-no-findings";
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

function formatMarkdownTableCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|").trim();
  return normalized.length > 0 ? normalized : "none";
}

function weakAuditArtifactStatus(artifact: WeakAuditArtifactSummary): "failed" | "inconclusive" {
  return artifact.state === "source_inconclusive" ||
    artifact.state === "terminal_inconclusive" ||
    artifact.state === "manual_exception"
    ? "inconclusive"
    : "failed";
}

function buildAuditChildReportStatusSection(
  sourceSummaries: AuditSourceReportSummary[],
  weakArtifacts: WeakAuditArtifactSummary[],
): string[] {
  const rows = [
    ...sourceSummaries.map((summary) => ({
      artifactPath: summary.artifact.artifactPath,
      taskId: summary.artifact.taskId,
      status: "passed",
      notes: `included findings: ${summary.includedFindings.length}; omitted findings: ${summary.omittedFindingCount}`,
    })),
    ...weakArtifacts.map((artifact) => ({
      artifactPath: artifact.artifactPath,
      taskId: artifact.taskId,
      status: weakAuditArtifactStatus(artifact),
      notes: `state: ${artifact.state}; failure family: ${artifact.failureFamily ?? "none"}`,
    })),
  ];

  if (rows.length === 0) {
    return ["## Child Report Status", "", "- No child report artifacts were available.", ""];
  }

  return [
    "## Child Report Status",
    "",
    "| Source report | Task | Status | Notes |",
    "| --- | --- | --- | --- |",
    ...rows.map((row) => {
      return `| \`${formatMarkdownTableCell(row.artifactPath)}\` | \`${formatMarkdownTableCell(
        row.taskId,
      )}\` | ${row.status} | ${formatMarkdownTableCell(row.notes)} |`;
    }),
    "",
  ];
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
    /\b(?:audit_evidence_|contradictory_findings_and_no_findings|invalid_or_missing_file_references|invalid_report_manifest|manifest_|missing_audit_evidence_ref|missing_report_file_references|missing_report_manifest|missing_report_manifest_fields|missing_scope_coverage|missing_substantive_evidence|unsupported_report_manifest_version|unverified_inspection_claim|low_quality_report_evidence|insufficient_report_evidence)\b/i;
  const deterministicReportIssuePattern =
    /\b(?:audit_evidence_|contradictory_findings_and_no_findings|invalid_line_reference|invalid_report_manifest|manifest_|missing_audit_evidence_ref|missing_declared_scope_root|missing_report_file_references|missing_report_manifest|missing_report_manifest_fields|missing_scope_coverage|missing_substantive_evidence|unsupported_report_manifest_version|unverified_inspection_claim)\b/i;
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

function hasAttemptedDeterministicAuditReportRepair(
  task: Pick<TaskRow, "implementationLog" | "agentActivityLog">,
): boolean {
  const text = [task.implementationLog ?? "", task.agentActivityLog ?? ""].join("\n");
  return /\bDeterministic audit report repair (?:completed|complete)\b/i.test(text);
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

const AUDIT_REPAIR_IGNORED_DIRS = new Set([
  ".git",
  ".agents",
  ".ai-factory",
  ".claude",
  ".codex",
  ".github",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "__pycache__",
]);
const AUDIT_REPAIR_IGNORED_FILE_EXTENSIONS = new Set([
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
const AUDIT_REPAIR_OUTPUT_LINE_LIMIT = 24;

interface GitCaptureResult {
  args: string[];
  command: string;
  exitCode: number;
  output: string;
}

interface AuditRepairEvidenceByRoot {
  root: string;
  files: string[];
  command: GitCaptureResult;
  evidenceUnit: AuditEvidenceUnit | null;
}

interface AuditRepairRiskHypothesis {
  id: string;
  description: string;
  scopeIds: string[];
  terms: string[];
}

interface AuditRepairRiskEvidence {
  riskId: string;
  root: string;
  files: string[];
  terms: string[];
  command: GitCaptureResult;
  evidenceUnit: AuditEvidenceUnit | null;
}

type AuditReportRepairOutcome = "validated_no_findings" | "source_inconclusive";

interface AuditReportRepairDecision {
  outcome: AuditReportRepairOutcome;
  reasons: string[];
  riskHypotheses: AuditRepairRiskHypothesis[];
}

const AUDIT_REPAIR_HIDDEN_TOOLING_ROOTS = new Set([
  ".agents",
  ".ai-factory",
  ".claude",
  ".codex",
  ".github",
]);

function isAuditRepairIgnoredFile(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.includes("/.git/") || lower.includes("/__pycache__/")) return true;
  if (/(^|\/)\.env(?:\.|$)/i.test(path)) return true;
  return [...AUDIT_REPAIR_IGNORED_FILE_EXTENSIONS].some((extension) => lower.endsWith(extension));
}

function auditRepairPathSegments(path: string): string[] {
  return path.replaceAll("\\", "/").split("/").filter(Boolean);
}

function isAuditRepairHiddenToolingPath(path: string): boolean {
  return auditRepairPathSegments(path).some((segment) =>
    AUDIT_REPAIR_HIDDEN_TOOLING_ROOTS.has(segment),
  );
}

function isExplicitHiddenAuditScopeRoot(scopeRoot: string): boolean {
  const firstSegment = auditRepairPathSegments(scopeRoot)[0];
  return Boolean(firstSegment && AUDIT_REPAIR_HIDDEN_TOOLING_ROOTS.has(firstSegment));
}

function fileHasLineEvidence(projectRoot: string, path: string): boolean {
  try {
    const content = readFileSync(resolve(projectRoot, path), "utf8");
    return content.split(/\r?\n/).some((line) => line.trim().length > 0);
  } catch {
    return false;
  }
}

function collectAuditRepairEvidenceFiles(
  projectRoot: string,
  scopeRoot: string,
  limit = 3,
): string[] {
  const allowHiddenTooling = isExplicitHiddenAuditScopeRoot(scopeRoot);
  const absPath = resolve(projectRoot, scopeRoot);
  if (!existsSync(absPath)) return [];
  const stat = statSync(absPath);
  if (stat.isFile()) {
    return allowHiddenTooling || !isAuditRepairHiddenToolingPath(scopeRoot) ? [scopeRoot] : [];
  }
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
        const relativePath = child
          .replace(projectRoot, "")
          .replace(/^[/\\]+/, "")
          .replaceAll("\\", "/");
        if (
          isAuditRepairIgnoredFile(relativePath) ||
          (!allowHiddenTooling && isAuditRepairHiddenToolingPath(relativePath)) ||
          !fileHasLineEvidence(projectRoot, relativePath)
        ) {
          continue;
        }
        files.push(relativePath);
      }
    }
  };
  visit(absPath);
  return files;
}

const AUDIT_REPAIR_RISK_STOPWORDS = new Set([
  "audit",
  "evidence",
  "finding",
  "hypothesis",
  "hypotheses",
  "missing",
  "product",
  "report",
  "risk",
  "scope",
  "source",
  "technical",
  "validated",
  "verification",
]);

function deriveAuditRepairRiskTerms(description: string, roots: string[]): string[] {
  const rootTerms = new Set(
    roots.flatMap((root) =>
      auditRepairPathSegments(root)
        .map((segment) => segment.toLowerCase())
        .filter(Boolean),
    ),
  );
  const terms = new Set<string>();
  for (const match of description.matchAll(/[A-Za-z][A-Za-z0-9_-]{3,}/g)) {
    const term = match[0].toLowerCase();
    if (term.startsWith("risk-")) continue;
    if (AUDIT_REPAIR_RISK_STOPWORDS.has(term)) continue;
    if (rootTerms.has(term)) continue;
    terms.add(term);
  }
  return [...terms].slice(0, 6);
}

function parseAuditRiskHypotheses(
  description: string | null,
  roots: string[],
): AuditRepairRiskHypothesis[] {
  if (!description) return [];
  const lines = description.split(/\r?\n/);
  const riskLines: string[] = [];
  let inRiskSection = false;
  for (const line of lines) {
    if (/^\s*(?:[-*]\s*)?Risk hypotheses\s*:/i.test(line)) {
      inRiskSection = true;
      const inline = line.replace(/^\s*(?:[-*]\s*)?Risk hypotheses\s*:\s*/i, "").trim();
      if (inline) riskLines.push(inline);
      continue;
    }
    if (inRiskSection && /^\s*(?:[-*]\s*)?[A-Z][A-Za-z ]+\s*:/i.test(line)) break;
    if (inRiskSection && line.trim()) riskLines.push(line);
  }

  const sourceLines =
    riskLines.length > 0 ? riskLines : lines.filter((line) => /\brisk-[\w-]+\b/i.test(line));
  const risks = new Map<string, AuditRepairRiskHypothesis>();
  for (const line of sourceLines) {
    const id = line.match(/\brisk-[\w-]+\b/i)?.[0].toLowerCase();
    if (!id || risks.has(id)) continue;
    const descriptionText = line
      .replace(/^\s*[-*]\s*/, "")
      .replace(new RegExp(`^${id}\\s*[:\\-]?\\s*`, "i"), "")
      .trim();
    const lowered = line.toLowerCase();
    const scopeIds = roots.filter((root) => lowered.includes(root.toLowerCase()));
    risks.set(id, {
      id,
      description: descriptionText || line.trim(),
      scopeIds,
      terms: deriveAuditRepairRiskTerms(line, roots),
    });
  }
  return [...risks.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function buildAuditRepairRiskPattern(terms: string[]): string | null {
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  return escaped.length > 0 ? escaped.join("|") : null;
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value)
    ? value
    : `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function boundedCommandOutput(output: string): string {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length <= AUDIT_REPAIR_OUTPUT_LINE_LIMIT) return lines.join("\n");
  return [
    ...lines.slice(0, AUDIT_REPAIR_OUTPUT_LINE_LIMIT),
    `[... truncated ${lines.length - AUDIT_REPAIR_OUTPUT_LINE_LIMIT} additional line(s) ...]`,
  ].join("\n");
}

function runGitCapture(projectRoot: string, args: string[]): GitCaptureResult {
  let exitCode = 0;
  let output = "";
  try {
    output = execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    exitCode =
      err &&
      typeof err === "object" &&
      "status" in err &&
      Number.isInteger((err as { status?: unknown }).status)
        ? Number((err as { status?: unknown }).status)
        : 1;
    const stdout =
      err && typeof err === "object" && "stdout" in err
        ? String((err as { stdout?: unknown }).stdout ?? "")
        : "";
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr?: unknown }).stderr ?? "")
        : "";
    output = stdout || stderr;
  }
  return {
    args,
    command: `git ${args.map(shellQuote).join(" ")}`,
    exitCode,
    output: boundedCommandOutput(output || "command produced no output"),
  };
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

function currentAuditReportSourceSnapshot(projectRoot: string): AuditReportSourceSnapshot {
  const commit = runGitText(projectRoot, ["rev-parse", "HEAD"]);
  const tree = runGitText(projectRoot, ["rev-parse", "HEAD^{tree}"]);
  const branch = runGitText(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    id: commit && tree ? `git:${commit}:${tree}` : `workspace:${projectRoot}`,
    commit,
    tree,
    branch: branch && branch !== "HEAD" ? branch : null,
    dirty: false,
  };
}

function firstAuditRepairOutputLine(output: string): string {
  return output.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "<empty>";
}

function buildAuditReportManifest(input: {
  task: TaskRow;
  artifactPath: string;
  snapshot: AuditReportSourceSnapshot;
  body: string;
  roots: string[];
  evidenceByRoot: AuditRepairEvidenceByRoot[];
  riskEvidence: AuditRepairRiskEvidence[];
  decision: AuditReportRepairDecision;
}): Record<string, unknown> {
  const artifact = findRoadmapBatchArtifactByTaskId(input.task.id);
  const evidenceRefs = [
    ...input.evidenceByRoot.flatMap((entry) => (entry.evidenceUnit ? [entry.evidenceUnit.id] : [])),
    ...input.riskEvidence.flatMap((entry) => (entry.evidenceUnit ? [entry.evidenceUnit.id] : [])),
  ].sort();
  const scopeCoverage = input.evidenceByRoot.map((entry) => ({
    root: entry.root,
    covered:
      entry.files.length > 0 &&
      (Boolean(entry.evidenceUnit) ||
        input.riskEvidence.some(
          (riskEntry) => riskEntry.root === entry.root && riskEntry.evidenceUnit,
        )),
    evidenceRefs: [
      ...(entry.evidenceUnit ? [entry.evidenceUnit.id] : []),
      ...input.riskEvidence
        .filter((riskEntry) => riskEntry.root === entry.root && riskEntry.evidenceUnit)
        .map((riskEntry) => riskEntry.evidenceUnit?.id)
        .filter((id): id is string => Boolean(id)),
    ].sort(),
  }));
  const noFindingsClaims =
    input.decision.outcome === "validated_no_findings"
      ? [
          {
            id: "nf-deterministic-repair",
            scopeIds: input.roots,
            evidenceRefs,
            riskIds: input.decision.riskHypotheses.map((risk) => risk.id),
            reasoning:
              "Deterministic repair used risk-specific scoped source inspections and removed unvalidated candidate findings.",
          },
        ]
      : [];
  return {
    version: 1,
    auditPlanId: resolveAuditPlanId({
      taskId: input.task.id,
      roadmapBatchId: artifact?.batchId ?? null,
    }),
    taskId: input.task.id,
    ...(artifact?.batchId ? { batchId: artifact.batchId } : {}),
    ...(artifact?.roadmapAlias || input.task.roadmapAlias
      ? { roadmapAlias: artifact?.roadmapAlias ?? input.task.roadmapAlias }
      : {}),
    artifactPath: input.artifactPath,
    contentSha256: computeAuditReportContentSha256(input.body),
    sourceSnapshot: input.snapshot,
    outcome: input.decision.outcome,
    scopeCoverage,
    riskHypotheses: input.decision.riskHypotheses.map((risk) => ({
      id: risk.id,
      description: risk.description,
      scopeIds: risk.scopeIds,
      evidenceRefs: input.riskEvidence
        .filter((entry) => entry.riskId === risk.id && entry.evidenceUnit)
        .map((entry) => entry.evidenceUnit?.id)
        .filter((id): id is string => Boolean(id))
        .sort(),
      status: input.decision.outcome === "validated_no_findings" ? "covered" : "inconclusive",
    })),
    findings: [],
    noFindingsClaims,
    evidenceRefs,
  };
}

function buildAuditSynthesisManifest(input: {
  task: TaskRow;
  artifactPath: string;
  snapshot: AuditReportSourceSnapshot;
  body: string;
  sourceArtifacts: ValidatedAuditArtifactContent[];
  weakArtifacts: WeakAuditArtifactSummary[];
  evidenceUnit: AuditEvidenceUnit | null;
  outcome: AuditSourceClassification;
}): Record<string, unknown> {
  const artifact = findRoadmapBatchArtifactByTaskId(input.task.id);
  const evidenceRefs = input.evidenceUnit ? [input.evidenceUnit.id] : [];
  const sourceArtifactPaths = input.sourceArtifacts
    .map((entry) => entry.artifactPath)
    .filter(Boolean)
    .sort();
  const scopeRoots =
    sourceArtifactPaths.length > 0
      ? sourceArtifactPaths
      : [input.artifactPath, ...input.weakArtifacts.map((entry) => entry.artifactPath)].sort();
  const findings =
    input.outcome === "validated_findings_present"
      ? splitAuditFindingSections(input.body).map((section, index) => ({
          id: `finding-${index + 1}`,
          evidenceRefs,
          summary: section.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "Finding",
        }))
      : [];
  const noFindingsClaims =
    input.outcome === "validated_no_findings"
      ? [
          {
            id: "nf-deterministic-synthesis",
            scopeIds: scopeRoots,
            evidenceRefs,
            riskIds: [DETERMINISTIC_SYNTHESIS_NO_FINDINGS_RISK_ID],
            reasoning:
              "Deterministic synthesis used only already-validated source audit reports and preserved substantive no-findings evidence.",
          },
        ]
      : [];
  const riskHypotheses =
    input.outcome === "validated_no_findings"
      ? [
          {
            id: DETERMINISTIC_SYNTHESIS_NO_FINDINGS_RISK_ID,
            description:
              "Trusted source audit reports contain no validated findings that survived deterministic synthesis.",
            scopeIds: scopeRoots,
            evidenceRefs,
            status: "covered",
          },
        ]
      : [];

  return {
    version: 1,
    auditPlanId: resolveAuditPlanId({
      taskId: input.task.id,
      roadmapBatchId: artifact?.batchId ?? null,
    }),
    taskId: input.task.id,
    ...(artifact?.batchId ? { batchId: artifact.batchId } : {}),
    ...(artifact?.roadmapAlias || input.task.roadmapAlias
      ? { roadmapAlias: artifact?.roadmapAlias ?? input.task.roadmapAlias }
      : {}),
    artifactPath: input.artifactPath,
    contentSha256: computeAuditReportContentSha256(input.body),
    sourceSnapshot: input.snapshot,
    outcome: input.outcome,
    scopeCoverage: scopeRoots.map((root) => ({
      root,
      covered: Boolean(input.evidenceUnit),
      evidenceRefs,
    })),
    riskHypotheses,
    findings,
    noFindingsClaims,
    evidenceRefs,
  };
}

function buildDeterministicAuditReportRepairContent(input: {
  task: TaskRow;
  projectRoot: string;
  artifactPath: string;
}): {
  content: string;
  body: string;
  sourceSnapshot: AuditReportSourceSnapshot;
  decision: AuditReportRepairDecision;
} {
  const scopeRoots = parseAuditScopeRoots(input.task.description);
  const roots = scopeRoots;
  const riskHypotheses = parseAuditRiskHypotheses(input.task.description, roots);
  const sourceSnapshot = currentAuditReportSourceSnapshot(input.projectRoot);
  const evidenceByRoot = roots.map((root) => {
    const files = collectAuditRepairEvidenceFiles(input.projectRoot, root);
    const inspectionTargets = files.slice(0, 3);
    const gitArgs =
      inspectionTargets.length > 0
        ? ["grep", "-n", "-m", "5", ".", "--", ...inspectionTargets]
        : ["grep", "-n", "-m", "5", ".", "--", root];
    const command = runGitCapture(input.projectRoot, gitArgs);
    const evidenceUnit = persistAuditEvidencePayload(
      input.task.id,
      input.projectRoot,
      buildAuditEvidencePayload({
        toolName: "deterministic_audit_report_repair",
        evidenceKind: "shell_command",
        evidenceGrade: "substantive",
        scopeIds: [root],
        paths: inspectionTargets,
        command: command.command,
        exitCode: command.exitCode,
        output: command.output,
        maxPreviewChars: 2_000,
      }),
    );
    return {
      root,
      files,
      command,
      evidenceUnit,
    };
  });
  const riskEvidence = riskHypotheses.flatMap((risk) =>
    risk.scopeIds.map((root) => {
      const files =
        evidenceByRoot.find((entry) => entry.root === root)?.files.slice(0, 3) ??
        collectAuditRepairEvidenceFiles(input.projectRoot, root);
      const pattern = buildAuditRepairRiskPattern(risk.terms);
      const command =
        pattern && files.length > 0
          ? runGitCapture(input.projectRoot, [
              "grep",
              "-n",
              "-m",
              "5",
              "-E",
              pattern,
              "--",
              ...files,
            ])
          : {
              args: [],
              command: "risk-specific grep skipped because no risk terms were parsed",
              exitCode: 1,
              output:
                files.length === 0
                  ? "No scoped files were available for risk-specific deterministic repair."
                  : "No risk-specific terms were parsed for deterministic repair.",
            };
      const hasSubstantiveRiskEvidence =
        files.length > 0 &&
        pattern !== null &&
        command.exitCode === 0 &&
        command.output.trim().length > 0;
      const evidenceUnit = hasSubstantiveRiskEvidence
        ? persistAuditEvidencePayload(
            input.task.id,
            input.projectRoot,
            buildAuditEvidencePayload({
              toolName: "deterministic_audit_report_repair",
              evidenceKind: "shell_command",
              evidenceGrade: "substantive",
              scopeIds: [root],
              riskHypothesisIds: [risk.id],
              paths: files,
              command: command.command,
              exitCode: command.exitCode,
              output: command.output,
              maxPreviewChars: 2_000,
            }),
          )
        : null;
      return {
        riskId: risk.id,
        root,
        files,
        terms: risk.terms,
        command,
        evidenceUnit,
      };
    }),
  );
  const decisionReasons: string[] = [];
  if (roots.length === 0) decisionReasons.push("No concrete audit scope roots were parsed.");
  if (riskHypotheses.length === 0) {
    decisionReasons.push("No risk hypotheses were parsed from the task description.");
  }
  for (const risk of riskHypotheses) {
    if (risk.scopeIds.length === 0) {
      decisionReasons.push(`Risk ${risk.id} does not reference a declared scope root.`);
      continue;
    }
    const hasBoundEvidence = riskEvidence.some(
      (entry) => entry.riskId === risk.id && entry.evidenceUnit !== null,
    );
    if (!hasBoundEvidence) {
      decisionReasons.push(`Risk ${risk.id} has no bound risk-specific substantive evidence.`);
    }
  }
  const decision: AuditReportRepairDecision = {
    outcome: decisionReasons.length === 0 ? "validated_no_findings" : "source_inconclusive",
    reasons: decisionReasons,
    riskHypotheses,
  };
  const checkedFiles = [...new Set(evidenceByRoot.flatMap((entry) => entry.files))].sort();
  const bodyLines =
    decision.outcome === "validated_no_findings"
      ? [
          `# ${input.task.title}`,
          "",
          "No validated findings.",
          "",
          "The previous candidate findings did not meet the audit finding contract for concrete technical defects. They were removed instead of being rephrased.",
        ]
      : [
          `# ${input.task.title}`,
          "",
          "Audit source inconclusive.",
          "",
          "Deterministic repair normalized the report artifact, but the available evidence did not meet the trusted no-findings contract.",
          "",
          "## Inconclusive Reasons",
          "",
          ...decision.reasons.map((reason) => `- ${reason}`),
        ];
  const body = [
    ...bodyLines,
    "",
    "## Risk Hypotheses",
    "",
    ...(riskHypotheses.length > 0
      ? riskHypotheses.map(
          (risk) =>
            `- ${risk.id}: ${risk.description} (scope: ${
              risk.scopeIds.length > 0
                ? risk.scopeIds.map((root) => `\`${root}\``).join(", ")
                : "unbound"
            })`,
        )
      : ["- No parseable risk hypotheses were declared."]),
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
      return `| \`${entry.root}\` | ${evidence} | Command \`${entry.command.command}\` output includes \`${firstAuditRepairOutputLine(entry.command.output)}\` |`;
    }),
    "",
    "## Risk-Specific Evidence",
    "",
    ...(riskEvidence.length > 0
      ? riskEvidence.map(
          (entry) =>
            `- ${entry.riskId} / \`${entry.root}\`: Command \`${entry.command.command}\` output includes \`${firstAuditRepairOutputLine(entry.command.output)}\``,
        )
      : ["- No risk-specific evidence commands were run."]),
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
      `- Command \`${entry.command.command}\` output:`,
      "```",
      entry.command.output || "<empty>",
      "```",
    ]),
    ...riskEvidence.flatMap((entry) => [
      `- Command \`${entry.command.command}\` output:`,
      "```",
      entry.command.output || "<empty>",
      "```",
    ]),
    "",
  ]
    .join("\n")
    .trim();
  const manifest = buildAuditReportManifest({
    task: input.task,
    artifactPath: input.artifactPath,
    snapshot: sourceSnapshot,
    body,
    roots,
    evidenceByRoot,
    riskEvidence,
    decision,
  });

  return {
    content: `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
    body,
    sourceSnapshot,
    decision,
  };
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

function collectSynthesisNoFindingsCommandEvidence(
  artifacts: ValidatedAuditArtifactContent[],
): Map<string, string[]> {
  const commandsByArtifact = new Map<string, string[]>();
  for (const artifact of artifacts) {
    commandsByArtifact.set(
      artifact.artifactPath,
      extractAuditSynthesisCommandEvidence(artifact.content),
    );
  }
  return commandsByArtifact;
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
  const sourceOutcome = classifyAuditSynthesisSourceReports({
    projectRoot,
    reports: artifacts.map((artifact) => ({
      artifactPath: artifact.artifactPath,
      taskId: artifact.taskId,
      content: artifact.content,
    })),
    weakReportCount: weakArtifacts.length,
  });
  const sourceSummaries = summarizeValidatedAuditArtifactsForSynthesis(artifacts);
  const totalIncluded = sourceSummaries.reduce(
    (sum, summary) => sum + summary.includedFindings.length,
    0,
  );
  const totalOmitted = sourceSummaries.reduce(
    (sum, summary) => sum + summary.omittedFindingCount,
    0,
  );
  const childReportStatusSection = buildAuditChildReportStatusSection(
    sourceSummaries,
    weakArtifacts,
  );

  if (sourceOutcome.kind === "inconclusive_batch_evidence") {
    const lines = [
      "# Audit Inconclusive",
      "",
      formatAuditSynthesisOutcomeForArtifact(sourceOutcome),
      "",
      "Audit outcome: Audit inconclusive.",
      "",
      sourceOutcome.reason,
      "No findings from the source reports survived the strict synthesis evidence filter, but the batch evidence does not support a product-quality no-findings conclusion.",
      "",
      ...childReportStatusSection,
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
    lines.push(
      `Inventory-only no-findings source reports: ${sourceOutcome.inventoryOnlyNoFindingsReportCount}.`,
    );
    lines.push("");

    return `${lines.join("\n").trim()}\n`;
  }

  if (totalIncluded === 0) {
    const refsByArtifact = collectSynthesisNoFindingsEvidence({ artifacts, projectRoot });
    const commandsByArtifact = collectSynthesisNoFindingsCommandEvidence(artifacts);
    const checkedRefs = [
      ...new Set(
        [...refsByArtifact.values()].flatMap((refs) => refs).filter((ref) => ref.length > 0),
      ),
    ].sort();
    const checkedPaths = [...new Set(checkedRefs.map(pathFromLineEvidenceRef))].slice(0, 12);
    const absenceClaimRef = checkedRefs[0] ?? null;
    const lines = [
      "# Audit Summary",
      "",
      formatAuditSynthesisOutcomeForArtifact(sourceOutcome),
      "",
      "No validated findings.",
      "",
      "Audit outcome: Validated no-findings with substantive audit evidence.",
      ...(absenceClaimRef
        ? [
            "",
            `Absence reasoning: \`${absenceClaimRef}\` ruled out validated source-report findings across the trusted audit batch inputs.`,
          ]
        : []),
      "",
      "Generated from terminal audit batch report artifacts. Source report findings were included only when they carried concrete path:line Evidence, Risk, Proposed fix, and Verification sections.",
      "",
      ...childReportStatusSection,
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
        const commands = commandsByArtifact.get(summary.artifact.artifactPath) ?? [];
        const verification =
          commands.length > 0
            ? commands[0].replace(/\s+/g, " ")
            : firstEvidencePath
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
      ...([...commandsByArtifact.values()].flat().length > 0
        ? [...commandsByArtifact.values()].flat()
        : checkedPaths.length > 0
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
    formatAuditSynthesisOutcomeForArtifact(sourceOutcome),
    "",
    "Audit outcome: Validated findings present.",
    "",
    "Generated from terminal audit batch report artifacts.",
    "Only findings with concrete path:line Evidence, Risk, Proposed fix, and Verification sections were included.",
    "Weak or invalid source reports are listed as coverage gaps only.",
    "",
    ...childReportStatusSection,
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

function buildDeterministicAuditSynthesisContentWithManifest(input: {
  task: TaskRow;
  projectRoot: string;
  artifactPath: string;
  artifacts: ValidatedAuditArtifactContent[];
  weakArtifacts: WeakAuditArtifactSummary[];
}): string {
  const body = buildDeterministicAuditSynthesisContent(
    input.artifacts,
    input.weakArtifacts,
    input.projectRoot,
  ).trim();
  const snapshot = currentAuditReportSourceSnapshot(input.projectRoot);
  const sourceArtifactPaths = [
    ...new Set(input.artifacts.map((artifact) => artifact.artifactPath).filter(Boolean)),
  ].sort();
  const weakArtifactPaths = [
    ...new Set(input.weakArtifacts.map((artifact) => artifact.artifactPath).filter(Boolean)),
  ].sort();
  const outcome = classifyAuditSourceEvidence({
    text: body,
    projectRoot: input.projectRoot,
    excludedReferencedPaths: [input.artifactPath],
    requireProposedFix: true,
  }).classification;
  const evidenceOutput = [
    `summaryArtifact=${input.artifactPath}`,
    `sourceReportCount=${input.artifacts.length}`,
    `weakOrInvalidReportCount=${input.weakArtifacts.length}`,
    "validatedSourceReports:",
    ...(sourceArtifactPaths.length > 0
      ? sourceArtifactPaths.map((artifactPath) => `- ${artifactPath}`)
      : ["- <none>"]),
    "weakOrInvalidReports:",
    ...(weakArtifactPaths.length > 0
      ? weakArtifactPaths.map((artifactPath) => `- ${artifactPath}`)
      : ["- <none>"]),
  ].join("\n");
  const evidenceUnit = persistAuditEvidencePayload(
    input.task.id,
    input.projectRoot,
    buildAuditEvidencePayload({
      toolName: "deterministic_audit_synthesis",
      evidenceKind: "shell_command",
      evidenceGrade: "substantive",
      scopeIds: sourceArtifactPaths.length > 0 ? sourceArtifactPaths : [input.artifactPath],
      riskHypothesisIds:
        outcome === "validated_no_findings" ? [DETERMINISTIC_SYNTHESIS_NO_FINDINGS_RISK_ID] : [],
      paths: [...sourceArtifactPaths, ...weakArtifactPaths],
      command: `deterministic-audit-synthesis --artifact ${input.artifactPath}`,
      exitCode: 0,
      output: evidenceOutput,
      maxPreviewChars: 4_000,
    }),
  );
  const manifest = buildAuditSynthesisManifest({
    task: input.task,
    artifactPath: input.artifactPath,
    snapshot,
    body,
    sourceArtifacts: input.artifacts,
    weakArtifacts: input.weakArtifacts,
    evidenceUnit,
    outcome,
  });

  return `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`;
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
  const content = buildDeterministicAuditSynthesisContentWithManifest(input);
  writeFileSync(artifactPath, content, "utf8");
  const gitLog = commitArtifactIfChanged(input.projectRoot, input.artifactPath);
  return [
    "Deterministic audit synthesis rework completed from validated report artifacts.",
    `Report artifact: ${input.artifactPath}`,
    "Verification: Command `git log -1 --name-only --oneline -- <artifact>` output:",
    gitLog,
  ].join("\n");
}

type DeterministicAuditReportRepairResult = {
  status: "accepted" | "terminal_source_inconclusive" | "runtime_rework_required";
  resultText: string;
  blockedReason: string | null;
  issueCodes: string[];
  autoReviewState: AutoReviewState | null;
};

type TaskRowWithAutoReviewState = TaskRow & { autoReviewState?: AutoReviewState | null };

function runDeterministicAuditReportRepair(input: {
  task: TaskRow;
  projectRoot: string;
  artifactPath: string;
}): DeterministicAuditReportRepairResult {
  const artifactPath = resolve(input.projectRoot, input.artifactPath);
  mkdirSync(dirname(artifactPath), { recursive: true });
  const repair = buildDeterministicAuditReportRepairContent(input);
  writeFileSync(artifactPath, repair.content, "utf8");
  const gitLog = commitArtifactIfChanged(
    input.projectRoot,
    input.artifactPath,
    "Audit: repair report evidence",
  );
  const validation = validateAuditReportArtifactWithTaskContext({
    task: input.task,
    projectRoot: input.projectRoot,
    artifactPath: input.artifactPath,
    requireLedgerEvidence: true,
  });
  if (!validation) {
    throw new Error(`deterministic audit report repair could not read ${input.artifactPath}`);
  }
  let status: DeterministicAuditReportRepairResult["status"];
  let blockedReason: string | null = null;
  let autoReviewState: AutoReviewState | null = null;
  if (isTrustedValidAuditReportValidation(validation)) {
    updateRoadmapBatchArtifactState({
      taskId: input.task.id,
      state: "valid",
      failureFamily: null,
      classification: validation.sourceClassification,
      reworkStatus: "accepted",
      sourceSnapshotId: validation.sourceSnapshot?.id ?? repair.sourceSnapshot.id,
      projectRoot: input.projectRoot,
      contentSha: validation.artifactSha256,
      validationDetails: buildAuditReportValidationDetails(validation, {
        deterministicRepair: {
          outcome: repair.decision.outcome,
          reasons: repair.decision.reasons,
          terminalHandling: "strict validation passed after deterministic repair",
        },
      }),
    });
    status = "accepted";
  } else if (repair.decision.outcome === "source_inconclusive") {
    const validationDetails = buildAuditReportValidationDetails(validation, {
      deterministicRepair: {
        outcome: repair.decision.outcome,
        reasons: repair.decision.reasons,
        terminalHandling:
          "reworkRequested is cleared because source_inconclusive is a terminal non-trusted repair outcome, not because the report is trusted valid.",
      },
    });
    validationDetails.evidence = {
      auditReportValidation: {
        ...((validationDetails.evidence as { auditReportValidation?: Record<string, unknown> })
          .auditReportValidation ?? {}),
        sourceClassification: "source_inconclusive",
      },
    };
    terminalizeSourceInconclusiveAuditReport({
      task: input.task,
      projectRoot: input.projectRoot,
      artifactPath: input.artifactPath,
      reasons: repair.decision.reasons,
      validation,
      sourceSnapshotId: validation.sourceSnapshot?.id ?? repair.sourceSnapshot.id,
      validationDetails,
    });
    status = "terminal_source_inconclusive";
  } else {
    const runtimeRework = persistDeterministicAuditRepairRuntimeRework({
      task: input.task,
      projectRoot: input.projectRoot,
      artifactPath: input.artifactPath,
      validation,
      deterministicRepair: {
        outcome: repair.decision.outcome,
        reasons: repair.decision.reasons,
      },
    });
    status = "runtime_rework_required";
    blockedReason = runtimeRework.blockedReason;
    autoReviewState = runtimeRework.autoReviewState;
  }
  const issueCodes = auditReportValidationIssueCodes(validation);
  const resultText = [
    status === "accepted"
      ? "Deterministic audit report repair completed from risk-specific declared scope evidence and passed strict validation."
      : status === "terminal_source_inconclusive"
        ? "Deterministic audit report repair completed as source_inconclusive."
        : "Deterministic audit report repair could not satisfy strict validation; routing to runtime implementation rework.",
    `Report artifact: ${input.artifactPath}`,
    status === "accepted"
      ? "Rejected prior candidate findings that did not meet the technical finding contract."
      : status === "terminal_source_inconclusive"
        ? "Rejected prior candidate findings and persisted a terminal non-trusted source_inconclusive artifact state."
        : `Runtime rework required for unresolved strict validator issue codes: ${issueCodes.join(", ") || "unknown"}.`,
    ...(repair.decision.reasons.length > 0
      ? repair.decision.reasons.map((reason) => `Inconclusive reason: ${reason}`)
      : []),
    "Verification: Command `git log -1 --name-only --oneline -- <artifact>` output:",
    gitLog,
  ].join("\n");
  return { status, resultText, blockedReason, issueCodes, autoReviewState };
}

function auditReportValidationIssueCodes(
  validation: ReturnType<typeof validateAuditReportArtifact>,
): string[] {
  return [...new Set(validation.issues.map((issue) => issue.code))].sort();
}

function buildAuditReportValidationDetails(
  validation: ReturnType<typeof validateAuditReportArtifact>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    issues: validation.issues,
    evidence: {
      auditReportValidation: {
        ok: validation.ok,
        issueCodes: auditReportValidationIssueCodes(validation),
        artifactSha256: validation.artifactSha256,
        contentSha256: validation.contentSha256,
        sourceClassification: validation.sourceClassification,
        manifestStatus: validation.manifestStatus,
        manifestVersion: validation.manifestVersion,
      },
    },
    ...extra,
  };
}

function isTrustedValidAuditReportValidation(
  validation: ReturnType<typeof validateAuditReportArtifact>,
): boolean {
  return (
    validation.ok &&
    (validation.sourceClassification === "validated_no_findings" ||
      validation.sourceClassification === "validated_findings_present")
  );
}

function terminalizeSourceInconclusiveAuditReport(input: {
  task: TaskRow;
  projectRoot: string;
  artifactPath: string;
  reasons?: string[];
  validation?: ReturnType<typeof validateAuditReportArtifact> | null;
  sourceSnapshotId?: string | null;
  validationDetails?: Record<string, unknown>;
}): string {
  const issueCodes = input.validation ? auditReportValidationIssueCodes(input.validation) : [];
  const details = [
    ...(input.reasons ?? []).map((reason) => reason.trim()).filter(Boolean),
    ...(issueCodes.length > 0 ? [`validator issue codes: ${issueCodes.join(", ")}`] : []),
  ];
  const blockedReason = `source_inconclusive: audit report ${input.artifactPath} is terminal non-trusted${
    details.length > 0 ? `: ${details.join("; ")}` : "."
  }`;
  const validationDetails =
    input.validationDetails ??
    (input.validation
      ? buildAuditReportValidationDetails(input.validation, {
          sourceInconclusiveTerminal: {
            artifactPath: input.artifactPath,
            reasons: input.reasons ?? [],
            issueCodes,
            validatorSourceClassification: input.validation.sourceClassification,
          },
        })
      : {
          sourceInconclusiveTerminal: {
            artifactPath: input.artifactPath,
            reasons: input.reasons ?? [],
            issueCodes,
          },
        });
  if (input.validation && !input.validationDetails) {
    validationDetails.evidence = {
      auditReportValidation: {
        ...((validationDetails.evidence as { auditReportValidation?: Record<string, unknown> })
          .auditReportValidation ?? {}),
        sourceClassification: "source_inconclusive",
        validatorSourceClassification: input.validation.sourceClassification,
      },
    };
  }
  updateRoadmapBatchArtifactState({
    taskId: input.task.id,
    state: "source_inconclusive",
    failureFamily: "source_inconclusive",
    classification: "source_inconclusive",
    reworkStatus: "terminal_inconclusive",
    sourceSnapshotId: input.sourceSnapshotId ?? input.validation?.sourceSnapshot?.id ?? null,
    projectRoot: input.projectRoot,
    contentSha: input.validation?.artifactSha256,
    validationDetails,
  });
  const nowIso = new Date().toISOString();
  setTaskFields(input.task.id, {
    status: "blocked_external",
    reworkRequested: false,
    manualReviewRequired: false,
    blockedReason,
    blockedFromStatus: input.task.status,
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });
  return blockedReason;
}

function validateAuditReportArtifactWithTaskContext(input: {
  task: TaskRow;
  projectRoot: string;
  artifactPath: string;
  requireLedgerEvidence?: boolean;
}): ReturnType<typeof validateAuditReportArtifact> | null {
  const artifact = findRoadmapBatchArtifactByTaskId(input.task.id);
  const artifactPath = resolve(input.projectRoot, input.artifactPath);
  if (!existsSync(artifactPath)) return null;
  const auditPlanId = resolveAuditPlanId({
    taskId: input.task.id,
    roadmapBatchId: artifact?.batchId ?? null,
  });
  const auditEvidenceUnits = listAuditEvidenceEvents({
    taskId: input.task.id,
    auditPlanId,
  });
  return validateAuditReportArtifact({
    text: readFileSync(artifactPath, "utf8"),
    projectRoot: input.projectRoot,
    taskId: input.task.id,
    roadmapBatchId: artifact?.batchId ?? null,
    roadmapAlias: artifact?.roadmapAlias ?? input.task.roadmapAlias,
    auditPlanId,
    taskDescription: input.task.description,
    reportArtifactPaths: [input.artifactPath],
    expectedReportArtifactPath: input.artifactPath,
    requireProposedFix: true,
    auditEvidenceUnits,
    requireLedgerEvidence: input.requireLedgerEvidence ?? false,
  });
}

function buildDeterministicRepairRuntimeAutoReviewState(input: {
  task: TaskRowWithAutoReviewState;
  artifactPath: string;
  issueCodes: string[];
  artifactContentSha: string | null;
}): AutoReviewState {
  const base: AutoReviewState = input.task.autoReviewState ?? {
    strategy: "full_re_review",
    iteration: input.task.reviewIterationCount ?? 0,
    findings: [],
  };
  const findingsById = new Map(base.findings.map((finding) => [finding.id, finding]));
  for (const code of input.issueCodes.length > 0 ? input.issueCodes : ["unknown"]) {
    const id = `deterministic_repair_${code.replace(/[^a-z0-9_]+/gi, "_").toLowerCase()}`;
    findingsById.set(id, {
      id,
      source: "review_gate",
      text: `Deterministic audit report repair could not resolve strict validator issue ${code} for ${input.artifactPath}; runtime rework must address this exact report contract failure.`,
      firstSeenIteration: base.iteration,
      lastSeenIteration: base.iteration,
      streak: 1,
    });
  }
  const findings = [...findingsById.values()];
  return {
    ...base,
    findings,
    reworkSnapshot: {
      iteration: base.iteration,
      artifactPath: input.artifactPath,
      artifactContentSha: input.artifactContentSha,
      findingIds: findings.map((finding) => finding.id),
    },
  };
}

function persistDeterministicAuditRepairRuntimeRework(input: {
  task: TaskRow;
  projectRoot: string;
  artifactPath: string;
  validation: ReturnType<typeof validateAuditReportArtifact> | null;
  fallbackIssueCodes?: string[];
  deterministicRepair?: Record<string, unknown>;
}): { blockedReason: string; issueCodes: string[]; autoReviewState: AutoReviewState } {
  const issueCodes =
    input.validation != null
      ? auditReportValidationIssueCodes(input.validation)
      : [
          ...new Set(
            input.fallbackIssueCodes?.length
              ? input.fallbackIssueCodes
              : ["missing_report_file_references"],
          ),
        ].sort();
  const blockedReason = `deterministic_audit_repair_rework_required: deterministic audit report repair could not resolve strict validator issue codes for ${input.artifactPath}: ${
    issueCodes.join(", ") || "unknown"
  }`;
  const validationDetails =
    input.validation != null
      ? buildAuditReportValidationDetails(input.validation, {
          deterministicRepair: {
            ...(input.deterministicRepair ?? {}),
            terminalHandling:
              "Strict validation failed after deterministic repair; runtime implementation is allowed one normal rework attempt and must still satisfy the same validator before acceptance.",
          },
          runtimeReworkRequired: {
            artifactPath: input.artifactPath,
            issueCodes,
          },
        })
      : {
          issues: issueCodes.map((code) => ({
            code,
            message: `Strict deterministic repair validation could not read ${input.artifactPath}.`,
          })),
          deterministicRepair: {
            ...(input.deterministicRepair ?? {}),
            terminalHandling:
              "Strict validation failed after deterministic repair; runtime implementation is allowed one normal rework attempt and must still satisfy the same validator before acceptance.",
          },
          runtimeReworkRequired: {
            artifactPath: input.artifactPath,
            issueCodes,
          },
        };
  const artifactContentSha = input.validation?.artifactSha256 ?? null;
  const autoReviewState = buildDeterministicRepairRuntimeAutoReviewState({
    task: input.task,
    artifactPath: input.artifactPath,
    issueCodes,
    artifactContentSha,
  });
  updateRoadmapBatchArtifactState({
    taskId: input.task.id,
    state: input.validation == null ? "missing" : "invalid",
    failureFamily: input.validation == null ? "missing_artifact" : undefined,
    classification: input.validation?.sourceClassification,
    reworkStatus: "rework_requested",
    createAttemptBoundary: true,
    projectRoot: input.projectRoot,
    contentSha: artifactContentSha,
    sourceSnapshotId: input.validation?.sourceSnapshot?.id,
    validationDetails,
  });
  return { blockedReason, issueCodes, autoReviewState };
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
  let blockingFindingsSnapshot = task.reworkRequested
    ? formatAutoReviewStateForPrompt(task.autoReviewState)
    : "No persisted blocking findings snapshot.";
  let reworkBlockedReasonForPrompt = compactTextForPrompt(
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
  const repeatedDeterministicAuditReportRepair =
    expectedAuditReportArtifactPath && hasAttemptedDeterministicAuditReportRepair(task);
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
      ? validateAuditReportArtifactWithTaskContext({
          task,
          projectRoot,
          artifactPath: expectedAuditReportArtifactPath,
        })
      : null;
  const currentAuditReportIssueCodes =
    currentAuditReportValidation?.issues.map((issue) => issue.code) ?? [];
  const currentReportNeedsDeterministicRepair = currentAuditReportIssueCodes.some((code) =>
    /\b(?:audit_evidence_discovery_only|audit_evidence_identity_mismatch|audit_evidence_risk_mismatch|audit_evidence_scope_mismatch|audit_evidence_source_snapshot_mismatch|contradictory_findings_and_no_findings|invalid_line_reference|invalid_report_manifest|manifest_content_hash_mismatch|manifest_identity_mismatch|manifest_outcome_mismatch|manifest_source_snapshot_mismatch|missing_audit_evidence_ref|missing_declared_scope_root|missing_report_file_references|missing_report_manifest|missing_report_manifest_fields|missing_scope_coverage|missing_substantive_evidence|unsupported_report_manifest_version|unverified_inspection_claim)\b/i.test(
      code,
    ),
  );
  let deterministicRepairFallbackResultText: string | null = null;

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
    roadmapArtifact?.state === "source_inconclusive"
  ) {
    const blockedReason = terminalizeSourceInconclusiveAuditReport({
      task,
      projectRoot,
      artifactPath: expectedAuditReportArtifactPath,
      reasons: ["roadmap artifact is already source_inconclusive"],
      validation: currentAuditReportValidation,
    });
    const nowIso = new Date().toISOString();
    const resultText = [
      "Audit report artifact is already source_inconclusive before rework implementation; terminalized before review handoff.",
      `Report artifact: ${expectedAuditReportArtifactPath}`,
      `Blocked reason: ${blockedReason}`,
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
      "Audit report artifact already source_inconclusive before rework implementation",
    );
    log.info(
      { taskId, artifactPath: expectedAuditReportArtifactPath, blockedReason },
      "Audit report rework terminalized because artifact state is source_inconclusive",
    );
    return;
  }

  if (
    expectedAuditReportArtifactPath &&
    task.reworkRequested &&
    currentAuditReportValidation?.manifest?.outcome === "source_inconclusive"
  ) {
    const blockedReason = terminalizeSourceInconclusiveAuditReport({
      task,
      projectRoot,
      artifactPath: expectedAuditReportArtifactPath,
      reasons: ["existing audit report manifest declares source_inconclusive"],
      validation: currentAuditReportValidation,
    });
    const nowIso = new Date().toISOString();
    const resultText = [
      "Audit report manifest already declares source_inconclusive before rework implementation; terminalized before review handoff.",
      `Report artifact: ${expectedAuditReportArtifactPath}`,
      `Blocked reason: ${blockedReason}`,
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
      "Audit report manifest already source_inconclusive before rework implementation",
    );
    log.info(
      { taskId, artifactPath: expectedAuditReportArtifactPath, blockedReason },
      "Audit report rework terminalized because existing manifest is source_inconclusive",
    );
    return;
  }

  if (
    expectedAuditReportArtifactPath &&
    task.reworkRequested &&
    currentAuditReportValidation?.ok &&
    isTrustedValidAuditReportValidation(currentAuditReportValidation) &&
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

  if (
    expectedAuditReportArtifactPath &&
    task.reworkRequested &&
    currentAuditReportValidation?.ok &&
    currentAuditReportValidation.sourceClassification === "source_inconclusive"
  ) {
    const blockedReason = terminalizeSourceInconclusiveAuditReport({
      task,
      projectRoot,
      artifactPath: expectedAuditReportArtifactPath,
      reasons: ["existing audit report is already classified source_inconclusive"],
      validation: currentAuditReportValidation,
    });
    const nowIso = new Date().toISOString();
    const resultText = [
      "Audit report evidence is already source_inconclusive before rework implementation; terminalized before review handoff.",
      `Report artifact: ${expectedAuditReportArtifactPath}`,
      `Blocked reason: ${blockedReason}`,
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
      "Audit report evidence already source_inconclusive before rework implementation",
    );
    log.info(
      { taskId, artifactPath: expectedAuditReportArtifactPath, blockedReason },
      "Audit report rework terminalized because existing artifact is source_inconclusive",
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
    shouldUseDeterministicAuditReportRepair(task, currentAuditReportIssueCodes) &&
    !repeatedDeterministicAuditReportRepair
  ) {
    const nowIso = new Date().toISOString();
    const repairResult = runDeterministicAuditReportRepair({
      task,
      projectRoot,
      artifactPath: expectedAuditReportArtifactPath,
    });
    if (repairResult.status === "runtime_rework_required") {
      deterministicRepairFallbackResultText = repairResult.resultText;
      if (repairResult.blockedReason) {
        reworkBlockedReasonForPrompt = compactTextForPrompt(
          "REWORK_BLOCKED_REASON",
          repairResult.blockedReason,
          PROMPT_SECTION_LIMITS.blockedReason,
        );
      }
      if (repairResult.autoReviewState) {
        blockingFindingsSnapshot = formatAutoReviewStateForPrompt(repairResult.autoReviewState);
      }
      setTaskFields(taskId, {
        implementationLog: repairResult.resultText,
        blockedReason: repairResult.blockedReason,
        reworkRequested: true,
        manualReviewRequired: false,
        autoReviewState: repairResult.autoReviewState,
        lastHeartbeatAt: nowIso,
        updatedAt: nowIso,
      });
      logActivity(
        taskId,
        "Agent",
        `Deterministic audit report repair requested runtime rework: ${repairResult.issueCodes.join(", ") || "unknown"}`,
      );
      log.info(
        {
          taskId,
          artifactPath: expectedAuditReportArtifactPath,
          issueCodes: repairResult.issueCodes,
        },
        "Audit report deterministic repair fell through to runtime implementation rework",
      );
    } else {
      const resultText = repairResult.resultText;
      setTaskFields(taskId, {
        implementationLog: resultText,
        reworkRequested: false,
        lastHeartbeatAt: nowIso,
        updatedAt: nowIso,
      });
      logActivity(
        taskId,
        "Agent",
        repairResult.status === "terminal_source_inconclusive"
          ? "Deterministic audit report repair terminalized as source_inconclusive"
          : "Deterministic audit report repair complete",
      );
      log.info(
        { taskId, artifactPath: expectedAuditReportArtifactPath },
        repairResult.status === "terminal_source_inconclusive"
          ? "Audit report rework completed deterministically as source_inconclusive"
          : "Audit report rework completed deterministically",
      );
      return;
    }
  }

  if (
    expectedAuditReportArtifactPath &&
    repeatedDeterministicAuditReportRepair &&
    (auditEvidenceRepairMode || currentReportNeedsDeterministicRepair) &&
    shouldUseDeterministicAuditReportRepair(task, currentAuditReportIssueCodes)
  ) {
    const nowIso = new Date().toISOString();
    const runtimeRework = persistDeterministicAuditRepairRuntimeRework({
      task,
      projectRoot,
      artifactPath: expectedAuditReportArtifactPath,
      validation: currentAuditReportValidation,
      fallbackIssueCodes: currentAuditReportIssueCodes,
      deterministicRepair: {
        outcome: "runtime_rework_required",
        repeatedDeterministicRepair: true,
      },
    });
    const resultText = [
      "Repeated deterministic audit report repair did not satisfy strict validation; routing to runtime implementation rework.",
      `Report artifact: ${expectedAuditReportArtifactPath}`,
      `Unresolved strict validator issue codes: ${runtimeRework.issueCodes.join(", ") || "unknown"}`,
    ].join("\n");
    deterministicRepairFallbackResultText = resultText;
    reworkBlockedReasonForPrompt = compactTextForPrompt(
      "REWORK_BLOCKED_REASON",
      runtimeRework.blockedReason,
      PROMPT_SECTION_LIMITS.blockedReason,
    );
    blockingFindingsSnapshot = formatAutoReviewStateForPrompt(runtimeRework.autoReviewState);
    setTaskFields(taskId, {
      implementationLog: resultText,
      blockedReason: runtimeRework.blockedReason,
      reworkRequested: true,
      manualReviewRequired: false,
      autoReviewState: runtimeRework.autoReviewState,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    logActivity(
      taskId,
      "Agent",
      `Repeated deterministic audit report repair requested runtime rework: ${runtimeRework.issueCodes.join(", ") || "unknown"}`,
    );
    log.info(
      {
        taskId,
        artifactPath: expectedAuditReportArtifactPath,
        issueCodes: runtimeRework.issueCodes,
      },
      "Repeated deterministic audit report repair fell through to runtime implementation rework",
    );
  }

  const scopeConstraint = `IMPORTANT: Your working directory is ${projectRoot}
All files must be created and modified inside this directory. Do NOT create files outside of it.`;
  const implementSlashCommand = `/aif-implement ${planSection}`;
  const memoryContext = buildTaskMemoryContext({
    task,
    workflowKind: "implementer",
    source: "agent:implementer",
    queryParts: [
      selectedPlan,
      taskDescriptionForPrompt,
      reviewCommentsForPrompt,
      reworkBlockedReasonForPrompt,
    ],
  });
  const memoryBlock = memoryContext ? `\n\n${memoryContext}\n` : "";

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
${memoryBlock}

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

  let finalResultText = deterministicRepairFallbackResultText
    ? `${deterministicRepairFallbackResultText}\n\nRuntime implementer result:\n${resultText}`
    : resultText;

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
