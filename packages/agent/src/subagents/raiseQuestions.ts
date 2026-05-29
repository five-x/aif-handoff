import {
  appendTaskActivityLog,
  createTaskRequirementQuestionBatch,
  findTaskById,
  getTaskRequirementQuestionsResponse,
  setTaskFields,
} from "@aif/data";
import {
  AIF_RAISE_QUESTIONS_FENCE_LANGUAGE,
  getEnv,
  parseAifRaiseQuestionsContract,
  type RequirementQuestionStage,
} from "@aif/shared";

export function formatRaiseQuestionsPromptGuidance(stage: RequirementQuestionStage): string {
  return [
    "Product clarification contract:",
    `- If this ${stage} stage cannot continue only because product behavior, scope, or acceptance intent is unclear, return exactly one fenced \`aif-raise-questions\` JSON block instead of the normal stage output.`,
    "- Do not use this for runtime failures, missing repository access, permissions, external services, malformed inputs, safety concerns, or operator/runtime triage; those remain blocked_external/manual-review paths.",
    "- Never ask for raw secrets. Ask for a credential reference when needed.",
    `\`\`\`${AIF_RAISE_QUESTIONS_FENCE_LANGUAGE}`,
    JSON.stringify(
      {
        version: 1,
        action: "raise_questions",
        stage,
        targetResumeStage: stage,
        reason: `Product clarification is required before ${stage} can continue.`,
        questions: [
          {
            idempotencyKey: `${stage}-product-clarification`,
            question: "What product behavior should this stage assume?",
            whyNeeded: "The stage cannot proceed safely without this product decision.",
            blocking: true,
            answerType: "textarea",
            placeholder: "Describe the expected behavior, scope, or acceptance criteria.",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

export function handleRaiseQuestionsOutput(input: {
  taskId: string;
  output: string;
  stage: RequirementQuestionStage;
  sourceAgent: string;
  sourcePromptHash?: string | null;
}): boolean {
  const contract = parseAifRaiseQuestionsContract(input.output);
  if (!contract) return false;
  if (contract.stage !== input.stage) {
    throw new Error(`aif-raise-questions.stage must be ${input.stage} for ${input.sourceAgent}`);
  }

  const task = findTaskById(input.taskId);
  const nowIso = new Date().toISOString();
  if (!getEnv().AIF_REQUIREMENTS_INTAKE_ENABLED) {
    setTaskFields(input.taskId, {
      status: "blocked_external",
      blockedFromStatus: task?.status ?? "blocked_external",
      blockedReason: `${input.sourceAgent}_raise_questions_disabled: requirements intake is disabled`,
      retryAfter: null,
      retryCount: task?.retryCount ?? 0,
      manualReviewRequired: true,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    appendTaskActivityLog(
      input.taskId,
      `[${nowIso}] ${input.sourceAgent} emitted product questions while requirements intake is disabled; blocked for manual triage.`,
    );
    return true;
  }

  const result = createTaskRequirementQuestionBatch({
    taskId: input.taskId,
    stage: contract.stage,
    targetResumeStage: contract.targetResumeStage,
    reason: contract.reason,
    questions: contract.questions.map((question) => ({
      ...question,
      sourceAgent: input.sourceAgent,
      sourcePromptHash: input.sourcePromptHash ?? null,
    })),
    sourceAgent: input.sourceAgent,
    sourcePromptHash: input.sourcePromptHash ?? null,
  });

  if (!result.batchId) {
    const questionState = result.response ?? getTaskRequirementQuestionsResponse(input.taskId);
    const activeBatch = questionState?.batches.find((batch) => batch.status === "open") ?? null;
    if (activeBatch && questionState && questionState.openBlockingCount > 0) {
      setTaskFields(input.taskId, {
        status: "needs_input",
        needsInputBatchId: activeBatch.batchId,
        needsInputStage: activeBatch.stage,
        needsInputReason: contract.reason,
        lastHeartbeatAt: nowIso,
        updatedAt: nowIso,
      });
      return true;
    }

    setTaskFields(input.taskId, {
      status: "blocked_external",
      blockedFromStatus: task?.status ?? "blocked_external",
      blockedReason: `${input.sourceAgent}_raise_questions_empty: no new clarification questions were created`,
      retryAfter: null,
      retryCount: task?.retryCount ?? 0,
      manualReviewRequired: true,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    appendTaskActivityLog(
      input.taskId,
      `[${nowIso}] ${input.sourceAgent} emitted product questions but no new question batch was created.`,
    );
    return true;
  }

  appendTaskActivityLog(
    input.taskId,
    `[${nowIso}] ${input.sourceAgent} raised product clarification questions: batch=${result.batchId} resume=${contract.targetResumeStage}`,
  );
  return true;
}
