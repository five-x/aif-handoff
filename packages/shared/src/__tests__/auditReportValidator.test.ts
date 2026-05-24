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
  version?: number;
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
    version: input.version ?? 1,
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
      { id: "risk-1", description: "Runtime timeout configuration drift", status: "covered" },
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

  it("rejects refactor-smell audit findings even when manifest evidenceRefs are ledger-backed", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Architecture Audit",
      "",
      "### Finding AOB-001: Duplicated initialization should be extracted into a helper",
      "Evidence: `src/config.ts:1` shows the scoped configuration path.",
      "Risk: Future changes must be duplicated across two code blocks, creating a DRY issue.",
      "Proposed fix: Extract the initialization into a shared helper.",
      'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");
    const text = withManifest({
      body,
      snapshot,
      outcome: "validated_findings_present",
      scopeCoverage: [{ root: "src", covered: true, evidenceRefs: ["ev-1"] }],
      riskHypotheses: [
        { id: "risk-1", description: "Architecture boundary risk", status: "covered" },
      ],
    });

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskId: "task-audit",
      auditPlanId: "task:task-audit",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [manifestEvidenceUnit({ snapshot })],
      requireLedgerEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_findings_present");
    expect(issueCodes(result)).toContain("non_actionable_audit_observation");
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

  it("rejects self-reported search evidence when only the command query matches the risk", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "auth" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects shell-wrapped search evidence when only the command query matches the risk", () => {
    const cases = [
      'powershell -Command "rg -n auth src/config.ts"',
      'pwsh -Command "rg -n auth src/config.ts"',
      'cmd /c "rg -n auth src/config.ts"',
      'bash -lc "rg -n auth src/config.ts"',
      'sh -c "rg -n auth src/config.ts"',
    ];

    for (const command of cases) {
      const root = initRepo();
      const text = [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
        "",
        "Checked files:",
        "- `src/config.ts:1`",
        "",
        "Checked commands:",
        `- Command \`${command}\` output: \`src/config.ts:1:export const timeoutMs = 1000;\``,
        "",
        "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
        "",
      ].join("\n");

      const result = validateAuditReportArtifact({
        text,
        projectRoot: root,
        scopeRoots: ["src/config.ts"],
        reportArtifactPaths: ["audit/runtime-audit.md"],
        requireProposedFix: true,
      });

      expect(result.ok).toBe(false);
      expect(result.sourceClassification).toBe("source_inconclusive");
      expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
      expect(result.evidenceDepth.reasonCodes).toEqual(
        expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      );
    }
  });

  it("rejects self-reported search evidence when only the output label matches the risk", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "auth" src/config.ts` output for auth: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects bullet command output when only the output label matches the risk", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "auth" src/config.ts` output for auth',
      "- src/config.ts:1:export const timeoutMs = 1000;",
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects table command output when only the output label matches the risk", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "auth" src/config.ts` output for auth',
      "| src/config.ts:1:export const timeoutMs = 1000; |",
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects bullet command output when only a backticked output label matches the risk", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "auth" src/config.ts` output `for auth`:',
      "- src/config.ts:1:export const timeoutMs = 1000;",
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects table command output when only a backticked output label matches the risk", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "auth" src/config.ts` output `for auth`:',
      "| src/config.ts:1:export const timeoutMs = 1000; |",
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects first-line output labels followed by unrelated multiline output", () => {
    const cases = [
      {
        label: "output: auth",
        outputLine: "- src/config.ts:1:export const timeoutMs = 1000;",
      },
      {
        label: "output: for auth",
        outputLine: "| src/config.ts:1:export const timeoutMs = 1000; |",
      },
      {
        label: "output: `for auth`",
        outputLine: "- src/config.ts:1:export const timeoutMs = 1000;",
      },
    ];

    for (const entry of cases) {
      const root = initRepo();
      const text = [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
        "",
        "Checked files:",
        "- `src/config.ts:1`",
        "",
        "Checked commands:",
        `- Command \`rg -n "auth" src/config.ts\` ${entry.label}`,
        entry.outputLine,
        "",
        "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
        "",
      ].join("\n");

      const result = validateAuditReportArtifact({
        text,
        projectRoot: root,
        scopeRoots: ["src/config.ts"],
        reportArtifactPaths: ["audit/runtime-audit.md"],
        requireProposedFix: true,
      });

      expect(result.ok).toBe(false);
      expect(result.sourceClassification).toBe("source_inconclusive");
      expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
      expect(result.evidenceDepth.reasonCodes).toEqual(
        expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      );
    }
  });

  it("rejects trailing output labels without search result lines", () => {
    const cases = [
      {
        outputLine: "- for auth",
      },
      {
        outputLine: "| for auth |",
      },
    ];

    for (const entry of cases) {
      const root = initRepo();
      const text = [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
        "",
        "Checked files:",
        "- `src/config.ts:1`",
        "",
        "Checked commands:",
        '- Command `rg -n "auth" src/config.ts` output:',
        entry.outputLine,
        "",
        "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
        "",
      ].join("\n");

      const result = validateAuditReportArtifact({
        text,
        projectRoot: root,
        scopeRoots: ["src/config.ts"],
        reportArtifactPaths: ["audit/runtime-audit.md"],
        requireProposedFix: true,
      });

      expect(result.ok).toBe(false);
      expect(result.sourceClassification).toBe("source_inconclusive");
      expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
      expect(result.evidenceDepth.reasonCodes).toEqual(
        expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      );
    }
  });

  it("rejects inline output labels before unrelated output tokens", () => {
    const cases = [
      "output: `for auth`: `src/config.ts:1:export const timeoutMs = 1000;`",
      "output: for auth src/config.ts:1:export const timeoutMs = 1000;",
    ];

    for (const labelAndOutput of cases) {
      const root = initRepo();
      const text = [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
        "",
        "Checked files:",
        "- `src/config.ts:1`",
        "",
        "Checked commands:",
        `- Command \`rg -n "auth" src/config.ts\` ${labelAndOutput}`,
        "",
        "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
        "",
      ].join("\n");

      const result = validateAuditReportArtifact({
        text,
        projectRoot: root,
        scopeRoots: ["src/config.ts"],
        reportArtifactPaths: ["audit/runtime-audit.md"],
        requireProposedFix: true,
      });

      expect(result.ok).toBe(false);
      expect(result.sourceClassification).toBe("source_inconclusive");
      expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
      expect(result.evidenceDepth.reasonCodes).toEqual(
        expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      );
    }
  });

  it("rejects ledger-backed search evidence when only the command query matches the risk", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      "- Runtime ledger ev-1 search evidence:",
      '- Command `rg -n "auth" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");
    const evidenceUnit = manifestEvidenceUnit({
      snapshot,
      scopeIds: ["src/config.ts"],
      riskHypothesisIds: ["risk-auth"],
    });
    evidenceUnit.command = { command: 'rg -n "auth" src/config.ts', args: [], cwd: null };
    evidenceUnit.outputPreview = "src/config.ts:1:export const timeoutMs = 1000;";

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [{ id: "risk-auth", description: "Auth drift", status: "covered" }],
        noFindingsClaims: [
          {
            id: "nf-auth",
            riskId: "risk-auth",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects search_files ledger metadata when only the query matches the risk", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Runtime ledger evidence:",
      "- Evidence `ev-1` from search_files query `auth` inspected `src/config.ts:1`.",
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");
    const evidenceUnit = manifestEvidenceUnit({
      snapshot,
      scopeIds: ["src/config.ts"],
      riskHypothesisIds: ["risk-auth"],
    });
    evidenceUnit.toolName = "search_files";
    evidenceUnit.evidenceKind = "search";
    evidenceUnit.command = null;
    evidenceUnit.outputPreview = [
      '[search_files query="auth" path=src/config.ts]',
      "src/config.ts:1:export const timeoutMs = 1000;",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [{ id: "risk-auth", description: "Auth drift", status: "covered" }],
        noFindingsClaims: [
          {
            id: "nf-auth",
            riskId: "risk-auth",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects search_files ledger inline metadata when only the query matches the risk", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Runtime ledger evidence:",
      "- Evidence `ev-1` from search_files query `auth` inspected `src/config.ts:1`.",
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");
    const evidenceUnit = manifestEvidenceUnit({
      snapshot,
      scopeIds: ["src/config.ts"],
      riskHypothesisIds: ["risk-auth"],
    });
    evidenceUnit.toolName = "search_files";
    evidenceUnit.evidenceKind = "search";
    evidenceUnit.command = null;
    evidenceUnit.outputPreview =
      '[search_files query="auth" path=src/config.ts] src/config.ts:1:export const timeoutMs = 1000;';

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [{ id: "risk-auth", description: "Auth drift", status: "covered" }],
        noFindingsClaims: [
          {
            id: "nf-auth",
            riskId: "risk-auth",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects search_files ledger metadata preceded by prose when only the query matches the risk", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Runtime ledger evidence:",
      "- Evidence `ev-1` from search_files query `auth` inspected `src/config.ts:1`.",
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");
    const evidenceUnit = manifestEvidenceUnit({
      snapshot,
      scopeIds: ["src/config.ts"],
      riskHypothesisIds: ["risk-auth"],
    });
    evidenceUnit.toolName = "search_files";
    evidenceUnit.evidenceKind = "search";
    evidenceUnit.command = null;
    evidenceUnit.outputPreview =
      'Result: [search_files query="auth" path=src/config.ts] src/config.ts:1:export const timeoutMs = 1000;';

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [{ id: "risk-auth", description: "Auth drift", status: "covered" }],
        noFindingsClaims: [
          {
            id: "nf-auth",
            riskId: "risk-auth",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects unbracketed search_files ledger metadata when only the query matches the risk", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Runtime ledger evidence:",
      "- Evidence `ev-1` from search_files query `auth` inspected `src/config.ts:1`.",
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");
    const evidenceUnit = manifestEvidenceUnit({
      snapshot,
      scopeIds: ["src/config.ts"],
      riskHypothesisIds: ["risk-auth"],
    });
    evidenceUnit.toolName = "search_files";
    evidenceUnit.evidenceKind = "search";
    evidenceUnit.command = null;
    evidenceUnit.outputPreview =
      'search_files query="auth" path=src/config.ts src/config.ts:1:export const timeoutMs = 1000;';

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [{ id: "risk-auth", description: "Auth drift", status: "covered" }],
        noFindingsClaims: [
          {
            id: "nf-auth",
            riskId: "risk-auth",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects reordered or pathless search_files ledger metadata when only the query matches the risk", () => {
    const previews = [
      'search_files path=src/config.ts query="auth" src/config.ts:1:export const timeoutMs = 1000;',
      'search_files query="auth" src/config.ts:1:export const timeoutMs = 1000;',
    ];

    for (const outputPreview of previews) {
      const root = initRepo();
      const snapshot = gitSnapshot(root);
      const body = [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
        "",
        "Checked files:",
        "- `src/config.ts:1`",
        "",
        "Runtime ledger evidence:",
        "- Evidence `ev-1` from search_files query `auth` inspected `src/config.ts:1`.",
        "",
        "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
        "",
      ].join("\n");
      const evidenceUnit = manifestEvidenceUnit({
        snapshot,
        scopeIds: ["src/config.ts"],
        riskHypothesisIds: ["risk-auth"],
      });
      evidenceUnit.toolName = "search_files";
      evidenceUnit.evidenceKind = "search";
      evidenceUnit.command = null;
      evidenceUnit.outputPreview = outputPreview;

      const result = validateAuditReportArtifact({
        text: withManifest({
          body,
          snapshot,
          riskHypotheses: [{ id: "risk-auth", description: "Auth drift", status: "covered" }],
          noFindingsClaims: [
            {
              id: "nf-auth",
              riskId: "risk-auth",
              scopeIds: ["src/config.ts"],
              evidenceRefs: ["ev-1"],
            },
          ],
          scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
        }),
        projectRoot: root,
        scopeRoots: ["src/config.ts"],
        reportArtifactPaths: ["audit/runtime-audit.md"],
        auditEvidenceUnits: [evidenceUnit],
        requireLedgerEvidence: true,
        requireProposedFix: true,
      });

      expect(result.ok).toBe(false);
      expect(result.sourceClassification).toBe("source_inconclusive");
      expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
      expect(result.evidenceDepth.reasonCodes).toEqual(
        expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      );
    }
  });

  it("accepts search evidence when the observed output is risk-substantive", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      'export const timeoutMs = 1000;\nexport const authMode = "strict";\n',
      "utf8",
    );
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:2`",
      "",
      "Checked commands:",
      '- Command `rg -n "auth" src/config.ts` output: `src/config.ts:2:export const authMode = "strict";`',
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:2`; no auth drift was identified.",
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
    expect(result.sourceClassification).toBe("validated_no_findings");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(true);
  });

  it("accepts shell-wrapped search evidence when the observed output is risk-substantive", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      'export const timeoutMs = 1000;\nexport const authMode = "strict";\n',
      "utf8",
    );
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:2`",
      "",
      "Checked commands:",
      '- Command `powershell -Command "rg -n auth src/config.ts"` output: `src/config.ts:2:export const authMode = "strict";`',
      "",
      "Absence reasoning: risk-auth covered `src/config.ts:2`; no auth drift was identified.",
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
    expect(result.sourceClassification).toBe("validated_no_findings");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(true);
  });

  it("rejects generic grep dumps as trusted no-findings evidence", () => {
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
      "- Command `git grep -n . -- src/config.ts` output:",
      "```",
      "src/config.ts:1:export const timeoutMs = 1000;",
      "```",
      "",
      "Absence reasoning: risk-1 covered `src/config.ts:1`; no actionable finding was identified in the scoped inspection.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("inventory_only_invalid");
    expect(result.evidenceDepth.status).toBe("shallow");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["inventory_only_evidence", "irrelevant_grep_match"]),
    );
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["inventory_only_evidence", "irrelevant_grep_match"]),
    );
  });

  it("rejects a single no-findings risk with unrelated substantive command evidence", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      'export const timeoutMs = 1000;\nexport const authMode = "strict";\n',
      "utf8",
    );
    execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "expand config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-timeout for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "authMode" src/config.ts` output: `src/config.ts:2:export const authMode = "strict";`',
      "",
      "Absence reasoning: risk-timeout covered `src/config.ts:1`; no timeout drift was identified.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.status).toBe("shallow");
    expect(
      result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-timeout"),
    ).toEqual(
      expect.objectContaining({
        status: "shallow",
        reasonCodes: expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      }),
    );
  });

  it("rejects manifest-backed no-findings risk when ledger evidence does not match the risk", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      'export const timeoutMs = 1000;\nexport const authMode = "strict";\n',
      "utf8",
    );
    execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "expand config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-timeout for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "authMode" src/config.ts` output: `src/config.ts:2:export const authMode = "strict";`',
      "",
      "Absence reasoning: risk-timeout covered `src/config.ts:1`; no timeout drift was identified.",
      "",
    ].join("\n");
    const evidenceUnit = manifestEvidenceUnit({
      snapshot,
      scopeIds: ["src/config.ts"],
      riskHypothesisIds: ["risk-timeout"],
    });
    evidenceUnit.command = { command: 'rg -n "authMode" src/config.ts', args: [], cwd: null };
    evidenceUnit.outputPreview = 'src/config.ts:2:export const authMode = "strict";';

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [{ id: "risk-timeout", description: "Timeout drift", status: "covered" }],
        noFindingsClaims: [
          {
            id: "nf-timeout",
            riskId: "risk-timeout",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.reasonCodes).toEqual(
      expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
    );
  });

  it("rejects no-findings risk when the only risk term match is the scoped file path", () => {
    const root = initRepo();
    writeFileSync(join(root, "src", "auth.ts"), "export const timeoutMs = 1000;\n", "utf8");
    execFileSync("git", ["add", "src/auth.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add auth source", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/auth.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/auth.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/auth.ts` output: `src/auth.ts:1:export const timeoutMs = 1000;`',
      "",
      "Absence reasoning: risk-auth covered `src/auth.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/auth.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-auth")).toEqual(
      expect.objectContaining({
        status: "shallow",
        reasonCodes: expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      }),
    );
  });

  it("rejects manifest-backed no-findings risk when ledger only matches the risk file path", () => {
    const root = initRepo();
    writeFileSync(join(root, "src", "auth.ts"), "export const timeoutMs = 1000;\n", "utf8");
    execFileSync("git", ["add", "src/auth.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add auth source", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-auth for `src/auth.ts` auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/auth.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/auth.ts` output: `src/auth.ts:1:export const timeoutMs = 1000;`',
      "",
      "Absence reasoning: risk-auth covered `src/auth.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");
    const evidenceUnit = manifestEvidenceUnit({
      snapshot,
      scopeIds: ["src/auth.ts"],
      riskHypothesisIds: ["risk-auth"],
    });
    evidenceUnit.command = { command: 'rg -n "timeoutMs" src/auth.ts', args: [], cwd: null };
    evidenceUnit.outputPreview = "src/auth.ts:1:export const timeoutMs = 1000;";

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [{ id: "risk-auth", description: "Auth drift", status: "covered" }],
        noFindingsClaims: [
          {
            id: "nf-auth",
            riskId: "risk-auth",
            scopeIds: ["src/auth.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/auth.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/auth.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-auth")).toEqual(
      expect.objectContaining({
        status: "shallow",
        reasonCodes: expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      }),
    );
  });

  it("rejects reused generic evidence across unrelated no-findings risks", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses:",
      "- risk-1 `src/config.ts` timeout drift was covered and is absent.",
      "- risk-2 `src/config.ts` retry drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [
          { id: "risk-1", description: "Timeout drift", status: "covered" },
          { id: "risk-2", description: "Retry drift", status: "covered" },
        ],
        noFindingsClaims: [
          { id: "nf-1", riskId: "risk-1", scopeIds: ["src/config.ts"], evidenceRefs: ["ev-1"] },
          { id: "nf-2", riskId: "risk-2", scopeIds: ["src/config.ts"], evidenceRefs: ["ev-1"] },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [
        manifestEvidenceUnit({
          snapshot,
          scopeIds: ["src/config.ts"],
          riskHypothesisIds: ["risk-1", "risk-2"],
        }),
      ],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.status).toBe("shallow");
    expect(result.evidenceDepth.reasonCodes).toContain("reused_generic_evidence");
    expect(result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-2")).toEqual(
      expect.objectContaining({
        status: "shallow",
        reasonCodes: expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      }),
    );
    expect(issueCodes(result)).toContain("reused_generic_evidence");
  });

  it("rejects two risks that reuse prose source citations without risk-matching commands", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      "export const timeoutMs = 1000;\nexport const retryCount = 3;\n",
      "utf8",
    );
    execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "expand config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses:",
      "- risk-timeout `src/config.ts` timeout drift was covered and is absent.",
      "- risk-retry `src/config.ts` retry drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "Absence reasoning: risk-timeout covered `src/config.ts:1`; no timeout drift was identified.",
      "Absence reasoning: risk-retry covered `src/config.ts:1`; no retry drift was identified.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-retry")).toEqual(
      expect.objectContaining({
        status: "shallow",
        reasonCodes: expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      }),
    );
  });

  it("rejects manifest-backed reused prose citations when only one risk has matching ledger evidence", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      "export const timeoutMs = 1000;\nexport const retryCount = 3;\n",
      "utf8",
    );
    execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "expand config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses:",
      "- risk-timeout `src/config.ts` timeout drift was covered and is absent.",
      "- risk-retry `src/config.ts` retry drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "Absence reasoning: risk-timeout covered `src/config.ts:1`; no timeout drift was identified.",
      "Absence reasoning: risk-retry covered `src/config.ts:1`; no retry drift was identified.",
      "",
    ].join("\n");
    const evidenceUnit = manifestEvidenceUnit({
      snapshot,
      scopeIds: ["src/config.ts"],
      riskHypothesisIds: ["risk-timeout", "risk-retry"],
    });
    evidenceUnit.command = { command: 'rg -n "timeoutMs" src/config.ts', args: [], cwd: null };
    evidenceUnit.outputPreview = "src/config.ts:1:export const timeoutMs = 1000;";

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [
          { id: "risk-timeout", description: "Timeout drift", status: "covered" },
          { id: "risk-retry", description: "Retry drift", status: "covered" },
        ],
        noFindingsClaims: [
          {
            id: "nf-timeout",
            riskId: "risk-timeout",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
          {
            id: "nf-retry",
            riskId: "risk-retry",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-retry")).toEqual(
      expect.objectContaining({
        status: "shallow",
        reasonCodes: expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      }),
    );
  });

  it("rejects inline multi-risk no-findings when only one risk has matching command evidence", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      'export const timeoutMs = 1000;\nexport const authMode = "strict";\n',
      "utf8",
    );
    execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "expand config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-timeout and risk-auth for `src/config.ts` timeout and auth drift were covered and are absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "Absence reasoning: risk-timeout covered `src/config.ts:1`; no timeout drift was identified.",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-auth")).toEqual(
      expect.objectContaining({
        status: "shallow",
        reasonCodes: expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      }),
    );
  });

  it("rejects manifest-backed inline multi-risk no-findings when ledger evidence matches only one risk", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      'export const timeoutMs = 1000;\nexport const authMode = "strict";\n',
      "utf8",
    );
    execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "expand config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-timeout and risk-auth for `src/config.ts` timeout and auth drift were covered and are absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "Absence reasoning: risk-timeout covered `src/config.ts:1`; no timeout drift was identified.",
      "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
      "",
    ].join("\n");
    const evidenceUnit = manifestEvidenceUnit({
      snapshot,
      scopeIds: ["src/config.ts"],
      riskHypothesisIds: ["risk-timeout", "risk-auth"],
    });
    evidenceUnit.command = { command: 'rg -n "timeoutMs" src/config.ts', args: [], cwd: null };
    evidenceUnit.outputPreview = "src/config.ts:1:export const timeoutMs = 1000;";

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [
          { id: "risk-timeout", description: "Timeout drift", status: "covered" },
          { id: "risk-auth", description: "Auth drift", status: "covered" },
        ],
        noFindingsClaims: [
          {
            id: "nf-timeout",
            riskId: "risk-timeout",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
          {
            id: "nf-auth",
            riskId: "risk-auth",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-auth")).toEqual(
      expect.objectContaining({
        status: "shallow",
        reasonCodes: expect.arrayContaining(["irrelevant_grep_match", "shallow_evidence"]),
      }),
    );
  });

  it("allows one substantive ledger unit to cover multiple related no-findings risks", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      'export const timeoutMs = 1000;\nexport const authMode = "strict";\n',
      "utf8",
    );
    execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "expand config", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-timeout and risk-auth for `src/config.ts` timeout and auth drift were covered and are absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `src/config.ts:2`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs|authMode" src/config.ts` output:',
      "```",
      "src/config.ts:1:export const timeoutMs = 1000;",
      'src/config.ts:2:export const authMode = "strict";',
      "```",
      "",
      "Absence reasoning: risk-timeout covered `src/config.ts:1`; no timeout drift was identified.",
      "Absence reasoning: risk-auth covered `src/config.ts:2`; no auth drift was identified.",
      "",
    ].join("\n");
    const evidenceUnit = manifestEvidenceUnit({
      snapshot,
      scopeIds: ["src/config.ts"],
      riskHypothesisIds: ["risk-timeout", "risk-auth"],
    });
    evidenceUnit.command = {
      command: 'rg -n "timeoutMs|authMode" src/config.ts',
      args: [],
      cwd: null,
    };
    evidenceUnit.outputPreview = [
      "src/config.ts:1:export const timeoutMs = 1000;",
      'src/config.ts:2:export const authMode = "strict";',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [
          { id: "risk-timeout", description: "Timeout drift", status: "covered" },
          { id: "risk-auth", description: "Auth drift", status: "covered" },
        ],
        noFindingsClaims: [
          {
            id: "nf-timeout",
            riskId: "risk-timeout",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
          {
            id: "nf-auth",
            riskId: "risk-auth",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.sourceClassification).toBe("validated_no_findings");
    expect(result.evidenceDepth.status).toBe("substantive");
    expect(issueCodes(result)).not.toContain("reused_generic_evidence");
  });

  it("does not treat the Risk-Specific Evidence heading as a risk hypothesis", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-timeout for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "Absence reasoning: risk-timeout covered `src/config.ts:1`; no timeout drift was identified.",
      "",
      "## Risk-Specific Evidence",
      "",
      '- risk-timeout / `src/config.ts`: Command `rg -n "timeoutMs" src/config.ts` matched `src/config.ts:1`.',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        snapshot,
        riskHypotheses: [{ id: "risk-timeout", description: "Timeout drift", status: "covered" }],
        noFindingsClaims: [
          {
            id: "nf-timeout",
            riskId: "risk-timeout",
            scopeIds: ["src/config.ts"],
            evidenceRefs: ["ev-1"],
          },
        ],
        scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [
        manifestEvidenceUnit({
          snapshot,
          scopeIds: ["src/config.ts"],
          riskHypothesisIds: ["risk-timeout"],
        }),
      ],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.sourceClassification).toBe("validated_no_findings");
    expect(result.evidenceDepth.riskHypotheses.map((entry) => entry.id)).not.toContain(
      "risk-specific",
    );
  });

  it("does not treat tool invocations after source line citations as source assertions", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for file config.ts was covered and is absent.",
      "",
      "| Citation | Verification |",
      "|---|---|",
      '| `src/config.ts:1` | `read_file("src/config.ts", lineCount=1)` - ev-1 |',
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

    expect(issueCodes(result)).not.toContain("invalid_line_reference");
    expect(issueCodes(result)).not.toContain("missing_report_file_references");
    expect(result.existingReferencedPaths).toContain("src/config.ts");
  });

  it("rejects template deterministic no-findings reports as weak audit evidence", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "",
      "The previous candidate findings did not meet the audit finding contract for concrete technical defects. They were removed instead of being rephrased.",
      "",
      "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "## Evidence Register",
      "",
      "| Scope | Checked evidence | Verification |",
      "| --- | --- | --- |",
      "| `src/config.ts` | `src/config.ts:1` | Command `git grep -n . -- src/config.ts` output includes `src/config.ts:1:export const timeoutMs = 1000;` |",
      "",
      "Checked commands:",
      "- Command `git grep -n . -- src/config.ts` output:",
      "```",
      "src/config.ts:1:export const timeoutMs = 1000;",
      "```",
      "",
      "Absence reasoning: risk-1 covered `src/config.ts:1`; no actionable finding was identified in the scoped inspection.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.substantiveEvidence).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_no_findings");
    expect(issueCodes(result)).toContain("deterministic_fallback_report");
    expect(issueCodes(result)).toContain("missing_substantive_evidence");
  });

  it("rejects deterministic repair manifests as trusted no-findings evidence", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "",
      "## Evidence Register",
      "",
      "| Scope | Checked evidence | Verification |",
      "| --- | --- | --- |",
      "| `src/config.ts` | `src/config.ts:1` | Command `git grep -n . -- src/config.ts` output includes `src/config.ts:1:export const timeoutMs = 1000;` |",
      "",
      "## No-Findings Claims",
      "",
      "- Absence reasoning: risk-1 covered `src/config.ts:1`; no actionable finding was identified in the scoped inspection.",
      "",
    ].join("\n");
    const text = withManifest({
      body,
      snapshot,
      scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      riskHypotheses: [
        {
          id: "risk-1",
          description: "Runtime timeout behavior is safe.",
          scopeIds: ["src/config.ts"],
          evidenceRefs: ["ev-1"],
          status: "covered",
        },
      ],
      noFindingsClaims: [
        {
          id: "nf-deterministic-repair",
          scopeIds: ["src/config.ts"],
          evidenceRefs: ["ev-1"],
          riskIds: ["risk-1"],
          reasoning:
            "Deterministic repair used scoped source inspections and removed unvalidated candidate findings.",
        },
      ],
    });

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireLedgerEvidence: true,
      auditEvidenceUnits: [manifestEvidenceUnit({ snapshot, scopeIds: ["src/config.ts"] })],
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_no_findings");
    expect(issueCodes(result)).toContain("deterministic_fallback_report");
  });

  it("rejects no-findings reports backed only by import and bootstrap line citations", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "bot"), { recursive: true });
    writeFileSync(
      join(root, "src", "bot", "service.py"),
      [
        "from pathlib import Path",
        "import os",
        "",
        'if __name__ == "__main__":',
        "    raise SystemExit(main())",
        "",
      ].join("\n"),
      "utf8",
    );
    const text = [
      "# Security Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-security for `src/bot/service.py` credential and auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/bot/service.py:1`",
      "- `src/bot/service.py:2`",
      "- `src/bot/service.py:4`",
      "- `src/bot/service.py:5`",
      "",
      "Checked commands:",
      "- Command `git grep -n . -- src/bot/service.py` output:",
      "```",
      "src/bot/service.py:1:from pathlib import Path",
      "src/bot/service.py:2:import os",
      'src/bot/service.py:4:if __name__ == "__main__":',
      "src/bot/service.py:5:    raise SystemExit(main())",
      "```",
      '- Command `git grep -n -E "credential|secret|auth" -- src/bot/service.py` output:',
      "```",
      "command produced no output",
      "```",
      "",
      "Absence reasoning: risk-security covered `src/bot/service.py:1`, `src/bot/service.py:2`, `src/bot/service.py:4`, `src/bot/service.py:5`; no actionable finding was identified in the scoped inspection.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/bot/service.py"],
      reportArtifactPaths: ["audit/security-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.substantiveEvidence).toBe(false);
    expect(result.sourceClassification).toBe("inventory_only_invalid");
    expect(issueCodes(result)).toContain("missing_scope_coverage");
    expect(issueCodes(result)).toContain("missing_substantive_evidence");
  });

  it("accepts no-findings reports that cite implementation lines instead of import scaffolding", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "bot"), { recursive: true });
    writeFileSync(
      join(root, "src", "bot", "service.py"),
      [
        "from pathlib import Path",
        "",
        "class Settings:",
        '    auth_mode = "strict"',
        "",
        "def credential_paths() -> list[Path]:",
        "    return []",
        "",
      ].join("\n"),
      "utf8",
    );
    const text = [
      "# Security Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-security for `src/bot/service.py` credential and auth drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/bot/service.py:3`",
      "- `src/bot/service.py:4`",
      "- `src/bot/service.py:6`",
      "- `src/bot/service.py:7`",
      "",
      "Checked commands:",
      '- Command `git grep -n -E "auth_mode|credential_paths" -- src/bot/service.py` output:',
      "```",
      'src/bot/service.py:4:    auth_mode = "strict"',
      "src/bot/service.py:6:def credential_paths() -> list[Path]:",
      "```",
      "",
      "Absence reasoning: risk-security covered `src/bot/service.py:3`, `src/bot/service.py:4`, `src/bot/service.py:6`, `src/bot/service.py:7`; no actionable finding was identified in the scoped inspection.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/bot/service.py"],
      reportArtifactPaths: ["audit/security-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.substantiveEvidence).toBe(true);
    expect(result.sourceClassification).toBe("validated_no_findings");
  });

  it("accepts git grep output whose matched content starts with numbered list text", () => {
    const root = initRepo();
    const readmeLines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
    readmeLines[19] = "1. Local inbox";
    readmeLines[22] = "2. Shared Memory";
    writeFileSync(join(root, "README.md"), `${readmeLines.join("\n")}\n`, "utf8");
    const text = [
      "# Architecture Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-readme-boundary for `README.md` local inbox and shared memory routing drift was covered and is absent.",
      "",
      "Checked files:",
      "- `README.md:20`",
      "- `README.md:23`",
      "",
      "Checked commands:",
      '- Command `git grep -n -E "Local inbox|Shared Memory" -- README.md` output:',
      "```",
      "README.md:20:1. Local inbox",
      "README.md:23:2. Shared Memory",
      "```",
      "",
      "Absence reasoning: risk-readme-boundary covered `README.md:20`, `README.md:23`; no actionable finding was identified in the scoped inspection.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["README.md"],
      reportArtifactPaths: ["audit/architecture-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.substantiveEvidence).toBe(true);
    expect(result.sourceClassification).toBe("validated_no_findings");
    expect(issueCodes(result)).not.toContain("invalid_line_reference");
  });

  it("accepts ledger-backed no-findings when substantive runtime search evidence is cited", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Configuration Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts:1` runtime timeout configuration drift was covered and is absent.",
      "",
      "Evidence Register",
      "",
      "| Evidence ID | Claim | Evidence | Verification |",
      "|---|---|---|---|",
      "| ev-1 | risk-1 timeout configuration drift checked | `src/config.ts:1` declares the only timeout constant | search_files evidence ev-1 returned the scoped `timeoutMs` match under `src/config.ts` |",
      "",
      "Absence reasoning: risk-1 was checked against `src/config.ts:1` and substantive runtime ledger search evidence ev-1; no actionable finding was identified in the scoped inspection.",
      "",
    ].join("\n");
    const text = withManifest({
      body,
      snapshot,
      scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      riskHypotheses: [{ id: "risk-1", description: "Runtime timeout configuration drift" }],
      noFindingsClaims: [{ root: "src/config.ts", riskId: "risk-1", evidenceRefs: ["ev-1"] }],
    });

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["src/config.ts"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [
        manifestEvidenceUnit({
          snapshot,
          scopeIds: ["src/config.ts"],
          riskHypothesisIds: ["risk-1"],
        }),
      ],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.substantiveEvidence).toBe(true);
    expect(result.sourceClassification).toBe("validated_no_findings");
    expect(issueCodes(result)).not.toContain("missing_substantive_evidence");
    expect(issueCodes(result)).not.toContain("manifest_outcome_mismatch");
  });

  it("does not treat source fixture tokens in grep output as placeholder hashes or missing root files", () => {
    const root = initRepo();
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(
      join(root, "tests", "test_attachments.py"),
      [
        "from __future__ import annotations",
        "",
        "def test_attachment_fixture():",
        '    file_unique_id = "abc123"',
        "    assert file_unique_id",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(root, "tests", "test_company_profile.py"),
      [
        "from pathlib import Path",
        "",
        'PROFILE_PATH = Path("docs") / "memory" / "entities" / "Intevra" / "company-profile.md"',
        'Path("source").joinpath("note.txt").write_text("hello", encoding="utf-8")',
        "",
      ].join("\n"),
      "utf8",
    );
    const text = [
      "# Test Readiness Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-tests for `tests/test_attachments.py` and `tests/test_company_profile.py` file_unique_id, profile path, and joinpath fixture coverage was covered and is absent.",
      "",
      "Checked files:",
      "- `tests/test_attachments.py:4`",
      "- `tests/test_company_profile.py:3`",
      "- `tests/test_company_profile.py:4`",
      "",
      "Checked commands:",
      '- Command `git grep -n "file_unique_id" -- tests/test_attachments.py` output:',
      "```",
      'tests/test_attachments.py:4:    file_unique_id = "abc123"',
      "```",
      '- Command `git grep -n -E "PROFILE_PATH|joinpath" -- tests/test_company_profile.py` output:',
      "```",
      'tests/test_company_profile.py:3:PROFILE_PATH = Path("docs") / "memory" / "entities" / "Intevra" / "company-profile.md"',
      'tests/test_company_profile.py:4:Path("source").joinpath("note.txt").write_text("hello", encoding="utf-8")',
      "```",
      "",
      "Absence reasoning: risk-tests covered `tests/test_attachments.py:4`, `tests/test_company_profile.py:3`, `tests/test_company_profile.py:4`; no actionable finding was identified in the scoped inspection.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["tests/test_attachments.py", "tests/test_company_profile.py"],
      reportArtifactPaths: ["audit/test-readiness-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.sourceClassification).toBe("validated_no_findings");
    expect(issueCodes(result)).not.toContain("fake_or_placeholder_command_output");
    expect(issueCodes(result)).not.toContain("missing_report_file_references");
    expect(result.missingReferencedPaths).toEqual([]);
  });

  it("accepts empty-file no-findings only with command output that proves emptiness", () => {
    const root = initRepo();
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "tests", "__init__.py"), "", "utf8");
    const emptyHash = execFileSync("git", ["hash-object", "--", "tests/__init__.py"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const text = [
      "# Empty File Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-empty-1 for `tests/__init__.py` empty package marker drift was covered and is absent.",
      "",
      "Checked files:",
      "- `tests/__init__.py`",
      "",
      "Checked commands:",
      "- Command `git hash-object -- tests/__init__.py` output:",
      "```",
      emptyHash,
      "```",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["tests/__init__.py"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.sourceClassification).toBe("validated_no_findings");
    expect(result.substantiveEvidence).toBe(true);
    expect(issueCodes(result)).not.toContain("missing_scope_coverage");
  });

  it.each([
    ["echo path", "- Command `echo tests/__init__.py` output: `tests/__init__.py`"],
    ["inventory path", "- Command `git ls-files -- tests/__init__.py` output: `tests/__init__.py`"],
    [
      "unrelated hash-object",
      "- Command `git hash-object -- README.md` output: `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`",
    ],
  ])("rejects empty-file no-findings with unsupported %s evidence", (_label, commandLine) => {
    const root = initRepo();
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "tests", "__init__.py"), "", "utf8");
    const text = [
      "# Empty File Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-empty-1 for `tests/__init__.py` empty package marker drift was covered and is absent.",
      "",
      "Checked files:",
      "- `tests/__init__.py`",
      "",
      "Checked commands:",
      commandLine,
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      scopeRoots: ["tests/__init__.py"],
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_no_findings");
    expect(issueCodes(result)).toContain("missing_scope_coverage");
    expect(issueCodes(result)).toContain("missing_substantive_evidence");
  });

  it("keeps weak or discarded findings out of the final source classification", () => {
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
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "## Weak/discarded findings",
      "",
      "- discarded: `src/missing.ts:99` may contain ownership drift, but this note has weak evidence.",
      "- weak_finding: Command output would show the issue if access were available.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.sourceClassification).toBe("validated_no_findings");
    expect(result.missingReferencedPaths).not.toContain("src/missing.ts");
    expect(issueCodes(result)).not.toContain("missing_report_file_references");
    expect(issueCodes(result)).not.toContain("speculative_audit_claim");
    expect(issueCodes(result)).not.toContain("unverified_inspection_claim");
    expect(issueCodes(result)).not.toContain("contradictory_findings_and_no_findings");
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
      "Risk hypotheses: risk-1 for `src/config.ts` timeout configuration handling was covered and is absent.",
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

  it("rejects path line evidence when the quoted source text does not match that line", () => {
    const root = initRepo();
    const text = [
      "## Finding",
      "- Evidence: `src/config.ts:1` - `export const retryCount = 3;`",
      "Risk: A reviewer would trust a source line claim that was not actually present.",
      "Proposed fix: Cite the exact source line that was inspected.",
      '- Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
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
  });

  it("rejects command-output path line evidence when the output text is not on that line", () => {
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
      '- Command `rg -n "timeoutMs" src/config.ts` output:',
      "```",
      "src/config.ts:1:export const retryCount = 3;",
      "```",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src/config.ts",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("invalid_line_reference");
  });

  it("does not attach one command-output snippet to sibling path references in the same row", () => {
    const root = initRepo();
    writeFileSync(join(root, "src", "beta.ts"), "export const beta = 1;\n", "utf8");
    writeFileSync(join(root, "src", "gamma.ts"), "export const gamma = 1;\n", "utf8");
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "## Evidence Register",
      "",
      "| Scope | Checked evidence | Verification |",
      "| --- | --- | --- |",
      "| `src` | `src/config.ts:1`, `src/beta.ts:1`, `src/gamma.ts:1` | Command `git grep -n timeoutMs -- src/config.ts` output includes `src/config.ts:1:export const timeoutMs = 1000;` |",
      "",
      "## Checked Commands",
      "",
      "- Command `git grep -n timeoutMs -- src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(issueCodes(result)).not.toContain("invalid_line_reference");
  });

  it("rejects reports that admit budget-limited source inspection", () => {
    const root = initRepo();
    const text = [
      "## Finding",
      "Evidence: `src/config.ts:1` defines the timeout value used by runtime configuration.",
      "Risk: A future change could bypass the runtime limit guard.",
      "Proposed fix: Keep timeout validation centralized near this export.",
      '- Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "## Audit limitations",
      "Budget constraints limited full inspection of the rest of the file.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("unverified_inspection_claim");
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

  it("rejects scoped no-findings without a risk id when command evidence inspects an unrelated term", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      ["export const timeoutMs = 1000;", 'export const authMode = "strict";', ""].join("\n"),
      "utf8",
    );
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
      '- Command `rg -n "authMode" src/config.ts` output: `src/config.ts:2:export const authMode = "strict";`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src/config.ts",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_no_findings");
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["shallow_evidence", "irrelevant_grep_match"]),
    );
    expect(result.evidenceDepth.riskHypotheses).toEqual([
      expect.objectContaining({
        id: "scoped-no-findings-1",
        trustedNoFindingsSupported: false,
      }),
    ]);
  });

  it("rejects mixed explicit-risk and scoped no-risk claims when the scoped command is unrelated", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "worker.ts"),
      'export function processJob() { return "ok"; }\n',
      "utf8",
    );

    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-timeout for `src/config.ts` timeout configuration was covered and is absent.",
      "Scoped no-findings claim: `src/worker.ts` queue processing deadlock risk is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `src/worker.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      '- Command `rg -n "processJob" src/worker.ts` output: `src/worker.ts:1:export function processJob() { return "ok"; }`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src/config.ts and src/worker.ts",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_no_findings");
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["shallow_evidence", "irrelevant_grep_match"]),
    );
    expect(
      result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-timeout"),
    ).toEqual(expect.objectContaining({ trustedNoFindingsSupported: true }));
    expect(
      result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "scoped-no-findings-1"),
    ).toEqual(expect.objectContaining({ trustedNoFindingsSupported: false }));
  });

  it("rejects inline mixed explicit-risk and scoped no-risk claims when the scoped command is unrelated", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "worker.ts"),
      'export function processJob() { return "ok"; }\n',
      "utf8",
    );

    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-timeout for `src/config.ts` timeout configuration was covered and is absent; scoped no-findings claim: `src/worker.ts` queue processing deadlock risk is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `src/worker.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      '- Command `rg -n "processJob" src/worker.ts` output: `src/worker.ts:1:export function processJob() { return "ok"; }`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src/config.ts and src/worker.ts",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["shallow_evidence", "irrelevant_grep_match"]),
    );
    expect(
      result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-timeout"),
    ).toEqual(expect.objectContaining({ trustedNoFindingsSupported: true }));
    expect(
      result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "scoped-no-findings-1"),
    ).toEqual(expect.objectContaining({ trustedNoFindingsSupported: false }));
  });

  it("rejects same-line mixed explicit-risk and scoped no-risk claims without semicolon boundaries", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "worker.ts"),
      'export function processJob() { return "ok"; }\n',
      "utf8",
    );

    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-timeout for `src/config.ts` timeout configuration was covered and is absent and scoped no-findings claim: `src/worker.ts` queue processing deadlock risk is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `src/worker.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      '- Command `rg -n "processJob" src/worker.ts` output: `src/worker.ts:1:export function processJob() { return "ok"; }`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src/config.ts and src/worker.ts",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).toBe("source_inconclusive");
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["shallow_evidence", "irrelevant_grep_match"]),
    );
    expect(
      result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "risk-timeout"),
    ).toEqual(expect.objectContaining({ trustedNoFindingsSupported: true }));
    expect(
      result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "scoped-no-findings-1"),
    ).toEqual(expect.objectContaining({ trustedNoFindingsSupported: false }));
  });

  it("rejects no-risk scoped bullets under risk hypotheses when the scoped command is unrelated", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "worker.ts"),
      'export function processJob() { return "ok"; }\n',
      "utf8",
    );

    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses:",
      "- risk-timeout for `src/config.ts` timeout configuration was covered and is absent.",
      "- `src/worker.ts` queue processing deadlock risk is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `src/worker.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      '- Command `rg -n "processJob" src/worker.ts` output: `src/worker.ts:1:export function processJob() { return "ok"; }`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src/config.ts and src/worker.ts",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_no_findings");
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["shallow_evidence", "irrelevant_grep_match"]),
    );
    expect(
      result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "scoped-no-findings-1"),
    ).toEqual(expect.objectContaining({ trustedNoFindingsSupported: false }));
  });

  it("rejects no-risk scoped bullets under plural absence claim blocks when command evidence is unrelated", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "worker.ts"),
      'export function processJob() { return "ok"; }\n',
      "utf8",
    );

    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-timeout for `src/config.ts` timeout configuration was covered and is absent.",
      "",
      "Absence claims:",
      "- `src/worker.ts` queue processing deadlock risk is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `src/worker.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      '- Command `rg -n "processJob" src/worker.ts` output: `src/worker.ts:1:export function processJob() { return "ok"; }`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src/config.ts and src/worker.ts",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_no_findings");
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(false);
    expect(
      result.evidenceDepth.riskHypotheses.find((entry) => entry.id === "scoped-no-findings-1"),
    ).toEqual(
      expect.objectContaining({
        trustedNoFindingsSupported: false,
        reasonCodes: expect.arrayContaining(["shallow_evidence", "irrelevant_grep_match"]),
      }),
    );
  });

  it("ignores bare missing paths that appear only inside scoped command output", () => {
    const root = initRepo();
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(
      join(root, "tests", "test_local_state_adapters.py"),
      [
        "class _RecordingMemoryClient:",
        '    references=[Reference(reference_id="unexpected", file_path="docs/unexpected.md")]',
        "    def ask(self):",
        "        return None",
      ].join("\n"),
      "utf8",
    );

    const text = [
      "# Test Readiness Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-tests for `tests/test_local_state_adapters.py` recording memory client references coverage was checked and is absent.",
      "",
      "Checked files:",
      "- `tests/test_local_state_adapters.py:1`",
      "",
      "Checked commands:",
      '- Command `git grep -n -E "_RecordingMemoryClient|references" -- tests/test_local_state_adapters.py` output:',
      "```",
      "tests/test_local_state_adapters.py:1:class _RecordingMemoryClient:",
      'tests/test_local_state_adapters.py:2:    references=[Reference(reference_id="unexpected", file_path="docs/unexpected.md")]',
      "```",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: tests/test_local_state_adapters.py",
      reportArtifactPaths: ["audit/test-readiness-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(true);
    expect(result.missingReferencedPaths).not.toContain("docs/unexpected.md");
    expect(issueCodes(result)).not.toContain("missing_report_file_references");
  });

  it("rejects bare missing slash paths in checked file lists", () => {
    const root = initRepo();
    const text = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `src/missing.ts`",
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

    expect(result.ok).toBe(false);
    expect(result.missingReferencedPaths).toContain("src/missing.ts");
    expect(issueCodes(result)).toContain("missing_report_file_references");
  });

  it("rejects bare missing slash paths in non-command fenced evidence", () => {
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
      "Evidence notes:",
      "```",
      "src/missing.ts",
      "```",
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

    expect(result.ok).toBe(false);
    expect(result.missingReferencedPaths).toContain("src/missing.ts");
    expect(issueCodes(result)).toContain("missing_report_file_references");
  });

  it("still validates out-of-range line refs inside command output fences", () => {
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
      "- Command `rg -n timeoutMs src/config.ts` output:",
      "```",
      "src/config.ts:99:export const timeoutMs = 1000;",
      "```",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text,
      projectRoot: root,
      taskDescription: "Scope: src/config.ts",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("invalid_line_reference");
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
      "Risk hypotheses: risk-1 for `src/config.ts` export const coverage was covered and is absent.",
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
      "Scoped no-findings claim: `.ai-factory/config.yaml` enabled generated-config risk is absent.",
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

  it("accepts manifest v2 with the strict public outcome vocabulary", () => {
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
      text: withManifest({ body, taskId: "task-audit", snapshot, version: 2 }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
      auditEvidenceUnits: [manifestEvidenceUnit({ snapshot })],
    });

    expect(result.ok).toBe(true);
    expect(result.manifestStatus).toBe("valid");
    expect(result.manifestVersion).toBe(2);
    expect(result.manifest?.outcome).toBe("validated_no_findings");
  });

  it("rejects manifest v2 lower-level diagnostic outcomes", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      "- Command `git ls-files -- src/config.ts` output: `src/config.ts`",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        version: 2,
        outcome: "inventory_only_invalid",
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.manifest).toBeNull();
    expect(result.manifestStatus).toBe("invalid");
    expect(issueCodes(result)).toContain("invalid_report_manifest");
  });

  it("normalizes legacy manifest v1 lower-level diagnostic outcomes to source_inconclusive", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:1`",
      "Checked commands:",
      "- Command `git ls-files -- src/config.ts` output: `src/config.ts`",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        outcome: "inventory_only_invalid",
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.manifest?.outcome).toBe("source_inconclusive");
    expect(issueCodes(result)).not.toContain("invalid_report_manifest");
    expect(issueCodes(result)).not.toContain("manifest_outcome_mismatch");
    expect(result.sourceClassification).toBe("inventory_only_invalid");
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

  it("rejects report command/output blocks that are not backed by cited runtime ledger evidence", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "## Finding A-1: Timeout setting is too low",
      "Evidence: `src/config.ts:1` defines the timeout value used by the runtime.",
      "Risk: A low runtime timeout can make longer operations fail prematurely.",
      "Proposed fix: Increase the configured timeout after measuring expected runtime duration.",
      "Verification:",
      "```",
      'Command: grep -n "timeoutMs" src/config.ts',
      "Output: src/config.ts:1:export const timeoutMs = 1000;",
      "```",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        outcome: "validated_findings_present",
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
    expect(issueCodes(result)).toContain("unbacked_runtime_command_evidence");
  });

  it("rejects broad architecture smells and orphaned ownership guesses as trusted findings", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Architecture Audit",
      "",
      "## Finding A-1: Monolithic router creates a coupling bottleneck",
      "Evidence: `src/config.ts:1` defines the timeout value used by the runtime.",
      "Risk: The module is a monolithic router with high fan-in coupling, so future changes require editing this entire file.",
      "Proposed fix: Extract handler methods into dedicated route modules.",
      'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "## Finding A-2: Orphaned utility with unclear ownership",
      "Evidence: `src/config.ts:1` defines the runtime timeout value.",
      "Risk: No visible invocation proves this is dead code or an undocumented integration.",
      "Proposed fix: Audit all imports of the utility and add ownership documentation.",
      'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        outcome: "validated_findings_present",
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "non_actionable_audit_observation",
        "governance_observation_as_finding",
      ]),
    );
  });

  it("rejects ordinary import coupling and docstring contract observations as trusted findings", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Architecture Audit",
      "",
      "## Finding A-1: One-directional import coupling creates a single point of change",
      "Evidence: `src/config.ts:1` exports the timeout value consumed by the runtime.",
      "Risk: One-directional coupling from the consumer module to the config module creates a single point of change; ordinary interface updates may require coordinated edits. The entry point likely constructs the runtime through this dependency chain.",
      "Proposed fix: Document the contract between the consumer and config module in module docstrings to clarify expected interfaces.",
      'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        outcome: "validated_findings_present",
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "non_actionable_audit_observation",
        "governance_observation_as_finding",
        "speculative_audit_claim",
      ]),
    );
  });

  it("rejects ownership-gap and import-style audit observations as trusted findings", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Architecture Audit",
      "",
      "### Finding A: direct import dependency establishes a one-directional coupling that is not documented as an ownership boundary",
      "Evidence: `src/config.ts:1` exports the timeout value consumed by the runtime.",
      "Risk: This coupling means any structural change to the dependency will require a coordinated change in the consumer. The consumer is a downstream consumer that understands the internal shape of the imported module.",
      "Proposed fix: Formalize the module boundary with a documented interface contract and add cross-reference documentation in module-level docstrings.",
      "",
      "### Finding B: sibling module has no documented owner or integration point",
      "Evidence: `src/config.ts:1` exists and is read by the audit.",
      "Risk: If backup_crypto provides backup/restore functionality, no integration point creates an ownership gap.",
      "Proposed fix: Wire the module into the lifecycle or document that it is intentionally decoupled and owned by a separate subsystem.",
      "",
      "### Finding C: absolute package imports should be relative imports",
      "Evidence: `src/config.ts:1` exists and is read by the audit.",
      "Risk: Relative imports are more resilient if the package is renamed, restructured, reorganized, or moved.",
      "Proposed fix: Convert intra-package imports to relative imports.",
      "",
      'Manifest contentSha256: "PLACEHOLDER_COMPUTE"',
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        outcome: "validated_findings_present",
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "fake_or_placeholder_command_output",
        "non_actionable_audit_observation",
        "governance_observation_as_finding",
        "speculative_audit_claim",
      ]),
    );
  });

  it("rejects import-shape and handler-registry architecture observations as trusted findings", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Architecture Audit",
      "",
      "### Finding A1 - dispatcher imports data model types from attachments",
      "Evidence: `src/config.ts:1` exports the timeout value consumed by the runtime.",
      "Risk: Schema change in attachments.py requires import update in the dispatcher.",
      "Proposed fix: Depend on interface contracts from attachments.py instead of concrete data model types.",
      'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "### Finding A2 - dispatcher imports render functions directly",
      "Evidence: `src/config.ts:1` exports the timeout value consumed by the runtime.",
      "Risk: Adding a new UI output requires modifying the hub import block and routing table.",
      "Proposed fix: Introduce a HandlerRegistry in a dedicated handlers module.",
      'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "## Limitations",
      "",
      "- Direct file reads were not completed due to budget constraints.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        outcome: "validated_findings_present",
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["non_actionable_audit_observation", "unverified_inspection_claim"]),
    );
  });

  it("rejects runtime architecture-report synonyms observed in roadmap audits", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Audit: Architecture and Ownership Boundaries",
      "",
      "### F-1: `bot.py` is 1,871 lines - single-file bottleneck for task/workflow routing",
      "Evidence: `src/config.ts:1` defines the timeout value used by the runtime.",
      "Risk: A massive file is a single point of architectural failure because routing decisions are scattered throughout this monolith.",
      "Proposed fix: Extract routing and dispatch logic into a dedicated module.",
      'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "### F-2: README documents inbox-first architecture but does not define module ownership boundaries",
      "Evidence: `README.md:1` documents the app.",
      "Risk: The README does not map each stage to a responsible module, so a reader cannot determine which module owns the inbox write path.",
      "Proposed fix: Add a module-to-stage mapping table in README.md.",
      "",
      "### F-3: attachments.py has no explicit public API boundary",
      "Evidence: `src/config.ts:1` defines the timeout value used by the runtime.",
      "Risk: The module exposes public functions without an `__all__` declaration.",
      "Proposed fix: Add `__all__` to declare the stable public API.",
      "",
      "### F-4: optional dependency has no runtime guard",
      "Evidence: `src/config.ts:1` defines the timeout value used by the runtime.",
      "Risk: The ImportError handler silently swallows a missing pyaes dependency with no runtime guard.",
      "Proposed fix: Wrap encryption functions in an availability check.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        outcome: "validated_findings_present",
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "non_actionable_audit_observation",
        "governance_observation_as_finding",
      ]),
    );
  });

  it("rejects import-count and partial-unused-code architecture findings", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Architecture Audit",
      "",
      "### F-1: backup_crypto.py exists in the source tree but is not imported by bot.py - dead code risk",
      "Evidence: `src/config.ts:1` defines the timeout value used by the runtime.",
      "Risk: The module is not imported by bot.py and not wired into the application runtime, so backup functionality may be missing.",
      "Proposed fix: Wire the module into the lifecycle or remove it.",
      'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
      "### F-2: bot.py imports from six distinct modules creating coupling concentration",
      "Evidence: `src/config.ts:1` defines the timeout value used by the runtime.",
      "Risk: The entry point imports from six distinct modules; if any public API changes, bot.py becomes a single point of change.",
      "Proposed fix: Extract a facade or application-layer module that aggregates imports.",
      'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        outcome: "validated_findings_present",
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("non_actionable_audit_observation");
  });

  it("rejects late-import, no-wiring, and cold-start audit observations as trusted findings", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "bot_intevra"), { recursive: true });
    writeFileSync(
      join(root, "src", "bot_intevra", "service.py"),
      "from bot_intevra.backup_crypto import BackupCryptoError\n",
      "utf8",
    );
    writeFileSync(
      join(root, "src", "bot_intevra", "cli.py"),
      "def main():\n    from bot_intevra.bot import run_bot\n    return run_bot()\n",
      "utf8",
    );
    writeFileSync(join(root, "src", "bot_intevra", "company_profile.py"), "NAME = 'x'\n", "utf8");
    execFileSync(
      "git",
      [
        "add",
        "src/bot_intevra/service.py",
        "src/bot_intevra/cli.py",
        "src/bot_intevra/company_profile.py",
      ],
      { cwd: root, stdio: "ignore" },
    );
    execFileSync("git", ["commit", "-m", "add bot modules", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const snapshot = gitSnapshot(root);
    const body = [
      "# Architecture Audit",
      "",
      "### Finding AOB-001: company_profile.py is an orphaned module with no CLI command exists",
      "Evidence: `src/bot_intevra/company_profile.py:1` defines a scoped module.",
      "Risk: The module is not wired into any scoped runtime entry point and is absent from the package's public boundary.",
      "Proposed fix: Wire it into the runtime lifecycle or remove it.",
      'Verification: Command `rg -n "NAME" src/bot_intevra/company_profile.py` output: `1:NAME = x`',
      "",
      "### Finding AOB-002: service.py imports backup_crypto at module load time, creating a hard runtime dependency",
      "Evidence: `src/bot_intevra/service.py:1` imports backup crypto symbols.",
      "Risk: This module load time dependency increases cold-start footprint through a transitive dependency chain.",
      "Proposed fix: Move the import behind a lazy runtime boundary.",
      'Verification: Command `rg -n "backup_crypto" src/bot_intevra/service.py` output: `1:from bot_intevra.backup_crypto import BackupCryptoError`',
      "",
      "### Finding AOB-003: cli.py late imports bot modules with split import responsibility",
      "Evidence: `src/bot_intevra/cli.py:2` imports run_bot inside main.",
      "Risk: Late imports and mixed import style create split import responsibility.",
      "Proposed fix: Move all imports to one boundary module.",
      'Verification: Command `rg -n "run_bot" src/bot_intevra/cli.py` output: `2:    from bot_intevra.bot import run_bot`',
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        outcome: "validated_findings_present",
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(result.sourceClassification).not.toBe("validated_findings_present");
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "non_actionable_audit_observation",
        "governance_observation_as_finding",
      ]),
    );
  });

  it("rejects cosmetic rewrites of weak roadmap architecture findings", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "bot_intevra"), { recursive: true });
    writeFileSync(
      join(root, "src", "bot_intevra", "bot.py"),
      "from bot_intevra.attachments import SavedAttachment\n",
      "utf8",
    );
    writeFileSync(
      join(root, "src", "bot_intevra", "attachments.py"),
      "class SavedAttachment:\n    pass\n",
      "utf8",
    );
    writeFileSync(
      join(root, "src", "bot_intevra", "backup_crypto.py"),
      "try:\n    import pyaes\nexcept ImportError:\n    pyaes = None\n\ndef _require_crypto():\n    if pyaes is None:\n        raise RuntimeError('pyaes is required')\n",
      "utf8",
    );
    writeFileSync(join(root, "AGENTS.md"), "<!-- Managed by codex-platform -->\n", "utf8");
    writeFileSync(join(root, "pyproject.toml"), '[project]\nname = "bot-intevra"\n', "utf8");
    execFileSync(
      "git",
      [
        "add",
        "AGENTS.md",
        "pyproject.toml",
        "src/bot_intevra/bot.py",
        "src/bot_intevra/attachments.py",
        "src/bot_intevra/backup_crypto.py",
      ],
      { cwd: root, stdio: "ignore" },
    );
    execFileSync("git", ["commit", "-m", "bot fixture", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const snapshot = gitSnapshot(root);
    const body = [
      "# Audit: Architecture and Ownership Boundaries",
      "",
      "### Finding AOB-1: bot.py is a monolithic hub file with cross-module responsibilities",
      "Evidence: `src/bot_intevra/bot.py:1` imports from attachments.",
      "Risk: The file contains 1871 lines and serves as the central hub that imports and coordinates attachments.py and backup_crypto.py, creating a single point of architectural failure and a broad responsibility set.",
      "Proposed fix: Extract a dispatcher and define explicit interfaces with `__all__` declarations.",
      "",
      "### Finding AOB-2: backup_crypto.py has a conditional dependency on pyaes without runtime guard",
      "Evidence: `src/bot_intevra/backup_crypto.py:1` starts the optional import block.",
      "Risk: The optional dependency guard allows module import but creates a latent runtime failure and a NameError on pyaes.AESCBCEncrypt when encryption is called.",
      "Proposed fix: Add a PYAES_AVAILABLE flag.",
      "",
      "### Finding AOB-3: README.md documents architecture but does not map these layers to actual module paths",
      "Evidence: `README.md:1` documents the project.",
      "Risk: Missing module-to-layer mapping creates ownership ambiguity.",
      "Proposed fix: Add module-path mappings to README.md.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        outcome: "validated_findings_present",
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "non_actionable_audit_observation",
        "governance_observation_as_finding",
      ]),
    );
  });

  it("rejects zero-match search claims contradicted by cited path-line evidence", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "bot_intevra"), { recursive: true });
    writeFileSync(
      join(root, "src", "bot_intevra", "bot.py"),
      "from bot_intevra.attachments import SavedAttachment\n",
      "utf8",
    );
    execFileSync("git", ["add", "src/bot_intevra/bot.py"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add bot module", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const snapshot = gitSnapshot(root);
    const body = [
      "# Architecture Audit",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `src/bot_intevra/bot.py:1` imports `bot_intevra.attachments`.",
      "",
      "Checked commands:",
      '- Command `search_files(query="from bot_intevra", path="src/bot_intevra/bot.py")` output: `matches=0`',
      '- Command `search_files(query="from bot_intevra", path="src")` output: `src/bot_intevra/bot.py:1: from bot_intevra.attachments import SavedAttachment`',
      "",
      "Conclusion: no internal `from bot_intevra` imports exist in bot.py.",
      "",
    ].join("\n");

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("contradictory_search_evidence");
  });

  it("rejects absence claims based on search output that skipped large files", () => {
    const root = initRepo();
    mkdirSync(join(root, "src", "bot_intevra"), { recursive: true });
    writeFileSync(
      join(root, "src", "bot_intevra", "backup_crypto.py"),
      "def encrypt_directory():\n    pass\n",
      "utf8",
    );
    writeFileSync(
      join(root, "src", "bot_intevra", "service.py"),
      "from bot_intevra.backup_crypto import encrypt_directory\n",
      "utf8",
    );
    execFileSync("git", ["add", "src/bot_intevra"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add backup wiring", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    const snapshot = gitSnapshot(root);
    const skippedOutput =
      '[search_files query="backup_crypto" path=src/bot_intevra files=25 matches=0]\n\n[skipped 1 large files]';
    const body = [
      "# Architecture Audit",
      "",
      "No validated findings.",
      "",
      "Checked commands:",
      '- Command `search_files query="backup_crypto" path=src/bot_intevra` output: `matches=0`',
      "",
      "Conclusion: no `backup_crypto` references exist in `src/bot_intevra`; the module is unused.",
      "",
    ].join("\n");
    const evidenceUnit: AuditEvidenceUnit = {
      ...manifestEvidenceUnit({
        snapshot,
        scopeIds: ["src/bot_intevra"],
        riskHypothesisIds: ["risk-1"],
      }),
      toolName: "search_files",
      outputPreview: skippedOutput,
      parsedSummary: {
        outputBytes: skippedOutput.length,
        outputLineCount: skippedOutput.split(/\r?\n/).length,
        previewChars: skippedOutput.length,
        exitCode: 0,
      },
    };

    const result = validateAuditReportArtifact({
      text: withManifest({
        body,
        taskId: "task-audit",
        snapshot,
        scopeCoverage: [{ root: "src/bot_intevra", covered: true, evidenceRefs: ["ev-1"] }],
        noFindingsClaims: [{ id: "nf-1", scopeIds: ["src/bot_intevra"], evidenceRefs: ["ev-1"] }],
      }),
      projectRoot: root,
      taskId: "task-audit",
      expectedReportArtifactPath: "audit/runtime-audit.md",
      reportArtifactPaths: ["audit/runtime-audit.md"],
      auditEvidenceUnits: [evidenceUnit],
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("unverified_inspection_claim");
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
