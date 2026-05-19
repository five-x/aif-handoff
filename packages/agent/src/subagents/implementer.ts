import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import {
  assertSafeRoadmapArtifactPath,
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  getLatestReworkComment,
  listRoadmapBatchArtifactAttempts,
  listAuditEvidenceEvents,
  listRoadmapReportArtifactsForSynthesis,
  persistTaskPlanForTask,
  setTaskFields,
  summarizeRoadmapBatch,
  updateRoadmapBatchArtifactState,
  type RoadmapBatchArtifactRow,
  type TaskFieldsPatch,
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
  classifyAuditCardDecision,
  classifyAuditSourceEvidence,
  classifyAuditSynthesisSourceReports,
  computeAuditReportContentSha256,
  extractAuditSynthesisCommandEvidence,
  formatAuditSynthesisOutcomeForArtifact,
  hashAifPlanManifest,
  resolveAuditPlanId,
  toAuditPublicReportOutcome,
  type AuditCardDecision,
  type AuditCardVerificationStrength,
  type AuditEvidenceUnit,
  type AuditPublicReportOutcome,
  type AuditReportSourceSnapshot,
} from "@aif/shared";
import { createRuntimeWorkflowSpec } from "@aif/runtime";
import { flushActivityQueue, logActivity, persistAuditEvidencePayload } from "../hooks.js";
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
const DEVELOPMENT_IMPLEMENTATION_MANIFEST_INTENTS = new Set(["feature", "fix", "docs", "tests"]);
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
        reworkSnapshot?: {
          iteration?: number;
          artifactPath?: string;
          artifactContentSha?: string | null;
          baselineHeadSha?: string | null;
          changedFilesDigest?: string | null;
          changedFilesSummary?: string[];
          findingIds?: string[];
          requiredEvidenceByFindingId?: Record<string, string>;
          forbiddenChanges?: string[];
        };
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
  const snapshot = state.reworkSnapshot;
  if (snapshot) {
    lines.push("rework snapshot:");
    if (snapshot.artifactPath) lines.push(`- artifactPath: ${snapshot.artifactPath}`);
    if (snapshot.artifactContentSha) {
      lines.push(`- artifactContentSha: ${snapshot.artifactContentSha}`);
    }
    if (snapshot.baselineHeadSha) lines.push(`- baselineHeadSha: ${snapshot.baselineHeadSha}`);
    if (snapshot.changedFilesDigest) {
      lines.push(`- changedFilesDigest: ${snapshot.changedFilesDigest}`);
    }
    if (snapshot.findingIds && snapshot.findingIds.length > 0) {
      lines.push(`- exact blocker ids: ${snapshot.findingIds.join(", ")}`);
    }
    if (snapshot.requiredEvidenceByFindingId) {
      lines.push("- required evidence by blocker id:");
      for (const [findingId, evidence] of Object.entries(snapshot.requiredEvidenceByFindingId)) {
        lines.push(`  - [${findingId}] ${evidence}`);
      }
    }
    if (snapshot.forbiddenChanges && snapshot.forbiddenChanges.length > 0) {
      lines.push("- forbidden unrelated changes:");
      for (const change of snapshot.forbiddenChanges) lines.push(`  - ${change}`);
    }
    if (snapshot.changedFilesSummary && snapshot.changedFilesSummary.length > 0) {
      lines.push("- prior attempt changed files summary:");
      for (const entry of snapshot.changedFilesSummary.slice(0, 25)) lines.push(`  - ${entry}`);
    }
  }
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

type OptionalImplementationManifestHelpers = {
  extractImplementationManifestBlock?: (text: string) => unknown;
  normalizeImplementationManifestJson?: (manifestJson: unknown) => unknown;
};

function shouldRequestImplementationManifest(task: Pick<TaskRow, "taskIntent" | "isFix">): boolean {
  return task.isFix || DEVELOPMENT_IMPLEMENTATION_MANIFEST_INTENTS.has(task.taskIntent);
}

function formatImplementationManifestPrompt(
  task: Pick<TaskRow, "taskIntent" | "isFix">,
  planText: string | null | undefined,
): string {
  if (!shouldRequestImplementationManifest(task)) return "";
  const intent = task.isFix ? "fix" : task.taskIntent;
  const expectedPlanManifestHash = hashAifPlanManifest(planText);
  const regressionField = intent === "fix" ? ", `regressionExplanation`" : "";
  const regressionInstruction =
    intent === "fix"
      ? "\n- Because this is a fix task, `regressionExplanation` is required and must explain the regression or failure mode that was fixed."
      : "";
  const planHashInstruction = expectedPlanManifestHash
    ? `\n- The approved plan contains an \`aif-plan-manifest\`; set \`planManifestHash\` exactly to \`${expectedPlanManifestHash}\`.`
    : "\n- The approved plan has no `aif-plan-manifest`; set `planManifestHash` to null.";
  return `- Your final result MUST include exactly one fenced \`aif-implementation-manifest\` JSON block.
- The manifest must be a JSON object with: \`version\`, \`taskId\`, \`intent\`, \`planManifestHash\`, \`changedFiles\`, \`diffSummary\`, \`verificationEvidence\`, \`acceptanceCriteria\`, \`evidenceRefs\`, \`planChecklist\`, \`reviewClosure\`, \`commitEvidence\`${regressionField}, and \`knownLimitations\`.
- Set \`intent\` to \`${intent}\`. Every passed \`verificationEvidence\` item must include \`command\`, \`status\`, \`outputSha256\`, \`outputPreview\`, and \`outputPreviewTruncated\`; \`acceptanceCriteria\` and \`reviewClosure\` evidence refs must point to concrete verification evidence or actual review comments. Keep file paths and evidence arrays deterministic; use an empty array only when there is no applicable evidence.${planHashInstruction}${regressionInstruction}
- Put the manifest in the final result text, not in a repository file.`;
}

function serializeImplementationManifest(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return trimmed;
    }
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return null;
}

async function extractNormalizedImplementationManifest(resultText: string): Promise<string | null> {
  const helpers = (await import("@aif/shared")) as OptionalImplementationManifestHelpers;
  if (
    typeof helpers.extractImplementationManifestBlock !== "function" ||
    typeof helpers.normalizeImplementationManifestJson !== "function"
  ) {
    return null;
  }

  try {
    const manifestBlock = helpers.extractImplementationManifestBlock(resultText);
    if (manifestBlock == null) return null;
    return serializeImplementationManifest(
      helpers.normalizeImplementationManifestJson(manifestBlock),
    );
  } catch (err) {
    log.warn({ err }, "Failed to extract implementation manifest from implementer result");
    return null;
  }
}

function taskSupportsImplementationManifestField(task: TaskRow): boolean {
  return Object.prototype.hasOwnProperty.call(task, "implementationManifestJson");
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
  return assertSafeRoadmapArtifactPath(path);
}

function resolveSafeArtifactPath(rootPath: string, artifactPath: string): string {
  const gitPath = normalizeArtifactGitPath(artifactPath);
  const root = resolve(rootPath);
  const resolvedPath = resolve(root, gitPath);
  const relativePath = relative(root, resolvedPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`unsafe roadmap artifact path: ${artifactPath}`);
  }
  return resolvedPath;
}

type MissingReportArtifactSource = "worktree" | "branch" | "project_root";

interface SynthesisNotReadyError extends Error {
  validationDetails?: Record<string, unknown>;
}

function createSynthesisNotReadyError(
  message: string,
  validationDetails?: Record<string, unknown>,
): SynthesisNotReadyError {
  const error = new Error(message) as SynthesisNotReadyError;
  if (validationDetails) {
    error.validationDetails = validationDetails;
  }
  return error;
}

function missingReportArtifactValidationDetails(input: {
  reason: string;
  artifactPath: string;
  source: MissingReportArtifactSource;
  sourceLocation: string;
  branchName: string | null;
  worktreePath: string | null;
  projectRoot: string;
}): Record<string, unknown> {
  const missingReportArtifact = {
    code: "missing_report_artifact",
    reason: input.reason,
    artifactPath: input.artifactPath,
    source: input.source,
    sourceLocation: input.sourceLocation,
    branchName: input.branchName,
    worktreePath: input.worktreePath,
    projectRoot: input.projectRoot,
    contentSha: null,
  };
  return {
    ...missingReportArtifact,
    missingReportArtifact,
    issues: [
      {
        code: "missing_report_artifact",
        message: input.reason,
        artifactPath: input.artifactPath,
        source: input.source,
        sourceLocation: input.sourceLocation,
        branchName: input.branchName,
        worktreePath: input.worktreePath,
        projectRoot: input.projectRoot,
        contentSha: null,
      },
    ],
  };
}

function readValidatedArtifactContent(input: {
  artifactPath: string;
  projectRoot: string;
  branchName: string | null;
  worktreePath: string | null;
}): { content: string; source: string } {
  const gitPath = normalizeArtifactGitPath(input.artifactPath);

  if (input.worktreePath) {
    const artifactPath = resolveSafeArtifactPath(input.worktreePath, gitPath);
    if (!existsSync(artifactPath)) {
      const reason = `synthesis_not_ready: missing_report_artifact: validated artifact is unavailable in worktree ${input.worktreePath}: ${input.artifactPath}`;
      throw createSynthesisNotReadyError(
        reason,
        missingReportArtifactValidationDetails({
          reason,
          artifactPath: input.artifactPath,
          source: "worktree",
          sourceLocation: input.worktreePath,
          branchName: input.branchName,
          worktreePath: input.worktreePath,
          projectRoot: input.projectRoot,
        }),
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
      const reason = `synthesis_not_ready: missing_report_artifact: validated artifact is unavailable on branch ${input.branchName}: ${input.artifactPath}`;
      throw createSynthesisNotReadyError(
        reason,
        missingReportArtifactValidationDetails({
          reason,
          artifactPath: input.artifactPath,
          source: "branch",
          sourceLocation: input.branchName,
          branchName: input.branchName,
          worktreePath: input.worktreePath,
          projectRoot: input.projectRoot,
        }),
      );
    }
  }

  const artifactPath = resolveSafeArtifactPath(input.projectRoot, gitPath);
  if (!existsSync(artifactPath)) {
    const reason = `synthesis_not_ready: missing_report_artifact: validated artifact is unavailable in project root ${input.projectRoot}: ${input.artifactPath}`;
    throw createSynthesisNotReadyError(
      reason,
      missingReportArtifactValidationDetails({
        reason,
        artifactPath: input.artifactPath,
        source: "project_root",
        sourceLocation: input.projectRoot,
        branchName: input.branchName,
        worktreePath: input.worktreePath,
        projectRoot: input.projectRoot,
      }),
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
  omittedFindings: AuditFindingSection[];
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

function weakAuditArtifactVerificationStrength(
  artifact: WeakAuditArtifactSummary,
): AuditCardVerificationStrength {
  return artifact.state === "source_inconclusive" ||
    artifact.state === "terminal_inconclusive" ||
    artifact.state === "external_blocked" ||
    artifact.state === "manual_exception"
    ? "inaccessible"
    : "missing";
}

function weakAuditArtifactAcceptanceSatisfied(artifact: WeakAuditArtifactSummary): boolean {
  return artifact.state === "external_blocked" || artifact.state === "manual_exception";
}

function formatAuditCardList(values: string[]): string {
  return values.length > 0 ? values.join("<br>") : "none";
}

function summarizeWeakArtifactValidationDetails(details: string | null): string[] {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details) as {
      issues?: Array<{ code?: unknown }>;
      sourceClassification?: unknown;
      terminalizationReason?: unknown;
      deterministicRepair?: { outcome?: unknown; terminalHandling?: unknown };
      evidence?: {
        auditReportValidation?: {
          sourceClassification?: unknown;
          validatorSourceClassification?: unknown;
          manifestStatus?: unknown;
        };
      };
    };
    const issueCodes = [
      ...new Set(
        (parsed.issues ?? []).flatMap((issue) =>
          typeof issue.code === "string" ? [issue.code] : [],
        ),
      ),
    ].sort();
    const auditValidation = parsed.evidence?.auditReportValidation;
    return [
      issueCodes.length > 0 ? `issue codes: ${issueCodes.join(", ")}` : null,
      typeof parsed.sourceClassification === "string"
        ? `source classification: ${parsed.sourceClassification}`
        : null,
      typeof auditValidation?.sourceClassification === "string"
        ? `validator classification: ${auditValidation.sourceClassification}`
        : null,
      typeof auditValidation?.manifestStatus === "string"
        ? `manifest status: ${auditValidation.manifestStatus}`
        : null,
      typeof parsed.deterministicRepair?.outcome === "string"
        ? `deterministic repair outcome: ${parsed.deterministicRepair.outcome}`
        : null,
      typeof parsed.terminalizationReason === "string"
        ? `terminalization reason: ${parsed.terminalizationReason}`
        : null,
    ].filter((entry): entry is string => Boolean(entry));
  } catch {
    return [
      "validation details were present but not embedded because they are not structured JSON",
    ];
  }
}

function formatAuditCardDecisionRow(input: {
  sourceReport: string;
  taskId: string;
  decision: AuditCardDecision;
}): string {
  return [
    `\`${formatMarkdownTableCell(input.sourceReport)}\``,
    `\`${formatMarkdownTableCell(input.taskId)}\``,
    formatMarkdownTableCell(input.decision.otzRequirement),
    formatMarkdownTableCell(formatAuditCardList(input.decision.acceptanceCriteria)),
    `\`${input.decision.requirementCompletion}\``,
    formatMarkdownTableCell(formatAuditCardList(input.decision.implementationEvidence)),
    formatMarkdownTableCell(formatAuditCardList(input.decision.verificationEvidence)),
    `\`${input.decision.verificationStrength}\``,
    String(input.decision.auditFindingValidity.validFindings),
    String(input.decision.auditFindingValidity.weakFindings),
    String(input.decision.auditFindingValidity.discardedFindings),
    formatMarkdownTableCell(formatAuditCardList(input.decision.residualRisks)),
    `\`${input.decision.finalStatus}\``,
  ].join(" | ");
}

function buildAuditCardDecisionSection(
  sourceSummaries: AuditSourceReportSummary[],
  weakArtifacts: WeakAuditArtifactSummary[],
): string[] {
  const rows = [
    ...sourceSummaries.map((summary) =>
      formatAuditCardDecisionRow({
        sourceReport: summary.artifact.artifactPath,
        taskId: summary.artifact.taskId,
        decision: classifyAuditCardDecision({
          otzRequirement: "Produce a terminal audit source report for the scoped OTZ card.",
          acceptanceCriteria: [
            "Report artifact exists and is trusted valid.",
            "Accepted findings meet the evidence contract or no-findings evidence is substantive.",
          ],
          otzAcceptanceSatisfied: true,
          implementationEvidence: [summary.artifact.artifactPath],
          verificationEvidence: ["validator accepted source report evidence"],
          verificationStrength: "verified",
          validFindingCount: summary.includedFindings.length,
          weakFindingCount: summary.omittedFindingCount,
          discardedFindingCount: 0,
          residualRisks:
            summary.omittedFindingCount > 0
              ? [`${summary.omittedFindingCount} weak finding(s) were discarded, not promoted.`]
              : [],
        }),
      }),
    ),
    ...weakArtifacts.map((artifact) => {
      const verificationStrength = weakAuditArtifactVerificationStrength(artifact);
      return formatAuditCardDecisionRow({
        sourceReport: artifact.artifactPath,
        taskId: artifact.taskId,
        decision: classifyAuditCardDecision({
          otzRequirement: "Produce a terminal audit source report for the scoped OTZ card.",
          acceptanceCriteria: [
            "Report artifact exists and is trusted valid.",
            "Accepted findings meet the evidence contract or no-findings evidence is substantive.",
          ],
          otzAcceptanceSatisfied: weakAuditArtifactAcceptanceSatisfied(artifact),
          implementationEvidence: [artifact.artifactPath],
          verificationEvidence: [
            `artifact state: ${artifact.state}`,
            `failure family: ${artifact.failureFamily ?? "none"}`,
          ],
          verificationStrength,
          validFindingCount: 0,
          weakFindingCount: 0,
          discardedFindingCount: 0,
          residualRisks:
            verificationStrength === "inaccessible"
              ? ["auditor could not verify because access, environment, or context is missing"]
              : ["OTZ acceptance criteria were not satisfied by trusted evidence"],
        }),
      });
    }),
  ];

  if (rows.length === 0) {
    return ["## Card Decision Matrix", "", "- No OTZ cards were available for classification.", ""];
  }

  return [
    "## Card Decision Matrix",
    "",
    "| Source report | Task | OTZ requirement | Acceptance criteria | Requirement completion | Implementation evidence | Verification evidence | Verification strength | Valid findings | Weak findings | Discarded findings | Residual risks | Final decision |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
    "",
  ];
}

function buildWeakOrDiscardedFindingsSection(
  sourceSummaries: AuditSourceReportSummary[],
  weakArtifacts: WeakAuditArtifactSummary[],
): string[] {
  const lines = ["## Weak/discarded findings", ""];
  let entryCount = 0;

  sourceSummaries.forEach((summary) => {
    summary.omittedFindings.forEach((finding) => {
      entryCount += 1;
      lines.push(`### Omitted Finding ${entryCount}`);
      lines.push("");
      lines.push(`Source report: \`${finding.artifactPath}\` (task ${finding.taskId})`);
      lines.push(
        `Decision: discarded from synthesis output because the finding did not satisfy the strict evidence contract.`,
      );
      lines.push("");
      lines.push(finding.content.trim());
      lines.push("");
    });
  });

  weakArtifacts.forEach((artifact) => {
    entryCount += 1;
    lines.push(`### Weak Source Report ${entryCount}`);
    lines.push("");
    lines.push(`Source report: \`${artifact.artifactPath}\` (task ${artifact.taskId})`);
    lines.push(
      `Decision: discarded from synthesis findings because the source report state is \`${artifact.state}\`.`,
    );
    lines.push(`Failure family: ${artifact.failureFamily ?? "none"}`);
    const validationSummary = summarizeWeakArtifactValidationDetails(artifact.validationDetails);
    if (validationSummary.length > 0) {
      lines.push(`Validation summary: ${validationSummary.join("; ")}`);
    }
    lines.push("");
  });

  if (entryCount === 0) {
    lines.push("No weak or discarded findings were omitted from the synthesis output.");
    lines.push("");
  }

  return lines;
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
const SYNTHESIS_IGNORED_EVIDENCE_PATH_PARTS = new Set([
  "__pycache__",
  "node_modules",
  ".git",
  ".agents",
  ".ai-factory",
  ".claude",
  ".codex",
  ".github",
]);
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

function isRetryingTerminalSourceInconclusiveAuditReport(input: {
  task: Pick<TaskRow, "status" | "reworkRequested">;
  artifact: RoadmapBatchArtifactRow | null | undefined;
}): boolean {
  if (!input.artifact || input.artifact.role !== "report") return false;
  if (input.task.status !== "implementing" || input.task.reworkRequested) return false;
  if (input.artifact.state !== "source_inconclusive") return false;
  return listRoadmapBatchArtifactAttempts(input.artifact.id).some(
    (attempt) =>
      attempt.state === "source_inconclusive" && attempt.reworkStatus === "terminal_inconclusive",
  );
}

function logDeterministicAuditReportRepairActivity(input: {
  taskId: string;
  phase: "started" | "complete" | "terminal_source_inconclusive";
  artifactPath: string;
  issueCodes?: string[];
}): void {
  if (input.phase === "started") {
    logActivity(
      input.taskId,
      "Agent",
      "implement-coordinator started (deterministic audit report repair)",
    );
    logActivity(input.taskId, "Tool", `git_grep scoped audit evidence for ${input.artifactPath}`);
    return;
  }

  logActivity(
    input.taskId,
    "Agent",
    input.phase === "terminal_source_inconclusive"
      ? `implement-coordinator complete (deterministic audit report repair terminalized source_inconclusive: ${
          input.issueCodes?.join(", ") || "unknown"
        })`
      : "implement-coordinator complete (deterministic audit report repair)",
  );
  flushActivityQueue(input.taskId);
}

function logDeterministicAuditSynthesisActivity(input: {
  taskId: string;
  phase: "started" | "complete";
  artifactPath: string;
  sourceArtifactPaths?: string[];
}): void {
  if (input.phase === "started") {
    logActivity(
      input.taskId,
      "Agent",
      "implement-coordinator started (deterministic audit synthesis)",
    );
    logActivity(input.taskId, "Tool", `list_files ${dirname(input.artifactPath) || "."}`);
    for (const sourceArtifactPath of (input.sourceArtifactPaths ?? []).slice(0, 5)) {
      logActivity(input.taskId, "Tool", `read_file ${sourceArtifactPath}`);
    }
    logActivity(input.taskId, "Tool", `write_file ${input.artifactPath}`);
    flushActivityQueue(input.taskId);
    return;
  }

  logActivity(
    input.taskId,
    "Agent",
    "implement-coordinator complete (deterministic audit synthesis)",
  );
  flushActivityQueue(input.taskId);
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

const LEGACY_GENERATED_AUDIT_RISK_PATTERN =
  /\bowner-area defects that produce actionable audit findings\b/i;
const LEGACY_BROAD_AUDIT_SCOPE_ROOTS = new Set([
  "app",
  "apps",
  "bot",
  "docs",
  "lib",
  "package",
  "packages",
  "scripts",
  "server",
  "src",
  "test",
  "tests",
]);

function legacyGeneratedAuditContractReasons(
  description: string | null,
  roots: string[],
): string[] {
  if (!description || !LEGACY_GENERATED_AUDIT_RISK_PATTERN.test(description)) return [];

  const broadRoots = roots.filter((root) =>
    LEGACY_BROAD_AUDIT_SCOPE_ROOTS.has(auditRepairPathSegments(root)[0]?.toLowerCase() ?? ""),
  );
  const hiddenToolingRoots = roots.filter(isExplicitHiddenAuditScopeRoot);
  const reasons = [
    "legacy generated audit card uses generic owner-area risk hypotheses instead of concrete OTZ acceptance criteria",
  ];
  if (broadRoots.length > 0) {
    reasons.push(
      `legacy generated audit card declares broad source roots: ${broadRoots.join(", ")}`,
    );
  }
  if (hiddenToolingRoots.length > 0) {
    reasons.push(
      `legacy generated audit card includes hidden/tooling roots: ${hiddenToolingRoots.join(", ")}`,
    );
  }
  if (roots.length > 4) {
    reasons.push(`legacy generated audit card declares too many mixed roots: ${roots.join(", ")}`);
  }
  return reasons;
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
  lineRefs: string[];
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

function isAuditRepairMetadataOnlyLineOne(input: {
  path: string;
  line: number;
  text: string | null;
}): boolean {
  if (input.line !== 1 || input.text == null) return false;
  const trimmed = input.text.trim();
  if (!trimmed) return true;
  if (/\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|cs|c|cpp|h|hpp)$/i.test(input.path)) {
    return /^(?:\/\/|\/\*|\*|#(?!\s*(?:!|include\b|define\b))|<!--)/.test(trimmed);
  }
  if (/^(?:---|\+\+\+|#\s+|<!--|\/\/|\/\*|\*)/.test(trimmed)) return true;
  if (/^[{[]$/.test(trimmed)) return true;
  return false;
}

function firstAuditRepairLineEvidenceRef(projectRoot: string, path: string): string | null {
  try {
    const content = readFileSync(resolve(projectRoot, path), "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (!line.trim()) continue;
      const lineNumber = index + 1;
      if (
        isAuditRepairMetadataOnlyLineOne({
          path,
          line: lineNumber,
          text: line,
        })
      ) {
        continue;
      }
      return `${path}:${lineNumber}`;
    }
  } catch {
    return null;
  }
  return null;
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

function hasReadableDeclaredAuditScope(projectRoot: string, description: string | null): boolean {
  const roots = parseAuditScopeRoots(description);
  return (
    roots.length > 0 &&
    roots.every((root) =>
      collectAuditRepairEvidenceFiles(projectRoot, root).some((file) =>
        Boolean(firstAuditRepairLineEvidenceRef(projectRoot, file)),
      ),
    )
  );
}

function diagnoseDeclaredAuditScopeRepairability(
  projectRoot: string,
  description: string | null,
): {
  repairable: boolean;
  roots: string[];
  reasons: string[];
  issueCodes: string[];
} {
  const roots = parseAuditScopeRoots(description);
  if (roots.length === 0) {
    return {
      repairable: false,
      roots,
      reasons: ["declared audit Scope does not contain concrete readable file or directory roots"],
      issueCodes: ["non_repairable_declared_scope"],
    };
  }
  const legacyContractReasons = legacyGeneratedAuditContractReasons(description, roots);
  if (legacyContractReasons.length > 0) {
    return {
      repairable: false,
      roots,
      reasons: legacyContractReasons,
      issueCodes: ["legacy_weak_audit_card_contract", "non_repairable_declared_scope"],
    };
  }
  if (hasReadableDeclaredAuditScope(projectRoot, description)) {
    return { repairable: true, roots, reasons: [], issueCodes: [] };
  }

  const unreadableRoots = roots.filter(
    (root) =>
      !collectAuditRepairEvidenceFiles(projectRoot, root).some((file) =>
        Boolean(firstAuditRepairLineEvidenceRef(projectRoot, file)),
      ),
  );
  if (unreadableRoots.length === 0) {
    return { repairable: true, roots, reasons: [], issueCodes: [] };
  }

  return {
    repairable: false,
    roots,
    reasons: unreadableRoots.map(
      (root) => `declared audit Scope root ${root} has no readable file evidence`,
    ),
    issueCodes: ["non_repairable_declared_scope"],
  };
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

function sanitizeAuditRepairRiskDescription(description: string, fallback: string): string {
  const sanitized = description
    .replace(/\bmay\s+contain\b/gi, "was checked for")
    .replace(/\blikely\s+used\b/gi, "was checked as used")
    .replace(/\blikely\s+indicates\b/gi, "was checked as indicating")
    .replace(/\bconfirmed\s+(?:the\s+)?file\s+exists\b/gi, "file content was inspected")
    .replace(/\bconfirmed\s+([^.\n]+?)\s+exists\b/gi, "$1 was inspected")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || fallback;
}

function slugAuditRepairRiskId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "scope";
}

function buildFallbackAuditRiskHypotheses(roots: string[]): AuditRepairRiskHypothesis[] {
  return roots.map((root) => ({
    id: `risk-${slugAuditRepairRiskId(root)}-audit-coverage`,
    description: `Absence check for actionable audit defects in ${root}.`,
    scopeIds: [root],
    terms: [],
  }));
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
  const sourceText = sourceLines.join(" ");
  const risks = new Map<string, AuditRepairRiskHypothesis>();
  const matches = [...sourceText.matchAll(/\brisk-[\w-]+\b/gi)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const id = match[0]?.toLowerCase();
    if (!id || risks.has(id)) continue;
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? sourceText.length;
    const segment = sourceText.slice(start, end);
    const rawDescription = segment
      .replace(/^\s*[-*]\s*/, "")
      .replace(new RegExp(`^${id}\\s*[:\\-]?\\s*`, "i"), "")
      .trim();
    const lowered = segment.toLowerCase();
    const scopeIds = roots.filter((root) => lowered.includes(root.toLowerCase()));
    const boundScopeIds = scopeIds.length > 0 ? scopeIds : roots;
    risks.set(id, {
      id,
      description: sanitizeAuditRepairRiskDescription(
        rawDescription,
        `Absence check for actionable audit defects in ${boundScopeIds.join(", ")}.`,
      ),
      scopeIds: boundScopeIds,
      terms: deriveAuditRepairRiskTerms(segment, roots),
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
  const evidenceRefsForRisk = (risk: AuditRepairRiskHypothesis): string[] =>
    [
      ...input.evidenceByRoot
        .filter((entry) => risk.scopeIds.includes(entry.root) && entry.evidenceUnit)
        .map((entry) => entry.evidenceUnit?.id)
        .filter((id): id is string => Boolean(id)),
      ...input.riskEvidence
        .filter((entry) => entry.riskId === risk.id && entry.evidenceUnit)
        .map((entry) => entry.evidenceUnit?.id)
        .filter((id): id is string => Boolean(id)),
    ].sort();
  const scopeCoverage = input.evidenceByRoot.map((entry) => ({
    root: entry.root,
    covered:
      entry.lineRefs.length > 0 &&
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
              "Deterministic repair used scoped source inspections and removed unvalidated candidate findings.",
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
      evidenceRefs: evidenceRefsForRisk(risk),
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
  outcome: AuditPublicReportOutcome;
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
  const riskHypotheses = (() => {
    const parsed = parseAuditRiskHypotheses(input.task.description, roots);
    return parsed.length > 0 ? parsed : buildFallbackAuditRiskHypotheses(roots);
  })();
  const sourceSnapshot = currentAuditReportSourceSnapshot(input.projectRoot);
  const evidenceByRoot = roots.map((root) => {
    const files = collectAuditRepairEvidenceFiles(input.projectRoot, root);
    const inspectionTargets = files.slice(0, 3);
    const lineRefs = inspectionTargets
      .map((file) => firstAuditRepairLineEvidenceRef(input.projectRoot, file))
      .filter((ref): ref is string => Boolean(ref));
    const gitArgs = ["grep", "-n", "-m", "1", ".", "--", root];
    const command = runGitCapture(input.projectRoot, gitArgs);
    const evidenceUnit =
      lineRefs.length > 0 && command.exitCode === 0
        ? persistAuditEvidencePayload(
            input.task.id,
            input.projectRoot,
            buildAuditEvidencePayload({
              toolName: "deterministic_audit_report_repair",
              evidenceKind: "shell_command",
              evidenceGrade: "substantive",
              scopeIds: [root],
              riskHypothesisIds: riskHypotheses
                .filter((risk) => risk.scopeIds.includes(root))
                .map((risk) => risk.id),
              paths: inspectionTargets,
              command: command.command,
              exitCode: command.exitCode,
              output: command.output,
              maxPreviewChars: 2_000,
            }),
          )
        : null;
    return {
      root,
      files,
      lineRefs,
      command,
      evidenceUnit,
    };
  });
  const riskEvidence = riskHypotheses
    .flatMap((risk) =>
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
                "1",
                "-E",
                pattern,
                "--",
                ...files,
              ])
            : {
                args: [],
                command: "",
                exitCode: 1,
                output: "",
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
    )
    .filter((entry) => entry.evidenceUnit !== null);
  const decisionReasons: string[] = [];
  if (roots.length === 0) decisionReasons.push("No concrete audit scope roots were parsed.");
  if (riskHypotheses.length === 0) {
    decisionReasons.push("No risk hypotheses were parsed from the task description.");
  }
  for (const entry of evidenceByRoot) {
    if (entry.files.length === 0 || entry.lineRefs.length === 0) {
      decisionReasons.push(`Scope root ${entry.root} has no readable scoped source line evidence.`);
      continue;
    }
    if (!entry.evidenceUnit) {
      decisionReasons.push(`Scope root ${entry.root} has no captured scoped command evidence.`);
    }
  }
  for (const risk of riskHypotheses) {
    if (risk.scopeIds.length === 0) {
      decisionReasons.push(`Risk ${risk.id} does not reference a declared scope root.`);
      continue;
    }
    const hasBoundEvidence = evidenceByRoot.some(
      (entry) =>
        risk.scopeIds.includes(entry.root) &&
        entry.lineRefs.length > 0 &&
        entry.evidenceUnit !== null,
    );
    if (!hasBoundEvidence) {
      decisionReasons.push(`Risk ${risk.id} has no bound scoped source evidence.`);
    }
  }
  const decision: AuditReportRepairDecision = {
    outcome: decisionReasons.length === 0 ? "validated_no_findings" : "source_inconclusive",
    reasons: decisionReasons,
    riskHypotheses,
  };
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
        entry.lineRefs.length > 0
          ? entry.lineRefs.map((ref) => `\`${ref}\``).join(", ")
          : "No tracked file evidence found";
      return `| \`${entry.root}\` | ${evidence} | Command \`${entry.command.command}\` output includes \`${firstAuditRepairOutputLine(entry.command.output)}\` |`;
    }),
    ...(decision.outcome === "validated_no_findings"
      ? [
          "",
          "## No-Findings Claims",
          "",
          ...riskHypotheses.map((risk) => {
            const refs = evidenceByRoot
              .filter((entry) => risk.scopeIds.includes(entry.root))
              .flatMap((entry) => entry.lineRefs)
              .slice(0, 6);
            return `- Absence reasoning: ${risk.id} covered ${refs
              .map((ref) => `\`${ref}\``)
              .join(", ")}; no actionable finding was identified in the scoped inspection.`;
          }),
        ]
      : []),
    "",
    "## Risk-Specific Evidence",
    "",
    ...(riskEvidence.length > 0
      ? riskEvidence.map(
          (entry) =>
            `- ${entry.riskId} / \`${entry.root}\`: Command \`${entry.command.command}\` output includes \`${firstAuditRepairOutputLine(entry.command.output)}\``,
        )
      : decision.outcome === "validated_no_findings"
        ? ["- Scoped evidence above covers each declared risk hypothesis."]
        : ["- No risk-specific evidence commands were run."]),
    "",
    "## Checked Files",
    "",
    ...(evidenceByRoot.some((entry) => entry.lineRefs.length > 0)
      ? evidenceByRoot
          .flatMap((entry) => entry.lineRefs)
          .sort()
          .map((ref) => `- \`${ref}\``)
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
  if (isIgnoredSynthesisEvidencePath(normalizedPath)) return null;
  const extensionMatch = normalizedPath.match(/(\.[A-Za-z0-9]+)$/);
  if (
    extensionMatch &&
    SYNTHESIS_IGNORED_EVIDENCE_EXTENSIONS.has(extensionMatch[1].toLowerCase())
  ) {
    return null;
  }
  return `${normalizedPath}:${line}`;
}

function normalizeSynthesisEvidencePath(rawPath: string): string | null {
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
  return normalizedPath;
}

function isIgnoredSynthesisEvidencePath(path: string): boolean {
  const normalizedPath = normalizeSynthesisEvidencePath(path);
  if (!normalizedPath) return true;
  return normalizedPath.split("/").some((part) => SYNTHESIS_IGNORED_EVIDENCE_PATH_PARTS.has(part));
}

function containsIgnoredSynthesisEvidencePath(text: string): boolean {
  const normalizedText = text.replaceAll("\\", "/");
  for (const part of SYNTHESIS_IGNORED_EVIDENCE_PATH_PARTS) {
    if (!part.startsWith(".")) continue;
    if (normalizedText.includes(`${part}/`) || normalizedText.includes(`${part}:`)) return true;
  }
  for (const match of text.matchAll(SYNTHESIS_LINE_EVIDENCE_REF_PATTERN)) {
    if (isIgnoredSynthesisEvidencePath(match[1] ?? "")) return true;
  }
  return false;
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
      extractAuditSynthesisCommandEvidence(artifact.content).filter(
        (evidence) =>
          !containsIgnoredSynthesisEvidencePath(evidence) &&
          !isLowQualitySynthesisCommandEvidence(evidence),
      ),
    );
  }
  return commandsByArtifact;
}

function isLowQualitySynthesisCommandEvidence(evidence: string): boolean {
  return (
    /\bgit\s+grep\s+-n\s+-m\s+1\s+\.\s+--\s+/i.test(evidence) ||
    /\bgit\s+ls-files\s+--\s+/i.test(evidence) ||
    /\bgit\s+grep\s+-n\s+-m\s+1\s+-E\b[^`'\n"]*[`'"]?[^`'\n"]*(?:owner-area|defects|that|produce)[^`'\n"]*[`'"]?/i.test(
      evidence,
    )
  );
}

function firstOutputLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "<empty>";
}

function lineNumberFromLineEvidenceRef(ref: string): number | null {
  const match = ref.match(/:(\d+)(?::\d+)?$/);
  if (!match) return null;
  const line = Number.parseInt(match[1], 10);
  return Number.isFinite(line) && line > 0 ? line : null;
}

function readLineEvidenceOutput(projectRoot: string, ref: string): string {
  const evidencePath = pathFromLineEvidenceRef(ref);
  const lineNumber = lineNumberFromLineEvidenceRef(ref);
  if (!lineNumber) return "<missing line reference>";
  const absolutePath = resolve(projectRoot, evidencePath);
  if (!existsSync(absolutePath)) return "<missing file>";
  const lines = readFileSync(absolutePath, "utf8").split(/\r?\n/);
  const line = lines[lineNumber - 1];
  return line === undefined ? "<missing line>" : line;
}

function formatSynthesisCheckedLineCommand(projectRoot: string, ref: string): string[] {
  const evidencePath = pathFromLineEvidenceRef(ref);
  const lineNumber = lineNumberFromLineEvidenceRef(ref);
  const output = readLineEvidenceOutput(projectRoot, ref);
  return [
    `- Command \`sed -n '${lineNumber ?? 1}p' -- ${evidencePath}\` output:`,
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
    const includedContent = new Set(includedFindings.map((finding) => finding.content));
    const omittedFindings = findingSections
      .filter((section) => !includedContent.has(section))
      .map((section) => ({
        artifactPath: artifact.artifactPath,
        taskId: artifact.taskId,
        content: section,
      }));
    return {
      artifact,
      includedFindings,
      omittedFindings,
      omittedFindingCount: omittedFindings.length,
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
  const cardDecisionSection = buildAuditCardDecisionSection(sourceSummaries, weakArtifacts);

  if (
    sourceOutcome.kind === "source_inconclusive" ||
    sourceOutcome.kind === "inconclusive_batch_evidence"
  ) {
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
      ...cardDecisionSection,
      ...buildWeakOrDiscardedFindingsSection(sourceSummaries, weakArtifacts),
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
      "## Source Report Carry Forward",
      "",
      ...(totalIncluded > 0
        ? sourceSummaries.flatMap((summary, sourceIndex) => {
            const lines = [
              `### Source Report ${sourceIndex + 1}: ${summary.artifact.artifactPath}`,
              "",
            ];
            if (summary.includedFindings.length === 0) {
              lines.push(
                "No findings from this source report passed the synthesis evidence filter.",
              );
              lines.push("");
              return lines;
            }
            summary.includedFindings.forEach((finding, findingIndex) => {
              lines.push(`#### Finding ${sourceIndex + 1}.${findingIndex + 1}`);
              lines.push("");
              lines.push(`Source report: \`${finding.artifactPath}\` (task ${finding.taskId})`);
              lines.push("");
              lines.push(finding.content.trim());
              lines.push("");
            });
            return lines;
          })
        : ["No trusted source findings were available for carry-forward.", ""]),
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
        const validationSummary = summarizeWeakArtifactValidationDetails(
          artifact.validationDetails,
        );
        if (validationSummary.length > 0) {
          lines.push(`  - Validation summary: ${validationSummary.join("; ")}`);
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
      ...cardDecisionSection,
      ...buildWeakOrDiscardedFindingsSection(sourceSummaries, weakArtifacts),
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
              ? `Command \`sed -n '${lineNumberFromLineEvidenceRef(refs[0]) ?? 1}p' -- ${firstEvidencePath}\` output includes \`${firstOutputLine(
                  readLineEvidenceOutput(projectRoot, refs[0]),
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
        : checkedRefs.length > 0
          ? checkedRefs.flatMap((ref) => formatSynthesisCheckedLineCommand(projectRoot, ref))
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
        const validationSummary = summarizeWeakArtifactValidationDetails(
          artifact.validationDetails,
        );
        if (validationSummary.length > 0) {
          lines.push(`  - Validation summary: ${validationSummary.join("; ")}`);
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
    ...cardDecisionSection,
    ...buildWeakOrDiscardedFindingsSection(sourceSummaries, weakArtifacts),
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
      const validationSummary = summarizeWeakArtifactValidationDetails(artifact.validationDetails);
      if (validationSummary.length > 0) {
        lines.push(`  - Validation summary: ${validationSummary.join("; ")}`);
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
  const sourceClassification = classifyAuditSourceEvidence({
    text: body,
    projectRoot: input.projectRoot,
    excludedReferencedPaths: [input.artifactPath],
    requireProposedFix: true,
  }).classification;
  const outcome = toAuditPublicReportOutcome(sourceClassification);
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
  const gitPath = normalizeArtifactGitPath(input.artifactPath);
  const artifactPath = resolveSafeArtifactPath(input.projectRoot, gitPath);
  mkdirSync(dirname(artifactPath), { recursive: true });
  const content = buildDeterministicAuditSynthesisContentWithManifest({
    ...input,
    artifactPath: gitPath,
  });
  writeFileSync(artifactPath, content, "utf8");
  const gitLog = commitArtifactIfChanged(input.projectRoot, gitPath);
  return [
    "Deterministic audit synthesis rework completed from validated report artifacts.",
    `Report artifact: ${gitPath}`,
    "Verification: Command `git log -1 --name-only --oneline -- <artifact>` output:",
    gitLog,
  ].join("\n");
}

type DeterministicAuditReportRepairResult = {
  status: "accepted" | "terminal_source_inconclusive";
  resultText: string;
  blockedReason: string | null;
  issueCodes: string[];
};

function runDeterministicAuditReportRepair(input: {
  task: TaskRow;
  projectRoot: string;
  artifactPath: string;
}): DeterministicAuditReportRepairResult {
  const gitPath = normalizeArtifactGitPath(input.artifactPath);
  const artifactPath = resolveSafeArtifactPath(input.projectRoot, gitPath);
  mkdirSync(dirname(artifactPath), { recursive: true });
  const repair = buildDeterministicAuditReportRepairContent({
    ...input,
    artifactPath: gitPath,
  });
  writeFileSync(artifactPath, repair.content, "utf8");
  const gitLog = commitArtifactIfChanged(
    input.projectRoot,
    gitPath,
    "Audit: repair report evidence",
  );
  const validation = validateAuditReportArtifactWithTaskContext({
    task: input.task,
    projectRoot: input.projectRoot,
    artifactPath: gitPath,
    requireLedgerEvidence: true,
  });
  if (!validation) {
    throw new Error(`deterministic audit report repair could not read ${input.artifactPath}`);
  }
  let status: DeterministicAuditReportRepairResult["status"];
  let blockedReason: string | null = null;
  if (isTrustedValidAuditReportValidation(validation)) {
    const roadmapArtifact = findRoadmapBatchArtifactByTaskId(input.task.id);
    updateRoadmapBatchArtifactState({
      taskId: input.task.id,
      state: "valid",
      failureFamily: null,
      classification: validation.sourceClassification,
      reworkStatus: "accepted",
      attemptBoundaryId: roadmapArtifact?.attemptBoundaryId ?? undefined,
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
    blockedReason = terminalizeSourceInconclusiveAuditReport({
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
    const validationDetails = buildAuditReportValidationDetails(validation, {
      deterministicRepair: {
        outcome: repair.decision.outcome,
        reasons: repair.decision.reasons,
        terminalHandling:
          "Strict validation failed after deterministic repair; source_inconclusive is terminal and runtime implementation rework is not allowed.",
      },
    });
    validationDetails.evidence = {
      auditReportValidation: {
        ...((validationDetails.evidence as { auditReportValidation?: Record<string, unknown> })
          .auditReportValidation ?? {}),
        sourceClassification: "source_inconclusive",
        validatorSourceClassification: validation.sourceClassification,
      },
    };
    blockedReason = terminalizeSourceInconclusiveAuditReport({
      task: input.task,
      projectRoot: input.projectRoot,
      artifactPath: input.artifactPath,
      reasons: repair.decision.reasons,
      validation,
      sourceSnapshotId: validation.sourceSnapshot?.id ?? repair.sourceSnapshot.id,
      validationDetails,
    });
    status = "terminal_source_inconclusive";
  }
  const issueCodes = auditReportValidationIssueCodes(validation);
  const resultText = [
    status === "accepted"
      ? "Deterministic audit report repair completed from scoped source evidence and passed strict validation."
      : "Deterministic audit report repair completed as source_inconclusive.",
    `Report artifact: ${input.artifactPath}`,
    status === "accepted"
      ? "Rejected prior candidate findings that did not meet the technical finding contract."
      : "Rejected prior candidate findings and persisted a terminal non-trusted source_inconclusive artifact state.",
    ...(status === "terminal_source_inconclusive"
      ? [
          `Unresolved strict validator issue codes: ${issueCodes.join(", ") || "unknown"}`,
          ...(blockedReason ? [`Blocked reason: ${blockedReason}`] : []),
        ]
      : []),
    ...(repair.decision.reasons.length > 0
      ? repair.decision.reasons.map((reason) => `Inconclusive reason: ${reason}`)
      : []),
    "Verification: Command `git log -1 --name-only --oneline -- <artifact>` output:",
    gitLog,
  ].join("\n");
  return { status, resultText, blockedReason, issueCodes };
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
  fallbackIssueCodes?: string[];
  sourceSnapshotId?: string | null;
  validationDetails?: Record<string, unknown>;
}): string {
  const issueCodes = input.validation
    ? auditReportValidationIssueCodes(input.validation)
    : [
        ...new Set(
          input.fallbackIssueCodes?.length
            ? input.fallbackIssueCodes
            : ["missing_report_file_references"],
        ),
      ].sort();
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
          issues: issueCodes.map((code) => ({
            code,
            message: `Strict deterministic repair validation could not read ${input.artifactPath}.`,
          })),
          evidence: {
            auditReportValidation: {
              ok: false,
              issueCodes,
              sourceClassification: "source_inconclusive",
              manifestStatus: "missing",
            },
          },
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
  const roadmapArtifact = findRoadmapBatchArtifactByTaskId(input.task.id);
  updateRoadmapBatchArtifactState({
    taskId: input.task.id,
    state: "source_inconclusive",
    failureFamily: "source_inconclusive",
    classification: "source_inconclusive",
    reworkStatus: "terminal_inconclusive",
    attemptBoundaryId: roadmapArtifact?.attemptBoundaryId ?? undefined,
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
  const gitPath = normalizeArtifactGitPath(input.artifactPath);
  const artifactPath = resolveSafeArtifactPath(input.projectRoot, gitPath);
  if (!existsSync(artifactPath)) return null;
  const auditPlanId = resolveAuditPlanId({
    taskId: input.task.id,
    roadmapBatchId: artifact?.batchId ?? null,
  });
  const auditEvidenceUnits = listAuditEvidenceEvents({
    taskId: input.task.id,
    auditPlanId,
  });
  const allowedEvidenceArtifactPaths =
    artifact?.role === "synthesis"
      ? listRoadmapReportArtifactsForSynthesis(artifact.batchId).map((entry) => entry.artifactPath)
      : [];
  return validateAuditReportArtifact({
    text: readFileSync(artifactPath, "utf8"),
    projectRoot: input.projectRoot,
    taskId: input.task.id,
    roadmapBatchId: artifact?.batchId ?? null,
    roadmapAlias: artifact?.roadmapAlias ?? input.task.roadmapAlias,
    auditPlanId,
    taskDescription: input.task.description,
    reportArtifactPaths: [gitPath],
    expectedReportArtifactPath: gitPath,
    allowedEvidenceArtifactPaths,
    requireProposedFix: true,
    auditEvidenceUnits,
    requireLedgerEvidence: input.requireLedgerEvidence ?? false,
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
  const auditScopeRepairability = expectedAuditReportArtifactPath
    ? diagnoseDeclaredAuditScopeRepairability(projectRoot, task.description)
    : { repairable: false, roots: [], reasons: [], issueCodes: [] };
  const localAuditReportScopeRepairable = Boolean(
    expectedAuditReportArtifactPath && auditScopeRepairability.repairable,
  );
  const retryingTerminalSourceInconclusiveAuditReport =
    expectedAuditReportArtifactPath &&
    isRetryingTerminalSourceInconclusiveAuditReport({
      task,
      artifact: roadmapArtifact,
    });
  const currentSourceInconclusiveLocalAudit =
    Boolean(
      expectedAuditReportArtifactPath && task.reworkRequested && localAuditReportScopeRepairable,
    ) &&
    (roadmapArtifact?.state === "source_inconclusive" ||
      currentAuditReportValidation?.manifest?.outcome === "source_inconclusive" ||
      currentAuditReportValidation?.sourceClassification === "source_inconclusive");

  if (
    selectedPlan &&
    parsedTaskCount > 0 &&
    pendingTaskCount === 0 &&
    !task.reworkRequested &&
    !expectedSynthesisArtifactPath &&
    !expectedAuditReportArtifactPath
  ) {
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
    roadmapArtifact?.state === "source_inconclusive" &&
    !currentSourceInconclusiveLocalAudit
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
    currentAuditReportValidation?.manifest?.outcome === "source_inconclusive" &&
    !currentSourceInconclusiveLocalAudit
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
      blockedReason: null,
      blockedFromStatus: null,
      retryAfter: null,
      manualReviewRequired: false,
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
    currentAuditReportValidation.sourceClassification === "source_inconclusive" &&
    !currentSourceInconclusiveLocalAudit
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

  if (expectedSynthesisArtifactPath) {
    const nowIso = new Date().toISOString();
    logDeterministicAuditSynthesisActivity({
      taskId,
      phase: "started",
      artifactPath: expectedSynthesisArtifactPath,
      sourceArtifactPaths: [
        ...validatedAuditArtifacts.map((artifact) => artifact.artifactPath),
        ...weakAuditArtifacts.map((artifact) => artifact.artifactPath),
      ],
    });
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
    logDeterministicAuditSynthesisActivity({
      taskId,
      phase: "complete",
      artifactPath: expectedSynthesisArtifactPath,
    });
    log.info(
      { taskId, artifactPath: expectedSynthesisArtifactPath },
      "Audit synthesis completed deterministically",
    );
    return;
  }

  if (
    expectedAuditReportArtifactPath &&
    !task.reworkRequested &&
    !localAuditReportScopeRepairable &&
    !retryingTerminalSourceInconclusiveAuditReport
  ) {
    const nowIso = new Date().toISOString();
    const blockedReason = terminalizeSourceInconclusiveAuditReport({
      task,
      projectRoot,
      artifactPath: expectedAuditReportArtifactPath,
      reasons: auditScopeRepairability.reasons,
      fallbackIssueCodes: auditScopeRepairability.issueCodes,
      validationDetails: {
        issues: auditScopeRepairability.issueCodes.map((code) => ({
          code,
          message: auditScopeRepairability.reasons.join("; "),
        })),
        evidence: {
          auditReportValidation: {
            ok: false,
            issueCodes: auditScopeRepairability.issueCodes,
            sourceClassification: "source_inconclusive",
            manifestStatus: "not_applicable",
          },
        },
        sourceInconclusiveTerminal: {
          artifactPath: expectedAuditReportArtifactPath,
          reasons: auditScopeRepairability.reasons,
          issueCodes: auditScopeRepairability.issueCodes,
          declaredScopeRoots: auditScopeRepairability.roots,
        },
      },
    });
    const resultText = [
      "Audit report card has a non-repairable declared scope; terminalized as source_inconclusive before runtime prompt construction.",
      `Report artifact: ${expectedAuditReportArtifactPath}`,
      `Declared scope roots: ${auditScopeRepairability.roots.join(", ") || "none"}`,
      `Diagnostics: ${auditScopeRepairability.reasons.join("; ")}`,
      `Blocked reason: ${blockedReason}`,
    ].join("\n");
    setTaskFields(taskId, {
      implementationLog: resultText,
      blockedReason,
      reworkRequested: false,
      manualReviewRequired: false,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    logActivity(
      taskId,
      "Agent",
      "Audit report card terminalized as source_inconclusive before runtime prompt construction: non-repairable declared scope",
    );
    log.info(
      {
        taskId,
        artifactPath: expectedAuditReportArtifactPath,
        reasons: auditScopeRepairability.reasons,
      },
      "Audit report card terminalized before runtime prompt construction because declared scope is non-repairable",
    );
    return;
  }

  if (
    expectedAuditReportArtifactPath &&
    !task.reworkRequested &&
    !localAuditReportScopeRepairable &&
    retryingTerminalSourceInconclusiveAuditReport
  ) {
    logActivity(
      taskId,
      "Agent",
      "Audit report retry bypassed non-repairable declared-scope preflight and will run runtime implementation",
    );
    log.info(
      {
        taskId,
        artifactPath: expectedAuditReportArtifactPath,
        reasons: auditScopeRepairability.reasons,
      },
      "Audit report retry bypassed non-repairable declared-scope preflight",
    );
  }

  if (expectedAuditReportArtifactPath && !task.reworkRequested && localAuditReportScopeRepairable) {
    const nowIso = new Date().toISOString();
    logDeterministicAuditReportRepairActivity({
      taskId,
      phase: "started",
      artifactPath: expectedAuditReportArtifactPath,
    });
    const repairResult = runDeterministicAuditReportRepair({
      task,
      projectRoot,
      artifactPath: expectedAuditReportArtifactPath,
    });
    const acceptedRepair = repairResult.status === "accepted";
    setTaskFields(taskId, {
      implementationLog: repairResult.resultText,
      reworkRequested: false,
      ...(acceptedRepair
        ? {
            blockedReason: null,
            blockedFromStatus: null,
            retryAfter: null,
            manualReviewRequired: false,
          }
        : {}),
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    logActivity(
      taskId,
      "Agent",
      repairResult.status === "terminal_source_inconclusive"
        ? `Deterministic audit report first-run generation terminalized as source_inconclusive: ${repairResult.issueCodes.join(", ") || "unknown"}`
        : "Deterministic audit report first-run generation complete",
    );
    logDeterministicAuditReportRepairActivity({
      taskId,
      phase:
        repairResult.status === "terminal_source_inconclusive"
          ? "terminal_source_inconclusive"
          : "complete",
      artifactPath: expectedAuditReportArtifactPath,
      issueCodes: repairResult.issueCodes,
    });
    log.info(
      {
        taskId,
        artifactPath: expectedAuditReportArtifactPath,
        issueCodes: repairResult.issueCodes,
        status: repairResult.status,
      },
      "Audit report first run completed deterministically",
    );
    return;
  }

  if (
    expectedAuditReportArtifactPath &&
    (auditEvidenceRepairMode ||
      currentReportNeedsDeterministicRepair ||
      currentSourceInconclusiveLocalAudit) &&
    (currentSourceInconclusiveLocalAudit ||
      shouldUseDeterministicAuditReportRepair(task, currentAuditReportIssueCodes)) &&
    (!repeatedDeterministicAuditReportRepair || currentSourceInconclusiveLocalAudit)
  ) {
    const nowIso = new Date().toISOString();
    logDeterministicAuditReportRepairActivity({
      taskId,
      phase: "started",
      artifactPath: expectedAuditReportArtifactPath,
    });
    const repairResult = runDeterministicAuditReportRepair({
      task,
      projectRoot,
      artifactPath: expectedAuditReportArtifactPath,
    });
    const resultText = repairResult.resultText;
    const acceptedRepair = repairResult.status === "accepted";
    setTaskFields(taskId, {
      implementationLog: resultText,
      reworkRequested: false,
      ...(acceptedRepair
        ? {
            blockedReason: null,
            blockedFromStatus: null,
            retryAfter: null,
            manualReviewRequired: false,
          }
        : {}),
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    logActivity(
      taskId,
      "Agent",
      repairResult.status === "terminal_source_inconclusive"
        ? `Deterministic audit report repair terminalized as source_inconclusive: ${repairResult.issueCodes.join(", ") || "unknown"}`
        : "Deterministic audit report repair complete",
    );
    logDeterministicAuditReportRepairActivity({
      taskId,
      phase:
        repairResult.status === "terminal_source_inconclusive"
          ? "terminal_source_inconclusive"
          : "complete",
      artifactPath: expectedAuditReportArtifactPath,
      issueCodes: repairResult.issueCodes,
    });
    log.info(
      {
        taskId,
        artifactPath: expectedAuditReportArtifactPath,
        issueCodes: repairResult.issueCodes,
      },
      repairResult.status === "terminal_source_inconclusive"
        ? "Audit report rework completed deterministically as source_inconclusive"
        : "Audit report rework completed deterministically",
    );
    return;
  }

  if (
    expectedAuditReportArtifactPath &&
    task.reworkRequested &&
    repeatedDeterministicAuditReportRepair &&
    !currentSourceInconclusiveLocalAudit &&
    (currentAuditReportValidation == null ||
      !isTrustedValidAuditReportValidation(currentAuditReportValidation))
  ) {
    const nowIso = new Date().toISOString();
    const issueCodes =
      currentAuditReportValidation != null
        ? auditReportValidationIssueCodes(currentAuditReportValidation)
        : [
            ...new Set(
              currentAuditReportIssueCodes.length
                ? currentAuditReportIssueCodes
                : ["missing_report_file_references"],
            ),
          ].sort();
    const blockedReason = terminalizeSourceInconclusiveAuditReport({
      task,
      projectRoot,
      artifactPath: expectedAuditReportArtifactPath,
      validation: currentAuditReportValidation,
      fallbackIssueCodes: currentAuditReportIssueCodes,
      reasons: ["repeated deterministic audit report repair still failed strict validation"],
    });
    const resultText = [
      "Repeated deterministic audit report repair did not satisfy strict validation; terminalized as source_inconclusive before runtime implementation rework.",
      `Report artifact: ${expectedAuditReportArtifactPath}`,
      `Unresolved strict validator issue codes: ${issueCodes.join(", ") || "unknown"}`,
      `Blocked reason: ${blockedReason}`,
    ].join("\n");
    setTaskFields(taskId, {
      implementationLog: resultText,
      blockedReason,
      reworkRequested: false,
      manualReviewRequired: false,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    logActivity(
      taskId,
      "Agent",
      `Repeated deterministic audit report repair terminalized as source_inconclusive: ${issueCodes.join(", ") || "unknown"}`,
    );
    log.info(
      {
        taskId,
        artifactPath: expectedAuditReportArtifactPath,
        issueCodes,
      },
      "Repeated deterministic audit report repair terminalized before runtime implementation rework",
    );
    return;
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
11) Before handing back to review, perform a pre-review self-check against every blocking finding ID in BLOCKING_FINDINGS_SNAPSHOT. For each ID, identify the concrete closure condition, the file/artifact change or observed evidence that satisfies it, and whether the same finding remains unresolved.
12) When a deterministic validator or guard exists, run the relevant self-check before closing. For audit/report artifacts, prove valid manifest requirements, bound evidenceRefs, declared scope coverage, and substantive evidence before review handoff.
13) Do not claim a finding is addressed unless the final result text names its exact ID and includes closure evidence. If any finding ID remains unresolved or lacks proof, say so explicitly and leave the task for blocked/manual handling rather than presenting the rework as complete.
14) In the final result text, explicitly list which blocking finding IDs from BLOCKING_FINDINGS_SNAPSHOT were addressed and which IDs remain unresolved, and include the git log verification for any report artifact commit.`
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
${formatImplementationManifestPrompt(task, selectedPlan)}
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
    profileMode: "implementer",
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
  const implementationManifestJson = await extractNormalizedImplementationManifest(enrichedResult);

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

  const taskPatch: TaskFieldsPatch & { implementationManifestJson?: string | null } = {
    implementationLog: enrichedResult,
    reworkRequested: false,
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  };
  if (implementationManifestJson && taskSupportsImplementationManifestField(task)) {
    taskPatch.implementationManifestJson = implementationManifestJson;
  }
  setTaskFields(taskId, taskPatch);

  log.debug({ taskId }, "Implementation log saved to task");
}
