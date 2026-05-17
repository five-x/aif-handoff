import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  assertSafeRoadmapArtifactPath,
  clearTaskRuntimeLimitSnapshot,
  blockTaskForRuntimeGateIfEligible,
  evaluateRuntimeBudgetGate,
  evaluateRuntimeLimitGate,
  findCoordinatorTaskCandidates,
  findProjectById,
  findTaskById,
  getAppDefaultRuntimeProfileId,
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
  persistTaskPlanForTask,
  persistTaskRuntimeLimitSnapshot,
  resolveEffectiveRuntimeProfile,
  resolveEffectiveRuntimeProfileExcluding,
  findRoadmapBatchArtifactByTaskId,
  listRoadmapBatchArtifactAttempts,
  listRoadmapReportArtifactsForSynthesis,
  listAuditEvidenceEvents,
  summarizeRoadmapBatch,
  updateRoadmapBatchArtifactState,
  setTaskFields,
  type CoordinatorStage,
  type HydratedTaskRow,
  type TaskFieldsPatch,
  type TaskRow,
} from "@aif/data";
import { initProject, type RuntimeRegistry } from "@aif/runtime";
import {
  logger,
  getEnv,
  CLEAN_STATE_RESET,
  buildAuditCardDecisionFromReport,
  evaluateTaskCompletionEvidence,
  extractAuditReportManifestEvidenceRefs,
  formatTaskCompletionBlockedReason,
  buildAuditFailureSignature,
  isRecoverableAuditFailureFamily,
  selectAuditArtifactFailureFamily,
  selectTaskCompletionAuditFailureFamily,
  resolveAuditPlanId,
  TaskPlanQualityError,
  buildDeterministicDiagnosticPlan,
  withTimeout,
  type AuditCardDecision,
  type AuditFailureFamily,
  type AutoReviewFinding,
  type TaskStatus,
  type RuntimeStage,
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
import { handleAutoReviewGate, type ReviewGateOutcome } from "./autoReviewHandler.js";
import { classifyStageError } from "./stageErrorHandler.js";
import { setActiveStageAbortController } from "./stageAbort.js";
import { setCoordinatorId, setRuntimeStageFallbackProfile } from "./subagentQuery.js";
import { readGitWorktreeReworkSnapshot } from "./reworkSnapshot.js";
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

type TaskWithHydratedFields = TaskRow & Pick<HydratedTaskRow, "autoReviewState">;

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

function runtimeStageForCoordinatorStage(stage: CoordinatorStage): RuntimeStage {
  if (stage === "plan-checker") return "plan_checker";
  return stage;
}

function fallbackStagesForCoordinatorStage(stage: CoordinatorStage): RuntimeStage[] {
  if (stage === "reviewer") return ["reviewer", "security"];
  return [runtimeStageForCoordinatorStage(stage)];
}

function shouldBlockOnRuntimeLimit(stage: RuntimeStage): boolean {
  return stage === "implementer" || stage === "audit" || stage === "synthesis";
}

function appendRuntimeBudgetActivity(task: TaskRow, stage: RuntimeStage): boolean {
  const decision = evaluateRuntimeBudgetGate({ taskId: task.id, projectId: task.projectId, stage });
  if (decision.status === "allow") return false;

  const now = new Date().toISOString();
  if (decision.status === "warn") {
    const marker = `[runtime-budget:${decision.signature}]`;
    if (!task.agentActivityLog?.includes(marker)) {
      appendTaskActivityLog(
        task.id,
        `[${now}] ${marker} Runtime budget warning before ${stage}: spent=$${decision.spentUsd.toFixed(4)} budget=$${decision.budgetUsd?.toFixed(4)} percent=${decision.percentUsed?.toFixed(1)}%`,
      );
    }
    return false;
  }

  if (decision.status === "override") {
    appendTaskActivityLog(
      task.id,
      `[${now}] Runtime budget override before ${stage}: spent=$${decision.spentUsd.toFixed(4)} budget=$${decision.budgetUsd?.toFixed(4)} justification=${decision.overrideJustification}`,
    );
    return false;
  }

  const blockedReason = `Runtime budget exhausted before ${stage}: spent=$${decision.spentUsd.toFixed(4)} budget=$${decision.budgetUsd?.toFixed(4)}. Add task.runtimeOptions.runtimeBudgetOverride.justification to override.`;
  const applied = blockTaskForRuntimeGateIfEligible({
    taskId: task.id,
    expectedProjectId: task.projectId,
    expectedStatus: task.status,
    expectedAutoMode: task.status === "plan_ready" ? task.autoMode === true : undefined,
    blockedFromStatus: task.status,
    blockedReason,
    retryAfter: null,
    retryCount: task.retryCount ?? 0,
    snapshot: null,
    persistedAt: now,
  });
  if (applied) {
    appendTaskActivityLog(
      task.id,
      `[${now}] Runtime budget blocked task before ${stage}: spent=$${decision.spentUsd.toFixed(4)} budget=$${decision.budgetUsd?.toFixed(4)}`,
    );
    void notifyTaskBroadcast(task.id, "task:moved", {
      title: task.title,
      fromStatus: task.status,
      toStatus: "blocked_external",
    });
  }
  return applied;
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

function auditValidationDetails(
  result: ReturnType<typeof evaluateTaskCompletionEvidence>,
  auditCardDecision?: AuditCardDecision | null,
) {
  return {
    issues: result.issues,
    evidence: result.evidence,
    ...(auditCardDecision ? { auditCardDecision } : {}),
  };
}

function acceptedAuditCardDecision(input: {
  task: TaskRow;
  artifact: NonNullable<ReturnType<typeof findRoadmapBatchArtifactByTaskId>>;
  result: ReturnType<typeof evaluateTaskCompletionEvidence>;
  projectRoot: string;
}): AuditCardDecision {
  const validation = input.result.evidence.auditReportValidation;
  const reportText = readAuditArtifactText(input.projectRoot, input.artifact) ?? "";
  const implementationEvidence =
    input.result.evidence.reportArtifactFiles.length > 0
      ? input.result.evidence.reportArtifactFiles
      : input.result.evidence.meaningfulChangedFiles;
  const verificationEvidence = [
    "completion evidence guard accepted audit artifact",
    validation.manifestStatus === "valid" ? "audit report manifest valid" : null,
    input.result.evidence.substantiveReportEvidence ? "substantive report evidence accepted" : null,
    validation.sourceClassification
      ? `source classification: ${validation.sourceClassification}`
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  return buildAuditCardDecisionFromReport({
    otzRequirement:
      input.artifact.role === "synthesis"
        ? "Produce an accepted audit synthesis for the scoped OTZ card."
        : "Produce an accepted audit source report for the scoped OTZ card.",
    acceptanceCriteria: [
      "Report artifact exists and is trusted valid.",
      "Accepted findings meet the evidence contract or no-findings evidence is substantive.",
    ],
    otzAcceptanceSatisfied: true,
    implementationEvidence,
    verificationEvidence,
    verificationStrength: "verified",
    reportText,
  });
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
  const { blockedReason: extraBlockedReason, ...extraFields } = input.extra ?? {};
  const statusBlockedReason = [`${input.family}: ${input.blockedReason}`, extraBlockedReason]
    .filter(Boolean)
    .join("; ");
  updateRoadmapBatchArtifactState({
    taskId: input.task.id,
    state: artifactStateForFailureFamily(input.family),
    failureFamily: input.family,
    reworkStatus: "rework_requested",
    createAttemptBoundary: true,
    validationDetails: auditValidationDetails(input.result),
    contentSha: input.result.evidence.auditReportValidation.artifactSha256,
    branchName: input.task.branchName ?? input.artifact.branchName,
    worktreePath: input.task.worktreePath ?? input.artifact.worktreePath,
    projectRoot: input.projectRoot,
  });
  clearTaskRuntimeLimitSnapshot(input.task.id);
  updateTaskStatus(
    input.task.id,
    "implementing",
    {
      blockedFromStatus: input.fromStatus,
      retryAfter: null,
      retryCount: input.task.retryCount ?? 0,
      ...extraFields,
      blockedReason: statusBlockedReason,
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

function synthesisNotReadyValidationDetails(err: Error): unknown {
  const detailed = err as Error & { validationDetails?: unknown };
  return detailed.validationDetails ?? { reason: err.message };
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
  return readAuditArtifact(projectRoot, artifact).text;
}

function normalizeArtifactGitPath(path: string): string | null {
  try {
    return assertSafeRoadmapArtifactPath(path);
  } catch {
    return null;
  }
}

function isSafeRelativeArtifactPath(artifactPath: string): boolean {
  return normalizeArtifactGitPath(artifactPath) !== null;
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function resolveSafeArtifactPath(rootPath: string, gitPath: string): string | null {
  const root = resolve(rootPath);
  const absolutePath = resolve(root, gitPath);
  return isPathInsideRoot(root, absolutePath) ? absolutePath : null;
}

function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function readAuditArtifact(
  projectRoot: string,
  artifact: ReturnType<typeof findRoadmapBatchArtifactByTaskId>,
  overrides?: {
    branchName?: string | null;
    worktreePath?: string | null;
    projectRoot?: string | null;
  },
): {
  text: string | null;
  contentSha: string | null;
  source: "none" | "project_root" | "worktree" | "branch";
  branchName: string | null;
  worktreePath: string | null;
  projectRoot: string;
  missingReason: string | null;
} {
  if (!artifact) {
    return {
      text: null,
      contentSha: null,
      source: "none",
      branchName: null,
      worktreePath: null,
      projectRoot,
      missingReason: "No roadmap report artifact is declared for this task.",
    };
  }

  const artifactRoot = overrides?.projectRoot ?? artifact.projectRoot ?? projectRoot;
  const branchName = overrides?.branchName ?? artifact.branchName ?? null;
  const worktreePath = overrides?.worktreePath ?? artifact.worktreePath ?? null;
  const gitPath = normalizeArtifactGitPath(artifact.artifactPath);

  if (!gitPath || !isSafeRelativeArtifactPath(artifact.artifactPath)) {
    return {
      text: null,
      contentSha: null,
      source: "none",
      branchName,
      worktreePath,
      projectRoot: artifactRoot,
      missingReason: `Declared audit report artifact path is invalid: ${artifact.artifactPath}`,
    };
  }

  if (worktreePath) {
    try {
      const absolutePath = resolveSafeArtifactPath(worktreePath, gitPath);
      if (!absolutePath || !existsSync(absolutePath)) {
        return {
          text: null,
          contentSha: null,
          source: "worktree",
          branchName,
          worktreePath,
          projectRoot: artifactRoot,
          missingReason: `Declared audit report artifact is missing from worktree ${worktreePath}: ${artifact.artifactPath}`,
        };
      }
      const buffer = readFileSync(absolutePath);
      return {
        text: buffer.toString("utf8"),
        contentSha: sha256Buffer(buffer),
        source: "worktree",
        branchName,
        worktreePath,
        projectRoot: artifactRoot,
        missingReason: null,
      };
    } catch {
      return {
        text: null,
        contentSha: null,
        source: "worktree",
        branchName,
        worktreePath,
        projectRoot: artifactRoot,
        missingReason: `Declared audit report artifact could not be read from worktree ${worktreePath}: ${artifact.artifactPath}`,
      };
    }
  }

  if (branchName) {
    try {
      const buffer = execFileSync(
        "git",
        ["-c", `safe.directory=${artifactRoot}`, "show", `${branchName}:${gitPath}`],
        { cwd: artifactRoot, stdio: ["ignore", "pipe", "pipe"] },
      );
      return {
        text: buffer.toString("utf8"),
        contentSha: sha256Buffer(buffer),
        source: "branch",
        branchName,
        worktreePath,
        projectRoot: artifactRoot,
        missingReason: null,
      };
    } catch {
      return {
        text: null,
        contentSha: null,
        source: "branch",
        branchName,
        worktreePath,
        projectRoot: artifactRoot,
        missingReason: `Declared audit report artifact is missing from branch ${branchName}: ${artifact.artifactPath}`,
      };
    }
  }

  try {
    const reportPath = resolveSafeArtifactPath(artifactRoot, gitPath);
    if (!reportPath || !existsSync(reportPath)) {
      return {
        text: null,
        contentSha: null,
        source: "project_root",
        branchName,
        worktreePath,
        projectRoot: artifactRoot,
        missingReason: `Declared audit report artifact is missing from project root ${artifactRoot}: ${artifact.artifactPath}`,
      };
    }
    const buffer = readFileSync(reportPath);
    return {
      text: buffer.toString("utf8"),
      contentSha: sha256Buffer(buffer),
      source: "project_root",
      branchName,
      worktreePath,
      projectRoot: artifactRoot,
      missingReason: null,
    };
  } catch {
    return {
      text: null,
      contentSha: null,
      source: "project_root",
      branchName,
      worktreePath,
      projectRoot: artifactRoot,
      missingReason: `Declared audit report artifact could not be read from project root ${artifactRoot}: ${artifact.artifactPath}`,
    };
  }
}

function readRelativeFileSha(
  projectRoot: string,
  relativePath: string,
): {
  contentSha: string | null;
  safe: boolean;
} {
  try {
    const gitPath = normalizeArtifactGitPath(relativePath);
    if (!gitPath) return { contentSha: null, safe: false };
    const absolutePath = resolveSafeArtifactPath(projectRoot, gitPath);
    if (!absolutePath) return { contentSha: null, safe: false };
    return {
      contentSha: existsSync(absolutePath)
        ? createHash("sha256").update(readFileSync(absolutePath)).digest("hex")
        : null,
      safe: true,
    };
  } catch {
    return { contentSha: null, safe: false };
  }
}

function formatAutoReviewFindingsForBlockedReason(
  findings: AutoReviewFinding[] | undefined,
): string {
  if (!findings || findings.length === 0) return "none";
  return findings.map((finding) => `[${finding.id}] ${finding.source}: ${finding.text}`).join("; ");
}

function buildManualAutoReviewBlockedReason(
  outcome: Extract<ReviewGateOutcome, { status: "manual_review_required" }>,
): string {
  return (
    `manual_review_required: ${outcome.handoffReason}; ` +
    `closure evidence gap for unresolved blockers: ${formatAutoReviewFindingsForBlockedReason(
      outcome.autoReviewState.findings,
    )}`
  );
}

function terminalizeRoadmapSourceReportAsInconclusive(input: {
  task: TaskWithHydratedFields;
  projectRoot: string;
  fromStatus: TaskStatus;
  title: string;
  reason: "stalled_rework_loop" | "no_substantive_rework_delta" | "plan_quality_exhausted";
  blockedReason: string;
  reviewIterationCount: number;
  autoReviewState?: TaskWithHydratedFields["autoReviewState"];
  contentSha?: string | null;
  validationDetails?: Record<string, unknown>;
}): boolean {
  const artifact = findRoadmapBatchArtifactByTaskId(input.task.id);
  if (!artifact || artifact.role !== "report") return false;

  const taskBlockedReason = input.blockedReason.startsWith("manual_review_required:")
    ? input.blockedReason
    : `manual_review_required: ${input.reason}; ${input.blockedReason}`;
  const artifactRead = readAuditArtifact(input.projectRoot, artifact, {
    branchName: input.task.branchName,
    worktreePath: input.task.worktreePath,
    projectRoot: input.projectRoot,
  });
  const artifactSha = input.contentSha ?? artifactRead.contentSha;
  const extraDetails = input.validationDetails ?? {};
  const extraIssues = Array.isArray(extraDetails.issues) ? extraDetails.issues : [];
  const missingReportIssue = artifactRead.missingReason
    ? [
        {
          code: "missing_report_artifact",
          message: artifactRead.missingReason,
          artifactPath: artifact.artifactPath,
          branchName: artifactRead.branchName,
          worktreePath: artifactRead.worktreePath,
          projectRoot: artifactRead.projectRoot,
        },
      ]
    : [];
  updateRoadmapBatchArtifactState({
    taskId: input.task.id,
    state: "source_inconclusive",
    failureFamily: "source_inconclusive",
    classification: "source_inconclusive",
    reworkStatus: "terminal_inconclusive",
    validationDetails: {
      ...extraDetails,
      sourceClassification: "source_inconclusive",
      terminalizationReason: input.reason,
      blockedReason: taskBlockedReason,
      artifactPath: artifact.artifactPath,
      contentSha: artifactSha,
      artifactVisibility: {
        artifactPath: artifact.artifactPath,
        source: artifactRead.source,
        readable: artifactRead.text !== null,
        branchName: artifactRead.branchName,
        worktreePath: artifactRead.worktreePath,
        projectRoot: artifactRead.projectRoot,
        contentSha: artifactSha,
      },
      ...(missingReportIssue.length > 0
        ? {
            issues: [...extraIssues, ...missingReportIssue],
            missingReportArtifact: {
              artifactPath: artifact.artifactPath,
              reason: artifactRead.missingReason,
              branchName: artifactRead.branchName,
              worktreePath: artifactRead.worktreePath,
              projectRoot: artifactRead.projectRoot,
              contentSha: artifactSha,
            },
          }
        : {}),
      autoReviewState: input.autoReviewState ?? null,
    },
    contentSha: artifactSha,
    branchName: input.task.branchName,
    worktreePath: input.task.worktreePath,
    projectRoot: input.projectRoot,
  });

  clearTaskRuntimeLimitSnapshot(input.task.id);
  updateTaskStatus(
    input.task.id,
    "blocked_external",
    {
      ...CLEAN_STATE_RESET,
      blockedReason: taskBlockedReason,
      blockedFromStatus: input.fromStatus,
      retryCount: input.task.retryCount ?? 0,
      reworkRequested: false,
      reviewIterationCount: input.reviewIterationCount,
      manualReviewRequired: true,
      autoReviewState: input.autoReviewState ?? null,
    },
    { title: input.title, fromStatus: input.fromStatus },
  );
  appendTaskActivityLog(
    input.task.id,
    `[${new Date().toISOString()}] Roadmap audit source report blocked as source_inconclusive after ${input.reason}: ${taskBlockedReason}`,
  );
  return true;
}

function blockTaskForStalledAutoReview(input: {
  task: TaskWithHydratedFields;
  outcome: Extract<ReviewGateOutcome, { status: "manual_review_required" }>;
  projectRoot: string;
  fromStatus: TaskStatus;
  title: string;
}): boolean {
  if (input.outcome.handoffReason !== "stalled_rework_loop") return false;
  const threshold = env.AGENT_AUTO_REVIEW_STALL_THRESHOLD;
  const blockedReason =
    `manual_review_required: stalled_rework_loop after ${input.outcome.currentIteration}/${threshold} same-blocker reviews; ` +
    `unresolved blockers: ${formatAutoReviewFindingsForBlockedReason(input.outcome.autoReviewState.findings)}`;
  if (
    terminalizeRoadmapSourceReportAsInconclusive({
      task: input.task,
      projectRoot: input.projectRoot,
      fromStatus: input.fromStatus,
      title: input.title,
      reason: "stalled_rework_loop",
      blockedReason,
      reviewIterationCount: input.outcome.currentIteration,
      autoReviewState: input.outcome.autoReviewState,
      validationDetails: {
        metrics: input.outcome.metrics,
        handoffReason: input.outcome.handoffReason,
        stallThreshold: threshold,
      },
    })
  ) {
    return true;
  }
  clearTaskRuntimeLimitSnapshot(input.task.id);
  updateTaskStatus(
    input.task.id,
    "blocked_external",
    {
      blockedReason,
      blockedFromStatus: input.fromStatus,
      retryAfter: null,
      retryCount: input.task.retryCount ?? 0,
      reworkRequested: false,
      reviewIterationCount: input.outcome.currentIteration,
      manualReviewRequired: true,
      autoReviewState: input.outcome.autoReviewState,
    },
    { title: input.title, fromStatus: input.fromStatus },
  );
  appendTaskActivityLog(
    input.task.id,
    `[${new Date().toISOString()}] Auto review terminalized stalled rework loop: ${blockedReason}`,
  );
  return true;
}

function blockTaskForNoSubstantiveReworkDeltaIfNeeded(input: {
  task: TaskWithHydratedFields;
  projectRoot: string;
  fromStatus: TaskStatus;
  title: string;
}): boolean {
  const snapshot = input.task.autoReviewState?.reworkSnapshot;
  if (!snapshot) return false;

  const genericDigest =
    typeof (snapshot as { changedFilesDigest?: unknown }).changedFilesDigest === "string"
      ? (snapshot as { changedFilesDigest: string }).changedFilesDigest
      : null;
  if (genericDigest) {
    const currentSnapshot = readGitWorktreeReworkSnapshot(input.projectRoot);
    if (!currentSnapshot || currentSnapshot.changedFilesDigest !== genericDigest) return false;

    const digestDisplay = genericDigest.slice(0, 16);
    const findingIds =
      snapshot.findingIds && snapshot.findingIds.length > 0
        ? snapshot.findingIds.join(", ")
        : "none";
    const blockedReason =
      `manual_review_required: no_substantive_rework_delta for task worktree; ` +
      `changed files digest unchanged (${digestDisplay}); ` +
      `rework iteration ${snapshot.iteration}; blocker ids: ${findingIds}; ` +
      `unresolved blockers: ${formatAutoReviewFindingsForBlockedReason(input.task.autoReviewState?.findings)}`;

    clearTaskRuntimeLimitSnapshot(input.task.id);
    updateTaskStatus(
      input.task.id,
      "blocked_external",
      {
        blockedReason,
        blockedFromStatus: input.fromStatus,
        retryAfter: null,
        retryCount: input.task.retryCount ?? 0,
        reworkRequested: false,
        reviewIterationCount: input.task.reviewIterationCount ?? 0,
        manualReviewRequired: true,
        autoReviewState: input.task.autoReviewState,
      },
      { title: input.title, fromStatus: input.fromStatus },
    );
    appendTaskActivityLog(
      input.task.id,
      `[${new Date().toISOString()}] Blocked unchanged rework before review: ${blockedReason}`,
    );
    return true;
  }

  if (!snapshot.artifactPath) return false;

  const baselineSha = snapshot.artifactContentSha ?? null;
  const currentArtifact = readRelativeFileSha(input.projectRoot, snapshot.artifactPath);
  if (!currentArtifact.safe) return false;
  const currentSha = currentArtifact.contentSha;
  if (baselineSha !== currentSha) return false;

  const shaDisplay = currentSha ?? "missing";
  const findingIds =
    snapshot.findingIds && snapshot.findingIds.length > 0 ? snapshot.findingIds.join(", ") : "none";
  const blockedReason =
    `manual_review_required: no_substantive_rework_delta for ${snapshot.artifactPath}; ` +
    `artifact content sha unchanged (${shaDisplay}); ` +
    `rework iteration ${snapshot.iteration}; blocker ids: ${findingIds}; ` +
    `unresolved blockers: ${formatAutoReviewFindingsForBlockedReason(input.task.autoReviewState?.findings)}`;

  if (
    terminalizeRoadmapSourceReportAsInconclusive({
      task: input.task,
      projectRoot: input.projectRoot,
      fromStatus: input.fromStatus,
      title: input.title,
      reason: "no_substantive_rework_delta",
      blockedReason,
      reviewIterationCount: input.task.reviewIterationCount ?? 0,
      autoReviewState: input.task.autoReviewState,
      contentSha: currentSha,
      validationDetails: {
        reworkSnapshot: snapshot,
      },
    })
  ) {
    return true;
  }

  clearTaskRuntimeLimitSnapshot(input.task.id);
  updateTaskStatus(
    input.task.id,
    "blocked_external",
    {
      blockedReason,
      blockedFromStatus: input.fromStatus,
      retryAfter: null,
      retryCount: input.task.retryCount ?? 0,
      reworkRequested: false,
      reviewIterationCount: input.task.reviewIterationCount ?? 0,
      manualReviewRequired: true,
      autoReviewState: input.task.autoReviewState,
    },
    { title: input.title, fromStatus: input.fromStatus },
  );
  appendTaskActivityLog(
    input.task.id,
    `[${new Date().toISOString()}] Blocked unchanged audit rework before review: ${blockedReason}`,
  );
  return true;
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
  phase?: "pre_implementation" | "review_handoff" | "completion";
  preventAuditRework?: boolean;
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
      const auditCardDecision = acceptedAuditCardDecision({
        task: input.task,
        artifact,
        result,
        projectRoot: input.projectRoot,
      });
      updateRoadmapBatchArtifactState({
        taskId: input.task.id,
        state: "valid",
        failureFamily: null,
        reworkStatus: "accepted",
        attemptBoundaryId: artifact.attemptBoundaryId,
        validationDetails: {
          evidence: result.evidence,
          auditCardDecision,
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
    isRecoverableAuditFailureFamily(family);
  const repeatedSameFailure =
    recoverableAuditArtifactFailure && artifact
      ? repeatedAuditFailureCount({ artifact, family, result }) > 0
      : false;
  const shouldReturnToRework =
    !input.preventAuditRework &&
    recoverableAuditArtifactFailure &&
    auditReviewIteration < auditMaxReviewIterations;
  const auditReworkLimitReached =
    recoverableAuditArtifactFailure && auditReviewIteration >= auditMaxReviewIterations;
  const baseBlockedReason = formatTaskCompletionBlockedReason(result, {
    suppressManualReviewWhenActionable: shouldReturnToRework,
  });
  const repairIssueCodes = auditEvidenceRepairIssueCodes(result);
  const auditEvidenceRepairRequired =
    shouldReturnToRework && auditReviewIteration >= 2 && repairIssueCodes.length > 0;
  const actionableBlockedReason = auditEvidenceRepairRequired
    ? `audit_evidence_repair_required (${repairIssueCodes.join(", ")}): ${baseBlockedReason}`
    : baseBlockedReason;
  const blockedReason = auditReworkLimitReached
    ? `${baseBlockedReason} Manual review required: audit evidence guard failed after ${auditReviewIteration}/${auditMaxReviewIterations} review iterations.`
    : repeatedSameFailure
      ? `${actionableBlockedReason} Rework requested again for repeated audit artifact failure signature; local rework continues until the no-progress guard or review budget proves it is unproductive.`
      : actionableBlockedReason;
  const terminalBlockedReason = artifact ? `${family}: ${blockedReason}` : blockedReason;
  const { blockedReason: extraBlockedReason, ...extraFields } = input.extra ?? {};
  const finalBlockedReason = [terminalBlockedReason, extraBlockedReason].filter(Boolean).join("; ");
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
      blockedReason: finalBlockedReason,
      blockedFromStatus: input.fromStatus,
      retryAfter: null,
      retryCount: input.task.retryCount ?? 0,
      ...extraFields,
      manualReviewRequired:
        input.requireManualReview ||
        auditReworkLimitReached ||
        result.issues.some((entry) => entry.code === "manual_review_required"),
    },
    { title: input.title, fromStatus: input.fromStatus },
  );
  appendTaskActivityLog(
    input.task.id,
    `[${nowIso}] Completion evidence guard blocked terminal transition: ${finalBlockedReason}`,
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

function taskRequiresDevelopmentReviewHandoff(task: TaskRow): boolean {
  return (
    task.isFix === true ||
    task.taskIntent === "feature" ||
    task.taskIntent === "fix" ||
    task.taskIntent === "docs" ||
    task.taskIntent === "tests"
  );
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

function recoverSynthesisPlanQualityFailure(input: {
  task: TaskRow;
  projectRoot: string;
  stageInProgress: TaskStatus;
  taskTitle: string;
  error: TaskPlanQualityError;
  retryCount: number;
}): boolean {
  const artifact = findRoadmapBatchArtifactByTaskId(input.task.id);
  if (!artifact || artifact.role !== "synthesis") return false;
  const summary = summarizeRoadmapBatch(artifact.batchId);
  if (!summary?.synthesisReady) return false;
  const sourceReportArtifacts = listRoadmapReportArtifactsForSynthesis(artifact.batchId).map(
    (entry) => ({
      taskId: entry.taskId,
      artifactPath: entry.artifactPath,
      state: entry.state,
      failureFamily: entry.failureFamily,
      trusted: entry.state === "valid",
    }),
  );
  if (sourceReportArtifacts.length === 0) return false;

  const planTask = {
    ...input.task,
    description: [input.task.description, `Report artifact: ${artifact.artifactPath}`]
      .filter(Boolean)
      .join("\n"),
    auditArtifactRole: "synthesis" as const,
    roadmapBatchId: artifact.batchId,
    sourceReportArtifacts,
  };
  const fallbackPlan = buildDeterministicDiagnosticPlan({
    task: planTask,
    extraText: [input.task.plan, artifact.artifactPath],
  });
  if (!fallbackPlan) return false;

  const nowIso = new Date().toISOString();
  persistTaskPlanForTask({
    taskId: input.task.id,
    planText: fallbackPlan,
    projectRoot: input.projectRoot,
    isFix: input.task.isFix,
    planPath: input.task.planPath ?? undefined,
    updatedAt: nowIso,
  });
  clearTaskRuntimeLimitSnapshot(input.task.id);
  updateTaskStatus(
    input.task.id,
    "implementing",
    {
      blockedReason: null,
      blockedFromStatus: null,
      retryAfter: null,
      retryCount: 0,
      reworkRequested: false,
      manualReviewRequired: false,
    },
    { title: input.taskTitle, fromStatus: input.stageInProgress },
  );
  appendTaskActivityLog(
    input.task.id,
    `[${nowIso}] Plan quality guard exhausted for synthesis; persisted deterministic registry-derived synthesis plan and routed to implementation. Previous categories: ${input.error.result.categories.join(", ")}. Previous retry count: ${input.retryCount}.`,
  );
  log.warn(
    {
      taskId: input.task.id,
      batchId: artifact.batchId,
      sourceReportCount: sourceReportArtifacts.length,
      categories: input.error.result.categories,
    },
    "Plan quality guard recovered synthesis task with deterministic registry-derived plan",
  );
  return true;
}

function formatPlanQualityStructuredFeedback(input: {
  attempt: number;
  maxRetries: number;
  terminal: boolean;
  error: TaskPlanQualityError;
}): string {
  return JSON.stringify({
    kind: "plan_quality_feedback",
    attempt: input.attempt,
    maxRetries: input.maxRetries,
    terminal: input.terminal,
    categories: input.error.result.categories,
    issues: input.error.result.issues.map((entry) => ({
      code: entry.code,
      message: entry.message,
    })),
    planManifest: input.error.result.planManifest ?? null,
  });
}

function handlePlanQualityFailure(input: {
  task: TaskRow;
  projectRoot: string;
  stageInProgress: TaskStatus;
  taskTitle: string;
  error: TaskPlanQualityError;
}): void {
  const latestTask = findTaskById(input.task.id) ?? input.task;
  const nextRetryCount = (latestTask.retryCount ?? 0) + 1;
  const categories = input.error.result.categories.join(", ");
  const nowIso = new Date().toISOString();

  if (nextRetryCount <= PLAN_QUALITY_MAX_RETRIES) {
    const strictness =
      nextRetryCount === 1
        ? "Replan with concrete task-specific steps, required artifact paths, and diagnostic-only constraints where applicable."
        : "Second plan-quality failure: produce a stricter plan with a valid manifest when required, explicit scope boundaries, testable acceptance criteria, concrete verification commands, and no intent drift.";
    const feedback = `${input.error.message} ${strictness}`;
    const structuredFeedback = formatPlanQualityStructuredFeedback({
      attempt: nextRetryCount,
      maxRetries: PLAN_QUALITY_MAX_RETRIES,
      terminal: false,
      error: input.error,
    });
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
    appendTaskActivityLog(
      input.task.id,
      `[${nowIso}] Plan quality structured feedback: ${structuredFeedback}`,
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
  if (
    recoverSynthesisPlanQualityFailure({
      ...input,
      task: latestTask,
      retryCount: nextRetryCount,
    })
  ) {
    return;
  }

  const terminalStructuredFeedback = formatPlanQualityStructuredFeedback({
    attempt: nextRetryCount,
    maxRetries: PLAN_QUALITY_MAX_RETRIES,
    terminal: true,
    error: input.error,
  });
  appendTaskActivityLog(
    input.task.id,
    `[${nowIso}] Plan quality structured feedback: ${terminalStructuredFeedback}`,
  );

  if (
    terminalizeRoadmapSourceReportAsInconclusive({
      task: latestTask,
      projectRoot: input.projectRoot,
      fromStatus: input.stageInProgress,
      title: input.taskTitle,
      reason: "plan_quality_exhausted",
      blockedReason,
      reviewIterationCount: latestTask.reviewIterationCount ?? 0,
      autoReviewState: null,
      validationDetails: {
        planQualityCategories: input.error.result.categories,
        retryCount: nextRetryCount,
        maxRetries: PLAN_QUALITY_MAX_RETRIES,
      },
    })
  ) {
    log.error(
      {
        taskId: input.task.id,
        retryCount: nextRetryCount,
        maxRetries: PLAN_QUALITY_MAX_RETRIES,
        categories: input.error.result.categories,
      },
      "Plan quality guard terminalized roadmap source report after retry limit",
    );
    return;
  }

  clearTaskRuntimeLimitSnapshot(input.task.id);
  updateTaskStatus(
    input.task.id,
    "blocked_external",
    {
      blockedReason,
      blockedFromStatus: input.stageInProgress,
      retryAfter: null,
      retryCount: nextRetryCount,
      manualReviewRequired: true,
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
    let latestTask: TaskWithHydratedFields = findTaskById(task.id) ?? task;

    if (stage.label === "implementer" && latestTask.status === "blocked_external") {
      log.info(
        {
          taskId: task.id,
          from: stage.inProgress,
          to: latestTask.status,
          blockedReason: latestTask.blockedReason,
        },
        "Implementer terminalized task before review handoff",
      );
      return false;
    }

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
        const manualBlockedReason = buildManualAutoReviewBlockedReason(outcome);
        if (
          blockTaskForStalledAutoReview({
            task: latestTask,
            outcome,
            projectRoot: executionRoot,
            fromStatus: stage.inProgress,
            title: taskTitle,
          })
        ) {
          return false;
        }
        if (
          blockTaskForCompletionEvidenceIfNeeded({
            task: latestTask,
            projectRoot: executionRoot,
            fromStatus: stage.inProgress,
            title: taskTitle,
            requireManualReview: true,
            preventAuditRework: outcome.handoffReason !== "malformed_review_output_fallback",
            extra: {
              blockedReason: manualBlockedReason,
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
          "blocked_external",
          {
            blockedReason: manualBlockedReason,
            blockedFromStatus: stage.inProgress,
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
            to: "blocked_external",
            reviewIteration: outcome.currentIteration,
            handoffReason: outcome.handoffReason,
          },
          "Auto review gate blocked unresolved manual review handoff",
        );
        return false;
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

    if (
      stage.label === "implementer" &&
      task.reworkRequested &&
      blockTaskForNoSubstantiveReworkDeltaIfNeeded({
        task: latestTask,
        projectRoot: executionRoot,
        fromStatus: stage.inProgress,
        title: taskTitle,
      })
    ) {
      return false;
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
    if (
      stage.label === "implementer" &&
      stage.onSuccess === "review" &&
      taskRequiresDevelopmentReviewHandoff(latestTask)
    ) {
      latestTask = findTaskById(task.id) ?? latestTask;
      if (
        blockTaskForCompletionEvidenceIfNeeded({
          task: latestTask,
          projectRoot: executionRoot,
          fromStatus: stage.inProgress,
          title: taskTitle,
          phase: "review_handoff",
        })
      ) {
        return false;
      }
    }

    const successReset: Omit<TaskFieldsPatch, "status" | "lastHeartbeatAt" | "updatedAt"> = {
      ...CLEAN_STATE_RESET,
      reviewIterationCount: stage.label === "implementer" ? (task.reviewIterationCount ?? 0) : 0,
    };
    if (stage.label === "implementer" && task.reworkRequested) {
      successReset.autoReviewState = latestTask.autoReviewState ?? null;
    }
    if (stage.label === "planner" && isPlanQualityRetryState(latestTask)) {
      successReset.retryCount = latestTask.retryCount ?? 0;
      successReset.blockedFromStatus = latestTask.blockedFromStatus;
      successReset.blockedReason = latestTask.blockedReason;
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
        projectRoot: executionRoot,
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
        validationDetails: synthesisNotReadyValidationDetails(err),
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

      const runtimeStage = runtimeStageForCoordinatorStage(stage.label);
      for (const fallbackStage of fallbackStagesForCoordinatorStage(stage.label)) {
        setRuntimeStageFallbackProfile({
          taskId: task.id,
          stage: fallbackStage,
          profileId: null,
        });
      }
      if (appendRuntimeBudgetActivity(task, runtimeStage)) {
        continue;
      }

      let runtimeSelection = resolveEffectiveRuntimeProfile({
        taskId: task.id,
        projectId: task.projectId,
        mode: runtimeStage,
        systemDefaultRuntimeProfileId: getAppDefaultRuntimeProfileId(runtimeStage),
      });
      let gateDecision = evaluateRuntimeLimitGate(runtimeSelection.profile);
      if (gateDecision.blocked) {
        if (!shouldBlockOnRuntimeLimit(runtimeStage) && runtimeSelection.profile?.id) {
          const fallbackSelection = resolveEffectiveRuntimeProfileExcluding({
            taskId: task.id,
            projectId: task.projectId,
            mode: runtimeStage,
            systemDefaultRuntimeProfileId: getAppDefaultRuntimeProfileId(runtimeStage),
            excludedRuntimeProfileIds: [runtimeSelection.profile.id],
          });
          const fallbackGateDecision = evaluateRuntimeLimitGate(fallbackSelection.profile);
          if (fallbackSelection.profile && !fallbackGateDecision.blocked) {
            const now = new Date().toISOString();
            for (const fallbackStage of fallbackStagesForCoordinatorStage(stage.label)) {
              setRuntimeStageFallbackProfile({
                taskId: task.id,
                stage: fallbackStage,
                profileId: fallbackSelection.profile.id,
                source: fallbackSelection.source,
              });
            }
            appendTaskActivityLog(
              task.id,
              `[${now}] Runtime gate fallback before ${runtimeStage}: blockedProfile=${runtimeSelection.profile.id} blockedSource=${runtimeSelection.source} selectedProfile=${fallbackSelection.profile.id} selectedSource=${fallbackSelection.source}`,
            );
            runtimeSelection = fallbackSelection;
            gateDecision = fallbackGateDecision;
          }
        }
      }
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

      if (!claimTask(task.id, COORDINATOR_ID, CLAIM_LOCK_DURATION_MS, stage.label)) {
        log.debug({ taskId: task.id, stage: stage.label }, "Task claim failed (already claimed)");
        continue;
      }

      if (
        stageSemaphore.totalActive() >= globalMax ||
        !stageSemaphore.tryAcquire(stage.label, globalMax)
      ) {
        releaseTaskClaim(task.id, COORDINATOR_ID);
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
          releaseTaskClaim(task.id, COORDINATOR_ID);
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
