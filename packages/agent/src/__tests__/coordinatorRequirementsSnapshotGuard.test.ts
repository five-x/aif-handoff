import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { projects, resetEnvCache, tasks } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "true";
process.env.AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED = "false";
resetEnvCache();

const testDb = { current: createTestDb() };

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("../subagents/requirementsAnalyst.js", () => ({
  runRequirementsAnalyst: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../subagents/planner.js", () => ({
  runPlanner: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../subagents/planChecker.js", () => ({
  runPlanChecker: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../subagents/implementer.js", () => ({
  runImplementer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../subagents/reviewer.js", () => ({
  runReviewer: vi.fn().mockResolvedValue(undefined),
  taskRequiresSpecializedReviewerFanout: vi.fn().mockReturnValue(false),
}));
vi.mock("../reviewGate.js", () => ({
  evaluateReviewCommentsForAutoMode: vi.fn().mockResolvedValue({ status: "success" }),
}));
vi.mock("../autoReviewHandler.js", () => ({
  handleAutoReviewGate: vi.fn().mockResolvedValue({
    status: "accepted",
    currentIteration: 1,
    metrics: {
      strategy: "full_re_review",
      iteration: 1,
      previousBlockingCount: 0,
      stillBlockingCount: 0,
      newBlockingCount: 0,
      totalBlockingCount: 0,
      parserMode: "structured",
    },
    autoReviewState: null,
  }),
}));

const { pollAndProcess, getStageSemaphore, resetCoordinatorRuntimeCountersForTests } =
  await import("../coordinator.js");
const { runPlanner } = await import("../subagents/planner.js");

describe("coordinator requirements snapshot guard", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    testDb.current
      .insert(projects)
      .values({ id: "guard-project", name: "Guard", rootPath: "/tmp/guard" })
      .run();
    vi.clearAllMocks();
    resetCoordinatorRuntimeCountersForTests();
    getStageSemaphore().reset();
  });

  it("returns planning tasks without a current requirements snapshot or waiver to requirements analysis", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-missing-requirements-snapshot",
        projectId: "guard-project",
        title: "Needs snapshot",
        status: "planning",
        blockedReason: "old block",
        blockedFromStatus: "planning",
        retryAfter: "2026-05-28T00:00:00.000Z",
        retryCount: 3,
        manualReviewRequired: true,
        runtimeLimitSnapshotJson: JSON.stringify({ status: "blocked" }),
        runtimeLimitUpdatedAt: "2026-05-28T00:00:00.000Z",
      })
      .run();

    await pollAndProcess();

    expect(runPlanner).not.toHaveBeenCalled();
    const task = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-missing-requirements-snapshot"))
      .get();
    expect(task).toEqual(
      expect.objectContaining({
        status: "requirements_analysis",
        blockedReason: null,
        blockedFromStatus: null,
        retryAfter: null,
        retryCount: 3,
        manualReviewRequired: false,
        runtimeLimitSnapshotJson: null,
      }),
    );
    expect(task?.runtimeLimitUpdatedAt).not.toBeNull();
    expect(task?.agentActivityLog).toContain(
      "Planner guard returned task to requirements_analysis",
    );
  });
});
