import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  getLatestReworkComment,
  listValidatedRoadmapReportArtifacts,
  persistTaskPlanForTask,
  setTaskFields,
  summarizeRoadmapBatch,
  type TaskRow,
} from "@aif/data";
import {
  logger,
  formatAttachmentsForPrompt,
  formatTaskIntentContractForPrompt,
  looksLikeFullPlanUpdate,
  getProjectConfig,
} from "@aif/shared";
import { createRuntimeWorkflowSpec } from "@aif/runtime";
import { logActivity } from "../hooks.js";
import { executeSubagentQuery } from "../subagentQuery.js";
import { computePendingPlanLayers, computePlanLayers } from "../planLayers.js";
import { assertCurrentBranch, restorePersistedBranch } from "../gitBranch.js";

const log = logger("implementer");
const AGENT_NAME = "implement-coordinator";

function formatReworkCommentForPrompt(
  comment: {
    author: string;
    createdAt: string;
    message: string;
    attachments: string | null;
  } | null,
): string {
  if (!comment) return "No rework comments found for rework request.";
  return [
    `[${comment.createdAt}] ${comment.author}`,
    `message: ${comment.message}`,
    "attachments:",
    formatAttachmentsForPrompt(comment.attachments),
  ].join("\n");
}

function formatAutoReviewStateForPrompt(
  state:
    | {
        strategy: string;
        iteration: number;
        findings: Array<{ id: string; text: string; source: string }>;
      }
    | null
    | undefined,
): string {
  if (!state || state.findings.length === 0) {
    return "No persisted blocking findings snapshot.";
  }

  return [
    `strategy: ${state.strategy}`,
    `iteration: ${state.iteration}`,
    "findings:",
    ...state.findings.map((finding) => `- [${finding.id}] ${finding.source} | ${finding.text}`),
  ].join("\n");
}

function isBlockedImplementationResult(resultText: string): boolean {
  const normalized = resultText.toLowerCase();
  return (
    normalized.includes("status: blocked") ||
    normalized.includes("permission system") ||
    normalized.includes("permission denied") ||
    normalized.includes("write permission") ||
    normalized.includes("cannot proceed") ||
    normalized.includes("blocked —")
  );
}

function readCanonicalPlan(
  task: { isFix: boolean; planPath: string },
  projectRoot: string,
): string | null {
  const cfg = getProjectConfig(projectRoot);
  const preferredPath = resolve(
    projectRoot,
    task.isFix ? cfg.paths.fix_plan : task.planPath || cfg.paths.plan,
  );
  if (existsSync(preferredPath)) {
    const content = readFileSync(preferredPath, "utf8").trim();
    if (content.length > 0) return content;
  }

  const fallbackPath = resolve(projectRoot, task.isFix ? cfg.paths.plan : cfg.paths.fix_plan);
  if (existsSync(fallbackPath)) {
    const content = readFileSync(fallbackPath, "utf8").trim();
    if (content.length > 0) return content;
  }

  return null;
}

function getChecklistProgress(planText: string | null): {
  parsedTaskCount: number;
  pendingTaskCount: number;
} {
  if (!planText) return { parsedTaskCount: 0, pendingTaskCount: 0 };
  const parsed = computePlanLayers(planText);
  const pending = computePendingPlanLayers(planText);
  return {
    parsedTaskCount: parsed.tasks.length,
    pendingTaskCount: pending.tasks.length,
  };
}

function normalizeArtifactGitPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function readValidatedArtifactContent(input: {
  artifactPath: string;
  projectRoot: string;
  branchName: string | null;
  worktreePath: string | null;
}): { content: string; source: string } {
  const gitPath = normalizeArtifactGitPath(input.artifactPath);
  if (
    isAbsolute(input.artifactPath) ||
    gitPath === ".." ||
    gitPath.startsWith("../") ||
    gitPath.includes("/../")
  ) {
    throw new Error(`synthesis_not_ready: invalid validated artifact path: ${input.artifactPath}`);
  }

  if (input.worktreePath) {
    const artifactPath = resolve(input.worktreePath, input.artifactPath);
    if (!existsSync(artifactPath)) {
      throw new Error(
        `synthesis_not_ready: validated artifact is unavailable: ${input.artifactPath}`,
      );
    }
    return {
      content: readFileSync(artifactPath, "utf8").trim(),
      source: input.worktreePath,
    };
  }

  if (input.branchName) {
    try {
      return {
        content: execFileSync(
          "git",
          ["-c", `safe.directory=${input.projectRoot}`, "show", `${input.branchName}:${gitPath}`],
          {
            cwd: input.projectRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          },
        ).trim(),
        source: `${input.branchName}:${gitPath}`,
      };
    } catch {
      throw new Error(
        `synthesis_not_ready: validated artifact is unavailable on branch ${input.branchName}: ${input.artifactPath}`,
      );
    }
  }

  const artifactPath = resolve(input.projectRoot, input.artifactPath);
  if (!existsSync(artifactPath)) {
    throw new Error(
      `synthesis_not_ready: validated artifact is unavailable: ${input.artifactPath}`,
    );
  }
  return {
    content: readFileSync(artifactPath, "utf8").trim(),
    source: input.projectRoot,
  };
}

function buildValidatedAuditSynthesisInput(taskId: string, fallbackRoot: string): string {
  const synthesisArtifact = findRoadmapBatchArtifactByTaskId(taskId);
  if (!synthesisArtifact || synthesisArtifact.role !== "synthesis") {
    return "No validated audit batch input required for this task.";
  }

  const summary = summarizeRoadmapBatch(synthesisArtifact.batchId);
  if (!summary?.synthesisReady) {
    const valid = summary?.counts.valid ?? 0;
    const total = summary?.counts.total ?? 0;
    throw new Error(
      `synthesis_not_ready: waiting for validated audit batch artifacts (${valid}/${total} valid)`,
    );
  }

  const reports = listValidatedRoadmapReportArtifacts(synthesisArtifact.batchId);
  if (reports.length === 0) {
    throw new Error("synthesis_not_ready: no validated audit report artifacts are available");
  }

  const sections = reports.map((artifact) => {
    const root = artifact.projectRoot ?? fallbackRoot;
    const { content, source } = readValidatedArtifactContent({
      artifactPath: artifact.artifactPath,
      branchName: artifact.branchName,
      worktreePath: artifact.worktreePath,
      projectRoot: root,
    });
    if (!content) {
      throw new Error(`synthesis_not_ready: validated artifact is empty: ${artifact.artifactPath}`);
    }
    return [
      `--- artifact: ${artifact.artifactPath}`,
      `task: ${artifact.taskId}`,
      `source: ${source}`,
      "---",
      content,
    ].join("\n");
  });

  return sections.join("\n\n");
}

async function runChecklistSyncQuery(input: {
  task: TaskRow;
  projectRoot: string;
  planText: string;
  implementationResult: string;
}): Promise<string> {
  const prompt = `You are finalizing task checklist state in a markdown implementation plan.

TASK TITLE:
${input.task.title}

TASK DESCRIPTION:
${input.task.description}

IMPLEMENTATION RESULT LOG (source of truth for what was done):
${input.implementationResult}

CURRENT PLAN MARKDOWN:
<<<CURRENT_PLAN
${input.planText}
CURRENT_PLAN

Requirements:
1) Return the FULL updated plan markdown.
2) Update only checkbox states ("- [ ]" / "- [x]") to reflect implemented work from the log.
3) Do not rewrite structure, titles, ordering, prose, or dependencies.
4) Preserve all unchecked tasks that are not completed yet.
5) Output markdown only.
6) Do not use tools or subagents.`;

  const workflowSpec = createRuntimeWorkflowSpec({
    workflowKind: "implementer_checklist_sync",
    prompt,
    requiredCapabilities: [],
    sessionReusePolicy: "never",
    systemPromptAppend: "Do not use tools or subagents. Reply directly with markdown only.",
    metadata: {
      checklistSync: true,
    },
  });

  const { resultText } = await executeSubagentQuery({
    taskId: input.task.id,
    projectRoot: input.projectRoot,
    agentName: "implement-checklist-sync",
    prompt,
    workflowSpec,
    workflowKind: "implementer_checklist_sync",
  });
  const normalizedResult = resultText.trim();
  if (!normalizedResult) {
    throw new Error("Checklist sync did not return plan markdown");
  }
  return normalizedResult;
}

export async function runImplementer(taskId: string, projectRoot: string): Promise<void> {
  const task = findTaskById(taskId);

  if (!task) {
    log.error({ taskId }, "Task not found for implementation");
    throw new Error(`Task ${taskId} not found`);
  }

  // Branch restore MUST happen before any repo/config/plan read. If the
  // planner prepared a feature branch but auto-queue (or a chat/manual
  // action) moved HEAD between stages, every downstream read — config,
  // canonical plan, pending-task detection, no-op early return — would
  // operate on the wrong branch and silently ship incorrect state.
  //
  // `task.branchName` is a source-of-truth contract: once planner set it,
  // every subsequent stage MUST land on that branch or fail loud. Config
  // drift (git.enabled / create_branches toggled off between stages) cannot
  // release us to the current HEAD — `restorePersistedBranch` throws instead
  // of the "skipped" shortcut `ensureFeatureBranch` uses.
  if (task.branchName && !task.isFix) {
    restorePersistedBranch({
      projectRoot,
      taskId,
      persistedBranchName: task.branchName,
    });
    logActivity(taskId, "Agent", `Restored feature branch: ${task.branchName}`);
  }

  const project = findProjectById(task.projectId);
  const implementerBudget = project?.implementerMaxBudgetUsd ?? null;
  const useSubagents = task.useSubagents;
  const executionName = useSubagents ? AGENT_NAME : "aif-implement";
  const cfg = getProjectConfig(projectRoot);
  const canonicalPlan = readCanonicalPlan(task, projectRoot);
  const selectedPlan = canonicalPlan ?? task.plan;
  const effectivePlanPath = task.isFix ? cfg.paths.fix_plan : task.planPath || cfg.paths.plan;
  const planSection = `@${effectivePlanPath}`;
  const layerComputation = selectedPlan
    ? computePendingPlanLayers(selectedPlan)
    : { tasks: [], layers: [] };
  const parsedPlanComputation = selectedPlan
    ? computePlanLayers(selectedPlan)
    : { tasks: [], layers: [] };
  const parsedTaskCount = parsedPlanComputation.tasks.length;
  const pendingTaskCount = layerComputation.tasks.length;
  const latestReworkComment = task.reworkRequested
    ? (getLatestReworkComment(taskId) ?? null)
    : null;
  const blockingFindingsSnapshot = task.reworkRequested
    ? formatAutoReviewStateForPrompt(task.autoReviewState)
    : "No persisted blocking findings snapshot.";
  const roadmapArtifact = findRoadmapBatchArtifactByTaskId(taskId);
  const isAuditSynthesisTask = roadmapArtifact?.role === "synthesis";
  const expectedSynthesisArtifactPath = isAuditSynthesisTask ? roadmapArtifact.artifactPath : null;
  const validatedAuditSynthesisInput = buildValidatedAuditSynthesisInput(taskId, projectRoot);

  if (selectedPlan && parsedTaskCount > 0 && pendingTaskCount === 0 && !task.reworkRequested) {
    const nowIso = new Date().toISOString();
    const noOpResult =
      "No pending tasks detected in plan (all tasks already completed). " +
      "Implementer skipped coordinator execution.";
    persistTaskPlanForTask({
      taskId,
      planText: selectedPlan,
      projectRoot,
      isFix: task.isFix,
      planPath: task.planPath,
      updatedAt: nowIso,
    });
    setTaskFields(taskId, {
      implementationLog: noOpResult,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    });
    logActivity(taskId, "Agent", `${executionName} skipped — no pending tasks in plan`);
    log.info({ taskId }, "Implementer no-op: all plan tasks already completed");
    return;
  }

  log.info({ taskId, title: task.title, useSubagents }, "Starting implementation stage");

  const scopeConstraint = `IMPORTANT: Your working directory is ${projectRoot}
All files must be created and modified inside this directory. Do NOT create files outside of it.`;
  const implementSlashCommand = `/aif-implement ${planSection}`;

  const isRework = task.reworkRequested;

  // Rework header is surfaced loudly so the model cannot miss that this is
  // a reopened task with an explicit human/agent rework comment.
  const reworkHeaderBlock = isRework
    ? `================================================
  REWORK REQUEST — THIS IS THE PRIMARY TASK
================================================

You are addressing a REWORK REQUEST on a previously-completed task. The rework comment below is your PRIMARY instruction — it supersedes the checklist state of the plan. The task was previously marked DONE, but the reviewer is NOT satisfied and has requested changes. Address EXACTLY the request below. Do not re-do previously completed work unless the request explicitly asks for it.

<<<REWORK_COMMENT
${formatReworkCommentForPrompt(latestReworkComment)}
REWORK_COMMENT

<<<REWORK_BLOCKED_REASON
${task.blockedReason ?? "No blocked reason available."}
REWORK_BLOCKED_REASON

<<<FULL_REVIEW_COMMENTS
${task.reviewComments ?? "No review comments available."}
FULL_REVIEW_COMMENTS

<<<BLOCKING_FINDINGS_SNAPSHOT
${blockingFindingsSnapshot}
BLOCKING_FINDINGS_SNAPSHOT

================================================
`
    : "";

  const reworkProtocolBlock = isRework
    ? `

Rework handling protocol:
1) FIRST, restate the rework request in your own words (1-2 sentences) so it's clear you understood it. Reference specific files, functions, or plan items mentioned in the request.
2) Identify which files in the codebase and/or plan items need to change to satisfy the request.
3) Make the minimal set of changes required. Do NOT refactor unrelated code.
4) If the rework request cannot be satisfied (e.g. it asks for something impossible or contradicts an earlier decision), say so EXPLICITLY in the final result text — do not silently skip it or claim "already done".
5) If the plan checklist shows all items completed, do not interpret that as "nothing to do" — the rework comment is the source of truth for this run.
6) Treat REWORK_BLOCKED_REASON as actionable guard feedback. If it names invalid or missing report references, edit the report artifact to remove or replace those exact references before closing.
7) If REWORK_BLOCKED_REASON says invalid_or_missing_file_references, you MUST remove every exact bad reference token named there from the report artifact. Do not only describe the change in your final answer. Use repository tools to read the report, write the corrected report, run a command or read-back check proving the bad tokens are absent, git add/commit the report artifact, and verify with git log -1 --name-only --oneline.
8) In diagnostic audit/report tasks, every Evidence reference must be an existing file under the project root with a concrete line or line range. Do not cite directories such as src:1-2 or src/bot_intevra:1-20; cite specific files instead.
9) If the exact invalid tokens from REWORK_BLOCKED_REASON still appear in the report artifact, the rework is not complete. Continue editing until they are gone or explicitly report why the report cannot be corrected.
10) In the final result text, explicitly list which blocking finding IDs from BLOCKING_FINDINGS_SNAPSHOT were addressed and which IDs remain unresolved, and include the git log verification for any report artifact commit.`
    : "";

  const reworkSystemAppend = isRework
    ? "\n\nREWORK MODE: A previously-completed task has been reopened. The rework comment inside the prompt is the primary instruction. Do not treat a fully-checked plan as 'nothing to do'."
    : "";

  const effectiveSystemAppend = `${scopeConstraint}${reworkSystemAppend}`;

  // For coordinator mode the rework header goes at the very top of the prompt
  // so it cannot be buried below the lead line. For skill mode we keep the
  // slash command on the first line so Claude Code still expands it, and
  // surface the rework header inside the body instead.
  const topReworkHeader = useSubagents ? reworkHeaderBlock : "";
  const bodyReworkHeader = useSubagents ? "" : reworkHeaderBlock;

  const prompt = `${topReworkHeader}${useSubagents ? "Implement the task using the provided plan." : implementSlashCommand}

${scopeConstraint}

${bodyReworkHeader}Title: ${task.title}
Task intent contract:
${formatTaskIntentContractForPrompt(task.taskIntent)}

Description: ${task.description}
Task attachments:
${formatAttachmentsForPrompt(task.attachments)}

Validated audit batch inputs:
<<<VALIDATED_AUDIT_BATCH_INPUTS
${validatedAuditSynthesisInput}
VALIDATED_AUDIT_BATCH_INPUTS

${
  expectedSynthesisArtifactPath
    ? `Audit synthesis mode:
- Use VALIDATED_AUDIT_BATCH_INPUTS as the source of truth. Do not synthesize from unrelated repository files or old report-like files.
- Write only the expected synthesis artifact: ${expectedSynthesisArtifactPath}.
- For each summarized finding, cite the concrete repository path+line evidence contained in the validated source reports. Mention source report artifact names only as provenance, not as the only Evidence reference.
- After writing ${expectedSynthesisArtifactPath}, use git_status and git_commit for that artifact, then verify with git log -1 --name-only --oneline.
- Do not repeat identical ls/pwd/status checks. Once the artifact is written and committed, stop using tools and return the concise result.
`
    : ""
}

Plan path:
${planSection}

${isRework ? "Rework mode: true (requested from done/request_changes)." : "Rework mode: false."}

Execution rules:
- Respect task dependencies and checklist state from the plan file.
- Keep plan checklist state accurate while implementing.
- Run tests/lint/verification relevant to the changes.
- For diagnostic-only audit/review/discovery/validation plans that produce a report artifact, do not edit source/config/test files; write the report with concrete existing file \`path:line\` evidence, \`Risk:\`, and \`Verification: Command ... output ...\` markers, then commit the report artifact on the current task branch and verify it with \`git log -1 --name-only --oneline\`.
- Before closing diagnostic audit/report work, verify every cited repository path exists under the project root. Replace directory references, nonexistent paths, and placeholders with concrete existing file references and line numbers.
- When VALIDATED_AUDIT_BATCH_INPUTS contains report artifacts, use those exact validated report contents as the synthesis source of truth; do not synthesize from unvalidated report-like files.
- IMPORTANT: The plan file is ${effectivePlanPath}. Always read from and annotate this exact file — do not create plan files at other paths.${reworkProtocolBlock}`;
  const workflowSpec = createRuntimeWorkflowSpec({
    workflowKind: "implementer",
    prompt,
    requiredCapabilities: useSubagents
      ? ["supportsAgentDefinitions", "supportsRepositoryTools"]
      : ["supportsRepositoryTools"],
    agentDefinitionName: useSubagents ? AGENT_NAME : undefined,
    fallbackSlashCommand: implementSlashCommand,
    fallbackStrategy: useSubagents ? "slash_command" : "none",
    // Rework must always start a fresh session — resuming an old thread
    // leads Claude to treat the completed work as authoritative and ignore
    // the new rework request.
    sessionReusePolicy: isRework ? "never" : "resume_if_available",
    systemPromptAppend: effectiveSystemAppend,
    metadata: {
      reworkRequested: task.reworkRequested,
      skipReview: task.skipReview ?? false,
    },
  });

  const { resultText } = await executeSubagentQuery({
    taskId,
    projectRoot,
    agentName: executionName,
    prompt,
    maxBudgetUsd: implementerBudget,
    agent: useSubagents ? AGENT_NAME : undefined,
    skipReview: task.skipReview ?? false,
    workflowSpec,
    workflowKind: "implementer",
    fallbackSlashCommand: implementSlashCommand,
  });

  // Post-run drift check: if the subagent switched branches during execution
  // (e.g. a rogue skill ran `git checkout` or plan-polisher followed legacy
  // Step 1.4), we MUST block before persisting plan/log — otherwise we
  // attribute diffs from a different branch to this task.
  if (task.branchName && !task.isFix) {
    assertCurrentBranch(projectRoot, task.branchName);
  }

  let finalResultText = resultText;

  if (isBlockedImplementationResult(resultText)) {
    throw new Error("Implementer blocked by permissions");
  }

  let syncedPlan = readCanonicalPlan(task, projectRoot) ?? task.plan;
  let checklistAutoSynced = false;
  const checklistBeforeSync = getChecklistProgress(syncedPlan);

  if (
    syncedPlan &&
    checklistBeforeSync.parsedTaskCount > 0 &&
    checklistBeforeSync.pendingTaskCount > 0
  ) {
    const repairedPlan = await runChecklistSyncQuery({
      task,
      projectRoot,
      planText: syncedPlan,
      implementationResult: finalResultText,
    });
    if (looksLikeFullPlanUpdate(syncedPlan, repairedPlan)) {
      syncedPlan = repairedPlan;
      checklistAutoSynced = true;
    } else {
      log.warn(
        { taskId },
        "Checklist auto-sync returned non-plan-like response, keeping original plan",
      );
    }
  }

  // Second post-run drift check: `runChecklistSyncQuery` itself spawns a
  // subagent. Even if the main implementer ended on the right HEAD, the sync
  // pass can switch branches mid-flow. Re-assert before persisting plan/log.
  if (task.branchName && !task.isFix) {
    assertCurrentBranch(projectRoot, task.branchName);
  }

  const checklistAfterSync = getChecklistProgress(syncedPlan);
  const checklistWarning =
    syncedPlan && checklistAfterSync.parsedTaskCount > 0 && checklistAfterSync.pendingTaskCount > 0
      ? `[warning] Checklist remains incomplete after auto-sync: ${checklistAfterSync.pendingTaskCount} pending task(s).`
      : null;
  if (checklistWarning) {
    log.warn(
      { taskId, pendingTaskCount: checklistAfterSync.pendingTaskCount },
      "Checklist remains incomplete after auto-sync; continuing without blocking",
    );
  }

  const finalResultNotes: string[] = [];
  if (checklistAutoSynced) {
    finalResultNotes.push("[note] Plan checklist auto-synced after implementation.");
  }
  if (checklistWarning) {
    finalResultNotes.push(checklistWarning);
  }
  const enrichedResult =
    finalResultNotes.length > 0
      ? `${finalResultText}\n\n${finalResultNotes.join("\n")}`
      : finalResultText;

  const nowIso = new Date().toISOString();
  if (syncedPlan) {
    persistTaskPlanForTask({
      taskId,
      planText: syncedPlan,
      projectRoot,
      isFix: task.isFix,
      planPath: task.planPath,
      updatedAt: nowIso,
    });
  }

  setTaskFields(taskId, {
    implementationLog: enrichedResult,
    reworkRequested: false,
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });

  log.debug({ taskId }, "Implementation log saved to task");
}
