import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindTaskById = vi.fn();
const mockCreateTaskComment = vi.fn();
const mockAppendTaskActivityLog = vi.fn();
const mockFindRoadmapBatchArtifactByTaskId = vi.fn();
const mockListRoadmapReportArtifactsForSynthesis = vi.fn();

vi.mock("@aif/data", () => ({
  findTaskById: (...args: unknown[]) => mockFindTaskById(...args),
  findRoadmapBatchArtifactByTaskId: (...args: unknown[]) =>
    mockFindRoadmapBatchArtifactByTaskId(...args),
  listRoadmapReportArtifactsForSynthesis: (...args: unknown[]) =>
    mockListRoadmapReportArtifactsForSynthesis(...args),
  createTaskComment: (...args: unknown[]) => mockCreateTaskComment(...args),
  appendTaskActivityLog: (...args: unknown[]) => mockAppendTaskActivityLog(...args),
}));

vi.mock("../reviewGate.js", () => ({
  evaluateReviewCommentsForAutoMode: vi.fn(),
}));

const { handleAutoReviewGate } = await import("../autoReviewHandler.js");
const { evaluateReviewCommentsForAutoMode } = await import("../reviewGate.js");

describe("Plan B agent regression contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindRoadmapBatchArtifactByTaskId.mockReturnValue(null);
    mockListRoadmapReportArtifactsForSynthesis.mockReturnValue([]);
  });

  it("terminalizes repeated same-blocker loops before max iterations and writes stalled summary", async () => {
    mockFindTaskById.mockReturnValue({
      id: "task-plan-b",
      autoMode: true,
      reviewComments: "still missing substantive audit evidence",
      reviewIterationCount: 2,
      maxReviewIterations: 50,
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 2,
        findings: [
          {
            id: "audit-evidence-1",
            source: "code_review",
            text: "Add substantive audit evidence instead of inventory-only notes",
            firstSeenIteration: 1,
            lastSeenIteration: 2,
            streak: 2,
          },
        ],
      },
    });
    vi.mocked(evaluateReviewCommentsForAutoMode).mockResolvedValue({
      status: "request_changes",
      metrics: {
        strategy: "full_re_review",
        iteration: 3,
        previousBlockingCount: 1,
        stillBlockingCount: 1,
        newBlockingCount: 0,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      blockingFindings: [
        {
          id: "audit-evidence-1",
          source: "code_review",
          text: "Add substantive audit evidence instead of inventory-only notes",
          firstSeenIteration: 1,
          lastSeenIteration: 3,
          streak: 3,
        },
      ],
      fixesMarkdown:
        "- [audit-evidence-1] code_review | Add substantive audit evidence instead of inventory-only notes",
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 3,
        findings: [
          {
            id: "audit-evidence-1",
            source: "code_review",
            text: "Add substantive audit evidence instead of inventory-only notes",
            firstSeenIteration: 1,
            lastSeenIteration: 3,
            streak: 3,
          },
        ],
      },
    });

    const result = await handleAutoReviewGate({
      taskId: "task-plan-b",
      projectRoot: "/tmp/plan-b-agent",
    });

    expect(result).toEqual({
      status: "manual_review_required",
      currentIteration: 3,
      handoffReason: "stalled_rework_loop",
      metrics: expect.objectContaining({
        stillBlockingCount: 1,
        totalBlockingCount: 1,
      }),
      autoReviewState: expect.objectContaining({ iteration: 3 }),
    });
    expect(result?.currentIteration).toBeLessThan(50);
    const message = mockCreateTaskComment.mock.calls[0][0].message;
    expect(message).toContain("Outcome: manual_review_required");
    expect(message).toContain("Handoff reason: stalled_rework_loop");
    expect(message).toContain("## Stalled Findings");
    expect(message).toContain("audit-evidence-1");
  });
});
