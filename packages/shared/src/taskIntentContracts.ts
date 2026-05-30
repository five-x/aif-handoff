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

export type TaskIntentChangeCategory =
  | "source"
  | "tests"
  | "docs"
  | "config"
  | "report"
  | "research"
  | "fixtures"
  | "metadata";

export interface TaskIntentChangePolicy {
  categories: TaskIntentChangeCategory[];
  summary: string;
}

export interface TaskIntentArtifactPolicy {
  primary: string[];
  optional: string[];
}

export interface TaskIntentMemoryPolicy {
  mode: "allowed" | "required" | "forbidden";
  summary: string;
}

export interface TaskIntentReviewPolicy {
  summary: string;
  skipReviewDefault: boolean;
  manualReviewTriggers: string[];
}

export interface TaskIntentCompletionPolicy {
  changedFileRule: "none" | "audit_report_only" | "docs_only" | "tests_only" | "research_only";
  summary: string;
}

export interface TaskIntentPolicy {
  allowedChanges: TaskIntentChangePolicy;
  forbiddenChanges: TaskIntentChangePolicy;
  expectedArtifacts: TaskIntentArtifactPolicy;
  verificationRequirements: string[];
  memoryRules: TaskIntentMemoryPolicy;
  reviewRules: TaskIntentReviewPolicy;
  completion: TaskIntentCompletionPolicy;
}

export interface TaskIntentContract {
  intent: TaskIntent;
  label: string;
  decomposition: string;
  defaults: TaskIntentDefaults;
  policy: TaskIntentPolicy;
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
    decomposition:
      "Allow broad non-executable roadmap summaries, but split executable children into small microtasks with clear boundaries, acceptance criteria, and verification.",
    defaults: {
      plannerMode: "fast",
      skipReview: true,
      useSubagents: "env",
      planDocs: false,
      planTests: false,
      isFix: false,
    },
    policy: {
      allowedChanges: {
        categories: ["source", "tests", "docs", "config", "metadata"],
        summary: "Task-specific source, tests, docs, config, and metadata changes are allowed.",
      },
      forbiddenChanges: {
        categories: [],
        summary: "No intent-wide forbidden file categories; the task text defines the boundary.",
      },
      expectedArtifacts: {
        primary: ["Implemented task delta when requested"],
        optional: ["Focused tests", "Documentation updates", "Verification notes"],
      },
      verificationRequirements: ["Run verification relevant to the touched files."],
      memoryRules: {
        mode: "allowed",
        summary:
          "Use approved memory only as context; do not publish memory unless the workflow asks for it.",
      },
      reviewRules: {
        summary:
          "Review is optional by default for fast general work unless task settings require it.",
        skipReviewDefault: true,
        manualReviewTriggers: ["Ambiguous scope", "unsafe file operations", "failed verification"],
      },
      completion: {
        changedFileRule: "none",
        summary: "Completion is governed by task acceptance criteria and existing evidence checks.",
      },
    },
    executableBacklogPolicy:
      "Executable only when the child is a microtask with bounded scope, acceptance criteria, and verification; broad roadmap summaries must remain non-executable containers or be split first.",
    allowedFileChanges: "Normal implementation scope from the task text.",
    evidenceRequirements: "Task-specific acceptance criteria and verification when generated.",
    requiredGates: ["planner", "implementer"],
    hardConstraints: [],
    planningPrompt:
      "Create a task-specific plan for one bounded microtask with clear implementation steps and verification.",
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
    policy: {
      allowedChanges: {
        categories: ["report"],
        summary: "Only the named diagnostic report or synthesis artifact may change.",
      },
      forbiddenChanges: {
        categories: ["source", "tests", "docs", "config"],
        summary:
          "Source, config, test, docs implementation, and child implementation work are forbidden.",
      },
      expectedArtifacts: {
        primary: ["Concrete report artifact", "Structured evidence", "Commit verification"],
        optional: ["Synthesis report over existing source reports"],
      },
      verificationRequirements: [
        "Every finding must include exact path:line or symbol evidence.",
        "Reports must include Risk and Verification command output.",
        "Report artifact commit must be verified with git status/add/commit/log output.",
      ],
      memoryRules: {
        mode: "allowed",
        summary:
          "Use approved source-backed memory only as context; do not publish raw audit notes.",
      },
      reviewRules: {
        summary:
          "Audit requires review, security review, and completion evidence before terminal status.",
        skipReviewDefault: false,
        manualReviewTriggers: [
          "Missing report artifact",
          "Weak or placeholder evidence",
          "Unexpected non-report changes",
        ],
      },
      completion: {
        changedFileRule: "audit_report_only",
        summary: "Completion must be report-only and satisfy strict audit validators.",
      },
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
    policy: {
      allowedChanges: {
        categories: ["source", "tests", "docs", "config"],
        summary:
          "Source, tests, docs, and config changes are allowed when required by the feature slice.",
      },
      forbiddenChanges: {
        categories: ["report"],
        summary: "Diagnostic-only report work belongs to audit tasks, not feature tasks.",
      },
      expectedArtifacts: {
        primary: ["Implemented feature delta", "Acceptance criteria evidence"],
        optional: ["Focused tests", "Docs updates", "Config changes"],
      },
      verificationRequirements: [
        "Describe expected user-visible behavior.",
        "Run commands that cover the feature acceptance criteria.",
      ],
      memoryRules: {
        mode: "allowed",
        summary:
          "Use approved memory as implementation context when it is relevant and source-backed.",
      },
      reviewRules: {
        summary: "Feature work should receive code review unless explicitly configured otherwise.",
        skipReviewDefault: false,
        manualReviewTriggers: ["Acceptance criteria not verified", "Broad cross-module risk"],
      },
      completion: {
        changedFileRule: "none",
        summary: "Completion must satisfy acceptance criteria and verification evidence.",
      },
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
    policy: {
      allowedChanges: {
        categories: ["source", "tests", "docs", "config"],
        summary: "Use the smallest source, test, docs, or config changes needed for the defect.",
      },
      forbiddenChanges: {
        categories: ["report", "research"],
        summary: "Broad research, diagnostic-only reports, and unrelated refactors are forbidden.",
      },
      expectedArtifacts: {
        primary: ["Narrow defect patch", "Regression verification"],
        optional: ["Focused regression test", "Brief docs note when behavior changed"],
      },
      verificationRequirements: [
        "Capture reproduction or observed failure.",
        "Run the regression command that proves the fix.",
      ],
      memoryRules: {
        mode: "allowed",
        summary: "Use approved prior-fix memory only when it directly matches the failure.",
      },
      reviewRules: {
        summary: "Fix work should receive review focused on regression risk and scope creep.",
        skipReviewDefault: false,
        manualReviewTriggers: ["No reproduction evidence", "Regression command missing"],
      },
      completion: {
        changedFileRule: "none",
        summary: "Completion must prove the defect was addressed with regression evidence.",
      },
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
    policy: {
      allowedChanges: {
        categories: ["research", "docs", "metadata"],
        summary:
          "Research/design notes and explicitly named proof-of-concept artifacts are allowed.",
      },
      forbiddenChanges: {
        categories: ["source", "tests", "config"],
        summary:
          "Production source, config, and test changes are forbidden unless a proof of concept is explicitly named.",
      },
      expectedArtifacts: {
        primary: ["Research or design artifact", "Recommendation"],
        optional: ["Explicitly named proof-of-concept artifact"],
      },
      verificationRequirements: [
        "Answer the stated research questions.",
        "Record options, tradeoffs, recommendation, and next-step boundaries.",
      ],
      memoryRules: {
        mode: "allowed",
        summary:
          "Use memory to compare prior decisions, but publish only curated conclusions after review.",
      },
      reviewRules: {
        summary: "Spike output requires review for recommendation quality and boundary discipline.",
        skipReviewDefault: false,
        manualReviewTriggers: ["Production implementation drift", "Missing recommendation"],
      },
      completion: {
        changedFileRule: "research_only",
        summary:
          "Completion must stay research/design-only unless a proof of concept is explicitly named.",
      },
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
    policy: {
      allowedChanges: {
        categories: ["docs"],
        summary: "Documentation, examples, and docs-adjacent text artifacts are allowed.",
      },
      forbiddenChanges: {
        categories: ["source", "tests", "config", "report"],
        summary:
          "Source, test, and config changes are forbidden unless explicitly required for docs correctness.",
      },
      expectedArtifacts: {
        primary: ["Documentation update"],
        optional: ["Example update", "Link/render/lint verification"],
      },
      verificationRequirements: [
        "Verify referenced source facts.",
        "Run link, render, lint, or command checks when available.",
      ],
      memoryRules: {
        mode: "allowed",
        summary: "Use reviewed memory only to locate source-backed project facts.",
      },
      reviewRules: {
        summary: "Docs changes should be reviewed for source accuracy and broken references.",
        skipReviewDefault: false,
        manualReviewTriggers: ["Unverified source claim", "Broken render or link check"],
      },
      completion: {
        changedFileRule: "docs_only",
        summary:
          "Completion must be documentation-only unless task context explicitly allows support edits.",
      },
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
    policy: {
      allowedChanges: {
        categories: ["tests", "fixtures"],
        summary:
          "Tests and test fixtures are allowed; minimal testability hooks require explicit justification.",
      },
      forbiddenChanges: {
        categories: ["source", "docs", "config", "report"],
        summary:
          "Source, docs, and config changes are forbidden unless explicitly justified for testing.",
      },
      expectedArtifacts: {
        primary: ["Focused test or fixture delta"],
        optional: ["Minimal testability hook with justification"],
      },
      verificationRequirements: [
        "Name the target behavior or regression.",
        "Run the relevant test command and record the expected pass/fail outcome.",
      ],
      memoryRules: {
        mode: "allowed",
        summary: "Use memory only to identify prior regressions or known flaky-test context.",
      },
      reviewRules: {
        summary: "Test work should be reviewed for meaningful assertions and fixture scope.",
        skipReviewDefault: false,
        manualReviewTriggers: ["No target behavior", "No test command", "Broad source refactor"],
      },
      completion: {
        changedFileRule: "tests_only",
        summary:
          "Completion must stay test/fixture-focused unless task context explicitly allows support edits.",
      },
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
