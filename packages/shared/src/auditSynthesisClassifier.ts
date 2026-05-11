import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const AUDIT_SYNTHESIS_OUTCOME_KINDS = [
  "validated_findings_present",
  "validated_no_findings",
  "inconclusive_batch_evidence",
] as const;

export type AuditSynthesisOutcomeKind = (typeof AUDIT_SYNTHESIS_OUTCOME_KINDS)[number];

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

const LINE_REF_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z0-9]{1,12}):(\d+)(?::\d+)?(?=$|[\s`'"\]),.;])/gi;

const LOW_QUALITY_SYNTHESIS_PATTERNS = [
  /\b(?:123abc|abc123|1234567890abcdef|deadbeef|cafebabe)\b/i,
  /\b(?:root-commit|Date:\s+Mon May 10 12:34:56 2026|Author:\s+qwen-local-agent\s+<>|Signed-off-by:\s+qwen-local-agent\s+<>|commit\s+[0-9a-f]*0c0c[0-9a-f]*\b)/i,
  /\b(?:too large to (?:be )?(?:read|inspect)|reported as too large|file is too large|could not (?:read|inspect|access)|would show|should show|expected to show)\b/i,
  /\b(?:may contain|likely used|likely indicates|confirmed (?:the )?file exists|confirmed .* exists)\b/i,
];

const INVENTORY_COMMAND_PATTERNS = [
  /^\s*git\s+ls-files\b/i,
  /^\s*git\s+status\b/i,
  /^\s*git\s+log\b/i,
  /^\s*ls\b/i,
  /^\s*dir\b/i,
  /^\s*find\b/i,
  /^\s*test\s+-e\b/i,
  /^\s*get-childitem\b/i,
];

function normalizePath(rawPath: string): string | null {
  const normalized = rawPath
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/[),.;\]]+$/g, "");
  if (
    !normalized ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.includes("*")
  ) {
    return null;
  }
  return normalized;
}

function collectExistingLineEvidenceRefs(text: string, projectRoot: string): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(LINE_REF_PATTERN)) {
    const path = normalizePath(match[1] ?? "");
    const line = Number(match[2]);
    if (!path || !Number.isInteger(line) || line <= 0) continue;
    if (!existsSync(resolve(projectRoot, path))) continue;
    refs.add(`${path}:${line}`);
  }
  return [...refs].sort();
}

function splitFindingSections(text: string): string[] {
  return text
    .split(/\n(?=#{2,4}\s+|\s*[-*]\s+(?:finding|issue|risk)\b)/i)
    .map((section) => section.trim())
    .filter((section) => /\b(?:finding|issue)\b/i.test(section));
}

function isInventoryCommand(command: string): boolean {
  return INVENTORY_COMMAND_PATTERNS.some((pattern) => pattern.test(command.trim()));
}

export function extractAuditSynthesisCommandEvidence(text: string): string[] {
  const evidence: string[] = [];
  const commandPattern =
    /(?:^|\n)\s*-?\s*(?:Verification:\s*)?Command\s+`([^`\r\n]+)`\s+(?:output|returned|matched|included)[^\n]*(?:(?:\n```[\s\S]*?```)|(?:\n\s{0,4}[-|][^\n]*)|[^\n]*)/gi;
  for (const match of text.matchAll(commandPattern)) {
    const command = match[1]?.trim() ?? "";
    const full = match[0]?.trim() ?? "";
    if (!command || !full) continue;
    if (isInventoryCommand(command)) continue;
    evidence.push(full);
  }
  return [...new Set(evidence)].sort();
}

function hasSubstantiveNoFindingsEvidence(text: string, projectRoot: string): boolean {
  if (!/\bNo validated findings\b/i.test(text)) return false;
  if (
    !/\b(?:Checked files|Checked commands|Inspection matrix|Commands run|Files inspected|Evidence Register)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return (
    collectExistingLineEvidenceRefs(text, projectRoot).length > 0 &&
    extractAuditSynthesisCommandEvidence(text).length > 0
  );
}

function hasInventoryOnlyNoFindingsEvidence(text: string, projectRoot: string): boolean {
  if (!/\bNo validated findings\b/i.test(text)) return false;
  return (
    collectExistingLineEvidenceRefs(text, projectRoot).length > 0 &&
    extractAuditSynthesisCommandEvidence(text).length === 0
  );
}

function countValidatedFindings(text: string, projectRoot: string): number {
  return splitFindingSections(text).filter((section) => {
    if (!/\bEvidence\s*:/i.test(section)) return false;
    if (!/\bRisk\s*:/i.test(section)) return false;
    if (!/\bProposed fix\s*:/i.test(section)) return false;
    if (!/\bVerification\s*:/i.test(section)) return false;
    if (LOW_QUALITY_SYNTHESIS_PATTERNS.some((pattern) => pattern.test(section))) return false;
    if (collectExistingLineEvidenceRefs(section, projectRoot).length === 0) return false;
    return true;
  }).length;
}

function inconclusive(
  reason: string,
  input: Partial<AuditSynthesisOutcome>,
): AuditSynthesisOutcome {
  return {
    kind: "inconclusive_batch_evidence",
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

  const validatedFindingCount = input.reports.reduce(
    (sum, report) => sum + countValidatedFindings(report.content, input.projectRoot),
    0,
  );
  const substantiveNoFindingsReportCount = input.reports.filter((report) =>
    hasSubstantiveNoFindingsEvidence(report.content, input.projectRoot),
  ).length;
  const inventoryOnlyNoFindingsReportCount = input.reports.filter((report) =>
    hasInventoryOnlyNoFindingsEvidence(report.content, input.projectRoot),
  ).length;
  const base = {
    sourceReportCount: input.reports.length,
    validatedFindingCount,
    substantiveNoFindingsReportCount,
    inventoryOnlyNoFindingsReportCount,
    weakReportCount,
  };

  if (validatedFindingCount > 0) {
    return {
      kind: "validated_findings_present",
      reason: "Validated findings were present in source audit reports.",
      ...base,
    };
  }

  if (weakReportCount > 0) {
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
    if (!AUDIT_SYNTHESIS_OUTCOME_KINDS.includes(parsed.kind as AuditSynthesisOutcomeKind)) {
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

  if (/\bAudit inconclusive\b/i.test(text)) {
    return inconclusive(
      "Audit inconclusive: synthesis artifact declares inconclusive evidence.",
      base,
    );
  }

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

  if (input.sourceOutcome.kind === "inconclusive_batch_evidence") return input.sourceOutcome;
  if (input.visibleOutcome.kind === "inconclusive_batch_evidence") return input.visibleOutcome;
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
