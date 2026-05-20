import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { createRuntimeWorkflowSpec } from "@aif/runtime";
import {
  evaluateTaskCompletionEvidence,
  extractAuditReportManifestEvidenceRefs,
  hasSubstantiveReportEvidence,
  isRiskyTask,
  redactProviderText,
  resolveAuditPlanId,
  type AutoReviewFinding,
  type AutoReviewStrategy,
  type TaskCompletionEvidenceTask,
} from "@aif/shared";
import {
  assertSafeRoadmapArtifactPath,
  findRoadmapBatchArtifactByTaskId,
  listAuditEvidenceEvents,
} from "@aif/data";
import {
  createAutoReviewFindingId,
  parseStructuredReviewComments,
  toAutoReviewState,
  type ParsedStructuredReviewComments,
} from "./reviewContract.js";
import { executeSubagentQuery } from "./subagentQuery.js";

const AUDIT_REPORT_MANIFEST_BLOCK_PATTERN = /```audit-report-manifest\b/i;

export type ReviewGateParserMode = "structured" | "fallback";

export type ReviewGateManualHandoffReason =
  | "new_blockers_after_rework"
  | "malformed_review_output_fallback"
  | "malformed_structured_review_contract"
  | "risky_review_without_substantive_evidence";

export interface ReviewGateMetrics {
  strategy: AutoReviewStrategy;
  iteration: number;
  previousBlockingCount: number;
  stillBlockingCount: number;
  newBlockingCount: number;
  totalBlockingCount: number;
  parserMode: ReviewGateParserMode;
}

type ReviewGateBaseResult = {
  metrics: ReviewGateMetrics;
  blockingFindings: AutoReviewFinding[];
  fixesMarkdown: string;
};

export type ReviewGateResult =
  | (ReviewGateBaseResult & {
      status: "success";
      autoReviewState: null;
    })
  | (ReviewGateBaseResult & {
      status: "request_changes";
      autoReviewState: ReturnType<typeof toAutoReviewState>;
    })
  | (ReviewGateBaseResult & {
      status: "manual_review_required";
      autoReviewState: ReturnType<typeof toAutoReviewState>;
      handoffReason: ReviewGateManualHandoffReason;
    })
  | (ReviewGateBaseResult & {
      status: "operator_input_required";
      autoReviewState: ReturnType<typeof toAutoReviewState>;
    });

export interface ReviewGateInput {
  taskId: string;
  projectRoot: string;
  reviewComments: string | null;
  strategy: AutoReviewStrategy;
  iteration: number;
  previousFindings: AutoReviewFinding[];
  task?: TaskCompletionEvidenceTask;
}

const SUCCESS_TOKEN = "SUCCESS";

function formatFixesMarkdown(findings: AutoReviewFinding[]): string {
  if (findings.length === 0) {
    return "- none";
  }

  return findings
    .map((finding) => `- [${finding.id}] ${finding.source} | ${finding.text}`)
    .join("\n");
}

function sanitizeReviewText(text: string): string {
  return redactProviderText(text.replace(/\s+/g, " ").trim()).replace(
    /\[REDACTED\]\]+/g,
    "[REDACTED]",
  );
}

function isExplicitOperatorInputFinding(finding: AutoReviewFinding): boolean {
  return /^operator_input_required:/i.test(finding.text.trim());
}

function isPolicyOrSecuritySensitiveAmbiguity(text: string): boolean {
  return /\b(policy|security|secret|token|credential|private key|bearer|cookie|malformed|unsafe to auto-close|ambiguous evidence|human judgment|manual review)\b/i.test(
    text,
  );
}

function isConcreteOperatorInputFinding(finding: AutoReviewFinding): boolean {
  const text = finding.text.trim();
  if (isExplicitOperatorInputFinding(finding)) return true;
  if (finding.source === "review_gate") return false;
  if (isPolicyOrSecuritySensitiveAmbiguity(text)) return false;
  return (
    /\b(operator|user|human|maintainer|owner)\b/i.test(text) &&
    /\b(provide|supply|choose|select|confirm|decide|approve|grant|configure|set|update)\b/i.test(
      text,
    ) &&
    /\b(data|input|answer|decision|approval|access|permission|config|configuration|profile|value|setting|account|login)\b/i.test(
      text,
    )
  );
}

function normalizeOperatorInputFindings(findings: AutoReviewFinding[]): AutoReviewFinding[] {
  return findings.map((finding) => {
    const safeText = sanitizeReviewText(finding.text);
    const text = /^operator_input_required:/i.test(safeText)
      ? safeText.replace(/^operator_input_required:/i, "operator_input_required:")
      : `operator_input_required: ${safeText}`;
    return {
      ...finding,
      text,
      closureEvidence: finding.closureEvidence
        ? sanitizeReviewText(finding.closureEvidence)
        : finding.closureEvidence,
    };
  });
}

function buildOperatorInputDecision(input: {
  reviewInput: ReviewGateInput;
  metrics: ReviewGateMetrics;
  findings: AutoReviewFinding[];
}): ReviewGateResult {
  const enrichedFindings = enrichBlockingFindings({
    findings: normalizeOperatorInputFindings(input.findings),
    previousFindings: input.reviewInput.previousFindings,
    iteration: input.reviewInput.iteration,
  });
  return {
    status: "operator_input_required",
    metrics: input.metrics,
    blockingFindings: enrichedFindings,
    fixesMarkdown: formatFixesMarkdown(enrichedFindings),
    autoReviewState: toAutoReviewState({
      strategy: input.reviewInput.strategy,
      iteration: input.reviewInput.iteration,
      findings: enrichedFindings,
    }),
  };
}

function maybeBuildOperatorInputDecision(input: {
  reviewInput: ReviewGateInput;
  metrics: ReviewGateMetrics;
  findings: AutoReviewFinding[];
}): ReviewGateResult | null {
  if (input.findings.length === 0 || !input.findings.every(isConcreteOperatorInputFinding)) {
    return null;
  }
  return buildOperatorInputDecision({
    reviewInput: input.reviewInput,
    metrics: input.metrics,
    findings: input.findings,
  });
}

function maybeBuildManualReviewDecision(input: {
  reviewInput: ReviewGateInput;
  metrics: ReviewGateMetrics;
  findings: AutoReviewFinding[];
}): ReviewGateResult | null {
  const manualFindings = input.findings.filter((finding) =>
    /^manual_review_required:/i.test(finding.text.trim()),
  );
  if (manualFindings.length === 0) return null;
  const enrichedFindings = enrichBlockingFindings({
    findings: manualFindings.map((finding) => ({
      ...finding,
      text: sanitizeReviewText(finding.text),
      closureEvidence: finding.closureEvidence
        ? sanitizeReviewText(finding.closureEvidence)
        : finding.closureEvidence,
    })),
    previousFindings: input.reviewInput.previousFindings,
    iteration: input.reviewInput.iteration,
  });
  return {
    status: "manual_review_required",
    handoffReason: "malformed_review_output_fallback",
    metrics: input.metrics,
    blockingFindings: enrichedFindings,
    fixesMarkdown: formatFixesMarkdown(enrichedFindings),
    autoReviewState: toAutoReviewState({
      strategy: input.reviewInput.strategy,
      iteration: input.reviewInput.iteration,
      findings: enrichedFindings,
    }),
  };
}

function mergeFindings(...groups: AutoReviewFinding[][]): AutoReviewFinding[] {
  const map = new Map<string, AutoReviewFinding>();
  for (const group of groups) {
    for (const finding of group) {
      const existing = map.get(finding.id);
      if (!existing) {
        map.set(finding.id, finding);
        continue;
      }
      map.set(finding.id, {
        ...existing,
        ...finding,
        status: finding.status ?? existing.status,
        closureEvidence: finding.closureEvidence ?? existing.closureEvidence,
      });
    }
  }
  return [...map.values()];
}

function enrichBlockingFindings(input: {
  findings: AutoReviewFinding[];
  previousFindings: AutoReviewFinding[];
  iteration: number;
}): AutoReviewFinding[] {
  const previousById = new Map(input.previousFindings.map((finding) => [finding.id, finding]));
  return input.findings.map((finding) => {
    const previous = previousById.get(finding.id);
    if (!previous) {
      return {
        ...finding,
        firstSeenIteration: input.iteration,
        lastSeenIteration: input.iteration,
        streak: 1,
      };
    }

    const previousStreak =
      typeof previous.streak === "number" && Number.isInteger(previous.streak)
        ? Math.max(1, previous.streak)
        : 1;
    const previousFirstSeen =
      typeof previous.firstSeenIteration === "number" &&
      Number.isInteger(previous.firstSeenIteration) &&
      previous.firstSeenIteration > 0
        ? previous.firstSeenIteration
        : Math.max(1, input.iteration - previousStreak);

    return {
      ...finding,
      firstSeenIteration: previousFirstSeen,
      lastSeenIteration: input.iteration,
      streak: previousStreak + 1,
    };
  });
}

function reviewGateFinding(text: string): AutoReviewFinding {
  return {
    id: createAutoReviewFindingId("review_gate", text),
    source: "review_gate",
    text,
  };
}

function isDeterministicAuditSynthesisInconclusiveReview(reviewComments: string | null): boolean {
  return /\bDeterministic Review:\s*audit_synthesis_inconclusive\b/i.test(reviewComments ?? "");
}

function collectDeterministicReviewGateFindings(input: ReviewGateInput): AutoReviewFinding[] {
  if (!input.task || !isRiskyTask(input.task)) return [];
  if (isDeterministicAuditSynthesisInconclusiveReview(input.reviewComments)) return [];
  const artifact = findRoadmapBatchArtifactByTaskId(input.taskId);
  const evidenceRefs = artifact
    ? extractAuditReportManifestEvidenceRefs(
        readAuditArtifactText(input.projectRoot, artifact) ?? "",
      )
    : [];
  const auditEvidenceUnits = artifact
    ? listAuditEvidenceEvents({
        taskId: input.taskId,
        auditPlanId: resolveAuditPlanId({
          taskId: input.taskId,
          roadmapBatchId: artifact.batchId,
        }),
        evidenceIds: evidenceRefs.length > 0 ? evidenceRefs : undefined,
        limit: evidenceRefs.length > 0 ? Math.max(1, evidenceRefs.length) : undefined,
      })
    : [];
  const requireAuditLedgerEvidence = auditArtifactRequiresLedgerEvidence({
    artifact,
    projectRoot: input.projectRoot,
    auditEvidenceUnits,
  });

  const taskEvidence = evaluateTaskCompletionEvidence({
    task: { ...input.task, manualReviewRequired: false },
    projectRoot: input.projectRoot,
    auditEvidenceUnits,
    requireAuditLedgerEvidence,
  });
  if (taskEvidence.ok) return [];

  const inconclusiveIssues = taskEvidence.issues.filter(
    (entry) => entry.code === "audit_inconclusive",
  );
  if (inconclusiveIssues.length > 0) {
    return inconclusiveIssues.map((entry) =>
      reviewGateFinding(
        `Audit completion evidence blocked review gate (${entry.code}): ${entry.message}`,
      ),
    );
  }

  const auditValidationIssues = taskEvidence.evidence.auditReportValidation.issues;
  if (auditValidationIssues.length > 0) {
    return auditValidationIssues.map((entry) =>
      reviewGateFinding(
        `Audit report validator blocked completion (${entry.code}): ${entry.message}`,
      ),
    );
  }

  return taskEvidence.issues.map((entry) =>
    reviewGateFinding(
      `Audit completion evidence blocked review gate (${entry.code}): ${entry.message}`,
    ),
  );
}

function auditArtifactRequiresLedgerEvidence(input: {
  artifact: ReturnType<typeof findRoadmapBatchArtifactByTaskId>;
  projectRoot: string;
  auditEvidenceUnits: unknown[];
}): boolean {
  if (!input.artifact) return false;
  if (input.auditEvidenceUnits.length > 0) return true;
  return AUDIT_REPORT_MANIFEST_BLOCK_PATTERN.test(
    readAuditArtifactText(input.projectRoot, input.artifact) ?? "",
  );
}

function readAuditArtifactText(
  projectRoot: string,
  artifact: ReturnType<typeof findRoadmapBatchArtifactByTaskId>,
): string | null {
  if (!artifact) return null;
  try {
    const reportPath = resolveSafeArtifactPath(projectRoot, artifact.artifactPath);
    if (!reportPath) return null;
    return existsSync(reportPath) ? readFileSync(reportPath, "utf8") : null;
  } catch {
    return null;
  }
}

function resolveSafeArtifactPath(projectRoot: string, artifactPath: string): string | null {
  try {
    const normalizedArtifactPath = assertSafeRoadmapArtifactPath(artifactPath);
    const root = resolve(projectRoot);
    const candidate = resolve(root, normalizedArtifactPath);
    const relativePath = relative(root, candidate);
    if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

async function runLegacyFallbackExtraction(
  input: Pick<ReviewGateInput, "taskId" | "projectRoot" | "reviewComments">,
): Promise<AutoReviewFinding[]> {
  const normalizedComments = (input.reviewComments ?? "").trim();
  const prompt = `Read the review comments and extract only the points that must be fixed.

Review comments:
${normalizedComments.length > 0 ? normalizedComments : "No review comments provided."}

Rules:
1) If there are no issues that require fixes, return exactly one word: SUCCESS
2) If there are issues, return ONLY markdown bullet points in this exact format: "- <required fix>"
3) Output must be either:
   - exactly "SUCCESS"
   - or one or more lines, each starting with "- "
4) Do not include numbering, headings, prose, code fences, or any extra text`;

  const workflowSpec = createRuntimeWorkflowSpec({
    workflowKind: "review-gate",
    prompt,
    requiredCapabilities: [],
    fallbackStrategy: "none",
    sessionReusePolicy: "never",
    systemPromptAppend: "Do not use tools or subagents. Reply directly in plain text.",
  });

  const { resultText } = await executeSubagentQuery({
    taskId: input.taskId,
    projectRoot: input.projectRoot,
    agentName: "review-gate",
    prompt,
    workflowSpec,
    workflowKind: "review-gate",
    systemPromptAppend: "Do not use tools or subagents. Reply directly in plain text.",
  });

  const normalizedResultText = resultText.trim();
  if (!normalizedResultText) {
    throw new Error("Review auto-check returned empty response");
  }

  if (normalizedResultText.toUpperCase() === SUCCESS_TOKEN) {
    return [];
  }

  const trimmedLines = normalizedResultText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const bulletLines = trimmedLines.filter((line) => line.startsWith("- "));
  const hasOnlyBulletLines = bulletLines.length > 0 && bulletLines.length === trimmedLines.length;
  if (!hasOnlyBulletLines) {
    return [];
  }

  return bulletLines.map((line) => {
    const text = line.slice(2).trim();
    return {
      id: createAutoReviewFindingId("review_gate", text),
      source: "review_gate" as const,
      text,
    };
  });
}

function parseLegacyBlockingFindings(
  input: Pick<ReviewGateInput, "reviewComments">,
): AutoReviewFinding[] | null {
  const comments = input.reviewComments ?? "";
  const lines = comments.split(/\r?\n/);
  const blockingHeading = /^##\s+Blocking Findings\s*$/i;
  const anyHeading = /^#{1,6}\s+\S/;
  const findings: AutoReviewFinding[] = [];
  let sawBlockingSection = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (!blockingHeading.test(lines[index]?.trim() ?? "")) continue;

    sawBlockingSection = true;
    for (let sectionIndex = index + 1; sectionIndex < lines.length; sectionIndex += 1) {
      const line = lines[sectionIndex]?.trim() ?? "";
      if (anyHeading.test(line)) break;
      if (!line.startsWith("-")) continue;

      const text = line.replace(/^-\s*/, "").trim();
      if (!text || /^none\.?$/i.test(text)) continue;
      findings.push({
        id: createAutoReviewFindingId("review_gate", text),
        source: "review_gate",
        text,
      });
    }
  }

  return sawBlockingSection ? findings : null;
}

function buildMetrics(input: {
  strategy: AutoReviewStrategy;
  iteration: number;
  previousBlockingCount: number;
  stillBlockingCount: number;
  newBlockingCount: number;
  totalBlockingCount: number;
  parserMode: ReviewGateParserMode;
}): ReviewGateMetrics {
  return {
    strategy: input.strategy,
    iteration: input.iteration,
    previousBlockingCount: input.previousBlockingCount,
    stillBlockingCount: input.stillBlockingCount,
    newBlockingCount: input.newBlockingCount,
    totalBlockingCount: input.totalBlockingCount,
    parserMode: input.parserMode,
  };
}

function buildMissingPreviousFindingHandoff(
  input: ReviewGateInput,
  metrics: ReviewGateMetrics,
): ReviewGateResult {
  const enrichedPreviousFindings = enrichBlockingFindings({
    findings: input.previousFindings,
    previousFindings: input.previousFindings,
    iteration: input.iteration,
  });
  return {
    status: "manual_review_required",
    handoffReason: "malformed_review_output_fallback",
    metrics: {
      ...metrics,
      stillBlockingCount: enrichedPreviousFindings.length,
      totalBlockingCount: enrichedPreviousFindings.length,
    },
    blockingFindings: enrichedPreviousFindings,
    fixesMarkdown: formatFixesMarkdown(enrichedPreviousFindings),
    autoReviewState: toAutoReviewState({
      strategy: input.strategy,
      iteration: input.iteration,
      findings: enrichedPreviousFindings,
    }),
  };
}

function parsedPreviousFindingsMatchInput(
  input: ReviewGateInput,
  parsed: ParsedStructuredReviewComments,
): boolean {
  if (input.previousFindings.length === 0) {
    return parsed.previousFindings.length === 0;
  }
  if (parsed.previousFindings.length !== input.previousFindings.length) return false;

  const expected = new Map(input.previousFindings.map((finding) => [finding.id, finding.source]));
  const seen = new Set<string>();
  for (const finding of parsed.previousFindings) {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    if (expected.get(finding.id) !== finding.source) return false;
  }

  return seen.size === expected.size;
}

function parsedStructuredMetadataMatchesInput(
  input: ReviewGateInput,
  parsed: ParsedStructuredReviewComments,
): boolean {
  return parsed.strategy === input.strategy && parsed.iteration === input.iteration;
}

function resolvedPreviousFindingHasClosureEvidence(note: string): boolean {
  const normalized = note.trim();
  if (normalized.length < 24) return false;
  if (
    /^(fixed|done|resolved|addressed|handled|complete|completed|ok|okay|looks good|all good|verified|passes|pass|n\/a|none)\.?$/i.test(
      normalized,
    )
  ) {
    return false;
  }

  return [
    /`[^`]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yaml|yml|py|sh|ps1|css|scss|html)(?::\d+)?`/i,
    /\b[\w./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yaml|yml|py|sh|ps1|css|scss|html)(?::\d+)?\b/i,
    /\b(?:command|test|tests|lint|build|validator|git log)\b[^.]*\b(?:output|exit code|status|passed|failed|green)\b/i,
    /\b(?:manifest|evidenceRefs?|scope coverage)\b[^.]*\b(?:present|bound|covered|validated|`[^`]+`|\[[^\]]+\]|ev-\w+)\b/i,
    /\b(?:blocked_external|manualReviewRequired|autoReviewState)\b[^.]*\b(?:true|false|null|set|cleared|preserved|contains|=|:)\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function resolvedPreviousFindingsHaveClosureEvidence(
  parsed: ParsedStructuredReviewComments,
): boolean {
  return parsed.previousFindings.every(
    (finding) =>
      finding.status === "still_blocking" ||
      finding.status === "new_blocker" ||
      finding.status === "manual_review_required" ||
      resolvedPreviousFindingHasClosureEvidence(finding.note),
  );
}

const STRICT_AUDIT_VALIDATOR_BLOCKER_CODES = new Set([
  "invalid_report_manifest",
  "missing_scope_coverage",
  "missing_substantive_evidence",
  "fake_or_placeholder_command_output",
  "false_missing_path_claim",
  "future_tense_git_verification",
  "governance_observation_as_finding",
  "irrelevant_audit_evidence",
  "malformed_report_artifact",
  "missing_risk_hypotheses",
  "non_actionable_audit_observation",
  "placeholder_author_metadata",
  "speculative_audit_claim",
  "synthetic_git_output",
  "audit_evidence_discovery_only",
  "audit_evidence_identity_mismatch",
  "audit_evidence_risk_mismatch",
  "audit_evidence_scope_mismatch",
  "audit_evidence_source_snapshot_mismatch",
  "contradictory_findings_and_no_findings",
  "invalid_line_reference",
  "manifest_content_hash_mismatch",
  "manifest_identity_mismatch",
  "manifest_outcome_mismatch",
  "manifest_source_snapshot_mismatch",
  "missing_audit_evidence_ref",
  "missing_declared_scope_root",
  "missing_report_file_references",
  "missing_report_manifest",
  "missing_report_manifest_fields",
  "unsupported_report_manifest_version",
  "unverified_inspection_claim",
]);

function extractStrictAuditValidatorBlockerCode(text: string): string | null {
  const validatorMatch = text.match(/\(([^)]+)\)/);
  const deterministicRepairMatch = text.match(/\bdeterministic_repair_([a-z0-9_]+)/i);
  const candidates = [validatorMatch?.[1]?.trim(), deterministicRepairMatch?.[1]?.trim()].filter(
    (entry): entry is string => Boolean(entry),
  );
  return candidates.find((entry) => STRICT_AUDIT_VALIDATOR_BLOCKER_CODES.has(entry)) ?? null;
}

function preserveResolvedStrictAuditValidatorBlockers(input: {
  previousFindings: AutoReviewFinding[];
  parsed: ParsedStructuredReviewComments;
  deterministicFindings: AutoReviewFinding[];
}): AutoReviewFinding[] {
  const currentStrictCodes = new Set(
    input.deterministicFindings
      .map((finding) => extractStrictAuditValidatorBlockerCode(finding.text))
      .filter((entry): entry is string => Boolean(entry)),
  );
  if (currentStrictCodes.size === 0) return [];

  const previousById = new Map(input.previousFindings.map((finding) => [finding.id, finding]));
  return input.parsed.previousFindings
    .filter((finding) => finding.status === "resolved" || finding.status === "not_reproducible")
    .map((finding) => previousById.get(finding.id))
    .filter((finding): finding is AutoReviewFinding => Boolean(finding))
    .filter((finding) => {
      const code =
        extractStrictAuditValidatorBlockerCode(finding.text) ??
        extractStrictAuditValidatorBlockerCode(finding.id);
      return code != null && currentStrictCodes.has(code);
    });
}

function buildStructuredDecision(
  input: ReviewGateInput,
  parsed: ParsedStructuredReviewComments,
  deterministicFindings: AutoReviewFinding[],
): ReviewGateResult {
  const previousIds = new Set(input.previousFindings.map((finding) => finding.id));
  const preservedStrictAuditValidatorBlockers = preserveResolvedStrictAuditValidatorBlockers({
    previousFindings: input.previousFindings,
    parsed,
    deterministicFindings,
  });
  const stillBlockingPreviousFindings = parsed.previousFindings
    .filter(
      (finding) =>
        finding.status === "still_blocking" ||
        finding.status === "new_blocker" ||
        finding.status === "manual_review_required",
    )
    .map((finding) => {
      const blockingFinding: AutoReviewFinding = {
        id: finding.id,
        source: finding.source,
        status: finding.status,
        text: finding.note,
      };
      if (finding.closureEvidence) {
        blockingFinding.closureEvidence = finding.closureEvidence;
      }
      return blockingFinding;
    });
  const blockingFindings = mergeFindings(
    stillBlockingPreviousFindings,
    preservedStrictAuditValidatorBlockers,
    parsed.blockingFindings,
    deterministicFindings,
  );
  const stillBlockingIds = new Set(
    parsed.previousFindings
      .filter(
        (finding) =>
          finding.status === "still_blocking" ||
          finding.status === "new_blocker" ||
          finding.status === "manual_review_required",
      )
      .map((finding) => finding.id),
  );
  for (const finding of blockingFindings) {
    if (previousIds.has(finding.id)) stillBlockingIds.add(finding.id);
  }
  const newBlockingFindings = blockingFindings.filter((finding) => !previousIds.has(finding.id));
  const metrics = buildMetrics({
    strategy: input.strategy,
    iteration: input.iteration,
    previousBlockingCount: input.previousFindings.length,
    stillBlockingCount: stillBlockingIds.size,
    newBlockingCount: newBlockingFindings.length,
    totalBlockingCount: blockingFindings.length,
    parserMode: "structured",
  });

  if (
    !parsedStructuredMetadataMatchesInput(input, parsed) ||
    !parsedPreviousFindingsMatchInput(input, parsed) ||
    !resolvedPreviousFindingsHaveClosureEvidence(parsed)
  ) {
    return buildMissingPreviousFindingHandoff(input, metrics);
  }

  if (blockingFindings.length === 0) {
    if (requiresSubstantiveReviewEvidence(input)) {
      return buildSubstantiveEvidenceHandoff(input, metrics);
    }
    return {
      status: "success",
      metrics,
      blockingFindings: [],
      fixesMarkdown: "- none",
      autoReviewState: null,
    };
  }

  const enrichedBlockingFindings = enrichBlockingFindings({
    findings: blockingFindings,
    previousFindings: input.previousFindings,
    iteration: input.iteration,
  });
  const autoReviewState = toAutoReviewState({
    strategy: input.strategy,
    iteration: input.iteration,
    findings: enrichedBlockingFindings,
    securityCoverage: parsed.securityCoverage,
    blockerHistory: parsed.previousFindings,
  });

  const manualReviewDecision = maybeBuildManualReviewDecision({
    reviewInput: input,
    metrics,
    findings: enrichedBlockingFindings,
  });
  if (manualReviewDecision) {
    return manualReviewDecision;
  }

  const operatorInputDecision = maybeBuildOperatorInputDecision({
    reviewInput: input,
    metrics,
    findings: enrichedBlockingFindings,
  });
  if (operatorInputDecision) {
    return operatorInputDecision;
  }

  if (
    input.strategy === "closure_first" &&
    input.previousFindings.length > 0 &&
    stillBlockingIds.size === 0 &&
    newBlockingFindings.length > 0
  ) {
    return {
      status: "manual_review_required",
      handoffReason: "new_blockers_after_rework",
      metrics,
      blockingFindings: enrichedBlockingFindings,
      fixesMarkdown: formatFixesMarkdown(enrichedBlockingFindings),
      autoReviewState,
    };
  }

  return {
    status: "request_changes",
    metrics,
    blockingFindings: enrichedBlockingFindings,
    fixesMarkdown: formatFixesMarkdown(enrichedBlockingFindings),
    autoReviewState,
  };
}

function buildFallbackDecision(
  input: ReviewGateInput,
  fallbackFindings: AutoReviewFinding[],
  deterministicFindings: AutoReviewFinding[],
): ReviewGateResult {
  // Structured output is the only path that can prove a previous blocker was
  // actually resolved. Once we drop to legacy fallback after prior iterations,
  // preserve all previous blockers and escalate to manual review instead of
  // guessing that malformed output means the loop converged.
  const previousIds = new Set(input.previousFindings.map((finding) => finding.id));
  const fallbackAndDeterministicFindings = mergeFindings(fallbackFindings, deterministicFindings);
  const mergedFindings =
    input.previousFindings.length > 0
      ? mergeFindings(input.previousFindings, fallbackAndDeterministicFindings)
      : fallbackAndDeterministicFindings;
  const newBlockingFindings = fallbackAndDeterministicFindings.filter(
    (finding) => !previousIds.has(finding.id),
  );
  const metrics = buildMetrics({
    strategy: input.strategy,
    iteration: input.iteration,
    previousBlockingCount: input.previousFindings.length,
    stillBlockingCount: input.previousFindings.length > 0 ? input.previousFindings.length : 0,
    newBlockingCount: newBlockingFindings.length,
    totalBlockingCount: mergedFindings.length,
    parserMode: "fallback",
  });

  if (input.previousFindings.length > 0) {
    const enrichedFindings = enrichBlockingFindings({
      findings: mergedFindings,
      previousFindings: input.previousFindings,
      iteration: input.iteration,
    });
    return {
      status: "manual_review_required",
      handoffReason: "malformed_review_output_fallback",
      metrics,
      blockingFindings: enrichedFindings,
      fixesMarkdown: formatFixesMarkdown(enrichedFindings),
      autoReviewState: toAutoReviewState({
        strategy: input.strategy,
        iteration: input.iteration,
        findings: enrichedFindings,
      }),
    };
  }

  if (fallbackAndDeterministicFindings.length === 0) {
    if (requiresSubstantiveReviewEvidence(input)) {
      return buildSubstantiveEvidenceHandoff(input, metrics);
    }
    return {
      status: "success",
      metrics,
      blockingFindings: [],
      fixesMarkdown: "- none",
      autoReviewState: null,
    };
  }

  const enrichedFindings = enrichBlockingFindings({
    findings: fallbackAndDeterministicFindings,
    previousFindings: input.previousFindings,
    iteration: input.iteration,
  });
  const manualReviewDecision = maybeBuildManualReviewDecision({
    reviewInput: input,
    metrics,
    findings: enrichedFindings,
  });
  if (manualReviewDecision) {
    return manualReviewDecision;
  }

  const operatorInputDecision = maybeBuildOperatorInputDecision({
    reviewInput: input,
    metrics,
    findings: enrichedFindings,
  });
  if (operatorInputDecision) {
    return operatorInputDecision;
  }

  return {
    status: "request_changes",
    metrics,
    blockingFindings: enrichedFindings,
    fixesMarkdown: formatFixesMarkdown(enrichedFindings),
    autoReviewState: toAutoReviewState({
      strategy: input.strategy,
      iteration: input.iteration,
      findings: enrichedFindings,
    }),
  };
}

function buildLegacyBlockingSectionDecision(
  input: ReviewGateInput,
  blockingFindings: AutoReviewFinding[],
  deterministicFindings: AutoReviewFinding[],
): ReviewGateResult {
  const previousIds = new Set(input.previousFindings.map((finding) => finding.id));
  const mergedBlockingFindings = mergeFindings(blockingFindings, deterministicFindings);
  const stillBlockingFindings = mergedBlockingFindings.filter((finding) =>
    previousIds.has(finding.id),
  );
  const newBlockingFindings = mergedBlockingFindings.filter(
    (finding) => !previousIds.has(finding.id),
  );
  const metrics = buildMetrics({
    strategy: input.strategy,
    iteration: input.iteration,
    previousBlockingCount: input.previousFindings.length,
    stillBlockingCount: stillBlockingFindings.length,
    newBlockingCount: newBlockingFindings.length,
    totalBlockingCount: mergedBlockingFindings.length,
    parserMode: "fallback",
  });

  if (mergedBlockingFindings.length === 0) {
    if (input.previousFindings.length > 0) {
      return buildMissingPreviousFindingHandoff(input, metrics);
    }
    if (requiresSubstantiveReviewEvidence(input)) {
      return buildSubstantiveEvidenceHandoff(input, metrics);
    }
    return {
      status: "success",
      metrics,
      blockingFindings: [],
      fixesMarkdown: "- none",
      autoReviewState: null,
    };
  }

  const enrichedBlockingFindings = enrichBlockingFindings({
    findings: mergedBlockingFindings,
    previousFindings: input.previousFindings,
    iteration: input.iteration,
  });
  const autoReviewState = toAutoReviewState({
    strategy: input.strategy,
    iteration: input.iteration,
    findings: enrichedBlockingFindings,
  });

  const manualReviewDecision = maybeBuildManualReviewDecision({
    reviewInput: input,
    metrics,
    findings: enrichedBlockingFindings,
  });
  if (manualReviewDecision) {
    return manualReviewDecision;
  }

  const operatorInputDecision = maybeBuildOperatorInputDecision({
    reviewInput: input,
    metrics,
    findings: enrichedBlockingFindings,
  });
  if (operatorInputDecision) {
    return operatorInputDecision;
  }

  if (
    input.strategy === "closure_first" &&
    input.previousFindings.length > 0 &&
    stillBlockingFindings.length === 0 &&
    newBlockingFindings.length > 0
  ) {
    return {
      status: "manual_review_required",
      handoffReason: "new_blockers_after_rework",
      metrics,
      blockingFindings: enrichedBlockingFindings,
      fixesMarkdown: formatFixesMarkdown(enrichedBlockingFindings),
      autoReviewState,
    };
  }

  return {
    status: "request_changes",
    metrics,
    blockingFindings: enrichedBlockingFindings,
    fixesMarkdown: formatFixesMarkdown(enrichedBlockingFindings),
    autoReviewState,
  };
}

function requiresSubstantiveReviewEvidence(input: ReviewGateInput): boolean {
  if (!input.task || !isRiskyTask(input.task)) return false;
  if (
    hasSubstantiveReportEvidence({
      text: input.reviewComments ?? "",
      projectRoot: input.projectRoot,
    })
  ) {
    return false;
  }

  const artifact = findRoadmapBatchArtifactByTaskId(input.taskId);
  const evidenceRefs = artifact
    ? extractAuditReportManifestEvidenceRefs(
        readAuditArtifactText(input.projectRoot, artifact) ?? "",
      )
    : [];
  const auditEvidenceUnits = artifact
    ? listAuditEvidenceEvents({
        taskId: input.taskId,
        auditPlanId: resolveAuditPlanId({
          taskId: input.taskId,
          roadmapBatchId: artifact.batchId,
        }),
        evidenceIds: evidenceRefs.length > 0 ? evidenceRefs : undefined,
        limit: evidenceRefs.length > 0 ? Math.max(1, evidenceRefs.length) : undefined,
      })
    : [];
  const taskEvidence = evaluateTaskCompletionEvidence({
    task: { ...input.task, manualReviewRequired: false },
    projectRoot: input.projectRoot,
    auditEvidenceUnits,
    requireAuditLedgerEvidence: auditArtifactRequiresLedgerEvidence({
      artifact,
      projectRoot: input.projectRoot,
      auditEvidenceUnits,
    }),
  });
  if (
    artifact?.role === "synthesis" &&
    (taskEvidence.evidence.auditSynthesisOutcome?.kind === "source_inconclusive" ||
      taskEvidence.evidence.auditSynthesisOutcome?.kind === "inconclusive_batch_evidence")
  ) {
    return false;
  }
  return !(
    taskEvidence.evidence.reportArtifactFiles.length > 0 &&
    taskEvidence.evidence.uncommittedReportArtifactFiles.length === 0 &&
    taskEvidence.evidence.missingReportReferencedPaths.length === 0 &&
    taskEvidence.evidence.substantiveReportEvidence
  );
}

function buildSubstantiveEvidenceHandoff(
  input: ReviewGateInput,
  metrics: ReviewGateMetrics,
): ReviewGateResult {
  const finding: AutoReviewFinding = {
    id: createAutoReviewFindingId(
      "review_gate",
      "Risky audit/review/discovery acceptance requires substantive review evidence",
    ),
    source: "review_gate",
    text: "Risky audit/review/discovery acceptance requires substantive review evidence.",
  };
  const enrichedFindings = enrichBlockingFindings({
    findings: [finding],
    previousFindings: input.previousFindings,
    iteration: input.iteration,
  });

  return {
    status: "manual_review_required",
    handoffReason: "risky_review_without_substantive_evidence",
    metrics: {
      ...metrics,
      newBlockingCount: metrics.newBlockingCount + 1,
      totalBlockingCount: metrics.totalBlockingCount + 1,
    },
    blockingFindings: enrichedFindings,
    fixesMarkdown: formatFixesMarkdown(enrichedFindings),
    autoReviewState: toAutoReviewState({
      strategy: input.strategy,
      iteration: input.iteration,
      findings: enrichedFindings,
    }),
  };
}

const STRUCTURED_REVIEW_CONTRACT_FAILURE_TEXT =
  "Structured review contract not satisfied: review output must include complete unique Security Coverage rows for secret_leaks, permissions_sandbox, unsafe_shell_network_file, and dependency_config.";

function isStructuredReviewContractAttempt(reviewComments: string | null): boolean {
  if (!reviewComments) return false;
  return /^## Auto Review Metadata\b/m.test(reviewComments);
}

function isStructuredReviewContractFailure(reviewComments: string | null): boolean {
  if (!reviewComments) return false;
  const canonicalSummary = reviewComments.split(/\n## Raw Code Review\b/)[0] ?? reviewComments;
  if (!/^## Auto Review Metadata\b/m.test(canonicalSummary)) return false;
  return (
    /^- Contract Failure:\s+structured_review_sidecar\s*$/m.test(canonicalSummary) ||
    /^- \[structured-review-contract\]\s+review_gate\s+\|/m.test(canonicalSummary) ||
    canonicalSummary.includes(STRUCTURED_REVIEW_CONTRACT_FAILURE_TEXT)
  );
}

function buildMalformedStructuredReviewContractHandoff(
  input: ReviewGateInput,
  deterministicFindings: AutoReviewFinding[],
): ReviewGateResult {
  const contractFinding: AutoReviewFinding = {
    id: createAutoReviewFindingId("review_gate", STRUCTURED_REVIEW_CONTRACT_FAILURE_TEXT),
    source: "review_gate",
    text: STRUCTURED_REVIEW_CONTRACT_FAILURE_TEXT,
  };
  const mergedFindings =
    input.previousFindings.length > 0
      ? mergeFindings(input.previousFindings, [contractFinding], deterministicFindings)
      : mergeFindings([contractFinding], deterministicFindings);
  const previousIds = new Set(input.previousFindings.map((finding) => finding.id));
  const enrichedFindings = enrichBlockingFindings({
    findings: mergedFindings,
    previousFindings: input.previousFindings,
    iteration: input.iteration,
  });
  const newBlockingCount = enrichedFindings.filter(
    (finding) => !previousIds.has(finding.id),
  ).length;
  const metrics = buildMetrics({
    strategy: input.strategy,
    iteration: input.iteration,
    previousBlockingCount: input.previousFindings.length,
    stillBlockingCount: input.previousFindings.length,
    newBlockingCount,
    totalBlockingCount: enrichedFindings.length,
    parserMode: "structured",
  });

  return {
    status: "manual_review_required",
    handoffReason: "malformed_structured_review_contract",
    metrics,
    blockingFindings: enrichedFindings,
    fixesMarkdown: formatFixesMarkdown(enrichedFindings),
    autoReviewState: toAutoReviewState({
      strategy: input.strategy,
      iteration: input.iteration,
      findings: enrichedFindings,
    }),
  };
}

export async function evaluateReviewCommentsForAutoMode(
  input: ReviewGateInput,
): Promise<ReviewGateResult> {
  const deterministicFindings = collectDeterministicReviewGateFindings(input);
  if (isStructuredReviewContractFailure(input.reviewComments)) {
    return buildMalformedStructuredReviewContractHandoff(input, deterministicFindings);
  }
  const parsedStructuredComments = parseStructuredReviewComments(input.reviewComments);
  if (parsedStructuredComments) {
    return buildStructuredDecision(input, parsedStructuredComments, deterministicFindings);
  }
  if (isStructuredReviewContractAttempt(input.reviewComments)) {
    return buildMalformedStructuredReviewContractHandoff(input, deterministicFindings);
  }

  const legacyBlockingFindings = parseLegacyBlockingFindings(input);
  if (legacyBlockingFindings) {
    return buildLegacyBlockingSectionDecision(input, legacyBlockingFindings, deterministicFindings);
  }

  const fallbackFindings = await runLegacyFallbackExtraction(input);
  return buildFallbackDecision(input, fallbackFindings, deterministicFindings);
}
