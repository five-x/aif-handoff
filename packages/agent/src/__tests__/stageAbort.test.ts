import { describe, it, expect, vi } from "vitest";

const mockReleaseTaskClaim = vi.fn();
const mockReleaseTaskClaimsForCoordinator = vi.fn();
vi.mock("@aif/data", () => ({
  releaseTaskClaim: (...args: unknown[]) => mockReleaseTaskClaim(...args),
  releaseTaskClaimsForCoordinator: (...args: unknown[]) =>
    mockReleaseTaskClaimsForCoordinator(...args),
}));

import {
  getActiveStageAbortController,
  setActiveStageAbortController,
  abortAllActiveStages,
} from "../stageAbort.js";

describe("stageAbort", () => {
  it("returns null when no controller is set", () => {
    setActiveStageAbortController("test-task", null);
    expect(getActiveStageAbortController("test-task")).toBeNull();
  });

  it("stores and retrieves an AbortController by taskId", () => {
    const abort = new AbortController();
    setActiveStageAbortController("task-1", abort);
    expect(getActiveStageAbortController("task-1")).toBe(abort);
    expect(getActiveStageAbortController("task-2")).toBeNull();
    setActiveStageAbortController("task-1", null);
  });

  it("supports multiple concurrent controllers", () => {
    const abort1 = new AbortController();
    const abort2 = new AbortController();
    setActiveStageAbortController("task-1", abort1);
    setActiveStageAbortController("task-2", abort2);
    expect(getActiveStageAbortController("task-1")).toBe(abort1);
    expect(getActiveStageAbortController("task-2")).toBe(abort2);
    setActiveStageAbortController("task-1", null);
    setActiveStageAbortController("task-2", null);
  });

  it("returns single controller when no taskId given (backward compat)", () => {
    const abort = new AbortController();
    setActiveStageAbortController("task-1", abort);
    expect(getActiveStageAbortController()).toBe(abort);
    setActiveStageAbortController("task-1", null);
  });

  it("returns null when multiple controllers active and no taskId given", () => {
    const abort1 = new AbortController();
    const abort2 = new AbortController();
    setActiveStageAbortController("task-1", abort1);
    setActiveStageAbortController("task-2", abort2);
    expect(getActiveStageAbortController()).toBeNull();
    setActiveStageAbortController("task-1", null);
    setActiveStageAbortController("task-2", null);
  });

  it("can abort the stored controller", () => {
    const abort = new AbortController();
    setActiveStageAbortController("task-1", abort);
    expect(abort.signal.aborted).toBe(false);

    abort.abort();
    expect(abort.signal.aborted).toBe(true);
    setActiveStageAbortController("task-1", null);
  });

  it("abortAllActiveStages aborts all controllers and releases owner-scoped locks", () => {
    mockReleaseTaskClaim.mockClear();
    mockReleaseTaskClaimsForCoordinator.mockClear();
    const abort1 = new AbortController();
    const abort2 = new AbortController();
    setActiveStageAbortController("task-1", abort1);
    setActiveStageAbortController("task-2", abort2);

    abortAllActiveStages("coord-1");

    expect(abort1.signal.aborted).toBe(true);
    expect(abort2.signal.aborted).toBe(true);
    expect(getActiveStageAbortController("task-1")).toBeNull();
    expect(getActiveStageAbortController("task-2")).toBeNull();
    expect(mockReleaseTaskClaim).toHaveBeenCalledWith("task-1", "coord-1");
    expect(mockReleaseTaskClaim).toHaveBeenCalledWith("task-2", "coord-1");
    expect(mockReleaseTaskClaim).toHaveBeenCalledTimes(2);
    expect(mockReleaseTaskClaimsForCoordinator).toHaveBeenCalledWith("coord-1");
  });

  it("abortAllActiveStages releases task and coordinator claims for the owner", () => {
    mockReleaseTaskClaim.mockClear();
    mockReleaseTaskClaimsForCoordinator.mockClear();
    const abort = new AbortController();
    setActiveStageAbortController("task-owned", abort);

    abortAllActiveStages("coord-1");

    expect(abort.signal.aborted).toBe(true);
    expect(mockReleaseTaskClaim).toHaveBeenCalledWith("task-owned", "coord-1");
    expect(mockReleaseTaskClaimsForCoordinator).toHaveBeenCalledWith("coord-1");
  });
});
