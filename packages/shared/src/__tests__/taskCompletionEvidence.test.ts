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

const IMPLEMENTATION_TOOL_ACTIVITY = [
  "[2026-05-09T00:00:00.000Z] Agent: implement-coordinator started (runtime=qwen-local-agent, transport=api, model=Qwen3)",
  "[2026-05-09T00:00:01.000Z] Tool: read_file README.md",
  "[2026-05-09T00:00:02.000Z] Tool: write_file reports/audit.md",
  "[2026-05-09T00:00:03.000Z] Agent: implement-coordinator complete (runtime=qwen-local-agent, transport=api, model=Qwen3)",
].join("\n");

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
    execFileSync("git", ["checkout", "-b", "feature/root-ref-audit"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      "Findings cite `README.md` and package.json.\n",
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-root-level-refs",
        title: "Audit generated findings",
        plan: "## Plan\n- Validate root files\n- Write report",
        agentActivityLog: IMPLEMENTATION_TOOL_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reportReferencedPaths).toEqual(["README.md", "package.json"]);
    expect(result.issues).toEqual([]);
  });

  it("blocks untracked report artifacts when the task requires a committed report", () => {
    const root = initRepo();
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, "reports", "audit.md"), "Finding cites `README.md`.\n", "utf8");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-uncommitted-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.committedReportRequired).toBe(true);
    expect(result.evidence.reportArtifactFiles).toContain("reports/audit.md");
    expect(result.evidence.dirtyChangedFiles).toContain("reports/audit.md");
    expect(result.evidence.committedChangedFiles).not.toContain("reports/audit.md");
    expect(result.evidence.uncommittedReportArtifactFiles).toContain("reports/audit.md");
    expect(codes(result)).toContain("uncommitted_report_artifact");
  });

  it("blocks tracked dirty report artifacts when the task requires a committed report", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/dirty-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, "reports", "audit.md"), "Finding cites `README.md`.\n", "utf8");
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    writeFileSync(
      join(root, "reports", "audit.md"),
      "Finding cites `README.md` with dirty edits.\n",
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-dirty-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.committedChangedFiles).toContain("reports/audit.md");
    expect(result.evidence.dirtyChangedFiles).toContain("reports/audit.md");
    expect(result.evidence.uncommittedReportArtifactFiles).toContain("reports/audit.md");
    expect(codes(result)).toContain("uncommitted_report_artifact");
  });

  it("blocks staged report artifacts when the task requires a committed report", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/staged-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, "reports", "audit.md"), "Finding cites `README.md`.\n", "utf8");
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-staged-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.dirtyChangedFiles).toContain("reports/audit.md");
    expect(result.evidence.committedChangedFiles).not.toContain("reports/audit.md");
    expect(result.evidence.uncommittedReportArtifactFiles).toContain("reports/audit.md");
    expect(codes(result)).toContain("uncommitted_report_artifact");
  });

  it("accepts committed report artifacts when a committed report is required", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/audit-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, "reports", "audit.md"), "Finding cites `README.md`.\n", "utf8");
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-committed-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: IMPLEMENTATION_TOOL_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.committedReportRequired).toBe(true);
    expect(result.evidence.reportArtifactFiles).toContain("reports/audit.md");
    expect(result.evidence.committedChangedFiles).toContain("reports/audit.md");
    expect(result.evidence.uncommittedReportArtifactFiles).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it("blocks risky committed reports without latest implementation-stage tool activity", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/audit-no-tool"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, "reports", "audit.md"), "Finding cites `README.md`.\n", "utf8");
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-committed-report-no-tool",
        title: "Full project audit",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: [
          "[2026-05-09T00:00:00.000Z] Agent: plan-coordinator started",
          "[2026-05-09T00:00:01.000Z] Tool: read_file README.md",
          "[2026-05-09T00:00:02.000Z] Agent: plan-coordinator complete",
          "[2026-05-09T00:00:03.000Z] Agent: implement-coordinator started (runtime=qwen-local-agent)",
          "[2026-05-09T00:00:04.000Z] Agent: implement-coordinator complete (runtime=qwen-local-agent)",
        ].join("\n"),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.implementationToolActivityCount).toBe(0);
    expect(codes(result)).toContain("missing_implementation_tool_activity");
  });

  it("ignores stale implementation tool activity before the latest implementer retry", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/audit-stale-tool"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, "reports", "audit.md"), "Finding cites `README.md`.\n", "utf8");
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-stale-tool",
        title: "Full project audit",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: [
          "[2026-05-09T00:00:00.000Z] Agent: implement-coordinator started (runtime=qwen-local-agent)",
          "[2026-05-09T00:00:01.000Z] Tool: read_file README.md",
          "[2026-05-09T00:00:02.000Z] Agent: implement-coordinator failed (runtime=qwen-local-agent)",
          "[2026-05-09T00:00:03.000Z] Agent: implement-coordinator started (runtime=qwen-local-agent)",
          "[2026-05-09T00:00:04.000Z] Agent: implement-checklist-sync started (runtime=qwen-local-agent)",
          "[2026-05-09T00:00:05.000Z] Tool: read_file .ai-factory/PLAN.md",
          "[2026-05-09T00:00:06.000Z] Agent: implement-checklist-sync complete (runtime=qwen-local-agent)",
          "[2026-05-09T00:00:07.000Z] Agent: implement-coordinator complete (runtime=qwen-local-agent)",
        ].join("\n"),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.implementationToolActivityCount).toBe(0);
    expect(codes(result)).toContain("missing_implementation_tool_activity");
  });

  it("blocks unrelated dirty report artifacts alongside a valid committed report", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/mixed-report-state"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, "reports", "audit.md"), "Finding cites `README.md`.\n", "utf8");
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    writeFileSync(
      join(root, "reports", "notes.md"),
      "Uncommitted side note cites `README.md`.\n",
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-mixed-report-state",
        title: "Full project audit",
        description: "Done only when the report is committed.",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.committedChangedFiles).toContain("reports/audit.md");
    expect(result.evidence.dirtyChangedFiles).toContain("reports/notes.md");
    expect(result.evidence.uncommittedReportArtifactFiles).toEqual(["reports/notes.md"]);
    expect(codes(result)).toContain("uncommitted_report_artifact");
  });

  it("blocks deterministic inventory fallback reports for broad audit tasks", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/fallback-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "# Diagnostic Report",
        "",
        "## Scope",
        "- Diagnostic-only repository inventory report.",
        "",
        "## Findings",
        "### AUDIT-001: No blocking issue found by deterministic inventory check",
        "- Evidence: Repository inventory confirmed `README.md` exists.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add fallback audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-deterministic-fallback",
        title: "Full project audit across all available repository areas",
        description: "Diagnostic only. Produce a report at reports/audit.md.",
        implementationLog: "Deterministic diagnostic report generated.",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.deterministicFallbackReport).toBe(true);
    expect(codes(result)).toContain("deterministic_fallback_report");
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
