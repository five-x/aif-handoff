/**
 * Stage error handler — classifies pipeline errors and applies
 * the appropriate recovery strategy (fast retry, backoff, or revert).
 * Extracted from coordinator.ts for single responsibility.
 */

import type { RuntimeLimitSnapshot } from "@aif/runtime";
import {
  getEnv,
  logger,
  mapSafeRuntimeErrorReason,
  redactProviderTextForLogs,
  type TaskStatus,
} from "@aif/shared";
import { logActivity } from "./hooks.js";
import {
  findBranchIsolationError,
  isRuntimeCapabilityFailure,
  findRuntimeExecutionError,
  isRepositoryInspectionBudgetExhaustionError,
  isExternalFailure,
  isFastRetryableFailure,
  truncateReason,
} from "./errorClassifier.js";
import { getDeterministicBackoffMinutes } from "./taskWatchdog.js";

const log = logger("stage-error-handler");

type RetryAfterSource = "resetAt" | "retryAfterSeconds" | "deterministic_backoff" | "none";

const NON_RETRYABLE_RUNTIME_CATEGORIES = new Set([
  "model_not_found",
  "context_length",
  "content_filter",
]);

export const IMPLEMENTATION_RUNTIME_EXHAUSTED_REASON =
  "implementation_runtime_exhausted_requires_split";

const IMPLEMENTATION_RUNTIME_EXHAUSTION_STATUSES = new Set([
  "max_tool_turns_exhausted",
  "runtime_budget_exhausted",
  "runtime_limit_exhausted",
]);

export type ErrorRecovery =
  | { kind: "fast_retry" }
  | {
      kind: "blocked_external";
      blockedReason: string;
      retryAfter: string | null;
      retryAfterSource: RetryAfterSource;
      retryCount: number;
      limitSnapshot: RuntimeLimitSnapshot | null;
    }
  | { kind: "revert" };

interface StageErrorInput {
  taskId: string;
  stageLabel: string;
  sourceStatus: TaskStatus;
  retryCount: number;
  err: unknown;
}

type BlockedExternalRecovery = Extract<ErrorRecovery, { kind: "blocked_external" }>;

function readRuntimeProviderMetaString(
  runtimeError: ReturnType<typeof findRuntimeExecutionError>,
  key: string,
): string | null {
  const providerMeta = runtimeError?.providerMeta;
  if (!providerMeta || typeof providerMeta !== "object" || Array.isArray(providerMeta)) {
    return null;
  }
  const raw = providerMeta[key];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function readRuntimeProviderMetaNumber(
  runtimeError: ReturnType<typeof findRuntimeExecutionError>,
  key: string,
): number | null {
  const providerMeta = runtimeError?.providerMeta;
  if (!providerMeta || typeof providerMeta !== "object" || Array.isArray(providerMeta)) {
    return null;
  }
  const raw = providerMeta[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function sanitizeReasonToken(value: string | null, fallback: string): string {
  const raw = value?.trim() || fallback;
  return raw.replace(/[^A-Za-z0-9_.:/@-]/g, "_").slice(0, 160) || fallback;
}

function sanitizeReasonPath(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/");
  if (!normalized || normalized.includes("\0")) return null;
  return normalized.replace(/[^A-Za-z0-9_./:@-]/g, "_").slice(0, 240);
}

function repeatedToolLoopBlockedReason(
  input: Pick<StageErrorInput, "stageLabel" | "err">,
): string | null {
  const runtimeError = findRuntimeExecutionError(input.err);
  if (!runtimeError) return null;
  if (readRuntimeProviderMetaString(runtimeError, "status") !== "repeated_tool_loop_blocked") {
    return null;
  }
  const toolName = sanitizeReasonToken(
    readRuntimeProviderMetaString(runtimeError, "toolName"),
    "unknown_tool",
  );
  const count = readRuntimeProviderMetaNumber(runtimeError, "repeatedCount") ?? 0;
  const limit = readRuntimeProviderMetaNumber(runtimeError, "repeatedToolCallLimit") ?? 0;
  const stage =
    readRuntimeProviderMetaString(runtimeError, "stage") ??
    readRuntimeProviderMetaString(runtimeError, "workflowKind") ??
    input.stageLabel;
  const base =
    input.stageLabel === "implementer" || stage === "implementer"
      ? `implementation_tool_loop: ${toolName} repeated ${count}/${limit}`
      : `repeated_tool_loop: ${toolName} repeated ${count}/${limit}`;
  if (stage !== "audit" && input.stageLabel !== "audit") return base;
  const artifact = sanitizeReasonPath(
    readRuntimeProviderMetaString(runtimeError, "targetPath") ??
      readRuntimeProviderMetaString(runtimeError, "artifactPath"),
  );
  return artifact ? `${base}; artifact=${artifact}` : base;
}

interface ImplementationRuntimeExhaustionDetails {
  category: string;
  status: string;
  runtimeError: ReturnType<typeof findRuntimeExecutionError>;
}

function implementationRuntimeExhaustionStatus(
  runtimeError: ReturnType<typeof findRuntimeExecutionError>,
): string | null {
  if (!runtimeError) return null;
  const status = readRuntimeProviderMetaString(runtimeError, "status");
  if (status && IMPLEMENTATION_RUNTIME_EXHAUSTION_STATUSES.has(status)) return status;
  if (runtimeError.category === "timeout") return "runtime_timeout";
  return null;
}

function isImplementerStageTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    if (/^Stage implementer timed out after \d+ms$/i.test(err.message.trim())) return true;
    if ("cause" in err && err.cause) return isImplementerStageTimeoutError(err.cause);
  }
  return false;
}

function implementationRuntimeExhaustionDetails(
  input: Pick<StageErrorInput, "stageLabel" | "err">,
): ImplementationRuntimeExhaustionDetails | null {
  if (input.stageLabel !== "implementer") return null;
  if (isRepositoryInspectionBudgetExhaustionError(input.err)) return null;
  const runtimeError = findRuntimeExecutionError(input.err);
  const runtimeStatus = implementationRuntimeExhaustionStatus(runtimeError);
  if (runtimeStatus) {
    return {
      category: runtimeError?.category ?? "unknown",
      status: runtimeStatus,
      runtimeError,
    };
  }
  if (isImplementerStageTimeoutError(input.err)) {
    return {
      category: "timeout",
      status: "stage_timeout",
      runtimeError: null,
    };
  }
  return null;
}

export function isImplementationRuntimeExhaustionError(
  input: Pick<StageErrorInput, "stageLabel" | "err">,
): boolean {
  return implementationRuntimeExhaustionDetails(input) !== null;
}

export function classifyImplementationRuntimeExhaustion(
  input: StageErrorInput,
): BlockedExternalRecovery | null {
  const details = implementationRuntimeExhaustionDetails(input);
  if (!details) return null;

  const { category, status, runtimeError } = details;
  const blockedReason =
    `${IMPLEMENTATION_RUNTIME_EXHAUSTED_REASON}: implementer runtime exhausted ` +
    `(category=${category}; status=${status}). Split scope, prepare a continuation package, ` +
    "or choose an explicit supported recovery path before retry.";
  const limitSnapshot = getEnv().AIF_USAGE_LIMITS_ENABLED
    ? (runtimeError?.limitSnapshot ?? null)
    : null;

  logActivity(
    input.taskId,
    "Agent",
    `coordinator moved to blocked_external from ${input.sourceStatus} at ${input.stageLabel}; retryAfter=manual; source=none; reason=${truncateReason(blockedReason)}`,
  );

  log.error(
    {
      taskId: input.taskId,
      stage: input.stageLabel,
      retryAfter: null,
      retryAfterSource: "none",
      runtimeCategory: category,
      runtimeStatus: status,
      errorName: input.err instanceof Error ? input.err.name : typeof input.err,
      errorMessage:
        input.err instanceof Error
          ? redactProviderTextForLogs(input.err.message)
          : redactProviderTextForLogs(String(input.err)),
    },
    "Subagent implementation runtime exhausted, task requires split or operator action",
  );

  return {
    kind: "blocked_external",
    blockedReason,
    retryAfter: null,
    retryAfterSource: "none",
    retryCount: input.retryCount ?? 0,
    limitSnapshot,
  };
}

function buildUserSafeExternalReason(err: unknown): string {
  const runtimeError = findRuntimeExecutionError(err);
  if (!runtimeError) {
    return "Runtime capability check failed. Check the configured runtime profile for this stage.";
  }

  switch (runtimeError.category) {
    case "rate_limit":
      return "Runtime usage limit reached. Task auto-paused until the retry window.";
    case "auth":
      return "Runtime authentication failed. Check the configured runtime profile.";
    case "permission":
      return "Runtime permissions blocked this task. Check the configured runtime profile or approval mode.";
    case "timeout":
      return "Runtime request timed out. Task will retry automatically.";
    case "stream":
      return "Runtime stream failed. Task will retry automatically.";
    case "transport":
    default:
      return "Runtime request failed. Task will retry automatically.";
  }
}

function buildOperatorInputRuntimeReason(category: "auth" | "permission"): string {
  if (category === "auth") {
    return (
      "operator_input_required: Runtime authentication failed. " +
      "Refresh or select a valid runtime profile or login state before retry."
    );
  }

  return (
    "operator_input_required: Runtime permissions blocked this task. " +
    "Grant the required runtime access or update the approval/sandbox policy before retry."
  );
}

function buildRuntimeStageNotCapableReason(status: string | null, stageLabel: string): string {
  if (status === "no_implementation_capable_profile") {
    return (
      "runtime_stage_not_capable: No implementation-capable runtime profile is configured. " +
      "Select a runtime profile explicitly declared capable for tool-using implementation " +
      "or pass a local Qwen implementation canary before retry."
    );
  }

  return (
    `runtime_stage_not_capable: Selected runtime profile is not capable for ${stageLabel}. ` +
    "Choose a stage-capable runtime profile or update the profile capability contract before retry."
  );
}

function resolveRetryAfter(
  err: unknown,
  retryCount: number,
): {
  retryAfter: string;
  retryAfterSource: RetryAfterSource;
  backoffMinutes: number | null;
  limitSnapshot: RuntimeLimitSnapshot | null;
} {
  const runtimeError = findRuntimeExecutionError(err);
  // When usage-limits feature is disabled, don't persist the limit snapshot
  // onto the task. Retry/backoff still applies — we just skip the surface
  // that feeds the (also-gated) UI.
  const limitSnapshot = getEnv().AIF_USAGE_LIMITS_ENABLED
    ? (runtimeError?.limitSnapshot ?? null)
    : null;

  if (runtimeError?.resetAt) {
    const resetAtMs = Date.parse(runtimeError.resetAt);
    if (Number.isFinite(resetAtMs)) {
      return {
        retryAfter: new Date(Math.max(resetAtMs, Date.now())).toISOString(),
        retryAfterSource: "resetAt",
        backoffMinutes: null,
        limitSnapshot,
      };
    }
  }

  if (
    typeof runtimeError?.retryAfterSeconds === "number" &&
    Number.isFinite(runtimeError.retryAfterSeconds) &&
    runtimeError.retryAfterSeconds >= 0
  ) {
    return {
      retryAfter: new Date(Date.now() + runtimeError.retryAfterSeconds * 1000).toISOString(),
      retryAfterSource: "retryAfterSeconds",
      backoffMinutes: null,
      limitSnapshot,
    };
  }

  const backoffMinutes = getDeterministicBackoffMinutes(retryCount);
  return {
    retryAfter: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
    retryAfterSource: "deterministic_backoff",
    backoffMinutes,
    limitSnapshot,
  };
}

/**
 * Classify a stage error and return the recovery strategy + status fields.
 * The caller is responsible for applying the status update.
 */
export function classifyStageError(input: StageErrorInput): ErrorRecovery {
  const { taskId, stageLabel, sourceStatus, err } = input;

  const repeatedToolLoopReason = repeatedToolLoopBlockedReason(input);
  if (repeatedToolLoopReason) {
    const runtimeError = findRuntimeExecutionError(err);
    const limitSnapshot = getEnv().AIF_USAGE_LIMITS_ENABLED
      ? (runtimeError?.limitSnapshot ?? null)
      : null;
    logActivity(
      taskId,
      "Agent",
      `coordinator moved to blocked_external from ${sourceStatus} at ${stageLabel}; retryAfter=manual; source=none; reason=${truncateReason(repeatedToolLoopReason)}`,
    );
    log.error(
      {
        taskId,
        stage: stageLabel,
        retryAfter: null,
        retryAfterSource: "none",
        runtimeCategory: runtimeError?.category ?? "unknown",
        runtimeStatus: "repeated_tool_loop_blocked",
      },
      "Subagent blocked after repeated runtime tool loop",
    );
    return {
      kind: "blocked_external",
      blockedReason: repeatedToolLoopReason,
      retryAfter: null,
      retryAfterSource: "none",
      retryCount: input.retryCount ?? 0,
      limitSnapshot,
    };
  }

  const implementationRuntimeExhaustion = classifyImplementationRuntimeExhaustion(input);
  if (implementationRuntimeExhaustion) return implementationRuntimeExhaustion;

  // Branch / worktree isolation failures must NEVER fall into the generic
  // revert path — generic revert triggers unbounded re-planning on a
  // corrupted work tree. Pin the task to blocked_external with no retry so
  // an operator inspects dirty changes, missing branches, or drift.
  const branchErr = findBranchIsolationError(err);
  if (branchErr) {
    const blockedReason = `Branch isolation failure (${branchErr.kind}): ${branchErr.message}`;
    logActivity(
      taskId,
      "Agent",
      `coordinator moved to blocked_external from ${sourceStatus} at ${stageLabel}; retryAfter=manual; source=none; reason=${truncateReason(blockedReason)}`,
    );
    log.error(
      {
        taskId,
        stage: stageLabel,
        branchKind: branchErr.kind,
        branchName: branchErr.branchName,
        projectRoot: branchErr.projectRoot,
      },
      "Subagent stage aborted due to branch isolation failure",
    );
    return {
      kind: "blocked_external",
      blockedReason,
      retryAfter: null,
      retryAfterSource: "none",
      retryCount: input.retryCount ?? 0,
      limitSnapshot: null,
    };
  }

  if (isRuntimeCapabilityFailure(err)) {
    const blockedReason =
      "Runtime capability check failed. Check the configured runtime profile for this stage.";
    logActivity(
      taskId,
      "Agent",
      `coordinator moved to blocked_external from ${sourceStatus} at ${stageLabel}; retryAfter=manual; source=none; reason=${truncateReason(blockedReason)}`,
    );
    log.error(
      {
        taskId,
        stage: stageLabel,
        retryAfter: null,
        retryAfterSource: "none",
        errorName: err instanceof Error ? err.name : typeof err,
        errorMessage:
          err instanceof Error
            ? redactProviderTextForLogs(err.message)
            : redactProviderTextForLogs(String(err)),
      },
      "Subagent failed runtime capability check, task requires manual action",
    );
    return {
      kind: "blocked_external",
      blockedReason,
      retryAfter: null,
      retryAfterSource: "none",
      retryCount: input.retryCount ?? 0,
      limitSnapshot: null,
    };
  }

  const runtimeError = findRuntimeExecutionError(err);
  if (
    runtimeError &&
    (runtimeError.category === "auth" || runtimeError.category === "permission")
  ) {
    const stageCapabilityStatus = readRuntimeProviderMetaString(runtimeError, "status");
    if (
      runtimeError.category === "permission" &&
      (stageCapabilityStatus === "runtime_stage_not_capable" ||
        stageCapabilityStatus === "no_implementation_capable_profile")
    ) {
      const blockedReason = buildRuntimeStageNotCapableReason(stageCapabilityStatus, stageLabel);
      const limitSnapshot = getEnv().AIF_USAGE_LIMITS_ENABLED
        ? (runtimeError.limitSnapshot ?? null)
        : null;

      logActivity(
        taskId,
        "Agent",
        `coordinator moved to blocked_external from ${sourceStatus} at ${stageLabel}; retryAfter=manual; source=none; reason=${truncateReason(blockedReason)}`,
      );

      log.error(
        {
          taskId,
          stage: stageLabel,
          retryAfter: null,
          retryAfterSource: "none",
          runtimeCategory: runtimeError.category,
          runtimeStatus: stageCapabilityStatus,
          errorName: err instanceof Error ? err.name : typeof err,
          errorMessage:
            err instanceof Error
              ? redactProviderTextForLogs(err.message)
              : redactProviderTextForLogs(String(err)),
        },
        "Subagent runtime profile is not capable for requested stage",
      );

      return {
        kind: "blocked_external",
        blockedReason,
        retryAfter: null,
        retryAfterSource: "none",
        retryCount: input.retryCount ?? 0,
        limitSnapshot,
      };
    }

    const blockedReason = buildOperatorInputRuntimeReason(runtimeError.category);
    const limitSnapshot = getEnv().AIF_USAGE_LIMITS_ENABLED
      ? (runtimeError.limitSnapshot ?? null)
      : null;

    logActivity(
      taskId,
      "Agent",
      `coordinator moved to blocked_external from ${sourceStatus} at ${stageLabel}; retryAfter=manual; source=none; reason=${truncateReason(blockedReason)}`,
    );

    log.error(
      {
        taskId,
        stage: stageLabel,
        retryAfter: null,
        retryAfterSource: "none",
        runtimeCategory: runtimeError.category,
        errorName: err instanceof Error ? err.name : typeof err,
        errorMessage:
          err instanceof Error
            ? redactProviderTextForLogs(err.message)
            : redactProviderTextForLogs(String(err)),
      },
      "Subagent failed with runtime operator-input error, task requires operator action",
    );

    return {
      kind: "blocked_external",
      blockedReason,
      retryAfter: null,
      retryAfterSource: "none",
      retryCount: input.retryCount ?? 0,
      limitSnapshot,
    };
  }

  if (runtimeError && NON_RETRYABLE_RUNTIME_CATEGORIES.has(runtimeError.category)) {
    const safeReason = mapSafeRuntimeErrorReason(runtimeError);
    const blockedReason = `${safeReason.reason} Manual action required before retry.`;
    const limitSnapshot = getEnv().AIF_USAGE_LIMITS_ENABLED
      ? (runtimeError.limitSnapshot ?? null)
      : null;

    logActivity(
      taskId,
      "Agent",
      `coordinator moved to blocked_external from ${sourceStatus} at ${stageLabel}; retryAfter=manual; source=none; reason=${truncateReason(blockedReason)}`,
    );

    log.error(
      {
        taskId,
        stage: stageLabel,
        retryAfter: null,
        retryAfterSource: "none",
        runtimeCategory: runtimeError.category,
        errorName: err instanceof Error ? err.name : typeof err,
        errorMessage:
          err instanceof Error
            ? redactProviderTextForLogs(err.message)
            : redactProviderTextForLogs(String(err)),
      },
      "Subagent failed with non-retryable runtime error, task requires manual action",
    );

    return {
      kind: "blocked_external",
      blockedReason,
      retryAfter: null,
      retryAfterSource: "none",
      retryCount: input.retryCount ?? 0,
      limitSnapshot,
    };
  }

  if (isFastRetryableFailure(err)) {
    const reason = err instanceof Error ? err.message : String(err);

    log.warn(
      { taskId, stage: stageLabel, reason },
      "Subagent hit transient stream interruption, scheduling fast retry",
    );

    return { kind: "fast_retry" };
  }

  if (isExternalFailure(err)) {
    if (isRepositoryInspectionBudgetExhaustionError(err)) {
      const blockedReason =
        "repository_inspection_budget_exhausted: Repository inspection budget was exhausted and compact finalization did not produce a trusted result. " +
        "AIF will not retry with full repository context or a larger fallback profile automatically.";
      logActivity(
        taskId,
        "Agent",
        `coordinator moved to blocked_external from ${sourceStatus} at ${stageLabel}; retryAfter=manual; source=none; reason=${truncateReason(blockedReason)}`,
      );
      log.error(
        { taskId, stage: stageLabel },
        "Subagent exhausted repository-inspection budget; blocking without automatic retry",
      );
      return {
        kind: "blocked_external",
        blockedReason,
        retryAfter: null,
        retryAfterSource: "none",
        retryCount: input.retryCount ?? 0,
        limitSnapshot: null,
      };
    }

    const { retryAfter, retryAfterSource, backoffMinutes, limitSnapshot } = resolveRetryAfter(
      err,
      input.retryCount ?? 0,
    );
    const reason = err instanceof Error ? err.message : String(err);
    const blockedReason = buildUserSafeExternalReason(err);
    const runtimeError = findRuntimeExecutionError(err);

    if (reason.trim() && reason.trim() !== blockedReason) {
      log.debug(
        {
          taskId,
          stage: stageLabel,
          safeReason: blockedReason,
          rawReason: redactProviderTextForLogs(reason),
        },
        "Redacted runtime error details before persisting blocked task state",
      );
    }

    if (retryAfterSource === "deterministic_backoff") {
      log.warn(
        {
          taskId,
          stage: stageLabel,
          retryAfter,
          backoffMinutes,
          runtimeId: limitSnapshot?.runtimeId ?? null,
          providerId: limitSnapshot?.providerId ?? null,
          profileId: limitSnapshot?.profileId ?? null,
        },
        "Structured reset metadata missing for external error, falling back to deterministic backoff",
      );
    }

    logActivity(
      taskId,
      "Agent",
      `coordinator moved to blocked_external from ${sourceStatus} at ${stageLabel}; retryAfter=${retryAfter}; source=${retryAfterSource}; reason=${truncateReason(blockedReason)}`,
    );

    log.error(
      {
        taskId,
        stage: stageLabel,
        retryAfter,
        retryAfterSource,
        backoffMinutes,
        runtimeId: limitSnapshot?.runtimeId ?? null,
        providerId: limitSnapshot?.providerId ?? null,
        profileId: limitSnapshot?.profileId ?? null,
        resetAt: runtimeError?.resetAt ?? null,
        retryAfterSeconds: runtimeError?.retryAfterSeconds ?? null,
        errorName: err instanceof Error ? err.name : typeof err,
        errorMessage: redactProviderTextForLogs(reason),
      },
      "Subagent failed with external error, task blocked with backoff",
    );

    return {
      kind: "blocked_external",
      blockedReason,
      retryAfter,
      retryAfterSource,
      retryCount: (input.retryCount ?? 0) + 1,
      limitSnapshot,
    };
  }

  log.error(
    {
      taskId,
      stage: stageLabel,
      errorName: err instanceof Error ? err.name : typeof err,
      errorMessage:
        err instanceof Error
          ? redactProviderTextForLogs(err.message)
          : redactProviderTextForLogs(String(err)),
    },
    "Subagent failed with unexpected stage error, task blocked for operator decision",
  );

  const blockedReason = `Unexpected ${stageLabel} stage failure. Operator action required before retry.`;
  logActivity(
    taskId,
    "Agent",
    `coordinator moved to blocked_external from ${sourceStatus} at ${stageLabel}; retryAfter=manual; source=none; reason=${truncateReason(blockedReason)}`,
  );

  return {
    kind: "blocked_external",
    blockedReason,
    retryAfter: null,
    retryAfterSource: "none",
    retryCount: (input.retryCount ?? 0) + 1,
    limitSnapshot: null,
  };
}
