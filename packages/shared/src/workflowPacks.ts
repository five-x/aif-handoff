import { validateGeneratedAuditCard } from "./auditRoadmapContract.js";
import { TASK_INTENT_CONTRACTS } from "./taskIntentContracts.js";
import type {
  TaskIntent,
  TaskIntentContract,
  ValidateGeneratedTaskIntentInput,
  ValidateGeneratedTaskIntentResult,
} from "./taskIntentContracts.js";

export interface WorkflowPack {
  readonly id: TaskIntent;
  readonly label: string;
  readonly taskContract: TaskIntentContract;
  readonly validateGeneratedTask: (
    input: ValidateGeneratedTaskIntentInput,
  ) => ValidateGeneratedTaskIntentResult;
}

type WorkflowPackRegistry = Readonly<Record<TaskIntent, WorkflowPack>>;

function validateOk(): ValidateGeneratedTaskIntentResult {
  return { ok: true, issues: [] };
}

function validateFeatureTask(
  input: ValidateGeneratedTaskIntentInput,
): ValidateGeneratedTaskIntentResult {
  const text = `${input.title}\n${input.description ?? ""}`.toLowerCase();
  const issues: string[] = [];

  if (!/\bacceptance criteria\s*:/i.test(text)) {
    issues.push("feature task is missing Acceptance criteria");
  }
  if (!/\bverification\s*:/i.test(text)) {
    issues.push("feature task is missing Verification");
  }

  return { ok: issues.length === 0, issues };
}

function validateFixTask(
  input: ValidateGeneratedTaskIntentInput,
): ValidateGeneratedTaskIntentResult {
  const text = `${input.title}\n${input.description ?? ""}`.toLowerCase();
  const issues: string[] = [];

  if (!/\b(reproduction|observed failure|failing behavior|failure evidence)\s*:/i.test(text)) {
    issues.push("fix task is missing reproduction or failure evidence");
  }
  if (!/\b(regression|verification)\s*:/i.test(text)) {
    issues.push("fix task is missing regression verification");
  }

  return { ok: issues.length === 0, issues };
}

function validateSpikeTask(
  input: ValidateGeneratedTaskIntentInput,
): ValidateGeneratedTaskIntentResult {
  const text = `${input.title}\n${input.description ?? ""}`.toLowerCase();
  const issues: string[] = [];

  if (!/\b(time[-\s]?box|exit criteria|research artifact|design artifact)\s*:/i.test(text)) {
    issues.push("spike task is missing time-box, artifact, or exit criteria");
  }
  if (!/\b(recommendation|questions|tradeoffs?|options)\s*:/i.test(text)) {
    issues.push("spike task is missing research output expectations");
  }

  return { ok: issues.length === 0, issues };
}

function validateDocsTask(
  input: ValidateGeneratedTaskIntentInput,
): ValidateGeneratedTaskIntentResult {
  const text = `${input.title}\n${input.description ?? ""}`.toLowerCase();
  const issues: string[] = [];

  if (!/\b(docs?|documentation|readme|runbook|guide|manual|changelog)[\w./-]*\b/i.test(text)) {
    issues.push("docs task is missing documentation target");
  }
  if (!/\bverification\s*:/i.test(text)) {
    issues.push("docs task is missing Verification");
  }

  return { ok: issues.length === 0, issues };
}

function validateTestsTask(
  input: ValidateGeneratedTaskIntentInput,
): ValidateGeneratedTaskIntentResult {
  const text = `${input.title}\n${input.description ?? ""}`.toLowerCase();
  const issues: string[] = [];

  if (!/\b(target behavior|regression target|coverage target|behavior)\s*:/i.test(text)) {
    issues.push("tests task is missing target behavior");
  }
  if (!/\b(command|verification)\s*:/i.test(text)) {
    issues.push("tests task is missing command or verification");
  }

  return { ok: issues.length === 0, issues };
}

function makeWorkflowPack(
  id: TaskIntent,
  validateGeneratedTask: WorkflowPack["validateGeneratedTask"],
): WorkflowPack {
  const taskContract = TASK_INTENT_CONTRACTS[id];
  return Object.freeze({
    id,
    label: taskContract.label,
    taskContract,
    validateGeneratedTask,
  });
}

export const WORKFLOW_PACKS: WorkflowPackRegistry = Object.freeze({
  general: makeWorkflowPack("general", validateOk),
  audit: makeWorkflowPack("audit", (input) =>
    validateGeneratedAuditCard({
      title: input.title,
      description: input.description,
    }),
  ),
  feature: makeWorkflowPack("feature", validateFeatureTask),
  fix: makeWorkflowPack("fix", validateFixTask),
  spike: makeWorkflowPack("spike", validateSpikeTask),
  docs: makeWorkflowPack("docs", validateDocsTask),
  tests: makeWorkflowPack("tests", validateTestsTask),
});

export function getWorkflowPack(intent: TaskIntent): WorkflowPack {
  return WORKFLOW_PACKS[intent];
}

export function validateGeneratedWorkflowTask(
  input: ValidateGeneratedTaskIntentInput,
): ValidateGeneratedTaskIntentResult {
  const title = input.title.trim();
  const description = input.description?.trim() ?? "";
  const issues: string[] = [];

  if (!title) issues.push("title is required");

  const packResult = getWorkflowPack(input.taskIntent).validateGeneratedTask({
    ...input,
    title,
    description,
  });
  issues.push(...packResult.issues);

  return { ok: issues.length === 0, issues };
}
