export const AUDIT_ARTIFACT_ROLES = ["report", "synthesis"] as const;

export type AuditArtifactRole = (typeof AUDIT_ARTIFACT_ROLES)[number];

export const AUDIT_ARTIFACT_STATES = [
  "expected",
  "valid",
  "invalid",
  "missing",
  "synthesis_not_ready",
  "external_blocked",
] as const;

export type AuditArtifactState = (typeof AUDIT_ARTIFACT_STATES)[number];

export const AUDIT_FAILURE_FAMILIES = [
  "invalid_artifact_content",
  "missing_artifact",
  "missing_tool_evidence",
  "rework_needed",
  "inconclusive_batch_evidence",
  "synthesis_not_ready",
  "manual_review_required",
  "external_blocker",
] as const;

export type AuditFailureFamily = (typeof AUDIT_FAILURE_FAMILIES)[number];

export const AUDIT_GENERATED_CARD_ISSUE_CODES = [
  "missing_diagnostic_markers",
  "missing_no_findings_proof_guardrail",
  "missing_substantive_no_findings_requirement",
  "missing_synthesis_outcome_requirement",
  "implementation_shaped_title",
  "implementation_shaped_description",
  "allowed_changes_none",
  "allowed_changes_not_report_only",
  "invalid_report_artifact_path",
] as const;

export type AuditGeneratedCardIssueCode = (typeof AUDIT_GENERATED_CARD_ISSUE_CODES)[number];

export interface AuditGeneratedCardValidationIssue {
  code: AuditGeneratedCardIssueCode;
  message: string;
}

export interface ValidateGeneratedAuditCardInput {
  title: string;
  description?: string | null;
}

export interface ValidateGeneratedAuditCardResult {
  ok: boolean;
  issues: string[];
  issueDetails: AuditGeneratedCardValidationIssue[];
}

export const AUDIT_REQUIRED_GENERATED_CARD_MARKERS = [
  "scope:",
  "allowed changes:",
  "report artifact:",
  "acceptance criteria:",
  "evidence requirements:",
  "git requirements:",
  "constraint:",
  "audit mandate:",
  "diagnostic-only",
  "quality bar:",
  "no-findings rule:",
  "evidence:",
  "risk:",
  "proposed fix:",
  "verification:",
  "git status --short",
  "git commit",
  "git log -1 --name-only --oneline",
] as const;

export const AUDIT_NO_FINDINGS_PROOF_GUARDRAIL =
  "No-findings proof guardrail: git ls-files, git status, directory listings, file-existence checks, and broad inventory-only observations are not sufficient proof for a no-findings conclusion.";

export const AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT =
  "Substantive no-findings requirement: support any no-findings conclusion with scoped code/config/test inspection, commands run, observed outputs, and a short explanation of why the scoped risks are absent.";

export const AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT =
  "Synthesis outcome requirement: classify the final audit as exactly one of validated findings present, validated no-findings with substantive evidence, or audit inconclusive when source reports are weak, missing, or inventory-only.";

export const TASK_COMPLETION_ISSUE_FAILURE_FAMILIES: Record<string, AuditFailureFamily> = {
  zero_delta: "rework_needed",
  generic_plan: "rework_needed",
  missing_report_artifact: "missing_artifact",
  uncommitted_report_artifact: "missing_artifact",
  deterministic_fallback_report: "invalid_artifact_content",
  missing_implementation_tool_activity: "missing_tool_evidence",
  missing_review_tool_activity: "missing_tool_evidence",
  unexpected_non_report_changes: "invalid_artifact_content",
  invalid_or_missing_file_references: "invalid_artifact_content",
  insufficient_report_evidence: "invalid_artifact_content",
  low_quality_report_evidence: "invalid_artifact_content",
  audit_inconclusive: "inconclusive_batch_evidence",
  branch_isolation: "external_blocker",
  manual_review_required: "manual_review_required",
  synthesis_not_ready: "synthesis_not_ready",
};

export function mapTaskCompletionIssueCodeToAuditFailureFamily(code: string): AuditFailureFamily {
  return TASK_COMPLETION_ISSUE_FAILURE_FAMILIES[code] ?? "external_blocker";
}

export function selectTaskCompletionAuditFailureFamily(issueCodes: string[]): AuditFailureFamily {
  if (issueCodes.includes("branch_isolation")) return "external_blocker";

  const primaryCode = issueCodes.find((code) => code !== "manual_review_required");
  if (primaryCode) return mapTaskCompletionIssueCodeToAuditFailureFamily(primaryCode);

  if (issueCodes.includes("manual_review_required")) return "manual_review_required";
  return "external_blocker";
}

export function isAuditSynthesisTitle(title: string): boolean {
  return /\b(?:synthesi[sz]e|synthesis|summary|summari[sz]e|final\s+audit|audit\s+findings\s+summary)\b/i.test(
    title,
  );
}

export function extractAuditPathTokens(text: string): string[] {
  return [...text.matchAll(/`?([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[A-Za-z0-9]+)`?/g)].map(
    (match) => match[1],
  );
}

export function isAuditReportArtifactPath(path: string): boolean {
  const lower = path.replaceAll("\\", "/").toLowerCase();
  if (
    lower.startsWith("/") ||
    /^[a-z]:\//i.test(lower) ||
    lower === ".." ||
    lower.startsWith("../") ||
    lower.includes("/../") ||
    lower.startsWith(".ai-factory/") ||
    lower.includes("/.ai-factory/") ||
    lower.startsWith("aif-plan/") ||
    lower.includes("/aif-plan/")
  ) {
    return false;
  }
  if (
    /^(?:src|test|tests|__tests__|config)\//i.test(lower) ||
    /^packages\/[^/]+\/(?:src|test|tests|__tests__|config)\//i.test(lower)
  ) {
    return false;
  }
  return (
    lower.endsWith(".md") &&
    (lower.startsWith("audit/") ||
      lower.startsWith("report/") ||
      lower.startsWith("reports/") ||
      lower.includes("/audit/") ||
      lower.includes("/report/") ||
      lower.includes("/reports/") ||
      /\b(?:audit|report|summary|findings)\b/.test(lower))
  );
}

export function parseAuditReportArtifactPath(text: string): string | null {
  return extractAuditPathTokens(text).find((path) => isAuditReportArtifactPath(path)) ?? null;
}

export function findAuditReportArtifactLine(description: string): string | null {
  return (
    description
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^report artifact\s*:/i.test(line)) ?? null
  );
}

export function parseExpectedAuditReportArtifactPath(description: string): string | null {
  const line = findAuditReportArtifactLine(description);
  if (!line) return null;
  return parseAuditReportArtifactPath(line.replace(/^report artifact\s*:\s*/i, "").trim());
}

function hasAll(text: string, markers: readonly string[]): boolean {
  return markers.every((marker) => text.includes(marker));
}

function hasNoFindingsProofGuardrail(text: string): boolean {
  return hasAll(text, [
    "git ls-files",
    "git status",
    "directory listings",
    "file-existence checks",
    "inventory-only",
    "not sufficient proof",
    "no-findings conclusion",
  ]);
}

function hasSubstantiveNoFindingsRequirement(text: string): boolean {
  return hasAll(text, [
    "substantive no-findings",
    "scoped",
    "inspection",
    "commands run",
    "observed outputs",
    "scoped risks are absent",
  ]);
}

function hasSynthesisOutcomeRequirement(text: string): boolean {
  return hasAll(text, [
    "synthesis outcome",
    "validated findings present",
    "validated no-findings with substantive evidence",
    "audit inconclusive",
  ]);
}

function auditTextLines(text: string): string[] {
  return text
    .split(/\r?\n|[.;]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function hasImplementationShapedAuditText(text: string): boolean {
  const implementationPatterns = [
    /\bcritical\s+bug\s+resolution\b/i,
    /\bbug\s+resolution\b/i,
    /\barchitecture\s+refactoring\b/i,
    /\bsecurity\s+hardening\b/i,
    /\btest\s+suite\s+expansion\b/i,
    /\b(?:fix|fixing|resolve|resolving|implement|implementing|refactor|refactoring|harden|hardening|deploy|deploying|document|documenting)\b/i,
    /\bexpand(?:ing)?\s+(?:the\s+)?(?:test\s+suite|tests?|coverage)\b/i,
  ];
  const diagnosticFrame =
    /\b(?:diagnostic|findings?\s+(?:about|for|on)|report\s+(?:about|on)|review\s+(?:of|for)|inventory\s+(?:of|for)|evidence\s+(?:of|for)|risk\s+(?:in|of|from))\b/i;

  return auditTextLines(text).some((line) => {
    const lower = line.toLowerCase();
    if (/\b(?:do not|must not|forbid|forbidden|no source|no config|no test)\b/i.test(lower)) {
      return false;
    }
    if (/\b(?:proposed\s+fix|evidence requirements)\s*:/i.test(lower)) {
      return false;
    }
    if (!implementationPatterns.some((pattern) => pattern.test(line))) {
      return false;
    }
    return !diagnosticFrame.test(line);
  });
}

function auditAllowedChangesLine(description: string): string | null {
  return (
    description
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^allowed changes\s*:/i.test(line)) ?? null
  );
}

function hasNonReportAllowedChangeTarget(value: string): boolean {
  const explicitPaths = extractAuditPathTokens(value);
  if (explicitPaths.some((path) => !isAuditReportArtifactPath(path))) {
    return true;
  }

  return (
    /\b(?:edit|modify|change|update|create)\s+(?:source|config|test|tests|package|packages|src|app|apps|runtime|api|web|shared|code)\b/i.test(
      value,
    ) ||
    /\b(?:source|config|test|tests|package|packages|src|app|apps|runtime|api|web|shared|code)\s+(?:file|files|paths?|changes?|edits?)\b/i.test(
      value,
    )
  );
}

function validateAuditAllowedChanges(description: string): AuditGeneratedCardValidationIssue[] {
  const line = auditAllowedChangesLine(description);
  if (!line) return [];

  const value = line.replace(/^allowed changes\s*:\s*/i, "").trim();
  if (/^(?:none|no changes|n\/a|nothing)\.?$/i.test(value)) {
    return [
      {
        code: "allowed_changes_none",
        message: "audit task allowed changes cannot be None",
      },
    ];
  }

  const permitsReportWrite =
    /\bonly\b/i.test(value) &&
    /\b(?:create\/update|create or update|create|update)\b/i.test(value) &&
    /\b(?:report artifact|summary artifact|audit\/[\w./-]+\.md|[\w./-]+\.md)\b/i.test(value);
  if (!permitsReportWrite || hasNonReportAllowedChangeTarget(value)) {
    return [
      {
        code: "allowed_changes_not_report_only",
        message: "audit task allowed changes must be limited to the report artifact",
      },
    ];
  }

  return [];
}

function validateAuditReportArtifact(description: string): AuditGeneratedCardValidationIssue[] {
  const line = findAuditReportArtifactLine(description);
  if (!line) return [];

  if (!parseAuditReportArtifactPath(line.replace(/^report artifact\s*:\s*/i, "").trim())) {
    return [
      {
        code: "invalid_report_artifact_path",
        message: "audit task report artifact must be a concrete .md report path",
      },
    ];
  }

  return [];
}

export function validateGeneratedAuditCard(
  input: ValidateGeneratedAuditCardInput,
): ValidateGeneratedAuditCardResult {
  const title = input.title.trim();
  const description = input.description?.trim() ?? "";
  const text = `${title}\n${description}`.toLowerCase();
  const issueDetails: AuditGeneratedCardValidationIssue[] = [];
  const implementationTitlePattern =
    /^(fix|resolve|implement|refactor|harden|expand|deploy|document|build|add|develop)\b/i;
  const diagnosticTitlePattern = /\b(audit|diagnostic|synthesi[sz]e|review|inventory)\b/i;

  if (!hasAll(text, AUDIT_REQUIRED_GENERATED_CARD_MARKERS)) {
    issueDetails.push({
      code: "missing_diagnostic_markers",
      message: "audit task is missing diagnostic report markers",
    });
  }
  if (!hasNoFindingsProofGuardrail(text)) {
    issueDetails.push({
      code: "missing_no_findings_proof_guardrail",
      message: "audit task is missing the no-findings proof guardrail",
    });
  }
  if (!hasSubstantiveNoFindingsRequirement(text)) {
    issueDetails.push({
      code: "missing_substantive_no_findings_requirement",
      message: "audit task is missing the substantive no-findings requirement",
    });
  }
  if (isAuditSynthesisTitle(title) && !hasSynthesisOutcomeRequirement(text)) {
    issueDetails.push({
      code: "missing_synthesis_outcome_requirement",
      message: "audit synthesis task is missing outcome requirements",
    });
  }
  if (
    (implementationTitlePattern.test(title) && !diagnosticTitlePattern.test(title)) ||
    hasImplementationShapedAuditText(title)
  ) {
    issueDetails.push({
      code: "implementation_shaped_title",
      message: "audit task title describes implementation work",
    });
  }
  if (hasImplementationShapedAuditText(description)) {
    issueDetails.push({
      code: "implementation_shaped_description",
      message: "audit task description describes implementation work",
    });
  }

  issueDetails.push(
    ...validateAuditAllowedChanges(description),
    ...validateAuditReportArtifact(description),
  );

  return {
    ok: issueDetails.length === 0,
    issues: issueDetails.map((issue) => issue.message),
    issueDetails,
  };
}
