import {
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  listRoadmapReportArtifactsForSynthesis,
  persistTaskPlanForTask,
} from "@aif/data";
import {
  TaskPlanQualityError,
  buildDeterministicDiagnosticPlan,
  evaluateTaskPlanQuality,
  logger,
  looksLikeFullPlanUpdate,
  normalizeAifPlanManifestFence,
  type TaskPlanQualityTask,
} from "@aif/shared";
import { executeSubagentQuery } from "../subagentQuery.js";
import { assertCurrentBranch, restorePersistedBranch } from "../gitBranch.js";
import { logActivity } from "../hooks.js";

const log = logger("plan-checker");
const AGENT_NAME = "plan-checker";
type PlanCheckerTask = NonNullable<ReturnType<typeof findTaskById>>;

function toAuditArtifactRole(role: string | null | undefined): "report" | "synthesis" | null {
  return role === "report" || role === "synthesis" ? role : null;
}

function buildPlanQualityTaskContext(task: PlanCheckerTask): PlanCheckerTask & TaskPlanQualityTask {
  const artifact = findRoadmapBatchArtifactByTaskId(task.id);
  const sourceReportArtifacts =
    artifact?.role === "synthesis"
      ? listRoadmapReportArtifactsForSynthesis(artifact.batchId).map((entry) => ({
          taskId: entry.taskId,
          artifactPath: entry.artifactPath,
          state: entry.state,
          failureFamily: entry.failureFamily,
          trusted: entry.state === "valid",
        }))
      : null;
  return {
    ...task,
    auditArtifactRole: toAuditArtifactRole(artifact?.role),
    roadmapBatchId: artifact?.batchId ?? null,
    sourceReportArtifacts,
  };
}

export function normalizeMarkdownFence(text: string): string {
  const fenced = text.match(/^\s*(`{3,})(?:markdown|md)[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\1\s*$/i);
  if (!fenced) return text.trim();
  return fenced[2].trim();
}

export function hasChecklistItems(text: string): boolean {
  return /^\s*[-*]\s+\[(?: |x|X)\]\s+/m.test(text);
}

/** Count plain bullet items that could be converted to checkboxes. */
export function countConvertibleBullets(text: string): number {
  const lines = text.split("\n");
  let count = 0;
  for (const line of lines) {
    // Plain bullet that is NOT already a checkbox
    if (/^\s*[-*]\s+(?!\[(?: |x|X)\])/.test(line)) {
      // Skip lines that look like headings/context (too short or no actionable verb)
      const content = line.replace(/^\s*[-*]\s+/, "").trim();
      if (content.length > 3) count++;
    }
  }
  return count;
}

/** Convert plain bullet items to checkboxes locally (no LLM needed). */
export function convertBulletsToCheckboxes(text: string): string {
  return text.replace(/^(\s*)([-*])\s+(?!\[(?: |x|X)\])/gm, "$1$2 [ ] ");
}

/** Check if the plan already uses checklist format throughout. */
export function isPlanAlreadyChecklist(text: string): boolean {
  const convertible = countConvertibleBullets(text);
  return hasChecklistItems(text) && convertible === 0;
}

function assertTaskPlanQuality(task: PlanCheckerTask, planText: string | null | undefined): void {
  const result = evaluateTaskPlanQuality({
    task: buildPlanQualityTaskContext(task),
    plan: planText,
  });
  if (!result.ok) {
    throw new TaskPlanQualityError(result);
  }
}

function persistDeterministicDiagnosticPlanIfAvailable(
  task: PlanCheckerTask,
  projectRoot: string,
): boolean {
  const qualityTask = buildPlanQualityTaskContext(task);
  const currentQuality = evaluateTaskPlanQuality({ task: qualityTask, plan: task.plan });
  if (currentQuality.ok) return false;

  const fallbackPlan = buildDeterministicDiagnosticPlan({
    task: qualityTask,
    extraText: [task.plan],
  });
  if (!fallbackPlan) return false;

  persistTaskPlanForTask({
    taskId: task.id,
    planText: fallbackPlan,
    projectRoot,
    isFix: task.isFix,
    planPath: task.planPath ?? undefined,
    updatedAt: new Date().toISOString(),
  });

  log.info(
    { taskId: task.id, categories: currentQuality.categories },
    "Saved deterministic diagnostic plan fallback",
  );
  return true;
}

function persistNormalizedPlanManifestFenceIfChanged(
  task: PlanCheckerTask,
  projectRoot: string,
): PlanCheckerTask {
  if (!task.plan) return task;
  const normalizedPlan = normalizeAifPlanManifestFence(task.plan);
  if (normalizedPlan === task.plan) return task;

  const updatedAt = new Date().toISOString();
  persistTaskPlanForTask({
    taskId: task.id,
    planText: normalizedPlan,
    projectRoot,
    isFix: task.isFix,
    planPath: task.planPath ?? undefined,
    updatedAt,
  });

  log.info({ taskId: task.id }, "Normalized aif-plan-manifest fence in task plan");
  return { ...task, plan: normalizedPlan, updatedAt };
}

export async function runPlanChecker(taskId: string, projectRoot: string): Promise<void> {
  let task = findTaskById(taskId);

  if (!task) {
    log.error({ taskId }, "Task not found for plan checklist verification");
    throw new Error(`Task ${taskId} not found`);
  }

  // Same branch-restore contract as implementer/reviewer: must run before any
  // repo read or plan persist. BranchIsolationError → blocked_external.
  if (task.branchName && !task.isFix) {
    restorePersistedBranch({
      projectRoot,
      taskId,
      persistedBranchName: task.branchName,
    });
    logActivity(taskId, "Agent", `Restored feature branch: ${task.branchName}`);
  }

  task = persistNormalizedPlanManifestFenceIfChanged(task, projectRoot);

  if (persistDeterministicDiagnosticPlanIfAvailable(task, projectRoot)) {
    return;
  }

  if (!task.plan || task.plan.trim().length === 0) {
    log.warn({ taskId }, "Plan checklist verification failed: task has no plan");
    assertTaskPlanQuality(task, task.plan);
    return;
  }

  // Fast path: skip LLM call if plan already has proper checklist format
  if (isPlanAlreadyChecklist(task.plan)) {
    assertTaskPlanQuality(task, task.plan);
    log.info({ taskId }, "Plan already in checklist format — skipping plan-checker agent");
    return;
  }

  // Try local conversion first — if only simple bullet→checkbox conversion is needed
  const convertible = countConvertibleBullets(task.plan);
  if (convertible > 0 && hasChecklistItems(task.plan)) {
    const locallyConverted = normalizeAifPlanManifestFence(convertBulletsToCheckboxes(task.plan));
    if (isPlanAlreadyChecklist(locallyConverted)) {
      assertTaskPlanQuality(task, locallyConverted);
      log.info(
        { taskId, convertedItems: convertible },
        "Converted plain bullets to checkboxes locally — skipping plan-checker agent",
      );
      persistTaskPlanForTask({
        taskId,
        planText: locallyConverted,
        projectRoot,
        isFix: task.isFix,
        planPath: task.planPath ?? undefined,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
  }

  const project = findProjectById(task.projectId);
  const planCheckerBudget = project?.planCheckerMaxBudgetUsd ?? null;
  const manifestRequirement =
    task.plannerMode === "full"
      ? "8) Full-mode plans must include exactly one fenced `aif-plan-manifest` JSON block with version, taskId, intent, scope, allowedChanges, forbiddenChanges, expectedArtifacts, acceptanceCriteria, and verificationCommands. Preserve a valid existing manifest or add/repair it when absent or malformed.\n9) Manifest acceptance criteria must be testable and verificationCommands must be concrete local commands.\n10) Manifest intent, allowedChanges, and forbiddenChanges must respect the task intent contract; do not convert audit, spike, docs, or tests work into feature/fix implementation."
      : "8) If an `aif-plan-manifest` block is already present, preserve and repair it. Do not add a manifest solely because the plan is fast-mode.";

  log.info({ taskId, title: task.title }, "Starting plan-checker agent");

  const prompt = `You are validating an implementation plan markdown before coding starts.
Task title: ${task.title}

Current plan markdown:
${task.plan}

Requirements:
1) Ensure the plan is a checklist where actionable items use markdown checkboxes in "- [ ] Item" format.
2) Convert plain bullet tasks into unchecked checkboxes when needed.
3) Keep headings and non-actionable context text intact.
4) Preserve completed items "- [x]" as completed.
5) Return the FULL updated plan markdown, not a partial snippet.
6) Return only the corrected plan markdown, no explanations.
7) Do not use tools or subagents.
${manifestRequirement}`;

  const { resultText } = await executeSubagentQuery({
    taskId,
    projectRoot,
    agentName: AGENT_NAME,
    prompt,
    profileMode: "plan_checker",
    workflowKind: "plan-checker",
    maxBudgetUsd: planCheckerBudget,
  });

  // Post-run drift check: subagent must not have switched HEAD.
  if (task.branchName && !task.isFix) {
    assertCurrentBranch(projectRoot, task.branchName);
  }

  const normalizedPlan = normalizeAifPlanManifestFence(normalizeMarkdownFence(resultText));
  if (normalizedPlan.length === 0) {
    throw new Error("Plan checker returned empty content");
  }

  const hasChecklist = hasChecklistItems(normalizedPlan);
  const looksLikeFull = looksLikeFullPlanUpdate(task.plan, normalizedPlan);

  if (!hasChecklist || !looksLikeFull) {
    log.warn(
      {
        taskId,
        hasChecklist,
        looksLikeFull,
        originalLength: task.plan.length,
        returnedLength: normalizedPlan.length,
        preview: normalizedPlan.slice(0, 200),
      },
      "Plan checker returned non-plan-like content; attempting local fallback",
    );

    // Fallback: try local conversion of the ORIGINAL plan
    const fallback = normalizeAifPlanManifestFence(convertBulletsToCheckboxes(task.plan));
    if (hasChecklistItems(fallback)) {
      assertTaskPlanQuality(task, fallback);
      log.info({ taskId }, "Local fallback conversion succeeded — saving converted plan");
      persistTaskPlanForTask({
        taskId,
        planText: fallback,
        projectRoot,
        isFix: task.isFix,
        planPath: task.planPath ?? undefined,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    log.warn({ taskId }, "Local fallback also failed; rejecting existing task plan");
    assertTaskPlanQuality(task, task.plan);
    return;
  }

  assertTaskPlanQuality(task, normalizedPlan);

  persistTaskPlanForTask({
    taskId,
    planText: normalizedPlan,
    projectRoot,
    isFix: task.isFix,
    planPath: task.planPath ?? undefined,
    updatedAt: new Date().toISOString(),
  });

  log.debug({ taskId }, "Verified plan saved to task");
}
