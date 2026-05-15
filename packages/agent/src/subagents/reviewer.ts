import {
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  listRoadmapReportArtifactsForSynthesis,
  setTaskFields,
} from "@aif/data";
import { createRuntimeWorkflowSpec, type RuntimeWorkflowSpec } from "@aif/runtime";
import { getEnv, logger, formatAttachmentsForPrompt } from "@aif/shared";
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
    profileMode: "review",
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
    queryParts: [auditSynthesisContext, reviewPreviousFindings],
  });
  const securityMemoryContext = buildTaskMemoryContext({
    task,
    workflowKind: "security_review",
    source: "agent:security-review",
    queryParts: [auditSynthesisContext, securityPreviousFindings],
  });
  const reviewMemoryBlock = reviewMemoryContext ? `\n\n${reviewMemoryContext}\n` : "";
  const securityMemoryBlock = securityMemoryContext ? `\n\n${securityMemoryContext}\n` : "";

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
- [<id>] resolved | <short closure note>
- [<id>] still_blocking | <short reason>
or
- none

Rules:
- Blocking Findings must list only issues that should block automatic completion for this review source.
- Advisories are non-blocking suggestions or follow-ups.
- Review is read-only: do not create, edit, delete, move, or commit repository files.
- For audit, review, discovery, validation, verification, findings, or report tasks, call at least one repository inspection tool before answering, then include at least one Advisory with concrete evidence you inspected: exact existing file path with line/function/symbol reference, or a command and output/status that supports your review conclusion.
- For audit/report artifacts, block placeholder or unverified evidence: synthetic commit hashes such as 123abc, placeholder authors, fake command output, "too large to read", "would show", "likely", "may contain", or claims that an existing file/directory is missing.
- For audit/report artifacts whose task description requires Proposed fix, block any finding that has Evidence/Risk/Verification but no Proposed fix.
- For audit/report artifacts, block non-actionable findings: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims without a concrete technical failure mode.
- Reuse only IDs provided in the Previous Findings input below.
- For every ID in Previous Findings input, compare the current implementation log, changed files, and relevant artifact content against the original finding. Mark resolved only when concrete closure evidence is present.
- If a previous finding lacks closure evidence, repeats the same validator failure, or the required self-check was not performed, mark that same ID still_blocking and state the evidence gap.
- For audit/report artifact rework, do not mark prior review_gate findings resolved unless the artifact proves valid manifest requirements, bound evidenceRefs, declared scope coverage, and substantive evidence.
- Do not add any headings before, between, or after these sections.
- Do not use code fences.`;

  const reviewPromptBase = `Review the implementation for this task:

${scopeConstraint}
${reviewMemoryBlock}

Title: ${task.title}
Description: ${task.description}
Task attachments:
${formatAttachmentsForPrompt(task.attachments)}

Implementation Log:
${task.implementationLog ?? "No implementation log available."}

${auditSynthesisContext}

Auto-review strategy: ${strategy}
Review iteration: ${reviewIteration}

Previous Findings Input:
${reviewPreviousFindings}

Review changed code for correctness, regression risks, performance, and maintainability.

${reviewOutputContract}`;

  const securityPromptBase = `Audit the implementation for security risks:

${scopeConstraint}
${securityMemoryBlock}

Title: ${task.title}
Description: ${task.description}
Task attachments:
${formatAttachmentsForPrompt(task.attachments)}

Auto-review strategy: ${strategy}
Review iteration: ${reviewIteration}

${auditSynthesisContext}

Previous Findings Input:
${securityPreviousFindings}

Focus on auth, validation, secrets, injection, and unsafe shell/file handling in changed code.

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
        : `## Code Review\n\n${reviewResult}\n\n## Security Audit\n\n${securityResult}`;

    if (!parsedReview || !parsedSecurity) {
      log.warn(
        {
          taskId,
          parsedReview: Boolean(parsedReview),
          parsedSecurity: Boolean(parsedSecurity),
        },
        "Structured review contract not satisfied, falling back to legacy review comment format",
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
