import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyHumanTaskEvent,
  projects,
  resetEnvCache,
  taskRequirementsSnapshots,
  taskStageArtifacts,
  tasks,
  type ImplementationManifest,
  type TaskStatus,
} from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "true";
process.env.AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED = "true";
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
const { runResearcher } = await import("../subagents/researcher.js");
const { runDesigner } = await import("../subagents/designer.js");
const { runPlanner } = await import("../subagents/planner.js");
const { runPlanChecker } = await import("../subagents/planChecker.js");
const { runImplementer } = await import("../subagents/implementer.js");
const { runReviewer } = await import("../subagents/reviewer.js");
const { runQa } = await import("../subagents/qa.js");
const {
  answerTaskRequirementQuestionBatch,
  buildTaskQaSourceFingerprint,
  findTaskById,
  getCurrentRequirementsSnapshot,
  getTaskRequirementQuestionsResponse,
  hasFreshAcceptedTaskAcceptancePack,
  recordTaskStageArtifactAttempt,
  setTaskFields,
} = await import("@aif/data");

function seedProject(): void {
  testDb.current
    .insert(projects)
    .values({ id: "requirements-canary-project", name: "Requirements Canary", rootPath: "/tmp" })
    .run();
}

function implementationManifest(taskId: string): ImplementationManifest {
  return {
    version: 1,
    taskId,
    intent: "feature",
    planManifestHash: null,
    changedFiles: [{ path: "packages/app/src/canary.ts", status: "modified" }],
    diffSummary: { summary: "Implemented the canary feature." },
    verificationEvidence: [
      {
        id: "canary-tests",
        command: "npm.cmd test --workspace=@aif/agent -- requirementsLifecycleCanary",
        status: "passed",
        outputSha256: "c".repeat(64),
        outputPreview: "Canary checks passed.",
      },
    ],
    acceptanceCriteria: [],
    evidenceRefs: ["canary-tests"],
    planChecklist: { total: 1, completed: 1, pending: 0, synced: true },
    reviewClosure: { status: "passed", evidenceRefs: ["review"] },
    commitEvidence: { status: "not_required" },
    knownLimitations: [],
  };
}

function startAi(taskId: string): void {
  const task = findTaskById(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const transition = applyHumanTaskEvent(task, "start_ai", {
    requirementsIntakeEnabled: true,
  });
  if (!transition.ok) throw new Error(transition.error);
  setTaskFields(taskId, transition.patch);
}

function approveDone(taskId: string): void {
  const task = findTaskById(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const transition = applyHumanTaskEvent(task, "approve_done");
  if (!transition.ok) throw new Error(transition.error);
  setTaskFields(taskId, transition.patch);
}

function expectTaskStatus(taskId: string, status: TaskStatus): void {
  expect(findTaskById(taskId)?.status).toBe(status);
}

function currentArtifact(taskId: string, stage: string, kind: string) {
  return testDb.current
    .select()
    .from(taskStageArtifacts)
    .where(
      and(
        eq(taskStageArtifacts.taskId, taskId),
        eq(taskStageArtifacts.stage, stage),
        eq(taskStageArtifacts.kind, kind),
      ),
    )
    .get();
}

describe("requirements lifecycle canary", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
    vi.clearAllMocks();
    resetCoordinatorRuntimeCountersForTests();
    getStageSemaphore().reset();
    process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "true";
    process.env.AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED = "true";
    process.env.AIF_REQUIREMENTS_QA_ENABLED = "true";
    resetEnvCache();

    vi.mocked(runResearcher).mockImplementation(async (taskId: string) => {
      const snapshot = getCurrentRequirementsSnapshot(taskId);
      recordTaskStageArtifactAttempt({
        taskId,
        stage: "research",
        kind: "research",
        label: "Research artifact",
        path: "research.md",
        state: "accepted",
        summary: "Research accepted for canary.",
        markdown: "# Research\n\nCanary research accepted.",
        sourceSnapshotId: snapshot?.id ?? null,
      });
    });
    vi.mocked(runDesigner).mockImplementation(async (taskId: string) => {
      const snapshot = getCurrentRequirementsSnapshot(taskId);
      const research = currentArtifact(taskId, "research", "research");
      recordTaskStageArtifactAttempt({
        taskId,
        stage: "design",
        kind: "design",
        label: "Design artifact",
        path: "design.md",
        state: "accepted",
        summary: "Design accepted for canary.",
        markdown: "# Design\n\nCanary design accepted.",
        sourceSnapshotId: snapshot?.id ?? null,
        metadata: {
          sourceResearchArtifactId: research?.id ?? null,
          sourceResearchAttemptNumber: research?.currentAttemptNumber ?? null,
        },
      });
    });
    vi.mocked(runPlanner).mockImplementation(async (taskId: string) => {
      setTaskFields(taskId, {
        plan: "## Plan\n- [x] Implement canary feature.\n",
      });
    });
    vi.mocked(runImplementer).mockImplementation(async (taskId: string) => {
      setTaskFields(taskId, {
        implementationLog: "Implemented canary feature.",
        implementationManifestJson: JSON.stringify(implementationManifest(taskId)),
      });
    });
    vi.mocked(runReviewer).mockImplementation(async (taskId: string) => {
      setTaskFields(taskId, {
        reviewComments: "Review accepted for canary.",
      });
    });
    vi.mocked(runQa).mockImplementation(async (taskId: string) => {
      const fingerprint = buildTaskQaSourceFingerprint(taskId);
      recordTaskStageArtifactAttempt({
        taskId,
        stage: "qa",
        kind: "qa",
        label: "QA artifact",
        path: "qa.md",
        state: "accepted",
        summary: "QA passed for canary.",
        markdown: "# QA\n\nCanary QA passed.",
        metadata: {
          status: "passed",
          sourceFingerprint: fingerprint,
          commands: [
            {
              id: "manifest:canary-tests",
              command: "npm.cmd test --workspace=@aif/agent -- requirementsLifecycleCanary",
              status: "passed",
              mandatory: true,
              outputSummary: "Canary checks passed.",
            },
          ],
        },
      });
    });
  });

  it("runs raw idea through requirements, research, design, plan, implementation, review, QA, acceptance, done, and verified", async () => {
    const taskId = "requirements-lifecycle-canary";
    testDb.current
      .insert(tasks)
      .values({
        id: taskId,
        projectId: "requirements-canary-project",
        title: "Raw canary idea",
        description: "Build a thing",
        status: "backlog",
        autoMode: true,
        taskIntent: "general",
        tags: JSON.stringify(["intent:general"]),
      })
      .run();

    startAi(taskId);
    expectTaskStatus(taskId, "requirements_analysis");

    await pollAndProcess();
    expectTaskStatus(taskId, "needs_input");

    const questions = getTaskRequirementQuestionsResponse(taskId);
    const openBatch = questions?.batches.find((batch) => batch.status === "open");
    expect(openBatch?.targetResumeStage).toBe("requirements_analysis");
    expect(openBatch?.questions.length).toBeGreaterThan(0);

    const answered = answerTaskRequirementQuestionBatch({
      taskId,
      batchId: openBatch!.batchId,
      answers: openBatch!.questions.map((question) => ({
        questionId: question.id,
        answer:
          question.idempotencyKey === "primary-user-role"
            ? "Internal operator"
            : question.idempotencyKey === "first-version-scope"
              ? "Include the minimal canary workflow; exclude unrelated settings."
              : "Done when requirements, research, design, implementation, review, QA, acceptance, and verification are all recorded.",
      })),
    });
    expect(answered.resumed).toBe(true);
    expect(answered.resumeStatus).toBe("requirements_analysis");

    await pollAndProcess();

    expect(runResearcher).toHaveBeenCalledOnce();
    expect(runDesigner).toHaveBeenCalledOnce();
    expect(runPlanner).toHaveBeenCalledOnce();
    expect(runPlanChecker).toHaveBeenCalledOnce();
    expect(runImplementer).toHaveBeenCalledOnce();
    expect(runReviewer).toHaveBeenCalledOnce();
    expect(runQa).toHaveBeenCalledOnce();
    expectTaskStatus(taskId, "done");

    const snapshot = getCurrentRequirementsSnapshot(taskId);
    expect(snapshot?.markdown).toContain("# Requirements Snapshot");
    expect(testDb.current.select().from(taskRequirementsSnapshots).all()).toHaveLength(1);

    expect(currentArtifact(taskId, "requirements_analysis", "requirements")).toMatchObject({
      artifactPath: "requirements.md",
      state: "accepted",
    });
    expect(currentArtifact(taskId, "research", "research")).toMatchObject({
      artifactPath: "research.md",
      state: "accepted",
    });
    expect(currentArtifact(taskId, "design", "design")).toMatchObject({
      artifactPath: "design.md",
      state: "accepted",
    });
    expect(currentArtifact(taskId, "qa", "qa")).toMatchObject({
      artifactPath: "qa.md",
      state: "accepted",
    });
    expect(currentArtifact(taskId, "acceptance", "acceptance")).toMatchObject({
      artifactPath: "acceptance.md",
      state: "accepted",
    });
    expect(hasFreshAcceptedTaskAcceptancePack(taskId)).toBe(true);

    approveDone(taskId);
    expectTaskStatus(taskId, "verified");
  });
});
