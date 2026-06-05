import { Hono } from "hono";
import { jsonValidator } from "../middleware/zodValidator.js";
import { internalBroadcastAuth } from "../middleware/internalBroadcastAuth.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  logger,
  applyHumanTaskEvent,
  parseAttachments,
  getProjectConfig,
  defaultsForMode,
  normalizeTaskIntent,
  resolveTaskIntentDefaults,
  getEnv,
  classifyAuditDecompositionRequest,
  parseExpectedAuditReportArtifactPath,
  isGitRepo,
  projectSupportsTaskWorktrees,
  projectUsesSharedBranchIsolation,
  findSecretLikeKeys,
  isManualReviewBlockedTask,
  summarizeTaskRuntimeOverride,
} from "@aif/shared";
import {
  createTaskSchema,
  updateTaskSchema,
  taskEventSchema,
  createTaskCommentSchema,
  createRequirementQuestionSchema,
  answerRequirementQuestionSchema,
  answerRequirementQuestionBatchSchema,
  reorderTaskSchema,
  broadcastTaskSchema,
  manualExceptionSchema,
  operatorVerifiedCompletionSchema,
  operatorLimitQuerySchema,
  worktreeCleanupSchema,
} from "../schemas.js";
import { broadcast } from "../ws.js";
import { handleTaskEvent } from "../services/taskEvents.js";
import { handleOperatorVerifiedCompletion } from "../services/operatorVerifiedCompletion.js";
import {
  archiveTaskWorktree,
  deleteTaskWorktree,
  inspectTaskWorktree,
  TaskWorktreeError,
} from "../services/taskWorktrees.js";
import {
  persistAttachments,
  cleanupReplacedAttachments,
  AttachmentValidationError,
} from "../services/attachmentPersistence.js";
import { readAttachment } from "../services/attachmentStorage.js";
import {
  findTaskById,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  listComments,
  createComment,
  updateComment,
  deleteComment,
  toTaskResponse,
  toTaskBroadcastPayload,
  toCommentResponse,
  getTaskPlanFileStatus,
  updateTaskPlan,
  syncTaskPlanFromFile,
} from "../repositories/tasks.js";
import {
  findProjectById,
  appendConfigAuditEvent,
  appendTaskActivityLog,
  answerTaskRequirementQuestion,
  answerTaskRequirementQuestionBatch,
  createMemoryCandidateForVerifiedTask,
  createTaskRequirementQuestion,
  getAppDefaultRuntimeProfileId,
  getTaskRequirementQuestionsResponse,
  getTaskRequirementsSnapshotResponse,
  resolveEffectiveRuntimeProfile,
  resolveEffectiveRuntimeProfilesForTasks,
  updateTaskPositionOnly,
  buildTaskArtifactTrustRollup,
  buildTaskWorkflowTimeline,
  countTaskMemoryCandidates,
  listTaskMemoryCandidates,
  listTaskRuntimeUsageEvents,
  listConfigAuditEvents,
  listProjectConfigWorkBlockers,
  collectTaskRuntimeOverrideBlockers,
  createRoadmapBatchContract,
  findRoadmapBatchArtifactByTaskId,
  type RoadmapBatchExecutionPolicy,
  type TaskFieldsUpdate,
  type TaskRow,
} from "@aif/data";
import { validateProjectScopedRuntimeProfileSelections } from "../services/runtimeProfileScope.js";

const log = logger("tasks-route");

export const tasksRouter = new Hono();

function parseRuntimeOptionsForAudit(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseStoredObjectForTaskRollback(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function taskUpdateRollbackFields(existing: TaskRow): TaskFieldsUpdate {
  return {
    title: existing.title,
    description: existing.description ?? "",
    sourceRef: existing.sourceRef ?? null,
    attachments: parseAttachments(existing.attachments),
    priority: existing.priority,
    autoMode: existing.autoMode,
    taskIntent: existing.taskIntent,
    isFix: existing.isFix,
    plannerMode: existing.plannerMode,
    planPath: existing.planPath,
    planDocs: existing.planDocs,
    planTests: existing.planTests,
    skipReview: existing.skipReview,
    useSubagents: existing.useSubagents,
    implementationLog: existing.implementationLog,
    implementationManifest: parseStoredObjectForTaskRollback(existing.implementationManifestJson),
    reviewComments: existing.reviewComments,
    agentActivityLog: existing.agentActivityLog,
    blockedReason: existing.blockedReason,
    blockedFromStatus: existing.blockedFromStatus,
    retryAfter: existing.retryAfter,
    retryCount: existing.retryCount,
    roadmapAlias: existing.roadmapAlias,
    tags: parseStoredTagsForAuditRoute(existing.tags),
    reworkRequested: existing.reworkRequested,
    reviewIterationCount: existing.reviewIterationCount,
    maxReviewIterations: existing.maxReviewIterations,
    manualReviewRequired: existing.manualReviewRequired,
    autoReviewState: parseStoredObjectForTaskRollback(
      existing.autoReviewStateJson,
    ) as TaskFieldsUpdate["autoReviewState"],
    paused: existing.paused,
    lastHeartbeatAt: existing.lastHeartbeatAt,
    runtimeProfileId: existing.runtimeProfileId,
    modelOverride: existing.modelOverride,
    runtimeOptions: parseRuntimeOptionsForAudit(existing.runtimeOptionsJson),
    scheduledAt: existing.scheduledAt,
    worktreePath: existing.worktreePath,
    parentTaskId: existing.parentTaskId,
    hierarchyRole: existing.hierarchyRole,
    parentCloseoutPolicy: existing.parentCloseoutPolicy,
  };
}

function taskHierarchyContractError(
  error: unknown,
): { error: string; code: string; status: ContentfulStatusCode } | null {
  const message = error instanceof Error ? error.message : String(error);
  const hierarchyMessages = [
    "Parent task not found",
    "Parent task must belong to the same project",
    "Task hierarchy depth cannot exceed",
    "parentCloseoutPolicy requires hierarchyRole=container",
    "A task cannot be its own parent",
    "Task hierarchy cannot contain cycles",
    "Tasks with children must remain hierarchyRole=container",
  ];
  if (!hierarchyMessages.some((fragment) => message.includes(fragment))) {
    return null;
  }
  const status: ContentfulStatusCode =
    message.includes("cycles") || message.includes("children") ? 409 : 400;
  return {
    error: message,
    code: "TASK_HIERARCHY_INVALID",
    status,
  };
}

function attachmentsCreatedFromIncoming(
  persisted: Awaited<ReturnType<typeof persistAttachments>>,
  incoming: Parameters<typeof persistAttachments>[0],
): Awaited<ReturnType<typeof persistAttachments>> {
  return persisted.filter((attachment, index) => {
    const source = incoming[index];
    return Boolean(attachment.path && source && !source.path && source.content !== null);
  });
}

function taskRuntimeOptionsSecretLikeKeys(
  runtimeOptions: Record<string, unknown> | null | undefined,
) {
  return findSecretLikeKeys(runtimeOptions ?? {});
}

function resolveDirectAuditExecutionPolicy(
  projectRoot: string | null | undefined,
): RoadmapBatchExecutionPolicy {
  if (
    projectRoot &&
    isGitRepo(projectRoot) &&
    projectUsesSharedBranchIsolation(projectRoot) &&
    getEnv().AIF_TASK_WORKTREES_ENABLED &&
    projectSupportsTaskWorktrees(projectRoot)
  ) {
    return "worktree_isolated";
  }
  return "serialized_shared_checkout";
}

function directAuditRoadmapAlias(
  taskId: string,
  requestedAlias: string | null | undefined,
): string {
  const normalized = requestedAlias?.trim();
  return normalized || `direct-audit-${taskId.slice(0, 8)}`;
}

function parseStoredTagsForAuditRoute(tags: string | string[] | null | undefined): string[] {
  if (Array.isArray(tags)) return tags;
  if (!tags) return [];
  try {
    const parsed: unknown = JSON.parse(tags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function validateDirectAuditTaskContract(input: {
  title: string;
  description: string | null | undefined;
  roadmapAlias?: string | null;
  tags?: string[] | string | null;
}):
  | { ok: true; reportArtifactPath: string }
  | { ok: false; body: Record<string, unknown>; status: ContentfulStatusCode } {
  const description = input.description ?? "";
  const auditDecomposition = classifyAuditDecompositionRequest({
    title: input.title,
    description: [
      description,
      input.roadmapAlias ? `Roadmap alias: ${input.roadmapAlias}` : "",
      ...parseStoredTagsForAuditRoute(input.tags).map((tag) => `Tag: ${tag}`),
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (auditDecomposition.requiresDecomposition) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Broad audit requests must be decomposed into an audit roadmap before execution.",
        code: "AUDIT_DECOMPOSITION_REQUIRED",
        decomposition: auditDecomposition,
      },
    };
  }
  const reportArtifactPath = parseExpectedAuditReportArtifactPath(description);
  if (!reportArtifactPath) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Direct audit tasks must declare a concrete Report artifact path.",
        code: "AUDIT_REPORT_ARTIFACT_REQUIRED",
      },
    };
  }
  return { ok: true, reportArtifactPath };
}

function hasTaskRuntimeOverrideInput(input: object): boolean {
  return (
    Object.prototype.hasOwnProperty.call(input, "runtimeProfileId") ||
    Object.prototype.hasOwnProperty.call(input, "modelOverride") ||
    Object.prototype.hasOwnProperty.call(input, "runtimeOptions")
  );
}

function hasDirectAuditContractInput(input: object): boolean {
  return (
    Object.prototype.hasOwnProperty.call(input, "title") ||
    Object.prototype.hasOwnProperty.call(input, "description") ||
    Object.prototype.hasOwnProperty.call(input, "roadmapAlias") ||
    Object.prototype.hasOwnProperty.call(input, "tags") ||
    Object.prototype.hasOwnProperty.call(input, "taskIntent") ||
    Object.prototype.hasOwnProperty.call(input, "isFix")
  );
}

function appendTaskRuntimeOverrideAudit(input: {
  before: Record<string, unknown>;
  task: TaskRow;
}): void {
  const after = summarizeTaskRuntimeOverride({
    runtimeProfileId: input.task.runtimeProfileId,
    modelOverride: input.task.modelOverride,
    runtimeOptions: parseRuntimeOptionsForAudit(input.task.runtimeOptionsJson),
  });
  appendConfigAuditEvent({
    projectId: input.task.projectId,
    taskId: input.task.id,
    runtimeProfileId: input.task.runtimeProfileId,
    action: "task_runtime_override_updated",
    sourceKind: "task_override",
    actor: "api",
    before: input.before,
    after,
  });
  appendTaskActivityLog(
    input.task.id,
    `[config-governance] Task runtime override updated; keys=${JSON.stringify(after)}`,
  );
}

function runtimeStartConfigGovernanceBlocker(task: TaskRow): {
  error: string;
  reasonCodes: string[];
} | null {
  const blockers = [
    ...(listProjectConfigWorkBlockers(task.projectId) ?? []),
    ...collectTaskRuntimeOverrideBlockers(task),
  ];
  const reasonCodes = new Set(blockers.map((issue) => issue.reasonCode));
  if (reasonCodes.size === 0) return null;
  const sortedReasonCodes = [...reasonCodes].sort();
  return {
    error: `config_governance_blocked:${sortedReasonCodes.join(",")}`,
    reasonCodes: sortedReasonCodes,
  };
}

const TASK_OPERATOR_BROADCAST_TYPES = new Set([
  "task:timeline_updated",
  "task:evidence_recorded",
  "task:trust_updated",
  "task:manual_handoff_required",
]);

function truncateOperatorText(value: string | null | undefined, maxLength = 500): string | null {
  if (!value) return null;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function taskOperatorPayload(task: TaskRow, type?: string) {
  const trust = buildTaskArtifactTrustRollup(task.id);
  const payload = {
    id: task.id,
    projectId: task.projectId,
    reasonCodes: trust?.reasonCodes ?? [],
    generatedAt: new Date().toISOString(),
  };
  if (type === "task:manual_handoff_required") {
    return {
      ...payload,
      blockedReason: truncateOperatorText(task.blockedReason),
    };
  }
  return payload;
}

function isManualHandoffTask(task: TaskRow): boolean {
  if (isManualReviewBlockedTask(task)) return true;
  const reason = task.blockedReason?.toLowerCase() ?? "";
  return Boolean(
    reason.startsWith("operator_input_required:") ||
    reason.startsWith("operator_cancelled:") ||
    reason.includes("branch isolation failure") ||
    reason.includes("config_governance_blocked") ||
    reason.includes("manual action required before retry") ||
    reason.includes("runtime capability check failed") ||
    reason.includes("runtime authentication failed") ||
    reason.includes("runtime permissions blocked") ||
    reason.includes("missing access") ||
    reason.includes("required production validation"),
  );
}

function broadcastTaskOperatorEvents(task: TaskRow, reasonTypes: string[]) {
  for (const type of reasonTypes) {
    if (!TASK_OPERATOR_BROADCAST_TYPES.has(type)) continue;
    broadcast({ type: type as never, payload: taskOperatorPayload(task, type) });
  }
}

function broadcastWorktreeWarnings(task: TaskRow, warnings: string[]) {
  if (warnings.length === 0) return;
  broadcast({
    type: "project:worktree_warning",
    payload: { projectId: task.projectId, taskId: task.id, warnings },
  });
}

function toTaskRouteResponse(
  task: TaskRow,
  systemDefaultRuntimeProfileId = getAppDefaultRuntimeProfileId("task"),
  effectiveRuntime = resolveEffectiveRuntimeProfile({
    taskId: task.id,
    projectId: task.projectId,
    mode: "task",
    systemDefaultRuntimeProfileId,
  }),
) {
  const response = toTaskResponse(task);

  return {
    ...response,
    artifactTrust: buildTaskArtifactTrustRollup(task.id),
    effectiveRuntime: {
      source: effectiveRuntime.source,
      profileId: effectiveRuntime.profile?.id ?? null,
      runtimeId: effectiveRuntime.profile?.runtimeId ?? null,
      providerId: effectiveRuntime.profile?.providerId ?? null,
      profileName: effectiveRuntime.profile?.name ?? null,
    },
    memoryCandidateCount: countTaskMemoryCandidates(task.id),
  };
}

// POST /tasks/:id/broadcast — emit WS update for a task (used by agent process)
tasksRouter.post(
  "/:id/broadcast",
  internalBroadcastAuth,
  jsonValidator(broadcastTaskSchema),
  async (c) => {
    const { id } = c.req.param();
    const { type } = c.req.valid("json");
    const task = findTaskById(id);
    if (!task) return c.json({ error: "Task not found" }, 404);

    if (type === "task:manual_handoff_required" && !isManualHandoffTask(task)) {
      log.debug(
        { taskId: id, type },
        "Skipped manual handoff broadcast for non-manual blocked task",
      );
    } else if (TASK_OPERATOR_BROADCAST_TYPES.has(type)) {
      broadcast({ type, payload: taskOperatorPayload(task, type) });
    } else if (type === "task:questions_created" || type === "task:needs_input") {
      const questionState = getTaskRequirementQuestionsResponse(id);
      const activeBatch =
        questionState?.batches.find((batch) => batch.batchId === task.needsInputBatchId) ??
        questionState?.batches.find((batch) => batch.status === "open");
      broadcast({
        type,
        payload: {
          taskId: task.id,
          projectId: task.projectId,
          batchId: activeBatch?.batchId,
          stage: activeBatch?.stage ?? task.needsInputStage ?? undefined,
          targetResumeStage: activeBatch?.targetResumeStage,
          openBlockingCount: questionState?.openBlockingCount ?? 0,
        },
      });
    } else if (
      type === "task:requirements_snapshot_created" ||
      type === "task:requirements_snapshot_updated"
    ) {
      broadcast({ type, payload: toTaskBroadcastPayload(task) });
      broadcast({ type: "task:timeline_updated", payload: taskOperatorPayload(task, type) });
    } else {
      broadcast({ type, payload: toTaskBroadcastPayload(task) });
      if (type === "task:updated" || type === "task:moved") {
        broadcastTaskOperatorEvents(task, [
          "task:timeline_updated",
          "task:trust_updated",
          ...(isManualHandoffTask(task) ? ["task:manual_handoff_required"] : []),
        ]);
      }
      if (type === "task:created" || type === "task:moved") {
        broadcast({
          type: "project:queue_updated",
          payload: { projectId: task.projectId, taskId: task.id },
        });
      }
      if (type === "task:created") {
        broadcast({ type: "agent:wake", payload: { id: task.id } });
      }
    }
    log.debug({ taskId: id, type }, "Task WS broadcast triggered");
    return c.json({ success: true });
  },
);

// GET /tasks?projectId=xxx — list by project, sorted by status order + position
tasksRouter.get("/", (c) => {
  const projectId = c.req.query("projectId") || undefined;
  if (projectId && !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return c.json({ error: "Invalid projectId format" }, 400);
  }

  const allTasks = listTasks(projectId);
  const systemDefaultRuntimeProfileId = getAppDefaultRuntimeProfileId("task");
  const effectiveRuntimeByTaskId = resolveEffectiveRuntimeProfilesForTasks(allTasks, {
    mode: "task",
    systemDefaultRuntimeProfileId,
  });
  log.debug({ count: allTasks.length, projectId }, "Listed tasks");
  return c.json(
    allTasks.map((task) =>
      toTaskRouteResponse(
        task,
        systemDefaultRuntimeProfileId,
        effectiveRuntimeByTaskId.get(task.id),
      ),
    ),
  );
});

// GET /tasks/:id/timeline - generic task workflow timeline
tasksRouter.get("/:id/timeline", (c) => {
  const { id } = c.req.param();
  const timeline = buildTaskWorkflowTimeline(id);
  if (!timeline) {
    log.debug({ taskId: id }, "Task timeline not found");
    return c.json({ error: "Task not found" }, 404);
  }

  return c.json(timeline);
});

// GET /tasks/:id/artifact-trust - bounded task artifact trust rollup
tasksRouter.get("/:id/artifact-trust", (c) => {
  const { id } = c.req.param();
  const task = findTaskById(id);
  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json(buildTaskArtifactTrustRollup(id));
});

// GET /tasks/:id/evidence - task evidence projection from the workflow timeline
tasksRouter.get("/:id/evidence", (c) => {
  const { id } = c.req.param();
  const timeline = buildTaskWorkflowTimeline(id);
  if (!timeline) return c.json({ error: "Task not found" }, 404);
  return c.json({
    taskId: timeline.context.taskId,
    projectId: timeline.context.projectId,
    generatedAt: timeline.context.generatedAt,
    evidence: timeline.evidence,
    evidenceLinks: timeline.evidenceLinks,
    events: timeline.events.filter((event) => event.kind === "evidence_recorded"),
  });
});

// GET /tasks/:id/memory - task-scoped memory candidates
tasksRouter.get("/:id/memory", (c) => {
  const { id } = c.req.param();
  const response = listTaskMemoryCandidates(id);
  if (!response) return c.json({ error: "Task not found" }, 404);
  return c.json(response);
});

// GET /tasks/:id/runtime-usage - bounded task runtime usage events
tasksRouter.get("/:id/runtime-usage", (c) => {
  const { id } = c.req.param();
  const parsed = operatorLimitQuerySchema.safeParse({ limit: c.req.query("limit") });
  if (!parsed.success) return c.json({ error: "Invalid query" }, 400);
  const response = listTaskRuntimeUsageEvents(id, parsed.data.limit);
  if (!response) return c.json({ error: "Task not found" }, 404);
  return c.json(response);
});

// GET /tasks/:id/config-audit - task-scoped redacted config audit events
tasksRouter.get("/:id/config-audit", (c) => {
  const { id } = c.req.param();
  const task = findTaskById(id);
  if (!task) return c.json({ error: "Task not found" }, 404);
  const parsed = operatorLimitQuerySchema.safeParse({ limit: c.req.query("limit") });
  if (!parsed.success) return c.json({ error: "Invalid query" }, 400);
  const events = listConfigAuditEvents({
    projectId: task.projectId,
    taskId: id,
    limit: parsed.data.limit,
  });
  return c.json({ taskId: id, projectId: task.projectId, events: events ?? [] });
});

// GET /tasks/:id/worktree - inspect persisted task worktree metadata and safety.
tasksRouter.get("/:id/worktree", (c) => {
  const { id } = c.req.param();
  try {
    const result = inspectTaskWorktree(id);
    const task = findTaskById(id);
    if (task) broadcastWorktreeWarnings(task, result.warnings);
    return c.json(result);
  } catch (err) {
    if (err instanceof TaskWorktreeError) {
      return c.json(
        { error: err.message, warnings: err.warnings },
        err.status as ContentfulStatusCode,
      );
    }
    log.error({ taskId: id, err }, "Task worktree inspection failed");
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /tasks/:id/worktree/cleanup - alias for explicit safe archive/delete cleanup.
tasksRouter.post("/:id/worktree/cleanup", jsonValidator(worktreeCleanupSchema), (c) => {
  const { id } = c.req.param();
  const { action } = c.req.valid("json");
  try {
    const result = action === "delete" ? deleteTaskWorktree(id) : archiveTaskWorktree(id);
    const updated = findTaskById(id);
    if (updated) {
      broadcast({ type: "task:updated", payload: toTaskBroadcastPayload(updated) });
      broadcastWorktreeWarnings(updated, result.warnings);
    }
    return c.json(result);
  } catch (err) {
    if (err instanceof TaskWorktreeError) {
      const task = findTaskById(id);
      if (task) broadcastWorktreeWarnings(task, err.warnings);
      return c.json(
        { error: err.message, warnings: err.warnings },
        err.status as ContentfulStatusCode,
      );
    }
    log.error({ taskId: id, err }, "Task worktree cleanup failed");
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /tasks/:id/worktree/archive - explicitly archive a verified task worktree.
tasksRouter.post("/:id/worktree/archive", (c) => {
  const { id } = c.req.param();
  try {
    const result = archiveTaskWorktree(id);
    const updated = findTaskById(id);
    if (updated) {
      broadcast({ type: "task:updated", payload: toTaskBroadcastPayload(updated) });
      broadcastWorktreeWarnings(updated, result.warnings);
    }
    return c.json(result);
  } catch (err) {
    if (err instanceof TaskWorktreeError) {
      return c.json(
        { error: err.message, warnings: err.warnings },
        err.status as ContentfulStatusCode,
      );
    }
    log.error({ taskId: id, err }, "Task worktree archive failed");
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /tasks/:id/worktree/delete - explicitly remove a verified task worktree.
tasksRouter.post("/:id/worktree/delete", (c) => {
  const { id } = c.req.param();
  try {
    const result = deleteTaskWorktree(id);
    const updated = findTaskById(id);
    if (updated) {
      broadcast({ type: "task:updated", payload: toTaskBroadcastPayload(updated) });
      broadcastWorktreeWarnings(updated, result.warnings);
    }
    return c.json(result);
  } catch (err) {
    if (err instanceof TaskWorktreeError) {
      return c.json(
        { error: err.message, warnings: err.warnings },
        err.status as ContentfulStatusCode,
      );
    }
    log.error({ taskId: id, err }, "Task worktree delete failed");
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /tasks - create
tasksRouter.post("/", jsonValidator(createTaskSchema), async (c) => {
  const body = c.req.valid("json");
  const runtimeValidation = validateProjectScopedRuntimeProfileSelections({
    projectId: body.projectId,
    selections: { runtimeProfileId: body.runtimeProfileId },
  });
  if (runtimeValidation) {
    log.warn(
      { projectId: body.projectId, fieldErrors: runtimeValidation.fieldErrors },
      "Rejected invalid task runtime selection",
    );
    return c.json(runtimeValidation, 400);
  }
  const secretLikeRuntimeOptionKeys = taskRuntimeOptionsSecretLikeKeys(body.runtimeOptions ?? {});
  if (secretLikeRuntimeOptionKeys.length > 0) {
    return c.json(
      {
        error: "Secret-like runtime option keys are not allowed in task overrides",
        reasonCodes: ["TASK_RUNTIME_SECRET_LIKE_OPTION_KEY"],
        fieldErrors: {
          runtimeOptions: secretLikeRuntimeOptionKeys.map((key) => `Disallowed option key: ${key}`),
        },
      },
      400,
    );
  }
  if (body.attachments.some((attachment: { path?: string }) => attachment.path)) {
    return c.json(
      { error: "New task attachments must be uploaded as content, not storage paths" },
      400,
    );
  }

  // Resolve planPath default from project config.yaml (if present)
  const project = findProjectById(body.projectId);
  const defaultPlanPath = project
    ? getProjectConfig(project.rootPath).paths.plan
    : ".ai-factory/PLAN.md";

  const taskIntent = body.isFix === true ? "fix" : normalizeTaskIntent(body.taskIntent, "general");
  const envUseSubagents = getEnv().AGENT_USE_SUBAGENTS;
  const intentDefaults = resolveTaskIntentDefaults(taskIntent, {
    envUseSubagents,
  });
  const resolvedPlannerMode = project?.parallelEnabled
    ? "full"
    : (body.plannerMode ?? intentDefaults.plannerMode);
  const generalModeDefaults = defaultsForMode(resolvedPlannerMode);
  const flagDefaults = taskIntent === "general" ? generalModeDefaults : intentDefaults;
  const resolvedIsFix = taskIntent === "fix";

  // Fill omitted flag values from mode-driven defaults (mirror of web UI behavior).
  const resolvedSkipReview =
    taskIntent === "audit" ? false : (body.skipReview ?? flagDefaults.skipReview);
  const resolvedPlanDocs = body.planDocs ?? flagDefaults.planDocs;
  const resolvedPlanTests = body.planTests ?? flagDefaults.planTests;
  const resolvedUseSubagents =
    taskIntent === "audit" || taskIntent === "spike"
      ? true
      : (body.useSubagents ??
        (taskIntent === "general" ? envUseSubagents : intentDefaults.useSubagents));

  const directAuditContract =
    taskIntent === "audit"
      ? validateDirectAuditTaskContract({
          title: body.title,
          description: body.description,
          roadmapAlias: body.roadmapAlias,
          tags: body.tags,
        })
      : null;
  if (directAuditContract?.ok === false) {
    return c.json(directAuditContract.body, directAuditContract.status);
  }
  if (
    body.plannerMode === undefined ||
    body.skipReview === undefined ||
    body.planDocs === undefined ||
    body.planTests === undefined ||
    body.useSubagents === undefined
  ) {
    log.debug(
      {
        plannerMode: resolvedPlannerMode,
        taskIntent,
        filled: {
          plannerMode: body.plannerMode === undefined,
          skipReview: body.skipReview === undefined,
          planDocs: body.planDocs === undefined,
          planTests: body.planTests === undefined,
          useSubagents: body.useSubagents === undefined,
        },
      },
      "Applied intent-driven task defaults",
    );
  }

  // Pre-create the task to get an ID, then persist attachments to storage
  let created: ReturnType<typeof createTask>;
  try {
    created = createTask({
      projectId: body.projectId,
      title: body.title,
      description: body.description,
      sourceRef: body.sourceRef ?? null,
      attachments: [],
      priority: body.priority,
      autoMode: body.autoMode,
      taskIntent,
      isFix: resolvedIsFix,
      plannerMode: resolvedPlannerMode,
      planPath: body.planPath ?? defaultPlanPath,
      planDocs: resolvedPlanDocs,
      planTests: resolvedPlanTests,
      skipReview: resolvedSkipReview,
      useSubagents: resolvedUseSubagents,
      maxReviewIterations: body.maxReviewIterations,
      paused: body.paused,
      runtimeProfileId: body.runtimeProfileId,
      modelOverride: body.modelOverride,
      runtimeOptions: body.runtimeOptions,
      roadmapAlias: body.roadmapAlias,
      tags: body.tags,
      scheduledAt: body.scheduledAt ?? null,
      parentTaskId: body.parentTaskId ?? null,
      hierarchyRole: body.hierarchyRole,
      parentCloseoutPolicy: body.parentCloseoutPolicy ?? null,
    });
  } catch (error) {
    const hierarchyError = taskHierarchyContractError(error);
    if (hierarchyError) {
      return c.json(
        { error: hierarchyError.error, code: hierarchyError.code },
        hierarchyError.status,
      );
    }
    throw error;
  }
  if (!created) return c.json({ error: "Failed to create task" }, 500);

  if (taskIntent === "audit") {
    if (!directAuditContract?.ok) {
      deleteTask(created.id, { allowAttachedChild: true });
      return c.json(
        {
          error: "Direct audit tasks must declare a concrete Report artifact path.",
          code: "AUDIT_REPORT_ARTIFACT_REQUIRED",
        },
        400,
      );
    }
    try {
      createRoadmapBatchContract({
        projectId: body.projectId,
        roadmapAlias: directAuditRoadmapAlias(created.id, body.roadmapAlias),
        taskIntent: "audit",
        executionPolicy: resolveDirectAuditExecutionPolicy(project?.rootPath),
        createdTaskIds: [created.id],
        artifacts: [
          {
            taskId: created.id,
            role: "report",
            artifactPath: directAuditContract.reportArtifactPath,
            projectRoot: project?.rootPath ?? null,
          },
        ],
      });
    } catch (error) {
      deleteTask(created.id, { allowAttachedChild: true });
      log.error(
        {
          taskId: created.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to create direct audit report artifact contract",
      );
      return c.json(
        {
          error: "Failed to create direct audit report artifact contract",
          code: "AUDIT_ARTIFACT_CONTRACT_CREATE_FAILED",
        },
        500,
      );
    }
  }

  // Persist attachments to project files and update the task with path-based metadata
  if (body.attachments.length > 0) {
    if (project) {
      let persisted;
      try {
        persisted = await persistAttachments(body.attachments, {
          projectRoot: project.rootPath,
          taskId: created.id,
        });
      } catch (error) {
        if (error instanceof AttachmentValidationError) {
          deleteTask(created.id, { allowAttachedChild: true });
          return c.json({ error: error.message }, 400);
        }
        throw error;
      }
      updateTask(created.id, { attachments: persisted });
    }
  }

  const final = findTaskById(created.id) ?? created;
  if (hasTaskRuntimeOverrideInput(body)) {
    appendTaskRuntimeOverrideAudit({
      before: summarizeTaskRuntimeOverride({
        runtimeProfileId: null,
        modelOverride: null,
        runtimeOptions: null,
      }),
      task: final,
    });
  }
  log.debug(
    {
      taskId: final.id,
      title: body.title,
      roadmapAlias: body.roadmapAlias,
      tagCount: body.tags?.length,
      attachmentCount: body.attachments.length,
    },
    "Task created",
  );

  broadcast({ type: "task:created", payload: toTaskBroadcastPayload(final) });
  broadcast({
    type: "project:queue_updated",
    payload: { projectId: final.projectId, taskId: final.id },
  });
  // Wake coordinator when a new task is created (may need immediate processing)
  broadcast({ type: "agent:wake", payload: { id: final.id } });
  return c.json(toTaskRouteResponse(final), 201);
});

// GET /tasks/:id — full detail
function requirementQuestionRouteError(error: unknown): {
  status: ContentfulStatusCode;
  body: { error: string };
} {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Task not found") || message.includes("Question not found")) {
    return { status: 404, body: { error: message } };
  }
  if (
    message.includes("cannot be answered") ||
    message.includes("Duplicate") ||
    message.includes("Invalid answer") ||
    message.includes("Answer") ||
    message.includes("Question")
  ) {
    return { status: 400, body: { error: message } };
  }
  return { status: 500, body: { error: message } };
}

tasksRouter.get("/:id/questions", (c) => {
  const { id } = c.req.param();
  const response = getTaskRequirementQuestionsResponse(id);
  if (!response) return c.json({ error: "Task not found" }, 404);
  return c.json(response);
});

tasksRouter.get("/:id/requirements/snapshot", (c) => {
  const { id } = c.req.param();
  const response = getTaskRequirementsSnapshotResponse(id);
  if (!response) return c.json({ error: "Task not found" }, 404);
  return c.json(response);
});

tasksRouter.post("/:id/questions", jsonValidator(createRequirementQuestionSchema), (c) => {
  const { id } = c.req.param();
  const body = c.req.valid("json");
  if (!getEnv().AIF_REQUIREMENTS_INTAKE_ENABLED) {
    return c.json({ error: "Requirements intake is disabled" }, 409);
  }
  try {
    const result = createTaskRequirementQuestion({
      taskId: id,
      question: body,
      reason: `${body.stage} questions required`,
    });
    if (result.batchId) {
      broadcast({
        type: "task:questions_created",
        payload: {
          taskId: id,
          projectId: result.task?.projectId,
          batchId: result.batchId,
          stage: body.stage,
          targetResumeStage: result.response?.batches.find(
            (batch) => batch.batchId === result.batchId,
          )?.targetResumeStage,
          openBlockingCount: result.response?.openBlockingCount ?? 0,
        },
      });
      if (result.task?.status === "needs_input") {
        broadcast({
          type: "task:needs_input",
          payload: {
            taskId: id,
            projectId: result.task.projectId,
            batchId: result.batchId,
            stage: body.stage,
            targetResumeStage: result.response?.batches.find(
              (batch) => batch.batchId === result.batchId,
            )?.targetResumeStage,
            openBlockingCount: result.response?.openBlockingCount ?? 0,
          },
        });
        broadcast({ type: "task:moved", payload: toTaskBroadcastPayload(result.task) });
      }
    }
    return c.json(result.response, 201);
  } catch (error) {
    const routeError = requirementQuestionRouteError(error);
    return c.json(routeError.body, routeError.status);
  }
});

tasksRouter.post(
  "/:id/questions/:questionId/answer",
  jsonValidator(answerRequirementQuestionSchema),
  (c) => {
    const { id, questionId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const question = answerTaskRequirementQuestion({
        taskId: id,
        questionId,
        answer: body.answer,
        attachments: body.attachments,
      });
      broadcast({
        type: "task:question_answered",
        payload: {
          taskId: id,
          projectId: question.projectId,
          batchId: question.batchId,
          questionId,
          stage: question.stage,
          targetResumeStage: question.targetResumeStage,
        },
      });
      return c.json(question);
    } catch (error) {
      const routeError = requirementQuestionRouteError(error);
      return c.json(routeError.body, routeError.status);
    }
  },
);

tasksRouter.post(
  "/:id/question-batches/:batchId/answers",
  jsonValidator(answerRequirementQuestionBatchSchema),
  (c) => {
    const { id, batchId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const result = answerTaskRequirementQuestionBatch({
        taskId: id,
        batchId,
        answers: body.answers,
        autoResume: body.autoResume,
      });
      const projectId = result.task?.projectId;
      const answeredBatch = result.response?.batches.find((batch) => batch.batchId === batchId);
      broadcast({
        type: "task:question_batch_answered",
        payload: {
          taskId: id,
          projectId,
          batchId,
          stage: answeredBatch?.stage,
          targetResumeStage: answeredBatch?.targetResumeStage,
          openBlockingCount: result.response?.openBlockingCount ?? 0,
          resumed: result.resumed,
          resumeStatus: result.resumeStatus,
        },
      });
      if (result.task) {
        broadcast({
          type: result.resumed ? "task:moved" : "task:updated",
          payload: toTaskBroadcastPayload(result.task),
        });
      }
      if (result.resumed) {
        broadcast({ type: "agent:wake", payload: { id } });
      }
      return c.json({
        ...result,
        task: result.task ? toTaskRouteResponse(result.task) : undefined,
      });
    } catch (error) {
      const routeError = requirementQuestionRouteError(error);
      return c.json(routeError.body, routeError.status);
    }
  },
);

tasksRouter.post("/:id/requirements/reanalyze", (c) => {
  const { id } = c.req.param();
  if (!getEnv().AIF_REQUIREMENTS_INTAKE_ENABLED) {
    return c.json({ error: "Requirements intake is disabled" }, 409);
  }
  const task = findTaskById(id);
  if (!task) return c.json({ error: "Task not found" }, 404);
  const nowIso = new Date().toISOString();
  const transition = applyHumanTaskEvent(task, "request_requirements_reanalysis", {
    requirementsIntakeEnabled: true,
  });
  if (!transition.ok) {
    return c.json({ error: transition.error }, 409);
  }
  const updated = updateTask(id, {
    ...transition.patch,
    needsInputBatchId: null,
    needsInputStage: null,
    needsInputReason: null,
    lastHeartbeatAt: nowIso,
  } as TaskFieldsUpdate);
  if (!updated) return c.json({ error: "Task not found" }, 404);
  appendTaskActivityLog(id, `[${nowIso}] Requirements reanalysis requested`);
  broadcast({ type: "task:moved", payload: toTaskBroadcastPayload(updated) });
  broadcast({ type: "agent:wake", payload: { id } });
  return c.json(toTaskRouteResponse(updated));
});

tasksRouter.get("/:id", (c) => {
  const { id } = c.req.param();
  const task = findTaskById(id);
  if (!task) {
    log.debug({ taskId: id }, "Task not found");
    return c.json({ error: "Task not found" }, 404);
  }

  log.debug({ taskId: id }, "Task fetched");
  return c.json(toTaskRouteResponse(task));
});

// GET /tasks/:id/attachments/:filename — download a task attachment
tasksRouter.get("/:id/attachments/:filename", async (c) => {
  const { id, filename } = c.req.param();
  const task = findTaskById(id);
  if (!task) return c.json({ error: "Task not found" }, 404);

  const project = findProjectById(task.projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const attachments = parseAttachments(task.attachments);
  const attachment = attachments.find((a) => a.name === decodeURIComponent(filename));
  if (!attachment?.path) return c.json({ error: "Attachment not found" }, 404);

  try {
    const buffer = await readAttachment(project.rootPath, attachment.path);
    c.header("Content-Type", attachment.mimeType || "application/octet-stream");
    c.header("Content-Disposition", `attachment; filename="${attachment.name}"`);
    c.header("Content-Length", String(buffer.length));
    return new Response(new Uint8Array(buffer), { headers: c.res.headers });
  } catch {
    return c.json({ error: "Attachment file not found on disk" }, 404);
  }
});

// GET /tasks/:id/plan-file-status — check if canonical physical plan file already exists
tasksRouter.get("/:id/plan-file-status", (c) => {
  const { id } = c.req.param();
  const status = getTaskPlanFileStatus(id);
  if (!status) {
    return c.json({ error: "Task or project not found" }, 404);
  }

  return c.json(status);
});

// GET /tasks/:id/comments — list comments
tasksRouter.get("/:id/comments", (c) => {
  const { id } = c.req.param();
  const task = findTaskById(id);
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  const comments = listComments(id);
  return c.json(comments.map(toCommentResponse));
});

// GET /tasks/:id/comments/:commentId/attachments/:filename — download a comment attachment
tasksRouter.get("/:id/comments/:commentId/attachments/:filename", async (c) => {
  const { id, commentId, filename } = c.req.param();
  const task = findTaskById(id);
  if (!task) return c.json({ error: "Task not found" }, 404);

  const project = findProjectById(task.projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const comments = listComments(id);
  const comment = comments.find((cm) => cm.id === commentId);
  if (!comment) return c.json({ error: "Comment not found" }, 404);

  const attachments = parseAttachments(comment.attachments);
  const attachment = attachments.find((a) => a.name === decodeURIComponent(filename));
  if (!attachment?.path) return c.json({ error: "Attachment not found" }, 404);

  try {
    const buffer = await readAttachment(project.rootPath, attachment.path);
    c.header("Content-Type", attachment.mimeType || "application/octet-stream");
    c.header("Content-Disposition", `attachment; filename="${attachment.name}"`);
    c.header("Content-Length", String(buffer.length));
    return new Response(new Uint8Array(buffer), { headers: c.res.headers });
  } catch {
    return c.json({ error: "Attachment file not found on disk" }, 404);
  }
});

// POST /tasks/:id/comments — create a human comment
tasksRouter.post("/:id/comments", jsonValidator(createTaskCommentSchema), async (c) => {
  const { id } = c.req.param();
  const body = c.req.valid("json");
  const task = findTaskById(id);
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }
  if (body.attachments.some((attachment: { path?: string }) => attachment.path)) {
    return c.json(
      { error: "New comment attachments must be uploaded as content, not storage paths" },
      400,
    );
  }

  // Create comment first to get its DB-assigned ID
  const created = createComment({
    taskId: id,
    message: body.message,
    attachments: [],
  });
  if (!created) return c.json({ error: "Failed to create comment" }, 500);

  // Persist attachments to project files using the real comment ID, then update
  if (body.attachments.length > 0) {
    const project = findProjectById(task.projectId);
    if (project) {
      let persisted;
      try {
        persisted = await persistAttachments(body.attachments, {
          projectRoot: project.rootPath,
          taskId: id,
          commentId: created.id,
        });
      } catch (error) {
        deleteComment(created.id);
        if (error instanceof AttachmentValidationError) {
          return c.json({ error: error.message }, 400);
        }
        throw error;
      }
      const updated = updateComment(created.id, { attachments: persisted });
      const comment = updated ?? created;
      broadcast({
        type: "task:comment_created",
        payload: { id: comment.id, taskId: id, projectId: task.projectId },
      });
      return c.json(toCommentResponse(comment), 201);
    }
  }

  broadcast({
    type: "task:comment_created",
    payload: { id: created.id, taskId: id, projectId: task.projectId },
  });
  return c.json(toCommentResponse(created), 201);
});

// PUT /tasks/:id — update fields
tasksRouter.put("/:id", jsonValidator(updateTaskSchema), async (c) => {
  const { id } = c.req.param();
  const body = c.req.valid("json");
  const existing = findTaskById(id);
  if (!existing) {
    return c.json({ error: "Task not found" }, 404);
  }

  const runtimeValidation = validateProjectScopedRuntimeProfileSelections({
    projectId: existing.projectId,
    selections: { runtimeProfileId: body.runtimeProfileId },
  });
  if (runtimeValidation) {
    log.warn(
      { taskId: id, projectId: existing.projectId, fieldErrors: runtimeValidation.fieldErrors },
      "Rejected invalid task runtime selection",
    );
    return c.json(runtimeValidation, 400);
  }
  const secretLikeRuntimeOptionKeys = taskRuntimeOptionsSecretLikeKeys(body.runtimeOptions ?? {});
  if (secretLikeRuntimeOptionKeys.length > 0) {
    return c.json(
      {
        error: "Secret-like runtime option keys are not allowed in task overrides",
        reasonCodes: ["TASK_RUNTIME_SECRET_LIKE_OPTION_KEY"],
        fieldErrors: {
          runtimeOptions: secretLikeRuntimeOptionKeys.map((key) => `Disallowed option key: ${key}`),
        },
      },
      400,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(body, "agentActivityLog") &&
    !getEnv().AIF_AGENT_ACTIVITY_LOG_API_EDITS_ENABLED
  ) {
    return c.json(
      {
        error:
          "agentActivityLog is append-only in production mode; use server activity logging instead",
        code: "AGENT_ACTIVITY_LOG_IMMUTABLE",
      },
      409,
    );
  }

  // Parallel-enabled projects enforce full mode
  const project = findProjectById(existing.projectId);
  if (project?.parallelEnabled) {
    if (body.plannerMode === "fast") {
      return c.json({ error: "Parallel-enabled projects require full planner mode" }, 400);
    }
  }

  let resultingTaskIntent = existing.taskIntent;
  if (body.taskIntent !== undefined) {
    resultingTaskIntent = normalizeTaskIntent(body.taskIntent, existing.taskIntent);
  }
  if (body.isFix === true) {
    resultingTaskIntent = "fix";
  } else if (
    body.isFix === false &&
    body.taskIntent === undefined &&
    existing.taskIntent === "fix"
  ) {
    resultingTaskIntent = "general";
  }

  let directAuditUpdateContract: {
    reportArtifactPath: string;
    roadmapAlias: string | null | undefined;
  } | null = null;
  const existingAuditArtifact =
    resultingTaskIntent === "audit" ? findRoadmapBatchArtifactByTaskId(id) : undefined;
  const shouldValidateDirectAuditUpdate =
    resultingTaskIntent === "audit" &&
    existing.hierarchyRole !== "container" &&
    existingAuditArtifact?.role !== "synthesis" &&
    (hasDirectAuditContractInput(body) || !existingAuditArtifact);
  if (shouldValidateDirectAuditUpdate) {
    const effectiveRoadmapAlias = Object.prototype.hasOwnProperty.call(body, "roadmapAlias")
      ? body.roadmapAlias
      : existing.roadmapAlias;
    const directAuditValidation = validateDirectAuditTaskContract({
      title: body.title ?? existing.title,
      description: body.description ?? existing.description,
      roadmapAlias: effectiveRoadmapAlias,
      tags: body.tags ?? existing.tags,
    });
    if (!directAuditValidation.ok) {
      return c.json(directAuditValidation.body, directAuditValidation.status);
    }
    if (existingAuditArtifact) {
      if (
        existingAuditArtifact.role !== "report" ||
        existingAuditArtifact.artifactPath !== directAuditValidation.reportArtifactPath
      ) {
        return c.json(
          {
            error: "Existing audit artifact contract does not match the requested report artifact.",
            code: "AUDIT_ARTIFACT_CONTRACT_CONFLICT",
          },
          409,
        );
      }
    } else {
      directAuditUpdateContract = {
        reportArtifactPath: directAuditValidation.reportArtifactPath,
        roadmapAlias: effectiveRoadmapAlias,
      };
    }
  }

  const { plan, attachments: incomingAttachments, ...updatePayload } = body;

  // Mirror POST /tasks: when plannerMode changes, fill omitted flags from mode defaults.
  if (updatePayload.plannerMode !== undefined) {
    const modeDefaults = defaultsForMode(updatePayload.plannerMode);
    const filled = {
      skipReview: updatePayload.skipReview === undefined,
      planDocs: updatePayload.planDocs === undefined,
      planTests: updatePayload.planTests === undefined,
    };
    updatePayload.skipReview = updatePayload.skipReview ?? modeDefaults.skipReview;
    updatePayload.planDocs = updatePayload.planDocs ?? modeDefaults.planDocs;
    updatePayload.planTests = updatePayload.planTests ?? modeDefaults.planTests;
    if (filled.skipReview || filled.planDocs || filled.planTests) {
      log.debug(
        { taskId: id, plannerMode: updatePayload.plannerMode, filled },
        "Applied mode-driven task flag defaults on update",
      );
    }
  }

  const hasPlanUpdate = Object.prototype.hasOwnProperty.call(body, "plan");
  if (hasPlanUpdate) {
    try {
      updateTaskPlan(id, plan ?? null, existing.isFix, existing.planPath);
    } catch {
      return c.json({ error: "Project not found for task" }, 404);
    }
  }

  let oldAttachmentsForCleanup: ReturnType<typeof parseAttachments> | null = null;
  let projectRootForCleanup: string | null = null;
  let attachmentsCreatedForFailureCleanup: Awaited<ReturnType<typeof persistAttachments>> = [];

  // Persist new attachments first; clean up replaced files only after the DB update succeeds.
  if (incomingAttachments !== undefined) {
    const project = findProjectById(existing.projectId);
    if (project) {
      const oldAttachments = parseAttachments(existing.attachments);
      try {
        const persistedAttachments = await persistAttachments(incomingAttachments, {
          projectRoot: project.rootPath,
          taskId: id,
        });
        attachmentsCreatedForFailureCleanup = attachmentsCreatedFromIncoming(
          persistedAttachments,
          incomingAttachments,
        );
        (updatePayload as Record<string, unknown>).attachments = persistedAttachments;
      } catch (error) {
        if (error instanceof AttachmentValidationError) {
          return c.json({ error: error.message }, 400);
        }
        throw error;
      }
      oldAttachmentsForCleanup = oldAttachments;
      projectRootForCleanup = project.rootPath;
    }
  }

  const beforeRuntimeOverride = summarizeTaskRuntimeOverride({
    runtimeProfileId: existing.runtimeProfileId,
    modelOverride: existing.modelOverride,
    runtimeOptions: parseRuntimeOptionsForAudit(existing.runtimeOptionsJson),
  });
  let updated: ReturnType<typeof updateTask>;
  try {
    updated = updateTask(id, updatePayload);
  } catch (error) {
    const hierarchyError = taskHierarchyContractError(error);
    if (hierarchyError) {
      if (attachmentsCreatedForFailureCleanup.length > 0 && projectRootForCleanup) {
        cleanupReplacedAttachments(projectRootForCleanup, attachmentsCreatedForFailureCleanup, []);
      }
      return c.json(
        { error: hierarchyError.error, code: hierarchyError.code },
        hierarchyError.status,
      );
    }
    throw error;
  }
  if (!updated) return c.json({ error: "Task not found after update" }, 500);
  if (directAuditUpdateContract) {
    try {
      createRoadmapBatchContract({
        projectId: existing.projectId,
        roadmapAlias: directAuditRoadmapAlias(id, directAuditUpdateContract.roadmapAlias),
        taskIntent: "audit",
        executionPolicy: resolveDirectAuditExecutionPolicy(project?.rootPath),
        createdTaskIds: [id],
        artifacts: [
          {
            taskId: id,
            role: "report",
            artifactPath: directAuditUpdateContract.reportArtifactPath,
            projectRoot: project?.rootPath ?? null,
          },
        ],
      });
      updated = findTaskById(id) ?? updated;
    } catch (error) {
      log.error(
        {
          taskId: id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to create direct audit report artifact contract during task update",
      );
      try {
        updateTask(id, taskUpdateRollbackFields(existing));
        if (attachmentsCreatedForFailureCleanup.length > 0 && projectRootForCleanup) {
          cleanupReplacedAttachments(
            projectRootForCleanup,
            attachmentsCreatedForFailureCleanup,
            [],
          );
        }
        if (hasPlanUpdate) {
          updateTaskPlan(id, existing.plan ?? null, existing.isFix, existing.planPath);
        }
      } catch (rollbackError) {
        log.error(
          {
            taskId: id,
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          },
          "Failed to roll back direct audit task update after artifact contract creation failure",
        );
      }
      return c.json(
        {
          error: "Failed to create direct audit report artifact contract",
          code: "AUDIT_ARTIFACT_CONTRACT_CREATE_FAILED",
        },
        500,
      );
    }
  }
  if (hasTaskRuntimeOverrideInput(body)) {
    appendTaskRuntimeOverrideAudit({ before: beforeRuntimeOverride, task: updated });
  }
  if (oldAttachmentsForCleanup && projectRootForCleanup) {
    cleanupReplacedAttachments(
      projectRootForCleanup,
      oldAttachmentsForCleanup,
      incomingAttachments ?? [],
    );
  }
  log.debug({ taskId: id, fields: Object.keys(body) }, "Task updated");

  broadcast({ type: "task:updated", payload: toTaskBroadcastPayload(updated) });
  broadcastTaskOperatorEvents(updated, ["task:timeline_updated", "task:trust_updated"]);
  return c.json(toTaskRouteResponse(updated));
});

// POST /tasks/:id/sync-plan — sync DB plan with physical plan file
tasksRouter.post("/:id/sync-plan", (c) => {
  const { id } = c.req.param();
  const result = syncTaskPlanFromFile(id);
  if (!result) {
    return c.json({ error: "Task or project not found" }, 404);
  }
  if (!result.synced) {
    return c.json({ error: "Plan file not found" }, 404);
  }

  const updated = updateTask(id, {});
  if (!updated) return c.json({ error: "Task not found after sync" }, 500);
  log.debug({ taskId: id }, "Task plan synced from physical file");

  broadcast({ type: "task:updated", payload: toTaskBroadcastPayload(updated) });
  return c.json(toTaskRouteResponse(updated));
});

// DELETE /tasks/:id
tasksRouter.delete("/:id", (c) => {
  const { id } = c.req.param();
  const existing = findTaskById(id);
  if (!existing) {
    return c.json({ error: "Task not found" }, 404);
  }

  try {
    deleteTask(id);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
  }
  log.debug({ taskId: id }, "Task deleted");

  broadcast({ type: "task:deleted", payload: { id } });
  broadcast({
    type: "project:queue_updated",
    payload: { projectId: existing.projectId, taskId: id },
  });
  return c.json({ success: true });
});

// POST /tasks/:id/manual-exception - explicit alias for the state-machine event.
tasksRouter.post("/:id/manual-exception", jsonValidator(manualExceptionSchema), async (c) => {
  const { id } = c.req.param();
  const { justification } = c.req.valid("json");
  const existing = findTaskById(id);
  if (!existing) return c.json({ error: "Task not found" }, 404);
  try {
    const handled = await handleTaskEvent({
      taskId: id,
      event: "manual_exception",
      manualExceptionJustification: justification,
    });
    if (!handled.ok) {
      return c.json({ error: handled.error }, handled.status as ContentfulStatusCode);
    }
    broadcast({ type: handled.broadcastType, payload: toTaskBroadcastPayload(handled.task) });
    broadcastTaskOperatorEvents(handled.task, [
      "task:timeline_updated",
      "task:trust_updated",
      "task:manual_handoff_required",
    ]);
    return c.json(toTaskRouteResponse(handled.task));
  } catch (error) {
    log.error({ taskId: id, error }, "Manual exception handling failed");
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /tasks/:id/events — apply a human action through state machine
// POST /tasks/:id/operator-verified-completion - close committed, operator-verified work.
tasksRouter.post(
  "/:id/operator-verified-completion",
  jsonValidator(operatorVerifiedCompletionSchema),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    const existing = findTaskById(id);
    if (!existing) return c.json({ error: "Task not found" }, 404);
    try {
      const handled = handleOperatorVerifiedCompletion({ taskId: id, ...body });
      if (!handled.ok) {
        return c.json({ error: handled.error }, handled.status as ContentfulStatusCode);
      }
      log.debug(
        {
          taskId: id,
          from: existing.status,
          to: handled.task.status,
          idempotent: handled.idempotent,
        },
        "Operator verified completion applied",
      );
      if (!handled.idempotent) {
        broadcast({ type: "task:moved", payload: toTaskBroadcastPayload(handled.task) });
        broadcastTaskOperatorEvents(handled.task, ["task:timeline_updated", "task:trust_updated"]);
      }
      return c.json(toTaskRouteResponse(handled.task));
    } catch (error) {
      log.error(
        {
          taskId: id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Operator verified completion failed",
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

tasksRouter.post("/:id/events", jsonValidator(taskEventSchema), async (c) => {
  const { id } = c.req.param();
  const { event, deletePlanFile, commitOnApprove, manualExceptionJustification } =
    c.req.valid("json");
  const existing = findTaskById(id);
  if (!existing) {
    return c.json({ error: "Task not found" }, 404);
  }
  try {
    if (event === "approve_done" && commitOnApprove && existing.status === "done") {
      const blocker = runtimeStartConfigGovernanceBlocker(existing);
      if (blocker) {
        appendTaskActivityLog(
          existing.id,
          `[config-governance] Blocked approve_done commit; reasonCodes=${blocker.reasonCodes.join(",")}`,
        );
        return c.json({ error: blocker.error, reasonCodes: blocker.reasonCodes }, 409);
      }
    }

    const handled = await handleTaskEvent({
      taskId: id,
      event,
      deletePlanFile,
      manualExceptionJustification,
    });
    if (!handled.ok) {
      return c.json({ error: handled.error }, handled.status as ContentfulStatusCode);
    }

    log.debug(
      { taskId: id, from: existing.status, to: handled.task.status, event },
      "Task state transition applied",
    );
    broadcast({
      type: handled.broadcastType,
      payload: toTaskBroadcastPayload(handled.task),
    });
    broadcastTaskOperatorEvents(handled.task, [
      "task:timeline_updated",
      "task:trust_updated",
      ...(event === "manual_exception" || isManualHandoffTask(handled.task)
        ? ["task:manual_handoff_required"]
        : []),
    ]);
    // Wake coordinator when task transitions may require agent processing
    if (handled.broadcastType === "task:moved") {
      broadcast({ type: "agent:wake", payload: { id: handled.task.id } });
    }

    if (event === "approve_done" && handled.task.status === "verified") {
      try {
        const memoryItem = createMemoryCandidateForVerifiedTask(handled.task.id);
        if (memoryItem) {
          broadcast({
            type: "memory:item_updated",
            payload: {
              id: memoryItem.id,
              projectId: memoryItem.projectId,
              status: memoryItem.status,
            },
          });
          broadcast({
            type: "project:memory_candidate_created",
            payload: {
              id: memoryItem.id,
              projectId: memoryItem.projectId,
              taskId: memoryItem.sourceTaskId,
              status: memoryItem.status,
            },
          });
        }
      } catch (memoryError) {
        log.warn(
          { taskId: handled.task.id, memoryError },
          "Verified task memory candidate extraction failed",
        );
      }
    }

    // Fire-and-forget: run /aif-commit when approved with commit checkbox.
    // Broadcast lifecycle over WS so the UI can show a spinner/toast and the
    // approve modal does not close without feedback.
    if (event === "approve_done" && commitOnApprove && handled.task.status === "verified") {
      const taskId = handled.task.id;
      const projectId = handled.task.projectId;
      log.info({ taskId, projectId }, "Approve-done commit flow started");
      broadcast({
        type: "task:commit_started",
        payload: { taskId, projectId, status: "started" },
      });
      void (async () => {
        const { runCommitQuery } = await import("../services/commitGeneration.js");
        const result = await runCommitQuery({ projectId, taskId });
        if (result.ok) {
          log.info({ taskId, projectId }, "Approve-done commit flow succeeded");
          broadcast({
            type: "task:commit_done",
            payload: { taskId, projectId, status: "done" },
          });
        } else {
          log.error({ taskId, projectId, error: result.error }, "Approve-done commit flow failed");
          broadcast({
            type: "task:commit_failed",
            payload: { taskId, projectId, status: "failed", error: result.error },
          });
        }
      })();
    }

    return c.json(toTaskRouteResponse(handled.task));
  } catch (error) {
    log.error(
      {
        taskId: id,
        event,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Task event handling failed",
    );
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PATCH /tasks/:id/position — reorder within column
tasksRouter.patch("/:id/position", jsonValidator(reorderTaskSchema), async (c) => {
  const { id } = c.req.param();
  const { position } = c.req.valid("json");
  const existing = findTaskById(id);
  if (!existing) {
    return c.json({ error: "Task not found" }, 404);
  }

  updateTaskPositionOnly(id, position);
  const updated = findTaskById(id);
  if (!updated) return c.json({ error: "Task not found after reorder" }, 500);
  log.debug({ taskId: id, position }, "Task reordered");

  broadcast({ type: "task:updated", payload: toTaskBroadcastPayload(updated) });
  broadcast({
    type: "project:queue_updated",
    payload: { projectId: updated.projectId, taskId: id },
  });
  return c.json(toTaskRouteResponse(updated));
});
