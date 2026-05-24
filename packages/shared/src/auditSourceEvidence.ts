import { createHash } from "node:crypto";
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

export const AUDIT_PUBLIC_REPORT_OUTCOMES = [
  "validated_findings_present",
  "validated_no_findings",
  "source_inconclusive",
] as const;

export type AuditPublicReportOutcome = (typeof AUDIT_PUBLIC_REPORT_OUTCOMES)[number];

export function isAuditPublicReportOutcome(value: unknown): value is AuditPublicReportOutcome {
  return (
    typeof value === "string" &&
    AUDIT_PUBLIC_REPORT_OUTCOMES.includes(value as AuditPublicReportOutcome)
  );
}

export function toAuditPublicReportOutcome(
  classification: AuditSourceClassification,
): AuditPublicReportOutcome {
  if (
    classification === "validated_findings_present" ||
    classification === "validated_no_findings"
  ) {
    return classification;
  }
  return "source_inconclusive";
}

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
  fileLine?(path: string, line: number): string | null;
}

const LINE_REF_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z0-9]{1,12}):(\d+)(?:(?::|[-\u2013])(\d+))?(?=$|[\s`'"\]),.;])/gi;

function normalizeLineReferenceEnd(input: {
  fullToken: string;
  startLine: number;
  rawEndLine: number | null;
}): number {
  if (input.rawEndLine == null) return input.startLine;
  if (input.rawEndLine < input.startLine && /:\d+:\d+\b/.test(input.fullToken)) {
    return input.startLine;
  }
  return input.rawEndLine;
}

const LOW_QUALITY_SYNTHESIS_PATTERNS = [
  /(?:\b(?:123abc|abc123|1234567890abcdef|deadbeef|cafebabe)\b[^\n]{0,80}\b(?:placeholder|fake|commit|hash)\b|\b(?:commit|hash|sha|git\s+(?:log|show|rev-parse))\b[^\n]{0,80}\b(?:123abc|abc123|1234567890abcdef|deadbeef|cafebabe)\b|^\s*(?:123abc|abc123|1234567890abcdef|deadbeef|cafebabe)(?:\s+\(|\s+[A-Z])[^\n]*)/im,
  /\b(?:root-commit|Date:\s+Mon May 10 12:34:56 2026|Author:\s+qwen-local-agent\s+<>|Signed-off-by:\s+qwen-local-agent\s+<>|commit\s+[0-9a-f]*0c0c[0-9a-f]*\b)/i,
  /\b(?:too large to (?:be )?(?:read|inspect)|reported as too large|file is too large|could not (?:read|inspect|access)|would show|should show|expected to show)\b/i,
  /\b(?:may contain|likely used|likely indicates|confirmed (?:the )?file exists|confirmed .* exists)\b/i,
];

const TEMPLATE_NO_FINDINGS_PATTERNS = [
  /\bprevious candidate findings did not meet the audit finding contract\b/i,
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
const EMPTY_GIT_BLOB_HASHES = new Set([
  createHash("sha1").update("blob 0\0").digest("hex"),
  createHash("sha256").update("blob 0\0").digest("hex"),
]);

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function commandReferencesPath(command: string, path: string): boolean {
  const normalizedCommand = command.replaceAll("\\", "/");
  const escapedPath = escapeRegExp(path);
  return new RegExp(`(?:^|\\s|["'\`])(?:\\./)?${escapedPath}(?=$|\\s|["'\`])`, "i").test(
    normalizedCommand,
  );
}

function hasEmptyHashObjectProof(entry: AuditCommandEvidence, path: string): boolean {
  if (!/^\s*git\s+hash-object\b/i.test(entry.command)) return false;
  if (!commandReferencesPath(entry.command, path)) return false;
  return [...EMPTY_GIT_BLOB_HASHES].some((hash) =>
    new RegExp(`\\b${hash}\\b`, "i").test(entry.evidence),
  );
}

function hasEmptyWcProof(entry: AuditCommandEvidence, path: string): boolean {
  if (!/^\s*wc\s+-c\b/i.test(entry.command)) return false;
  if (!commandReferencesPath(entry.command, path)) return false;
  const escapedPath = escapeRegExp(path);
  const normalizedEvidence = entry.evidence.replaceAll("\\", "/");
  return (
    new RegExp(`(?:^|\\n)\\s*0\\s+(?:\\./)?${escapedPath}(?=\\s|$)`, "i").test(
      normalizedEvidence,
    ) ||
    (/^\s*wc\s+-c\s+(?:--\s+)?(?:"[^"]+"|'[^']+'|\S+)\s*$/i.test(entry.command) &&
      /(?:^|\n)\s*0\s*(?:\n|$)/.test(normalizedEvidence))
  );
}

function hasEmptyFileCommandProof(evidence: AuditCommandEvidence[], path: string): boolean {
  return evidence.some(
    (entry) => hasEmptyHashObjectProof(entry, path) || hasEmptyWcProof(entry, path),
  );
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

function fileLine(projectRoot: string, path: string, line: number): string | null {
  if (line < 1) return null;
  const absPath = resolve(projectRoot, path);
  if (!existsSync(absPath)) return null;
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > 512_000) return null;
    return readFileSync(absPath, "utf8").split(/\r?\n/)[line - 1] ?? null;
  } catch {
    return null;
  }
}

export function isConservativeMetadataOnlyLineOne(input: {
  path: string;
  line: number;
  text: string | null;
}): boolean {
  if (input.line !== 1 || input.text == null) return false;
  const trimmed = input.text.trim();
  if (!trimmed) return true;
  if (/\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|cs|c|cpp|h|hpp)$/i.test(input.path)) {
    return /^(?:\/\/|\/\*|\*|#(?!\s*(?:!|include\b|define\b))|<!--)/.test(trimmed);
  }
  if (/^(?:---|\+\+\+|#\s+|<!--|\/\/|\/\*|\*)/.test(trimmed)) return true;
  if (/^[{[]$/.test(trimmed)) return true;
  return false;
}

export function isLowSignalAuditEvidenceLine(input: {
  path: string;
  line: number;
  text: string | null;
}): boolean {
  if (input.text == null) return true;
  const trimmed = input.text.trim();
  if (!trimmed) return true;
  if (isConservativeMetadataOnlyLineOne(input)) return true;
  if (/^(?:\/\/|\/\*|\*\/?|\*|<!--|-->)/.test(trimmed)) return true;
  if (/^#(?!\s*(?:!|include\b|define\b))/.test(trimmed)) return true;
  if (/^(?:#{1,6}\s+|```|~~~)/.test(trimmed)) return true;
  if (/^[{}()[\],;]+$/.test(trimmed)) return true;

  if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(input.path)) {
    if (/^import(?:\s+type)?\s+/i.test(trimmed)) return true;
    if (/^export\s+(?:type\s+)?(?:\{[^}]*\}|[A-Za-z0-9_$]+\s+from)\s+from\s+/i.test(trimmed)) {
      return true;
    }
    if (/^(?:const|let|var)\s+\w+\s*=\s*require\(/i.test(trimmed)) return true;
  }

  if (/\.py$/i.test(input.path)) {
    if (/^(?:from\s+[\w.]+\s+import\s+|import\s+[\w., ]+)/i.test(trimmed)) return true;
    if (/^if\s+__name__\s*==\s*["']__main__["']\s*:/i.test(trimmed)) return true;
    if (/^(?:raise\s+SystemExit|sys\.exit)\s*\(/i.test(trimmed)) return true;
    if (/^(?:[rubf]{0,4})?["']{3}/i.test(trimmed)) return true;
    if (/^__(?:all|version)__\s*=/i.test(trimmed)) return true;
    if (/^pass$/i.test(trimmed)) return true;
  }

  if (/\.(?:java|kt|scala)$/i.test(input.path)) {
    if (/^(?:package|import)\s+[\w.*]+;?$/i.test(trimmed)) return true;
  }

  if (/\.go$/i.test(input.path)) {
    if (/^package\s+\w+$/i.test(trimmed)) return true;
    if (/^import\s+(?:\(|"[^"]+")$/i.test(trimmed)) return true;
  }

  if (/\.rs$/i.test(input.path)) {
    if (/^(?:use|mod)\s+[\w:]+(?:\s+as\s+\w+)?;?$/i.test(trimmed)) return true;
  }

  if (/\.(?:c|cc|cpp|h|hpp)$/i.test(input.path) && /^#\s*(?:include|define)\b/i.test(trimmed)) {
    return true;
  }

  return false;
}

export function hasScopedNoFindingsRiskClaim(text: string): boolean {
  if (!/\bNo validated findings\b/i.test(text)) return false;
  const scopedPathToken =
    "`(?:\\.{1,2}/)?(?:[\\w.@-]+/)*[\\w.@-]+(?:\\.[A-Za-z0-9]{1,12})?(?::\\d+(?:(?::|[-\\u2013])\\d+)?)?`";
  if (
    new RegExp(
      `\\bRisk hypotheses?\\s*:[^\\n]*\\brisk-[a-z0-9][a-z0-9-]*\\b[^\\n]*${scopedPathToken}`,
      "i",
    ).test(text)
  ) {
    return true;
  }
  if (/"riskHypotheses"\s*:\s*\[[\s\S]{0,800}\brisk-[a-z0-9][a-z0-9-]*\b/i.test(text)) {
    return true;
  }
  if (new RegExp(`\\babsence\\s+reasoning\\s*:[^\\n]*${scopedPathToken}`, "i").test(text)) {
    return true;
  }
  return new RegExp(
    `\\b(?:Scoped\\s+)?(?:(?:no-findings|no findings|absence)\\s+claim|absence\\s+reasoning)\\s*:[^\\n]*${scopedPathToken}[^\\n]*(?:\\b(?:covered|absent|ruled out|not present|no findings?)\\b)`,
    "i",
  ).test(text);
}

function splitFindingSections(text: string): string[] {
  return text
    .split(/\n(?=#{2,4}\s+|\s*[-*]\s+(?:finding|issue|risk)\b)/i)
    .map((section) => section.trim())
    .filter((section) => /\b(?:finding|issue)\b/i.test(section));
}

function isGenericAuditSearchCommand(command: string): boolean {
  const normalized = command
    .trim()
    .replace(/[`\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!/^(?:git\s+grep|rg|grep)\b/.test(normalized)) return false;
  return /(?:^|\s)["']?(?:\.|\.\*|\.\+)["']?(?:\s|$)/.test(normalized);
}

export function isInventoryAuditCommand(command: string): boolean {
  return (
    INVENTORY_COMMAND_PATTERNS.some((pattern) => pattern.test(command.trim())) ||
    isGenericAuditSearchCommand(command)
  );
}

export function collectExistingAuditLineEvidenceRefs(input: {
  text: string;
  projectRoot: string;
  excludedReferencedPaths?: string[];
  excludeMetadataOnlyLineOne?: boolean;
  sourceReader?: AuditSourceEvidenceReader;
}): string[] {
  const excludedPaths = new Set(
    (input.excludedReferencedPaths ?? []).map((path) => normalizePathForComparison(path)),
  );
  const refs = new Set<string>();
  for (const match of input.text.matchAll(LINE_REF_PATTERN)) {
    const path = normalizePath(match[1] ?? "");
    const startLine = Number(match[2]);
    const rawEndLine = match[3] ? Number(match[3]) : null;
    const endLine = normalizeLineReferenceEnd({
      fullToken: match[0] ?? "",
      startLine,
      rawEndLine,
    });
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
    if (input.excludeMetadataOnlyLineOne) {
      const lineText = input.sourceReader?.fileLine
        ? input.sourceReader.fileLine(path, startLine)
        : fileLine(input.projectRoot, path, startLine);
      if (isLowSignalAuditEvidenceLine({ path, line: startLine, text: lineText })) {
        continue;
      }
    }
    refs.add(`${path}:${startLine}`);
  }
  return [...refs].sort();
}

export function collectExistingEmptyAuditFileEvidenceRefs(input: {
  text: string;
  projectRoot: string;
  excludedReferencedPaths?: string[];
  sourceReader?: AuditSourceEvidenceReader;
}): string[] {
  const excludedPaths = new Set(
    (input.excludedReferencedPaths ?? []).map((path) => normalizePathForComparison(path)),
  );
  const refs = new Set<string>();
  const commandEvidence = extractAuditCommandEvidence(input.text);
  const pathPattern = /`((?:\.{1,2}\/)?(?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z0-9]{1,12})`/g;
  for (const match of input.text.matchAll(pathPattern)) {
    const path = normalizePath(match[1] ?? "");
    if (!path || excludedPaths.has(normalizePathForComparison(path))) continue;
    const lineCount = input.sourceReader
      ? input.sourceReader.fileLineCount(path)
      : fileLineCount(input.projectRoot, path);
    if (lineCount === 0 && hasEmptyFileCommandProof(commandEvidence, path)) refs.add(path);
  }
  return [...refs].sort();
}

export function hasEmptyFileInspectionEvidence(input: {
  text: string;
  path: string;
  projectRoot: string;
  sourceReader?: AuditSourceEvidenceReader;
}): boolean {
  const path = normalizePath(input.path);
  if (!path) return false;
  const lineCount = input.sourceReader
    ? input.sourceReader.fileLineCount(path)
    : fileLineCount(input.projectRoot, path);
  if (lineCount !== 0) return false;
  return hasEmptyFileCommandProof(extractAuditCommandEvidence(input.text), path);
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
        excludeMetadataOnlyLineOne: true,
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
  const substantiveLineEvidenceRefs = collectExistingAuditLineEvidenceRefs({
    ...input,
    excludeMetadataOnlyLineOne: true,
  });
  const emptyFileEvidenceRefs = collectExistingEmptyAuditFileEvidenceRefs(input);
  const commandEvidence = extractAuditCommandEvidence(input.text);
  const substantiveCommandEvidence = commandEvidence.filter((entry) => !entry.inventoryOnly);
  const inventoryCommandEvidence = commandEvidence.filter((entry) => entry.inventoryOnly);
  const validatedFindingCount = countValidatedAuditFindings(input);

  let classification: AuditSourceClassification = "insufficient_substantive_evidence";
  if (validatedFindingCount > 0) {
    classification = "validated_findings_present";
  } else if (/\bNo validated findings\b/i.test(input.text)) {
    const hasTemplateNoFindingsClaim = TEMPLATE_NO_FINDINGS_PATTERNS.some((pattern) =>
      pattern.test(input.text),
    );
    const hasNoFindingsRegister =
      /\b(?:Checked files|Checked commands|Inspection matrix|Commands run|Files inspected|Evidence Register)\b/i.test(
        input.text,
      );
    if (
      !hasTemplateNoFindingsClaim &&
      hasNoFindingsRegister &&
      hasScopedNoFindingsRiskClaim(input.text) &&
      (substantiveLineEvidenceRefs.length > 0 || emptyFileEvidenceRefs.length > 0) &&
      substantiveCommandEvidence.length > 0
    ) {
      classification = "validated_no_findings";
    } else if (existingLineEvidenceRefs.length > 0 || emptyFileEvidenceRefs.length > 0) {
      classification = "inventory_only_invalid";
    }
  }

  return {
    classification,
    validatedFindingCount,
    existingLineEvidenceRefs: [...existingLineEvidenceRefs, ...emptyFileEvidenceRefs].sort(),
    commandEvidence,
    substantiveCommandEvidence,
    inventoryCommandEvidence,
  };
}
