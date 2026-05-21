import { describe, expect, it } from "vitest";
import {
  TASK_INTENT_CONTRACTS,
  formatTaskIntentContractForPrompt,
  formatTaskIntentOptionsForPrompt,
  formatTaskIntentPrimaryConstraints,
  inferTaskIntent,
  resolveTaskIntentDefaults,
  validateTaskIntentChangedFiles,
  validateGeneratedTaskIntent,
} from "../taskIntent.js";
import {
  AUDIT_NO_FINDINGS_PROOF_GUARDRAIL,
  AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT,
  AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT,
  validateGeneratedAuditCard,
} from "../auditRoadmapContract.js";
import {
  WORKFLOW_PACKS,
  getWorkflowPack,
  validateGeneratedWorkflowTask,
} from "../workflowPacks.js";

function completeAuditDescription(options: { synthesis?: boolean } = {}) {
  const synthesis = options.synthesis ?? false;
  return [
    synthesis
      ? "Scope: all audit/2026-05-13-*-audit.md reports from this audit batch."
      : "Scope: src/config.ts",
    "Audit mandate: Act as the security owner and find actionable technical-quality risks.",
    ...(synthesis
      ? []
      : ["Risk hypotheses: risk-config-1 src/config.ts may contain unsafe defaults."]),
    "Allowed changes: only create/update one report artifact.",
    synthesis
      ? "Report artifact: audit/security-summary.md"
      : "Report artifact: audit/config-audit.md",
    "Acceptance criteria: inspect the scoped files and record findings or none.",
    "Evidence requirements: every finding must include Evidence: src/config.ts:1, Risk:, Proposed fix:, and Verification: Command rg config src/config.ts output matched.",
    "Manifest requirements: include a fenced audit-report-manifest JSON block with version 1, outcome, scopeCoverage, riskHypotheses, findings or noFindingsClaims, and evidenceRefs.",
    "Evidence ID rule: manifest evidenceRefs must cite actual runtime audit ledger IDs (ev_*) only; finding labels such as AOB-001 are never evidenceRefs.",
    "Path rule: every repository reference must use an existing scoped path plus line/range; do not use basename-only references such as config.py.",
    'Quality bar: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims are not findings.',
    "Rejected finding shapes: duplicated initialization/DRY/refactor-helper claims, import-chain/tight-coupling claims without a real cycle, and private-method/direct-store/abstraction-bypass smells are not trusted findings.",
    "Inconclusive rule: a partially inspected source_inconclusive observation is not a finding.",
    'No-findings rule: if no actionable finding is found, write "No validated findings" plus checked files and commands with observed outputs.',
    AUDIT_NO_FINDINGS_PROOF_GUARDRAIL,
    AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT,
    AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT,
    "Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.",
    "Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
    "Evidence: src/config.ts:1",
    "Risk: config drift.",
    "Proposed fix: pin the configuration contract.",
    "Verification: Command rg config src/config.ts output matched.",
  ].join("\n");
}

describe("taskIntent", () => {
  it("defines defaults for all supported task intents", () => {
    expect(Object.keys(TASK_INTENT_CONTRACTS).sort()).toEqual([
      "audit",
      "docs",
      "feature",
      "fix",
      "general",
      "spike",
      "tests",
    ]);
    for (const contract of Object.values(TASK_INTENT_CONTRACTS)) {
      expect(contract.policy.allowedChanges.summary).toBeTruthy();
      expect(contract.policy.forbiddenChanges.summary).toBeTruthy();
      expect(contract.policy.expectedArtifacts.primary.length).toBeGreaterThan(0);
      expect(contract.policy.verificationRequirements.length).toBeGreaterThan(0);
      expect(contract.policy.memoryRules.summary).toBeTruthy();
      expect(contract.policy.reviewRules.summary).toBeTruthy();
      expect(contract.policy.completion.summary).toBeTruthy();
    }

    expect(resolveTaskIntentDefaults("audit", { envUseSubagents: false })).toMatchObject({
      plannerMode: "full",
      skipReview: false,
      useSubagents: true,
      planDocs: true,
      planTests: true,
      isFix: false,
    });
    expect(resolveTaskIntentDefaults("fix", { envUseSubagents: false })).toMatchObject({
      plannerMode: "full",
      skipReview: false,
      planTests: true,
      isFix: true,
    });
    expect(resolveTaskIntentDefaults("general", { envUseSubagents: true })).toMatchObject({
      plannerMode: "fast",
      skipReview: true,
      useSubagents: true,
      planDocs: false,
      planTests: false,
    });
  });

  it("formats prompts and UI constraints from structured policy", () => {
    expect(formatTaskIntentContractForPrompt("docs")).toContain("Forbidden changes:");
    expect(formatTaskIntentContractForPrompt("docs")).toContain("Expected artifacts:");
    expect(formatTaskIntentContractForPrompt("docs")).toContain("Memory rules:");
    expect(formatTaskIntentPrimaryConstraints("tests")).toContain("Focused test or fixture delta");
    expect(formatTaskIntentOptionsForPrompt()).toContain("- audit (Audit):");
    expect(formatTaskIntentOptionsForPrompt()).toContain("Expected artifacts:");
  });

  it("validates deterministic changed-file contradictions for bounded intents", () => {
    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "audit",
          title: "Audit configuration",
          description: "Report artifact: audit/config-audit.md",
        },
        changedFiles: ["audit/config-audit.md"],
      }).ok,
    ).toBe(true);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "audit",
          title: "Audit configuration",
          description: "Report artifact: audit/config-audit.md",
        },
        changedFiles: ["audit/config-audit.md", "packages/api/src/index.ts"],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["packages/api/src/index.ts"],
      }),
    ]);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "audit",
          title: "Audit configuration",
          description: "Report artifact: audit/config-audit.md",
        },
        changedFiles: ["audit/other.md"],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["audit/other.md"],
      }),
    ]);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "audit",
          title: "Audit docs",
          description: "Report artifact: docs/security-audit.md",
        },
        changedFiles: ["docs/security-audit.md"],
      }).ok,
    ).toBe(true);

    expect(
      validateTaskIntentChangedFiles({
        task: { taskIntent: "docs", title: "Update API docs" },
        changedFiles: ["packages/api/src/index.ts"],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["packages/api/src/index.ts"],
      }),
    ]);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "docs",
          title: "Update API docs",
          description: "Supporting source edits for docs correctness are required.",
        },
        changedFiles: ["packages/api/src/index.ts"],
      }).ok,
    ).toBe(true);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "docs",
          title: "Update API docs",
          description: "Supporting source edits for docs correctness are required.",
        },
        changedFiles: [
          "packages/api/src/index.ts",
          "package.json",
          "packages/api/src/__tests__/tasks.test.ts",
        ],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["package.json", "packages/api/src/__tests__/tasks.test.ts"],
      }),
    ]);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "docs",
          title: "Update API docs",
          implementationLog: "Supporting source edits for docs correctness were made.",
          reviewComments: "Docs correctness required source edits.",
          agentActivityLog: "Edited packages/api/src/index.ts for documentation correctness.",
        },
        changedFiles: ["packages/api/src/index.ts"],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["packages/api/src/index.ts"],
      }),
    ]);

    for (const plan of [
      "No source changes are needed for docs correctness.",
      "Do not make source changes; update documentation only.",
      "Source changes are forbidden for docs correctness.",
      "Do not change source code for docs correctness.",
      "Do not make changes to source code for docs correctness.",
      "Without changing source code, update docs correctness notes.",
      "Do not touch source code for docs correctness.",
      "Changes to source code are forbidden for docs correctness.",
      "Never change source code for docs correctness.",
    ]) {
      expect(
        validateTaskIntentChangedFiles({
          task: {
            taskIntent: "docs",
            title: "Update API docs",
            plan,
          },
          changedFiles: ["packages/api/src/index.ts"],
        }).issues,
      ).toEqual([
        expect.objectContaining({
          code: "intent_changed_files_contradiction",
          files: ["packages/api/src/index.ts"],
        }),
      ]);
    }

    expect(
      validateTaskIntentChangedFiles({
        task: { taskIntent: "tests", title: "Add API coverage" },
        changedFiles: ["packages/api/src/__tests__/tasks.test.ts"],
      }).ok,
    ).toBe(true);

    expect(
      validateTaskIntentChangedFiles({
        task: { taskIntent: "tests", title: "Add API fixture coverage" },
        changedFiles: [
          "packages/api/src/__tests__/fixtures/input.txt",
          "packages/api/fixtures/golden.md",
          "packages/api/testdata/sample.txt",
        ],
      }).ok,
    ).toBe(true);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "tests",
          title: "Add API coverage",
          plan: "Minimal source changes for testing are required before adding coverage.",
        },
        changedFiles: ["packages/api/src/index.ts"],
      }).ok,
    ).toBe(true);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "tests",
          title: "Add API coverage",
          plan: "Minimal source changes for testing are required before adding coverage.",
        },
        changedFiles: ["packages/api/src/index.ts", "docs/api.md", "package.json"],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["docs/api.md", "package.json"],
      }),
    ]);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "tests",
          title: "Add API coverage",
          implementationLog: "Minimal source changes for testing were made.",
          reviewComments: "Source changes support regression coverage.",
          agentActivityLog: "Edited packages/api/src/index.ts for testability.",
        },
        changedFiles: ["packages/api/src/index.ts"],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["packages/api/src/index.ts"],
      }),
    ]);

    for (const plan of [
      "No source changes are needed for testing.",
      "Do not make source changes; add tests only.",
      "Source changes are forbidden for regression coverage.",
      "Do not change source code for regression coverage.",
      "Do not make changes to source code for testing.",
      "Without changing source code, add regression coverage.",
      "Do not touch source code for testing.",
      "Changes to source code are forbidden for testing.",
      "Never make source changes for testing.",
    ]) {
      expect(
        validateTaskIntentChangedFiles({
          task: {
            taskIntent: "tests",
            title: "Add API coverage",
            plan,
          },
          changedFiles: ["packages/api/src/index.ts"],
        }).issues,
      ).toEqual([
        expect.objectContaining({
          code: "intent_changed_files_contradiction",
          files: ["packages/api/src/index.ts"],
        }),
      ]);
    }

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "spike",
          title: "Spike storage adapter",
          description: "Proof-of-concept artifact: packages/storage/src/poc.ts",
        },
        changedFiles: ["packages/storage/src/poc.ts"],
      }).ok,
    ).toBe(true);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "spike",
          title: "Spike storage adapter",
          plan: "Approved plan\nProof-of-concept artifact path: packages/storage/src/plan-poc.ts",
        },
        changedFiles: ["packages/storage/src/plan-poc.ts"],
      }).ok,
    ).toBe(true);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "spike",
          title: "Spike storage adapter",
          description: "Proof-of-concept artifact: packages/storage/src/poc.ts",
        },
        changedFiles: ["packages/storage/src/adapter.ts"],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["packages/storage/src/adapter.ts"],
      }),
    ]);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "spike",
          title: "Spike storage adapter",
          description: "Create a proof-of-concept implementation for the storage adapter.",
        },
        changedFiles: ["packages/storage/src/poc.ts"],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["packages/storage/src/poc.ts"],
      }),
    ]);

    for (const plan of [
      "Do not create proof-of-concept artifact path: packages/storage/src/poc.ts",
      "No prototype file packages/storage/src/poc.ts",
      "Prototype artifact packages/storage/src/poc.ts is forbidden",
      "Never create proof-of-concept artifact path: packages/storage/src/poc.ts",
    ]) {
      expect(
        validateTaskIntentChangedFiles({
          task: {
            taskIntent: "spike",
            title: "Spike storage adapter",
            plan,
          },
          changedFiles: ["packages/storage/src/poc.ts"],
        }).issues,
      ).toEqual([
        expect.objectContaining({
          code: "intent_changed_files_contradiction",
          files: ["packages/storage/src/poc.ts"],
        }),
      ]);
    }

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "spike",
          title: "Spike storage adapter",
          description: "Proof-of-concept artifact: packages/storage/src/POC.ts",
        },
        changedFiles: ["packages/storage/src/poc.ts"],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["packages/storage/src/poc.ts"],
      }),
    ]);

    expect(
      validateTaskIntentChangedFiles({
        task: {
          taskIntent: "spike",
          title: "Spike storage adapter",
          implementationLog: "Implemented proof-of-concept artifact: packages/storage/src/poc.ts",
          reviewComments: "Review checked POC file path: packages/storage/src/poc.ts",
        },
        changedFiles: ["packages/storage/src/poc.ts"],
      }).issues,
    ).toEqual([
      expect.objectContaining({
        code: "intent_changed_files_contradiction",
        files: ["packages/storage/src/poc.ts"],
      }),
    ]);
  });

  it("infers explicit and legacy fix intents", () => {
    expect(inferTaskIntent({ taskIntent: "docs", title: "Update README" })).toBe("docs");
    expect(inferTaskIntent({ taskIntent: "docs", isFix: true, title: "Fix README" })).toBe("fix");
    expect(inferTaskIntent({ title: "Investigate storage options" })).toBe("spike");
    expect(inferTaskIntent({ title: "Add checkout flow" })).toBe("feature");
  });

  it("exposes immutable workflow packs backed by task contracts", () => {
    expect(Object.isFrozen(WORKFLOW_PACKS)).toBe(true);
    expect(Object.isFrozen(getWorkflowPack("audit"))).toBe(true);
    expect(Object.isFrozen(getWorkflowPack("feature"))).toBe(true);
    expect(getWorkflowPack("audit")).toMatchObject({
      id: "audit",
      label: TASK_INTENT_CONTRACTS.audit.label,
      taskContract: TASK_INTENT_CONTRACTS.audit,
    });
    expect(getWorkflowPack("feature")).toMatchObject({
      id: "feature",
      label: TASK_INTENT_CONTRACTS.feature.label,
      taskContract: TASK_INTENT_CONTRACTS.feature,
    });
  });

  it("routes audit generated task validation through the audit workflow pack", () => {
    const input = {
      taskIntent: "audit" as const,
      title: "Audit: security configuration",
      description: completeAuditDescription().replace(
        "Allowed changes: only create/update one report artifact.",
        "Allowed changes: only create/update audit/config-audit.md and packages/api/src/index.ts.",
      ),
    };

    expect(validateGeneratedWorkflowTask(input)).toEqual(validateGeneratedTaskIntent(input));
    expect(getWorkflowPack("audit").validateGeneratedTask(input).issues).toEqual(
      validateGeneratedAuditCard(input).issues,
    );
    expect(validateGeneratedTaskIntent(input).issues).toContain(
      "audit task allowed changes must be limited to the report artifact",
    );
  });

  it("rejects implementation-shaped audit cards", () => {
    const result = validateGeneratedTaskIntent({
      taskIntent: "audit",
      title: "Fix security bugs",
      description: "Fix the bugs and add tests.",
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "audit task is missing diagnostic report markers",
        "audit task title describes implementation work",
      ]),
    );
  });

  it("rejects implementation-shaped audit titles even with complete diagnostic markers", () => {
    const result = validateGeneratedTaskIntent({
      taskIntent: "audit",
      title: "Fix security bugs",
      description: completeAuditDescription(),
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("audit task title describes implementation work");
  });

  it("rejects implementation-shaped audit titles masked with an Audit prefix", () => {
    const result = validateGeneratedTaskIntent({
      taskIntent: "audit",
      title: "Audit: Security Hardening",
      description: completeAuditDescription(),
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("audit task title describes implementation work");
  });

  it("rejects audit cards with contradictory allowed changes", () => {
    const result = validateGeneratedTaskIntent({
      taskIntent: "audit",
      title: "Audit: security configuration",
      description: completeAuditDescription().replace(
        "Allowed changes: only create/update one report artifact.",
        "Allowed changes: None",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("audit task allowed changes cannot be None");
  });

  it("rejects audit cards that allow extra non-report edits", () => {
    const result = validateGeneratedTaskIntent({
      taskIntent: "audit",
      title: "Audit: security configuration",
      description: completeAuditDescription().replace(
        "Allowed changes: only create/update one report artifact.",
        "Allowed changes: only create/update audit/config-audit.md and packages/api/src/index.ts.",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "audit task allowed changes must be limited to the report artifact",
    );
  });

  it("rejects audit cards without a concrete report artifact path", () => {
    const result = validateGeneratedTaskIntent({
      taskIntent: "audit",
      title: "Audit: security configuration",
      description: completeAuditDescription().replace(
        "Report artifact: audit/config-audit.md",
        "Report artifact: audit report",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "audit task report artifact must be a concrete .md report path",
    );
  });

  it("accepts clearly diagnostic audit titles with complete markers", () => {
    const result = validateGeneratedTaskIntent({
      taskIntent: "audit",
      title: "Audit: security configuration",
      description: completeAuditDescription(),
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("accepts audit synthesis titles through the shared audit contract", () => {
    const result = validateGeneratedTaskIntent({
      taskIntent: "audit",
      title: "Synthesize audit findings",
      description: completeAuditDescription({ synthesis: true }),
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("accepts a complete feature generated card", () => {
    const result = validateGeneratedTaskIntent({
      taskIntent: "feature",
      title: "Add checkout flow",
      description:
        "Acceptance criteria: users can submit checkout.\nVerification: npm test -- checkout passes.",
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("accepts a non-audit feature canary without audit-only markers", () => {
    const input = {
      taskIntent: "feature" as const,
      title: "Add workflow pack registry",
      description: [
        "Scope: packages/shared/src/workflowPacks.ts and packages/shared/src/taskIntent.ts.",
        "Dependencies: accepted workflow contract pack plan.",
        "Acceptance criteria: generated feature tasks route through the workflow pack registry.",
        "Evidence requirements: focused task-intent tests cover the feature canary.",
        "Allowed changes: source, tests, and docs for the shared registry slice.",
        "Verification: npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskIntent.test.ts passes.",
      ].join("\n"),
    };

    const result = validateGeneratedTaskIntent(input);

    expect(validateGeneratedWorkflowTask(input)).toEqual(result);
    expect(result).toEqual({ ok: true, issues: [] });
    expect(result.issues).not.toEqual(
      expect.arrayContaining([
        "audit task is missing diagnostic report markers",
        "audit source task must include parseable Risk hypotheses with risk-* ids",
        "audit task allowed changes must be limited to the report artifact",
        "audit task report artifact must be a concrete .md report path",
        "audit synthesis task is missing outcome requirements",
      ]),
    );
  });

  it("keeps feature pack validation focused on feature markers", () => {
    const result = getWorkflowPack("feature").validateGeneratedTask({
      taskIntent: "feature",
      title: "Add checkout flow",
      description: "Verification: npm test -- checkout passes.",
    });

    expect(result).toEqual({
      ok: false,
      issues: ["feature task is missing Acceptance criteria"],
    });
  });
});
