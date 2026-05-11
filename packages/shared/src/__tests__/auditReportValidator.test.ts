import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateAuditReportArtifact } from "../auditReportValidator.js";

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "aif-audit-validator-"));
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "README.md"), "# test\n", "utf8");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "config.ts"), "export const timeoutMs = 1000;\n", "utf8");
  mkdirSync(join(root, "docs", "ops"), { recursive: true });
  writeFileSync(join(root, "docs", "ops", "runbook.md"), "# Runbook\n", "utf8");
  execFileSync("git", ["add", "README.md", "src/config.ts", "docs/ops/runbook.md"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
    cwd: root,
    stdio: "ignore",
  });
  return root;
}

function issueCodes(result: ReturnType<typeof validateAuditReportArtifact>): string[] {
  return result.issues.map((issue) => issue.code);
}

describe("auditReportValidator", () => {
  it("rejects the observed bad report contract fixture", () => {
    const root = initRepo();
    const text = [
      "# Architecture Audit",
      "",
      "## Finding: Overlap in Task/Workflow Routing",
      "Evidence: `README.md:1` documents the repository.",
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
      "Command `ls docs/ops` output:",
      "```",
      "ls: cannot access 'docs/ops': No such file or directory",
      "```",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      reportArtifactPaths: ["audit/architecture-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "synthetic_git_output",
        "contradictory_findings_and_no_findings",
        "governance_observation_as_finding",
        "unverified_inspection_claim",
        "speculative_audit_claim",
        "false_missing_path_claim",
      ]),
    );
  });

  it("accepts valid no-findings reports with checked files and commands", () => {
    const root = initRepo();
    const text = [
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
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.substantiveEvidence).toBe(true);
    expect(result.existingReferencedPaths).toContain("src/config.ts");
  });

  it("accepts valid findings with path line evidence, risk, proposed fix, and verification", () => {
    const root = initRepo();
    const text = [
      "## Finding",
      "Evidence: `src/config.ts:1` defines the timeout value used by runtime configuration.",
      "Risk: A future change could bypass the runtime limit guard.",
      "Proposed fix: Keep timeout validation centralized near this export.",
      '- Verification: Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.substantiveEvidence).toBe(true);
  });

  it("accepts path line ranges as evidence coverage", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `README.md:1-1`",
      "- `src/config.ts:1-1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: README.md, src/config.ts",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.scopeCoverage).toEqual([
      expect.objectContaining({
        root: "README.md",
        coveredFiles: ["README.md"],
        ok: true,
      }),
      expect.objectContaining({
        root: "src/config.ts",
        coveredFiles: ["src/config.ts"],
        ok: true,
      }),
    ]);
  });

  it("rejects low-quality governance reports even when range citations cover scope", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "AGENTS.md"),
      Array.from({ length: 24 }, (_, index) => `agent line ${index + 1}`).join("\n"),
      "utf8",
    );
    writeFileSync(
      join(root, "README.md"),
      Array.from({ length: 100 }, (_, index) => `readme line ${index + 1}`).join("\n"),
      "utf8",
    );
    writeFileSync(
      join(root, "pyproject.toml"),
      Array.from({ length: 20 }, (_, index) => `pyproject line ${index + 1}`).join("\n"),
      "utf8",
    );
    mkdirSync(join(root, ".ai-factory"), { recursive: true });
    writeFileSync(
      join(root, ".ai-factory", "config.yaml"),
      Array.from({ length: 12 }, (_, index) => `config line ${index + 1}`).join("\n"),
      "utf8",
    );
    mkdirSync(join(root, "src", "bot_intevra"), { recursive: true });
    for (const file of ["__init__.py", "cli.py", "config.py"]) {
      writeFileSync(
        join(root, "src", "bot_intevra", file),
        Array.from({ length: 8 }, (_, index) => `${file} line ${index + 1}`).join("\n"),
        "utf8",
      );
    }

    const text = [
      "# Audit: Architecture and Ownership Boundaries",
      "",
      "## Findings",
      "",
      "### Finding 1: Incomplete Ownership Clarity",
      "- **Severity:** Advisory",
      "- **Evidence:** `AGENTS.md:17-20`",
      "- **Risk:** The working agreements section lacks explicit ownership clarity for different components.",
      "- **Proposed Fix:** Add a section in `AGENTS.md` that outlines ownership boundaries.",
      '- **Verification:** Command `grep -A 20 "Working Agreements" AGENTS.md` output: `agent line 17`',
      "",
      "### Finding 2: Coupling Risks in Task/Workflow Routing",
      "- **Severity:** Advisory",
      "- **Evidence:** `README.md:85-90`",
      "- **Risk:** The task routing logic does not explicitly define boundaries for task/workflow routing.",
      "- **Proposed Fix:** Refactor `README.md` to include clear boundaries.",
      '- **Verification:** Command `grep -A 10 "Commands" README.md` output: `readme line 85`',
      "",
      "### Finding 3: Missing Dependency Documentation",
      "- **Severity:** Advisory",
      "- **Evidence:** `pyproject.toml:7-16`",
      "- **Risk:** The dependency list does not include documentation for each dependency.",
      "- **Proposed Fix:** Add comments to each dependency in `pyproject.toml`.",
      '- **Verification:** Command `grep -A 10 "dependencies" pyproject.toml` output: `pyproject line 7`',
      "",
      "### Finding 4: Missing Ownership Clarity in .ai-factory/config.yaml",
      "- **Severity:** Advisory",
      "- **Evidence:** `.ai-factory/config.yaml:1-10`",
      "- **Risk:** The configuration file does not explicitly define ownership for configuration sections.",
      "- **Proposed Fix:** Add ownership boundaries to `.ai-factory/config.yaml`.",
      "- **Verification:** Command `head -n 10 .ai-factory/config.yaml` output: `config line 1`",
      "",
      "### Finding 5: Missing Ownership Clarity in src/bot_intevra",
      "- **Severity:** Advisory",
      "- **Evidence:** `src/bot_intevra/__init__.py:1-5`, `src/bot_intevra/cli.py:1-5`, `src/bot_intevra/config.py:1-5`",
      "- **Risk:** The initialization and configuration files do not explicitly define ownership.",
      "- **Proposed Fix:** Add ownership comments to the files.",
      "- **Verification:** Command `head -n 5 src/bot_intevra/__init__.py` output: `__init__.py line 1`",
      "",
      "## Git Verification",
      "- **Git Log:** Command `git log -1 --name-only --oneline` output:",
      "```",
      "abcdef0 (HEAD -> main) Add audit report for architecture and ownership boundaries",
      "audit/2026-05-11-audit-architecture-and-ownership-boundaries-audit.md",
      "```",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription:
        "Scope: README.md, AGENTS.md, pyproject.toml, .ai-factory/config.yaml, src/bot_intevra",
      reportArtifactPaths: [
        "audit/2026-05-11-audit-architecture-and-ownership-boundaries-audit.md",
      ],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "fake_or_placeholder_command_output",
        "governance_observation_as_finding",
      ]),
    );
    expect(issueCodes(result)).not.toContain("missing_scope_coverage");
  });

  it("accepts valid findings that cover declared source directory scope", () => {
    const root = initRepo();
    writeFileSync(join(root, "src", "api.ts"), "export const api = true;\n", "utf8");
    writeFileSync(join(root, "src", "worker.ts"), "export const worker = true;\n", "utf8");
    const text = [
      "## Finding",
      "Evidence: `src/api.ts:1`, `src/config.ts:1`, and `src/worker.ts:1` cover representative source entry points.",
      "Risk: Divergent source entry points could bypass the runtime timeout contract.",
      "Proposed fix: Keep shared runtime checks near the source exports.",
      '- Verification: Command `rg -n "export const" src` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src",
      reportArtifactPaths: ["audit/source-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.scopeRoots).toEqual(["src"]);
    expect(result.scopeCoverage).toEqual([
      expect.objectContaining({
        root: "src",
        kind: "directory",
        requiredEvidenceCount: 3,
        commandEvidence: true,
        ok: true,
      }),
    ]);
  });

  it("accepts representative coverage for large directories without exhaustive citations", () => {
    const root = initRepo();
    for (let index = 0; index < 8; index += 1) {
      writeFileSync(
        join(root, "src", `module${index}.ts`),
        `export const value${index} = ${index};\n`,
        "utf8",
      );
    }
    const text = [
      "No validated findings.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `src/module0.ts:1`",
      "- `src/module1.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "export const" src` output: `src/module0.ts:1:export const value0 = 0;`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope:\n- `src`\nAudit mandate: inspect source modules.",
      reportArtifactPaths: ["audit/source-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.scopeRoots).toEqual(["src"]);
    expect(result.scopeCoverage[0]).toEqual(
      expect.objectContaining({
        requiredEvidenceCount: 3,
        ok: true,
      }),
    );
    expect(result.scopeCoverage[0]?.coveredFiles).toHaveLength(3);
  });

  it("accepts no-findings reports that cover declared source file scope", () => {
    const root = initRepo();
    const text = [
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
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.scopeCoverage).toEqual([
      expect.objectContaining({
        root: "src/config.ts",
        kind: "file",
        coveredFiles: ["src/config.ts"],
        ok: true,
      }),
    ]);
  });

  it("rejects reports that cite only root docs when declared scope is source code", () => {
    const root = initRepo();
    const text = [
      "# Source Audit",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `README.md:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "test" README.md` output: `1:# test`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src",
      reportArtifactPaths: ["audit/source-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("missing_scope_coverage");
    expect(result.scopeCoverage[0]).toEqual(
      expect.objectContaining({
        root: "src",
        coveredFiles: [],
        commandEvidence: false,
        ok: false,
      }),
    );
  });

  it("ignores broad non-path scope prose that cannot be checked deterministically", () => {
    const root = initRepo();
    const text = [
      "# Batch Audit",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `docs/ops/runbook.md:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "Runbook" docs/ops` output: `docs/ops/runbook.md:1:# Runbook`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription:
        "Scope: audit reports generated by this audit batch under audit/. Report artifact: audit/summary.md.",
      reportArtifactPaths: ["audit/summary.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.scopeRoots).toEqual([]);
    expect(result.scopeCoverage).toEqual([]);
  });

  it("rejects findings mixed with No Validated Findings", () => {
    const root = initRepo();
    const text = [
      "## Finding",
      "Evidence: `src/config.ts:1` defines the timeout value.",
      "Risk: The finding is contradicted below.",
      "Proposed fix: Remove the contradiction.",
      '- Verification: Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
      "",
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("contradictory_findings_and_no_findings");
  });
});
