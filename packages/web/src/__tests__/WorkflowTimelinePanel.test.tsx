import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WorkflowTimeline } from "@aif/shared/browser";
import { WorkflowTimelinePanel } from "@/components/task/WorkflowTimelinePanel";

const auditTimeline: WorkflowTimeline = {
  context: {
    taskId: "task-1",
    projectId: "project-1",
    workflowPackId: "audit",
    workflowKind: "audit",
    roadmapAlias: "audit-roadmap",
    sourceKind: "roadmap_batch",
    sourceId: "batch-1",
    status: "done",
    generatedAt: "2026-05-13T00:00:00.000Z",
  },
  artifacts: [
    {
      id: "artifact-1",
      taskId: "task-1",
      kind: "audit.source_report",
      label: "Source artifact",
      path: "docs/audit/source.md",
      state: "accepted",
      currentAttemptNumber: 1,
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:05:00.000Z",
      metadata: {
        role: "report",
        roadmapAlias: "audit-roadmap",
        originalState: "valid",
        failureFamily: null,
        reasonCodes: ["valid"],
        failureSignature: "role:report|classification:validated_no_findings",
        branchName: "audit/source",
        worktreePath: "C:/tmp/audit-source",
      },
    },
  ],
  attempts: [
    {
      id: "attempt-1",
      artifactId: "artifact-1",
      taskId: "task-1",
      attemptNumber: 1,
      state: "accepted",
      outcome: "supported",
      trustLevel: "trusted",
      sourceSnapshotId: "git:abc",
      createdAt: "2026-05-13T00:05:00.000Z",
      metadata: {
        role: "report",
        originalState: "valid",
        reworkStatus: "accepted",
        reasonCodes: ["accepted", "valid"],
        failureSignature: "role:report|classification:validated_no_findings",
      },
    },
  ],
  claims: [
    {
      id: "claim-1",
      artifactId: "artifact-1",
      taskId: "task-1",
      attemptId: null,
      label: "Artifact claim",
      outcome: "supported",
      trustLevel: "trusted",
      evaluatedAt: "2026-05-13T00:05:00.000Z",
      metadata: {
        role: "report",
        originalState: "valid",
        reasonCodes: ["valid"],
        failureSignature: "role:report|classification:validated_no_findings",
      },
    },
  ],
  evidence: [
    {
      id: "evidence-1",
      taskId: "task-1",
      kind: "file_read",
      grade: "substantive",
      toolName: "Read",
      summary: "source evidence preview",
      createdAt: "2026-05-13T00:04:00.000Z",
      metadata: { sourceSnapshotId: "git:abc" },
    },
  ],
  evidenceLinks: [
    {
      id: "link-1",
      evidenceId: "evidence-1",
      artifactId: "artifact-1",
      claimId: "claim-1",
      relation: "supports",
      metadata: {},
    },
  ],
  events: [
    {
      id: "event-1",
      kind: "artifact_created",
      occurredAt: "2026-05-13T00:00:00.000Z",
      title: "Artifact created",
      artifactId: "artifact-1",
      attemptId: null,
      claimId: null,
      evidenceId: null,
      metadata: {},
    },
    {
      id: "event-2",
      kind: "evidence_recorded",
      occurredAt: "2026-05-13T00:04:00.000Z",
      title: "Evidence recorded",
      artifactId: null,
      attemptId: null,
      claimId: null,
      evidenceId: "evidence-1",
      metadata: {},
    },
  ],
};

const featureTimeline: WorkflowTimeline = {
  ...auditTimeline,
  context: {
    ...auditTimeline.context,
    workflowPackId: "feature",
    workflowKind: "feature",
    roadmapAlias: null,
    sourceKind: "none",
    sourceId: null,
  },
  artifacts: [
    {
      ...auditTimeline.artifacts[0]!,
      id: "feature-artifact",
      kind: "feature.spec",
      label: "Specification artifact",
      path: "docs/specs/feature.md",
      metadata: {},
    },
  ],
  claims: [
    {
      ...auditTimeline.claims[0]!,
      id: "feature-claim",
      artifactId: "feature-artifact",
      metadata: {},
    },
  ],
  evidence: [
    {
      ...auditTimeline.evidence[0]!,
      id: "feature-evidence",
      kind: "search",
      summary: "feature evidence preview",
      metadata: {},
    },
  ],
  evidenceLinks: [],
  events: [],
};

const auditInconclusiveTimeline: WorkflowTimeline = {
  ...auditTimeline,
  artifacts: [
    {
      ...auditTimeline.artifacts[0]!,
      id: "artifact-inconclusive",
      kind: "audit_synthesis",
      label: "Synthesis artifact",
      path: "docs/audit/summary.md",
      state: "inconclusive",
      metadata: {
        ...auditTimeline.artifacts[0]!.metadata,
        role: "synthesis",
        originalState: "valid",
        reasonCodes: ["audit_inconclusive", "untrusted_artifact", "valid"],
        failureSignature: null,
      },
    },
  ],
  attempts: [
    {
      ...auditTimeline.attempts[0]!,
      artifactId: "artifact-inconclusive",
      state: "inconclusive",
      outcome: "inconclusive",
      trustLevel: "untrusted",
      metadata: {
        ...auditTimeline.attempts[0]!.metadata,
        role: "synthesis",
        originalState: "valid",
        reasonCodes: ["audit_inconclusive", "untrusted_artifact", "valid"],
        failureSignature: null,
      },
    },
  ],
  claims: [
    {
      ...auditTimeline.claims[0]!,
      id: "claim-inconclusive",
      artifactId: "artifact-inconclusive",
      outcome: "inconclusive",
      trustLevel: "untrusted",
      metadata: {
        ...auditTimeline.claims[0]!.metadata,
        role: "synthesis",
        originalState: "valid",
        reasonCodes: ["audit_inconclusive", "untrusted_artifact", "valid"],
        failureSignature: null,
      },
    },
  ],
  evidenceLinks: [
    {
      ...auditTimeline.evidenceLinks[0]!,
      artifactId: "artifact-inconclusive",
      claimId: "claim-inconclusive",
      relation: "context",
    },
  ],
};

describe("WorkflowTimelinePanel", () => {
  it("renders populated audit-compatible timeline with generic labels and secondary details", () => {
    render(<WorkflowTimelinePanel timeline={auditTimeline} />);

    expect(screen.getByText("Artifacts")).toBeDefined();
    expect(screen.getByText("Claims")).toBeDefined();
    expect(screen.getByText("Attempts")).toBeDefined();
    expect(screen.getByText("Source artifact")).toBeDefined();
    expect(screen.getAllByText("Supported").length).toBeGreaterThan(0);
    expect(screen.getByText("Attempt 1")).toBeDefined();
    expect(screen.getAllByText("Evidence").length).toBeGreaterThan(0);
    expect(screen.getByText("source evidence preview")).toBeDefined();
    expect(screen.getAllByText("Role: report").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Original: valid").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reason codes: valid").length).toBeGreaterThan(0);
    expect(screen.getByText("Branch: audit/source")).toBeDefined();
    expect(screen.getByText("Worktree: C:/tmp/audit-source")).toBeDefined();
    expect(screen.getAllByText("Snapshot: git:abc").length).toBeGreaterThan(0);
    expect(screen.getByText("Link: supports artifact-1")).toBeDefined();
    expect(screen.getByText("Rework: accepted")).toBeDefined();
    expect(screen.getAllByText(/Failure signature:/).length).toBeGreaterThan(0);
    expect(screen.getByText("Roadmap: audit-roadmap")).toBeDefined();
  });

  it("renders feature-shaped generic data without audit-only wording", () => {
    render(<WorkflowTimelinePanel timeline={featureTimeline} />);

    expect(screen.getByText("Specification artifact")).toBeDefined();
    expect(screen.getByText("Artifact claim")).toBeDefined();
    expect(screen.getByText("feature evidence preview")).toBeDefined();
    expect(screen.getByText("Workflow: feature")).toBeDefined();
    expect(screen.queryByText(/audit/i)).toBeNull();
  });

  it("renders audit_inconclusive synthesis as inconclusive and untrusted", () => {
    render(<WorkflowTimelinePanel timeline={auditInconclusiveTimeline} />);

    expect(screen.getByText("Synthesis artifact")).toBeDefined();
    expect(screen.getAllByText("Inconclusive").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Trust: untrusted").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Reason codes: audit_inconclusive, untrusted_artifact, valid").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Supported")).toBeNull();
    expect(screen.queryByText("Trust: trusted")).toBeNull();
  });

  it("renders an empty generic timeline", () => {
    render(
      <WorkflowTimelinePanel
        timeline={{
          ...featureTimeline,
          artifacts: [],
          attempts: [],
          claims: [],
          evidence: [],
          evidenceLinks: [],
          events: [],
        }}
      />,
    );

    expect(screen.getByText(/No workflow artifacts or evidence/)).toBeDefined();
  });
});
