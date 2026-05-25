import {
  AUDIT_PUBLIC_REPORT_OUTCOMES,
  countValidatedAuditFindings,
  extractSubstantiveAuditCommandEvidence,
  type AuditPublicReportOutcome,
  type AuditSourceClassification,
} from "./auditSourceEvidence.js";
import { validateAuditReportArtifact } from "./auditReportValidator.js";
import type { AuditEvidenceUnit } from "./auditEvidenceLedger.js";

export const AUDIT_SYNTHESIS_OUTCOME_KINDS = AUDIT_PUBLIC_REPORT_OUTCOMES;

export type AuditSynthesisOutcomeKind = AuditPublicReportOutcome | "inconclusive_batch_evidence";

export interface AuditSynthesisSourceReport {
  artifactPath: string;
  taskId?: string | null;
  roadmapBatchId?: string | null;
  roadmapAlias?: string | null;
  auditPlanId?: string | null;
  auditEvidenceUnits?: AuditEvidenceUnit[];
  content: string;
}

export type AuditSynthesisSourceArtifactState =
  | "missing"
  | "invalid"
  | "source_inconclusive"
  | "untrusted"
  | "excluded";

export interface TrustedSourceAuditArtifact {
  artifactPath: string;
  taskId?: string | null;
  roadmapBatchId?: string | null;
  roadmapAlias?: string | null;
  auditPlanId?: string | null;
  sourceClassification: Extract<
    AuditSourceClassification,
    "validated_findings_present" | "validated_no_findings"
  >;
  content: string;
  auditEvidenceUnits?: AuditEvidenceUnit[];
  manifestValid: boolean;
  ledgerValid: boolean;
  sourceSnapshotValid: boolean;
  committedBlobVerified: boolean;
  completionGuardTrusted: boolean;
  substantiveNoFindingsSupported?: boolean;
  required?: boolean;
  reasonCodes?: string[];
}

export interface AuditSynthesisBlockingSourceArtifact {
  artifactPath: string;
  taskId?: string | null;
  required: boolean;
  state?: AuditSynthesisSourceArtifactState | string | null;
  sourceClassification?: AuditSourceClassification | AuditPublicReportOutcome | null;
  reasonCodes: string[];
}

export interface AuditSynthesisOutcome {
  kind: AuditSynthesisOutcomeKind;
  reason: string;
  sourceReportCount: number;
  validatedFindingCount: number;
  substantiveNoFindingsReportCount: number;
  inventoryOnlyNoFindingsReportCount: number;
  weakReportCount: number;
  reasonCodes?: string[];
  blockingSourceArtifacts?: AuditSynthesisBlockingSourceArtifact[];
}

export interface ClassifyAuditSynthesisSourceReportsInput {
  projectRoot: string;
  reports?: AuditSynthesisSourceReport[];
  trustedSourceArtifacts?: TrustedSourceAuditArtifact[];
  blockingSourceArtifacts?: AuditSynthesisBlockingSourceArtifact[];
  weakReportCount?: number;
}

export interface ClassifyAuditSynthesisOutputInput {
  projectRoot: string;
  text: string;
  artifactPath?: string | null;
  taskId?: string | null;
  roadmapBatchId?: string | null;
  roadmapAlias?: string | null;
  auditPlanId?: string | null;
  auditEvidenceUnits?: AuditEvidenceUnit[];
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

function countValidatedFindings(text: string, projectRoot: string): number {
  return countValidatedAuditFindings({ text, projectRoot, requireProposedFix: true });
}

function hasSubstantiveNoFindingsEvidence(input: ClassifyAuditSynthesisOutputInput): boolean {
  const artifactPath = input.artifactPath ?? "audit/synthesis.md";
  const validation = validateAuditReportArtifact({
    text: input.text,
    projectRoot: input.projectRoot,
    taskId: input.taskId ?? undefined,
    roadmapBatchId: input.roadmapBatchId ?? undefined,
    roadmapAlias: input.roadmapAlias ?? undefined,
    auditPlanId: input.auditPlanId ?? undefined,
    reportArtifactPaths: [artifactPath],
    expectedReportArtifactPath: artifactPath,
    requireProposedFix: true,
    auditEvidenceUnits: input.auditEvidenceUnits ?? [],
  });
  return (
    validation.sourceClassification === "validated_no_findings" &&
    validation.evidenceDepth.trustedNoFindingsSupported
  );
}

function hasInventoryOnlyNoFindingsEvidence(input: ClassifyAuditSynthesisOutputInput): boolean {
  const artifactPath = input.artifactPath ?? "audit/synthesis.md";
  return (
    validateAuditReportArtifact({
      text: input.text,
      projectRoot: input.projectRoot,
      taskId: input.taskId ?? undefined,
      roadmapBatchId: input.roadmapBatchId ?? undefined,
      roadmapAlias: input.roadmapAlias ?? undefined,
      auditPlanId: input.auditPlanId ?? undefined,
      reportArtifactPaths: [artifactPath],
      expectedReportArtifactPath: artifactPath,
      requireProposedFix: true,
      auditEvidenceUnits: input.auditEvidenceUnits ?? [],
    }).sourceClassification === "inventory_only_invalid"
  );
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
    reasonCodes: input.reasonCodes ?? [],
    blockingSourceArtifacts: input.blockingSourceArtifacts ?? [],
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0))).sort();
}

function normalizeReasonCodes(values: readonly string[] | undefined): string[] {
  return uniqueStrings(
    (values ?? []).filter((value): value is string => typeof value === "string"),
  );
}

function sourceArtifactTrustReasonCodes(artifact: TrustedSourceAuditArtifact): string[] {
  const reasonCodes = [...(artifact.reasonCodes ?? [])];
  if (!artifact.manifestValid) reasonCodes.push("invalid_manifest");
  if (!artifact.ledgerValid) reasonCodes.push("invalid_ledger");
  if (!artifact.sourceSnapshotValid) reasonCodes.push("invalid_source_snapshot");
  if (!artifact.committedBlobVerified) reasonCodes.push("missing_committed_source");
  if (!artifact.completionGuardTrusted) reasonCodes.push("untrusted_completion_guard");
  return normalizeReasonCodes(reasonCodes);
}

function sourceArtifactIsTrusted(artifact: TrustedSourceAuditArtifact): boolean {
  return sourceArtifactTrustReasonCodes(artifact).length === 0;
}

function blockingArtifactFromTrusted(
  artifact: TrustedSourceAuditArtifact,
  reasonCodes: string[],
): AuditSynthesisBlockingSourceArtifact {
  return {
    artifactPath: artifact.artifactPath,
    taskId: artifact.taskId ?? null,
    required: artifact.required ?? true,
    state: "untrusted",
    sourceClassification: artifact.sourceClassification,
    reasonCodes,
  };
}

function blockingArtifactFromLegacyReport(
  report: AuditSynthesisSourceReport,
): AuditSynthesisBlockingSourceArtifact {
  return {
    artifactPath: report.artifactPath,
    taskId: report.taskId ?? null,
    required: true,
    state: isTerminalSourceInconclusiveReport(report.content) ? "source_inconclusive" : "untrusted",
    reasonCodes: isTerminalSourceInconclusiveReport(report.content)
      ? ["source_inconclusive"]
      : ["untrusted_source_artifact"],
  };
}

export function classifyAuditSynthesisSourceReports(
  input: ClassifyAuditSynthesisSourceReportsInput,
): AuditSynthesisOutcome {
  const weakReportCount = input.weakReportCount ?? 0;
  const legacyReports = input.reports ?? [];
  const trustedSourceArtifacts = input.trustedSourceArtifacts ?? [];
  const explicitBlockingArtifacts = input.blockingSourceArtifacts ?? [];
  const legacyBlockingArtifacts = legacyReports.map(blockingArtifactFromLegacyReport);
  const untrustedTypedArtifacts = trustedSourceArtifacts
    .map((artifact) => ({
      artifact,
      reasonCodes: sourceArtifactTrustReasonCodes(artifact),
    }))
    .filter((entry) => entry.reasonCodes.length > 0)
    .map((entry) => blockingArtifactFromTrusted(entry.artifact, entry.reasonCodes));
  const trustedArtifacts = trustedSourceArtifacts.filter(sourceArtifactIsTrusted);
  const blockingSourceArtifacts = [
    ...explicitBlockingArtifacts,
    ...legacyBlockingArtifacts,
    ...untrustedTypedArtifacts,
  ].map((artifact) => ({
    ...artifact,
    required: artifact.required !== false,
    reasonCodes: normalizeReasonCodes(artifact.reasonCodes),
  }));
  const requiredBlockingSourceArtifacts = blockingSourceArtifacts.filter(
    (artifact) => artifact.required,
  );
  const trustedSourceReportCount = trustedArtifacts.length;
  const requiredSourceArtifactCount =
    trustedSourceReportCount + requiredBlockingSourceArtifacts.length;
  const reasonCodes = uniqueStrings(
    blockingSourceArtifacts.flatMap((artifact) => artifact.reasonCodes),
  );

  if (requiredSourceArtifactCount === 0) {
    return inconclusive("Audit inconclusive: no validated source reports were available.", {
      weakReportCount,
      reasonCodes: ["missing_source_artifacts"],
    });
  }

  const totalWeakReportCount = weakReportCount + requiredBlockingSourceArtifacts.length;
  const validatedFindingCount = trustedArtifacts
    .filter((artifact) => artifact.sourceClassification === "validated_findings_present")
    .reduce(
      (sum, artifact) => sum + countValidatedFindings(artifact.content, input.projectRoot),
      0,
    );
  const sourceValidations = trustedArtifacts.map((artifact) =>
    validateAuditReportArtifact({
      text: artifact.content,
      projectRoot: input.projectRoot,
      taskId: artifact.taskId ?? undefined,
      roadmapBatchId: artifact.roadmapBatchId ?? undefined,
      roadmapAlias: artifact.roadmapAlias ?? undefined,
      auditPlanId: artifact.auditPlanId ?? undefined,
      reportArtifactPaths: [artifact.artifactPath],
      expectedReportArtifactPath: artifact.artifactPath,
      requireProposedFix: true,
      auditEvidenceUnits: artifact.auditEvidenceUnits ?? [],
    }),
  );
  const substantiveNoFindingsReportCount = trustedArtifacts.filter(
    (artifact, index) =>
      artifact.sourceClassification === "validated_no_findings" &&
      (artifact.substantiveNoFindingsSupported ??
        sourceValidations[index]?.evidenceDepth.trustedNoFindingsSupported) === true,
  ).length;
  const inventoryOnlyNoFindingsReportCount =
    blockingSourceArtifacts.filter(
      (artifact) => artifact.sourceClassification === "inventory_only_invalid",
    ).length +
    sourceValidations.filter(
      (validation) => validation.sourceClassification === "inventory_only_invalid",
    ).length;
  const trustedValidatedNoFindingsCount = trustedArtifacts.filter(
    (artifact) => artifact.sourceClassification === "validated_no_findings",
  ).length;
  const trustedValidatedFindingsCount = trustedArtifacts.filter(
    (artifact) => artifact.sourceClassification === "validated_findings_present",
  ).length;
  const base = {
    sourceReportCount: trustedSourceReportCount,
    validatedFindingCount,
    substantiveNoFindingsReportCount,
    inventoryOnlyNoFindingsReportCount,
    weakReportCount: totalWeakReportCount,
    reasonCodes,
    blockingSourceArtifacts,
  };

  if (validatedFindingCount > 0 || trustedValidatedFindingsCount > 0) {
    return {
      kind: "validated_findings_present",
      reason: "Validated findings were present in trusted source audit artifacts.",
      ...base,
    };
  }

  if (requiredBlockingSourceArtifacts.length > 0) {
    return inconclusive(
      "Audit inconclusive: required source audit artifacts were invalid, missing, source-inconclusive, or untrusted.",
      base,
    );
  }

  if (trustedArtifacts.length > 0 && substantiveNoFindingsReportCount === trustedArtifacts.length) {
    return {
      kind: "validated_no_findings",
      reason:
        "No findings survived validation and all required trusted source audit artifacts included substantive no-findings evidence.",
      ...base,
    };
  }

  if (trustedValidatedNoFindingsCount > 0) {
    return inconclusive(
      "Audit inconclusive: trusted source audit artifacts did not include enough substantive inspection evidence to support no-findings.",
      base,
    );
  }

  return inconclusive(
    "Audit inconclusive: no trusted source audit artifacts were available for synthesis.",
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

function parseReasonCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return normalizeReasonCodes(value.filter((entry): entry is string => typeof entry === "string"));
}

function parseBlockingSourceArtifacts(value: unknown): AuditSynthesisBlockingSourceArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const artifact = entry as Partial<AuditSynthesisBlockingSourceArtifact>;
    if (typeof artifact.artifactPath !== "string" || artifact.artifactPath.length === 0) {
      return [];
    }
    return [
      {
        artifactPath: artifact.artifactPath,
        taskId: typeof artifact.taskId === "string" ? artifact.taskId : null,
        required: artifact.required !== false,
        state: typeof artifact.state === "string" ? artifact.state : null,
        sourceClassification:
          typeof artifact.sourceClassification === "string" ? artifact.sourceClassification : null,
        reasonCodes: parseReasonCodes(artifact.reasonCodes),
      },
    ];
  });
}

function parsedOutcomeCounts(
  parsed: Partial<AuditSynthesisOutcome>,
): Pick<
  AuditSynthesisOutcome,
  | "sourceReportCount"
  | "validatedFindingCount"
  | "substantiveNoFindingsReportCount"
  | "inventoryOnlyNoFindingsReportCount"
  | "weakReportCount"
> | null {
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
    reasonCodes: parseReasonCodes(parsed.reasonCodes),
    blockingSourceArtifacts: parseBlockingSourceArtifacts(parsed.blockingSourceArtifacts),
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
    const requiredBlockers = (outcome.blockingSourceArtifacts ?? []).filter(
      (artifact) => artifact.required,
    );
    const validNoFindings =
      outcome.sourceReportCount > 0 &&
      outcome.weakReportCount === 0 &&
      outcome.validatedFindingCount === 0 &&
      outcome.substantiveNoFindingsReportCount === outcome.sourceReportCount &&
      outcome.inventoryOnlyNoFindingsReportCount === 0 &&
      requiredBlockers.length === 0;
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
      reasonCodes: parseReasonCodes(parsed.reasonCodes),
      blockingSourceArtifacts: parseBlockingSourceArtifacts(parsed.blockingSourceArtifacts),
    });
  } catch {
    return inconclusiveFromParsedMetadata(
      "Audit inconclusive: source-report outcome metadata is not valid JSON.",
      {},
    );
  }
}

function classifyVisibleSynthesisOutput(
  input: ClassifyAuditSynthesisOutputInput,
): AuditSynthesisOutcome {
  const validatedFindingCount = countValidatedFindings(input.text, input.projectRoot);
  const substantiveNoFindings = hasSubstantiveNoFindingsEvidence(input);
  const inventoryOnlyNoFindings = hasInventoryOnlyNoFindingsEvidence(input);
  const sourceReportCount = 0;
  const base = {
    sourceReportCount,
    validatedFindingCount,
    substantiveNoFindingsReportCount: substantiveNoFindings ? 1 : 0,
    inventoryOnlyNoFindingsReportCount: inventoryOnlyNoFindings ? 1 : 0,
    weakReportCount: 0,
    reasonCodes: [],
    blockingSourceArtifacts: [],
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

  if (/\bAudit inconclusive\b/i.test(input.text)) {
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
    visibleOutcome: classifyVisibleSynthesisOutput(input),
  });
}
