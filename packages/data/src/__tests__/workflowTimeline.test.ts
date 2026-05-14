import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEvidenceUnit,
  buildEvidenceUnitPayload,
  projects,
  tasks,
} from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

const {
  appendEvidenceUnitEvent,
  buildTaskWorkflowTimeline,
  createRoadmapBatchContract,
  updateRoadmapBatchArtifactState,
} = await import("../index.js");

describe("workflow timeline read model", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    testDb.current
      .insert(projects)
      .values({ id: "proj-1", name: "Project", rootPath: "/tmp/project" })
      .run();
  });

  it("maps audit compatibility rows to generic timeline data", () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-1",
        projectId: "proj-1",
        title: "Audit source",
        taskIntent: "audit",
        roadmapAlias: "audit-roadmap",
        status: "done",
      })
      .run();
    createRoadmapBatchContract({
      projectId: "proj-1",
      roadmapAlias: "audit-roadmap",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-1"],
      artifacts: [
        {
          taskId: "task-1",
          role: "report",
          artifactPath: "docs/audit/source.md",
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-1",
      state: "valid",
      classification: "validated_findings_present",
      validationDetails: { sourceClassification: "validated_findings_present" },
      sourceSnapshotId: "git:abc",
      contentSha: "sha-1",
    });
    appendEvidenceUnitEvent(
      buildEvidenceUnit(
        {
          taskId: "task-1",
          auditPlanId: "task:task-1",
          sourceSnapshotId: "git:abc",
        },
        buildEvidenceUnitPayload({
          id: "ev-1",
          toolName: "Read",
          evidenceKind: "file_read",
          evidenceGrade: "substantive",
          paths: ["src/app.ts"],
          output: "evidence preview",
        }),
      ),
    );

    const timeline = buildTaskWorkflowTimeline("task-1");

    expect(timeline).toEqual(
      expect.objectContaining({
        context: expect.objectContaining({
          taskId: "task-1",
          workflowPackId: "audit",
          sourceKind: "roadmap_batch",
          roadmapAlias: "audit-roadmap",
        }),
      }),
    );
    expect(timeline?.artifacts[0]).toEqual(
      expect.objectContaining({
        kind: "audit.source_report",
        state: "accepted",
        path: "docs/audit/source.md",
      }),
    );
    expect(timeline?.attempts[0]).toEqual(
      expect.objectContaining({
        attemptNumber: 1,
        outcome: "supported",
        trustLevel: "trusted",
      }),
    );
    expect(timeline?.claims.map((claim) => claim.outcome)).toContain("supported");
    expect(timeline?.evidence[0]).toEqual(
      expect.objectContaining({
        id: "ev-1",
        kind: "file_read",
        grade: "substantive",
        summary: "evidence preview",
      }),
    );
    expect(timeline?.evidenceLinks[0]).toEqual(
      expect.objectContaining({
        evidenceId: "ev-1",
        relation: "supports",
      }),
    );
    expect(timeline?.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining([
        "artifact_created",
        "artifact_updated",
        "attempt_recorded",
        "claim_evaluated",
        "evidence_recorded",
      ]),
    );
  });

  it("returns an empty generic timeline for non-audit tasks", () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-2",
        projectId: "proj-1",
        title: "Feature task",
        taskIntent: "feature",
        status: "backlog",
      })
      .run();
    appendEvidenceUnitEvent(
      buildEvidenceUnit(
        {
          taskId: "task-2",
          auditPlanId: "task:task-2",
          sourceSnapshotId: "git:feature",
        },
        buildEvidenceUnitPayload({
          id: "ev-feature",
          toolName: "Search",
          evidenceKind: "search",
          output: "Compatibility evidence should not surface for non-audit tasks",
        }),
      ),
    );

    const timeline = buildTaskWorkflowTimeline("task-2");

    expect(timeline).toEqual(
      expect.objectContaining({
        context: expect.objectContaining({
          taskId: "task-2",
          workflowPackId: "feature",
          workflowKind: "feature",
          sourceKind: "none",
        }),
        artifacts: [],
        attempts: [],
        claims: [],
        evidence: [],
        evidenceLinks: [],
        events: [],
      }),
    );
  });

  it("links task-scoped evidence to one compatibility claim when multiple artifacts exist", () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-multi",
        projectId: "proj-1",
        title: "Multi artifact audit",
        taskIntent: "audit",
        roadmapAlias: "audit-roadmap",
        status: "done",
      })
      .run();
    createRoadmapBatchContract({
      projectId: "proj-1",
      roadmapAlias: "audit-roadmap",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-multi"],
      artifacts: [
        {
          taskId: "task-multi",
          role: "report",
          artifactPath: "docs/audit/one.md",
        },
        {
          taskId: "task-multi",
          role: "synthesis",
          artifactPath: "docs/audit/two.md",
        },
      ],
    });
    appendEvidenceUnitEvent(
      buildEvidenceUnit(
        {
          taskId: "task-multi",
          auditPlanId: "task:task-multi",
          sourceSnapshotId: "git:multi",
        },
        buildEvidenceUnitPayload({
          id: "ev-multi",
          toolName: "Read",
          evidenceKind: "file_read",
          output: "One task-scoped evidence row",
        }),
      ),
    );

    const timeline = buildTaskWorkflowTimeline("task-multi");

    expect(timeline?.artifacts).toHaveLength(2);
    expect(timeline?.claims.filter((claim) => claim.attemptId === null)).toHaveLength(2);
    expect(timeline?.evidenceLinks).toHaveLength(1);
    expect(timeline?.evidenceLinks[0]).toEqual(
      expect.objectContaining({
        evidenceId: "ev-multi",
        artifactId: timeline?.artifacts[0].id,
        claimId: timeline?.claims.find((claim) => claim.artifactId === timeline?.artifacts[0].id)
          ?.id,
      }),
    );
  });

  it("maps compatibility artifact states to timeline states, outcomes, and trust", () => {
    const cases = [
      {
        sourceState: "expected",
        artifactState: "expected",
        outcome: "not_evaluated",
        trustLevel: "weak",
      },
      {
        sourceState: "invalid",
        failureFamily: "invalid_artifact_content",
        reworkStatus: undefined,
        artifactState: "rejected",
        outcome: "refuted",
        trustLevel: "untrusted",
      },
      {
        sourceState: "missing",
        failureFamily: "missing_artifact",
        reworkStatus: undefined,
        artifactState: "missing",
        outcome: "refuted",
        trustLevel: "untrusted",
      },
      {
        sourceState: "external_blocked",
        failureFamily: "external_blocker",
        reworkStatus: undefined,
        artifactState: "blocked",
        outcome: "blocked",
        trustLevel: "untrusted",
      },
      {
        sourceState: "manual_exception",
        failureFamily: "manual_exception",
        reworkStatus: "manual_exception",
        artifactState: "manual_exception",
        outcome: "waived",
        trustLevel: "weak",
      },
      {
        sourceState: "synthesis_not_ready",
        failureFamily: "synthesis_not_ready",
        reworkStatus: undefined,
        artifactState: "inconclusive",
        outcome: "inconclusive",
        trustLevel: "untrusted",
      },
      {
        sourceState: "source_inconclusive",
        failureFamily: "source_inconclusive",
        reworkStatus: undefined,
        artifactState: "inconclusive",
        outcome: "inconclusive",
        trustLevel: "untrusted",
      },
      {
        sourceState: "terminal_inconclusive",
        failureFamily: "inconclusive_batch_evidence",
        reworkStatus: "terminal_inconclusive",
        artifactState: "inconclusive",
        outcome: "inconclusive",
        trustLevel: "untrusted",
      },
    ] as const;

    for (const testCase of cases) {
      const taskId = `task-state-${testCase.sourceState}`;
      testDb.current
        .insert(tasks)
        .values({
          id: taskId,
          projectId: "proj-1",
          title: `State ${testCase.sourceState}`,
          taskIntent: "audit",
          roadmapAlias: "audit-roadmap",
          status: "done",
        })
        .run();
      createRoadmapBatchContract({
        projectId: "proj-1",
        roadmapAlias: "audit-roadmap",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: [taskId],
        artifacts: [
          {
            taskId,
            role: "report",
            artifactPath: `docs/audit/${testCase.sourceState}.md`,
          },
        ],
      });
      if (testCase.sourceState !== "expected") {
        updateRoadmapBatchArtifactState({
          taskId,
          state: testCase.sourceState,
          failureFamily: testCase.failureFamily,
          reworkStatus: testCase.reworkStatus,
          validationDetails:
            testCase.sourceState === "manual_exception"
              ? { justification: "Operator accepted the compatibility exception" }
              : { state: testCase.sourceState },
        });
      }

      const timeline = buildTaskWorkflowTimeline(taskId);

      expect(timeline?.artifacts[0]).toEqual(
        expect.objectContaining({ state: testCase.artifactState }),
      );
      expect(timeline?.claims[0]).toEqual(
        expect.objectContaining({
          outcome: testCase.outcome,
          trustLevel: testCase.trustLevel,
        }),
      );
    }
  });

  it("returns null for missing tasks", () => {
    expect(buildTaskWorkflowTimeline("missing")).toBeNull();
  });
});
