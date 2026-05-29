import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  applyHumanTaskEvent,
  assertCurrentBranch,
  ensureFeatureBranch,
  buildAcceptedAuditCardDecision,
  evaluateTaskCompletionEvidence,
  extractAuditReportManifestEvidenceRefs,
  formatTaskCompletionBlockedReason,
  buildAuditFailureSignature,
  isRecoverableAuditFailureFamily,
  isBranchIsolationError,
  looksLikeFullPlanUpdate,
  getEnv,
  getProjectConfig,
  selectAuditArtifactFailureFamily,
  selectTaskCompletionAuditFailureFamily,
  resolveAuditPlanId,
  restorePersistedBranch,
  type AuditCardDecision,
  type AuditFailureFamily,
  type TaskEvent,
} from "@aif/shared";
import {
  assertSafeRoadmapArtifactPath,
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  hasFreshAcceptedTaskAcceptancePack,
  hasFreshAcceptedTaskQaArtifact,
  getLatestHumanComment,
  appendTaskActivityLog,
  auditRoadmapTaskDependenciesReleaseReady,
  listProjectConfigWorkBlockers,
  collectTaskRuntimeOverrideBlockers,
  listAuditEvidenceEvents,
  listRoadmapBatchArtifactAttempts,
  listRoadmapReportArtifactsForSynthesis,
  persistTaskPlanForTask,
  setTaskFields,
  updateRoadmapBatchArtifactState,
  type RoadmapBatchArtifactRow,
  type TaskRow,
} from "@aif/data";
import { runFastFixQuery, withTimeout } from "./fastFix.js";

interface EventHandlerInput {
  taskId: string;
  event: TaskEvent;
  deletePlanFile?: boolean;
  manualExceptionJustification?: string;
}

export type EventHandlerResult =
  | { ok: false; status: number; error: string }
  | { ok: true; task: TaskRow; broadcastType: "task:moved" | "task:updated" };

const AUDIT_REPORT_MANIFEST_BLOCK_PATTERN = /```audit-report-manifest\b/i;
const RUNTIME_STARTING_EVENTS = new Set<TaskEvent>([
  "start_ai",
  "accept_existing_plan",
  "start_implementation",
  "request_replanning",
  "fast_fix",
  "retry_from_blocked",
]);

function isOperatorCancelledTask(task: Pick<TaskRow, "status" | "blockedReason">): boolean {
  return (
    task.status === "blocked_external" &&
    task.blockedReason?.startsWith("operator_cancelled:") === true
  );
}

function boundedReviewIterationLimit(value: number | null | undefined): number {
  return Math.min(value ?? getEnv().AGENT_MAX_REVIEW_ITERATIONS, 10);
}

function checkConfigGovernanceBlocker(task: TaskRow, event: TaskEvent): EventHandlerResult | null {
  if (!RUNTIME_STARTING_EVENTS.has(event)) return null;
  const blockers = listProjectConfigWorkBlockers(task.projectId);
  if (!blockers) {
    return null;
  }
  const taskBlockers = collectTaskRuntimeOverrideBlockers(task);
  const allBlockers = [...blockers, ...taskBlockers];
  if (allBlockers.length === 0) return null;
  const reasonCodes = [...new Set(allBlockers.map((issue) => issue.reasonCode))].sort();
  const message = `config_governance_blocked:${reasonCodes.join(",")}`;
  setTaskFields(task.id, {
    status: "blocked_external",
    blockedFromStatus: task.status,
    blockedReason: message,
    retryAfter: null,
    retryCount: task.retryCount,
    lastHeartbeatAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  appendTaskActivityLog(
    task.id,
    `[config-governance] Blocked ${event}; reasonCodes=${reasonCodes.join(",")}`,
  );
  return { ok: false, status: 409, error: message };
}

function restoreTaskBranchForMutation(
  task: TaskRow,
  projectRoot: string,
): EventHandlerResult | null {
  if (!task.branchName || task.isFix) return null;
  try {
    // task.branchName is a source-of-truth contract: every mutation path
    // (fast-fix, regular transition, accept_existing_plan) must land on the
    // persisted branch or fail loud. Use `restorePersistedBranch` instead of
    // `ensureFeatureBranch({switchOnly:true})` so config drift
    // (`git.enabled` / `create_branches` toggled off after planner) cannot
    // release us to current HEAD.
    restorePersistedBranch({
      projectRoot,
      taskId: task.id,
      persistedBranchName: task.branchName,
    });
    return null;
  } catch (err) {
    const error = isBranchIsolationError(err)
      ? `Branch isolation failure (${err.kind}): ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
    return { ok: false, status: 409, error };
  }
}

function assertTaskBranchPostRun(task: TaskRow, projectRoot: string): EventHandlerResult | null {
  if (!task.branchName || task.isFix) return null;
  try {
    assertCurrentBranch(projectRoot, task.branchName);
    return null;
  } catch (err) {
    const error = isBranchIsolationError(err)
      ? `Branch isolation failure (${err.kind}): ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
    return { ok: false, status: 409, error };
  }
}

function isOperatorInputHold(task: TaskRow): boolean {
  return (
    task.status === "blocked_external" &&
    (task.blockedReason?.startsWith("operator_input_required:") === true ||
      task.blockedReason?.startsWith("operator_cancelled:") === true)
  );
}

function hasFreshOperatorInputAnswer(task: TaskRow): boolean {
  const latestComment = getLatestHumanComment(task.id);
  if (!latestComment?.message.trim()) return false;
  const commentTime = Date.parse(latestComment.createdAt);
  const taskUpdateTime = Date.parse(task.updatedAt);
  if (!Number.isFinite(commentTime) || !Number.isFinite(taskUpdateTime)) return false;
  return commentTime > taskUpdateTime;
}

function firstAuditFailureFamily(
  result: ReturnType<typeof evaluateTaskCompletionEvidence>,
): AuditFailureFamily {
  const issueCodes = result.issues.map((entry) => entry.code);
  return (
    selectAuditArtifactFailureFamily({
      issueCodes,
      validationDetails: auditValidationDetails(result),
      fallback: selectTaskCompletionAuditFailureFamily(issueCodes),
    }) ?? "external_blocker"
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
  if (family === "external_blocker" || family === "manual_review_required") {
    return "external_blocked";
  }
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
  auditArtifact: RoadmapBatchArtifactRow;
  result: ReturnType<typeof evaluateTaskCompletionEvidence>;
  projectRoot: string;
}): AuditCardDecision {
  const validation = input.result.evidence.auditReportValidation;
  const auditSynthesisOutcome = input.result.evidence.auditSynthesisOutcome;
  const reportText = readAuditArtifactText(input.projectRoot, input.auditArtifact) ?? "";

  return buildAcceptedAuditCardDecision({
    artifactRole: input.auditArtifact.role === "synthesis" ? "synthesis" : "report",
    reportText,
    reportArtifactFiles: input.result.evidence.reportArtifactFiles,
    meaningfulChangedFiles: input.result.evidence.meaningfulChangedFiles,
    substantiveReportEvidence: input.result.evidence.substantiveReportEvidence,
    manifestStatus: validation.manifestStatus,
    sourceClassification: validation.sourceClassification,
    auditSynthesisOutcome,
  });
}

function repeatedAuditFailureCount(input: {
  artifact: RoadmapBatchArtifactRow;
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

function allowedEvidenceArtifactPathsFor(auditArtifact: RoadmapBatchArtifactRow | undefined) {
  return auditArtifact?.role === "synthesis"
    ? listRoadmapReportArtifactsForSynthesis(auditArtifact.batchId).map(
        (entry) => entry.artifactPath,
      )
    : [];
}

function auditArtifactRoleFor(
  auditArtifact: RoadmapBatchArtifactRow | undefined,
): "report" | "synthesis" | null {
  return auditArtifact?.role === "report" || auditArtifact?.role === "synthesis"
    ? auditArtifact.role
    : null;
}

function auditEvidenceForArtifact(
  task: TaskRow,
  auditArtifact: RoadmapBatchArtifactRow | undefined,
  projectRoot?: string,
) {
  if (!auditArtifact) return [];
  const evidenceRefs = projectRoot
    ? extractAuditReportManifestEvidenceRefs(
        readAuditArtifactText(projectRoot, auditArtifact) ?? "",
      )
    : [];
  return listAuditEvidenceEvents({
    taskId: task.id,
    auditPlanId: resolveAuditPlanId({ taskId: task.id, roadmapBatchId: auditArtifact.batchId }),
    evidenceIds: evidenceRefs.length > 0 ? evidenceRefs : undefined,
    limit: evidenceRefs.length > 0 ? Math.max(1, evidenceRefs.length) : undefined,
  });
}

function readAuditArtifactText(
  projectRoot: string,
  auditArtifact: RoadmapBatchArtifactRow | undefined,
): string | null {
  if (!auditArtifact) return null;
  try {
    const reportPath = resolveSafeArtifactPath(projectRoot, auditArtifact.artifactPath);
    if (!reportPath) return null;
    return existsSync(reportPath) ? readFileSync(reportPath, "utf8") : null;
  } catch {
    return null;
  }
}

function resolveSafeArtifactPath(projectRoot: string, artifactPath: string): string | null {
  try {
    const normalizedArtifactPath = assertSafeRoadmapArtifactPath(artifactPath);
    const root = resolve(projectRoot);
    const candidate = resolve(root, normalizedArtifactPath);
    const relativePath = relative(root, candidate);
    if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

function auditArtifactRequiresLedgerEvidence(input: {
  auditArtifact: RoadmapBatchArtifactRow | undefined;
  projectRoot: string;
  auditEvidenceUnits: unknown[];
}): boolean {
  if (!input.auditArtifact) return false;
  if (input.auditEvidenceUnits.length > 0) return true;
  return AUDIT_REPORT_MANIFEST_BLOCK_PATTERN.test(
    readAuditArtifactText(input.projectRoot, input.auditArtifact) ?? "",
  );
}

function excerptComment(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function markReportArtifactReworkRequested(task: TaskRow, auditArtifact: RoadmapBatchArtifactRow) {
  if (auditArtifact.role !== "report") return;
  const latestComment = getLatestHumanComment(task.id);
  const requestedAt = new Date().toISOString();
  updateRoadmapBatchArtifactState({
    taskId: task.id,
    state: "expected",
    failureFamily: "rework_needed",
    reworkStatus: "rework_requested",
    createAttemptBoundary: true,
    validationDetails: {
      reworkBoundary: {
        action: "request_changes",
        requestedAt,
        previousState: auditArtifact.state,
        latestHumanComment: latestComment
          ? {
              id: latestComment.id,
              createdAt: latestComment.createdAt,
              messageExcerpt: excerptComment(latestComment.message),
            }
          : null,
      },
    },
    branchName: task.branchName ?? auditArtifact.branchName,
    worktreePath: task.worktreePath ?? auditArtifact.worktreePath,
    projectRoot: task.worktreePath ?? auditArtifact.projectRoot,
  });
}

function parseJsonOrRaw(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function handleManualException(input: EventHandlerInput): EventHandlerResult {
  const task = findTaskById(input.taskId);
  if (!task) {
    return { ok: false, status: 404, error: "Task not found" };
  }
  const justification = input.manualExceptionJustification?.trim() ?? "";
  if (!justification) {
    return {
      ok: false,
      status: 400,
      error: "manual_exception requires a non-empty justification",
    };
  }
  const auditArtifact = findRoadmapBatchArtifactByTaskId(task.id);
  if (!auditArtifact) {
    return { ok: false, status: 409, error: "manual_exception requires an audit artifact" };
  }
  if (task.status !== "blocked_external" && !task.manualReviewRequired) {
    return {
      ok: false,
      status: 409,
      error: "manual_exception is only allowed for blocked or manual-review audit artifacts",
    };
  }

  const nowIso = new Date().toISOString();
  updateRoadmapBatchArtifactState({
    taskId: task.id,
    state: "manual_exception",
    failureFamily: "manual_exception",
    reworkStatus: "manual_exception",
    createAttemptBoundary: true,
    validationDetails: {
      action: "manual_exception",
      justification,
      previousState: auditArtifact.state,
      previousFailureFamily: auditArtifact.failureFamily,
      previousValidationDetails: parseJsonOrRaw(auditArtifact.validationDetailsJson),
    },
    branchName: task.branchName ?? auditArtifact.branchName,
    worktreePath: task.worktreePath ?? auditArtifact.worktreePath,
    projectRoot: task.worktreePath ?? auditArtifact.projectRoot,
  });
  setTaskFields(task.id, {
    status: "blocked_external",
    blockedReason: `manual_exception: ${justification}`,
    blockedFromStatus: task.blockedFromStatus ?? task.status,
    retryAfter: null,
    retryCount: task.retryCount ?? 0,
    reworkRequested: false,
    manualReviewRequired: true,
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });
  appendTaskActivityLog(
    task.id,
    `[${nowIso}] Manual audit artifact exception recorded: ${justification}`,
  );
  const updated = findTaskById(task.id);
  if (!updated) {
    return { ok: false, status: 404, error: "Task not found after manual exception" };
  }
  return { ok: true, task: updated, broadcastType: "task:moved" };
}

function blockTaskForCompletionEvidence(
  task: TaskRow,
  result: ReturnType<typeof evaluateTaskCompletionEvidence>,
  options: {
    blockedFromStatus?: TaskRow["status"];
    action?: string;
    auditArtifact?: RoadmapBatchArtifactRow;
    allowAuditRework?: boolean;
    projectRoot?: string;
  } = {},
): EventHandlerResult {
  const nowIso = new Date().toISOString();
  const failureFamily = firstAuditFailureFamily(result);
  const auditArtifact = options.auditArtifact;
  const auditReviewIteration = task.reviewIterationCount ?? 0;
  const env = getEnv();
  const auditMaxReviewIterations = boundedReviewIterationLimit(task.maxReviewIterations);
  const repeatedSameFailure =
    auditArtifact && isRecoverableAuditFailureFamily(failureFamily)
      ? repeatedAuditFailureCount({ artifact: auditArtifact, family: failureFamily, result }) > 0
      : false;
  const repeatedFailureMustBlock =
    repeatedSameFailure && env.AIF_AUDIT_REPEATED_FAILURE_FAIL_CLOSED;
  const shouldReturnToRework =
    Boolean(auditArtifact) &&
    Boolean(options.allowAuditRework) &&
    isRecoverableAuditFailureFamily(failureFamily) &&
    auditReviewIteration < auditMaxReviewIterations &&
    !repeatedFailureMustBlock;
  const auditReworkLimitReached =
    Boolean(auditArtifact) &&
    Boolean(options.allowAuditRework) &&
    isRecoverableAuditFailureFamily(failureFamily) &&
    !shouldReturnToRework;
  const blockedReason = formatTaskCompletionBlockedReason(result, {
    suppressManualReviewWhenActionable: shouldReturnToRework,
  });
  const reworkBlockedReason = repeatedFailureMustBlock
    ? `${blockedReason} Manual review required: repeated audit artifact failure signature failed closed.`
    : blockedReason;
  const terminalBlockedReason = auditArtifact
    ? `${failureFamily}: ${
        repeatedFailureMustBlock
          ? reworkBlockedReason
          : auditReworkLimitReached
            ? `${blockedReason} Manual review required: audit evidence guard failed after ${auditReviewIteration}/${auditMaxReviewIterations} review iterations.`
            : reworkBlockedReason
      }`
    : blockedReason;

  if (auditArtifact) {
    const state = artifactStateForFailureFamily(failureFamily, {
      terminal: !shouldReturnToRework || repeatedFailureMustBlock,
    });
    updateRoadmapBatchArtifactState({
      taskId: task.id,
      state,
      failureFamily,
      attemptBoundaryId: auditArtifact.attemptBoundaryId,
      reworkStatus: shouldReturnToRework
        ? "rework_requested"
        : state === "terminal_inconclusive"
          ? "terminal_inconclusive"
          : "manual_review_required",
      createAttemptBoundary: shouldReturnToRework,
      validationDetails: {
        action: options.action ?? "approve_done",
        ...auditValidationDetails(result),
      },
      contentSha: result.evidence.auditReportValidation.artifactSha256,
      branchName: task.branchName ?? auditArtifact.branchName,
      worktreePath: task.worktreePath ?? auditArtifact.worktreePath,
      projectRoot: options.projectRoot ?? auditArtifact.projectRoot,
    });
  }

  if (shouldReturnToRework) {
    setTaskFields(task.id, {
      status: "implementing",
      blockedReason: `${failureFamily}: ${reworkBlockedReason}`,
      blockedFromStatus: options.blockedFromStatus ?? "done",
      retryAfter: null,
      retryCount: task.retryCount ?? 0,
      reworkRequested: true,
      manualReviewRequired: false,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    appendTaskActivityLog(
      task.id,
      `[${nowIso}] Completion evidence guard returned ${options.action ?? "approve_done"} to implementation rework: ${reworkBlockedReason}`,
    );

    const updated = findTaskById(task.id);
    if (!updated) {
      return { ok: false, status: 404, error: "Task not found after completion guard rework" };
    }
    return { ok: true, task: updated, broadcastType: "task:moved" };
  }

  setTaskFields(task.id, {
    status: "blocked_external",
    blockedReason: terminalBlockedReason,
    blockedFromStatus: options.blockedFromStatus ?? "done",
    retryAfter: null,
    retryCount: task.retryCount ?? 0,
    manualReviewRequired:
      repeatedFailureMustBlock ||
      auditReworkLimitReached ||
      result.issues.some((entry) => entry.code === "manual_review_required"),
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });
  appendTaskActivityLog(
    task.id,
    `[${nowIso}] Completion evidence guard blocked ${options.action ?? "approve_done"}: ${terminalBlockedReason}`,
  );

  const updated = findTaskById(task.id);
  if (!updated) {
    return { ok: false, status: 404, error: "Task not found after completion guard block" };
  }
  return { ok: true, task: updated, broadcastType: "task:moved" };
}

async function handleFastFix(input: EventHandlerInput): Promise<EventHandlerResult> {
  const task = findTaskById(input.taskId);
  if (!task) {
    return { ok: false, status: 404, error: "Task not found" };
  }
  if (task.status !== "plan_ready") {
    return { ok: false, status: 409, error: "fast_fix is only allowed from plan_ready" };
  }
  if (task.autoMode) {
    return { ok: false, status: 409, error: "fast_fix is not needed when autoMode=true" };
  }

  const latestComment = getLatestHumanComment(task.id);
  if (!latestComment) {
    return {
      ok: false,
      status: 409,
      error: "fast_fix requires a human comment with requested fix",
    };
  }

  const project = findProjectById(task.projectId);
  if (!project) {
    return { ok: false, status: 404, error: "Project not found for task" };
  }
  const executionRoot = task.worktreePath ?? project.rootPath;

  const branchError = restoreTaskBranchForMutation(task, executionRoot);
  if (branchError) return branchError;

  const previousPlan = task.plan?.trim() ?? "";
  if (!previousPlan) {
    return { ok: false, status: 409, error: "fast_fix requires an existing plan on the task" };
  }
  const cfg = getProjectConfig(executionRoot);
  const effectivePlanPath = task.isFix ? cfg.paths.fix_plan : task.planPath || cfg.paths.plan;

  let firstAttempt = "";
  try {
    firstAttempt = await withTimeout(
      runFastFixQuery({
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description,
        latestComment,
        projectRoot: executionRoot,
        planPath: effectivePlanPath,
        previousPlan,
        shouldTryFileUpdate: true,
      }),
      90_000,
      "Fast fix query timed out",
    );
  } catch {
    // Fallback to no-tools mode below
  }

  const updatedPlan = looksLikeFullPlanUpdate(previousPlan, firstAttempt)
    ? firstAttempt
    : await withTimeout(
        runFastFixQuery({
          taskId: task.id,
          taskTitle: task.title,
          taskDescription: task.description,
          latestComment,
          projectRoot: executionRoot,
          planPath: effectivePlanPath,
          previousPlan,
          priorAttempt: firstAttempt || undefined,
          shouldTryFileUpdate: false,
        }),
        90_000,
        "Fast fix query timed out",
      );

  if (!looksLikeFullPlanUpdate(previousPlan, updatedPlan)) {
    return {
      ok: false,
      status: 500,
      error: "Fast fix result omitted existing plan content. Plan was left unchanged.",
    };
  }

  // Post-run drift check: `runFastFixQuery` runs a runtime that may write to
  // disk (`@${planPath}` injection asks for file overwrite). A rogue skill
  // could `git checkout` mid-flow and persist plan/state on the wrong branch.
  const driftError = assertTaskBranchPostRun(task, executionRoot);
  if (driftError) return driftError;

  const nowIso = new Date().toISOString();
  persistTaskPlanForTask({
    taskId: task.id,
    projectRoot: executionRoot,
    isFix: task.isFix,
    planPath: task.planPath ?? undefined,
    planText: updatedPlan,
    updatedAt: nowIso,
  });

  setTaskFields(task.id, {
    reworkRequested: false,
    updatedAt: nowIso,
  });

  const updated = findTaskById(task.id);
  if (!updated) {
    return { ok: false, status: 404, error: "Task not found" };
  }

  return { ok: true, task: updated, broadcastType: "task:updated" };
}

function handleRegularTransition(input: EventHandlerInput): EventHandlerResult {
  const task = findTaskById(input.taskId);
  if (!task) {
    return { ok: false, status: 404, error: "Task not found" };
  }
  const { event } = input;
  if (event !== "cancel_task" && isOperatorCancelledTask(task)) {
    return {
      ok: false,
      status: 409,
      error: "operator_cancelled tasks require operator triage before any further event",
    };
  }
  const operatorInputRetry = event === "retry_from_blocked" && isOperatorInputHold(task);
  if (operatorInputRetry && !hasFreshOperatorInputAnswer(task)) {
    return {
      ok: false,
      status: 409,
      error:
        "operator_input_required tasks need a newer human answer comment before retry_from_blocked can resume",
    };
  }
  const transition = applyHumanTaskEvent(task, event, {
    requirementsIntakeEnabled: getEnv().AIF_REQUIREMENTS_INTAKE_ENABLED,
  });
  if (!transition.ok) {
    return { ok: false, status: 409, error: transition.error };
  }

  if (event === "start_implementation") {
    const project = findProjectById(task.projectId);
    if (!project) {
      return { ok: false, status: 404, error: "Project not found for task" };
    }
    const executionRoot = task.worktreePath ?? project.rootPath;
    const auditArtifact = findRoadmapBatchArtifactByTaskId(task.id);
    const branchError = restoreTaskBranchForMutation(task, executionRoot);
    if (branchError && !branchError.ok) {
      const result = evaluateTaskCompletionEvidence({
        task: {
          ...task,
          expectedReportArtifactPath: auditArtifact?.artifactPath,
          allowedEvidenceArtifactPaths: allowedEvidenceArtifactPathsFor(auditArtifact),
          auditArtifactRole: auditArtifactRoleFor(auditArtifact),
          roadmapBatchId: auditArtifact?.batchId ?? null,
        },
        projectRoot: executionRoot,
        branchIsolationReason: branchError.error,
        phase: "pre_implementation",
        auditEvidenceUnits: auditEvidenceForArtifact(task, auditArtifact, executionRoot),
      });
      return blockTaskForCompletionEvidence(task, result, {
        blockedFromStatus: task.status,
        action: "start_implementation",
        auditArtifact,
        projectRoot: executionRoot,
      });
    }

    const result = evaluateTaskCompletionEvidence({
      task: {
        ...task,
        expectedReportArtifactPath: auditArtifact?.artifactPath,
        allowedEvidenceArtifactPaths: allowedEvidenceArtifactPathsFor(auditArtifact),
        auditArtifactRole: auditArtifactRoleFor(auditArtifact),
        roadmapBatchId: auditArtifact?.batchId ?? null,
      },
      projectRoot: executionRoot,
      phase: "pre_implementation",
      auditEvidenceUnits: auditEvidenceForArtifact(task, auditArtifact, executionRoot),
    });
    if (!result.ok) {
      return blockTaskForCompletionEvidence(task, result, {
        blockedFromStatus: task.status,
        action: "start_implementation",
        auditArtifact,
        projectRoot: executionRoot,
      });
    }
  }

  if (event === "approve_done") {
    const project = findProjectById(task.projectId);
    if (!project) {
      return { ok: false, status: 404, error: "Project not found for task" };
    }
    const env = getEnv();
    if (
      env.AIF_REQUIREMENTS_INTAKE_ENABLED &&
      env.AIF_REQUIREMENTS_QA_ENABLED &&
      (!hasFreshAcceptedTaskQaArtifact(task.id) || !hasFreshAcceptedTaskAcceptancePack(task.id))
    ) {
      return {
        ok: false,
        status: 409,
        error: "approve_done requires fresh accepted QA and acceptance artifacts",
      };
    }
    const executionRoot = task.worktreePath ?? project.rootPath;
    const auditArtifact = findRoadmapBatchArtifactByTaskId(task.id);
    const auditEvidenceUnits = auditEvidenceForArtifact(task, auditArtifact, executionRoot);
    const branchError = restoreTaskBranchForMutation(task, executionRoot);
    if (branchError && !branchError.ok) {
      const result = evaluateTaskCompletionEvidence({
        task: {
          ...task,
          expectedReportArtifactPath: auditArtifact?.artifactPath,
          allowedEvidenceArtifactPaths: allowedEvidenceArtifactPathsFor(auditArtifact),
          auditArtifactRole: auditArtifactRoleFor(auditArtifact),
          roadmapBatchId: auditArtifact?.batchId ?? null,
        },
        projectRoot: executionRoot,
        branchIsolationReason: branchError.error,
        auditEvidenceUnits,
        requireAuditLedgerEvidence: auditArtifactRequiresLedgerEvidence({
          auditArtifact,
          projectRoot: executionRoot,
          auditEvidenceUnits,
        }),
      });
      return blockTaskForCompletionEvidence(task, result, {
        auditArtifact,
        allowAuditRework: true,
        projectRoot: executionRoot,
      });
    }

    const result = evaluateTaskCompletionEvidence({
      task: {
        ...task,
        expectedReportArtifactPath: auditArtifact?.artifactPath,
        allowedEvidenceArtifactPaths: allowedEvidenceArtifactPathsFor(auditArtifact),
        auditArtifactRole: auditArtifactRoleFor(auditArtifact),
        roadmapBatchId: auditArtifact?.batchId ?? null,
      },
      projectRoot: executionRoot,
      auditEvidenceUnits,
      requireAuditLedgerEvidence: auditArtifactRequiresLedgerEvidence({
        auditArtifact,
        projectRoot: executionRoot,
        auditEvidenceUnits,
      }),
    });
    if (!result.ok) {
      return blockTaskForCompletionEvidence(task, result, {
        auditArtifact,
        allowAuditRework: true,
        projectRoot: executionRoot,
      });
    }
    if (auditArtifact) {
      const auditCardDecision = acceptedAuditCardDecision({
        task,
        auditArtifact,
        result,
        projectRoot: executionRoot,
      });
      updateRoadmapBatchArtifactState({
        taskId: task.id,
        state: "valid",
        failureFamily: null,
        reworkStatus: "accepted",
        attemptBoundaryId: auditArtifact.attemptBoundaryId,
        validationDetails: {
          action: "approve_done",
          evidence: result.evidence,
          auditCardDecision,
        },
        contentSha: result.evidence.auditReportValidation.artifactSha256,
        branchName: task.branchName ?? auditArtifact.branchName,
        worktreePath: task.worktreePath ?? auditArtifact.worktreePath,
        projectRoot: executionRoot,
      });
    }
  }

  if ((input.event === "approve_done" || input.event === "start_ai") && input.deletePlanFile) {
    const project = findProjectById(task.projectId);
    if (!project) {
      return { ok: false, status: 404, error: "Project not found for task" };
    }
    const executionRoot = task.worktreePath ?? project.rootPath;

    const branchError = restoreTaskBranchForMutation(task, executionRoot);
    if (branchError) return branchError;

    // For fix tasks, always remove canonical FIX_PLAN.md.
    // For regular tasks, use configured planPath (defaults from config.yaml).
    const cfg = getProjectConfig(executionRoot);
    const planFilePath = task.isFix
      ? resolve(executionRoot, cfg.paths.fix_plan)
      : resolve(executionRoot, task.planPath || cfg.paths.plan);

    if (existsSync(planFilePath)) {
      unlinkSync(planFilePath);
    }
  }

  if (event === "request_changes") {
    const auditArtifact = findRoadmapBatchArtifactByTaskId(task.id);
    if (auditArtifact) {
      markReportArtifactReworkRequested(task, auditArtifact);
    }
  }

  const nowIso = new Date().toISOString();
  setTaskFields(task.id, {
    ...transition.patch,
    ...(operatorInputRetry ? { paused: false } : {}),
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });

  if (event === "cancel_task") {
    appendTaskActivityLog(
      task.id,
      `[${nowIso}] Task cancelled by operator from ${task.status}; automation paused.`,
    );
  }

  const updated = findTaskById(task.id);
  if (!updated) {
    return { ok: false, status: 404, error: "Task not found" };
  }

  return { ok: true, task: updated, broadcastType: "task:moved" };
}

function handleAcceptExistingPlan(input: EventHandlerInput): EventHandlerResult {
  const task = findTaskById(input.taskId);
  if (!task) {
    return { ok: false, status: 404, error: "Task not found" };
  }
  if (task.status !== "backlog") {
    return { ok: false, status: 409, error: "accept_existing_plan is only allowed from backlog" };
  }

  const project = findProjectById(task.projectId);
  if (!project) {
    return { ok: false, status: 404, error: "Project not found for task" };
  }

  // Branch handling MUST happen before resolving/reading the plan file:
  // task.branchName is a source-of-truth contract, and an already-bound
  // task whose HEAD has drifted to a different branch would otherwise read
  // the plan file from the wrong work-tree state and persist that content
  // onto the bound branch. Two paths:
  //   - Already-bound (task.branchName set): restorePersistedBranch — config
  //     drift / missing branch / dirty tree fail loud, fail-closed.
  //   - Unbound (no task.branchName): ensureFeatureBranch creates the
  //     feature branch from base, then we read the plan from that branch.
  // Fix tasks keep the legacy no-branch behavior.
  let boundBranchName: string | null = task.branchName ?? null;
  let executionRoot = task.worktreePath ?? project.rootPath;
  if (!task.isFix && boundBranchName) {
    const branchError = restoreTaskBranchForMutation(task, executionRoot);
    if (branchError) return branchError;
  } else if (!task.isFix && !boundBranchName) {
    try {
      const branchResult = ensureFeatureBranch({
        projectRoot: project.rootPath,
        taskId: task.id,
        title: task.title,
      });
      if (branchResult.action !== "skipped" && branchResult.branchName) {
        boundBranchName = branchResult.branchName;
      }
    } catch (err) {
      const error = isBranchIsolationError(err)
        ? `Branch isolation failure (${err.kind}): ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
      return { ok: false, status: 409, error };
    }
  }

  const cfg = getProjectConfig(executionRoot);
  const planFilePath = task.isFix
    ? resolve(executionRoot, cfg.paths.fix_plan)
    : resolve(executionRoot, task.planPath || cfg.paths.plan);

  if (!existsSync(planFilePath)) {
    return { ok: false, status: 404, error: "Plan file not found on disk" };
  }

  const filePlan = readFileSync(planFilePath, "utf8");
  if (!filePlan.trim()) {
    return { ok: false, status: 409, error: "Plan file is empty" };
  }

  const nowIso = new Date().toISOString();
  persistTaskPlanForTask({
    taskId: input.taskId,
    planText: filePlan,
    projectRoot: executionRoot,
    isFix: task.isFix,
    planPath: task.planPath ?? undefined,
    updatedAt: nowIso,
  });

  setTaskFields(input.taskId, {
    status: "plan_ready",
    blockedReason: null,
    blockedFromStatus: null,
    retryAfter: null,
    retryCount: 0,
    reworkRequested: false,
    reviewIterationCount: 0,
    manualReviewRequired: false,
    autoReviewState: null,
    branchName: boundBranchName,
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });

  const updated = findTaskById(input.taskId);
  if (!updated) {
    return { ok: false, status: 404, error: "Task not found after update" };
  }

  return { ok: true, task: updated, broadcastType: "task:moved" };
}

export async function handleTaskEvent(input: EventHandlerInput): Promise<EventHandlerResult> {
  if (input.event === "manual_exception") {
    return handleManualException(input);
  }
  const task = findTaskById(input.taskId);
  if (!task) {
    return { ok: false, status: 404, error: "Task not found" };
  }
  if (task.hierarchyRole === "container" && RUNTIME_STARTING_EVENTS.has(input.event)) {
    return {
      ok: false,
      status: 409,
      error: "Container tasks are coordination surfaces and cannot start runtime execution",
    };
  }
  if (
    task.taskIntent === "audit" &&
    RUNTIME_STARTING_EVENTS.has(input.event) &&
    !auditRoadmapTaskDependenciesReleaseReady(task)
  ) {
    return {
      ok: false,
      status: 409,
      error:
        "audit_child_dependency_not_ready: predecessor report artifacts must be trusted valid or accepted terminal before this audit task can start",
    };
  }
  const configBlocker = checkConfigGovernanceBlocker(task, input.event);
  if (configBlocker) return configBlocker;
  if (input.event === "fast_fix") {
    return await handleFastFix(input);
  }
  if (input.event === "accept_existing_plan") {
    return handleAcceptExistingPlan(input);
  }
  return handleRegularTransition(input);
}
