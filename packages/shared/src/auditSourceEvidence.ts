import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const AUDIT_SOURCE_CLASSIFICATIONS = [
  "validated_findings_present",
  "validated_no_findings",
  "inventory_only_invalid",
  "insufficient_substantive_evidence",
  "source_inconclusive",
] as const;

export type AuditSourceClassification = (typeof AUDIT_SOURCE_CLASSIFICATIONS)[number];

export interface AuditCommandEvidence {
  command: string;
  evidence: string;
  inventoryOnly: boolean;
}

export interface AuditSourceEvidenceClassification {
  classification: AuditSourceClassification;
  validatedFindingCount: number;
  existingLineEvidenceRefs: string[];
  commandEvidence: AuditCommandEvidence[];
  substantiveCommandEvidence: AuditCommandEvidence[];
  inventoryCommandEvidence: AuditCommandEvidence[];
}

export interface AuditSourceEvidenceReader {
  fileLineCount(path: string): number | null;
}

const LINE_REF_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z0-9]{1,12}):(\d+)(?:(?::|[-\u2013])(\d+))?(?=$|[\s`'"\]),.;])/gi;

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
  /^\s*get-childitem\b/i,
  /^\s*get-item\b/i,
  /^\s*test\s+-(?:e|f|d|s)\b/i,
  /^\s*test-path\b/i,
  /^\s*\[\s+-(?:e|f|d|s)\b/i,
];

function normalizeRelativePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/[),.;\]]+$/g, "");
}

function normalizePathForComparison(path: string): string {
  const normalized = normalizeRelativePath(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function normalizePath(rawPath: string): string | null {
  const normalized = normalizeRelativePath(rawPath);
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

function fileLineCount(projectRoot: string, path: string): number | null {
  const absPath = resolve(projectRoot, path);
  if (!existsSync(absPath)) return null;
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > 512_000) return null;
    const content = readFileSync(absPath, "utf8");
    if (content.length === 0) return 0;
    return content.split(/\r?\n/).length;
  } catch {
    return null;
  }
}

function splitFindingSections(text: string): string[] {
  return text
    .split(/\n(?=#{2,4}\s+|\s*[-*]\s+(?:finding|issue|risk)\b)/i)
    .map((section) => section.trim())
    .filter((section) => /\b(?:finding|issue)\b/i.test(section));
}

export function isInventoryAuditCommand(command: string): boolean {
  return INVENTORY_COMMAND_PATTERNS.some((pattern) => pattern.test(command.trim()));
}

export function collectExistingAuditLineEvidenceRefs(input: {
  text: string;
  projectRoot: string;
  excludedReferencedPaths?: string[];
  sourceReader?: AuditSourceEvidenceReader;
}): string[] {
  const excludedPaths = new Set(
    (input.excludedReferencedPaths ?? []).map((path) => normalizePathForComparison(path)),
  );
  const refs = new Set<string>();
  for (const match of input.text.matchAll(LINE_REF_PATTERN)) {
    const path = normalizePath(match[1] ?? "");
    const startLine = Number(match[2]);
    const endLine = match[3] ? Number(match[3]) : startLine;
    if (
      !path ||
      excludedPaths.has(normalizePathForComparison(path)) ||
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      startLine <= 0 ||
      endLine < startLine
    ) {
      continue;
    }
    const lineCount = input.sourceReader
      ? input.sourceReader.fileLineCount(path)
      : fileLineCount(input.projectRoot, path);
    if (lineCount === null || endLine > lineCount) continue;
    refs.add(`${path}:${startLine}`);
  }
  return [...refs].sort();
}

export function extractAuditCommandEvidence(text: string): AuditCommandEvidence[] {
  const evidence: AuditCommandEvidence[] = [];
  const seen = new Set<string>();
  const commandPattern =
    /(?:^|\n)\s*-?\s*(?:Verification:\s*)?Command\s+`([^`\r\n]+)`\s+(?:output|returned|matched|included)[^\n]*(?:(?:\n```[\s\S]*?```)|(?:\n\s{0,4}[-|][^\n]*)|[^\n]*)/gi;
  for (const match of text.matchAll(commandPattern)) {
    const command = match[1]?.trim() ?? "";
    const full = match[0]?.trim() ?? "";
    if (!command || !full || seen.has(full)) continue;
    seen.add(full);
    evidence.push({
      command,
      evidence: full,
      inventoryOnly: isInventoryAuditCommand(command),
    });
  }
  return evidence.sort((left, right) => left.evidence.localeCompare(right.evidence));
}

export function extractSubstantiveAuditCommandEvidence(text: string): AuditCommandEvidence[] {
  return extractAuditCommandEvidence(text).filter((entry) => !entry.inventoryOnly);
}

export function countValidatedAuditFindings(input: {
  text: string;
  projectRoot: string;
  excludedReferencedPaths?: string[];
  requireProposedFix?: boolean;
  sourceReader?: AuditSourceEvidenceReader;
}): number {
  return splitFindingSections(input.text).filter((section) => {
    if (!/\bEvidence\s*:/i.test(section)) return false;
    if (!/\bRisk\s*:/i.test(section)) return false;
    if (input.requireProposedFix !== false && !/\bProposed fix\s*:/i.test(section)) return false;
    if (!/\bVerification\s*:/i.test(section)) return false;
    if (LOW_QUALITY_SYNTHESIS_PATTERNS.some((pattern) => pattern.test(section))) return false;
    return (
      collectExistingAuditLineEvidenceRefs({
        text: section,
        projectRoot: input.projectRoot,
        excludedReferencedPaths: input.excludedReferencedPaths,
        sourceReader: input.sourceReader,
      }).length > 0
    );
  }).length;
}

export function classifyAuditSourceEvidence(input: {
  text: string;
  projectRoot: string;
  excludedReferencedPaths?: string[];
  requireProposedFix?: boolean;
  sourceReader?: AuditSourceEvidenceReader;
}): AuditSourceEvidenceClassification {
  const existingLineEvidenceRefs = collectExistingAuditLineEvidenceRefs(input);
  const commandEvidence = extractAuditCommandEvidence(input.text);
  const substantiveCommandEvidence = commandEvidence.filter((entry) => !entry.inventoryOnly);
  const inventoryCommandEvidence = commandEvidence.filter((entry) => entry.inventoryOnly);
  const validatedFindingCount = countValidatedAuditFindings(input);

  let classification: AuditSourceClassification = "insufficient_substantive_evidence";
  if (validatedFindingCount > 0) {
    classification = "validated_findings_present";
  } else if (/\bNo validated findings\b/i.test(input.text)) {
    const hasNoFindingsRegister =
      /\b(?:Checked files|Checked commands|Inspection matrix|Commands run|Files inspected|Evidence Register)\b/i.test(
        input.text,
      );
    if (
      hasNoFindingsRegister &&
      existingLineEvidenceRefs.length > 0 &&
      substantiveCommandEvidence.length > 0
    ) {
      classification = "validated_no_findings";
    } else if (existingLineEvidenceRefs.length > 0) {
      classification = "inventory_only_invalid";
    }
  }

  return {
    classification,
    validatedFindingCount,
    existingLineEvidenceRefs,
    commandEvidence,
    substantiveCommandEvidence,
    inventoryCommandEvidence,
  };
}
