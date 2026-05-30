import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@aif/shared/server";
import { projects, runtimeProfiles, tasks } from "@aif/shared";

const { loggerMock, testDb } = vi.hoisted(() => ({
  loggerMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  testDb: {
    current: undefined as unknown as ReturnType<typeof createTestDb>,
  },
}));

vi.mock("@aif/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared")>();
  return {
    ...actual,
    logger: () => loggerMock,
  };
});

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

const { resolveEffectiveRuntimeProfile, resolveEffectiveRuntimeProfilesForTasks } = await import(
  "../index.js"
);

describe("runtime profile resolution", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    loggerMock.debug.mockClear();
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
  });

  it("does not log a fallback when the project default is the first configured profile", () => {
    testDb.current
      .insert(projects)
      .values({
        id: "proj-1",
        name: "Project 1",
        rootPath: "/tmp/proj-1",
        defaultTaskRuntimeProfileId: "profile-project",
      })
      .run();
    testDb.current
      .insert(runtimeProfiles)
      .values({
        id: "profile-project",
        projectId: "proj-1",
        name: "Project Runtime",
        runtimeId: "codex",
        providerId: "openai",
        enabled: true,
      })
      .run();
    testDb.current
      .insert(tasks)
      .values({ id: "task-1", projectId: "proj-1", title: "Task 1" })
      .run();

    const result = resolveEffectiveRuntimeProfile({
      taskId: "task-1",
      projectId: "proj-1",
      mode: "task",
      systemDefaultRuntimeProfileId: null,
    });

    expect(result.source).toBe("project_default");
    expect(result.profile?.id).toBe("profile-project");
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  it("batch resolves effective runtime profiles for task lists", () => {
    testDb.current
      .insert(projects)
      .values({
        id: "proj-1",
        name: "Project 1",
        rootPath: "/tmp/proj-1",
        defaultTaskRuntimeProfileId: "profile-project",
      })
      .run();
    testDb.current
      .insert(runtimeProfiles)
      .values([
        {
          id: "profile-project",
          projectId: "proj-1",
          name: "Project Runtime",
          runtimeId: "codex",
          providerId: "openai",
          enabled: true,
        },
        {
          id: "profile-task",
          projectId: "proj-1",
          name: "Task Runtime",
          runtimeId: "claude",
          providerId: "anthropic",
          enabled: true,
        },
      ])
      .run();
    testDb.current
      .insert(tasks)
      .values([
        { id: "task-project", projectId: "proj-1", title: "Project Default" },
        {
          id: "task-override",
          projectId: "proj-1",
          title: "Task Override",
          runtimeProfileId: "profile-task",
        },
      ])
      .run();

    const taskRows = testDb.current.select().from(tasks).all();
    const results = resolveEffectiveRuntimeProfilesForTasks(taskRows, {
      mode: "task",
      systemDefaultRuntimeProfileId: null,
    });

    expect(results.get("task-project")?.source).toBe("project_default");
    expect(results.get("task-project")?.profile?.id).toBe("profile-project");
    expect(results.get("task-override")?.source).toBe("task_override");
    expect(results.get("task-override")?.profile?.id).toBe("profile-task");
    expect(loggerMock.info).not.toHaveBeenCalled();
    expect(loggerMock.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        taskCount: 2,
        projectCount: 1,
        fallbackLogCount: 0,
      }),
      "Resolved effective runtime profiles for task list",
    );
    const debugMessages = loggerMock.debug.mock.calls
      .map((call) => call[1])
      .filter((message): message is string => typeof message === "string");
    const developerMarkerPattern = new RegExp(String.raw`\[${"FIX"}:|^DEBUG `, "m");
    expect(debugMessages.join("\n")).not.toMatch(developerMarkerPattern);
  });

  it("accepts canonical runtime stages and returns compatibility metadata", () => {
    testDb.current
      .insert(projects)
      .values({
        id: "proj-1",
        name: "Project 1",
        rootPath: "/tmp/proj-1",
        defaultTaskRuntimeProfileId: "profile-task",
        defaultPlanRuntimeProfileId: "profile-plan",
        defaultReviewRuntimeProfileId: "profile-review",
        defaultChatRuntimeProfileId: "profile-chat",
      })
      .run();
    testDb.current
      .insert(runtimeProfiles)
      .values([
        { id: "profile-task", projectId: "proj-1", name: "Task", runtimeId: "codex", providerId: "openai", enabled: true },
        { id: "profile-plan", projectId: "proj-1", name: "Plan", runtimeId: "codex", providerId: "openai", enabled: true },
        { id: "profile-review", projectId: "proj-1", name: "Review", runtimeId: "codex", providerId: "openai", enabled: true },
        { id: "profile-chat", projectId: "proj-1", name: "Chat", runtimeId: "codex", providerId: "openai", enabled: true },
      ])
      .run();
    testDb.current
      .insert(tasks)
      .values({ id: "task-1", projectId: "proj-1", title: "Task 1" })
      .run();

    expect(resolveEffectiveRuntimeProfile({ taskId: "task-1", mode: "planner" })).toMatchObject({
      stage: "planner",
      profileMode: "plan",
      profile: expect.objectContaining({ id: "profile-plan" }),
    });
    expect(resolveEffectiveRuntimeProfile({ taskId: "task-1", mode: "plan_checker" })).toMatchObject({
      stage: "plan_checker",
      profileMode: "plan",
      profile: expect.objectContaining({ id: "profile-plan" }),
    });
    expect(resolveEffectiveRuntimeProfile({ taskId: "task-1", mode: "security" })).toMatchObject({
      stage: "security",
      profileMode: "review",
      profile: expect.objectContaining({ id: "profile-review" }),
    });
    expect(resolveEffectiveRuntimeProfile({ taskId: "task-1", mode: "audit" })).toMatchObject({
      stage: "audit",
      profileMode: "plan",
      profile: expect.objectContaining({ id: "profile-plan" }),
    });
    expect(resolveEffectiveRuntimeProfile({ taskId: "task-1", mode: "synthesis" })).toMatchObject({
      stage: "synthesis",
      profileMode: "plan",
      profile: expect.objectContaining({ id: "profile-plan" }),
    });
  });

  it("skips qwen-local-agent implementation profiles unless explicitly enabled", () => {
    testDb.current
      .insert(projects)
      .values({
        id: "proj-1",
        name: "Project 1",
        rootPath: "/tmp/proj-1",
        defaultTaskRuntimeProfileId: "profile-codex",
      })
      .run();
    testDb.current
      .insert(runtimeProfiles)
      .values([
        {
          id: "profile-qwen",
          projectId: "proj-1",
          name: "Qwen",
          runtimeId: "qwen-local-agent",
          providerId: "qwen",
          enabled: true,
          optionsJson: "{}",
        },
        {
          id: "profile-codex",
          projectId: "proj-1",
          name: "Codex",
          runtimeId: "codex",
          providerId: "openai",
          enabled: true,
          optionsJson: "{}",
        },
      ])
      .run();
    testDb.current
      .insert(tasks)
      .values({
        id: "task-qwen-override",
        projectId: "proj-1",
        title: "Implement",
        runtimeProfileId: "profile-qwen",
      })
      .run();

    const result = resolveEffectiveRuntimeProfile({
      taskId: "task-qwen-override",
      mode: "implementer",
      systemDefaultRuntimeProfileId: null,
    });

    expect(result.source).toBe("project_default");
    expect(result.profile?.id).toBe("profile-codex");
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeProfileId: "profile-qwen",
        stage: "implementer",
        reason: "qwen_implementation_not_enabled",
      }),
      "Runtime profile is not eligible for stage",
    );
  });

  it("selects qwen-local-agent for implementation when the profile carries an explicit flag", () => {
    testDb.current
      .insert(projects)
      .values({ id: "proj-1", name: "Project 1", rootPath: "/tmp/proj-1" })
      .run();
    testDb.current
      .insert(runtimeProfiles)
      .values({
        id: "profile-qwen-enabled",
        projectId: "proj-1",
        name: "Qwen Enabled",
        runtimeId: "qwen-local-agent",
        providerId: "qwen",
        enabled: true,
        optionsJson: JSON.stringify({
          qwenLocalAgent: {
            implementationCanary: {
              passed: true,
              source: "structured_evidence",
              canaryId: "canary-test",
              passedAt: "2026-05-30T00:00:00.000Z",
              testVerdict: "TEST PASS",
              reviewVerdict: "REVIEW PASS",
            },
          },
        }),
      })
      .run();
    testDb.current
      .insert(tasks)
      .values({
        id: "task-qwen-enabled",
        projectId: "proj-1",
        title: "Implement",
        runtimeProfileId: "profile-qwen-enabled",
      })
      .run();

    const result = resolveEffectiveRuntimeProfile({
      taskId: "task-qwen-enabled",
      mode: "implementer",
      systemDefaultRuntimeProfileId: null,
    });

    expect(result.source).toBe("task_override");
    expect(result.profile?.id).toBe("profile-qwen-enabled");
  });

  it("keeps qwen-local-agent chat profiles eligible by default", () => {
    testDb.current
      .insert(projects)
      .values({
        id: "proj-1",
        name: "Project 1",
        rootPath: "/tmp/proj-1",
        defaultChatRuntimeProfileId: "profile-qwen-chat",
      })
      .run();
    testDb.current
      .insert(runtimeProfiles)
      .values({
        id: "profile-qwen-chat",
        projectId: "proj-1",
        name: "Qwen Chat",
        runtimeId: "qwen-local-agent",
        providerId: "qwen",
        enabled: true,
        optionsJson: "{}",
      })
      .run();

    const result = resolveEffectiveRuntimeProfile({
      projectId: "proj-1",
      mode: "chat",
      systemDefaultRuntimeProfileId: null,
    });

    expect(result.stage).toBe("chat");
    expect(result.profileMode).toBe("chat");
    expect(result.source).toBe("project_default");
    expect(result.profile?.id).toBe("profile-qwen-chat");
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  it("batch runtime resolution applies stage eligibility filtering", () => {
    testDb.current
      .insert(projects)
      .values({
        id: "proj-1",
        name: "Project 1",
        rootPath: "/tmp/proj-1",
        defaultTaskRuntimeProfileId: "profile-qwen",
      })
      .run();
    testDb.current
      .insert(runtimeProfiles)
      .values([
        {
          id: "profile-qwen",
          projectId: "proj-1",
          name: "Qwen",
          runtimeId: "qwen-local-agent",
          providerId: "qwen",
          enabled: true,
          optionsJson: "{}",
        },
        {
          id: "profile-system",
          projectId: null,
          name: "System",
          runtimeId: "codex",
          providerId: "openai",
          enabled: true,
          optionsJson: "{}",
        },
      ])
      .run();
    testDb.current
      .insert(tasks)
      .values([{ id: "task-batch", projectId: "proj-1", title: "Batch" }])
      .run();

    const taskRows = testDb.current.select().from(tasks).all();
    const result = resolveEffectiveRuntimeProfilesForTasks(taskRows, {
      mode: "implementer",
      systemDefaultRuntimeProfileId: "profile-system",
    }).get("task-batch");

    expect(result?.source).toBe("system_default");
    expect(result?.profile?.id).toBe("profile-system");
  });
});
