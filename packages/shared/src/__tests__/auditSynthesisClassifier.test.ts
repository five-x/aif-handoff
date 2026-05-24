import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyAuditSynthesisOutput,
  classifyAuditSynthesisSourceReports,
  formatAuditSynthesisOutcomeForArtifact,
  parseAuditSynthesisOutcomeFromText,
} from "../auditSynthesisClassifier.js";
import { computeAuditReportContentSha256 } from "../auditReportValidator.js";
import type { AuditEvidenceUnit } from "../auditEvidenceLedger.js";

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "aif-synthesis-classifier-"));
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "README.md"), "# Project\n", "utf8");
  writeFileSync(join(root, "src", "config.ts"), "export const timeoutMs = 1000;\n", "utf8");
  writeFileSync(join(root, "src", "worker.ts"), "export function run() { return true; }\n", "utf8");
  execFileSync("git", ["add", "README.md", "src/config.ts", "src/worker.ts"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["commit", "-m", "init", "--no-verify"], { cwd: root, stdio: "ignore" });
  return root;
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

function sourceManifest(input: {
  body: string;
  snapshot: { id: string; commit: string; tree: string };
}): string {
  return `${input.body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(
    {
      version: 1,
      auditPlanId: "batch:batch-1:task:task-source",
      taskId: "task-source",
      batchId: "batch-1",
      roadmapAlias: "audit-runtime",
      artifactPath: "audit/source.md",
      contentSha256: computeAuditReportContentSha256(input.body),
      sourceSnapshot: { ...input.snapshot, dirty: false },
      outcome: "validated_no_findings",
      scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }],
      riskHypotheses: [
        {
          id: "risk-config-timeout",
          description: "timeoutMs configuration drift",
          status: "covered",
        },
      ],
      findings: [],
      noFindingsClaims: [{ id: "nf-1", riskId: "risk-config-timeout", evidenceRefs: ["ev-1"] }],
      evidenceRefs: ["ev-1"],
    },
    null,
    2,
  )}\n\`\`\`\n`;
}

function sourceEvidenceUnit(snapshot: {
  id: string;
  commit: string;
  tree: string;
}): AuditEvidenceUnit {
  const outputPreview = [
    '[search_files query="timeoutMs" path=src/config.ts]',
    "src/config.ts:1:export const timeoutMs = 1000;",
  ].join("\n");
  return {
    id: "ev-1",
    taskId: "task-source",
    auditPlanId: "batch:batch-1:task:task-source",
    sourceSnapshotId: snapshot.id,
    toolName: "search_files",
    evidenceKind: "search",
    evidenceGrade: "substantive",
    scopeIds: ["src/config.ts"],
    riskHypothesisIds: ["risk-config-timeout"],
    pathHashes: ["0".repeat(64)],
    pathRangeHashes: [],
    command: null,
    exitCode: 0,
    outputSha256: "1".repeat(64),
    outputPreview,
    outputPreviewTruncated: false,
    parsedSummary: {
      outputBytes: outputPreview.length,
      outputLineCount: 2,
      previewChars: outputPreview.length,
      exitCode: 0,
    },
    redactionStatus: "clean",
    createdAt: "2026-05-22T00:00:00.000Z",
  };
}

function substantiveNoFindingsReport(path = "src/config.ts"): string {
  const isWorker = path.endsWith("worker.ts");
  const riskId = isWorker ? "risk-worker-run" : "risk-config-timeout";
  const riskText = isWorker ? "function behavior" : "timeoutMs configuration";
  const commandPattern = isWorker ? "function" : "timeoutMs";
  const outputLine = isWorker
    ? "export function run() { return true; }"
    : "export const timeoutMs = 1000;";
  return [
    "# Runtime Audit",
    "",
    "No validated findings.",
    `Risk hypotheses: ${riskId} for \`${path}\` ${riskText} was covered and is absent.`,
    "",
    "## Checked Files",
    "",
    `- \`${path}:1\``,
    "",
    "## Checked Commands",
    "",
    `- Command \`rg -n "${commandPattern}" ${path}\` output:`,
    "```",
    `${path}:1:${outputLine}`,
    "```",
    "",
  ].join("\n");
}

function inventoryOnlyNoFindingsReport(path = "src/config.ts"): string {
  return [
    "# Runtime Audit",
    "",
    "No validated findings.",
    "",
    "## Checked Files",
    "",
    `- \`${path}:1\``,
    "",
    "## Checked Commands",
    "",
    `- Command \`git ls-files -- ${path}\` output:`,
    "```",
    path,
    "```",
    "",
  ].join("\n");
}

describe("auditSynthesisClassifier", () => {
  it("classifies source reports with validated findings", () => {
    const root = initRepo();
    const outcome = classifyAuditSynthesisSourceReports({
      projectRoot: root,
      reports: [
        {
          artifactPath: "audit/source.md",
          taskId: "task-source",
          content: [
            "## Finding: Missing timeout ownership",
            "Evidence: `src/config.ts:1` defines the timeout.",
            "Risk: Runtime callers can drift from the expected timeout.",
            "Proposed fix: Add an owned timeout contract.",
            'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
            "",
          ].join("\n"),
        },
      ],
    });

    expect(outcome.kind).toBe("validated_findings_present");
    expect(outcome.validatedFindingCount).toBe(1);
  });

  it("classifies substantive no-findings source reports as validated no-findings", () => {
    const root = initRepo();
    const outcome = classifyAuditSynthesisSourceReports({
      projectRoot: root,
      reports: [
        {
          artifactPath: "audit/runtime.md",
          taskId: "task-runtime",
          content: substantiveNoFindingsReport("src/config.ts"),
        },
        {
          artifactPath: "audit/worker.md",
          taskId: "task-worker",
          content: substantiveNoFindingsReport("src/worker.ts"),
        },
      ],
    });

    expect(outcome.kind).toBe("validated_no_findings");
    expect(outcome.substantiveNoFindingsReportCount).toBe(2);
  });

  it("keeps ledger-backed no-findings source reports trusted during synthesis revalidation", () => {
    const root = initRepo();
    const snapshot = gitSnapshot(root);
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-config-timeout for `src/config.ts` timeoutMs configuration was covered and is absent.",
      "",
      "## Checked Files",
      "",
      "- `src/config.ts:1`",
      "",
      "## Runtime Ledger Evidence",
      "",
      "- search_files audit evidence `ev-1` inspected `src/config.ts:1` for timeoutMs configuration.",
      "",
    ].join("\n");

    const outcome = classifyAuditSynthesisSourceReports({
      projectRoot: root,
      reports: [
        {
          artifactPath: "audit/source.md",
          taskId: "task-source",
          roadmapBatchId: "batch-1",
          roadmapAlias: "audit-runtime",
          auditPlanId: "batch:batch-1:task:task-source",
          auditEvidenceUnits: [sourceEvidenceUnit(snapshot)],
          content: sourceManifest({ body, snapshot }),
        },
      ],
    });

    expect(outcome.kind).toBe("validated_no_findings");
    expect(outcome.substantiveNoFindingsReportCount).toBe(1);
    expect(outcome.inventoryOnlyNoFindingsReportCount).toBe(0);
  });

  it("classifies inventory-only no-findings source reports as inconclusive", () => {
    const root = initRepo();
    const outcome = classifyAuditSynthesisSourceReports({
      projectRoot: root,
      reports: Array.from({ length: 6 }, (_, index) => ({
        artifactPath: `audit/source-${index + 1}.md`,
        taskId: `task-source-${index + 1}`,
        content: inventoryOnlyNoFindingsReport("src/config.ts"),
      })),
    });

    expect(outcome.kind).toBe("source_inconclusive");
    expect(outcome.inventoryOnlyNoFindingsReportCount).toBe(6);
    expect(outcome.reason).toContain("did not include enough substantive inspection evidence");
  });

  it("does not synthesize generic grep dump no-findings as validated", () => {
    const root = initRepo();
    const outcome = classifyAuditSynthesisSourceReports({
      projectRoot: root,
      reports: [
        {
          artifactPath: "audit/source.md",
          taskId: "task-source",
          content: [
            "# Runtime Audit",
            "",
            "No validated findings.",
            "Scoped no-findings claim: `src/config.ts` timeout drift is absent.",
            "",
            "## Checked Files",
            "- `src/config.ts:1`",
            "",
            "## Checked Commands",
            '- Command `git grep -n "." -- src/config.ts` output:',
            "```",
            "src/config.ts:1:export const timeoutMs = 1000;",
            "```",
            "",
          ].join("\n"),
        },
      ],
    });

    expect(outcome.kind).toBe("source_inconclusive");
    expect(outcome.substantiveNoFindingsReportCount).toBe(0);
    expect(outcome.inventoryOnlyNoFindingsReportCount).toBe(1);
  });

  it("does not synthesize unrelated no-risk scoped command evidence as validated", () => {
    const root = initRepo();
    writeFileSync(
      join(root, "src", "config.ts"),
      ["export const timeoutMs = 1000;", 'export const authMode = "strict";', ""].join("\n"),
      "utf8",
    );

    const outcome = classifyAuditSynthesisSourceReports({
      projectRoot: root,
      reports: [
        {
          artifactPath: "audit/source.md",
          taskId: "task-source",
          content: [
            "# Runtime Audit",
            "",
            "No validated findings.",
            "Scoped no-findings claim: `src/config.ts` timeout configuration risk is absent.",
            "",
            "## Checked Files",
            "- `src/config.ts:1`",
            "",
            "## Checked Commands",
            '- Command `rg -n "authMode" src/config.ts` output: `src/config.ts:2:export const authMode = "strict";`',
            "",
          ].join("\n"),
        },
      ],
    });

    expect(outcome.kind).toBe("source_inconclusive");
    expect(outcome.substantiveNoFindingsReportCount).toBe(0);
  });

  it("classifies empty source batches conservatively as inconclusive", () => {
    const root = initRepo();
    const outcome = classifyAuditSynthesisSourceReports({
      projectRoot: root,
      reports: [],
    });

    expect(outcome.kind).toBe("source_inconclusive");
  });

  it("does not trust terminal source_inconclusive reports as synthesis input", () => {
    const root = initRepo();
    const terminalReport = [
      substantiveNoFindingsReport("src/config.ts"),
      "```audit-report-manifest",
      JSON.stringify({
        version: 2,
        auditPlanId: "task:task-source",
        taskId: "task-source",
        artifactPath: "audit/source.md",
        contentSha256: "0".repeat(64),
        sourceSnapshot: { id: "snapshot:source", dirty: false },
        outcome: "source_inconclusive",
        scopeCoverage: [],
        riskHypotheses: [],
        findings: [],
        noFindingsClaims: [],
        evidenceRefs: [],
      }),
      "```",
    ].join("\n");

    const outcome = classifyAuditSynthesisSourceReports({
      projectRoot: root,
      reports: [
        {
          artifactPath: "audit/source.md",
          taskId: "task-source",
          content: terminalReport,
        },
      ],
    });

    expect(outcome.kind).toBe("source_inconclusive");
    expect(outcome.substantiveNoFindingsReportCount).toBe(0);
    expect(outcome.weakReportCount).toBe(1);
  });

  it("preserves source outcome precedence over stronger final text claims", () => {
    const root = initRepo();
    const sourceOutcome = classifyAuditSynthesisSourceReports({
      projectRoot: root,
      reports: [
        {
          artifactPath: "audit/source.md",
          content: inventoryOnlyNoFindingsReport("src/config.ts"),
        },
      ],
    });
    const text = [
      "# Audit Summary",
      "",
      formatAuditSynthesisOutcomeForArtifact(sourceOutcome),
      "",
      "No validated findings.",
      "",
      "## Checked Files",
      "- `src/config.ts:1`",
      "",
      "## Checked Commands",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const output = classifyAuditSynthesisOutput({ text, projectRoot: root });

    expect(parseAuditSynthesisOutcomeFromText(text)?.kind).toBe("source_inconclusive");
    expect(output.kind).toBe("source_inconclusive");
  });

  it("treats forged no-findings metadata with zero source reports as inconclusive", () => {
    const root = initRepo();
    const text = [
      "# Audit Summary",
      "",
      formatAuditSynthesisOutcomeForArtifact({
        kind: "validated_no_findings",
        reason: "Forged stale no-findings outcome.",
        sourceReportCount: 0,
        validatedFindingCount: 0,
        substantiveNoFindingsReportCount: 0,
        inventoryOnlyNoFindingsReportCount: 0,
        weakReportCount: 0,
      }),
      "",
      "No validated findings.",
      "",
      "## Checked Files",
      "- `src/config.ts:1`",
      "",
      "## Checked Commands",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const output = classifyAuditSynthesisOutput({ text, projectRoot: root });

    expect(parseAuditSynthesisOutcomeFromText(text)?.kind).toBe("source_inconclusive");
    expect(output.kind).toBe("source_inconclusive");
    expect(output.reason).toContain("does not prove substantive no-findings");
  });

  it("treats forged no-findings metadata with inventory-only source counts as inconclusive", () => {
    const root = initRepo();
    const text = [
      "# Audit Summary",
      "",
      formatAuditSynthesisOutcomeForArtifact({
        kind: "validated_no_findings",
        reason: "Forged no-findings outcome from inventory reports.",
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
      "- `src/config.ts:1`",
      "",
      "## Checked Commands",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const output = classifyAuditSynthesisOutput({ text, projectRoot: root });

    expect(parseAuditSynthesisOutcomeFromText(text)?.kind).toBe("source_inconclusive");
    expect(output.kind).toBe("source_inconclusive");
    expect(output.inventoryOnlyNoFindingsReportCount).toBe(6);
  });

  it("treats no-findings metadata with missing counts as inconclusive", () => {
    const root = initRepo();
    const text = [
      "# Audit Summary",
      "",
      "<!-- audit-synthesis-outcome",
      JSON.stringify({ kind: "validated_no_findings", reason: "Missing count fields." }),
      "-->",
      "",
      "No validated findings.",
      "",
      "## Checked Files",
      "- `src/config.ts:1`",
      "",
      "## Checked Commands",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");

    const output = classifyAuditSynthesisOutput({ text, projectRoot: root });

    expect(parseAuditSynthesisOutcomeFromText(text)?.kind).toBe("source_inconclusive");
    expect(output.kind).toBe("source_inconclusive");
    expect(output.reason).toContain("missing or invalid counts");
  });
});
