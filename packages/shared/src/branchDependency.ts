import { execFileSync } from "node:child_process";
import {
  branchExists,
  isGitRepo,
  projectUsesSharedBranchIsolation,
  resolveProjectBaseBranch,
} from "./gitIsolation.js";
import type { TaskStatus } from "./types.js";

export interface SequentialBranchDependencyTask {
  id: string;
  projectId: string;
  status: TaskStatus;
  position: number;
  branchName?: string | null;
  worktreePath?: string | null;
}

export interface SequentialBranchDependencyBlocker {
  code: "unintegrated_branch_dependency" | "missing_branch_dependency" | "missing_base_branch";
  taskId: string;
  branchName: string | null;
  baseBranch: string | null;
  message: string;
}

const TERMINAL_INTEGRATION_STATUSES = new Set<TaskStatus>(["done", "verified"]);

function gitIsAncestor(projectRoot: string, ancestor: string, descendant: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function findSequentialBranchDependencyBlocker(input: {
  projectRoot: string;
  nextTask: SequentialBranchDependencyTask;
  projectTasks: SequentialBranchDependencyTask[];
}): SequentialBranchDependencyBlocker | null {
  const { projectRoot, nextTask, projectTasks } = input;
  if (!isGitRepo(projectRoot) || !projectUsesSharedBranchIsolation(projectRoot)) return null;
  if (nextTask.worktreePath) return null;

  const baseBranch = resolveProjectBaseBranch(projectRoot);
  if (!branchExists(projectRoot, baseBranch)) {
    return {
      code: "missing_base_branch",
      taskId: nextTask.id,
      branchName: null,
      baseBranch,
      message: `sequential_branch_dependency_blocked: base branch ${baseBranch} is missing; cannot prove prior task branches are integrated before starting ${nextTask.id}.`,
    };
  }

  const priorTerminalBranchTasks = projectTasks
    .filter(
      (task) =>
        task.projectId === nextTask.projectId &&
        task.position < nextTask.position &&
        TERMINAL_INTEGRATION_STATUSES.has(task.status) &&
        Boolean(task.branchName) &&
        !task.worktreePath,
    )
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  for (const task of priorTerminalBranchTasks) {
    const branchName = task.branchName?.trim() ?? "";
    if (!branchName || branchName === baseBranch) continue;
    if (!branchExists(projectRoot, branchName)) {
      return {
        code: "missing_branch_dependency",
        taskId: task.id,
        branchName,
        baseBranch,
        message: `sequential_branch_dependency_blocked: prior task ${task.id} completed on missing branch ${branchName}; cannot start ${nextTask.id} until the branch is restored or the task is explicitly reconciled.`,
      };
    }
    if (!gitIsAncestor(projectRoot, branchName, baseBranch)) {
      return {
        code: "unintegrated_branch_dependency",
        taskId: task.id,
        branchName,
        baseBranch,
        message: `sequential_branch_dependency_blocked: prior task ${task.id} completed on branch ${branchName}, but that branch is not merged into base ${baseBranch}; merge or reconcile it before starting ${nextTask.id}.`,
      };
    }
  }

  return null;
}
