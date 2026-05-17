import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@aif/shared/server";
import { projects } from "@aif/shared";

const testDb = { current: createTestDb() };

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("@aif/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared")>();
  return {
    ...actual,
    getEnv: () => ({
      API_BASE_URL: "http://localhost:3009",
      DATABASE_URL: ":memory:",
      PORT: 3009,
      AGENT_MAX_REVIEW_ITERATIONS: 100,
      AGENT_USE_SUBAGENTS: false,
    }),
  };
});

const broadcastTaskChangeMock = vi.fn(async () => undefined);
vi.mock("../utils/broadcast.js", () => ({
  broadcastTaskChange: broadcastTaskChangeMock,
}));

const { createTask, findTaskById, setTaskFields } = await import("@aif/data");
const { register: registerCreateTask } = await import("../tools/createTask.js");
const { register: registerUpdateTask } = await import("../tools/updateTask.js");
const { register: registerSyncStatus } = await import("../tools/syncStatus.js");
const { register: registerPushPlan } = await import("../tools/pushPlan.js");

interface RegisteredTool {
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
  schema: unknown;
}

class MockMcpServer {
  tools = new Map<string, RegisteredTool>();

  tool(
    name: string,
    _description: string,
    schema: unknown,
    handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>,
  ) {
    this.tools.set(name, { schema, handler });
  }
}

const context = {
  rateLimiter: {
    check: () => true,
  },
};

function seedProject(id = "proj-1") {
  testDb.current.insert(projects).values({ id, name: "Test", rootPath: "/tmp/test" }).run();
}

function registerTools() {
  const server = new MockMcpServer();
  registerCreateTask(server as any, context as any);
  registerUpdateTask(server as any, context as any);
  registerSyncStatus(server as any, context as any);
  registerPushPlan(server as any, context as any);
  return server.tools;
}

function parseResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

describe("MCP workflow contract", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
    broadcastTaskChangeMock.mockClear();
  });

  it("rejects unsafe create planPath", async () => {
    const tools = registerTools();
    for (const planPath of [
      "../PLAN.md",
      "C:foo.md",
      "foo:bar.md",
      "plans/./a.md",
      "plans//a.md",
      "/tmp/a.md",
    ]) {
      await expect(
        tools.get("handoff_create_task")!.handler({
          projectId: "proj-1",
          title: "Unsafe plan",
          planPath,
        }),
      ).rejects.toThrow(/planPath must be a safe relative artifact path/);
    }
  });

  it("resolves taskIntent and persists sourceRef on create and update", async () => {
    const tools = registerTools();
    const created = parseResult(
      await tools.get("handoff_create_task")!.handler({
        projectId: "proj-1",
        title: "Fix issue",
        isFix: true,
        sourceRef: "chat:abc",
      }),
    );

    expect(created.taskIntent).toBe("fix");
    expect(created.sourceRef).toBe("chat:abc");
    expect(broadcastTaskChangeMock).toHaveBeenCalledWith(
      created.id,
      "task:created",
      expect.objectContaining({ toStatus: "backlog" }),
    );

    const updated = parseResult(
      await tools.get("handoff_update_task")!.handler({
        taskId: created.id,
        taskIntent: "audit",
        sourceRef: "docs/rdpi/research.md",
      }),
    );

    expect(updated.taskIntent).toBe("audit");
    expect(updated.sourceRef).toBe("docs/rdpi/research.md");
  });

  it("rejects invalid taskIntent and guarded workflow fields on update", async () => {
    const tools = registerTools();
    const task = createTask({ projectId: "proj-1", title: "Guarded", description: "" })!;

    await expect(
      tools.get("handoff_update_task")!.handler({
        taskId: task.id,
        taskIntent: "unknown",
      }),
    ).rejects.toThrow(/Invalid taskIntent/);

    await expect(
      tools.get("handoff_update_task")!.handler({
        taskId: task.id,
        implementationLog: "done",
      }),
    ).rejects.toThrow(/guarded workflow fields/);
  });

  it("rejects MCP updateTask plan writes outside planning-compatible states", async () => {
    const tools = registerTools();
    for (const status of [
      "blocked_external",
      "implementing",
      "review",
      "done",
      "verified",
    ] as const) {
      const task = createTask({ projectId: "proj-1", title: `Plan ${status}`, description: "" })!;
      setTaskFields(task.id, { status });

      await expect(
        tools.get("handoff_update_task")!.handler({
          taskId: task.id,
          plan: "## Unsafe plan rewrite",
        }),
      ).rejects.toThrow(/Cannot mutate plan/);
      expect(findTaskById(task.id)!.plan).toBeNull();
    }
  });

  it("rejects terminal and unsupported sync transitions without writing status", async () => {
    const tools = registerTools();
    const task = createTask({ projectId: "proj-1", title: "Sync", description: "" })!;

    let payload = parseResult(
      await tools.get("handoff_sync_status")!.handler({
        taskId: task.id,
        newStatus: "done",
        sourceTimestamp: "2026-01-02T00:00:00.000Z",
        direction: "aif_to_handoff",
      }),
    );
    expect(payload.applied).toBe(false);
    expect(findTaskById(task.id)!.status).toBe("backlog");

    payload = parseResult(
      await tools.get("handoff_sync_status")!.handler({
        taskId: task.id,
        newStatus: "review",
        sourceTimestamp: "2026-01-02T00:00:00.000Z",
        direction: "aif_to_handoff",
      }),
    );
    expect(payload.applied).toBe(false);
    expect(payload.reason).toMatch(/Unsupported sync transition/);
    expect(findTaskById(task.id)!.status).toBe("backlog");

    setTaskFields(task.id, { status: "verified" });
    payload = parseResult(
      await tools.get("handoff_sync_status")!.handler({
        taskId: task.id,
        newStatus: "planning",
        sourceTimestamp: "2026-01-02T00:00:00.000Z",
        direction: "aif_to_handoff",
      }),
    );
    expect(payload.applied).toBe(false);
    expect(findTaskById(task.id)!.status).toBe("verified");
  });

  it("rejects invalid and epoch sync timestamps without writing status", async () => {
    const tools = registerTools();
    const task = createTask({ projectId: "proj-1", title: "Timestamp", description: "" })!;

    for (const sourceTimestamp of ["not-a-date", "1970-01-01T00:00:00.000Z"]) {
      await expect(
        tools.get("handoff_sync_status")!.handler({
          taskId: task.id,
          newStatus: "planning",
          sourceTimestamp,
          direction: "aif_to_handoff",
        }),
      ).rejects.toThrow(/Invalid sourceTimestamp/);
      expect(findTaskById(task.id)!.status).toBe("backlog");
    }
  });

  it("does not apply older sync timestamps", async () => {
    const tools = registerTools();
    const task = createTask({ projectId: "proj-1", title: "Older timestamp", description: "" })!;
    setTaskFields(task.id, { updatedAt: "2026-01-02T00:00:00.000Z" });

    const payload = parseResult(
      await tools.get("handoff_sync_status")!.handler({
        taskId: task.id,
        newStatus: "planning",
        sourceTimestamp: "2026-01-01T00:00:00.000Z",
        direction: "aif_to_handoff",
      }),
    );
    expect(payload.applied).toBe(false);
    expect(payload.conflict).toBe(true);
    expect(findTaskById(task.id)!.status).toBe("backlog");
  });

  it("maps supported sync transitions through human task events", async () => {
    const tools = registerTools();
    const task = createTask({
      projectId: "proj-1",
      title: "Sync transition",
      description: "",
      autoMode: false,
    })!;
    setTaskFields(task.id, { updatedAt: "2026-01-01T00:00:00.000Z" });

    let payload = parseResult(
      await tools.get("handoff_sync_status")!.handler({
        taskId: task.id,
        newStatus: "plan_ready",
        sourceTimestamp: "2026-01-02T00:00:00.000Z",
        direction: "aif_to_handoff",
      }),
    );
    expect(payload.applied).toBe(true);
    expect(findTaskById(task.id)!.status).toBe("plan_ready");

    setTaskFields(task.id, { updatedAt: "2026-01-01T00:00:00.000Z" });
    payload = parseResult(
      await tools.get("handoff_sync_status")!.handler({
        taskId: task.id,
        newStatus: "implementing",
        sourceTimestamp: "2026-01-02T00:00:00.000Z",
        direction: "aif_to_handoff",
      }),
    );
    expect(payload.applied).toBe(true);
    expect(findTaskById(task.id)!.status).toBe("implementing");
  });

  it("maps blocked_external sync back to blockedFromStatus", async () => {
    const tools = registerTools();
    const task = createTask({ projectId: "proj-1", title: "Blocked", description: "" })!;
    setTaskFields(task.id, {
      status: "blocked_external",
      blockedFromStatus: "planning",
      blockedReason: "operator_input_required: fixture",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const payload = parseResult(
      await tools.get("handoff_sync_status")!.handler({
        taskId: task.id,
        newStatus: "planning",
        sourceTimestamp: "2026-01-02T00:00:00.000Z",
        direction: "aif_to_handoff",
      }),
    );

    expect(payload.applied).toBe(true);
    const updated = findTaskById(task.id)!;
    expect(updated.status).toBe("planning");
    expect(updated.blockedFromStatus).toBeNull();
    expect(updated.blockedReason).toBeNull();
  });

  it("rejects pushPlan outside planning-compatible states", async () => {
    const tools = registerTools();
    for (const status of [
      "blocked_external",
      "implementing",
      "review",
      "done",
      "verified",
    ] as const) {
      const task = createTask({ projectId: "proj-1", title: `Push ${status}`, description: "" })!;
      setTaskFields(task.id, { status });

      await expect(
        tools.get("handoff_push_plan")!.handler({
          taskId: task.id,
          planContent: "## Plan",
        }),
      ).rejects.toThrow(/Cannot mutate plan/);
    }
  });
});
