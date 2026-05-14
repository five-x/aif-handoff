import {
  TASK_INTENT_CONTRACTS,
  TASK_INTENTS,
  type InferTaskIntentInput,
  type ResolvedTaskIntentDefaults,
  type TaskIntent,
  type ValidateGeneratedTaskIntentInput,
  type ValidateGeneratedTaskIntentResult,
} from "./taskIntentContracts.js";
import { validateGeneratedWorkflowTask } from "./workflowPacks.js";

export {
  TASK_INTENT_CONTRACTS,
  TASK_INTENTS,
  type InferTaskIntentInput,
  type ResolvedTaskIntentDefaults,
  type TaskIntent,
  type TaskIntentContract,
  type TaskIntentDefaults,
  type TaskIntentUseSubagentsDefault,
  type ValidateGeneratedTaskIntentInput,
  type ValidateGeneratedTaskIntentResult,
} from "./taskIntentContracts.js";

export function isTaskIntent(value: unknown): value is TaskIntent {
  return typeof value === "string" && TASK_INTENTS.includes(value as TaskIntent);
}

export function normalizeTaskIntent(
  value: string | null | undefined,
  fallback: TaskIntent = "general",
): TaskIntent {
  return isTaskIntent(value) ? value : fallback;
}

function parseTags(tags: InferTaskIntentInput["tags"]): string[] {
  if (Array.isArray(tags)) return tags.filter((tag) => typeof tag === "string");
  if (!tags) return [];
  try {
    const parsed: unknown = JSON.parse(tags);
    if (Array.isArray(parsed)) {
      return parsed.filter((tag): tag is string => typeof tag === "string");
    }
  } catch {
    // Fall back to splitting user-entered tag text.
  }
  return String(tags)
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function combinedIntentText(input: InferTaskIntentInput): string {
  return [input.title, input.description, input.roadmapAlias, ...parseTags(input.tags)]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

export function inferTaskIntent(input: InferTaskIntentInput): TaskIntent {
  if (input.isFix === true) return "fix";
  if (isTaskIntent(input.taskIntent)) return input.taskIntent;

  const text = combinedIntentText(input);
  if (!text) return "general";
  if (
    /\b(audit|auditing|diagnostic|diagnostics|discovery|inventory|gap[-\s]?analysis|code review|security review|findings|validation report|verification report)\b/i.test(
      text,
    ) ||
    text.includes("\u0430\u0443\u0434\u0438\u0442")
  ) {
    return "audit";
  }
  if (
    /\b(fix|bug|defect|regression|broken|debug|repair|not working|fails?|failure)\b/i.test(text)
  ) {
    return "fix";
  }
  if (
    /\b(spike|research|investigate|prototype|proof[-\s]?of[-\s]?concept|poc|explore)\b/i.test(text)
  ) {
    return "spike";
  }
  if (/\b(docs?|documentation|readme|runbook|guide|manual|changelog)\b/i.test(text)) {
    return "docs";
  }
  if (/\b(tests?|testing|coverage|specs?|regression suite|vitest|jest|e2e)\b/i.test(text)) {
    return "tests";
  }
  if (/\b(feature|implement|build|add|create|support|enable|enhancement)\b/i.test(text)) {
    return "feature";
  }
  return "general";
}

export function resolveTaskIntentDefaults(
  intent: TaskIntent,
  options: { envUseSubagents?: boolean } = {},
): ResolvedTaskIntentDefaults {
  const defaults = TASK_INTENT_CONTRACTS[intent].defaults;
  return {
    plannerMode: defaults.plannerMode,
    skipReview: defaults.skipReview,
    planDocs: defaults.planDocs,
    planTests: defaults.planTests,
    isFix: defaults.isFix,
    useSubagents:
      defaults.useSubagents === "env" ? (options.envUseSubagents ?? false) : defaults.useSubagents,
  };
}

export function formatTaskIntentContractForPrompt(intent: TaskIntent): string {
  const contract = TASK_INTENT_CONTRACTS[intent];
  return [
    `Task intent: ${contract.intent} (${contract.label})`,
    `Decomposition: ${contract.decomposition}`,
    `Allowed file changes: ${contract.allowedFileChanges}`,
    `Evidence requirements: ${contract.evidenceRequirements}`,
    `Required gates: ${contract.requiredGates.join(", ")}`,
    contract.hardConstraints.length > 0
      ? `Hard constraints: ${contract.hardConstraints.join("; ")}`
      : "Hard constraints: none",
    `Planning guidance: ${contract.planningPrompt}`,
    `Implementation guidance: ${contract.implementationPrompt}`,
  ].join("\n");
}

export function validateGeneratedTaskIntent(
  input: ValidateGeneratedTaskIntentInput,
): ValidateGeneratedTaskIntentResult {
  return validateGeneratedWorkflowTask(input);
}
