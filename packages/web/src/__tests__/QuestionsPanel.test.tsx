import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRequirementQuestionsResponse } from "@aif/shared/browser";
import { QuestionsPanel } from "../components/task/QuestionsPanel";

const mutateAnswerTaskQuestionBatch = vi.fn();

vi.mock("@/hooks/useTasks", () => ({
  useAnswerTaskQuestionBatch: () => ({
    mutate: mutateAnswerTaskQuestionBatch,
    isPending: false,
  }),
}));

const questions: TaskRequirementQuestionsResponse = {
  taskId: "task-questions",
  projectId: "project-questions",
  openBlockingCount: 1,
  openNonBlockingCount: 0,
  batches: [
    {
      batchId: "batch-1",
      stage: "review",
      targetResumeStage: "qa",
      cycleNumber: 1,
      status: "open",
      openBlockingCount: 1,
      openNonBlockingCount: 0,
      questions: [
        {
          id: "question-1",
          taskId: "task-questions",
          projectId: "project-questions",
          stage: "review",
          targetResumeStage: "qa",
          cycleNumber: 1,
          batchId: "batch-1",
          idempotencyKey: "review-qa-scope",
          question: "Should QA cover this behavior?",
          whyNeeded: "Review needs a product decision before handoff.",
          blocking: true,
          answerType: "textarea",
          options: null,
          defaultAnswer: null,
          placeholder: null,
          status: "open",
          answer: null,
          answerAttachments: null,
          answerAuthor: null,
          answeredAt: null,
          resolvedAt: null,
          resolutionNote: null,
          sourceAgent: "review-sidecar",
          sourcePromptHash: null,
          createdAt: "2026-05-29T00:00:00.000Z",
          updatedAt: "2026-05-29T00:00:00.000Z",
        },
      ],
    },
  ],
};

describe("QuestionsPanel", () => {
  beforeEach(() => {
    mutateAnswerTaskQuestionBatch.mockClear();
  });

  it("shows the active question stage and target resume stage", () => {
    render(<QuestionsPanel taskId="task-questions" questions={questions} />);

    expect(screen.getByText("review")).toBeDefined();
    expect(screen.getByText("resume qa")).toBeDefined();
    expect(screen.getByText("Should QA cover this behavior?")).toBeDefined();
  });
});
