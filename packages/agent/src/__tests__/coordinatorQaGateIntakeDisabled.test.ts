import { beforeEach, describe, expect, it, vi } from "vitest";
import { projects, resetEnvCache, tasks } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "false";
process.env.AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED = "false";
process.env.AIF_REQUIREMENTS_QA_ENABLED = "true";
resetEnvCache();

const testDb = { current: createTestDb() };

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("../subagents/planner.js", () => ({ runPlanner: vi.fn().mockResolvedValue(undefined) }));
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
vi.mock("../subagents/qa.js", () => ({ runQa: vi.fn().mockResolvedValue(undefined) }));
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
const { runQa } = await import("../subagents/qa.js");
const { findTaskById } = await import("@aif/data");

describe("coordinator QA gate with intake disabled", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    testDb.current
      .insert(projects)
      .values({ id: "qa-disabled-project", name: "QA disabled", rootPath: "C:/tmp/qa-disabled" })
      .run();
    vi.clearAllMocks();
    resetCoordinatorRuntimeCountersForTests();
    getStageSemaphore().reset();
  });

  it("keeps review to done when intake is disabled even if QA flag is true", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "intake-disabled",
        projectId: "qa-disabled-project",
        title: "Intake disabled",
        status: "review",
        autoMode: true,
        reviewComments: "Review accepted.",
      })
      .run();

    await pollAndProcess();

    expect(findTaskById("intake-disabled")?.status).toBe("done");
    expect(runQa).not.toHaveBeenCalled();
  });
});
