import { describe, expect, it } from "vitest";
import { classifyAuditCardDecision } from "../auditCardDecision.js";

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
});
