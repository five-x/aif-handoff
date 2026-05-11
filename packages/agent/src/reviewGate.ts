import { createRuntimeWorkflowSpec } from "@aif/runtime";
import {
  evaluateTaskCompletionEvidence,
  hasSubstantiveReportEvidence,
  isRiskyTask,
  type AutoReviewFinding,
  type AutoReviewStrategy,
  type TaskCompletionEvidenceTask,
} from "@aif/shared";
import {
  createAutoReviewFindingId,
  parseStructuredReviewComments,
  toAutoReviewState,
  type ParsedStructuredReviewComments,
} from "./reviewContract.js";
import { executeSubagentQuery } from "./subagentQuery.js";

export type ReviewGateParserMode = "structured" | "fallback";

export type ReviewGateManualHandoffReason =
  | "new_blockers_after_rework"
  | "malformed_review_output_fallback"
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

function mergeFindings(...groups: AutoReviewFinding[][]): AutoReviewFinding[] {
  const map = new Map<string, AutoReviewFinding>();
  for (const group of groups) {
    for (const finding of group) {
      map.set(finding.id, finding);
    }
  }
  return [...map.values()];
}

function reviewGateFinding(text: string): AutoReviewFinding {
  return {
    id: createAutoReviewFindingId("review_gate", text),
    source: "review_gate",
    text,
  };
}

function collectDeterministicReviewGateFindings(input: ReviewGateInput): AutoReviewFinding[] {
  if (!input.task || !isRiskyTask(input.task)) return [];

  const taskEvidence = evaluateTaskCompletionEvidence({
    task: { ...input.task, manualReviewRequired: false },
    projectRoot: input.projectRoot,
  });
  if (taskEvidence.ok) return [];

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

function buildStructuredDecision(
  input: ReviewGateInput,
  parsed: ParsedStructuredReviewComments,
  deterministicFindings: AutoReviewFinding[],
): ReviewGateResult {
  const previousIds = new Set(input.previousFindings.map((finding) => finding.id));
  const blockingFindings = mergeFindings(parsed.blockingFindings, deterministicFindings);
  const stillBlockingIds = new Set(
    parsed.previousFindings
      .filter((finding) => finding.status === "still_blocking")
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

  const autoReviewState = toAutoReviewState({
    strategy: input.strategy,
    iteration: input.iteration,
    findings: blockingFindings,
  });

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
      blockingFindings,
      fixesMarkdown: formatFixesMarkdown(blockingFindings),
      autoReviewState,
    };
  }

  return {
    status: "request_changes",
    metrics,
    blockingFindings,
    fixesMarkdown: formatFixesMarkdown(blockingFindings),
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
    return {
      status: "manual_review_required",
      handoffReason: "malformed_review_output_fallback",
      metrics,
      blockingFindings: mergedFindings,
      fixesMarkdown: formatFixesMarkdown(mergedFindings),
      autoReviewState: toAutoReviewState({
        strategy: input.strategy,
        iteration: input.iteration,
        findings: mergedFindings,
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

  return {
    status: "request_changes",
    metrics,
    blockingFindings: fallbackAndDeterministicFindings,
    fixesMarkdown: formatFixesMarkdown(fallbackAndDeterministicFindings),
    autoReviewState: toAutoReviewState({
      strategy: input.strategy,
      iteration: input.iteration,
      findings: fallbackAndDeterministicFindings,
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

  const autoReviewState = toAutoReviewState({
    strategy: input.strategy,
    iteration: input.iteration,
    findings: mergedBlockingFindings,
  });

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
      blockingFindings: mergedBlockingFindings,
      fixesMarkdown: formatFixesMarkdown(mergedBlockingFindings),
      autoReviewState,
    };
  }

  return {
    status: "request_changes",
    metrics,
    blockingFindings: mergedBlockingFindings,
    fixesMarkdown: formatFixesMarkdown(mergedBlockingFindings),
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

  const taskEvidence = evaluateTaskCompletionEvidence({
    task: { ...input.task, manualReviewRequired: false },
    projectRoot: input.projectRoot,
  });
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

  return {
    status: "manual_review_required",
    handoffReason: "risky_review_without_substantive_evidence",
    metrics: {
      ...metrics,
      newBlockingCount: metrics.newBlockingCount + 1,
      totalBlockingCount: metrics.totalBlockingCount + 1,
    },
    blockingFindings: [finding],
    fixesMarkdown: formatFixesMarkdown([finding]),
    autoReviewState: toAutoReviewState({
      strategy: input.strategy,
      iteration: input.iteration,
      findings: [finding],
    }),
  };
}

export async function evaluateReviewCommentsForAutoMode(
  input: ReviewGateInput,
): Promise<ReviewGateResult> {
  const deterministicFindings = collectDeterministicReviewGateFindings(input);
  const parsedStructuredComments = parseStructuredReviewComments(input.reviewComments);
  if (parsedStructuredComments) {
    return buildStructuredDecision(input, parsedStructuredComments, deterministicFindings);
  }

  const legacyBlockingFindings = parseLegacyBlockingFindings(input);
  if (legacyBlockingFindings) {
    return buildLegacyBlockingSectionDecision(input, legacyBlockingFindings, deterministicFindings);
  }

  const fallbackFindings = await runLegacyFallbackExtraction(input);
  return buildFallbackDecision(input, fallbackFindings, deterministicFindings);
}
