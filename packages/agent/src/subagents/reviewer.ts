import {
  assertSafeRoadmapArtifactPath,
  listAuditEvidenceEvents,
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  listRoadmapReportArtifactsForSynthesis,
  setTaskFields,
  type TaskRow,
} from "@aif/data";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { createRuntimeWorkflowSpec, type RuntimeWorkflowSpec } from "@aif/runtime";
import {
  getEnv,
  logger,
  redactProviderText,
  classifyAuditSynthesisOutput,
  formatAttachmentsForPrompt,
  formatTaskIntentContractForPrompt,
  resolveAuditPlanId,
  validateAuditReportArtifact,
  type AutoReviewState,
  type AutoReviewFinding,
  type AutoReviewStrategy,
} from "@aif/shared";
import { assertCurrentBranch, restorePersistedBranch } from "../gitBranch.js";
import { flushActivityQueue, logActivity } from "../hooks.js";
import { buildTaskMemoryContext } from "../memoryContext.js";
import { executeSubagentQuery, startHeartbeat } from "../subagentQuery.js";
import {
  buildStructuredReviewComments,
  createAutoReviewFindingId,
  formatPreviousFindingsForPrompt,
  parseStructuredSidecarOutput,
} from "../reviewContract.js";

const log = logger("reviewer");
const AUDIT_ARTIFACT_REVIEW_MAX_TURNS = 20;
const AUDIT_ARTIFACT_REVIEW_INSPECTION_TOOL_BUDGET = 8;

const STRUCTURED_REVIEW_CONTRACT_FAILURE_TEXT =
  "Structured review contract not satisfied: review output must include complete unique Security Coverage rows for secret_leaks, permissions_sandbox, unsafe_shell_network_file, and dependency_config.";

const REVIEWER_PROMPT_SECTION_LIMITS = {
  findingText: 900,
  snapshotText: 8_000,
  snapshotEntry: 1_200,
  blockerCount: 20,
  changedFilesSummaryCount: 25,
};

function compactReviewerPromptText(label: string, value: string, maxChars: number): string {
  const redacted = redactProviderText(value)
    .replace(/\[REDACTED\]\]+/g, "[REDACTED]")
    .trim();
  if (redacted.length <= maxChars) return redacted;
  return `${redacted.slice(0, maxChars).trimEnd()} [... ${label} truncated ...]`;
}

function compactReviewerPromptBlock(label: string, value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()} [... ${label} truncated ...]`;
}

function formatReviewerAutoReviewStateForPrompt(state: AutoReviewState | null | undefined): string {
  if (!state) {
    return "No persisted auto-review rework context.";
  }

  const visibleFindings = state.findings.slice(0, REVIEWER_PROMPT_SECTION_LIMITS.blockerCount);
  const omittedCount = Math.max(0, state.findings.length - visibleFindings.length);
  const lines = [
    `strategy: ${state.strategy}`,
    `iteration: ${state.iteration}`,
    "blocking findings:",
    ...(visibleFindings.length > 0
      ? visibleFindings.map((finding) => {
          const text = compactReviewerPromptText(
            "BLOCKING_FINDING_TEXT",
            finding.text,
            REVIEWER_PROMPT_SECTION_LIMITS.findingText,
          );
          const status = finding.status ? ` | status: ${finding.status}` : "";
          return `- [${finding.id}] ${finding.source}${status} | ${text}`;
        })
      : ["- none"]),
  ];
  if (omittedCount > 0) {
    lines.push(`- [... ${omittedCount} additional blocking finding(s) omitted ...]`);
  }

  const snapshot = state.reworkSnapshot;
  if (!snapshot) {
    lines.push("rework snapshot: none");
    return compactReviewerPromptBlock(
      "AUTO_REVIEW_REWORK_CONTEXT",
      lines.join("\n"),
      REVIEWER_PROMPT_SECTION_LIMITS.snapshotText,
    );
  }

  lines.push("rework snapshot:");
  lines.push(`- iteration: ${snapshot.iteration}`);
  lines.push(
    `- artifactPath: ${compactReviewerPromptText(
      "ARTIFACT_PATH",
      snapshot.artifactPath,
      REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
    )}`,
  );
  lines.push(
    `- artifactContentSha: ${compactReviewerPromptText(
      "ARTIFACT_CONTENT_SHA",
      snapshot.artifactContentSha ?? "null",
      REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
    )}`,
  );
  if (snapshot.baselineHeadSha) {
    lines.push(
      `- baselineHeadSha: ${compactReviewerPromptText(
        "BASELINE_HEAD_SHA",
        snapshot.baselineHeadSha,
        REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
      )}`,
    );
  }
  if (snapshot.changedFilesDigest) {
    lines.push(
      `- changedFilesDigest: ${compactReviewerPromptText(
        "CHANGED_FILES_DIGEST",
        snapshot.changedFilesDigest,
        REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
      )}`,
    );
  }
  if (snapshot.findingIds.length > 0) {
    const findingIds = snapshot.findingIds.map((findingId) =>
      compactReviewerPromptText(
        "FINDING_ID",
        findingId,
        REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
      ),
    );
    lines.push(`- exact blocker ids: ${findingIds.join(", ")}`);
  }
  if (snapshot.requiredEvidenceByFindingId) {
    lines.push("- required evidence by blocker id:");
    for (const [findingId, evidence] of Object.entries(snapshot.requiredEvidenceByFindingId)) {
      lines.push(
        `  - [${findingId}] ${compactReviewerPromptText(
          "REQUIRED_EVIDENCE",
          evidence,
          REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
        )}`,
      );
    }
  }
  if (snapshot.forbiddenChanges && snapshot.forbiddenChanges.length > 0) {
    lines.push("- forbidden unrelated changes:");
    for (const change of snapshot.forbiddenChanges) {
      lines.push(
        `  - ${compactReviewerPromptText(
          "FORBIDDEN_CHANGE",
          change,
          REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
        )}`,
      );
    }
  }
  if (snapshot.changedFilesSummary && snapshot.changedFilesSummary.length > 0) {
    lines.push("- prior attempt changed files summary:");
    for (const entry of snapshot.changedFilesSummary.slice(
      0,
      REVIEWER_PROMPT_SECTION_LIMITS.changedFilesSummaryCount,
    )) {
      lines.push(
        `  - ${compactReviewerPromptText(
          "CHANGED_FILE_SUMMARY",
          entry,
          REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
        )}`,
      );
    }
  }

  return compactReviewerPromptBlock(
    "AUTO_REVIEW_REWORK_CONTEXT",
    lines.join("\n"),
    REVIEWER_PROMPT_SECTION_LIMITS.snapshotText,
  );
}

function buildStructuredReviewContractFailureComments(input: {
  strategy: "full_re_review" | "closure_first";
  iteration: number;
  parsedReview: boolean;
  parsedSecurity: boolean;
  rawCodeReview: string;
  rawSecurityAudit: string;
}): string {
  const failedSidecars = [
    !input.parsedReview ? "code_review" : null,
    !input.parsedSecurity ? "security_audit" : null,
  ].filter((entry): entry is string => Boolean(entry));
  const note = `${STRUCTURED_REVIEW_CONTRACT_FAILURE_TEXT} Failed sidecar(s): ${failedSidecars.join(", ")}.`;

  return [
    "## Auto Review Metadata",
    `- Strategy: ${input.strategy}`,
    `- Review Iteration: ${input.iteration}`,
    "- Contract Failure: structured_review_sidecar",
    "",
    "## Previous Findings",
    "- none",
    "",
    "## Blocking Findings",
    `- [structured-review-contract] review_gate | ${note}`,
    "",
    "## Advisories",
    "- review_gate | Raw sidecar output is retained below with provider-text redaction applied.",
    "",
    "## Security Coverage",
    "- secret_leaks | not_checked | Structured review contract failed before secret-leak coverage could be trusted.",
    "- permissions_sandbox | not_checked | Structured review contract failed before permission and sandbox coverage could be trusted.",
    "- unsafe_shell_network_file | not_checked | Structured review contract failed before shell, network, and file-operation coverage could be trusted.",
    "- dependency_config | not_checked | Structured review contract failed before dependency and configuration coverage could be trusted.",
    "",
    "## Raw Code Review",
    redactProviderText(input.rawCodeReview.trim()) || "No code review output.",
    "",
    "## Raw Security Audit",
    redactProviderText(input.rawSecurityAudit.trim()) || "No security audit output.",
  ].join("\n");
}

async function runSidecar(
  prompt: string,
  taskId: string,
  projectRoot: string,
  agentName: string,
  maxBudgetUsd: number | null,
  useSubagentAgent: boolean,
  workflowSpec: RuntimeWorkflowSpec,
  fallbackSlashCommand?: string,
  maxTurns?: number,
  repositoryInspectionToolBudget?: number,
): Promise<string> {
  const { resultText } = await executeSubagentQuery({
    taskId,
    projectRoot,
    agentName,
    prompt,
    profileMode: workflowSpec.workflowKind === "review-security" ? "security" : "reviewer",
    maxBudgetUsd,
    agent: useSubagentAgent ? agentName : undefined,
    workflowSpec,
    workflowKind: workflowSpec.workflowKind,
    fallbackSlashCommand,
    maxTurns,
    repositoryInspectionToolBudget,
  });
  return resultText;
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function resolveSafeArtifactPath(
  rootPath: string,
  artifactPath: string,
): {
  gitPath: string;
  absolutePath: string;
} | null {
  try {
    const gitPath = assertSafeRoadmapArtifactPath(artifactPath);
    const root = resolve(rootPath);
    const absolutePath = resolve(root, gitPath);
    if (!isPathInsideRoot(root, absolutePath)) return null;
    return { gitPath, absolutePath };
  } catch {
    return null;
  }
}

function validateAuditReportForDeterministicReview(input: {
  task: TaskRow;
  projectRoot: string;
  artifact: NonNullable<ReturnType<typeof findRoadmapBatchArtifactByTaskId>>;
}): ReturnType<typeof validateAuditReportArtifact> | null {
  if (input.artifact.role !== "report" && input.artifact.role !== "synthesis") return null;
  const resolvedArtifact = resolveSafeArtifactPath(input.projectRoot, input.artifact.artifactPath);
  if (!resolvedArtifact || !existsSync(resolvedArtifact.absolutePath)) return null;
  const allowedEvidenceArtifactPaths =
    input.artifact.role === "synthesis"
      ? listRoadmapReportArtifactsForSynthesis(input.artifact.batchId).map(
          (artifact) => artifact.artifactPath,
        )
      : [];
  const auditPlanId = resolveAuditPlanId({
    taskId: input.task.id,
    roadmapBatchId: input.artifact.batchId,
  });
  const auditEvidenceUnits = listAuditEvidenceEvents({
    taskId: input.task.id,
    auditPlanId,
  });
  return validateAuditReportArtifact({
    text: readFileSync(resolvedArtifact.absolutePath, "utf8"),
    projectRoot: input.projectRoot,
    taskId: input.task.id,
    roadmapBatchId: input.artifact.batchId,
    roadmapAlias: input.artifact.roadmapAlias ?? input.task.roadmapAlias,
    auditPlanId,
    taskDescription: input.task.description,
    reportArtifactPaths: [resolvedArtifact.gitPath],
    expectedReportArtifactPath: resolvedArtifact.gitPath,
    allowedEvidenceArtifactPaths,
    requireProposedFix: true,
    auditEvidenceUnits,
    requireLedgerEvidence: true,
  });
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

function auditReportValidationIssueCodes(
  validation: ReturnType<typeof validateAuditReportArtifact> | null,
): string[] {
  if (!validation) return [];
  return [...new Set(validation.issues.map((issue) => issue.code))].sort();
}

type TrustedAuditSourceClassification = "validated_no_findings" | "validated_findings_present";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseValidationDetailsJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readAuditSourceClassification(value: unknown): string | null {
  if (!isObjectRecord(value)) return null;
  const direct = value.sourceClassification;
  if (typeof direct === "string") return direct;
  const auditReportValidation = value.auditReportValidation;
  if (isObjectRecord(auditReportValidation)) {
    const nested = auditReportValidation.sourceClassification;
    if (typeof nested === "string") return nested;
  }
  const evidence = value.evidence;
  if (isObjectRecord(evidence)) return readAuditSourceClassification(evidence);
  return null;
}

function toTrustedAuditSourceClassification(
  value: string | null | undefined,
): TrustedAuditSourceClassification | null {
  if (value === "validated_no_findings" || value === "validated_findings_present") return value;
  return null;
}

function readPersistedTrustedAuditSourceClassification(
  artifact: ReturnType<typeof listRoadmapReportArtifactsForSynthesis>[number],
): TrustedAuditSourceClassification | null {
  return toTrustedAuditSourceClassification(
    readAuditSourceClassification(parseValidationDetailsJson(artifact.validationDetailsJson)),
  );
}

function formatAuditArtifactReviewScopeBlock(input: {
  artifact: NonNullable<ReturnType<typeof findRoadmapBatchArtifactByTaskId>> | null;
  validation: ReturnType<typeof validateAuditReportArtifact> | null;
}): string {
  if (
    !input.artifact ||
    (input.artifact.role !== "report" && input.artifact.role !== "synthesis")
  ) {
    return "";
  }

  const issueCodes = auditReportValidationIssueCodes(input.validation);
  const validationSummary = input.validation
    ? [
        `ok=${input.validation.ok}`,
        `manifestStatus=${input.validation.manifestStatus}`,
        `sourceClassification=${input.validation.sourceClassification}`,
        `issueCodes=${issueCodes.join(", ") || "none"}`,
      ].join("; ")
    : "validation unavailable before sidecar review";

  return `Audit artifact review scope:
- Expected artifact: ${input.artifact.artifactPath}
- Artifact role: ${input.artifact.role}
- Deterministic validator state: ${validationSummary}
- Review only the expected artifact, implementation log, validator issue codes, and repository files explicitly cited by the artifact or required to verify a cited claim.
- Do not run a repository-wide audit, dependency inventory, or repeated broad reads. This sidecar verifies report trustworthiness; it does not re-run the source audit.
- Use no more than 8 repository-inspection tool calls. If the validator state already proves the artifact cannot be trusted, report that concrete blocker instead of exploring unrelated files.
`;
}

function buildDeterministicAuditReportReviewComments(input: {
  strategy: AutoReviewStrategy;
  iteration: number;
  artifactPath: string;
  validation: ReturnType<typeof validateAuditReportArtifact>;
  previousFindings: AutoReviewFinding[];
}): string {
  const closureEvidence = `Manifest, evidenceRefs, scope coverage, and substantive evidence are valid in \`${input.artifactPath}\` after deterministic review-gate validation.`;
  const previousFindingLines =
    input.previousFindings.length > 0
      ? input.previousFindings.map(
          (finding) => `- [${finding.id}] ${finding.source} | resolved | ${closureEvidence}`,
        )
      : ["- none"];
  const validationSummary = [
    `audit report validation accepted \`${input.artifactPath}\``,
    `manifestStatus=${input.validation.manifestStatus}`,
    `sourceClassification=${input.validation.sourceClassification}`,
  ].join("; ");

  return [
    "## Auto Review Metadata",
    `- Strategy: ${input.strategy}`,
    `- Review Iteration: ${input.iteration}`,
    "- Deterministic Review: audit_report_validation",
    "",
    "## Previous Findings",
    ...previousFindingLines,
    "",
    "## Blocking Findings",
    "- none",
    "",
    "## Advisories",
    `- review_gate | ${validationSummary}.`,
    "",
    "## Security Coverage",
    "- secret_leaks | covered | Deterministic review inspected the audit report manifest and bound ledger evidence without exposing secret values.",
    "- permissions_sandbox | covered | Deterministic review validated scoped report artifact evidence and did not require write access beyond prior implementation output.",
    "- unsafe_shell_network_file | covered | Deterministic review used read-only artifact validation and recorded repository inspection activity.",
    "- dependency_config | covered | Deterministic review checked declared audit scope coverage through the valid audit report manifest.",
    "",
    "## Raw Code Review",
    `Deterministic review-gate accepted ${input.artifactPath}. ${closureEvidence}`,
    "",
    "## Raw Security Audit",
    `Deterministic security review accepted ${input.artifactPath}. ${validationSummary}.`,
  ].join("\n");
}

function buildDeterministicAuditReportInvalidReviewComments(input: {
  strategy: AutoReviewStrategy;
  iteration: number;
  artifactPath: string;
  validation: ReturnType<typeof validateAuditReportArtifact>;
  previousFindings: AutoReviewFinding[];
}): string {
  const issueCodes = [
    ...new Set(input.validation.issues.map((issue) => issue.code).filter(Boolean)),
  ].sort();
  const validationSummary = [
    `manifestStatus=${input.validation.manifestStatus}`,
    `sourceClassification=${input.validation.sourceClassification}`,
    `issueCodes=${issueCodes.join(", ") || "unknown"}`,
  ].join("; ");
  const previousFindingLines =
    input.previousFindings.length > 0
      ? input.previousFindings.map(
          (finding) =>
            `- [${finding.id}] ${finding.source} | still_blocking | Deterministic audit report validation still rejects \`${input.artifactPath}\` (${validationSummary}). Rework the artifact before this blocker can be closed.`,
        )
      : ["- none"];
  const blockingLines =
    input.validation.issues.length > 0
      ? input.validation.issues.map((issue) => {
          const text = `Audit report validator blocked completion (${issue.code}): ${issue.message}`;
          return `- [${createAutoReviewFindingId("review_gate", text)}] review_gate | ${text}`;
        })
      : [
          `- [${createAutoReviewFindingId(
            "review_gate",
            "Audit report validator blocked completion: artifact is not trusted.",
          )}] review_gate | Audit report validator blocked completion: artifact is not trusted.`,
        ];

  return [
    "## Auto Review Metadata",
    `- Strategy: ${input.strategy}`,
    `- Review Iteration: ${input.iteration}`,
    "- Deterministic Review: audit_report_validation_failed",
    "",
    "## Previous Findings",
    ...previousFindingLines,
    "",
    "## Blocking Findings",
    ...blockingLines,
    "",
    "## Advisories",
    `- review_gate | Deterministic validation rejected \`${input.artifactPath}\`; sidecar review was skipped to avoid budget-exhaustion contract failures.`,
    "",
    "## Security Coverage",
    "- secret_leaks | not_checked | Audit report artifact failed deterministic manifest/evidence validation before security sidecar evidence could be trusted.",
    "- permissions_sandbox | not_checked | Audit report artifact failed deterministic manifest/evidence validation before permission or sandbox claims could be trusted.",
    "- unsafe_shell_network_file | not_checked | Audit report artifact failed deterministic manifest/evidence validation before shell, network, or file-operation claims could be trusted.",
    "- dependency_config | not_checked | Audit report artifact failed deterministic manifest/evidence validation before dependency/configuration claims could be trusted.",
    "",
    "## Raw Code Review",
    `Deterministic review-gate rejected ${input.artifactPath}. ${validationSummary}.`,
    "",
    "## Raw Security Audit",
    `Security sidecar skipped because deterministic audit report validation already produced blocking issues for ${input.artifactPath}.`,
  ].join("\n");
}

function buildDeterministicAuditArtifactMissingReviewComments(input: {
  strategy: AutoReviewStrategy;
  iteration: number;
  artifactPath: string;
  role: "report" | "synthesis";
  previousFindings: AutoReviewFinding[];
}): string {
  const issueCode =
    input.role === "synthesis" ? "missing_synthesis_artifact" : "missing_report_artifact";
  const issueText = `Expected audit ${input.role} artifact \`${input.artifactPath}\` was not found in the task checkout. Rework must create the exact declared artifact before reviewer sidecars can be trusted.`;
  const previousFindingLines =
    input.previousFindings.length > 0
      ? input.previousFindings.map(
          (finding) =>
            `- [${finding.id}] ${finding.source} | still_blocking | The expected artifact \`${input.artifactPath}\` is still missing, so closure evidence is unavailable.`,
        )
      : ["- none"];

  return [
    "## Auto Review Metadata",
    `- Strategy: ${input.strategy}`,
    `- Review Iteration: ${input.iteration}`,
    "- Deterministic Review: audit_artifact_missing",
    "",
    "## Previous Findings",
    ...previousFindingLines,
    "",
    "## Blocking Findings",
    `- [${createAutoReviewFindingId("review_gate", issueText)}] review_gate | Audit report validator blocked completion (${issueCode}): ${issueText}`,
    "",
    "## Advisories",
    `- review_gate | Sidecar review was skipped because \`${input.artifactPath}\` is missing; running broad repository review would hide the artifact-production failure and risk budget exhaustion.`,
    "",
    "## Security Coverage",
    "- secret_leaks | not_checked | Audit artifact is missing, so report-backed security evidence cannot be trusted.",
    "- permissions_sandbox | not_checked | Audit artifact is missing, so permission and sandbox claims cannot be verified.",
    "- unsafe_shell_network_file | not_checked | Audit artifact is missing, so shell, network, and file-operation claims cannot be verified.",
    "- dependency_config | not_checked | Audit artifact is missing, so dependency/configuration claims cannot be verified.",
    "",
    "## Raw Code Review",
    `Deterministic review-gate rejected ${input.artifactPath}: ${issueText}`,
    "",
    "## Raw Security Audit",
    `Security sidecar skipped because deterministic audit artifact validation already produced ${issueCode}.`,
  ].join("\n");
}

function buildDeterministicAuditSynthesisInconclusiveReviewComments(input: {
  strategy: AutoReviewStrategy;
  iteration: number;
  artifactPath: string;
  outcomeReason: string;
  previousFindings: AutoReviewFinding[];
}): string {
  const closureEvidence = `Deterministic review-gate accepted \`${input.artifactPath}\` as an explicit terminal audit inconclusive synthesis; weak or untrusted source reports were not promoted to validated findings.`;
  const previousFindingLines =
    input.previousFindings.length > 0
      ? input.previousFindings.map(
          (finding) => `- [${finding.id}] ${finding.source} | resolved | ${closureEvidence}`,
        )
      : ["- none"];

  return [
    "## Auto Review Metadata",
    `- Strategy: ${input.strategy}`,
    `- Review Iteration: ${input.iteration}`,
    "- Deterministic Review: audit_synthesis_inconclusive",
    "",
    "## Previous Findings",
    ...previousFindingLines,
    "",
    "## Blocking Findings",
    "- none",
    "",
    "## Advisories",
    `- review_gate | ${closureEvidence} Reason: ${input.outcomeReason}`,
    "",
    "## Security Coverage",
    "- secret_leaks | covered | Deterministic review inspected only the audit synthesis artifact and did not expose secret values.",
    "- permissions_sandbox | covered | Deterministic review used read-only artifact validation and did not require additional write access.",
    "- unsafe_shell_network_file | covered | Deterministic review did not execute shell, network, or file mutation operations beyond reading the synthesis artifact.",
    "- dependency_config | not_applicable | No dependency or runtime configuration change is introduced by a terminal audit synthesis artifact.",
    "",
    "## Raw Code Review",
    `Deterministic review-gate accepted ${input.artifactPath} as terminal audit inconclusive. ${input.outcomeReason}`,
    "",
    "## Raw Security Audit",
    `Deterministic security review accepted ${input.artifactPath} as read-only terminal audit synthesis output.`,
  ].join("\n");
}

function isTrustedDeterministicAuditSynthesisOutcome(input: {
  outcome: NonNullable<ReturnType<typeof classifyAuditSynthesisOutput>>;
  sourceReports: ReturnType<typeof listRoadmapReportArtifactsForSynthesis>;
}): boolean {
  if (
    input.outcome.kind !== "validated_no_findings" &&
    input.outcome.kind !== "validated_findings_present"
  ) {
    return false;
  }
  if (input.sourceReports.length === 0) return false;
  if (input.outcome.sourceReportCount !== input.sourceReports.length) return false;
  if (input.outcome.weakReportCount !== 0) return false;
  if (!input.sourceReports.every((artifact) => artifact.state === "valid")) return false;
  const sourceClassifications = input.sourceReports
    .map(readPersistedTrustedAuditSourceClassification)
    .filter((classification): classification is TrustedAuditSourceClassification =>
      Boolean(classification),
    );
  if (sourceClassifications.length !== input.sourceReports.length) return false;

  if (input.outcome.kind === "validated_no_findings") {
    return (
      input.outcome.validatedFindingCount === 0 &&
      input.outcome.inventoryOnlyNoFindingsReportCount === 0 &&
      input.outcome.substantiveNoFindingsReportCount === input.sourceReports.length &&
      sourceClassifications.every((classification) => classification === "validated_no_findings")
    );
  }

  return (
    input.outcome.validatedFindingCount > 0 &&
    sourceClassifications.some((classification) => classification === "validated_findings_present")
  );
}

const TERMINAL_NON_TRUSTED_SOURCE_STATES = new Set([
  "invalid",
  "missing",
  "source_inconclusive",
  "terminal_inconclusive",
  "manual_exception",
]);

const TERMINAL_NON_TRUSTED_FAILURE_FAMILIES = new Set([
  "invalid_artifact_content",
  "invalid_artifact_contract",
  "invalid_artifact_integrity",
  "invalid_inventory_only",
  "insufficient_substantive_evidence",
  "source_inconclusive",
  "manual_exception",
  "missing_artifact",
  "missing_tool_evidence",
  "rework_needed",
  "inconclusive_batch_evidence",
  "manual_review_required",
]);

function isTerminalNonTrustedSourceReport(
  artifact: ReturnType<typeof listRoadmapReportArtifactsForSynthesis>[number],
): boolean {
  if (artifact.state === "valid") return false;
  if (readPersistedTrustedAuditSourceClassification(artifact)) return false;
  if (!TERMINAL_NON_TRUSTED_SOURCE_STATES.has(artifact.state)) return false;
  return (
    artifact.failureFamily === null ||
    TERMINAL_NON_TRUSTED_FAILURE_FAMILIES.has(artifact.failureFamily)
  );
}

function isTrustedDeterministicAuditSynthesisInconclusiveOutcome(input: {
  outcome: NonNullable<ReturnType<typeof classifyAuditSynthesisOutput>>;
  sourceReports: ReturnType<typeof listRoadmapReportArtifactsForSynthesis>;
}): boolean {
  if (
    input.outcome.kind !== "source_inconclusive" &&
    input.outcome.kind !== "inconclusive_batch_evidence"
  ) {
    return false;
  }
  if (input.sourceReports.length === 0) return false;
  const validReports = input.sourceReports.filter((artifact) => artifact.state === "valid");
  const weakReports = input.sourceReports.filter((artifact) => artifact.state !== "valid");
  if (weakReports.length === 0) return false;
  if (input.outcome.sourceReportCount !== validReports.length) return false;
  if (input.outcome.weakReportCount !== weakReports.length) return false;
  if (input.outcome.validatedFindingCount !== 0) return false;
  if (input.outcome.inventoryOnlyNoFindingsReportCount > validReports.length) return false;
  if (
    input.outcome.substantiveNoFindingsReportCount +
      input.outcome.inventoryOnlyNoFindingsReportCount >
    validReports.length
  ) {
    return false;
  }
  return (
    validReports.every(
      (artifact) =>
        readPersistedTrustedAuditSourceClassification(artifact) === "validated_no_findings",
    ) && weakReports.every(isTerminalNonTrustedSourceReport)
  );
}

function buildDeterministicAuditSynthesisTrustedReviewComments(input: {
  strategy: AutoReviewStrategy;
  iteration: number;
  artifactPath: string;
  outcomeKind: "validated_no_findings" | "validated_findings_present";
  sourceReportCount: number;
  validatedFindingCount: number;
  previousFindings: AutoReviewFinding[];
}): string {
  const closureEvidence =
    input.outcomeKind === "validated_no_findings"
      ? `Deterministic review-gate accepted \`${input.artifactPath}\` as validated no-findings from ${input.sourceReportCount} trusted source audit reports; weak or untrusted source reports were not promoted.`
      : `Deterministic review-gate accepted \`${input.artifactPath}\` with ${input.validatedFindingCount} validated finding(s) from ${input.sourceReportCount} trusted source audit reports; weak or untrusted source reports were not promoted.`;
  const previousFindingLines =
    input.previousFindings.length > 0
      ? input.previousFindings.map(
          (finding) => `- [${finding.id}] ${finding.source} | resolved | ${closureEvidence}`,
        )
      : ["- none"];

  return [
    "## Auto Review Metadata",
    `- Strategy: ${input.strategy}`,
    `- Review Iteration: ${input.iteration}`,
    "- Deterministic Review: audit_synthesis_validation",
    "",
    "## Previous Findings",
    ...previousFindingLines,
    "",
    "## Blocking Findings",
    "- none",
    "",
    "## Advisories",
    `- review_gate | ${closureEvidence}`,
    "",
    "## Security Coverage",
    "- secret_leaks | covered | Deterministic review inspected synthesis outcome metadata and persisted trusted source artifact states without exposing secret values.",
    "- permissions_sandbox | covered | Deterministic review used read-only artifact validation and did not require additional write access.",
    "- unsafe_shell_network_file | covered | Deterministic review did not run shell, network, or file mutation operations beyond reading the synthesis artifact.",
    "- dependency_config | not_applicable | No dependency or runtime configuration change is introduced by deterministic audit synthesis output.",
    "",
    "## Raw Code Review",
    `Deterministic review-gate accepted ${input.artifactPath}. ${closureEvidence}`,
    "",
    "## Raw Security Audit",
    `Deterministic security review accepted ${input.artifactPath} as read-only audit synthesis output backed by persisted source artifact trust state.`,
  ].join("\n");
}

function recordDeterministicAuditReportReviewActivity(taskId: string, artifactPath: string): void {
  logActivity(taskId, "Agent", "review-gate started (deterministic audit report validation)");
  logActivity(taskId, "Tool", `read_file ${artifactPath}`);
  logActivity(taskId, "Tool", `git_show HEAD:${artifactPath}`);
  logActivity(taskId, "Agent", "review-gate complete (deterministic audit report validation)");
  flushActivityQueue(taskId);
}

export async function runReviewer(taskId: string, projectRoot: string): Promise<void> {
  const env = getEnv();
  const task = findTaskById(taskId);

  if (!task) {
    log.error({ taskId }, "Task not found for review");
    throw new Error(`Task ${taskId} not found`);
  }

  // Reviewer must diff against the task's feature branch — not whatever HEAD
  // happens to be. Same mandatory-restore contract as implementer/plan-checker.
  if (task.branchName && !task.isFix) {
    restorePersistedBranch({
      projectRoot,
      taskId,
      persistedBranchName: task.branchName,
    });
    logActivity(taskId, "Agent", `Restored feature branch: ${task.branchName}`);
  }

  const project = findProjectById(task.projectId);
  const sidecarBudget = project?.reviewSidecarMaxBudgetUsd ?? null;
  const useSubagents = task.useSubagents;
  const strategy = env.AGENT_AUTO_REVIEW_STRATEGY;
  const reviewIteration = (task.reviewIterationCount ?? 0) + 1;
  const previousFindings = task.autoReviewState?.findings ?? [];
  const reviewPreviousFindingState = previousFindings.filter((finding) =>
    ["code_review", "review_gate"].includes(finding.source),
  );
  const securityPreviousFindingState = previousFindings.filter(
    (finding) => finding.source === "security_audit",
  );
  const reviewPreviousFindings = formatPreviousFindingsForPrompt(reviewPreviousFindingState);
  const securityPreviousFindings = formatPreviousFindingsForPrompt(securityPreviousFindingState);
  const autoReviewReworkContext = formatReviewerAutoReviewStateForPrompt(task.autoReviewState);
  const roadmapArtifact = findRoadmapBatchArtifactByTaskId(taskId);
  const auditSynthesisContext =
    roadmapArtifact?.role === "synthesis"
      ? [
          "Audit synthesis batch context:",
          `- Synthesis artifact: ${roadmapArtifact.artifactPath}`,
          "- Validated source report artifacts may live on producer branches or worktrees and may not exist as files in this synthesis checkout.",
          "- Do not report validated source report artifacts as missing solely because list_files does not show them in the current branch.",
          "- Review the synthesis artifact content and implementation log instead; the implementation log is allowed to prove producer-branch artifact ingestion.",
          "Terminal source report artifacts:",
          ...listRoadmapReportArtifactsForSynthesis(roadmapArtifact.batchId).map(
            (artifact) =>
              `- ${artifact.artifactPath} (task ${artifact.taskId}, state ${artifact.state})`,
          ),
        ].join("\n")
      : "Audit synthesis batch context: not a roadmap-batch synthesis task.";

  log.info(
    { taskId, title: task.title, useSubagents, strategy, reviewIteration },
    "Starting review stage",
  );

  const deterministicReviewValidation = roadmapArtifact
    ? validateAuditReportForDeterministicReview({
        task,
        projectRoot,
        artifact: roadmapArtifact,
      })
    : null;
  const missingReviewArtifact =
    roadmapArtifact && (roadmapArtifact.role === "report" || roadmapArtifact.role === "synthesis")
      ? (() => {
          const resolvedArtifact = resolveSafeArtifactPath(
            projectRoot,
            roadmapArtifact.artifactPath,
          );
          return !resolvedArtifact || !existsSync(resolvedArtifact.absolutePath);
        })()
      : false;
  const canUseDeterministicAuditReportReview =
    roadmapArtifact &&
    roadmapArtifact.role === "report" &&
    deterministicReviewValidation &&
    isTrustedValidAuditReportValidation(deterministicReviewValidation) &&
    previousFindings.every((finding) => finding.source === "review_gate");
  const canUseDeterministicAuditReportInvalidReview =
    roadmapArtifact &&
    roadmapArtifact.role === "report" &&
    deterministicReviewValidation &&
    !isTrustedValidAuditReportValidation(deterministicReviewValidation) &&
    deterministicReviewValidation.issues.length > 0;

  const deterministicSynthesisOutcome =
    roadmapArtifact?.role === "synthesis"
      ? (() => {
          const resolvedArtifact = resolveSafeArtifactPath(
            projectRoot,
            roadmapArtifact.artifactPath,
          );
          if (!resolvedArtifact || !existsSync(resolvedArtifact.absolutePath)) return null;
          return classifyAuditSynthesisOutput({
            text: readFileSync(resolvedArtifact.absolutePath, "utf8"),
            projectRoot,
          });
        })()
      : null;
  const synthesisSourceReports =
    roadmapArtifact?.role === "synthesis"
      ? listRoadmapReportArtifactsForSynthesis(roadmapArtifact.batchId)
      : [];
  const canUseDeterministicAuditSynthesisTrustedReview =
    roadmapArtifact?.role === "synthesis" &&
    deterministicReviewValidation?.manifestStatus === "valid" &&
    deterministicSynthesisOutcome &&
    previousFindings.every((finding) => finding.source === "review_gate") &&
    isTrustedDeterministicAuditSynthesisOutcome({
      outcome: deterministicSynthesisOutcome,
      sourceReports: synthesisSourceReports,
    });
  const canUseDeterministicAuditSynthesisInconclusiveReview =
    roadmapArtifact?.role === "synthesis" &&
    deterministicReviewValidation?.manifestStatus === "valid" &&
    deterministicSynthesisOutcome &&
    previousFindings.every((finding) => finding.source === "review_gate") &&
    (deterministicSynthesisOutcome.kind === "source_inconclusive" ||
      deterministicSynthesisOutcome.kind === "inconclusive_batch_evidence") &&
    isTrustedDeterministicAuditSynthesisInconclusiveOutcome({
      outcome: deterministicSynthesisOutcome,
      sourceReports: synthesisSourceReports,
    });
  const auditArtifactReviewScopeBlock = formatAuditArtifactReviewScopeBlock({
    artifact: roadmapArtifact ?? null,
    validation: deterministicReviewValidation,
  });
  const auditArtifactReviewMaxTurns = auditArtifactReviewScopeBlock
    ? AUDIT_ARTIFACT_REVIEW_MAX_TURNS
    : undefined;
  const auditArtifactReviewInspectionToolBudget = auditArtifactReviewScopeBlock
    ? AUDIT_ARTIFACT_REVIEW_INSPECTION_TOOL_BUDGET
    : undefined;

  if (canUseDeterministicAuditReportReview) {
    recordDeterministicAuditReportReviewActivity(taskId, roadmapArtifact.artifactPath);
    const combinedReview = buildDeterministicAuditReportReviewComments({
      strategy,
      iteration: reviewIteration,
      artifactPath: roadmapArtifact.artifactPath,
      validation: deterministicReviewValidation,
      previousFindings,
    });
    setTaskFields(taskId, {
      reviewComments: combinedReview,
      updatedAt: new Date().toISOString(),
    });
    logActivity(taskId, "Agent", "review stage complete (deterministic audit report validation)");
    flushActivityQueue(taskId);
    log.info(
      {
        taskId,
        artifactPath: roadmapArtifact.artifactPath,
        sourceClassification: deterministicReviewValidation.sourceClassification,
      },
      "Review stage completed deterministically for trusted audit report artifact",
    );
    return;
  }

  if (canUseDeterministicAuditReportInvalidReview) {
    recordDeterministicAuditReportReviewActivity(taskId, roadmapArtifact.artifactPath);
    const combinedReview = buildDeterministicAuditReportInvalidReviewComments({
      strategy,
      iteration: reviewIteration,
      artifactPath: roadmapArtifact.artifactPath,
      validation: deterministicReviewValidation,
      previousFindings,
    });
    setTaskFields(taskId, {
      reviewComments: combinedReview,
      updatedAt: new Date().toISOString(),
    });
    logActivity(
      taskId,
      "Agent",
      "review stage blocked deterministically (audit report validation failed)",
    );
    flushActivityQueue(taskId);
    log.info(
      {
        taskId,
        artifactPath: roadmapArtifact.artifactPath,
        issueCodes: auditReportValidationIssueCodes(deterministicReviewValidation),
      },
      "Review stage completed deterministically for invalid audit report artifact",
    );
    return;
  }

  if (canUseDeterministicAuditSynthesisTrustedReview) {
    recordDeterministicAuditReportReviewActivity(taskId, roadmapArtifact.artifactPath);
    const combinedReview = buildDeterministicAuditSynthesisTrustedReviewComments({
      strategy,
      iteration: reviewIteration,
      artifactPath: roadmapArtifact.artifactPath,
      outcomeKind:
        deterministicSynthesisOutcome.kind === "validated_findings_present"
          ? "validated_findings_present"
          : "validated_no_findings",
      sourceReportCount: deterministicSynthesisOutcome.sourceReportCount,
      validatedFindingCount: deterministicSynthesisOutcome.validatedFindingCount,
      previousFindings,
    });
    setTaskFields(taskId, {
      reviewComments: combinedReview,
      updatedAt: new Date().toISOString(),
    });
    logActivity(taskId, "Agent", "review stage complete (deterministic audit synthesis)");
    flushActivityQueue(taskId);
    log.info(
      {
        taskId,
        artifactPath: roadmapArtifact.artifactPath,
        synthesisOutcome: deterministicSynthesisOutcome.kind,
        sourceReportCount: deterministicSynthesisOutcome.sourceReportCount,
      },
      "Review stage completed deterministically for trusted audit synthesis artifact",
    );
    return;
  }

  if (
    missingReviewArtifact &&
    roadmapArtifact &&
    (roadmapArtifact.role === "report" || roadmapArtifact.role === "synthesis")
  ) {
    recordDeterministicAuditReportReviewActivity(taskId, roadmapArtifact.artifactPath);
    const combinedReview = buildDeterministicAuditArtifactMissingReviewComments({
      strategy,
      iteration: reviewIteration,
      artifactPath: roadmapArtifact.artifactPath,
      role: roadmapArtifact.role,
      previousFindings,
    });
    setTaskFields(taskId, {
      reviewComments: combinedReview,
      updatedAt: new Date().toISOString(),
    });
    logActivity(taskId, "Agent", "review stage blocked deterministically (audit artifact missing)");
    flushActivityQueue(taskId);
    log.info(
      {
        taskId,
        artifactPath: roadmapArtifact.artifactPath,
        role: roadmapArtifact.role,
      },
      "Review stage completed deterministically for missing audit artifact",
    );
    return;
  }

  if (canUseDeterministicAuditSynthesisInconclusiveReview) {
    recordDeterministicAuditReportReviewActivity(taskId, roadmapArtifact.artifactPath);
    const combinedReview = buildDeterministicAuditSynthesisInconclusiveReviewComments({
      strategy,
      iteration: reviewIteration,
      artifactPath: roadmapArtifact.artifactPath,
      outcomeReason: deterministicSynthesisOutcome.reason,
      previousFindings,
    });
    setTaskFields(taskId, {
      reviewComments: combinedReview,
      updatedAt: new Date().toISOString(),
    });
    logActivity(
      taskId,
      "Agent",
      "review stage complete (deterministic audit synthesis inconclusive)",
    );
    flushActivityQueue(taskId);
    log.info(
      {
        taskId,
        artifactPath: roadmapArtifact.artifactPath,
        synthesisOutcome: deterministicSynthesisOutcome.kind,
      },
      "Review stage completed deterministically for terminal audit synthesis outcome",
    );
    return;
  }

  const scopeConstraint = `IMPORTANT: Your working directory is ${projectRoot}
All file reads, searches, and analysis must stay within this directory. Do NOT navigate to parent directories or other projects.`;
  const reviewMemoryContext = buildTaskMemoryContext({
    task,
    workflowKind: "reviewer",
    source: "agent:reviewer",
    queryParts: [auditSynthesisContext, reviewPreviousFindings, autoReviewReworkContext],
  });
  const securityMemoryContext = buildTaskMemoryContext({
    task,
    workflowKind: "security_review",
    source: "agent:security-review",
    queryParts: [auditSynthesisContext, securityPreviousFindings, autoReviewReworkContext],
  });
  const reviewMemoryBlock = reviewMemoryContext ? `\n\n${reviewMemoryContext}\n` : "";
  const securityMemoryBlock = securityMemoryContext ? `\n\n${securityMemoryContext}\n` : "";
  const taskIntentContract = formatTaskIntentContractForPrompt(task.taskIntent ?? "general");

  const reviewOutputContract = `Output contract:
Return markdown only with these exact sections, in this exact order:

## Blocking Findings
- <blocking finding>
or
- none

## Advisories
- <non-blocking advisory>
or
- none

## Previous Findings
- [<id>] resolved | <current-attempt closure evidence>
- [<id>] still_blocking | <short reason and required evidence>
- [<id>] new_blocker | <new blocker claim and required fix>
- [<id>] not_reproducible | <inspection evidence that disproves or cannot reproduce the original blocker>
- [<id>] manual_review_required | <why automatic closure is unsafe>
or
- none

## Security Coverage
- secret_leaks | <covered|issue_found|not_applicable|not_checked> | <redacted evidence summary>
- permissions_sandbox | <covered|issue_found|not_applicable|not_checked> | <redacted evidence summary>
- unsafe_shell_network_file | <covered|issue_found|not_applicable|not_checked> | <redacted evidence summary>
- dependency_config | <covered|issue_found|not_applicable|not_checked> | <redacted evidence summary>

Rules:
- Blocking Findings must list only issues that should block automatic completion for this review source.
- Advisories are non-blocking suggestions or follow-ups.
- Review is read-only: do not create, edit, delete, move, or commit repository files.
- Never include raw secret values, bearer tokens, API keys, client secrets, access tokens, cookies, or private URLs. Redact the value and name only the file/path/key pattern inspected.
- For audit, review, discovery, validation, verification, findings, or report tasks, call at least one repository inspection tool before answering, then include at least one Advisory with concrete evidence you inspected: exact existing file path with line/function/symbol reference, or a command and output/status that supports your review conclusion.
- For audit/report artifacts, block placeholder or unverified evidence: synthetic commit hashes such as 123abc, placeholder authors, fake command output, "too large to read", "would show", "likely", "may contain", or claims that an existing file/directory is missing.
- For audit/report artifacts whose task description requires Proposed fix, block any finding that has Evidence/Risk/Verification but no Proposed fix.
- For audit/report artifacts, block non-actionable findings: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims without a concrete technical failure mode.
- Reuse only IDs provided in the Previous Findings input below. New Blocking Findings should be written without invented IDs; the coordinator assigns stable IDs.
- For every ID in Previous Findings input, compare the current implementation log, changed files, and relevant artifact content against the original finding. Mark resolved only when concrete closure evidence is present.
- If a previous finding lacks closure evidence, repeats the same validator failure, or the required self-check was not performed, mark that same ID still_blocking and state the evidence gap.
- Mark not_reproducible only when you inspected the current attempt and can cite concrete evidence showing the original blocker is absent or no longer applicable.
- Mark manual_review_required when evidence is ambiguous, potentially secret-bearing, externally dependent, permission-sensitive, or unsafe to auto-close.
- If completion is blocked only because the operator must provide a concrete data item, access grant, runtime/config value/profile choice, or decision/approval text, write the blocking finding starting exactly with "operator_input_required:" and ask for that specific missing input. Do not use this for policy/security-sensitive ambiguity, malformed output, secret values, or judgment calls; those remain manual_review_required.
- For audit/report artifact rework, do not mark prior review_gate findings resolved unless the artifact proves valid manifest requirements, bound evidenceRefs, declared scope coverage, and substantive evidence.
- Security Coverage is required. For non-security code review, use not_applicable rows. For security audit, each row must describe the check performed or the blocker found.
- Security blocking findings must include Severity:, Claim:, Required fix:, and Verification: in the finding text, with redacted evidence only.
- Do not add any headings before, between, or after these sections.
- Do not use code fences.`;

  const reviewPromptBase = `Review the implementation for this task:

${scopeConstraint}
${reviewMemoryBlock}

Title: ${task.title}
Description: ${task.description}
Task intent contract:
${taskIntentContract}

Task attachments:
${formatAttachmentsForPrompt(task.attachments)}

Implementation Log:
${task.implementationLog ?? "No implementation log available."}

${auditSynthesisContext}

${auditArtifactReviewScopeBlock}

Auto-review strategy: ${strategy}
Review iteration: ${reviewIteration}

Previous Findings Input:
${reviewPreviousFindings}

Auto-review rework context:
${autoReviewReworkContext}

Review changed code for correctness, regression risks, performance, and maintainability.

${reviewOutputContract}`;

  const securityPromptBase = `Audit the implementation for security risks:

${scopeConstraint}
${securityMemoryBlock}

Title: ${task.title}
Description: ${task.description}
Task intent contract:
${taskIntentContract}

Task attachments:
${formatAttachmentsForPrompt(task.attachments)}

Auto-review strategy: ${strategy}
Review iteration: ${reviewIteration}

${auditSynthesisContext}

${auditArtifactReviewScopeBlock}

Previous Findings Input:
${securityPreviousFindings}

Auto-review rework context:
${autoReviewReworkContext}

Focus on auth, validation, secret leak checks, permission/sandbox boundaries, injection, unsafe shell/file/network behavior, and dependency/config risks in changed code.

${reviewOutputContract}`;
  const reviewPrompt = useSubagents ? reviewPromptBase : `/aif-review ${reviewPromptBase}`;
  const securityPrompt = useSubagents
    ? securityPromptBase
    : `/aif-security-checklist ${securityPromptBase}`;
  const reviewAgentName = useSubagents ? "review-sidecar" : "aif-review";
  const securityAgentName = useSubagents ? "security-sidecar" : "aif-security-checklist";
  const reviewWorkflow = createRuntimeWorkflowSpec({
    workflowKind: "reviewer",
    prompt: reviewPrompt,
    requiredCapabilities: useSubagents
      ? ["supportsAgentDefinitions", "supportsRepositoryTools"]
      : ["supportsRepositoryTools"],
    agentDefinitionName: useSubagents ? reviewAgentName : undefined,
    fallbackSlashCommand: "/aif-review",
    fallbackStrategy: useSubagents ? "slash_command" : "none",
    sessionReusePolicy: "new_session",
    systemPromptAppend: scopeConstraint,
  });
  const securityWorkflow = createRuntimeWorkflowSpec({
    workflowKind: "review-security",
    prompt: securityPrompt,
    requiredCapabilities: useSubagents
      ? ["supportsAgentDefinitions", "supportsRepositoryTools"]
      : ["supportsRepositoryTools"],
    agentDefinitionName: useSubagents ? securityAgentName : undefined,
    fallbackSlashCommand: "/aif-security-checklist",
    fallbackStrategy: useSubagents ? "slash_command" : "none",
    sessionReusePolicy: "new_session",
    systemPromptAppend: scopeConstraint,
  });

  try {
    const heartbeatTimer = startHeartbeat(taskId);

    let reviewResult = "";
    let securityResult = "";
    try {
      if (useSubagents) {
        [reviewResult, securityResult] = await Promise.all([
          runSidecar(
            reviewPrompt,
            taskId,
            projectRoot,
            reviewAgentName,
            sidecarBudget,
            true,
            reviewWorkflow,
            "/aif-review",
            auditArtifactReviewMaxTurns,
            auditArtifactReviewInspectionToolBudget,
          ),
          runSidecar(
            securityPrompt,
            taskId,
            projectRoot,
            securityAgentName,
            sidecarBudget,
            true,
            securityWorkflow,
            "/aif-security-checklist",
            auditArtifactReviewMaxTurns,
            auditArtifactReviewInspectionToolBudget,
          ),
        ]);
      } else {
        reviewResult = await runSidecar(
          reviewPrompt,
          taskId,
          projectRoot,
          reviewAgentName,
          sidecarBudget,
          false,
          reviewWorkflow,
          "/aif-review",
          auditArtifactReviewMaxTurns,
          auditArtifactReviewInspectionToolBudget,
        );
        securityResult = await runSidecar(
          securityPrompt,
          taskId,
          projectRoot,
          securityAgentName,
          sidecarBudget,
          false,
          securityWorkflow,
          "/aif-security-checklist",
          auditArtifactReviewMaxTurns,
          auditArtifactReviewInspectionToolBudget,
        );
      }
    } finally {
      try {
        clearInterval(heartbeatTimer);
      } catch {
        /* safety guard */
      }
    }

    // Post-run drift check: review sidecars must not have switched HEAD.
    if (task.branchName && !task.isFix) {
      assertCurrentBranch(projectRoot, task.branchName);
    }

    log.info({ taskId }, "Review and security sidecars completed");

    const parsedReview = parseStructuredSidecarOutput(
      reviewResult,
      "code_review",
      reviewPreviousFindingState,
    );
    const parsedSecurity = parseStructuredSidecarOutput(
      securityResult,
      "security_audit",
      securityPreviousFindingState,
    );

    const combinedReview =
      parsedReview && parsedSecurity
        ? buildStructuredReviewComments({
            strategy,
            iteration: reviewIteration,
            codeReview: parsedReview,
            securityAudit: parsedSecurity,
            rawCodeReview: reviewResult,
            rawSecurityAudit: securityResult,
          })
        : buildStructuredReviewContractFailureComments({
            strategy,
            iteration: reviewIteration,
            parsedReview: Boolean(parsedReview),
            parsedSecurity: Boolean(parsedSecurity),
            rawCodeReview: reviewResult,
            rawSecurityAudit: securityResult,
          });

    if (!parsedReview || !parsedSecurity) {
      log.warn(
        {
          taskId,
          parsedReview: Boolean(parsedReview),
          parsedSecurity: Boolean(parsedSecurity),
        },
        "Structured review contract not satisfied, saving fail-closed review contract blocker",
      );
    }

    setTaskFields(taskId, {
      reviewComments: combinedReview,
      updatedAt: new Date().toISOString(),
    });

    logActivity(
      taskId,
      "Agent",
      useSubagents
        ? "review stage complete (review-sidecar + security-sidecar)"
        : "review stage complete (aif-review + aif-security-checklist)",
    );
    log.debug({ taskId }, "Review comments saved to task");
  } catch (err) {
    logActivity(taskId, "Agent", `review stage failed — ${(err as Error).message}`);
    throw err;
  }
}
