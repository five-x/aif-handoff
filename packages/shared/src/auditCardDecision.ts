export const AUDIT_CARD_FINAL_STATUSES = [
  "closed_verified",
  "closed_with_residual_risk",
  "rework_required",
  "audit_inconclusive",
] as const;

export type AuditCardFinalStatus = (typeof AUDIT_CARD_FINAL_STATUSES)[number];

export const AUDIT_CARD_VERIFICATION_STRENGTHS = [
  "verified",
  "missing_production",
  "missing",
  "inaccessible",
] as const;

export type AuditCardVerificationStrength = (typeof AUDIT_CARD_VERIFICATION_STRENGTHS)[number];

export interface AuditCardDecisionInput {
  otzRequirement: string;
  acceptanceCriteria: string[];
  otzAcceptanceSatisfied: boolean;
  implementationEvidence: string[];
  verificationEvidence: string[];
  verificationStrength: AuditCardVerificationStrength;
  validFindingCount?: number;
  weakFindingCount?: number;
  discardedFindingCount?: number;
  residualRisks?: string[];
}

export interface AuditCardDecision {
  otzRequirement: string;
  acceptanceCriteria: string[];
  implementationEvidence: string[];
  verificationEvidence: string[];
  requirementCompletion: "satisfied" | "not_satisfied" | "not_verifiable";
  verificationStrength: AuditCardVerificationStrength;
  auditFindingValidity: {
    validFindings: number;
    weakFindings: number;
    discardedFindings: number;
  };
  residualRisks: string[];
  finalStatus: AuditCardFinalStatus;
}

export function classifyAuditCardDecision(input: AuditCardDecisionInput): AuditCardDecision {
  const verificationInaccessible = input.verificationStrength === "inaccessible";
  const requirementCompletion = verificationInaccessible
    ? "not_verifiable"
    : input.otzAcceptanceSatisfied
      ? "satisfied"
      : "not_satisfied";
  let finalStatus: AuditCardFinalStatus;

  if (verificationInaccessible) {
    finalStatus = "audit_inconclusive";
  } else if (!input.otzAcceptanceSatisfied) {
    finalStatus = "rework_required";
  } else if (input.verificationStrength === "verified") {
    finalStatus = "closed_verified";
  } else if (input.verificationStrength === "missing_production") {
    finalStatus = "closed_with_residual_risk";
  } else {
    finalStatus = "rework_required";
  }

  return {
    otzRequirement: input.otzRequirement,
    acceptanceCriteria: input.acceptanceCriteria,
    implementationEvidence: input.implementationEvidence,
    verificationEvidence: input.verificationEvidence,
    requirementCompletion,
    verificationStrength: input.verificationStrength,
    auditFindingValidity: {
      validFindings: input.validFindingCount ?? 0,
      weakFindings: input.weakFindingCount ?? 0,
      discardedFindings: input.discardedFindingCount ?? 0,
    },
    residualRisks: input.residualRisks ?? [],
    finalStatus,
  };
}
