import {
  AUDIT_PUBLIC_REPORT_OUTCOMES,
  classifyAuditSourceEvidence,
  countValidatedAuditFindings,
  extractSubstantiveAuditCommandEvidence,
  type AuditPublicReportOutcome,
} from "./auditSourceEvidence.js";

export const AUDIT_SYNTHESIS_OUTCOME_KINDS = AUDIT_PUBLIC_REPORT_OUTCOMES;

export type AuditSynthesisOutcomeKind = AuditPublicReportOutcome | "inconclusive_batch_evidence";

export interface AuditSynthesisSourceReport {
  artifactPath: string;
  taskId?: string | null;
  content: string;
}

export interface AuditSynthesisOutcome {
  kind: AuditSynthesisOutcomeKind;
  reason: string;
  sourceReportCount: number;
  validatedFindingCount: number;
  substantiveNoFindingsReportCount: number;
  inventoryOnlyNoFindingsReportCount: number;
  weakReportCount: number;
}

export interface ClassifyAuditSynthesisSourceReportsInput {
  projectRoot: string;
  reports: AuditSynthesisSourceReport[];
  weakReportCount?: number;
}

export interface ClassifyAuditSynthesisOutputInput {
  projectRoot: string;
  text: string;
}

export const AUDIT_SYNTHESIS_OUTCOME_COMMENT = "audit-synthesis-outcome";

export function extractAuditSynthesisCommandEvidence(text: string): string[] {
  return extractSubstantiveAuditCommandEvidence(text).map((entry) => entry.evidence);
}

function hasTerminalSourceInconclusiveManifest(text: string): boolean {
  const manifestPattern = /(?:^|\n)```audit-report-manifest\s*\r?\n([\s\S]*?)\r?\n```/gi;
  for (const match of text.matchAll(manifestPattern)) {
    try {
      const parsed = JSON.parse(match[1] ?? "{}") as { outcome?: unknown };
      if (parsed.outcome === "source_inconclusive") return true;
    } catch {
      continue;
    }
  }
  return false;
}

function isTerminalSourceInconclusiveReport(text: string): boolean {
  return hasTerminalSourceInconclusiveManifest(text) || /\bAudit inconclusive\b/i.test(text);
}

function hasSubstantiveNoFindingsEvidence(text: string, projectRoot: string): boolean {
  return (
    classifyAuditSourceEvidence({ text, projectRoot, requireProposedFix: true }).classification ===
    "validated_no_findings"
  );
}

function hasInventoryOnlyNoFindingsEvidence(text: string, projectRoot: string): boolean {
  return (
    classifyAuditSourceEvidence({ text, projectRoot, requireProposedFix: true }).classification ===
    "inventory_only_invalid"
  );
}

function countValidatedFindings(text: string, projectRoot: string): number {
  return countValidatedAuditFindings({ text, projectRoot, requireProposedFix: true });
}

function inconclusive(
  reason: string,
  input: Partial<AuditSynthesisOutcome>,
): AuditSynthesisOutcome {
  return {
    kind: "source_inconclusive",
    reason,
    sourceReportCount: input.sourceReportCount ?? 0,
    validatedFindingCount: input.validatedFindingCount ?? 0,
    substantiveNoFindingsReportCount: input.substantiveNoFindingsReportCount ?? 0,
    inventoryOnlyNoFindingsReportCount: input.inventoryOnlyNoFindingsReportCount ?? 0,
    weakReportCount: input.weakReportCount ?? 0,
  };
}

export function classifyAuditSynthesisSourceReports(
  input: ClassifyAuditSynthesisSourceReportsInput,
): AuditSynthesisOutcome {
  const weakReportCount = input.weakReportCount ?? 0;
  if (input.reports.length === 0) {
    return inconclusive("Audit inconclusive: no validated source reports were available.", {
      weakReportCount,
    });
  }

  const trustedReports = input.reports.filter(
    (report) => !isTerminalSourceInconclusiveReport(report.content),
  );
  const terminalInconclusiveReportCount = input.reports.length - trustedReports.length;
  const totalWeakReportCount = weakReportCount + terminalInconclusiveReportCount;
  const validatedFindingCount = trustedReports.reduce(
    (sum, report) => sum + countValidatedFindings(report.content, input.projectRoot),
    0,
  );
  const substantiveNoFindingsReportCount = trustedReports.filter((report) =>
    hasSubstantiveNoFindingsEvidence(report.content, input.projectRoot),
  ).length;
  const inventoryOnlyNoFindingsReportCount = trustedReports.filter((report) =>
    hasInventoryOnlyNoFindingsEvidence(report.content, input.projectRoot),
  ).length;
  const base = {
    sourceReportCount: input.reports.length,
    validatedFindingCount,
    substantiveNoFindingsReportCount,
    inventoryOnlyNoFindingsReportCount,
    weakReportCount: totalWeakReportCount,
  };

  if (validatedFindingCount > 0) {
    return {
      kind: "validated_findings_present",
      reason: "Validated findings were present in source audit reports.",
      ...base,
    };
  }

  if (totalWeakReportCount > 0) {
    return inconclusive(
      "Audit inconclusive: terminal weak or invalid source reports were present and no validated findings survived.",
      base,
    );
  }

  if (substantiveNoFindingsReportCount === input.reports.length) {
    return {
      kind: "validated_no_findings",
      reason:
        "No findings survived validation and all source reports included substantive no-findings evidence.",
      ...base,
    };
  }

  return inconclusive(
    "Audit inconclusive: source reports did not include enough substantive inspection evidence to support no-findings.",
    base,
  );
}

export function formatAuditSynthesisOutcomeForArtifact(outcome: AuditSynthesisOutcome): string {
  return [`<!-- ${AUDIT_SYNTHESIS_OUTCOME_COMMENT}`, JSON.stringify(outcome), "-->"].join("\n");
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null;
}

function bestEffortCount(value: unknown): number {
  return readNonNegativeInteger(value) ?? 0;
}

function parsedOutcomeCounts(
  parsed: Partial<AuditSynthesisOutcome>,
): Omit<AuditSynthesisOutcome, "kind" | "reason"> | null {
  const sourceReportCount = readNonNegativeInteger(parsed.sourceReportCount);
  const validatedFindingCount = readNonNegativeInteger(parsed.validatedFindingCount);
  const substantiveNoFindingsReportCount = readNonNegativeInteger(
    parsed.substantiveNoFindingsReportCount,
  );
  const inventoryOnlyNoFindingsReportCount = readNonNegativeInteger(
    parsed.inventoryOnlyNoFindingsReportCount,
  );
  const weakReportCount = readNonNegativeInteger(parsed.weakReportCount);

  if (
    sourceReportCount === null ||
    validatedFindingCount === null ||
    substantiveNoFindingsReportCount === null ||
    inventoryOnlyNoFindingsReportCount === null ||
    weakReportCount === null
  ) {
    return null;
  }

  return {
    sourceReportCount,
    validatedFindingCount,
    substantiveNoFindingsReportCount,
    inventoryOnlyNoFindingsReportCount,
    weakReportCount,
  };
}

function inconclusiveFromParsedMetadata(
  reason: string,
  parsed: Partial<AuditSynthesisOutcome>,
): AuditSynthesisOutcome {
  return inconclusive(reason, {
    sourceReportCount: bestEffortCount(parsed.sourceReportCount),
    validatedFindingCount: bestEffortCount(parsed.validatedFindingCount),
    substantiveNoFindingsReportCount: bestEffortCount(parsed.substantiveNoFindingsReportCount),
    inventoryOnlyNoFindingsReportCount: bestEffortCount(parsed.inventoryOnlyNoFindingsReportCount),
    weakReportCount: bestEffortCount(parsed.weakReportCount),
  });
}

function validateParsedOutcome(outcome: AuditSynthesisOutcome): AuditSynthesisOutcome {
  const noFindingsReportCount =
    outcome.substantiveNoFindingsReportCount + outcome.inventoryOnlyNoFindingsReportCount;
  if (noFindingsReportCount > outcome.sourceReportCount) {
    return inconclusive(
      "Audit inconclusive: source-report outcome metadata has contradictory counts.",
      outcome,
    );
  }

  if (
    outcome.kind === "validated_findings_present" &&
    (outcome.sourceReportCount === 0 || outcome.validatedFindingCount === 0)
  ) {
    return inconclusive(
      "Audit inconclusive: source-report outcome metadata claims findings without validated finding counts.",
      outcome,
    );
  }

  if (outcome.kind === "validated_no_findings") {
    const validNoFindings =
      outcome.sourceReportCount > 0 &&
      outcome.weakReportCount === 0 &&
      outcome.validatedFindingCount === 0 &&
      outcome.substantiveNoFindingsReportCount === outcome.sourceReportCount &&
      outcome.inventoryOnlyNoFindingsReportCount === 0;
    if (!validNoFindings) {
      return inconclusive(
        "Audit inconclusive: source-report outcome metadata does not prove substantive no-findings.",
        outcome,
      );
    }
  }

  return outcome;
}

export function parseAuditSynthesisOutcomeFromText(text: string): AuditSynthesisOutcome | null {
  const escaped = AUDIT_SYNTHESIS_OUTCOME_COMMENT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`<!--\\s*${escaped}\\s*([\\s\\S]*?)\\s*-->`, "i"));
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]?.trim() ?? "{}") as Partial<AuditSynthesisOutcome>;
    if (parsed.kind === "inconclusive_batch_evidence") {
      return inconclusiveFromParsedMetadata(
        "Audit inconclusive: source-report outcome metadata uses a legacy inconclusive diagnostic kind.",
        parsed,
      );
    }
    if (!AUDIT_SYNTHESIS_OUTCOME_KINDS.includes(parsed.kind as AuditPublicReportOutcome)) {
      return inconclusiveFromParsedMetadata(
        "Audit inconclusive: source-report outcome metadata has an invalid outcome kind.",
        parsed,
      );
    }
    const counts = parsedOutcomeCounts(parsed);
    if (!counts) {
      return inconclusiveFromParsedMetadata(
        "Audit inconclusive: source-report outcome metadata has missing or invalid counts.",
        parsed,
      );
    }
    return validateParsedOutcome({
      kind: parsed.kind as AuditSynthesisOutcomeKind,
      reason: typeof parsed.reason === "string" ? parsed.reason : "Parsed audit synthesis outcome.",
      ...counts,
    });
  } catch {
    return inconclusiveFromParsedMetadata(
      "Audit inconclusive: source-report outcome metadata is not valid JSON.",
      {},
    );
  }
}

function classifyVisibleSynthesisOutput(text: string, projectRoot: string): AuditSynthesisOutcome {
  const validatedFindingCount = countValidatedFindings(text, projectRoot);
  const substantiveNoFindings = hasSubstantiveNoFindingsEvidence(text, projectRoot);
  const inventoryOnlyNoFindings = hasInventoryOnlyNoFindingsEvidence(text, projectRoot);
  const sourceReportCount = 0;
  const base = {
    sourceReportCount,
    validatedFindingCount,
    substantiveNoFindingsReportCount: substantiveNoFindings ? 1 : 0,
    inventoryOnlyNoFindingsReportCount: inventoryOnlyNoFindings ? 1 : 0,
    weakReportCount: 0,
  };

  if (validatedFindingCount > 0) {
    return {
      kind: "validated_findings_present",
      reason: "Synthesis artifact includes validated findings.",
      ...base,
    };
  }

  if (substantiveNoFindings) {
    return {
      kind: "validated_no_findings",
      reason: "Synthesis artifact claims no findings with substantive evidence.",
      ...base,
    };
  }

  if (/\bAudit inconclusive\b/i.test(text)) {
    return inconclusive(
      "Audit inconclusive: synthesis artifact declares inconclusive evidence.",
      base,
    );
  }

  return inconclusive(
    "Audit inconclusive: synthesis artifact does not include validated findings or substantive no-findings evidence.",
    base,
  );
}

export function combineAuditSynthesisOutcomes(input: {
  sourceOutcome: AuditSynthesisOutcome | null;
  visibleOutcome: AuditSynthesisOutcome;
}): AuditSynthesisOutcome {
  if (!input.sourceOutcome) {
    if (input.visibleOutcome.kind === "validated_findings_present") return input.visibleOutcome;
    return inconclusive(
      "Audit inconclusive: synthesis artifact is missing source-report outcome metadata.",
      {
        ...input.visibleOutcome,
      },
    );
  }

  if (input.sourceOutcome.kind === "source_inconclusive") {
    if (input.visibleOutcome.kind !== "source_inconclusive") {
      return inconclusive(
        "Audit inconclusive: synthesis artifact visible conclusion disagrees with source-report outcome.",
        {
          sourceReportCount: input.sourceOutcome.sourceReportCount,
          validatedFindingCount: input.sourceOutcome.validatedFindingCount,
          substantiveNoFindingsReportCount: input.sourceOutcome.substantiveNoFindingsReportCount,
          inventoryOnlyNoFindingsReportCount:
            input.sourceOutcome.inventoryOnlyNoFindingsReportCount,
          weakReportCount: input.sourceOutcome.weakReportCount,
        },
      );
    }
    return input.sourceOutcome;
  }
  if (input.visibleOutcome.kind === "source_inconclusive") return input.visibleOutcome;
  if (input.sourceOutcome.kind !== input.visibleOutcome.kind) {
    return inconclusive(
      "Audit inconclusive: synthesis artifact conclusion disagrees with source-report outcome.",
      {
        sourceReportCount: input.sourceOutcome.sourceReportCount,
        validatedFindingCount: input.sourceOutcome.validatedFindingCount,
        substantiveNoFindingsReportCount: input.sourceOutcome.substantiveNoFindingsReportCount,
        inventoryOnlyNoFindingsReportCount: input.sourceOutcome.inventoryOnlyNoFindingsReportCount,
        weakReportCount: input.sourceOutcome.weakReportCount,
      },
    );
  }
  return input.sourceOutcome;
}

export function classifyAuditSynthesisOutput(
  input: ClassifyAuditSynthesisOutputInput,
): AuditSynthesisOutcome {
  return combineAuditSynthesisOutcomes({
    sourceOutcome: parseAuditSynthesisOutcomeFromText(input.text),
    visibleOutcome: classifyVisibleSynthesisOutput(input.text, input.projectRoot),
  });
}
