import { beforeAll, describe, expect, it } from "vitest";
import {
  computeAuditReportContentSha256,
  validateAuditReportArtifact,
} from "../auditReportValidator.js";
import { classifyAuditSynthesisSourceReports } from "../auditSynthesisClassifier.js";
import type { TrustedSourceAuditArtifact } from "../auditSynthesisClassifier.js";
import { selectAuditArtifactFailureFamily } from "../auditRoadmapContract.js";
import {
  auditSnapshot,
  buildManifestBackedReport,
  initAuditContractRepo,
  invalidAuditReportCases,
  validFindingsAuditReportCases,
  validNoFindingsAuditReportCases,
} from "./fixtures/auditContractCorpus.js";

let corpusRoot: string;
let corpusSnapshot: ReturnType<typeof auditSnapshot>;

function issueCodes(result: ReturnType<typeof validateAuditReportArtifact>): string[] {
  return result.issues.map((issue) => issue.code);
}

function failureFamily(result: ReturnType<typeof validateAuditReportArtifact>): string | null {
  return selectAuditArtifactFailureFamily({
    validationDetails: {
      auditReportValidation: {
        sourceClassification: result.sourceClassification,
        issues: result.issues,
      },
      issues: result.issues,
    },
  });
}

function expectFixtureEvidenceDepth(
  result: ReturnType<typeof validateAuditReportArtifact>,
  fixture: {
    expectedEvidenceDepthStatus?: string;
    expectedEvidenceDepthReasonCodes?: string[];
    expectedTrustedNoFindingsSupported?: boolean;
  },
): void {
  if (fixture.expectedEvidenceDepthStatus) {
    expect(result.evidenceDepth.status).toBe(fixture.expectedEvidenceDepthStatus);
  }
  if (fixture.expectedTrustedNoFindingsSupported !== undefined) {
    expect(result.evidenceDepth.trustedNoFindingsSupported).toBe(
      fixture.expectedTrustedNoFindingsSupported,
    );
  }
  if (fixture.expectedEvidenceDepthReasonCodes) {
    if (fixture.expectedEvidenceDepthReasonCodes.length === 0) {
      expect(result.evidenceDepth.reasonCodes).toEqual([]);
    } else {
      expect(result.evidenceDepth.reasonCodes).toEqual(
        expect.arrayContaining(fixture.expectedEvidenceDepthReasonCodes),
      );
    }
  }
}

function trustedCorpusArtifact(input: {
  artifactPath: string;
  taskId: string;
  auditPlanId?: string;
  auditEvidenceUnits?: TrustedSourceAuditArtifact["auditEvidenceUnits"];
  content: string;
  sourceClassification: TrustedSourceAuditArtifact["sourceClassification"];
  substantiveNoFindingsSupported?: boolean;
}): TrustedSourceAuditArtifact {
  return {
    artifactPath: input.artifactPath,
    taskId: input.taskId,
    auditPlanId: input.auditPlanId,
    auditEvidenceUnits: input.auditEvidenceUnits,
    content: input.content,
    sourceClassification: input.sourceClassification,
    substantiveNoFindingsSupported: input.substantiveNoFindingsSupported,
    manifestValid: true,
    ledgerValid: true,
    sourceSnapshotValid: true,
    committedBlobVerified: true,
    completionGuardTrusted: true,
  };
}

describe("audit contract corpus", () => {
  beforeAll(() => {
    corpusRoot = initAuditContractRepo();
    corpusSnapshot = auditSnapshot(corpusRoot);
  });

  it.each(invalidAuditReportCases)(
    "$title",
    (fixture) => {
      const result = validateAuditReportArtifact({
        text: fixture.body,
        projectRoot: corpusRoot,
        taskDescription: fixture.taskDescription,
        scopeRoots: fixture.scopeRoots,
        reportArtifactPaths: [fixture.artifactPath],
        expectedReportArtifactPath: fixture.artifactPath,
        requireProposedFix: true,
      });

      expect(result.ok).toBe(false);
      expect(result.sourceClassification).toBe(fixture.expectedClassification);
      expect(issueCodes(result)).toEqual(expect.arrayContaining(fixture.expectedIssueCodes ?? []));
      expectFixtureEvidenceDepth(result, fixture);
      if (fixture.expectedFailureFamily) {
        expect(failureFamily(result)).toBe(fixture.expectedFailureFamily);
      }
    },
    20_000,
  );

  it.each(validNoFindingsAuditReportCases)(
    "$title",
    (fixture) => {
      const report = buildManifestBackedReport({ report: fixture, snapshot: corpusSnapshot });

      const result = validateAuditReportArtifact({
        text: report.text,
        projectRoot: corpusRoot,
        taskId: report.taskId,
        taskDescription: fixture.taskDescription,
        scopeRoots: fixture.scopeRoots,
        reportArtifactPaths: [report.artifactPath],
        expectedReportArtifactPath: report.artifactPath,
        expectedSourceSnapshot: corpusSnapshot,
        auditEvidenceUnits: report.evidenceUnits,
        requireLedgerEvidence: true,
        requireProposedFix: true,
      });

      expect(result.ok).toBe(true);
      expect(result.manifestStatus).toBe("valid");
      expect(result.sourceClassification).toBe("validated_no_findings");
      expect(result.substantiveEvidence).toBe(true);
      expectFixtureEvidenceDepth(result, fixture);
    },
    20_000,
  );

  it.each(validFindingsAuditReportCases)(
    "$title",
    (fixture) => {
      const report = buildManifestBackedReport({ report: fixture, snapshot: corpusSnapshot });

      const result = validateAuditReportArtifact({
        text: report.text,
        projectRoot: corpusRoot,
        taskId: report.taskId,
        scopeRoots: fixture.scopeRoots,
        reportArtifactPaths: [report.artifactPath],
        expectedReportArtifactPath: report.artifactPath,
        expectedSourceSnapshot: corpusSnapshot,
        auditEvidenceUnits: report.evidenceUnits,
        requireLedgerEvidence: true,
        requireProposedFix: true,
      });

      expect(result.ok).toBe(true);
      expect(result.manifestStatus).toBe("valid");
      expect(result.sourceClassification).toBe("validated_findings_present");
      expect(result.substantiveEvidence).toBe(true);
    },
    20_000,
  );

  it("classifies valid and weak source-report batches from the corpus", () => {
    const synthesisNoFindingsFixtures = validNoFindingsAuditReportCases.filter(
      (fixture) => fixture.id !== "empty-file-proof",
    );
    const noFindingReports = synthesisNoFindingsFixtures.map((fixture) => {
      const report = buildManifestBackedReport({ report: fixture, snapshot: corpusSnapshot });
      return trustedCorpusArtifact({
        artifactPath: report.artifactPath,
        taskId: report.taskId,
        auditPlanId: report.auditPlanId,
        auditEvidenceUnits: report.evidenceUnits,
        sourceClassification: "validated_no_findings",
        substantiveNoFindingsSupported: true,
        content: report.text,
      });
    });
    const noFindings = classifyAuditSynthesisSourceReports({
      projectRoot: corpusRoot,
      trustedSourceArtifacts: noFindingReports,
    });
    expect(noFindings.kind).toBe("validated_no_findings");
    expect(noFindings.substantiveNoFindingsReportCount).toBe(synthesisNoFindingsFixtures.length);

    const findings = classifyAuditSynthesisSourceReports({
      projectRoot: corpusRoot,
      trustedSourceArtifacts: validFindingsAuditReportCases.map((fixture) =>
        trustedCorpusArtifact({
          artifactPath: fixture.artifactPath,
          taskId: fixture.id,
          sourceClassification: "validated_findings_present",
          content: fixture.body,
        }),
      ),
    });
    expect(findings.kind).toBe("validated_findings_present");
    expect(findings.validatedFindingCount).toBe(validFindingsAuditReportCases.length);

    const weak = classifyAuditSynthesisSourceReports({
      projectRoot: corpusRoot,
      blockingSourceArtifacts: invalidAuditReportCases
        .filter((fixture) => fixture.expectedClassification === "inventory_only_invalid")
        .map((fixture) => ({
          artifactPath: fixture.artifactPath,
          taskId: fixture.id,
          required: true,
          state: "invalid",
          sourceClassification: "inventory_only_invalid",
          reasonCodes: fixture.expectedEvidenceDepthReasonCodes ?? ["inventory_only_evidence"],
        })),
    });
    expect(weak.kind).toBe("source_inconclusive");
    expect(weak.inventoryOnlyNoFindingsReportCount).toBeGreaterThan(0);
  });

  it.each([
    {
      label: "removing manifest evidence ids",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        return buildManifestBackedReport({
          report: validNoFindingsAuditReportCases[0],
          snapshot,
          manifestEvidenceRefs: [],
        });
      },
      expectedIssues: ["missing_report_manifest_fields"],
      expectedFamily: "invalid_artifact_contract",
    },
    {
      label: "removing runtime ledger evidence",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        const report = buildManifestBackedReport({
          report: validNoFindingsAuditReportCases[0],
          snapshot,
        });
        return { ...report, evidenceUnits: [] };
      },
      expectedIssues: ["missing_audit_evidence_ref"],
      expectedFamily: "invalid_artifact_integrity",
    },
    {
      label: "changing runtime risk ids",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        return buildManifestBackedReport({
          report: validNoFindingsAuditReportCases[0],
          snapshot,
          evidenceRiskHypothesisIds: ["risk-other"],
        });
      },
      expectedIssues: ["audit_evidence_risk_mismatch"],
      expectedFamily: "invalid_artifact_integrity",
    },
    {
      label: "changing runtime scope ids",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        return buildManifestBackedReport({
          report: validNoFindingsAuditReportCases[0],
          snapshot,
          evidenceScopeIds: ["src/runtime.ts"],
        });
      },
      expectedIssues: ["audit_evidence_scope_mismatch"],
      expectedFamily: "invalid_artifact_integrity",
    },
    {
      label: "changing runtime source snapshot ids",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        return buildManifestBackedReport({
          report: validNoFindingsAuditReportCases[0],
          snapshot,
          evidenceSourceSnapshotId: `git:${"1".repeat(40)}:${"2".repeat(40)}`,
        });
      },
      expectedIssues: ["audit_evidence_source_snapshot_mismatch"],
      expectedFamily: "invalid_artifact_integrity",
    },
    {
      label: "changing manifest source snapshot ids",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        return buildManifestBackedReport({
          report: validNoFindingsAuditReportCases[0],
          snapshot,
          manifestSourceSnapshot: {
            id: `git:${snapshot.commit}:${"3".repeat(40)}`,
            tree: "3".repeat(40),
          },
        });
      },
      expectedIssues: ["manifest_source_snapshot_mismatch"],
      expectedFamily: "invalid_artifact_contract",
    },
    {
      label: "changing line evidence against the bound snapshot",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        const fixture = validNoFindingsAuditReportCases[0];
        const body = fixture.body.replaceAll("src/config.ts:2", "src/config.ts:99");
        return buildManifestBackedReport({
          report: fixture,
          snapshot,
          body,
          contentSha256: computeAuditReportContentSha256(body),
        });
      },
      expectedIssues: ["invalid_line_reference", "missing_substantive_evidence"],
      expectedFamily: "invalid_artifact_content",
    },
    {
      label: "removing no-findings absence reasoning",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        const fixture = validNoFindingsAuditReportCases[0];
        const body = fixture.body
          .replace("No validated findings.\n", "")
          .replace(/^Absence reasoning:[^\n]*\n/m, "");
        return buildManifestBackedReport({
          report: fixture,
          snapshot,
          body,
          contentSha256: computeAuditReportContentSha256(body),
        });
      },
      expectedIssues: ["manifest_outcome_mismatch"],
      expectedFamily: "invalid_artifact_contract",
    },
    {
      label: "removing verification command evidence",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        const fixture = validNoFindingsAuditReportCases[0];
        const body = fixture.body.replace(/\nChecked commands:\n[\s\S]*$/m, "\n");
        return buildManifestBackedReport({
          report: fixture,
          snapshot,
          body,
          contentSha256: computeAuditReportContentSha256(body),
        });
      },
      expectedIssues: ["manifest_outcome_mismatch", "missing_substantive_evidence"],
      expectedFamily: "invalid_artifact_contract",
    },
  ])(
    "fails manifest-backed no-findings mutation: $label",
    (mutation) => {
      const report = mutation.build(corpusRoot);

      const result = validateAuditReportArtifact({
        text: report.text,
        projectRoot: corpusRoot,
        taskId: report.taskId,
        scopeRoots: validNoFindingsAuditReportCases[0].scopeRoots,
        reportArtifactPaths: [report.artifactPath],
        expectedReportArtifactPath: report.artifactPath,
        auditEvidenceUnits: report.evidenceUnits,
        requireLedgerEvidence: true,
        requireProposedFix: true,
      });

      expect(result.ok).toBe(false);
      expect(issueCodes(result)).toEqual(expect.arrayContaining(mutation.expectedIssues));
      expect(failureFamily(result)).toBe(mutation.expectedFamily);
    },
    20_000,
  );

  it.each([
    {
      label: "changing runtime risk ids",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        return buildManifestBackedReport({
          report: validFindingsAuditReportCases[0],
          snapshot,
          evidenceRiskHypothesisIds: ["risk-other"],
        });
      },
      expectedIssues: ["audit_evidence_risk_mismatch"],
      expectedFamily: "invalid_artifact_integrity",
    },
    {
      label: "changing runtime scope ids",
      build: (root: string) => {
        const snapshot = auditSnapshot(root);
        return buildManifestBackedReport({
          report: validFindingsAuditReportCases[0],
          snapshot,
          evidenceScopeIds: ["src/config.ts"],
        });
      },
      expectedIssues: ["audit_evidence_scope_mismatch"],
      expectedFamily: "invalid_artifact_integrity",
    },
  ])(
    "fails manifest-backed findings mutation: $label",
    (mutation) => {
      const report = mutation.build(corpusRoot);

      const result = validateAuditReportArtifact({
        text: report.text,
        projectRoot: corpusRoot,
        taskId: report.taskId,
        scopeRoots: validFindingsAuditReportCases[0].scopeRoots,
        reportArtifactPaths: [report.artifactPath],
        expectedReportArtifactPath: report.artifactPath,
        auditEvidenceUnits: report.evidenceUnits,
        requireLedgerEvidence: true,
        requireProposedFix: true,
      });

      expect(result.ok).toBe(false);
      expect(issueCodes(result)).toEqual(expect.arrayContaining(mutation.expectedIssues));
      expect(failureFamily(result)).toBe(mutation.expectedFamily);
    },
    20_000,
  );
});
