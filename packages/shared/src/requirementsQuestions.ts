export const REQUIREMENT_QUESTION_STAGES = [
  "requirements_analysis",
  "research",
  "design",
  "planning",
  "implementing",
  "review",
  "qa",
  "acceptance",
] as const;

export type RequirementQuestionStage = (typeof REQUIREMENT_QUESTION_STAGES)[number];

export const REQUIREMENT_ANSWER_TYPES = [
  "text",
  "textarea",
  "boolean",
  "single_choice",
  "multi_choice",
  "file",
  "url",
  "number",
  "date",
] as const;

export type RequirementAnswerType = (typeof REQUIREMENT_ANSWER_TYPES)[number];

export const REQUIREMENT_QUESTION_STATUSES = [
  "open",
  "answered",
  "resolved",
  "dismissed",
  "superseded",
] as const;

export type RequirementQuestionStatus = (typeof REQUIREMENT_QUESTION_STATUSES)[number];

export type RequirementQuestionAnswerAuthor = "human" | "agent";

export interface TaskRequirementQuestion {
  id: string;
  taskId: string;
  projectId: string;
  stage: RequirementQuestionStage;
  targetResumeStage: RequirementQuestionStage;
  cycleNumber: number;
  batchId: string;
  idempotencyKey: string | null;
  question: string;
  whyNeeded: string;
  blocking: boolean;
  answerType: RequirementAnswerType;
  options: string[] | null;
  defaultAnswer: string | null;
  placeholder: string | null;
  status: RequirementQuestionStatus;
  answer: string | null;
  answerAttachments: unknown[] | null;
  answerAuthor: RequirementQuestionAnswerAuthor | null;
  answeredAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  sourceAgent: string;
  sourcePromptHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRequirementQuestionInput {
  stage: RequirementQuestionStage;
  targetResumeStage?: RequirementQuestionStage;
  idempotencyKey?: string | null;
  question: string;
  whyNeeded: string;
  blocking?: boolean;
  answerType?: RequirementAnswerType;
  options?: string[] | null;
  defaultAnswer?: string | null;
  placeholder?: string | null;
  sourceAgent?: string;
  sourcePromptHash?: string | null;
}

export interface TaskRequirementQuestionBatch {
  batchId: string;
  stage: RequirementQuestionStage;
  targetResumeStage: RequirementQuestionStage;
  cycleNumber: number;
  status: "open" | "answered" | "resolved";
  openBlockingCount: number;
  openNonBlockingCount: number;
  questions: TaskRequirementQuestion[];
}

export interface TaskRequirementQuestionsResponse {
  taskId: string;
  projectId: string;
  openBlockingCount: number;
  openNonBlockingCount: number;
  batches: TaskRequirementQuestionBatch[];
}

export interface TaskRequirementQuestionAnswerInput {
  answer: string;
  attachments?: unknown[];
}

export interface TaskRequirementQuestionBatchAnswerInput {
  answers: Array<TaskRequirementQuestionAnswerInput & { questionId: string }>;
  autoResume?: boolean;
}

export interface RequirementAnswerValidationResult {
  ok: boolean;
  error?: string;
}

export const AIF_RAISE_QUESTIONS_FENCE_LANGUAGE = "aif-raise-questions" as const;
export const AIF_RAISE_QUESTIONS_ACTION = "raise_questions" as const;

export type AifRaiseQuestionsAction = typeof AIF_RAISE_QUESTIONS_ACTION;

export interface AifRaiseQuestionsContract {
  version: 1;
  action: AifRaiseQuestionsAction;
  stage: RequirementQuestionStage;
  targetResumeStage: RequirementQuestionStage;
  reason: string;
  questions: TaskRequirementQuestionInput[];
}

const RAW_SECRET_REQUEST_PATTERN =
  /\b(password|passphrase|api[_ -]?key|secret|token|bearer|private key)\b/i;
const CREDENTIAL_REF_PATTERN = /\b(credential[_ -]?ref|secret[_ -]?ref|reference|env var)\b/i;
const AIF_RAISE_QUESTIONS_BLOCK_PATTERN =
  /```[ \t]*aif-raise-questions\b[^\r\n]*\r?\n([\s\S]*?)\r?\n```/gi;
const REQUIREMENT_QUESTION_STAGE_SET = new Set<string>(REQUIREMENT_QUESTION_STAGES);
const REQUIREMENT_ANSWER_TYPE_SET = new Set<string>(REQUIREMENT_ANSWER_TYPES);

export function asksForRawSecret(question: string): boolean {
  return RAW_SECRET_REQUEST_PATTERN.test(question) && !CREDENTIAL_REF_PATTERN.test(question);
}

export function containsSecretLikeAnswer(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i.test(trimmed)) return true;
  if (/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i.test(trimmed)) return true;
  if (/\b(password|api[_-]?key|secret|token)\s*[:=]\s*\S{4,}/i.test(trimmed)) return true;
  if (/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/.test(trimmed)) {
    return true;
  }
  return /\b(?:sk|pk|ghp|glpat|xox[baprs])[-_][A-Za-z0-9_-]{16,}\b/i.test(trimmed);
}

export function validateRequirementAnswer(
  answerType: RequirementAnswerType,
  answer: string,
  options: string[] | null = null,
): RequirementAnswerValidationResult {
  const value = answer.trim();
  if (!value) return { ok: false, error: "Answer is required" };
  if (containsSecretLikeAnswer(value)) {
    return {
      ok: false,
      error: "Answer appears to contain a secret. Use a credential reference instead.",
    };
  }

  switch (answerType) {
    case "boolean":
      return /^(true|false|yes|no|да|нет)$/i.test(value)
        ? { ok: true }
        : { ok: false, error: "Answer must be boolean" };
    case "single_choice":
      return options?.includes(value)
        ? { ok: true }
        : { ok: false, error: "Answer must match one of the options" };
    case "multi_choice": {
      if (!options?.length) return { ok: true };
      const selected = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return selected.every((item) => options.includes(item))
        ? { ok: true }
        : { ok: false, error: "Every selected answer must match the available options" };
    }
    case "number":
      return Number.isFinite(Number(value))
        ? { ok: true }
        : { ok: false, error: "Answer must be a number" };
    case "date":
      return Number.isFinite(Date.parse(value))
        ? { ok: true }
        : { ok: false, error: "Answer must be a date" };
    case "url": {
      try {
        new URL(value);
        return { ok: true };
      } catch {
        return { ok: false, error: "Answer must be a URL" };
      }
    }
    default:
      return { ok: true };
  }
}

export function parseAifRaiseQuestionsContract(output: string): AifRaiseQuestionsContract | null {
  const matches = [...output.matchAll(AIF_RAISE_QUESTIONS_BLOCK_PATTERN)];
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error("Expected at most one fenced aif-raise-questions JSON block");
  }

  const rawJson = matches[0]?.[1]?.trim() ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(
      `aif-raise-questions JSON is malformed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return normalizeAifRaiseQuestionsContract(parsed);
}

export function normalizeAifRaiseQuestionsContract(input: unknown): AifRaiseQuestionsContract {
  if (!isRecord(input)) throw new Error("aif-raise-questions must be a JSON object");
  if (input.version !== 1) throw new Error("aif-raise-questions.version must be 1");
  if (input.action !== AIF_RAISE_QUESTIONS_ACTION) {
    throw new Error("aif-raise-questions.action must be raise_questions");
  }

  const stage = readRequirementQuestionStage(input.stage, "stage");
  const targetResumeStage =
    input.targetResumeStage === undefined
      ? stage
      : readRequirementQuestionStage(input.targetResumeStage, "targetResumeStage");
  const reason = readRequiredString(input.reason, "reason");
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw new Error("aif-raise-questions.questions must be a non-empty array");
  }

  return {
    version: 1,
    action: AIF_RAISE_QUESTIONS_ACTION,
    stage,
    targetResumeStage,
    reason,
    questions: input.questions.map((question, index) =>
      normalizeAifRaiseQuestionInput(question, index, stage, targetResumeStage),
    ),
  };
}

function normalizeAifRaiseQuestionInput(
  input: unknown,
  index: number,
  stage: RequirementQuestionStage,
  targetResumeStage: RequirementQuestionStage,
): TaskRequirementQuestionInput {
  const prefix = `aif-raise-questions.questions[${index}]`;
  if (!isRecord(input)) throw new Error(`${prefix} must be an object`);

  const question = readRequiredString(input.question, `${prefix}.question`);
  if (asksForRawSecret(question)) {
    throw new Error(`${prefix}.question appears to request a raw secret`);
  }
  const whyNeeded = readRequiredString(input.whyNeeded, `${prefix}.whyNeeded`);
  const answerType =
    input.answerType === undefined
      ? "textarea"
      : readRequirementAnswerType(input.answerType, `${prefix}.answerType`);
  const options = readOptionalStringArray(input.options, `${prefix}.options`);
  if ((answerType === "single_choice" || answerType === "multi_choice") && !options?.length) {
    throw new Error(`${prefix}.options is required for choice questions`);
  }

  return {
    stage,
    targetResumeStage,
    idempotencyKey: readOptionalString(input.idempotencyKey, `${prefix}.idempotencyKey`),
    question,
    whyNeeded,
    blocking:
      input.blocking === undefined ? true : readBoolean(input.blocking, `${prefix}.blocking`),
    answerType,
    options,
    defaultAnswer: readOptionalString(input.defaultAnswer, `${prefix}.defaultAnswer`),
    placeholder: readOptionalString(input.placeholder, `${prefix}.placeholder`),
  };
}

function readRequirementQuestionStage(value: unknown, field: string): RequirementQuestionStage {
  if (typeof value !== "string" || !REQUIREMENT_QUESTION_STAGE_SET.has(value)) {
    throw new Error(`aif-raise-questions.${field} must be a valid requirement question stage`);
  }
  return value as RequirementQuestionStage;
}

function readRequirementAnswerType(value: unknown, field: string): RequirementAnswerType {
  if (typeof value !== "string" || !REQUIREMENT_ANSWER_TYPE_SET.has(value)) {
    throw new Error(`${field} must be a valid requirement answer type`);
  }
  return value as RequirementAnswerType;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`aif-raise-questions.${field} must be a non-empty string`);
  }
  return value.trim();
}

function readOptionalString(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value.trim() || null;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function readOptionalStringArray(value: unknown, field: string): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const normalized = value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`${field}[${index}] must be a non-empty string`);
    }
    return item.trim();
  });
  return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
