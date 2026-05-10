import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projects, taskComments, tasks } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };
const queryMock = vi.fn();
(globalThis as { __AIF_CLAUDE_QUERY_MOCK__?: typeof queryMock }).__AIF_CLAUDE_QUERY_MOCK__ =
  queryMock;

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
}));

const { runImplementer } = await import("../subagents/implementer.js");
const { createRoadmapBatchContract, updateRoadmapBatchArtifactState } = await import("@aif/data");

function streamSuccess(result: string): AsyncIterable<{
  type: "result";
  subtype: "success";
  result: string;
}> {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: "result", subtype: "success", result };
    },
  };
}

describe("runImplementer rework behavior", () => {
  let projectRoot: string;

  beforeEach(() => {
    (globalThis as { __AIF_CLAUDE_QUERY_MOCK__?: typeof queryMock }).__AIF_CLAUDE_QUERY_MOCK__ =
      queryMock;
    testDb.current = createTestDb();
    queryMock.mockReset();
    queryMock.mockReturnValue(streamSuccess("Implementation done"));
    projectRoot = mkdtempSync(join(tmpdir(), "aif-implementer-test-"));

    testDb.current
      .insert(projects)
      .values({
        id: "project-1",
        name: "Test",
        rootPath: projectRoot,
      })
      .run();
  });

  it("skips execution when all plan tasks are complete and rework is not requested", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-1",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [x] Task 1: Done",
        reworkRequested: false,
      })
      .run();

    await runImplementer("task-1", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
    expect(updatedTask?.implementationLog).toContain("No pending tasks detected in plan");
  });

  it("runs the runtime for diagnostic-only fallback plans instead of writing a local report", async () => {
    const db = testDb.current;
    queryMock.mockReturnValueOnce(streamSuccess("Implementation done"));
    writeFileSync(join(projectRoot, "README.md"), "# Test project\n");
    writeFileSync(join(projectRoot, "pyproject.toml"), '[project]\nname = "test"\n');
    const description =
      "Diagnostic only. Do not implement fixes. Produce a committed report at: audit/2026-05-08-initial-audit.md.";

    db.insert(tasks)
      .values({
        id: "task-diagnostic-report",
        projectId: "project-1",
        title: "Audit",
        description,
        status: "implementing",
        plan: [
          "## Diagnostic-only plan",
          "",
          "Report artifact: `audit/2026-05-08-initial-audit.md`",
          "",
          "- [ ] Keep the run diagnostic-only: do not implement fixes; do not patch code; do not modify source files; do not create child implementation tasks.",
          "- [ ] Inspect the repository evidence needed for `audit/2026-05-08-initial-audit.md` and cite exact existing file paths for every finding.",
          "- [ ] Create or update `audit/2026-05-08-initial-audit.md` with finding id, severity, evidence, risk, proposed fix, confidence, and verification command or manual check.",
        ].join("\n"),
      })
      .run();

    await runImplementer("task-diagnostic-report", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const implementCall = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(implementCall.prompt).toContain("/aif-implement @.ai-factory/PLAN.md");
    expect(implementCall.prompt).toContain("Plan path:\n@.ai-factory/PLAN.md");
    expect(implementCall.prompt).toContain(
      "For diagnostic-only audit/review/discovery/validation plans",
    );
    expect(implementCall.prompt).toContain("git log -1 --name-only --oneline");
    const reportPath = join(projectRoot, "audit/2026-05-08-initial-audit.md");
    expect(existsSync(reportPath)).toBe(false);

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-diagnostic-report")).get();
    expect(updatedTask?.implementationLog).toContain("Implementation done");
    expect(updatedTask?.implementationLog).not.toContain(
      "Deterministic diagnostic report generated",
    );
    expect(updatedTask?.plan).toContain("- [ ] Keep the run diagnostic-only");
  });

  it("injects validated audit report artifacts into synthesis prompts", async () => {
    const db = testDb.current;
    queryMock.mockReturnValueOnce(streamSuccess("Synthesis done"));
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(
      join(projectRoot, "audit", "config.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` identifies project docs.",
        "Risk: Configuration drift can be missed.",
        "Verification: Command `git log -1 --name-only --oneline` output included audit/config.md.",
      ].join("\n"),
      "utf8",
    );

    db.insert(tasks)
      .values({
        id: "task-synthesis-report",
        projectId: "project-1",
        title: "Audit configuration",
        description: "Report artifact: audit/config.md",
        taskIntent: "audit",
        status: "done",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-synthesis",
        projectId: "project-1",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Synthesize validated audit reports",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-synthesis-report", "task-synthesis"],
      synthesisTaskId: "task-synthesis",
      artifacts: [
        {
          taskId: "task-synthesis-report",
          role: "report",
          artifactPath: "audit/config.md",
          projectRoot,
        },
        {
          taskId: "task-synthesis",
          role: "synthesis",
          artifactPath: "audit/summary.md",
          projectRoot,
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-synthesis-report",
      state: "valid",
      failureFamily: null,
    });

    await runImplementer("task-synthesis", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("<<<VALIDATED_AUDIT_BATCH_INPUTS");
    expect(call.prompt).toContain("--- artifact: audit/config.md");
    expect(call.prompt).toContain("Evidence: `README.md:1` identifies project docs.");
    expect(call.prompt).toContain("use those exact validated report contents");
  });

  it("reads validated audit report artifacts from producer branches for synthesis prompts", async () => {
    const db = testDb.current;
    queryMock.mockReturnValueOnce(streamSuccess("Synthesis done"));
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "initial", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "audit/config-report"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(
      join(projectRoot, "audit", "config.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` identifies project docs from the producer branch.",
        "Risk: Synthesis can miss branch-only reports.",
        "Verification: Command `git log -1 --name-only --oneline` output included audit/config.md.",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/config.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "main"], { cwd: projectRoot, stdio: "ignore" });
    expect(existsSync(join(projectRoot, "audit", "config.md"))).toBe(false);

    db.insert(tasks)
      .values({
        id: "task-branch-report",
        projectId: "project-1",
        title: "Audit configuration",
        description: "Report artifact: audit/config.md",
        taskIntent: "audit",
        status: "done",
        branchName: "audit/config-report",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-branch-synthesis",
        projectId: "project-1",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Synthesize validated audit reports",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-branch-report", "task-branch-synthesis"],
      synthesisTaskId: "task-branch-synthesis",
      artifacts: [
        {
          taskId: "task-branch-report",
          role: "report",
          artifactPath: "audit/config.md",
          branchName: "audit/config-report",
          projectRoot,
        },
        {
          taskId: "task-branch-synthesis",
          role: "synthesis",
          artifactPath: "audit/summary.md",
          projectRoot,
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-branch-report",
      state: "valid",
      failureFamily: null,
    });

    await runImplementer("task-branch-synthesis", projectRoot);

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("source: audit/config-report:audit/config.md");
    expect(call.prompt).toContain("producer branch");
    expect(call.prompt).toContain("use those exact validated report contents");
  });

  it("surfaces a loud rework header and injects the latest comment when rework is requested", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-2",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [x] Done",
        reworkRequested: true,
        useSubagents: true,
        reviewComments: "## Blocking Findings\n- [finding-1] code_review | Fix the retry path",
        autoReviewStateJson: JSON.stringify({
          strategy: "closure_first",
          iteration: 2,
          findings: [
            {
              id: "finding-1",
              source: "code_review",
              text: "Fix the retry path",
            },
          ],
        }),
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-1",
        taskId: "task-2",
        author: "agent",
        message: "agent-msg",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-2",
        taskId: "task-2",
        author: "human",
        message: "first-human",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:01.000Z",
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-3",
        taskId: "task-2",
        author: "human",
        message: "latest-human",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:02.000Z",
      })
      .run();

    await runImplementer("task-2", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };

    // Rework header is the very first content of the coordinator prompt
    const firstLine = call.prompt.split("\n")[0] ?? "";
    expect(firstLine.startsWith("====")).toBe(true);
    expect(call.prompt).toContain("REWORK REQUEST — THIS IS THE PRIMARY TASK");
    expect(call.prompt).toContain("<<<REWORK_COMMENT");
    expect(call.prompt).toContain("\nREWORK_COMMENT\n");
    expect(call.prompt).toContain("<<<FULL_REVIEW_COMMENTS");
    expect(call.prompt).toContain("## Blocking Findings");
    expect(call.prompt).toContain("<<<BLOCKING_FINDINGS_SNAPSHOT");
    expect(call.prompt).toContain("strategy: closure_first");
    expect(call.prompt).toContain("- [finding-1] code_review | Fix the retry path");
    expect(call.prompt).toContain("Rework handling protocol:");
    expect(call.prompt).toContain("blocking finding IDs from BLOCKING_FINDINGS_SNAPSHOT");

    // Coordinator lead line is still present further down the prompt
    expect(call.prompt).toContain("Implement the task using the provided plan.");
    expect(call.prompt).toContain("Plan path:\n@.ai-factory/PLAN.md");
    expect(call.prompt).toContain("Rework mode: true");
    expect(call.prompt).toContain("message: latest-human");
    expect(call.prompt).not.toContain("message: first-human");
    expect(call.prompt).not.toContain("message: agent-msg");

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-2")).get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toBe("Implementation done");
  });

  it("does NOT resume a stored session when rework is requested", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-rework-no-resume",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [x] Done",
        reworkRequested: true,
        sessionId: "old-session-abc",
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-rework-no-resume",
        taskId: "task-rework-no-resume",
        author: "human",
        message: "please fix the login bug",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:01.000Z",
      })
      .run();

    await runImplementer("task-rework-no-resume", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as {
      prompt: string;
      options: { resume?: string };
    };
    expect(call.options.resume).toBeUndefined();
  });

  it("resumes a stored session in the standard (non-rework) implement flow", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-normal-resume",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "Plan:\n- remove old code\n- update docs",
        reworkRequested: false,
        sessionId: "session-xyz",
      })
      .run();

    await runImplementer("task-normal-resume", projectRoot);

    expect(queryMock).toHaveBeenCalled();
    const call = queryMock.mock.calls[0]?.[0] as {
      prompt: string;
      options: { resume?: string };
    };
    expect(call.options.resume).toBe("session-xyz");
  });

  it("does not skip when checkbox Task checklist has pending items", async () => {
    const db = testDb.current;
    queryMock
      .mockReturnValueOnce(streamSuccess("Implementation done"))
      .mockReturnValueOnce(
        streamSuccess("## Fix Steps\n- [x] Task 1: Pending step\n- [x] Task 2: Done step"),
      );

    db.insert(tasks)
      .values({
        id: "task-3",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Fix Steps\n- [ ] Task 1: Pending step\n- [x] Task 2: Done step",
        reworkRequested: false,
        useSubagents: true,
      })
      .run();

    await runImplementer("task-3", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(2);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    const firstLine = call.prompt.split("\n")[0] ?? "";
    expect(firstLine).toBe("Implement the task using the provided plan.");
    expect(call.prompt).toContain("Implement the task using the provided plan.");
    const syncCall = queryMock.mock.calls[1]?.[0] as { prompt: string };
    expect(syncCall.prompt).toContain("Update only checkbox states");
    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-3")).get();
    expect(updatedTask?.implementationLog).toContain("Implementation done");
    expect(updatedTask?.implementationLog).toContain("Plan checklist auto-synced");
    expect(updatedTask?.implementationLog).not.toContain("No pending tasks detected in plan");
  });

  it("does not skip when plan task format is unrecognized", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-4",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "Plan:\n- remove old code\n- update docs",
        reworkRequested: false,
        useSubagents: true,
      })
      .run();

    await runImplementer("task-4", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    const firstLine = call.prompt.split("\n")[0] ?? "";
    expect(firstLine).toBe("Implement the task using the provided plan.");
    expect(call.prompt).toContain("Implement the task using the provided plan.");
    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-4")).get();
    expect(updatedTask?.implementationLog).toBe("Implementation done");
  });

  it("does not fail when checkbox Task checklist remains pending after auto-sync", async () => {
    const db = testDb.current;
    queryMock
      .mockReturnValueOnce(streamSuccess("Implementation done"))
      .mockReturnValueOnce(streamSuccess("## Plan\n- [ ] Task 1: Still pending"));

    db.insert(tasks)
      .values({
        id: "task-5",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [ ] Task 1: Still pending",
        reworkRequested: false,
      })
      .run();

    await expect(runImplementer("task-5", projectRoot)).resolves.toBeUndefined();

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-5")).get();
    expect(updatedTask?.implementationLog).toContain("Implementation done");
    expect(updatedTask?.implementationLog).toContain(
      "Checklist remains incomplete after auto-sync",
    );
  });

  it("uses /aif-implement command format only in skill mode", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-skill-impl",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [ ] Task 1: Pending",
        reworkRequested: false,
        useSubagents: false,
      })
      .run();

    await runImplementer("task-skill-impl", projectRoot);

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("/aif-implement @.ai-factory/PLAN.md");
  });

  it("applies rework header and disables resume in skill mode", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-skill-rework",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [x] Done",
        reworkRequested: true,
        useSubagents: false,
        sessionId: "skill-old-session",
        reviewComments: "## Blocking Findings\n- [finding-2] code_review | Fix skill mode rework",
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 1,
          findings: [
            {
              id: "finding-2",
              source: "code_review",
              text: "Fix skill mode rework",
            },
          ],
        }),
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-skill-rework",
        taskId: "task-skill-rework",
        author: "human",
        message: "skill-rework-request",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:01.000Z",
      })
      .run();

    await runImplementer("task-skill-rework", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as {
      prompt: string;
      options: { resume?: string };
    };

    // Slash command stays on the first line so Claude Code can expand it
    const firstLine = call.prompt.split("\n")[0] ?? "";
    expect(firstLine).toBe("/aif-implement @.ai-factory/PLAN.md");

    // Rework header + comment + protocol are still injected into the body
    expect(call.prompt).toContain("REWORK REQUEST — THIS IS THE PRIMARY TASK");
    expect(call.prompt).toContain("<<<REWORK_COMMENT");
    expect(call.prompt).toContain("<<<FULL_REVIEW_COMMENTS");
    expect(call.prompt).toContain("<<<BLOCKING_FINDINGS_SNAPSHOT");
    expect(call.prompt).toContain("message: skill-rework-request");
    expect(call.prompt).toContain("Rework handling protocol:");
    expect(call.prompt).toContain("Rework mode: true");

    // Stored session must NOT be resumed for rework, even in skill mode
    expect(call.options.resume).toBeUndefined();
  });
});

describe("runImplementer feature branch routing", () => {
  let projectRoot: string;

  beforeEach(() => {
    (globalThis as { __AIF_CLAUDE_QUERY_MOCK__?: typeof queryMock }).__AIF_CLAUDE_QUERY_MOCK__ =
      queryMock;
    testDb.current = createTestDb();
    queryMock.mockReset();
    queryMock.mockReturnValue(streamSuccess("Implementation done"));
    projectRoot = mkdtempSync(join(tmpdir(), "aif-implementer-branch-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "T"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "commit.gpgsign", "false"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# t\n");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    // Pre-create the task's feature branch so implementer can switch to it
    execFileSync("git", ["checkout", "-b", "feature/my-task"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "main"], { cwd: projectRoot, stdio: "ignore" });

    testDb.current
      .insert(projects)
      .values({ id: "project-b", name: "Branch", rootPath: projectRoot })
      .run();
  });

  it("switches HEAD to task.branchName before running implementer", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-b-1",
        projectId: "project-b",
        title: "Has branch",
        description: "",
        status: "implementing",
        plan: "## Plan\n- [ ] Do work",
        branchName: "feature/my-task",
      })
      .run();

    // HEAD is on main before run
    const before = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(before).toBe("main");

    await runImplementer("task-b-1", projectRoot);

    const after = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(after).toBe("feature/my-task");
  });

  it("does not touch HEAD when task has no branchName", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-b-2",
        projectId: "project-b",
        title: "No branch",
        description: "",
        status: "implementing",
        plan: "## Plan\n- [ ] Do work",
      })
      .run();

    await runImplementer("task-b-2", projectRoot);

    const after = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(after).toBe("main");
  });

  it("restores branch BEFORE no-op early return (so plan is read from the right branch)", async () => {
    const db = testDb.current;
    // Plan text on feature branch shows pending work; plan text on main
    // (current HEAD before implementer runs) would be "all done" — if we
    // evaluated pending-task count on main, we'd wrongly early-return.
    db.insert(tasks)
      .values({
        id: "task-b-3",
        projectId: "project-b",
        title: "Must switch first",
        description: "",
        status: "implementing",
        plan: "## Plan\n- [ ] still pending\n- [x] already done",
        branchName: "feature/my-task",
      })
      .run();

    // HEAD on main — restore must happen before any config/plan read.
    const before = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(before).toBe("main");

    await runImplementer("task-b-3", projectRoot);

    const after = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(after).toBe("feature/my-task");
    // Subagent WAS invoked (pending task remains) — if branch restore ran
    // after the no-op check on a stale plan, the test would see 0 calls.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("throws BranchIsolationError when task.branchName is missing from git", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-b-missing",
        projectId: "project-b",
        title: "Branch gone",
        description: "",
        status: "implementing",
        plan: "## Plan\n- [ ] work",
        branchName: "feature/never-existed",
      })
      .run();

    const { isBranchIsolationError } = await import("../gitBranch.js");
    try {
      await runImplementer("task-b-missing", projectRoot);
      throw new Error("expected throw");
    } catch (err) {
      expect(isBranchIsolationError(err)).toBe(true);
      if (isBranchIsolationError(err)) {
        expect(err.kind).toBe("branch_missing");
      }
    }
    // Subagent was NOT invoked — stage aborted before prompt build
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws branch_drift when subagent switches HEAD mid-run", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-b-drift",
        projectId: "project-b",
        title: "Drift implementer",
        description: "",
        status: "implementing",
        plan: "## Plan\n- [ ] work",
        branchName: "feature/my-task",
      })
      .run();

    // Simulate subagent switching HEAD off the task branch during its run
    queryMock.mockReset();
    queryMock.mockImplementation(() => {
      execFileSync("git", ["checkout", "main"], { cwd: projectRoot, stdio: "ignore" });
      return streamSuccess("Implementation done");
    });

    const { isBranchIsolationError } = await import("../gitBranch.js");
    try {
      await runImplementer("task-b-drift", projectRoot);
      throw new Error("expected throw");
    } catch (err) {
      expect(isBranchIsolationError(err)).toBe(true);
      if (isBranchIsolationError(err)) {
        expect(err.kind).toBe("branch_drift");
      }
    }
  });
});
