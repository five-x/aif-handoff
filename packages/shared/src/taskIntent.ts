import type { PlannerMode, PlannerFlagDefaults } from "./plannerDefaults.js";
import { validateGeneratedAuditCard } from "./auditRoadmapContract.js";

export const TASK_INTENTS = [
  "general",
  "audit",
  "feature",
  "fix",
  "spike",
  "docs",
  "tests",
] as const;

export type TaskIntent = (typeof TASK_INTENTS)[number];

export type TaskIntentUseSubagentsDefault = boolean | "env";

export interface TaskIntentDefaults extends PlannerFlagDefaults {
  plannerMode: PlannerMode;
  useSubagents: TaskIntentUseSubagentsDefault;
  isFix: boolean;
}

export interface TaskIntentContract {
  intent: TaskIntent;
  label: string;
  decomposition: string;
  defaults: TaskIntentDefaults;
  executableBacklogPolicy: string;
  allowedFileChanges: string;
  evidenceRequirements: string;
  requiredGates: string[];
  hardConstraints: string[];
  planningPrompt: string;
  implementationPrompt: string;
}

export interface ResolvedTaskIntentDefaults extends Omit<TaskIntentDefaults, "useSubagents"> {
  useSubagents: boolean;
}

export interface InferTaskIntentInput {
  taskIntent?: string | null;
  isFix?: boolean | null;
  title?: string | null;
  description?: string | null;
  roadmapAlias?: string | null;
  tags?: string[] | string | null;
}

export interface ValidateGeneratedTaskIntentInput {
  title: string;
  description?: string | null;
  taskIntent: TaskIntent;
}

export interface ValidateGeneratedTaskIntentResult {
  ok: boolean;
  issues: string[];
}

export const TASK_INTENT_CONTRACTS: Record<TaskIntent, TaskIntentContract> = {
  general: {
    intent: "general",
    label: "General",
    decomposition: "Preserve existing broad roadmap behavior as high-level implementable tasks.",
    defaults: {
      plannerMode: "fast",
      skipReview: true,
      useSubagents: "env",
      planDocs: false,
      planTests: false,
      isFix: false,
    },
    executableBacklogPolicy: "Executable immediately when the task shape is valid.",
    allowedFileChanges: "Normal implementation scope from the task text.",
    evidenceRequirements: "Task-specific acceptance criteria and verification when generated.",
    requiredGates: ["planner", "implementer"],
    hardConstraints: [],
    planningPrompt: "Create a task-specific plan with clear implementation steps and verification.",
    implementationPrompt:
      "Implement the requested change and run verification relevant to the touched files.",
  },
  audit: {
    intent: "audit",
    label: "Audit",
    decomposition:
      "Produce only diagnostic audit cards plus exactly one synthesis card; do not produce fix, refactor, hardening, test-expansion, deployment, or docs implementation cards.",
    defaults: {
      plannerMode: "full",
      skipReview: false,
      useSubagents: true,
      planDocs: true,
      planTests: true,
      isFix: false,
    },
    executableBacklogPolicy:
      "Executable only when diagnostic-only validation passes; invalid audit cards fail closed.",
    allowedFileChanges:
      "Only the named report or synthesis artifact; no source, config, or test edits.",
    evidenceRequirements:
      "Report artifact path, exact path:line or symbol evidence, Risk:, Verification: Command ... output ..., and git status/add/commit/log verification.",
    requiredGates: [
      "planner",
      "plan-checker",
      "implementer",
      "review",
      "security-review",
      "completion-evidence",
    ],
    hardConstraints: ["diagnostic-only", "skipReview=false", "useSubagents=true", "report-only"],
    planningPrompt:
      "Keep the plan diagnostic-only, name one report artifact, require exact evidence and command output, and forbid source/config/test edits or child implementation tasks.",
    implementationPrompt:
      "Write only the report artifact with concrete evidence, risk, and verification markers; commit the report artifact and verify the commit.",
  },
  feature: {
    intent: "feature",
    label: "Feature",
    decomposition:
      "Decompose broad feature requests into small dependency-ordered implementation cards with acceptance criteria.",
    defaults: {
      plannerMode: "full",
      skipReview: false,
      useSubagents: "env",
      planDocs: true,
      planTests: true,
      isFix: false,
    },
    executableBacklogPolicy: "Executable immediately when acceptance and verification are present.",
    allowedFileChanges: "Source, tests, docs, and config only as needed for the feature.",
    evidenceRequirements:
      "Acceptance criteria, verification commands, and expected user-visible behavior.",
    requiredGates: ["planner", "plan-checker", "implementer", "review", "tests"],
    hardConstraints: ["generated cards must include acceptance and verification"],
    planningPrompt:
      "Plan a small implementable feature slice with acceptance criteria, dependencies, and verification.",
    implementationPrompt:
      "Implement the feature slice, update tests/docs as needed, and verify the acceptance criteria.",
  },
  fix: {
    intent: "fix",
    label: "Fix",
    decomposition:
      "Keep cards narrowly defect-focused with reproduction, root-cause hypothesis, patch scope, and regression checks.",
    defaults: {
      plannerMode: "full",
      skipReview: false,
      useSubagents: "env",
      planDocs: false,
      planTests: true,
      isFix: true,
    },
    executableBacklogPolicy: "Executable immediately when defect evidence is present.",
    allowedFileChanges: "Smallest source/test/docs changes needed for the defect.",
    evidenceRequirements:
      "Reproduction or observed failure, root cause, and regression verification command.",
    requiredGates: ["planner", "implementer", "review", "regression-tests"],
    hardConstraints: ["taskIntent=fix implies isFix=true"],
    planningPrompt:
      "Plan the smallest defect fix, including reproduction, root cause, patch scope, and regression verification.",
    implementationPrompt:
      "Patch the defect narrowly and run the regression command that proves the bug is fixed.",
  },
  spike: {
    intent: "spike",
    label: "Spike",
    decomposition:
      "Create time-boxed research/design cards with findings and recommendation, not production implementation.",
    defaults: {
      plannerMode: "full",
      skipReview: false,
      useSubagents: true,
      planDocs: true,
      planTests: false,
      isFix: false,
    },
    executableBacklogPolicy:
      "Executable only when a research artifact and exit criteria are named.",
    allowedFileChanges:
      "Research/design notes and optional explicitly named proof-of-concept artifact.",
    evidenceRequirements:
      "Research artifact path, questions answered, options/tradeoffs, recommendation, and next-step boundaries.",
    requiredGates: ["planner", "review"],
    hardConstraints: ["must not silently become implementation work"],
    planningPrompt:
      "Plan a time-boxed spike with research questions, artifact path, exit criteria, and non-implementation boundaries.",
    implementationPrompt:
      "Produce the research/design artifact and recommendation; do not implement production changes unless the task explicitly names a proof of concept.",
  },
  docs: {
    intent: "docs",
    label: "Docs",
    decomposition:
      "Create documentation-only or documentation-primary cards with clear source and verification scope.",
    defaults: {
      plannerMode: "fast",
      skipReview: false,
      useSubagents: "env",
      planDocs: true,
      planTests: false,
      isFix: false,
    },
    executableBacklogPolicy:
      "Executable immediately when docs target and verification are present.",
    allowedFileChanges:
      "Documentation and examples; source/test changes only when explicitly needed for docs correctness.",
    evidenceRequirements:
      "Docs paths changed, source references checked, and render/link/lint verification when available.",
    requiredGates: ["planner", "implementer", "review"],
    hardConstraints: ["generated docs cards must name docs target and verification"],
    planningPrompt:
      "Plan the documentation target, source references to verify, and docs-specific validation.",
    implementationPrompt:
      "Update the documentation and verify referenced commands, links, or source facts when practical.",
  },
  tests: {
    intent: "tests",
    label: "Tests",
    decomposition: "Create focused test work tied to target behavior or regression outcomes.",
    defaults: {
      plannerMode: "full",
      skipReview: false,
      useSubagents: "env",
      planDocs: false,
      planTests: true,
      isFix: false,
    },
    executableBacklogPolicy:
      "Executable immediately when target behavior and test command are present.",
    allowedFileChanges:
      "Tests and test fixtures; source changes only for minimal testability hooks explicitly justified.",
    evidenceRequirements:
      "Target behavior, failing/passing command, and expected coverage or regression outcome.",
    requiredGates: ["planner", "implementer", "review", "test-command"],
    hardConstraints: ["generated tests cards must not become broad refactors"],
    planningPrompt:
      "Plan focused tests for a named behavior, including commands and expected pass/fail outcomes.",
    implementationPrompt:
      "Add focused tests or fixtures, avoid unrelated source refactors, and run the named test command.",
  },
};

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
    text.includes("аудит")
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
  const title = input.title.trim();
  const description = input.description?.trim() ?? "";
  const text = `${title}\n${description}`.toLowerCase();
  const issues: string[] = [];

  if (!title) issues.push("title is required");

  switch (input.taskIntent) {
    case "audit": {
      issues.push(...validateGeneratedAuditCard({ title, description }).issues);
      break;
    }
    case "feature":
      if (!/\bacceptance criteria\s*:/i.test(text)) {
        issues.push("feature task is missing Acceptance criteria");
      }
      if (!/\bverification\s*:/i.test(text)) {
        issues.push("feature task is missing Verification");
      }
      break;
    case "fix":
      if (!/\b(reproduction|observed failure|failing behavior|failure evidence)\s*:/i.test(text)) {
        issues.push("fix task is missing reproduction or failure evidence");
      }
      if (!/\b(regression|verification)\s*:/i.test(text)) {
        issues.push("fix task is missing regression verification");
      }
      break;
    case "spike":
      if (!/\b(time[-\s]?box|exit criteria|research artifact|design artifact)\s*:/i.test(text)) {
        issues.push("spike task is missing time-box, artifact, or exit criteria");
      }
      if (!/\b(recommendation|questions|tradeoffs?|options)\s*:/i.test(text)) {
        issues.push("spike task is missing research output expectations");
      }
      break;
    case "docs":
      if (!/\b(docs?|documentation|readme|runbook|guide|manual|changelog)[\w./-]*\b/i.test(text)) {
        issues.push("docs task is missing documentation target");
      }
      if (!/\bverification\s*:/i.test(text)) {
        issues.push("docs task is missing Verification");
      }
      break;
    case "tests":
      if (!/\b(target behavior|regression target|coverage target|behavior)\s*:/i.test(text)) {
        issues.push("tests task is missing target behavior");
      }
      if (!/\b(command|verification)\s*:/i.test(text)) {
        issues.push("tests task is missing command or verification");
      }
      break;
    case "general":
      break;
  }

  return { ok: issues.length === 0, issues };
}
