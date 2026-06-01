import {
  assertSafeRoadmapArtifactPath,
  listAuditEvidenceEvents,
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  buildTaskRequirementsContextForPrompt,
  listTaskComments,
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
  isRiskyTask,
  resolveAuditPlanId,
  validateAuditReportArtifact,
  type AutoReviewState,
  type AutoReviewFinding,
  type AutoReviewFindingSource,
  type AutoReviewStrategy,
  SPECIALIZED_REVIEWER_ROLES,
  type SpecializedReviewerRole,
} from "@aif/shared";
import { assertCurrentBranch, restorePersistedBranch } from "../gitBranch.js";
import { flushActivityQueue, logActivity } from "../hooks.js";
import { buildTaskMemoryContext } from "../memoryContext.js";
import { executeSubagentQuery, startHeartbeat } from "../subagentQuery.js";
import {
  formatRaiseQuestionsPromptGuidance,
  handleRaiseQuestionsOutput,
} from "./raiseQuestions.js";
import {
  buildStructuredReviewComments,
  buildSpecializedRoleManualReviewOutput,
  createAutoReviewFindingId,
  formatPreviousFindingsForPrompt,
  parseSpecializedRoleOutput,
  parseStructuredSidecarOutput,
  type ParsedSpecializedRoleOutput,
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

const SPECIALIZED_REVIEWER_AGENT_NAMES: Record<SpecializedReviewerRole, string> = {
  correctness: "review-correctness",
  security_data_loss: "review-security-data-loss",
  regression_api_contract: "review-regression-api-contract",
  audit_evidence: "review-audit-evidence",
};

const SPECIALIZED_REVIEWER_WORKFLOW_KINDS: Record<SpecializedReviewerRole, string> = {
  correctness: "review-correctness",
  security_data_loss: "review-security-data-loss",
  regression_api_contract: "review-regression-api-contract",
  audit_evidence: "review-audit-evidence",
};

type SpecializedReviewerInput = {
  role: SpecializedReviewerRole;
  prompt: string;
  passEvidenceFallback?: string | null;
};

type SpecializedReviewerResult = {
  role: SpecializedReviewerRole;
  rawOutput: string;
  parsed: ParsedSpecializedRoleOutput;
};

const HIGH_RISK_REVIEW_PATTERN =
  /\b(high[-_\s]?risk|critical|security|auth|permission|sandbox|secret|token|credential|data[-_\s]?loss|destructive|delete|migration|schema|database|regression|api[-_\s]?contract|breaking[-_\s]?change|public[-_\s]?api)\b/i;

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

function formatImplementationManifestForReviewPrompt(task: TaskRow): string {
  const rawManifest = task.implementationManifestJson;
  if (!rawManifest?.trim()) return "Implementation manifest:\nnone";
  return `Implementation manifest:\n${compactReviewerPromptBlock(
    "IMPLEMENTATION_MANIFEST",
    rawManifest,
    6_000,
  )}`;
}

function formatRecentHumanCommentsForReviewPrompt(taskId: string): string {
  const comments = listTaskComments(taskId)
    .filter((comment) => comment.author === "human")
    .slice(-5);
  if (comments.length === 0) return "Recent human/operator comments:\nnone";
  return [
    "Recent human/operator comments:",
    ...comments.map((comment) => {
      const message = compactReviewerPromptBlock(
        "HUMAN_COMMENT",
        redactProviderText(comment.message),
        1_500,
      );
      return `- ${comment.createdAt}: ${message}`;
    }),
  ].join("\n");
}

function buildSpecializedReviewerPassEvidenceFallback(task: TaskRow): string | null {
  const rawManifest = task.implementationManifestJson;
  if (!rawManifest?.trim()) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(rawManifest);
  } catch {
    return null;
  }
  if (!manifest || typeof manifest !== "object") return null;
  const record = manifest as {
    changedFiles?: Array<{ path?: unknown; status?: unknown }>;
    verificationEvidence?: Array<{ command?: unknown; status?: unknown }>;
  };
  const changedFiles = Array.isArray(record.changedFiles)
    ? record.changedFiles
        .filter((file) => typeof file?.path === "string")
        .slice(0, 5)
        .map((file) => {
          const status = typeof file.status === "string" ? file.status : "changed";
          return `${file.path} (${status})`;
        })
    : [];
  const passedVerification = Array.isArray(record.verificationEvidence)
    ? record.verificationEvidence.find(
        (evidence) =>
          typeof evidence?.command === "string" &&
          typeof evidence?.status === "string" &&
          evidence.status.toLowerCase() === "passed",
      )
    : null;
  const evidenceParts: string[] = [];
  if (changedFiles.length > 0) {
    evidenceParts.push(`changedFiles contains ${changedFiles.join(", ")}`);
  }
  if (passedVerification && typeof passedVerification.command === "string") {
    evidenceParts.push(`verificationEvidence contains ${passedVerification.command} status passed`);
  }
  if (evidenceParts.length === 0) return null;
  return `Implementation manifest evidence: ${evidenceParts.join("; ")}.`;
}

function isAuditReviewTask(task: TaskRow, roadmapArtifact: unknown): boolean {
  return (
    task.taskIntent === "audit" ||
    isRiskyTask(task) ||
    Boolean(roadmapArtifact) ||
    /\b(audit|evidence|findings?|report|synthesis)\b/i.test(
      [task.title, task.description, task.roadmapAlias, task.tags].filter(Boolean).join("\n"),
    )
  );
}

function isHighRiskReviewTask(task: TaskRow): boolean {
  return (
    task.priority >= 3 ||
    HIGH_RISK_REVIEW_PATTERN.test(
      [task.title, task.description, task.roadmapAlias, task.tags].filter(Boolean).join("\n"),
    )
  );
}

export function resolveRequiredSpecializedReviewerRoles(
  task: TaskRow,
  roadmapArtifact: unknown,
): SpecializedReviewerRole[] {
  const roles = new Set<SpecializedReviewerRole>();
  const auditReviewTask = isAuditReviewTask(task, roadmapArtifact);
  if (auditReviewTask || isHighRiskReviewTask(task)) {
    roles.add("correctness");
    roles.add("security_data_loss");
    roles.add("regression_api_contract");
  }
  if (auditReviewTask) {
    roles.add("audit_evidence");
  }
  return SPECIALIZED_REVIEWER_ROLES.filter((role) => roles.has(role));
}

export function taskRequiresSpecializedReviewerFanout(
  task: TaskRow,
  roadmapArtifact: unknown,
): boolean {
  return resolveRequiredSpecializedReviewerRoles(task, roadmapArtifact).length > 0;
}

function roleFocus(role: SpecializedReviewerRole): string {
  if (role === "correctness") {
    return "Correctness: verify implemented behavior matches the task, edge cases are handled, and the implementation does not contain logic errors.";
  }
  if (role === "security_data_loss") {
    return "Security and data loss: verify secret handling, auth/permission boundaries, unsafe shell/file/network behavior, and destructive or irreversible data changes.";
  }
  if (role === "regression_api_contract") {
    return "Regression and API contract: verify public interfaces, persisted schema/contract compatibility, runtime configuration, and backwards-compatible behavior.";
  }
  return "Audit evidence: verify audit/report/synthesis claims are source-backed, cite concrete repository evidence, and do not rely on placeholders, speculative claims, or untrusted artifacts.";
}

function buildSpecializedReviewerPrompt(input: {
  role: SpecializedReviewerRole;
  scopeConstraint: string;
  task: TaskRow;
  taskIntentContract: string;
  auditSynthesisContext: string;
  auditArtifactReviewScopeBlock: string;
  operatorCommentsBlock: string;
  strategy: AutoReviewStrategy;
  reviewIteration: number;
  previousFindings: string;
  autoReviewReworkContext: string;
}): string {
  return `Specialized review role: ${input.role}
${roleFocus(input.role)}

${input.scopeConstraint}

Title: ${input.task.title}
Description: ${input.task.description}
Task intent contract:
${input.taskIntentContract}

Task attachments:
${formatAttachmentsForPrompt(input.task.attachments)}

Implementation Log:
${input.task.implementationLog ?? "No implementation log available."}

${formatImplementationManifestForReviewPrompt(input.task)}

${input.operatorCommentsBlock}

${input.auditSynthesisContext}

${input.auditArtifactReviewScopeBlock}

Auto-review strategy: ${input.strategy}
Review iteration: ${input.reviewIteration}

Previous Findings Input:
${input.previousFindings}

Auto-review rework context:
${input.autoReviewReworkContext}

Output contract:
Return markdown only with these exact sections, in this exact order:

## Verdict
- PASS
or
- FAIL
or
- INCONCLUSIVE

## Blocking Findings
- <blocking finding>
or
- none

## Advisories
- <non-blocking advisory with concrete repository evidence inspected; required for PASS>
or
- none (only when verdict is FAIL)

## Previous Findings
- [<id>] resolved | <current-attempt closure evidence>
- [<id>] still_blocking | <short reason and required evidence>
- [<id>] new_blocker | <new blocker claim and required fix>
- [<id>] not_reproducible | <inspection evidence that disproves or cannot reproduce the original blocker>
- [<id>] manual_review_required | <why automatic closure is unsafe>
or
- none

Rules:
- Your first output line must be exactly "## Verdict"; do not add an intro, summary, or preface.
- PASS is valid only when Blocking Findings is exactly "- none".
- PASS must include at least one Advisories bullet with concrete inspected file path, command/test output, or implementation manifest evidence.
- FAIL requires at least one concrete blocking finding.
- INCONCLUSIVE means automatic review is unsafe and will require manual review.
- Review is read-only: do not create, edit, delete, move, or commit repository files.
- Call at least one repository inspection tool before answering.
- Never include raw secret values, bearer tokens, API keys, client secrets, access tokens, cookies, or private URLs.
- Reuse only IDs provided in Previous Findings input. New Blocking Findings should be written without invented IDs.
- Do not add any headings before, between, or after these sections.
- Do not use code fences.`;
}

async function runSpecializedReviewerRole(input: {
  role: SpecializedReviewerRole;
  prompt: string;
  taskId: string;
  projectRoot: string;
  sidecarBudget: number | null;
  useSubagents: boolean;
  scopeConstraint: string;
  maxTurns?: number;
  repositoryInspectionToolBudget?: number;
  profileMode?: "reviewer" | "security";
  passEvidenceFallback?: string | null;
}): Promise<{
  role: SpecializedReviewerRole;
  rawOutput: string;
  parsed: ParsedSpecializedRoleOutput;
}> {
  const agentName = SPECIALIZED_REVIEWER_AGENT_NAMES[input.role];
  const workflowKind = SPECIALIZED_REVIEWER_WORKFLOW_KINDS[input.role];
  const prompt = input.useSubagents ? input.prompt : `/aif-review ${input.prompt}`;
  const workflowSpec = createRuntimeWorkflowSpec({
    workflowKind,
    prompt,
    requiredCapabilities: input.useSubagents
      ? ["supportsAgentDefinitions", "supportsRepositoryTools"]
      : ["supportsRepositoryTools"],
    agentDefinitionName: input.useSubagents ? agentName : undefined,
    fallbackSlashCommand: "/aif-review",
    fallbackStrategy: input.useSubagents ? "slash_command" : "none",
    sessionReusePolicy: "new_session",
    systemPromptAppend: input.scopeConstraint,
    metadata: { specializedReviewerRole: input.role },
  });

  try {
    const rawOutput = await runSidecar(
      prompt,
      input.taskId,
      input.projectRoot,
      agentName,
      input.sidecarBudget,
      input.useSubagents,
      workflowSpec,
      "/aif-review",
      input.maxTurns,
      input.repositoryInspectionToolBudget,
      input.profileMode,
    );
    const parsed =
      parseSpecializedRoleOutput(rawOutput, input.role, [], {
        passEvidenceFallback: input.passEvidenceFallback,
      }) ??
      buildSpecializedRoleManualReviewOutput({
        role: input.role,
        reason: "returned INCONCLUSIVE or malformed output.",
      });
    return { role: input.role, rawOutput, parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      role: input.role,
      rawOutput: `Unavailable: ${message}`,
      parsed: buildSpecializedRoleManualReviewOutput({
        role: input.role,
        reason: `was unavailable: ${message}`,
      }),
    };
  }
}

async function runSpecializedReviewerInputs(input: {
  reviewerInputs: SpecializedReviewerInput[];
  taskId: string;
  projectRoot: string;
  sidecarBudget: number | null;
  useSubagents: boolean;
  scopeConstraint: string;
  maxTurns?: number;
  repositoryInspectionToolBudget?: number;
}): Promise<SpecializedReviewerResult[]> {
  const runOne = (reviewerInput: SpecializedReviewerInput) =>
    runSpecializedReviewerRole({
      role: reviewerInput.role,
      prompt: reviewerInput.prompt,
      taskId: input.taskId,
      projectRoot: input.projectRoot,
      sidecarBudget: input.sidecarBudget,
      useSubagents: input.useSubagents,
      scopeConstraint: input.scopeConstraint,
      maxTurns: input.maxTurns,
      repositoryInspectionToolBudget: input.repositoryInspectionToolBudget,
      profileMode: reviewerInput.role === "security_data_loss" ? "security" : "reviewer",
      passEvidenceFallback: reviewerInput.passEvidenceFallback,
    });

  if (input.useSubagents) {
    return Promise.all(input.reviewerInputs.map(runOne));
  }

  const results: SpecializedReviewerResult[] = [];
  for (const reviewerInput of input.reviewerInputs) {
    results.push(await runOne(reviewerInput));
  }
  return results;
}

function formatReviewerAutoReviewStateForPrompt(
  state: AutoReviewState | null | undefined,
  sources?: AutoReviewFindingSource[],
): string {
  if (!state) {
    return "No persisted auto-review rework context.";
  }

  const sourceSet = sources ? new Set<AutoReviewFindingSource>(sources) : null;
  const matchingFindings = sourceSet
    ? state.findings.filter((finding) => sourceSet.has(finding.source))
    : state.findings;
  const visibleFindings = matchingFindings.slice(0, REVIEWER_PROMPT_SECTION_LIMITS.blockerCount);
  const visibleFindingIds = new Set(visibleFindings.map((finding) => finding.id));
  const omittedCount = Math.max(0, matchingFindings.length - visibleFindings.length);
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
  const snapshotFindingIds = sourceSet
    ? snapshot.findingIds.filter((findingId) => visibleFindingIds.has(findingId))
    : snapshot.findingIds;
  if (snapshotFindingIds.length > 0) {
    const findingIds = snapshotFindingIds.map((findingId) =>
      compactReviewerPromptText(
        "FINDING_ID",
        findingId,
        REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
      ),
    );
    lines.push(`- exact blocker ids: ${findingIds.join(", ")}`);
  }
  if (snapshot.requiredEvidenceByFindingId) {
    const requiredEvidenceEntries = Object.entries(snapshot.requiredEvidenceByFindingId).filter(
      ([findingId]) => !sourceSet || visibleFindingIds.has(findingId),
    );
    if (requiredEvidenceEntries.length > 0) {
      lines.push("- required evidence by blocker id:");
    }
    for (const [findingId, evidence] of requiredEvidenceEntries) {
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
  specializedReviews?: ParsedSpecializedRoleOutput[];
  rawSpecializedReviews?: Array<{ role: SpecializedReviewerRole; rawOutput: string }>;
}): string {
  const failedSidecars = [
    !input.parsedReview ? "code_review" : null,
    !input.parsedSecurity ? "security_audit" : null,
  ].filter((entry): entry is string => Boolean(entry));
  const note = `${STRUCTURED_REVIEW_CONTRACT_FAILURE_TEXT} Failed sidecar(s): ${failedSidecars.join(", ")}.`;
  const specializedBlockingFindings = (input.specializedReviews ?? []).flatMap((review) =>
    review.blockingFindings.map(
      (finding) => `- [${finding.id}] ${finding.source} | ${finding.text}`,
    ),
  );
  const specializedAdvisories = (input.specializedReviews ?? []).flatMap((review) =>
    review.advisories.map((advisory) => `- ${advisory.source} | ${advisory.text}`),
  );

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
    ...specializedBlockingFindings,
    "",
    "## Advisories",
    "- review_gate | Raw sidecar output is retained below with provider-text redaction applied.",
    ...specializedAdvisories,
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
    ...(input.rawSpecializedReviews ?? []).flatMap((review) => [
      "",
      `## Raw Specialized Review: ${review.role}`,
      redactProviderText(review.rawOutput.trim()) || `No ${review.role} reviewer output.`,
    ]),
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
  profileMode?: "reviewer" | "security",
): Promise<string> {
  const { resultText } = await executeSubagentQuery({
    taskId,
    projectRoot,
    agentName,
    prompt,
    profileMode:
      profileMode ?? (workflowSpec.workflowKind === "review-security" ? "security" : "reviewer"),
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
  return validation.issueCodes ?? [...new Set(validation.issues.map((issue) => issue.code))].sort();
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
        `repairMode=${input.validation.repairMode}`,
        `validationFingerprint=${input.validation.validationFingerprint}`,
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
    `validationFingerprint=${input.validation.validationFingerprint}`,
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
  const issueCodes = auditReportValidationIssueCodes(input.validation);
  const validationSummary = [
    `manifestStatus=${input.validation.manifestStatus}`,
    `sourceClassification=${input.validation.sourceClassification}`,
    `issueCodes=${issueCodes.join(", ") || "unknown"}`,
    `repairMode=${input.validation.repairMode}`,
    `validationFingerprint=${input.validation.validationFingerprint}`,
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
          const routePrefix =
            input.validation.repairMode === "manual_review_required"
              ? "manual_review_required: "
              : input.validation.repairMode === "operator_input_required"
                ? "operator_input_required: "
                : "";
          const text = [
            `${routePrefix}Audit report validator blocked completion (${issue.code}): ${issue.message}`,
            `validationFingerprint=${input.validation.validationFingerprint}`,
            `repairMode=${input.validation.repairMode}`,
          ].join(" ");
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

function formatSpecializedPreviousFindingLine(
  finding: ParsedSpecializedRoleOutput["previousFindings"][number],
): string {
  return `- [${finding.id}] ${finding.source} | ${finding.status} | ${finding.note}`;
}

function formatSpecializedBlockingFindingLine(finding: AutoReviewFinding): string {
  return `- [${finding.id}] ${finding.source} | ${finding.text}`;
}

function formatSpecializedAdvisoryLine(
  advisory: ParsedSpecializedRoleOutput["advisories"][number],
): string {
  return `- ${advisory.source} | ${advisory.text}`;
}

function updateStructuredListSection(lines: string[], heading: string, addedItems: string[]): void {
  if (addedItems.length === 0) return;
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex < 0) return;

  const start = headingIndex + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index]?.startsWith("## ")) {
      end = index;
      break;
    }
  }

  const currentItems = lines.slice(start, end).filter((line) => line.trim().length > 0);
  const existingItems =
    currentItems.length === 1 && currentItems[0]?.trim().toLowerCase() === "- none"
      ? []
      : currentItems;
  lines.splice(start, end - start, ...existingItems, ...addedItems);
}

function mergeSpecializedResultsIntoStructuredReviewComments(
  reviewComments: string,
  specializedResults: SpecializedReviewerResult[],
): string {
  if (specializedResults.length === 0) return reviewComments;

  const previousFindingLines = specializedResults.flatMap((result) =>
    result.parsed.previousFindings.map(formatSpecializedPreviousFindingLine),
  );
  const blockingFindingLines = specializedResults.flatMap((result) => [
    ...result.parsed.previousFindings
      .filter((finding) =>
        ["still_blocking", "new_blocker", "manual_review_required"].includes(finding.status),
      )
      .map((finding) =>
        formatSpecializedBlockingFindingLine({
          id: finding.id,
          source: finding.source,
          text: finding.note,
          status: finding.status,
          closureEvidence: finding.closureEvidence,
        }),
      ),
    ...result.parsed.blockingFindings.map(formatSpecializedBlockingFindingLine),
  ]);
  const advisoryLines = specializedResults.flatMap((result) =>
    result.parsed.advisories.map(formatSpecializedAdvisoryLine),
  );

  const lines = reviewComments.split(/\r?\n/);
  updateStructuredListSection(lines, "## Previous Findings", previousFindingLines);
  updateStructuredListSection(lines, "## Blocking Findings", blockingFindingLines);
  updateStructuredListSection(lines, "## Advisories", advisoryLines);

  for (const result of specializedResults) {
    lines.push(
      "",
      `## Raw Specialized Review: ${result.role}`,
      redactProviderText(result.rawOutput.trim()) || `No ${result.role} reviewer output.`,
    );
  }

  return lines.join("\n");
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
  const reviewAutoReviewReworkContext = formatReviewerAutoReviewStateForPrompt(
    task.autoReviewState,
    ["code_review", "review_gate"],
  );
  const securityAutoReviewReworkContext = formatReviewerAutoReviewStateForPrompt(
    task.autoReviewState,
    ["security_audit"],
  );
  const roadmapArtifact = findRoadmapBatchArtifactByTaskId(taskId);
  const specializedReviewerRoles = resolveRequiredSpecializedReviewerRoles(task, roadmapArtifact);
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
    {
      taskId,
      title: task.title,
      useSubagents,
      strategy,
      reviewIteration,
      specializedReviewerRoles,
    },
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
  const scopeConstraint = `IMPORTANT: Your working directory is ${projectRoot}
All file reads, searches, and analysis must stay within this directory. Do NOT navigate to parent directories or other projects.`;
  const taskIntentContract = formatTaskIntentContractForPrompt(task.taskIntent ?? "general");
  const operatorCommentsBlock = formatRecentHumanCommentsForReviewPrompt(taskId);
  const specializedReviewerInputs = specializedReviewerRoles.map((role) => {
    const previousFindingState = previousFindings.filter((finding) => finding.source === role);
    return {
      role,
      prompt: buildSpecializedReviewerPrompt({
        role,
        scopeConstraint,
        task,
        taskIntentContract,
        auditSynthesisContext,
        auditArtifactReviewScopeBlock,
        operatorCommentsBlock,
        strategy,
        reviewIteration,
        previousFindings: formatPreviousFindingsForPrompt(previousFindingState, role),
        autoReviewReworkContext: formatReviewerAutoReviewStateForPrompt(task.autoReviewState, [
          role,
        ]),
      }),
      passEvidenceFallback: buildSpecializedReviewerPassEvidenceFallback(task),
    };
  });
  const runRequiredSpecializedReviewers = async () => {
    const heartbeatTimer = startHeartbeat(taskId);
    try {
      return await runSpecializedReviewerInputs({
        reviewerInputs: specializedReviewerInputs,
        taskId,
        projectRoot,
        sidecarBudget,
        useSubagents,
        scopeConstraint,
        maxTurns: auditArtifactReviewMaxTurns,
        repositoryInspectionToolBudget: auditArtifactReviewInspectionToolBudget,
      });
    } finally {
      try {
        clearInterval(heartbeatTimer);
      } catch {
        /* safety guard */
      }
    }
  };
  const runSpecializedReviewersForDeterministicArtifact = async () => {
    // Deterministic audit artifact validation is the source of truth for these
    // branches. Model reviewer fanout can add signal for ordinary code review,
    // but it must not turn a valid ledger-backed audit artifact into a retry
    // because an external reviewer timed out or returned malformed text.
    return [];
  };

  if (canUseDeterministicAuditReportReview) {
    recordDeterministicAuditReportReviewActivity(taskId, roadmapArtifact.artifactPath);
    const specializedRoleResults = await runSpecializedReviewersForDeterministicArtifact();
    const combinedReview = mergeSpecializedResultsIntoStructuredReviewComments(
      buildDeterministicAuditReportReviewComments({
        strategy,
        iteration: reviewIteration,
        artifactPath: roadmapArtifact.artifactPath,
        validation: deterministicReviewValidation,
        previousFindings,
      }),
      specializedRoleResults,
    );
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
    const specializedRoleResults = await runSpecializedReviewersForDeterministicArtifact();
    const combinedReview = mergeSpecializedResultsIntoStructuredReviewComments(
      buildDeterministicAuditReportInvalidReviewComments({
        strategy,
        iteration: reviewIteration,
        artifactPath: roadmapArtifact.artifactPath,
        validation: deterministicReviewValidation,
        previousFindings,
      }),
      specializedRoleResults,
    );
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
    const specializedRoleResults = await runSpecializedReviewersForDeterministicArtifact();
    const combinedReview = mergeSpecializedResultsIntoStructuredReviewComments(
      buildDeterministicAuditSynthesisTrustedReviewComments({
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
      }),
      specializedRoleResults,
    );
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
    const specializedRoleResults = await runSpecializedReviewersForDeterministicArtifact();
    const combinedReview = mergeSpecializedResultsIntoStructuredReviewComments(
      buildDeterministicAuditArtifactMissingReviewComments({
        strategy,
        iteration: reviewIteration,
        artifactPath: roadmapArtifact.artifactPath,
        role: roadmapArtifact.role,
        previousFindings,
      }),
      specializedRoleResults,
    );
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
    const specializedRoleResults = await runSpecializedReviewersForDeterministicArtifact();
    const combinedReview = mergeSpecializedResultsIntoStructuredReviewComments(
      buildDeterministicAuditSynthesisInconclusiveReviewComments({
        strategy,
        iteration: reviewIteration,
        artifactPath: roadmapArtifact.artifactPath,
        outcomeReason: deterministicSynthesisOutcome.reason,
        previousFindings,
      }),
      specializedRoleResults,
    );
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

  const reviewMemoryContext = buildTaskMemoryContext({
    task,
    workflowKind: "reviewer",
    source: "agent:reviewer",
    queryParts: [auditSynthesisContext, reviewPreviousFindings, reviewAutoReviewReworkContext],
  });
  const securityMemoryContext = buildTaskMemoryContext({
    task,
    workflowKind: "security_review",
    source: "agent:security-review",
    queryParts: [auditSynthesisContext, securityPreviousFindings, securityAutoReviewReworkContext],
  });
  const reviewMemoryBlock = reviewMemoryContext ? `\n\n${reviewMemoryContext}\n` : "";
  const securityMemoryBlock = securityMemoryContext ? `\n\n${securityMemoryContext}\n` : "";
  const requirementsContext = buildTaskRequirementsContextForPrompt(taskId, "review");
  const requirementsBlock = requirementsContext ? `\n\n${requirementsContext.markdown}\n` : "";
  const raiseQuestionsBlock = `\n\n${formatRaiseQuestionsPromptGuidance("review")}\n`;
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
- Your first output line must be exactly "## Blocking Findings"; do not add an intro, summary, or preface.
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
${reviewMemoryBlock}${requirementsBlock}${raiseQuestionsBlock}

Title: ${task.title}
Description: ${task.description}
Task intent contract:
${taskIntentContract}

Task attachments:
${formatAttachmentsForPrompt(task.attachments)}

Implementation Log:
${task.implementationLog ?? "No implementation log available."}

${formatImplementationManifestForReviewPrompt(task)}

${operatorCommentsBlock}

${auditSynthesisContext}

${auditArtifactReviewScopeBlock}

Auto-review strategy: ${strategy}
Review iteration: ${reviewIteration}

Previous Findings Input:
${reviewPreviousFindings}

Auto-review rework context:
${reviewAutoReviewReworkContext}

Review changed code for correctness, regression risks, performance, and maintainability.

${reviewOutputContract}`;

  const securityPromptBase = `Audit the implementation for security risks:

${scopeConstraint}
${securityMemoryBlock}${requirementsBlock}${raiseQuestionsBlock}

Title: ${task.title}
Description: ${task.description}
Task intent contract:
${taskIntentContract}

Task attachments:
${formatAttachmentsForPrompt(task.attachments)}

Implementation Log:
${task.implementationLog ?? "No implementation log available."}

${formatImplementationManifestForReviewPrompt(task)}

${operatorCommentsBlock}

Auto-review strategy: ${strategy}
Review iteration: ${reviewIteration}

${auditSynthesisContext}

${auditArtifactReviewScopeBlock}

Previous Findings Input:
${securityPreviousFindings}

Auto-review rework context:
${securityAutoReviewReworkContext}

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
    let specializedRoleResults: Array<{
      role: SpecializedReviewerRole;
      rawOutput: string;
      parsed: ParsedSpecializedRoleOutput;
    }> = [];
    try {
      if (useSubagents) {
        const [reviewOutput, securityOutput, ...specializedOutputs] = await Promise.all([
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
          ...specializedReviewerInputs.map((input) =>
            runSpecializedReviewerRole({
              role: input.role,
              prompt: input.prompt,
              taskId,
              projectRoot,
              sidecarBudget,
              useSubagents,
              scopeConstraint,
              maxTurns: auditArtifactReviewMaxTurns,
              repositoryInspectionToolBudget: auditArtifactReviewInspectionToolBudget,
              profileMode: input.role === "security_data_loss" ? "security" : "reviewer",
            }),
          ),
        ]);
        reviewResult = reviewOutput;
        securityResult = securityOutput;
        specializedRoleResults = specializedOutputs;
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
        specializedRoleResults = [];
        for (const input of specializedReviewerInputs) {
          specializedRoleResults.push(
            await runSpecializedReviewerRole({
              role: input.role,
              prompt: input.prompt,
              taskId,
              projectRoot,
              sidecarBudget,
              useSubagents,
              scopeConstraint,
              maxTurns: auditArtifactReviewMaxTurns,
              repositoryInspectionToolBudget: auditArtifactReviewInspectionToolBudget,
              profileMode: input.role === "security_data_loss" ? "security" : "reviewer",
            }),
          );
        }
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

    log.info({ taskId, specializedReviewerRoles }, "Review sidecars completed");

    if (
      handleRaiseQuestionsOutput({
        taskId,
        output: reviewResult,
        stage: "review",
        sourceAgent: reviewAgentName,
        sourcePromptHash: null,
      }) ||
      handleRaiseQuestionsOutput({
        taskId,
        output: securityResult,
        stage: "review",
        sourceAgent: securityAgentName,
        sourcePromptHash: null,
      })
    ) {
      return;
    }
    for (const specializedResult of specializedRoleResults) {
      if (
        handleRaiseQuestionsOutput({
          taskId,
          output: specializedResult.rawOutput,
          stage: "review",
          sourceAgent: SPECIALIZED_REVIEWER_AGENT_NAMES[specializedResult.role],
          sourcePromptHash: null,
        })
      ) {
        return;
      }
    }

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
            specializedReviews: specializedRoleResults.map((result) => result.parsed),
            previousFindingsInput: previousFindings,
            rawCodeReview: reviewResult,
            rawSecurityAudit: securityResult,
            rawSpecializedReviews: specializedRoleResults.map((result) => ({
              role: result.role,
              rawOutput: result.rawOutput,
            })),
          })
        : buildStructuredReviewContractFailureComments({
            strategy,
            iteration: reviewIteration,
            parsedReview: Boolean(parsedReview),
            parsedSecurity: Boolean(parsedSecurity),
            rawCodeReview: reviewResult,
            rawSecurityAudit: securityResult,
            specializedReviews: specializedRoleResults.map((result) => result.parsed),
            rawSpecializedReviews: specializedRoleResults.map((result) => ({
              role: result.role,
              rawOutput: result.rawOutput,
            })),
          });

    if (!parsedReview || !parsedSecurity) {
      log.warn(
        {
          taskId,
          parsedReview: Boolean(parsedReview),
          parsedSecurity: Boolean(parsedSecurity),
          specializedReviewerRoles,
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
        ? `review stage complete (review-sidecar + security-sidecar${
            specializedReviewerRoles.length > 0
              ? ` + ${specializedReviewerRoles.map((role) => SPECIALIZED_REVIEWER_AGENT_NAMES[role]).join(" + ")}`
              : ""
          })`
        : `review stage complete (aif-review + aif-security-checklist${
            specializedReviewerRoles.length > 0 ? " + specialized reviewers" : ""
          })`,
    );
    log.debug({ taskId }, "Review comments saved to task");
  } catch (err) {
    logActivity(taskId, "Agent", `review stage failed — ${(err as Error).message}`);
    throw err;
  }
}
