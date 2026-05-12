import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { projects } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("../ws.js", () => ({
  broadcast: vi.fn(),
}));

const { memoryRouter } = await import("../routes/memory.js");
const { broadcast } = await import("../ws.js");

function createApp() {
  const app = new Hono();
  app.route("/memory", memoryRouter);
  return app;
}

describe("memory API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    testDb.current = createTestDb();
    testDb.current
      .insert(projects)
      .values({ id: "project-1", name: "Project", rootPath: "/tmp/project" })
      .run();
    vi.mocked(broadcast).mockClear();
    app = createApp();
  });

  it("creates, lists, updates, and approves memory items", async () => {
    const createRes = await app.request("/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "project-1",
        scope: "project",
        title: "Close-out convention",
        summary: "Verified tasks create pending memory.",
        content: "Approved memory is injected as reference-only context.",
        tags: ["memory"],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; status: string };
    expect(created.status).toBe("pending");

    const listRes = await app.request("/memory?projectId=project-1&status=pending");
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.map((item) => item.id)).toContain(created.id);

    const updateRes = await app.request(`/memory/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewNote: "reviewed" }),
    });
    expect(updateRes.status).toBe(200);

    const approveRes = await app.request(`/memory/${created.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "publish" }),
    });
    expect(approveRes.status).toBe(200);
    const approved = (await approveRes.json()) as { status: string };
    expect(approved.status).toBe("approved");
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "memory:item_updated" }),
    );
  });

  it("rejects approval while redaction review is blocked", async () => {
    const createRes = await app.request("/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "project-1",
        scope: "project",
        title: "Secret note",
        summary: "Contains a secret.",
        content: "token=super-secret-token",
      }),
    });
    const created = (await createRes.json()) as { id: string; redactionStatus: string };
    expect(created.redactionStatus).toBe("blocked");

    const approveRes = await app.request(`/memory/${created.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "publish" }),
    });
    expect(approveRes.status).toBe(400);
  });
});
