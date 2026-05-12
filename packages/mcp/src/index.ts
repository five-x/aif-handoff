import "./stdioEnv.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { logger } from "@aif/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadMcpEnv } from "./env.js";
import { RateLimiter } from "./middleware/rateLimit.js";
import type { ToolContext } from "./tools/index.js";
import { register as registerListTasks } from "./tools/listTasks.js";
import { register as registerGetTask } from "./tools/getTask.js";
import { register as registerSearchTasks } from "./tools/searchTasks.js";
import { register as registerListProjects } from "./tools/listProjects.js";
import { register as registerCreateTask } from "./tools/createTask.js";
import { register as registerUpdateTask } from "./tools/updateTask.js";
import { register as registerSyncStatus } from "./tools/syncStatus.js";
import { register as registerPushPlan } from "./tools/pushPlan.js";
import { register as registerAnnotatePlan } from "./tools/annotatePlan.js";

const log = logger("mcp");

function createMcpServer(env: ReturnType<typeof loadMcpEnv>): McpServer {
  const server = new McpServer(
    {
      name: "handoff-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const rateLimiter = new RateLimiter(
    { rpm: env.rateLimitReadRpm, burst: env.rateLimitReadBurst },
    { rpm: env.rateLimitWriteRpm, burst: env.rateLimitWriteBurst },
  );

  const context: ToolContext = { rateLimiter };

  // Register read-only tools
  registerListTasks(server, context);
  registerGetTask(server, context);
  registerSearchTasks(server, context);
  registerListProjects(server, context);

  // Register write tools
  registerCreateTask(server, context);
  registerUpdateTask(server, context);
  registerSyncStatus(server, context);
  registerPushPlan(server, context);
  registerAnnotatePlan(server, context);

  return server;
}

async function startStdio(env: ReturnType<typeof loadMcpEnv>) {
  const server = createMcpServer(env);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP server connected via stdio transport");
}

async function startHttp(env: ReturnType<typeof loadMcpEnv>) {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${env.httpPort}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url.pathname === "/mcp") {
      try {
        await handleMcpHttpRequest(env, transports, req, res);
      } catch (error) {
        log.error(
          { error: error instanceof Error ? error.message : String(error) },
          "Failed to handle MCP HTTP request",
        );
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32603, message: "Internal server error" },
              id: null,
            }),
          );
        }
      }
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.listen(env.httpPort, () => {
    log.info(
      { port: env.httpPort, endpoint: "/mcp" },
      "MCP server listening via Streamable HTTP transport",
    );
  });

  // Graceful shutdown so the port is freed on Ctrl+C / tsx-watch reload.
  // Exit synchronously — tsx watch + turbo race on Ctrl+C and complain
  // about "Previous process hasn't exited yet" when close is async.
  let shuttingDown = false;
  const onShutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "Shutdown signal received — exiting");
    for (const [sessionId, transport] of transports) {
      transport.close().catch((error) => {
        log.warn(
          { sessionId, error: error instanceof Error ? error.message : String(error) },
          "Failed to close MCP transport during shutdown",
        );
      });
    }
    httpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", () => onShutdown("SIGINT"));
  process.on("SIGTERM", () => onShutdown("SIGTERM"));
}

function getSessionId(req: IncomingMessage): string | null {
  const raw = req.headers["mcp-session-id"];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf-8");
  if (!body.trim()) return undefined;
  return JSON.parse(body);
}

async function handleMcpHttpRequest(
  env: ReturnType<typeof loadMcpEnv>,
  transports: Map<string, StreamableHTTPServerTransport>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionId = getSessionId(req);
  const existingTransport = sessionId ? transports.get(sessionId) : undefined;

  if (existingTransport) {
    await existingTransport.handleRequest(req, res);
    return;
  }

  if (sessionId) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null,
      }),
    );
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Missing MCP session ID" },
        id: null,
      }),
    );
    return;
  }

  const parsedBody = await parseJsonBody(req);
  if (!isInitializeRequest(parsedBody)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: null,
      }),
    );
    return;
  }

  let transport: StreamableHTTPServerTransport;
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      transports.set(newSessionId, transport);
      log.debug({ sessionId: newSessionId }, "MCP HTTP session initialized");
    },
  });
  transport.onclose = () => {
    const closedSessionId = transport.sessionId;
    if (closedSessionId) {
      transports.delete(closedSessionId);
      log.debug({ sessionId: closedSessionId }, "MCP HTTP session closed");
    }
  };

  const server = createMcpServer(env);
  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
}

async function main() {
  const env = loadMcpEnv();

  log.info(
    {
      transport: env.transport,
      httpPort: env.httpPort,
    },
    "MCP server starting",
  );

  if (env.transport === "http") {
    await startHttp(env);
  } else {
    await startStdio(env);
  }
}

main().catch((error) => {
  log.error(
    { error: error instanceof Error ? error.message : String(error) },
    "MCP server failed to start",
  );
  process.exit(1);
});

export { loadMcpEnv } from "./env.js";
export { RateLimiter } from "./middleware/rateLimit.js";
export { toMcpError, rateLimitError, validationError } from "./middleware/errorHandler.js";
export type { ToolContext, ToolRegistrar } from "./tools/index.js";
