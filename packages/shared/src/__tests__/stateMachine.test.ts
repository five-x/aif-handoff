import { describe, it, expect } from "vitest";
import type { Task } from "../types.js";
import { applyHumanTaskEvent, isManualReviewBlockedTask } from "../stateMachine.js";

function makeTask(status: Task["status"]): Task {
  return {
    id: "t-1",
    projectId: "p-1",
    title: "Task",
    description: "",
    autoMode: true,
    isFix: false,
    plannerMode: "full",
    planPath: ".ai-factory/PLAN.md",
    planDocs: false,
    planTests: false,
    skipReview: false,
    useSubagents: true,
    status,
    requirementsCycleCount: 0,
    requirementsConfidence: null,
    requirementsSnapshotId: null,
    needsInputBatchId: null,
    needsInputStage: null,
    needsInputReason: null,
    lastHumanAnswerAt: null,
    lastAutoResumeAt: null,
    priority: 0,
    position: 1000,
    plan: null,
    implementationLog: null,
    reviewComments: null,
    agentActivityLog: null,
    blockedReason: null,
    blockedFromStatus: null,
    retryAfter: null,
    retryCount: 0,
    roadmapAlias: null,
    tags: [],
    reworkRequested: false,
    reviewIterationCount: 0,
    maxReviewIterations: 3,
    manualReviewRequired: false,
    autoReviewState: null,
    paused: false,
    lastHeartbeatAt: null,
    lockStage: null,
    coordinatorId: null,
    lastSyncedAt: null,
    runtimeProfileId: null,
    modelOverride: null,
    runtimeOptions: null,
    sessionId: null,
    acceptancePack: null,
    scheduledAt: null,
    branchName: null,
    worktreePath: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("task state machine", () => {
  it("allows start_ai from backlog", () => {
    const result = applyHumanTaskEvent(makeTask("backlog"), "start_ai");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("planning");
    }
  });

  it("routes start_ai to requirements_analysis when requirements intake is enabled", () => {
    const result = applyHumanTaskEvent(makeTask("backlog"), "start_ai", {
      requirementsIntakeEnabled: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("requirements_analysis");
    }
  });

  it("keeps start_ai default behavior routed directly to planning", () => {
    const result = applyHumanTaskEvent(makeTask("backlog"), "start_ai", {
      requirementsIntakeEnabled: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("planning");
    }
  });

  it("rejects requirements reanalysis from active implementation and verified statuses", () => {
    const implementing = applyHumanTaskEvent(
      makeTask("implementing"),
      "request_requirements_reanalysis",
      {
        requirementsIntakeEnabled: true,
      },
    );
    const verified = applyHumanTaskEvent(makeTask("verified"), "request_requirements_reanalysis", {
      requirementsIntakeEnabled: true,
    });
    expect(implementing.ok).toBe(false);
    expect(verified.ok).toBe(false);
  });

  it("rejects start_ai from non-backlog statuses", () => {
    const result = applyHumanTaskEvent(makeTask("done"), "start_ai");
    expect(result.ok).toBe(false);
  });

  it("has no human action from qa", () => {
    const result = applyHumanTaskEvent(makeTask("qa"), "approve_done");
    expect(result.ok).toBe(false);
  });

  it("allows accept_existing_plan from backlog", () => {
    const result = applyHumanTaskEvent(makeTask("backlog"), "accept_existing_plan");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("plan_ready");
      expect(result.patch.reviewIterationCount).toBe(0);
      expect(result.patch.manualReviewRequired).toBe(false);
      expect(result.patch.autoReviewState).toBeNull();
    }
  });

  it("rejects accept_existing_plan from non-backlog statuses", () => {
    const result = applyHumanTaskEvent(makeTask("planning"), "accept_existing_plan");
    expect(result.ok).toBe(false);
  });

  it("allows approve_done from done", () => {
    const task = makeTask("done");
    task.reviewIterationCount = 2;
    task.manualReviewRequired = true;
    task.autoReviewState = {
      strategy: "closure_first",
      iteration: 2,
      findings: [{ id: "finding-1", source: "code_review", text: "Manual review needed" }],
    };

    const result = applyHumanTaskEvent(task, "approve_done");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("verified");
      expect(result.patch.reviewIterationCount).toBe(0);
      expect(result.patch.manualReviewRequired).toBe(false);
      expect(result.patch.autoReviewState).toBeNull();
    }
  });

  it("allows request_changes from done", () => {
    const task = makeTask("done");
    task.reviewIterationCount = 3;
    task.manualReviewRequired = true;
    task.autoReviewState = {
      strategy: "closure_first",
      iteration: 3,
      findings: [{ id: "finding-2", source: "review_gate", text: "Retry review loop" }],
    };

    const result = applyHumanTaskEvent(task, "request_changes");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("implementing");
      expect(result.patch.retryCount).toBe(0);
      expect(result.patch.reworkRequested).toBe(true);
      expect(result.patch.reviewIterationCount).toBe(0);
      expect(result.patch.manualReviewRequired).toBe(false);
      expect(result.patch.autoReviewState).toBeNull();
    }
  });

  it("retries blocked task to previous status", () => {
    const blocked = {
      ...makeTask("blocked_external"),
      blockedFromStatus: "review" as const,
      blockedReason: "rate limit",
      retryAfter: new Date().toISOString(),
    };

    const result = applyHumanTaskEvent(blocked, "retry_from_blocked");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("review");
      expect(result.patch.blockedReason).toBeNull();
      expect(result.patch.blockedFromStatus).toBeNull();
      expect(result.patch.retryAfter).toBeNull();
    }
  });

  it("preserves rework intent when retrying a blocked rework task", () => {
    const blocked = {
      ...makeTask("blocked_external"),
      blockedFromStatus: "implementing" as const,
      blockedReason: "runtime timeout",
      reworkRequested: true,
    };

    const result = applyHumanTaskEvent(blocked, "retry_from_blocked");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("implementing");
      expect(result.patch.reworkRequested).toBe(true);
    }
  });

  it("rejects retry_from_blocked for manualReviewRequired blocks", () => {
    const blocked = {
      ...makeTask("blocked_external"),
      blockedFromStatus: "review" as const,
      blockedReason: "manual review required",
      manualReviewRequired: true,
    };

    const result = applyHumanTaskEvent(blocked, "retry_from_blocked");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("manual review");
    }
  });

  it("allows retry_from_blocked for exhausted plan-quality guard blocks", () => {
    const blocked = {
      ...makeTask("blocked_external"),
      blockedFromStatus: "planning" as const,
      blockedReason:
        "Plan quality guard (missing_plan_manifest): Retry limit reached (3). Operator next step: edit the task prompt or plan constraints, then retry from blocked.",
      manualReviewRequired: true,
      retryCount: 4,
    };

    const result = applyHumanTaskEvent(blocked, "retry_from_blocked");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("planning");
      expect(result.patch.blockedReason).toBeNull();
      expect(result.patch.manualReviewRequired).toBe(false);
      expect(result.patch.retryCount).toBe(0);
    }
  });

  it("rejects retry_from_blocked for manual-review blocked reasons", () => {
    const blocked = {
      ...makeTask("blocked_external"),
      blockedFromStatus: "review" as const,
      blockedReason: "manual-review: inspect reviewer finding",
    };

    const result = applyHumanTaskEvent(blocked, "retry_from_blocked");
    expect(result.ok).toBe(false);
  });

  it("rejects retry_from_blocked for specialized reviewer manual-review blocks", () => {
    const blocked = {
      ...makeTask("blocked_external"),
      blockedFromStatus: "review" as const,
      blockedReason: "manual_review_required: specialized reviewer security_data_loss unavailable",
      manualReviewRequired: true,
    };

    const result = applyHumanTaskEvent(blocked, "retry_from_blocked");
    expect(result.ok).toBe(false);
  });

  it("rejects retry_from_blocked for manual_exception blocked reasons", () => {
    const blocked = {
      ...makeTask("blocked_external"),
      blockedFromStatus: "review" as const,
      blockedReason: "manual_exception: accepted by operator",
    };

    const result = applyHumanTaskEvent(blocked, "retry_from_blocked");
    expect(result.ok).toBe(false);
  });

  it("rejects retry_from_blocked for manual-exception blocked reasons", () => {
    const blocked = {
      ...makeTask("blocked_external"),
      blockedFromStatus: "review" as const,
      blockedReason: "manual-exception: accepted by operator",
    };

    const result = applyHumanTaskEvent(blocked, "retry_from_blocked");
    expect(result.ok).toBe(false);
  });

  it("detects manual review blocked reasons with stable spellings", () => {
    expect(
      isManualReviewBlockedTask({
        ...makeTask("blocked_external"),
        blockedReason: "manual_review_required: unresolved audit finding",
      }),
    ).toBe(true);
    expect(
      isManualReviewBlockedTask({
        ...makeTask("blocked_external"),
        blockedReason: "manual review required: unresolved audit finding",
      }),
    ).toBe(true);
    expect(
      isManualReviewBlockedTask({
        ...makeTask("blocked_external"),
        blockedReason: "Runtime request timed out. Task will retry automatically.",
      }),
    ).toBe(false);
  });

  it("allows start_implementation from plan_ready when autoMode=false", () => {
    const result = applyHumanTaskEvent(
      { ...makeTask("plan_ready"), autoMode: false },
      "start_implementation",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("implementing");
    }
  });

  it("rejects start_implementation for autoMode=true", () => {
    const result = applyHumanTaskEvent(
      { ...makeTask("plan_ready"), autoMode: true },
      "start_implementation",
    );
    expect(result.ok).toBe(false);
  });

  it("allows request_replanning from plan_ready", () => {
    const result = applyHumanTaskEvent(
      { ...makeTask("plan_ready"), autoMode: false },
      "request_replanning",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("planning");
    }
  });

  it("rejects request_replanning outside plan_ready", () => {
    const result = applyHumanTaskEvent(makeTask("done"), "request_replanning");
    expect(result.ok).toBe(false);
  });

  it("allows fast_fix from plan_ready without changing status", () => {
    const result = applyHumanTaskEvent({ ...makeTask("plan_ready"), autoMode: false }, "fast_fix");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("plan_ready");
    }
  });

  it("rejects fast_fix outside plan_ready", () => {
    const result = applyHumanTaskEvent(makeTask("done"), "fast_fix");
    expect(result.ok).toBe(false);
  });

  it("rejects approve_done outside done", () => {
    const result = applyHumanTaskEvent(makeTask("planning"), "approve_done");
    expect(result.ok).toBe(false);
  });

  it("rejects request_changes outside done", () => {
    const result = applyHumanTaskEvent(makeTask("plan_ready"), "request_changes");
    expect(result.ok).toBe(false);
  });

  it("rejects retry_from_blocked outside blocked_external", () => {
    const result = applyHumanTaskEvent(makeTask("review"), "retry_from_blocked");
    expect(result.ok).toBe(false);
  });

  it("cancels non-terminal task statuses into a paused operator block", () => {
    for (const status of [
      "backlog",
      "planning",
      "plan_ready",
      "implementing",
      "review",
      "blocked_external",
    ] as const) {
      const result = applyHumanTaskEvent(makeTask(status), "cancel_task");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.patch.status).toBe("blocked_external");
        expect(result.patch.paused).toBe(true);
        expect(result.patch.manualReviewRequired).toBe(true);
        expect(result.patch.blockedReason).toMatch(/^operator_cancelled:/);
      }
    }
  });

  it("rejects cancel_task from terminal task statuses", () => {
    expect(applyHumanTaskEvent(makeTask("done"), "cancel_task").ok).toBe(false);
    expect(applyHumanTaskEvent(makeTask("verified"), "cancel_task").ok).toBe(false);
  });

  it("clears paused when starting a paused backlog task", () => {
    const result = applyHumanTaskEvent({ ...makeTask("backlog"), paused: true }, "start_ai");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe("planning");
      expect(result.patch.paused).toBe(false);
    }
  });

  it("returns unknown event error for unsupported event", () => {
    const result = applyHumanTaskEvent(makeTask("backlog"), "unsupported" as any);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Unknown task event");
    }
  });
});
