import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateTaskCompletionEvidence,
  formatTaskCompletionBlockedReason,
} from "../taskCompletionEvidence.js";

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "aif-evidence-"));
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "README.md"), "# test\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
    cwd: root,
    stdio: "ignore",
  });
  return root;
}

function codes(result: ReturnType<typeof evaluateTaskCompletionEvidence>): string[] {
  return result.issues.map((issue) => issue.code);
}

describe("taskCompletionEvidence", () => {
  it("blocks generic audit plans with no repository delta", () => {
    const root = initRepo();

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-1",
        title: "Initial audit",
        plan: 'Short task\n<aif-plan mode="fast" docs:false tests:false>',
      },
    });

    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(
      expect.arrayContaining(["generic_plan", "missing_report_artifact", "zero_delta"]),
    );
    expect(formatTaskCompletionBlockedReason(result)).toContain("Completion evidence guard");
  });

  it("requires report artifacts for audit tasks even when source files changed", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const value = 1;\n", "utf8");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-source-only",
        title: "Audit API surface",
        plan: "## Plan\n- Inspect runtime API behavior\n- Record findings",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.meaningfulChangedFiles).toContain("src/app.ts");
    expect(codes(result)).toContain("missing_report_artifact");
  });

  it("does not treat source files under review-like directories as report artifacts", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "review"), { recursive: true });
    writeFileSync(
      join(root, "src", "review", "helpers.ts"),
      "export const referenced = 'README.md';\n",
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-source-review-dir",
        title: "Audit generated findings",
        plan: "## Plan\n- Inspect review helper\n- Write report",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.meaningfulChangedFiles).toContain("src/review/helpers.ts");
    expect(result.evidence.reportArtifactFiles).not.toContain("src/review/helpers.ts");
    expect(codes(result)).toContain("missing_report_artifact");
  });

  it("allows normal implementation tasks that mention form validation", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "form.ts"), "export const validate = () => true;\n", "utf8");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "form-validation-fix",
        title: "Fix form validation error",
        plan: "## Plan\n- Update validation handling\n- Add focused coverage",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.meaningfulChangedFiles).toContain("src/form.ts");
    expect(codes(result)).not.toContain("missing_report_artifact");
  });

  it("allows short concrete pre-implementation plans", () => {
    const root = initRepo();

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      phase: "pre_implementation",
      task: {
        id: "short-concrete-plan",
        title: "Fix form validation error",
        plan: "Update validation handling in the form submit path",
      },
    });

    expect(result.ok).toBe(true);
    expect(codes(result)).not.toContain("generic_plan");
  });

  it("requires report artifacts for verification report tasks", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const value = 1;\n", "utf8");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "verification-report",
        title: "Verification report for audit findings",
        plan: "## Plan\n- Verify findings\n- Write report",
      },
    });

    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("missing_report_artifact");
  });

  it("flags report artifacts whose repo path references do not resolve", () => {
    const root = initRepo();
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      "Finding references `src/ghost.ts` and `packages/missing/file.ts`.\n",
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-bad-refs",
        title: "Audit generated findings",
        plan: "## Plan\n- Validate references\n- Write report",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reportArtifactFiles).toContain("reports/audit.md");
    expect(codes(result)).toContain("invalid_or_missing_file_references");
  });

  it("flags mixed valid and missing repo path references in report artifacts", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const value = 1;\n", "utf8");
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      "Finding one references `src/app.ts`, but another references `src/ghost.ts`.\n",
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-mixed-refs",
        title: "Audit generated findings",
        plan: "## Plan\n- Validate references\n- Write report",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.existingReportReferencedPaths).toContain("src/app.ts");
    expect(result.evidence.missingReportReferencedPaths).toContain("src/ghost.ts");
    expect(codes(result)).toContain("invalid_or_missing_file_references");
  });

  it("requires report-local repo references for risky reports", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const value = 1;\n", "utf8");
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      "Finding is described without a path.\n",
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-report-no-refs",
        title: "Audit generated findings",
        plan: "## Plan\n- Inspect src/app.ts\n- Write report",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reportArtifactFiles).toContain("reports/audit.md");
    expect(result.evidence.reportReferencedPaths).toEqual([]);
    expect(codes(result)).toContain("invalid_or_missing_file_references");
  });

  it("allows risky report artifacts that cite existing root-level files", () => {
    const root = initRepo();
    writeFileSync(join(root, "package.json"), '{ "name": "test" }\n', "utf8");
    execFileSync("git", ["add", "package.json"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add package", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      "Findings cite `README.md` and package.json.\n",
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-root-level-refs",
        title: "Audit generated findings",
        plan: "## Plan\n- Validate root files\n- Write report",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reportReferencedPaths).toEqual(["README.md", "package.json"]);
    expect(result.issues).toEqual([]);
  });

  it("flags missing root-level repo path references in report artifacts", () => {
    const root = initRepo();
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, "reports", "audit.md"), "Finding references `MISSING.md`.\n", "utf8");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-missing-root-ref",
        title: "Audit generated findings",
        plan: "## Plan\n- Validate root files\n- Write report",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reportReferencedPaths).toContain("MISSING.md");
    expect(result.evidence.missingReportReferencedPaths).toContain("MISSING.md");
    expect(codes(result)).toContain("invalid_or_missing_file_references");
  });

  it("flags mixed existing and missing unquoted root-level refs in report artifacts", () => {
    const root = initRepo();
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      "Findings cite README.md and MISSING.md.\n",
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-mixed-root-refs",
        title: "Audit generated findings",
        plan: "## Plan\n- Validate root files\n- Write report",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.existingReportReferencedPaths).toContain("README.md");
    expect(result.evidence.missingReportReferencedPaths).toContain("MISSING.md");
    expect(codes(result)).toContain("invalid_or_missing_file_references");
  });

  it("blocks generic plans during the pre-implementation phase without requiring reports", () => {
    const root = initRepo();

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      phase: "pre_implementation",
      task: {
        id: "generic-pre-implementation",
        title: "Small cleanup",
        plan: 'Short task\n<aif-plan mode="fast" docs:false tests:false>',
      },
    });

    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("generic_plan");
    expect(codes(result)).not.toContain("missing_report_artifact");
    expect(codes(result)).not.toContain("zero_delta");
  });

  it("allows a normal simple task without risk signals or generic plan output", () => {
    const root = initRepo();

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "simple-1",
        title: "Small cleanup",
        plan: "## Plan\n- Confirm the setting",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("surfaces branch isolation and manual-review-required as distinct reasons", () => {
    const root = initRepo();

    const branchResult = evaluateTaskCompletionEvidence({
      projectRoot: root,
      branchIsolationReason: "Branch isolation failure (dirty_worktree)",
      task: { id: "branch-1", title: "Small cleanup" },
    });
    const manualResult = evaluateTaskCompletionEvidence({
      projectRoot: root,
      requireManualReview: true,
      task: { id: "manual-1", title: "Small cleanup" },
    });

    expect(codes(branchResult)).toContain("branch_isolation");
    expect(formatTaskCompletionBlockedReason(branchResult)).toContain("branch_isolation");
    expect(codes(manualResult)).toContain("manual_review_required");
    expect(formatTaskCompletionBlockedReason(manualResult)).toContain("manual_review_required");
  });
});
