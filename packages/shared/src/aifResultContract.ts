export type AifResultStatus = "completed" | "blocked" | "needs_input";

export type AifResultStopReason =
  | "done"
  | "blocked_by_validation"
  | "blocked_by_scope"
  | "needs_human_input";

export type AifResultVerificationStatus = "passed" | "failed" | "not_run";

export type AifResultContractIssueCode =
  | "missing_aif_result_contract"
  | "multiple_aif_result_contracts"
  | "invalid_aif_result_json"
  | "invalid_aif_result_schema"
  | "unexpected_aif_result_field"
  | "invalid_aif_result_status"
  | "invalid_aif_result_stop_reason"
  | "aif_result_task_id_mismatch"
  | "aif_result_not_completed"
  | "unresolved_aif_result_blockers"
  | "missing_aif_result_verification_evidence";

export interface AifResultContractIssue {
  code: AifResultContractIssueCode;
  message: string;
}

export interface AifResultVerification {
  command: string;
  status: AifResultVerificationStatus;
  evidence: string;
}

export interface AifResultResolvedBlocker {
  id: string;
  evidence: string;
}

export interface AifResultUnresolvedBlocker {
  id: string;
  reason: string;
}

export interface AifResultContract {
  status: AifResultStatus;
  taskId: string;
  changedFiles: string[];
  verification: AifResultVerification[];
  resolvedBlockers: AifResultResolvedBlocker[];
  unresolvedBlockers: AifResultUnresolvedBlocker[];
  stopReason: AifResultStopReason;
  raw: Record<string, unknown>;
}

export interface ValidateAifResultContractOptions {
  expectedTaskId?: string;
  requireCompleted?: boolean;
  requireVerificationEvidence?: boolean;
}

export interface AifResultContractValidationResult {
  ok: boolean;
  result: AifResultContract | null;
  issues: AifResultContractIssue[];
}

const AIF_RESULT_BLOCK_PATTERN = /(?:^|\n)```aif-result\s*\r?\n([\s\S]*?)\r?\n```/gi;
const AIF_RESULT_ALLOWED_KEYS = new Set([
  "status",
  "taskId",
  "changedFiles",
  "verification",
  "resolvedBlockers",
  "unresolvedBlockers",
  "stopReason",
]);
const AIF_RESULT_VERIFICATION_ALLOWED_KEYS = new Set(["command", "status", "evidence"]);
const AIF_RESULT_RESOLVED_BLOCKER_ALLOWED_KEYS = new Set(["id", "evidence"]);
const AIF_RESULT_UNRESOLVED_BLOCKER_ALLOWED_KEYS = new Set(["id", "reason"]);

function issue(code: AifResultContractIssueCode, message: string): AifResultContractIssue {
  return { code, message };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(readString);
  return values.every((entry) => entry.length > 0) ? values : null;
}

function hasOnlyAllowedKeys(record: Record<string, unknown>, allowedKeys: Set<string>): boolean {
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function isValidStopReasonForStatus(status: string, stopReason: string): boolean {
  if (status === "completed") return stopReason === "done";
  if (status === "blocked") {
    return stopReason === "blocked_by_validation" || stopReason === "blocked_by_scope";
  }
  if (status === "needs_input") return stopReason === "needs_human_input";
  return false;
}

function readVerification(value: unknown): AifResultVerification[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    if (!hasOnlyAllowedKeys(record, AIF_RESULT_VERIFICATION_ALLOWED_KEYS)) return null;
    const command = readString(record.command);
    const status = readString(record.status);
    const evidence = readString(record.evidence);
    if (
      command.length === 0 ||
      evidence.length === 0 ||
      (status !== "passed" && status !== "failed" && status !== "not_run")
    ) {
      return null;
    }
    return { command, status, evidence };
  });
  return entries.every((entry): entry is AifResultVerification => entry != null) ? entries : null;
}

function readResolvedBlockers(value: unknown): AifResultResolvedBlocker[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    if (!hasOnlyAllowedKeys(record, AIF_RESULT_RESOLVED_BLOCKER_ALLOWED_KEYS)) return null;
    const id = readString(record.id);
    const evidence = readString(record.evidence);
    return id.length > 0 && evidence.length > 0 ? { id, evidence } : null;
  });
  return entries.every((entry): entry is AifResultResolvedBlocker => entry != null)
    ? entries
    : null;
}

function readUnresolvedBlockers(value: unknown): AifResultUnresolvedBlocker[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    if (!hasOnlyAllowedKeys(record, AIF_RESULT_UNRESOLVED_BLOCKER_ALLOWED_KEYS)) return null;
    const id = readString(record.id);
    const reason = readString(record.reason);
    return id.length > 0 && reason.length > 0 ? { id, reason } : null;
  });
  return entries.every((entry): entry is AifResultUnresolvedBlocker => entry != null)
    ? entries
    : null;
}

export function extractAifResultBlocks(text: string): string[] {
  return [...text.matchAll(AIF_RESULT_BLOCK_PATTERN)].map((match) => (match[1] ?? "").trim());
}

export function formatAifResultContractBlockedReason(
  result: AifResultContractValidationResult,
): string {
  const codes = result.issues.map((entry) => entry.code);
  return codes.length > 0
    ? `aif_result_contract_invalid: ${codes.join(", ")}`
    : "aif_result_contract_invalid";
}

export function validateAifResultContract(
  text: string,
  options: ValidateAifResultContractOptions = {},
): AifResultContractValidationResult {
  const blocks = extractAifResultBlocks(text);
  const issues: AifResultContractIssue[] = [];
  if (blocks.length === 0) {
    return {
      ok: false,
      result: null,
      issues: [
        issue(
          "missing_aif_result_contract",
          "Output must include exactly one fenced aif-result JSON block.",
        ),
      ],
    };
  }
  if (blocks.length > 1) {
    issues.push(
      issue(
        "multiple_aif_result_contracts",
        "Output must include exactly one fenced aif-result JSON block.",
      ),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(blocks[0] ?? "");
  } catch (error) {
    return {
      ok: false,
      result: null,
      issues: [
        ...issues,
        issue(
          "invalid_aif_result_json",
          `aif-result JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ],
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      result: null,
      issues: [...issues, issue("invalid_aif_result_json", "aif-result JSON must be an object.")],
    };
  }

  const raw = parsed as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!AIF_RESULT_ALLOWED_KEYS.has(key)) {
      issues.push(
        issue(
          "unexpected_aif_result_field",
          `aif-result contains unsupported top-level field: ${key}.`,
        ),
      );
    }
  }

  const status = readString(raw.status);
  if (status !== "completed" && status !== "blocked" && status !== "needs_input") {
    issues.push(
      issue(
        "invalid_aif_result_status",
        "aif-result status must be completed, blocked, or needs_input.",
      ),
    );
  }

  const stopReason = readString(raw.stopReason);
  if (
    stopReason !== "done" &&
    stopReason !== "blocked_by_validation" &&
    stopReason !== "blocked_by_scope" &&
    stopReason !== "needs_human_input"
  ) {
    issues.push(
      issue(
        "invalid_aif_result_stop_reason",
        "aif-result stopReason must be done, blocked_by_validation, blocked_by_scope, or needs_human_input.",
      ),
    );
  }
  if (
    (status === "completed" || status === "blocked" || status === "needs_input") &&
    (stopReason === "done" ||
      stopReason === "blocked_by_validation" ||
      stopReason === "blocked_by_scope" ||
      stopReason === "needs_human_input") &&
    !isValidStopReasonForStatus(status, stopReason)
  ) {
    issues.push(
      issue(
        "invalid_aif_result_stop_reason",
        "aif-result stopReason must match status: completed uses done, blocked uses blocked_by_validation or blocked_by_scope, and needs_input uses needs_human_input.",
      ),
    );
  }

  const taskId = readString(raw.taskId);
  if (taskId.length === 0) {
    issues.push(
      issue("invalid_aif_result_schema", "aif-result taskId must be a non-empty string."),
    );
  } else if (options.expectedTaskId && taskId !== options.expectedTaskId) {
    issues.push(
      issue("aif_result_task_id_mismatch", `aif-result taskId must be ${options.expectedTaskId}.`),
    );
  }

  const changedFiles = readStringArray(raw.changedFiles);
  if (!changedFiles) {
    issues.push(
      issue("invalid_aif_result_schema", "aif-result changedFiles must be a string array."),
    );
  }

  const verification = readVerification(raw.verification);
  if (!verification) {
    issues.push(
      issue(
        "invalid_aif_result_schema",
        "aif-result verification must be an array of { command, status, evidence } objects.",
      ),
    );
  }

  const resolvedBlockers = readResolvedBlockers(raw.resolvedBlockers);
  if (!resolvedBlockers) {
    issues.push(
      issue(
        "invalid_aif_result_schema",
        "aif-result resolvedBlockers must be an array of { id, evidence } objects.",
      ),
    );
  }

  const unresolvedBlockers = readUnresolvedBlockers(raw.unresolvedBlockers);
  if (!unresolvedBlockers) {
    issues.push(
      issue(
        "invalid_aif_result_schema",
        "aif-result unresolvedBlockers must be an array of { id, reason } objects.",
      ),
    );
  }

  const result: AifResultContract | null =
    (status === "completed" || status === "blocked" || status === "needs_input") &&
    (stopReason === "done" ||
      stopReason === "blocked_by_validation" ||
      stopReason === "blocked_by_scope" ||
      stopReason === "needs_human_input") &&
    taskId.length > 0 &&
    changedFiles &&
    verification &&
    resolvedBlockers &&
    unresolvedBlockers
      ? {
          status,
          taskId,
          changedFiles,
          verification,
          resolvedBlockers,
          unresolvedBlockers,
          stopReason,
          raw,
        }
      : null;

  if (options.requireCompleted && result && result.status !== "completed") {
    issues.push(
      issue("aif_result_not_completed", "aif-result must have status completed before handoff."),
    );
  }
  if (result && result.status === "completed" && result.unresolvedBlockers.length > 0) {
    issues.push(
      issue(
        "unresolved_aif_result_blockers",
        "Completed aif-result must not list unresolved blockers.",
      ),
    );
  }
  if (
    options.requireVerificationEvidence &&
    result &&
    result.status === "completed" &&
    !result.verification.some((entry) => entry.status === "passed")
  ) {
    issues.push(
      issue(
        "missing_aif_result_verification_evidence",
        "Completed aif-result must include at least one passed verification entry.",
      ),
    );
  }

  return {
    ok: issues.length === 0,
    result,
    issues,
  };
}
