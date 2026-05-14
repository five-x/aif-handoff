import { describe, expect, it } from "vitest";
import {
  TASK_INTENT_CONTRACTS,
  inferTaskIntent,
  resolveTaskIntentDefaults,
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
    'Quality bar: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims are not findings.',
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
