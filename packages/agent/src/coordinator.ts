import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  clearTaskRuntimeLimitSnapshot,
  blockTaskForRuntimeGateIfEligible,
  evaluateRuntimeLimitGate,
  findCoordinatorTaskCandidates,
  findProjectById,
  findTaskById,
  hasActiveLockedTaskForProject,
  claimTask,
  releaseTaskClaim,
  releaseStaleTaskClaims,
  updateTaskStatus as updateTaskStatusRow,
  listDueScheduledTasks,
  appendTaskActivityLog,
  listAutoQueueProjects,
  nextBacklogTaskByPosition,
  countActivePipelineTasksForProject,
  hasActiveBranchBoundTasksForProject,
  claimBacklogTaskForAdvance,
  persistTaskRuntimeLimitSnapshot,
  resolveEffectiveRuntimeProfile,
  findRoadmapBatchArtifactByTaskId,
  listRoadmapBatchArtifactAttempts,
  listRoadmapReportArtifactsForSynthesis,
  listAuditEvidenceEvents,
  summarizeRoadmapBatch,
  updateRoadmapBatchArtifactState,
  setTaskFields,
  type CoordinatorStage,
  type TaskFieldsPatch,
  type TaskRow,
} from "@aif/data";
import { initProject, type RuntimeRegistry } from "@aif/runtime";
import {
  logger,
  getEnv,
  CLEAN_STATE_RESET,
  evaluateTaskCompletionEvidence,
  extractAuditReportManifestEvidenceRefs,
  formatTaskCompletionBlockedReason,
  buildAuditFailureSignature,
  selectAuditArtifactFailureFamily,
  selectTaskCompletionAuditFailureFamily,
  resolveAuditPlanId,
  TaskPlanQualityError,
  withTimeout,
  type AuditFailureFamily,
  type TaskStatus,
} from "@aif/shared";
import { runPlanner } from "./subagents/planner.js";
import { runPlanChecker } from "./subagents/planChecker.js";
import { runImplementer } from "./subagents/implementer.js";
import { runReviewer } from "./subagents/reviewer.js";
import {
  describeDirtyWorkingTree,
  isGitRepo,
  projectSupportsTaskWorktrees,
  projectUsesSharedBranchIsolation,
} from "./gitBranch.js";
import { flushActivityQueue } from "./hooks.js";
import {
  notifyTaskBroadcast,
  notifyProjectBroadcast,
  type TaskNotificationInfo,
} from "./notifier.js";
import { handleAutoReviewGate } from "./autoReviewHandler.js";
import { classifyStageError } from "./stageErrorHandler.js";
import { setActiveStageAbortController } from "./stageAbort.js";
import { setCoordinatorId } from "./subagentQuery.js";
import {
  getRandomBackoffMinutes,
  releaseDueBlockedTasks,
  recoverStaleInProgressTasks,
} from "./taskWatchdog.js";

const log = logger("coordinator");
const env = getEnv();
const STAGE_RUN_TIMEOUT_MS = Math.max(env.AGENT_STAGE_RUN_TIMEOUT_MS, 60_000);
const CLAIM_LOCK_DURATION_MS = STAGE_RUN_TIMEOUT_MS + 5 * 60 * 1000; // stage timeout + 5 min buffer
const PLAN_QUALITY_MAX_RETRIES = 2;
export const COORDINATOR_ID = crypto.randomUUID();

let _runtimeRegistry: RuntimeRegistry | null = null;
export function setRuntimeRegistry(registry: RuntimeRegistry): void {
  _runtimeRegistry = registry;
}
setCoordinatorId(COORDINATOR_ID);

const runtimeCounters = {
  fastRetryStreamInterruptions: 0,
};

interface StatusTransition {
  from: TaskStatus[];
  inProgress: TaskStatus;
  onSuccess: TaskStatus;
  runner: (taskId: string, projectRoot: string) => Promise<void>;
  label: CoordinatorStage;
}

const PIPELINE: StatusTransition[] = [
  {
    from: ["planning"],
    inProgress: "planning",
    onSuccess: "plan_ready",
    runner: runPlanner,
    label: "planner",
  },
  {
    from: ["plan_ready"],
    inProgress: "plan_ready",
    onSuccess: "plan_ready",
    runner: runPlanChecker,
    label: "plan-checker",
  },
  {
    from: ["plan_ready", "implementing"],
    inProgress: "implementing",
    onSuccess: "review",
    runner: runImplementer,
    label: "implementer",
  },
  {
    from: ["review"],
    inProgress: "review",
    onSuccess: "done",
    runner: runReviewer,
    label: "reviewer",
  },
];

// ── Stage Semaphore ──────────────────────────────────────────

class StageSemaphore {
  private counts = new Map<string, number>();

  tryAcquire(stage: string, max: number): boolean {
    const current = this.counts.get(stage) ?? 0;
    if (current >= max) return false;
    this.counts.set(stage, current + 1);
    return true;
  }

  release(stage: string): void {
    const current = this.counts.get(stage) ?? 0;
    this.counts.set(stage, Math.max(0, current - 1));
  }

  available(stage: string, max: number): number {
    return max - (this.counts.get(stage) ?? 0);
  }

  totalActive(): number {
    let total = 0;
    for (const count of this.counts.values()) total += count;
    return total;
  }

  reset(): void {
    this.counts.clear();
  }
}

const stageSemaphore = new StageSemaphore();

// ── Public API ───────────────────────────────────────────────

export function getCoordinatorRuntimeCounters(): Readonly<typeof runtimeCounters> {
  return { ...runtimeCounters };
}

export function resetCoordinatorRuntimeCountersForTests(): void {
  runtimeCounters.fastRetryStreamInterruptions = 0;
}

export function getStageSemaphore(): StageSemaphore {
  return stageSemaphore;
}

// ── Stage execution ──────────────────────────────────────────

async function runStageWithTimeout(
  runner: (taskId: string, projectRoot: string) => Promise<void>,
  taskId: string,
  projectRoot: string,
  stageLabel: string,
): Promise<void> {
  const abort = new AbortController();
  setActiveStageAbortController(taskId, abort);

  try {
    await withTimeout(
      runner(taskId, projectRoot),
      STAGE_RUN_TIMEOUT_MS,
      `Stage ${stageLabel} timed out after ${STAGE_RUN_TIMEOUT_MS}ms`,
    );
  } catch (err) {
    if (!abort.signal.aborted) {
      abort.abort();
      log.warn({ taskId, stage: stageLabel }, "Aborted subagent process after stage timeout");
    }
    throw err;
  } finally {
    setActiveStageAbortController(taskId, null);
  }
}

/** Update task status with optional field overrides and broadcast. */
function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  extra: Omit<TaskFieldsPatch, "status" | "lastHeartbeatAt" | "updatedAt"> = {},
  info: TaskNotificationInfo = {},
): void {
  updateTaskStatusRow(taskId, status, extra);
  const broadcastType =
    info.fromStatus && info.fromStatus === status ? "task:updated" : "task:moved";
  void notifyTaskBroadcast(taskId, broadcastType, { ...info, toStatus: status });
}

function runtimeProfileModeForStage(stage: CoordinatorStage): "task" | "plan" | "review" {
  if (stage === "planner" || stage === "plan-checker") {
    return "plan";
  }
  if (stage === "reviewer") {
    return "review";
  }
  return "task";
}

function resolveRuntimeGateRetryAfter(gateDecision: ReturnType<typeof evaluateRuntimeLimitGate>): {
  retryAfter: string;
  source: "resetAt" | "retryAfterSeconds" | "random_backoff";
} {
  if (gateDecision.futureHint.resetAt && gateDecision.futureHint.isFuture) {
    return {
      retryAfter: gateDecision.futureHint.resetAt,
      source: gateDecision.futureHint.source.includes("retry_after")
        ? "retryAfterSeconds"
        : "resetAt",
    };
  }

  if (
    typeof gateDecision.futureHint.retryAfterSeconds === "number" &&
    Number.isFinite(gateDecision.futureHint.retryAfterSeconds) &&
    gateDecision.futureHint.retryAfterSeconds >= 0
  ) {
    return {
      retryAfter: new Date(
        Date.now() + gateDecision.futureHint.retryAfterSeconds * 1000,
      ).toISOString(),
      source: "retryAfterSeconds",
    };
  }

  return {
    retryAfter: new Date(Date.now() + getRandomBackoffMinutes() * 60_000).toISOString(),
    source: "random_backoff",
  };
}

function buildRuntimeGateBlockedReason(
  gateDecision: ReturnType<typeof evaluateRuntimeLimitGate>,
): string {
  const snapshot = gateDecision.snapshot;
  const hintSource = gateDecision.futureHint.source;
  const scope = gateDecision.violatedWindow?.scope ?? snapshot?.primaryScope ?? "runtime";
  if (gateDecision.reason === "exact_threshold") {
    const thresholdWindow = gateDecision.violatedWindow;
    if (thresholdWindow) {
      const thresholdValue = thresholdWindow.warningThreshold ?? snapshot?.warningThreshold;
      const percentRemaining = thresholdWindow.percentRemaining;
      if (typeof percentRemaining === "number" && typeof thresholdValue === "number") {
        return `Coordinator pre-start runtime gate: ${scope} threshold reached (${percentRemaining}% <= ${thresholdValue}%; hint=${hintSource})`;
      }
    }
    return `Coordinator pre-start runtime gate: ${scope} threshold reached (hint=${hintSource})`;
  }

  return `Coordinator pre-start runtime gate: ${scope} limit still blocked (hint=${hintSource})`;
}

function proactivelyBlockTaskForRuntimeGate(
  task: TaskRow,
  stage: CoordinatorStage,
  selection: ReturnType<typeof resolveEffectiveRuntimeProfile>,
  gateDecision: ReturnType<typeof evaluateRuntimeLimitGate>,
): void {
  const snapshot = gateDecision.snapshot;
  const { retryAfter, source } = resolveRuntimeGateRetryAfter(gateDecision);
  const blockedReason = buildRuntimeGateBlockedReason(gateDecision);
  const retryCount = (task.retryCount ?? 0) + 1;
  const persistedAt = new Date().toISOString();
  const applied = blockTaskForRuntimeGateIfEligible({
    taskId: task.id,
    expectedProjectId: task.projectId,
    expectedStatus: task.status,
    expectedAutoMode: task.status === "plan_ready" ? task.autoMode === true : undefined,
    blockedFromStatus: task.status,
    blockedReason,
    retryAfter,
    retryCount,
    snapshot,
    persistedAt,
  });

  if (!applied) {
    log.debug(
      {
        taskId: task.id,
        stage,
        runtimeProfileId: selection.profile?.id ?? null,
      },
      "Skipped proactive runtime gate block because candidate changed before CAS update",
    );
    return;
  }

  appendTaskActivityLog(
    task.id,
    `[${persistedAt}] Coordinator runtime gate blocked task before ${stage}: profile=${selection.profile?.id ?? "none"} source=${selection.source} retryAfter=${retryAfter} retryAfterSource=${source}`,
  );
  void notifyTaskBroadcast(task.id, "task:moved", {
    title: task.title,
    fromStatus: task.status,
    toStatus: "blocked_external",
  });

  log.info(
    {
      taskId: task.id,
      stage,
      projectId: task.projectId,
      runtimeProfileId: selection.profile?.id ?? null,
      runtimeSelectionSource: selection.source,
      providerId: snapshot?.providerId ?? selection.profile?.providerId ?? null,
      runtimeId: snapshot?.runtimeId ?? selection.profile?.runtimeId ?? null,
      limitStatus: snapshot?.status ?? null,
      limitPrecision: snapshot?.precision ?? null,
      retryAfter,
      retryAfterSource: source,
      applied,
    },
    "Blocked task before claim due to runtime limit gate",
  );
}

const RECOVERABLE_AUDIT_FAILURE_FAMILIES = new Set<AuditFailureFamily>([
  "invalid_artifact_content",
  "invalid_artifact_contract",
  "invalid_artifact_integrity",
  "invalid_inventory_only",
  "insufficient_substantive_evidence",
  "source_inconclusive",
  "missing_artifact",
  "missing_tool_evidence",
  "rework_needed",
]);

const AUDIT_EVIDENCE_REPAIR_ISSUE_CODES = new Set([
  "insufficient_report_evidence",
  "low_quality_report_evidence",
  "missing_report_manifest",
  "invalid_report_manifest",
  "unsupported_report_manifest_version",
  "missing_report_manifest_fields",
  "missing_audit_evidence_ref",
]);
const AUDIT_REPORT_MANIFEST_BLOCK_PATTERN = /```audit-report-manifest\b/i;

function firstAuditFailureFamily(
  result: ReturnType<typeof evaluateTaskCompletionEvidence>,
): AuditFailureFamily {
  const issueCodes = result.issues.map((entry) => entry.code);
  return (
    selectAuditArtifactFailureFamily({
      issueCodes,
      validationDetails: {
        issues: result.issues,
        evidence: result.evidence,
      },
      fallback: selectTaskCompletionAuditFailureFamily(issueCodes),
    }) ?? "external_blocker"
  );
}

function auditEvidenceRepairIssueCodes(
  result: ReturnType<typeof evaluateTaskCompletionEvidence>,
): string[] {
  return result.issues
    .map((entry) => entry.code)
    .filter(
      (code) =>
        AUDIT_EVIDENCE_REPAIR_ISSUE_CODES.has(code) ||
        code.startsWith("manifest_") ||
        code.startsWith("audit_evidence_"),
    );
}

function artifactStateForFailureFamily(
  family: AuditFailureFamily,
  options: { terminal?: boolean } = {},
):
  | "invalid"
  | "missing"
  | "synthesis_not_ready"
  | "external_blocked"
  | "source_inconclusive"
  | "terminal_inconclusive"
  | "manual_exception" {
  if (family === "missing_artifact") return "missing";
  if (family === "synthesis_not_ready") return "synthesis_not_ready";
  if (family === "inconclusive_batch_evidence") return "terminal_inconclusive";
  if (family === "manual_exception") return "manual_exception";
  if (
    options.terminal &&
    (family === "source_inconclusive" || family === "insufficient_substantive_evidence")
  ) {
    return "source_inconclusive";
  }
  if (family === "external_blocker") return "external_blocked";
  return "invalid";
}

function auditValidationDetails(result: ReturnType<typeof evaluateTaskCompletionEvidence>) {
  return {
    issues: result.issues,
    evidence: result.evidence,
  };
}

function repeatedAuditFailureCount(input: {
  artifact: NonNullable<ReturnType<typeof findRoadmapBatchArtifactByTaskId>>;
  family: AuditFailureFamily;
  result: ReturnType<typeof evaluateTaskCompletionEvidence>;
}): number {
  const signature = buildAuditFailureSignature({
    role: input.artifact.role,
    failureFamily: input.family,
    validationDetails: auditValidationDetails(input.result),
  });
  if (!signature) return 0;
  return listRoadmapBatchArtifactAttempts(input.artifact.id).filter(
    (attempt) =>
      attempt.failureSignature === signature && attempt.reworkStatus === "rework_requested",
  ).length;
}

function returnAuditTaskToRework(input: {
  task: TaskRow;
  artifact: NonNullable<ReturnType<typeof findRoadmapBatchArtifactByTaskId>>;
  fromStatus: TaskStatus;
  title: string;
  blockedReason: string;
  family: AuditFailureFamily;
  result: ReturnType<typeof evaluateTaskCompletionEvidence>;
  projectRoot: string;
  extra?: Omit<TaskFieldsPatch, "status" | "lastHeartbeatAt" | "updatedAt">;
}): boolean {
  updateRoadmapBatchArtifactState({
    taskId: input.task.id,
    state: artifactStateForFailureFamily(input.family),
    failureFamily: input.family,
    reworkStatus: "rework_requested",
    createAttemptBoundary: true,
    validationDetails: auditValidationDetails(input.result),
    contentSha: input.result.evidence.auditReportValidation.artifactSha256,
    branchName: input.task.branchName,
    worktreePath: input.task.worktreePath,
    projectRoot: input.projectRoot,
  });
  clearTaskRuntimeLimitSnapshot(input.task.id);
  updateTaskStatus(
    input.task.id,
    "implementing",
    {
      blockedReason: `${input.family}: ${input.blockedReason}`,
      blockedFromStatus: input.fromStatus,
      retryAfter: null,
      retryCount: input.task.retryCount ?? 0,
      ...input.extra,
      reworkRequested: true,
      manualReviewRequired: false,
    },
    { title: input.title, fromStatus: input.fromStatus },
  );
  appendTaskActivityLog(
    input.task.id,
    `[${new Date().toISOString()}] Audit artifact validation requested rework: ${input.blockedReason}`,
  );
  return true;
}

function holdSynthesisTask(input: {
  task: TaskRow;
  projectRoot: string;
  reason: string;
  validationDetails?: unknown;
  fromStatus?: TaskStatus;
}): boolean {
  const artifact = findRoadmapBatchArtifactByTaskId(input.task.id);
  if (!artifact || artifact.role !== "synthesis") return false;
  updateRoadmapBatchArtifactState({
    taskId: input.task.id,
    state: "synthesis_not_ready",
    failureFamily: "synthesis_not_ready",
    validationDetails: input.validationDetails ?? { reason: input.reason },
    branchName: input.task.branchName,
    worktreePath: input.task.worktreePath,
    projectRoot: input.projectRoot,
  });
  setTaskFields(input.task.id, {
    paused: true,
    blockedReason: input.reason,
    blockedFromStatus: input.fromStatus ?? input.task.status,
    updatedAt: new Date().toISOString(),
  });
  appendTaskActivityLog(input.task.id, `[${new Date().toISOString()}] ${input.reason}`);
  log.info(
    { taskId: input.task.id, batchId: artifact.batchId },
    "Held synthesis task until batch is ready",
  );
  return true;
}

function holdSynthesisIfNotReady(task: TaskRow, projectRoot: string): boolean {
  const artifact = findRoadmapBatchArtifactByTaskId(task.id);
  if (!artifact || artifact.role !== "synthesis") return false;
  const summary = summarizeRoadmapBatch(artifact.batchId);
  if (summary?.synthesisReady) return false;

  const reason = `synthesis_not_ready: waiting for validated audit batch artifacts (${summary?.counts.valid ?? 0}/${summary?.counts.total ?? 0} valid)`;
  return holdSynthesisTask({
    task,
    projectRoot,
    reason,
    validationDetails: summary ?? { reason },
  });
}

function isSynthesisNotReadyError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith("synthesis_not_ready:");
}

function auditEvidenceForArtifact(
  task: TaskRow,
  artifact: ReturnType<typeof findRoadmapBatchArtifactByTaskId>,
  projectRoot?: string,
) {
  if (!artifact) return [];
  const evidenceRefs = projectRoot
    ? extractAuditReportManifestEvidenceRefs(readAuditArtifactText(projectRoot, artifact) ?? "")
    : [];
  return listAuditEvidenceEvents({
    taskId: task.id,
    auditPlanId: resolveAuditPlanId({ taskId: task.id, roadmapBatchId: artifact.batchId }),
    evidenceIds: evidenceRefs.length > 0 ? evidenceRefs : undefined,
    limit: evidenceRefs.length > 0 ? Math.max(1, evidenceRefs.length) : undefined,
  });
}

function readAuditArtifactText(
  projectRoot: string,
  artifact: ReturnType<typeof findRoadmapBatchArtifactByTaskId>,
): string | null {
  if (!artifact) return null;
  try {
    const reportPath = resolve(projectRoot, artifact.artifactPath);
    return existsSync(reportPath) ? readFileSync(reportPath, "utf8") : null;
  } catch {
    return null;
  }
}

function auditArtifactRequiresLedgerEvidence(input: {
  artifact: ReturnType<typeof findRoadmapBatchArtifactByTaskId>;
  projectRoot: string;
  auditEvidenceUnits: unknown[];
}): boolean {
  if (!input.artifact) return false;
  if (input.auditEvidenceUnits.length > 0) return true;
  return AUDIT_REPORT_MANIFEST_BLOCK_PATTERN.test(
    readAuditArtifactText(input.projectRoot, input.artifact) ?? "",
  );
}

function blockTaskForCompletionEvidenceIfNeeded(input: {
  task: TaskRow;
  projectRoot: string;
  fromStatus: TaskStatus;
  title: string;
  requireManualReview?: boolean;
  phase?: "pre_implementation" | "completion";
  extra?: Omit<TaskFieldsPatch, "status" | "lastHeartbeatAt" | "updatedAt">;
}): boolean {
  const artifact = findRoadmapBatchArtifactByTaskId(input.task.id);
  const auditArtifactRole =
    artifact?.role === "report" || artifact?.role === "synthesis" ? artifact.role : null;
  const allowedEvidenceArtifactPaths =
    artifact?.role === "synthesis"
      ? listRoadmapReportArtifactsForSynthesis(artifact.batchId).map((entry) => entry.artifactPath)
      : [];
  const auditEvidenceUnits = auditEvidenceForArtifact(input.task, artifact, input.projectRoot);
  const requireAuditLedgerEvidence = auditArtifactRequiresLedgerEvidence({
    artifact,
    projectRoot: input.projectRoot,
    auditEvidenceUnits,
  });
  const result = evaluateTaskCompletionEvidence({
    task: {
      ...input.task,
      expectedReportArtifactPath: artifact?.artifactPath ?? null,
      allowedEvidenceArtifactPaths,
      auditArtifactRole,
      roadmapBatchId: artifact?.batchId ?? null,
    },
    projectRoot: input.projectRoot,
    requireManualReview: input.requireManualReview,
    phase: input.phase,
    auditEvidenceUnits,
    requireAuditLedgerEvidence: input.phase !== "pre_implementation" && requireAuditLedgerEvidence,
  });
  if (result.ok) {
    if (artifact && input.phase !== "pre_implementation") {
      updateRoadmapBatchArtifactState({
        taskId: input.task.id,
        state: "valid",
        failureFamily: null,
        reworkStatus: "accepted",
        attemptBoundaryId: artifact.attemptBoundaryId,
        validationDetails: {
          evidence: result.evidence,
        },
        contentSha: result.evidence.auditReportValidation.artifactSha256,
        branchName: input.task.branchName,
        worktreePath: input.task.worktreePath,
        projectRoot: input.projectRoot,
      });
    }
    return false;
  }

  const family = firstAuditFailureFamily(result);
  const auditReviewIteration =
    typeof input.extra?.reviewIterationCount === "number"
      ? input.extra.reviewIterationCount
      : (input.task.reviewIterationCount ?? 0);
  const auditMaxReviewIterations =
    input.task.maxReviewIterations ?? env.AGENT_MAX_REVIEW_ITERATIONS;
  const recoverableAuditArtifactFailure =
    Boolean(artifact) &&
    input.phase !== "pre_implementation" &&
    RECOVERABLE_AUDIT_FAILURE_FAMILIES.has(family);
  const repeatedSameFailure =
    recoverableAuditArtifactFailure && artifact
      ? repeatedAuditFailureCount({ artifact, family, result }) > 0
      : false;
  const shouldReturnToRework =
    recoverableAuditArtifactFailure &&
    !repeatedSameFailure &&
    auditReviewIteration < auditMaxReviewIterations;
  const auditReworkLimitReached = recoverableAuditArtifactFailure && !shouldReturnToRework;
  const baseBlockedReason = formatTaskCompletionBlockedReason(result, {
    suppressManualReviewWhenActionable: shouldReturnToRework,
  });
  const repairIssueCodes = auditEvidenceRepairIssueCodes(result);
  const auditEvidenceRepairRequired =
    shouldReturnToRework && auditReviewIteration >= 2 && repairIssueCodes.length > 0;
  const actionableBlockedReason = auditEvidenceRepairRequired
    ? `audit_evidence_repair_required (${repairIssueCodes.join(", ")}): ${baseBlockedReason}`
    : baseBlockedReason;
  const blockedReason = repeatedSameFailure
    ? `${baseBlockedReason} Manual review required: repeated same audit artifact failure signature.`
    : auditReworkLimitReached
      ? `${baseBlockedReason} Manual review required: audit evidence guard failed after ${auditReviewIteration}/${auditMaxReviewIterations} review iterations.`
      : actionableBlockedReason;
  const terminalBlockedReason = artifact ? `${family}: ${blockedReason}` : blockedReason;
  if (shouldReturnToRework && artifact) {
    return returnAuditTaskToRework({
      task: input.task,
      artifact,
      fromStatus: input.fromStatus,
      title: input.title,
      blockedReason,
      family,
      result,
      projectRoot: input.projectRoot,
      extra: input.extra,
    });
  }
  if (artifact) {
    updateRoadmapBatchArtifactState({
      taskId: input.task.id,
      state: artifactStateForFailureFamily(family, { terminal: auditReworkLimitReached }),
      failureFamily: family,
      attemptBoundaryId: artifact.attemptBoundaryId,
      reworkStatus:
        artifactStateForFailureFamily(family, { terminal: auditReworkLimitReached }) ===
        "terminal_inconclusive"
          ? "terminal_inconclusive"
          : "manual_review_required",
      validationDetails: auditValidationDetails(result),
      contentSha: result.evidence.auditReportValidation.artifactSha256,
      branchName: input.task.branchName,
      worktreePath: input.task.worktreePath,
      projectRoot: input.projectRoot,
    });
  }
  const nowIso = new Date().toISOString();
  clearTaskRuntimeLimitSnapshot(input.task.id);
  updateTaskStatus(
    input.task.id,
    "blocked_external",
    {
      blockedReason: terminalBlockedReason,
      blockedFromStatus: input.fromStatus,
      retryAfter: null,
      retryCount: input.task.retryCount ?? 0,
      ...input.extra,
      manualReviewRequired:
        auditReworkLimitReached ||
        result.issues.some((entry) => entry.code === "manual_review_required"),
    },
    { title: input.title, fromStatus: input.fromStatus },
  );
  appendTaskActivityLog(
    input.task.id,
    `[${nowIso}] Completion evidence guard blocked terminal transition: ${terminalBlockedReason}`,
  );
  log.warn(
    {
      taskId: input.task.id,
      fromStatus: input.fromStatus,
      issues: result.issues.map((entry) => entry.code),
      changedFiles: result.evidence.changedFiles,
      reportArtifactFiles: result.evidence.reportArtifactFiles,
    },
    "Completion evidence guard blocked terminal transition",
  );
  return true;
}

function reworkCompletionEvidenceAlreadySatisfied(task: TaskRow, projectRoot: string): boolean {
  if (!task.reworkRequested) return false;
  const artifact = findRoadmapBatchArtifactByTaskId(task.id);
  if (!artifact) return false;
  if (artifact.role === "report") return false;
  if (artifact.role === "synthesis") return false;
  const allowedEvidenceArtifactPaths =
    artifact.role === "synthesis"
      ? listRoadmapReportArtifactsForSynthesis(artifact.batchId).map((entry) => entry.artifactPath)
      : [];
  const auditArtifactRole =
    artifact.role === "report" || artifact.role === "synthesis" ? artifact.role : null;
  const auditEvidenceUnits = auditEvidenceForArtifact(task, artifact, projectRoot);
  const requireAuditLedgerEvidence = auditArtifactRequiresLedgerEvidence({
    artifact,
    projectRoot,
    auditEvidenceUnits,
  });
  const result = evaluateTaskCompletionEvidence({
    task: {
      ...task,
      expectedReportArtifactPath: artifact.artifactPath,
      allowedEvidenceArtifactPaths,
      auditArtifactRole,
      roadmapBatchId: artifact.batchId,
    },
    projectRoot,
    auditEvidenceUnits,
    requireAuditLedgerEvidence,
  });
  return result.ok;
}

function findTaskPlanQualityError(error: unknown): TaskPlanQualityError | null {
  if (error instanceof TaskPlanQualityError) return error;
  if (error instanceof Error && "cause" in error && error.cause) {
    return findTaskPlanQualityError(error.cause);
  }
  return null;
}

function isPlanQualityRetryState(task: TaskRow): boolean {
  return (
    task.blockedFromStatus === "plan_ready" &&
    Boolean(task.blockedReason?.startsWith("Plan quality guard"))
  );
}

function handlePlanQualityFailure(input: {
  task: TaskRow;
  stageInProgress: TaskStatus;
  taskTitle: string;
  error: TaskPlanQualityError;
}): void {
  const latestTask = findTaskById(input.task.id) ?? input.task;
  const nextRetryCount = (latestTask.retryCount ?? 0) + 1;
  const categories = input.error.result.categories.join(", ");
  const nowIso = new Date().toISOString();

  if (nextRetryCount <= PLAN_QUALITY_MAX_RETRIES) {
    const feedback = `${input.error.message} Replan with concrete task-specific steps, required artifact paths, and diagnostic-only constraints where applicable.`;
    clearTaskRuntimeLimitSnapshot(input.task.id);
    updateTaskStatus(
      input.task.id,
      "planning",
      {
        blockedReason: `Plan quality guard replan ${nextRetryCount}/${PLAN_QUALITY_MAX_RETRIES}: ${feedback}`,
        blockedFromStatus: input.stageInProgress,
        retryAfter: null,
        retryCount: nextRetryCount,
      },
      { title: input.taskTitle, fromStatus: input.stageInProgress },
    );
    appendTaskActivityLog(
      input.task.id,
      `[${nowIso}] Plan quality guard requested replan ${nextRetryCount}/${PLAN_QUALITY_MAX_RETRIES}: ${categories}`,
    );
    log.warn(
      {
        taskId: input.task.id,
        retryCount: nextRetryCount,
        maxRetries: PLAN_QUALITY_MAX_RETRIES,
        categories: input.error.result.categories,
      },
      "Plan quality guard requeued task for replanning",
    );
    return;
  }

  const blockedReason = `${input.error.message} Retry limit reached (${PLAN_QUALITY_MAX_RETRIES}). Operator next step: edit the task prompt or plan constraints, then retry from blocked.`;
  clearTaskRuntimeLimitSnapshot(input.task.id);
  updateTaskStatus(
    input.task.id,
    "blocked_external",
    {
      blockedReason,
      blockedFromStatus: input.stageInProgress,
      retryAfter: null,
      retryCount: nextRetryCount,
    },
    { title: input.taskTitle, fromStatus: input.stageInProgress },
  );
  appendTaskActivityLog(
    input.task.id,
    `[${nowIso}] Plan quality guard blocked task after retry limit: ${categories}`,
  );
  log.error(
    {
      taskId: input.task.id,
      retryCount: nextRetryCount,
      maxRetries: PLAN_QUALITY_MAX_RETRIES,
      categories: input.error.result.categories,
    },
    "Plan quality guard blocked task after retry limit",
  );
}

// ── Single task processing ───────────────────────────────────

/** Returns true on success, false on failure. */
async function processOneTask(task: TaskRow, stage: StatusTransition): Promise<boolean> {
  const project = findProjectById(task.projectId);

  if (!project) {
    log.error(
      { taskId: task.id, projectId: task.projectId },
      "Project not found for task, skipping",
    );
    return false;
  }

  const executionRoot = task.worktreePath ?? project.rootPath;

  if (_runtimeRegistry) {
    const initResult = initProject({
      projectRoot: executionRoot,
      registry: _runtimeRegistry,
    });
    if (!initResult.ok) {
      log.error(
        { taskId: task.id, projectId: task.projectId, error: initResult.error },
        "Project .ai-factory/ scaffold missing and init failed, skipping task",
      );
      return false;
    }
  }

  log.info(
    {
      taskId: task.id,
      title: task.title,
      stage: stage.label,
      projectRoot: project.rootPath,
      worktreePath: task.worktreePath ?? null,
    },
    "Picked up task for processing",
  );
  const sourceStatus = task.status;
  const taskTitle = task.title;

  if (stage.label === "implementer" && holdSynthesisIfNotReady(task, executionRoot)) {
    return false;
  }

  if (
    stage.label === "implementer" &&
    reworkCompletionEvidenceAlreadySatisfied(task, executionRoot)
  ) {
    const nowIso = new Date().toISOString();
    clearTaskRuntimeLimitSnapshot(task.id);
    updateTaskStatus(
      task.id,
      "review",
      {
        ...CLEAN_STATE_RESET,
        reviewIterationCount: task.reviewIterationCount ?? 0,
      },
      { title: taskTitle, fromStatus: sourceStatus },
    );
    appendTaskActivityLog(
      task.id,
      `[${nowIso}] Completion evidence already satisfied before rework implementation; skipping implementer and returning to review.`,
    );
    log.info(
      { taskId: task.id, from: sourceStatus, to: "review" },
      "Skipped redundant rework implementation because completion evidence is already satisfied",
    );
    return true;
  }

  if (
    stage.label === "implementer" &&
    blockTaskForCompletionEvidenceIfNeeded({
      task,
      projectRoot: executionRoot,
      fromStatus: sourceStatus,
      title: taskTitle,
      phase: "pre_implementation",
    })
  ) {
    return false;
  }

  updateTaskStatus(task.id, stage.inProgress, {}, { title: taskTitle, fromStatus: sourceStatus });

  log.debug(
    { taskId: task.id, from: sourceStatus, to: stage.inProgress },
    "Status transition (start)",
  );

  try {
    await runStageWithTimeout(stage.runner, task.id, executionRoot, stage.label);

    flushActivityQueue(task.id);
    let latestTask = findTaskById(task.id) ?? task;

    if (stage.label === "implementer" && latestTask.skipReview) {
      if (
        blockTaskForCompletionEvidenceIfNeeded({
          task: latestTask,
          projectRoot: executionRoot,
          fromStatus: stage.inProgress,
          title: taskTitle,
        })
      ) {
        return false;
      }
      clearTaskRuntimeLimitSnapshot(task.id);
      updateTaskStatus(task.id, "done", CLEAN_STATE_RESET, {
        title: taskTitle,
        fromStatus: stage.inProgress,
      });
      log.info(
        { taskId: task.id, from: stage.inProgress, to: "done" },
        "Skip review enabled — bypassing review stage",
      );
      return true;
    }

    if (stage.label === "reviewer") {
      const outcome = await handleAutoReviewGate({
        taskId: task.id,
        projectRoot: task.worktreePath ?? project.rootPath,
      });

      if (outcome?.status === "manual_review_required") {
        latestTask = findTaskById(task.id) ?? latestTask;
        if (
          blockTaskForCompletionEvidenceIfNeeded({
            task: latestTask,
            projectRoot: executionRoot,
            fromStatus: stage.inProgress,
            title: taskTitle,
            requireManualReview: true,
            extra: {
              reworkRequested: false,
              reviewIterationCount: outcome.currentIteration,
              autoReviewState: outcome.autoReviewState,
            },
          })
        ) {
          return false;
        }
        clearTaskRuntimeLimitSnapshot(task.id);
        updateTaskStatus(
          task.id,
          "done",
          {
            blockedReason: null,
            blockedFromStatus: null,
            retryAfter: null,
            retryCount: 0,
            reworkRequested: false,
            reviewIterationCount: outcome.currentIteration,
            manualReviewRequired: true,
            autoReviewState: outcome.autoReviewState,
          },
          {
            title: taskTitle,
            fromStatus: stage.inProgress,
          },
        );
        log.info(
          {
            taskId: task.id,
            from: stage.inProgress,
            to: "done",
            reviewIteration: outcome.currentIteration,
            handoffReason: outcome.handoffReason,
          },
          "Auto review gate stopped at manual review handoff",
        );
        return true;
      }

      if (outcome?.status === "rework_requested") {
        clearTaskRuntimeLimitSnapshot(task.id);
        updateTaskStatus(
          task.id,
          "implementing",
          {
            blockedReason: null,
            blockedFromStatus: null,
            retryAfter: null,
            retryCount: 0,
            reworkRequested: true,
            reviewIterationCount: outcome.currentIteration,
            manualReviewRequired: false,
            autoReviewState: outcome.autoReviewState,
          },
          { title: taskTitle, fromStatus: stage.inProgress },
        );
        log.info(
          {
            taskId: task.id,
            from: stage.inProgress,
            to: "implementing",
            reviewIteration: outcome.currentIteration,
          },
          "Auto review gate requested changes, restarting implementing stage",
        );
        return true;
      }

      if (outcome?.status === "accepted") {
        latestTask = findTaskById(task.id) ?? latestTask;
        if (
          blockTaskForCompletionEvidenceIfNeeded({
            task: latestTask,
            projectRoot: executionRoot,
            fromStatus: stage.inProgress,
            title: taskTitle,
            extra: {
              reviewIterationCount: outcome.currentIteration,
              autoReviewState: outcome.autoReviewState,
            },
          })
        ) {
          return false;
        }
        clearTaskRuntimeLimitSnapshot(task.id);
        updateTaskStatus(task.id, "done", CLEAN_STATE_RESET, {
          title: taskTitle,
          fromStatus: stage.inProgress,
        });
        log.info(
          { taskId: task.id, from: stage.inProgress, to: "done" },
          "Auto review gate accepted review, moving to done",
        );
        return true;
      }
    }

    if (stage.onSuccess === "done") {
      latestTask = findTaskById(task.id) ?? latestTask;
      if (
        blockTaskForCompletionEvidenceIfNeeded({
          task: latestTask,
          projectRoot: executionRoot,
          fromStatus: stage.inProgress,
          title: taskTitle,
        })
      ) {
        return false;
      }
    }

    const successReset: Omit<TaskFieldsPatch, "status" | "lastHeartbeatAt" | "updatedAt"> = {
      ...CLEAN_STATE_RESET,
      reviewIterationCount: stage.label === "implementer" ? (task.reviewIterationCount ?? 0) : 0,
    };
    if (stage.label === "planner" && isPlanQualityRetryState(latestTask)) {
      successReset.retryCount = latestTask.retryCount ?? 0;
    }

    clearTaskRuntimeLimitSnapshot(task.id);
    updateTaskStatus(task.id, stage.onSuccess, successReset, {
      title: taskTitle,
      fromStatus: stage.inProgress,
    });

    log.info(
      { taskId: task.id, from: stage.inProgress, to: stage.onSuccess },
      "Status transition (success)",
    );
    return true;
  } catch (err) {
    const planQualityError = stage.label === "plan-checker" ? findTaskPlanQualityError(err) : null;
    if (planQualityError) {
      handlePlanQualityFailure({
        task,
        stageInProgress: stage.inProgress,
        taskTitle,
        error: planQualityError,
      });
      flushActivityQueue(task.id);
      return false;
    }

    if (
      stage.label === "implementer" &&
      isSynthesisNotReadyError(err) &&
      holdSynthesisTask({
        task: findTaskById(task.id) ?? task,
        projectRoot: executionRoot,
        reason: err.message,
        validationDetails: { reason: err.message },
        fromStatus: stage.inProgress,
      })
    ) {
      flushActivityQueue(task.id);
      return false;
    }

    const recovery = classifyStageError({
      taskId: task.id,
      stageLabel: stage.label,
      sourceStatus,
      retryCount: task.retryCount ?? 0,
      err,
    });

    switch (recovery.kind) {
      case "fast_retry":
        runtimeCounters.fastRetryStreamInterruptions += 1;
        log.warn(
          {
            taskId: task.id,
            stage: stage.label,
            metric: "coordinator.fast_retry_stream_interruptions",
            fastRetryStreamInterruptions: runtimeCounters.fastRetryStreamInterruptions,
          },
          "Fast retry scheduled after transient stream interruption",
        );
        clearTaskRuntimeLimitSnapshot(task.id);
        updateTaskStatus(
          task.id,
          stage.inProgress,
          {
            blockedReason: null,
            blockedFromStatus: null,
            retryAfter: null,
          },
          { title: taskTitle, fromStatus: stage.inProgress },
        );
        break;

      case "blocked_external":
        if (recovery.limitSnapshot) {
          persistTaskRuntimeLimitSnapshot(task.id, recovery.limitSnapshot);
        } else {
          clearTaskRuntimeLimitSnapshot(task.id);
        }
        updateTaskStatus(
          task.id,
          "blocked_external",
          {
            blockedReason: recovery.blockedReason,
            blockedFromStatus: stage.inProgress,
            retryAfter: recovery.retryAfter,
            retryCount: recovery.retryCount,
          },
          { title: taskTitle, fromStatus: stage.inProgress },
        );
        break;

      case "revert":
        clearTaskRuntimeLimitSnapshot(task.id);
        updateTaskStatus(
          task.id,
          stage.inProgress,
          {},
          { title: taskTitle, fromStatus: stage.inProgress },
        );
        break;
    }

    flushActivityQueue(task.id);
    return false;
  }
}

// ── Scheduled-task trigger ───────────────────────────────────

/**
 * Fire due scheduled tasks into the planning stage.
 *
 * Backlog tasks with `scheduledAt <= now` transition to `planning` (same path
 * as the human `start_ai` event). Clears `scheduledAt` atomically, records an
 * activity-log entry, and broadcasts `task:scheduled_fired`.
 */
export function processDueScheduledTasks(): number {
  const nowIso = new Date().toISOString();
  const due = listDueScheduledTasks(nowIso);
  if (due.length === 0) {
    log.debug({ nowIso }, "No due scheduled tasks");
    return 0;
  }

  log.info({ dueCount: due.length, nowIso }, "Firing due scheduled tasks");

  let fired = 0;
  for (const task of due) {
    try {
      // CAS-style claim: only proceed if the row is still backlog+unpaused
      // at the moment of the write. Prevents racing with auto-queue or with
      // a parallel coordinator instance.
      if (!claimBacklogTaskForAdvance(task.id)) {
        log.debug({ taskId: task.id }, "Scheduler: task no longer backlog/unpaused, skipped");
        continue;
      }
      appendTaskActivityLog(
        task.id,
        `[${nowIso}] [scheduler] Fired scheduled task (was due at ${task.scheduledAt})`,
      );
      void notifyTaskBroadcast(task.id, "task:scheduled_fired", {
        title: task.title,
        fromStatus: task.status,
        toStatus: "planning",
      });
      // Mirror the standard status broadcast that updateTaskStatus would
      // have sent, so kanban columns re-render through the existing
      // task:moved code path (and Telegram fires for the transition).
      void notifyTaskBroadcast(task.id, "task:moved", {
        title: task.title,
        fromStatus: task.status,
        toStatus: "planning",
      });
      fired += 1;
      log.info(
        { taskId: task.id, title: task.title, scheduledAt: task.scheduledAt },
        "Scheduled task fired",
      );
    } catch (err) {
      log.error({ taskId: task.id, err }, "Failed to fire scheduled task");
    }
  }

  log.info({ fired, attempted: due.length }, "Scheduled-task trigger pass complete");
  return fired;
}

// ── Auto-queue advance ───────────────────────────────────────

/**
 * For each project with `autoQueueMode = true`, fill the pipeline up to the
 * project's pool depth by advancing backlog tasks (lowest `position` first)
 * into `planning`. Pool depth is `1` for sequential projects and
 * `COORDINATOR_MAX_CONCURRENT_TASKS` for parallel projects, so the same
 * code path covers both:
 *   - non-parallel project: strict sequential — next task starts only after
 *     the previous reaches a terminal status (done/verified)
 *   - parallel project: keeps the in-flight count at the parallel cap
 *
 * "In flight" = any non-terminal pipeline status (planning..review and
 * blocked_external). Terminal = done/verified. Backlog itself is the source
 * pool and doesn't count.
 */
export function processAutoQueueAdvance(): number {
  const projects = listAutoQueueProjects();
  if (projects.length === 0) {
    log.debug("No projects with auto-queue mode enabled");
    return 0;
  }

  let advanced = 0;
  for (const project of projects) {
    // Serialization predicate combines:
    //   - current config (`git.create_branches=true` on a real git repo), AND
    //   - task state (any in-flight task already has a persisted branchName).
    //
    // Config alone is not enough: an operator can toggle `create_branches=off`
    // mid-pipeline. Legacy branch-bound tasks without worktreePath still
    // switch HEAD in the shared root, so they force serial execution. Projects
    // that support task worktrees can keep the parallel pool open because the
    // planner provisions an isolated cwd before mutating files.
    const usesSharedBranchIsolation =
      (projectUsesSharedBranchIsolation(project.rootPath) &&
        (!env.AIF_TASK_WORKTREES_ENABLED || !projectSupportsTaskWorktrees(project.rootPath))) ||
      hasActiveBranchBoundTasksForProject(project.id);
    if (project.parallelEnabled && usesSharedBranchIsolation) {
      log.warn(
        { projectId: project.id, projectRoot: project.rootPath },
        "Auto-queue parallel pool disabled while legacy branch-bound tasks without worktrees are active",
      );
    }
    const limit =
      project.parallelEnabled && !usesSharedBranchIsolation
        ? env.COORDINATOR_MAX_CONCURRENT_TASKS
        : 1;
    let active = countActivePipelineTasksForProject(project.id);

    if (active >= limit) {
      log.debug(
        { projectId: project.id, active, limit },
        "Auto-queue: project pipeline at capacity, skipping",
      );
      continue;
    }

    // Dirty-worktree gate. Terminal statuses (done/verified) don't
    // guarantee the previous task's diff was committed — manual-review
    // pauses the pipeline with a clean-status but dirty repo. Advancing
    // the next task now would let its planner create a feature branch
    // on top of stale changes (or fail checkout outright). Pause
    // auto-queue advance for this project until the work tree is clean.
    if (
      isGitRepo(project.rootPath) &&
      (!env.AIF_TASK_WORKTREES_ENABLED || !projectSupportsTaskWorktrees(project.rootPath))
    ) {
      const dirty = describeDirtyWorkingTree(project.rootPath);
      if (dirty) {
        log.warn(
          { projectId: project.id, projectRoot: project.rootPath, dirtyPreview: dirty },
          "Auto-queue paused: work tree has uncommitted changes from previous task",
        );
        continue;
      }
    }

    // Fill the pool up to the limit in this single tick. Loop bound keeps it
    // cheap (limit is small, default 3) and avoids waiting another full poll
    // cycle to start the second/third task.
    while (active < limit) {
      const next = nextBacklogTaskByPosition(project.id);
      if (!next) {
        log.debug(
          { projectId: project.id, active, limit },
          "Auto-queue: no more backlog tasks ready to advance",
        );
        break;
      }

      const nowIso = new Date().toISOString();
      try {
        // CAS-style claim: only proceed if the row is still backlog+unpaused.
        // If false, another pass (scheduler / parallel coordinator / human
        // start_ai click) won the race — re-read pool counters and continue.
        if (!claimBacklogTaskForAdvance(next.id)) {
          log.debug(
            { taskId: next.id, projectId: project.id },
            "Auto-queue: task no longer backlog/unpaused, skipped",
          );
          active = countActivePipelineTasksForProject(project.id);
          continue;
        }
        // Mirror the broadcast that updateTaskStatus would have produced for
        // the backlog → planning transition (CAS write skips it).
        void notifyTaskBroadcast(next.id, "task:moved", {
          title: next.title,
          fromStatus: next.status,
          toStatus: "planning",
        });
        appendTaskActivityLog(
          next.id,
          `[${nowIso}] [auto-queue] Advanced by project auto-queue mode (pool ${active + 1}/${limit})`,
        );
        void notifyProjectBroadcast(project.id, "project:auto_queue_advanced", {
          taskId: next.id,
        });
        advanced += 1;
        active += 1;
        log.info(
          {
            projectId: project.id,
            taskId: next.id,
            title: next.title,
            position: next.position,
            poolDepth: `${active}/${limit}`,
          },
          "Auto-queue advanced next backlog task",
        );
      } catch (err) {
        log.error({ projectId: project.id, taskId: next.id, err }, "Auto-queue advance failed");
        // Bail out of this project's loop on error; try again next tick.
        break;
      }
    }
  }

  if (advanced > 0) {
    log.info({ advanced, projectCount: projects.length }, "Auto-queue advance pass complete");
  }
  return advanced;
}

// ── Poll cycle ───────────────────────────────────────────────

export async function pollAndProcess(): Promise<void> {
  log.debug("Starting poll cycle");

  // Release stale locks BEFORE watchdog — otherwise watchdog moves task to blocked_external
  // and the lock remains orphaned (heartbeat cleanup filters by in-progress status)
  const released = releaseStaleTaskClaims();
  if (released > 0) {
    log.info({ released }, "Released stale task claims");
  }

  releaseDueBlockedTasks();
  recoverStaleInProgressTasks();
  processDueScheduledTasks();
  processAutoQueueAdvance();

  const globalMax = env.COORDINATOR_MAX_CONCURRENT_TASKS;

  // Track tasks that failed in this cycle — prevent re-picking in downstream stages
  const failedInCycle = new Set<string>();

  // Cache effective project concurrency settings to avoid repeated lookups.
  // Legacy branch-bound tasks without worktreePath still mutate one shared
  // projectRoot, so those projects stay serial until the legacy task drains.
  const projectConcurrencyCache = new Map<string, { parallel: boolean; max: number }>();
  function resolveProjectConcurrency(projectId: string): { parallel: boolean; max: number } {
    let cached = projectConcurrencyCache.get(projectId);
    if (cached === undefined) {
      const project = findProjectById(projectId);
      const configuredParallel = project?.parallelEnabled ?? false;
      // Mirror processAutoQueueAdvance: config OR task-state forces serial.
      const usesSharedBranchIsolation = project
        ? (projectUsesSharedBranchIsolation(project.rootPath) &&
            (!env.AIF_TASK_WORKTREES_ENABLED || !projectSupportsTaskWorktrees(project.rootPath))) ||
          hasActiveBranchBoundTasksForProject(projectId)
        : false;
      cached = {
        parallel: configuredParallel && !usesSharedBranchIsolation,
        max: configuredParallel && !usesSharedBranchIsolation ? globalMax : 1,
      };
      if (configuredParallel && usesSharedBranchIsolation) {
        log.warn(
          { projectId, projectRoot: project?.rootPath },
          "Project parallel execution forced to serial while legacy branch-bound tasks without worktrees remain active",
        );
      }
      projectConcurrencyCache.set(projectId, cached);
    }
    return cached;
  }

  for (const stage of PIPELINE) {
    // Global cap: total active tasks across all stages (prevents resource exhaustion
    // when multiple poll cycles overlap from cron + wake)
    const totalActive = stageSemaphore.totalActive();
    if (totalActive >= globalMax) {
      log.debug(
        { stage: stage.label, totalActive, globalMax },
        "Global task limit reached, skipping stage",
      );
      continue;
    }

    // Per-project spawn count scoped to this stage (stages are sequential via allSettled)
    const projectSpawnCount = new Map<string, number>();

    const availableInStage = stageSemaphore.available(stage.label, globalMax);
    const availableGlobal = globalMax - totalActive;
    const available = Math.min(availableInStage, availableGlobal);
    if (available <= 0) {
      log.debug({ stage: stage.label }, "Stage at capacity, skipping");
      continue;
    }

    const candidateWindow = Math.min(Math.max(available * 5, available), 50);
    const candidates = findCoordinatorTaskCandidates(stage.label, candidateWindow).filter(
      (t) => !failedInCycle.has(t.id),
    );

    if (candidates.length === 0) {
      log.debug({ stage: stage.label }, "No tasks to process");
      continue;
    }

    log.debug(
      {
        stage: stage.label,
        candidateCount: candidates.length,
        candidateWindow,
        available,
      },
      "Task candidates selected",
    );

    const spawned: Promise<void>[] = [];

    for (const task of candidates) {
      // Per-project concurrency: non-parallel projects limited to 1 task at a time
      const concurrency = resolveProjectConcurrency(task.projectId);
      const parallel = concurrency.parallel;
      const projectMax = concurrency.max;
      const projectCount = projectSpawnCount.get(task.projectId) ?? 0;
      if (projectCount >= projectMax) {
        log.debug(
          { taskId: task.id, projectId: task.projectId },
          "Project at capacity, skipping task",
        );
        continue;
      }

      // Cross-cycle guard: for non-parallel projects, check DB for any active lock
      // (another concurrent poll cycle may have already claimed a task for this project)
      if (!parallel && hasActiveLockedTaskForProject(task.projectId)) {
        log.debug(
          { taskId: task.id, projectId: task.projectId },
          "Non-parallel project has active lock from another cycle, skipping",
        );
        continue;
      }

      const runtimeSelection = resolveEffectiveRuntimeProfile({
        taskId: task.id,
        projectId: task.projectId,
        mode: runtimeProfileModeForStage(stage.label),
      });
      const gateDecision = evaluateRuntimeLimitGate(runtimeSelection.profile);
      if (gateDecision.blocked) {
        log.debug(
          {
            taskId: task.id,
            stage: stage.label,
            projectId: task.projectId,
            runtimeProfileId: gateDecision.runtimeProfileId,
            runtimeSelectionSource: runtimeSelection.source,
            gateReason: gateDecision.reason,
            limitPrecision: gateDecision.snapshot?.precision ?? null,
          },
          "Task candidate blocked by proactive runtime gate",
        );
        proactivelyBlockTaskForRuntimeGate(task, stage.label, runtimeSelection, gateDecision);
        continue;
      }

      if (!claimTask(task.id, COORDINATOR_ID, CLAIM_LOCK_DURATION_MS)) {
        log.debug({ taskId: task.id, stage: stage.label }, "Task claim failed (already claimed)");
        continue;
      }

      if (
        stageSemaphore.totalActive() >= globalMax ||
        !stageSemaphore.tryAcquire(stage.label, globalMax)
      ) {
        releaseTaskClaim(task.id);
        log.debug({ stage: stage.label }, "Semaphore full after claim");
        break;
      }

      projectSpawnCount.set(task.projectId, projectCount + 1);

      log.debug(
        { stage: stage.label, taskId: task.id, candidateStatus: task.status, parallel },
        "Task claimed for processing",
      );

      const taskPromise = processOneTask(task, stage)
        .then((success) => {
          if (!success) failedInCycle.add(task.id);
        })
        .catch((err) => {
          failedInCycle.add(task.id);
          log.error(
            { taskId: task.id, stage: stage.label, err },
            "Unexpected error in task processing",
          );
        })
        .finally(() => {
          stageSemaphore.release(stage.label);
          releaseTaskClaim(task.id);
        });

      spawned.push(taskPromise);
    }

    // Within-stage parallelism: await all tasks in this stage before moving to next
    if (spawned.length > 0) {
      await Promise.allSettled(spawned);
    }
  }

  log.debug("Poll cycle complete");
}
