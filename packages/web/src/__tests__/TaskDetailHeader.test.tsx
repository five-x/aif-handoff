import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Task } from "@aif/shared/browser";
import { TaskDetailHeader } from "@/components/task/TaskDetailHeader";

const baseTask: Task = {
  id: "hdr-1",
  projectId: "proj-1",
  title: "Header Test Task",
  description: "desc",
  attachments: [],
  autoMode: false,
  isFix: false,
  plannerMode: "full",
  planPath: ".ai-factory/PLAN.md",
  planDocs: false,
  planTests: false,
  skipReview: false,
  useSubagents: true,
  reworkRequested: false,
  reviewIterationCount: 0,
  maxReviewIterations: 3,
  manualReviewRequired: false,
  autoReviewState: null,
  paused: false,
  lastHeartbeatAt: null,
  lockStage: null,
  coordinatorId: null,
  lastSyncedAt: null,
  sessionId: null,
  scheduledAt: null,
  branchName: null,
  worktreePath: null,
  roadmapAlias: "RM-1",
  tags: ["backend", "rm:ignore"],
  status: "plan_ready",
  priority: 2,
  position: 1000,
  plan: null,
  implementationLog: null,
  reviewComments: null,
  agentActivityLog: null,
  blockedReason: null,
  blockedFromStatus: null,
  retryAfter: null,
  retryCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  tokenInput: 1234,
  tokenOutput: 567,
  tokenTotal: 1801,
  costUsd: 0.042,
};

function artifactTrust(
  overrides: Partial<NonNullable<Task["artifactTrust"]>> = {},
): NonNullable<Task["artifactTrust"]> {
  return {
    taskStatus: "blocked_external",
    artifactRole: "synthesis",
    artifactState: "synthesis_not_ready",
    artifactTrustLevel: "weak",
    claimOutcome: "inconclusive",
    failureFamily: "synthesis_not_ready",
    reasonCodes: ["plan_quality", "synthesis_not_ready", "untrusted_artifact"],
    latestAttemptOutcome: "not_applicable",
    trustedSynthesisInput: false,
    synthesisReady: false,
    nextAction: "wait_for_source_artifacts",
    nextActionLabel: "Wait for source artifacts",
    summary: "Blocked with synthesis pending artifact",
    artifactPath: "audit/final.md",
    batchId: "batch-1",
    roadmapAlias: "audit-roadmap",
    attemptNumber: 1,
    failureSignature: "role:synthesis|family:synthesis_not_ready",
    branchName: "audit/synthesis",
    worktreePath: "C:/tmp/audit-synthesis",
    batchCounts: {
      trustedValid: 1,
      inconclusive: 1,
      rejected: 1,
      missing: 1,
      externalBlocked: 1,
      synthesisPending: 1,
      total: 5,
    },
    ...overrides,
  };
}

describe("TaskDetailHeader", () => {
  it("should render task title and status badge", () => {
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Header Test Task")).toBeDefined();
    expect(screen.getByText("Plan Ready")).toBeDefined();
  });

  it("should render priority badge", () => {
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("P2")).toBeDefined();
  });

  it("should render roadmap alias badge", () => {
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("RM-1")).toBeDefined();
  });

  it("should filter out rm: prefixed tags and roadmap tag", () => {
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("backend")).toBeDefined();
    expect(screen.queryByText("rm:ignore")).toBeNull();
  });

  it("should render action buttons for plan_ready manual task", () => {
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Start implementation")).toBeDefined();
    expect(screen.getByText("Request replanning")).toBeDefined();
    expect(screen.getByText("Fast fix")).toBeDefined();
  });

  it("should hide actions for auto-mode plan_ready task", () => {
    const autoTask = { ...baseTask, autoMode: true };
    render(
      <TaskDetailHeader
        task={autoTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("Start implementation")).toBeNull();
    expect(screen.queryByText("Request replanning")).toBeNull();
  });

  it("renders container metadata and hides runtime-starting actions", () => {
    const containerTask: Task = {
      ...baseTask,
      hierarchyRole: "container",
      childSummary: {
        childCount: 3,
        activeChildCount: 1,
        blockedChildCount: 0,
        verifiedChildCount: 2,
      },
    };
    render(
      <TaskDetailHeader
        task={containerTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("CONTAINER")).toBeDefined();
    expect(screen.getByText("Children 2/3")).toBeDefined();
    expect(screen.queryByText("Start implementation")).toBeNull();
    expect(screen.queryByText("Request replanning")).toBeNull();
    expect(screen.queryByText("Fast fix")).toBeNull();
    expect(screen.queryByText("Pause")).toBeNull();
  });

  it("should call onActionClick when action button is clicked", () => {
    const onActionClick = vi.fn();
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={onActionClick}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Start implementation"));
    expect(onActionClick).toHaveBeenCalledWith(
      expect.objectContaining({ event: "start_implementation" }),
    );
  });

  it("should call onTabChange when tab is clicked", () => {
    const onTabChange = vi.fn();
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={onTabChange}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Review"));
    expect(onTabChange).toHaveBeenCalledWith("review");
  });

  it("should show plan change success message", () => {
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess="Fast fix applied."
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Fast fix applied.")).toBeDefined();
  });

  it("should render Pause button when task is not paused", () => {
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Pause")).toBeDefined();
    expect(screen.queryByText("Resume")).toBeNull();
  });

  it("should render manual review badge when human review is required", () => {
    render(
      <TaskDetailHeader
        task={{ ...baseTask, status: "done", manualReviewRequired: true }}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("MANUAL REVIEW")).toBeDefined();
  });

  it("should render Resume button and PAUSED badge when task is paused", () => {
    const pausedTask = { ...baseTask, paused: true };
    render(
      <TaskDetailHeader
        task={pausedTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Resume")).toBeDefined();
    expect(screen.getByText("PAUSED")).toBeDefined();
    expect(screen.queryByText("Pause")).toBeNull();
  });

  it("should render Resume for a paused container task", () => {
    const pausedContainer = {
      ...baseTask,
      hierarchyRole: "container" as const,
      paused: true,
      status: "implementing" as const,
    };
    render(
      <TaskDetailHeader
        task={pausedContainer}
        activeTab="overview"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Resume")).toBeDefined();
    expect(screen.queryByText("Pause")).toBeNull();
  });

  it("should call onTogglePaused when pause button is clicked", () => {
    const onTogglePaused = vi.fn();
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={onTogglePaused}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Pause"));
    expect(onTogglePaused).toHaveBeenCalledOnce();
  });

  it("should render token stats", () => {
    render(
      <TaskDetailHeader
        task={baseTask}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/in: 1,234/)).toBeDefined();
    expect(screen.getByText(/out: 567/)).toBeDefined();
  });

  it("should render structured runtime auto-pause details for blocked tasks", () => {
    render(
      <TaskDetailHeader
        task={{
          ...baseTask,
          status: "blocked_external",
          retryAfter: "2026-04-17T01:00:00.000Z",
          runtimeLimitSnapshot: {
            source: "api_headers",
            status: "blocked",
            precision: "exact",
            checkedAt: "2026-04-17T00:00:00.000Z",
            providerId: "anthropic",
            runtimeId: "claude",
            primaryScope: "requests",
            resetAt: "2099-04-17T01:00:00.000Z",
            warningThreshold: 10,
            windows: [{ scope: "requests", percentRemaining: 5, warningThreshold: 10 }],
            providerMeta: null,
          },
        }}
        activeTab="implementation"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Auto-paused by runtime limit.")).toBeDefined();
    expect(
      screen.getByText("Request quota crossed the 10% safety threshold (5% remaining)."),
    ).toBeDefined();
    expect(screen.getByText(/Provider reset/)).toBeDefined();
    expect(screen.getByText(/Task retry .*scheduled/)).toBeDefined();
  });

  it("renders blocked external plan quality artifact trust details", () => {
    render(
      <TaskDetailHeader
        task={{
          ...baseTask,
          status: "blocked_external",
          artifactTrust: artifactTrust({
            nextAction: "retry_synthesis",
            nextActionLabel: "Retry synthesis",
            reasonCodes: ["plan_quality", "synthesis_not_ready", "untrusted_artifact"],
          }),
        }}
        activeTab="timeline"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("weak artifact")).toBeDefined();
    expect(screen.getByText("Blocked with synthesis pending artifact")).toBeDefined();
    expect(screen.getByText(/Next: Retry synthesis/)).toBeDefined();
    expect(
      screen.getByText(/Reasons: plan_quality, synthesis_not_ready, untrusted_artifact/),
    ).toBeDefined();
  });

  it("shows manual exception instead of retry for untrusted audit manual-review blocks", () => {
    const onActionClick = vi.fn();
    render(
      <TaskDetailHeader
        task={{
          ...baseTask,
          status: "blocked_external",
          taskIntent: "audit",
          manualReviewRequired: true,
          blockedReason:
            "source_inconclusive: audit report is terminal non-trusted: validator issue codes: shallow_evidence",
          artifactTrust: artifactTrust({
            artifactRole: "report",
            artifactState: "source_inconclusive",
            artifactTrustLevel: "untrusted",
            nextAction: "inspect_untrusted_source",
            nextActionLabel: "Inspect untrusted source",
            reasonCodes: ["source_inconclusive", "terminal_inconclusive"],
          }),
        }}
        activeTab="timeline"
        onTabChange={vi.fn()}
        onActionClick={onActionClick}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("Retry")).toBeNull();
    fireEvent.click(screen.getByText("Manual exception"));
    expect(onActionClick).toHaveBeenCalledWith(
      expect.objectContaining({ event: "manual_exception" }),
    );
  });

  it("renders audit card decision fields without manual review from weak counts", () => {
    render(
      <TaskDetailHeader
        task={{
          ...baseTask,
          status: "done",
          manualReviewRequired: false,
          artifactTrust: artifactTrust({
            taskStatus: "done",
            trustedSynthesisInput: true,
            artifactTrustLevel: "trusted",
            artifactState: "valid",
            auditCardDecision: {
              otzRequirement: "Ship deterministic audit synthesis.",
              acceptanceCriteria: ["Decision fields are visible."],
              implementationEvidence: ["packages/agent/src/subagents/implementer.ts"],
              verificationEvidence: ["npm test"],
              requirementCompletion: "satisfied",
              verificationStrength: "verified",
              auditFindingValidity: {
                validFindings: 1,
                weakFindings: 2,
                discardedFindings: 3,
              },
              residualRisks: ["Weak findings were omitted."],
              finalStatus: "closed_verified",
            },
          }),
        }}
        activeTab="timeline"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Audit decision: closed_verified")).toBeDefined();
    expect(screen.getByText("Requirement: satisfied")).toBeDefined();
    expect(screen.getByText("Verification: verified")).toBeDefined();
    expect(screen.getByText("Weak: 2")).toBeDefined();
    expect(screen.getByText("Discarded: 3")).toBeDefined();
    expect(screen.getByText("Residual risks: Weak findings were omitted.")).toBeDefined();
    expect(screen.queryByText("MANUAL REVIEW")).toBeNull();
  });

  it("renders plan quality replan feedback outside blocked status", () => {
    render(
      <TaskDetailHeader
        task={{
          ...baseTask,
          status: "planning",
          blockedFromStatus: "plan_ready",
          blockedReason:
            "Plan quality guard replan 1/2: Plan quality guard (missing_plan_manifest): Full-mode task plan must include an aif-plan-manifest block.",
        }}
        activeTab="activity"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("PLAN QUALITY")).toBeDefined();
    expect(screen.getByText("Plan quality replan")).toBeDefined();
    expect(screen.getByText(/missing_plan_manifest/)).toBeDefined();
  });

  it("renders synthesis not ready batch counts and identifiers", () => {
    render(
      <TaskDetailHeader
        task={{ ...baseTask, status: "blocked_external", artifactTrust: artifactTrust() }}
        activeTab="timeline"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Sources: 5")).toBeDefined();
    expect(screen.getByText("Trusted: 1")).toBeDefined();
    expect(screen.getByText("Inconclusive: 1")).toBeDefined();
    expect(screen.getByText("Rejected: 1")).toBeDefined();
    expect(screen.getByText("Missing: 1")).toBeDefined();
    expect(screen.getByText("External: 1")).toBeDefined();
    expect(screen.getByText("Synthesis pending: 1")).toBeDefined();
    expect(screen.getByText("audit/final.md")).toBeDefined();
    expect(screen.getByText("role:synthesis|family:synthesis_not_ready")).toBeDefined();
  });

  it("renders final audit inconclusive without blind retry guidance", () => {
    render(
      <TaskDetailHeader
        task={{
          ...baseTask,
          status: "done",
          artifactTrust: artifactTrust({
            taskStatus: "done",
            artifactState: "terminal_inconclusive",
            artifactTrustLevel: "untrusted",
            claimOutcome: "inconclusive",
            failureFamily: "inconclusive_batch_evidence",
            nextAction: "inspect_untrusted_source",
            nextActionLabel: "Inspect untrusted source",
            summary: "Done with untrusted inconclusive artifact",
            reasonCodes: ["inconclusive_batch_evidence", "terminal_inconclusive"],
          }),
        }}
        activeTab="timeline"
        onTabChange={vi.fn()}
        onActionClick={vi.fn()}
        onTogglePaused={vi.fn()}
        isDisabled={false}
        isCheckingStartAi={false}
        planChangeSuccess={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Done / untrusted artifact")).toBeDefined();
    expect(screen.getByText("Done with untrusted inconclusive artifact")).toBeDefined();
    expect(screen.getByText(/Next: Inspect untrusted source/)).toBeDefined();
    expect(screen.queryByText(/Next: Retry source artifact rework/)).toBeNull();
  });
});
