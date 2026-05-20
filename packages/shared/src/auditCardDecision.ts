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

export interface WeakOrDiscardedAuditFinding {
  kind: "weak" | "discarded";
  text: string;
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

export interface BuildAuditCardDecisionFromReportInput {
  otzRequirement?: string;
  acceptanceCriteria?: string[];
  otzAcceptanceSatisfied: boolean;
  implementationEvidence?: string[];
  verificationEvidence?: string[];
  verificationStrength?: AuditCardVerificationStrength;
  validFindingCount?: number;
  weakFindingCount?: number;
  discardedFindingCount?: number;
  residualRisks?: string[];
  reportText?: string | null;
}

export interface BuildAcceptedAuditCardDecisionInput {
  artifactRole: "report" | "synthesis";
  reportText?: string | null;
  reportArtifactFiles: string[];
  meaningfulChangedFiles: string[];
  substantiveReportEvidence: boolean;
  manifestStatus?: string | null;
  sourceClassification?: string | null;
  auditSynthesisOutcome?: { kind?: string | null; reason?: string | null } | null;
}

export function classifyAuditCardDecision(input: AuditCardDecisionInput): AuditCardDecision {
  const verificationInaccessible = input.verificationStrength === "inaccessible";
  const hasImplementationEvidence = input.implementationEvidence.some(
    (entry) => entry.trim().length > 0,
  );
  const hasVerificationEvidence = input.verificationEvidence.some(
    (entry) => entry.trim().length > 0,
  );
  const hasRequiredEvidence = hasImplementationEvidence && hasVerificationEvidence;
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
  } else if (input.verificationStrength === "verified" && hasRequiredEvidence) {
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

function isWeakOrDiscardedAuditFindingsHeading(title: string): boolean {
  const normalized = title.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return (
    /\bfinding/.test(normalized) &&
    /\b(?:weak|discarded|rejected|omitted|unsupported|non-blocking)\b/.test(normalized)
  );
}

function stripWeakOrDiscardedAuditFindingSections(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let skipUntilHeadingLevel: number | null = null;

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2] ?? "";
      if (skipUntilHeadingLevel !== null && level <= skipUntilHeadingLevel) {
        skipUntilHeadingLevel = null;
      }
      if (skipUntilHeadingLevel === null && isWeakOrDiscardedAuditFindingsHeading(title)) {
        skipUntilHeadingLevel = level;
        continue;
      }
    }

    if (skipUntilHeadingLevel !== null) continue;
    kept.push(line);
  }

  return kept.join("\n");
}

export function extractWeakOrDiscardedAuditFindings(text: string): WeakOrDiscardedAuditFinding[] {
  const findings: WeakOrDiscardedAuditFinding[] = [];
  const lines = text.split(/\r?\n/);
  let collecting = false;
  let sectionLevel = 0;
  let sectionKind: WeakOrDiscardedAuditFinding["kind"] = "weak";
  const sectionLines: string[] = [];

  const flush = () => {
    if (sectionLines.length === 0) return;
    const bullets = sectionLines
      .map((line) => line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/)?.[1]?.trim() ?? null)
      .filter((entry): entry is string => Boolean(entry));
    if (bullets.length > 0) {
      for (const bullet of bullets) {
        findings.push({
          kind: /\b(?:discarded|rejected|omitted)\b/i.test(bullet) ? "discarded" : sectionKind,
          text: bullet,
        });
      }
      sectionLines.length = 0;
      return;
    }
    const body = sectionLines.join("\n").trim();
    if (body) {
      findings.push({ kind: sectionKind, text: body });
    }
    sectionLines.length = 0;
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2] ?? "";
      if (collecting && level <= sectionLevel) {
        flush();
        collecting = false;
      }
      if (!collecting && isWeakOrDiscardedAuditFindingsHeading(title)) {
        const titleHasWeakSignal = /\b(?:weak|unsupported|non-blocking)\b/i.test(title);
        const titleHasDiscardedSignal = /\b(?:discarded|rejected|omitted)\b/i.test(title);
        collecting = true;
        sectionLevel = level;
        sectionKind = titleHasDiscardedSignal && !titleHasWeakSignal ? "discarded" : "weak";
        continue;
      }
    }

    if (collecting) sectionLines.push(line);
  }

  flush();
  return findings;
}

function countAuditDecisionValidFindings(text: string): number {
  return stripWeakOrDiscardedAuditFindingSections(text)
    .split(/\n(?=#{2,4}\s+|\s*[-*]\s+(?:finding|issue|risk)\b)/i)
    .map((section) => section.trim())
    .filter((section) => {
      return (
        /\b(?:finding|issue)\b/i.test(section) &&
        /\bEvidence\s*:/i.test(section) &&
        /\bRisk\s*:/i.test(section) &&
        /\bVerification\s*:/i.test(section)
      );
    }).length;
}

export function buildAuditCardDecisionFromReport(
  input: BuildAuditCardDecisionFromReportInput,
): AuditCardDecision {
  const reportText = input.reportText ?? "";
  const weakOrDiscardedFindings = reportText ? extractWeakOrDiscardedAuditFindings(reportText) : [];
  const weakFindingCount =
    input.weakFindingCount ??
    weakOrDiscardedFindings.filter((finding) => finding.kind === "weak").length;
  const discardedFindingCount =
    input.discardedFindingCount ??
    weakOrDiscardedFindings.filter((finding) => finding.kind === "discarded").length;

  return classifyAuditCardDecision({
    otzRequirement:
      input.otzRequirement ?? "Produce an accepted audit artifact for the scoped OTZ card.",
    acceptanceCriteria: input.acceptanceCriteria ?? [
      "Accepted completion evidence satisfies the audit artifact contract.",
      "Verification evidence is present and trusted.",
    ],
    otzAcceptanceSatisfied: input.otzAcceptanceSatisfied,
    implementationEvidence: input.implementationEvidence ?? [],
    verificationEvidence: input.verificationEvidence ?? [],
    verificationStrength: input.verificationStrength ?? "missing",
    validFindingCount:
      input.validFindingCount ?? (reportText ? countAuditDecisionValidFindings(reportText) : 0),
    weakFindingCount,
    discardedFindingCount,
    residualRisks: input.residualRisks ?? [],
  });
}

export function buildAcceptedAuditCardDecision(
  input: BuildAcceptedAuditCardDecisionInput,
): AuditCardDecision {
  const terminalAuditInconclusive =
    input.sourceClassification === "source_inconclusive" ||
    input.auditSynthesisOutcome?.kind === "source_inconclusive" ||
    input.auditSynthesisOutcome?.kind === "inconclusive_batch_evidence";
  const implementationEvidence =
    input.reportArtifactFiles.length > 0 ? input.reportArtifactFiles : input.meaningfulChangedFiles;
  const verificationEvidence = [
    "completion evidence guard accepted audit artifact",
    input.manifestStatus === "valid" ? "audit report manifest valid" : null,
    input.substantiveReportEvidence ? "substantive report evidence accepted" : null,
    input.sourceClassification ? `source classification: ${input.sourceClassification}` : null,
    input.auditSynthesisOutcome?.kind
      ? `synthesis outcome: ${input.auditSynthesisOutcome.kind}`
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  return buildAuditCardDecisionFromReport({
    otzRequirement:
      input.artifactRole === "synthesis"
        ? "Produce an accepted audit synthesis for the scoped OTZ card."
        : "Produce an accepted audit source report for the scoped OTZ card.",
    acceptanceCriteria: [
      "Report artifact exists and is trusted valid.",
      "Accepted findings meet the evidence contract or no-findings evidence is substantive.",
    ],
    otzAcceptanceSatisfied: !terminalAuditInconclusive,
    implementationEvidence,
    verificationEvidence,
    verificationStrength: terminalAuditInconclusive ? "inaccessible" : "verified",
    residualRisks: terminalAuditInconclusive
      ? [
          input.auditSynthesisOutcome?.reason ??
            "Audit evidence is terminally inconclusive and cannot support a trusted finding or no-findings result.",
        ]
      : [],
    reportText: input.reportText,
  });
}
