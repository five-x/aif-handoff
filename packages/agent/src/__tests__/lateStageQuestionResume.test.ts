import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { projects, resetEnvCache, taskRequirementQuestions, tasks } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };
const { executeSubagentQueryMock } = vi.hoisted(() => ({
  executeSubagentQueryMock: vi.fn(),
}));

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("../subagentQuery.js", () => ({
  executeSubagentQuery: executeSubagentQueryMock,
  startHeartbeat: () => setInterval(() => undefined, 60_000),
}));

const { runImplementer } = await import("../subagents/implementer.js");
const { runPlanner } = await import("../subagents/planner.js");
const { runQa } = await import("../subagents/qa.js");
const { runReviewer } = await import("../subagents/reviewer.js");
const { runResearchDesignStage } = await import("../subagents/researchDesignStage.js");
const { formatRaiseQuestionsPromptGuidance } = await import("../subagents/raiseQuestions.js");
const { findTaskById, getTaskRequirementQuestionsResponse } = await import("@aif/data");

function seedProject(): void {
  testDb.current
    .insert(projects)
    .values({ id: "late-stage-project", name: "Late Stage", rootPath: "/tmp/late-stage" })
    .run();
}

function raiseQuestions(stage: "planning" | "implementing" | "review" | "qa"): string {
  return [
    "```aif-raise-questions",
    JSON.stringify({
      version: 1,
      action: "raise_questions",
      stage,
      targetResumeStage: stage,
      reason: `${stage} requires product clarification`,
      questions: [
        {
          idempotencyKey: `${stage}-decision`,
          question: `What product decision should ${stage} use?`,
          whyNeeded: "The lifecycle stage cannot continue without this product decision.",
          blocking: true,
          answerType: "textarea",
        },
      ],
    }),
    "```",
  ].join("\n");
}

function stageArtifactQuestions(stage: "research" | "design"): string {
  return [
    "```aif-stage-artifact",
    JSON.stringify({
      version: 1,
      stage,
      status: "questions",
      summary: `${stage} requires product clarification`,
      markdown: null,
      questions: [
        {
          idempotencyKey: `${stage}-decision`,
          question: `What product decision should ${stage} use?`,
          whyNeeded: "The lifecycle stage cannot continue without this product decision.",
          placeholder: "Describe the decision.",
        },
      ],
    }),
    "```",
  ].join("\n");
}

function seedTask(input: {
  id: string;
  status: "research" | "design" | "planning" | "implementing" | "review" | "qa";
}) {
  testDb.current
    .insert(tasks)
    .values({
      id: input.id,
      projectId: "late-stage-project",
      title: input.id,
      description: "Needs product clarification.",
      status: input.status,
      taskIntent: "general",
      plan: "## Plan\n- [ ] Implement product behavior.",
      implementationLog: "Changed product behavior.",
      reviewComments: "Review pending.",
    })
    .run();
}

function expectNeedsInput(taskId: string, stage: "planning" | "implementing" | "review" | "qa") {
  const task = findTaskById(taskId);
  const questionState = getTaskRequirementQuestionsResponse(taskId);
  const batch = questionState?.batches[0];

  expect(task?.status).toBe("needs_input");
  expect(task?.needsInputStage).toBe(stage);
  expect(task?.needsInputBatchId).toBe(batch?.batchId);
  expect(batch?.stage).toBe(stage);
  expect(batch?.targetResumeStage).toBe(stage);
  expect(batch?.openBlockingCount).toBe(1);
  expect(batch?.questions[0]?.sourceAgent).toBeTruthy();
}

describe("late-stage raise_questions routing", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
    process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "true";
    resetEnvCache();
    executeSubagentQueryMock.mockReset();
    executeSubagentQueryMock.mockResolvedValue({ resultText: "" });
  });

  it("documents the parser-supported fence language in stage prompts", () => {
    const guidance = formatRaiseQuestionsPromptGuidance("planning");

    expect(guidance).toContain("```aif-raise-questions");
    expect(guidance).not.toContain("```json");
  });

  it("routes planner product questions to needs_input without persisting a plan", async () => {
    seedTask({ id: "planner-question", status: "planning" });
    executeSubagentQueryMock.mockResolvedValueOnce({ resultText: raiseQuestions("planning") });

    await runPlanner("planner-question", "/tmp/late-stage");

    expectNeedsInput("planner-question", "planning");
    expect(findTaskById("planner-question")?.plan).toBe(
      "## Plan\n- [ ] Implement product behavior.",
    );
  });

  it("routes implementer product questions to needs_input without review handoff", async () => {
    seedTask({ id: "implementer-question", status: "implementing" });
    executeSubagentQueryMock.mockResolvedValueOnce({ resultText: raiseQuestions("implementing") });

    await runImplementer("implementer-question", "/tmp/late-stage");

    expectNeedsInput("implementer-question", "implementing");
    expect(findTaskById("implementer-question")?.implementationLog).toBe(
      "Changed product behavior.",
    );
  });

  it("routes reviewer product questions to needs_input before structured review parsing", async () => {
    seedTask({ id: "reviewer-question", status: "review" });
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => ({
      resultText:
        input.agentName === "aif-review"
          ? raiseQuestions("review")
          : [
              "## Blocking Findings",
              "- none",
              "",
              "## Advisories",
              "- none",
              "",
              "## Previous Findings",
              "- none",
              "",
              "## Security Coverage",
              "- secret_leaks | not_applicable | No change.",
              "- permissions_sandbox | not_applicable | No change.",
              "- unsafe_shell_network_file | not_applicable | No change.",
              "- dependency_config | not_applicable | No change.",
            ].join("\n"),
    }));

    await runReviewer("reviewer-question", "/tmp/late-stage");

    expectNeedsInput("reviewer-question", "review");
    expect(findTaskById("reviewer-question")?.reviewComments).toBe("Review pending.");
  });

  it("routes QA product questions to needs_input instead of blocked_external", async () => {
    seedTask({ id: "qa-question", status: "qa" });
    executeSubagentQueryMock.mockResolvedValueOnce({ resultText: raiseQuestions("qa") });

    await runQa("qa-question", "/tmp/late-stage");

    expectNeedsInput("qa-question", "qa");
    expect(findTaskById("qa-question")?.blockedReason).toBeNull();
  });

  it("does not create question rows when intake is disabled", async () => {
    process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "false";
    resetEnvCache();
    seedTask({ id: "disabled-question", status: "planning" });
    executeSubagentQueryMock.mockResolvedValueOnce({ resultText: raiseQuestions("planning") });

    await runPlanner("disabled-question", "/tmp/late-stage");

    const task = findTaskById("disabled-question");
    const rows = testDb.current
      .select()
      .from(taskRequirementQuestions)
      .where(eq(taskRequirementQuestions.taskId, "disabled-question"))
      .all();
    expect(task?.status).toBe("blocked_external");
    expect(task?.blockedFromStatus).toBe("planning");
    expect(task?.blockedReason).toContain("requirements intake is disabled");
    expect(rows).toHaveLength(0);
  });

  it.each(["research", "design"] as const)(
    "blocks legacy %s stage questions without rows when intake is disabled",
    async (stage) => {
      process.env.AIF_REQUIREMENTS_INTAKE_ENABLED = "false";
      resetEnvCache();
      seedTask({ id: `${stage}-disabled-question`, status: stage });
      executeSubagentQueryMock.mockResolvedValueOnce({ resultText: stageArtifactQuestions(stage) });

      await runResearchDesignStage(stage, `${stage}-disabled-question`, "/tmp/late-stage");

      const task = findTaskById(`${stage}-disabled-question`);
      const rows = testDb.current
        .select()
        .from(taskRequirementQuestions)
        .where(eq(taskRequirementQuestions.taskId, `${stage}-disabled-question`))
        .all();
      expect(task?.status).toBe("blocked_external");
      expect(task?.blockedFromStatus).toBe(stage);
      expect(task?.blockedReason).toContain("requirements intake is disabled");
      expect(rows).toHaveLength(0);
    },
  );
});
