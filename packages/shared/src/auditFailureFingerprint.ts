import { createHash } from "node:crypto";

export interface FailureFingerprintInput {
  taskId?: string | null;
  stage?: string | null;
  artifactPath?: string | null;
  artifactSha?: string | null;
  validatorIssueCodes?: readonly (string | null | undefined)[];
  validationFingerprint?: string | null;
  blockingFindingIds?: readonly (string | null | undefined)[];
  sourceSnapshotId?: string | null;
  allowedWritePaths?: readonly (string | null | undefined)[];
  failureFamily?: string | null;
}

export interface NormalizedFailureFingerprintInput {
  taskId: string | null;
  stage: string | null;
  artifactPath: string | null;
  artifactSha: string | null;
  validatorIssueCodes: string[];
  validationFingerprint: string | null;
  blockingFindingIds: string[];
  sourceSnapshotId: string | null;
  allowedWritePaths: string[];
  failureFamily: string | null;
}

export interface FailureFingerprintResult {
  failureFingerprint: string;
  failureFingerprintInput: NormalizedFailureFingerprintInput;
}

function normalizedString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizedPath(value: string | null | undefined): string | null {
  const trimmed = normalizedString(value);
  return trimmed ? trimmed.replaceAll("\\", "/").toLowerCase() : null;
}

function normalizedStringSet(
  values: readonly (string | null | undefined)[] | undefined,
  options: { path?: boolean } = {},
): string[] {
  const normalized = (values ?? [])
    .map((value) => (options.path ? normalizedPath(value) : normalizedString(value)?.toLowerCase()))
    .filter((value): value is string => Boolean(value));
  return [...new Set(normalized)].sort();
}

export function buildFailureFingerprint(input: FailureFingerprintInput): FailureFingerprintResult {
  const failureFingerprintInput: NormalizedFailureFingerprintInput = {
    taskId: normalizedString(input.taskId),
    stage: normalizedString(input.stage)?.toLowerCase() ?? null,
    artifactPath: normalizedPath(input.artifactPath),
    artifactSha: normalizedString(input.artifactSha)?.toLowerCase() ?? null,
    validatorIssueCodes: normalizedStringSet(input.validatorIssueCodes),
    validationFingerprint: normalizedString(input.validationFingerprint)?.toLowerCase() ?? null,
    blockingFindingIds: normalizedStringSet(input.blockingFindingIds),
    sourceSnapshotId: normalizedString(input.sourceSnapshotId),
    allowedWritePaths: normalizedStringSet(input.allowedWritePaths, { path: true }),
    failureFamily: normalizedString(input.failureFamily)?.toLowerCase() ?? null,
  };
  const stableJson = JSON.stringify(failureFingerprintInput);
  return {
    failureFingerprint: createHash("sha256").update(stableJson).digest("hex"),
    failureFingerprintInput,
  };
}
