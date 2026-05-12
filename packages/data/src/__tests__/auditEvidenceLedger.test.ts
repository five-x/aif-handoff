import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuditEvidencePayload,
  buildAuditEvidenceUnit,
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

const { appendAuditEvidenceEvent, listAuditEvidenceEvents } = await import("../index.js");

describe("audit evidence ledger repository", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    testDb.current
      .insert(projects)
      .values({ id: "proj-1", name: "Test", rootPath: "/tmp/test" })
      .run();
    testDb.current
      .insert(tasks)
      .values({
        id: "task-1",
        projectId: "proj-1",
        title: "Audit runtime evidence",
        status: "implementing",
        position: 0,
      })
      .run();
  });

  it("appends and queries bounded audit evidence units", () => {
    const payload = buildAuditEvidencePayload({
      id: "ev-test",
      toolName: "Grep",
      evidenceKind: "search",
      evidenceGrade: "substantive",
      paths: ["src/config.ts"],
      riskHypothesisIds: ["risk-1"],
      command: "rg timeoutMs src/config.ts",
      output: "src/config.ts:1:export const timeoutMs = 1000;",
    });
    const unit = buildAuditEvidenceUnit(
      {
        taskId: "task-1",
        auditPlanId: "task:task-1",
        sourceSnapshotId: "git:commit:tree",
        scopeIds: ["src"],
      },
      payload,
    );

    const saved = appendAuditEvidenceEvent(unit);
    appendAuditEvidenceEvent(unit);

    expect(saved).toEqual(expect.objectContaining({ id: "ev-test", taskId: "task-1" }));
    expect(saved.scopeIds).toEqual(expect.arrayContaining(["src", "src/config.ts"]));
    expect(saved.riskHypothesisIds).toEqual(["risk-1"]);

    expect(listAuditEvidenceEvents({ taskId: "task-1" })).toHaveLength(1);
    expect(
      listAuditEvidenceEvents({
        taskId: "task-1",
        auditPlanId: "task:task-1",
        sourceSnapshotId: "git:commit:tree",
        evidenceIds: ["ev-test"],
      })[0],
    ).toEqual(
      expect.objectContaining({
        id: "ev-test",
        evidenceKind: "search",
        evidenceGrade: "substantive",
        outputPreview: "src/config.ts:1:export const timeoutMs = 1000;",
      }),
    );
    expect(listAuditEvidenceEvents({ taskId: "missing" })).toEqual([]);
  });
});
