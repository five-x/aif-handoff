import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { Task } from "@aif/shared/browser";

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

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    projectId: "project-1",
    title: "Task 1",
    description: "",
    attachments: [],
    autoMode: true,
    isFix: false,
    plannerMode: "fast",
    planPath: ".ai-factory/PLAN.md",
    planDocs: false,
    planTests: false,
    skipReview: false,
    useSubagents: false,
    status: "backlog",
    priority: 0,
    position: 0,
    plan: null,
    implementationLog: null,
    reviewComments: null,
    agentActivityLog: null,
    blockedReason: null,
    blockedFromStatus: null,
    retryAfter: null,
    retryCount: 0,
    roadmapAlias: null,
    tags: [],
    reworkRequested: false,
    reviewIterationCount: 0,
    maxReviewIterations: 3,
    manualReviewRequired: false,
    autoReviewState: null,
    paused: false,
    lastHeartbeatAt: null,
    lastSyncedAt: null,
    runtimeProfileId: null,
    modelOverride: null,
    runtimeOptions: null,
    sessionId: null,
    runtimeLimitSnapshot: null,
    runtimeLimitUpdatedAt: null,
    scheduledAt: null,
    branchName: null,
    worktreePath: null,
    ...overrides,
    lockStage: overrides.lockStage ?? null,
    coordinatorId: overrides.coordinatorId ?? null,
    createdAt: overrides.createdAt ?? "2026-05-08T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-08T00:00:00.000Z",
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

  it("invalidates memory queries for memory broadcasts", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const listener = vi.fn();
    window.addEventListener("memory:item_updated", listener);

    const { unmount } = renderHook(() => useWebSocket(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "memory:item_updated",
          payload: { id: "memory-1", projectId: "project-1", status: "pending" },
        }),
      });
    });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "memory:item_updated" }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["memory"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["memory", "project-1"] });

    window.removeEventListener("memory:item_updated", listener);
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

  it("patches cached task status immediately for task movement broadcasts", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData<Task[]>(["tasks", "project-1"], [createTask()]);
    queryClient.setQueryData<Task>(["task", "task-1"], createTask());

    const { unmount } = renderHook(() => useWebSocket(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "task:moved",
          payload: { id: "task-1", title: "Task 1", status: "planning" },
        }),
      });
    });

    expect(queryClient.getQueryData<Task[]>(["tasks", "project-1"])?.[0]?.status).toBe("planning");
    expect(queryClient.getQueryData<Task>(["task", "task-1"])?.status).toBe("planning");

    unmount();
  });

  it("invalidates task caches after partial task broadcasts so artifact trust is refetched", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const staleAuditTask = createTask({
      status: "implementing",
      artifactTrust: {
        taskStatus: "implementing",
        artifactRole: "report",
        artifactState: "expected",
        artifactTrustLevel: "weak",
        claimOutcome: "not_evaluated",
        failureFamily: null,
        reasonCodes: ["expected"],
        latestAttemptOutcome: null,
        trustedSynthesisInput: false,
        synthesisReady: false,
        nextAction: "wait_for_source_artifacts",
        nextActionLabel: "Wait for source artifacts",
        summary: "implementing with expected artifact",
        artifactPath: "audit/source.md",
        batchId: "batch-1",
        roadmapAlias: "audit-roadmap",
        attemptNumber: 0,
        failureSignature: null,
        branchName: null,
        worktreePath: null,
        batchCounts: {
          trustedValid: 0,
          inconclusive: 0,
          rejected: 0,
          missing: 0,
          externalBlocked: 0,
          synthesisPending: 1,
          total: 1,
        },
      },
    });
    queryClient.setQueryData<Task[]>(["tasks", "project-1"], [staleAuditTask]);
    queryClient.setQueryData<Task>(["task", "task-1"], staleAuditTask);

    const { unmount } = renderHook(() => useWebSocket(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "task:updated",
          payload: { id: "task-1", title: "Task 1", status: "done" },
        }),
      });
    });

    expect(queryClient.getQueryData<Task[]>(["tasks", "project-1"])?.[0]?.status).toBe("done");
    expect(queryClient.getQueryData<Task>(["task", "task-1"])?.status).toBe("done");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tasks"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["task", "task-1"] });

    unmount();
  });

  it("invalidates operator projection queries for trust, memory, usage, queue, and worktree broadcasts", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { unmount } = renderHook(() => useWebSocket(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "task:trust_updated",
          payload: { id: "task-1", projectId: "project-1", reasonCodes: ["trusted"] },
        }),
      });
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "project:memory_candidate_created",
          payload: { id: "memory-1", projectId: "project-1", taskId: "task-1", status: "pending" },
        }),
      });
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "project:usage_updated",
          payload: { projectId: "project-1", taskId: "task-1" },
        }),
      });
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "project:queue_updated",
          payload: { projectId: "project-1", taskId: "task-1" },
        }),
      });
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "project:auto_queue_advanced",
          payload: { id: "task-1" },
        }),
      });
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "project:worktree_warning",
          payload: { projectId: "project-1", taskId: "task-1", warnings: ["large_disk_usage"] },
        }),
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["task-timeline", "task-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["task-evidence", "task-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["task-memory", "task-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["task-runtime-usage", "task-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["task-worktree", "task-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["project-knowledge", "project-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["project-runtime-usage", "project-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["project-queue", "project-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["project-queue"] });

    unmount();
  });
});
