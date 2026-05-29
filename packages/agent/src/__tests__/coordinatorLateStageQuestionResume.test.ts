import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { projects, resetEnvCache, tasks, type TaskStatus } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "true";
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

vi.mock("../subagents/requirementsAnalyst.js", () => ({
  runRequirementsAnalyst: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../subagents/researcher.js", () => ({
  runResearcher: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../subagents/designer.js", () => ({
  runDesigner: vi.fn().mockResolvedValue(undefined),
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
vi.mock("../subagents/qa.js", () => ({
  runQa: vi.fn().mockResolvedValue(undefined),
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
const { runImplementer } = await import("../subagents/implementer.js");
const { runPlanner } = await import("../subagents/planner.js");
const { runQa } = await import("../subagents/qa.js");
const { runReviewer } = await import("../subagents/reviewer.js");
const { recordRequirementsSnapshotWaiver, setTaskFields } = await import("@aif/data");

function seedProject(): void {
  testDb.current
    .insert(projects)
    .values({ id: "coordinator-late-stage", name: "Coordinator", rootPath: "/tmp/coordinator" })
    .run();
}

function seedTask(id: string, status: TaskStatus): void {
  testDb.current
    .insert(tasks)
    .values({
      id,
      projectId: "coordinator-late-stage",
      title: id,
      description: "Coordinator should preserve needs_input.",
      status,
      taskIntent: "general",
      autoMode: true,
      plan: "## Plan\n- [ ] Implement.",
      implementationLog: "Implementation pending.",
      reviewComments: "Review pending.",
    })
    .run();
  recordRequirementsSnapshotWaiver(id, "Coordinator test has requirements context.");
}

function expectTaskStatus(id: string, status: TaskStatus, stage: string): void {
  const task = testDb.current.select().from(tasks).where(eq(tasks.id, id)).get();
  expect(task?.status).toBe(status);
  expect(task?.needsInputStage).toBe(stage);
}

describe("coordinator late-stage question resume", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
    vi.clearAllMocks();
    resetCoordinatorRuntimeCountersForTests();
    getStageSemaphore().reset();
    process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "true";
    process.env.AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED = "false";
    process.env.AIF_REQUIREMENTS_QA_ENABLED = "true";
    resetEnvCache();
  });

  it("does not overwrite planner needs_input transitions", async () => {
    seedTask("planner-needs-input", "planning");
    vi.mocked(runPlanner).mockImplementationOnce(async () => {
      setTaskFields("planner-needs-input", {
        status: "needs_input",
        needsInputStage: "planning",
        needsInputReason: "planning requires product clarification",
      });
    });

    await pollAndProcess();

    expect(runPlanner).toHaveBeenCalledOnce();
    expectTaskStatus("planner-needs-input", "needs_input", "planning");
  });

  it("does not overwrite implementer needs_input transitions", async () => {
    seedTask("implementer-needs-input", "implementing");
    vi.mocked(runImplementer).mockImplementationOnce(async () => {
      setTaskFields("implementer-needs-input", {
        status: "needs_input",
        needsInputStage: "implementing",
        needsInputReason: "implementation requires product clarification",
      });
    });

    await pollAndProcess();

    expect(runImplementer).toHaveBeenCalledOnce();
    expectTaskStatus("implementer-needs-input", "needs_input", "implementing");
  });

  it("does not overwrite reviewer needs_input transitions", async () => {
    seedTask("reviewer-needs-input", "review");
    vi.mocked(runReviewer).mockImplementationOnce(async () => {
      setTaskFields("reviewer-needs-input", {
        status: "needs_input",
        needsInputStage: "review",
        needsInputReason: "review requires product clarification",
      });
    });

    await pollAndProcess();

    expect(runReviewer).toHaveBeenCalledOnce();
    expectTaskStatus("reviewer-needs-input", "needs_input", "review");
  });

  it("does not overwrite QA needs_input transitions", async () => {
    seedTask("qa-needs-input", "qa");
    vi.mocked(runQa).mockImplementationOnce(async () => {
      setTaskFields("qa-needs-input", {
        status: "needs_input",
        needsInputStage: "qa",
        needsInputReason: "QA requires product clarification",
      });
    });

    await pollAndProcess();

    expect(runQa).toHaveBeenCalledOnce();
    expectTaskStatus("qa-needs-input", "needs_input", "qa");
  });
});
