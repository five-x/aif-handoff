import { beforeEach, describe, expect, it, vi } from "vitest";
import { projects, resetEnvCache, tasks, type ImplementationManifest } from "@aif/shared";
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
const { runQa } = await import("../subagents/qa.js");
const {
  buildTaskQaSourceFingerprint,
  recordTaskStageArtifactAttempt,
  findTaskById,
  hasFreshAcceptedTaskAcceptancePack,
  updateTaskStatus,
} = await import("@aif/data");

function seedProject(): void {
  testDb.current
    .insert(projects)
    .values({ id: "qa-project", name: "QA", rootPath: "C:/tmp/qa" })
    .run();
}

function manifest(taskId: string): ImplementationManifest {
  return {
    version: 1,
    taskId,
    intent: "feature",
    planManifestHash: null,
    changedFiles: [{ path: "packages/app/src/feature.ts", status: "modified" }],
    diffSummary: { summary: "Updated feature flow." },
    verificationEvidence: [
      {
        id: "unit-tests",
        command: "npm.cmd test --workspace=@aif/agent -- qa",
        status: "passed",
        outputSha256: "b".repeat(64),
        outputPreview: "Tests passed.",
      },
    ],
    acceptanceCriteria: [],
    evidenceRefs: ["unit-tests"],
    planChecklist: { total: 1, completed: 1, pending: 0, synced: true },
    reviewClosure: { status: "passed", evidenceRefs: ["review"] },
    commitEvidence: { status: "not_required" },
    knownLimitations: [],
  };
}

function manifestWithoutVerification(taskId: string): ImplementationManifest {
  return {
    ...manifest(taskId),
    verificationEvidence: [],
    evidenceRefs: [],
  };
}

function seedReviewTask(input: {
  id: string;
  taskIntent?: "general" | "feature";
  implementationManifest?: ImplementationManifest;
}): void {
  testDb.current
    .insert(tasks)
    .values({
      id: input.id,
      projectId: "qa-project",
      title: input.id,
      description: "Task ready for review.",
      status: "review",
      autoMode: true,
      taskIntent: input.taskIntent ?? "general",
      implementationManifestJson: JSON.stringify(
        input.implementationManifest ?? manifest(input.id),
      ),
      reviewComments: "Review accepted.",
    })
    .run();
}

describe("coordinator QA gate", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
    vi.clearAllMocks();
    resetCoordinatorRuntimeCountersForTests();
    getStageSemaphore().reset();
    process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "true";
    process.env.AIF_REQUIREMENTS_QA_ENABLED = "true";
    resetEnvCache();
    vi.mocked(runQa).mockImplementation(async (taskId: string) => {
      const fingerprint = buildTaskQaSourceFingerprint(taskId);
      recordTaskStageArtifactAttempt({
        taskId,
        stage: "qa",
        kind: "qa",
        label: "QA artifact",
        path: "qa.md",
        state: "accepted",
        summary: "QA passed.",
        markdown: "# QA\n\nPassed.",
        metadata: {
          status: "passed",
          sourceFingerprint: fingerprint,
          commands: [
            {
              id: "manifest:unit-tests",
              command: "npm.cmd test --workspace=@aif/agent -- qa",
              status: "passed",
              mandatory: true,
              outputSummary: "Tests passed.",
            },
          ],
        },
      });
    });
  });

  it("routes accepted review to qa and records acceptance before done", async () => {
    seedReviewTask({ id: "qa-review" });

    await pollAndProcess();
    expect(findTaskById("qa-review")?.status).toBe("done");
    expect(runQa).toHaveBeenCalledOnce();
    expect(hasFreshAcceptedTaskAcceptancePack("qa-review")).toBe(true);
  });

  it("routes skipReview implementer success through QA before done", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "qa-skip-review",
        projectId: "qa-project",
        title: "qa-skip-review",
        description: "Task skips review but still needs QA.",
        status: "implementing",
        autoMode: true,
        skipReview: true,
        taskIntent: "general",
        implementationManifestJson: JSON.stringify(manifest("qa-skip-review")),
      })
      .run();

    await pollAndProcess();
    expect(runImplementer).toHaveBeenCalledOnce();
    expect(runQa).toHaveBeenCalledOnce();
    expect(findTaskById("qa-skip-review")?.status).toBe("done");
    expect(hasFreshAcceptedTaskAcceptancePack("qa-skip-review")).toBe(true);
  });

  it("blocks accepted review at QA instead of allowing direct done when QA writes no artifact", async () => {
    seedReviewTask({ id: "qa-direct-done-reroute" });
    vi.mocked(runQa).mockResolvedValueOnce(undefined);

    await pollAndProcess();

    const task = findTaskById("qa-direct-done-reroute");
    expect(runQa).toHaveBeenCalledOnce();
    expect(task?.status).toBe("blocked_external");
    expect(task?.blockedFromStatus).toBe("qa");
    expect(hasFreshAcceptedTaskAcceptancePack("qa-direct-done-reroute")).toBe(false);
  });

  it("blocks stale QA artifacts after the source fingerprint changes", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "qa-stale",
        projectId: "qa-project",
        title: "qa-stale",
        description: "Task already routed to QA.",
        status: "qa",
        autoMode: true,
        taskIntent: "feature",
        implementationManifestJson: JSON.stringify(manifest("qa-stale")),
        reviewComments: "Original review accepted.",
        reviewIterationCount: 1,
      })
      .run();
    const staleFingerprint = buildTaskQaSourceFingerprint("qa-stale");
    recordTaskStageArtifactAttempt({
      taskId: "qa-stale",
      stage: "qa",
      kind: "qa",
      label: "Stale QA artifact",
      path: "qa.md",
      state: "accepted",
      summary: "QA passed before review changed.",
      markdown: "# QA\n\nPassed before review changed.",
      metadata: {
        status: "passed",
        sourceFingerprint: staleFingerprint,
        commands: [
          {
            id: "manifest:unit-tests",
            command: "npm.cmd test --workspace=@aif/agent -- qa",
            status: "passed",
            mandatory: true,
            outputSummary: "Tests passed.",
          },
        ],
      },
    });
    updateTaskStatus("qa-stale", "qa", {
      reviewComments: "Updated review accepted.",
      reviewIterationCount: 2,
    });
    vi.mocked(runQa).mockResolvedValueOnce(undefined);

    await pollAndProcess();

    const task = findTaskById("qa-stale");
    expect(runQa).toHaveBeenCalledOnce();
    expect(task?.status).toBe("blocked_external");
    expect(task?.blockedFromStatus).toBe("qa");
    expect(hasFreshAcceptedTaskAcceptancePack("qa-stale")).toBe(false);
  });

  it("preserves blocked QA output without recording acceptance", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "qa-failed-output",
        projectId: "qa-project",
        title: "qa-failed-output",
        description: "Task already routed to QA.",
        status: "qa",
        autoMode: true,
        taskIntent: "feature",
        implementationManifestJson: JSON.stringify(manifest("qa-failed-output")),
        reviewComments: "Review accepted.",
      })
      .run();
    vi.mocked(runQa).mockImplementationOnce(async (taskId: string) => {
      updateTaskStatus(taskId, "blocked_external", {
        blockedReason: "qa_failed: mandatory check failed",
        blockedFromStatus: "qa",
        manualReviewRequired: true,
      });
    });

    await pollAndProcess();

    const task = findTaskById("qa-failed-output");
    expect(runQa).toHaveBeenCalledOnce();
    expect(task?.status).toBe("blocked_external");
    expect(task?.blockedFromStatus).toBe("qa");
    expect(task?.blockedReason).toContain("qa_failed");
    expect(hasFreshAcceptedTaskAcceptancePack("qa-failed-output")).toBe(false);
  });

  it("blocks done when QA falsely accepts missing verification evidence", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "qa-missing-evidence",
        projectId: "qa-project",
        title: "qa-missing-evidence",
        description: "Task already routed to QA.",
        status: "qa",
        autoMode: true,
        taskIntent: "feature",
        implementationManifestJson: JSON.stringify(
          manifestWithoutVerification("qa-missing-evidence"),
        ),
        reviewComments: "Review accepted.",
      })
      .run();
    vi.mocked(runQa).mockImplementationOnce(async (taskId: string) => {
      const fingerprint = buildTaskQaSourceFingerprint(taskId);
      recordTaskStageArtifactAttempt({
        taskId,
        stage: "qa",
        kind: "qa",
        label: "QA artifact",
        path: "qa.md",
        state: "accepted",
        summary: "QA falsely passed.",
        markdown: "# QA\n\nPassed.",
        metadata: {
          status: "passed",
          sourceFingerprint: fingerprint,
          commands: [
            {
              id: "implementation-manifest:verification-evidence",
              command: "",
              status: "passed",
              mandatory: true,
              outputSummary: "Evidence was missing.",
            },
          ],
        },
      });
    });

    await pollAndProcess();
    expect(findTaskById("qa-missing-evidence")?.status).toBe("blocked_external");
    expect(findTaskById("qa-missing-evidence")?.blockedFromStatus).toBe("qa");
    expect(hasFreshAcceptedTaskAcceptancePack("qa-missing-evidence")).toBe(false);
  });
});
