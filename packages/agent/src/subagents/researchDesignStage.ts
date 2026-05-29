import crypto from "node:crypto";
import {
  appendTaskActivityLog,
  buildTaskRequirementsContextForPrompt,
  createTaskRequirementQuestionBatch,
  findProjectById,
  findTaskById,
  listTaskComments,
  recordTaskStageArtifactAttempt,
  setTaskFields,
} from "@aif/data";
import { createRuntimeWorkflowSpec } from "@aif/runtime";
import { getEnv, logger, type TaskRequirementQuestionInput } from "@aif/shared";
import { executeSubagentQuery } from "../subagentQuery.js";
import {
  formatRaiseQuestionsPromptGuidance,
  handleRaiseQuestionsOutput,
} from "./raiseQuestions.js";

const log = logger("research-design-stage");

type ResearchDesignStage = "research" | "design";
type StageArtifactStatus = "accepted" | "questions" | "blocked";

interface ParsedStageQuestion {
  idempotencyKey?: string | null;
  question: string;
  whyNeeded: string;
  placeholder?: string | null;
}

interface ParsedStageArtifactOutput {
  version: 1;
  stage: ResearchDesignStage;
  status: StageArtifactStatus;
  summary: string;
  markdown: string | null;
  questions: ParsedStageQuestion[];
}

const STAGE_LABELS: Record<ResearchDesignStage, string> = {
  research: "Research artifact",
  design: "Design artifact",
};

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`aif-stage-artifact.${field} must be a non-empty string`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractStageArtifactJson(output: string): string {
  const matches = [
    ...output.matchAll(/```[ \t]*aif-stage-artifact[^\r\n]*\r?\n([\s\S]*?)\r?\n```/gi),
  ];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one fenced aif-stage-artifact JSON block, found ${matches.length}`,
    );
  }
  return matches[0]?.[1]?.trim() ?? "";
}

export function parseStageArtifactOutput(
  output: string,
  expectedStage: ResearchDesignStage,
): ParsedStageArtifactOutput {
  const rawJson = extractStageArtifactJson(output);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(
      `aif-stage-artifact JSON is malformed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(parsed)) throw new Error("aif-stage-artifact must be a JSON object");
  if (parsed.version !== 1) throw new Error("aif-stage-artifact.version must be 1");
  if (parsed.stage !== expectedStage) {
    throw new Error(`aif-stage-artifact.stage must be ${expectedStage}`);
  }
  const status = parsed.status;
  if (status !== "accepted" && status !== "questions" && status !== "blocked") {
    throw new Error("aif-stage-artifact.status must be accepted, questions, or blocked");
  }

  const summary = readRequiredString(parsed.summary, "summary");
  const markdown =
    status === "accepted"
      ? readRequiredString(parsed.markdown, "markdown")
      : readOptionalString(parsed.markdown);
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const questions = rawQuestions.map((question, index): ParsedStageQuestion => {
    if (!isRecord(question)) {
      throw new Error(`aif-stage-artifact.questions[${index}] must be an object`);
    }
    return {
      idempotencyKey: readOptionalString(question.idempotencyKey),
      question: readRequiredString(question.question, `questions[${index}].question`),
      whyNeeded: readRequiredString(question.whyNeeded, `questions[${index}].whyNeeded`),
      placeholder: readOptionalString(question.placeholder),
    };
  });

  if (status === "questions" && questions.length === 0) {
    throw new Error("aif-stage-artifact.questions must be non-empty when status is questions");
  }

  return {
    version: 1,
    stage: expectedStage,
    status,
    summary,
    markdown,
    questions,
  };
}

function formatHumanComments(taskId: string): string {
  const comments = listTaskComments(taskId)
    .filter((comment) => comment.author === "human")
    .slice(-5);
  if (comments.length === 0) return "(No human comments.)";
  return comments.map((comment) => `- ${comment.message}`).join("\n");
}

function buildPrompt(input: {
  stage: ResearchDesignStage;
  task: NonNullable<ReturnType<typeof findTaskById>>;
  requirementsMarkdown: string;
}): string {
  const stageNoun = input.stage === "research" ? "research" : "design";
  const priorArtifactInstruction =
    input.stage === "design"
      ? "Use the accepted research artifact when present. If research is missing or insufficient, ask structured questions instead of inventing requirements."
      : "Use only the current requirements snapshot/waiver and task context as source material.";
  return [
    `You are the ${stageNoun} stage for an AIF task lifecycle.`,
    "",
    "Return exactly one fenced `aif-stage-artifact` JSON block. Do not write files.",
    "",
    "Allowed schema:",
    "```json",
    JSON.stringify(
      {
        version: 1,
        stage: input.stage,
        status: "accepted | questions | blocked",
        summary: "Short non-empty summary.",
        markdown: `# ${input.stage === "research" ? "Research" : "Design"}\n\n...`,
        questions: [
          {
            idempotencyKey: `${input.stage}-missing-detail`,
            question: "Question for the user.",
            whyNeeded: "Why the answer is required.",
            placeholder: "Optional answer guidance.",
          },
        ],
      },
      null,
      2,
    ),
    "```",
    "",
    "Rules:",
    "- Use `accepted` only when the artifact is specific enough for downstream planning.",
    "- Use `questions` for product clarification; these questions will route to needs_input.",
    "- Use `blocked` only for non-product blockers that require operator/manual triage.",
    "- Never include raw secrets or credentials in markdown or questions.",
    "",
    formatRaiseQuestionsPromptGuidance(input.stage),
    priorArtifactInstruction,
    "",
    "Task:",
    `ID: ${input.task.id}`,
    `Title: ${input.task.title}`,
    `Description: ${input.task.description ?? "(No description provided.)"}`,
    "",
    "Recent human comments:",
    formatHumanComments(input.task.id),
    "",
    input.requirementsMarkdown,
  ].join("\n");
}

function toRequirementQuestionInputs(
  stage: ResearchDesignStage,
  questions: ParsedStageQuestion[],
): TaskRequirementQuestionInput[] {
  return questions.map((question) => ({
    stage,
    targetResumeStage: stage,
    idempotencyKey: question.idempotencyKey ?? null,
    question: question.question,
    whyNeeded: question.whyNeeded,
    blocking: true,
    answerType: "textarea",
    sourceAgent: `${stage}-stage`,
    ...(question.placeholder ? { placeholder: question.placeholder } : {}),
  }));
}

function blockTaskFromStage(input: {
  taskId: string;
  stage: ResearchDesignStage;
  summary: string;
}): void {
  const task = findTaskById(input.taskId);
  const nowIso = new Date().toISOString();
  setTaskFields(input.taskId, {
    status: "blocked_external",
    blockedFromStatus: input.stage,
    blockedReason: `${input.stage}_stage_blocked: ${input.summary}`,
    retryAfter: null,
    retryCount: task?.retryCount ?? 0,
    manualReviewRequired: true,
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });
  appendTaskActivityLog(
    input.taskId,
    `[${nowIso}] ${STAGE_LABELS[input.stage]} blocked downstream progress: ${input.summary}`,
  );
}

export async function runResearchDesignStage(
  stage: ResearchDesignStage,
  taskId: string,
  projectRoot: string,
): Promise<void> {
  const task = findTaskById(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const project = findProjectById(task.projectId);
  const requirementsContext = buildTaskRequirementsContextForPrompt(taskId, stage);
  const sourceSnapshotId = requirementsContext?.snapshot?.id ?? null;
  const sourceResearchArtifact =
    stage === "design"
      ? requirementsContext?.stageArtifacts.find(
          (artifact) => artifact.stage === "research" && artifact.kind === "research",
        )
      : null;
  const sourceResearchMetadata = sourceResearchArtifact
    ? {
        sourceResearchArtifactId: sourceResearchArtifact.id,
        sourceResearchAttemptNumber: sourceResearchArtifact.currentAttemptNumber,
      }
    : {};
  const prompt = buildPrompt({
    stage,
    task,
    requirementsMarkdown:
      requirementsContext?.markdown ?? "# Task Requirements Context\n\nNo context available.",
  });
  const promptHash = hashText(prompt);
  const scopeConstraint = `IMPORTANT: Your working directory is ${projectRoot}\nAll files must be created and modified inside this directory. Do NOT navigate to parent directories or other projects.`;
  const workflowSpec = createRuntimeWorkflowSpec({
    workflowKind: "planner",
    prompt,
    requiredCapabilities: [],
    sessionReusePolicy: "resume_if_available",
    systemPromptAppend: scopeConstraint,
    metadata: { lifecycleStage: stage, promptHash },
  });

  log.info({ taskId, stage }, "Starting research/design stage runner");
  const { resultText } = await executeSubagentQuery({
    taskId,
    projectRoot,
    agentName: `${stage}-stage`,
    prompt,
    workflowSpec,
    profileMode: "plan",
    maxBudgetUsd: project?.plannerMaxBudgetUsd ?? null,
  });

  if (
    handleRaiseQuestionsOutput({
      taskId,
      output: resultText,
      stage,
      sourceAgent: `${stage}-stage`,
      sourcePromptHash: promptHash,
    })
  ) {
    return;
  }

  let parsed: ParsedStageArtifactOutput;
  try {
    parsed = parseStageArtifactOutput(resultText, stage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordTaskStageArtifactAttempt({
      taskId,
      stage,
      kind: stage,
      label: STAGE_LABELS[stage],
      path: `${stage}.md`,
      state: "rejected",
      outcome: "refuted",
      trustLevel: "untrusted",
      summary: `${STAGE_LABELS[stage]} output failed validation: ${message}`,
      sourceSnapshotId,
      metadata: {
        outputVersion: 1,
        parserError: message,
        promptHash,
        ...sourceResearchMetadata,
      },
    });
    throw error;
  }

  if (parsed.status === "accepted") {
    recordTaskStageArtifactAttempt({
      taskId,
      stage,
      kind: stage,
      label: STAGE_LABELS[stage],
      path: `${stage}.md`,
      state: "accepted",
      outcome: "supported",
      trustLevel: "trusted",
      summary: parsed.summary,
      markdown: parsed.markdown,
      sourceSnapshotId,
      metadata: {
        outputVersion: parsed.version,
        status: parsed.status,
        promptHash,
        ...sourceResearchMetadata,
      },
    });
    appendTaskActivityLog(
      taskId,
      `[${new Date().toISOString()}] ${STAGE_LABELS[stage]} accepted: ${parsed.summary}`,
    );
    return;
  }

  if (parsed.status === "questions") {
    const nowIso = new Date().toISOString();
    if (!getEnv().AIF_REQUIREMENTS_INTAKE_ENABLED) {
      const currentTask = findTaskById(taskId);
      setTaskFields(taskId, {
        status: "blocked_external",
        blockedFromStatus: currentTask?.status ?? stage,
        blockedReason: `${stage}_stage_questions_disabled: requirements intake is disabled`,
        retryAfter: null,
        retryCount: currentTask?.retryCount ?? 0,
        manualReviewRequired: true,
        lastHeartbeatAt: nowIso,
        updatedAt: nowIso,
      });
      appendTaskActivityLog(
        taskId,
        `[${nowIso}] ${STAGE_LABELS[stage]} emitted product questions while requirements intake is disabled; blocked for manual triage.`,
      );
      recordTaskStageArtifactAttempt({
        taskId,
        stage,
        kind: stage,
        label: STAGE_LABELS[stage],
        path: `${stage}.md`,
        state: "blocked",
        outcome: "blocked",
        trustLevel: "untrusted",
        summary: parsed.summary,
        markdown: parsed.markdown,
        sourceSnapshotId,
        metadata: {
          outputVersion: parsed.version,
          status: parsed.status,
          promptHash,
          intakeDisabled: true,
          questionBatchId: null,
          ...sourceResearchMetadata,
        },
      });
      return;
    }

    const result = createTaskRequirementQuestionBatch({
      taskId,
      stage,
      targetResumeStage: stage,
      reason: `${stage} stage requires product clarification`,
      questions: toRequirementQuestionInputs(stage, parsed.questions),
      sourceAgent: `${stage}-stage`,
      sourcePromptHash: promptHash,
    });
    recordTaskStageArtifactAttempt({
      taskId,
      stage,
      kind: stage,
      label: STAGE_LABELS[stage],
      path: `${stage}.md`,
      state: "blocked",
      outcome: "blocked",
      trustLevel: "untrusted",
      summary: parsed.summary,
      markdown: parsed.markdown,
      sourceSnapshotId,
      metadata: {
        outputVersion: parsed.version,
        status: parsed.status,
        promptHash,
        questionBatchId: result.batchId,
        ...sourceResearchMetadata,
      },
    });
    return;
  }

  recordTaskStageArtifactAttempt({
    taskId,
    stage,
    kind: stage,
    label: STAGE_LABELS[stage],
    path: `${stage}.md`,
    state: "blocked",
    outcome: "blocked",
    trustLevel: "untrusted",
    summary: parsed.summary,
    markdown: parsed.markdown,
    sourceSnapshotId,
    metadata: {
      outputVersion: parsed.version,
      status: parsed.status,
      promptHash,
      ...sourceResearchMetadata,
    },
  });
  blockTaskFromStage({ taskId, stage, summary: parsed.summary });
}

export function isResearchDesignStagesEnabled(): boolean {
  const env = getEnv();
  return env.AIF_REQUIREMENTS_INTAKE_ENABLED && env.AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED;
}
