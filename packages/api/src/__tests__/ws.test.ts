import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { __setWebSocketClientsForTest, broadcast, sendToClient } from "../ws.js";

function createSocket() {
  return {
    OPEN: 1,
    readyState: 1,
    send: vi.fn(),
    terminate: vi.fn(),
  } as unknown as WebSocket & { send: ReturnType<typeof vi.fn> };
}

describe("websocket serialization", () => {
  afterEach(() => {
    __setWebSocketClientsForTest([]);
  });

  it("redacts secret-like nested payload strings before sendToClient serialization", () => {
    const socket = createSocket();
    __setWebSocketClientsForTest([{ clientId: "client-1", socket }]);

    const sent = sendToClient("client-1", {
      type: "chat:token",
      payload: {
        conversationId: "conv-1",
        token: "assistant token=sk-SECRETSECRETSECRETSECRET",
        nested: {
          authorization: "Bearer secret-token-value",
          "api_key=sk-KEYKEYKEYKEYKEYKEY": "secret-like key",
        },
      },
    } as never);

    expect(sent).toBe(true);
    const serialized = String(socket.send.mock.calls[0]?.[0] ?? "");
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("sk-SECRET");
    expect(serialized).not.toContain("sk-KEY");
    expect(serialized).not.toContain("secret-token-value");
  });

  it("redacts secret-like nested payload strings before broadcast serialization", () => {
    const first = createSocket();
    const second = createSocket();
    __setWebSocketClientsForTest([{ socket: first }, { socket: second }]);

    broadcast({
      type: "project:usage_updated",
      payload: {
        projectId: "proj-1",
        taskId: "token=sk-SECRETSECRETSECRETSECRET",
        nested: {
          path: "api_key=super-secret-value",
          "access_token=sk-KEYKEYKEYKEYKEYKEY": "secret-like key",
        },
      },
    } as never);

    for (const socket of [first, second]) {
      const serialized = String(socket.send.mock.calls[0]?.[0] ?? "");
      expect(serialized).toContain("[REDACTED]");
      expect(serialized).not.toContain("sk-SECRET");
      expect(serialized).not.toContain("sk-KEY");
      expect(serialized).not.toContain("super-secret-value");
    }
  });
});
