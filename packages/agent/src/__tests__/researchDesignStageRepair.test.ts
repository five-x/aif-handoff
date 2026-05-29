import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projects, taskStageArtifacts, tasks } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };
const { executeSubagentQueryMock } = vi.hoisted(() => ({
  executeSubagentQueryMock: vi.fn(),
}));

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("../subagentQuery.js", () => ({
  executeSubagentQuery: executeSubagentQueryMock,
  startHeartbeat: () => setInterval(() => undefined, 60_000),
}));

const { runResearchDesignStage } = await import("../subagents/researchDesignStage.js");
const { findTaskById } = await import("@aif/data");

function seedProject(): void {
  testDb.current
    .insert(projects)
    .values({ id: "stage-repair-project", name: "Stage Repair", rootPath: "/tmp/stage-repair" })
    .run();
}

function seedTask(id: string, status: "research" | "design" = "research"): void {
  testDb.current
    .insert(tasks)
    .values({
      id,
      projectId: "stage-repair-project",
      title: id,
      description: "Task with stage artifact formatting checks.",
      status,
    })
    .run();
}

function stageArtifact(stage: "research" | "design"): string {
  return [
    "```aif-stage-artifact",
    JSON.stringify({
      version: 1,
      stage,
      status: "accepted",
      summary: `${stage} recovered from format repair.`,
      markdown: `# ${stage}\n\nRecovered artifact.`,
      questions: [],
    }),
    "```",
  ].join("\n");
}

function currentArtifact(taskId: string, stage: "research" | "design") {
  return testDb.current
    .select()
    .from(taskStageArtifacts)
    .where(
      and(
        eq(taskStageArtifacts.taskId, taskId),
        eq(taskStageArtifacts.stage, stage),
        eq(taskStageArtifacts.kind, stage),
      ),
    )
    .get();
}

describe("research/design stage artifact format repair", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
    executeSubagentQueryMock.mockReset();
  });

  it("repairs a substantive research response that omitted the required artifact fence", async () => {
    seedTask("research-format-repair");
    executeSubagentQueryMock
      .mockResolvedValueOnce({
        resultText:
          "# Research\n\n- The requirements are sufficient for a first implementation pass.",
      })
      .mockResolvedValueOnce({ resultText: stageArtifact("research") });

    await runResearchDesignStage("research", "research-format-repair", "/tmp/stage-repair");

    expect(executeSubagentQueryMock).toHaveBeenCalledTimes(2);
    const repairCall = executeSubagentQueryMock.mock.calls[1]?.[0] as {
      agentName?: string;
      maxTurns?: number;
      workflowSpec?: { sessionReusePolicy?: string };
    };
    expect(repairCall.agentName).toBe("research-stage-format-repair");
    expect(repairCall.maxTurns).toBe(2);
    expect(repairCall.workflowSpec?.sessionReusePolicy).toBe("new_session");

    const artifact = currentArtifact("research-format-repair", "research");
    expect(artifact).toMatchObject({
      state: "accepted",
      summary: "research recovered from format repair.",
      markdown: "# research\n\nRecovered artifact.",
    });
    const metadata = JSON.parse(artifact?.metadataJson ?? "{}") as Record<string, unknown>;
    expect(metadata.formatRepair).toBe(true);
    expect(metadata.initialParserError).toMatch(/aif-stage-artifact/i);
    expect(metadata.repairPromptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(findTaskById("research-format-repair")?.blockedReason).toBeNull();
  });

  it("still rejects the stage when the repair pass is not machine-readable", async () => {
    seedTask("research-format-repair-fails");
    executeSubagentQueryMock
      .mockResolvedValueOnce({ resultText: "# Research\n\nNo fenced artifact." })
      .mockResolvedValueOnce({ resultText: "# Still not parseable" });

    await expect(
      runResearchDesignStage("research", "research-format-repair-fails", "/tmp/stage-repair"),
    ).rejects.toThrow(/format repair failed/i);

    const artifact = currentArtifact("research-format-repair-fails", "research");
    expect(artifact).toMatchObject({
      state: "rejected",
      summary: expect.stringContaining("failed validation"),
    });
    const metadata = JSON.parse(artifact?.metadataJson ?? "{}") as Record<string, unknown>;
    expect(metadata.formatRepairAttempted).toBe(true);
    expect(metadata.parserError).toMatch(/Repair parser error/i);
  });
});
