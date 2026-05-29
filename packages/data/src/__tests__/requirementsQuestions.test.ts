import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  parseAifRaiseQuestionsContract,
  projects,
  taskRequirementQuestions,
  taskRequirementsSnapshots,
  tasks,
} from "@aif/shared";
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
  buildTaskRequirementsContextForPrompt,
  createTask,
  createCurrentRequirementsSnapshot,
  createTaskRequirementQuestionBatch,
  findTaskById,
  getCurrentRequirementsSnapshot,
  getTaskStageArtifactGateState,
  getTaskRequirementsSnapshotResponse,
  getTaskRequirementQuestionsResponse,
  hasCurrentRequirementsSnapshotOrWaiver,
  hasAcceptedTaskStageArtifactOrWaiver,
  recordRequirementsSnapshotWaiver,
  recordTaskStageArtifactAttempt,
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

  it.each(["planning", "implementing", "review", "qa"] as const)(
    "parses aif-raise-questions contract with %s resume target",
    (stage) => {
      const parsed = parseAifRaiseQuestionsContract(`Before
\`\`\`aif-raise-questions
{
  "version": 1,
  "action": "raise_questions",
  "stage": "${stage}",
  "targetResumeStage": "${stage}",
  "reason": "A product decision is required before ${stage} can continue.",
  "questions": [
    {
      "idempotencyKey": "${stage}-clarification",
      "question": "Which product behavior should ${stage} assume?",
      "whyNeeded": "The lifecycle stage needs a product answer before continuing.",
      "answerType": "textarea"
    }
  ]
}
\`\`\``);

      expect(parsed).toEqual(
        expect.objectContaining({
          version: 1,
          action: "raise_questions",
          stage,
          targetResumeStage: stage,
          reason: `A product decision is required before ${stage} can continue.`,
        }),
      );
      expect(parsed?.questions).toEqual([
        expect.objectContaining({
          stage,
          targetResumeStage: stage,
          idempotencyKey: `${stage}-clarification`,
          question: `Which product behavior should ${stage} assume?`,
          whyNeeded: "The lifecycle stage needs a product answer before continuing.",
          blocking: true,
          answerType: "textarea",
        }),
      ]);
    },
  );

  it("rejects invalid aif-raise-questions parser inputs", () => {
    expect(
      parseAifRaiseQuestionsContract("No structured product questions here."),
    ).toBeNull();
    expect(() =>
      parseAifRaiseQuestionsContract(`\`\`\`aif-raise-questions
{"version":1,"action":"raise_questions","stage":"planning","reason":"Need input.","questions":[]}
\`\`\``),
    ).toThrow(/non-empty array/i);
    expect(() =>
      parseAifRaiseQuestionsContract(`\`\`\`aif-raise-questions
{"version":1,"action":"raise_questions","stage":"planning","reason":"Need input.","questions":[{"question":"What password should we use?","whyNeeded":"Need credentials."}]}
\`\`\``),
    ).toThrow(/raw secret/i);
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

  it.each([
    ["research", "research"],
    ["design", "design"],
  ] as const)("auto-resumes %s questions to %s status", (stage, expectedStatus) => {
    const task = createTask({
      projectId: "proj-questions",
      title: `${stage} clarification`,
      description: "Need lifecycle-stage clarification",
    });

    const created = createTaskRequirementQuestionBatch({
      taskId: task!.id,
      stage,
      targetResumeStage: stage,
      questions: [
        {
          stage,
          idempotencyKey: `${stage}-scope`,
          question: `What should ${stage} cover?`,
          whyNeeded: "The stage needs product clarification before continuing.",
          blocking: true,
          answerType: "textarea",
        },
      ],
    });

    expect(findTaskById(task!.id)?.status).toBe("needs_input");

    const resumed = answerTaskRequirementQuestionBatch({
      taskId: task!.id,
      batchId: created.batchId!,
      answers: [{ questionId: created.questions[0].id, answer: "Cover the current task scope." }],
      autoResume: true,
    });

    expect(resumed.resumed).toBe(true);
    expect(resumed.resumeStatus).toBe(expectedStatus);
    expect(findTaskById(task!.id)?.status).toBe(expectedStatus);
  });

  it.each(["planning", "implementing", "review", "qa"] as const)(
    "auto-resumes active downstream %s question batches to their target stage",
    (stage) => {
      const task = createTask({
        projectId: "proj-questions",
        title: `${stage} clarification`,
        description: "Need downstream lifecycle-stage clarification",
      });

      const created = createTaskRequirementQuestionBatch({
        taskId: task!.id,
        stage,
        targetResumeStage: stage,
        questions: [
          {
            stage,
            idempotencyKey: `${stage}-product-decision`,
            question: `What product decision should ${stage} use?`,
            whyNeeded: "The lifecycle stage needs product clarification before continuing.",
            blocking: true,
            answerType: "textarea",
          },
        ],
      });

      expect(findTaskById(task!.id)?.status).toBe("needs_input");

      const resumed = answerTaskRequirementQuestionBatch({
        taskId: task!.id,
        batchId: created.batchId!,
        answers: [{ questionId: created.questions[0].id, answer: "Use the documented behavior." }],
        autoResume: true,
      });

      expect(resumed.resumed).toBe(true);
      expect(resumed.resumeStatus).toBe(stage);
      expect(findTaskById(task!.id)?.status).toBe(stage);
    },
  );

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

  it("creates redacted versioned requirements snapshots and updates the task pointer", () => {
    const task = createTask({
      projectId: "proj-questions",
      title: "Snapshot",
      description: "Need captured requirements",
    })!;
    testDb.current
      .insert(taskRequirementQuestions)
      .values({
        id: "q-secret",
        taskId: task.id,
        projectId: task.projectId,
        stage: "requirements_analysis",
        targetResumeStage: "requirements_analysis",
        cycleNumber: 1,
        batchId: "batch-1",
        question: "Which credential_ref should be used?",
        whyNeeded: "Implementation needs a reference.",
        status: "answered",
        answer: "api_key=sk-secretsecretsecretsecret",
        answerAuthor: "human",
        answeredAt: "2026-05-28T00:00:00.000Z",
      })
      .run();

    const first = createCurrentRequirementsSnapshot(task.id);
    const second = createCurrentRequirementsSnapshot(task.id);
    const snapshotRows = testDb.current
      .select()
      .from(taskRequirementsSnapshots)
      .where(eq(taskRequirementsSnapshots.taskId, task.id))
      .all();
    const persistedTask = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id))
      .get();

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.markdown).toContain("[REDACTED_SECRET_LIKE_ANSWER]");
    expect(second.markdown).not.toContain("sk-secretsecretsecretsecret");
    expect(second.summary).not.toContain("sk-secretsecretsecretsecret");
    expect(second.redactionCount).toBe(1);
    expect(snapshotRows).toHaveLength(2);
    expect(persistedTask?.requirementsSnapshotId).toBe(second.id);
    expect(getCurrentRequirementsSnapshot(task.id)?.id).toBe(second.id);
    expect(() =>
      testDb.current
        .insert(taskRequirementsSnapshots)
        .values({
          id: "duplicate-version",
          taskId: task.id,
          projectId: task.projectId,
          version: second.version,
          markdown: "duplicate",
          summary: "duplicate",
        })
        .run(),
    ).toThrow();
  });

  it("records requirements snapshot waivers and builds stage-neutral prompt context", () => {
    const task = createTask({
      projectId: "proj-questions",
      title: "Waived snapshot",
      description: "QA can proceed from a waiver",
    })!;

    recordRequirementsSnapshotWaiver(task.id, "Operator accepted legacy requirements.");
    const response = getTaskRequirementsSnapshotResponse(task.id);
    const context = buildTaskRequirementsContextForPrompt(task.id, "qa");

    expect(hasCurrentRequirementsSnapshotOrWaiver(task.id)).toBe(true);
    expect(response).toEqual(
      expect.objectContaining({
        snapshot: null,
        hasWaiver: true,
        waiverJustification: "Operator accepted legacy requirements.",
      }),
    );
    expect(context).toEqual(
      expect.objectContaining({
        stage: "qa",
        hasWaiver: true,
        waiverJustification: "Operator accepted legacy requirements.",
      }),
    );
    expect(context?.markdown).toContain("Requirements snapshot waived");
  });

  it("includes accepted upstream research and design artifacts in planning context", () => {
    const task = createTask({
      projectId: "proj-questions",
      title: "Planning context",
      description: "Planning needs upstream context",
    })!;

    recordRequirementsSnapshotWaiver(task.id, "Operator accepted legacy requirements.");
    const researchAttempt = recordTaskStageArtifactAttempt({
      taskId: task.id,
      stage: "research",
      kind: "research",
      label: "Research artifact",
      path: "research.md",
      state: "accepted",
      summary: "Research summary.",
      markdown: "# Research\n\nCritical research-only fact: offline mode is mandatory.",
    });
    recordTaskStageArtifactAttempt({
      taskId: task.id,
      stage: "design",
      kind: "design",
      label: "Design artifact",
      path: "design.md",
      state: "accepted",
      summary: "Design summary.",
      markdown: "# Design\n\nCritical design-only decision: use a local queue.",
      metadata: {
        sourceResearchArtifactId: researchAttempt.artifactId,
        sourceResearchAttemptNumber: researchAttempt.attemptNumber,
      },
    });
    recordTaskStageArtifactAttempt({
      taskId: task.id,
      stage: "review",
      kind: "review_report",
      label: "Review artifact",
      state: "accepted",
      summary: "Review should not be upstream of planning.",
    });

    const context = buildTaskRequirementsContextForPrompt(task.id, "planning");

    expect(hasAcceptedTaskStageArtifactOrWaiver(task.id, "research", "research")).toBe(true);
    expect(hasAcceptedTaskStageArtifactOrWaiver(task.id, "design", "design")).toBe(true);
    expect(context?.stageArtifacts.map((artifact) => artifact.stage)).toEqual([
      "requirements_analysis",
      "research",
      "design",
    ]);
    expect(context?.markdown).toContain("Critical research-only fact: offline mode is mandatory.");
    expect(context?.markdown).toContain("Critical design-only decision: use a local queue.");
    expect(context?.markdown).not.toContain("Review should not be upstream of planning.");

    const designContext = buildTaskRequirementsContextForPrompt(task.id, "design");
    expect(designContext?.markdown).toContain(
      "Critical research-only fact: offline mode is mandatory.",
    );
    expect(designContext?.markdown).not.toContain("Critical design-only decision");
  });

  it("includes answered stage-local questions that are newer than the requirements snapshot", () => {
    const task = createTask({
      projectId: "proj-questions",
      title: "Research resume context",
      description: "Research needs stage-local clarification",
    })!;
    createCurrentRequirementsSnapshot(task.id);
    const batch = createTaskRequirementQuestionBatch({
      taskId: task.id,
      stage: "research",
      targetResumeStage: "research",
      questions: [
        {
          stage: "research",
          idempotencyKey: "offline-requirement",
          question: "Does research need to cover offline usage?",
          whyNeeded: "The research artifact must not miss offline constraints.",
          blocking: true,
          answerType: "textarea",
        },
      ],
    });

    const resumed = answerTaskRequirementQuestionBatch({
      taskId: task.id,
      batchId: batch.batchId!,
      answers: [{ questionId: batch.questions[0].id, answer: "Yes, offline mode is required." }],
      autoResume: true,
    });
    const context = buildTaskRequirementsContextForPrompt(task.id, "research");

    expect(resumed.resumeStatus).toBe("research");
    expect(context?.markdown).toContain("Answered Questions Since Current Requirements Snapshot");
    expect(context?.markdown).toContain("Does research need to cover offline usage?");
    expect(context?.markdown).toContain("Answer: Yes, offline mode is required.");
  });

  it("does not satisfy research/design gates with artifacts from an older requirements snapshot", () => {
    const task = createTask({
      projectId: "proj-questions",
      title: "Stale artifacts",
      description: "Requirements can be regenerated",
    })!;
    const snapshot1 = createCurrentRequirementsSnapshot(task.id);
    const researchAttempt = recordTaskStageArtifactAttempt({
      taskId: task.id,
      stage: "research",
      kind: "research",
      label: "Research artifact",
      path: "research.md",
      state: "accepted",
      summary: "Stale research summary.",
      markdown: "# Research\n\nStale research body.",
      sourceSnapshotId: snapshot1.id,
    });
    recordTaskStageArtifactAttempt({
      taskId: task.id,
      stage: "design",
      kind: "design",
      label: "Design artifact",
      path: "design.md",
      state: "accepted",
      summary: "Stale design summary.",
      markdown: "# Design\n\nStale design body.",
      sourceSnapshotId: snapshot1.id,
      metadata: {
        sourceResearchArtifactId: researchAttempt.artifactId,
        sourceResearchAttemptNumber: researchAttempt.attemptNumber,
      },
    });
    const snapshot2 = createCurrentRequirementsSnapshot(task.id);

    const gate = getTaskStageArtifactGateState(task.id, [
      { stage: "research", kind: "research", label: "Research artifact" },
      { stage: "design", kind: "design", label: "Design artifact" },
    ]);
    const context = buildTaskRequirementsContextForPrompt(task.id, "planning");

    expect(snapshot2.id).not.toBe(snapshot1.id);
    expect(gate.ok).toBe(false);
    expect(gate.issues.map((issue) => issue.stage)).toEqual(["research", "design"]);
    expect(gate.issues[0].summary).toContain("current snapshot");
    expect(hasAcceptedTaskStageArtifactOrWaiver(task.id, "research", "research")).toBe(false);
    expect(hasAcceptedTaskStageArtifactOrWaiver(task.id, "design", "design")).toBe(false);
    expect(context?.markdown).not.toContain("Stale research body.");
    expect(context?.markdown).not.toContain("Stale design body.");
  });
});
