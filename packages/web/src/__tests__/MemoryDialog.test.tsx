import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MemoryItem } from "@aif/shared/browser";
import { MemoryDialog } from "@/components/memory/MemoryDialog";

const mocks = vi.hoisted(() => ({
  update: { mutate: vi.fn(), isPending: false },
  approve: { mutate: vi.fn(), isPending: false },
  reject: { mutate: vi.fn(), isPending: false },
  expire: { mutate: vi.fn(), isPending: false },
  refetch: vi.fn(),
  items: [] as MemoryItem[],
}));

vi.mock("@/hooks/useMemory", () => ({
  useMemoryItems: () => ({ data: mocks.items, isFetching: false, refetch: mocks.refetch }),
  useUpdateMemoryItem: () => mocks.update,
  useApproveMemoryItem: () => mocks.approve,
  useRejectMemoryItem: () => mocks.reject,
  useExpireMemoryItem: () => mocks.expire,
}));

function memoryItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: "memory-1",
    projectId: "project-1",
    scope: "project",
    sourceTaskId: "task-1",
    sourceKind: "task",
    sourceRef: "task:task-1",
    itemType: "failure_family",
    failureFamily: "branch_drift",
    claims: [
      {
        claimId: "claim-1",
        type: "failure_family",
        status: "approved",
        text: "Branch drift blocks implementation until the task branch is restored.",
        sources: [
          {
            kind: "task",
            taskId: "task-1",
            ref: "task:task-1",
          },
          {
            kind: "code",
            path: "packages/shared/src/gitIsolation.ts",
          },
          {
            kind: "evidence",
            evidenceId: "evidence-1",
          },
        ],
        supersedes: ["old-claim"],
        contradicts: [],
        lastValidatedAt: "2026-05-16T00:00:00.000Z",
      },
    ],
    status: "pending",
    redactionStatus: "clean",
    publishBlockReason: null,
    reviewNote: null,
    title: "Branch drift memory",
    summary: "Branch drift is represented as source-backed memory.",
    content: "Restore branch provenance before continuing implementation.",
    tags: ["branch"],
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
    approvedAt: null,
    rejectedAt: null,
    expiredAt: null,
    expiresAt: null,
    ...overrides,
  };
}

describe("MemoryDialog", () => {
  it("renders memory type, failure family, claim source links, and validation metadata", () => {
    mocks.items = [memoryItem()];

    render(<MemoryDialog projectId="project-1" open onOpenChange={vi.fn()} />);

    expect(screen.getAllByText("failure_family").length).toBeGreaterThan(0);
    expect(screen.getAllByText("branch_drift").length).toBeGreaterThan(0);
    expect(screen.getByText("Source task: task-1")).toBeDefined();
    expect(screen.getByText("Source ref: task:task-1")).toBeDefined();
    expect(screen.getByText("claim-1")).toBeDefined();
    expect(screen.getAllByText(/task:task-1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/path:packages\/shared\/src\/gitIsolation\.ts/)).toBeDefined();
    expect(screen.getByText(/evidence:evidence-1/)).toBeDefined();
    expect(screen.getByRole("link", { name: "Source task: task-1" })).toHaveAttribute(
      "href",
      "/project/project-1/task/task-1",
    );
    expect(screen.getByRole("link", { name: "Source ref: task:task-1" })).toHaveAttribute(
      "href",
      "/project/project-1/task/task-1",
    );
    expect(screen.getByRole("link", { name: "task:task-1" })).toHaveAttribute(
      "href",
      "/project/project-1/task/task-1",
    );
    expect(
      screen.getByRole("link", { name: "path:packages/shared/src/gitIsolation.ts" }),
    ).toHaveAttribute("href", "#path:packages%2Fshared%2Fsrc%2FgitIsolation.ts");
    expect(screen.getByRole("link", { name: "evidence:evidence-1" })).toHaveAttribute(
      "href",
      "#evidence:evidence-1",
    );
    expect(screen.getByText("Supersedes: old-claim")).toBeDefined();
    expect(screen.getByText("Validated: 2026-05-16T00:00:00.000Z")).toBeDefined();
  });

  it("disables approval when a memory item lacks a source-backed claim", () => {
    mocks.items = [memoryItem({ claims: [], failureFamily: "missing_source_backed_claim" })];

    render(<MemoryDialog projectId="project-1" open onOpenChange={vi.fn()} />);

    expect(screen.getByText("missing source")).toBeDefined();
    expect(screen.getByText(/Approval requires every claim/)).toBeDefined();
    const approveButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.trim() === "Approve");
    expect(approveButton).toBeDefined();
    expect(approveButton).toBeDisabled();
  });
});
