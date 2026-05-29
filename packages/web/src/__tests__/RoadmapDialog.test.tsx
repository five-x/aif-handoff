import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Project, TaskSplitProposal } from "@aif/shared/browser";

const mockCheckRoadmapStatus = vi.fn();
const mockGenerateRoadmap = vi.fn();
const mockImportRoadmap = vi.fn();
const mockApproveTaskSplitProposal = vi.fn();
const mockRejectTaskSplitProposal = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    checkRoadmapStatus: (...args: unknown[]) => mockCheckRoadmapStatus(...args),
    generateRoadmap: (...args: unknown[]) => mockGenerateRoadmap(...args),
    importRoadmap: (...args: unknown[]) => mockImportRoadmap(...args),
    approveTaskSplitProposal: (...args: unknown[]) => mockApproveTaskSplitProposal(...args),
    rejectTaskSplitProposal: (...args: unknown[]) => mockRejectTaskSplitProposal(...args),
  },
}));

const { RoadmapDialog } = await import("@/components/layout/RoadmapDialog");

const project: Project = {
  id: "project-1",
  name: "Project One",
  rootPath: "/tmp/project-1",
  plannerMaxBudgetUsd: null,
  planCheckerMaxBudgetUsd: null,
  implementerMaxBudgetUsd: null,
  reviewSidecarMaxBudgetUsd: null,
  parallelEnabled: false,
  autoQueueMode: true,
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

function makeProposal(overrides: Partial<TaskSplitProposal> = {}): TaskSplitProposal {
  return {
    id: "proposal-1",
    projectId: project.id,
    parentTaskId: null,
    sourceKind: "roadmap_import",
    sourceRef: "roadmap-import:.ai-factory/ROADMAP.md",
    sourceFingerprint: "a".repeat(64),
    roadmapAlias: "split-v1",
    taskIntent: "general",
    status: "pending",
    decision: "split_required",
    summary: "Split required for 1 proposed roadmap task.",
    proposedChildren: [
      {
        title: "Build split child",
        description: "Implement the proposed roadmap child.",
        taskIntent: "general",
        phase: 1,
        phaseName: "Phase 1",
        sequence: 1,
        tags: ["roadmap", "rm:split-v1", "seq:01", "kind:general"],
      },
    ],
    createdTaskIds: [],
    containerTaskId: null,
    approvedBy: null,
    rejectedReason: null,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
    approvedAt: null,
    rejectedAt: null,
    ...overrides,
  };
}

function renderDialog(onImportComplete = vi.fn()) {
  const onOpenChange = vi.fn();
  render(
    <RoadmapDialog
      open
      onOpenChange={onOpenChange}
      project={project}
      onImportComplete={onImportComplete}
    />,
  );
  return { onOpenChange, onImportComplete };
}

describe("RoadmapDialog split proposals", () => {
  beforeEach(() => {
    mockCheckRoadmapStatus.mockReset();
    mockGenerateRoadmap.mockReset();
    mockImportRoadmap.mockReset();
    mockApproveTaskSplitProposal.mockReset();
    mockRejectTaskSplitProposal.mockReset();
    mockCheckRoadmapStatus.mockResolvedValue({ exists: true });
  });

  it("renders imported split proposals and approves child rows without counting the container", async () => {
    const pendingProposal = makeProposal();
    const approvedProposal = makeProposal({
      status: "approved",
      createdTaskIds: ["container-1", "child-1"],
      containerTaskId: "container-1",
      approvedBy: "api",
      approvedAt: "2026-05-29T00:01:00.000Z",
      updatedAt: "2026-05-29T00:01:00.000Z",
    });
    mockImportRoadmap.mockResolvedValue({
      status: "split_required",
      projectId: project.id,
      proposal: pendingProposal,
    });
    mockApproveTaskSplitProposal.mockResolvedValue(approvedProposal);
    const onImportComplete = vi.fn();
    renderDialog(onImportComplete);

    await screen.findByRole("button", { name: "Import Existing" });
    fireEvent.change(screen.getByLabelText("Roadmap alias"), {
      target: { value: "split-v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Existing" }));

    expect(await screen.findByText("Split approval required")).toBeDefined();
    expect(screen.getByText("Build split child")).toBeDefined();
    expect(mockImportRoadmap).toHaveBeenCalledWith(project.id, "split-v1", "general");
    expect(onImportComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(mockApproveTaskSplitProposal).toHaveBeenCalledWith(project.id, pendingProposal.id),
    );
    expect(await screen.findByText("Roadmap generated")).toBeDefined();
    expect(screen.getByText("Created 1 task")).toBeDefined();
    expect(onImportComplete).toHaveBeenCalledWith({
      roadmapAlias: "split-v1",
      created: 1,
      skipped: 0,
      taskIds: ["child-1"],
      containerTaskId: "container-1",
    });
  });

  it("rejects a pending proposal without reporting imported tasks", async () => {
    const pendingProposal = makeProposal();
    const rejectedProposal = makeProposal({
      status: "rejected",
      rejectedReason: "not now",
      rejectedAt: "2026-05-29T00:02:00.000Z",
      updatedAt: "2026-05-29T00:02:00.000Z",
    });
    mockImportRoadmap.mockResolvedValue({
      status: "split_required",
      projectId: project.id,
      proposal: pendingProposal,
    });
    mockRejectTaskSplitProposal.mockResolvedValue(rejectedProposal);
    const onImportComplete = vi.fn();
    renderDialog(onImportComplete);

    await screen.findByRole("button", { name: "Import Existing" });
    fireEvent.change(screen.getByLabelText("Roadmap alias"), {
      target: { value: "split-v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Existing" }));
    await screen.findByText("Split approval required");

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(mockRejectTaskSplitProposal).toHaveBeenCalledWith(project.id, pendingProposal.id),
    );
    expect(await screen.findByText("Proposal rejected.")).toBeDefined();
    expect(onImportComplete).not.toHaveBeenCalled();
  });

  it("renders async roadmap split-required websocket events for the current project", async () => {
    const proposal = makeProposal({ sourceKind: "roadmap_generation" });
    renderDialog();

    window.dispatchEvent(
      new CustomEvent("roadmap:split_required", {
        detail: {
          projectId: project.id,
          roadmapAlias: proposal.roadmapAlias,
          proposal,
        },
      }),
    );

    expect(await screen.findByText("Split approval required")).toBeDefined();
    expect(screen.getByText("Build split child")).toBeDefined();
    expect(screen.getByText("1 proposed task for")).toBeDefined();
  });
});
