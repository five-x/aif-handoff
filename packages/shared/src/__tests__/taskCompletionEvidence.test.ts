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
