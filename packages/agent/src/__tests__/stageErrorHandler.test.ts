import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RuntimeCapabilityError,
  RuntimeExecutionError,
  type RuntimeLimitSnapshot,
} from "@aif/runtime";
import { resetEnvCache } from "@aif/shared";

// Flag defaults to false (opt-in). These tests assert on limitSnapshot
// persistence, which requires the gate to be open.
process.env.AIF_USAGE_LIMITS_ENABLED = "true";
resetEnvCache();

const { mockWarn, mockError } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("@aif/data", () => ({
  appendTaskActivityLog: vi.fn(),
}));

// Stable backoff for deterministic assertions
vi.mock("../taskWatchdog.js", () => ({
  getDeterministicBackoffMinutes: () => 10,
}));

vi.mock("@aif/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared")>();
  return {
    ...actual,
    logger: () => ({
      warn: mockWarn,
      error: mockError,
      info: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

const { classifyStageError } = await import("../stageErrorHandler.js");
import { appendTaskActivityLog } from "@aif/data";

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "task-1",
    stageLabel: "implementer",
    sourceStatus: "plan_ready" as const,
    retryCount: 0,
    err: new Error("boom"),
    ...overrides,
  };
}

describe("classifyStageError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- fast_retry ---

  it("returns fast_retry for stream interruption before worker dispatch", () => {
    const result = classifyStageError(
      makeInput({ err: new Error("stream interrupted before implement-worker dispatch") }),
    );
    expect(result).toEqual({ kind: "fast_retry" });
  });

  it("returns fast_retry for hook callback stream closed", () => {
    const result = classifyStageError(
      makeInput({ err: new Error("Error in hook callback: stream closed unexpectedly") }),
    );
    expect(result).toEqual({ kind: "fast_retry" });
  });

  it("logs warn with taskId, stage, and reason for fast_retry", () => {
    const err = new Error("stream interrupted before implement-worker dispatch");
    classifyStageError(makeInput({ err, stageLabel: "planner", taskId: "t-99" }));

    expect(mockWarn).toHaveBeenCalledOnce();
    const [meta, msg] = mockWarn.mock.calls[0];
    expect(meta).toMatchObject({
      taskId: "t-99",
      stage: "planner",
      reason: err.message,
    });
    expect(msg).toMatch(/transient stream interruption/i);
  });

  // --- blocked_external ---

  it("returns blocked_external without retry for runtime capability failures", () => {
    const result = classifyStageError(
      makeInput({
        err: new RuntimeCapabilityError("Runtime capability check failed: supportsRepositoryTools"),
        retryCount: 4,
      }),
    );

    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.retryAfter).toBeNull();
      expect(result.retryAfterSource).toBe("none");
      expect(result.retryCount).toBe(4);
      expect(result.blockedReason).toBe(
        "Runtime capability check failed. Check the configured runtime profile for this stage.",
      );
    }
  });

  it("returns blocked_external for rate limit errors", () => {
    const result = classifyStageError(
      makeInput({ err: new RuntimeExecutionError("rate limit exceeded", undefined, "rate_limit") }),
    );
    expect(result.kind).toBe("blocked_external");
  });

  it("includes retryAfter ISO string for external failures", () => {
    const before = Date.now();
    const result = classifyStageError(
      makeInput({
        err: new RuntimeExecutionError("Usage limit exceeded", undefined, "rate_limit"),
      }),
    );

    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.retryAfter).not.toBeNull();
      const retryAfter = result.retryAfter as string;
      const retryMs = new Date(retryAfter).getTime();
      // 10 min backoff (mocked)
      expect(retryMs).toBeGreaterThanOrEqual(before + 10 * 60_000 - 1000);
      expect(retryMs).toBeLessThanOrEqual(before + 10 * 60_000 + 1000);
      expect(result.retryAfterSource).toBe("deterministic_backoff");
    }
  });

  it("prefers structured resetAt over random backoff for external failures", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-17T00:00:00.000Z"));
      const resetAt = "2026-04-17T01:00:00.000Z";
      const limitSnapshot: RuntimeLimitSnapshot = {
        source: "sdk_event",
        status: "blocked",
        precision: "heuristic",
        checkedAt: "2026-04-17T00:00:00.000Z",
        providerId: "anthropic",
        runtimeId: "claude",
        profileId: "profile-1",
        primaryScope: "time",
        resetAt,
        retryAfterSeconds: null,
        warningThreshold: null,
        windows: [{ scope: "time", resetAt }],
        providerMeta: null,
      };

      const result = classifyStageError(
        makeInput({
          err: new RuntimeExecutionError("Usage limit exceeded", undefined, "rate_limit", {
            resetAt,
            limitSnapshot,
          }),
        }),
      );

      expect(result.kind).toBe("blocked_external");
      if (result.kind === "blocked_external") {
        expect(result.retryAfter).toBe(resetAt);
        expect(result.retryAfterSource).toBe("resetAt");
        expect(result.limitSnapshot).toEqual(limitSnapshot);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses retryAfterSeconds when resetAt is unavailable", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-17T00:00:00.000Z"));

      const result = classifyStageError(
        makeInput({
          err: new RuntimeExecutionError("Usage limit exceeded", undefined, "rate_limit", {
            retryAfterSeconds: 90,
          }),
        }),
      );

      expect(result.kind).toBe("blocked_external");
      if (result.kind === "blocked_external") {
        expect(result.retryAfter).toBe("2026-04-17T00:01:30.000Z");
        expect(result.retryAfterSource).toBe("retryAfterSeconds");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("increments retryCount from input", () => {
    const result = classifyStageError(
      makeInput({
        err: new RuntimeExecutionError("timeout", undefined, "timeout"),
        retryCount: 2,
      }),
    );
    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.retryCount).toBe(3);
    }
  });

  it("blocks context length errors without retrying the same oversized prompt", () => {
    const result = classifyStageError(
      makeInput({
        err: new RuntimeExecutionError(
          "request (28310 tokens) exceeds the available context size (24576)",
          undefined,
          "context_length",
        ),
        retryCount: 2,
      }),
    );

    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.retryAfter).toBeNull();
      expect(result.retryAfterSource).toBe("none");
      expect(result.retryCount).toBe(2);
      expect(result.blockedReason).toBe(
        "Request exceeded the model context limit. Manual action required before retry.",
      );
    }
  });

  it("redacts raw upstream error text from blocked reasons and activity logs", () => {
    const err = new RuntimeExecutionError(
      'upstream leaked "token=abc123" <script>alert(1)</script>',
      undefined,
      "transport",
    );

    const result = classifyStageError(makeInput({ err }));

    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.blockedReason).toBe("Runtime request failed. Task will retry automatically.");
      expect(result.blockedReason).not.toContain("abc123");
      expect(result.blockedReason).not.toContain("<script>");
    }

    expect(appendTaskActivityLog).toHaveBeenCalledOnce();
    const activityText = vi.mocked(appendTaskActivityLog).mock.calls[0][1];
    expect(activityText).toContain("Runtime request failed. Task will retry automatically.");
    expect(activityText).not.toContain("abc123");
    expect(activityText).not.toContain("<script>");
  });

  it("logs scrubbed metadata with taskId, stage, retryAfter, and backoffMinutes for blocked_external", () => {
    const err = new RuntimeExecutionError("rate limit exceeded", undefined, "rate_limit");
    classifyStageError(makeInput({ err, taskId: "t-ext", stageLabel: "reviewer" }));

    expect(mockError).toHaveBeenCalledOnce();
    const [meta, msg] = mockError.mock.calls[0];
    expect(meta).toMatchObject({
      taskId: "t-ext",
      stage: "reviewer",
      backoffMinutes: 10,
      errorName: "RuntimeExecutionError",
      errorMessage: "rate limit exceeded",
    });
    expect(meta.retryAfter).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(msg).toMatch(/external error/i);
  });

  it("blocks auth failures as sanitized operator input with no auto retry", () => {
    const result = classifyStageError(
      makeInput({
        err: new RuntimeExecutionError("auth failed token=abc123", undefined, "auth"),
        sourceStatus: "planning",
        stageLabel: "planner",
      }),
    );

    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.blockedReason).toContain("operator_input_required:");
      expect(result.blockedReason).toContain("Runtime authentication failed");
      expect(result.blockedReason).not.toContain("abc123");
      expect(result.retryAfter).toBeNull();
      expect(result.retryAfterSource).toBe("none");
      expect(result.retryCount).toBe(0);
    }

    expect(appendTaskActivityLog).toHaveBeenCalledOnce();
    const logText = vi.mocked(appendTaskActivityLog).mock.calls[0][1];
    expect(logText).toContain("blocked_external");
    expect(logText).toContain("planning");
    expect(logText).toContain("planner");
    expect(logText).not.toContain("abc123");
  });

  it("blocks permission failures as sanitized operator input with no auto retry", () => {
    const result = classifyStageError(
      makeInput({
        err: new RuntimeExecutionError("permission denied bearer abc123", undefined, "permission"),
        retryCount: 7,
      }),
    );

    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.blockedReason).toContain("operator_input_required:");
      expect(result.blockedReason).toContain("Grant the required runtime access");
      expect(result.blockedReason).not.toContain("abc123");
      expect(result.retryAfter).toBeNull();
      expect(result.retryAfterSource).toBe("none");
      expect(result.retryCount).toBe(7);
    }
  });

  // --- unexpected stage failures ---

  it("blocks unknown errors with sanitized reason and retry counter", () => {
    const result = classifyStageError(
      makeInput({ err: new Error("Cannot read property 'foo' of undefined") }),
    );
    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.blockedReason).toBe(
        "Unexpected implementer stage failure. Operator action required before retry.",
      );
      expect(result.blockedReason).not.toContain("foo");
      expect(result.retryAfter).toBeNull();
      expect(result.retryAfterSource).toBe("none");
      expect(result.retryCount).toBe(1);
    }
  });

  it("blocks non-Error values with sanitized reason and retry counter", () => {
    const result = classifyStageError(makeInput({ err: 42, retryCount: 3 }));
    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.blockedReason).toBe(
        "Unexpected implementer stage failure. Operator action required before retry.",
      );
      expect(result.blockedReason).not.toContain("42");
      expect(result.retryCount).toBe(4);
    }
  });

  it("logs scrubbed error metadata for unknown stage failures", () => {
    const err = new Error("unexpected null");
    classifyStageError(makeInput({ err, taskId: "t-rev", stageLabel: "planner" }));

    expect(mockError).toHaveBeenCalledOnce();
    const [meta, msg] = mockError.mock.calls[0];
    expect(meta).toMatchObject({
      taskId: "t-rev",
      stage: "planner",
      errorName: "Error",
      errorMessage: "unexpected null",
    });
    expect(msg).toMatch(/unexpected stage error/i);
  });

  it("scrubs raw provider text in blocked_external logs", () => {
    const err = new RuntimeExecutionError(
      "provider leaked secret_token=abc sk-SECRET bearer abc@example.com",
      undefined,
      "transport",
    );

    classifyStageError(makeInput({ err, taskId: "t-redact", stageLabel: "planner" }));

    expect(mockError).toHaveBeenCalledOnce();
    const [meta] = mockError.mock.calls[0];
    expect(meta).toMatchObject({ taskId: "t-redact" });
    expect(String(meta.errorMessage)).toContain("[REDACTED]");
    expect(String(meta.errorMessage)).not.toContain("secret_token=abc");
    expect(String(meta.errorMessage)).not.toContain("sk-SECRET");
    expect(String(meta.errorMessage)).not.toContain("abc@example.com");
  });

  it("writes sanitized activity log for unknown stage failures", () => {
    classifyStageError(makeInput({ err: new Error("internal bug") }));
    expect(appendTaskActivityLog).toHaveBeenCalledOnce();
    const activityText = vi.mocked(appendTaskActivityLog).mock.calls[0][1];
    expect(activityText).toContain("Unexpected implementer stage failure");
    expect(activityText).not.toContain("internal bug");
  });

  // --- priority: fast_retry beats external ---

  it("fast_retry takes priority over external match", () => {
    // "Error in hook callback: stream closed" matches both fast-retry and external patterns
    const result = classifyStageError(
      makeInput({ err: new Error("Error in hook callback: stream closed") }),
    );
    expect(result.kind).toBe("fast_retry");
  });

  // --- BranchIsolationError → blocked_external with no retry ---

  it("classifies BranchIsolationError(dirty_worktree) as blocked_external with retryAfter=null", async () => {
    const { BranchIsolationError } = await import("../gitBranch.js");
    const err = new BranchIsolationError(
      "dirty_worktree",
      "Work tree at /tmp/p dirty",
      "/tmp/p",
      "feature/x",
    );
    const result = classifyStageError(makeInput({ err }));
    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.retryAfter).toBeNull();
      expect(result.retryAfterSource).toBe("none");
      expect(result.blockedReason).toMatch(/Branch isolation failure \(dirty_worktree\)/);
      expect(result.limitSnapshot).toBeNull();
    }
  });

  it("classifies BranchIsolationError(branch_drift) as blocked_external", async () => {
    const { BranchIsolationError } = await import("../gitBranch.js");
    const err = new BranchIsolationError("branch_drift", "HEAD drift", "/tmp/p", "feature/y");
    const result = classifyStageError(makeInput({ err }));
    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.blockedReason).toContain("branch_drift");
    }
  });

  it("classifies BranchIsolationError(branch_missing) as blocked_external", async () => {
    const { BranchIsolationError } = await import("../gitBranch.js");
    const err = new BranchIsolationError("branch_missing", "missing", "/tmp/p", "feature/z");
    const result = classifyStageError(makeInput({ err }));
    expect(result.kind).toBe("blocked_external");
  });

  it("does not retry branch isolation errors (retryCount unchanged)", async () => {
    const { BranchIsolationError } = await import("../gitBranch.js");
    const err = new BranchIsolationError("checkout_failed", "failed", "/tmp/p", "feature/c");
    const result = classifyStageError(makeInput({ err, retryCount: 5 }));
    expect(result.kind).toBe("blocked_external");
    if (result.kind === "blocked_external") {
      expect(result.retryCount).toBe(5);
    }
  });

  it("BranchIsolationError wrapped in cause chain is still classified", async () => {
    const { BranchIsolationError } = await import("../gitBranch.js");
    const inner = new BranchIsolationError("dirty_worktree", "inner", "/tmp/p", "feature/w");
    const outer = new Error("wrapper");
    (outer as Error & { cause?: unknown }).cause = inner;
    const result = classifyStageError(makeInput({ err: outer }));
    expect(result.kind).toBe("blocked_external");
  });
});
