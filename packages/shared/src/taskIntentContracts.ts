import type { PlannerFlagDefaults, PlannerMode } from "./plannerDefaults.js";

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
