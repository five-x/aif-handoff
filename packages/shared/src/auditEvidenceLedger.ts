import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { redactProviderText } from "./runtimeLimitUtils.js";
import { isInventoryAuditCommand } from "./auditSourceEvidence.js";

export const AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE = "audit:evidence" as const;
export const EVIDENCE_UNIT_RUNTIME_EVENT_TYPE = AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE;

export const AUDIT_EVIDENCE_KINDS = ["file_read", "search", "shell_command"] as const;
export type AuditEvidenceKind = (typeof AUDIT_EVIDENCE_KINDS)[number];
export const EVIDENCE_UNIT_KINDS = AUDIT_EVIDENCE_KINDS;
export type EvidenceUnitKind = AuditEvidenceKind;

export const AUDIT_EVIDENCE_GRADES = ["discovery", "substantive"] as const;
export type AuditEvidenceGrade = (typeof AUDIT_EVIDENCE_GRADES)[number];
export const EVIDENCE_UNIT_GRADES = AUDIT_EVIDENCE_GRADES;
export type EvidenceUnitGrade = AuditEvidenceGrade;

export const AUDIT_EVIDENCE_REDACTION_STATUSES = ["clean", "redacted"] as const;
export type AuditEvidenceRedactionStatus = (typeof AUDIT_EVIDENCE_REDACTION_STATUSES)[number];
export const EVIDENCE_UNIT_REDACTION_STATUSES = AUDIT_EVIDENCE_REDACTION_STATUSES;
export type EvidenceUnitRedactionStatus = AuditEvidenceRedactionStatus;

export interface AuditEvidenceCommandMetadata {
  command: string;
  args: string[];
  cwd: string | null;
}

export interface AuditEvidencePathRange {
  path: string;
  startLine?: number | null;
  endLine?: number | null;
}

export interface AuditEvidenceParsedSummary {
  outputBytes: number;
  outputLineCount: number;
  previewChars: number;
  exitCode: number | null;
}

export interface AuditEvidenceRuntimePayload {
  id?: string;
  toolName: string;
  evidenceKind: AuditEvidenceKind;
  evidenceGrade: AuditEvidenceGrade;
  scopeIds: string[];
  riskHypothesisIds: string[];
  pathHashes: string[];
  pathRangeHashes: string[];
  command: AuditEvidenceCommandMetadata | null;
  exitCode: number | null;
  outputSha256: string | null;
  outputPreview: string | null;
  outputPreviewTruncated: boolean;
  parsedSummary: AuditEvidenceParsedSummary | null;
  redactionStatus: AuditEvidenceRedactionStatus;
  createdAt: string;
}

export interface AuditEvidenceUnit extends AuditEvidenceRuntimePayload {
  id: string;
  taskId: string;
  auditPlanId: string;
  sourceSnapshotId: string;
}

export interface BuildAuditEvidencePayloadInput {
  id?: string;
  toolName: string;
  evidenceKind: AuditEvidenceKind;
  evidenceGrade?: AuditEvidenceGrade;
  scopeIds?: string[];
  riskHypothesisIds?: string[];
  paths?: string[];
  pathRanges?: AuditEvidencePathRange[];
  command?: string | AuditEvidenceCommandMetadata | null;
  exitCode?: number | null;
  output?: string | null;
  outputSha256?: string | null;
  outputPreview?: string | null;
  parsedSummary?: AuditEvidenceParsedSummary | null;
  createdAt?: string;
  maxPreviewChars?: number;
}

export interface BuildAuditEvidenceUnitContext {
  taskId: string;
  auditPlanId: string;
  sourceSnapshotId: string;
  scopeIds?: string[];
  riskHypothesisIds?: string[];
}

export interface AuditRiskHypothesisScopeLink {
  riskId: string;
  scopeId: string;
}

export type EvidenceUnitCommandMetadata = AuditEvidenceCommandMetadata;
export type EvidenceUnitPathRange = AuditEvidencePathRange;
export type EvidenceUnitParsedSummary = AuditEvidenceParsedSummary;
export type EvidenceUnitRuntimePayload = AuditEvidenceRuntimePayload;
export type EvidenceUnit = AuditEvidenceUnit;
export type BuildEvidenceUnitPayloadInput = BuildAuditEvidencePayloadInput;
export type BuildEvidenceUnitContext = BuildAuditEvidenceUnitContext;

const DEFAULT_PREVIEW_CHARS = 512;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSecretLikeEvidenceText(value: string): boolean {
  return redactProviderText(value) !== value;
}

function normalizeId(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeAuditEvidenceIds(values: string[] | null | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => normalizeId(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
}

export function normalizeAuditEvidencePath(path: string): string {
  return path
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/g, "");
}

export function hashAuditEvidencePath(path: string): string {
  return sha256(normalizeAuditEvidencePath(path));
}

export function hashAuditEvidencePathRange(range: AuditEvidencePathRange): string {
  const path = normalizeAuditEvidencePath(range.path);
  const startLine = Number.isInteger(range.startLine) ? Number(range.startLine) : null;
  const endLine = Number.isInteger(range.endLine) ? Number(range.endLine) : startLine;
  return sha256(`${path}:${startLine ?? ""}:${endLine ?? ""}`);
}

export function deriveAuditEvidenceScopeIdsFromPaths(paths: string[] | null | undefined): string[] {
  const ids = new Set<string>();
  for (const rawPath of paths ?? []) {
    const path = normalizeAuditEvidencePath(rawPath);
    if (!path || path.startsWith("..") || path.includes("/../")) continue;
    const parts = path.split("/").filter(Boolean);
    for (let index = 0; index < parts.length; index += 1) {
      ids.add(parts.slice(0, index + 1).join("/"));
    }
  }
  return [...ids].sort();
}

export function extractAuditRiskHypothesisIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const ids = new Set<string>();
  for (const match of text.matchAll(/\brisk-[A-Za-z0-9_.-]+\b/gi)) {
    ids.add(match[0]);
  }
  return [...ids].sort();
}

export function extractAuditScopeIdsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const scopeText = text
    .split(
      /\b(?:Audit mandate|Allowed changes|Report artifact|Acceptance criteria|Evidence requirements|Quality bar|No-findings rule|Git requirements|Constraint|Verification|Dependencies)\s*:/i,
    )[0]
    ?.match(/\bScope\s*:\s*([\s\S]*)/i)?.[1];
  if (!scopeText) return [];
  const paths = new Set<string>();
  for (const match of scopeText.matchAll(/`([^`\r\n]+)`/g)) {
    paths.add(match[1] ?? "");
  }
  if (paths.size === 0) {
    for (const token of scopeText.split(/[,;\r\n]+/)) {
      paths.add(token.replace(/^[-*]\s+/, "").trim());
    }
  }
  return normalizeAuditEvidenceIds(
    [...paths]
      .map(normalizeAuditEvidencePath)
      .filter((path) => path.length > 0 && !path.startsWith("..") && !/\s/.test(path)),
  );
}

function auditTaskDescriptionSection(text: string | null | undefined, startLabel: string): string {
  if (!text) return "";
  const match = text.match(new RegExp(`\\b${startLabel}\\s*:\\s*`, "i"));
  if (!match || match.index == null) return "";
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  return (
    rest.split(
      /\b(?:Allowed changes|Report artifact|Acceptance criteria|Evidence requirements|Manifest requirements|Quality bar|No-findings rule|No-findings proof guardrail|Substantive no-findings requirement|Git requirements|Constraint|Verification|Dependencies)\s*:/i,
    )[0] ?? ""
  );
}

export function extractAuditRiskHypothesisScopeLinks(
  taskDescription: string | null | undefined,
  scopeIds: string[],
): AuditRiskHypothesisScopeLink[] {
  const riskSection = auditTaskDescriptionSection(taskDescription, "Risk hypotheses");
  if (!riskSection) return [];
  const matches = [...riskSection.matchAll(/\brisk-[A-Za-z0-9_.-]+\b/gi)];
  const links: AuditRiskHypothesisScopeLink[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const riskId = match[0];
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? riskSection.length;
    const description = riskSection.slice(start, end);
    for (const scopeId of scopeIds) {
      if (description.includes(scopeId)) links.push({ riskId, scopeId });
    }
  }
  return links;
}

export function auditEvidenceScopeIdsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeAuditEvidencePath(left);
  const normalizedRight = normalizeAuditEvidencePath(right);
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`)
  );
}

export function inferAuditEvidenceRiskHypothesisIdsForScopes(input: {
  riskHypothesisIds?: string[] | null;
  scopeIds?: string[] | null;
  riskHypothesesByScopeId?: AuditRiskHypothesisScopeLink[] | null;
}): string[] {
  const riskIds = new Set(input.riskHypothesisIds ?? []);
  const payloadScopeIds = input.scopeIds ?? [];
  for (const link of input.riskHypothesesByScopeId ?? []) {
    if (payloadScopeIds.some((scopeId) => auditEvidenceScopeIdsOverlap(scopeId, link.scopeId))) {
      riskIds.add(link.riskId);
    }
  }
  return normalizeAuditEvidenceIds([...riskIds]);
}

export function resolveAuditPlanId(input: {
  taskId: string;
  auditPlanId?: string | null;
  roadmapBatchId?: string | null;
}): string {
  if (input.auditPlanId?.trim()) return input.auditPlanId.trim();
  if (input.roadmapBatchId?.trim()) {
    return `batch:${input.roadmapBatchId.trim()}:task:${input.taskId}`;
  }
  return `task:${input.taskId}`;
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

export function deriveAuditSourceSnapshotId(projectRoot: string): string {
  const commit = runGit(projectRoot, ["rev-parse", "HEAD"]);
  const tree = runGit(projectRoot, ["rev-parse", "HEAD^{tree}"]);
  if (commit && tree) return `git:${commit}:${tree}`;
  return `workspace:${sha256(projectRoot)}`;
}

function normalizeCommandMetadata(command: BuildAuditEvidencePayloadInput["command"]): {
  metadata: AuditEvidenceCommandMetadata | null;
  redacted: boolean;
} {
  if (!command) return { metadata: null, redacted: false };
  if (typeof command === "string") {
    const rawCommand = command.trim();
    const safeCommand = redactProviderText(rawCommand);
    return {
      metadata: { command: safeCommand, args: [], cwd: null },
      redacted: safeCommand !== rawCommand,
    };
  }
  const rawCommand = command.command.trim();
  const safeCommand = redactProviderText(rawCommand);
  const rawArgs = command.args;
  const safeArgs = command.args.map((arg) => redactProviderText(arg));
  const rawCwd = command.cwd?.trim() || null;
  const safeCwd = rawCwd ? redactProviderText(rawCwd) : null;
  return {
    metadata: {
      command: safeCommand,
      args: normalizeAuditEvidenceIds(safeArgs),
      cwd: safeCwd,
    },
    redacted:
      safeCommand !== rawCommand ||
      safeArgs.some((arg, index) => arg !== rawArgs[index]) ||
      safeCwd !== rawCwd,
  };
}

function classifyGrade(input: {
  evidenceKind: AuditEvidenceKind;
  evidenceGrade?: AuditEvidenceGrade;
  command: AuditEvidenceCommandMetadata | null;
}): AuditEvidenceGrade {
  if (input.command && isInventoryAuditCommand(input.command.command)) return "discovery";
  if (input.evidenceGrade) return input.evidenceGrade;
  return input.evidenceKind === "file_read" || input.evidenceKind === "search"
    ? "substantive"
    : "discovery";
}

function boundedPreview(input: {
  output: string | null | undefined;
  outputPreview: string | null | undefined;
  maxPreviewChars: number;
}): {
  preview: string | null;
  truncated: boolean;
  redactionStatus: AuditEvidenceRedactionStatus;
} {
  const raw = input.output ?? input.outputPreview ?? null;
  if (raw == null) {
    return { preview: null, truncated: false, redactionStatus: "clean" };
  }
  const redacted = redactProviderText(raw);
  const truncated = redacted.length > input.maxPreviewChars;
  const preview = truncated ? redacted.slice(0, input.maxPreviewChars) : redacted;
  return {
    preview,
    truncated,
    redactionStatus: redacted === raw ? "clean" : "redacted",
  };
}

function parsedSummary(input: {
  output: string | null | undefined;
  preview: string | null;
  exitCode: number | null;
  provided?: AuditEvidenceParsedSummary | null;
}): AuditEvidenceParsedSummary | null {
  if (input.provided) return input.provided;
  const output = input.output ?? "";
  if (!output && !input.preview) return null;
  return {
    outputBytes: Buffer.byteLength(output || input.preview || "", "utf8"),
    outputLineCount: output ? output.split(/\r?\n/).length : input.preview ? 1 : 0,
    previewChars: input.preview?.length ?? 0,
    exitCode: input.exitCode,
  };
}

export function buildAuditEvidencePayload(
  input: BuildAuditEvidencePayloadInput,
): AuditEvidenceRuntimePayload {
  const normalizedCommand = normalizeCommandMetadata(input.command);
  const command = normalizedCommand.metadata;
  const paths = (input.paths ?? []).map(normalizeAuditEvidencePath).filter(Boolean);
  const rangePaths = (input.pathRanges ?? []).map((range) => range.path);
  const scopePaths = [...paths, ...rangePaths].filter((path) => !isSecretLikeEvidenceText(path));
  const pathHashes = normalizeAuditEvidenceIds([
    ...(input.paths ?? []).map(hashAuditEvidencePath),
    ...(input.pathRanges ?? []).map((range) => hashAuditEvidencePath(range.path)),
  ]);
  const pathRangeHashes = normalizeAuditEvidenceIds(
    (input.pathRanges ?? []).map(hashAuditEvidencePathRange),
  );
  const maxPreviewChars = Math.max(32, input.maxPreviewChars ?? DEFAULT_PREVIEW_CHARS);
  const { preview, truncated, redactionStatus } = boundedPreview({
    output: input.output,
    outputPreview: input.outputPreview,
    maxPreviewChars,
  });
  const exitCode = Number.isInteger(input.exitCode) ? Number(input.exitCode) : null;
  return {
    id: input.id ?? `ev_${randomUUID()}`,
    toolName: input.toolName,
    evidenceKind: input.evidenceKind,
    evidenceGrade: classifyGrade({
      evidenceKind: input.evidenceKind,
      evidenceGrade: input.evidenceGrade,
      command,
    }),
    scopeIds: normalizeAuditEvidenceIds([
      ...(input.scopeIds ?? []).filter((scopeId) => !isSecretLikeEvidenceText(scopeId)),
      ...deriveAuditEvidenceScopeIdsFromPaths(scopePaths),
    ]),
    riskHypothesisIds: normalizeAuditEvidenceIds(
      (input.riskHypothesisIds ?? []).filter((riskId) => !isSecretLikeEvidenceText(riskId)),
    ),
    pathHashes,
    pathRangeHashes,
    command,
    exitCode,
    outputSha256:
      input.output != null
        ? sha256(input.output)
        : input.outputSha256 && SHA256_HEX_PATTERN.test(input.outputSha256)
          ? input.outputSha256
          : null,
    outputPreview: preview,
    outputPreviewTruncated: truncated,
    parsedSummary: parsedSummary({
      output: input.output,
      preview,
      exitCode,
      provided: input.parsedSummary,
    }),
    redactionStatus:
      redactionStatus === "redacted" || normalizedCommand.redacted ? "redacted" : "clean",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function buildAuditEvidenceUnit(
  context: BuildAuditEvidenceUnitContext,
  payload: AuditEvidenceRuntimePayload,
): AuditEvidenceUnit {
  return {
    ...payload,
    id: payload.id ?? `ev_${randomUUID()}`,
    taskId: context.taskId,
    auditPlanId: context.auditPlanId,
    sourceSnapshotId: context.sourceSnapshotId,
    scopeIds: normalizeAuditEvidenceIds(payload.scopeIds),
    riskHypothesisIds: normalizeAuditEvidenceIds(payload.riskHypothesisIds),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function readCommandMetadata(value: unknown): AuditEvidenceCommandMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.command !== "string") return null;
  return {
    command: record.command,
    args: isStringArray(record.args) ? record.args : [],
    cwd: typeof record.cwd === "string" ? record.cwd : null,
  };
}

function readParsedSummary(value: unknown): AuditEvidenceParsedSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const outputBytes = typeof record.outputBytes === "number" ? record.outputBytes : null;
  const outputLineCount =
    typeof record.outputLineCount === "number" ? record.outputLineCount : null;
  const previewChars = typeof record.previewChars === "number" ? record.previewChars : null;
  const exitCode =
    typeof record.exitCode === "number" && Number.isInteger(record.exitCode)
      ? record.exitCode
      : null;
  if (outputBytes == null || outputLineCount == null || previewChars == null) return null;
  return { outputBytes, outputLineCount, previewChars, exitCode };
}

export function readAuditEvidenceRuntimePayload(
  value: unknown,
): AuditEvidenceRuntimePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.toolName !== "string" ||
    !AUDIT_EVIDENCE_KINDS.includes(record.evidenceKind as AuditEvidenceKind) ||
    !AUDIT_EVIDENCE_GRADES.includes(record.evidenceGrade as AuditEvidenceGrade)
  ) {
    return null;
  }
  return {
    ...(typeof record.id === "string" ? { id: record.id } : {}),
    toolName: record.toolName,
    evidenceKind: record.evidenceKind as AuditEvidenceKind,
    evidenceGrade: record.evidenceGrade as AuditEvidenceGrade,
    scopeIds: isStringArray(record.scopeIds) ? record.scopeIds : [],
    riskHypothesisIds: isStringArray(record.riskHypothesisIds) ? record.riskHypothesisIds : [],
    pathHashes: isStringArray(record.pathHashes) ? record.pathHashes : [],
    pathRangeHashes: isStringArray(record.pathRangeHashes) ? record.pathRangeHashes : [],
    command: readCommandMetadata(record.command),
    exitCode:
      typeof record.exitCode === "number" && Number.isInteger(record.exitCode)
        ? record.exitCode
        : null,
    outputSha256: typeof record.outputSha256 === "string" ? record.outputSha256 : null,
    outputPreview: typeof record.outputPreview === "string" ? record.outputPreview : null,
    outputPreviewTruncated: record.outputPreviewTruncated === true,
    parsedSummary: readParsedSummary(record.parsedSummary),
    redactionStatus: record.redactionStatus === "redacted" ? "redacted" : "clean",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
  };
}

export const normalizeEvidenceUnitIds = normalizeAuditEvidenceIds;
export const normalizeEvidenceUnitPath = normalizeAuditEvidencePath;
export const hashEvidenceUnitPath = hashAuditEvidencePath;
export const hashEvidenceUnitPathRange = hashAuditEvidencePathRange;
export const deriveEvidenceUnitScopeIdsFromPaths = deriveAuditEvidenceScopeIdsFromPaths;
export const resolveEvidencePlanId = resolveAuditPlanId;
export const deriveEvidenceSourceSnapshotId = deriveAuditSourceSnapshotId;
export const buildEvidenceUnitPayload = buildAuditEvidencePayload;
export const buildEvidenceUnit = buildAuditEvidenceUnit;
export const readEvidenceUnitRuntimePayload = readAuditEvidenceRuntimePayload;
