import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateTaskCompletionEvidence,
  formatTaskCompletionBlockedReason,
} from "../taskCompletionEvidence.js";
import { formatAuditSynthesisOutcomeForArtifact } from "../auditSynthesisClassifier.js";
import { computeAuditReportContentSha256 } from "../auditReportValidator.js";

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

function commitAuditSynthesisWithMetadata(
  root: string,
  branchName: string,
  outcomeBlock: string,
): void {
  execFileSync("git", ["checkout", "-b", branchName], {
    cwd: root,
    stdio: "ignore",
  });
  mkdirSync(join(root, "audit"), { recursive: true });
  writeFileSync(
    join(root, "audit", "summary.md"),
    [
      "# Audit Summary",
      "",
      outcomeBlock,
      "",
      "No validated findings.",
      "",
      "## Checked Files",
      "",
      "- `README.md:1`",
      "",
      "## Checked Commands",
      "",
      '- Command `rg -n "test" README.md` output: `README.md:1:# test`',
      "",
    ].join("\n"),
    "utf8",
  );
  execFileSync("git", ["add", "audit/summary.md"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["commit", "-m", "add audit synthesis", "--no-verify"], {
    cwd: root,
    stdio: "ignore",
  });
}

function gitSnapshot(root: string): { id: string; commit: string; tree: string } {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return { id: `git:${commit}:${tree}`, commit, tree };
}

function withAuditManifest(input: {
  body: string;
  taskId: string;
  artifactPath: string;
  snapshot: { id: string; commit: string; tree: string };
  contentSha256?: string;
}): string {
  const manifest = {
    version: 1,
    auditPlanId: `task:${input.taskId}`,
    taskId: input.taskId,
    artifactPath: input.artifactPath,
    contentSha256: input.contentSha256 ?? computeAuditReportContentSha256(input.body),
    sourceSnapshot: { ...input.snapshot, dirty: false },
    outcome: "validated_no_findings",
    scopeCoverage: [{ root: "README.md", covered: true, evidenceRefs: ["ev-1"] }],
    riskHypotheses: [
      { id: "risk-1", description: "Runtime evidence can be forged", status: "covered" },
    ],
    findings: [],
    noFindingsClaims: [{ id: "nf-1", evidenceRefs: ["ev-1"] }],
    evidenceRefs: ["ev-1"],
  };
  return `${input.body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`;
}

const IMPLEMENTATION_TOOL_ACTIVITY = [
  "[2026-05-09T00:00:00.000Z] Agent: implement-coordinator started (runtime=qwen-local-agent, transport=api, model=Qwen3)",
  "[2026-05-09T00:00:01.000Z] Tool: read_file README.md",
  "[2026-05-09T00:00:02.000Z] Tool: write_file reports/audit.md",
  "[2026-05-09T00:00:03.000Z] Agent: implement-coordinator complete (runtime=qwen-local-agent, transport=api, model=Qwen3)",
].join("\n");

const REVIEW_TOOL_ACTIVITY = [
  "[2026-05-09T00:00:04.000Z] Agent: review-gate started (runtime=qwen-local-agent, transport=api, model=Qwen3)",
  "[2026-05-09T00:00:05.000Z] Tool: read_file README.md",
  "[2026-05-09T00:00:06.000Z] Agent: review-gate complete (runtime=qwen-local-agent, transport=api, model=Qwen3)",
].join("\n");

const RISKY_COMPLETION_ACTIVITY = `${IMPLEMENTATION_TOOL_ACTIVITY}\n${REVIEW_TOOL_ACTIVITY}`;

const INTERLEAVED_REVIEW_TOOL_ACTIVITY = [
  "[2026-05-09T00:00:04.000Z] Agent: review-sidecar started (runtime=qwen-local-agent)",
  "[2026-05-09T00:00:05.000Z] Agent: security-sidecar started (runtime=qwen-local-agent)",
  "[2026-05-09T00:00:06.000Z] Agent: review-sidecar complete (runtime=qwen-local-agent)",
  "[2026-05-09T00:00:07.000Z] Tool: read_file README.md",
  "[2026-05-09T00:00:08.000Z] Agent: security-sidecar complete (runtime=qwen-local-agent)",
].join("\n");

const REVIEW_MUTATING_TOOL_ACTIVITY = [
  "[2026-05-09T00:00:04.000Z] Agent: review-sidecar started (runtime=qwen-local-agent)",
  "[2026-05-09T00:00:05.000Z] Tool: write_file README.md",
  "[2026-05-09T00:00:06.000Z] Agent: review-sidecar complete (runtime=qwen-local-agent)",
].join("\n");

const REVIEW_UNRELATED_SHELL_ACTIVITY = [
  "[2026-05-09T00:00:04.000Z] Agent: review-sidecar started (runtime=qwen-local-agent)",
  "[2026-05-09T00:00:05.000Z] Tool: run_shell pwd",
  "[2026-05-09T00:00:06.000Z] Agent: review-sidecar complete (runtime=qwen-local-agent)",
].join("\n");

const REVIEW_MUTATING_FIND_SHELL_ACTIVITY = [
  "[2026-05-09T00:00:04.000Z] Agent: review-sidecar started (runtime=qwen-local-agent)",
  "[2026-05-09T00:00:05.000Z] Tool: run_shell find . -delete",
  "[2026-05-09T00:00:06.000Z] Agent: review-sidecar complete (runtime=qwen-local-agent)",
].join("\n");

const REVIEW_REDIRECTING_CAT_SHELL_ACTIVITY = [
  "[2026-05-09T00:00:04.000Z] Agent: review-sidecar started (runtime=qwen-local-agent)",
  "[2026-05-09T00:00:05.000Z] Tool: run_shell cat README.md > reports/out.txt",
  "[2026-05-09T00:00:06.000Z] Agent: review-sidecar complete (runtime=qwen-local-agent)",
].join("\n");

const REVIEW_POWERSHELL_WRITING_SHELL_ACTIVITY = [
  "[2026-05-09T00:00:04.000Z] Agent: review-sidecar started (runtime=qwen-local-agent)",
  "[2026-05-09T00:00:05.000Z] Tool: run_shell Get-ChildItem -Recurse | Set-Content reports/out.txt",
  "[2026-05-09T00:00:06.000Z] Agent: review-sidecar complete (runtime=qwen-local-agent)",
].join("\n");

const REVIEW_READ_ONLY_SHELL_ACTIVITY = [
  "[2026-05-09T00:00:04.000Z] Agent: review-sidecar started (runtime=qwen-local-agent)",
  "[2026-05-09T00:00:05.000Z] Tool: run_shell rg test README.md",
  "[2026-05-09T00:00:06.000Z] Tool: run_shell git diff -- README.md",
  "[2026-05-09T00:00:07.000Z] Tool: run_shell git show HEAD -- README.md",
  "[2026-05-09T00:00:08.000Z] Tool: run_shell Get-ChildItem -Recurse",
  "[2026-05-09T00:00:09.000Z] Tool: run_shell Select-String -Path README.md -Pattern test",
  "[2026-05-09T00:00:10.000Z] Agent: review-sidecar complete (runtime=qwen-local-agent)",
].join("\n");

function commitSubstantiveAuditReport(root: string, branch: string): void {
  execFileSync("git", ["checkout", "-b", branch], {
    cwd: root,
    stdio: "ignore",
  });
  mkdirSync(join(root, "reports"), { recursive: true });
  writeFileSync(
    join(root, "reports", "audit.md"),
    [
      "## Finding",
      "Evidence: `README.md:1` contains the repository root documentation.",
      "Risk: The audit scope depends on that documented root.",
      "Verification: Command `rg test README.md` output matched the inspected line.",
      "",
    ].join("\n"),
    "utf8",
  );
  execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
    cwd: root,
    stdio: "ignore",
  });
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

  it.each(["audit-logging", "security-review", "tests", "coverage", "build", "add-checkout"])(
    "does not treat explicit general task alias %s as risky",
    (roadmapAlias) => {
      const root = initRepo();
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", "auditLog.ts"), "export const auditLog = true;\n", "utf8");

      const result = evaluateTaskCompletionEvidence({
        projectRoot: root,
        task: {
          id: `general-${roadmapAlias}`,
          title: "Add audit logging",
          description: "Capture security review events and test coverage notes.",
          taskIntent: "general",
          roadmapAlias,
          tags: [`rm:${roadmapAlias}`, "kind:general"],
          plan: "## Plan\n- [ ] Update the implementation path\n- [ ] Run the focused regression tests",
        },
      });

      expect(result.ok).toBe(true);
      expect(result.evidence.riskyTask).toBe(false);
      expect(codes(result)).not.toContain("missing_report_artifact");
    },
  );

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
    expect(formatTaskCompletionBlockedReason(result)).toContain("src/ghost.ts");
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

  it("flags directory-style line ranges in audit report evidence", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "app"), { recursive: true });
    writeFileSync(join(root, "src", "app", "main.ts"), "export const value = 1;\n", "utf8");
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: src/1-2, src/app/1-20",
        "Risk: Directory ranges cannot be checked as file evidence.",
        "Verification: Command `git status --short` output was clean.",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-directory-ranges",
        title: "Audit generated findings",
        taskIntent: "audit",
        plan: "## Plan\n- Validate references\n- Write report",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.missingReportReferencedPaths).toEqual(
      expect.arrayContaining(["src/1-2", "src/app/1-20"]),
    );
    expect(formatTaskCompletionBlockedReason(result)).toContain("src/app/1-20");
    expect(codes(result)).toContain("invalid_or_missing_file_references");
  });

  it("can suppress manual-review wording when actionable issues are present", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "app"), { recursive: true });
    writeFileSync(join(root, "src", "app", "main.ts"), "export const value = 1;\n", "utf8");
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: src/1-2, src/app/1-20",
        "Risk: Directory ranges cannot be checked as file evidence.",
        "Verification: Command `git status --short` output was clean.",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      requireManualReview: true,
      task: {
        id: "audit-directory-ranges-manual",
        title: "Audit generated findings",
        taskIntent: "audit",
        plan: "## Plan\n- Validate references\n- Write report",
      },
    });

    expect(codes(result)).toEqual(
      expect.arrayContaining(["invalid_or_missing_file_references", "manual_review_required"]),
    );
    const reason = formatTaskCompletionBlockedReason(result, {
      suppressManualReviewWhenActionable: true,
    });
    expect(reason).toContain("invalid_or_missing_file_references");
    expect(reason).toContain("src/app/1-20");
    expect(reason).not.toContain("manual_review_required");
    expect(reason).not.toContain("Manual review is required");
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
      [
        "## Finding",
        "Evidence: `README.md:1` and package.json define the audited root files.",
        "Risk: Missing either file would break the documented package entry points.",
        "Verification: Command `git diff --name-only` output included reports/audit.md.",
        "",
      ].join("\n"),
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
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reportReferencedPaths).toEqual(
      expect.arrayContaining(["README.md", "package.json"]),
    );
    expect(result.evidence.substantiveReportEvidence).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("resolves unique tracked basenames mentioned in audit report prose", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "bot_intevra"), { recursive: true });
    writeFileSync(join(root, "src", "bot_intevra", "bot.py"), "def run():\n    pass\n", "utf8");
    writeFileSync(join(root, "src", "bot_intevra", "db.py"), "def connect():\n    pass\n", "utf8");
    execFileSync("git", ["add", "src/bot_intevra/bot.py", "src/bot_intevra/db.py"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "add python modules", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/basename-audit"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `src/bot_intevra/bot.py:1` defines the bot entry point.",
        "Risk: Prose also mentions modules like `bot.py` and `db.py`, which are unique tracked basenames below src/bot_intevra.",
        "Verification: Command `git ls-files` output included src/bot_intevra/bot.py and src/bot_intevra/db.py.",
        "",
      ].join("\n"),
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
        id: "audit-unique-basename-refs",
        title: "Audit generated findings",
        plan: "## Plan\n- Validate source files\n- Write report",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reportReferencedPaths).toEqual(
      expect.arrayContaining(["src/bot_intevra/bot.py", "src/bot_intevra/db.py"]),
    );
    expect(result.evidence.missingReportReferencedPaths).not.toContain("bot.py");
    expect(result.evidence.missingReportReferencedPaths).not.toContain("db.py");
    expect(codes(result)).not.toContain("invalid_or_missing_file_references");
  });

  it("accepts report evidence paths followed by nearby line ranges", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "bot_intevra"), { recursive: true });
    writeFileSync(
      join(root, "src", "bot_intevra", "config.py"),
      "import os\n\nVALUE = os.getenv('VALUE')\n",
      "utf8",
    );
    execFileSync("git", ["add", "src/bot_intevra/config.py"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/line-range-audit"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `src/bot_intevra/config.py` (lines 1-100) loads configuration from environment variables.",
        "Risk: Broad environment configuration requires careful deployment controls.",
        "Verification: Command `git ls-files` output included src/bot_intevra/config.py.",
        "",
      ].join("\n"),
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
        id: "audit-nearby-line-range",
        title: "Audit security configuration",
        plan: "## Plan\n- Validate config files\n- Write report",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reportReferencedPaths).toContain("src/bot_intevra/config.py");
    expect(result.evidence.substantiveReportEvidence).toBe(true);
    expect(codes(result)).not.toContain("insufficient_report_evidence");
  });

  it("accepts report evidence split across File and Line fields", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "bot_intevra"), { recursive: true });
    writeFileSync(
      join(root, "src", "bot_intevra", "backup_crypto.py"),
      [
        "def encrypt_directory():",
        "    return True",
        "",
        "def decrypt_archive_to_dir():",
        "    return True",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "src/bot_intevra/backup_crypto.py"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "add backup crypto", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/split-file-line-audit"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "persistence-audit.md"),
      [
        "## Evidence",
        "### 1. Backup Encryption Security",
        "- **File**: `src/bot_intevra/backup_crypto.py`",
        "- **Line**: 1-2",
        "- **Evidence**: `encrypt_directory` uses an explicit implementation path.",
        "- **Risk**: None identified.",
        "- **Verification**: Command `grep 'encrypt_directory' src/bot_intevra/backup_crypto.py` output included the function definition.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/persistence-audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-split-file-line",
        title: "Audit persistence and migration safety",
        plan: "## Plan\n- Validate persistence files\n- Write report",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reportReferencedPaths).toContain("src/bot_intevra/backup_crypto.py");
    expect(result.evidence.substantiveReportEvidence).toBe(true);
    expect(codes(result)).not.toContain("insufficient_report_evidence");
  });

  it("accepts line references after closing markdown delimiters", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "bot_intevra"), { recursive: true });
    writeFileSync(
      join(root, "src", "bot_intevra", "backup_crypto.py"),
      "def derive_key():\n    return True\n",
      "utf8",
    );
    execFileSync("git", ["add", "src/bot_intevra/backup_crypto.py"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "add backup crypto", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/delimited-line-audit"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "security-audit.md"),
      [
        "## Finding",
        "Evidence: `src/bot_intevra/backup_crypto.py`:1 defines the key derivation helper.",
        "Risk: Persistence safety depends on that implementation.",
        "Verification: Command `grep 'derive_key' src/bot_intevra/backup_crypto.py` output included the helper.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/security-audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-delimited-line-ref",
        title: "Audit persistence and migration safety",
        plan: "## Plan\n- Validate persistence files\n- Write report",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reportReferencedPaths).toContain("src/bot_intevra/backup_crypto.py");
    expect(result.evidence.substantiveReportEvidence).toBe(true);
    expect(codes(result)).not.toContain("insufficient_report_evidence");
  });

  it("treats .env.example line references as substantive evidence", () => {
    const root = initRepo();
    writeFileSync(join(root, ".env.example"), "TOKEN=\n", "utf8");
    execFileSync("git", ["add", ".env.example"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add env example", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/env-audit"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `.env.example:1` documents the expected token variable.",
        "Risk: Environment templates must not contain live secret values.",
        "Verification: Command `git ls-files` output included .env.example.",
        "",
      ].join("\n"),
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
        id: "audit-env-example",
        title: "Audit security configuration",
        plan: "## Plan\n- Validate environment template\n- Write report",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reportReferencedPaths).toContain(".env.example");
    expect(result.evidence.substantiveReportEvidence).toBe(true);
  });

  it("accepts read_file command output as structured review evidence", () => {
    const root = initRepo();
    writeFileSync(join(root, ".env.example"), "TOKEN=\n", "utf8");
    execFileSync("git", ["add", ".env.example"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add env example", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/read-file-evidence"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: .env.example is treated as a secret-like path.",
        "Risk: Review evidence may come from a repository tool guard instead of file contents.",
        "Verification: Command read_file path=.env.example output error: read path references a secret-like path.",
        "",
      ].join("\n"),
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
        id: "audit-read-file-command-evidence",
        title: "Audit security configuration",
        plan: "## Plan\n- Validate environment template\n- Write report",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reportReferencedPaths).toContain(".env.example");
    expect(result.evidence.substantiveReportEvidence).toBe(true);
  });

  it("blocks untracked report artifacts when the task requires a committed report", () => {
    const root = initRepo();
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: The audit scope depends on that documented root.",
        "Verification: Command `git status --short` output was clean after commit.",
        "",
      ].join("\n"),
      "utf8",
    );

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
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: The audit scope depends on that documented root.",
        "Verification: Command `git status --short` output was clean after commit.",
        "",
      ].join("\n"),
      "utf8",
    );
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
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: The audit scope depends on that documented root.",
        "Verification: Command `git status --short` output was clean after commit.",
        "",
      ].join("\n"),
      "utf8",
    );
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
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: The audit scope depends on that documented root.",
        "Verification: Command `git status --short` output was clean after commit.",
        "",
      ].join("\n"),
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
        id: "audit-committed-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.committedReportRequired).toBe(true);
    expect(result.evidence.reportArtifactFiles).toContain("reports/audit.md");
    expect(result.evidence.committedChangedFiles).toContain("reports/audit.md");
    expect(result.evidence.uncommittedReportArtifactFiles).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it("accepts prior implementation tool activity when a clean committed report survived a no-op rework", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/audit-report-rework"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: The audit scope depends on that documented root.",
        "Verification: Command `git status --short` output was clean after commit.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const noOpReworkActivity = [
      "[2026-05-09T00:00:07.000Z] Agent: implement-coordinator started (runtime=qwen-local-agent, transport=api, model=Qwen3)",
      "[2026-05-09T00:00:08.000Z] Agent: implement-coordinator complete (runtime=qwen-local-agent, transport=api, model=Qwen3)",
    ].join("\n");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-committed-report-noop-rework",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: [
          IMPLEMENTATION_TOOL_ACTIVITY,
          noOpReworkActivity,
          REVIEW_TOOL_ACTIVITY,
        ].join("\n"),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.implementationToolActivityCount).toBe(0);
    expect(result.evidence.reviewStageToolActivityCount).toBe(1);
    expect(result.issues).toEqual([]);
  });

  it("blocks risky committed reports without review-stage repository tool activity", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/audit-no-review-tool"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: The audit scope depends on that documented root.",
        "Verification: Command `git status --short` output was clean after commit.",
        "",
      ].join("\n"),
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
        id: "audit-committed-report-no-review-tool",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: IMPLEMENTATION_TOOL_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.implementationToolActivityCount).toBe(2);
    expect(result.evidence.reviewStageToolActivityCount).toBe(0);
    expect(codes(result)).toContain("missing_review_tool_activity");
  });

  it("counts interleaved review sidecar repository tool activity", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/audit-interleaved-review-tool"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: The audit scope depends on that documented root.",
        "Verification: Command `rg reviewed README.md` output matched the inspected line.",
        "",
      ].join("\n"),
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
        id: "audit-interleaved-review-tool",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: `${IMPLEMENTATION_TOOL_ACTIVITY}\n${INTERLEAVED_REVIEW_TOOL_ACTIVITY}`,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reviewStageToolActivityCount).toBe(1);
    expect(result.issues).toEqual([]);
  });

  it("does not count review-stage write tools as repository inspection activity", () => {
    const root = initRepo();
    commitSubstantiveAuditReport(root, "feature/audit-review-write-tool");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-review-write-tool",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: `${IMPLEMENTATION_TOOL_ACTIVITY}\n${REVIEW_MUTATING_TOOL_ACTIVITY}`,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reviewStageToolActivityCount).toBe(0);
    expect(codes(result)).toContain("missing_review_tool_activity");
  });

  it("does not count unrelated review-stage shell commands as repository inspection activity", () => {
    const root = initRepo();
    commitSubstantiveAuditReport(root, "feature/audit-review-pwd-tool");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-review-pwd-tool",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: `${IMPLEMENTATION_TOOL_ACTIVITY}\n${REVIEW_UNRELATED_SHELL_ACTIVITY}`,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reviewStageToolActivityCount).toBe(0);
    expect(codes(result)).toContain("missing_review_tool_activity");
  });

  it("does not count mutating review-stage shell commands as repository inspection activity", () => {
    const root = initRepo();
    commitSubstantiveAuditReport(root, "feature/audit-review-find-delete");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-review-find-delete",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: `${IMPLEMENTATION_TOOL_ACTIVITY}\n${REVIEW_MUTATING_FIND_SHELL_ACTIVITY}`,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reviewStageToolActivityCount).toBe(0);
    expect(codes(result)).toContain("missing_review_tool_activity");
  });

  it("does not count redirecting review-stage shell commands as repository inspection activity", () => {
    const root = initRepo();
    commitSubstantiveAuditReport(root, "feature/audit-review-cat-redirection");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-review-cat-redirection",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: `${IMPLEMENTATION_TOOL_ACTIVITY}\n${REVIEW_REDIRECTING_CAT_SHELL_ACTIVITY}`,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reviewStageToolActivityCount).toBe(0);
    expect(codes(result)).toContain("missing_review_tool_activity");
  });

  it("does not count PowerShell write forms as repository inspection activity", () => {
    const root = initRepo();
    commitSubstantiveAuditReport(root, "feature/audit-review-powershell-write");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-review-powershell-write",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: `${IMPLEMENTATION_TOOL_ACTIVITY}\n${REVIEW_POWERSHELL_WRITING_SHELL_ACTIVITY}`,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reviewStageToolActivityCount).toBe(0);
    expect(codes(result)).toContain("missing_review_tool_activity");
  });

  it("counts read-only review-stage shell inspection commands", () => {
    const root = initRepo();
    commitSubstantiveAuditReport(root, "feature/audit-review-shell-readonly");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-review-shell-readonly",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        plan: "## Plan\n- Write reports/audit.md",
        agentActivityLog: `${IMPLEMENTATION_TOOL_ACTIVITY}\n${REVIEW_READ_ONLY_SHELL_ACTIVITY}`,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.reviewStageToolActivityCount).toBe(5);
    expect(result.issues).toEqual([]);
  });

  it("blocks circular audit reports that only cite runtime mechanics", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/circular-audit-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "# Audit Report",
        "",
        "- Report artifact committed at reports/audit.md.",
        "- Task ran with repository tools.",
        "- Agent activity log shows implementation and review-gate execution.",
        "- Repository reference: README.md.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add circular audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-circular-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(codes(result)).toContain("insufficient_report_evidence");
  });

  it("blocks impossible path-line evidence references", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/impossible-line-audit-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:999999` contains the repository root documentation.",
        "Risk: The audit scope depends on that documented root.",
        "Verification: The referenced line was inspected.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add impossible line audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-impossible-line-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(codes(result)).toContain("insufficient_report_evidence");
  });

  it("blocks circular claims tied to existing non-report files", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/circular-existing-path-audit-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` validated this report exists and the task ran.",
        "Risk: The task would otherwise lack a committed report.",
        "Verification: `README.md:1` verified the report artifact was committed.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add circular existing path report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-circular-existing-path-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(codes(result)).toContain("insufficient_report_evidence");
  });

  it("blocks self-referential report path evidence", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/self-referential-audit-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: reports/audit.md:1 proves this report exists.",
        "Risk: The task would otherwise lack a committed report.",
        "Verification: reports/audit.md:1 was committed.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add self audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-self-referential-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(codes(result)).toContain("insufficient_report_evidence");
  });

  it("blocks structured-looking reports that mention paths without exact evidence markers", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/weak-structured-audit-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: README.md was mentioned during the run.",
        "Risk: The report may be generic.",
        "Verification: The task ran and this artifact was committed.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add weak structured audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-weak-structured-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(codes(result)).toContain("insufficient_report_evidence");
  });

  it("blocks owner-grade audit findings that omit a proposed fix", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "config.ts"), "export const timeoutMs = 1000;\n", "utf8");
    execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/owner-audit-no-fix"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "runtime-audit.md"),
      [
        "## Finding",
        "Evidence: `src/config.ts:1` sets the runtime timeout.",
        "Risk: A hard timeout can reject slow but valid operations without an override path.",
        'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/runtime-audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add runtime audit", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "owner-audit-no-proposed-fix",
        title: "Audit runtime quality",
        description:
          "Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(codes(result)).toContain("insufficient_report_evidence");
  });

  it("blocks owner-grade audit findings whose evidence field lacks a concrete line reference", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "config.ts"), "export const timeoutMs = 1000;\n", "utf8");
    execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/owner-audit-evidence-line"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "runtime-audit.md"),
      [
        "## Finding",
        "Evidence: `src/config.ts` sets the runtime timeout.",
        "Risk: A hard timeout can reject slow but valid operations without an override path.",
        "Proposed fix: expose timeout configuration through the runtime profile.",
        'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/runtime-audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add runtime audit", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "owner-audit-evidence-without-line",
        title: "Audit runtime quality",
        description:
          "Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(codes(result)).toContain("insufficient_report_evidence");
  });

  it("blocks owner-grade audit reports made of governance observations", () => {
    const root = initRepo();
    writeFileSync(join(root, "AGENTS.md"), "# Working Agreements\n", "utf8");
    execFileSync("git", ["add", "AGENTS.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add agents", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/owner-audit-governance"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "architecture-audit.md"),
      [
        "## Finding: Overlap in Task/Workflow Routing",
        "Evidence: `AGENTS.md:1` documents working agreements.",
        "Risk: This duplication can lead to inconsistent behavior when handling tasks.",
        "Proposed fix: Consolidate the working agreements section in a single document.",
        'Verification: Command `rg -n "Working Agreements" AGENTS.md` output: `1:# Working Agreements`',
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/architecture-audit.md"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "add architecture audit", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "owner-audit-governance",
        title: "Audit architecture quality",
        description:
          "Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("low_quality_report_evidence");
  });

  it("accepts owner-grade audit reports with no validated findings and checked evidence", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "config.ts"), "export const timeoutMs = 1000;\n", "utf8");
    execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/owner-audit-no-findings"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "runtime-audit.md"),
      [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "",
        "Checked files:",
        "- `src/config.ts:1`",
        "",
        "Checked commands:",
        '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/runtime-audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add runtime audit", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "owner-audit-no-findings",
        title: "Audit runtime quality",
        description:
          "Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.substantiveReportEvidence).toBe(true);
    expect(codes(result)).not.toContain("insufficient_report_evidence");
  });

  it("blocks audit reports with placeholder git verification output", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/placeholder-git-output"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: Placeholder verification would make the report look validated without real evidence.",
        "Verification: Command `git log -1 --name-only --oneline` output:",
        "```",
        "123abc Add audit report",
        "```",
        "",
      ].join("\n"),
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
        id: "audit-placeholder-git-output",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reportQualityIssues.join(" ")).toContain("placeholder commit hashes");
    expect(codes(result)).toContain("low_quality_report_evidence");
  });

  it("blocks observed bad audit reports through typed validator details", () => {
    const root = initRepo();
    writeFileSync(join(root, "AGENTS.md"), "# Working Agreements\n", "utf8");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "config.ts"), "export const timeoutMs = 1000;\n", "utf8");
    execFileSync("git", ["add", "AGENTS.md", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit sources", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/observed-bad-audit"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "architecture-audit.md"),
      [
        "# Architecture Audit",
        "",
        "## Finding: Overlap in Task/Workflow Routing",
        "Evidence: `AGENTS.md:1` documents working agreements.",
        "Risk: Documentation ownership can be unclear.",
        "Proposed fix: Consolidate governance documents.",
        "Verification: Command `git log -1 --oneline --decorate` output:",
        "```",
        "1234567 (HEAD -> main)",
        "```",
        "",
        "## No Validated Findings",
        "Checked files:",
        "- `src/config.ts:1`",
        "Checked commands:",
        '- Command `rg -n "timeoutMs" src/config.ts` output would show the timeout.',
        "The implementation likely uses distributed configuration and may contain unclear ownership.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/architecture-audit.md"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "add observed bad audit", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-observed-bad-report",
        title: "Audit architecture quality",
        description:
          "Report artifact: audit/architecture-audit.md. Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("low_quality_report_evidence");
    expect(result.evidence.auditReportValidation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "synthetic_git_output",
        "contradictory_findings_and_no_findings",
        "governance_observation_as_finding",
        "unverified_inspection_claim",
        "speculative_audit_claim",
      ]),
    );
  });

  it("blocks audit reports that claim existing paths are missing", () => {
    const root = initRepo();
    mkdirSync(join(root, "docs", "ops"), { recursive: true });
    writeFileSync(join(root, "docs", "ops", "runbook.md"), "# Runbook\n", "utf8");
    execFileSync("git", ["add", "docs/ops/runbook.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add ops docs", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/false-missing-path"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: False missing-path claims make the audit unreliable.",
        "Verification: Command `ls -la docs/ops` output:",
        "```",
        "ls: cannot access 'docs/ops': No such file or directory",
        "```",
        "",
      ].join("\n"),
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
        id: "audit-false-missing-path",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reportQualityIssues.join(" ")).toContain("docs/ops");
    expect(codes(result)).toContain("low_quality_report_evidence");
  });

  it("blocks speculative audit reports that admit inspection gaps", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/speculative-audit"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: The report may contain unverified assumptions instead of findings.",
        "The database file is reported as too large to read and may contain unhandled errors.",
        "Verification: Command `git log -1 --name-only --oneline` output included `reports/audit.md`.",
        "",
      ].join("\n"),
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
        id: "audit-speculative-report",
        title: "Full project audit",
        description: "Done only when the report is committed.",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reportQualityIssues.join(" ")).toContain("unverified inspection");
    expect(codes(result)).toContain("low_quality_report_evidence");
  });

  it("blocks audit summaries with tool-size-limit claims and future commit verification", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/weak-synthesis-summary"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "summary.md"),
      [
        "# Audit Summary",
        "",
        "## Finding",
        "Evidence: `README.md:1` contains repository documentation.",
        "Risk: A tool read limit is not a repository finding.",
        "Verification: Command `read_file README.md` output: `file is too large (8409 bytes > 1000 byte limit)`.",
        "",
        "## Git Verification",
        "The audit/summary.md file has been created and will be committed to the repository.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/summary.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit summary", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-weak-summary",
        title: "Synthesize audit findings",
        description: "Done only when the summary is committed.",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reportQualityIssues.join(" ")).toContain("unverified inspection");
    expect(result.evidence.reportQualityIssues.join(" ")).toContain("future-tense git");
    expect(codes(result)).toContain("low_quality_report_evidence");
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

  it("allows validated source audit artifact paths as synthesis evidence", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/audit-synthesis"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "summary.md"),
      [
        "## Finding 1",
        "Evidence: `audit/source-audit.md` records the validated source report finding.",
        "Risk: The synthesis would otherwise reject valid cross-branch audit evidence.",
        "Verification: Command `git log -1 --name-only --oneline` output included `audit/summary.md`.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/summary.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit synthesis", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-synthesis",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
        allowedEvidenceArtifactPaths: ["audit/source-audit.md"],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.existingReportReferencedPaths).toContain("audit/source-audit.md");
    expect(result.evidence.missingReportReferencedPaths).not.toContain("audit/source-audit.md");
    expect(codes(result)).not.toContain("invalid_or_missing_file_references");
    expect(codes(result)).not.toContain("insufficient_report_evidence");
  });

  it("blocks audit synthesis when persisted source outcome is inconclusive despite stronger final text", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/audit-inconclusive-synthesis"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "summary.md"),
      [
        "# Audit Summary",
        "",
        formatAuditSynthesisOutcomeForArtifact({
          kind: "inconclusive_batch_evidence",
          reason:
            "Audit inconclusive: source reports were limited to inventory and existence checks.",
          sourceReportCount: 6,
          validatedFindingCount: 0,
          substantiveNoFindingsReportCount: 0,
          inventoryOnlyNoFindingsReportCount: 6,
          weakReportCount: 0,
        }),
        "",
        "No validated findings.",
        "",
        "## Checked Files",
        "",
        "- `README.md:1`",
        "",
        "## Checked Commands",
        "",
        '- Command `rg -n "test" README.md` output: `README.md:1:# test`',
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/summary.md"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "add audit synthesis", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-inconclusive-synthesis",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        auditArtifactRole: "synthesis",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.auditSynthesisOutcome?.kind).toBe("inconclusive_batch_evidence");
    expect(codes(result)).toContain("audit_inconclusive");
  });

  it("blocks audit synthesis with forged no-findings metadata and zero source reports", () => {
    const root = initRepo();
    commitAuditSynthesisWithMetadata(
      root,
      "feature/audit-forged-zero-source-synthesis",
      formatAuditSynthesisOutcomeForArtifact({
        kind: "validated_no_findings",
        reason: "Forged stale no-findings outcome.",
        sourceReportCount: 0,
        validatedFindingCount: 0,
        substantiveNoFindingsReportCount: 0,
        inventoryOnlyNoFindingsReportCount: 0,
        weakReportCount: 0,
      }),
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-forged-zero-source-synthesis",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        auditArtifactRole: "synthesis",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.auditSynthesisOutcome?.kind).toBe("inconclusive_batch_evidence");
    expect(codes(result)).toContain("audit_inconclusive");
  });

  it("blocks audit synthesis with forged no-findings metadata and inventory-only source counts", () => {
    const root = initRepo();
    commitAuditSynthesisWithMetadata(
      root,
      "feature/audit-forged-inventory-source-synthesis",
      formatAuditSynthesisOutcomeForArtifact({
        kind: "validated_no_findings",
        reason: "Forged no-findings outcome from inventory reports.",
        sourceReportCount: 6,
        validatedFindingCount: 0,
        substantiveNoFindingsReportCount: 0,
        inventoryOnlyNoFindingsReportCount: 6,
        weakReportCount: 0,
      }),
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-forged-inventory-source-synthesis",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        auditArtifactRole: "synthesis",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.auditSynthesisOutcome?.kind).toBe("inconclusive_batch_evidence");
    expect(result.evidence.auditSynthesisOutcome?.inventoryOnlyNoFindingsReportCount).toBe(6);
    expect(codes(result)).toContain("audit_inconclusive");
  });

  it("allows audit synthesis with persisted substantive no-findings outcome", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/audit-substantive-no-findings"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "summary.md"),
      [
        "# Audit Summary",
        "",
        formatAuditSynthesisOutcomeForArtifact({
          kind: "validated_no_findings",
          reason:
            "No findings survived validation and all source reports included substantive no-findings evidence.",
          sourceReportCount: 1,
          validatedFindingCount: 0,
          substantiveNoFindingsReportCount: 1,
          inventoryOnlyNoFindingsReportCount: 0,
          weakReportCount: 0,
        }),
        "",
        "No validated findings.",
        "",
        "## Checked Files",
        "",
        "- `README.md:1`",
        "",
        "## Checked Commands",
        "",
        '- Command `rg -n "test" README.md` output: `README.md:1:# test`',
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/summary.md"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "add audit synthesis", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-substantive-no-findings-synthesis",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        auditArtifactRole: "synthesis",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.auditSynthesisOutcome?.kind).toBe("validated_no_findings");
    expect(codes(result)).not.toContain("audit_inconclusive");
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

  it("requires the expected audit report artifact path when one is declared", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/wrong-audit-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "wrong.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` identifies the repository documentation.",
        "Risk: The expected report path could otherwise be bypassed.",
        "Verification: Command `git log -1 --name-only --oneline` output included this file.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/wrong.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add wrong audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-expected-report",
        title: "Audit expected report path",
        description: "Report artifact: audit/expected.md",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.expectedReportArtifactPath).toBe("audit/expected.md");
    expect(result.evidence.reportArtifactFiles).toEqual([]);
    expect(codes(result)).toContain("missing_report_artifact");
  });

  it("blocks committed non-report changes alongside the declared report artifact", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/report-plus-agents"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` identifies the repository documentation.",
        "Risk: The report-only contract could otherwise hide source-adjacent edits.",
        "Verification: Command `git log -1 --name-only --oneline` output included reports/audit.md.",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(join(root, "AGENTS.md"), "# Local instructions\n", "utf8");
    execFileSync("git", ["add", "reports/audit.md", "AGENTS.md"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "add audit report and agents", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-report-plus-agents",
        title: "Audit expected report path",
        description: "Report artifact: reports/audit.md",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.reportArtifactFiles).toEqual(["reports/audit.md"]);
    expect(result.evidence.unexpectedNonReportChangedFiles).toEqual(["AGENTS.md"]);
    expect(codes(result)).toContain("unexpected_non_report_changes");
  });

  it("allows clean committed changes limited to the declared report artifact", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/report-only"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` identifies the repository documentation.",
        "Risk: The expected report path contract must allow report-only completion.",
        "Verification: Command `git log -1 --name-only --oneline` output included reports/audit.md.",
        "",
      ].join("\n"),
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
        id: "audit-report-only",
        title: "Audit expected report path",
        description: "Report artifact: reports/audit.md",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.unexpectedNonReportChangedFiles).toEqual([]);
    expect(codes(result)).not.toContain("unexpected_non_report_changes");
  });

  it("blocks dirty non-report changes alongside the declared report artifact", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/report-plus-dirty"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` identifies the repository documentation.",
        "Risk: Dirty side files could otherwise pass as audit completion.",
        "Verification: Command `git log -1 --name-only --oneline` output included reports/audit.md.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    writeFileSync(join(root, "AGENTS.md"), "# Dirty instructions\n", "utf8");

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-report-plus-dirty",
        title: "Audit expected report path",
        description: "Report artifact: reports/audit.md",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.dirtyChangedFiles).toContain("AGENTS.md");
    expect(result.evidence.unexpectedNonReportChangedFiles).toEqual(["AGENTS.md"]);
    expect(codes(result)).toContain("unexpected_non_report_changes");
  });

  it("accepts expected audit report paths that match the shared audit contract", () => {
    const root = initRepo();
    execFileSync("git", ["checkout", "-b", "feature/docs-audit-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "security-audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` identifies the repository documentation.",
        "Risk: The report path contract can drift across gates.",
        "Verification: Command `git log -1 --name-only --oneline` output included docs/security-audit.md.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "docs/security-audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add docs audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-expected-docs-report",
        title: "Audit expected docs report path",
        description: "Report artifact: docs/security-audit.md",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.expectedReportArtifactPath).toBe("docs/security-audit.md");
    expect(result.evidence.reportArtifactFiles).toEqual(["docs/security-audit.md"]);
    expect(codes(result)).not.toContain("missing_report_artifact");
  });

  it("passes task scope into audit report validation for committed reports", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const value = 1;\n", "utf8");
    execFileSync("git", ["add", "src/app.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add source", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/scoped-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "No validated findings.",
        "",
        "Checked files:",
        "- `src/app.ts:1`",
        "",
        "Checked commands:",
        '- Command `rg -n "value" src` output: `src/app.ts:1:export const value = 1;`',
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add scoped audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-scoped-report",
        title: "Audit source scope",
        description: "Scope: src\nReport artifact: reports/audit.md",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.auditReportValidation.scopeRoots).toEqual(["src"]);
    expect(result.evidence.substantiveReportEvidence).toBe(true);
  });

  it("does not let legacy evidence fallback bypass missing scope coverage", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const value = 1;\n", "utf8");
    execFileSync("git", ["add", "src/app.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add source", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/scope-gap-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "No validated findings.",
        "",
        "Checked files:",
        "- `README.md:1`",
        "",
        "Checked commands:",
        '- Command `rg -n "test" README.md` output: `1:# test`',
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add incomplete audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-scope-gap-report",
        title: "Audit source scope",
        description: "Scope: src\nReport artifact: reports/audit.md",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(result.evidence.auditReportValidation.issues.map((issue) => issue.code)).toContain(
      "missing_scope_coverage",
    );
    expect(codes(result)).toContain("insufficient_report_evidence");
    expect(formatTaskCompletionBlockedReason(result)).toContain("src");
  });

  it("does not let legacy evidence fallback bypass validator substantive evidence failures", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const value = 1;\n", "utf8");
    execFileSync("git", ["add", "src/app.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add source", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/weak-substantive-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "No validated findings.",
        "",
        "Checked files:",
        "- `src/app.ts:1`",
        "",
        "Checked commands:",
        "- Command `rg value src`",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add weak audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-weak-substantive-report",
        title: "Audit source scope",
        description: "Scope: src\nReport artifact: reports/audit.md",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(result.evidence.auditReportValidation.issues.map((issue) => issue.code)).toContain(
      "missing_substantive_evidence",
    );
    expect(codes(result)).toContain("insufficient_report_evidence");
  });

  it("blocks inventory-only no-findings before synthesis classification", () => {
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const value = 1;\n", "utf8");
    execFileSync("git", ["add", "src/app.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add source", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/inventory-only-source-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "No validated findings.",
        "",
        "Checked files:",
        "- `src/app.ts:1`",
        "",
        "Checked commands:",
        "- Command `git ls-files -- src/app.ts` output:",
        "```",
        "src/app.ts",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add inventory audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      task: {
        id: "audit-inventory-only-source-report",
        title: "Audit source report",
        description:
          "Report artifact: reports/audit.md. Evidence requirements: support no-findings with checked files and commands.",
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(result.evidence.auditSynthesisOutcome).toBeNull();
    expect(result.evidence.auditReportValidation.sourceClassification).toBe(
      "inventory_only_invalid",
    );
    expect(result.evidence.auditReportValidation.issues.map((issue) => issue.code)).toContain(
      "missing_substantive_evidence",
    );
    expect(codes(result)).toContain("insufficient_report_evidence");
  });

  it("blocks audit reports that cite manifest evidence without runtime ledger evidence", () => {
    const root = initRepo();
    const taskId = "audit-ledger-required";
    const artifactPath = "reports/audit.md";
    const body = [
      "No validated findings.",
      "",
      "Checked files:",
      "- `README.md:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "test" README.md` output: `README.md:1:# test`',
      "",
    ].join("\n");
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, artifactPath),
      withAuditManifest({ body, taskId, artifactPath, snapshot: gitSnapshot(root) }),
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      auditEvidenceUnits: [],
      task: {
        id: taskId,
        title: "Audit runtime evidence",
        description: `Report artifact: ${artifactPath}`,
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.auditReportValidation.issues.map((issue) => issue.code)).toContain(
      "missing_audit_evidence_ref",
    );
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(codes(result)).toContain("missing_audit_evidence_ref");
    expect(codes(result)).toContain("insufficient_report_evidence");
    expect(codes(result)).toContain("low_quality_report_evidence");
  });

  it("surfaces manifest and audit evidence validation failures as top-level completion codes", () => {
    const root = initRepo();
    const taskId = "audit-ledger-mismatch";
    const artifactPath = "reports/audit.md";
    const body = [
      "No validated findings.",
      "",
      "Checked files:",
      "- `README.md:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "test" README.md` output: `README.md:1:# test`',
      "",
    ].join("\n");
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, artifactPath),
      withAuditManifest({
        body,
        taskId,
        artifactPath,
        snapshot: gitSnapshot(root),
        contentSha256: "0".repeat(64),
      }),
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      requireAuditLedgerEvidence: true,
      auditEvidenceUnits: [
        {
          id: "ev-1",
          taskId,
          auditPlanId: `task:${taskId}`,
          sourceSnapshotId: `git:${"1".repeat(40)}:${"2".repeat(40)}`,
          toolName: "Grep",
          evidenceKind: "search",
          evidenceGrade: "substantive",
          scopeIds: ["README.md"],
          riskHypothesisIds: ["risk-1"],
          pathHashes: [],
          pathRangeHashes: [],
          command: null,
          exitCode: 0,
          outputSha256: null,
          outputPreview: "README.md:1:# test",
          outputPreviewTruncated: false,
          parsedSummary: null,
          redactionStatus: "clean",
          createdAt: "2026-05-12T00:00:00.000Z",
        },
      ],
      task: {
        id: taskId,
        title: "Audit runtime evidence",
        description: `Report artifact: ${artifactPath}`,
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("manifest_content_hash_mismatch");
    expect(codes(result)).toContain("audit_evidence_source_snapshot_mismatch");
    expect(codes(result)).toContain("insufficient_report_evidence");
  });

  it("blocks ledger-required audit reports that omit the runtime evidence manifest", () => {
    const root = initRepo();
    const taskId = "audit-ledger-manifest-required";
    const artifactPath = "reports/audit.md";
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, artifactPath),
      [
        "No validated findings.",
        "",
        "Checked files:",
        "- `README.md:1`",
        "",
        "Checked commands:",
        '- Command `rg -n "test" README.md` output: `README.md:1:# test`',
        "",
      ].join("\n"),
      "utf8",
    );

    const result = evaluateTaskCompletionEvidence({
      projectRoot: root,
      requireAuditLedgerEvidence: true,
      auditEvidenceUnits: [],
      task: {
        id: taskId,
        title: "Audit runtime evidence",
        description: `Report artifact: ${artifactPath}`,
        taskIntent: "audit",
        agentActivityLog: RISKY_COMPLETION_ACTIVITY,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.evidence.auditReportValidation.issues.map((issue) => issue.code)).toContain(
      "missing_report_manifest",
    );
    expect(result.evidence.substantiveReportEvidence).toBe(false);
    expect(codes(result)).toContain("missing_report_manifest");
    expect(codes(result)).toContain("insufficient_report_evidence");
    expect(codes(result)).toContain("low_quality_report_evidence");
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
