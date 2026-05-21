import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  classifyAuditSourceEvidence,
  extractAuditCommandEvidence,
  extractSubstantiveAuditCommandEvidence,
  hasScopedNoFindingsRiskClaim,
  hasEmptyFileInspectionEvidence,
  isLowSignalAuditEvidenceLine,
  isAuditPublicReportOutcome,
  toAuditPublicReportOutcome,
  type AuditPublicReportOutcome,
  type AuditSourceClassification,
} from "./auditSourceEvidence.js";
import type { AuditEvidenceUnit } from "./auditEvidenceLedger.js";

export const AUDIT_REPORT_VALIDATION_ISSUE_CODES = [
  "synthetic_git_output",
  "placeholder_author_metadata",
  "unverified_inspection_claim",
  "future_tense_git_verification",
  "speculative_audit_claim",
  "non_actionable_audit_observation",
  "governance_observation_as_finding",
  "malformed_report_artifact",
  "contradictory_findings_and_no_findings",
  "fake_or_placeholder_command_output",
  "deterministic_fallback_report",
  "false_missing_path_claim",
  "invalid_line_reference",
  "missing_report_file_references",
  "missing_substantive_evidence",
  "missing_declared_scope_root",
  "missing_scope_coverage",
  "missing_risk_hypotheses",
  "irrelevant_audit_evidence",
  "missing_report_manifest",
  "invalid_report_manifest",
  "unsupported_report_manifest_version",
  "missing_report_manifest_fields",
  "manifest_identity_mismatch",
  "manifest_content_hash_mismatch",
  "manifest_outcome_mismatch",
  "manifest_source_snapshot_mismatch",
  "missing_audit_evidence_ref",
  "audit_evidence_identity_mismatch",
  "audit_evidence_source_snapshot_mismatch",
  "audit_evidence_scope_mismatch",
  "audit_evidence_risk_mismatch",
  "audit_evidence_discovery_only",
  "unbacked_runtime_command_evidence",
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
  taskId?: string | null;
  roadmapBatchId?: string | null;
  roadmapAlias?: string | null;
  auditPlanId?: string | null;
  taskDescription?: string | null;
  scopeRoots?: string[];
  reportArtifactPaths?: string[];
  expectedReportArtifactPath?: string | null;
  allowedEvidenceArtifactPaths?: string[];
  requireProposedFix?: boolean;
  expectedSourceSnapshot?: AuditReportSourceSnapshot | null;
  auditEvidenceUnits?: AuditEvidenceUnit[];
  requireLedgerEvidence?: boolean;
}

export type AuditReportManifestStatus = "missing" | "valid" | "invalid";

export interface AuditReportSourceSnapshot {
  id?: string | null;
  commit?: string | null;
  tree?: string | null;
  branch?: string | null;
  dirty?: boolean | null;
}

export interface AuditReportManifest {
  version: number;
  auditPlanId: string;
  taskId?: string | null;
  batchId?: string | null;
  roadmapAlias?: string | null;
  artifactPath: string;
  contentSha256: string;
  sourceSnapshot: AuditReportSourceSnapshot;
  outcome: AuditPublicReportOutcome;
  scopeCoverage: unknown[];
  riskHypotheses: unknown[];
  findings: unknown[];
  noFindingsClaims: unknown[];
  evidenceRefs: string[];
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
  artifactSha256: string;
  contentSha256: string;
  manifest: AuditReportManifest | null;
  manifestVersion: number | null;
  manifestStatus: AuditReportManifestStatus;
  sourceSnapshot: AuditReportSourceSnapshot | null;
  referencedPaths: string[];
  missingReferencedPaths: string[];
  existingReferencedPaths: string[];
  reportArtifactPaths: string[];
  allowedEvidenceArtifactPaths: string[];
  substantiveEvidence: boolean;
  sourceClassification: AuditSourceClassification;
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
    pattern:
      /(?:\b(?:123abc|abc123|abcdef[0-9a-f]*|deadbeef[0-9a-f]*|cafebabe[0-9a-f]*|1234567890abcdef[0-9a-f]*)\b[^\n]{0,80}\b(?:placeholder|fake|commit|hash)\b|\b(?:commit|hash|sha|git\s+(?:log|show|rev-parse))\b[^\n]{0,80}\b(?:123abc|abc123|abcdef[0-9a-f]*|deadbeef[0-9a-f]*|cafebabe[0-9a-f]*|1234567890abcdef[0-9a-f]*)\b|^\s*(?:123abc|abc123|abcdef[0-9a-f]*|deadbeef[0-9a-f]*|cafebabe[0-9a-f]*|1234567890abcdef[0-9a-f]*)(?:\s+\(|\s+[A-Z])[^\n]*)/im,
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
      /\b(?:too large to (?:be )?(?:read|inspect)|reported as too large|file is too large|bytes\s*>\s*\d+\s*byte limit|could not (?:read|inspect|access)|not visible|would show|should show|expected to show|budget constraints limited full inspection|limited full inspection|remaining \d+ lines were sampled)\b/i,
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
      /\b(?:overlap in task\/workflow routing|duplication in responsibilities|distributed configuration|configuration in multiple files|centralized configuration management|missing documentation for submodules|lack of ownership clarity for branches|missing ownership clarity|incomplete ownership clarity|does not explicitly define ownership|does not explicitly define boundaries|missing dependency documentation|branch naming convention and ownership policy)\b/i,
    message:
      "Report artifact contains governance/documentation observations instead of concrete technical-quality findings.",
  },
  {
    code: "deterministic_fallback_report",
    pattern:
      /\b(?:previous candidate findings did not meet the audit finding contract|nf-deterministic-repair|Deterministic repair used scoped source inspections)\b/i,
    message:
      "Report artifact contains a template no-findings conclusion from deterministic repair instead of a source-specific audit decision.",
  },
];

const SLASH_PATH_TOKEN_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z0-9]{1,12})(?::\d+(?:(?::|[-\u2013])\d+)?)?/g;
const ROOT_FILE_TOKEN_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.env(?:\.[\w-]+)+)|[\w.-]+\.(?:jsonc|json|jsx|tsx|yaml|yml|mdx|mjs|cjs|bat|cmd|cpp|css|env|hpp|html|ini|java|lock|md|ps1|py|rs|scss|sh|sql|toml|txt|xml|js|ts|go|kt|cs|c|h))(?::\d+(?:(?::|[-\u2013])\d+)?)?(?=$|[\s`'"\]),.;])/gi;
const DIRECTORY_LINE_REFERENCE_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+\d(?:[\d-]*))(?=$|[\s`'"\]),.;])/g;
const MANIFEST_BLOCK_PATTERN = /(?:^|\n)```audit-report-manifest\s*\r?\n([\s\S]*?)\r?\n```/gi;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const REPORT_STRUCTURE_MARKER_PATTERN =
  /(?:#{1,6}\s+\S|\b(?:No validated findings|Checked files|Checked commands|Evidence|Risk|Proposed fix|Verification|Audit outcome|Finding)\s*:|\bNo validated findings\b|```audit-report-manifest\b)/gi;
const BACKTICKED_SNIPPET_PATTERN = /`([^`\r\n]+)`/g;
const CAT_LINE_REFERENCE_OPERAND_PATTERN =
  /^(?:\.{1,2}\/)?(?:[\w.@-]+\/)*[\w.@-]+:\d+(?:(?::|[-\u2013])\d+)?$/i;
const ABSOLUTE_CAT_LINE_REFERENCE_OPERAND_PATTERN =
  /^(?:\/|[A-Za-z]:\/).+:\d+(?:(?::|[-\u2013])\d+)?$/i;

type SourcePathKind = "file" | "directory" | "missing" | "other";

interface AuditReportSourceReader {
  pathExists(path: string): boolean;
  pathKind(path: string): SourcePathKind;
  fileLineCount(path: string): number | null;
  fileLine(path: string, line: number): string | null;
  collectRepresentativeFiles(directory: string, limit?: number): string[];
}

interface ParsedManifestBlock {
  manifest: AuditReportManifest | null;
  duplicate: boolean;
  parseError: string | null;
}

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

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function stripAuditReportManifestBlocks(text: string): string {
  return text.replace(MANIFEST_BLOCK_PATTERN, "\n").trim();
}

function isWeakOrDiscardedFindingsHeading(title: string): boolean {
  const normalized = title.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return (
    /\bfinding/.test(normalized) &&
    /\b(?:weak|discarded|rejected|omitted|unsupported|non-blocking)\b/.test(normalized)
  );
}

export function stripNonBlockingWeakFindingSections(text: string): string {
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
      if (skipUntilHeadingLevel === null && isWeakOrDiscardedFindingsHeading(title)) {
        skipUntilHeadingLevel = level;
        continue;
      }
    }

    if (skipUntilHeadingLevel !== null) continue;
    kept.push(line);
  }

  return kept.join("\n");
}

export function computeAuditReportArtifactSha256(text: string): string {
  return sha256(text);
}

export function computeAuditReportContentSha256(text: string): string {
  return sha256(stripAuditReportManifestBlocks(text));
}

function parseAuditReportManifestBlock(text: string): ParsedManifestBlock {
  const matches = [...text.matchAll(MANIFEST_BLOCK_PATTERN)];
  if (matches.length === 0) {
    return { manifest: null, duplicate: false, parseError: null };
  }
  if (matches.length > 1) {
    return {
      manifest: null,
      duplicate: true,
      parseError: "Report contains multiple audit-report-manifest blocks.",
    };
  }

  try {
    const parsed = JSON.parse(matches[0]?.[1] ?? "") as unknown;
    return {
      manifest: isObjectRecord(parsed) ? normalizeManifestCandidate(parsed) : null,
      duplicate: false,
      parseError: isObjectRecord(parsed) ? null : "Audit report manifest root must be an object.",
    };
  } catch (error) {
    return {
      manifest: null,
      duplicate: false,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function extractAuditReportManifestEvidenceRefs(text: string): string[] {
  return parseAuditReportManifestBlock(text).manifest?.evidenceRefs ?? [];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | null | undefined {
  if (value == null) return null;
  return typeof value === "string" ? value : undefined;
}

function normalizeEvidenceRefs(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function normalizeUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeSourceSnapshotCandidate(value: unknown): AuditReportSourceSnapshot | null {
  if (!isObjectRecord(value)) return null;
  const id = optionalString(value.id);
  const commit = optionalString(value.commit);
  const tree = optionalString(value.tree);
  const branch = optionalString(value.branch);
  const dirty =
    typeof value.dirty === "boolean" ? value.dirty : value.dirty == null ? null : undefined;
  if ([id, commit, tree, branch, dirty].some((entry) => entry === undefined)) return null;
  return { id, commit, tree, branch, dirty };
}

function normalizeManifestCandidate(
  candidate: Record<string, unknown>,
): AuditReportManifest | null {
  const sourceSnapshot = normalizeSourceSnapshotCandidate(candidate.sourceSnapshot);
  const version = typeof candidate.version === "number" ? candidate.version : Number.NaN;
  const outcome = candidate.outcome;
  if (!sourceSnapshot || typeof outcome !== "string") {
    return null;
  }
  const normalizedOutcome = normalizeManifestOutcome(version, outcome);
  if (!normalizedOutcome) return null;
  return {
    version,
    auditPlanId: typeof candidate.auditPlanId === "string" ? candidate.auditPlanId : "",
    taskId: optionalString(candidate.taskId) ?? null,
    batchId: optionalString(candidate.batchId) ?? null,
    roadmapAlias: optionalString(candidate.roadmapAlias) ?? null,
    artifactPath: typeof candidate.artifactPath === "string" ? candidate.artifactPath : "",
    contentSha256: typeof candidate.contentSha256 === "string" ? candidate.contentSha256 : "",
    sourceSnapshot,
    outcome: normalizedOutcome,
    scopeCoverage: normalizeUnknownArray(candidate.scopeCoverage),
    riskHypotheses: normalizeUnknownArray(candidate.riskHypotheses),
    findings: normalizeUnknownArray(candidate.findings),
    noFindingsClaims: normalizeUnknownArray(candidate.noFindingsClaims),
    evidenceRefs: normalizeEvidenceRefs(candidate.evidenceRefs),
  };
}

const AUDIT_SOURCE_CLASSIFICATION_SET = new Set<string>([
  "validated_findings_present",
  "validated_no_findings",
  "inventory_only_invalid",
  "insufficient_substantive_evidence",
  "source_inconclusive",
]);

function normalizeManifestOutcome(
  version: number,
  outcome: string,
): AuditPublicReportOutcome | null {
  if (version === 2) {
    return isAuditPublicReportOutcome(outcome) ? outcome : null;
  }
  if (version === 1 || Number.isNaN(version)) {
    return AUDIT_SOURCE_CLASSIFICATION_SET.has(outcome)
      ? toAuditPublicReportOutcome(outcome as AuditSourceClassification)
      : null;
  }
  return isAuditPublicReportOutcome(outcome) ? outcome : null;
}

function safeGitObjectPath(path: string): string | null {
  const normalized = normalizeRelativePath(path);
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.includes("\0")
  ) {
    return null;
  }
  return normalized;
}

function runGit(projectRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-c", `safe.directory=${projectRoot}`, ...args], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function createLiveSourceReader(projectRoot: string): AuditReportSourceReader {
  return {
    pathExists(path: string): boolean {
      const absPath = resolve(projectRoot, path);
      return isInsideRoot(projectRoot, absPath) && existsSync(absPath);
    },
    pathKind(path: string): SourcePathKind {
      const absPath = resolve(projectRoot, path);
      if (!isInsideRoot(projectRoot, absPath) || !existsSync(absPath)) return "missing";
      try {
        const stat = statSync(absPath);
        if (stat.isFile()) return "file";
        if (stat.isDirectory()) return "directory";
        return "other";
      } catch {
        return "missing";
      }
    },
    fileLineCount(path: string): number | null {
      return fileLineCount(projectRoot, path);
    },
    fileLine(path: string, line: number): string | null {
      return fileLine(projectRoot, path, line);
    },
    collectRepresentativeFiles(directory: string, limit = 1_000): string[] {
      return collectRepresentativeFilesUnderDirectory(projectRoot, directory, limit);
    },
  };
}

function createGitSnapshotSourceReader(
  projectRoot: string,
  snapshot: AuditReportSourceSnapshot,
): AuditReportSourceReader {
  const treeish = snapshot.tree || snapshot.commit || "HEAD";
  const kindCache = new Map<string, SourcePathKind>();
  const contentCache = new Map<string, string | null>();
  const representativeFilesCache = new Map<string, string[]>();
  const objectFor = (path: string): string | null => {
    const gitPath = safeGitObjectPath(path);
    return gitPath ? `${treeish}:${gitPath}` : null;
  };
  const kindFor = (path: string): SourcePathKind => {
    const normalized = normalizePathForComparison(path);
    const cached = kindCache.get(normalized);
    if (cached) return cached;
    const object = objectFor(path);
    if (!object) {
      kindCache.set(normalized, "missing");
      return "missing";
    }
    const type = runGit(projectRoot, ["cat-file", "-t", object]);
    const kind =
      type === "blob" ? "file" : type === "tree" ? "directory" : type ? "other" : "missing";
    kindCache.set(normalized, kind);
    return kind;
  };
  const fileContentFor = (path: string): string | null => {
    const normalized = normalizePathForComparison(path);
    if (contentCache.has(normalized)) return contentCache.get(normalized) ?? null;
    if (kindFor(path) !== "file") {
      contentCache.set(normalized, null);
      return null;
    }
    const object = objectFor(path);
    const content = object ? runGit(projectRoot, ["show", object]) : null;
    contentCache.set(normalized, content);
    return content;
  };
  return {
    pathExists(path: string): boolean {
      return kindFor(path) !== "missing";
    },
    pathKind(path: string): SourcePathKind {
      return kindFor(path);
    },
    fileLineCount(path: string): number | null {
      const content = fileContentFor(path);
      if (content == null) return null;
      if (content.length === 0) return 0;
      return content.split(/\r?\n/).length;
    },
    fileLine(path: string, line: number): string | null {
      if (line < 1) return null;
      const content = fileContentFor(path);
      if (content == null) return null;
      return content.split(/\r?\n/)[line - 1] ?? null;
    },
    collectRepresentativeFiles(directory: string, limit = 1_000): string[] {
      const cacheKey = `${normalizePathForComparison(directory)}:${limit}`;
      const cached = representativeFilesCache.get(cacheKey);
      if (cached) return cached;
      const gitPath = safeGitObjectPath(directory);
      if (!gitPath || kindFor(gitPath) !== "directory") {
        representativeFilesCache.set(cacheKey, []);
        return [];
      }
      const output = runGit(projectRoot, ["ls-tree", "-r", "--name-only", treeish, gitPath]);
      if (!output) {
        representativeFilesCache.set(cacheKey, []);
        return [];
      }
      const files = output
        .split(/\r?\n/)
        .map(normalizeRelativePath)
        .filter(Boolean)
        .filter((path) => !path.split("/").some((part) => IGNORED_SCOPE_DIRECTORY_NAMES.has(part)))
        .slice(0, limit)
        .sort();
      representativeFilesCache.set(cacheKey, files);
      return files;
    },
  };
}

function deriveCurrentGitSnapshot(projectRoot: string): AuditReportSourceSnapshot | null {
  const commit = runGit(projectRoot, ["rev-parse", "HEAD"]);
  const tree = runGit(projectRoot, ["rev-parse", "HEAD^{tree}"]);
  if (!commit || !tree) return null;
  const branch = runGit(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    id: `git:${commit}:${tree}`,
    commit,
    tree,
    branch: branch && branch !== "HEAD" ? branch : null,
    dirty: null,
  };
}

function expectedAuditPlanId(input: AuditReportValidationInput): string | null {
  if (input.auditPlanId) return input.auditPlanId;
  if (input.roadmapBatchId && input.taskId) {
    return `batch:${input.roadmapBatchId}:task:${input.taskId}`;
  }
  return input.taskId ? `task:${input.taskId}` : null;
}

function normalizeExpectedSnapshot(
  input: AuditReportValidationInput,
): AuditReportSourceSnapshot | null {
  return input.expectedSourceSnapshot ?? null;
}

function expectedSnapshotId(snapshot: AuditReportSourceSnapshot): string | null {
  if (snapshot.id) return snapshot.id;
  return snapshot.commit && snapshot.tree ? `git:${snapshot.commit}:${snapshot.tree}` : null;
}

function hasManifestIssue(issues: AuditReportValidationIssue[]): boolean {
  return issues.some(
    (entry) =>
      entry.code.startsWith("manifest_") ||
      entry.code.startsWith("audit_evidence_") ||
      entry.code === "missing_report_manifest" ||
      entry.code === "invalid_report_manifest" ||
      entry.code === "unsupported_report_manifest_version" ||
      entry.code === "missing_report_manifest_fields" ||
      entry.code === "missing_audit_evidence_ref" ||
      entry.code === "missing_risk_hypotheses" ||
      entry.code === "missing_scope_coverage",
  );
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

function collectManifestIds(
  values: unknown[],
  keys: string[],
  nestedKeys: string[] = [],
): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string" && value.trim().length > 0) {
      ids.add(normalizeRelativePath(value.trim()));
      return;
    }
    if (!isObjectRecord(value)) return;
    for (const key of keys) {
      const entry = value[key];
      if (typeof entry === "string" && entry.trim().length > 0) {
        ids.add(normalizeRelativePath(entry.trim()));
      }
      if (Array.isArray(entry)) {
        for (const child of entry) visit(child);
      }
    }
    for (const nestedKey of nestedKeys) {
      const nested = value[nestedKey];
      if (Array.isArray(nested)) {
        for (const child of nested) visit(child);
      }
    }
  };
  for (const value of values) visit(value);
  return [...ids].filter(Boolean).sort();
}

function manifestScopeIds(manifest: AuditReportManifest): string[] {
  return [
    ...new Set([
      ...collectManifestIds(
        manifest.scopeCoverage,
        ["id", "scopeId", "scope", "root"],
        ["scopeIds", "scopes", "scopeCoverage"],
      ),
      ...collectManifestIds(
        [...manifest.findings, ...manifest.noFindingsClaims],
        ["scopeId", "scope", "root"],
        ["scopeIds", "scopes", "scopeCoverage"],
      ),
    ]),
  ].sort();
}

function manifestRiskHypothesisIds(manifest: AuditReportManifest): string[] {
  return [
    ...new Set([
      ...collectManifestIds(
        manifest.riskHypotheses,
        ["id", "riskId", "riskHypothesisId"],
        ["riskIds", "riskHypothesisIds", "risks"],
      ),
      ...collectManifestIds(
        [...manifest.findings, ...manifest.noFindingsClaims],
        ["riskId", "riskHypothesisId"],
        ["riskIds", "riskHypothesisIds", "risks"],
      ),
    ]),
  ].sort();
}

function hasAllIds(actual: string[], expected: string[]): boolean {
  if (expected.length === 0) return true;
  const actualSet = new Set(actual);
  return expected.every((id) => actualSet.has(id));
}

function validateManifestEvidenceRefs(input: {
  manifest: AuditReportManifest;
  expectedPlanId: string | null;
  expectedSnapshot: AuditReportSourceSnapshot | null;
  taskId?: string | null;
  evidenceUnits: AuditEvidenceUnit[];
  requireLedgerEvidence: boolean;
}): AuditReportValidationIssue[] {
  const shouldValidate =
    input.requireLedgerEvidence ||
    input.evidenceUnits.length > 0 ||
    input.manifest.evidenceRefs.length > 0;
  if (!shouldValidate) return [];

  const issues: AuditReportValidationIssue[] = [];
  const byId = new Map(input.evidenceUnits.map((entry) => [entry.id, entry]));
  const citedUnits: AuditEvidenceUnit[] = [];
  for (const evidenceRef of input.manifest.evidenceRefs) {
    const unit = byId.get(evidenceRef);
    if (!unit) {
      issues.push(
        issue(
          "missing_audit_evidence_ref",
          `Audit report manifest cites evidence id ${evidenceRef}, but no matching runtime-captured evidence unit was provided.`,
        ),
      );
      continue;
    }
    citedUnits.push(unit);
    const identityMismatches: string[] = [];
    if (input.taskId && unit.taskId !== input.taskId) {
      identityMismatches.push(`taskId expected ${input.taskId}`);
    }
    if (input.expectedPlanId && unit.auditPlanId !== input.expectedPlanId) {
      identityMismatches.push(`auditPlanId expected ${input.expectedPlanId}`);
    }
    if (identityMismatches.length > 0) {
      issues.push(
        issue(
          "audit_evidence_identity_mismatch",
          `Audit evidence ${unit.id} does not match validation context: ${identityMismatches.join("; ")}.`,
        ),
      );
    }
    const manifestSnapshotIdValue = expectedSnapshotId(input.manifest.sourceSnapshot);
    if (manifestSnapshotIdValue && unit.sourceSnapshotId !== manifestSnapshotIdValue) {
      issues.push(
        issue(
          "audit_evidence_source_snapshot_mismatch",
          `Audit evidence ${unit.id} is bound to source snapshot ${unit.sourceSnapshotId}, expected manifest source snapshot ${manifestSnapshotIdValue}.`,
        ),
      );
    }
  }

  const validatesTrustedClaims =
    (input.manifest.outcome === "validated_findings_present" &&
      input.manifest.findings.length > 0) ||
    (input.manifest.outcome === "validated_no_findings" &&
      input.manifest.noFindingsClaims.length > 0);

  if (input.manifest.outcome === "validated_no_findings") {
    if (!citedUnits.some((unit) => unit.evidenceGrade === "substantive")) {
      issues.push(
        issue(
          "audit_evidence_discovery_only",
          "Audit report manifest claims validated no-findings but cited runtime evidence is discovery-only.",
        ),
      );
    }
  }

  if (validatesTrustedClaims) {
    const citedScopeIds = [...new Set(citedUnits.flatMap((unit) => unit.scopeIds))].sort();
    const requiredScopeIds = manifestScopeIds(input.manifest);
    if (!hasAllIds(citedScopeIds, requiredScopeIds)) {
      issues.push(
        issue(
          "audit_evidence_scope_mismatch",
          `Audit report manifest claims scope coverage not covered by cited evidence IDs: ${requiredScopeIds.filter((id) => !citedScopeIds.includes(id)).join(", ")}.`,
        ),
      );
    }
    const citedRiskIds = [...new Set(citedUnits.flatMap((unit) => unit.riskHypothesisIds))].sort();
    const requiredRiskIds = manifestRiskHypothesisIds(input.manifest);
    if (!hasAllIds(citedRiskIds, requiredRiskIds)) {
      issues.push(
        issue(
          "audit_evidence_risk_mismatch",
          `Audit report manifest claims risk hypotheses not covered by cited evidence IDs: ${requiredRiskIds.filter((id) => !citedRiskIds.includes(id)).join(", ")}.`,
        ),
      );
    }
  }

  return issues;
}

interface ReportedAuditCommandClaim {
  command: string;
  evidence: string;
}

const AUDIT_COMMAND_NAME_PATTERN =
  /^(?:npm|pnpm|yarn|rg|grep|cat|ls|sed|head|tail|find|wc|git|vitest|jest|tsc|eslint|node|curl|read_file|list_files|search_files)\b/i;

function normalizeReportedCommand(value: string): string {
  return value
    .trim()
    .replace(/^`+|`+$/g, "")
    .replace(/^\$+\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function commandComparableTokens(value: string): string[] {
  return normalizeReportedCommand(value)
    .replace(/[,"'`]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !token.startsWith("-"));
}

function addReportedCommandClaim(
  claims: Map<string, ReportedAuditCommandClaim>,
  command: string,
  evidence: string,
): void {
  const normalized = normalizeReportedCommand(command);
  if (!normalized || !AUDIT_COMMAND_NAME_PATTERN.test(normalized)) return;
  if (!claims.has(normalized)) claims.set(normalized, { command: command.trim(), evidence });
}

function collectReportedAuditCommandClaims(text: string): ReportedAuditCommandClaim[] {
  const claims = new Map<string, ReportedAuditCommandClaim>();
  for (const entry of extractAuditCommandEvidence(text)) {
    addReportedCommandClaim(claims, entry.command, entry.evidence);
  }

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = line.match(/^\s*(?:[-*]\s*)?(?:Verification:\s*)?Command\s*:\s*`?(.+?)`?\s*$/i);
    if (!match) continue;
    const command = (match[1] ?? "").trim();
    const window = lines.slice(index, index + 5).join("\n");
    if (!/\b(?:Output|stdout|stderr|returned|matched|included)\s*:/i.test(window)) continue;
    addReportedCommandClaim(claims, command, window.trim());
  }

  return [...claims.values()];
}

function evidenceCommandSignatures(unit: AuditEvidenceUnit): string[] {
  const signatures = new Set<string>();
  if (unit.command?.command) {
    signatures.add(unit.command.command);
    const withArgs = [unit.command.command, ...unit.command.args].filter(Boolean).join(" ");
    signatures.add(withArgs);
  }

  const previewFirstLine = (unit.outputPreview ?? "").split(/\r?\n/)[0]?.trim() ?? "";
  const toolPreview = previewFirstLine.match(
    /^\[(read_file|list_files|search_files)\s+([^\]]+)\]/i,
  );
  if (toolPreview) {
    signatures.add(`${toolPreview[1]} ${toolPreview[2]}`);
  }
  for (const scopeId of unit.scopeIds) {
    if (scopeId) signatures.add(`${unit.toolName} ${scopeId}`);
  }
  return [...signatures].map(normalizeReportedCommand).filter(Boolean);
}

function commandTokensAreCompatible(reported: string, signature: string): boolean {
  const reportedTokens = commandComparableTokens(reported);
  const signatureTokens = commandComparableTokens(signature);
  if (reportedTokens.length === 0 || signatureTokens.length === 0) return false;
  if (reportedTokens[0] !== signatureTokens[0]) return false;
  const requiredTokens = signatureTokens.slice(1);
  if (requiredTokens.length === 0) return true;
  return requiredTokens.every((token) => reportedTokens.includes(token));
}

function reportedCommandMatchesUnit(
  claim: ReportedAuditCommandClaim,
  unit: AuditEvidenceUnit,
): boolean {
  const normalizedClaim = normalizeReportedCommand(claim.command);
  return evidenceCommandSignatures(unit).some((signature) => {
    if (normalizedClaim === signature) return true;
    if (normalizedClaim.startsWith(`${signature} `)) return true;
    if (signature.startsWith(`${normalizedClaim} `)) return true;
    return commandTokensAreCompatible(normalizedClaim, signature);
  });
}

function validateReportedRuntimeCommandClaims(input: {
  text: string;
  projectRoot: string;
  manifest: AuditReportManifest | null;
  evidenceUnits: AuditEvidenceUnit[];
  allowedEvidenceArtifactPaths: string[];
  requireLedgerEvidence: boolean;
}): AuditReportValidationIssue[] {
  if (!input.requireLedgerEvidence) return [];
  const claims = collectReportedAuditCommandClaims(input.text);
  if (claims.length === 0) return [];

  const byId = new Map(input.evidenceUnits.map((entry) => [entry.id, entry]));
  const candidateUnits =
    input.manifest && input.manifest.evidenceRefs.length > 0
      ? input.manifest.evidenceRefs
          .map((id) => byId.get(id))
          .filter((entry): entry is AuditEvidenceUnit => Boolean(entry))
      : input.evidenceUnits;

  const unbacked = claims.filter(
    (claim) =>
      !candidateUnits.some((unit) => reportedCommandMatchesUnit(claim, unit)) &&
      !reportedCommandAppearsInAllowedArtifact({
        claim,
        projectRoot: input.projectRoot,
        allowedEvidenceArtifactPaths: input.allowedEvidenceArtifactPaths,
      }),
  );
  if (unbacked.length === 0) return [];
  return [
    issue(
      "unbacked_runtime_command_evidence",
      `Report artifact contains Command/Output evidence not backed by cited runtime audit ledger evidence: ${unbacked
        .slice(0, 5)
        .map((claim) => claim.command)
        .join("; ")}.`,
    ),
  ];
}

function reportedCommandAppearsInAllowedArtifact(input: {
  claim: ReportedAuditCommandClaim;
  projectRoot: string;
  allowedEvidenceArtifactPaths: string[];
}): boolean {
  const normalizedClaim = normalizeReportedCommand(input.claim.command);
  if (!normalizedClaim) return false;
  for (const artifactPath of input.allowedEvidenceArtifactPaths) {
    const normalizedPath = normalizeRelativePath(artifactPath);
    const absPath = resolve(input.projectRoot, normalizedPath);
    if (!isInsideRoot(input.projectRoot, absPath) || !existsSync(absPath)) continue;
    try {
      const content = readFileSync(absPath, "utf8");
      if (normalizeReportedCommand(content).includes(normalizedClaim)) return true;
    } catch {
      continue;
    }
  }
  return false;
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

function hasExplicitRootDotScope(taskDescription: string | null | undefined): boolean {
  if (!taskDescription) return false;
  let inScopeList = false;
  const isRootDot = (value: string): boolean =>
    value
      .trim()
      .replace(/^[-*]\s+/, "")
      .replace(/^['"`]+|['"`]+$/g, "") === ".";
  for (const line of taskDescription.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s*)?Scope\s*:\s*(.*)$/i);
    if (match) {
      const value = match[1].trim();
      inScopeList = value.length === 0;
      if (isRootDot(value) || value.split(/[,;]+/).some(isRootDot)) {
        return true;
      }
      continue;
    }
    if (!inScopeList) continue;
    if (/^\s*$/.test(line)) continue;
    if (/^\s*(?:[-*]\s*)?[A-Za-z][A-Za-z -]{1,40}\s*:/i.test(line)) {
      inScopeList = false;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) && isRootDot(line)) {
      return true;
    }
    inScopeList = false;
  }
  return false;
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

function isInReferenceSentence(text: string, match: RegExpMatchArray): boolean {
  const index = match.index ?? 0;
  const sentenceStart = Math.max(0, text.lastIndexOf("\n", index) + 1, index - 120);
  const nextNewline = text.indexOf("\n", index);
  const sentenceEnd = nextNewline >= 0 ? nextNewline : Math.min(text.length, index + 120);
  return /\b(cite|cites|cited|reference|references|referenced|path|paths|file|files|see|inspect|evidence|scope|artifact|report|finding|findings|checked)\b/i.test(
    text.slice(sentenceStart, sentenceEnd),
  );
}

function isInsideMarkdownFence(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const fenceCount = (before.match(/(?:^|\n)```/g) ?? []).length;
  return fenceCount % 2 === 1;
}

function isInsideCommandOutputFence(text: string, index: number): boolean {
  if (!isInsideMarkdownFence(text, index)) return false;
  const before = text.slice(0, index);
  const fenceMatches = [...before.matchAll(/(?:^|\n)```[^\n]*\r?\n?/g)];
  const openingFence = fenceMatches[fenceMatches.length - 1];
  if (!openingFence) return false;
  const intro = before
    .slice(0, openingFence.index)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join("\n");
  const commandNames =
    "npm|pnpm|yarn|rg|grep|cat|ls|sed|head|tail|find|wc|git|vitest|jest|tsc|eslint|node|curl|read_file|list_files|search_files";
  return new RegExp(
    `\\b(?:command|cmd|shell|powershell|pwsh)\\b[^\\n]{0,240}\\b(?:${commandNames})\\b[^\\n]{0,240}\\b(?:output|stdout|stderr)\\s*:`,
    "i",
  ).test(intro);
}

function isBareMissingPath(rawPath: string, sourceReader: AuditReportSourceReader): boolean {
  const normalized = normalizeRelativePath(rawPath.replace(/[),.;\]]+$/g, ""));
  return Boolean(normalized && !sourceReader.pathExists(normalized));
}

function isBareMissingCommandOutputPathReference(
  text: string,
  match: RegExpMatchArray,
  rawPath: string,
  sourceReader: AuditReportSourceReader,
): boolean {
  if (extractLineReference(match[0] ?? "")) return false;
  return (
    isBareMissingPath(rawPath, sourceReader) && isInsideCommandOutputFence(text, match.index ?? 0)
  );
}

function isBareMissingRootNoisePathReference(
  text: string,
  match: RegExpMatchArray,
  rawPath: string,
  sourceReader: AuditReportSourceReader,
): boolean {
  if (extractLineReference(match[0] ?? "")) return false;
  return (
    isBareMissingPath(rawPath, sourceReader) &&
    (isInsideMarkdownFence(text, match.index ?? 0) || !isInReferenceSentence(text, match))
  );
}

function extractReferencedPaths(
  text: string,
  projectRoot: string,
  sourceReader: AuditReportSourceReader,
): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(SLASH_PATH_TOKEN_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    if (isBareMissingCommandOutputPathReference(text, match, raw, sourceReader)) continue;
    addReferencedPath(refs, projectRoot, raw);
  }
  for (const match of text.matchAll(ROOT_FILE_TOKEN_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw || raw.includes("/") || raw.includes("\\")) continue;
    if (isBareMissingRootNoisePathReference(text, match, raw, sourceReader)) continue;
    addReferencedPath(refs, projectRoot, raw);
  }
  for (const match of text.matchAll(DIRECTORY_LINE_REFERENCE_PATTERN)) {
    addReferencedPath(refs, projectRoot, match[1]?.trim());
  }
  return [...refs].sort();
}

function classifyReferencedPaths(
  refs: string[],
  allowedEvidenceArtifactPaths: Set<string>,
  sourceReader: AuditReportSourceReader,
): { existing: string[]; missing: string[] } {
  const existing: string[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    if (allowedEvidenceArtifactPaths.has(normalizePathForComparison(ref))) {
      existing.push(ref);
      continue;
    }
    if (sourceReader.pathExists(ref)) {
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
  const match = fullToken.match(/:(\d+)(?:(:|[-\u2013])(\d+))?\b/);
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const separator = match[2] ?? null;
  const parsedEnd = match[3] ? Number.parseInt(match[3], 10) : null;
  const end =
    separator === ":" && parsedEnd != null && parsedEnd < start ? start : (parsedEnd ?? start);
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

function fileLine(projectRoot: string, path: string, line: number): string | null {
  if (line < 1) return null;
  const absPath = resolve(projectRoot, path);
  if (!isInsideRoot(projectRoot, absPath) || !existsSync(absPath)) return null;
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > 512_000) return null;
    return readFileSync(absPath, "utf8").split(/\r?\n/)[line - 1] ?? null;
  } catch {
    return null;
  }
}

function hasInvalidExistingLineReference(
  text: string,
  projectRoot: string,
  excludedPaths: Set<string>,
  sourceReader: AuditReportSourceReader,
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
      const lineCount = sourceReader.fileLineCount(normalized);
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

interface LineReferenceMismatch {
  path: string;
  line: number;
  expected: string;
}

function normalizeLineAssertionText(text: string): string {
  return text
    .trim()
    .replace(/^[-–—:>\s]+/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelySourceLineAssertion(text: string): boolean {
  const normalized = normalizeLineAssertionText(text);
  if (normalized.length < 4) return false;
  if (
    /^(?:defines?|documents?|describes?|shows?|indicates?|confirms?|contains?\s+(?:the\s+)?(?:line|value|setting|import)|no matches|matches?=|output\b|risk\b|proposed fix\b|verification\b)/i.test(
      normalized,
    )
  ) {
    return false;
  }
  return /(?:[=(){}\[\];]|^\s*(?:from|import|class|def|async\s+def|function|const|let|var|export|return|if|for|while|try:|except|with|@|[A-Za-z_][\w.]*\s*=))/.test(
    normalized,
  );
}

function firstSubsequentLineReferenceIndex(text: string): number | null {
  let firstIndex: number | null = null;
  const patterns = [SLASH_PATH_TOKEN_PATTERN, ROOT_FILE_TOKEN_PATTERN];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (!extractLineReference(match[0] ?? "")) continue;
      const index = match.index ?? 0;
      firstIndex = firstIndex === null ? index : Math.min(firstIndex, index);
      break;
    }
  }
  return firstIndex;
}

function collectLineAssertionCandidates(line: string, matchEnd: number): string[] {
  const rawAfter = line.slice(matchEnd).replace(/^\s*["'`]+/, "");
  const nextLineReferenceIndex = firstSubsequentLineReferenceIndex(rawAfter);
  const after =
    nextLineReferenceIndex === null ? rawAfter : rawAfter.slice(0, nextLineReferenceIndex);
  const assertionWindow = after;
  const candidates: string[] = [];
  for (const match of assertionWindow.matchAll(BACKTICKED_SNIPPET_PATTERN)) {
    candidates.push(match[1] ?? "");
  }
  for (const match of assertionWindow.matchAll(/"([^"\r\n]+)"|'([^'\r\n]+)'/g)) {
    candidates.push(match[1] ?? match[2] ?? "");
  }
  const colonOutput = assertionWindow.match(/^\s*:\s*(.+?)\s*$/);
  if (colonOutput) candidates.push(colonOutput[1] ?? "");
  const separated = after.match(/^\s*(?:[-–—:]+)\s*(.+?)\s*$/);
  if (separated) candidates.push(separated[1] ?? "");
  return [
    ...new Set(candidates.map(normalizeLineAssertionText).filter(isLikelySourceLineAssertion)),
  ];
}

function sourceRangeContainsLineAssertion(
  sourceReader: AuditReportSourceReader,
  path: string,
  reference: LineReference,
  expected: string,
): boolean {
  const normalizedExpected = normalizeLineAssertionText(expected);
  const end = Math.min(reference.end, reference.start + 25);
  for (let line = reference.start; line <= end; line += 1) {
    const sourceLine = sourceReader.fileLine(path, line);
    if (sourceLine == null) continue;
    const normalizedSource = normalizeLineAssertionText(sourceLine);
    if (!normalizedSource) continue;
    if (
      normalizedSource.includes(normalizedExpected) ||
      normalizedExpected.includes(normalizedSource)
    ) {
      return true;
    }
  }
  return false;
}

function collectLineReferenceAssertionMismatches(
  text: string,
  excludedPaths: Set<string>,
  sourceReader: AuditReportSourceReader,
): LineReferenceMismatch[] {
  const mismatches: LineReferenceMismatch[] = [];
  const seen = new Set<string>();
  const patterns = [SLASH_PATH_TOKEN_PATTERN, ROOT_FILE_TOKEN_PATTERN];
  for (const line of text.split(/\r?\n/)) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        const raw = match[1]?.trim();
        if (!raw) continue;
        const reference = extractLineReference(match[0] ?? "");
        if (!reference) continue;
        const normalized = normalizeRelativePath(raw);
        if (excludedPaths.has(normalizePathForComparison(normalized))) continue;
        const lineCount = sourceReader.fileLineCount(normalized);
        if (
          lineCount === null ||
          reference.start < 1 ||
          reference.end < reference.start ||
          reference.end > lineCount
        ) {
          continue;
        }
        const matchEnd = (match.index ?? 0) + (match[0]?.length ?? 0);
        for (const expected of collectLineAssertionCandidates(line, matchEnd)) {
          if (sourceRangeContainsLineAssertion(sourceReader, normalized, reference, expected)) {
            continue;
          }
          const key = `${normalized}:${reference.start}:${expected}`;
          if (seen.has(key)) continue;
          seen.add(key);
          mismatches.push({ path: normalized, line: reference.start, expected });
        }
      }
    }
  }
  return mismatches;
}

function countReportStructureMarkers(text: string): number {
  REPORT_STRUCTURE_MARKER_PATTERN.lastIndex = 0;
  return [...text.matchAll(REPORT_STRUCTURE_MARKER_PATTERN)].length;
}

function hasMalformedReportArtifact(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const escapedNewlinePattern = /\\r\\n|\\n/g;
  const escapedNewlineCount = (trimmed.match(escapedNewlinePattern) ?? []).length;
  const physicalLineCount = trimmed.split(/\r?\n/).length;
  const physicalNewlineCount = Math.max(0, physicalLineCount - 1);
  const looksPhysicallySerialized =
    physicalNewlineCount <= 2 || escapedNewlineCount >= Math.max(4, physicalNewlineCount * 2);
  if (
    escapedNewlineCount >= 2 &&
    looksPhysicallySerialized &&
    countReportStructureMarkers(trimmed.replace(escapedNewlinePattern, "\n")) >= 3
  ) {
    return true;
  }

  return trimmed
    .split(/\r?\n/)
    .some((line) => line.length >= 160 && countReportStructureMarkers(line) >= 4);
}

function hasInvalidCatLineReferenceCommand(text: string): boolean {
  for (const match of text.matchAll(BACKTICKED_SNIPPET_PATTERN)) {
    const commandText = match[1] ?? "";
    const tokens = tokenizeShellCommand(commandText);
    const command = tokens[0]?.toLowerCase();
    if (command !== "cat" && command !== "type") continue;
    for (const token of tokens.slice(1)) {
      if (token === "--") continue;
      if (command === "cat" && /^-[A-Za-z]+$/.test(token)) continue;
      const normalizedToken = normalizeShellPathToken(token);
      if (
        CAT_LINE_REFERENCE_OPERAND_PATTERN.test(normalizedToken) ||
        ABSOLUTE_CAT_LINE_REFERENCE_OPERAND_PATTERN.test(normalizedToken)
      ) {
        return true;
      }
    }
  }
  return false;
}

function normalizeShellPathToken(token: string): string {
  return token.replaceAll("\\", "/");
}

function tokenizeShellCommand(commandText: string): string[] {
  const tokens: string[] = [];
  const tokenPattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/g;
  for (const match of commandText.matchAll(tokenPattern)) {
    const token = match[1] ?? match[2] ?? match[3] ?? "";
    if (token) tokens.push(token);
  }
  return tokens;
}

function collectExistingRefsWithLineNumbers(
  text: string,
  projectRoot: string,
  excludedPaths: Set<string>,
  sourceReader: AuditReportSourceReader,
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
      const lineCount = sourceReader.fileLineCount(normalized);
      if (
        lineCount !== null &&
        reference.start >= 1 &&
        reference.end >= reference.start &&
        reference.end <= lineCount
      ) {
        const lineText = sourceReader.fileLine(normalized, reference.start);
        if (
          isLowSignalAuditEvidenceLine({ path: normalized, line: reference.start, text: lineText })
        ) {
          continue;
        }
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

function isDefaultExcludedAuditEvidencePath(path: string): boolean {
  const normalized = normalizePathForComparison(path).replace(/\/+$/g, "");
  return (
    normalized === ".agents" ||
    normalized.startsWith(".agents/") ||
    normalized === ".ai-factory" ||
    normalized.startsWith(".ai-factory/") ||
    normalized === ".codex" ||
    normalized.startsWith(".codex/") ||
    normalized === "docs/rdpi" ||
    normalized.startsWith("docs/rdpi/") ||
    normalized === "docs/intake" ||
    normalized.startsWith("docs/intake/") ||
    normalized === "docs/memory" ||
    normalized.startsWith("docs/memory/")
  );
}

function isDirectlyScopedExcludedEvidencePath(path: string, scopeRoots: string[]): boolean {
  return scopeRoots.some((root) => {
    if (!isDefaultExcludedAuditEvidencePath(root)) return false;
    return isSameRepositoryPath(path, root) || isPathUnderDirectory(path, root);
  });
}

function collectDefaultExcludedEvidencePaths(input: {
  referencedPaths: string[];
  reportArtifactPaths: string[];
  scopeRoots: string[];
}): string[] {
  return [...new Set([...input.referencedPaths, ...input.reportArtifactPaths])]
    .filter((path) => {
      if (input.reportArtifactPaths.some((artifact) => isSameRepositoryPath(path, artifact))) {
        return true;
      }
      return (
        isDefaultExcludedAuditEvidencePath(path) &&
        !isDirectlyScopedExcludedEvidencePath(path, input.scopeRoots)
      );
    })
    .sort();
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
  sourceReader: AuditReportSourceReader;
}): AuditReportScopeCoverage[] {
  const lineEvidenceFiles = collectExistingRefsWithLineNumbers(
    input.text,
    input.projectRoot,
    input.excludedPaths,
    input.sourceReader,
  );

  return input.scopeRoots.map((root) => {
    const kind = input.sourceReader.pathKind(root);
    if (kind === "missing") {
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

    if (kind === "file") {
      const coveredFiles = lineEvidenceFiles.filter((path) => isSameRepositoryPath(path, root));
      const lineCount = input.sourceReader.fileLineCount(root);
      const emptyFileCommandEvidence =
        lineCount === 0 &&
        hasEmptyFileInspectionEvidence({
          text: input.text,
          path: root,
          projectRoot: input.projectRoot,
          sourceReader: input.sourceReader,
        });
      const ok = coveredFiles.length > 0 || emptyFileCommandEvidence;
      return {
        root,
        exists: true,
        kind: "file",
        requiredEvidenceCount: 1,
        coveredFiles: ok && coveredFiles.length === 0 ? [root] : coveredFiles,
        missingRepresentativeFiles: ok ? [] : [root],
        commandEvidence: true,
        ok,
      };
    }

    if (kind !== "directory") {
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

    const representativeFiles = input.sourceReader.collectRepresentativeFiles(root);
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

function hasSubstantiveCommandOutputEvidence(text: string): boolean {
  return extractSubstantiveAuditCommandEvidence(text).length > 0;
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
  sourceReader: AuditReportSourceReader,
): boolean {
  return (
    classifyAuditSourceEvidence({
      text,
      projectRoot,
      excludedReferencedPaths: [...excludedPaths],
      requireProposedFix: false,
      sourceReader,
    }).classification === "validated_no_findings"
  );
}

function hasStructuredFindingEvidence(
  text: string,
  projectRoot: string,
  excludedPaths: Set<string>,
  allowedArtifactPaths: string[],
  requireProposedFix: boolean,
  sourceReader: AuditReportSourceReader,
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
      (collectExistingRefsWithLineNumbers(section, projectRoot, excludedPaths, sourceReader)
        .length > 0 ||
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
  sourceReader?: AuditReportSourceReader;
}): boolean {
  const sourceReader = input.sourceReader ?? createLiveSourceReader(input.projectRoot);
  const excludedPaths = new Set(
    (input.excludedReferencedPaths ?? []).map((path) => normalizePathForComparison(path)),
  );
  if (hasInvalidExistingLineReference(input.text, input.projectRoot, excludedPaths, sourceReader)) {
    return false;
  }
  if (hasContradictoryFindings(input.text)) return false;
  if (hasValidatedNoFindingsEvidence(input.text, input.projectRoot, excludedPaths, sourceReader)) {
    return true;
  }
  return hasStructuredFindingEvidence(
    input.text,
    input.projectRoot,
    excludedPaths,
    input.allowedEvidenceArtifactPaths ?? [],
    input.requireProposedFix ?? false,
    sourceReader,
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

function collectFalseMissingPathClaims(
  text: string,
  sourceReader: AuditReportSourceReader,
): string[] {
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
      if (sourceReader.pathExists(normalized)) {
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
  const classificationText = stripNonBlockingWeakFindingSections(text);
  const artifactSha256 = computeAuditReportArtifactSha256(text);
  const contentSha256 = computeAuditReportContentSha256(text);
  const parsedManifest = parseAuditReportManifestBlock(text);
  const manifestBlockPresent = Boolean(text.match(MANIFEST_BLOCK_PATTERN));
  const manifest = parsedManifest.manifest;
  const expectedSnapshot = normalizeExpectedSnapshot(input);
  const fallbackSnapshot = expectedSnapshot ?? deriveCurrentGitSnapshot(input.projectRoot);
  const sourceSnapshot = manifest?.sourceSnapshot ?? fallbackSnapshot;
  const sourceReader =
    manifest?.sourceSnapshot?.tree || manifest?.sourceSnapshot?.commit
      ? createGitSnapshotSourceReader(input.projectRoot, manifest.sourceSnapshot)
      : createLiveSourceReader(input.projectRoot);
  const { parsedScopeRoots, scopeRoots } = resolveScopeRoots(input);
  const explicitRootDotScope = hasExplicitRootDotScope(input.taskDescription);
  const reportArtifactPaths = [
    ...new Set((input.reportArtifactPaths ?? []).map(normalizeRelativePath)),
  ].sort();
  const allowedEvidenceArtifactPaths = [
    ...new Set((input.allowedEvidenceArtifactPaths ?? []).map(normalizeRelativePath)),
  ].sort();
  const allowedPathSet = new Set(
    [...allowedEvidenceArtifactPaths, ...reportArtifactPaths].map(normalizePathForComparison),
  );
  const referencedPaths = extractReferencedPaths(
    classificationText,
    input.projectRoot,
    sourceReader,
  );
  const excludedEvidencePaths = collectDefaultExcludedEvidencePaths({
    referencedPaths,
    reportArtifactPaths,
    scopeRoots,
  });
  const excludedPaths = new Set(excludedEvidencePaths.map(normalizePathForComparison));
  const { existing, missing } = classifyReferencedPaths(
    referencedPaths,
    allowedPathSet,
    sourceReader,
  );
  const scopeCoverage = collectScopeCoverage({
    text: classificationText,
    projectRoot: input.projectRoot,
    scopeRoots,
    excludedPaths,
    sourceReader,
  });
  const sourceEvidenceClassification = classifyAuditSourceEvidence({
    text: classificationText,
    projectRoot: input.projectRoot,
    excludedReferencedPaths: excludedEvidencePaths,
    requireProposedFix: input.requireProposedFix,
    sourceReader,
  });
  const sourceClassification = sourceEvidenceClassification.classification;
  const issues: AuditReportValidationIssue[] = [];

  if (
    parsedManifest.parseError ||
    parsedManifest.duplicate ||
    (manifestBlockPresent && !manifest)
  ) {
    issues.push(
      issue(
        "invalid_report_manifest",
        parsedManifest.parseError
          ? `Audit report manifest is invalid: ${parsedManifest.parseError}`
          : "Audit report manifest is invalid.",
      ),
    );
  }

  if (
    ((input.requireLedgerEvidence ?? false) || (input.auditEvidenceUnits?.length ?? 0) > 0) &&
    !manifest
  ) {
    issues.push(
      issue(
        "missing_report_manifest",
        "Runtime audit evidence validation requires a valid audit report manifest with evidenceRefs bound to captured ledger evidence.",
      ),
    );
  }

  if (manifest) {
    const expectedPlanId = expectedAuditPlanId(input);
    const expectedArtifactPath = normalizeRelativePath(
      input.expectedReportArtifactPath ?? reportArtifactPaths[0] ?? manifest.artifactPath,
    );
    const missingFields: string[] = [];
    if (manifest.version !== 1 && manifest.version !== 2) {
      issues.push(
        issue(
          "unsupported_report_manifest_version",
          `Audit report manifest version ${String(manifest.version)} is not supported.`,
        ),
      );
    }
    if (!manifest.auditPlanId) missingFields.push("auditPlanId");
    if (input.taskId && !manifest.taskId) missingFields.push("taskId");
    if (input.roadmapBatchId && !manifest.batchId) missingFields.push("batchId");
    if (input.roadmapAlias && !manifest.roadmapAlias) missingFields.push("roadmapAlias");
    if (!manifest.artifactPath) missingFields.push("artifactPath");
    if (!SHA256_PATTERN.test(manifest.contentSha256)) missingFields.push("contentSha256");
    if (!manifest.sourceSnapshot.commit) missingFields.push("sourceSnapshot.commit");
    if (!manifest.sourceSnapshot.tree) missingFields.push("sourceSnapshot.tree");
    if (!manifest.sourceSnapshot.id) missingFields.push("sourceSnapshot.id");
    if (manifest.outcome === "validated_no_findings" && manifest.noFindingsClaims.length === 0) {
      missingFields.push("noFindingsClaims");
    }
    if (manifest.outcome === "validated_findings_present" && manifest.findings.length === 0) {
      missingFields.push("findings");
    }
    if (manifest.evidenceRefs.length === 0) missingFields.push("evidenceRefs");
    if (missingFields.length > 0) {
      issues.push(
        issue(
          "missing_report_manifest_fields",
          `Audit report manifest is missing required fields: ${missingFields.join(", ")}.`,
        ),
      );
    }
    if (manifest.outcome === "validated_no_findings") {
      const requiredScopeIds = manifestScopeIds(manifest);
      const requiredRiskIds = manifestRiskHypothesisIds(manifest);
      if (requiredScopeIds.length === 0) {
        issues.push(
          issue(
            "missing_scope_coverage",
            "Audit report manifest claims validated no-findings but does not declare any scoped coverage IDs.",
          ),
        );
      }
      if (requiredRiskIds.length === 0) {
        issues.push(
          issue(
            "missing_risk_hypotheses",
            "Audit report manifest claims validated no-findings but does not declare any covered risk hypothesis IDs.",
          ),
        );
      }
    }
    const identityMismatches: string[] = [];
    if (expectedPlanId && manifest.auditPlanId !== expectedPlanId) {
      identityMismatches.push(`auditPlanId expected ${expectedPlanId}`);
    }
    if (input.taskId && manifest.taskId && manifest.taskId !== input.taskId) {
      identityMismatches.push(`taskId expected ${input.taskId}`);
    }
    if (input.roadmapBatchId && manifest.batchId && manifest.batchId !== input.roadmapBatchId) {
      identityMismatches.push(`batchId expected ${input.roadmapBatchId}`);
    }
    if (
      input.roadmapAlias &&
      manifest.roadmapAlias &&
      manifest.roadmapAlias !== input.roadmapAlias
    ) {
      identityMismatches.push(`roadmapAlias expected ${input.roadmapAlias}`);
    }
    if (!isSameRepositoryPath(manifest.artifactPath, expectedArtifactPath)) {
      identityMismatches.push(`artifactPath expected ${expectedArtifactPath}`);
    }
    if (identityMismatches.length > 0) {
      issues.push(
        issue(
          "manifest_identity_mismatch",
          `Audit report manifest identity does not match validation context: ${identityMismatches.join("; ")}.`,
        ),
      );
    }
    if (SHA256_PATTERN.test(manifest.contentSha256) && manifest.contentSha256 !== contentSha256) {
      issues.push(
        issue(
          "manifest_content_hash_mismatch",
          "Audit report manifest contentSha256 does not match the report body with manifest blocks removed.",
        ),
      );
    }
    const publicSourceOutcome = toAuditPublicReportOutcome(sourceClassification);
    if (manifest.outcome !== publicSourceOutcome) {
      issues.push(
        issue(
          "manifest_outcome_mismatch",
          `Audit report manifest outcome ${manifest.outcome} does not match validator public outcome ${publicSourceOutcome}.`,
        ),
      );
    }
    const snapshotMismatches: string[] = [];
    const expectedId = expectedSnapshot ? expectedSnapshotId(expectedSnapshot) : null;
    const manifestId = expectedSnapshotId(manifest.sourceSnapshot);
    if (expectedSnapshot) {
      if (expectedSnapshot.commit && manifest.sourceSnapshot.commit !== expectedSnapshot.commit) {
        snapshotMismatches.push(`commit expected ${expectedSnapshot.commit}`);
      }
      if (expectedSnapshot.tree && manifest.sourceSnapshot.tree !== expectedSnapshot.tree) {
        snapshotMismatches.push(`tree expected ${expectedSnapshot.tree}`);
      }
      if (expectedId && manifestId !== expectedId) {
        snapshotMismatches.push(`id expected ${expectedId}`);
      }
    }
    if (manifest.sourceSnapshot.commit && manifest.sourceSnapshot.tree) {
      const actualTree = runGit(input.projectRoot, [
        "rev-parse",
        `${manifest.sourceSnapshot.commit}^{tree}`,
      ]);
      if (actualTree !== manifest.sourceSnapshot.tree) {
        snapshotMismatches.push("manifest commit does not resolve to manifest tree");
      }
    }
    if (manifest.sourceSnapshot.id && manifestId && manifest.sourceSnapshot.id !== manifestId) {
      snapshotMismatches.push(`sourceSnapshot.id must be ${manifestId}`);
    }
    if (snapshotMismatches.length > 0) {
      issues.push(
        issue(
          "manifest_source_snapshot_mismatch",
          `Audit report manifest source snapshot does not match validation context: ${snapshotMismatches.join("; ")}.`,
        ),
      );
    }
    issues.push(
      ...validateManifestEvidenceRefs({
        manifest,
        expectedPlanId,
        expectedSnapshot,
        taskId: input.taskId,
        evidenceUnits: input.auditEvidenceUnits ?? [],
        requireLedgerEvidence: input.requireLedgerEvidence ?? false,
      }),
    );
    issues.push(
      ...validateReportedRuntimeCommandClaims({
        text: classificationText,
        projectRoot: input.projectRoot,
        manifest,
        evidenceUnits: input.auditEvidenceUnits ?? [],
        allowedEvidenceArtifactPaths,
        requireLedgerEvidence: input.requireLedgerEvidence ?? false,
      }),
    );
  }

  if (!manifest && /\bNo validated findings\b/i.test(text) && !hasScopedNoFindingsRiskClaim(text)) {
    issues.push(
      issue(
        "missing_risk_hypotheses",
        "Plain no-findings reports must state explicit risk hypotheses or an equivalent scoped no-findings claim.",
      ),
    );
  }

  if (text.trim()) {
    if (hasMalformedReportArtifact(text)) {
      issues.push(
        issue(
          "malformed_report_artifact",
          "Report artifact appears to be serialized markdown instead of readable report text.",
        ),
      );
    }
    if (hasInvalidCatLineReferenceCommand(classificationText)) {
      issues.push(
        issue(
          "invalid_line_reference",
          "Report artifact uses cat/type with a path:line reference as a command target; cite line ranges in Evidence and run commands against real file paths.",
        ),
      );
    }
    for (const { code, pattern, message } of LOW_QUALITY_REPORT_PATTERNS) {
      if (pattern.test(classificationText)) issues.push(issue(code, message));
    }
  }

  const falseMissingPaths = collectFalseMissingPathClaims(classificationText, sourceReader);
  if (falseMissingPaths.length > 0) {
    issues.push(
      issue(
        "false_missing_path_claim",
        `Report artifact claims existing paths are missing: ${formatPathExamples(falseMissingPaths)}.`,
        falseMissingPaths,
      ),
    );
  }

  if (hasContradictoryFindings(classificationText)) {
    issues.push(
      issue(
        "contradictory_findings_and_no_findings",
        "Report artifact mixes validated findings with a No Validated Findings claim.",
      ),
    );
  }

  if (
    hasInvalidExistingLineReference(
      classificationText,
      input.projectRoot,
      excludedPaths,
      sourceReader,
    )
  ) {
    issues.push(
      issue(
        "invalid_line_reference",
        "Report artifact cites an existing path with a line reference outside the file.",
      ),
    );
  }

  const lineReferenceAssertionMismatches = collectLineReferenceAssertionMismatches(
    classificationText,
    excludedPaths,
    sourceReader,
  );
  if (lineReferenceAssertionMismatches.length > 0) {
    const examples = lineReferenceAssertionMismatches
      .slice(0, 5)
      .map((entry) => `${entry.path}:${entry.line} expected "${entry.expected}"`);
    issues.push(
      issue(
        "invalid_line_reference",
        `Report artifact cites source lines with quoted or command-output text that does not match the referenced line: ${examples.join("; ")}.`,
        lineReferenceAssertionMismatches.map((entry) => entry.path),
      ),
    );
  }

  if (classificationText.trim() && referencedPaths.length === 0) {
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

  const irrelevantEvidencePaths = excludedEvidencePaths.filter(
    (path) => !reportArtifactPaths.some((artifactPath) => isSameRepositoryPath(path, artifactPath)),
  );
  if (irrelevantEvidencePaths.length > 0) {
    issues.push(
      issue(
        "irrelevant_audit_evidence",
        `Report artifact cites hidden or generated repository paths that are not directly scoped by the audit mandate: ${formatPathExamples(irrelevantEvidencePaths)}.`,
        irrelevantEvidencePaths,
      ),
    );
  }

  if (explicitRootDotScope) {
    issues.push(
      issue(
        "missing_scope_coverage",
        "Task declares `Scope: .`, which is too broad to validate for audit coverage. Declare concrete files or directories.",
        ["."],
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
          if (sourceReader.fileLineCount(entry.root) === 0) {
            return `${entry.root} is empty and needs command/tool evidence that proves the file is empty`;
          }
          return `${entry.root} needs an existing \`path:line\` or \`path:start-end\` citation to that exact file`;
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
    sourceClassification !== "inventory_only_invalid" &&
    hasSubstantiveReportEvidenceInternal({
      text: classificationText,
      projectRoot: input.projectRoot,
      excludedReferencedPaths: excludedEvidencePaths,
      allowedEvidenceArtifactPaths,
      requireProposedFix: input.requireProposedFix,
      sourceReader,
    });

  if (
    classificationText.trim() &&
    missing.length === 0 &&
    referencedPaths.length > 0 &&
    !substantiveEvidence
  ) {
    issues.push(
      issue(
        "missing_substantive_evidence",
        sourceClassification === "inventory_only_invalid" &&
          !hasSubstantiveCommandOutputEvidence(text)
          ? "Report artifact claims No validated findings but only provides inventory or file-existence evidence. Add scoped inspection command output such as rg/grep results tied to existing path+line citations."
          : "Report artifact lacks substantive evidence markers such as path+line references, command output, or structured findings with evidence/risk/verification.",
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
    artifactSha256,
    contentSha256,
    manifest,
    manifestVersion: manifest?.version ?? null,
    manifestStatus: manifest
      ? hasManifestIssue(issues)
        ? "invalid"
        : "valid"
      : manifestBlockPresent
        ? "invalid"
        : "missing",
    sourceSnapshot,
    referencedPaths,
    missingReferencedPaths: missing,
    existingReferencedPaths: existing,
    reportArtifactPaths,
    allowedEvidenceArtifactPaths,
    substantiveEvidence,
    sourceClassification,
    reportQualityIssues,
    parsedScopeRoots,
    scopeRoots,
    scopeCoverage,
  };
}

export function formatAuditReportValidationIssues(issues: AuditReportValidationIssue[]): string {
  return issues.map((entry) => `${entry.code}: ${entry.message}`).join(" ");
}
