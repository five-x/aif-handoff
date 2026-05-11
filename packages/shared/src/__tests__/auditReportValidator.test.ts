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
