export interface OperatorCompletionVerificationEvidence {
  command: string;
  status: "passed";
  outputPreview: string;
  outputSha256: string;
}

export interface OperatorCompletionEvidence {
  version: 1;
  taskId: string;
  source: "operator";
  status: "accepted";
  commitSha: string;
  changedFiles: string[];
  verification: OperatorCompletionVerificationEvidence[];
  worktreeClean: boolean;
  operatorNote?: string | null;
  overriddenBlockers?: string[];
  blockerOverrideJustification?: string | null;
  acceptedAt: string;
}

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUsefulString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter(isUsefulString)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function normalizeOperatorCompletionPath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .trim();
}

export function isValidOperatorCompletionCommitSha(value: string): boolean {
  return COMMIT_SHA_PATTERN.test(value);
}

export function isValidOperatorCompletionVerification(
  verification: OperatorCompletionVerificationEvidence,
): boolean {
  return (
    isUsefulString(verification.command) &&
    verification.status === "passed" &&
    isUsefulString(verification.outputPreview) &&
    SHA256_HEX_PATTERN.test(verification.outputSha256)
  );
}

export function coerceOperatorCompletionEvidence(
  value: unknown,
): OperatorCompletionEvidence | null {
  if (!isObject(value)) return null;
  if (
    value.version !== 1 ||
    value.source !== "operator" ||
    value.status !== "accepted" ||
    !isUsefulString(value.taskId) ||
    !isUsefulString(value.commitSha) ||
    !isValidOperatorCompletionCommitSha(value.commitSha) ||
    value.worktreeClean !== true ||
    !Array.isArray(value.changedFiles) ||
    !Array.isArray(value.verification) ||
    !isUsefulString(value.acceptedAt)
  ) {
    return null;
  }
  const changedFiles = value.changedFiles
    .filter(isUsefulString)
    .map(normalizeOperatorCompletionPath)
    .filter(Boolean);
  if (changedFiles.length !== value.changedFiles.length || changedFiles.length === 0) {
    return null;
  }
  const verification = value.verification.filter(
    (entry): entry is OperatorCompletionVerificationEvidence => {
      if (!isObject(entry)) return false;
      return (
        isUsefulString(entry.command) &&
        entry.status === "passed" &&
        isUsefulString(entry.outputPreview) &&
        isUsefulString(entry.outputSha256)
      );
    },
  );
  if (
    verification.length !== value.verification.length ||
    verification.length === 0 ||
    !verification.every(isValidOperatorCompletionVerification)
  ) {
    return null;
  }
  return {
    version: 1,
    taskId: value.taskId.trim(),
    source: "operator",
    status: "accepted",
    commitSha: value.commitSha.trim(),
    changedFiles: [...new Set(changedFiles)].sort((a, b) => a.localeCompare(b)),
    verification,
    worktreeClean: true,
    operatorNote: typeof value.operatorNote === "string" ? value.operatorNote : null,
    overriddenBlockers: coerceStringArray(value.overriddenBlockers),
    blockerOverrideJustification:
      typeof value.blockerOverrideJustification === "string"
        ? value.blockerOverrideJustification.trim()
        : null,
    acceptedAt: value.acceptedAt,
  };
}
