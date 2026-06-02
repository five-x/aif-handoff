export type AifResultStatus = "completed" | "blocked" | "partial";

export type AifResultContractIssueCode =
  | "missing_aif_result_contract"
  | "multiple_aif_result_contracts"
  | "invalid_aif_result_json"
  | "invalid_aif_result_status"
  | "aif_result_not_completed"
  | "unresolved_aif_result_blockers"
  | "missing_aif_result_verification_evidence";

export interface AifResultContractIssue {
  code: AifResultContractIssueCode;
  message: string;
}

export interface AifResultContract {
  status: AifResultStatus;
  resolvedBlockers: string[];
  unresolvedBlockers: string[];
  verificationEvidence: string[];
  changedFiles: string[];
  raw: Record<string, unknown>;
}

export interface ValidateAifResultContractOptions {
  requireCompleted?: boolean;
  requireVerificationEvidence?: boolean;
}

export interface AifResultContractValidationResult {
  ok: boolean;
  result: AifResultContract | null;
  issues: AifResultContractIssue[];
}

const AIF_RESULT_BLOCK_PATTERN = /(?:^|\n)```aif-result\s*\r?\n([\s\S]*?)\r?\n```/gi;

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const id = record.id ?? record.command ?? record.path ?? record.summary;
        return typeof id === "string" ? id.trim() : "";
      }
      return "";
    })
    .filter((entry) => entry.length > 0);
}

function readFirstStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const parsed = readStringArray(record[key]);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

export function extractAifResultBlocks(text: string): string[] {
  return [...text.matchAll(AIF_RESULT_BLOCK_PATTERN)].map((match) => (match[1] ?? "").trim());
}

export function formatAifResultContractBlockedReason(
  result: AifResultContractValidationResult,
): string {
  const codes = result.issues.map((issue) => issue.code);
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
        {
          code: "missing_aif_result_contract",
          message: "Rework output must include exactly one fenced aif-result JSON block.",
        },
      ],
    };
  }
  if (blocks.length > 1) {
    issues.push({
      code: "multiple_aif_result_contracts",
      message: "Rework output must include only one fenced aif-result JSON block.",
    });
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
        {
          code: "invalid_aif_result_json",
          message: `aif-result JSON is invalid: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      result: null,
      issues: [
        ...issues,
        {
          code: "invalid_aif_result_json",
          message: "aif-result JSON must be an object.",
        },
      ],
    };
  }

  const raw = parsed as Record<string, unknown>;
  const status = typeof raw.status === "string" ? raw.status.trim() : "";
  if (status !== "completed" && status !== "blocked" && status !== "partial") {
    issues.push({
      code: "invalid_aif_result_status",
      message: "aif-result status must be completed, blocked, or partial.",
    });
  }

  const result: AifResultContract | null =
    status === "completed" || status === "blocked" || status === "partial"
      ? {
          status,
          resolvedBlockers: readFirstStringArray(raw, [
            "resolvedBlockers",
            "resolvedBlockingFindings",
            "addressedBlockers",
          ]),
          unresolvedBlockers: readFirstStringArray(raw, [
            "unresolvedBlockers",
            "unresolvedBlockingFindings",
            "remainingBlockers",
          ]),
          verificationEvidence: readFirstStringArray(raw, [
            "verificationEvidence",
            "verification",
            "evidenceRefs",
          ]),
          changedFiles: readFirstStringArray(raw, ["changedFiles", "filesChanged"]),
          raw,
        }
      : null;

  if (options.requireCompleted && result && result.status !== "completed") {
    issues.push({
      code: "aif_result_not_completed",
      message: "Rework aif-result must have status completed before review handoff.",
    });
  }
  if (result && result.status === "completed" && result.unresolvedBlockers.length > 0) {
    issues.push({
      code: "unresolved_aif_result_blockers",
      message: "Completed rework aif-result must not list unresolved blockers.",
    });
  }
  if (
    options.requireVerificationEvidence &&
    result &&
    result.status === "completed" &&
    result.verificationEvidence.length === 0
  ) {
    issues.push({
      code: "missing_aif_result_verification_evidence",
      message: "Completed rework aif-result must include verification evidence.",
    });
  }

  return {
    ok: issues.length === 0,
    result,
    issues,
  };
}
