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

const RAW_SECRET_REQUEST_PATTERN =
  /\b(password|passphrase|api[_ -]?key|secret|token|bearer|private key)\b/i;
const CREDENTIAL_REF_PATTERN = /\b(credential[_ -]?ref|secret[_ -]?ref|reference|env var)\b/i;

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
