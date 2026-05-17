import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import {
  appendTaskActivityLog,
  findProjectById,
  findTaskById,
  setTaskFields,
  type ProjectRow,
  type TaskRow,
} from "@aif/data";
import { buildTaskWorktreePath, isGitRepo, logger } from "@aif/shared";

const log = logger("task-worktrees");
const DEFAULT_LARGE_WORKTREE_WARNING_BYTES = 2 * 1024 * 1024 * 1024;

function largeWorktreeWarningBytes(): number {
  const configured = Number(
    process.env.AIF_TASK_WORKTREE_LARGE_WARNING_BYTES ?? DEFAULT_LARGE_WORKTREE_WARNING_BYTES,
  );
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_LARGE_WORKTREE_WARNING_BYTES;
}

export interface TaskWorktreeInspection {
  taskId: string;
  path: string | null;
  branchName: string | null;
  exists: boolean;
  sizeBytes: number | null;
  eligible: boolean;
  warnings: string[];
}

export interface TaskWorktreeCleanupResult extends TaskWorktreeInspection {
  action: "archive" | "delete";
  archivedPath?: string;
  deletedPath?: string;
}

export class TaskWorktreeError extends Error {
  readonly status: number;
  readonly warnings: string[];

  constructor(message: string, warnings: string[], status = 400) {
    super(message);
    this.name = "TaskWorktreeError";
    this.status = status;
    this.warnings = warnings;
  }
}

function git(cwd: string, args: string[]): string {
  const options: ExecFileSyncOptionsWithStringEncoding = {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  };
  return execFileSync("git", args, options).toString().trim();
}

function safeRealpath(path: string): string | null {
  try {
    return realpathSync.native(path);
  } catch {
    return null;
  }
}

function isSameOrInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isUnsafeRootRelationship(projectRoot: string, targetPath: string): boolean {
  const projectResolved = resolve(projectRoot);
  const targetResolved = resolve(targetPath);
  if (isSameOrInside(targetResolved, projectResolved)) return true;
  if (isSameOrInside(projectResolved, targetResolved)) return true;

  const projectReal = safeRealpath(projectResolved);
  const targetReal = safeRealpath(targetResolved);
  if (!projectReal || !targetReal) return false;
  if (isSameOrInside(targetReal, projectReal)) return true;
  return isSameOrInside(projectReal, targetReal);
}

function archiveRoot(projectRoot: string): string {
  return resolve(dirname(projectRoot), `${basename(projectRoot)}-task-worktree-archive`);
}

function expectedArchivePath(projectRoot: string, branchName: string, taskId: string): string {
  return resolve(
    archiveRoot(projectRoot),
    basename(buildTaskWorktreePath(projectRoot, branchName, taskId)),
  );
}

function pathEquals(a: string, b: string): boolean {
  return resolve(a).toLocaleLowerCase() === resolve(b).toLocaleLowerCase();
}

function isExpectedPath(task: TaskRow, project: ProjectRow, targetPath: string): boolean {
  if (!task.branchName) return false;
  const active = buildTaskWorktreePath(project.rootPath, task.branchName, task.id);
  const archived = expectedArchivePath(project.rootPath, task.branchName, task.id);
  return pathEquals(targetPath, active) || pathEquals(targetPath, archived);
}

function getDirectorySizeBytes(path: string): number {
  const stat = lstatSync(path);
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of readdirSync(path)) {
    total += getDirectorySizeBytes(resolve(path, entry));
  }
  return total;
}

function findRegisteredWorktree(
  projectRoot: string,
  targetPath: string,
): { path: string; branchName: string | null } | null {
  const output = git(projectRoot, ["worktree", "list", "--porcelain"]);
  const targetReal = safeRealpath(targetPath) ?? resolve(targetPath);
  for (const block of output.split(/\n\s*\n/)) {
    let worktreePath: string | null = null;
    let branchName: string | null = null;
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length).trim();
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length).trim();
        branchName = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
      }
    }
    if (!worktreePath) continue;
    const worktreeReal = safeRealpath(worktreePath) ?? resolve(worktreePath);
    if (pathEquals(worktreeReal, targetReal)) {
      return { path: worktreePath, branchName };
    }
  }
  return null;
}

function appendAttempt(taskId: string, message: string): void {
  appendTaskActivityLog(taskId, `[${new Date().toISOString()}] ${message}`);
}

function isBlockingWarning(warning: string): boolean {
  return warning !== "large_disk_usage" && warning !== "disk_usage_unavailable";
}

function inspect(task: TaskRow, project: ProjectRow): TaskWorktreeInspection {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const addBlocker = (warning: string): void => {
    warnings.push(warning);
    blockers.push(warning);
  };
  const addWarning = (warning: string): void => {
    warnings.push(warning);
  };
  const targetPath = task.worktreePath;
  const branchName = task.branchName;
  let sizeBytes: number | null = null;
  let exists = false;

  if (!targetPath) addBlocker("missing_worktree_path");
  if (!branchName) addBlocker("missing_branch_name");
  if (task.status !== "verified") addBlocker("task_not_verified");

  if (targetPath) {
    exists = existsSync(targetPath);
    if (!exists) {
      addBlocker("missing_path");
    } else {
      if (isUnsafeRootRelationship(project.rootPath, targetPath)) addBlocker("project_root_alias");
      if (!isExpectedPath(task, project, targetPath)) addBlocker("unexpected_path");
      if (!isGitRepo(targetPath)) addBlocker("non_git_path");
      if (branchName) {
        try {
          const current = git(targetPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
          if (current !== branchName) addBlocker("branch_mismatch");
        } catch {
          addBlocker("branch_unreadable");
        }
        try {
          const registered = findRegisteredWorktree(project.rootPath, targetPath);
          if (!registered) {
            addBlocker("missing_git_worktree_registry_entry");
          } else if (registered.branchName !== branchName) {
            addBlocker("registry_branch_mismatch");
          }
        } catch {
          addBlocker("git_worktree_registry_unreadable");
        }
      }
      if (blockers.length === 0) {
        try {
          sizeBytes = getDirectorySizeBytes(targetPath);
          if (sizeBytes >= largeWorktreeWarningBytes()) addWarning("large_disk_usage");
        } catch {
          addWarning("disk_usage_unavailable");
        }
      }
    }
  }

  const blockingWarnings = warnings.filter(isBlockingWarning);
  return {
    taskId: task.id,
    path: targetPath,
    branchName,
    exists,
    sizeBytes,
    eligible: blockingWarnings.length === 0,
    warnings,
  };
}

function loadTaskAndProject(taskId: string): { task: TaskRow; project: ProjectRow } {
  const task = findTaskById(taskId);
  if (!task) throw new TaskWorktreeError("Task not found", ["task_not_found"], 404);
  const project = findProjectById(task.projectId);
  if (!project) throw new TaskWorktreeError("Project not found", ["project_not_found"], 404);
  return { task, project };
}

function requireCleanupSafe(task: TaskRow, project: ProjectRow): TaskWorktreeInspection {
  const result = inspect(task, project);
  if (!result.eligible || !task.worktreePath || !task.branchName) {
    throw new TaskWorktreeError("Task worktree cleanup is not safe", result.warnings);
  }
  return result;
}

export function inspectTaskWorktree(taskId: string): TaskWorktreeInspection {
  const { task, project } = loadTaskAndProject(taskId);
  return inspect(task, project);
}

export function archiveTaskWorktree(taskId: string): TaskWorktreeCleanupResult {
  const { task, project } = loadTaskAndProject(taskId);
  appendAttempt(
    task.id,
    `Task worktree archive attempt: path=${task.worktreePath ?? ""} branch=${task.branchName ?? ""}`,
  );
  let inspection: TaskWorktreeInspection;
  try {
    inspection = requireCleanupSafe(task, project);
  } catch (err) {
    if (err instanceof TaskWorktreeError) {
      appendAttempt(task.id, `Task worktree archive blocked: ${err.warnings.join(", ")}`);
    }
    throw err;
  }
  const destination = expectedArchivePath(project.rootPath, task.branchName!, task.id);
  const destinationWarnings: string[] = [];
  if (existsSync(destination)) destinationWarnings.push("archive_destination_collision");
  if (isUnsafeRootRelationship(project.rootPath, destination)) {
    destinationWarnings.push("archive_destination_project_root_alias");
  }
  if (destinationWarnings.length > 0) {
    appendAttempt(task.id, `Task worktree archive blocked: ${destinationWarnings.join(", ")}`);
    throw new TaskWorktreeError("Task worktree archive destination is not safe", [
      ...inspection.warnings,
      ...destinationWarnings,
    ]);
  }

  mkdirSync(dirname(destination), { recursive: true });
  try {
    git(project.rootPath, ["worktree", "move", task.worktreePath!, destination]);
    setTaskFields(task.id, { worktreePath: destination, updatedAt: new Date().toISOString() });
    appendAttempt(
      task.id,
      `Task worktree archived: from=${task.worktreePath} to=${destination} branch=${task.branchName} sizeBytes=${inspection.sizeBytes ?? ""}`,
    );
    return {
      ...inspect({ ...task, worktreePath: destination }, project),
      action: "archive",
      archivedPath: destination,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ taskId, err }, "Task worktree archive failed");
    appendAttempt(task.id, `Task worktree archive failed: ${message}`);
    throw new TaskWorktreeError("Task worktree archive failed", ["archive_failed"]);
  }
}

export function deleteTaskWorktree(taskId: string): TaskWorktreeCleanupResult {
  const { task, project } = loadTaskAndProject(taskId);
  appendAttempt(
    task.id,
    `Task worktree delete attempt: path=${task.worktreePath ?? ""} branch=${task.branchName ?? ""}`,
  );
  let inspection: TaskWorktreeInspection;
  try {
    inspection = requireCleanupSafe(task, project);
  } catch (err) {
    if (err instanceof TaskWorktreeError) {
      appendAttempt(task.id, `Task worktree delete blocked: ${err.warnings.join(", ")}`);
    }
    throw err;
  }
  try {
    git(project.rootPath, ["worktree", "remove", task.worktreePath!]);
    appendAttempt(
      task.id,
      `Task worktree deleted: path=${task.worktreePath} branch=${task.branchName} sizeBytes=${inspection.sizeBytes ?? ""}`,
    );
    return {
      ...inspection,
      exists: false,
      action: "delete",
      deletedPath: task.worktreePath!,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ taskId, err }, "Task worktree delete failed");
    appendAttempt(task.id, `Task worktree delete failed: ${message}`);
    throw new TaskWorktreeError("Task worktree delete failed", ["delete_failed"]);
  }
}
