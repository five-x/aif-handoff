import { execFileSync } from "node:child_process";
import {
  assertCurrentBranch,
  getProjectConfig,
  inferTaskIntent,
  isRiskyTask,
  isBranchIsolationError,
  logger,
  parseExpectedAuditReportArtifactPath,
  restorePersistedBranch,
  type TaskIntent,
} from "@aif/shared";
import { findProjectById, findTaskById } from "@aif/data";

const log = logger("commit-generation");

export interface RunCommitQueryResult {
  ok: boolean;
  error?: string;
}

export interface RunCommitQueryInput {
  projectId: string;
  taskId?: string | null;
}

/**
 * Build the explicit instruction prompt for the commit run.
 *
 * Background: the previous implementation sent the bare string `"/aif-commit"`
 * as the prompt, relying on Claude Code to resolve it as a slash command /
 * skill. In `-p` (print) mode that resolution is unreliable — the model would
 * often respond with text and never actually run `git commit`. This prompt
 * spells the full procedure out in English so ANY runtime adapter can execute
 * it. We still pass the slash command as a fallback hint for adapters that DO
 * support skill resolution.
 */
export function buildCommitPrompt(shouldPush: boolean): string {
  const pushLine = shouldPush
    ? "5. After committing, run `git push` on the current branch. Do not force-push."
    : "5. Do NOT push. The project is configured with `git.skip_push_after_commit: true` — commit only.";

  return [
    "You are running the aif-commit workflow. Follow these steps exactly:",
    "",
    "1. Run `git status` to see the current working tree.",
    "2. Stage ALL changes, including untracked files: run `git add -A` from the project root.",
    "3. Analyze the staged diff (`git diff --cached`) and draft ONE conventional commit message (feat/fix/chore/docs/refactor/test/perf, optional scope, short subject, body if helpful).",
    "4. Create the commit with `git commit -m ...`. Create exactly one commit. Do not amend.",
    pushLine,
    "",
    "Hard rules:",
    "- Never skip git hooks (no --no-verify).",
    "- Never rewrite history (no rebase, no reset --hard, no amend).",
    "- Never add the `Co-Authored-By` trailer.",
    "- If there are no changes to commit after `git add -A`, report that and stop — do NOT create an empty commit.",
  ].join("\n");
}

type CommitPromptTask = {
  id: string;
  title: string;
  description?: string | null;
  planPath?: string | null;
  taskIntent?: TaskIntent | null;
  tags?: string[] | string | null;
  roadmapAlias?: string | null;
};

export function buildReportOnlyCommitPrompt(
  shouldPush: boolean,
  reportArtifactPath: string,
): string {
  const pushLine = shouldPush
    ? "7. After committing, run `git push` on the current branch. Do not force-push."
    : "7. Do NOT push. The project is configured with `git.skip_push_after_commit: true` - commit only.";

  return [
    "You are running the aif-commit workflow for a diagnostic audit/review/discovery report task. Follow these steps exactly:",
    "",
    "1. Run `git status` to see the current working tree.",
    "2. Leave every file except the declared report artifact unstaged. If anything else is staged, unstage it without modifying the worktree.",
    `3. Stage ONLY the declared report artifact: run \`git add -- ${reportArtifactPath}\` from the project root. Do NOT run \`git add -A\`.`,
    "4. Analyze only the staged report diff (`git diff --cached -- <report artifact>`) and draft ONE conventional commit message.",
    "5. Create the commit with `git commit -m ...`. Create exactly one commit. Do not amend.",
    "6. If there are no staged changes for the report artifact after staging it, report that and stop - do NOT create an empty commit and do NOT broad-stage other files.",
    pushLine,
    "",
    "Hard rules:",
    "- Never skip git hooks (no --no-verify).",
    "- Never rewrite history (no rebase, no reset --hard, no amend).",
    "- Never add the `Co-Authored-By` trailer.",
    `- The only path this commit may contain is \`${reportArtifactPath}\`.`,
    "- Leave unrelated changed files dirty and unstaged.",
  ].join("\n");
}

export function buildMissingReportArtifactCommitPrompt(): string {
  return [
    "Do not stage or commit anything.",
    "",
    "This audit/review/discovery task does not declare a concrete expected report artifact path, so broad staging is forbidden.",
    "Run `git status`, report that commit generation is blocked by the missing report artifact declaration, and stop.",
    "",
    "Hard rules:",
    "- Do NOT run `git add -A`.",
    "- Do NOT stage source, config, test, dependency, runtime, or documentation side files.",
    "- Do NOT create an empty commit.",
  ].join("\n");
}

export function buildCommitPromptForTask(
  shouldPush: boolean,
  task: CommitPromptTask | null,
): string {
  if (!task || !isRiskyTask(task)) {
    return buildCommitPrompt(shouldPush);
  }

  const taskIntent = inferTaskIntent({
    taskIntent: task.taskIntent,
    title: task.title,
    description: task.description,
    roadmapAlias: task.roadmapAlias,
    tags: task.tags,
  });
  if (taskIntent === "spike") {
    return buildCommitPrompt(shouldPush);
  }

  const reportArtifactPath = task.description
    ? parseExpectedAuditReportArtifactPath(task.description)
    : null;
  if (!reportArtifactPath) {
    return buildMissingReportArtifactCommitPrompt();
  }

  return buildReportOnlyCommitPrompt(shouldPush, reportArtifactPath);
}

function runGit(projectRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitHasStagedChanges(projectRoot: string): boolean {
  try {
    runGit(projectRoot, ["diff", "--cached", "--quiet"]);
    return false;
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? error.status : null;
    if (status === 1) return true;
    throw error;
  }
}

function gitHasRemote(projectRoot: string): boolean {
  return runGit(projectRoot, ["remote"]).trim().length > 0;
}

function listStagedFiles(projectRoot: string): string[] {
  const output = runGit(projectRoot, ["diff", "--cached", "--name-only", "-z"]);
  return output
    .split("\0")
    .map((path) => path.trim())
    .filter(Boolean);
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function isInternalAifCommitExcludedPath(path: string, task: CommitPromptTask | null): boolean {
  const normalized = normalizeRepoPath(path);
  const taskPlanPath = normalizeRepoPath(task?.planPath ?? ".ai-factory/PLAN.md");
  const name = normalized.split("/").at(-1)?.toLowerCase() ?? "";
  if (normalized === taskPlanPath) return true;
  if (
    normalized.startsWith(".ai-factory/") &&
    (name === "plan.md" || name === "fix_plan.md" || normalized.includes("/plans/"))
  ) {
    return true;
  }
  if (/^docs\/rdpi\/.+\/(?:research|design|plan|result)\.md$/i.test(normalized)) return true;
  if (normalized.startsWith("docs/intake/")) return true;
  if (normalized === "docs/work_status.json" || normalized === "docs/work_index.md") return true;
  return false;
}

function unstageInternalAifArtifacts(projectRoot: string, task: CommitPromptTask | null): void {
  const excluded = listStagedFiles(projectRoot).filter((path) =>
    isInternalAifCommitExcludedPath(path, task),
  );
  if (excluded.length === 0) return;
  runGit(projectRoot, ["restore", "--staged", "--", ...excluded]);
}

function commitTypeForTask(task: CommitPromptTask | null): string {
  if (!task) return "chore";
  const intent = inferTaskIntent({
    taskIntent: task.taskIntent,
    title: task.title,
    description: task.description,
    roadmapAlias: task.roadmapAlias,
    tags: task.tags,
  });
  switch (intent) {
    case "fix":
      return "fix";
    case "audit":
    case "spike":
      return "docs";
    case "tests":
      return "test";
    case "feature":
      return "feat";
    default:
      return "chore";
  }
}

function commitSubjectForTask(task: CommitPromptTask | null): string {
  const type = commitTypeForTask(task);
  const rawTitle = task?.title?.trim() || "update project";
  const normalizedTitle = rawTitle
    .replace(/[`"'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
  const subject = `${type}: ${normalizedTitle || "update project"}`;
  return subject.length <= 72 ? subject : subject.slice(0, 69).trimEnd();
}

function stageCommitContent(input: { projectRoot: string; task: CommitPromptTask | null }): {
  blocked?: string;
} {
  const { projectRoot, task } = input;
  if (!task || !isRiskyTask(task)) {
    runGit(projectRoot, ["add", "-A"]);
    unstageInternalAifArtifacts(projectRoot, task);
    return {};
  }

  const taskIntent = inferTaskIntent({
    taskIntent: task.taskIntent,
    title: task.title,
    description: task.description,
    roadmapAlias: task.roadmapAlias,
    tags: task.tags,
  });
  if (taskIntent === "spike") {
    runGit(projectRoot, ["add", "-A"]);
    unstageInternalAifArtifacts(projectRoot, task);
    return {};
  }

  const reportArtifactPath = task.description
    ? parseExpectedAuditReportArtifactPath(task.description)
    : null;
  if (!reportArtifactPath) {
    return {
      blocked:
        "Commit blocked: risky audit/review/discovery task is missing a declared report artifact path.",
    };
  }

  runGit(projectRoot, ["restore", "--staged", "."]);
  runGit(projectRoot, ["add", "--", reportArtifactPath]);
  return {};
}

/**
 * Fire-and-forget entry point: perform the commit workflow deterministically in
 * the project root. Returns a structured result so the caller can broadcast
 * success/failure over WS. Never throws.
 */
export async function runCommitQuery(input: RunCommitQueryInput): Promise<RunCommitQueryResult> {
  const { projectId, taskId = null } = input;
  const project = findProjectById(projectId);
  if (!project) {
    const msg = `Project not found: ${projectId}`;
    log.error({ projectId }, msg);
    return { ok: false, error: msg };
  }

  const task = taskId ? findTaskById(taskId) : null;
  const executionRoot = task?.worktreePath ?? project.rootPath;
  if (task?.branchName && !task.isFix) {
    // task.branchName is a source-of-truth contract: commit MUST land on the
    // persisted branch or fail loud. `ensureFeatureBranch({switchOnly:true})`
    // can return `skipped` for `git.enabled=false` / non-git projectRoot —
    // letting the commit run on whatever HEAD happens to be. The post-run
    // assertion would catch the drift, but the commit may already have
    // landed by then. Use `restorePersistedBranch` instead, which throws
    // `git_disabled_with_persisted_branch` / `not_a_repo_with_persisted_branch`
    // before any runtime call.
    try {
      restorePersistedBranch({
        projectRoot: executionRoot,
        taskId: task.id,
        persistedBranchName: task.branchName,
      });
    } catch (err) {
      const message = isBranchIsolationError(err)
        ? `Branch isolation failure (${err.kind}): ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
      log.error(
        { err, projectId, taskId, branchName: task.branchName },
        "Commit runtime aborted before start due to branch isolation failure",
      );
      return { ok: false, error: message };
    }
  }

  const { git } = getProjectConfig(executionRoot);
  const shouldPush = git.enabled && !git.skip_push_after_commit;

  log.info(
    {
      projectId,
      taskId,
      projectRoot: executionRoot,
      sourceProjectRoot: project.rootPath,
      skipPushAfterCommit: git.skip_push_after_commit,
      shouldPush,
    },
    "Starting deterministic commit flow",
  );

  try {
    const stageResult = stageCommitContent({ projectRoot: executionRoot, task: task ?? null });
    if (stageResult.blocked) {
      log.warn({ projectId, taskId, reason: stageResult.blocked }, "Commit flow blocked");
      return { ok: false, error: stageResult.blocked };
    }

    if (!gitHasStagedChanges(executionRoot)) {
      log.info({ projectId, taskId }, "Commit flow found no staged changes");
      return { ok: true };
    }

    const subject = commitSubjectForTask(task ?? null);
    const body = taskId ? `AIF task: ${taskId}` : "AIF project commit";
    runGit(executionRoot, ["commit", "-m", subject, "-m", body]);

    if (task?.branchName && !task.isFix) {
      try {
        assertCurrentBranch(executionRoot, task.branchName);
      } catch (err) {
        const message = isBranchIsolationError(err)
          ? `Branch isolation failure (${err.kind}): ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
        log.error(
          { err, projectId, taskId, branchName: task.branchName },
          "Commit runtime aborted after run due to branch drift",
        );
        return { ok: false, error: message };
      }
    }

    const pushed = shouldPush && gitHasRemote(executionRoot);
    if (pushed) {
      runGit(executionRoot, ["push"]);
    }

    log.info(
      {
        projectId,
        taskId,
        shouldPush,
        pushed,
        subject,
      },
      "Deterministic commit flow completed successfully",
    );
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err, projectId, taskId }, "Deterministic commit flow error");
    return { ok: false, error: message };
  }
}
