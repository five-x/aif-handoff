import { Hono } from "hono";
import type { MemoryItem } from "@aif/shared";
import {
  approveMemoryItem,
  createMemoryItem,
  expireMemoryItem,
  findMemoryItemById,
  listMemoryItems,
  listMemoryLifecycleEvents,
  listMemoryUsageEvents,
  rejectMemoryItem,
  updateMemoryItem,
} from "@aif/data";
import { jsonValidator, queryValidator } from "../middleware/zodValidator.js";
import {
  createMemoryItemSchema,
  memoryActionSchema,
  memoryListQuerySchema,
  updateMemoryItemSchema,
} from "../schemas.js";
import { broadcast } from "../ws.js";

export const memoryRouter = new Hono();

function memoryBroadcastPayload(item: Pick<MemoryItem, "id" | "projectId" | "status">) {
  return {
    id: item.id,
    projectId: item.projectId,
    status: item.status,
  };
}

function broadcastMemoryItem(
  type: "memory:item_created" | "memory:item_updated",
  item: MemoryItem,
) {
  broadcast({
    type,
    payload: memoryBroadcastPayload(item),
  });
}

memoryRouter.get("/", queryValidator(memoryListQuerySchema), (c) => {
  const query = c.req.valid("query");
  return c.json(
    listMemoryItems({
      projectId: query.projectId,
      status: query.status,
      scope: query.scope,
      includeGlobal: query.includeGlobal,
      limit: query.limit,
    }),
  );
});

memoryRouter.post("/", jsonValidator(createMemoryItemSchema), (c) => {
  const body = c.req.valid("json");
  const item = createMemoryItem(body);
  if (!item) return c.json({ error: "Memory is disabled" }, 409);
  broadcastMemoryItem("memory:item_created", item);
  return c.json(item, 201);
});

memoryRouter.get("/:id/usage", (c) => {
  const { id } = c.req.param();
  if (!findMemoryItemById(id)) return c.json({ error: "Memory item not found" }, 404);
  return c.json(listMemoryUsageEvents(id));
});

memoryRouter.get("/:id/lifecycle", (c) => {
  const { id } = c.req.param();
  if (!findMemoryItemById(id)) return c.json({ error: "Memory item not found" }, 404);
  return c.json(listMemoryLifecycleEvents(id));
});

memoryRouter.get("/:id", (c) => {
  const { id } = c.req.param();
  const item = findMemoryItemById(id);
  if (!item) return c.json({ error: "Memory item not found" }, 404);
  return c.json(item);
});

memoryRouter.put("/:id", jsonValidator(updateMemoryItemSchema), (c) => {
  const { id } = c.req.param();
  const body = c.req.valid("json");
  const item = updateMemoryItem(id, body, { actor: "human", note: body.reviewNote ?? null });
  if (!item) return c.json({ error: "Memory item not found" }, 404);
  broadcastMemoryItem("memory:item_updated", item);
  return c.json(item);
});

memoryRouter.post("/:id/approve", jsonValidator(memoryActionSchema), (c) => {
  const { id } = c.req.param();
  const body = c.req.valid("json");
  try {
    const item = approveMemoryItem(id, { actor: "human", note: body.note ?? null });
    if (!item) return c.json({ error: "Memory item not found" }, 404);
    broadcastMemoryItem("memory:item_updated", item);
    return c.json(item);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Memory item is blocked" }, 400);
  }
});

memoryRouter.post("/:id/reject", jsonValidator(memoryActionSchema), (c) => {
  const { id } = c.req.param();
  const body = c.req.valid("json");
  const item = rejectMemoryItem(id, { actor: "human", note: body.note ?? null });
  if (!item) return c.json({ error: "Memory item not found" }, 404);
  broadcastMemoryItem("memory:item_updated", item);
  return c.json(item);
});

memoryRouter.post("/:id/expire", jsonValidator(memoryActionSchema), (c) => {
  const { id } = c.req.param();
  const body = c.req.valid("json");
  const item = expireMemoryItem(id, { actor: "human", note: body.note ?? null });
  if (!item) return c.json({ error: "Memory item not found" }, 404);
  broadcastMemoryItem("memory:item_updated", item);
  return c.json(item);
});
