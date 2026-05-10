import { describe, expect, it } from "vitest";
import {
  TASK_INTENT_CONTRACTS,
  inferTaskIntent,
  resolveTaskIntentDefaults,
  validateGeneratedTaskIntent,
} from "../taskIntent.js";

function completeAuditDescription() {
  return [
    "Scope: src/config.ts",
    "Allowed changes: only create/update one report artifact.",
    "Report artifact: audit/config-audit.md",
    "Acceptance criteria: inspect the scoped files and record findings or none.",
    "Evidence requirements: every finding must include Evidence: src/config.ts:1, Risk:, and Verification: Command rg config src/config.ts output matched.",
    "Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.",
    "Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
    "Evidence: src/config.ts:1",
    "Risk: config drift.",
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

  it("accepts clearly diagnostic audit titles with complete markers", () => {
    const result = validateGeneratedTaskIntent({
      taskIntent: "audit",
      title: "Audit: security configuration",
      description: completeAuditDescription(),
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
});
