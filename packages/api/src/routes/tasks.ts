import { Hono } from "hono";
import { jsonValidator } from "../middleware/zodValidator.js";
import { internalBroadcastAuth } from "../middleware/internalBroadcastAuth.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  logger,
  parseAttachments,
  getProjectConfig,
  defaultsForMode,
  normalizeTaskIntent,
  resolveTaskIntentDefaults,
  getEnv,
  classifyAuditDecompositionRequest,
  findSecretLikeKeys,
  summarizeTaskRuntimeOverride,
} from "@aif/shared";
import {
  createTaskSchema,
  updateTaskSchema,
  taskEventSchema,
  createTaskCommentSchema,
  reorderTaskSchema,
  broadcastTaskSchema,
  manualExceptionSchema,
  operatorLimitQuerySchema,
  worktreeCleanupSchema,
} from "../schemas.js";
import { broadcast } from "../ws.js";
import { handleTaskEvent } from "../services/taskEvents.js";
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
  createMemoryCandidateForVerifiedTask,
  getAppDefaultRuntimeProfileId,
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

function taskRuntimeOptionsSecretLikeKeys(
  runtimeOptions: Record<string, unknown> | null | undefined,
) {
  return findSecretLikeKeys(runtimeOptions ?? {});
}

function hasTaskRuntimeOverrideInput(input: object): boolean {
  return (
    Object.prototype.hasOwnProperty.call(input, "runtimeProfileId") ||
    Object.prototype.hasOwnProperty.call(input, "modelOverride") ||
    Object.prototype.hasOwnProperty.call(input, "runtimeOptions")
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

    if (TASK_OPERATOR_BROADCAST_TYPES.has(type)) {
      broadcast({ type, payload: taskOperatorPayload(task, type) });
    } else {
      broadcast({ type, payload: toTaskBroadcastPayload(task) });
      if (type === "task:updated" || type === "task:moved") {
        broadcastTaskOperatorEvents(task, [
          "task:timeline_updated",
          "task:trust_updated",
          ...(task.manualReviewRequired || task.status === "blocked_external"
            ? ["task:manual_handoff_required"]
            : []),
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

  if (taskIntent === "audit") {
    const auditDecomposition = classifyAuditDecompositionRequest({
      title: body.title,
      description: [
        body.description,
        body.roadmapAlias ? `Roadmap alias: ${body.roadmapAlias}` : "",
        body.tags.length > 0 ? `Tags: ${body.tags.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (auditDecomposition.requiresDecomposition) {
      return c.json(
        {
          error: "Broad audit requests must be decomposed into an audit roadmap before execution.",
          code: "AUDIT_DECOMPOSITION_REQUIRED",
          decomposition: auditDecomposition,
        },
        400,
      );
    }
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
  const created = createTask({
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
  });
  if (!created) return c.json({ error: "Failed to create task" }, 500);

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
          deleteTask(created.id);
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

  // Parallel-enabled projects enforce full mode
  const project = findProjectById(existing.projectId);
  if (project?.parallelEnabled) {
    if (body.plannerMode === "fast") {
      return c.json({ error: "Parallel-enabled projects require full planner mode" }, 400);
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

  // Persist new attachments first; clean up replaced files only after the DB update succeeds.
  if (incomingAttachments !== undefined) {
    const project = findProjectById(existing.projectId);
    if (project) {
      const oldAttachments = parseAttachments(existing.attachments);
      try {
        (updatePayload as Record<string, unknown>).attachments = await persistAttachments(
          incomingAttachments,
          { projectRoot: project.rootPath, taskId: id },
        );
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
  const updated = updateTask(id, updatePayload);
  if (!updated) return c.json({ error: "Task not found after update" }, 500);
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

  deleteTask(id);
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
      ...(event === "manual_exception" ||
      handled.task.manualReviewRequired ||
      handled.task.status === "blocked_external"
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
    log.error({ taskId: id, event, error }, "Task event handling failed");
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
