import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { projects, resetEnvCache, tasks } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "true";
process.env.AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED = "true";
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
const { runResearcher } = await import("../subagents/researcher.js");
const { recordRequirementsSnapshotWaiver, recordTaskStageArtifactAttempt, setTaskFields } =
  await import("@aif/data");

function seedProject(): void {
  testDb.current
    .insert(projects)
    .values({ id: "research-design-project", name: "Research Design", rootPath: "/tmp/rd" })
    .run();
}

function seedPlanningTask(id: string): void {
  testDb.current
    .insert(tasks)
    .values({
      id,
      projectId: "research-design-project",
      title: id,
      description: "Task with requirements context.",
      status: "planning",
      autoMode: false,
    })
    .run();
  recordRequirementsSnapshotWaiver(id, "Operator accepted legacy requirements.");
}

describe("coordinator research/design stages", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
    vi.clearAllMocks();
    resetCoordinatorRuntimeCountersForTests();
    getStageSemaphore().reset();
  });

  it("returns planning tasks with missing research artifacts to research", async () => {
    seedPlanningTask("task-missing-research");

    await pollAndProcess();

    expect(runPlanner).not.toHaveBeenCalled();
    const task = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-missing-research"))
      .get();
    expect(task?.status).toBe("research");
    expect(task?.agentActivityLog).toContain("Planner guard returned task to research");
  });

  it("returns planning tasks with missing design artifacts to design", async () => {
    seedPlanningTask("task-missing-design");
    recordTaskStageArtifactAttempt({
      taskId: "task-missing-design",
      stage: "research",
      kind: "research",
      label: "Research artifact",
      path: "research.md",
      state: "accepted",
      summary: "Research accepted.",
      markdown: "# Research\n\nAccepted.",
    });

    await pollAndProcess();

    expect(runPlanner).not.toHaveBeenCalled();
    const task = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-missing-design"))
      .get();
    expect(task?.status).toBe("design");
    expect(task?.agentActivityLog).toContain("Planner guard returned task to design");
  });

  it("allows planning when research and design artifacts are accepted", async () => {
    seedPlanningTask("task-ready-for-planning");
    const researchAttempt = recordTaskStageArtifactAttempt({
      taskId: "task-ready-for-planning",
      stage: "research",
      kind: "research",
      label: "research artifact",
      path: "research.md",
      state: "accepted",
      summary: "research accepted.",
      markdown: "# research\n\nAccepted.",
    });
    recordTaskStageArtifactAttempt({
      taskId: "task-ready-for-planning",
      stage: "design",
      kind: "design",
      label: "design artifact",
      path: "design.md",
      state: "accepted",
      summary: "design accepted.",
      markdown: "# design\n\nAccepted.",
      metadata: {
        sourceResearchArtifactId: researchAttempt.artifactId,
        sourceResearchAttemptNumber: researchAttempt.attemptNumber,
      },
    });

    await pollAndProcess();

    expect(runPlanner).toHaveBeenCalledTimes(1);
    const task = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-ready-for-planning"))
      .get();
    expect(task?.status).toBe("plan_ready");
  });

  it("does not overwrite research-stage needs_input transitions", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-research-question",
        projectId: "research-design-project",
        title: "Research question",
        description: "Research needs a user answer.",
        status: "research",
      })
      .run();
    vi.mocked(runResearcher).mockImplementationOnce(async () => {
      setTaskFields("task-research-question", {
        status: "needs_input",
        needsInputStage: "research",
        needsInputReason: "research stage requires product clarification",
      });
    });

    await pollAndProcess();

    const task = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-research-question"))
      .get();
    expect(task?.status).toBe("needs_input");
    expect(task?.needsInputStage).toBe("research");
  });
});
