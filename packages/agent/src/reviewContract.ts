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

function collectSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      current = line.slice(3).trim();
      if (!sections.has(current)) {
        sections.set(current, []);
      }
      continue;
    }
    if (current) {
      sections.get(current)?.push(line);
    }
  }

  return sections;
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

export function parseStructuredSidecarOutput(
  resultText: string,
  source: AutoReviewFindingSource,
  previousFindingsInput: AutoReviewFinding[] = [],
): ParsedStructuredSidecarOutput | null {
  const sections = collectSections(resultText);
  const blockingItems = normalizeListSection(sections.get("Blocking Findings"));
  const advisoryItems = normalizeListSection(sections.get("Advisories"));
  const previousItems = normalizeListSection(sections.get("Previous Findings") ?? []);
  const securityCoverageItems = normalizeListSection(sections.get("Security Coverage"));

  if (
    !blockingItems ||
    !advisoryItems ||
    previousItems === null ||
    securityCoverageItems === null
  ) {
    return null;
  }

  const previousFindings: AutoReviewPreviousFinding[] = [];
  const previousFindingMap = new Map(previousFindingsInput.map((finding) => [finding.id, finding]));
  for (const item of previousItems) {
    const match = item.match(
      new RegExp(`^\\[([^\\]]+)\\]\\s+${PREVIOUS_FINDING_STATUS_PATTERN}\\s+\\|\\s+(.+)$`),
    );
    if (!match) {
      return null;
    }
    const matchedFinding = previousFindingMap.get(match[1]);
    if (!matchedFinding && previousFindingsInput.length > 0) {
      return null;
    }
    previousFindings.push({
      id: match[1],
      source: matchedFinding?.source ?? source,
      status: match[2] as AutoReviewPreviousFindingStatus,
      note: normalizeReviewText(match[3]),
      text: normalizeReviewText(match[3]),
      closureEvidence: normalizeReviewText(match[3]),
    });
  }

  if (
    previousFindingsInput.length > 0 &&
    previousFindings.length !== previousFindingsInput.length
  ) {
    return null;
  }

  const securityCoverage = parseSecurityCoverageItems(securityCoverageItems);
  if (!securityCoverage) return null;

  return {
    blockingFindings: blockingItems.map((item) => ({
      id: createAutoReviewFindingId(source, item),
      text: normalizeReviewText(item),
      source,
    })),
    advisories: advisoryItems.map((item) => ({
      source,
      text: normalizeReviewText(item),
    })),
    previousFindings,
    securityCoverage,
  };
}

export function parseSpecializedRoleOutput(
  resultText: string,
  role: SpecializedReviewerRole,
  previousFindingsInput: AutoReviewFinding[] = [],
): ParsedSpecializedRoleOutput | null {
  const sections = collectSections(resultText);
  const verdictLines = normalizeListSection(sections.get("Verdict"));
  const blockingItems = normalizeListSection(sections.get("Blocking Findings"));
  const advisoryItems = normalizeListSection(sections.get("Advisories"));
  const previousItems = normalizeListSection(sections.get("Previous Findings"));

  if (
    !verdictLines ||
    verdictLines.length !== 1 ||
    !blockingItems ||
    !advisoryItems ||
    previousItems === null
  ) {
    return null;
  }

  const verdict = verdictLines[0]?.trim().toUpperCase();
  if (verdict !== "PASS" && verdict !== "FAIL" && verdict !== "INCONCLUSIVE") {
    return null;
  }
  if (verdict === "PASS" && blockingItems.length > 0) {
    return null;
  }
  if (verdict === "FAIL" && blockingItems.length === 0) {
    return null;
  }
  if (verdict === "INCONCLUSIVE") {
    return null;
  }
  if (verdict === "PASS" && !advisoryItems.some(hasConcreteSpecializedReviewEvidence)) {
    return null;
  }

  const previousFindings: AutoReviewPreviousFinding[] = [];
  const previousFindingMap = new Map(previousFindingsInput.map((finding) => [finding.id, finding]));
  for (const item of previousItems) {
    const match = item.match(
      new RegExp(`^\\[([^\\]]+)\\]\\s+${PREVIOUS_FINDING_STATUS_PATTERN}\\s+\\|\\s+(.+)$`),
    );
    if (!match) {
      return null;
    }
    const matchedFinding = previousFindingMap.get(match[1]);
    if (!matchedFinding && previousFindingsInput.length > 0) {
      return null;
    }
    previousFindings.push({
      id: match[1],
      source: matchedFinding?.source ?? role,
      status: match[2] as AutoReviewPreviousFindingStatus,
      note: normalizeReviewText(match[3]),
      text: normalizeReviewText(match[3]),
      closureEvidence: normalizeReviewText(match[3]),
    });
  }

  if (
    previousFindingsInput.length > 0 &&
    previousFindings.length !== previousFindingsInput.length
  ) {
    return null;
  }

  return {
    role,
    blockingFindings: blockingItems.map((item) => ({
      id: createAutoReviewFindingId(role, item),
      text: normalizeReviewText(item),
      source: role,
    })),
    advisories: advisoryItems.map((item) => ({
      source: role,
      text: normalizeReviewText(item),
    })),
    previousFindings,
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

function parseSecurityCoverageItems(items: string[]): AutoReviewSecurityCoverage[] | null {
  const coverage: AutoReviewSecurityCoverage[] = [];
  const seenAreas = new Set<AutoReviewSecurityCoverageArea>();
  for (const item of items) {
    const match = item.match(
      new RegExp(
        `^${SECURITY_COVERAGE_AREA_PATTERN}\\s+\\|\\s+${SECURITY_COVERAGE_STATUS_PATTERN}\\s+\\|\\s+(.+)$`,
      ),
    );
    if (!match) return null;
    const area = match[1] as AutoReviewSecurityCoverageArea;
    if (seenAreas.has(area)) return null;
    seenAreas.add(area);
    coverage.push({
      area,
      status: match[2] as AutoReviewSecurityCoverageStatus,
      note: normalizeReviewText(match[3]),
    });
  }
  if (coverage.length !== REQUIRED_SECURITY_COVERAGE_AREAS.length) return null;
  if (REQUIRED_SECURITY_COVERAGE_AREAS.some((area) => !seenAreas.has(area))) return null;
  return coverage;
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

export function buildStructuredReviewComments(input: {
  strategy: AutoReviewStrategy;
  iteration: number;
  codeReview: ParsedStructuredSidecarOutput;
  securityAudit: ParsedStructuredSidecarOutput;
  specializedReviews?: ParsedSpecializedRoleOutput[];
  rawCodeReview: string;
  rawSecurityAudit: string;
  rawSpecializedReviews?: Array<{ role: SpecializedReviewerRole; rawOutput: string }>;
}): string {
  const previousFindings = [
    ...input.codeReview.previousFindings,
    ...input.securityAudit.previousFindings,
    ...(input.specializedReviews ?? []).flatMap((review) => review.previousFindings),
  ];
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
  const normalizedComments = reviewComments?.trim();
  if (!normalizedComments) return null;

  const canonicalSummary = normalizedComments.split(/\n## Raw Code Review\b/)[0]?.trim();
  const sections = collectSections(canonicalSummary || normalizedComments);
  const metadataLines = normalizeListSection(sections.get("Auto Review Metadata"));
  const blockingItems = normalizeListSection(sections.get("Blocking Findings"));
  const advisoryItems = normalizeListSection(sections.get("Advisories"));
  const previousItems = normalizeListSection(sections.get("Previous Findings"));
  const securityCoverageItems = normalizeListSection(sections.get("Security Coverage"));

  if (
    !metadataLines ||
    !blockingItems ||
    !advisoryItems ||
    previousItems === null ||
    securityCoverageItems === null
  ) {
    return null;
  }

  const strategyLine = metadataLines.find((line) => line.startsWith("Strategy: "));
  const iterationLine = metadataLines.find((line) => line.startsWith("Review Iteration: "));
  if (!strategyLine || !iterationLine) {
    return null;
  }

  const strategy = strategyLine.slice("Strategy: ".length).trim();
  if (strategy !== "full_re_review" && strategy !== "closure_first") {
    return null;
  }

  const iteration = Number.parseInt(iterationLine.slice("Review Iteration: ".length).trim(), 10);
  if (!Number.isFinite(iteration) || iteration < 1) {
    return null;
  }

  const previousFindings: AutoReviewPreviousFinding[] = [];
  for (const item of previousItems) {
    const match = item.match(
      new RegExp(
        `^\\[([^\\]]+)\\]\\s+${AUTO_REVIEW_FINDING_SOURCE_PATTERN}\\s+\\|\\s+${PREVIOUS_FINDING_STATUS_PATTERN}\\s+\\|\\s+(.+)$`,
      ),
    );
    if (!match) {
      return null;
    }
    previousFindings.push({
      id: match[1],
      source: match[2] as AutoReviewFindingSource,
      status: match[3] as AutoReviewPreviousFindingStatus,
      note: normalizeReviewText(match[4]),
      text: normalizeReviewText(match[4]),
      closureEvidence: normalizeReviewText(match[4]),
    });
  }

  const blockingFindings: AutoReviewFinding[] = [];
  for (const item of blockingItems) {
    const match = item.match(
      new RegExp(`^\\[([^\\]]+)\\]\\s+${AUTO_REVIEW_FINDING_SOURCE_PATTERN}\\s+\\|\\s+(.+)$`),
    );
    if (!match) {
      return null;
    }
    blockingFindings.push({
      id: match[1],
      source: match[2] as AutoReviewFindingSource,
      text: normalizeReviewText(match[3]),
    });
  }

  const advisories: AutoReviewAdvisory[] = [];
  for (const item of advisoryItems) {
    const match = item.match(new RegExp(`^${AUTO_REVIEW_FINDING_SOURCE_PATTERN}\\s+\\|\\s+(.+)$`));
    if (!match) {
      return null;
    }
    advisories.push({
      source: match[1] as AutoReviewFindingSource,
      text: normalizeReviewText(match[2]),
    });
  }

  const securityCoverage = parseSecurityCoverageItems(securityCoverageItems);
  if (!securityCoverage) return null;

  return {
    strategy,
    iteration,
    blockingFindings,
    advisories,
    previousFindings,
    securityCoverage,
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
