import {
  extractImplementationManifestBlock,
  normalizeImplementationManifestJson,
  type ImplementationManifest,
} from "./implementationManifest.js";
import { redactProviderText } from "./runtimeLimitUtils.js";
import type { TaskStatus } from "./types.js";

export interface RetryContextTask {
  id: string;
  title?: string | null;
  status?: TaskStatus | string | null;
  blockedFromStatus?: TaskStatus | string | null;
  blockedReason?: string | null;
  retryAfter?: string | null;
  retryCount?: number | null;
  plan?: string | null;
  implementationLog?: string | null;
  implementationManifest?: ImplementationManifest | null;
  implementationManifestJson?: string | null;
  reviewComments?: string | null;
  agentActivityLog?: string | null;
  manualReviewRequired?: boolean | null;
  tokenTotal?: number | null;
}

export interface RetryContextThresholds {
  activityMaxChars: number;
  activityMaxLines: number;
  activityMaxEstimatedTokens: number;
  runtimeUsageMaxTokens: number;
}

export interface RetryContextDecision {
  compacted: boolean;
  reasons: string[];
  activityChars: number;
  activityLines: number;
  estimatedTokens: number;
  runtimeTokens: number | null;
  prompt: string;
}

export const DEFAULT_RETRY_CONTEXT_THRESHOLDS: RetryContextThresholds = {
  activityMaxChars: 32_000,
  activityMaxLines: 500,
  activityMaxEstimatedTokens: 8_000,
  runtimeUsageMaxTokens: 24_000,
};

const MAX_FIELD_CHARS = 1_200;
const MAX_LIST_ITEMS = 12;

export function getRetryContextThresholds(
  env: Partial<Record<string, unknown>> = process.env,
): RetryContextThresholds {
  return {
    activityMaxChars: readPositiveInt(
      env.AIF_RETRY_CONTEXT_ACTIVITY_MAX_CHARS,
      DEFAULT_RETRY_CONTEXT_THRESHOLDS.activityMaxChars,
    ),
    activityMaxLines: readPositiveInt(
      env.AIF_RETRY_CONTEXT_ACTIVITY_MAX_LINES,
      DEFAULT_RETRY_CONTEXT_THRESHOLDS.activityMaxLines,
    ),
    activityMaxEstimatedTokens: readPositiveInt(
      env.AIF_RETRY_CONTEXT_ACTIVITY_MAX_ESTIMATED_TOKENS,
      DEFAULT_RETRY_CONTEXT_THRESHOLDS.activityMaxEstimatedTokens,
    ),
    runtimeUsageMaxTokens: readPositiveInt(
      env.AIF_RETRY_CONTEXT_RUNTIME_USAGE_MAX_TOKENS,
      DEFAULT_RETRY_CONTEXT_THRESHOLDS.runtimeUsageMaxTokens,
    ),
  };
}

export function buildRetryContextForRuntimePrompt(
  task: RetryContextTask,
  thresholds: RetryContextThresholds = getRetryContextThresholds(),
): RetryContextDecision {
  const activity = task.agentActivityLog ?? "";
  const activityChars = activity.length;
  const activityLines = activity ? activity.split(/\r?\n/).length : 0;
  const estimatedTokens = Math.ceil(activityChars / 4);
  const runtimeTokens =
    typeof task.tokenTotal === "number" && Number.isFinite(task.tokenTotal)
      ? task.tokenTotal
      : null;
  const reasons: string[] = [];

  if (activityChars > thresholds.activityMaxChars) reasons.push("activity_chars");
  if (activityLines > thresholds.activityMaxLines) reasons.push("activity_lines");
  if (estimatedTokens > thresholds.activityMaxEstimatedTokens) reasons.push("estimated_tokens");
  if (runtimeTokens !== null && runtimeTokens > thresholds.runtimeUsageMaxTokens) {
    reasons.push("runtime_tokens");
  }

  return {
    compacted: reasons.length > 0,
    reasons,
    activityChars,
    activityLines,
    estimatedTokens,
    runtimeTokens,
    prompt: reasons.length > 0 ? renderCompactRetryContext(task, reasons) : "",
  };
}

function renderCompactRetryContext(task: RetryContextTask, reasons: string[]): string {
  const manifest =
    task.implementationManifest ??
    readManifestJson(task.implementationManifestJson) ??
    readManifest(task.implementationLog);
  const lines = [
    "Compact retry context:",
    `- Task: ${sanitize(`${task.id}${task.title ? ` - ${task.title}` : ""}`)}`,
    `- Stage/status: ${sanitize(task.status ?? "unknown")}${task.blockedFromStatus ? ` (blocked from ${sanitize(task.blockedFromStatus)})` : ""}; retryCount=${Number.isFinite(task.retryCount) ? task.retryCount : 0}; retryAfter=${sanitize(task.retryAfter ?? "none")}; manualReviewRequired=${task.manualReviewRequired === true ? "yes" : "no"}`,
    `- Accepted plan: ${summarizeText(task.plan, "No accepted plan text available.")}`,
    `- Changed files: ${summarizeChangedFiles(manifest)}`,
    `- Verification state: ${summarizeVerification(manifest)}`,
    `- Acceptance criteria: ${summarizeAcceptance(manifest)}`,
    `- Blockers: ${summarizeBlockers(task, manifest)}`,
    `- Next allowed action: ${nextAllowedAction(task)}`,
    `- Compaction: raw agentActivityLog omitted from this prompt because ${reasons.join(", ")} exceeded threshold; raw runtime details, secrets, and large command output are excluded.`,
  ];
  return lines.join("\n");
}

function readPositiveInt(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sanitize(value: unknown, maxChars = MAX_FIELD_CHARS): string {
  const redacted = redactProviderText(String(value ?? ""));
  if (
    /\b(?:provider diagnostics|raw diagnostics|authorization|headers?|stderr|stdout)\b/i.test(
      redacted,
    )
  ) {
    return "[runtime detail omitted]";
  }
  return redacted.replace(/\s+/g, " ").trim().slice(0, maxChars) || "(empty)";
}

function summarizeText(value: string | null | undefined, fallback: string): string {
  if (!value?.trim()) return fallback;
  return sanitize(value);
}

function readManifest(text: string | null | undefined): ImplementationManifest | null {
  const block = extractImplementationManifestBlock(text);
  if (!block) return null;
  return readManifestJson(block);
}

function readManifestJson(rawJson: string | null | undefined): ImplementationManifest | null {
  if (!rawJson?.trim()) return null;
  const normalized = normalizeImplementationManifestJson(rawJson);
  if (!normalized) return null;
  try {
    return JSON.parse(normalized) as ImplementationManifest;
  } catch {
    return null;
  }
}

function summarizeChangedFiles(manifest: ImplementationManifest | null): string {
  if (!manifest?.changedFiles?.length) return "No implementation manifest changed files recorded.";
  const files = manifest.changedFiles
    .slice(0, MAX_LIST_ITEMS)
    .map((file) => `${sanitize(file.path, 180)} (${sanitize(file.status, 40)})`);
  return `${files.join(", ")}${manifest.changedFiles.length > files.length ? ", ..." : ""}`;
}

function summarizeVerification(manifest: ImplementationManifest | null): string {
  if (!manifest?.verificationEvidence?.length) return "No verification evidence recorded.";
  return manifest.verificationEvidence
    .slice(0, MAX_LIST_ITEMS)
    .map((entry) => {
      const command = entry.command ? ` ${sanitize(entry.command, 180)}` : "";
      return `${sanitize(entry.status, 40)}${command}`;
    })
    .join("; ");
}

function summarizeAcceptance(manifest: ImplementationManifest | null): string {
  if (!manifest?.acceptanceCriteria?.length) return "No acceptance criteria evidence recorded.";
  return manifest.acceptanceCriteria
    .slice(0, MAX_LIST_ITEMS)
    .map((entry) => `${sanitize(entry.id, 80)}=${sanitize(entry.status, 40)}`)
    .join("; ");
}

function summarizeBlockers(
  task: RetryContextTask,
  manifest: ImplementationManifest | null,
): string {
  const blockers: string[] = [];
  if (task.blockedReason?.trim()) blockers.push(sanitize(task.blockedReason));
  if (task.reviewComments?.trim())
    blockers.push(`review comments present: ${sanitize(task.reviewComments)}`);
  if (manifest?.knownLimitations?.length) {
    blockers.push(
      `known limitations: ${manifest.knownLimitations
        .slice(0, 3)
        .map((entry) => sanitize(entry, 240))
        .join("; ")}`,
    );
  }
  if (manifest?.planChecklist && manifest.planChecklist.pending > 0) {
    blockers.push(`pending checklist items: ${manifest.planChecklist.pending}`);
  }
  return blockers.length > 0 ? blockers.join("; ") : "No blockers recorded in compact context.";
}

function nextAllowedAction(task: RetryContextTask): string {
  if (task.manualReviewRequired) return "Wait for or address manual review before continuing.";
  if (task.status === "blocked_external") return "Address the external blocker before retrying.";
  if (task.status === "needs_input") return "Use the latest human answer before continuing.";
  if (task.status === "review") return "Continue review from compact task state.";
  return "Continue from the accepted plan and compact task state; do not rely on prior provider session history.";
}
