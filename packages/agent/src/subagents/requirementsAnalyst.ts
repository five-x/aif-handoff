import {
  appendTaskActivityLog,
  createCurrentRequirementsSnapshot,
  createTaskRequirementQuestionBatch,
  findTaskById,
  getTaskRequirementQuestionsResponse,
  hasAnsweredRequirementQuestionKey,
  listTaskComments,
  resolveOpenRequirementQuestionsForTask,
  setTaskFields,
} from "@aif/data";
import { getEnv, logger, type TaskRequirementQuestionInput } from "@aif/shared";

const log = logger("requirements-analyst");

interface RequirementQuestionTemplate {
  idempotencyKey: string;
  question: string;
  whyNeeded: string;
  placeholder?: string;
}

const QUESTION_TEMPLATES: RequirementQuestionTemplate[] = [
  {
    idempotencyKey: "primary-user-role",
    question: "Who is the primary user or actor for this change?",
    whyNeeded:
      "The primary actor determines the workflow, permissions, UI copy, and acceptance criteria.",
    placeholder: "Example: administrator, operator, customer, internal support user",
  },
  {
    idempotencyKey: "first-version-scope",
    question: "What behavior must be included in the first version?",
    whyNeeded:
      "The first-version scope prevents the implementation plan from expanding beyond the intended feature.",
    placeholder: "List the required behaviors and any obvious exclusions.",
  },
  {
    idempotencyKey: "acceptance-criteria",
    question: "What observable outcomes should count as done?",
    whyNeeded:
      "Acceptance criteria are needed so planning, implementation, review, and verification can agree on completion.",
    placeholder: "Example: Given X, when Y, then Z; include required tests if known.",
  },
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function taskContextText(task: NonNullable<ReturnType<typeof findTaskById>>): string {
  const comments = listTaskComments(task.id)
    .filter((comment) => comment.author === "human")
    .map((comment) => comment.message)
    .join("\n");
  return [task.title, task.description, task.roadmapAlias, task.tags, comments]
    .filter(Boolean)
    .join("\n");
}

function hasActorSignal(text: string): boolean {
  return /\b(user|actor|admin|administrator|operator|customer|client|role|persona|пользователь|роль|администратор|оператор|клиент)\b/i.test(
    text,
  );
}

function hasActorDependentBehaviorSignal(text: string): boolean {
  return /\b(ui|ux|screen|page|form|copy|workflow|permission|permissions|access|auth|login|signup|dashboard|notification|approval|moderation|visibility|public|private|права|доступ|интерфейс|экран|форма|авторизац|уведомлен|согласован|модерац|публичн|приватн)\b/i.test(
    text,
  );
}

function hasBlockingActorQuestionSignal(text: string): boolean {
  return (
    hasActorDependentBehaviorSignal(text) &&
    /\b(permission|permissions|access|auth|login|signup|approval|moderation|visibility)\b/i.test(
      text,
    )
  );
}

function hasInternalOperatorActorSignal(text: string): boolean {
  return /\b(?:internal|test[-\s]?only|operator|system\s+maintenance|maintenance\s+card|runtime\s+maintenance|automation|platform\s+maintenance)\b/i.test(
    text,
  );
}

function hasScopeSignal(text: string): boolean {
  return /\b(scope|out of scope|include|exclude|first version|mvp|must|must not|file boundaries|allowed changes|allowed write paths|minimal|в scope|состав|включить|исключить|mvp|первая версия|минималь|только|границ)\b/i.test(
    text,
  );
}

function hasAcceptanceSignal(text: string): boolean {
  return /\b(acceptance|criteria|done when|given .* when .* then|test|verify|ac-|приемк|критери|готово|провер)\b/i.test(
    text,
  );
}

function buildMissingQuestions(taskId: string, text: string): TaskRequirementQuestionInput[] {
  const normalized = normalizeText(text);
  const missingKeys = new Set<string>();
  const actorAlreadyDeclared =
    hasActorSignal(normalized) ||
    (hasInternalOperatorActorSignal(normalized) &&
      hasScopeSignal(normalized) &&
      hasAcceptanceSignal(normalized));
  if (hasBlockingActorQuestionSignal(normalized) && !actorAlreadyDeclared) {
    missingKeys.add("primary-user-role");
  }
  if (!hasScopeSignal(normalized)) missingKeys.add("first-version-scope");
  if (!hasAcceptanceSignal(normalized)) missingKeys.add("acceptance-criteria");

  const maxQuestions = getEnv().AIF_REQUIREMENTS_MAX_QUESTIONS_PER_CYCLE;
  return QUESTION_TEMPLATES.filter(
    (template) =>
      missingKeys.has(template.idempotencyKey) &&
      !hasAnsweredRequirementQuestionKey(taskId, template.idempotencyKey),
  )
    .slice(0, maxQuestions)
    .map((template) => ({
      stage: "requirements_analysis",
      targetResumeStage: "requirements_analysis",
      idempotencyKey: template.idempotencyKey,
      question: template.question,
      whyNeeded: template.whyNeeded,
      blocking: true,
      answerType: "textarea",
      placeholder: template.placeholder,
      sourceAgent: "requirements-analyst",
    }));
}

export async function runRequirementsAnalyst(taskId: string): Promise<void> {
  const task = findTaskById(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const nowIso = new Date().toISOString();

  if (task.taskIntent === "audit") {
    resolveOpenRequirementQuestionsForTask({
      taskId,
      reason: "audit tasks use the audit contract and do not require product clarification intake",
    });
    setTaskFields(taskId, {
      status: "requirements_analysis",
      requirementsConfidence: 0.86,
      needsInputBatchId: null,
      needsInputStage: null,
      needsInputReason: null,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    createCurrentRequirementsSnapshot(taskId, {
      sourceStage: "requirements_analysis",
      sourceQuestionBatchId: null,
    });
    appendTaskActivityLog(
      taskId,
      `[${nowIso}] Requirements analysis skipped product clarification intake for audit task; continuing to planning.`,
    );
    log.info(
      { taskId },
      "Requirements analyst skipped product clarification intake for audit task",
    );
    return;
  }

  const existingQuestions = getTaskRequirementQuestionsResponse(taskId);
  if ((existingQuestions?.openBlockingCount ?? 0) > 0) {
    setTaskFields(taskId, {
      status: "needs_input",
      needsInputBatchId: task.needsInputBatchId ?? existingQuestions?.batches[0]?.batchId ?? null,
      needsInputStage: task.needsInputStage ?? "requirements_analysis",
      needsInputReason: task.needsInputReason ?? "open blocking requirements questions",
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    return;
  }

  if ((task.requirementsCycleCount ?? 0) >= getEnv().AIF_REQUIREMENTS_MAX_CYCLES) {
    setTaskFields(taskId, {
      status: "blocked_external",
      blockedFromStatus: "requirements_analysis",
      blockedReason: "manual_triage_required: requirements clarification cycle limit reached",
      retryAfter: null,
      retryCount: task.retryCount ?? 0,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    appendTaskActivityLog(
      taskId,
      `[${nowIso}] Requirements analysis stopped for manual triage: clarification cycle limit reached.`,
    );
    return;
  }

  const contextText = taskContextText(task);
  const questions = buildMissingQuestions(taskId, contextText);
  if (questions.length > 0) {
    const result = createTaskRequirementQuestionBatch({
      taskId,
      stage: "requirements_analysis",
      targetResumeStage: "requirements_analysis",
      reason: "requirements analysis found missing blocking requirements",
      questions,
      sourceAgent: "requirements-analyst",
    });
    log.info(
      { taskId, batchId: result.batchId, questionCount: result.questions.length },
      "Requirements analyst created clarification questions",
    );
    return;
  }

  setTaskFields(taskId, {
    requirementsConfidence: 0.86,
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });
  createCurrentRequirementsSnapshot(taskId, {
    sourceStage: "requirements_analysis",
    sourceQuestionBatchId: existingQuestions?.batches[0]?.batchId ?? null,
  });
  appendTaskActivityLog(
    taskId,
    `[${nowIso}] Requirements analysis completed with sufficient MVP detail; continuing to planning.`,
  );
  log.info({ taskId }, "Requirements analyst marked task ready for planning");
}
