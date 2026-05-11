import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRunApiRuntimeOneShot = vi.fn();
const mockFindProjectById = vi.fn();
const mockFindTaskById = vi.fn();
const mockGetProjectConfig = vi.fn();
const mockRestorePersistedBranch = vi.fn();
const mockAssertCurrentBranch = vi.fn();

vi.mock("../services/runtime.js", () => ({
  runApiRuntimeOneShot: (...args: unknown[]) => mockRunApiRuntimeOneShot(...args),
}));

vi.mock("@aif/data", () => ({
  findProjectById: (id: string) => mockFindProjectById(id),
  findTaskById: (id: string) => mockFindTaskById(id),
}));

vi.mock("@aif/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared")>();
  return {
    ...actual,
    restorePersistedBranch: (...args: unknown[]) => mockRestorePersistedBranch(...args),
    getProjectConfig: (...args: unknown[]) => mockGetProjectConfig(...args),
    assertCurrentBranch: (...args: unknown[]) => mockAssertCurrentBranch(...args),
  };
});

const { runCommitQuery, buildCommitPrompt, buildCommitPromptForTask } =
  await import("../services/commitGeneration.js");

function gitConfig(skipPush: boolean) {
  return {
    git: {
      enabled: true,
      base_branch: "main",
      create_branches: true,
      branch_prefix: "feature/",
      skip_push_after_commit: skipPush,
    },
  };
}

describe("buildCommitPrompt", () => {
  it("includes git add -A and push instruction when shouldPush=true", () => {
    const prompt = buildCommitPrompt(true);
    expect(prompt).toContain("git add -A");
    expect(prompt).toContain("git push");
    expect(prompt).not.toMatch(/Do NOT push/i);
  });

  it("includes git add -A and explicit no-push when shouldPush=false", () => {
    const prompt = buildCommitPrompt(false);
    expect(prompt).toContain("git add -A");
    expect(prompt).toMatch(/Do NOT push/i);
    expect(prompt).toContain("skip_push_after_commit");
  });

  it("forbids --no-verify, amend, and Co-Authored-By", () => {
    const prompt = buildCommitPrompt(true);
    expect(prompt).toContain("--no-verify");
    expect(prompt).toContain("amend");
    expect(prompt).toContain("Co-Authored-By");
  });

  it("keeps generic task prompts on broad git add -A", () => {
    const prompt = buildCommitPromptForTask(false, {
      id: "feature-task",
      title: "Add checkout button",
      description: "Update the UI and tests.",
      taskIntent: "feature",
    });

    expect(prompt).toContain("git add -A");
    expect(prompt).not.toContain("Stage ONLY the declared report artifact");
  });

  it("keeps spike prompts generic when they do not declare audit report artifacts", () => {
    const prompt = buildCommitPromptForTask(false, {
      id: "spike-task",
      title: "Research checkout options",
      description: "Produce a research artifact and recommendation.",
      taskIntent: "spike",
    });

    expect(prompt).toContain("git add -A");
    expect(prompt).not.toContain("missing report artifact declaration");
  });

  it("builds a report-only prompt for risky tasks with declared report artifacts", () => {
    const prompt = buildCommitPromptForTask(false, {
      id: "audit-task",
      title: "Audit runtime quality",
      description: "Report artifact: audit/runtime-quality.md",
      taskIntent: "audit",
    });

    expect(prompt).toContain("Stage ONLY the declared report artifact");
    expect(prompt).toContain("git add -- audit/runtime-quality.md");
    expect(prompt).toContain("Leave unrelated changed files dirty and unstaged");
    expect(prompt).toContain("Do NOT run `git add -A`");
  });

  it("does not fall back to broad staging when a risky task lacks a report artifact", () => {
    const prompt = buildCommitPromptForTask(false, {
      id: "audit-task-missing-report",
      title: "Audit runtime quality",
      description: "Inspect the runtime quality contract.",
      taskIntent: "audit",
    });

    expect(prompt).toContain("Do not stage or commit anything");
    expect(prompt).toContain("missing report artifact declaration");
    expect(prompt).toContain("Do NOT run `git add -A`");
    expect(prompt).not.toContain("Stage ALL changes");
  });
});

describe("runCommitQuery", () => {
  beforeEach(() => {
    mockRunApiRuntimeOneShot.mockReset();
    mockFindProjectById.mockReset();
    mockFindTaskById.mockReset();
    mockGetProjectConfig.mockReset();
    mockRestorePersistedBranch.mockReset();
    mockAssertCurrentBranch.mockReset();
    mockFindProjectById.mockReturnValue({ id: "p1", rootPath: "/tmp/p1" });
    mockFindTaskById.mockReturnValue(null);
  });

  it("returns ok:false when project not found", async () => {
    mockFindProjectById.mockReturnValue(undefined);
    const res = await runCommitQuery({ projectId: "missing" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Project not found/);
    expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
  });

  it("sends push-enabled prompt when skip_push_after_commit=false", async () => {
    mockGetProjectConfig.mockReturnValue(gitConfig(false));
    mockRunApiRuntimeOneShot.mockResolvedValue({ result: { outputText: "ok" }, context: {} });
    const res = await runCommitQuery({ projectId: "p1", taskId: "t1" });
    expect(res.ok).toBe(true);
    expect(mockRunApiRuntimeOneShot).toHaveBeenCalledTimes(1);
    const callArg = mockRunApiRuntimeOneShot.mock.calls[0][0];
    expect(callArg.workflowKind).toBe("commit");
    expect(callArg.fallbackSlashCommand).toBe("/aif-commit");
    expect(callArg.prompt).toContain("git add -A");
    expect(callArg.prompt).toContain("git push");
    expect(callArg.prompt).not.toMatch(/Do NOT push/i);
  });

  it("restores persisted task branch via restorePersistedBranch before commit runtime starts", async () => {
    mockGetProjectConfig.mockReturnValue(gitConfig(false));
    mockFindTaskById.mockReturnValue({
      id: "t1",
      title: "Task title",
      branchName: "feature/task-title-t1",
      isFix: false,
    });
    mockRunApiRuntimeOneShot.mockResolvedValue({ result: { outputText: "ok" }, context: {} });

    const res = await runCommitQuery({ projectId: "p1", taskId: "t1" });

    expect(res.ok).toBe(true);
    expect(mockRestorePersistedBranch).toHaveBeenCalledWith({
      projectRoot: "/tmp/p1",
      taskId: "t1",
      persistedBranchName: "feature/task-title-t1",
    });
    expect(mockRestorePersistedBranch.mock.invocationCallOrder[0]).toBeLessThan(
      mockRunApiRuntimeOneShot.mock.invocationCallOrder[0],
    );
  });

  it("returns ok:false fail-closed when restorePersistedBranch throws (e.g. git_disabled_with_persisted_branch)", async () => {
    mockGetProjectConfig.mockReturnValue(gitConfig(false));
    mockFindTaskById.mockReturnValue({
      id: "t1",
      title: "Task title",
      branchName: "feature/task-title-t1",
      isFix: false,
    });
    mockRestorePersistedBranch.mockImplementation(() => {
      throw new Error("Branch isolation: config drift, git.enabled=false");
    });

    const res = await runCommitQuery({ projectId: "p1", taskId: "t1" });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/config drift/);
    expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
  });

  it("sends no-push prompt when skip_push_after_commit=true", async () => {
    mockGetProjectConfig.mockReturnValue(gitConfig(true));
    mockRunApiRuntimeOneShot.mockResolvedValue({ result: { outputText: "ok" }, context: {} });
    const res = await runCommitQuery({ projectId: "p1" });
    expect(res.ok).toBe(true);
    const callArg = mockRunApiRuntimeOneShot.mock.calls[0][0];
    expect(callArg.prompt).toMatch(/Do NOT push/i);
    expect(callArg.prompt).not.toMatch(/\brun `git push`/);
  });

  it("uses report-only staging in runtime prompt for risky report tasks", async () => {
    mockGetProjectConfig.mockReturnValue(gitConfig(true));
    mockFindTaskById.mockReturnValue({
      id: "t-audit",
      title: "Audit runtime quality",
      description: "Report artifact: audit/runtime-quality.md",
      taskIntent: "audit",
      branchName: null,
      isFix: false,
    });
    mockRunApiRuntimeOneShot.mockResolvedValue({ result: { outputText: "ok" }, context: {} });

    const res = await runCommitQuery({ projectId: "p1", taskId: "t-audit" });

    expect(res.ok).toBe(true);
    const callArg = mockRunApiRuntimeOneShot.mock.calls[0][0];
    expect(callArg.prompt).toContain("git add -- audit/runtime-quality.md");
    expect(callArg.prompt).toContain("Leave unrelated changed files dirty and unstaged");
    expect(callArg.prompt).toContain("Do NOT run `git add -A`");
  });

  it("blocks broad staging in runtime prompt for risky tasks missing a report artifact", async () => {
    mockGetProjectConfig.mockReturnValue(gitConfig(true));
    mockFindTaskById.mockReturnValue({
      id: "t-audit-missing-report",
      title: "Audit runtime quality",
      description: "Inspect runtime quality.",
      taskIntent: "audit",
      branchName: null,
      isFix: false,
    });
    mockRunApiRuntimeOneShot.mockResolvedValue({ result: { outputText: "blocked" }, context: {} });

    const res = await runCommitQuery({ projectId: "p1", taskId: "t-audit-missing-report" });

    expect(res.ok).toBe(true);
    const callArg = mockRunApiRuntimeOneShot.mock.calls[0][0];
    expect(callArg.prompt).toContain("Do not stage or commit anything");
    expect(callArg.prompt).not.toContain("Stage ALL changes");
    expect(callArg.prompt).toContain("Do NOT run `git add -A`");
  });

  it("returns ok:false with error message when runtime throws", async () => {
    mockGetProjectConfig.mockReturnValue(gitConfig(false));
    mockRunApiRuntimeOneShot.mockRejectedValue(new Error("boom"));
    const res = await runCommitQuery({ projectId: "p1" });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("boom");
  });

  it("returns ok:false when subagent switched HEAD to a different branch (post-run drift)", async () => {
    mockGetProjectConfig.mockReturnValue(gitConfig(false));
    mockFindTaskById.mockReturnValue({
      id: "t1",
      title: "Task title",
      branchName: "feature/task-title-t1",
      isFix: false,
    });
    mockRunApiRuntimeOneShot.mockResolvedValue({ result: { outputText: "ok" }, context: {} });
    mockAssertCurrentBranch.mockImplementation(() => {
      throw new Error(
        "Branch drift detected: expected HEAD=feature/task-title-t1, actual HEAD=main.",
      );
    });

    const res = await runCommitQuery({ projectId: "p1", taskId: "t1" });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Branch drift detected/);
    expect(mockAssertCurrentBranch).toHaveBeenCalledWith("/tmp/p1", "feature/task-title-t1");
    expect(mockAssertCurrentBranch.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockRunApiRuntimeOneShot.mock.invocationCallOrder[0],
    );
  });
});
