import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mockFindTaskById = vi.fn();
const mockCreateTaskComment = vi.fn();
const mockAppendTaskActivityLog = vi.fn();
const mockFindRoadmapBatchArtifactByTaskId = vi.fn();
const mockListRoadmapReportArtifactsForSynthesis = vi.fn();

vi.mock("@aif/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/data")>();
  return {
    ...actual,
    findTaskById: (...args: unknown[]) => mockFindTaskById(...args),
    findRoadmapBatchArtifactByTaskId: (...args: unknown[]) =>
      mockFindRoadmapBatchArtifactByTaskId(...args),
    listRoadmapReportArtifactsForSynthesis: (...args: unknown[]) =>
      mockListRoadmapReportArtifactsForSynthesis(...args),
    createTaskComment: (...args: unknown[]) => mockCreateTaskComment(...args),
    appendTaskActivityLog: (...args: unknown[]) => mockAppendTaskActivityLog(...args),
  };
});

vi.mock("../reviewGate.js", () => ({
  evaluateReviewCommentsForAutoMode: vi.fn(),
}));

const { handleAutoReviewGate } = await import("../autoReviewHandler.js");
const { evaluateReviewCommentsForAutoMode } = await import("../reviewGate.js");

describe("handleAutoReviewGate", () => {
  const baseInput = { taskId: "task-1", projectRoot: "/tmp/test" };

  function sha256(text: string): string {
    return createHash("sha256").update(text).digest("hex");
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindRoadmapBatchArtifactByTaskId.mockReturnValue(null);
    mockListRoadmapReportArtifactsForSynthesis.mockReturnValue([]);
  });

  it("returns null when task is not in autoMode", async () => {
    mockFindTaskById.mockReturnValue({ id: "task-1", autoMode: false });

    const result = await handleAutoReviewGate(baseInput);

    expect(result).toBeNull();
    expect(evaluateReviewCommentsForAutoMode).not.toHaveBeenCalled();
  });

  it("returns accepted outcome and creates success summary when review passes", async () => {
    mockFindTaskById.mockReturnValue({
      id: "task-1",
      autoMode: true,
      reviewComments: "Looks good",
      reviewIterationCount: 0,
      maxReviewIterations: 3,
      autoReviewState: null,
    });
    vi.mocked(evaluateReviewCommentsForAutoMode).mockResolvedValue({
      status: "success",
      metrics: {
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      },
      blockingFindings: [],
      fixesMarkdown: "- none",
      autoReviewState: null,
    });

    const result = await handleAutoReviewGate(baseInput);

    expect(result).toEqual({
      status: "accepted",
      currentIteration: 1,
      metrics: expect.objectContaining({ strategy: "full_re_review" }),
      autoReviewState: null,
    });
    expect(mockCreateTaskComment).toHaveBeenCalledOnce();
    expect(mockCreateTaskComment.mock.calls[0][0].message).toContain("Outcome: success");
    expect(mockCreateTaskComment.mock.calls[0][0].message).toContain("Parser mode: structured");
  });

  it("returns rework_requested and includes persisted autoReviewState", async () => {
    mockFindTaskById.mockReturnValue({
      id: "task-1",
      autoMode: true,
      reviewComments: "needs fixes",
      reviewIterationCount: 1,
      maxReviewIterations: 4,
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 1,
        findings: [],
      },
    });
    vi.mocked(evaluateReviewCommentsForAutoMode).mockResolvedValue({
      status: "request_changes",
      metrics: {
        strategy: "full_re_review",
        iteration: 2,
        previousBlockingCount: 1,
        stillBlockingCount: 1,
        newBlockingCount: 0,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      blockingFindings: [
        {
          id: "finding-1",
          source: "code_review",
          text: "Fix missing null guard",
        },
      ],
      fixesMarkdown: "- [finding-1] code_review | Fix missing null guard",
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 2,
        findings: [
          {
            id: "finding-1",
            source: "code_review",
            text: "Fix missing null guard",
          },
        ],
      },
    });

    const result = await handleAutoReviewGate(baseInput);

    expect(result).toEqual({
      status: "rework_requested",
      currentIteration: 2,
      metrics: expect.objectContaining({
        previousBlockingCount: 1,
        stillBlockingCount: 1,
      }),
      autoReviewState: expect.objectContaining({
        iteration: 2,
        findings: expect.arrayContaining([expect.objectContaining({ id: "finding-1" })]),
      }),
    });
    expect(mockCreateTaskComment.mock.calls[0][0].message).toContain("Outcome: request_changes");
    expect(mockCreateTaskComment.mock.calls[0][0].message).toContain(
      "Still-blocking previous findings: 1",
    );
  });

  it("adds a rework snapshot for roadmap audit artifacts", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "aif-auto-review-snapshot-"));
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    const reportText = "# Audit\n\nNeeds evidence.\n";
    writeFileSync(join(projectRoot, "audit", "report.md"), reportText, "utf8");
    mockFindTaskById.mockReturnValue({
      id: "task-1",
      autoMode: true,
      reviewComments: "needs fixes",
      reviewIterationCount: 0,
      maxReviewIterations: 10,
      autoReviewState: null,
    });
    mockFindRoadmapBatchArtifactByTaskId.mockReturnValue({
      taskId: "task-1",
      batchId: "batch-1",
      role: "report",
      artifactPath: "audit/report.md",
      contentSha: "row-sha",
    });
    vi.mocked(evaluateReviewCommentsForAutoMode).mockResolvedValue({
      status: "request_changes",
      metrics: {
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 1,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      blockingFindings: [
        { id: "finding-1", source: "code_review", text: "Replace stale evidence", streak: 1 },
      ],
      fixesMarkdown: "- [finding-1] code_review | Replace stale evidence",
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 1,
        findings: [
          { id: "finding-1", source: "code_review", text: "Replace stale evidence", streak: 1 },
        ],
      },
    });

    const result = await handleAutoReviewGate({ taskId: "task-1", projectRoot });

    expect(result).toEqual(
      expect.objectContaining({
        status: "rework_requested",
        autoReviewState: expect.objectContaining({
          reworkSnapshot: {
            iteration: 1,
            artifactPath: "audit/report.md",
            artifactContentSha: sha256(reportText),
            findingIds: ["finding-1"],
          },
        }),
      }),
    );
  });

  it("does not hash unsafe roadmap artifact paths for rework snapshots", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "aif-auto-review-unsafe-snapshot-"));
    const outsideName = `outside-${Date.now()}.md`;
    writeFileSync(join(projectRoot, "..", outsideName), "outside artifact\n", "utf8");
    mockFindTaskById.mockReturnValue({
      id: "task-1",
      autoMode: true,
      reviewComments: "needs fixes",
      reviewIterationCount: 0,
      maxReviewIterations: 10,
      autoReviewState: null,
    });
    mockFindRoadmapBatchArtifactByTaskId.mockReturnValue({
      taskId: "task-1",
      batchId: "batch-1",
      role: "report",
      artifactPath: `../${outsideName}`,
      contentSha: "row-sha-must-not-mask-unsafe-path",
    });
    vi.mocked(evaluateReviewCommentsForAutoMode).mockResolvedValue({
      status: "request_changes",
      metrics: {
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 1,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      blockingFindings: [
        { id: "finding-1", source: "code_review", text: "Replace stale evidence", streak: 1 },
      ],
      fixesMarkdown: "- [finding-1] code_review | Replace stale evidence",
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 1,
        findings: [
          { id: "finding-1", source: "code_review", text: "Replace stale evidence", streak: 1 },
        ],
      },
    });

    const result = await handleAutoReviewGate({ taskId: "task-1", projectRoot });

    expect(result).toEqual(
      expect.objectContaining({
        status: "rework_requested",
        autoReviewState: expect.objectContaining({
          reworkSnapshot: {
            iteration: 1,
            artifactPath: `../${outsideName}`,
            artifactContentSha: null,
            findingIds: ["finding-1"],
          },
        }),
      }),
    );
  });

  it("terminalizes repeated same-blocker loops before max iterations", async () => {
    mockFindTaskById.mockReturnValue({
      id: "task-1",
      autoMode: true,
      reviewComments: "still failing",
      reviewIterationCount: 2,
      maxReviewIterations: 100,
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 2,
        findings: [
          {
            id: "finding-1",
            source: "code_review",
            text: "Fix missing audit evidence",
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
          id: "finding-1",
          source: "code_review",
          text: "Fix missing audit evidence",
          firstSeenIteration: 1,
          lastSeenIteration: 3,
          streak: 3,
        },
      ],
      fixesMarkdown: "- [finding-1] code_review | Fix missing audit evidence",
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 3,
        findings: [
          {
            id: "finding-1",
            source: "code_review",
            text: "Fix missing audit evidence",
            firstSeenIteration: 1,
            lastSeenIteration: 3,
            streak: 3,
          },
        ],
      },
    });

    const result = await handleAutoReviewGate(baseInput);

    expect(result).toEqual({
      status: "manual_review_required",
      currentIteration: 3,
      handoffReason: "stalled_rework_loop",
      metrics: expect.objectContaining({ totalBlockingCount: 1 }),
      autoReviewState: expect.objectContaining({ iteration: 3 }),
    });
    const message = mockCreateTaskComment.mock.calls[0][0].message;
    expect(message).toContain("Handoff reason: stalled_rework_loop");
    expect(message).toContain("Stall threshold: 3");
    expect(message).toContain("## Stalled Findings");
  });

  it("converts unresolved request_changes at max iterations into manual_review_required", async () => {
    mockFindTaskById.mockReturnValue({
      id: "task-1",
      autoMode: true,
      reviewComments: "still failing",
      reviewIterationCount: 2,
      maxReviewIterations: 3,
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 2,
        findings: [],
      },
    });
    vi.mocked(evaluateReviewCommentsForAutoMode).mockResolvedValue({
      status: "request_changes",
      metrics: {
        strategy: "full_re_review",
        iteration: 3,
        previousBlockingCount: 2,
        stillBlockingCount: 1,
        newBlockingCount: 0,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      blockingFindings: [
        {
          id: "finding-1",
          source: "code_review",
          text: "Fix missing null guard",
        },
      ],
      fixesMarkdown: "- [finding-1] code_review | Fix missing null guard",
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 3,
        findings: [
          {
            id: "finding-1",
            source: "code_review",
            text: "Fix missing null guard",
          },
        ],
      },
    });

    const result = await handleAutoReviewGate(baseInput);

    expect(result).toEqual({
      status: "manual_review_required",
      currentIteration: 3,
      handoffReason: "max_iterations",
      metrics: expect.objectContaining({ totalBlockingCount: 1 }),
      autoReviewState: expect.objectContaining({ iteration: 3 }),
    });
    expect(mockCreateTaskComment.mock.calls[0][0].message).toContain(
      "Outcome: manual_review_required",
    );
    expect(mockCreateTaskComment.mock.calls[0][0].message).toContain(
      "Handoff reason: max_iterations",
    );
  });

  it("passes through manual handoff returned by review gate", async () => {
    mockFindTaskById.mockReturnValue({
      id: "task-1",
      autoMode: true,
      reviewComments: "closure-first handoff",
      reviewIterationCount: 1,
      maxReviewIterations: 4,
      autoReviewState: {
        strategy: "closure_first",
        iteration: 1,
        findings: [
          {
            id: "finding-1",
            source: "code_review",
            text: "Keep manual review banner visible",
          },
        ],
      },
    });
    vi.mocked(evaluateReviewCommentsForAutoMode).mockResolvedValue({
      status: "manual_review_required",
      handoffReason: "new_blockers_after_rework",
      metrics: {
        strategy: "closure_first",
        iteration: 2,
        previousBlockingCount: 1,
        stillBlockingCount: 0,
        newBlockingCount: 1,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      blockingFindings: [
        {
          id: "finding-2",
          source: "code_review",
          text: "Add manual review badge to task card",
        },
      ],
      fixesMarkdown: "- [finding-2] code_review | Add manual review badge to task card",
      autoReviewState: {
        strategy: "closure_first",
        iteration: 2,
        findings: [
          {
            id: "finding-2",
            source: "code_review",
            text: "Add manual review badge to task card",
          },
        ],
      },
    });

    const result = await handleAutoReviewGate(baseInput);

    expect(result).toEqual({
      status: "manual_review_required",
      currentIteration: 2,
      handoffReason: "new_blockers_after_rework",
      metrics: expect.objectContaining({
        strategy: "closure_first",
        newBlockingCount: 1,
      }),
      autoReviewState: expect.objectContaining({ iteration: 2 }),
    });
    expect(mockCreateTaskComment.mock.calls[0][0].message).toContain(
      "Handoff reason: new_blockers_after_rework",
    );
  });

  it("passes review context into evaluateReviewCommentsForAutoMode", async () => {
    mockFindTaskById.mockReturnValue({
      id: "task-1",
      autoMode: true,
      reviewComments: "specific review text",
      reviewIterationCount: 1,
      maxReviewIterations: 3,
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 1,
        findings: [
          {
            id: "finding-1",
            source: "code_review",
            text: "Persist auto review state",
          },
        ],
      },
    });
    vi.mocked(evaluateReviewCommentsForAutoMode).mockResolvedValue({
      status: "success",
      metrics: {
        strategy: "full_re_review",
        iteration: 2,
        previousBlockingCount: 1,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      },
      blockingFindings: [],
      fixesMarkdown: "- none",
      autoReviewState: null,
    });

    await handleAutoReviewGate(baseInput);

    expect(evaluateReviewCommentsForAutoMode).toHaveBeenCalledWith({
      taskId: "task-1",
      projectRoot: "/tmp/test",
      reviewComments: "specific review text",
      strategy: "full_re_review",
      iteration: 2,
      previousFindings: [
        {
          id: "finding-1",
          source: "code_review",
          text: "Persist auto review state",
        },
      ],
      task: expect.objectContaining({
        id: "task-1",
        autoMode: true,
      }),
    });
  });

  it("passes synthesis source report artifact paths into review evidence checks", async () => {
    mockFindTaskById.mockReturnValue({
      id: "task-1",
      autoMode: true,
      reviewComments: "specific review text",
      reviewIterationCount: 0,
      maxReviewIterations: 3,
      autoReviewState: null,
    });
    mockFindRoadmapBatchArtifactByTaskId.mockReturnValue({
      taskId: "task-1",
      batchId: "batch-1",
      role: "synthesis",
      artifactPath: "audit/summary.md",
    });
    mockListRoadmapReportArtifactsForSynthesis.mockReturnValue([
      { artifactPath: "audit/architecture-audit.md" },
      { artifactPath: "audit/security-audit.md" },
    ]);
    vi.mocked(evaluateReviewCommentsForAutoMode).mockResolvedValue({
      status: "success",
      metrics: {
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      },
      blockingFindings: [],
      fixesMarkdown: "- none",
      autoReviewState: null,
    });

    await handleAutoReviewGate(baseInput);

    expect(evaluateReviewCommentsForAutoMode).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({
          expectedReportArtifactPath: "audit/summary.md",
          allowedEvidenceArtifactPaths: ["audit/architecture-audit.md", "audit/security-audit.md"],
        }),
      }),
    );
  });

  it("writes activity log entries for gate start and outcome", async () => {
    mockFindTaskById.mockReturnValue({
      id: "task-1",
      autoMode: true,
      reviewComments: "ok",
      reviewIterationCount: 0,
      maxReviewIterations: 3,
      autoReviewState: null,
    });
    vi.mocked(evaluateReviewCommentsForAutoMode).mockResolvedValue({
      status: "success",
      metrics: {
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      },
      blockingFindings: [],
      fixesMarkdown: "- none",
      autoReviewState: null,
    });

    await handleAutoReviewGate(baseInput);

    const logTexts = mockAppendTaskActivityLog.mock.calls
      .filter((call) => call[0] === "task-1")
      .map((call) => call[1]);

    expect(logTexts.some((text) => text.includes("auto review gate started"))).toBe(true);
    expect(logTexts.some((text) => text.includes("coordinator auto review gate accepted"))).toBe(
      true,
    );
  });
});
