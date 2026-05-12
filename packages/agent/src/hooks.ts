import {
  appendAuditEvidenceEvent,
  appendTaskActivityLog,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
} from "@aif/data";
import {
  AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE,
  buildAuditEvidencePayload,
  buildAuditEvidenceUnit,
  deriveAuditSourceSnapshotId,
  extractAuditRiskHypothesisIds,
  extractAuditScopeIdsFromText,
  logger,
  findMonorepoRootFromUrl,
  getEnv,
  readAuditEvidenceRuntimePayload,
  resolveAuditPlanId,
  type AuditEvidenceKind,
  type AuditEvidenceRuntimePayload,
  type AuditEvidenceUnit,
} from "@aif/shared";
import { notifyTaskBroadcast } from "./notifier.js";

const log = logger("agent-hooks");

const PROJECT_ROOT = findMonorepoRootFromUrl(import.meta.url);

/**
 * Returns the monorepo root so agents work with the correct cwd.
 */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}

/** Log categories for activity entries. */
export type ActivityCategory = "Tool" | "Agent" | "Subagent";

/**
 * Runtime-neutral callback signature for hook-style events.
 * Keeps @aif/agent decoupled from SDK-specific type imports.
 */
export type RuntimeHookCallback = (
  input: unknown,
  toolUseId: string | undefined,
  options: unknown,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

// ---------------------------------------------------------------------------
// Batched activity-log queue
// ---------------------------------------------------------------------------

interface QueueEntry {
  timestamp: string;
  category: ActivityCategory;
  detail: string;
}

/** Per-task in-memory queue for batch mode. */
const taskQueues = new Map<string, QueueEntry[]>();

/** Per-task flush timer handles. */
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Append new log lines to a task's agentActivityLog in the database and broadcast to UI. */
function appendActivityLogToDb(taskId: string, newLines: string): void {
  appendTaskActivityLog(taskId, newLines);
  void notifyTaskBroadcast(taskId, "task:activity");
}

/**
 * Flush buffered activity entries for a single task to the database.
 * Safe to call even when the queue is empty (no-op).
 */
export function flushActivityQueue(taskId: string): void {
  const queue = taskQueues.get(taskId);
  if (!queue || queue.length === 0) {
    log.debug({ taskId, entries: 0 }, "Flush skipped — queue empty");
    return;
  }

  const entries = queue.splice(0);
  log.debug({ taskId, entries: entries.length, trigger: "flush" }, "Flushing activity queue");

  try {
    const newLines = entries.map((e) => `[${e.timestamp}] ${e.category}: ${e.detail}`).join("\n");
    appendActivityLogToDb(taskId, newLines);
    log.info({ taskId, entries: entries.length, mode: "batch" }, "Activity queue flushed");
  } catch (err) {
    log.error({ err, taskId, lostEntries: entries.length }, "Failed to flush activity queue");
  }
}

/**
 * Flush all task queues. Used during shutdown or stage boundaries.
 */
export function flushAllActivityQueues(): void {
  const taskIds = [...taskQueues.keys()];
  log.debug({ tasks: taskIds.length }, "Flushing all activity queues");
  for (const taskId of taskIds) {
    flushActivityQueue(taskId);
  }
}

/**
 * Clean up flush timers and queues for a given task.
 * Call after a task finishes its stage or the process exits.
 */
export function disposeActivityQueue(taskId: string): void {
  const timer = flushTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(taskId);
  }
  flushActivityQueue(taskId);
  taskQueues.delete(taskId);
  log.debug({ taskId }, "Activity queue disposed");
}

/** Reset max-age timer for a task (batch mode). */
function resetFlushTimer(taskId: string, maxAgeMs: number): void {
  const existing = flushTimers.get(taskId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    log.debug({ taskId, trigger: "max_age" }, "Max-age flush timer fired");
    flushActivityQueue(taskId);
    flushTimers.delete(taskId);
  }, maxAgeMs);

  // Prevent timer from keeping the process alive
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  flushTimers.set(taskId, timer);
}

/**
 * Append a structured activity entry to the task's agentActivityLog.
 * Format: `[timestamp] Category: detail`
 *
 * In `sync` mode (default): writes immediately to the database.
 * In `batch` mode: buffers in memory and flushes when batch size, max age,
 * or manual flush triggers are met.
 */
export function logActivity(taskId: string, category: ActivityCategory, detail: string): void {
  const env = getEnv();
  const timestamp = new Date().toISOString();

  log.debug({ taskId, category, detail, mode: env.ACTIVITY_LOG_MODE }, "Activity logged");

  if (env.ACTIVITY_LOG_MODE === "sync") {
    const entry = `[${timestamp}] ${category}: ${detail}`;
    try {
      appendActivityLogToDb(taskId, entry);
    } catch (err) {
      log.error({ err, taskId }, "Failed to update agent activity log");
    }
    return;
  }

  // --- Batch mode ---
  let queue = taskQueues.get(taskId);
  if (!queue) {
    queue = [];
    taskQueues.set(taskId, queue);
  }

  // Enforce queue limit — drop oldest when full
  if (queue.length >= env.ACTIVITY_LOG_QUEUE_LIMIT) {
    const dropped = queue.shift();
    log.warn(
      { taskId, queueLimit: env.ACTIVITY_LOG_QUEUE_LIMIT, droppedTimestamp: dropped?.timestamp },
      "Activity queue limit reached — dropping oldest entry",
    );
  }

  queue.push({ timestamp, category, detail });
  log.debug({ taskId, queueSize: queue.length }, "Activity entry enqueued");

  // Flush if batch size reached
  if (queue.length >= env.ACTIVITY_LOG_BATCH_SIZE) {
    log.debug({ taskId, trigger: "batch_size" }, "Batch size flush triggered");
    flushActivityQueue(taskId);
    // Reset the max-age timer since we just flushed
    resetFlushTimer(taskId, env.ACTIVITY_LOG_BATCH_MAX_AGE_MS);
    return;
  }

  // (Re)start max-age timer
  resetFlushTimer(taskId, env.ACTIVITY_LOG_BATCH_MAX_AGE_MS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Sanitize a multiline string for single-line display in activity logs.
 * Truncates to the first meaningful line if it contains newlines,
 * replacing the rest with a continuation marker.
 */
export function sanitizeForActivityLog(raw: string, maxLen = 200): string {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  const first = lines[0].slice(0, maxLen);
  if (lines.length === 1) return first;
  return `${first} [+${lines.length - 1} lines]`;
}

/** Extract a concise detail from tool_input based on tool name. */
function summarizeToolInput(
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
): string {
  if (!toolInput) return "";

  switch (toolName) {
    case "Bash": {
      const cmd = sanitizeForActivityLog(String(toolInput.command ?? ""));
      return cmd ? ` \`${cmd}\`` : "";
    }
    case "Read":
    case "Write":
    case "Edit":
      return toolInput.file_path ? ` ${toolInput.file_path}` : "";
    case "Glob":
      return toolInput.pattern ? ` ${toolInput.pattern}` : "";
    case "Grep":
      return toolInput.pattern ? ` /${toolInput.pattern}/` : "";
    case "Agent": {
      const desc = toolInput.description ?? toolInput.subagent_type ?? "";
      return desc ? ` ${desc}` : "";
    }
    default:
      return "";
  }
}

function buildHookLogContext(data: Record<string, unknown>): Record<string, unknown> {
  const toolInput = isRecord(data.tool_input) ? data.tool_input : undefined;
  const toolResponse = isRecord(data.tool_response) ? data.tool_response : undefined;

  return {
    session_id: data.session_id,
    agent_type: data.agent_type,
    hook_event_name: data.hook_event_name,
    tool_name: data.tool_name,
    tool_use_id: data.tool_use_id,
    cwd: data.cwd,
    permission_mode: data.permission_mode,
    transcript_path: data.transcript_path,
    tool_input: toolInput
      ? {
          file_path: toolInput.file_path,
          pattern: toolInput.pattern,
          command:
            typeof toolInput.command === "string" ? toolInput.command.slice(0, 200) : undefined,
        }
      : undefined,
    tool_response: toolResponse
      ? {
          type: toolResponse.type,
          // Explicitly avoid logging response payload/content to keep logs small and safe.
          has_file: Boolean(toolResponse.file),
          has_content: Boolean(
            toolResponse.content || (isRecord(toolResponse.file) && toolResponse.file.content),
          ),
        }
      : undefined,
  };
}

function toolResponseText(toolResponse: Record<string, unknown> | undefined): string | null {
  if (!toolResponse) return null;
  if (typeof toolResponse.content === "string") return toolResponse.content;
  if (typeof toolResponse.stdout === "string" || typeof toolResponse.stderr === "string") {
    return [toolResponse.stdout, toolResponse.stderr].filter(Boolean).join("\n");
  }
  const file = isRecord(toolResponse.file) ? toolResponse.file : null;
  if (file && typeof file.content === "string") return file.content;
  return null;
}

function toolPaths(toolName: string, toolInput: Record<string, unknown> | undefined): string[] {
  if (!toolInput) return [];
  const paths = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim().length > 0) paths.add(value.trim());
  };
  add(toolInput.file_path);
  add(toolInput.path);
  add(toolInput.cwd);
  if (toolName === "Grep") add(toolInput.glob);
  return [...paths];
}

function evidenceKindForTool(toolName: string): AuditEvidenceKind | null {
  switch (toolName) {
    case "Read":
      return "file_read";
    case "Grep":
    case "Glob":
      return "search";
    case "Bash":
      return "shell_command";
    default:
      return null;
  }
}

function buildHookAuditEvidencePayload(
  data: Record<string, unknown>,
): AuditEvidenceRuntimePayload | null {
  const toolName = String(data.tool_name ?? "unknown");
  const evidenceKind = evidenceKindForTool(toolName);
  if (!evidenceKind) return null;
  const toolInput = isRecord(data.tool_input) ? data.tool_input : undefined;
  const toolResponse = isRecord(data.tool_response) ? data.tool_response : undefined;
  const command =
    toolName === "Bash" && typeof toolInput?.command === "string" ? toolInput.command : null;
  return buildAuditEvidencePayload({
    toolName,
    evidenceKind,
    evidenceGrade: toolName === "Glob" ? "discovery" : "substantive",
    paths: toolPaths(toolName, toolInput),
    command,
    exitCode:
      typeof toolResponse?.exit_code === "number"
        ? toolResponse.exit_code
        : typeof toolResponse?.exitCode === "number"
          ? toolResponse.exitCode
          : null,
    output: toolResponseText(toolResponse),
  });
}

function auditEvidenceContext(taskId: string, projectRoot: string) {
  const task = findTaskById(taskId);
  const artifact = findRoadmapBatchArtifactByTaskId(taskId);
  const taskDescription = task?.description ?? "";
  return {
    taskId,
    auditPlanId: resolveAuditPlanId({ taskId, roadmapBatchId: artifact?.batchId ?? null }),
    sourceSnapshotId: deriveAuditSourceSnapshotId(projectRoot),
    scopeIds: extractAuditScopeIdsFromText(taskDescription),
    riskHypothesisIds: extractAuditRiskHypothesisIds(taskDescription),
  };
}

export function persistAuditEvidencePayload(
  taskId: string,
  projectRoot: string,
  payload: AuditEvidenceRuntimePayload | unknown,
): AuditEvidenceUnit | null {
  const parsed = readAuditEvidenceRuntimePayload(payload) ?? null;
  if (!parsed) return null;
  try {
    const unit = appendAuditEvidenceEvent(
      buildAuditEvidenceUnit(auditEvidenceContext(taskId, projectRoot), parsed),
    );
    appendActivityLogToDb(
      taskId,
      `[${new Date().toISOString()}] Agent: AuditEvidence ${unit.id} ${unit.evidenceKind}/${unit.evidenceGrade} tool=${sanitizeForActivityLog(unit.toolName, 80)} redaction=${unit.redactionStatus}`,
    );
    return unit;
  } catch (err) {
    log.error({ err, taskId }, "Failed to persist audit evidence event");
    return null;
  }
}

/**
 * Creates a PostToolUse hook callback that logs tool activity.
 */
export function createActivityLogger(taskId: string): RuntimeHookCallback {
  return async (input, _toolUseId, _options) => {
    if (!isRecord(input)) return {};
    const data = input as Record<string, unknown>;
    const toolName = String(data.tool_name ?? "unknown");
    const toolInput = isRecord(data.tool_input) ? data.tool_input : undefined;
    const detail = summarizeToolInput(toolName, toolInput);

    log.debug({ taskId, toolName, hookInput: buildHookLogContext(data) }, "Agent tool use logged");

    logActivity(taskId, "Tool", `${toolName}${detail}`);
    return {};
  };
}

/**
 * Creates a PostToolUse hook callback that extracts bounded audit evidence.
 */
export function createAuditEvidenceLogger(
  taskId: string,
  projectRoot: string,
): RuntimeHookCallback {
  return async (input, _toolUseId, _options) => {
    if (!isRecord(input)) return {};
    const payload = buildHookAuditEvidencePayload(input);
    if (payload) {
      persistAuditEvidencePayload(taskId, projectRoot, payload);
      log.debug(
        { taskId, toolName: payload.toolName, eventType: AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE },
        "Audit evidence event persisted from tool hook",
      );
    }
    return {};
  };
}

/**
 * Creates a SubagentStart hook callback that logs subagent spawns.
 */
export function createSubagentLogger(taskId: string): RuntimeHookCallback {
  return async (input, _toolUseId, _options) => {
    if (!isRecord(input)) return {};
    const data = input as Record<string, unknown>;
    const agentName = String(
      data.agent_name ?? data.subagent_type ?? data.agent_type ?? data.description ?? "unknown",
    );
    const agentId = String(data.agent_id ?? data.session_id ?? "");
    const idSuffix = agentId ? ` (${agentId.slice(0, 8)})` : "";

    log.info({ taskId, agentName, hookInput: buildHookLogContext(data) }, "Subagent started");

    logActivity(taskId, "Subagent", `${agentName} started${idSuffix}`);
    return {};
  };
}
