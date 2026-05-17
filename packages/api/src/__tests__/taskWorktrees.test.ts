import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTaskWorktreePath } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

process.env.AIF_TASK_WORKTREE_LARGE_WARNING_BYTES = "1";

const testDb = { current: createTestDb() };

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

const { createProject, createTask, findTaskById, setTaskFields } = await import("@aif/data");
const { archiveTaskWorktree, deleteTaskWorktree, inspectTaskWorktree, TaskWorktreeError } =
  await import("../services/taskWorktrees.js");

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).toString().trim();
}

function createGitProject(): { tempRoot: string; projectRoot: string } {
  const tempRoot = mkdtempSync(join(tmpdir(), "aif-worktree-test-"));
  const projectRoot = join(tempRoot, "project");
  mkdirSync(projectRoot, { recursive: true });
  git(projectRoot, ["init"]);
  git(projectRoot, ["config", "user.email", "test@example.com"]);
  git(projectRoot, ["config", "user.name", "Test User"]);
  writeFileSync(join(projectRoot, "README.md"), "hello\n", "utf8");
  git(projectRoot, ["add", "README.md"]);
  git(projectRoot, ["commit", "-m", "init"]);
  return { tempRoot, projectRoot };
}

function createVerifiedTaskWorktree(input: {
  projectRoot: string;
  branchName: string;
  title?: string;
  worktreeBranchName?: string;
}) {
  const project = createProject({ name: "Project", rootPath: input.projectRoot })!;
  const task = createTask({
    projectId: project.id,
    title: input.title ?? "Worktree task",
    description: "",
  })!;
  const worktreePath = buildTaskWorktreePath(input.projectRoot, input.branchName, task.id);
  git(input.projectRoot, [
    "worktree",
    "add",
    "-b",
    input.worktreeBranchName ?? input.branchName,
    worktreePath,
    "HEAD",
  ]);
  setTaskFields(task.id, {
    status: "verified",
    branchName: input.branchName,
    worktreePath,
  });
  return { project, task: findTaskById(task.id)!, worktreePath };
}

describe("task worktree lifecycle service", () => {
  let tempRoots: string[] = [];

  beforeEach(() => {
    testDb.current = createTestDb();
    tempRoots = [];
  });

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks cleanup without verified task metadata", () => {
    const { tempRoot, projectRoot } = createGitProject();
    tempRoots.push(tempRoot);
    const project = createProject({ name: "Project", rootPath: projectRoot })!;
    const task = createTask({ projectId: project.id, title: "No metadata", description: "" })!;

    const inspection = inspectTaskWorktree(task.id);
    expect(inspection.eligible).toBe(false);
    expect(inspection.warnings).toEqual(
      expect.arrayContaining(["missing_worktree_path", "missing_branch_name", "task_not_verified"]),
    );
    expect(() => archiveTaskWorktree(task.id)).toThrow(TaskWorktreeError);
    expect(findTaskById(task.id)!.agentActivityLog).toContain("Task worktree archive blocked");
  });

  it("rejects project-root alias and unexpected paths", () => {
    const { tempRoot, projectRoot } = createGitProject();
    tempRoots.push(tempRoot);
    const project = createProject({ name: "Project", rootPath: projectRoot })!;
    const task = createTask({ projectId: project.id, title: "Unsafe", description: "" })!;
    setTaskFields(task.id, {
      status: "verified",
      branchName: "feature/unsafe",
      worktreePath: projectRoot,
    });

    const inspection = inspectTaskWorktree(task.id);
    expect(inspection.warnings).toEqual(
      expect.arrayContaining(["project_root_alias", "unexpected_path"]),
    );
    expect(() => deleteTaskWorktree(task.id)).toThrow(TaskWorktreeError);
    expect(findTaskById(task.id)!.agentActivityLog).toContain("Task worktree delete blocked");
  });

  it("rejects paths inside or containing the project root", () => {
    const { tempRoot, projectRoot } = createGitProject();
    tempRoots.push(tempRoot);
    const project = createProject({ name: "Project", rootPath: projectRoot })!;

    const insideTask = createTask({
      projectId: project.id,
      title: "Inside root",
      description: "",
    })!;
    const insidePath = join(projectRoot, "nested-worktree");
    mkdirSync(insidePath, { recursive: true });
    setTaskFields(insideTask.id, {
      status: "verified",
      branchName: "feature/inside-root",
      worktreePath: insidePath,
    });
    expect(inspectTaskWorktree(insideTask.id).warnings).toEqual(
      expect.arrayContaining(["project_root_alias", "unexpected_path"]),
    );
    expect(() => deleteTaskWorktree(insideTask.id)).toThrow(TaskWorktreeError);

    const parentTask = createTask({
      projectId: project.id,
      title: "Parent root",
      description: "",
    })!;
    setTaskFields(parentTask.id, {
      status: "verified",
      branchName: "feature/parent-root",
      worktreePath: tempRoot,
    });
    expect(inspectTaskWorktree(parentTask.id).warnings).toEqual(
      expect.arrayContaining(["project_root_alias", "unexpected_path"]),
    );
    expect(() => archiveTaskWorktree(parentTask.id)).toThrow(TaskWorktreeError);
  });

  it("rejects realpath aliases to the project root when symlinks are supported", () => {
    const { tempRoot, projectRoot } = createGitProject();
    tempRoots.push(tempRoot);
    const project = createProject({ name: "Project", rootPath: projectRoot })!;
    const task = createTask({ projectId: project.id, title: "Root symlink", description: "" })!;
    const aliasPath = join(tempRoot, "project-root-alias");
    try {
      symlinkSync(projectRoot, aliasPath, "dir");
    } catch {
      return;
    }
    setTaskFields(task.id, {
      status: "verified",
      branchName: "feature/root-alias",
      worktreePath: aliasPath,
    });

    const inspection = inspectTaskWorktree(task.id);
    expect(inspection.warnings).toEqual(
      expect.arrayContaining(["project_root_alias", "unexpected_path"]),
    );
    expect(() => archiveTaskWorktree(task.id)).toThrow(TaskWorktreeError);
  });

  it("rejects non-git expected paths", () => {
    const { tempRoot, projectRoot } = createGitProject();
    tempRoots.push(tempRoot);
    const project = createProject({ name: "Project", rootPath: projectRoot })!;
    const task = createTask({ projectId: project.id, title: "Plain dir", description: "" })!;
    const branchName = "feature/plain";
    const worktreePath = buildTaskWorktreePath(projectRoot, branchName, task.id);
    mkdirSync(worktreePath, { recursive: true });
    setTaskFields(task.id, { status: "verified", branchName, worktreePath });

    const inspection = inspectTaskWorktree(task.id);
    expect(inspection.warnings).toEqual(
      expect.arrayContaining(["non_git_path", "missing_git_worktree_registry_entry"]),
    );
    expect(() => archiveTaskWorktree(task.id)).toThrow(TaskWorktreeError);
  });

  it("rejects branch and git worktree registry mismatch", () => {
    const { tempRoot, projectRoot } = createGitProject();
    tempRoots.push(tempRoot);
    const { task } = createVerifiedTaskWorktree({
      projectRoot,
      branchName: "feature/expected",
      worktreeBranchName: "feature/actual",
    });

    const inspection = inspectTaskWorktree(task.id);
    expect(inspection.warnings).toEqual(
      expect.arrayContaining(["branch_mismatch", "registry_branch_mismatch"]),
    );
    expect(() => deleteTaskWorktree(task.id)).toThrow(TaskWorktreeError);
  });

  it("rejects archive destination collisions", () => {
    const { tempRoot, projectRoot } = createGitProject();
    tempRoots.push(tempRoot);
    const { task, worktreePath } = createVerifiedTaskWorktree({
      projectRoot,
      branchName: "feature/collision",
    });
    const destination = join(
      tempRoot,
      "project-task-worktree-archive",
      worktreePath.split(/[\\/]/).at(-1)!,
    );
    mkdirSync(destination, { recursive: true });

    expect(() => archiveTaskWorktree(task.id)).toThrow(TaskWorktreeError);
    expect(findTaskById(task.id)!.agentActivityLog).toContain("archive blocked");
  });

  it("keeps large disk usage advisory while allowing verified cleanup", () => {
    const { tempRoot, projectRoot } = createGitProject();
    tempRoots.push(tempRoot);
    const { task, worktreePath } = createVerifiedTaskWorktree({
      projectRoot,
      branchName: "feature/large-advisory",
    });
    writeFileSync(join(worktreePath, "large.txt"), "large enough for test threshold\n", "utf8");
    git(worktreePath, ["add", "large.txt"]);
    git(worktreePath, ["commit", "-m", "add large advisory fixture"]);

    const inspection = inspectTaskWorktree(task.id);
    expect(inspection.eligible).toBe(true);
    expect(inspection.warnings).toEqual(expect.arrayContaining(["large_disk_usage"]));

    const archived = archiveTaskWorktree(task.id);
    expect(archived.action).toBe("archive");
    expect(archived.eligible).toBe(true);
    expect(archived.warnings).toEqual(expect.arrayContaining(["large_disk_usage"]));

    const deleted = deleteTaskWorktree(task.id);
    expect(deleted.action).toBe("delete");
    expect(deleted.eligible).toBe(true);
    expect(deleted.warnings).toEqual(expect.arrayContaining(["large_disk_usage"]));
  });

  it("archives then deletes an archived verified worktree using git worktree operations", () => {
    const { tempRoot, projectRoot } = createGitProject();
    tempRoots.push(tempRoot);
    const { task, worktreePath } = createVerifiedTaskWorktree({
      projectRoot,
      branchName: "feature/archive-delete",
    });

    const archived = archiveTaskWorktree(task.id);
    expect(archived.action).toBe("archive");
    expect(archived.archivedPath).toBeTruthy();
    expect(existsSync(worktreePath)).toBe(false);
    expect(existsSync(archived.archivedPath!)).toBe(true);
    expect(findTaskById(task.id)!.worktreePath).toBe(archived.archivedPath);

    const deleted = deleteTaskWorktree(task.id);
    expect(deleted.action).toBe("delete");
    expect(existsSync(archived.archivedPath!)).toBe(false);
    expect(findTaskById(task.id)!.agentActivityLog).toContain("Task worktree deleted");
  });
});
