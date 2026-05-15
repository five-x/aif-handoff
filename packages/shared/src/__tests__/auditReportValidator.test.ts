import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeAuditReportContentSha256,
  validateAuditReportArtifact,
  type AuditReportSourceSnapshot,
} from "../auditReportValidator.js";
import type { AuditEvidenceUnit } from "../auditEvidenceLedger.js";

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

function gitSnapshot(
  root: string,
): Required<Pick<AuditReportSourceSnapshot, "id" | "commit" | "tree">> {
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

function withManifest(input: {
  body: string;
  taskId?: string;
  batchId?: string;
  roadmapAlias?: string;
  artifactPath?: string;
  snapshot: Required<Pick<AuditReportSourceSnapshot, "id" | "commit" | "tree">>;
  outcome?: string;
  contentSha256?: string;
  omitTaskId?: boolean;
  omitBatchId?: boolean;
  omitRoadmapAlias?: boolean;
  scopeCoverage?: unknown[];
  riskHypotheses?: unknown[];
  noFindingsClaims?: unknown[];
}): string {
  const taskId = input.taskId ?? "task-audit";
  const manifest = {
    version: 1,
    auditPlanId: input.batchId ? `batch:${input.batchId}:task:${taskId}` : `task:${taskId}`,
    ...(input.omitTaskId ? {} : { taskId }),
    ...(input.batchId && !input.omitBatchId ? { batchId: input.batchId } : {}),
    ...(input.roadmapAlias && !input.omitRoadmapAlias ? { roadmapAlias: input.roadmapAlias } : {}),
    artifactPath: input.artifactPath ?? "audit/runtime-audit.md",
    contentSha256: input.contentSha256 ?? computeAuditReportContentSha256(input.body),
    sourceSnapshot: { ...input.snapshot, dirty: false },
    outcome: input.outcome ?? "validated_no_findings",
    scopeCoverage: input.scopeCoverage ?? [{ root: "src", covered: true, evidenceRefs: ["ev-1"] }],
    riskHypotheses: input.riskHypotheses ?? [
      { id: "risk-1", description: "Runtime configuration drift", status: "covered" },
    ],
    findings:
      input.outcome === "validated_findings_present"
        ? [{ id: "finding-1", evidenceRefs: ["ev-1"] }]
        : [],
    noFindingsClaims:
      input.outcome === "validated_findings_present"
        ? []
        : (input.noFindingsClaims ?? [{ id: "nf-1", evidenceRefs: ["ev-1"] }]),
    evidenceRefs: ["ev-1"],
  };
  return `${input.body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`;
}

function manifestEvidenceUnit(input: {
  snapshot: Required<Pick<AuditReportSourceSnapshot, "id" | "commit" | "tree">>;
  id?: string;
  taskId?: string;
  auditPlanId?: string;
  sourceSnapshotId?: string;
  evidenceGrade?: AuditEvidenceUnit["evidenceGrade"];
  scopeIds?: string[];
  riskHypothesisIds?: string[];
}): AuditEvidenceUnit {
  const taskId = input.taskId ?? "task-audit";
  const outputPreview = "src/config.ts:1:export const timeoutMs = 1000;";
  return {
    id: input.id ?? "ev-1",
    taskId,
    auditPlanId: input.auditPlanId ?? `task:${taskId}`,
    sourceSnapshotId:
      input.sourceSnapshotId ??
      input.snapshot.id ??
      `git:${input.snapshot.commit}:${input.snapshot.tree}`,
    toolName: "Grep",
    evidenceKind: "search",
    evidenceGrade: input.evidenceGrade ?? "substantive",
    scopeIds: input.scopeIds ?? ["src"],
    riskHypothesisIds: input.riskHypothesisIds ?? ["risk-1"],
    pathHashes: ["0".repeat(64)],
    pathRangeHashes: [],
    command: { command: "rg timeoutMs src/config.ts", args: [], cwd: null },
    exitCode: 0,
    outputSha256: "1".repeat(64),
    outputPreview,
    outputPreviewTruncated: false,
    parsedSummary: {
      outputBytes: outputPreview.length,
      outputLineCount: 1,
      previewChars: outputPreview.length,
      exitCode: 0,
    },
    redactionStatus: "clean",
    createdAt: "2026-05-12T00:00:00.000Z",
  };
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

  it("accepts valid no-findings reports with checked files, commands, and scoped risk claims", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
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
    expect(result.sourceClassification).toBe("validated_no_findings");
    expect(result.existingReferencedPaths).toContain("src/config.ts");
  });

  it("rejects escaped-newline serialized markdown report blobs", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("malformed_report_artifact");
  });

  it("accepts normal multi-line reports that discuss escaped newline strings", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` newline serialization handling was covered and is absent.",
      "",
      "Evidence:",
      "- `src/config.ts:1` defines the runtime timeout constant used by the parser fixture.",
      "- The reviewed command output includes literal `\\n`, `\\r\\n`, and `\\n` text because the parser handles escaped newline samples.",
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
    expect(issueCodes(result)).not.toContain("malformed_report_artifact");
    expect(result.sourceClassification).toBe("validated_no_findings");
  });

  it("rejects plain no-findings reports without risk hypotheses or scoped claims", () => {
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

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_no_findings");
    expect(issueCodes(result)).toContain("missing_risk_hypotheses");
  });

  it.each([
    "Risk hypotheses: covered and absent",
    "Risk hypotheses: risk-1 was covered and is absent",
    "Scoped no-findings claim: timeout risk is absent",
  ])("rejects generic no-findings claim text without path or risk id: %s", (claim) => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      claim,
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

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_no_findings");
    expect(issueCodes(result)).toContain("missing_risk_hypotheses");
  });

  it.each([
    [
      "git ls-files",
      [
        "- Command `git ls-files -- src/config.ts README.md` output:",
        "```",
        "README.md",
        "src/config.ts",
        "```",
      ],
    ],
    ["git status", ["- Command `git status --short` output:", "```", "M src/config.ts", "```"]],
    ["ls", ["- Command `ls src` output: `src/config.ts`"]],
    ["find", ["- Command `find src -maxdepth 1 -type f` output: `src/config.ts`"]],
    [
      "Get-ChildItem",
      ["- Command `Get-ChildItem src` output: `Mode LastWriteTime Length Name config.ts`"],
    ],
    ["file-existence check", ["- Command `test -f src/config.ts` returned exit code 0."]],
    ["mass line-one citations", ["Checked commands:", "- `src/config.ts:1`", "- `README.md:1`"]],
  ])("rejects inventory-only no-findings reports with %s evidence", (_label, commandLines) => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `README.md:1`",
      "",
      "Checked commands:",
      ...commandLines,
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.substantiveEvidence).toBe(false);
    expect(result.sourceClassification).toBe("inventory_only_invalid");
    expect(issueCodes(result)).toContain("missing_substantive_evidence");
  });

  it.each([
    "- Command `cat src/config.ts:1-1` output: `export const timeoutMs = 1000;`",
    '- Command `cat "src/config.ts:1-1"` output: `export const timeoutMs = 1000;`',
    "- Command `cat 'src/config.ts:1-1'` output: `export const timeoutMs = 1000;`",
    "- Command `cat -- src/config.ts:1-1` output: `export const timeoutMs = 1000;`",
    "- Command `cat -n src/config.ts:1-1` output: `export const timeoutMs = 1000;`",
    "- Command `cat /tmp/src/config.ts:1` output: `export const timeoutMs = 1000;`",
    '- Command `type "src/config.ts:1-1"` output: `export const timeoutMs = 1000;`',
    '- Command `type "packages\\shared\\src\\auditReportValidator.ts:1"` output: `const x = 1;`',
    '- Command `type "C:\\repo\\src\\config.ts:1"` output: `export const timeoutMs = 1000;`',
    "- Verification: `cat src/config.ts:1-1` output: `export const timeoutMs = 1000;`",
    "- Command: `cat src/config.ts:1-1` output: `export const timeoutMs = 1000;`",
    "- Command `cat Dockerfile:1` output: `FROM node:22`",
    "- `cat src/config.ts:1-1` output:",
  ])(
    "rejects cat/type commands that target path line references as report evidence: %s",
    (commandLine) => {
      const root = initRepo();
      const text = [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
        "",
        "Checked files:",
        "- `src/config.ts:1`",
        "",
        "Checked commands:",
        commandLine,
        "",
      ].join("\n");

      const result = validateAuditReportArtifact({
        text,
        projectRoot: root,
        reportArtifactPaths: ["audit/runtime-audit.md"],
        requireProposedFix: true,
      });

      expect(result.ok).toBe(false);
      expect(issueCodes(result)).toContain("invalid_line_reference");
    },
  );

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
    expect(result.sourceClassification).toBe("validated_findings_present");
  });

  it("accepts path line ranges as evidence coverage", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Scoped no-findings claim: `src/config.ts` timeout configuration risk is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1-1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src/config.ts",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.scopeCoverage).toEqual([
      expect.objectContaining({
        root: "src/config.ts",
        coveredFiles: ["src/config.ts"],
        ok: true,
      }),
    ]);
  });

  it("rejects missing files and out-of-range line refs in report evidence", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/missing.ts:1`",
      "- `src/config.ts:99`",
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

    expect(result.ok).toBe(false);
    expect(result.missingReferencedPaths).toContain("src/missing.ts");
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["missing_report_file_references", "invalid_line_reference"]),
    );
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
      "Risk hypotheses: risk-1 for `src/config.ts` source exports was covered and is absent.",
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
      "Scoped no-findings claim: `src/config.ts` timeout configuration risk is absent.",
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

  it("rejects metadata/header-only line-one no-findings evidence", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Scoped no-findings claim: `README.md` documentation risk is absent.",
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
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_no_findings");
    expect(issueCodes(result)).toContain("missing_substantive_evidence");
  });

  it("rejects structured findings supported only by header-only line-one citations", () => {
    const root = initRepo();
    const text = [
      "## Finding",
      "Evidence: `README.md:1` is a cited repository line.",
      "Risk: Header-only citations are not substantive audit evidence.",
      "Proposed fix: Cite source behavior instead of document metadata.",
      '- Verification: Command `rg -n "test" README.md` output: `1:# test`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_findings_present");
    expect(issueCodes(result)).toContain("missing_substantive_evidence");
  });

  it("does not count header-only line-one citations as declared scope coverage", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Scoped no-findings claim: `README.md` documentation risk is absent.",
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
      taskDescription: "Scope: README.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("missing_scope_coverage");
    expect(result.scopeCoverage).toEqual([
      expect.objectContaining({
        root: "README.md",
        coveredFiles: [],
        ok: false,
      }),
    ]);
  });

  it("rejects explicit root scope as unverifiable coverage", () => {
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
      taskDescription: "Scope: .",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("missing_scope_coverage");

    const multiline = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope:\n- `.`",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(multiline.ok).toBe(false);
    expect(issueCodes(multiline)).toContain("missing_scope_coverage");
  });

  it("excludes hidden/generated evidence unless directly scoped", () => {
    const root = initRepo();
    mkdirSync(join(root, ".ai-factory"), { recursive: true });
    writeFileSync(join(root, ".ai-factory", "config.yaml"), "enabled: true\n", "utf8");
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Scoped no-findings claim: `.ai-factory/config.yaml` generated-config risk is absent.",
      "",
      "Checked files:",
      "- `.ai-factory/config.yaml:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "enabled" .ai-factory/config.yaml` output: `1:enabled: true`',
      "",
    ].join("\n");

    const unscoped = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });
    expect(unscoped.ok).toBe(false);
    expect(unscoped.sourceClassification).not.toBe("validated_no_findings");
    expect(issueCodes(unscoped)).toContain("irrelevant_audit_evidence");

    const scoped = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: .ai-factory/config.yaml",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });
    expect(scoped.ok).toBe(true);
    expect(scoped.sourceClassification).toBe("validated_no_findings");
    expect(issueCodes(scoped)).not.toContain("irrelevant_audit_evidence");
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
      "Scoped no-findings claim: `src/config.ts` timeout configuration risk is absent.",
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

  it("accepts manifest-backed no-findings reports and exposes hash and snapshot binding", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
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
      text: withManifest({ body, taskId: "task-audit", snapshot }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [manifestEvidenceUnit({ snapshot })],
    });

    expect(result.ok).toBe(true);
    expect(result.manifestStatus).toBe("valid");
    expect(result.manifestVersion).toBe(1);
    expect(result.contentSha256).toBe(computeAuditReportContentSha256(body));
    expect(result.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sourceSnapshot).toEqual(expect.objectContaining(snapshot));
    expect(result.sourceClassification).toBe("validated_no_findings");
  });

  it("accepts manifest evidence refs backed by matching runtime ledger units", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
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
      text: withManifest({ body, taskId: "task-audit", snapshot }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [manifestEvidenceUnit({ snapshot })],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(true);
    expect(result.manifestStatus).toBe("valid");
    expect(issueCodes(result)).not.toContain("missing_audit_evidence_ref");
  });

  it("rejects no-findings manifests without risk hypothesis ids", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        riskHypotheses: [],
        noFindingsClaims: [{ id: "nf-1", evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [manifestEvidenceUnit({ snapshot })],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("missing_risk_hypotheses");
  });

  it("rejects no-findings manifests without scope coverage ids", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        scopeCoverage: [],
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [manifestEvidenceUnit({ snapshot })],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("missing_scope_coverage");
  });

  it("does not require committed report manifests to self-reference the report commit", () => {
    const root = initRepo();
    const sourceSnapshot = gitSnapshot(root);
    const body = [
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
    mkdirSync(join(root, "audit"), { recursive: true });
    writeFileSync(
      join(root, "audit", "runtime-audit.md"),
      withManifest({ body, taskId: "task-audit", snapshot: sourceSnapshot }),
      "utf8",
    );
    execFileSync("git", ["add", "audit/runtime-audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });

    const result = validateAuditReportArtifact({
      text: readFileSync(join(root, "audit", "runtime-audit.md"), "utf8"),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [manifestEvidenceUnit({ snapshot: sourceSnapshot })],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(true);
    expect(issueCodes(result)).not.toContain("manifest_source_snapshot_mismatch");
  });

  it("rejects ledger-required reports without a valid manifest", () => {
    const root = initRepo();
    const body = [
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
      text: body,
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(result.manifestStatus).toBe("missing");
    expect(issueCodes(result)).toContain("missing_report_manifest");
  });

  it("rejects manifest evidence refs without matching runtime ledger units", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({ body, taskId: "task-audit", snapshot }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(result.manifestStatus).toBe("invalid");
    expect(issueCodes(result)).toContain("missing_audit_evidence_ref");
  });

  it("rejects runtime ledger refs bound to a different task plan or source snapshot", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({ body, taskId: "task-audit", snapshot }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [
        manifestEvidenceUnit({
          snapshot,
          taskId: "wrong-task",
          auditPlanId: "task:wrong-task",
          sourceSnapshotId: `git:${"1".repeat(40)}:${"2".repeat(40)}`,
        }),
      ],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "audit_evidence_identity_mismatch",
        "audit_evidence_source_snapshot_mismatch",
      ]),
    );
  }, 60_000);

  it("rejects runtime ledger refs not bound to the manifest source snapshot", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({ body, taskId: "task-audit", snapshot }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [
        manifestEvidenceUnit({
          snapshot,
          sourceSnapshotId: `git:${"1".repeat(40)}:${"2".repeat(40)}`,
        }),
      ],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("audit_evidence_source_snapshot_mismatch");
    expect(result.issues.map((issue) => issue.message).join(" ")).toContain(
      `expected manifest source snapshot ${snapshot.id}`,
    );
  });

  it("rejects no-findings manifests backed only by discovery-grade runtime evidence", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({ body, taskId: "task-audit", snapshot }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [manifestEvidenceUnit({ snapshot, evidenceGrade: "discovery" })],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("audit_evidence_discovery_only");
  });

  it("rejects manifest scope and risk claims not covered by cited runtime evidence", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({ body, taskId: "task-audit", snapshot }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [
        manifestEvidenceUnit({
          snapshot,
          scopeIds: ["docs"],
          riskHypothesisIds: ["risk-2"],
        }),
      ],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["audit_evidence_scope_mismatch", "audit_evidence_risk_mismatch"]),
    );
  });

  it("fails closed when manifest content hash mismatches the report body", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        contentSha256: "0".repeat(64),
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.manifestStatus).toBe("invalid");
    expect(issueCodes(result)).toContain("manifest_content_hash_mismatch");
  });

  it("reports malformed manifest blocks as invalid rather than missing", () => {
    const root = initRepo();
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: `${body}\n\n\`\`\`audit-report-manifest\n{not json}\n\`\`\`\n`,
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.manifestStatus).toBe("invalid");
    expect(issueCodes(result)).toContain("invalid_report_manifest");
  });

  it("fails closed when manifest task batch and artifact identity contradict validation context", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "wrong-task",
        batchId: "wrong-batch",
        roadmapAlias: "wrong-roadmap",
        artifactPath: "audit/wrong.md",
        snapshot,
      }),
      projectRoot: root,
      taskId: "task-audit",
      roadmapBatchId: "batch-a",
      roadmapAlias: "audit-v1",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("manifest_identity_mismatch");
  });

  it("accepts source_inconclusive as a manifest outcome vocabulary value", () => {
    const root = mkdtempSync(join(tmpdir(), "aif-audit-validator-vocab-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "config.ts"), "export const timeoutMs = 1000;\n", "utf8");
    const body = [
      "Audit inconclusive.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");
    const manifest = {
      version: 1,
      auditPlanId: "task:task-audit",
      taskId: "task-audit",
      artifactPath: "audit/runtime-audit.md",
      contentSha256: computeAuditReportContentSha256(body),
      sourceSnapshot: { id: "snapshot:source-inconclusive", dirty: false },
      outcome: "source_inconclusive",
      scopeCoverage: [{ root: "src", covered: true, evidenceRefs: ["ev-1"] }],
      riskHypotheses: [
        { id: "risk-1", description: "Runtime configuration drift", status: "covered" },
      ],
      findings: [],
      noFindingsClaims: [{ id: "nf-1", evidenceRefs: ["ev-1"] }],
      evidenceRefs: ["ev-1"],
    };

    const result = validateAuditReportArtifact({
      text: `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.manifest?.outcome).toBe("source_inconclusive");
    expect(issueCodes(result)).not.toContain("invalid_report_manifest");
  });

  it("fails closed when required manifest identity fields are omitted", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const missingTask = validateAuditReportArtifact({
      text: withManifest({ body, taskId: "task-audit", snapshot, omitTaskId: true }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });
    const missingBatch = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        batchId: "batch-a",
        snapshot,
        omitBatchId: true,
      }),
      projectRoot: root,
      taskId: "task-audit",
      roadmapBatchId: "batch-a",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });
    const missingAlias = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        roadmapAlias: "audit-v1",
        snapshot,
        omitRoadmapAlias: true,
      }),
      projectRoot: root,
      taskId: "task-audit",
      roadmapAlias: "audit-v1",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    for (const result of [missingTask, missingBatch, missingAlias]) {
      expect(result.ok).toBe(false);
      expect(result.manifestStatus).toBe("invalid");
      expect(issueCodes(result)).toContain("missing_report_manifest_fields");
    }
  }, 60_000);

  it("rejects placeholder manifest hashes and source snapshots", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");
    const manifest = {
      version: 1,
      auditPlanId: "task:task-audit",
      taskId: "task-audit",
      artifactPath: "audit/runtime-audit.md",
      contentSha256: "<computed_sha256>",
      sourceSnapshot: {
        id: "<source_snapshot>",
        commit: "<commit>",
        tree: "<tree>",
        dirty: false,
      },
      outcome: "validated_no_findings",
      scopeCoverage: [{ root: "src", covered: true, evidenceRefs: ["ev-1"] }],
      riskHypotheses: [
        { id: "risk-1", description: "Runtime configuration drift", status: "covered" },
      ],
      findings: [],
      noFindingsClaims: [{ id: "nf-1", evidenceRefs: ["ev-1"] }],
      evidenceRefs: ["ev-1"],
    };

    const result = validateAuditReportArtifact({
      text: `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      expectedSourceSnapshot: snapshot,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.manifestStatus).toBe("invalid");
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "missing_report_manifest_fields",
        "manifest_source_snapshot_mismatch",
      ]),
    );
  }, 10_000);

  it("validates source line references against the declared snapshot instead of current worktree", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    writeFileSync(
      join(root, "src", "config.ts"),
      ["export const timeoutMs = 1000;", "export const retries = 3;", ""].join("\n"),
      "utf8",
    );
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:2`",
      "Checked commands:",
      '- Command `rg -n "retries" src/config.ts` output: `2:export const retries = 3;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({ body, taskId: "task-audit", snapshot }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      expectedSourceSnapshot: snapshot,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["invalid_line_reference", "missing_substantive_evidence"]),
    );
    expect(result.sourceClassification).toBe("insufficient_substantive_evidence");
  });

  it("fails closed when manifest source snapshot contradicts the expected snapshot", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot: {
          ...snapshot,
          id: `git:${snapshot.commit}:${"1".repeat(40)}`,
          tree: "1".repeat(40),
        },
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      expectedSourceSnapshot: snapshot,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("manifest_source_snapshot_mismatch");
  });
});
