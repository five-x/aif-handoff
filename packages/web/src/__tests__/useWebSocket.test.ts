import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

vi.mock("@/hooks/useNotificationSettings", () => ({
  useNotificationSettings: () => ({ settings: { desktop: false, sound: false } }),
}));

vi.mock("@/lib/notifications", () => ({
  playStatusChangeBeep: vi.fn(),
  showTaskMovedNotification: vi.fn(),
}));

const { useWebSocket } = await import("@/hooks/useWebSocket");

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  CONNECTING = 0;
  OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(_type: string, _listener: () => void): void {}
  close(): void {
    this.readyState = 3;
  }
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useWebSocket", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches chat metadata events and invalidates scoped chat queries", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const listener = vi.fn();
    window.addEventListener("chat:session_messages_updated", listener);

    const { unmount } = renderHook(() => useWebSocket(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "chat:session_messages_updated",
          payload: { id: "session-1", projectId: "project-1" },
        }),
      });
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "chat:session_messages_updated" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["chatSessions", "project-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["chatSessionMessages", "session-1"] });

    window.removeEventListener("chat:session_messages_updated", listener);
    unmount();
  });

  it("invalidates runtime and project query families for typed broadcasts", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { unmount } = renderHook(() => useWebSocket(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "runtime_profile:updated",
          payload: { id: "profile-1", projectId: "project-1" },
        }),
      });
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "project:updated",
          payload: { id: "project-1", name: "Project" },
        }),
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["runtimeProfiles"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["effectiveChatRuntime", "project-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projectDefaults", "project-1"] });

    unmount();
  });

  it("invalidates settings and task comment queries for typed broadcasts", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { unmount } = renderHook(() => useWebSocket(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "settings:config_updated",
          payload: { projectId: "project-1" },
        }),
      });
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "task:comment_created",
          payload: { id: "comment-1", taskId: "task-1", projectId: "project-1" },
        }),
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["settings"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projectDefaults", "project-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["task-comments", "task-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["task", "task-1"] });

    unmount();
  });
});
