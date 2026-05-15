import { beforeEach, describe, expect, it, vi } from "vitest";
import { projects } from "@aif/shared";
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
  createTask,
  findTaskById,
  setTaskFields,
  createRoadmapBatchContract,
  listRoadmapBatchArtifacts,
  listRoadmapBatchArtifactAttempts,
  listRoadmapReportArtifactsForSynthesis,
  listValidatedRoadmapReportArtifacts,
  summarizeRoadmapBatch,
  updateRoadmapBatchArtifactState,
} = await import("../index.js");

function seedProject(id = "proj-plan-b") {
  testDb.current
    .insert(projects)
    .values({ id, name: "Plan B Data", rootPath: "/tmp/plan-b-data" })
    .run();
}

function seedAuditBatch() {
  const reportA = createTask({
    projectId: "proj-plan-b",
    title: "Audit: API",
    description: "Report artifact: audit/api.md",
    taskIntent: "audit",
  })!;
  const reportB = createTask({
    projectId: "proj-plan-b",
    title: "Audit: Shared",
    description: "Report artifact: audit/shared.md",
    taskIntent: "audit",
  })!;
  const synthesis = createTask({
    projectId: "proj-plan-b",
    title: "Synthesize audit findings",
    description: "Report artifact: audit/summary.md",
    taskIntent: "audit",
    paused: true,
  })!;
  setTaskFields(synthesis.id, {
    blockedReason: "synthesis_not_ready: waiting for validated audit batch artifacts",
  });
  const batch = createRoadmapBatchContract({
    projectId: "proj-plan-b",
    roadmapAlias: `audit-${crypto.randomUUID()}`,
    taskIntent: "audit",
    executionPolicy: "serialized_shared_checkout",
    createdTaskIds: [reportA.id, reportB.id, synthesis.id],
    synthesisTaskId: synthesis.id,
    artifacts: [
      { taskId: reportA.id, role: "report", artifactPath: "audit/api.md" },
      { taskId: reportB.id, role: "report", artifactPath: "audit/shared.md" },
      { taskId: synthesis.id, role: "synthesis", artifactPath: "audit/summary.md" },
    ],
  });
  return { batch, reportA, reportB, synthesis };
}

const trustedNoFindings = {
  evidence: {
    auditReportValidation: {
      sourceClassification: "validated_no_findings",
      manifestStatus: "valid",
      manifestVersion: 1,
    },
  },
};

describe("Plan B data regression contract", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
  });

  it("keeps synthesis paused while a child report is missing", () => {
    const { batch, reportA, reportB, synthesis } = seedAuditBatch();

    updateRoadmapBatchArtifactState({
      taskId: reportA.id,
      state: "valid",
      validationDetails: trustedNoFindings,
    });
    const blocked = updateRoadmapBatchArtifactState({
      taskId: reportB.id,
      state: "missing",
      failureFamily: "missing_artifact",
    });

    expect(blocked?.synthesisReady).toBe(false);
    expect(summarizeRoadmapBatch(batch.batchId)?.status).toBe("rework_needed");
    expect(findTaskById(synthesis.id)).toMatchObject({
      paused: true,
      blockedReason: "synthesis_not_ready: waiting for validated audit batch artifacts",
    });
  });

  it("does not release synthesis for retryable weak invalid reports", () => {
    const { reportA, reportB, synthesis } = seedAuditBatch();
    updateRoadmapBatchArtifactState({
      taskId: reportA.id,
      state: "valid",
      validationDetails: trustedNoFindings,
    });

    const weak = updateRoadmapBatchArtifactState({
      taskId: reportB.id,
      state: "invalid",
      failureFamily: "invalid_inventory_only",
      classification: "inventory_only_invalid",
      reworkStatus: "rework_requested",
      validationDetails: { issues: [{ code: "missing_substantive_evidence" }] },
    });

    expect(weak?.synthesisReady).toBe(false);
    expect(findTaskById(synthesis.id)?.paused).toBe(true);
    expect(findTaskById(synthesis.id)?.blockedReason).toContain("synthesis_not_ready");
  });

  it("releases synthesis for terminal rejected and missing source artifacts without trusting them", () => {
    const { batch, reportA, reportB, synthesis } = seedAuditBatch();
    updateRoadmapBatchArtifactState({
      taskId: reportA.id,
      state: "invalid",
      failureFamily: "invalid_artifact_content",
      classification: "inventory_only_invalid",
      reworkStatus: "terminal_inconclusive",
      validationDetails: { issues: [{ code: "missing_substantive_evidence" }] },
    });
    const ready = updateRoadmapBatchArtifactState({
      taskId: reportB.id,
      state: "missing",
      failureFamily: "missing_artifact",
      reworkStatus: "terminal_inconclusive",
      validationDetails: { reason: "report file absent after terminal attempt" },
    });

    expect(ready?.synthesisReady).toBe(true);
    expect(ready?.counts.valid).toBe(0);
    expect(listValidatedRoadmapReportArtifacts(batch.batchId)).toHaveLength(0);
    expect(listRoadmapReportArtifactsForSynthesis(batch.batchId).map((item) => item.state).sort()).toEqual([
      "invalid",
      "missing",
    ]);
    expect(findTaskById(synthesis.id)?.paused).toBe(false);
    expect(findTaskById(synthesis.id)?.blockedReason).toBeNull();
  });

  it("preserves external_blocked as a synthesis blocker", () => {
    const { batch, reportA, reportB, synthesis } = seedAuditBatch();
    updateRoadmapBatchArtifactState({
      taskId: reportA.id,
      state: "valid",
      validationDetails: trustedNoFindings,
    });
    const blocked = updateRoadmapBatchArtifactState({
      taskId: reportB.id,
      state: "external_blocked",
      failureFamily: "external_blocker",
      reworkStatus: "manual_review_required",
      validationDetails: { reason: "operator input required" },
    });

    expect(blocked?.synthesisReady).toBe(false);
    expect(summarizeRoadmapBatch(batch.batchId)?.status).toBe("external_blocked");
    expect(listRoadmapReportArtifactsForSynthesis(batch.batchId).map((item) => item.state)).toEqual([
      "valid",
    ]);
    expect(findTaskById(synthesis.id)?.paused).toBe(true);
    expect(findTaskById(synthesis.id)?.blockedReason).toContain("synthesis_not_ready");
  });

  it("ignores stale boundary updates and cannot promote a reopened child report", () => {
    const { batch, reportA, reportB, synthesis } = seedAuditBatch();
    updateRoadmapBatchArtifactState({
      taskId: reportA.id,
      state: "valid",
      validationDetails: trustedNoFindings,
    });
    updateRoadmapBatchArtifactState({
      taskId: reportB.id,
      state: "valid",
      createAttemptBoundary: true,
      attemptBoundaryId: "attempt-old",
      validationDetails: trustedNoFindings,
    });
    expect(findTaskById(synthesis.id)?.paused).toBe(false);

    updateRoadmapBatchArtifactState({
      taskId: reportB.id,
      state: "invalid",
      failureFamily: "invalid_artifact_content",
      createAttemptBoundary: true,
      attemptBoundaryId: "attempt-new",
      reworkStatus: "rework_requested",
      validationDetails: { issues: [{ code: "low_quality_report_evidence" }] },
    });
    expect(findTaskById(synthesis.id)?.paused).toBe(true);

    const stale = updateRoadmapBatchArtifactState({
      taskId: reportB.id,
      state: "valid",
      attemptBoundaryId: "attempt-old",
      validationDetails: trustedNoFindings,
    });

    expect(stale?.synthesisReady).toBe(false);
    expect(summarizeRoadmapBatch(batch.batchId)?.status).toBe("rework_needed");
    expect(findTaskById(synthesis.id)?.paused).toBe(true);
    const artifact = listRoadmapBatchArtifacts(batch.batchId).find(
      (item) => item.taskId === reportB.id,
    );
    expect(artifact?.state).toBe("invalid");
    expect(listRoadmapBatchArtifactAttempts(artifact!.id).map((attempt) => attempt.state)).toEqual([
      "valid",
      "invalid",
      "valid",
    ]);
  });

  it("releases synthesis for explicit terminal source states without trusted valid counts", () => {
    const { batch, reportA, reportB, synthesis } = seedAuditBatch();
    updateRoadmapBatchArtifactState({
      taskId: reportA.id,
      state: "terminal_inconclusive",
      failureFamily: "inconclusive_batch_evidence",
      classification: "source_inconclusive",
      reworkStatus: "terminal_inconclusive",
      validationDetails: { reason: "child report reached terminal inconclusive" },
    });
    const ready = updateRoadmapBatchArtifactState({
      taskId: reportB.id,
      state: "manual_exception",
      failureFamily: "manual_exception",
      reworkStatus: "manual_exception",
      validationDetails: { justification: "operator accepted external blocked source state" },
    });

    expect(ready?.synthesisReady).toBe(true);
    expect(ready?.counts.valid).toBe(0);
    expect(listValidatedRoadmapReportArtifacts(batch.batchId)).toHaveLength(0);
    expect(listRoadmapReportArtifactsForSynthesis(batch.batchId).map((item) => item.state).sort()).toEqual(
      ["manual_exception", "terminal_inconclusive"],
    );
    expect(findTaskById(synthesis.id)?.paused).toBe(false);
    expect(findTaskById(synthesis.id)?.blockedReason).toBeNull();
  });
});
