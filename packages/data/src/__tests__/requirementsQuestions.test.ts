import { describe, it, expect, beforeEach, vi } from "vitest";
import { projects } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

const {
  answerTaskRequirementQuestionBatch,
  createTask,
  createTaskRequirementQuestionBatch,
  findTaskById,
  getTaskRequirementQuestionsResponse,
} = await import("../index.js");

function seedProject(id = "proj-questions") {
  testDb.current
    .insert(projects)
    .values({ id, name: "Questions", rootPath: "/tmp/questions" })
    .run();
}

describe("requirements questions", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
  });

  it("creates a blocking batch and auto-resumes only after all blocking answers are submitted", () => {
    const task = createTask({
      projectId: "proj-questions",
      title: "Notifications",
      description: "Need better notifications",
    });
    expect(task).toBeDefined();

    const created = createTaskRequirementQuestionBatch({
      taskId: task!.id,
      stage: "requirements_analysis",
      targetResumeStage: "requirements_analysis",
      questions: [
        {
          stage: "requirements_analysis",
          idempotencyKey: "primary-user-role",
          question: "Who is the primary user?",
          whyNeeded: "The actor determines the workflow.",
          blocking: true,
          answerType: "textarea",
        },
        {
          stage: "requirements_analysis",
          idempotencyKey: "acceptance-criteria",
          question: "What should count as done?",
          whyNeeded: "Acceptance criteria are needed for verification.",
          blocking: true,
          answerType: "textarea",
        },
      ],
    });

    expect(created.batchId).toBeTruthy();
    expect(created.response?.openBlockingCount).toBe(2);
    expect(findTaskById(task!.id)?.status).toBe("needs_input");

    answerTaskRequirementQuestionBatch({
      taskId: task!.id,
      batchId: created.batchId!,
      answers: [{ questionId: created.questions[0].id, answer: "Administrators" }],
      autoResume: true,
    });

    expect(findTaskById(task!.id)?.status).toBe("needs_input");
    expect(getTaskRequirementQuestionsResponse(task!.id)?.openBlockingCount).toBe(1);

    const resumed = answerTaskRequirementQuestionBatch({
      taskId: task!.id,
      batchId: created.batchId!,
      answers: [{ questionId: created.questions[1].id, answer: "Admin sees event alerts." }],
      autoResume: true,
    });

    expect(resumed.resumed).toBe(true);
    expect(resumed.resumeStatus).toBe("requirements_analysis");
    expect(findTaskById(task!.id)?.status).toBe("requirements_analysis");
    expect(getTaskRequirementQuestionsResponse(task!.id)?.openBlockingCount).toBe(0);
  });

  it("rejects secret-like answers and leaves the question open", () => {
    const task = createTask({
      projectId: "proj-questions",
      title: "Credential ref",
      description: "Need a credential reference",
    });
    const created = createTaskRequirementQuestionBatch({
      taskId: task!.id,
      stage: "requirements_analysis",
      questions: [
        {
          stage: "requirements_analysis",
          idempotencyKey: "credential-ref",
          question: "Which credential_ref should be used?",
          whyNeeded: "The implementation needs a reference without storing the secret.",
          blocking: true,
          answerType: "textarea",
        },
      ],
    });

    expect(() =>
      answerTaskRequirementQuestionBatch({
        taskId: task!.id,
        batchId: created.batchId!,
        answers: [{ questionId: created.questions[0].id, answer: "api_key=sk-secretsecretsecret" }],
      }),
    ).toThrow(/secret/i);

    expect(getTaskRequirementQuestionsResponse(task!.id)?.openBlockingCount).toBe(1);
    expect(findTaskById(task!.id)?.status).toBe("needs_input");
  });

  it("does not auto-resume when an older non-active batch is completed", () => {
    const task = createTask({
      projectId: "proj-questions",
      title: "Two batches",
      description: "Need clarification",
    });
    const first = createTaskRequirementQuestionBatch({
      taskId: task!.id,
      stage: "requirements_analysis",
      targetResumeStage: "requirements_analysis",
      questions: [
        {
          stage: "requirements_analysis",
          idempotencyKey: "first-scope",
          question: "What is first scope?",
          whyNeeded: "Scope is required.",
          blocking: true,
          answerType: "textarea",
        },
      ],
    });
    const second = createTaskRequirementQuestionBatch({
      taskId: task!.id,
      stage: "requirements_analysis",
      targetResumeStage: "requirements_analysis",
      questions: [
        {
          stage: "requirements_analysis",
          idempotencyKey: "second-acceptance",
          question: "What is done?",
          whyNeeded: "Acceptance criteria are required.",
          blocking: true,
          answerType: "textarea",
        },
      ],
    });

    expect(findTaskById(task!.id)?.needsInputBatchId).toBe(second.batchId);

    const result = answerTaskRequirementQuestionBatch({
      taskId: task!.id,
      batchId: first.batchId!,
      answers: [{ questionId: first.questions[0].id, answer: "Only email notices" }],
      autoResume: true,
    });

    expect(result.resumed).toBe(false);
    expect(findTaskById(task!.id)?.status).toBe("needs_input");
    expect(getTaskRequirementQuestionsResponse(task!.id)?.openBlockingCount).toBe(1);
  });
});
