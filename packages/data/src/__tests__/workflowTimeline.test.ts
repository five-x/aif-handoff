import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEvidenceUnit,
  buildEvidenceUnitPayload,
  hashAifPlanManifest,
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
  createMemoryItem,
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
        kind: "audit_report",
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

  it("builds generic task-record timelines for non-audit tasks", () => {
    const planManifest = {
      version: 1,
      taskId: "task-2",
      intent: "feature",
      scope: ["packages/data/src/index.ts"],
      allowedChanges: ["source", "tests"],
      forbiddenChanges: ["report"],
      expectedArtifacts: [{ kind: "source_diff", paths: ["packages/data/src/index.ts"] }],
      acceptanceCriteria: [
        {
          id: "AC1",
          description: "Timeline surfaces generic artifacts.",
          verification:
            "npm.cmd test --workspace=@aif/data -- --run src/__tests__/workflowTimeline.test.ts",
        },
      ],
      verificationCommands: [
        "npm.cmd test --workspace=@aif/data -- --run src/__tests__/workflowTimeline.test.ts",
      ],
    };
    const plan = [
      "```aif-plan-manifest",
      JSON.stringify(planManifest),
      "```",
      "",
      "## Plan",
      "- [x] Build generic timeline",
    ].join("\n");
    const implementationManifestJson = JSON.stringify({
      version: 1,
      taskId: "task-2",
      intent: "feature",
      planManifestHash: hashAifPlanManifest(plan),
      changedFiles: [{ path: "packages/data/src/index.ts", status: "modified" }],
      diffSummary: {
        summary: "Changed packages/data/src/index.ts",
        filesChanged: 1,
      },
      verificationEvidence: [
        {
          id: "verify-workflow-timeline",
          command:
            "npm.cmd test --workspace=@aif/data -- --run src/__tests__/workflowTimeline.test.ts",
          status: "passed",
          outputSha256: "a".repeat(64),
          outputPreview: "tests passed",
          outputPreviewTruncated: false,
        },
      ],
      acceptanceCriteria: [
        {
          id: "AC1",
          description: "Timeline surfaces generic artifacts.",
          status: "satisfied",
          evidenceRefs: ["verify-workflow-timeline"],
        },
      ],
      evidenceRefs: ["verify-workflow-timeline"],
      planChecklist: { total: 1, completed: 1, pending: 0, synced: true, pendingItems: [] },
      reviewClosure: { status: "passed", evidenceRefs: ["verify-workflow-timeline"] },
      commitEvidence: { status: "not_committed", evidenceRefs: [] },
      knownLimitations: [],
    });

    testDb.current
      .insert(tasks)
      .values({
        id: "task-2",
        projectId: "proj-1",
        title: "Feature task",
        taskIntent: "feature",
        status: "verified",
        branchName: "feature/task-2",
        worktreePath: "/tmp/task-2",
        plannerMode: "full",
        plan,
        implementationLog: "Changed packages/data/src/index.ts\nTests: npm test passed",
        implementationManifestJson,
        reviewComments: "Review passed. Security review found no additional issues.",
      })
      .run();
    createMemoryItem({
      projectId: "proj-1",
      scope: "project",
      sourceTaskId: "task-2",
      sourceKind: "task",
      sourceRef: "docs/memory/tasks/task-2.md",
      title: "Timeline memory",
      summary: "Generic timeline behavior was implemented.",
      content: "Generic task timelines project deterministic task-record metadata.",
    });
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
          sourceKind: "task_record",
        }),
      }),
    );
    expect(timeline?.artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining([
        "plan",
        "plan_manifest",
        "implementation_manifest",
        "source_diff",
        "test_result",
        "review_report",
        "security_report",
        "memory_candidate",
        "commit_evidence",
      ]),
    );
    const memoryArtifact = timeline?.artifacts.find((artifact) => artifact.kind === "memory_candidate");
    expect(timeline?.claims.find((claim) => claim.artifactId === memoryArtifact?.id)).toEqual(
      expect.objectContaining({ trustLevel: "weak", outcome: "not_evaluated" }),
    );
    const trustedArtifacts = timeline?.artifacts.filter((artifact) =>
      timeline.claims.some(
        (claim) => claim.artifactId === artifact.id && claim.trustLevel === "trusted",
      ),
    );
    expect(trustedArtifacts?.length).toBeGreaterThan(0);
    for (const artifact of trustedArtifacts ?? []) {
      expect(timeline?.attempts.some((attempt) => attempt.artifactId === artifact.id)).toBe(true);
    }
    expect(timeline?.evidence.map((unit) => unit.id)).not.toContain("ev-feature");
    expect(timeline?.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining([
        "artifact_created",
        "attempt_recorded",
        "claim_evaluated",
        "evidence_recorded",
      ]),
    );
  });

  it("does not trust implementation logs as implementation manifests", () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-implementation-log-only",
        projectId: "proj-1",
        title: "Feature with legacy log only",
        taskIntent: "feature",
        status: "verified",
        implementationLog: "Changed packages/data/src/index.ts\nTests: npm test passed",
      })
      .run();

    const timeline = buildTaskWorkflowTimeline("task-implementation-log-only");
    const manifestArtifact = timeline?.artifacts.find(
      (artifact) => artifact.kind === "implementation_manifest",
    );
    const manifestClaim = timeline?.claims.find(
      (claim) => claim.artifactId === manifestArtifact?.id,
    );

    expect(manifestArtifact).toEqual(
      expect.objectContaining({
        state: "missing",
        metadata: expect.objectContaining({
          reasonCodes: ["missing_implementation_manifest"],
        }),
      }),
    );
    expect(manifestClaim).toEqual(expect.objectContaining({ outcome: "refuted" }));
    expect(timeline?.artifacts.map((artifact) => artifact.kind)).not.toContain("source_diff");
    expect(timeline?.artifacts.map((artifact) => artifact.kind)).not.toContain("test_result");
  });

  it("links blocked generic task evidence to a blocker claim", () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-blocked",
        projectId: "proj-1",
        title: "Blocked task",
        taskIntent: "feature",
        status: "blocked_external",
        blockedReason: "operator_input_required: provide API fixture",
        manualReviewRequired: true,
      })
      .run();

    const timeline = buildTaskWorkflowTimeline("task-blocked");
    const blockerClaim = timeline?.claims.find((claim) => claim.outcome === "blocked");
    const blockerEvidence = timeline?.evidence.find((unit) =>
      unit.summary?.includes("operator_input_required"),
    );

    expect(blockerClaim).toBeDefined();
    expect(blockerEvidence).toBeDefined();
    expect(timeline?.evidenceLinks).toContainEqual(
      expect.objectContaining({
        evidenceId: blockerEvidence?.id,
        claimId: blockerClaim?.id,
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
    expect(timeline?.artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining(["audit_report", "audit_synthesis"]),
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
      if (testCase.sourceState === "manual_exception") {
        expect(timeline?.claims[0].metadata).toEqual(
          expect.objectContaining({
            validationDetails: expect.objectContaining({
              justification: "Operator accepted the compatibility exception",
            }),
          }),
        );
      }
    }
  });

  it("returns null for missing tasks", () => {
    expect(buildTaskWorkflowTimeline("missing")).toBeNull();
  });
});
