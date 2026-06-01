import { createHash } from "node:crypto";
import type {
  AutoReviewFinding,
  AutoReviewFindingSource,
  AutoReviewPreviousFindingStatus,
  AutoReviewSecurityCoverage,
  AutoReviewSecurityCoverageArea,
  AutoReviewSecurityCoverageStatus,
  AutoReviewState,
  AutoReviewStrategy,
  SpecializedReviewerRole,
} from "@aif/shared";
import { AUTO_REVIEW_FINDING_SOURCES, redactProviderText } from "@aif/shared";

export interface AutoReviewPreviousFinding extends AutoReviewFinding {
  status: AutoReviewPreviousFindingStatus;
  note: string;
}

export interface AutoReviewAdvisory {
  source: AutoReviewFindingSource;
  text: string;
}

export interface ParsedStructuredSidecarOutput {
  blockingFindings: AutoReviewFinding[];
  advisories: AutoReviewAdvisory[];
  previousFindings: AutoReviewPreviousFinding[];
  securityCoverage: AutoReviewSecurityCoverage[];
}

export interface ParsedStructuredReviewComments {
  strategy: AutoReviewStrategy;
  iteration: number;
  blockingFindings: AutoReviewFinding[];
  advisories: AutoReviewAdvisory[];
  previousFindings: AutoReviewPreviousFinding[];
  securityCoverage: AutoReviewSecurityCoverage[];
}

export interface ParsedSpecializedRoleOutput {
  role: SpecializedReviewerRole;
  blockingFindings: AutoReviewFinding[];
  advisories: AutoReviewAdvisory[];
  previousFindings: AutoReviewPreviousFinding[];
}

export type StructuredReviewParseIssueCode =
  | "missing_required_section"
  | "duplicate_section"
  | "malformed_list_section"
  | "missing_metadata"
  | "invalid_metadata"
  | "missing_verdict"
  | "invalid_verdict"
  | "pass_with_blockers"
  | "fail_without_blockers"
  | "inconclusive_verdict"
  | "pass_without_concrete_evidence"
  | "malformed_previous_finding"
  | "missing_previous_finding"
  | "unknown_previous_finding"
  | "duplicate_previous_finding"
  | "missing_security_coverage"
  | "missing_security_coverage_area"
  | "duplicate_security_coverage_area"
  | "malformed_security_coverage"
  | "malformed_blocking_finding"
  | "malformed_advisory";

export type StructuredReviewParseKind =
  | "structured_review_comments"
  | "structured_sidecar_output"
  | "specialized_role_output";

export interface StructuredReviewParseIssue {
  code: StructuredReviewParseIssueCode;
  section?: string;
  row?: string;
  detail: string;
  repair: string;
}

export interface StructuredReviewParseError {
  kind: StructuredReviewParseKind;
  issues: StructuredReviewParseIssue[];
  fingerprint: string;
  repairInstructions: string;
}

export type StructuredReviewParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: StructuredReviewParseError };

const PREVIOUS_FINDING_STATUS_PATTERN =
  "(resolved|still_blocking|new_blocker|not_reproducible|manual_review_required)";
const SECURITY_COVERAGE_AREA_PATTERN =
  "(secret_leaks|permissions_sandbox|unsafe_shell_network_file|dependency_config)";
const SECURITY_COVERAGE_STATUS_PATTERN = "(covered|issue_found|not_applicable|not_checked)";
const REQUIRED_SECURITY_COVERAGE_AREAS: AutoReviewSecurityCoverageArea[] = [
  "secret_leaks",
  "permissions_sandbox",
  "unsafe_shell_network_file",
  "dependency_config",
];
const AUTO_REVIEW_FINDING_SOURCE_PATTERN = `(${AUTO_REVIEW_FINDING_SOURCES.join("|")})`;

interface CollectedSections {
  sections: Map<string, string[]>;
  duplicateNames: Set<string>;
}

function collectSectionData(text: string): CollectedSections {
  const sections = new Map<string, string[]>();
  const duplicateNames = new Set<string>();
  let current: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      current = line.slice(3).trim();
      if (sections.has(current)) {
        duplicateNames.add(current);
        continue;
      }
      sections.set(current, []);
      continue;
    }
    if (current) {
      sections.get(current)?.push(line);
    }
  }

  return { sections, duplicateNames };
}

function normalizeListSection(lines: string[] | undefined): string[] | null {
  if (!lines) return null;

  const normalized = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  if (normalized.length === 0) return [];
  if (normalized.every((line) => line.startsWith("- "))) {
    const items = normalized.map((line) => line.slice(2).trim());
    if (items.length === 1 && items[0]?.toLowerCase() === "none") {
      return [];
    }
    if (items.some((item) => item.length === 0 || item.toLowerCase() === "none")) {
      return null;
    }
    return items;
  }

  return null;
}

function parseIssue(input: {
  code: StructuredReviewParseIssueCode;
  detail: string;
  repair: string;
  section?: string;
  row?: string;
}): StructuredReviewParseIssue {
  return {
    code: input.code,
    ...(input.section ? { section: input.section } : {}),
    ...(input.row ? { row: input.row } : {}),
    detail: normalizeFindingText(input.detail),
    repair: normalizeFindingText(input.repair),
  };
}

function buildStructuredReviewParseError(
  kind: StructuredReviewParseKind,
  issues: StructuredReviewParseIssue[],
): StructuredReviewParseError {
  const sortedIssues = [...issues].sort((a, b) =>
    [a.code, a.section ?? "", a.row ?? "", a.detail, a.repair]
      .join("|")
      .localeCompare([b.code, b.section ?? "", b.row ?? "", b.detail, b.repair].join("|")),
  );
  const fingerprintInput = sortedIssues
    .map((issue) =>
      [
        kind,
        issue.code,
        issue.section ?? "",
        issue.row ?? "",
        normalizeFindingText(issue.detail).toLowerCase(),
      ].join("|"),
    )
    .join("\n");
  const fingerprint = createHash("sha1").update(fingerprintInput).digest("hex").slice(0, 12);
  const repairInstructions = [
    "Repair the structured review output exactly as follows:",
    ...[...new Set(sortedIssues.map((issue) => issue.repair))].map((repair) => `- ${repair}`),
  ].join("\n");

  return {
    kind,
    issues: sortedIssues,
    fingerprint,
    repairInstructions,
  };
}

function parseErrorResult<T>(
  kind: StructuredReviewParseKind,
  issues: StructuredReviewParseIssue[],
): StructuredReviewParseResult<T> {
  return { ok: false, error: buildStructuredReviewParseError(kind, issues) };
}

function normalizeRequiredListSection(input: {
  sections: Map<string, string[]>;
  section: string;
  missingCode?: StructuredReviewParseIssueCode;
  malformedCode?: StructuredReviewParseIssueCode;
}): { items: string[] | null; issues: StructuredReviewParseIssue[] } {
  const lines = input.sections.get(input.section);
  if (!lines) {
    return {
      items: null,
      issues: [
        parseIssue({
          code: input.missingCode ?? "missing_required_section",
          section: input.section,
          detail: `Missing required section: ${input.section}`,
          repair: `Add a "## ${input.section}" section using markdown bullet rows; use "- none" only when the section has no entries.`,
        }),
      ],
    };
  }

  const items = normalizeListSection(lines);
  if (items === null) {
    return {
      items: null,
      issues: [
        parseIssue({
          code: input.malformedCode ?? "malformed_list_section",
          section: input.section,
          detail: `Malformed list section: ${input.section}`,
          repair: `Rewrite "## ${input.section}" so every non-empty row starts with "- "; use a single "- none" row only when the section has no entries.`,
        }),
      ],
    };
  }

  return { items, issues: [] };
}

export function normalizeFindingText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeReviewText(text: string): string {
  return redactProviderText(normalizeFindingText(text)).replace(/\[REDACTED\]\]+/g, "[REDACTED]");
}

export function createAutoReviewFindingId(source: AutoReviewFindingSource, text: string): string {
  const normalized = `${source}:${normalizeFindingText(text).toLowerCase()}`;
  return createHash("sha1").update(normalized).digest("hex").slice(0, 12);
}

export function formatPreviousFindingsForPrompt(
  findings: AutoReviewFinding[],
  source?: AutoReviewFindingSource,
): string {
  const filtered = source ? findings.filter((finding) => finding.source === source) : findings;
  if (filtered.length === 0) {
    return "- none";
  }

  return filtered.map((finding) => `- [${finding.id}] ${finding.text}`).join("\n");
}

function duplicateSectionIssues(duplicateNames: Set<string>): StructuredReviewParseIssue[] {
  return [...duplicateNames].map((section) =>
    parseIssue({
      code: "duplicate_section",
      section,
      detail: `Duplicate section: ${section}`,
      repair: `Keep exactly one "## ${section}" section and merge any rows into that single section.`,
    }),
  );
}

function parseSidecarPreviousFindingItems(input: {
  items: string[];
  source: AutoReviewFindingSource;
  previousFindingsInput: AutoReviewFinding[];
}): { value: AutoReviewPreviousFinding[]; issues: StructuredReviewParseIssue[] } {
  const previousFindings: AutoReviewPreviousFinding[] = [];
  const issues: StructuredReviewParseIssue[] = [];
  const previousFindingMap = new Map(
    input.previousFindingsInput.map((finding) => [finding.id, finding]),
  );
  const seen = new Set<string>();

  for (const item of input.items) {
    const match = item.match(
      new RegExp(`^\\[([^\\]]+)\\]\\s+${PREVIOUS_FINDING_STATUS_PATTERN}\\s+\\|\\s+(.+)$`),
    );
    if (!match) {
      issues.push(
        parseIssue({
          code: "malformed_previous_finding",
          section: "Previous Findings",
          row: item,
          detail: `Malformed Previous Findings row: ${item}`,
          repair:
            'Use Previous Findings rows formatted as "- [finding-id] <status> | <concrete evidence or note>".',
        }),
      );
      continue;
    }
    const id = match[1];
    if (seen.has(id)) {
      issues.push(
        parseIssue({
          code: "duplicate_previous_finding",
          section: "Previous Findings",
          row: item,
          detail: `Duplicate previous finding id: ${id}`,
          repair: `Include exactly one Previous Findings row for [${id}].`,
        }),
      );
      continue;
    }
    seen.add(id);
    const matchedFinding = previousFindingMap.get(id);
    if (!matchedFinding && input.previousFindingsInput.length > 0) {
      issues.push(
        parseIssue({
          code: "unknown_previous_finding",
          section: "Previous Findings",
          row: item,
          detail: `Unknown previous finding id: ${id}`,
          repair: `Remove [${id}] or replace it with one of the provided previous finding ids.`,
        }),
      );
      continue;
    }
    previousFindings.push({
      id,
      source: matchedFinding?.source ?? input.source,
      status: match[2] as AutoReviewPreviousFindingStatus,
      note: normalizeReviewText(match[3]),
      text: normalizeReviewText(match[3]),
      closureEvidence: normalizeReviewText(match[3]),
    });
  }

  for (const finding of input.previousFindingsInput) {
    if (seen.has(finding.id)) continue;
    issues.push(
      parseIssue({
        code: "missing_previous_finding",
        section: "Previous Findings",
        detail: `Missing Previous Findings coverage for [${finding.id}]`,
        repair: `Add a Previous Findings row for [${finding.id}] using a valid status and concrete evidence or note.`,
      }),
    );
  }

  return { value: previousFindings, issues };
}

export function parseStructuredSidecarOutput(
  resultText: string,
  source: AutoReviewFindingSource,
  previousFindingsInput: AutoReviewFinding[] = [],
): ParsedStructuredSidecarOutput | null {
  const result = parseStructuredSidecarOutputResult(resultText, source, previousFindingsInput);
  return result.ok ? result.value : null;
}

export function parseStructuredSidecarOutputResult(
  resultText: string,
  source: AutoReviewFindingSource,
  previousFindingsInput: AutoReviewFinding[] = [],
): StructuredReviewParseResult<ParsedStructuredSidecarOutput> {
  const collected = collectSectionData(resultText);
  const issues = duplicateSectionIssues(collected.duplicateNames);
  const blocking = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Blocking Findings",
  });
  const advisories = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Advisories",
  });
  const previousItems = normalizeListSection(collected.sections.get("Previous Findings") ?? []);
  if (previousItems === null) {
    issues.push(
      parseIssue({
        code: "malformed_list_section",
        section: "Previous Findings",
        detail: "Malformed list section: Previous Findings",
        repair:
          'Rewrite "## Previous Findings" so every non-empty row starts with "- "; use a single "- none" row only when the section has no entries.',
      }),
    );
  }
  const security = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Security Coverage",
    missingCode: "missing_security_coverage",
    malformedCode: "malformed_security_coverage",
  });
  issues.push(...blocking.issues, ...advisories.issues, ...security.issues);

  if (!blocking.items || !advisories.items || !previousItems || !security.items) {
    return parseErrorResult("structured_sidecar_output", issues);
  }

  const previousResult = parseSidecarPreviousFindingItems({
    items: previousItems,
    source,
    previousFindingsInput,
  });
  issues.push(...previousResult.issues);
  const securityResult = parseSecurityCoverageItemsResult(security.items);
  issues.push(...securityResult.issues);
  if (issues.length > 0 || !securityResult.value) {
    return parseErrorResult("structured_sidecar_output", issues);
  }

  return {
    ok: true,
    value: {
      blockingFindings: blocking.items.map((item) => ({
        id: createAutoReviewFindingId(source, item),
        text: normalizeReviewText(item),
        source,
      })),
      advisories: advisories.items.map((item) => ({
        source,
        text: normalizeReviewText(item),
      })),
      previousFindings: previousResult.value,
      securityCoverage: securityResult.value,
    },
  };
}

export function parseSpecializedRoleOutput(
  resultText: string,
  role: SpecializedReviewerRole,
  previousFindingsInput: AutoReviewFinding[] = [],
): ParsedSpecializedRoleOutput | null {
  const result = parseSpecializedRoleOutputResult(resultText, role, previousFindingsInput);
  return result.ok ? result.value : null;
}

export function parseSpecializedRoleOutputResult(
  resultText: string,
  role: SpecializedReviewerRole,
  previousFindingsInput: AutoReviewFinding[] = [],
): StructuredReviewParseResult<ParsedSpecializedRoleOutput> {
  const collected = collectSectionData(resultText);
  const issues = duplicateSectionIssues(collected.duplicateNames);
  const verdict = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Verdict",
    missingCode: "missing_verdict",
  });
  const blocking = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Blocking Findings",
  });
  const advisories = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Advisories",
  });
  const previous = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Previous Findings",
  });
  issues.push(...verdict.issues, ...blocking.issues, ...advisories.issues, ...previous.issues);

  if (!verdict.items || !blocking.items || !advisories.items || !previous.items) {
    return parseErrorResult("specialized_role_output", issues);
  }

  if (verdict.items.length !== 1) {
    issues.push(
      parseIssue({
        code: "invalid_verdict",
        section: "Verdict",
        detail: "Verdict section must contain exactly one row",
        repair: 'Set "## Verdict" to exactly one bullet: "- PASS", "- FAIL", or "- INCONCLUSIVE".',
      }),
    );
  }

  const verdictValue = verdict.items[0]?.trim().toUpperCase();
  if (verdict.items.length === 1) {
    if (verdictValue !== "PASS" && verdictValue !== "FAIL" && verdictValue !== "INCONCLUSIVE") {
      issues.push(
        parseIssue({
          code: "invalid_verdict",
          section: "Verdict",
          row: verdict.items[0],
          detail: `Invalid verdict: ${verdict.items[0]}`,
          repair: 'Use one of the exact verdict values: "- PASS", "- FAIL", or "- INCONCLUSIVE".',
        }),
      );
    } else if (verdictValue === "PASS" && blocking.items.length > 0) {
      issues.push(
        parseIssue({
          code: "pass_with_blockers",
          section: "Blocking Findings",
          detail: "PASS verdict included blocking findings",
          repair:
            'Either change the verdict to "- FAIL" or change "## Blocking Findings" to a single "- none" row.',
        }),
      );
    } else if (verdictValue === "FAIL" && blocking.items.length === 0) {
      issues.push(
        parseIssue({
          code: "fail_without_blockers",
          section: "Blocking Findings",
          detail: "FAIL verdict did not include blocking findings",
          repair:
            'Add at least one concrete blocker under "## Blocking Findings" or change the verdict to "- PASS" with evidence.',
        }),
      );
    } else if (verdictValue === "INCONCLUSIVE") {
      issues.push(
        parseIssue({
          code: "inconclusive_verdict",
          section: "Verdict",
          detail: "INCONCLUSIVE verdict cannot be auto-accepted",
          repair:
            'Resolve the review to "- PASS" with concrete evidence or "- FAIL" with concrete blocking findings.',
        }),
      );
    } else if (
      verdictValue === "PASS" &&
      !advisories.items.some(hasConcreteSpecializedReviewEvidence)
    ) {
      issues.push(
        parseIssue({
          code: "pass_without_concrete_evidence",
          section: "Advisories",
          detail: "PASS verdict did not include concrete inspection evidence",
          repair:
            "Add an Advisories bullet with concrete inspected file paths, command/test output, or manifest/evidence details.",
        }),
      );
    }
  }

  const previousResult = parseSidecarPreviousFindingItems({
    items: previous.items,
    source: role,
    previousFindingsInput,
  });
  issues.push(...previousResult.issues);
  if (issues.length > 0) {
    return parseErrorResult("specialized_role_output", issues);
  }

  return {
    ok: true,
    value: {
      role,
      blockingFindings: blocking.items.map((item) => ({
        id: createAutoReviewFindingId(role, item),
        text: normalizeReviewText(item),
        source: role,
      })),
      advisories: advisories.items.map((item) => ({
        source: role,
        text: normalizeReviewText(item),
      })),
      previousFindings: previousResult.value,
    },
  };
}

function hasConcreteSpecializedReviewEvidence(text: string): boolean {
  const normalized = normalizeFindingText(text);
  if (normalized.length < 16) return false;
  return [
    /\b[\w./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yaml|yml|py|sh|ps1|css|scss|html)(?::\d+)?\b/i,
    /`[^`]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yaml|yml|py|sh|ps1|css|scss|html)(?::\d+)?`/i,
    /\b(?:command|test|tests|lint|build|validator|git|rg|npm(?:\.cmd)?)\b[^.]*\b(?:output|exit code|status|passed|failed|inspected|matched)\b/i,
    /\b(?:manifest|evidenceRefs?|scope coverage|autoReviewState|manualReviewRequired|blocked_external)\b[^.]*\b(?:present|bound|covered|validated|contains|set|true|false|null)\b/i,
  ].some((pattern) => pattern.test(normalized));
}

export function buildSpecializedRoleManualReviewOutput(input: {
  role: SpecializedReviewerRole;
  reason: string;
}): ParsedSpecializedRoleOutput {
  const text = `manual_review_required: ${input.role} reviewer ${input.reason}`;
  return {
    role: input.role,
    blockingFindings: [
      {
        id: createAutoReviewFindingId(input.role, text),
        source: input.role,
        status: "manual_review_required",
        text: normalizeReviewText(text),
      },
    ],
    advisories: [
      {
        source: input.role,
        text: "Raw specialized reviewer output is retained below with provider-text redaction applied.",
      },
    ],
    previousFindings: [],
  };
}

function parseSecurityCoverageItemsResult(items: string[]): {
  value: AutoReviewSecurityCoverage[] | null;
  issues: StructuredReviewParseIssue[];
} {
  const coverage: AutoReviewSecurityCoverage[] = [];
  const seenAreas = new Set<AutoReviewSecurityCoverageArea>();
  const issues: StructuredReviewParseIssue[] = [];
  for (const item of items) {
    const match = item.match(
      new RegExp(
        `^${SECURITY_COVERAGE_AREA_PATTERN}\\s+\\|\\s+${SECURITY_COVERAGE_STATUS_PATTERN}\\s+\\|\\s+(.+)$`,
      ),
    );
    if (!match) {
      issues.push(
        parseIssue({
          code: "malformed_security_coverage",
          section: "Security Coverage",
          row: item,
          detail: `Malformed Security Coverage row: ${item}`,
          repair:
            'Use Security Coverage rows formatted as "- <area> | <status> | <concrete note>".',
        }),
      );
      continue;
    }
    const area = match[1] as AutoReviewSecurityCoverageArea;
    if (seenAreas.has(area)) {
      issues.push(
        parseIssue({
          code: "duplicate_security_coverage_area",
          section: "Security Coverage",
          row: item,
          detail: `Duplicate Security Coverage area: ${area}`,
          repair: `Keep exactly one Security Coverage row for ${area}.`,
        }),
      );
      continue;
    }
    seenAreas.add(area);
    coverage.push({
      area,
      status: match[2] as AutoReviewSecurityCoverageStatus,
      note: normalizeReviewText(match[3]),
    });
  }
  for (const area of REQUIRED_SECURITY_COVERAGE_AREAS) {
    if (seenAreas.has(area)) continue;
    issues.push(
      parseIssue({
        code: "missing_security_coverage_area",
        section: "Security Coverage",
        detail: `Missing Security Coverage area: ${area}`,
        repair: `Add exactly one Security Coverage row for ${area}.`,
      }),
    );
  }
  return { value: issues.length === 0 ? coverage : null, issues };
}

function formatCanonicalPreviousFindingLine(finding: AutoReviewPreviousFinding): string {
  return `- [${finding.id}] ${finding.source} | ${finding.status} | ${normalizeReviewText(finding.note)}`;
}

function formatCanonicalBlockingFindingLine(finding: AutoReviewFinding): string {
  return `- [${finding.id}] ${finding.source} | ${normalizeReviewText(finding.text)}`;
}

function formatCanonicalAdvisoryLine(advisory: AutoReviewAdvisory): string {
  return `- ${advisory.source} | ${normalizeReviewText(advisory.text)}`;
}

function formatCanonicalSecurityCoverageLine(coverage: AutoReviewSecurityCoverage): string {
  return `- ${coverage.area} | ${coverage.status} | ${normalizeReviewText(coverage.note)}`;
}

function mergeSecurityCoverage(
  codeReviewCoverage: AutoReviewSecurityCoverage[],
  securityAuditCoverage: AutoReviewSecurityCoverage[],
): AutoReviewSecurityCoverage[] {
  const byArea = new Map<AutoReviewSecurityCoverageArea, AutoReviewSecurityCoverage>();
  for (const coverage of [...codeReviewCoverage, ...securityAuditCoverage]) {
    byArea.set(coverage.area, coverage);
  }
  return REQUIRED_SECURITY_COVERAGE_AREAS.map((area) => byArea.get(area)).filter(
    (coverage): coverage is AutoReviewSecurityCoverage => Boolean(coverage),
  );
}

const PREVIOUS_FINDING_STATUS_PRIORITY: Record<AutoReviewPreviousFindingStatus, number> = {
  resolved: 1,
  not_reproducible: 2,
  new_blocker: 3,
  still_blocking: 4,
  manual_review_required: 5,
};

function mergePreviousFindings(input: {
  previousFindings: AutoReviewPreviousFinding[];
  previousFindingsInput?: AutoReviewFinding[];
}): AutoReviewPreviousFinding[] {
  const byId = new Map<string, AutoReviewPreviousFinding>();
  const expectedSources = input.previousFindingsInput
    ? new Map(input.previousFindingsInput.map((finding) => [finding.id, finding.source]))
    : null;

  for (const finding of input.previousFindings) {
    const expectedSource = expectedSources?.get(finding.id);
    if (expectedSources && !expectedSource) continue;
    const normalizedFinding = expectedSource ? { ...finding, source: expectedSource } : finding;
    const existing = byId.get(finding.id);
    if (!existing) {
      byId.set(finding.id, normalizedFinding);
      continue;
    }

    const existingPriority = PREVIOUS_FINDING_STATUS_PRIORITY[existing.status] ?? 0;
    const candidatePriority = PREVIOUS_FINDING_STATUS_PRIORITY[normalizedFinding.status] ?? 0;
    const selected = candidatePriority > existingPriority ? normalizedFinding : existing;
    const source = existing.source === normalizedFinding.source ? selected.source : existing.source;
    const note =
      existing.note === normalizedFinding.note
        ? selected.note
        : normalizeReviewText(
            `${selected.note} Conflicting reviewer status for [${normalizedFinding.id}] was consolidated from ${existing.source}:${existing.status} and ${normalizedFinding.source}:${normalizedFinding.status}.`,
          );

    byId.set(normalizedFinding.id, {
      ...selected,
      source,
      note,
      text: note,
      closureEvidence: note,
    });
  }

  return [...byId.values()];
}

export function buildStructuredReviewComments(input: {
  strategy: AutoReviewStrategy;
  iteration: number;
  codeReview: ParsedStructuredSidecarOutput;
  securityAudit: ParsedStructuredSidecarOutput;
  specializedReviews?: ParsedSpecializedRoleOutput[];
  previousFindingsInput?: AutoReviewFinding[];
  rawCodeReview: string;
  rawSecurityAudit: string;
  rawSpecializedReviews?: Array<{ role: SpecializedReviewerRole; rawOutput: string }>;
}): string {
  const previousFindings = mergePreviousFindings({
    previousFindings: [
      ...input.codeReview.previousFindings,
      ...input.securityAudit.previousFindings,
      ...(input.specializedReviews ?? []).flatMap((review) => review.previousFindings),
    ],
    previousFindingsInput: input.previousFindingsInput,
  });
  const advisories = [
    ...input.codeReview.advisories,
    ...input.securityAudit.advisories,
    ...(input.specializedReviews ?? []).flatMap((review) => review.advisories),
  ];
  const securityCoverage = mergeSecurityCoverage(
    input.codeReview.securityCoverage,
    input.securityAudit.securityCoverage,
  );
  const blockingMap = new Map<string, AutoReviewFinding>();

  for (const finding of previousFindings) {
    if (
      finding.status !== "still_blocking" &&
      finding.status !== "new_blocker" &&
      finding.status !== "manual_review_required"
    ) {
      continue;
    }
    blockingMap.set(finding.id, {
      id: finding.id,
      source: finding.source,
      status: finding.status,
      text: normalizeReviewText(finding.note),
      closureEvidence: normalizeReviewText(finding.closureEvidence ?? finding.note),
    });
  }

  for (const finding of [
    ...input.codeReview.blockingFindings,
    ...input.securityAudit.blockingFindings,
    ...(input.specializedReviews ?? []).flatMap((review) => review.blockingFindings),
  ]) {
    const blockingFinding: AutoReviewFinding = {
      ...finding,
      text: normalizeReviewText(finding.text),
    };
    if (finding.closureEvidence) {
      blockingFinding.closureEvidence = normalizeReviewText(finding.closureEvidence);
    }
    blockingMap.set(finding.id, blockingFinding);
  }

  const blockingFindings = [...blockingMap.values()];

  const lines = [
    "## Auto Review Metadata",
    `- Strategy: ${input.strategy}`,
    `- Review Iteration: ${input.iteration}`,
    "",
    "## Previous Findings",
    ...(previousFindings.length > 0
      ? previousFindings.map(formatCanonicalPreviousFindingLine)
      : ["- none"]),
    "",
    "## Blocking Findings",
    ...(blockingFindings.length > 0
      ? blockingFindings.map(formatCanonicalBlockingFindingLine)
      : ["- none"]),
    "",
    "## Advisories",
    ...(advisories.length > 0 ? advisories.map(formatCanonicalAdvisoryLine) : ["- none"]),
    "",
    "## Security Coverage",
    ...(securityCoverage.length > 0
      ? securityCoverage.map(formatCanonicalSecurityCoverageLine)
      : ["- none"]),
    "",
    "## Raw Code Review",
    redactProviderText(input.rawCodeReview.trim()) || "No code review output.",
    "",
    "## Raw Security Audit",
    redactProviderText(input.rawSecurityAudit.trim()) || "No security audit output.",
    ...(input.rawSpecializedReviews ?? []).flatMap((review) => [
      "",
      `## Raw Specialized Review: ${review.role}`,
      redactProviderText(review.rawOutput.trim()) || `No ${review.role} reviewer output.`,
    ]),
  ];

  return lines.join("\n");
}

export function parseStructuredReviewComments(
  reviewComments: string | null,
): ParsedStructuredReviewComments | null {
  const result = parseStructuredReviewCommentsResult(reviewComments);
  return result.ok ? result.value : null;
}

export function parseStructuredReviewCommentsResult(
  reviewComments: string | null,
  previousFindingsInput: AutoReviewFinding[] = [],
): StructuredReviewParseResult<ParsedStructuredReviewComments> {
  const normalizedComments = reviewComments?.trim();
  if (!normalizedComments) {
    return parseErrorResult("structured_review_comments", [
      parseIssue({
        code: "missing_required_section",
        section: "Auto Review Metadata",
        detail: "Structured review comments were empty",
        repair:
          'Return canonical structured review comments beginning with "## Auto Review Metadata".',
      }),
    ]);
  }

  const canonicalSummary = normalizedComments.split(/\n## Raw Code Review\b/)[0]?.trim();
  const collected = collectSectionData(canonicalSummary || normalizedComments);
  const issues = duplicateSectionIssues(collected.duplicateNames);
  const metadata = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Auto Review Metadata",
  });
  const previous = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Previous Findings",
  });
  const blocking = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Blocking Findings",
  });
  const advisories = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Advisories",
  });
  const security = normalizeRequiredListSection({
    sections: collected.sections,
    section: "Security Coverage",
    missingCode: "missing_security_coverage",
    malformedCode: "malformed_security_coverage",
  });
  issues.push(...metadata.issues, ...previous.issues, ...blocking.issues, ...advisories.issues);
  issues.push(...security.issues);

  if (
    !metadata.items ||
    !previous.items ||
    !blocking.items ||
    !advisories.items ||
    !security.items
  ) {
    return parseErrorResult("structured_review_comments", issues);
  }

  const strategyLine = metadata.items.find((line) => line.startsWith("Strategy: "));
  const iterationLine = metadata.items.find((line) => line.startsWith("Review Iteration: "));
  if (!strategyLine) {
    issues.push(
      parseIssue({
        code: "missing_metadata",
        section: "Auto Review Metadata",
        detail: "Missing Strategy metadata row",
        repair: 'Add "- Strategy: full_re_review" or "- Strategy: closure_first".',
      }),
    );
  }
  if (!iterationLine) {
    issues.push(
      parseIssue({
        code: "missing_metadata",
        section: "Auto Review Metadata",
        detail: "Missing Review Iteration metadata row",
        repair: 'Add "- Review Iteration: <positive integer>".',
      }),
    );
  }

  const strategy = strategyLine?.slice("Strategy: ".length).trim();
  if (strategy !== "full_re_review" && strategy !== "closure_first") {
    issues.push(
      parseIssue({
        code: "invalid_metadata",
        section: "Auto Review Metadata",
        detail: `Invalid strategy metadata: ${strategy ?? "<missing>"}`,
        repair: 'Set Strategy to exactly "full_re_review" or "closure_first".',
      }),
    );
  }

  const iterationText = iterationLine?.slice("Review Iteration: ".length).trim() ?? "";
  const iteration = /^[1-9]\d*$/.test(iterationText)
    ? Number.parseInt(iterationText, 10)
    : Number.NaN;
  if (!Number.isSafeInteger(iteration) || iteration < 1) {
    issues.push(
      parseIssue({
        code: "invalid_metadata",
        section: "Auto Review Metadata",
        detail: `Invalid Review Iteration metadata: ${iterationLine ?? "<missing>"}`,
        repair: "Set Review Iteration to a positive integer.",
      }),
    );
  }

  const previousResult = parseCanonicalPreviousFindingItems(previous.items, previousFindingsInput);
  issues.push(...previousResult.issues);

  const blockingFindings: AutoReviewFinding[] = [];
  for (const item of blocking.items) {
    const match = item.match(
      new RegExp(`^\\[([^\\]]+)\\]\\s+${AUTO_REVIEW_FINDING_SOURCE_PATTERN}\\s+\\|\\s+(.+)$`),
    );
    if (!match) {
      issues.push(
        parseIssue({
          code: "malformed_blocking_finding",
          section: "Blocking Findings",
          row: item,
          detail: `Malformed Blocking Findings row: ${item}`,
          repair:
            'Use Blocking Findings rows formatted as "- [finding-id] <source> | <required fix>" or a single "- none".',
        }),
      );
      continue;
    }
    blockingFindings.push({
      id: match[1],
      source: match[2] as AutoReviewFindingSource,
      text: normalizeReviewText(match[3]),
    });
  }

  const parsedAdvisories: AutoReviewAdvisory[] = [];
  for (const item of advisories.items) {
    const match = item.match(new RegExp(`^${AUTO_REVIEW_FINDING_SOURCE_PATTERN}\\s+\\|\\s+(.+)$`));
    if (!match) {
      issues.push(
        parseIssue({
          code: "malformed_advisory",
          section: "Advisories",
          row: item,
          detail: `Malformed Advisories row: ${item}`,
          repair: 'Use Advisories rows formatted as "- <source> | <advisory text>" or "- none".',
        }),
      );
      continue;
    }
    parsedAdvisories.push({
      source: match[1] as AutoReviewFindingSource,
      text: normalizeReviewText(match[2]),
    });
  }

  const securityCoverage = parseSecurityCoverageItemsResult(security.items);
  issues.push(...securityCoverage.issues);
  if (
    issues.length > 0 ||
    (strategy !== "full_re_review" && strategy !== "closure_first") ||
    !Number.isSafeInteger(iteration) ||
    iteration < 1 ||
    !securityCoverage.value
  ) {
    return parseErrorResult("structured_review_comments", issues);
  }

  return {
    ok: true,
    value: {
      strategy,
      iteration,
      blockingFindings,
      advisories: parsedAdvisories,
      previousFindings: previousResult.value,
      securityCoverage: securityCoverage.value,
    },
  };
}

function parseCanonicalPreviousFindingItems(
  items: string[],
  previousFindingsInput: AutoReviewFinding[],
): { value: AutoReviewPreviousFinding[]; issues: StructuredReviewParseIssue[] } {
  const previousFindings: AutoReviewPreviousFinding[] = [];
  const issues: StructuredReviewParseIssue[] = [];
  const expected = new Map(previousFindingsInput.map((finding) => [finding.id, finding.source]));
  const seen = new Set<string>();

  for (const item of items) {
    const match = item.match(
      new RegExp(
        `^\\[([^\\]]+)\\]\\s+${AUTO_REVIEW_FINDING_SOURCE_PATTERN}\\s+\\|\\s+${PREVIOUS_FINDING_STATUS_PATTERN}\\s+\\|\\s+(.+)$`,
      ),
    );
    if (!match) {
      issues.push(
        parseIssue({
          code: "malformed_previous_finding",
          section: "Previous Findings",
          row: item,
          detail: `Malformed Previous Findings row: ${item}`,
          repair:
            'Use Previous Findings rows formatted as "- [finding-id] <source> | <status> | <concrete evidence or note>".',
        }),
      );
      continue;
    }
    const id = match[1];
    if (seen.has(id)) {
      issues.push(
        parseIssue({
          code: "duplicate_previous_finding",
          section: "Previous Findings",
          row: item,
          detail: `Duplicate previous finding id: ${id}`,
          repair: `Include exactly one Previous Findings row for [${id}].`,
        }),
      );
      continue;
    }
    seen.add(id);
    const source = match[2] as AutoReviewFindingSource;
    if (previousFindingsInput.length > 0 && expected.get(id) !== source) {
      issues.push(
        parseIssue({
          code: expected.has(id) ? "malformed_previous_finding" : "unknown_previous_finding",
          section: "Previous Findings",
          row: item,
          detail: expected.has(id)
            ? `Previous finding [${id}] used the wrong source`
            : `Unknown previous finding id: ${id}`,
          repair: expected.has(id)
            ? `Use the original source for [${id}] in Previous Findings.`
            : `Remove [${id}] or replace it with one of the provided previous finding ids.`,
        }),
      );
      continue;
    }
    previousFindings.push({
      id,
      source,
      status: match[3] as AutoReviewPreviousFindingStatus,
      note: normalizeReviewText(match[4]),
      text: normalizeReviewText(match[4]),
      closureEvidence: normalizeReviewText(match[4]),
    });
  }

  for (const finding of previousFindingsInput) {
    if (seen.has(finding.id)) continue;
    issues.push(
      parseIssue({
        code: "missing_previous_finding",
        section: "Previous Findings",
        detail: `Missing Previous Findings coverage for [${finding.id}]`,
        repair: `Add a Previous Findings row for [${finding.id}] with source ${finding.source}, a valid status, and concrete evidence or note.`,
      }),
    );
  }

  return {
    value: previousFindings,
    issues,
  };
}

export function toAutoReviewState(input: {
  strategy: AutoReviewStrategy;
  iteration: number;
  findings: AutoReviewFinding[];
  securityCoverage?: AutoReviewSecurityCoverage[];
  blockerHistory?: AutoReviewPreviousFinding[];
}): AutoReviewState {
  const state: AutoReviewState = {
    strategy: input.strategy,
    iteration: input.iteration,
    findings: input.findings.map((finding) => ({
      ...finding,
      text: normalizeReviewText(finding.text),
    })),
  };

  for (const finding of state.findings) {
    if (finding.claim) finding.claim = normalizeReviewText(finding.claim);
    if (finding.requiredFix) finding.requiredFix = normalizeReviewText(finding.requiredFix);
    if (finding.verification) finding.verification = normalizeReviewText(finding.verification);
    if (finding.closureEvidence) {
      finding.closureEvidence = normalizeReviewText(finding.closureEvidence);
    }
  }

  if (input.securityCoverage) {
    state.securityCoverage = input.securityCoverage.map((coverage) => ({
      ...coverage,
      note: normalizeReviewText(coverage.note),
    }));
  }
  if (input.blockerHistory) {
    state.blockerHistory = input.blockerHistory.map((finding) => ({
      id: finding.id,
      source: finding.source,
      status: finding.status,
      note: normalizeReviewText(finding.note),
      iteration: input.iteration,
      closureEvidence: finding.closureEvidence
        ? normalizeReviewText(finding.closureEvidence)
        : normalizeReviewText(finding.note),
    }));
  }

  return state;
}
