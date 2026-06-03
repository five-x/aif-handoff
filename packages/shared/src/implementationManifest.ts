import { createHash } from "node:crypto";
import { inferTaskIntent, type TaskIntent } from "./taskIntent.js";

export const DEVELOPMENT_IMPLEMENTATION_INTENTS = ["feature", "fix", "docs", "tests"] as const;

export type DevelopmentImplementationIntent = (typeof DEVELOPMENT_IMPLEMENTATION_INTENTS)[number];

export type ImplementationManifestVerificationStatus = "passed" | "failed" | "skipped";

export type ImplementationManifestAcceptanceStatus = "satisfied" | "unsatisfied" | "waived";

export type ImplementationManifestReviewClosureStatus =
  | "pending"
  | "passed"
  | "skipped"
  | "blocked";

export type ImplementationManifestCommitStatus = "committed" | "not_committed" | "not_required";

export interface ImplementationManifestChangedFile {
  path: string;
  status?: "added" | "modified" | "deleted" | "renamed" | "unknown";
}

export interface ImplementationManifestDiffSummary {
  summary: string;
  filesChanged?: number | null;
  insertions?: number | null;
  deletions?: number | null;
}

export interface ImplementationManifestVerificationEvidence {
  id: string;
  command: string;
  status: ImplementationManifestVerificationStatus;
  outputSha256?: string | null;
  outputPreview?: string | null;
  outputPreviewTruncated?: boolean;
}

export interface ImplementationManifestAcceptanceCriterion {
  id: string;
  description?: string;
  status: ImplementationManifestAcceptanceStatus;
  evidenceRefs: string[];
  waiverAuthority?: string | null;
  waiverEvidenceRefs?: string[];
  notes?: string | null;
}

export interface ImplementationManifestPlanChecklist {
  total: number;
  completed: number;
  pending: number;
  synced: boolean;
  pendingItems?: string[];
  supersededItems?: ImplementationManifestChecklistDisposition[];
  cancelledItems?: ImplementationManifestChecklistDisposition[];
  waivedItems?: ImplementationManifestChecklistDisposition[];
}

export interface ImplementationManifestChecklistDisposition {
  item: string;
  reason: string;
  evidenceRefs: string[];
}

export interface ImplementationManifestReviewClosure {
  status: ImplementationManifestReviewClosureStatus;
  evidenceRefs: string[];
  notes?: string | null;
}

export interface ImplementationManifestCommitEvidence {
  status: ImplementationManifestCommitStatus;
  commitSha?: string | null;
  evidenceRefs?: string[];
  notes?: string | null;
}

export interface ImplementationManifest {
  version: 1;
  taskId: string;
  intent: DevelopmentImplementationIntent;
  planManifestHash: string | null;
  changedFiles: ImplementationManifestChangedFile[];
  diffSummary: ImplementationManifestDiffSummary;
  verificationEvidence: ImplementationManifestVerificationEvidence[];
  acceptanceCriteria: ImplementationManifestAcceptanceCriterion[];
  evidenceRefs: string[];
  planChecklist: ImplementationManifestPlanChecklist;
  reviewClosure: ImplementationManifestReviewClosure;
  commitEvidence: ImplementationManifestCommitEvidence;
  regressionExplanation?: string | null;
  knownLimitations: string[];
}

export type ImplementationManifestIssueCode =
  | "missing_implementation_manifest"
  | "invalid_implementation_manifest"
  | "implementation_plan_manifest_hash_mismatch"
  | "implementation_changed_files_mismatch"
  | "implementation_scope_mismatch"
  | "missing_verification_evidence"
  | "unsupported_verification_command"
  | "verification_command_not_observed"
  | "contradictory_verification_claim"
  | "missing_acceptance_evidence"
  | "plan_checklist_drift"
  | "unintended_uncommitted_changes"
  | "missing_review_closure_evidence"
  | "missing_fix_regression_explanation";

export interface ImplementationManifestIssue {
  code: ImplementationManifestIssueCode;
  message: string;
}

export interface ImplementationManifestValidationTask {
  id: string;
  title: string;
  description?: string | null;
  taskIntent?: TaskIntent | null;
  isFix?: boolean | null;
  tags?: string[] | string | null;
  roadmapAlias?: string | null;
  plan?: string | null;
  reviewComments?: string | null;
  agentActivityLog?: string | null;
  skipReview?: boolean | null;
}

export type ImplementationManifestValidationPhase = "review_handoff" | "completion";

export interface ValidateImplementationManifestInput {
  task: ImplementationManifestValidationTask;
  manifestJson?: string | null;
  changedFiles: string[];
  meaningfulChangedFiles: string[];
  dirtyChangedFiles: string[];
  trustedCommittedChangedFiles?: string[];
  trustedVerificationCommands?: string[];
  phase: ImplementationManifestValidationPhase;
}

export interface ImplementationManifestValidationResult {
  ok: boolean;
  required: boolean;
  intent: TaskIntent;
  manifest: ImplementationManifest | null;
  normalizedJson: string | null;
  planManifestHash: string | null;
  issues: ImplementationManifestIssue[];
}

export interface AifPlanManifestSnapshot {
  hash: string | null;
  acceptanceCriterionIds: string[];
  scope: string[];
  expectedArtifactPaths: string[];
  verificationCommands: string[];
}

const IMPLEMENTATION_MANIFEST_BLOCK_PATTERN =
  /```aif-implementation-manifest\b[^\r\n]*\r?\n([\s\S]*?)```/gi;
const JSON_FENCE_BLOCK_PATTERN = /```json\b[^\r\n]*\r?\n([\s\S]*?)```/gi;

const PLAN_MANIFEST_BLOCK_PATTERN = /```aif-plan-manifest\b[^\r\n]*\r?\n([\s\S]*?)```/gi;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function usefulString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .trim();
}

function sortedUniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map(normalizePath).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry === right[index]);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractBalancedJsonObject(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
      if (depth < 0) return null;
    }
  }

  return null;
}

function extractLabeledBareImplementationManifest(text: string): string | null {
  const labels = [...text.matchAll(/\baif-implementation-manifest\b/gi)];
  if (labels.length !== 1) return null;

  const label = labels[0];
  const labelEnd = (label.index ?? 0) + label[0].length;
  const objectStart = text.indexOf("{", labelEnd);
  if (objectStart < 0) return null;

  const separator = text.slice(labelEnd, objectStart);
  if (!/^[\s:*\-#>]*$/.test(separator)) return null;

  const rawJson = extractBalancedJsonObject(text, objectStart);
  if (!rawJson || !parseJsonObject(rawJson)) return null;
  return rawJson.trim();
}

function parseChangedFile(value: unknown): ImplementationManifestChangedFile | null {
  if (typeof value === "string" && value.trim()) {
    return { path: normalizePath(value), status: "unknown" };
  }
  if (!isObject(value) || !usefulString(value.path)) return null;
  const status =
    value.status === "added" ||
    value.status === "modified" ||
    value.status === "deleted" ||
    value.status === "renamed" ||
    value.status === "unknown"
      ? value.status
      : "unknown";
  return { path: normalizePath(value.path), status };
}

function isDevelopmentIntent(value: unknown): value is DevelopmentImplementationIntent {
  return DEVELOPMENT_IMPLEMENTATION_INTENTS.includes(value as DevelopmentImplementationIntent);
}

export function isDevelopmentImplementationIntent(
  intent: TaskIntent,
): intent is DevelopmentImplementationIntent {
  return DEVELOPMENT_IMPLEMENTATION_INTENTS.includes(intent as DevelopmentImplementationIntent);
}

export function extractImplementationManifestBlock(text: string | null | undefined): string | null {
  if (!text) return null;
  IMPLEMENTATION_MANIFEST_BLOCK_PATTERN.lastIndex = 0;
  const matches = [...text.matchAll(IMPLEMENTATION_MANIFEST_BLOCK_PATTERN)];
  if (matches.length === 1) return matches[0]?.[1]?.trim() ?? null;
  if (matches.length > 1) return null;

  JSON_FENCE_BLOCK_PATTERN.lastIndex = 0;
  const jsonMatches = [...text.matchAll(JSON_FENCE_BLOCK_PATTERN)].filter((match) => {
    const index = match.index ?? 0;
    const nearbyPrefix = text.slice(Math.max(0, index - 240), index);
    return /\baif-implementation-manifest\b/i.test(nearbyPrefix);
  });
  if (jsonMatches.length > 1) return null;
  if (jsonMatches.length === 1) return jsonMatches[0]?.[1]?.trim() ?? null;

  return extractLabeledBareImplementationManifest(text);
}

export function normalizeImplementationManifestJson(rawJson: string): string | null {
  const parsed = parseJsonObject(rawJson);
  return parsed ? stableStringify(normalizeImplementationManifestShape(parsed)) : null;
}

function normalizeImplementationManifestShape(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...parsed,
    changedFiles: normalizeChangedFilesShape(parsed.changedFiles),
    diffSummary: normalizeDiffSummaryShape(parsed.diffSummary),
    verificationEvidence: normalizeVerificationEvidenceShape(parsed.verificationEvidence),
    acceptanceCriteria: normalizeAcceptanceCriteriaShape(parsed.acceptanceCriteria),
    evidenceRefs: isStringArray(parsed.evidenceRefs) ? parsed.evidenceRefs : [],
    planChecklist: normalizePlanChecklistShape(parsed.planChecklist),
    reviewClosure: normalizeReviewClosureShape(parsed.reviewClosure),
    commitEvidence: normalizeCommitEvidenceShape(parsed.commitEvidence),
    knownLimitations: isStringArray(parsed.knownLimitations) ? parsed.knownLimitations : [],
  };
}

function normalizeChangedFilesShape(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (typeof entry === "string") return { path: normalizePath(entry), status: "unknown" };
    return entry;
  });
}

function normalizeDiffSummaryShape(value: unknown): unknown {
  if (typeof value === "string" && value.trim()) return { summary: value.trim() };
  return value;
}

function normalizeVerificationEvidenceShape(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry, index) => {
    if (!isObject(entry)) return entry;
    return {
      ...entry,
      id: usefulString(entry.id) ? entry.id : `ver-${index + 1}`,
      status: normalizeVerificationStatus(entry.status),
    };
  });
}

function normalizeVerificationStatus(value: unknown): unknown {
  if (value === "blocked_by_environment" || value === "blocked" || value === "not_run") {
    return "skipped";
  }
  if (value === "completed" || value === "success") {
    return "passed";
  }
  if (value === "error") {
    return "failed";
  }
  return value;
}

function normalizeAcceptanceCriteriaShape(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry, index) => {
    if (typeof entry === "string") {
      return {
        id: `ac-${index + 1}`,
        description: entry,
        status: "unsatisfied",
        evidenceRefs: [],
      };
    }
    if (!isObject(entry)) return entry;
    return {
      ...entry,
      id: usefulString(entry.id) ? entry.id : `ac-${index + 1}`,
      evidenceRefs: isStringArray(entry.evidenceRefs) ? entry.evidenceRefs : [],
    };
  });
}

function normalizePlanChecklistShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      total: value.length,
      completed: 0,
      pending: value.length,
      synced: false,
      pendingItems: value.filter((entry): entry is string => typeof entry === "string"),
      supersededItems: [],
      cancelledItems: [],
      waivedItems: [],
    };
  }
  if (isObject(value)) {
    return {
      ...value,
      pendingItems: isStringArray(value.pendingItems) ? value.pendingItems : [],
      supersededItems: normalizeChecklistDispositionsShape(value.supersededItems),
      cancelledItems: normalizeChecklistDispositionsShape(value.cancelledItems),
      waivedItems: normalizeChecklistDispositionsShape(value.waivedItems),
    };
  }
  return value;
}

function normalizeChecklistDispositionsShape(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!isObject(entry)) return { item: "", reason: "", evidenceRefs: [] };
    return {
      item: typeof entry.item === "string" ? entry.item : "",
      reason: typeof entry.reason === "string" ? entry.reason : "",
      evidenceRefs: isStringArray(entry.evidenceRefs) ? entry.evidenceRefs : [],
    };
  });
}

function normalizeReviewClosureShape(value: unknown): unknown {
  if (Array.isArray(value)) return { status: "pending", evidenceRefs: value.filter(usefulString) };
  if (isObject(value)) {
    if (
      value.status === "resolved" ||
      value.status === "complete" ||
      value.status === "completed" ||
      value.status === "success"
    ) {
      return { ...value, status: "passed" };
    }
    if (value.status === "not_required") {
      return { ...value, status: "skipped" };
    }
  }
  return value;
}

function normalizeCommitEvidenceShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { status: "not_committed", evidenceRefs: value.filter(usefulString) };
  }
  if (isObject(value) && value.status === "already_committed") {
    return { ...value, status: "committed" };
  }
  if (isObject(value) && value.status === "completed") {
    return { ...value, status: "committed" };
  }
  return value;
}

function coerceChecklistDispositions(value: unknown): ImplementationManifestChecklistDisposition[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!isObject(entry)) return { item: "", reason: "", evidenceRefs: [] };
    return {
      item: typeof entry.item === "string" ? entry.item : "",
      reason: typeof entry.reason === "string" ? entry.reason : "",
      evidenceRefs: isStringArray(entry.evidenceRefs) ? entry.evidenceRefs : [],
    };
  });
}

function expectedArtifactPathsFromManifest(parsed: Record<string, unknown> | null): string[] {
  if (!parsed || !Array.isArray(parsed.expectedArtifacts)) return [];
  return parsed.expectedArtifacts.flatMap((entry) => {
    if (!isObject(entry)) return [];
    if (typeof entry.path === "string") return [entry.path];
    return isStringArray(entry.paths) ? entry.paths : [];
  });
}

export function readAifPlanManifestSnapshot(
  plan: string | null | undefined,
): AifPlanManifestSnapshot {
  if (!plan)
    return {
      hash: null,
      acceptanceCriterionIds: [],
      scope: [],
      expectedArtifactPaths: [],
      verificationCommands: [],
    };
  PLAN_MANIFEST_BLOCK_PATTERN.lastIndex = 0;
  const matches = [...plan.matchAll(PLAN_MANIFEST_BLOCK_PATTERN)];
  if (matches.length !== 1) {
    return {
      hash: null,
      acceptanceCriterionIds: [],
      scope: [],
      expectedArtifactPaths: [],
      verificationCommands: [],
    };
  }
  const raw = matches[0]?.[1]?.trim() ?? "";
  const parsed = parseJsonObject(raw);
  const acceptanceCriterionIds =
    parsed && Array.isArray(parsed.acceptanceCriteria)
      ? [
          ...new Set(
            parsed.acceptanceCriteria
              .map((entry) => (isObject(entry) && usefulString(entry.id) ? entry.id.trim() : null))
              .filter((entry): entry is string => Boolean(entry)),
          ),
        ].sort((a, b) => a.localeCompare(b))
      : [];
  return {
    hash: sha256(parsed ? stableStringify(parsed) : raw),
    acceptanceCriterionIds,
    scope: parsed && isStringArray(parsed.scope) ? sortedUniquePaths(parsed.scope) : [],
    expectedArtifactPaths: sortedUniquePaths(expectedArtifactPathsFromManifest(parsed)),
    verificationCommands:
      parsed && isStringArray(parsed.verificationCommands)
        ? [...new Set(parsed.verificationCommands.map((entry) => entry.trim()).filter(Boolean))]
        : [],
  };
}

export function hashAifPlanManifest(plan: string | null | undefined): string | null {
  return readAifPlanManifestSnapshot(plan).hash;
}

function coerceManifest(rawJson: string): ImplementationManifest | null {
  const parsed = parseJsonObject(rawJson);
  if (!parsed || parsed.version !== 1 || !usefulString(parsed.taskId)) return null;
  if (!isDevelopmentIntent(parsed.intent)) return null;

  const changedFiles = Array.isArray(parsed.changedFiles)
    ? parsed.changedFiles
        .map(parseChangedFile)
        .filter((entry): entry is ImplementationManifestChangedFile => Boolean(entry))
    : null;
  const diffSummary = isObject(parsed.diffSummary) ? parsed.diffSummary : null;
  const verificationEvidence = Array.isArray(parsed.verificationEvidence)
    ? parsed.verificationEvidence
    : null;
  const acceptanceCriteria = Array.isArray(parsed.acceptanceCriteria)
    ? parsed.acceptanceCriteria
    : null;
  const planChecklist = isObject(parsed.planChecklist) ? parsed.planChecklist : null;
  const reviewClosure = isObject(parsed.reviewClosure) ? parsed.reviewClosure : null;
  const commitEvidence = isObject(parsed.commitEvidence) ? parsed.commitEvidence : null;

  if (
    !changedFiles ||
    !diffSummary ||
    !usefulString(diffSummary.summary) ||
    !verificationEvidence ||
    !acceptanceCriteria ||
    !isStringArray(parsed.evidenceRefs) ||
    !planChecklist ||
    !reviewClosure ||
    !commitEvidence ||
    !isStringArray(parsed.knownLimitations)
  ) {
    return null;
  }

  const verifications = verificationEvidence
    .map((entry): ImplementationManifestVerificationEvidence | null => {
      if (!isObject(entry) || !usefulString(entry.id) || !usefulString(entry.command)) return null;
      if (entry.status !== "passed" && entry.status !== "failed" && entry.status !== "skipped") {
        return null;
      }
      return {
        id: entry.id,
        command: entry.command,
        status: entry.status,
        outputSha256: typeof entry.outputSha256 === "string" ? entry.outputSha256 : null,
        outputPreview: typeof entry.outputPreview === "string" ? entry.outputPreview : null,
        ...(typeof entry.outputPreviewTruncated === "boolean"
          ? { outputPreviewTruncated: entry.outputPreviewTruncated }
          : {}),
      };
    })
    .filter((entry): entry is ImplementationManifestVerificationEvidence => Boolean(entry));

  const criteria = acceptanceCriteria
    .map((entry): ImplementationManifestAcceptanceCriterion | null => {
      if (!isObject(entry) || !usefulString(entry.id)) return null;
      if (
        entry.status !== "satisfied" &&
        entry.status !== "unsatisfied" &&
        entry.status !== "waived"
      ) {
        return null;
      }
      return {
        id: entry.id,
        description: typeof entry.description === "string" ? entry.description : undefined,
        status: entry.status,
        evidenceRefs: isStringArray(entry.evidenceRefs) ? entry.evidenceRefs : [],
        waiverAuthority: typeof entry.waiverAuthority === "string" ? entry.waiverAuthority : null,
        waiverEvidenceRefs: isStringArray(entry.waiverEvidenceRefs) ? entry.waiverEvidenceRefs : [],
        notes: typeof entry.notes === "string" ? entry.notes : null,
      };
    })
    .filter((entry): entry is ImplementationManifestAcceptanceCriterion => Boolean(entry));

  if (
    verifications.length !== verificationEvidence.length ||
    criteria.length !== acceptanceCriteria.length
  ) {
    return null;
  }

  const planChecklistValue = {
    total: typeof planChecklist.total === "number" ? planChecklist.total : -1,
    completed: typeof planChecklist.completed === "number" ? planChecklist.completed : -1,
    pending: typeof planChecklist.pending === "number" ? planChecklist.pending : -1,
    synced: planChecklist.synced === true,
    pendingItems: isStringArray(planChecklist.pendingItems) ? planChecklist.pendingItems : [],
    supersededItems: coerceChecklistDispositions(planChecklist.supersededItems),
    cancelledItems: coerceChecklistDispositions(planChecklist.cancelledItems),
    waivedItems: coerceChecklistDispositions(planChecklist.waivedItems),
  };
  if (
    planChecklistValue.total < 0 ||
    planChecklistValue.completed < 0 ||
    planChecklistValue.pending < 0
  ) {
    return null;
  }

  if (
    reviewClosure.status !== "pending" &&
    reviewClosure.status !== "passed" &&
    reviewClosure.status !== "skipped" &&
    reviewClosure.status !== "blocked"
  ) {
    return null;
  }
  if (
    commitEvidence.status !== "committed" &&
    commitEvidence.status !== "not_committed" &&
    commitEvidence.status !== "not_required"
  ) {
    return null;
  }

  return {
    version: 1,
    taskId: parsed.taskId,
    intent: parsed.intent,
    planManifestHash: typeof parsed.planManifestHash === "string" ? parsed.planManifestHash : null,
    changedFiles,
    diffSummary: {
      summary: diffSummary.summary,
      filesChanged: typeof diffSummary.filesChanged === "number" ? diffSummary.filesChanged : null,
      insertions: typeof diffSummary.insertions === "number" ? diffSummary.insertions : null,
      deletions: typeof diffSummary.deletions === "number" ? diffSummary.deletions : null,
    },
    verificationEvidence: verifications,
    acceptanceCriteria: criteria,
    evidenceRefs: parsed.evidenceRefs,
    planChecklist: planChecklistValue,
    reviewClosure: {
      status: reviewClosure.status,
      evidenceRefs: isStringArray(reviewClosure.evidenceRefs) ? reviewClosure.evidenceRefs : [],
      notes: typeof reviewClosure.notes === "string" ? reviewClosure.notes : null,
    },
    commitEvidence: {
      status: commitEvidence.status,
      commitSha: typeof commitEvidence.commitSha === "string" ? commitEvidence.commitSha : null,
      evidenceRefs: isStringArray(commitEvidence.evidenceRefs) ? commitEvidence.evidenceRefs : [],
      notes: typeof commitEvidence.notes === "string" ? commitEvidence.notes : null,
    },
    regressionExplanation:
      typeof parsed.regressionExplanation === "string" ? parsed.regressionExplanation : null,
    knownLimitations: parsed.knownLimitations,
  };
}

function issue(
  code: ImplementationManifestIssueCode,
  message: string,
): ImplementationManifestIssue {
  return { code, message };
}

function verificationHasOutputIdentity(entry: ImplementationManifestVerificationEvidence): boolean {
  return (
    entry.status === "passed" &&
    usefulString(entry.command) &&
    typeof entry.outputSha256 === "string" &&
    SHA256_HEX_PATTERN.test(entry.outputSha256) &&
    entry.outputSha256 !== EMPTY_OUTPUT_SHA256 &&
    !looksLikeFabricatedVerificationText(entry.outputPreview) &&
    !looksLikeFailedVerificationOutput(entry.outputPreview) &&
    usefulString(entry.outputPreview) &&
    typeof entry.outputPreviewTruncated === "boolean"
  );
}

export function normalizeImplementationVerificationCommandText(value: string): string {
  const normalized = value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b(npm|npx|pnpm|yarn|bun)\.cmd\b/g, "$1")
    .replace(/\b(?:npm|pnpm|yarn|bun)\s+exec\s+--\s+/g, "npx ")
    .replace(/\b(?:npm|pnpm|yarn|bun)\s+exec\s+/g, "npx ");
  return normalizeNpmTestCommandText(normalized);
}

function normalizeNpmTestCommandText(value: string): string {
  const tokens = value.split(" ").filter(Boolean);
  const npmIndex = tokens.indexOf("npm");
  if (npmIndex === -1) return value;

  const normalizedInvocation = normalizeNpmTestInvocationTokens(tokens.slice(npmIndex));
  if (!normalizedInvocation) return value;

  return [...tokens.slice(0, npmIndex), ...normalizedInvocation].join(" ");
}

function normalizeNpmTestInvocationTokens(tokens: string[]): string[] | null {
  if (tokens[0] !== "npm") return null;

  if (tokens[1] === "test") {
    return ["npm", "test", ...normalizeNpmTestArgs(tokens.slice(2))];
  }

  if (tokens[1] === "run" && tokens[2] === "test") {
    return ["npm", "test", ...normalizeNpmTestArgs(tokens.slice(3))];
  }

  const runTestIndex = tokens.findIndex(
    (token, index) =>
      index > 1 && token === "run" && tokens[index + 1] === "test" && tokens.includes("--"),
  );
  if (runTestIndex > 1) {
    return [
      "npm",
      "test",
      ...normalizeNpmTestArgs([
        ...tokens.slice(1, runTestIndex),
        ...tokens.slice(runTestIndex + 2),
      ]),
    ];
  }

  const testIndex = tokens.indexOf("test");
  if (testIndex <= 1 || !tokens.includes("--")) return null;

  const args = [...tokens.slice(1, testIndex), ...tokens.slice(testIndex + 1)];
  return ["npm", "test", ...normalizeNpmTestArgs(args)];
}

function normalizeNpmTestArgs(args: string[]): string[] {
  const cleanedArgs = args.filter(Boolean);
  if (cleanedArgs.length === 0) return [];

  const separatorIndex = cleanedArgs.indexOf("--");
  if (separatorIndex === 0) {
    return ["--", ...cleanedArgs.slice(1).filter((arg) => arg !== "--")];
  }
  if (separatorIndex > 0) {
    const beforeSeparator = cleanedArgs.slice(0, separatorIndex);
    const afterSeparator = cleanedArgs.slice(separatorIndex + 1);
    if (beforeSeparator.some(isNpmConfigArg) || afterSeparator.some((arg) => arg.startsWith("-"))) {
      return [...beforeSeparator, "--", ...afterSeparator];
    }
    return ["--", ...beforeSeparator, ...afterSeparator];
  }

  if (cleanedArgs.some(isNpmConfigArg)) return cleanedArgs;

  const positionalArgs = cleanedArgs.filter((arg) => !arg.startsWith("-"));
  const optionArgs = cleanedArgs.filter((arg) => arg.startsWith("-"));
  return positionalArgs.length > 0 ? ["--", ...positionalArgs, ...optionArgs] : cleanedArgs;
}

function isNpmConfigArg(arg: string): boolean {
  return (
    arg === "-w" ||
    arg === "--workspace" ||
    arg === "--workspaces" ||
    arg === "--if-present" ||
    arg.startsWith("--workspace=")
  );
}

function isRepositoryInspectionOnlyVerificationCommand(value: string): boolean {
  return /^(?:read_file|list_files|search_files|git_status)\b/i.test(value.trim());
}

function latestImplementationActivitySection(
  agentActivityLog: string | null | undefined,
): string[] {
  if (!agentActivityLog?.trim()) return [];
  const lines = agentActivityLog.split(/\r?\n/);
  const sections: string[][] = [];
  let currentSection: string[] | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/\bAgent:\s+(?:aif-implement|implement-coordinator)\b.*\bstarted\b/i.test(line)) {
      if (currentSection) sections.push(currentSection);
      currentSection = [line];
      continue;
    }
    if (!currentSection) continue;
    currentSection.push(line);
    if (/\bAgent:\s+(?:aif-implement|implement-coordinator)\b.*\bcomplete\b/i.test(line)) {
      sections.push(currentSection);
      currentSection = null;
    }
  }
  if (currentSection) sections.push(currentSection);
  const latestSectionWithTools = sections
    .slice()
    .reverse()
    .find((section) => section.some((line) => /\bTool:/i.test(line)));
  return latestSectionWithTools ?? sections.at(-1) ?? [];
}

function verificationCommandObservedInLatestImplementationActivity(input: {
  command: string;
  agentActivityLog?: string | null;
}): boolean {
  const normalizedCommand = normalizeImplementationVerificationCommandText(input.command);
  if (!normalizedCommand) return false;
  return latestImplementationActivitySection(input.agentActivityLog).some((line) => {
    const normalizedLine = normalizeImplementationVerificationCommandText(line);
    return normalizedLine.includes("tool:") && normalizedLine.includes(normalizedCommand);
  });
}

const EMPTY_OUTPUT_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const FABRICATED_VERIFICATION_PATTERN =
  /\b(?:placeholder|fake|fabricated|invented|assumed|simulated|not\s+executed|not\s+run|was\s+not\s+run|was\s+not\s+executed|did\s+not\s+run|did\s+not\s+execute|не\s+был[а-яё]*\s+выполн|не\s+выполн|плейсхолдер)\b/i;

function looksLikeFabricatedVerificationText(value: string | null | undefined): boolean {
  return typeof value === "string" && FABRICATED_VERIFICATION_PATTERN.test(value);
}

const FAILED_VERIFICATION_OUTPUT_PATTERNS = [
  /\berror\s+TS\d+:/i,
  /\bnpm\s+ERR!/i,
  /\b(?:command not found|not recognized as an internal or external command)\b/i,
  /\b(?:Cannot find module|Module not found)\b/i,
  /\b(?:build|compilation|compile)\s+failed\b/i,
  /\bTest Files\s+[1-9]\d*\s+failed\b/i,
  /\bTests\s+[1-9]\d*\s+failed\b/i,
  /\bFAIL\s+(?:[^\r\n]+\.(?:test|spec)\.[cm]?[jt]sx?|[^\r\n]+)\b/i,
  /\b[1-9]\d*\s+problems?\s+\([1-9]\d*\s+errors?\b/i,
];

function looksLikeFailedVerificationOutput(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    FAILED_VERIFICATION_OUTPUT_PATTERNS.some((pattern) => pattern.test(value))
  );
}

function manifestAdmitsFabricatedVerification(manifest: ImplementationManifest): boolean {
  return manifest.knownLimitations.some((entry) => looksLikeFabricatedVerificationText(entry));
}

function pathMatchesApprovedBoundary(path: string, boundary: string): boolean {
  if (boundary.includes("*")) {
    let pattern = "^";
    for (let index = 0; index < boundary.length; index += 1) {
      const char = boundary[index];
      const next = boundary[index + 1];
      if (char === "*" && next === "*") {
        pattern += ".*";
        index += 1;
        continue;
      }
      if (char === "*") {
        pattern += "[^/]*";
        continue;
      }
      pattern += char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
    }
    return new RegExp(`${pattern}$`).test(path);
  }
  return path === boundary || path.startsWith(`${boundary}/`);
}

function changedFileWithinApprovedPlan(
  path: string,
  planManifest: AifPlanManifestSnapshot,
): boolean {
  const approvedPaths = [...planManifest.scope, ...planManifest.expectedArtifactPaths];
  if (approvedPaths.length === 0) return true;
  return approvedPaths.some((approvedPath) => pathMatchesApprovedBoundary(path, approvedPath));
}

function normalizeChecklistItemText(value: string): string {
  return value
    .replace(/^\s*(?:[-*]\s*)?\[[ x~!]\]\s*/i, "")
    .replace(/^\*\*Task\s+\d+\s*:\s*(.+?)\*\*$/i, "$1")
    .replace(/^Task\s+\d+\s*:\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface PendingPlanChecklistItem {
  taskNumber: number;
  description: string;
  key: string;
}

function parseChecklistDispositionItem(value: string): {
  taskNumber: number | null;
  description: string;
} {
  const trimmed = value.replace(/^\s*(?:[-*]\s*)?\[[ x~!]\]\s*/i, "").trim();
  const boldMatch = trimmed.match(/^\*\*Task\s+(\d+)\s*:\s*(.+?)\*\*$/i);
  if (boldMatch) {
    return {
      taskNumber: Number(boldMatch[1]),
      description: normalizeChecklistItemText(boldMatch[2] ?? ""),
    };
  }
  const taskMatch = trimmed.match(/^Task\s+(\d+)\s*:\s*(.+)$/i);
  if (taskMatch) {
    return {
      taskNumber: Number(taskMatch[1]),
      description: normalizeChecklistItemText(taskMatch[2] ?? ""),
    };
  }
  return { taskNumber: null, description: normalizeChecklistItemText(trimmed) };
}

function checklistItemKey(taskNumber: number, description: string): string {
  return `${taskNumber}:${description}`;
}

function extractPendingPlanChecklistItems(planText?: string | null): PendingPlanChecklistItem[] {
  if (!planText) return [];
  const items: PendingPlanChecklistItem[] = [];
  const seen = new Set<string>();
  for (const line of planText.split("\n")) {
    const normalizedLine = line.replace(/^\s*#{1,6}\s*/, "").trim();
    const boldMatch = normalizedLine.match(
      /^(?:[-*]\s*)?\[([ x~!])\]\s+\*\*Task\s+(\d+)\s*:\s*(.+?)\*\*\s*(?:\(([^)]*)\))?\s*$/i,
    );
    const plainMatch = normalizedLine.match(
      /^(?:[-*]\s*)?\[([ x~!])\]\s+Task\s+(\d+)\s*:\s*(.+?)\s*(?:\(([^)]*)\))?\s*$/i,
    );
    const match = boldMatch ?? plainMatch;
    if (!match || match[1]?.toLowerCase() === "x") continue;
    const taskNumber = Number(match[2]);
    const description = normalizeChecklistItemText(match[3] ?? "");
    if (!Number.isFinite(taskNumber) || !description) continue;
    const key = checklistItemKey(taskNumber, description);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ taskNumber, description, key });
  }
  return items;
}

function checklistDispositionsCoverPendingItems(input: {
  manifest: ImplementationManifest;
  pendingPlanItems: PendingPlanChecklistItem[];
  allowedEvidenceRefs: Set<string>;
}): boolean {
  const pendingItems = input.pendingPlanItems;
  const pendingByKey = new Map(pendingItems.map((item) => [item.key, item] as const));
  const pendingByDescription = new Map<string, PendingPlanChecklistItem[]>();
  for (const item of pendingItems) {
    const matches = pendingByDescription.get(item.description) ?? [];
    matches.push(item);
    pendingByDescription.set(item.description, matches);
  }
  const covered = new Set<string>();
  const dispositions = [
    ...(input.manifest.planChecklist.supersededItems ?? []),
    ...(input.manifest.planChecklist.cancelledItems ?? []),
    ...(input.manifest.planChecklist.waivedItems ?? []),
  ];

  if (pendingItems.length === 0) return dispositions.length === 0;
  if (dispositions.length === 0) return false;

  for (const disposition of dispositions) {
    const item = parseChecklistDispositionItem(disposition.item);
    const reason = disposition.reason.trim();
    const evidenceRefs = disposition.evidenceRefs.filter(usefulString);
    const matchedPending =
      item.taskNumber !== null
        ? (pendingByKey.get(checklistItemKey(item.taskNumber, item.description)) ?? null)
        : pendingByDescription.get(item.description)?.length === 1
          ? pendingByDescription.get(item.description)?.[0]
          : null;
    if (
      !matchedPending ||
      !reason ||
      evidenceRefs.length === 0 ||
      evidenceRefs.some((ref) => !input.allowedEvidenceRefs.has(ref))
    ) {
      return false;
    }
    covered.add(matchedPending.key);
  }

  return pendingItems.every((item) => covered.has(item.key));
}

export function validateImplementationManifest(
  input: ValidateImplementationManifestInput,
): ImplementationManifestValidationResult {
  const intent = inferTaskIntent({
    taskIntent: input.task.taskIntent === "general" ? null : input.task.taskIntent,
    isFix: input.task.isFix,
    title: input.task.title,
    description: input.task.description,
    roadmapAlias: input.task.roadmapAlias,
    tags: input.task.tags,
  });
  const required = isDevelopmentImplementationIntent(intent);
  const planManifest = readAifPlanManifestSnapshot(input.task.plan);
  const planManifestHash = planManifest.hash;
  const issues: ImplementationManifestIssue[] = [];

  if (!required) {
    return {
      ok: true,
      required,
      intent,
      manifest: null,
      normalizedJson: null,
      planManifestHash,
      issues,
    };
  }

  if (!input.manifestJson?.trim()) {
    return {
      ok: false,
      required,
      intent,
      manifest: null,
      normalizedJson: null,
      planManifestHash,
      issues: [
        issue(
          "missing_implementation_manifest",
          "Development tasks require a structured implementation manifest before review or terminal completion.",
        ),
      ],
    };
  }

  const normalizedJson = normalizeImplementationManifestJson(input.manifestJson);
  const manifest = normalizedJson ? coerceManifest(normalizedJson) : null;
  if (!manifest || !normalizedJson) {
    return {
      ok: false,
      required,
      intent,
      manifest: null,
      normalizedJson: null,
      planManifestHash,
      issues: [
        issue(
          "invalid_implementation_manifest",
          "Implementation manifest must be valid version 1 JSON with required development evidence fields.",
        ),
      ],
    };
  }

  if (manifest.taskId !== input.task.id || manifest.intent !== intent) {
    issues.push(
      issue(
        "invalid_implementation_manifest",
        `Implementation manifest task binding must match task ${input.task.id} and intent ${intent}.`,
      ),
    );
  }
  if (planManifestHash && manifest.planManifestHash !== planManifestHash) {
    issues.push(
      issue(
        "implementation_plan_manifest_hash_mismatch",
        "Implementation manifest planManifestHash does not match the approved aif-plan-manifest block.",
      ),
    );
  }

  const manifestChangedFiles = sortedUniquePaths(manifest.changedFiles.map((entry) => entry.path));
  const actualChangedFiles = sortedUniquePaths([
    ...input.meaningfulChangedFiles,
    ...(input.trustedCommittedChangedFiles ?? []),
  ]);
  if (!arraysEqual(manifestChangedFiles, actualChangedFiles)) {
    issues.push(
      issue(
        "implementation_changed_files_mismatch",
        `Implementation manifest changedFiles must match the actual meaningful changed files. Manifest: ${manifestChangedFiles.join(", ") || "(none)"}; actual: ${actualChangedFiles.join(", ") || "(none)"}.`,
      ),
    );
  }

  const dirtyNotInManifest = sortedUniquePaths(input.dirtyChangedFiles).filter(
    (file) => !manifestChangedFiles.includes(file),
  );
  if (dirtyNotInManifest.length > 0) {
    issues.push(
      issue(
        "unintended_uncommitted_changes",
        `Unintended dirty files are not recorded in the implementation manifest: ${dirtyNotInManifest.join(", ")}.`,
      ),
    );
  }

  const outOfScopeChangedFiles = manifestChangedFiles.filter(
    (file) => !changedFileWithinApprovedPlan(file, planManifest),
  );
  if (outOfScopeChangedFiles.length > 0) {
    issues.push(
      issue(
        "implementation_scope_mismatch",
        `Implementation manifest changedFiles include path(s) outside the approved plan manifest scope or expected artifacts: ${outOfScopeChangedFiles.join(", ")}.`,
      ),
    );
  }

  const passedEntries = manifest.verificationEvidence.filter((entry) => entry.status === "passed");
  const passedEntriesWithoutIdentity = passedEntries.filter(
    (entry) => !verificationHasOutputIdentity(entry),
  );
  const contradictoryPassedEntries = passedEntries.filter(
    (entry) =>
      looksLikeFabricatedVerificationText(entry.outputPreview) ||
      looksLikeFailedVerificationOutput(entry.outputPreview),
  );
  const unsupportedPassedEntries = passedEntries.filter((entry) =>
    isRepositoryInspectionOnlyVerificationCommand(entry.command),
  );
  const trustedVerificationCommands = new Set(
    (input.trustedVerificationCommands ?? [])
      .map(normalizeImplementationVerificationCommandText)
      .filter(usefulString),
  );
  const unobservedPassedEntries = passedEntries.filter((entry) => {
    const normalizedCommand = normalizeImplementationVerificationCommandText(entry.command);
    return (
      usefulString(normalizedCommand) &&
      !trustedVerificationCommands.has(normalizedCommand) &&
      !verificationCommandObservedInLatestImplementationActivity({
        command: entry.command,
        agentActivityLog: input.task.agentActivityLog,
      })
    );
  });
  const admitsFabricatedVerification = manifestAdmitsFabricatedVerification(manifest);
  const passedVerification =
    passedEntries.length > 0 &&
    passedEntriesWithoutIdentity.length === 0 &&
    !admitsFabricatedVerification &&
    contradictoryPassedEntries.length === 0 &&
    unsupportedPassedEntries.length === 0 &&
    unobservedPassedEntries.length === 0;
  if (
    contradictoryPassedEntries.length > 0 ||
    (passedEntries.length > 0 && admitsFabricatedVerification)
  ) {
    issues.push(
      issue(
        "contradictory_verification_claim",
        "Implementation manifest cannot mark verification as passed while its evidence or limitations state that the command was not actually executed or printed a compiler/test failure.",
      ),
    );
  }
  if (unobservedPassedEntries.length > 0) {
    issues.push(
      issue(
        "verification_command_not_observed",
        `Passed verification command(s) were not observed in the latest implementation activity: ${unobservedPassedEntries.map((entry) => entry.command).join(", ")}.`,
      ),
    );
  }
  if (unsupportedPassedEntries.length > 0) {
    issues.push(
      issue(
        "unsupported_verification_command",
        `Repository-inspection tool(s) cannot be marked as passed implementation verification: ${unsupportedPassedEntries.map((entry) => entry.command).join(", ")}. Run a concrete build/test/lint shell command, or mark verification as skipped/failed with the observed limitation.`,
      ),
    );
  }
  if (!passedVerification) {
    issues.push(
      issue(
        "missing_verification_evidence",
        admitsFabricatedVerification
          ? "Development tasks cannot satisfy verification with placeholder, simulated, or explicitly unexecuted evidence."
          : "Development tasks require every passing verification evidence item to include command, non-empty outputSha256, outputPreview, and outputPreviewTruncated.",
      ),
    );
  }

  const allowedEvidenceRefs = new Set(
    manifest.verificationEvidence
      .filter(verificationHasOutputIdentity)
      .map((entry) => entry.id)
      .filter(usefulString),
  );
  const manifestAcceptanceCriteriaById = new Map(
    manifest.acceptanceCriteria.map((entry) => [entry.id, entry] as const),
  );
  const missingPlanAcceptanceCriteria = planManifest.acceptanceCriterionIds.filter(
    (criterionId) => !manifestAcceptanceCriteriaById.has(criterionId),
  );
  const unsupportedCriteria = manifest.acceptanceCriteria.filter((entry) => {
    if (entry.status === "satisfied") {
      const evidenceRefs = entry.evidenceRefs.filter(usefulString);
      return evidenceRefs.length === 0 || evidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref));
    }
    if (entry.status === "waived") {
      const waiverEvidenceRefs = (entry.waiverEvidenceRefs ?? []).filter(usefulString);
      return (
        !usefulString(entry.waiverAuthority) ||
        waiverEvidenceRefs.length === 0 ||
        waiverEvidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref))
      );
    }
    return true;
  });
  if (
    manifest.acceptanceCriteria.length === 0 ||
    unsupportedCriteria.length > 0 ||
    missingPlanAcceptanceCriteria.length > 0
  ) {
    issues.push(
      issue(
        "missing_acceptance_evidence",
        missingPlanAcceptanceCriteria.length > 0
          ? `Implementation manifest must cover every approved plan acceptance criterion. Missing: ${missingPlanAcceptanceCriteria.join(", ")}.`
          : "Every implementation acceptance criterion must be satisfied with evidence, or waived with explicit waiver authority and concrete verification evidence refs.",
      ),
    );
  }

  const checklistCountsConsistent =
    manifest.planChecklist.total ===
    manifest.planChecklist.completed + manifest.planChecklist.pending;
  const actualPendingChecklistItems = extractPendingPlanChecklistItems(input.task.plan);
  const hasChecklistDispositions =
    (manifest.planChecklist.supersededItems ?? []).length > 0 ||
    (manifest.planChecklist.cancelledItems ?? []).length > 0 ||
    (manifest.planChecklist.waivedItems ?? []).length > 0;
  const checklistDispositionsValid = checklistDispositionsCoverPendingItems({
    manifest,
    pendingPlanItems: actualPendingChecklistItems,
    allowedEvidenceRefs,
  });
  const checklistHasCompleteCounts =
    manifest.planChecklist.total > 0 &&
    manifest.planChecklist.pending === 0 &&
    manifest.planChecklist.completed === manifest.planChecklist.total &&
    actualPendingChecklistItems.length === 0;
  const checklistPendingItemsDisposed =
    actualPendingChecklistItems.length > 0 &&
    manifest.planChecklist.pending === actualPendingChecklistItems.length &&
    checklistDispositionsValid;
  const checklistSatisfiesActualPlan =
    actualPendingChecklistItems.length > 0
      ? checklistPendingItemsDisposed
      : checklistHasCompleteCounts;
  if (
    !checklistSatisfiesActualPlan ||
    !checklistCountsConsistent ||
    manifest.planChecklist.completed > manifest.planChecklist.total ||
    manifest.planChecklist.total <= 0 ||
    (hasChecklistDispositions && !checklistDispositionsValid)
  ) {
    issues.push(
      issue(
        "plan_checklist_drift",
        "Implementation manifest indicates the plan checklist is not fully synced or has inconsistent counts.",
      ),
    );
  }

  const reviewClosureEvidenceRefs = manifest.reviewClosure.evidenceRefs.filter(usefulString);
  if (
    input.phase === "completion" &&
    input.task.skipReview !== true &&
    !input.task.reviewComments?.trim() &&
    (manifest.reviewClosure.status !== "passed" ||
      reviewClosureEvidenceRefs.length === 0 ||
      reviewClosureEvidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref)))
  ) {
    issues.push(
      issue(
        "missing_review_closure_evidence",
        "Completion requires review closure evidence from review comments or concrete implementation manifest reviewClosure evidence refs.",
      ),
    );
  }

  if (intent === "fix" && !usefulString(manifest.regressionExplanation)) {
    issues.push(
      issue(
        "missing_fix_regression_explanation",
        "Fix tasks require a regression explanation in the implementation manifest.",
      ),
    );
  }

  return {
    ok: issues.length === 0,
    required,
    intent,
    manifest,
    normalizedJson,
    planManifestHash,
    issues,
  };
}
