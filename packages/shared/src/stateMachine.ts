import type { Task, TaskEvent, TaskStatus, UpdateTaskInput } from "./types.js";

type TransitionPatch = Pick<
  UpdateTaskInput,
  | "blockedReason"
  | "blockedFromStatus"
  | "retryAfter"
  | "retryCount"
  | "reworkRequested"
  | "reviewIterationCount"
  | "manualReviewRequired"
  | "autoReviewState"
  | "scheduledAt"
> & { status: TaskStatus };

type TransitionResult = { ok: true; patch: TransitionPatch } | { ok: false; error: string };

export interface TaskTransitionOptions {
  requirementsIntakeEnabled?: boolean;
}

/** Default reset values applied when transitioning out of blocked/retry states. */
export const CLEAN_STATE_RESET = {
  blockedReason: null,
  blockedFromStatus: null,
  retryAfter: null,
  retryCount: 0,
  reworkRequested: false,
  reviewIterationCount: 0,
  manualReviewRequired: false,
  autoReviewState: null,
  scheduledAt: null,
} as const satisfies Omit<TransitionPatch, "status">;

export function isManualReviewBlockedTask(
  task: Pick<Task, "blockedReason" | "manualReviewRequired">,
): boolean {
  const reason = task.blockedReason?.toLowerCase() ?? "";
  return (
    task.manualReviewRequired ||
    reason.includes("manual-review") ||
    reason.includes("manual_review_required") ||
    reason.includes("manual review required") ||
    reason.includes("manual_exception") ||
    reason.includes("manual-exception")
  );
}

export function applyHumanTaskEvent(
  task: Pick<
    Task,
    | "status"
    | "autoMode"
    | "blockedReason"
    | "blockedFromStatus"
    | "reworkRequested"
    | "manualReviewRequired"
  >,
  event: TaskEvent,
  options: TaskTransitionOptions = {},
): TransitionResult {
  switch (event) {
    case "start_ai": {
      if (task.status !== "backlog") {
        return { ok: false, error: "start_ai is only allowed from backlog" };
      }
      return {
        ok: true,
        patch: {
          ...CLEAN_STATE_RESET,
          status: options.requirementsIntakeEnabled ? "requirements_analysis" : "planning",
        },
      };
    }
    case "request_requirements_reanalysis": {
      if (!options.requirementsIntakeEnabled) {
        return {
          ok: false,
          error: "request_requirements_reanalysis requires requirements intake to be enabled",
        };
      }
      if (!["backlog", "planning", "plan_ready", "done"].includes(task.status)) {
        return {
          ok: false,
          error:
            "request_requirements_reanalysis is only allowed from backlog, planning, plan_ready, or done",
        };
      }
      return { ok: true, patch: { ...CLEAN_STATE_RESET, status: "requirements_analysis" } };
    }
    case "approve_requirements": {
      if (task.status !== "requirements_analysis") {
        return {
          ok: false,
          error: "approve_requirements is only allowed from requirements_analysis",
        };
      }
      return { ok: true, patch: { ...CLEAN_STATE_RESET, status: "planning" } };
    }
    case "accept_existing_plan": {
      if (task.status !== "backlog") {
        return { ok: false, error: "accept_existing_plan is only allowed from backlog" };
      }
      return { ok: true, patch: { ...CLEAN_STATE_RESET, status: "plan_ready" } };
    }
    case "start_implementation": {
      if (task.status !== "plan_ready") {
        return { ok: false, error: "start_implementation is only allowed from plan_ready" };
      }
      if (task.autoMode) {
        return { ok: false, error: "start_implementation is not needed when autoMode=true" };
      }
      return { ok: true, patch: { ...CLEAN_STATE_RESET, status: "implementing" } };
    }
    case "request_replanning": {
      if (task.status !== "plan_ready") {
        return { ok: false, error: "request_replanning is only allowed from plan_ready" };
      }
      return { ok: true, patch: { ...CLEAN_STATE_RESET, status: "planning" } };
    }
    case "fast_fix": {
      if (task.status !== "plan_ready") {
        return { ok: false, error: "fast_fix is only allowed from plan_ready" };
      }
      return { ok: true, patch: { ...CLEAN_STATE_RESET, status: "plan_ready" } };
    }
    case "approve_done": {
      if (task.status !== "done") {
        return { ok: false, error: "approve_done is only allowed from done" };
      }
      // Verified tasks are a terminal state: convergence flags must be cleared.
      // The audit trail remains in task comments / activity log, not on the live
      // task-state fields that drive future automation decisions.
      return { ok: true, patch: { ...CLEAN_STATE_RESET, status: "verified" } };
    }
    case "request_changes": {
      if (task.status !== "done") {
        return { ok: false, error: "request_changes is only allowed from done" };
      }
      return {
        ok: true,
        patch: { ...CLEAN_STATE_RESET, status: "implementing", reworkRequested: true },
      };
    }
    case "manual_exception": {
      return { ok: false, error: "manual_exception is handled by the audit artifact service" };
    }
    case "retry_from_blocked": {
      if (task.status !== "blocked_external") {
        return { ok: false, error: "retry_from_blocked is only allowed from blocked_external" };
      }
      if (!task.blockedFromStatus) {
        return { ok: false, error: "blockedFromStatus is missing for retry_from_blocked" };
      }
      if (isManualReviewBlockedTask(task)) {
        return {
          ok: false,
          error: "retry_from_blocked is not allowed for manual review blocks",
        };
      }
      return {
        ok: true,
        patch: {
          ...CLEAN_STATE_RESET,
          status: task.blockedFromStatus,
          reworkRequested: task.reworkRequested,
        },
      };
    }
    default:
      return { ok: false, error: "Unknown task event" };
  }
}

export const HUMAN_ACTIONS_BY_STATUS: Record<TaskStatus, TaskEvent[]> = {
  backlog: ["start_ai"],
  requirements_analysis: ["approve_requirements"],
  needs_input: [],
  planning: [],
  plan_ready: ["start_implementation", "request_replanning", "fast_fix"],
  implementing: [],
  review: [],
  blocked_external: ["retry_from_blocked"],
  done: ["approve_done", "request_changes"],
  verified: [],
};
