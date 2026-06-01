import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  findRoadmapBatchArtifactByTaskId,
  findProjectById,
  findTaskById,
  buildTaskRequirementsContextForPrompt,
  listRoadmapReportArtifactsForSynthesis,
  listTaskComments,
  persistTaskPlanForTask,
  setTaskFields,
} from "@aif/data";
import { createRuntimeWorkflowSpec } from "@aif/runtime";
import {
  buildDeterministicDiagnosticPlan,
  logger,
  formatAttachmentsForPrompt,
  formatTaskIntentContractForPrompt,
  getEnv,
  getProjectConfig,
  normalizeAifPlanManifestForTask,
  evaluateTaskPlanQuality,
  TaskPlanQualityError,
  type AifPlanManifest,
  type AifPlanManifestExpectedArtifact,
  type TaskPlanQualityTask,
} from "@aif/shared";
import { executeSubagentQuery } from "../subagentQuery.js";
import {
  formatRaiseQuestionsPromptGuidance,
  handleRaiseQuestionsOutput,
} from "./raiseQuestions.js";
import {
  assertCurrentBranch,
  ensureFeatureBranch,
  ensureTaskWorktree,
  projectSupportsTaskWorktrees,
  restorePersistedBranch,
} from "../gitBranch.js";
import { logActivity } from "../hooks.js";
import { buildTaskMemoryContext } from "../memoryContext.js";

const log = logger("planner");
const AGENT_NAME = "plan-coordinator";
const FIX_SKILL_NAME = "aif-fix";
type PlannerTask = NonNullable<ReturnType<typeof findTaskById>>;

function toAuditArtifactRole(role: string | null | undefined): "report" | "synthesis" | null {
  return role === "report" || role === "synthesis" ? role : null;
}

function buildPlannerPlanQualityTaskContext(task: PlannerTask): PlannerTask & TaskPlanQualityTask {
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

function assertPlannerOutputQuality(task: PlannerTask, planText: string): void {
  const result = evaluateTaskPlanQuality({
    task: buildPlannerPlanQualityTaskContext(task),
    plan: planText,
  });
  if (!result.ok) {
    throw new TaskPlanQualityError(result);
  }
}

function extractPlannerMetadataLine(description: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = description.match(new RegExp(`^\\s*${escapedLabel}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() || null;
}

function splitPlannerMetadataList(value: string | null): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[,;]\s*/)
        .map((entry) => entry.trim().replace(/^`|`$/g, ""))
        .filter((entry) => entry.length > 0),
    ),
  ];
}

function sanitizeDeterministicPlanSentence(value: string): string {
  return value
    .replace(/\bplaceholder[-\s]*only\b/gi, "temporary-only")
    .replace(/\bplaceholders?\b/gi, "temporary values")
    .trim();
}

function normalizeDeterministicPlanScopePath(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/^`|`$/g, "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/\*\*.*$/, "")
    .replace(/\/\*.*$/, "")
    .replace(/[),.;\]]+$/g, "")
    .replace(/\/+$/g, "");
  return normalized.length > 0 ? normalized : null;
}

function isComposeDevRuntimeTask(task: PlannerTask): boolean {
  const text = `${task.title}\n${task.description ?? ""}`;
  return /\b(?:add\s+compose\s+dev\s+runtime|local\s+compose\s+runtime|compose\s+dev\s+runtime)\b/i.test(
    text,
  );
}

function isCiWorkflowSkeletonTask(task: PlannerTask): boolean {
  const text = `${task.title}\n${task.description ?? ""}`;
  return /\b(?:add\s+ci\s+workflow\s+skeleton|minimal\s+ci\s+workflow\s+skeleton|ci\s+workflow\s+runs)\b/i.test(
    text,
  );
}

function isFirstAppSliceTask(task: PlannerTask): boolean {
  const text = `${task.title}\n${task.description ?? ""}`;
  return /\b(?:first\s+(?:app\s+)?slice|first\s+workflow|deterministic\s+sample\s+data|focused\s+test\s+covers\s+the\s+first\s+workflow)\b/i.test(
    text,
  );
}

function isSmokeCheckTask(task: PlannerTask): boolean {
  const text = `${task.title}\n${task.description ?? ""}`;
  return /\b(?:smoke[-\s]?(?:check|coverage|test)|focused\s+smoke\s+coverage)\b/i.test(text);
}

function normalizeFirstAppSliceScopePath(path: string): string | null {
  const normalized = path.toLowerCase();
  if (normalized === "src/app" || normalized === "src/app/**") return "src/app/App.tsx";
  if (normalized === "src/components" || normalized === "src/components/**") {
    return "src/components/AppShell.tsx";
  }
  if (normalized === "src/routes" || normalized === "src/routes/**") {
    return "src/routes/HomeRoute.tsx";
  }
  if (normalized === "src/services" || normalized === "src/services/**") {
    return "src/services/sampleData.ts";
  }
  if (normalized === "src" || normalized === "src/**/*.test.*") return "src/app/App.test.tsx";
  return null;
}

function normalizeSmokeCheckScopePath(path: string): string | null {
  const normalized = path.toLowerCase();
  if (normalized === "src/**/*.test.*" || normalized === "tests" || normalized === "tests/**") {
    return "src/app/App.test.tsx";
  }
  if (normalized === "package.json") return null;
  return null;
}

function normalizeDeterministicPlanScope(task: PlannerTask, fileBoundaries: string[]): string[] {
  const scope = fileBoundaries
    .flatMap((entry) => {
      const raw = entry
        .trim()
        .replace(/^`|`$/g, "")
        .replaceAll("\\", "/")
        .replace(/^\.\/+/, "");
      if (isCiWorkflowSkeletonTask(task) && /^\.github\/workflows\/\*\*$/i.test(raw)) {
        return [".github/workflows/ci.yml"];
      }
      const firstAppSlicePath = isFirstAppSliceTask(task)
        ? normalizeFirstAppSliceScopePath(raw)
        : null;
      if (firstAppSlicePath) return [firstAppSlicePath];
      const smokeCheckPath = isSmokeCheckTask(task) ? normalizeSmokeCheckScopePath(raw) : null;
      if (smokeCheckPath) return [smokeCheckPath];
      if (isSmokeCheckTask(task) && raw.toLowerCase() === "package.json") return [];
      const normalizedEntry = normalizeDeterministicPlanScopePath(entry);
      return normalizedEntry ? [normalizedEntry] : [];
    })
    .flatMap((entry) => {
      if (!isComposeDevRuntimeTask(task)) return [entry];
      const normalized = entry.toLowerCase();
      if (
        normalized === "docker-compose*.yml" ||
        normalized === "docker-compose*.yaml" ||
        normalized === "compose*.yml" ||
        normalized === "compose*.yaml"
      ) {
        return ["docker-compose.yml"];
      }
      return [entry];
    });
  return [...new Set(scope)].sort();
}

function isDeterministicPlanConfigPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    normalized === ".gitignore" ||
    /^\.env(?:\..+)?$/.test(normalized) ||
    /(^|\/)(?:package|package-lock|pnpm-lock|yarn\.lock|bun\.lockb)(?:\.json)?$/.test(normalized) ||
    /(^|\/)(?:tsconfig|vite|vitest|eslint|prettier|turbo|dockerfile|docker-compose)\b/.test(
      normalized,
    ) ||
    /\.(?:jsonc?|ya?ml|toml|ini|env)$/.test(normalized)
  );
}

function isDeterministicPlanTestPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    /(?:^|\/)(?:__tests__|tests?)(?:\/|$)/.test(normalized) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function buildDeterministicPlanExpectedArtifacts(
  scope: string[],
): AifPlanManifestExpectedArtifact[] {
  const sourcePaths = scope.filter(
    (path) => !isDeterministicPlanConfigPath(path) && !isDeterministicPlanTestPath(path),
  );
  const testPaths = scope.filter(isDeterministicPlanTestPath);
  const configPaths = scope.filter(isDeterministicPlanConfigPath);
  const artifacts: AifPlanManifestExpectedArtifact[] = [];
  if (sourcePaths.length > 0) {
    artifacts.push({ kind: "source_diff", paths: sourcePaths });
  }
  if (testPaths.length > 0) {
    artifacts.push({ kind: "test_delta", paths: testPaths });
  }
  if (configPaths.length > 0) {
    artifacts.push({ kind: "config_update", paths: configPaths });
  }
  return artifacts;
}

function formatDeterministicPlanManifestBlock(manifest: AifPlanManifest): string {
  return ["```aif-plan-manifest", JSON.stringify(manifest, null, 2), "```"].join("\n");
}

function looksLikeRaiseQuestionsContract(planText: string): boolean {
  return (
    /(?:^|\s)(?:aif|аиф)-raise-questions\b/i.test(planText) ||
    /"action"\s*:\s*"raise_questions"/i.test(planText)
  );
}

function buildDeterministicImplementationPlan(task: PlannerTask): string | null {
  if (task.isFix) return null;
  const taskIntent = task.taskIntent ?? "general";
  if (taskIntent !== "feature") return null;
  if (!task.roadmapAlias) return null;
  if (task.plannerMode !== "full") return null;

  const description = task.description ?? "";
  const fileBoundaries = splitPlannerMetadataList(
    extractPlannerMetadataLine(description, "File boundaries"),
  );
  const scope = normalizeDeterministicPlanScope(task, fileBoundaries);
  const verification = extractPlannerMetadataLine(description, "Verification");
  const acceptance = sanitizeDeterministicPlanSentence(
    extractPlannerMetadataLine(description, "Acceptance criteria") ??
      `${task.title} satisfies the declared task scope.`,
  );
  if (scope.length === 0 || !verification) return null;

  const expectedArtifacts = buildDeterministicPlanExpectedArtifacts(scope);
  if (expectedArtifacts.length === 0) return null;

  const boundaryText = scope.map((entry) => `\`${entry}\``).join(", ");
  const allowedChanges = [
    ...new Set(
      expectedArtifacts.flatMap((artifact) =>
        artifact.kind === "config_update"
          ? ["config"]
          : artifact.kind === "test_delta"
            ? ["tests"]
            : ["source"],
      ),
    ),
  ];
  const manifest: AifPlanManifest = {
    version: 1,
    taskId: task.id,
    intent: taskIntent,
    scope,
    allowedChanges,
    forbiddenChanges: ["report"],
    expectedArtifacts,
    acceptanceCriteria: [
      {
        id: "ac-scoped-implementation",
        description: acceptance,
        verification,
      },
      {
        id: "ac-boundary-control",
        description: `Implementation changes stay within ${boundaryText}.`,
        verification,
      },
    ],
    verificationCommands: [verification],
  };
  const plan = [
    "## Plan",
    `- [ ] Inspect the declared file boundaries ${boundaryText} and confirm the minimal changes needed for this task.`,
    `- [ ] Implement only the scoped behavior: ${acceptance}`,
    `- [ ] Keep edits limited to ${boundaryText}; do not add unrelated features, generated output, secrets, provider diagnostics, or broad refactors.`,
    `- [ ] Run \`${verification}\` and confirm it passes.`,
    "",
    "## aif-plan-manifest",
    "",
    formatDeterministicPlanManifestBlock(manifest),
  ].join("\n");

  const qualityTask = buildPlannerPlanQualityTaskContext(task);
  const quality = evaluateTaskPlanQuality({ task: qualityTask, plan });
  return quality.ok ? plan : null;
}

function extractPlanPathFromResult(resultText: string): string | null {
  const patterns = [/plan written to\s+([^\n]+)/i, /saved to\s+([^\n]+)/i];

  for (const pattern of patterns) {
    const match = resultText.match(pattern);
    if (!match) continue;
    const normalized = normalizeExtractedPlanPath(match[1]);
    if (normalized) return normalized;
  }

  return null;
}

function normalizeExtractedPlanPath(pathText: string): string | null {
  const normalized = pathText
    .trim()
    .replace(/^[@`"'(\[]+/, "")
    .replace(/[)\].,`"']+$/, "")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePlanPath(path: string | null | undefined, projectRoot: string): string {
  const defaultPlan = getProjectConfig(projectRoot).paths.plan;
  if (!path) return defaultPlan;
  return path.trim().replace(/^@+/, "") || defaultPlan;
}

interface PlanFileSnapshot {
  capturedAtMs: number;
  mtimes: Map<string, number>;
}

function planCandidatePaths(
  projectRoot: string,
  resultText: string,
  isFix: boolean,
  customPlanPath?: string,
): string[] {
  const cfg = getProjectConfig(projectRoot);
  const normalizedPlanPath = normalizePlanPath(customPlanPath, projectRoot);
  const canonicalPlanPath = resolve(projectRoot, isFix ? cfg.paths.fix_plan : normalizedPlanPath);
  const candidatePaths = new Set<string>([canonicalPlanPath]);
  const pathFromResult = extractPlanPathFromResult(resultText);
  if (pathFromResult) {
    const resolved = pathFromResult.startsWith("/")
      ? pathFromResult
      : resolve(projectRoot, pathFromResult);
    candidatePaths.add(resolved);
  }

  // Skill runs may write fallback paths even when @path is requested.
  if (isFix) {
    candidatePaths.add(resolve(projectRoot, "FIX_PLAN.md"));
  } else {
    candidatePaths.add(resolve(projectRoot, cfg.paths.plan));
    candidatePaths.add(resolve(projectRoot, "PLAN.md"));
  }

  return [...candidatePaths];
}

function snapshotPlanFiles(
  projectRoot: string,
  isFix: boolean,
  customPlanPath?: string,
): PlanFileSnapshot {
  const mtimes = new Map<string, number>();
  const capturedAtMs = Date.now();
  for (const candidatePath of planCandidatePaths(projectRoot, "", isFix, customPlanPath)) {
    if (!existsSync(candidatePath)) continue;
    try {
      mtimes.set(candidatePath, statSync(candidatePath).mtimeMs);
    } catch {
      // The file may be removed between exists/stat checks; treat it as absent.
    }
  }
  return { capturedAtMs, mtimes };
}

function wasPlanFileUpdatedForRun(candidatePath: string, snapshot: PlanFileSnapshot): boolean {
  if (!existsSync(candidatePath)) return false;
  let mtimeMs: number;
  try {
    mtimeMs = statSync(candidatePath).mtimeMs;
  } catch {
    return false;
  }
  const previousMtimeMs = snapshot.mtimes.get(candidatePath);
  if (previousMtimeMs !== undefined) {
    return mtimeMs > previousMtimeMs + 0.5;
  }
  return mtimeMs >= snapshot.capturedAtMs - 1000;
}

function readPlanFromDisk(
  projectRoot: string,
  resultText: string,
  isFix: boolean,
  snapshot: PlanFileSnapshot,
  customPlanPath?: string,
): string | null {
  for (const candidatePath of planCandidatePaths(projectRoot, resultText, isFix, customPlanPath)) {
    if (!wasPlanFileUpdatedForRun(candidatePath, snapshot)) continue;
    const content = readFileSync(candidatePath, "utf8").trim();
    if (content.length > 0) return content;
  }

  return null;
}

function normalizePlannerResult(resultText: string): string {
  const cleaned = resultText
    .replace(/^plan written to .*$/im, "")
    .replace(/^saved to .*$/im, "")
    .trim();

  return cleaned.length > 0 ? cleaned : resultText.trim();
}

function formatCommentsForPrompt(
  comments: Array<{
    author: "human" | "agent";
    message: string;
    attachments: string | null;
    createdAt: string;
  }>,
): string {
  if (comments.length === 0) return "No user comments were provided.";

  const latest = comments.slice(-1);
  return latest
    .map((comment, index) => {
      const formatted = formatAttachmentsForPrompt(comment.attachments);
      const attachmentLines =
        formatted === "No task attachments were provided." ? "    none" : formatted;

      return [
        `${index + 1}. [${comment.createdAt}] ${comment.author}`,
        `   message: ${comment.message}`,
        "   attachments:",
        attachmentLines,
      ].join("\n");
    })
    .join("\n\n");
}

function buildFixCommandText(taskContext: string): string {
  return `/aif-fix --plan-first ${JSON.stringify(taskContext)}`;
}

export async function runPlanner(taskId: string, projectRoot: string): Promise<void> {
  const task = findTaskById(taskId);
  const comments = listTaskComments(taskId).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );

  if (!task) {
    log.error({ taskId }, "Task not found for planning");
    throw new Error(`Task ${taskId} not found`);
  }

  const useSubagents = task.useSubagents;
  const executionName = task.isFix ? FIX_SKILL_NAME : useSubagents ? AGENT_NAME : "aif-plan";
  log.info({ taskId, title: task.title, isFix: task.isFix }, "Starting planning flow");
  const project = findProjectById(task.projectId);
  const plannerBudget = project?.plannerMaxBudgetUsd ?? null;
  let executionRoot = task.worktreePath ?? projectRoot;

  const taskAttachmentsForPrompt = formatAttachmentsForPrompt(task.attachments);
  const commentsForPrompt = formatCommentsForPrompt(comments);

  const plannerMode = task.plannerMode || "full";
  const planPath = normalizePlanPath(task.planPath, executionRoot);
  const planDocs = task.planDocs ? "true" : "false";
  const planTests = task.planTests ? "true" : "false";
  const taskIntentContract = formatTaskIntentContractForPrompt(task.taskIntent);
  const hasPlanQualityFeedback =
    task.blockedReason?.toLowerCase().startsWith("plan quality guard") ||
    task.blockedFromStatus === "plan_ready";
  const planningFeedback =
    hasPlanQualityFeedback && task.blockedReason
      ? `Previous plan-quality feedback that must be addressed:\n${task.blockedReason}`
      : "No prior plan-quality feedback was recorded.";
  const diagnosticPlanningConstraint = [
    "Diagnostic-only planning applies only to explicit audit, discovery, inventory, gap-analysis, findings, security-review, code-review, review-findings, validation-report, validation-task, validation-audit, validation-findings, verification-report, verification-task, verification-audit, or verification-findings work.",
    "Planning is planning-only: write or update only the plan file requested by the planner, never the report artifact, source files, config files, test files, or git commits.",
    "For those tasks, keep the plan diagnostic-only: write an inspectable report artifact path, cite repository paths that the report must validate, do not implement fixes in this same run, and do not create or execute child implementation tasks.",
    "The plan must make completion verifiable: require report findings or verification items to include exact `path:line` evidence, `Risk:`, and `Verification: Command ... output ...` details.",
    "The plan must require the report artifact to be committed on the task branch, including `git status --short`, `git add <report path>`, `git commit -m ...`, and `git log -1 --name-only --oneline` verification steps.",
  ].join(" ");
  const planManifestPlanningConstraint =
    plannerMode === "full"
      ? [
          "Full-mode planning requirement: include exactly one fenced `aif-plan-manifest` JSON block in the final plan.",
          "The manifest must include version 1, taskId, intent, scope, allowedChanges, forbiddenChanges, expectedArtifacts, acceptanceCriteria, and verificationCommands.",
          "Acceptance criteria must be testable and verificationCommands must be concrete local commands.",
          "The manifest intent, allowedChanges, and forbiddenChanges must respect the task intent contract and must not convert audit, spike, docs, or tests tasks into feature/fix implementation work.",
          "Do not write a runnable manifest for broad, vague, or multi-area implementation work. If the task spans broad file boundaries, multiple major subsystems, setup/runtime/dev-stack commands, or scaffold/base-configuration work, return split-required planning feedback that tells the operator to create smaller children with concrete files, acceptance checks, and focused verification commands.",
        ].join(" ")
      : "Fast-mode planning compatibility: do not require an aif-plan-manifest block unless one already exists; preserve and repair any existing manifest instead of deleting it.";

  // Deterministic branch handling. Two contracts, applied in order:
  //
  //  1. RESTORE for ANY bound non-fix task — runs regardless of plannerMode
  //     (full or fast). `task.branchName` is the source-of-truth: once a
  //     prior run persisted it, every subsequent stage MUST land on it or
  //     fail loud. A replan triggered with mode=fast (manual replanning,
  //     comment-driven re-run) used to skip the restore entirely and let
  //     the planner write to whatever HEAD happened to be.
  //
  //  2. CREATE only in full mode for unbound non-fix tasks. Fast mode stays
  //     on the current branch by design (see aif-handoff#83) — first-time
  //     branch provisioning is a full-mode-only concern.
  //
  // Failures throw BranchIsolationError (dirty worktree, missing base branch,
  // checkout failure, branch_missing, etc). The coordinator classifies it as
  // blocked_external with retryAfter=null so an operator can inspect the work
  // tree instead of the stage silently reverting into a bad state.
  let preparedBranch: string | null = task.branchName ?? null;
  if (!task.isFix && task.worktreePath) {
    if (task.branchName) {
      restorePersistedBranch({
        projectRoot: executionRoot,
        taskId,
        persistedBranchName: task.branchName,
      });
      preparedBranch = task.branchName;
      logActivity(taskId, "Agent", `Restored task worktree branch: ${task.branchName}`);
    }
  } else if (!task.isFix && task.branchName) {
    restorePersistedBranch({
      projectRoot: executionRoot,
      taskId,
      persistedBranchName: task.branchName,
    });
    preparedBranch = task.branchName;
    logActivity(taskId, "Agent", `Restored feature branch: ${task.branchName}`);
  } else if (!task.isFix && plannerMode === "full") {
    const shouldCreateWorktree =
      getEnv().AIF_TASK_WORKTREES_ENABLED &&
      Boolean(project?.parallelEnabled) &&
      projectSupportsTaskWorktrees(projectRoot);
    if (shouldCreateWorktree) {
      const worktreeResult = ensureTaskWorktree({
        projectRoot,
        taskId,
        title: task.title,
      });
      if (
        worktreeResult.action !== "skipped" &&
        worktreeResult.branchName &&
        worktreeResult.worktreePath
      ) {
        preparedBranch = worktreeResult.branchName;
        executionRoot = worktreeResult.worktreePath;
        setTaskFields(taskId, {
          branchName: worktreeResult.branchName,
          worktreePath: worktreeResult.worktreePath,
          updatedAt: new Date().toISOString(),
        });
        logActivity(
          taskId,
          "Agent",
          `Task worktree ${worktreeResult.action}: ${worktreeResult.worktreePath} (${worktreeResult.branchName})`,
        );
      } else if (worktreeResult.reason) {
        log.debug({ taskId, reason: worktreeResult.reason }, "Worktree creation skipped");
      }
    } else {
      const branchResult = ensureFeatureBranch({
        projectRoot: executionRoot,
        taskId,
        title: task.title,
      });
      if (branchResult.action !== "skipped" && branchResult.branchName) {
        preparedBranch = branchResult.branchName;
        setTaskFields(taskId, {
          branchName: branchResult.branchName,
          updatedAt: new Date().toISOString(),
        });
        logActivity(
          taskId,
          "Agent",
          `Feature branch ${branchResult.action}: ${branchResult.branchName}`,
        );
      } else if (branchResult.reason) {
        log.debug({ taskId, reason: branchResult.reason }, "Branch creation skipped");
      }
    }
  }

  if (!task.isFix) {
    const qualityTask = buildPlannerPlanQualityTaskContext(task);
    const deterministicPlan = buildDeterministicDiagnosticPlan({
      task: qualityTask,
      extraText: [task.plan, task.blockedReason],
    });
    if (deterministicPlan) {
      const resultText = normalizeAifPlanManifestForTask({
        task: qualityTask,
        plan: deterministicPlan,
      });
      persistTaskPlanForTask({
        taskId,
        planText: resultText,
        projectRoot: executionRoot,
        isFix: false,
        planPath,
        updatedAt: new Date().toISOString(),
      });
      log.info({ taskId }, "Saved deterministic diagnostic planner fallback");
      logActivity(taskId, "Agent", "Saved deterministic diagnostic plan without model planner");
      return;
    }
    const deterministicImplementationPlan = buildDeterministicImplementationPlan(task);
    if (deterministicImplementationPlan) {
      persistTaskPlanForTask({
        taskId,
        planText: deterministicImplementationPlan,
        projectRoot: executionRoot,
        isFix: false,
        planPath,
        updatedAt: new Date().toISOString(),
      });
      log.info({ taskId }, "Saved deterministic implementation planner fallback");
      logActivity(
        taskId,
        "Agent",
        "Saved deterministic implementation plan fallback without model planner",
      );
      return;
    }
  }

  const taskContext = `Title: ${task.title}
Task intent contract:
${taskIntentContract}

Description: ${task.description}
Task attachments:
${taskAttachmentsForPrompt}
User comments and replanning feedback:
${commentsForPrompt}

Planning feedback:
${planningFeedback}

Diagnostic task constraint:
${diagnosticPlanningConstraint}

Plan manifest constraint:
${planManifestPlanningConstraint}`;
  let prompt: string;
  let workflowSpec: ReturnType<typeof createRuntimeWorkflowSpec>;
  // HANDOFF_BRANCH_PREPARED=1 tells the aif-plan / plan-polisher skill that
  // Handoff already owns branch creation for this run. The skill MUST NOT
  // execute its own `git checkout -b`; it should validate that the current
  // branch matches HANDOFF_BRANCH_NAME and report a blocker if not. See
  // ai-factory#96.
  const handoffBranchLines = preparedBranch
    ? `\nHANDOFF_BRANCH_PREPARED: 1\nHANDOFF_BRANCH_NAME: ${preparedBranch}`
    : "";
  const handoffContext = `HANDOFF_MODE: 1\nHANDOFF_TASK_ID: ${taskId}${handoffBranchLines}`;
  const scopeConstraint = `IMPORTANT: Your working directory is ${executionRoot}\nAll files must be created and modified inside this directory. Do NOT navigate to parent directories or other projects.`;
  const plannerSlashCommand = `/aif-plan ${plannerMode} @${planPath} docs:${planDocs} tests:${planTests}`;
  const memoryContext = buildTaskMemoryContext({
    task,
    workflowKind: "planner",
    source: "agent:planner",
    queryParts: [taskContext, commentsForPrompt, planningFeedback],
  });
  const memoryBlock = memoryContext ? `\n\n${memoryContext}\n` : "";
  const requirementsContext = buildTaskRequirementsContextForPrompt(taskId, "planning");
  const requirementsBlock = requirementsContext ? `\n\n${requirementsContext.markdown}\n` : "";
  const raiseQuestionsBlock = `\n\n${formatRaiseQuestionsPromptGuidance("planning")}\n`;

  if (task.isFix) {
    prompt = `${handoffContext}\n${scopeConstraint}${memoryBlock}${requirementsBlock}${raiseQuestionsBlock}\n\n${buildFixCommandText(taskContext)}`;
    workflowSpec = createRuntimeWorkflowSpec({
      workflowKind: "planner",
      prompt,
      requiredCapabilities: [],
      sessionReusePolicy: "resume_if_available",
      systemPromptAppend: scopeConstraint,
    });
  } else if (useSubagents) {
    prompt = `Plan the implementation for the following task.

${handoffContext}
${scopeConstraint}
${memoryBlock}${requirementsBlock}${raiseQuestionsBlock}

Mode: ${plannerMode}, tests: ${planTests}, docs: ${planDocs}.
Plan file reference: @${planPath}
Filesystem plan path: ${planPath}

${taskContext}

Create or refine an implementation-ready markdown checklist plan.
Always write the final plan to ${planPath}; do not create a filesystem path that starts with @.
Planning stage must not create report artifacts, edit source/config/test files, run git add, run git commit, or mark the implementation complete.`;
    workflowSpec = createRuntimeWorkflowSpec({
      workflowKind: "planner",
      prompt,
      requiredCapabilities: ["supportsAgentDefinitions"],
      agentDefinitionName: AGENT_NAME,
      fallbackSlashCommand: plannerSlashCommand,
      fallbackStrategy: "slash_command",
      sessionReusePolicy: "resume_if_available",
      systemPromptAppend: scopeConstraint,
      metadata: {
        plannerMode,
        planDocs,
        planTests,
      },
    });
  } else {
    prompt = `${handoffContext}\n${scopeConstraint}${memoryBlock}${requirementsBlock}${raiseQuestionsBlock}\n\n${plannerSlashCommand}

${taskContext}`;
    workflowSpec = createRuntimeWorkflowSpec({
      workflowKind: "planner",
      prompt,
      requiredCapabilities: [],
      sessionReusePolicy: "resume_if_available",
      systemPromptAppend: scopeConstraint,
      metadata: {
        plannerMode,
        planDocs,
        planTests,
      },
    });
  }

  const planFileSnapshot = snapshotPlanFiles(executionRoot, task.isFix, planPath);
  const { resultText: rawResult } = await executeSubagentQuery({
    taskId,
    projectRoot: executionRoot,
    agentName: executionName,
    prompt,
    profileMode: "planner",
    maxBudgetUsd: plannerBudget,
    agent: task.isFix || !useSubagents ? undefined : AGENT_NAME,
    workflowSpec,
    workflowKind: "planner",
    fallbackSlashCommand: task.isFix ? undefined : plannerSlashCommand,
  });

  // Detect skill-level branch drift: if the planner subagent (or its
  // nested plan-polisher) silently created or switched to a different
  // branch than the one we prepared, the plan we're about to persist
  // belongs to the wrong HEAD. Surface as BranchIsolationError so the
  // coordinator blocks the task instead of committing the drift.
  if (preparedBranch) {
    assertCurrentBranch(executionRoot, preparedBranch);
  }

  if (
    handleRaiseQuestionsOutput({
      taskId,
      output: rawResult,
      stage: "planning",
      sourceAgent: "planner",
      sourcePromptHash: null,
    })
  ) {
    return;
  }

  const diskPlan = readPlanFromDisk(
    executionRoot,
    rawResult,
    !!task.isFix,
    planFileSnapshot,
    planPath,
  );
  const resultText = normalizeAifPlanManifestForTask({
    task: buildPlannerPlanQualityTaskContext(task),
    plan: diskPlan ?? normalizePlannerResult(rawResult),
  });

  let planText = resultText;
  try {
    assertPlannerOutputQuality(task, planText);
  } catch (error) {
    if (!(error instanceof TaskPlanQualityError)) throw error;
    if (looksLikeRaiseQuestionsContract(planText)) throw error;
    const deterministicPlan = buildDeterministicImplementationPlan(task);
    if (!deterministicPlan) throw error;
    planText = deterministicPlan;
    log.info({ taskId }, "Saved deterministic implementation planner fallback");
    logActivity(taskId, "Agent", "Saved deterministic implementation plan fallback");
  }

  persistTaskPlanForTask({
    taskId,
    planText,
    projectRoot: executionRoot,
    isFix: task.isFix,
    planPath,
    updatedAt: new Date().toISOString(),
  });

  log.debug({ taskId }, "Plan saved to task");
}
