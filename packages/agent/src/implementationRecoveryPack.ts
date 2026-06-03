import { createHash } from "node:crypto";
import {
  readAifPlanManifestSnapshot,
  redactProviderText,
  type TaskIntent,
  type TaskSplitProposedChild,
  type TaskStatus,
} from "@aif/shared";
import { readGitWorktreeReworkSnapshot, type GitWorktreeReworkSnapshot } from "./reworkSnapshot.js";

export const IMPLEMENTATION_RECOVERY_PACK_KIND = "implementation_timeout_recovery_pack";
export const IMPLEMENTATION_RECOVERY_PACK_VERSION = 1;

const MAX_TEXT = 600;
const MAX_SHORT_TEXT = 180;
const MAX_ITEMS = 12;
const MAX_CHILDREN = 3;

export interface ImplementationRecoveryTaskInput {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  taskIntent?: TaskIntent | null;
  plan?: string | null;
  implementationManifestJson?: string | null;
  branchName?: string | null;
  worktreePath?: string | null;
  parentTaskId?: string | null;
}

export interface RecoveryChecklistSummary {
  completed: string[];
  pending: string[];
  blockedByTimeout: string[];
}

export interface RecoveryVerificationSummary {
  status: "recorded" | "not_recorded" | "invalid";
  entries: Array<{
    command: string | null;
    status: string;
    outputSha256: string | null;
    outputPreview: string | null;
    outputPreviewTruncated: boolean;
  }>;
  acceptanceCriteria: Array<{
    id: string;
    status: string;
    summary: string;
  }>;
}

export interface ImplementationRecoveryPack {
  version: typeof IMPLEMENTATION_RECOVERY_PACK_VERSION;
  kind: typeof IMPLEMENTATION_RECOVERY_PACK_KIND;
  generatedAt: string;
  sourceRef: string;
  summary: string;
  task: {
    id: string;
    projectId: string;
    title: string;
    taskIntent: TaskIntent | "general";
    statusBeforeBlock: TaskStatus;
    blockedFromStatus: TaskStatus;
    branchName: string | null;
    worktreePath: string | null;
  };
  exhaustion: {
    reasonFamily: "implementation_runtime_exhausted_requires_split";
    category: string;
    status: string;
    retryCount: number;
    retryAfterSource: "none";
    rawProviderDiagnosticsIncluded: false;
  };
  changedFiles: {
    source: "git" | "unavailable";
    baselineHeadSha: string | null;
    changedFilesDigest: string | null;
    changedFilesSummary: string[];
    hasChanges: boolean;
    truncated: boolean;
  };
  checklist: RecoveryChecklistSummary;
  verification: RecoveryVerificationSummary;
  remainingAcceptance: string[];
  proposedChildren: TaskSplitProposedChild[];
  redaction: {
    applied: true;
    rawProviderDiagnosticsIncluded: false;
  };
}

export interface BuildImplementationRecoveryPackInput {
  task: ImplementationRecoveryTaskInput;
  projectRoot?: string | null;
  generatedAt?: string;
  sourceStatus: TaskStatus;
  blockedFromStatus: TaskStatus;
  retryCount: number;
  runtimeCategory?: string | null;
  runtimeStatus?: string | null;
  sourceRef?: string | null;
  getGitSnapshot?: (projectRoot: string) => GitWorktreeReworkSnapshot | null;
}

function sanitizeText(value: unknown, maxLength = MAX_TEXT): string {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  return redactProviderText(raw, { maxLength }).trim();
}

function sanitizeNullable(value: unknown, maxLength = MAX_TEXT): string | null {
  const sanitized = sanitizeText(value, maxLength);
  return sanitized.length > 0 ? sanitized : null;
}

function uniqueBounded(values: string[], limit = MAX_ITEMS): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const sanitized = sanitizeText(value);
    if (!sanitized || seen.has(sanitized)) continue;
    seen.add(sanitized);
    result.push(sanitized);
    if (result.length >= limit) break;
  }
  return result;
}

function parseChecklist(plan: string | null | undefined): RecoveryChecklistSummary {
  const completed: string[] = [];
  const pending: string[] = [];
  const pattern = /^\s*(?:[-*]|\d+\.)\s+\[([ xX])\]\s+(.+)$/gm;
  for (const match of plan?.matchAll(pattern) ?? []) {
    const marker = match[1] ?? " ";
    const text = match[2] ?? "";
    if (/x/i.test(marker)) completed.push(text);
    else pending.push(text);
  }
  const pendingItems = uniqueBounded(pending);
  return {
    completed: uniqueBounded(completed),
    pending: pendingItems,
    blockedByTimeout: pendingItems,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function parseImplementationManifest(
  manifestJson: string | null | undefined,
): RecoveryVerificationSummary {
  if (!manifestJson?.trim()) {
    return { status: "not_recorded", entries: [], acceptanceCriteria: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestJson);
  } catch {
    return { status: "invalid", entries: [], acceptanceCriteria: [] };
  }

  const manifest = asRecord(parsed);
  if (!manifest) return { status: "invalid", entries: [], acceptanceCriteria: [] };

  const entries = (
    Array.isArray(manifest.verificationEvidence) ? manifest.verificationEvidence : []
  )
    .map((entry): RecoveryVerificationSummary["entries"][number] | null => {
      const record = asRecord(entry);
      if (!record) return null;
      return {
        command: sanitizeNullable(record.command, MAX_TEXT),
        status: sanitizeText(record.status ?? "unknown", MAX_SHORT_TEXT) || "unknown",
        outputSha256: sanitizeNullable(record.outputSha256, MAX_SHORT_TEXT),
        outputPreview: sanitizeNullable(record.outputPreview, MAX_TEXT),
        outputPreviewTruncated: record.outputPreviewTruncated === true,
      };
    })
    .filter((entry): entry is RecoveryVerificationSummary["entries"][number] => Boolean(entry))
    .slice(0, MAX_ITEMS);

  const acceptanceCriteria = (
    Array.isArray(manifest.acceptanceCriteria) ? manifest.acceptanceCriteria : []
  )
    .map((entry): RecoveryVerificationSummary["acceptanceCriteria"][number] | null => {
      const record = asRecord(entry);
      if (!record) return null;
      const refs = readStringArray(record.evidenceRefs)
        .map((ref) => sanitizeText(ref, MAX_SHORT_TEXT))
        .filter(Boolean)
        .slice(0, 4);
      const summaryParts = [
        sanitizeText(record.description, MAX_TEXT),
        refs.length > 0 ? `evidence: ${refs.join(", ")}` : "",
      ].filter(Boolean);
      return {
        id: sanitizeText(record.id ?? "criterion", MAX_SHORT_TEXT) || "criterion",
        status: sanitizeText(record.status ?? "unknown", MAX_SHORT_TEXT) || "unknown",
        summary: sanitizeText(summaryParts.join("; "), MAX_TEXT),
      };
    })
    .filter((entry): entry is RecoveryVerificationSummary["acceptanceCriteria"][number] =>
      Boolean(entry),
    )
    .slice(0, MAX_ITEMS);

  return {
    status: "recorded",
    entries,
    acceptanceCriteria,
  };
}

function readChangedFiles(
  input: BuildImplementationRecoveryPackInput,
): ImplementationRecoveryPack["changedFiles"] {
  const snapshot =
    input.projectRoot && input.projectRoot.trim()
      ? (input.getGitSnapshot ?? readGitWorktreeReworkSnapshot)(input.projectRoot)
      : null;
  if (!snapshot) {
    return {
      source: "unavailable",
      baselineHeadSha: null,
      changedFilesDigest: null,
      changedFilesSummary: [],
      hasChanges: false,
      truncated: false,
    };
  }
  const summary = uniqueBounded(snapshot.changedFilesSummary, MAX_ITEMS);
  return {
    source: "git",
    baselineHeadSha: sanitizeNullable(snapshot.baselineHeadSha, MAX_SHORT_TEXT),
    changedFilesDigest: sanitizeNullable(snapshot.changedFilesDigest, MAX_SHORT_TEXT),
    changedFilesSummary: summary,
    hasChanges: summary.length > 0,
    truncated: snapshot.changedFilesSummary.length > summary.length,
  };
}

function normalizeRecoveryBoundaryPath(value: string): string | null {
  const normalized = sanitizeText(value, MAX_TEXT).replaceAll("\\", "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null;
  if (normalized.split("/").includes("..")) return null;
  return normalized;
}

function changedFileSummaryPath(value: string): string | null {
  const match = sanitizeText(value, MAX_TEXT).match(/^(?:[ MARCUD?!]{1,3})\s+(.+)$/);
  return normalizeRecoveryBoundaryPath(match?.[1] ?? value);
}

function recoveryFileBoundariesFromPlan(
  task: ImplementationRecoveryTaskInput,
  changedFiles: ImplementationRecoveryPack["changedFiles"],
): string[] {
  const planManifest = readAifPlanManifestSnapshot(task.plan);
  const manifestPaths = [...planManifest.scope, ...planManifest.expectedArtifactPaths]
    .map(normalizeRecoveryBoundaryPath)
    .filter((entry): entry is string => Boolean(entry));
  const sourcePaths =
    planManifest.hash && manifestPaths.length > 0
      ? manifestPaths
      : changedFiles.changedFilesSummary
          .map(changedFileSummaryPath)
          .filter((entry): entry is string => Boolean(entry));
  return [...new Set(sourcePaths)];
}

function buildRemainingAcceptance(
  checklist: RecoveryChecklistSummary,
  verification: RecoveryVerificationSummary,
): string[] {
  const remaining = [
    ...checklist.pending,
    ...verification.acceptanceCriteria
      .filter((entry) => entry.status !== "satisfied")
      .map((entry) => `${entry.id}: ${entry.status}${entry.summary ? ` - ${entry.summary}` : ""}`),
    ...verification.entries
      .filter((entry) => entry.status !== "passed")
      .map((entry) => `verification ${entry.status}${entry.command ? `: ${entry.command}` : ""}`),
  ];
  return uniqueBounded(remaining, MAX_ITEMS);
}

function childDescription(input: {
  taskId: string;
  sourceRef: string;
  changedFilesDigest: string | null;
  remainingWork: string;
}): string {
  const lines = [
    `Source task: ${input.taskId}.`,
    `Recovery pack: ${input.sourceRef}.`,
    input.changedFilesDigest ? `Changed-files digest: ${input.changedFilesDigest}.` : "",
    `Remaining work: ${input.remainingWork}.`,
    "Use the recovery pack and repository state only; do not rely on raw provider diagnostics.",
    "Run focused verification for this child before review.",
  ].filter(Boolean);
  return sanitizeText(lines.join("\n"), 1200);
}

function buildProposedChildren(input: {
  task: ImplementationRecoveryTaskInput;
  sourceRef: string;
  changedFiles: ImplementationRecoveryPack["changedFiles"];
  remainingAcceptance: string[];
  checklist: RecoveryChecklistSummary;
}): TaskSplitProposedChild[] {
  const intent = input.task.taskIntent ?? "general";
  const pending = input.checklist.pending.slice(0, MAX_CHILDREN);
  const fileBoundaries = recoveryFileBoundariesFromPlan(input.task, input.changedFiles);
  const boundaryFields = fileBoundaries.length > 0 ? { fileBoundaries } : {};
  const baseTags = ["implementation-recovery", `source:${input.task.id}`].map((tag) =>
    sanitizeText(tag, MAX_SHORT_TEXT),
  );

  if (pending.length > 0) {
    return pending.map((item, index) => ({
      title: sanitizeText(`Continue implementation: ${item}`, MAX_SHORT_TEXT),
      description: childDescription({
        taskId: input.task.id,
        sourceRef: input.sourceRef,
        changedFilesDigest: input.changedFiles.changedFilesDigest,
        remainingWork: item,
      }),
      taskIntent: intent,
      phase: 1,
      phaseName: "Implementation recovery",
      sequence: index + 1,
      tags: baseTags,
      ...boundaryFields,
    }));
  }

  if (input.changedFiles.hasChanges) {
    const summary = input.changedFiles.changedFilesSummary.slice(0, 4).join(", ");
    return [
      {
        title: "Validate and finish partial implementation",
        description: childDescription({
          taskId: input.task.id,
          sourceRef: input.sourceRef,
          changedFilesDigest: input.changedFiles.changedFilesDigest,
          remainingWork: summary || "validate the partial changed-file set",
        }),
        taskIntent: intent,
        phase: 1,
        phaseName: "Implementation recovery",
        sequence: 1,
        tags: baseTags,
        ...boundaryFields,
      },
    ];
  }

  return [
    {
      title: "Split implementation after timeout",
      description: childDescription({
        taskId: input.task.id,
        sourceRef: input.sourceRef,
        changedFilesDigest: input.changedFiles.changedFilesDigest,
        remainingWork:
          input.remainingAcceptance[0] ??
          "decompose the original implementation into smaller cards before retry",
      }),
      taskIntent: intent,
      phase: 1,
      phaseName: "Implementation recovery",
      sequence: 1,
      tags: baseTags,
      ...boundaryFields,
    },
  ];
}

export function buildImplementationRecoveryPack(
  input: BuildImplementationRecoveryPackInput,
): ImplementationRecoveryPack {
  const sourceRef = sanitizeText(
    input.sourceRef ?? `implementation-recovery-pack:${input.task.id}`,
    MAX_TEXT,
  );
  const checklist = parseChecklist(input.task.plan);
  const verification = parseImplementationManifest(input.task.implementationManifestJson);
  const changedFiles = readChangedFiles(input);
  const remainingAcceptance = buildRemainingAcceptance(checklist, verification);
  const proposedChildren = buildProposedChildren({
    task: input.task,
    sourceRef,
    changedFiles,
    remainingAcceptance,
    checklist,
  });
  const status = sanitizeText(input.runtimeStatus ?? "runtime_exhausted", MAX_SHORT_TEXT);
  const category = sanitizeText(input.runtimeCategory ?? "unknown", MAX_SHORT_TEXT);
  const taskIntent = input.task.taskIntent ?? "general";
  const summary = sanitizeText(
    `Implementation recovery pack for ${input.task.id}: ${remainingAcceptance.length} remaining item(s), ${changedFiles.changedFilesSummary.length} changed file(s).`,
  );

  return {
    version: IMPLEMENTATION_RECOVERY_PACK_VERSION,
    kind: IMPLEMENTATION_RECOVERY_PACK_KIND,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceRef,
    summary,
    task: {
      id: sanitizeText(input.task.id, MAX_SHORT_TEXT),
      projectId: sanitizeText(input.task.projectId, MAX_SHORT_TEXT),
      title: sanitizeText(input.task.title, MAX_TEXT),
      taskIntent,
      statusBeforeBlock: input.sourceStatus,
      blockedFromStatus: input.blockedFromStatus,
      branchName: sanitizeNullable(input.task.branchName, MAX_TEXT),
      worktreePath: sanitizeNullable(input.task.worktreePath, MAX_TEXT),
    },
    exhaustion: {
      reasonFamily: "implementation_runtime_exhausted_requires_split",
      category,
      status,
      retryCount: input.retryCount,
      retryAfterSource: "none",
      rawProviderDiagnosticsIncluded: false,
    },
    changedFiles,
    checklist,
    verification,
    remainingAcceptance,
    proposedChildren,
    redaction: {
      applied: true,
      rawProviderDiagnosticsIncluded: false,
    },
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildImplementationRecoverySplitProposalFingerprint(
  pack: ImplementationRecoveryPack,
): string {
  const stableInput = {
    version: pack.version,
    kind: pack.kind,
    task: pack.task,
    exhaustion: pack.exhaustion,
    changedFiles: pack.changedFiles,
    checklist: pack.checklist,
    verification: pack.verification,
    remainingAcceptance: pack.remainingAcceptance,
    proposedChildren: pack.proposedChildren,
    redaction: pack.redaction,
  };
  return createHash("sha256").update(stableJson(stableInput)).digest("hex");
}

function bulletList(items: string[], empty: string): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${empty}`];
}

export function renderImplementationRecoveryPackMarkdown(pack: ImplementationRecoveryPack): string {
  const lines = [
    "# Implementation Timeout Recovery Pack",
    "",
    `- Task: ${pack.task.id}`,
    `- Generated: ${pack.generatedAt}`,
    `- Reason: ${pack.exhaustion.reasonFamily}`,
    `- Runtime: category=${pack.exhaustion.category}; status=${pack.exhaustion.status}`,
    `- Retry: none; retryCount=${pack.exhaustion.retryCount}`,
    `- Raw provider diagnostics included: ${pack.exhaustion.rawProviderDiagnosticsIncluded}`,
    "",
    "## Changed Files",
    "",
    `- Source: ${pack.changedFiles.source}`,
    `- Baseline: ${pack.changedFiles.baselineHeadSha ?? "unknown"}`,
    `- Digest: ${pack.changedFiles.changedFilesDigest ?? "none"}`,
    `- Has changes: ${pack.changedFiles.hasChanges}`,
    ...bulletList(pack.changedFiles.changedFilesSummary, "No changed files recorded."),
    "",
    "## Remaining Acceptance",
    "",
    ...bulletList(pack.remainingAcceptance, "No pending acceptance items were recorded."),
    "",
    "## Verification",
    "",
    `- Status: ${pack.verification.status}`,
    ...bulletList(
      pack.verification.entries.map(
        (entry) =>
          `${entry.status}${entry.command ? `: ${entry.command}` : ""}${entry.outputSha256 ? ` (${entry.outputSha256})` : ""}`,
      ),
      "No verification evidence was recorded.",
    ),
    "",
    "## Proposed Next Cards",
    "",
    ...pack.proposedChildren.flatMap((child) => [
      `- ${child.title}`,
      `  ${child.description.replace(/\n/g, "\n  ")}`,
    ]),
  ];
  return sanitizeText(lines.join("\n"), 12000);
}
