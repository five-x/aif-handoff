import { beforeEach, describe, expect, it, vi } from "vitest";
import { projects, tasks, type TaskIntent } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

const { createTaskRequirementQuestionBatch, findTaskById, getTaskRequirementQuestionsResponse } =
  await import("@aif/data");
const { runRequirementsAnalyst } = await import("../subagents/requirementsAnalyst.js");

function seedProject(): void {
  testDb.current
    .insert(projects)
    .values({ id: "requirements-analyst-project", name: "Requirements", rootPath: "/tmp/reqs" })
    .run();
}

function seedTask(input: {
  id: string;
  title: string;
  description: string;
  taskIntent?: TaskIntent;
}): void {
  testDb.current
    .insert(tasks)
    .values({
      id: input.id,
      projectId: "requirements-analyst-project",
      title: input.title,
      description: input.description,
      status: "requirements_analysis",
      taskIntent: input.taskIntent ?? "feature",
    })
    .run();
}

describe("requirements analyst", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
  });

  it("does not block infrastructure microtasks on a generic actor question", async () => {
    seedTask({
      id: "skeleton-task",
      title: "Инициализировать скелет: Инициализация структуры проекта и конфигурация окружения",
      description: [
        "Создать только минимальный скелет проекта или фичи для следующих срезов.",
        "File boundaries: package.json, src/app/**, src/main.*, src/index.*",
        "Acceptance criteria: Точка входа приложения или фичи существует и запускается без placeholder-only wiring.",
        "Verification: npm.cmd run build",
        "Dependencies: none",
      ].join("\n"),
    });

    await runRequirementsAnalyst("skeleton-task");

    const task = findTaskById("skeleton-task");
    const questions = getTaskRequirementQuestionsResponse("skeleton-task");
    expect(task?.status).toBe("requirements_analysis");
    expect(task?.requirementsConfidence).toBe(0.86);
    expect(task?.requirementsSnapshotId).toBeTruthy();
    expect(questions?.openBlockingCount ?? 0).toBe(0);
  });

  it("does not block roadmap first-slice tasks just because acceptance mentions a workflow", async () => {
    seedTask({
      id: "first-slice-task",
      title: "Implement first slice: project",
      description: [
        "Implement the first API or visible slice without broad follow-up functions.",
        "Original roadmap item: application skeleton and base configuration",
        "File boundaries: src/app/**, src/components/**, src/routes/**, src/services/**",
        "Acceptance criteria: first visible workflow renders or runs on deterministic sample data.",
        "Verification: npm.cmd test",
        "Dependencies: configure dev stack",
      ].join("\n"),
    });

    await runRequirementsAnalyst("first-slice-task");

    const task = findTaskById("first-slice-task");
    const questions = getTaskRequirementQuestionsResponse("first-slice-task");
    expect(task?.status).toBe("requirements_analysis");
    expect(task?.requirementsConfidence).toBe(0.86);
    expect(task?.requirementsSnapshotId).toBeTruthy();
    expect(questions?.openBlockingCount ?? 0).toBe(0);
  });

  it("does not ask primary actor for internal test-only operator cards with scope and acceptance", async () => {
    seedTask({
      id: "internal-test-only-task",
      title: "Add internal QA permission regression",
      description: [
        "Test-only internal system maintenance card for the AIF runtime.",
        "Scope: packages/agent/src/__tests__/requirementsAnalyst.test.ts only.",
        "Acceptance criteria: permission workflow regression is covered by a deterministic test.",
        "Verification: npm.cmd test --workspace=@aif/agent -- requirementsAnalyst",
      ].join("\n"),
    });

    await runRequirementsAnalyst("internal-test-only-task");

    const task = findTaskById("internal-test-only-task");
    const questions = getTaskRequirementQuestionsResponse("internal-test-only-task");
    expect(task?.requirementsConfidence).toBe(0.86);
    expect(questions?.openBlockingCount ?? 0).toBe(0);
  });

  it("still asks for an actor when the task is actor-dependent and no actor is supplied", async () => {
    seedTask({
      id: "permissions-task",
      title: "Add permission workflow",
      description: [
        "Scope: add a permissions workflow for approving changes.",
        "Acceptance criteria: the approval path is enforced and verified by tests.",
        "Verification: npm test",
      ].join("\n"),
    });

    await runRequirementsAnalyst("permissions-task");

    const task = findTaskById("permissions-task");
    const questions = getTaskRequirementQuestionsResponse("permissions-task");
    expect(task?.status).toBe("needs_input");
    expect(questions?.openBlockingCount).toBe(1);
    expect(questions?.batches[0]?.questions[0]?.idempotencyKey).toBe("primary-user-role");
  });

  it("skips product clarification intake for audit tasks and resolves stale audit questions", async () => {
    seedTask({
      id: "audit-task",
      title: "Audit: security and configuration controls",
      description: "Produce only a diagnostic audit report.",
      taskIntent: "audit",
    });
    createTaskRequirementQuestionBatch({
      taskId: "audit-task",
      stage: "requirements_analysis",
      questions: [
        {
          stage: "requirements_analysis",
          idempotencyKey: "primary-user-role",
          question: "Who is the primary user or actor for this change?",
          whyNeeded: "Product actor questions do not apply to audit cards.",
          blocking: true,
          answerType: "textarea",
        },
      ],
    });

    await runRequirementsAnalyst("audit-task");

    const task = findTaskById("audit-task");
    const questions = getTaskRequirementQuestionsResponse("audit-task");
    expect(task?.status).toBe("requirements_analysis");
    expect(task?.needsInputBatchId).toBeNull();
    expect(task?.requirementsConfidence).toBe(0.86);
    expect(task?.requirementsSnapshotId).toBeTruthy();
    expect(questions?.openBlockingCount ?? 0).toBe(0);
    expect(questions?.batches[0]?.questions[0]?.status).toBe("resolved");
  });
});
