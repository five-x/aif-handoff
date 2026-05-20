import { describe, expect, it } from "vitest";
import {
  buildAcceptedAuditCardDecision,
  buildAuditCardDecisionFromReport,
  classifyAuditCardDecision,
  extractWeakOrDiscardedAuditFindings,
} from "../auditCardDecision.js";

function baseInput() {
  return {
    otzRequirement: "Complete the OTZ card.",
    acceptanceCriteria: ["AC1 is satisfied."],
    otzAcceptanceSatisfied: true,
    implementationEvidence: ["commit abc123"],
    verificationEvidence: ["npm test passed"],
    verificationStrength: "verified" as const,
    validFindingCount: 0,
    weakFindingCount: 0,
    discardedFindingCount: 0,
    residualRisks: [],
  };
}

describe("auditCardDecision", () => {
  it("keeps a completed and verified OTZ card closed_verified when one audit finding is weak", () => {
    const decision = classifyAuditCardDecision({
      ...baseInput(),
      weakFindingCount: 1,
    });

    expect(decision.finalStatus).toBe("closed_verified");
    expect(decision.auditFindingValidity.weakFindings).toBe(1);
  });

  it("does not close verified cards without implementation and verification evidence", () => {
    const withoutImplementationEvidence = classifyAuditCardDecision({
      ...baseInput(),
      implementationEvidence: [],
    });
    const withoutVerificationEvidence = classifyAuditCardDecision({
      ...baseInput(),
      verificationEvidence: [],
    });

    expect(withoutImplementationEvidence.finalStatus).toBe("rework_required");
    expect(withoutVerificationEvidence.finalStatus).toBe("rework_required");
  });

  it("classifies accepted source_inconclusive reports as audit_inconclusive", () => {
    const decision = buildAcceptedAuditCardDecision({
      artifactRole: "report",
      reportText: "# Audit\n\nAudit outcome: Source inconclusive\n",
      reportArtifactFiles: ["audit/source.md"],
      meaningfulChangedFiles: [],
      substantiveReportEvidence: false,
      manifestStatus: "valid",
      sourceClassification: "source_inconclusive",
      auditSynthesisOutcome: null,
    });

    expect(decision.finalStatus).toBe("audit_inconclusive");
    expect(decision.requirementCompletion).toBe("not_verifiable");
    expect(decision.verificationStrength).toBe("inaccessible");
  });

  it("classifies accepted inconclusive synthesis as audit_inconclusive", () => {
    const decision = buildAcceptedAuditCardDecision({
      artifactRole: "synthesis",
      reportText: "# Audit Inconclusive\n\nAudit outcome: Audit inconclusive\n",
      reportArtifactFiles: ["audit/summary.md"],
      meaningfulChangedFiles: [],
      substantiveReportEvidence: false,
      manifestStatus: "valid",
      sourceClassification: "insufficient_substantive_evidence",
      auditSynthesisOutcome: {
        kind: "inconclusive_batch_evidence",
        reason: "Audit inconclusive: source reports were weak.",
      },
    });

    expect(decision.finalStatus).toBe("audit_inconclusive");
    expect(decision.requirementCompletion).toBe("not_verifiable");
    expect(decision.verificationStrength).toBe("inaccessible");
  });

  it("classifies completed OTZ cards with missing production verification as residual risk", () => {
    const decision = classifyAuditCardDecision({
      ...baseInput(),
      verificationEvidence: ["unit and integration evidence passed"],
      verificationStrength: "missing_production",
      residualRisks: ["production validation was not available"],
    });

    expect(decision.finalStatus).toBe("closed_with_residual_risk");
    expect(decision.residualRisks).toContain("production validation was not available");
  });

  it("classifies cards with missing OTZ acceptance criteria as rework_required", () => {
    const decision = classifyAuditCardDecision({
      ...baseInput(),
      otzAcceptanceSatisfied: false,
      verificationStrength: "missing",
      verificationEvidence: [],
    });

    expect(decision.finalStatus).toBe("rework_required");
    expect(decision.requirementCompletion).toBe("not_satisfied");
  });

  it("classifies cards that cannot be checked because access is missing as audit_inconclusive", () => {
    const decision = classifyAuditCardDecision({
      ...baseInput(),
      verificationStrength: "inaccessible",
      verificationEvidence: [],
      residualRisks: ["missing access to production"],
    });

    expect(decision.finalStatus).toBe("audit_inconclusive");
    expect(decision.requirementCompletion).toBe("not_verifiable");
  });

  it("keeps weak findings separate from the final card decision", () => {
    const decision = classifyAuditCardDecision({
      ...baseInput(),
      validFindingCount: 2,
      weakFindingCount: 3,
      discardedFindingCount: 1,
    });

    expect(decision.finalStatus).toBe("closed_verified");
    expect(decision.auditFindingValidity).toEqual({
      validFindings: 2,
      weakFindings: 3,
      discardedFindings: 1,
    });
  });

  it("builds final report decisions without promoting weak/discarded sections to status blockers", () => {
    const reportText = [
      "# Audit",
      "",
      "## No validated findings",
      "No validated findings.",
      "",
      "Checked files:",
      "- `README.md:2`",
      "",
      "Checked commands:",
      '- Command `rg -n "runtime audit" README.md` output: `README.md:2:runtime audit evidence`',
      "",
      "## Weak/discarded findings",
      "- Weak unsupported claim references missing file `missing.ts:99`.",
      "- Discarded claim was omitted because it had no verification output.",
      "",
    ].join("\n");

    expect(extractWeakOrDiscardedAuditFindings(reportText)).toEqual([
      {
        kind: "weak",
        text: "Weak unsupported claim references missing file `missing.ts:99`.",
      },
      {
        kind: "discarded",
        text: "Discarded claim was omitted because it had no verification output.",
      },
    ]);

    const decision = buildAuditCardDecisionFromReport({
      otzRequirement: "Complete the OTZ card.",
      acceptanceCriteria: ["AC1 is satisfied."],
      otzAcceptanceSatisfied: true,
      implementationEvidence: ["commit abc123"],
      verificationEvidence: ["npm test passed"],
      verificationStrength: "verified",
      residualRisks: [],
      reportText,
    });

    expect(decision.finalStatus).toBe("closed_verified");
    expect(decision.requirementCompletion).toBe("satisfied");
    expect(decision.verificationStrength).toBe("verified");
    expect(decision.auditFindingValidity).toEqual({
      validFindings: 0,
      weakFindings: 1,
      discardedFindings: 1,
    });
  });

  it("does not count an empty weak/discarded section as a weak finding", () => {
    const reportText = [
      "# Audit Summary",
      "",
      "No validated findings.",
      "",
      "Checked files:",
      "- `README.md:2`",
      "",
      "Checked commands:",
      '- Command `rg -n "runtime audit" README.md` output: `README.md:2:runtime audit evidence`',
      "",
      "## Weak/discarded findings",
      "",
      "No weak or discarded findings were omitted from the synthesis output.",
      "",
    ].join("\n");

    expect(extractWeakOrDiscardedAuditFindings(reportText)).toEqual([]);

    const decision = buildAuditCardDecisionFromReport({
      otzRequirement: "Complete the synthesis card.",
      acceptanceCriteria: ["No unsupported finding is promoted."],
      otzAcceptanceSatisfied: true,
      implementationEvidence: ["audit/summary.md"],
      verificationEvidence: ["validator accepted synthesis"],
      verificationStrength: "verified",
      reportText,
    });

    expect(decision.finalStatus).toBe("closed_verified");
    expect(decision.auditFindingValidity).toEqual({
      validFindings: 0,
      weakFindings: 0,
      discardedFindings: 0,
    });
  });
});
