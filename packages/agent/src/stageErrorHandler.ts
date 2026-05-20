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
