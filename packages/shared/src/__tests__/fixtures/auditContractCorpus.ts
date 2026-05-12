import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeAuditReportContentSha256,
  type AuditReportSourceSnapshot,
} from "../../auditReportValidator.js";
import type { AuditEvidenceUnit } from "../../auditEvidenceLedger.js";
import type { AuditSourceClassification } from "../../auditSourceEvidence.js";

export interface AuditCorpusReportCase {
  id: string;
  title: string;
  body: string;
  artifactPath: string;
  taskDescription?: string;
  scopeRoots?: string[];
  expectedClassification: AuditSourceClassification;
  expectedIssueCodes?: string[];
  expectedFailureFamily?: string;
  evidence?: {
    id?: string;
    scopeIds: string[];
    riskHypothesisIds: string[];
    command: string;
    outputPreview: string;
  };
}

export interface ManifestBackedReport {
  text: string;
  body: string;
  taskId: string;
  artifactPath: string;
  auditPlanId: string;
  evidenceUnits: AuditEvidenceUnit[];
}

export function initAuditContractRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "aif-audit-contract-corpus-"));
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });

  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "docs", "ops"), { recursive: true });
  writeFileSync(join(root, "README.md"), "# Audit Contract Fixture\n", "utf8");
  writeFileSync(
    join(root, "src", "config.ts"),
    [
      "export const timeoutMs = 1000;",
      'export const authMode = "strict";',
      "export const retryLimit = 3;",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(root, "src", "runtime.ts"),
    ["export function runtimeBoundary(input: string) {", "  return input.trim();", "}", ""].join(
      "\n",
    ),
    "utf8",
  );
  writeFileSync(
    join(root, "src", "persistence.ts"),
    [
      'export const persistenceOwner = "task-store";',
      "export function writeAuditState(id: string) {",
      "  return `state:${id}`;",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(root, "src", "architecture.ts"),
    [
      'export const architectureBoundary = "agent-api-shared";',
      "export const allowedLayer = architectureBoundary;",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(root, "docs", "ops", "runbook.md"),
    ["# Operations Runbook", "Rollback requires config validation before deployment.", ""].join(
      "\n",
    ),
    "utf8",
  );

  execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init audit contract fixture", "--no-verify"], {
    cwd: root,
    stdio: "ignore",
  });
  return root;
}

export function auditSnapshot(
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

export const invalidAuditReportCases: AuditCorpusReportCase[] = [
  {
    id: "inventory-only-command",
    title: "inventory-only commands cannot prove no-findings",
    artifactPath: "audit/inventory.md",
    body: [
      "# Security Config Audit",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      "- Command `git ls-files -- src/config.ts` output:",
      "```",
      "src/config.ts",
      "```",
      "",
    ].join("\n"),
    scopeRoots: ["src/config.ts"],
    expectedClassification: "inventory_only_invalid",
    expectedIssueCodes: ["missing_substantive_evidence"],
    expectedFailureFamily: "invalid_inventory_only",
  },
  {
    id: "file-existence-only",
    title: "file existence checks cannot prove no-findings",
    artifactPath: "audit/file-existence.md",
    body: [
      "# Runtime Boundary Audit",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `src/runtime.ts:1`",
      "",
      "Checked commands:",
      "- Command `test -f src/runtime.ts` returned exit code 0.",
      "",
    ].join("\n"),
    scopeRoots: ["src/runtime.ts"],
    expectedClassification: "inventory_only_invalid",
    expectedIssueCodes: ["missing_substantive_evidence"],
    expectedFailureFamily: "invalid_inventory_only",
  },
  {
    id: "mass-line-one-citations",
    title: "mass line-one citations are not substantive command evidence",
    artifactPath: "audit/mass-lines.md",
    body: [
      "# Architecture Boundary Audit",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `src/runtime.ts:1`",
      "- `src/persistence.ts:1`",
      "- `src/architecture.ts:1`",
      "",
    ].join("\n"),
    scopeRoots: ["src"],
    expectedClassification: "inventory_only_invalid",
    expectedIssueCodes: ["missing_substantive_evidence"],
    expectedFailureFamily: "invalid_inventory_only",
  },
  {
    id: "fake-command-output",
    title: "fake command output is rejected",
    artifactPath: "audit/fake-output.md",
    body: [
      "## Finding: Runtime boundary is unclear",
      "Evidence: `src/runtime.ts:1` defines the boundary function.",
      "Risk: Callers could bypass runtime input normalization.",
      "Proposed fix: Keep normalization at the boundary.",
      'Verification: Command `rg -n "runtimeBoundary" src/runtime.ts` output: `abc123 placeholder`',
      "",
    ].join("\n"),
    scopeRoots: ["src/runtime.ts"],
    expectedClassification: "insufficient_substantive_evidence",
    expectedIssueCodes: ["fake_or_placeholder_command_output"],
    expectedFailureFamily: "insufficient_substantive_evidence",
  },
  {
    id: "command-mismatch",
    title: "command-shaped future claims are rejected",
    artifactPath: "audit/command-mismatch.md",
    body: [
      "# Persistence Ownership Audit",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `src/persistence.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "persistenceOwner" src/persistence.ts` output would show the owner.',
      "",
    ].join("\n"),
    scopeRoots: ["src/persistence.ts"],
    expectedClassification: "validated_no_findings",
    expectedIssueCodes: ["unverified_inspection_claim"],
    expectedFailureFamily: "invalid_artifact_content",
  },
  {
    id: "contradictory-report-outcomes",
    title: "findings and no-findings cannot both be claimed",
    artifactPath: "audit/contradiction.md",
    body: [
      "## Finding: Config retries are unbounded",
      "Evidence: `src/config.ts:3` defines the retry limit.",
      "Risk: Retry policy could drift from runtime assumptions.",
      "Proposed fix: Keep retry policy centralized.",
      'Verification: Command `rg -n "retryLimit" src/config.ts` output: `src/config.ts:3:export const retryLimit = 3;`',
      "",
      "No validated findings.",
      "Checked files:",
      "- `src/config.ts:3`",
      "",
    ].join("\n"),
    scopeRoots: ["src/config.ts"],
    expectedClassification: "validated_findings_present",
    expectedIssueCodes: ["contradictory_findings_and_no_findings"],
    expectedFailureFamily: "invalid_artifact_content",
  },
  {
    id: "missing-verification",
    title: "findings require verification evidence",
    artifactPath: "audit/missing-verification.md",
    body: [
      "## Finding: Runtime boundary is unclear",
      "Evidence: `src/runtime.ts:1` defines the boundary function.",
      "Risk: Callers could bypass runtime input normalization.",
      "Proposed fix: Keep normalization at the boundary.",
      "",
    ].join("\n"),
    scopeRoots: ["src/runtime.ts"],
    expectedClassification: "insufficient_substantive_evidence",
    expectedIssueCodes: ["missing_substantive_evidence"],
    expectedFailureFamily: "insufficient_substantive_evidence",
  },
  {
    id: "missing-scope-coverage",
    title: "reports must cover declared scope",
    artifactPath: "audit/scope-gap.md",
    body: [
      "# Runtime Boundary Audit",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n"),
    scopeRoots: ["src/runtime.ts"],
    expectedClassification: "validated_no_findings",
    expectedIssueCodes: ["missing_scope_coverage"],
    expectedFailureFamily: "invalid_artifact_content",
  },
  {
    id: "risk-without-evidence",
    title: "risk prose without evidence is rejected",
    artifactPath: "audit/risk-without-evidence.md",
    body: [
      "## Finding: Persistence ownership is risky",
      "Risk: Ownership drift could make audit state writes inconsistent.",
      "Proposed fix: Clarify ownership near persistence state writes.",
      "",
    ].join("\n"),
    scopeRoots: ["src/persistence.ts"],
    expectedClassification: "insufficient_substantive_evidence",
    expectedIssueCodes: ["missing_report_file_references", "missing_scope_coverage"],
    expectedFailureFamily: "insufficient_substantive_evidence",
  },
];

export const validNoFindingsAuditReportCases: AuditCorpusReportCase[] = [
  {
    id: "security-config",
    title: "security/config no-findings",
    artifactPath: "audit/security-config.md",
    scopeRoots: ["src/config.ts"],
    expectedClassification: "validated_no_findings",
    evidence: {
      scopeIds: ["src/config.ts"],
      riskHypothesisIds: ["risk-security-config"],
      command: 'rg -n "authMode|timeoutMs" src/config.ts',
      outputPreview:
        'src/config.ts:1:export const timeoutMs = 1000;\nsrc/config.ts:2:export const authMode = "strict";',
    },
    body: [
      "# Security Config Audit",
      "",
      "No validated findings.",
      "Absence reasoning: `src/config.ts:1` and `src/config.ts:2` show bounded timeout and strict auth mode, so the scoped security/config risk is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "- `src/config.ts:2`",
      "",
      "Checked commands:",
      '- Command `rg -n "authMode|timeoutMs" src/config.ts` output:',
      "```",
      "src/config.ts:1:export const timeoutMs = 1000;",
      'src/config.ts:2:export const authMode = "strict";',
      "```",
      "",
    ].join("\n"),
  },
  {
    id: "runtime-boundary",
    title: "runtime boundary no-findings",
    artifactPath: "audit/runtime-boundary.md",
    scopeRoots: ["src/runtime.ts"],
    expectedClassification: "validated_no_findings",
    evidence: {
      scopeIds: ["src/runtime.ts"],
      riskHypothesisIds: ["risk-runtime-boundary"],
      command: 'rg -n "runtimeBoundary|trim" src/runtime.ts',
      outputPreview:
        "src/runtime.ts:1:export function runtimeBoundary(input: string) {\nsrc/runtime.ts:2:  return input.trim();",
    },
    body: [
      "# Runtime Boundary Audit",
      "",
      "No validated findings.",
      "Absence reasoning: `src/runtime.ts:1` and `src/runtime.ts:2` keep input normalization inside the runtime boundary.",
      "",
      "Checked files:",
      "- `src/runtime.ts:1`",
      "- `src/runtime.ts:2`",
      "",
      "Checked commands:",
      '- Command `rg -n "runtimeBoundary|trim" src/runtime.ts` output:',
      "```",
      "src/runtime.ts:1:export function runtimeBoundary(input: string) {",
      "src/runtime.ts:2:  return input.trim();",
      "```",
      "",
    ].join("\n"),
  },
  {
    id: "persistence-ownership",
    title: "persistence ownership no-findings",
    artifactPath: "audit/persistence-ownership.md",
    scopeRoots: ["src/persistence.ts"],
    expectedClassification: "validated_no_findings",
    evidence: {
      scopeIds: ["src/persistence.ts"],
      riskHypothesisIds: ["risk-persistence-ownership"],
      command: 'rg -n "persistenceOwner|writeAuditState" src/persistence.ts',
      outputPreview:
        'src/persistence.ts:1:export const persistenceOwner = "task-store";\nsrc/persistence.ts:2:export function writeAuditState(id: string) {',
    },
    body: [
      "# Persistence Ownership Audit",
      "",
      "No validated findings.",
      "Absence reasoning: `src/persistence.ts:1` names one persistence owner and `src/persistence.ts:2` keeps audit state writes in the same module.",
      "",
      "Checked files:",
      "- `src/persistence.ts:1`",
      "- `src/persistence.ts:2`",
      "",
      "Checked commands:",
      '- Command `rg -n "persistenceOwner|writeAuditState" src/persistence.ts` output:',
      "```",
      'src/persistence.ts:1:export const persistenceOwner = "task-store";',
      "src/persistence.ts:2:export function writeAuditState(id: string) {",
      "```",
      "",
    ].join("\n"),
  },
  {
    id: "ops-config-validation",
    title: "ops/config validation no-findings",
    artifactPath: "audit/ops-config.md",
    scopeRoots: ["docs/ops/runbook.md"],
    expectedClassification: "validated_no_findings",
    evidence: {
      scopeIds: ["docs/ops/runbook.md"],
      riskHypothesisIds: ["risk-ops-config"],
      command: 'rg -n "Rollback|config validation" docs/ops/runbook.md',
      outputPreview:
        "docs/ops/runbook.md:1:# Operations Runbook\ndocs/ops/runbook.md:2:Rollback requires config validation before deployment.",
    },
    body: [
      "# Ops Config Audit",
      "",
      "No validated findings.",
      "Absence reasoning: `docs/ops/runbook.md:2` requires config validation before rollback or deployment.",
      "",
      "Checked files:",
      "- `docs/ops/runbook.md:1`",
      "- `docs/ops/runbook.md:2`",
      "",
      "Checked commands:",
      '- Command `rg -n "Rollback|config validation" docs/ops/runbook.md` output:',
      "```",
      "docs/ops/runbook.md:1:# Operations Runbook",
      "docs/ops/runbook.md:2:Rollback requires config validation before deployment.",
      "```",
      "",
    ].join("\n"),
  },
  {
    id: "architecture-boundary",
    title: "architecture boundary no-findings",
    artifactPath: "audit/architecture-boundary.md",
    scopeRoots: ["src/architecture.ts"],
    expectedClassification: "validated_no_findings",
    evidence: {
      scopeIds: ["src/architecture.ts"],
      riskHypothesisIds: ["risk-architecture-boundary"],
      command: 'rg -n "architectureBoundary|allowedLayer" src/architecture.ts',
      outputPreview:
        'src/architecture.ts:1:export const architectureBoundary = "agent-api-shared";\nsrc/architecture.ts:2:export const allowedLayer = architectureBoundary;',
    },
    body: [
      "# Architecture Boundary Audit",
      "",
      "No validated findings.",
      "Absence reasoning: `src/architecture.ts:1` and `src/architecture.ts:2` keep the architecture boundary explicit.",
      "",
      "Checked files:",
      "- `src/architecture.ts:1`",
      "- `src/architecture.ts:2`",
      "",
      "Checked commands:",
      '- Command `rg -n "architectureBoundary|allowedLayer" src/architecture.ts` output:',
      "```",
      'src/architecture.ts:1:export const architectureBoundary = "agent-api-shared";',
      "src/architecture.ts:2:export const allowedLayer = architectureBoundary;",
      "```",
      "",
    ].join("\n"),
  },
];

export const validFindingsAuditReportCases: AuditCorpusReportCase[] = [
  {
    id: "runtime-normalization-finding",
    title: "runtime finding with evidence risk fix and verification",
    artifactPath: "audit/runtime-finding.md",
    scopeRoots: ["src/runtime.ts"],
    expectedClassification: "validated_findings_present",
    evidence: {
      scopeIds: ["src/runtime.ts"],
      riskHypothesisIds: ["risk-runtime-normalization"],
      command: 'rg -n "runtimeBoundary" src/runtime.ts',
      outputPreview: "src/runtime.ts:1:export function runtimeBoundary(input: string) {",
    },
    body: [
      "## Finding: Runtime boundary has implicit normalization",
      "Evidence: `src/runtime.ts:1` defines the runtime boundary and `src/runtime.ts:2` trims input before downstream use.",
      "Risk: Callers may depend on implicit normalization that is not enforced at other entry points.",
      "Proposed fix: Keep boundary normalization centralized and document callers that rely on it.",
      'Verification: Command `rg -n "runtimeBoundary" src/runtime.ts` output: `src/runtime.ts:1:export function runtimeBoundary(input: string) {`',
      "",
    ].join("\n"),
  },
  {
    id: "persistence-ownership-finding",
    title: "persistence finding with evidence risk fix and verification",
    artifactPath: "audit/persistence-finding.md",
    scopeRoots: ["src/persistence.ts"],
    expectedClassification: "validated_findings_present",
    evidence: {
      scopeIds: ["src/persistence.ts"],
      riskHypothesisIds: ["risk-persistence-state"],
      command: 'rg -n "writeAuditState" src/persistence.ts',
      outputPreview: "src/persistence.ts:2:export function writeAuditState(id: string) {",
    },
    body: [
      "## Finding: Audit state write contract is implicit",
      "Evidence: `src/persistence.ts:2` writes audit state without a visible validation boundary in the fixture.",
      "Risk: Future callers could write state without preserving ownership expectations.",
      "Proposed fix: Add a validated write boundary before calling `writeAuditState`.",
      'Verification: Command `rg -n "writeAuditState" src/persistence.ts` output: `src/persistence.ts:2:export function writeAuditState(id: string) {`',
      "",
    ].join("\n"),
  },
];

export function auditEvidenceUnit(input: {
  snapshot: Required<Pick<AuditReportSourceSnapshot, "id" | "commit" | "tree">>;
  id?: string;
  taskId: string;
  auditPlanId: string;
  sourceSnapshotId?: string;
  evidenceGrade?: AuditEvidenceUnit["evidenceGrade"];
  scopeIds: string[];
  riskHypothesisIds: string[];
  command: string;
  outputPreview: string;
}): AuditEvidenceUnit {
  return {
    id: input.id ?? "ev-1",
    taskId: input.taskId,
    auditPlanId: input.auditPlanId,
    sourceSnapshotId:
      input.sourceSnapshotId ??
      input.snapshot.id ??
      `git:${input.snapshot.commit}:${input.snapshot.tree}`,
    toolName: "Grep",
    evidenceKind: "search",
    evidenceGrade: input.evidenceGrade ?? "substantive",
    scopeIds: input.scopeIds,
    riskHypothesisIds: input.riskHypothesisIds,
    pathHashes: ["0".repeat(64)],
    pathRangeHashes: [],
    command: { command: input.command, args: [], cwd: null },
    exitCode: 0,
    outputSha256: "1".repeat(64),
    outputPreview: input.outputPreview,
    outputPreviewTruncated: false,
    parsedSummary: {
      outputBytes: input.outputPreview.length,
      outputLineCount: input.outputPreview.split(/\r?\n/).length,
      previewChars: input.outputPreview.length,
      exitCode: 0,
    },
    redactionStatus: "clean",
    createdAt: "2026-05-12T00:00:00.000Z",
  };
}

export function withAuditManifest(input: {
  body: string;
  taskId: string;
  artifactPath: string;
  snapshot: Required<Pick<AuditReportSourceSnapshot, "id" | "commit" | "tree">>;
  outcome: AuditSourceClassification;
  scopeIds: string[];
  riskHypothesisIds: string[];
  evidenceRefs?: string[];
  contentSha256?: string;
  sourceSnapshot?: AuditReportSourceSnapshot;
  manifestPatch?: Record<string, unknown>;
}): string {
  const evidenceRefs = input.evidenceRefs ?? ["ev-1"];
  const manifest = {
    version: 1,
    auditPlanId: `task:${input.taskId}`,
    taskId: input.taskId,
    artifactPath: input.artifactPath,
    contentSha256: input.contentSha256 ?? computeAuditReportContentSha256(input.body),
    sourceSnapshot: { ...input.snapshot, ...(input.sourceSnapshot ?? {}), dirty: false },
    outcome: input.outcome,
    scopeCoverage: input.scopeIds.map((scopeId) => ({
      root: scopeId,
      covered: true,
      evidenceRefs,
    })),
    riskHypotheses: input.riskHypothesisIds.map((riskId) => ({
      id: riskId,
      description: `${riskId} covered by corpus evidence`,
      status: "covered",
    })),
    findings:
      input.outcome === "validated_findings_present"
        ? [{ id: "finding-1", riskIds: input.riskHypothesisIds, evidenceRefs }]
        : [],
    noFindingsClaims:
      input.outcome === "validated_no_findings"
        ? [{ id: "nf-1", riskIds: input.riskHypothesisIds, evidenceRefs }]
        : [],
    evidenceRefs,
    ...input.manifestPatch,
  };
  return `${input.body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`;
}

export function buildManifestBackedReport(input: {
  report: AuditCorpusReportCase;
  snapshot: Required<Pick<AuditReportSourceSnapshot, "id" | "commit" | "tree">>;
  taskId?: string;
  evidenceId?: string;
  evidenceGrade?: AuditEvidenceUnit["evidenceGrade"];
  evidenceScopeIds?: string[];
  evidenceRiskHypothesisIds?: string[];
  evidenceSourceSnapshotId?: string;
  manifestEvidenceRefs?: string[];
  manifestSourceSnapshot?: AuditReportSourceSnapshot;
  body?: string;
  contentSha256?: string;
}): ManifestBackedReport {
  if (!input.report.evidence) {
    throw new Error(`Report case ${input.report.id} does not define ledger evidence`);
  }
  const taskId = input.taskId ?? `task-${input.report.id}`;
  const auditPlanId = `task:${taskId}`;
  const evidenceId = input.evidenceId ?? "ev-1";
  const body = input.body ?? input.report.body;
  return {
    text: withAuditManifest({
      body,
      taskId,
      artifactPath: input.report.artifactPath,
      snapshot: input.snapshot,
      outcome: input.report.expectedClassification,
      scopeIds: input.report.evidence.scopeIds,
      riskHypothesisIds: input.report.evidence.riskHypothesisIds,
      evidenceRefs: input.manifestEvidenceRefs ?? [evidenceId],
      sourceSnapshot: input.manifestSourceSnapshot,
      contentSha256: input.contentSha256,
    }),
    body,
    taskId,
    artifactPath: input.report.artifactPath,
    auditPlanId,
    evidenceUnits: [
      auditEvidenceUnit({
        snapshot: input.snapshot,
        id: evidenceId,
        taskId,
        auditPlanId,
        sourceSnapshotId: input.evidenceSourceSnapshotId,
        evidenceGrade: input.evidenceGrade,
        scopeIds: input.evidenceScopeIds ?? input.report.evidence.scopeIds,
        riskHypothesisIds:
          input.evidenceRiskHypothesisIds ?? input.report.evidence.riskHypothesisIds,
        command: input.report.evidence.command,
        outputPreview: input.report.evidence.outputPreview,
      }),
    ],
  };
}
