import {
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  listRoadmapReportArtifactsForSynthesis,
  setTaskFields,
} from "@aif/data";
import { createRuntimeWorkflowSpec, type RuntimeWorkflowSpec } from "@aif/runtime";
import {
  getEnv,
  logger,
  redactProviderText,
  formatAttachmentsForPrompt,
  formatTaskIntentContractForPrompt,
  type AutoReviewState,
} from "@aif/shared";
import { assertCurrentBranch, restorePersistedBranch } from "../gitBranch.js";
import { logActivity } from "../hooks.js";
import { buildTaskMemoryContext } from "../memoryContext.js";
import { executeSubagentQuery, startHeartbeat } from "../subagentQuery.js";
import {
  buildStructuredReviewComments,
  formatPreviousFindingsForPrompt,
  parseStructuredSidecarOutput,
} from "../reviewContract.js";

const log = logger("reviewer");

const STRUCTURED_REVIEW_CONTRACT_FAILURE_TEXT =
  "Structured review contract not satisfied: review output must include complete unique Security Coverage rows for secret_leaks, permissions_sandbox, unsafe_shell_network_file, and dependency_config.";

const REVIEWER_PROMPT_SECTION_LIMITS = {
  findingText: 900,
  snapshotText: 8_000,
  snapshotEntry: 1_200,
  blockerCount: 20,
  changedFilesSummaryCount: 25,
};

function compactReviewerPromptText(label: string, value: string, maxChars: number): string {
  const redacted = redactProviderText(value)
    .replace(/\[REDACTED\]\]+/g, "[REDACTED]")
    .trim();
  if (redacted.length <= maxChars) return redacted;
  return `${redacted.slice(0, maxChars).trimEnd()} [... ${label} truncated ...]`;
}

function compactReviewerPromptBlock(label: string, value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()} [... ${label} truncated ...]`;
}

function formatReviewerAutoReviewStateForPrompt(state: AutoReviewState | null | undefined): string {
  if (!state) {
    return "No persisted auto-review rework context.";
  }

  const visibleFindings = state.findings.slice(0, REVIEWER_PROMPT_SECTION_LIMITS.blockerCount);
  const omittedCount = Math.max(0, state.findings.length - visibleFindings.length);
  const lines = [
    `strategy: ${state.strategy}`,
    `iteration: ${state.iteration}`,
    "blocking findings:",
    ...(visibleFindings.length > 0
      ? visibleFindings.map((finding) => {
          const text = compactReviewerPromptText(
            "BLOCKING_FINDING_TEXT",
            finding.text,
            REVIEWER_PROMPT_SECTION_LIMITS.findingText,
          );
          const status = finding.status ? ` | status: ${finding.status}` : "";
          return `- [${finding.id}] ${finding.source}${status} | ${text}`;
        })
      : ["- none"]),
  ];
  if (omittedCount > 0) {
    lines.push(`- [... ${omittedCount} additional blocking finding(s) omitted ...]`);
  }

  const snapshot = state.reworkSnapshot;
  if (!snapshot) {
    lines.push("rework snapshot: none");
    return compactReviewerPromptBlock(
      "AUTO_REVIEW_REWORK_CONTEXT",
      lines.join("\n"),
      REVIEWER_PROMPT_SECTION_LIMITS.snapshotText,
    );
  }

  lines.push("rework snapshot:");
  lines.push(`- iteration: ${snapshot.iteration}`);
  lines.push(
    `- artifactPath: ${compactReviewerPromptText(
      "ARTIFACT_PATH",
      snapshot.artifactPath,
      REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
    )}`,
  );
  lines.push(
    `- artifactContentSha: ${compactReviewerPromptText(
      "ARTIFACT_CONTENT_SHA",
      snapshot.artifactContentSha ?? "null",
      REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
    )}`,
  );
  if (snapshot.baselineHeadSha) {
    lines.push(
      `- baselineHeadSha: ${compactReviewerPromptText(
        "BASELINE_HEAD_SHA",
        snapshot.baselineHeadSha,
        REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
      )}`,
    );
  }
  if (snapshot.changedFilesDigest) {
    lines.push(
      `- changedFilesDigest: ${compactReviewerPromptText(
        "CHANGED_FILES_DIGEST",
        snapshot.changedFilesDigest,
        REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
      )}`,
    );
  }
  if (snapshot.findingIds.length > 0) {
    const findingIds = snapshot.findingIds.map((findingId) =>
      compactReviewerPromptText(
        "FINDING_ID",
        findingId,
        REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
      ),
    );
    lines.push(`- exact blocker ids: ${findingIds.join(", ")}`);
  }
  if (snapshot.requiredEvidenceByFindingId) {
    lines.push("- required evidence by blocker id:");
    for (const [findingId, evidence] of Object.entries(snapshot.requiredEvidenceByFindingId)) {
      lines.push(
        `  - [${findingId}] ${compactReviewerPromptText(
          "REQUIRED_EVIDENCE",
          evidence,
          REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
        )}`,
      );
    }
  }
  if (snapshot.forbiddenChanges && snapshot.forbiddenChanges.length > 0) {
    lines.push("- forbidden unrelated changes:");
    for (const change of snapshot.forbiddenChanges) {
      lines.push(
        `  - ${compactReviewerPromptText(
          "FORBIDDEN_CHANGE",
          change,
          REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
        )}`,
      );
    }
  }
  if (snapshot.changedFilesSummary && snapshot.changedFilesSummary.length > 0) {
    lines.push("- prior attempt changed files summary:");
    for (const entry of snapshot.changedFilesSummary.slice(
      0,
      REVIEWER_PROMPT_SECTION_LIMITS.changedFilesSummaryCount,
    )) {
      lines.push(
        `  - ${compactReviewerPromptText(
          "CHANGED_FILE_SUMMARY",
          entry,
          REVIEWER_PROMPT_SECTION_LIMITS.snapshotEntry,
        )}`,
      );
    }
  }

  return compactReviewerPromptBlock(
    "AUTO_REVIEW_REWORK_CONTEXT",
    lines.join("\n"),
    REVIEWER_PROMPT_SECTION_LIMITS.snapshotText,
  );
}

function buildStructuredReviewContractFailureComments(input: {
  strategy: "full_re_review" | "closure_first";
  iteration: number;
  parsedReview: boolean;
  parsedSecurity: boolean;
  rawCodeReview: string;
  rawSecurityAudit: string;
}): string {
  const failedSidecars = [
    !input.parsedReview ? "code_review" : null,
    !input.parsedSecurity ? "security_audit" : null,
  ].filter((entry): entry is string => Boolean(entry));
  const note = `${STRUCTURED_REVIEW_CONTRACT_FAILURE_TEXT} Failed sidecar(s): ${failedSidecars.join(", ")}.`;

  return [
    "## Auto Review Metadata",
    `- Strategy: ${input.strategy}`,
    `- Review Iteration: ${input.iteration}`,
    "- Contract Failure: structured_review_sidecar",
    "",
    "## Previous Findings",
    "- none",
    "",
    "## Blocking Findings",
    `- [structured-review-contract] review_gate | ${note}`,
    "",
    "## Advisories",
    "- review_gate | Raw sidecar output is retained below with provider-text redaction applied.",
    "",
    "## Security Coverage",
    "- secret_leaks | not_checked | Structured review contract failed before secret-leak coverage could be trusted.",
    "- permissions_sandbox | not_checked | Structured review contract failed before permission and sandbox coverage could be trusted.",
    "- unsafe_shell_network_file | not_checked | Structured review contract failed before shell, network, and file-operation coverage could be trusted.",
    "- dependency_config | not_checked | Structured review contract failed before dependency and configuration coverage could be trusted.",
    "",
    "## Raw Code Review",
    redactProviderText(input.rawCodeReview.trim()) || "No code review output.",
    "",
    "## Raw Security Audit",
    redactProviderText(input.rawSecurityAudit.trim()) || "No security audit output.",
  ].join("\n");
}

async function runSidecar(
  prompt: string,
  taskId: string,
  projectRoot: string,
  agentName: string,
  maxBudgetUsd: number | null,
  useSubagentAgent: boolean,
  workflowSpec: RuntimeWorkflowSpec,
  fallbackSlashCommand?: string,
): Promise<string> {
  const { resultText } = await executeSubagentQuery({
    taskId,
    projectRoot,
    agentName,
    prompt,
    profileMode: workflowSpec.workflowKind === "review-security" ? "security" : "reviewer",
    maxBudgetUsd,
    agent: useSubagentAgent ? agentName : undefined,
    workflowSpec,
    workflowKind: workflowSpec.workflowKind,
    fallbackSlashCommand,
  });
  return resultText;
}

export async function runReviewer(taskId: string, projectRoot: string): Promise<void> {
  const env = getEnv();
  const task = findTaskById(taskId);

  if (!task) {
    log.error({ taskId }, "Task not found for review");
    throw new Error(`Task ${taskId} not found`);
  }

  // Reviewer must diff against the task's feature branch — not whatever HEAD
  // happens to be. Same mandatory-restore contract as implementer/plan-checker.
  if (task.branchName && !task.isFix) {
    restorePersistedBranch({
      projectRoot,
      taskId,
      persistedBranchName: task.branchName,
    });
    logActivity(taskId, "Agent", `Restored feature branch: ${task.branchName}`);
  }

  const project = findProjectById(task.projectId);
  const sidecarBudget = project?.reviewSidecarMaxBudgetUsd ?? null;
  const useSubagents = task.useSubagents;
  const strategy = env.AGENT_AUTO_REVIEW_STRATEGY;
  const reviewIteration = (task.reviewIterationCount ?? 0) + 1;
  const previousFindings = task.autoReviewState?.findings ?? [];
  const reviewPreviousFindingState = previousFindings.filter((finding) =>
    ["code_review", "review_gate"].includes(finding.source),
  );
  const securityPreviousFindingState = previousFindings.filter(
    (finding) => finding.source === "security_audit",
  );
  const reviewPreviousFindings = formatPreviousFindingsForPrompt(reviewPreviousFindingState);
  const securityPreviousFindings = formatPreviousFindingsForPrompt(securityPreviousFindingState);
  const autoReviewReworkContext = formatReviewerAutoReviewStateForPrompt(task.autoReviewState);
  const roadmapArtifact = findRoadmapBatchArtifactByTaskId(taskId);
  const auditSynthesisContext =
    roadmapArtifact?.role === "synthesis"
      ? [
          "Audit synthesis batch context:",
          `- Synthesis artifact: ${roadmapArtifact.artifactPath}`,
          "- Validated source report artifacts may live on producer branches or worktrees and may not exist as files in this synthesis checkout.",
          "- Do not report validated source report artifacts as missing solely because list_files does not show them in the current branch.",
          "- Review the synthesis artifact content and implementation log instead; the implementation log is allowed to prove producer-branch artifact ingestion.",
          "Terminal source report artifacts:",
          ...listRoadmapReportArtifactsForSynthesis(roadmapArtifact.batchId).map(
            (artifact) =>
              `- ${artifact.artifactPath} (task ${artifact.taskId}, state ${artifact.state})`,
          ),
        ].join("\n")
      : "Audit synthesis batch context: not a roadmap-batch synthesis task.";

  log.info(
    { taskId, title: task.title, useSubagents, strategy, reviewIteration },
    "Starting review stage",
  );

  const scopeConstraint = `IMPORTANT: Your working directory is ${projectRoot}
All file reads, searches, and analysis must stay within this directory. Do NOT navigate to parent directories or other projects.`;
  const reviewMemoryContext = buildTaskMemoryContext({
    task,
    workflowKind: "reviewer",
    source: "agent:reviewer",
    queryParts: [auditSynthesisContext, reviewPreviousFindings, autoReviewReworkContext],
  });
  const securityMemoryContext = buildTaskMemoryContext({
    task,
    workflowKind: "security_review",
    source: "agent:security-review",
    queryParts: [auditSynthesisContext, securityPreviousFindings, autoReviewReworkContext],
  });
  const reviewMemoryBlock = reviewMemoryContext ? `\n\n${reviewMemoryContext}\n` : "";
  const securityMemoryBlock = securityMemoryContext ? `\n\n${securityMemoryContext}\n` : "";
  const taskIntentContract = formatTaskIntentContractForPrompt(task.taskIntent ?? "general");

  const reviewOutputContract = `Output contract:
Return markdown only with these exact sections, in this exact order:

## Blocking Findings
- <blocking finding>
or
- none

## Advisories
- <non-blocking advisory>
or
- none

## Previous Findings
- [<id>] resolved | <current-attempt closure evidence>
- [<id>] still_blocking | <short reason and required evidence>
- [<id>] new_blocker | <new blocker claim and required fix>
- [<id>] not_reproducible | <inspection evidence that disproves or cannot reproduce the original blocker>
- [<id>] manual_review_required | <why automatic closure is unsafe>
or
- none

## Security Coverage
- secret_leaks | <covered|issue_found|not_applicable|not_checked> | <redacted evidence summary>
- permissions_sandbox | <covered|issue_found|not_applicable|not_checked> | <redacted evidence summary>
- unsafe_shell_network_file | <covered|issue_found|not_applicable|not_checked> | <redacted evidence summary>
- dependency_config | <covered|issue_found|not_applicable|not_checked> | <redacted evidence summary>

Rules:
- Blocking Findings must list only issues that should block automatic completion for this review source.
- Advisories are non-blocking suggestions or follow-ups.
- Review is read-only: do not create, edit, delete, move, or commit repository files.
- Never include raw secret values, bearer tokens, API keys, client secrets, access tokens, cookies, or private URLs. Redact the value and name only the file/path/key pattern inspected.
- For audit, review, discovery, validation, verification, findings, or report tasks, call at least one repository inspection tool before answering, then include at least one Advisory with concrete evidence you inspected: exact existing file path with line/function/symbol reference, or a command and output/status that supports your review conclusion.
- For audit/report artifacts, block placeholder or unverified evidence: synthetic commit hashes such as 123abc, placeholder authors, fake command output, "too large to read", "would show", "likely", "may contain", or claims that an existing file/directory is missing.
- For audit/report artifacts whose task description requires Proposed fix, block any finding that has Evidence/Risk/Verification but no Proposed fix.
- For audit/report artifacts, block non-actionable findings: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims without a concrete technical failure mode.
- Reuse only IDs provided in the Previous Findings input below. New Blocking Findings should be written without invented IDs; the coordinator assigns stable IDs.
- For every ID in Previous Findings input, compare the current implementation log, changed files, and relevant artifact content against the original finding. Mark resolved only when concrete closure evidence is present.
- If a previous finding lacks closure evidence, repeats the same validator failure, or the required self-check was not performed, mark that same ID still_blocking and state the evidence gap.
- Mark not_reproducible only when you inspected the current attempt and can cite concrete evidence showing the original blocker is absent or no longer applicable.
- Mark manual_review_required when evidence is ambiguous, potentially secret-bearing, externally dependent, permission-sensitive, or unsafe to auto-close.
- For audit/report artifact rework, do not mark prior review_gate findings resolved unless the artifact proves valid manifest requirements, bound evidenceRefs, declared scope coverage, and substantive evidence.
- Security Coverage is required. For non-security code review, use not_applicable rows. For security audit, each row must describe the check performed or the blocker found.
- Security blocking findings must include Severity:, Claim:, Required fix:, and Verification: in the finding text, with redacted evidence only.
- Do not add any headings before, between, or after these sections.
- Do not use code fences.`;

  const reviewPromptBase = `Review the implementation for this task:

${scopeConstraint}
${reviewMemoryBlock}

Title: ${task.title}
Description: ${task.description}
Task intent contract:
${taskIntentContract}

Task attachments:
${formatAttachmentsForPrompt(task.attachments)}

Implementation Log:
${task.implementationLog ?? "No implementation log available."}

${auditSynthesisContext}

Auto-review strategy: ${strategy}
Review iteration: ${reviewIteration}

Previous Findings Input:
${reviewPreviousFindings}

Auto-review rework context:
${autoReviewReworkContext}

Review changed code for correctness, regression risks, performance, and maintainability.

${reviewOutputContract}`;

  const securityPromptBase = `Audit the implementation for security risks:

${scopeConstraint}
${securityMemoryBlock}

Title: ${task.title}
Description: ${task.description}
Task intent contract:
${taskIntentContract}

Task attachments:
${formatAttachmentsForPrompt(task.attachments)}

Auto-review strategy: ${strategy}
Review iteration: ${reviewIteration}

${auditSynthesisContext}

Previous Findings Input:
${securityPreviousFindings}

Auto-review rework context:
${autoReviewReworkContext}

Focus on auth, validation, secret leak checks, permission/sandbox boundaries, injection, unsafe shell/file/network behavior, and dependency/config risks in changed code.

${reviewOutputContract}`;
  const reviewPrompt = useSubagents ? reviewPromptBase : `/aif-review ${reviewPromptBase}`;
  const securityPrompt = useSubagents
    ? securityPromptBase
    : `/aif-security-checklist ${securityPromptBase}`;
  const reviewAgentName = useSubagents ? "review-sidecar" : "aif-review";
  const securityAgentName = useSubagents ? "security-sidecar" : "aif-security-checklist";
  const reviewWorkflow = createRuntimeWorkflowSpec({
    workflowKind: "reviewer",
    prompt: reviewPrompt,
    requiredCapabilities: useSubagents
      ? ["supportsAgentDefinitions", "supportsRepositoryTools"]
      : ["supportsRepositoryTools"],
    agentDefinitionName: useSubagents ? reviewAgentName : undefined,
    fallbackSlashCommand: "/aif-review",
    fallbackStrategy: useSubagents ? "slash_command" : "none",
    sessionReusePolicy: "new_session",
    systemPromptAppend: scopeConstraint,
  });
  const securityWorkflow = createRuntimeWorkflowSpec({
    workflowKind: "review-security",
    prompt: securityPrompt,
    requiredCapabilities: useSubagents
      ? ["supportsAgentDefinitions", "supportsRepositoryTools"]
      : ["supportsRepositoryTools"],
    agentDefinitionName: useSubagents ? securityAgentName : undefined,
    fallbackSlashCommand: "/aif-security-checklist",
    fallbackStrategy: useSubagents ? "slash_command" : "none",
    sessionReusePolicy: "new_session",
    systemPromptAppend: scopeConstraint,
  });

  try {
    const heartbeatTimer = startHeartbeat(taskId);

    let reviewResult = "";
    let securityResult = "";
    try {
      if (useSubagents) {
        [reviewResult, securityResult] = await Promise.all([
          runSidecar(
            reviewPrompt,
            taskId,
            projectRoot,
            reviewAgentName,
            sidecarBudget,
            true,
            reviewWorkflow,
            "/aif-review",
          ),
          runSidecar(
            securityPrompt,
            taskId,
            projectRoot,
            securityAgentName,
            sidecarBudget,
            true,
            securityWorkflow,
            "/aif-security-checklist",
          ),
        ]);
      } else {
        reviewResult = await runSidecar(
          reviewPrompt,
          taskId,
          projectRoot,
          reviewAgentName,
          sidecarBudget,
          false,
          reviewWorkflow,
          "/aif-review",
        );
        securityResult = await runSidecar(
          securityPrompt,
          taskId,
          projectRoot,
          securityAgentName,
          sidecarBudget,
          false,
          securityWorkflow,
          "/aif-security-checklist",
        );
      }
    } finally {
      try {
        clearInterval(heartbeatTimer);
      } catch {
        /* safety guard */
      }
    }

    // Post-run drift check: review sidecars must not have switched HEAD.
    if (task.branchName && !task.isFix) {
      assertCurrentBranch(projectRoot, task.branchName);
    }

    log.info({ taskId }, "Review and security sidecars completed");

    const parsedReview = parseStructuredSidecarOutput(
      reviewResult,
      "code_review",
      reviewPreviousFindingState,
    );
    const parsedSecurity = parseStructuredSidecarOutput(
      securityResult,
      "security_audit",
      securityPreviousFindingState,
    );

    const combinedReview =
      parsedReview && parsedSecurity
        ? buildStructuredReviewComments({
            strategy,
            iteration: reviewIteration,
            codeReview: parsedReview,
            securityAudit: parsedSecurity,
            rawCodeReview: reviewResult,
            rawSecurityAudit: securityResult,
          })
        : buildStructuredReviewContractFailureComments({
            strategy,
            iteration: reviewIteration,
            parsedReview: Boolean(parsedReview),
            parsedSecurity: Boolean(parsedSecurity),
            rawCodeReview: reviewResult,
            rawSecurityAudit: securityResult,
          });

    if (!parsedReview || !parsedSecurity) {
      log.warn(
        {
          taskId,
          parsedReview: Boolean(parsedReview),
          parsedSecurity: Boolean(parsedSecurity),
        },
        "Structured review contract not satisfied, saving fail-closed review contract blocker",
      );
    }

    setTaskFields(taskId, {
      reviewComments: combinedReview,
      updatedAt: new Date().toISOString(),
    });

    logActivity(
      taskId,
      "Agent",
      useSubagents
        ? "review stage complete (review-sidecar + security-sidecar)"
        : "review stage complete (aif-review + aif-security-checklist)",
    );
    log.debug({ taskId }, "Review comments saved to task");
  } catch (err) {
    logActivity(taskId, "Agent", `review stage failed — ${(err as Error).message}`);
    throw err;
  }
}
