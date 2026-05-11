import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export const AUDIT_REPORT_VALIDATION_ISSUE_CODES = [
  "synthetic_git_output",
  "placeholder_author_metadata",
  "unverified_inspection_claim",
  "future_tense_git_verification",
  "speculative_audit_claim",
  "non_actionable_audit_observation",
  "governance_observation_as_finding",
  "contradictory_findings_and_no_findings",
  "fake_or_placeholder_command_output",
  "false_missing_path_claim",
  "invalid_line_reference",
  "missing_report_file_references",
  "missing_substantive_evidence",
  "missing_declared_scope_root",
  "missing_scope_coverage",
] as const;

export type AuditReportValidationIssueCode = (typeof AUDIT_REPORT_VALIDATION_ISSUE_CODES)[number];

export interface AuditReportValidationIssue {
  code: AuditReportValidationIssueCode;
  message: string;
  paths?: string[];
}

export interface AuditReportValidationInput {
  text: string;
  projectRoot: string;
  taskDescription?: string | null;
  scopeRoots?: string[];
  reportArtifactPaths?: string[];
  allowedEvidenceArtifactPaths?: string[];
  requireProposedFix?: boolean;
}

export interface AuditReportScopeCoverage {
  root: string;
  exists: boolean;
  kind: "file" | "directory" | "missing" | "other";
  requiredEvidenceCount: number;
  coveredFiles: string[];
  missingRepresentativeFiles: string[];
  commandEvidence: boolean;
  ok: boolean;
}

export interface AuditReportValidationResult {
  ok: boolean;
  issues: AuditReportValidationIssue[];
  referencedPaths: string[];
  missingReferencedPaths: string[];
  existingReferencedPaths: string[];
  reportArtifactPaths: string[];
  allowedEvidenceArtifactPaths: string[];
  substantiveEvidence: boolean;
  reportQualityIssues: string[];
  parsedScopeRoots: string[];
  scopeRoots: string[];
  scopeCoverage: AuditReportScopeCoverage[];
}

const LOW_QUALITY_REPORT_PATTERNS: Array<{
  code: AuditReportValidationIssueCode;
  pattern: RegExp;
  message: string;
}> = [
  {
    code: "fake_or_placeholder_command_output",
    pattern: /\b(?:123abc|abc123|1234567890abcdef[0-9a-f]*)\b/i,
    message: "Report artifact contains placeholder commit hashes instead of real command output.",
  },
  {
    code: "synthetic_git_output",
    pattern:
      /(?:^|\n)\s*(?:[0-9]{7,}|[0-9a-f]*0c0c[0-9a-f]*)\s+\(HEAD\s+->\s+[^)]+\)|\b(?:root-commit|Date:\s+Mon May 10 12:34:56 2026|Author:\s+qwen-local-agent\s+<>|Signed-off-by:\s+qwen-local-agent\s+<>|commit\s+[0-9a-f]*0c0c[0-9a-f]*\b)/im,
    message: "Report artifact contains synthetic-looking git verification output.",
  },
  {
    code: "placeholder_author_metadata",
    pattern: /\b(?:Author:\s+Your Name|your\.email@example\.com)\b/i,
    message: "Report artifact contains placeholder author metadata instead of real git output.",
  },
  {
    code: "unverified_inspection_claim",
    pattern:
      /\b(?:too large to (?:be )?(?:read|inspect)|reported as too large|file is too large|bytes\s*>\s*\d+\s*byte limit|could not (?:read|inspect|access)|not visible|would show|should show|expected to show)\b/i,
    message: "Report artifact contains unverified inspection claims instead of observed evidence.",
  },
  {
    code: "future_tense_git_verification",
    pattern:
      /\b(?:will be committed|created and will be committed|has been created and will be committed)\b/i,
    message:
      "Report artifact contains future-tense git verification instead of observed commit output.",
  },
  {
    code: "speculative_audit_claim",
    pattern:
      /\b(?:may contain|likely used|likely indicates|no evidence of sensitive content|confirmed (?:the )?file exists|confirmed .* exists)\b/i,
    message: "Report artifact contains speculative audit claims that are not backed by evidence.",
  },
  {
    code: "non_actionable_audit_observation",
    pattern:
      /\b(?:lacks?\s+multi-user support|limits scalability|auto-generated content may not reflect actual usage|dependencies are defined|specific version constraints may lead to compatibility issues|lack of abstraction could tightly couple|appears to be thorough|hardcoded test data[^.\n]+harder to adapt|bot started successfully|all modules compiled successfully)\b/i,
    message:
      "Report artifact contains non-actionable audit observations instead of concrete technical-quality findings.",
  },
  {
    code: "governance_observation_as_finding",
    pattern:
      /\b(?:overlap in task\/workflow routing|duplication in responsibilities|distributed configuration|configuration in multiple files|centralized configuration management|missing documentation for submodules|lack of ownership clarity for branches|branch naming convention and ownership policy)\b/i,
    message:
      "Report artifact contains governance/documentation observations instead of concrete technical-quality findings.",
  },
];

const SLASH_PATH_TOKEN_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z0-9]{1,12})(?::\d+(?::\d+)?)?/g;
const ROOT_FILE_TOKEN_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.env(?:\.[\w-]+)+)|[\w.-]+\.(?:jsonc|json|jsx|tsx|yaml|yml|mdx|mjs|cjs|bat|cmd|cpp|css|env|hpp|html|ini|java|lock|md|ps1|py|rs|scss|sh|sql|toml|txt|xml|js|ts|go|kt|cs|c|h))(?::\d+(?::\d+)?)?(?=$|[\s`'"\]),.;])/gi;
const DIRECTORY_LINE_REFERENCE_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+\d(?:[\d-]*))(?=$|[\s`'"\]),.;])/g;

function normalizeRelativePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

function normalizePathForComparison(path: string): string {
  const normalized = normalizeRelativePath(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isInsideRoot(projectRoot: string, candidatePath: string): boolean {
  const rel = relative(projectRoot, candidatePath);
  return (
    rel === "" ||
    (!rel.startsWith("..") && !rel.includes(`..${sep}`) && !resolve(rel).startsWith(".."))
  );
}

function issue(
  code: AuditReportValidationIssueCode,
  message: string,
  paths?: string[],
): AuditReportValidationIssue {
  return paths && paths.length > 0 ? { code, message, paths } : { code, message };
}

function formatPathExamples(paths: string[], limit = 8): string {
  const shown = paths.slice(0, limit).map((path) => `\`${path}\``);
  const remaining = paths.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")} and ${remaining} more` : shown.join(", ");
}

function normalizeScopeRoot(path: string): string | null {
  const trimmed = path
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[),.;\]]+$/g, "");
  if (!trimmed || /^[a-z]+:\/\//i.test(trimmed) || trimmed.includes("*")) return null;
  const normalized = normalizeRelativePath(trimmed).replace(/\/+$/g, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("..") ||
    /\s/.test(normalized) ||
    !/[A-Za-z0-9]/.test(normalized) ||
    !/^[\w.@-]+(?:\/[\w.@-]+)*$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

const SCOPE_LINE_BOUNDARY_PATTERN =
  /\b(?:Audit mandate|Allowed changes|Report artifact|Acceptance criteria|Evidence requirements|Quality bar|No-findings rule|Git requirements|Constraint|Verification|Dependencies)\s*:/i;

function collectScopeRootsFromText(scopeText: string, roots: Set<string>): void {
  const boundedText = scopeText.split(SCOPE_LINE_BOUNDARY_PATTERN)[0] ?? "";
  let remainder = boundedText;
  for (const match of boundedText.matchAll(/`([^`\r\n]+)`/g)) {
    const normalized = normalizeScopeRoot(match[1]);
    if (normalized) roots.add(normalized);
    remainder = remainder.replace(match[0], " ");
  }
  for (const token of remainder.split(/[,;]+/)) {
    const normalized = normalizeScopeRoot(token);
    if (normalized) roots.add(normalized);
  }
}

function parseScopeRootsFromTaskDescription(taskDescription: string | null | undefined): string[] {
  if (!taskDescription) return [];
  const roots = new Set<string>();
  let inScopeList = false;
  for (const line of taskDescription.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s*)?Scope\s*:\s*(.*)$/i);
    if (match) {
      collectScopeRootsFromText(match[1], roots);
      inScopeList = match[1].trim().length === 0;
      continue;
    }
    if (!inScopeList) continue;
    if (/^\s*$/.test(line)) continue;
    if (/^\s*(?:[-*]\s*)?[A-Za-z][A-Za-z -]{1,40}\s*:/i.test(line)) {
      inScopeList = false;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      collectScopeRootsFromText(line, roots);
      continue;
    }
    inScopeList = false;
  }
  return [...roots].sort();
}

function resolveScopeRoots(input: AuditReportValidationInput): {
  parsedScopeRoots: string[];
  scopeRoots: string[];
} {
  const parsedScopeRoots = parseScopeRootsFromTaskDescription(input.taskDescription);
  const explicitScopeRoots = (input.scopeRoots ?? []).flatMap((root) => {
    const normalized = normalizeScopeRoot(root);
    return normalized ? [normalized] : [];
  });
  const scopeRoots = [...new Set([...parsedScopeRoots, ...explicitScopeRoots])].sort();
  return { parsedScopeRoots, scopeRoots };
}

function addReferencedPath(
  refs: Set<string>,
  projectRoot: string,
  rawPath?: string,
): string | null {
  const raw = rawPath?.trim();
  if (!raw || /^[a-z]+:\/\//i.test(raw)) return null;
  const normalized = normalizeRelativePath(raw.replace(/[),.;\]]+$/g, ""));
  if (!normalized || normalized.startsWith("node_modules/")) return null;
  const absPath = resolve(projectRoot, normalized);
  if (!isInsideRoot(projectRoot, absPath)) return null;
  refs.add(normalized);
  return normalized;
}

function isDelimitedReference(text: string, match: RegExpMatchArray, rawPath: string): boolean {
  const matchStart = match.index ?? 0;
  const rawStart = text.indexOf(rawPath, matchStart);
  if (rawStart <= 0) return false;
  return /[`'"\[(]/.test(text[rawStart - 1] ?? "");
}

function isInReferenceSentence(text: string, match: RegExpMatchArray): boolean {
  const index = match.index ?? 0;
  const sentenceStart = Math.max(0, text.lastIndexOf("\n", index) + 1, index - 120);
  const nextNewline = text.indexOf("\n", index);
  const sentenceEnd = nextNewline >= 0 ? nextNewline : Math.min(text.length, index + 120);
  return /\b(cite|cites|cited|reference|references|referenced|path|paths|file|files|see|inspect|finding|findings|checked)\b/i.test(
    text.slice(sentenceStart, sentenceEnd),
  );
}

function extractReferencedPaths(text: string, projectRoot: string): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(SLASH_PATH_TOKEN_PATTERN)) {
    addReferencedPath(refs, projectRoot, match[1]?.trim());
  }
  for (const match of text.matchAll(ROOT_FILE_TOKEN_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw || raw.includes("/") || raw.includes("\\")) continue;
    const normalized = normalizeRelativePath(raw.replace(/[),.;\]]+$/g, ""));
    const absPath = resolve(projectRoot, normalized);
    if (
      !existsSync(absPath) &&
      !isDelimitedReference(text, match, raw) &&
      !isInReferenceSentence(text, match)
    ) {
      continue;
    }
    addReferencedPath(refs, projectRoot, raw);
  }
  for (const match of text.matchAll(DIRECTORY_LINE_REFERENCE_PATTERN)) {
    addReferencedPath(refs, projectRoot, match[1]?.trim());
  }
  return [...refs].sort();
}

function classifyReferencedPaths(
  projectRoot: string,
  refs: string[],
  allowedEvidenceArtifactPaths: Set<string>,
): { existing: string[]; missing: string[] } {
  const existing: string[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    if (allowedEvidenceArtifactPaths.has(normalizePathForComparison(ref))) {
      existing.push(ref);
      continue;
    }
    const absPath = resolve(projectRoot, ref);
    if (existsSync(absPath)) {
      existing.push(ref);
    } else {
      missing.push(ref);
    }
  }
  return { existing, missing };
}

interface LineReference {
  start: number;
  end: number;
}

function extractLineReference(fullToken: string): LineReference | null {
  const match = fullToken.match(/:(\d+)(?::(\d+))?\b/);
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

function fileLineCount(projectRoot: string, path: string): number | null {
  const absPath = resolve(projectRoot, path);
  if (!isInsideRoot(projectRoot, absPath) || !existsSync(absPath)) return null;
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

function hasInvalidExistingLineReference(
  text: string,
  projectRoot: string,
  excludedPaths: Set<string>,
): boolean {
  const patterns = [SLASH_PATH_TOKEN_PATTERN, ROOT_FILE_TOKEN_PATTERN];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      const reference = extractLineReference(match[0] ?? "");
      if (!reference) continue;
      const normalized = normalizeRelativePath(raw);
      if (excludedPaths.has(normalizePathForComparison(normalized))) continue;
      const lineCount = fileLineCount(projectRoot, normalized);
      if (
        lineCount !== null &&
        (reference.start < 1 || reference.end < reference.start || reference.end > lineCount)
      ) {
        return true;
      }
    }
  }
  return false;
}

function collectExistingRefsWithLineNumbers(
  text: string,
  projectRoot: string,
  excludedPaths: Set<string>,
): string[] {
  const refs = new Set<string>();
  const patterns = [SLASH_PATH_TOKEN_PATTERN, ROOT_FILE_TOKEN_PATTERN];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      const reference = extractLineReference(match[0] ?? "");
      if (!reference) continue;
      const normalized = normalizeRelativePath(raw);
      if (excludedPaths.has(normalizePathForComparison(normalized))) continue;
      const lineCount = fileLineCount(projectRoot, normalized);
      if (
        lineCount !== null &&
        reference.start >= 1 &&
        reference.end >= reference.start &&
        reference.end <= lineCount
      ) {
        refs.add(normalized);
      }
    }
  }
  return [...refs].sort();
}

const IGNORED_SCOPE_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

function isSameRepositoryPath(left: string, right: string): boolean {
  return normalizePathForComparison(left) === normalizePathForComparison(right);
}

function isPathUnderDirectory(path: string, directory: string): boolean {
  const normalizedPath = normalizePathForComparison(path);
  const normalizedDirectory = normalizePathForComparison(directory).replace(/\/+$/g, "");
  return (
    normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`)
  );
}

function collectRepresentativeFilesUnderDirectory(
  projectRoot: string,
  directory: string,
  limit = 1_000,
): string[] {
  const files: string[] = [];
  const rootDirectory = resolve(projectRoot, directory);
  const visit = (absoluteDirectory: string): void => {
    if (files.length >= limit) return;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limit) return;
      const absolutePath = resolve(absoluteDirectory, entry.name);
      if (!isInsideRoot(projectRoot, absolutePath)) continue;
      if (entry.isDirectory()) {
        if (IGNORED_SCOPE_DIRECTORY_NAMES.has(entry.name)) continue;
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(normalizeRelativePath(relative(projectRoot, absolutePath)));
      }
    }
  };
  if (isInsideRoot(projectRoot, rootDirectory)) visit(rootDirectory);
  return files.sort();
}

function hasCommandEvidenceForScopeRoot(text: string, scopeRoot: string): boolean {
  const escapedRoot = scopeRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const commandNames =
    "npm|pnpm|yarn|rg|grep|cat|ls|sed|head|tail|find|wc|git|vitest|jest|tsc|eslint|node|curl|read_file|list_files|search_files";
  const commandLinePattern = new RegExp(
    `(?:\\b(?:command|cmd|shell|powershell|pwsh)\\s*:?|\\b(?:${commandNames})\\b)[^\\n]*\\b${escapedRoot}\\b[^\\n]*(?:\\b(?:exit code|output|stdout|stderr|passed|failed|matched|returned|included|error)\\b|$)`,
    "i",
  );
  const toolLinePattern = new RegExp(`\\bTool:\\s*\\S+[^\\n]*\\b${escapedRoot}\\b`, "i");
  return commandLinePattern.test(text) || toolLinePattern.test(text);
}

function collectScopeCoverage(input: {
  text: string;
  projectRoot: string;
  scopeRoots: string[];
  excludedPaths: Set<string>;
}): AuditReportScopeCoverage[] {
  const lineEvidenceFiles = collectExistingRefsWithLineNumbers(
    input.text,
    input.projectRoot,
    input.excludedPaths,
  );

  return input.scopeRoots.map((root) => {
    const absPath = resolve(input.projectRoot, root);
    if (!isInsideRoot(input.projectRoot, absPath) || !existsSync(absPath)) {
      return {
        root,
        exists: false,
        kind: "missing",
        requiredEvidenceCount: 0,
        coveredFiles: [],
        missingRepresentativeFiles: [],
        commandEvidence: false,
        ok: false,
      };
    }

    const stat = statSync(absPath);
    if (stat.isFile()) {
      const coveredFiles = lineEvidenceFiles.filter((path) => isSameRepositoryPath(path, root));
      return {
        root,
        exists: true,
        kind: "file",
        requiredEvidenceCount: 1,
        coveredFiles,
        missingRepresentativeFiles: coveredFiles.length > 0 ? [] : [root],
        commandEvidence: true,
        ok: coveredFiles.length > 0,
      };
    }

    if (!stat.isDirectory()) {
      return {
        root,
        exists: true,
        kind: "other",
        requiredEvidenceCount: 0,
        coveredFiles: [],
        missingRepresentativeFiles: [],
        commandEvidence: false,
        ok: false,
      };
    }

    const representativeFiles = collectRepresentativeFilesUnderDirectory(input.projectRoot, root);
    const requiredEvidenceCount =
      representativeFiles.length === 0 ? 0 : Math.min(3, representativeFiles.length);
    const coveredFiles = lineEvidenceFiles.filter((path) => isPathUnderDirectory(path, root));
    const commandEvidence = hasCommandEvidenceForScopeRoot(input.text, root);
    const missingRepresentativeFiles = representativeFiles
      .filter((path) => !coveredFiles.some((covered) => isSameRepositoryPath(covered, path)))
      .slice(0, Math.max(0, requiredEvidenceCount - coveredFiles.length));
    return {
      root,
      exists: true,
      kind: "directory",
      requiredEvidenceCount,
      coveredFiles,
      missingRepresentativeFiles,
      commandEvidence,
      ok: coveredFiles.length >= requiredEvidenceCount && commandEvidence,
    };
  });
}

function hasCommandOutputEvidence(text: string): boolean {
  const commandNames =
    "npm|pnpm|yarn|rg|grep|cat|ls|sed|head|tail|find|wc|git|vitest|jest|tsc|eslint|node|curl|read_file|list_files|search_files";
  const outputWords =
    "exit code|output|stdout|stderr|passed|failed|matched|returned|included|error";
  return new RegExp(
    `(?:\\b(?:command|cmd|shell|powershell|pwsh)\\s*:?[^\\n]{0,160}\\b(?:${commandNames})\\b[^\\n]{0,160}\\b(?:${outputWords})\\b|\\b(?:${commandNames})\\b[^\\n]{0,160}\\b(?:${outputWords})\\b)`,
    "i",
  ).test(text);
}

function hasContradictoryFindings(text: string): boolean {
  if (!/\bNo validated findings\b/i.test(text)) return false;
  return (
    /(?:^|\n)\s*(?:#{2,4}\s+)?(?:Finding|Findings|Issue|Issues)\b/i.test(text) ||
    /\b(?:Risk|Proposed fix)\s*:/i.test(text)
  );
}

function hasValidatedNoFindingsEvidence(
  text: string,
  projectRoot: string,
  excludedPaths: Set<string>,
): boolean {
  if (!/\bNo validated findings\b/i.test(text)) return false;
  if (
    !/\b(?:Checked files|Checked commands|Inspection matrix|Commands run|Files inspected)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return (
    collectExistingRefsWithLineNumbers(text, projectRoot, excludedPaths).length > 0 &&
    hasCommandOutputEvidence(text)
  );
}

function hasStructuredFindingEvidence(
  text: string,
  projectRoot: string,
  excludedPaths: Set<string>,
  allowedArtifactPaths: string[],
  requireProposedFix: boolean,
): boolean {
  const findingSections = text.split(/(?:^|\n)#{2,4}\s+|\n(?=-\s+(?:finding|issue|risk)\b)/i);
  return findingSections.some((section) => {
    if (!/\bEvidence\s*:/i.test(section)) return false;
    if (!/\bRisk\s*:/i.test(section)) return false;
    if (requireProposedFix && !/\bProposed fix\s*:/i.test(section)) return false;
    if (!/\bVerification\s*:/i.test(section)) return false;
    const hasAllowedArtifact = allowedArtifactPaths.some((artifactPath) => {
      const escaped = artifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped, "i").test(section);
    });
    return (
      (collectExistingRefsWithLineNumbers(section, projectRoot, excludedPaths).length > 0 ||
        hasAllowedArtifact) &&
      hasCommandOutputEvidence(section)
    );
  });
}

function hasSubstantiveReportEvidenceInternal(input: {
  text: string;
  projectRoot: string;
  excludedReferencedPaths?: string[];
  allowedEvidenceArtifactPaths?: string[];
  requireProposedFix?: boolean;
}): boolean {
  const excludedPaths = new Set(
    (input.excludedReferencedPaths ?? []).map((path) => normalizePathForComparison(path)),
  );
  if (hasInvalidExistingLineReference(input.text, input.projectRoot, excludedPaths)) return false;
  if (hasContradictoryFindings(input.text)) return false;
  if (hasValidatedNoFindingsEvidence(input.text, input.projectRoot, excludedPaths)) return true;
  return hasStructuredFindingEvidence(
    input.text,
    input.projectRoot,
    excludedPaths,
    input.allowedEvidenceArtifactPaths ?? [],
    input.requireProposedFix ?? false,
  );
}

export function hasSubstantiveReportEvidence(input: {
  text: string;
  projectRoot: string;
  excludedReferencedPaths?: string[];
  allowedEvidenceArtifactPaths?: string[];
  requireProposedFix?: boolean;
}): boolean {
  return hasSubstantiveReportEvidenceInternal(input);
}

function collectFalseMissingPathClaims(text: string, projectRoot: string): string[] {
  const claimedMissingPaths = new Set<string>();
  const patterns = [
    /`([^`\r\n]+)`\s+(?:directory\s+|file\s+)?does not exist/gi,
    /(?:directory|file)\s+`([^`\r\n]+)`\s+does not exist/gi,
    /(?:ls|dir):\s+cannot access ['"`]?([^'"`\s\r\n]+)['"`]?:\s+No such file or directory/gi,
    /cannot find path ['"`]?([^'"`\s\r\n]+)['"`]?/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const rawPath = match[1]?.trim();
      if (!rawPath || rawPath.includes("*")) continue;
      const normalized = normalizeRelativePath(rawPath);
      const absPath = resolve(projectRoot, normalized);
      if (isInsideRoot(projectRoot, absPath) && existsSync(absPath)) {
        claimedMissingPaths.add(normalized);
      }
    }
  }

  return [...claimedMissingPaths].sort();
}

export function validateAuditReportArtifact(
  input: AuditReportValidationInput,
): AuditReportValidationResult {
  const text = input.text;
  const { parsedScopeRoots, scopeRoots } = resolveScopeRoots(input);
  const reportArtifactPaths = [
    ...new Set((input.reportArtifactPaths ?? []).map(normalizeRelativePath)),
  ].sort();
  const allowedEvidenceArtifactPaths = [
    ...new Set((input.allowedEvidenceArtifactPaths ?? []).map(normalizeRelativePath)),
  ].sort();
  const excludedPaths = new Set(reportArtifactPaths.map(normalizePathForComparison));
  const allowedPathSet = new Set(allowedEvidenceArtifactPaths.map(normalizePathForComparison));
  const referencedPaths = extractReferencedPaths(text, input.projectRoot);
  const { existing, missing } = classifyReferencedPaths(
    input.projectRoot,
    referencedPaths,
    allowedPathSet,
  );
  const scopeCoverage = collectScopeCoverage({
    text,
    projectRoot: input.projectRoot,
    scopeRoots,
    excludedPaths,
  });
  const issues: AuditReportValidationIssue[] = [];

  if (text.trim()) {
    for (const { code, pattern, message } of LOW_QUALITY_REPORT_PATTERNS) {
      if (pattern.test(text)) issues.push(issue(code, message));
    }
  }

  const falseMissingPaths = collectFalseMissingPathClaims(text, input.projectRoot);
  if (falseMissingPaths.length > 0) {
    issues.push(
      issue(
        "false_missing_path_claim",
        `Report artifact claims existing paths are missing: ${formatPathExamples(falseMissingPaths)}.`,
        falseMissingPaths,
      ),
    );
  }

  if (hasContradictoryFindings(text)) {
    issues.push(
      issue(
        "contradictory_findings_and_no_findings",
        "Report artifact mixes validated findings with a No Validated Findings claim.",
      ),
    );
  }

  if (hasInvalidExistingLineReference(text, input.projectRoot, excludedPaths)) {
    issues.push(
      issue(
        "invalid_line_reference",
        "Report artifact cites an existing path with a line reference outside the file.",
      ),
    );
  }

  if (text.trim() && referencedPaths.length === 0) {
    issues.push(
      issue(
        "missing_report_file_references",
        "Report artifact does not cite any repository file references to validate.",
      ),
    );
  }

  if (missing.length > 0) {
    issues.push(
      issue(
        "missing_report_file_references",
        `Report artifact contains repository path references that do not resolve under the project root: ${formatPathExamples(missing)}.`,
        missing,
      ),
    );
  }

  const missingScopeRoots = scopeCoverage
    .filter((entry) => !entry.exists)
    .map((entry) => entry.root);
  if (missingScopeRoots.length > 0) {
    issues.push(
      issue(
        "missing_declared_scope_root",
        `Task declares scope roots that do not resolve under the project root: ${formatPathExamples(missingScopeRoots)}. Correct the Scope line or inspect existing repository paths.`,
        missingScopeRoots,
      ),
    );
  }

  const uncoveredScopeRoots = scopeCoverage
    .filter((entry) => entry.exists && !entry.ok)
    .map((entry) => entry.root);
  if (uncoveredScopeRoots.length > 0) {
    const details = scopeCoverage
      .filter((entry) => entry.exists && !entry.ok)
      .map((entry) => {
        if (entry.kind === "file") {
          return `${entry.root} needs an existing \`path:line\` citation to that exact file`;
        }
        if (entry.kind === "directory") {
          const needsFiles =
            entry.coveredFiles.length < entry.requiredEvidenceCount
              ? `at least ${entry.requiredEvidenceCount} representative existing file citation(s) under the directory`
              : null;
          const needsCommand = entry.commandEvidence
            ? null
            : "command/tool evidence that names the directory";
          return [entry.root, "needs", needsFiles, needsCommand].filter(Boolean).join(" ");
        }
        return `${entry.root} is not a regular file or directory that can be covered by audit evidence`;
      });
    issues.push(
      issue(
        "missing_scope_coverage",
        `Report artifact does not cover declared audit scope roots. ${details.join("; ")}.`,
        uncoveredScopeRoots,
      ),
    );
  }

  const substantiveEvidence =
    missing.length === 0 &&
    hasSubstantiveReportEvidenceInternal({
      text,
      projectRoot: input.projectRoot,
      excludedReferencedPaths: reportArtifactPaths,
      allowedEvidenceArtifactPaths,
      requireProposedFix: input.requireProposedFix,
    });

  if (text.trim() && missing.length === 0 && referencedPaths.length > 0 && !substantiveEvidence) {
    issues.push(
      issue(
        "missing_substantive_evidence",
        "Report artifact lacks substantive evidence markers such as path+line references, command output, or structured findings with evidence/risk/verification.",
      ),
    );
  }

  const reportQualityIssues = issues
    .filter(
      (entry) =>
        ![
          "missing_report_file_references",
          "missing_substantive_evidence",
          "invalid_line_reference",
          "missing_declared_scope_root",
          "missing_scope_coverage",
        ].includes(entry.code),
    )
    .map((entry) => entry.message)
    .sort();

  return {
    ok: issues.length === 0,
    issues,
    referencedPaths,
    missingReferencedPaths: missing,
    existingReferencedPaths: existing,
    reportArtifactPaths,
    allowedEvidenceArtifactPaths,
    substantiveEvidence,
    reportQualityIssues,
    parsedScopeRoots,
    scopeRoots,
    scopeCoverage,
  };
}

export function formatAuditReportValidationIssues(issues: AuditReportValidationIssue[]): string {
  return issues.map((entry) => `${entry.code}: ${entry.message}`).join(" ");
}
