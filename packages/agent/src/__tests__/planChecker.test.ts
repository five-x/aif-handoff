import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  PLAN_MANIFEST_REQUIRED_CREATED_AT,
  TaskPlanQualityError,
  evaluateTaskPlanQuality,
  projects,
  tasks,
} from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };
const queryMock = vi.fn();
(globalThis as { __AIF_CLAUDE_QUERY_MOCK__?: typeof queryMock }).__AIF_CLAUDE_QUERY_MOCK__ =
  queryMock;

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
}));

const { createRoadmapBatchContract, updateRoadmapBatchArtifactState } = await import("@aif/data");

const {
  runPlanChecker,
  normalizeMarkdownFence,
  hasChecklistItems,
  countConvertibleBullets,
  convertBulletsToCheckboxes,
  isPlanAlreadyChecklist,
} = await import("../subagents/planChecker.js");

function streamSuccess(result: string): AsyncIterable<{
  type: "result";
  subtype: "success";
  result: string;
}> {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: "result", subtype: "success", result };
    },
  };
}

function validPlanManifest(taskId: string): string {
  return [
    "```aif-plan-manifest",
    JSON.stringify(
      {
        version: 1,
        taskId,
        intent: "feature",
        scope: ["packages/shared/src/planQuality.ts"],
        allowedChanges: ["source", "tests"],
        forbiddenChanges: ["report", "unrelated modules", "secrets"],
        expectedArtifacts: [{ kind: "source_diff", paths: ["packages/shared/src/planQuality.ts"] }],
        acceptanceCriteria: [
          {
            id: "ac-1",
            description: "Plan checker accepts manifest-backed full-mode plans.",
            verification:
              "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planChecker.test.ts",
          },
        ],
        verificationCommands: [
          "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planChecker.test.ts",
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

describe("normalizeMarkdownFence", () => {
  it("extracts content from markdown fenced block", () => {
    expect(normalizeMarkdownFence("```markdown\n## Plan\n- [ ] A\n```")).toBe("## Plan\n- [ ] A");
  });

  it("preserves internal plan manifest fences", () => {
    const plan = ["## Plan", "", validPlanManifest("task-full-valid-manifest"), "", "- [ ] A"].join(
      "\n",
    );
    expect(normalizeMarkdownFence(plan)).toBe(plan);
  });

  it("returns trimmed text when no fence present", () => {
    expect(normalizeMarkdownFence("  ## Plan\n- [ ] A  ")).toBe("## Plan\n- [ ] A");
  });
});

describe("hasChecklistItems", () => {
  it("detects unchecked items", () => {
    expect(hasChecklistItems("- [ ] Do thing")).toBe(true);
  });

  it("detects checked items", () => {
    expect(hasChecklistItems("- [x] Done")).toBe(true);
  });

  it("rejects plain bullets", () => {
    expect(hasChecklistItems("- plain bullet")).toBe(false);
  });
});

describe("countConvertibleBullets", () => {
  it("counts plain bullets that could become checkboxes", () => {
    const plan = "- [ ] Already checkbox\n- Plain bullet item\n- Another plain item\n- ab";
    expect(countConvertibleBullets(plan)).toBe(2); // "ab" is too short (<=3)
  });

  it("returns 0 when all bullets are checkboxes", () => {
    const plan = "- [ ] A thing\n- [x] Done thing";
    expect(countConvertibleBullets(plan)).toBe(0);
  });
});

describe("convertBulletsToCheckboxes", () => {
  it("converts plain bullets to unchecked checkboxes", () => {
    expect(convertBulletsToCheckboxes("- Do thing")).toBe("- [ ] Do thing");
    expect(convertBulletsToCheckboxes("* Another")).toBe("* [ ] Another");
  });

  it("preserves existing checkboxes", () => {
    expect(convertBulletsToCheckboxes("- [ ] Already")).toBe("- [ ] Already");
    expect(convertBulletsToCheckboxes("- [x] Done")).toBe("- [x] Done");
  });

  it("preserves indentation", () => {
    expect(convertBulletsToCheckboxes("  - Indented")).toBe("  - [ ] Indented");
  });
});

describe("isPlanAlreadyChecklist", () => {
  it("returns true when all items are checkboxes", () => {
    expect(isPlanAlreadyChecklist("## Plan\n- [ ] A\n- [x] B")).toBe(true);
  });

  it("returns false when plain bullets exist", () => {
    expect(isPlanAlreadyChecklist("- [ ] A\n- Plain bullet")).toBe(false);
  });

  it("returns false when no checklist items at all", () => {
    expect(isPlanAlreadyChecklist("## Just a heading")).toBe(false);
  });
});

describe("runPlanChecker", () => {
  beforeEach(() => {
    (globalThis as { __AIF_CLAUDE_QUERY_MOCK__?: typeof queryMock }).__AIF_CLAUDE_QUERY_MOCK__ =
      queryMock;
    testDb.current = createTestDb();
    queryMock.mockReset();

    testDb.current
      .insert(projects)
      .values({
        id: "project-1",
        name: "Test",
        rootPath: "/tmp/plan-checker-test",
      })
      .run();
  });

  it("skips LLM call when plan already has proper checklist format", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-skip",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "plan_ready",
        plan: "## Plan\n- [ ] Step 1\n- [x] Step 2",
      })
      .run();

    await runPlanChecker("task-skip", "/tmp/plan-checker-test");

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects new full-mode checklist plans that omit a plan manifest", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-full-missing-manifest",
        projectId: "project-1",
        title: "Full mode manifest",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
        status: "plan_ready",
        plan: [
          "## Plan",
          "- [ ] Update packages/shared/src/planQuality.ts with the manifest guard.",
          "- [ ] Run npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planChecker.test.ts.",
        ].join("\n"),
      })
      .run();

    await expect(
      runPlanChecker("task-full-missing-manifest", "/tmp/plan-checker-test"),
    ).rejects.toBeInstanceOf(TaskPlanQualityError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("keeps pre-rollout full-mode checklist plans compatible when no manifest is present", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-old-full-compatible",
        projectId: "project-1",
        title: "Old full mode task",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: "2026-05-15T23:59:59.000Z",
        status: "plan_ready",
        plan: [
          "## Plan",
          "- [ ] Update packages/shared/src/planQuality.ts with a focused guard.",
          "- [ ] Run npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planChecker.test.ts.",
        ].join("\n"),
      })
      .run();

    await runPlanChecker("task-old-full-compatible", "/tmp/plan-checker-test");

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("requires manifests for pre-rollout full-mode tasks after plan-quality replanning feedback", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-old-full-replanned",
        projectId: "project-1",
        title: "Old full mode replan",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: "2026-05-15T23:59:59.000Z",
        blockedFromStatus: "plan_ready",
        blockedReason: "Plan quality guard replan 1/100: previous feedback",
        status: "plan_ready",
        plan: [
          "## Plan",
          "- [ ] Update packages/shared/src/planQuality.ts with a focused guard.",
          "- [ ] Run npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planChecker.test.ts.",
        ].join("\n"),
      })
      .run();

    await expect(
      runPlanChecker("task-old-full-replanned", "/tmp/plan-checker-test"),
    ).rejects.toBeInstanceOf(TaskPlanQualityError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("accepts new full-mode checklist plans with a valid plan manifest", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-full-valid-manifest",
        projectId: "project-1",
        title: "Full mode manifest",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
        status: "plan_ready",
        plan: [
          "## Plan",
          "",
          validPlanManifest("task-full-valid-manifest"),
          "",
          "- [ ] Update packages/shared/src/planQuality.ts with the manifest guard.",
          "- [ ] Run npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planChecker.test.ts.",
        ].join("\n"),
      })
      .run();

    await runPlanChecker("task-full-valid-manifest", "/tmp/plan-checker-test");

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("persists LLM plans with internal plan manifest fences", async () => {
    const returnedPlan = [
      "## Plan",
      "",
      validPlanManifest("task-full-returned-manifest"),
      "",
      "- [ ] Update packages/shared/src/planQuality.ts with the manifest guard.",
      "- [ ] Run npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planChecker.test.ts.",
    ].join("\n");
    queryMock.mockReturnValue(streamSuccess(returnedPlan));

    testDb.current
      .insert(tasks)
      .values({
        id: "task-full-returned-manifest",
        projectId: "project-1",
        title: "Full mode manifest from checker",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
        status: "plan_ready",
        plan: "## Plan\nConvert the prose plan for packages/shared/src/planQuality.ts into checklist steps.",
      })
      .run();

    await runPlanChecker("task-full-returned-manifest", "/tmp/plan-checker-test");

    const row = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-full-returned-manifest"))
      .get();
    expect(row?.plan).toBe(returnedPlan);
    expect(row?.plan).toContain("```aif-plan-manifest");
    expect(queryMock).toHaveBeenCalled();
  });

  it("converts plain bullets locally and skips LLM when mixed plan", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-local",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "plan_ready",
        plan: "## Plan\n- [ ] Checkbox item\n- Plain bullet item",
      })
      .run();

    await runPlanChecker("task-local", "/tmp/plan-checker-test");

    expect(queryMock).not.toHaveBeenCalled();
    const row = testDb.current.select().from(tasks).where(eq(tasks.id, "task-local")).get();
    expect(row?.plan).toContain("- [ ] Plain bullet item");
  });

  it("uses local fallback when LLM returns non-plan content", async () => {
    queryMock.mockReturnValue(streamSuccess("I cannot help with that request."));

    testDb.current
      .insert(tasks)
      .values({
        id: "task-fallback",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "plan_ready",
        plan: "- Implement feature A\n- Write tests for A",
      })
      .run();

    await runPlanChecker("task-fallback", "/tmp/plan-checker-test");

    const row = testDb.current.select().from(tasks).where(eq(tasks.id, "task-fallback")).get();
    expect(row?.plan).toContain("- [ ] Implement feature A");
  });

  it("rejects local fallback conversion when the converted checklist is generic", async () => {
    queryMock.mockReturnValue(streamSuccess("I cannot help with that request."));

    testDb.current
      .insert(tasks)
      .values({
        id: "task-generic-fallback",
        projectId: "project-1",
        title: "Planner quality",
        description: "Desc",
        status: "plan_ready",
        plan: "- Do task",
      })
      .run();

    await expect(
      runPlanChecker("task-generic-fallback", "/tmp/plan-checker-test"),
    ).rejects.toBeInstanceOf(TaskPlanQualityError);

    const row = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-generic-fallback"))
      .get();
    expect(row?.plan).toBe("- Do task");
  });

  it("runs without explicit agent override", async () => {
    queryMock.mockReturnValue(streamSuccess("## Plan\n- [ ] Keep this"));

    testDb.current
      .insert(tasks)
      .values({
        id: "task-1",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "plan_ready",
        plan: "## Plan\n- Existing item that needs conversion and is long enough",
      })
      .run();

    await runPlanChecker("task-1", "/tmp/plan-checker-test");

    const call = queryMock.mock.calls[0]?.[0] as {
      options?: { extraArgs?: { agent?: string } };
    };
    expect(call.options?.extraArgs).toBeUndefined();
  });

  it("rejects existing plan when checker returns non-checklist junk and local fallback also fails", async () => {
    queryMock.mockReturnValue(
      streamSuccess(`/
├── index.html
└── .ai-factory/
    └── PLAN.md`),
    );

    // Plan has no bullets at all — pure prose — so local fallback can't help
    testDb.current
      .insert(tasks)
      .values({
        id: "task-2",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "plan_ready",
        plan: "Implement the feature by editing main.ts and adding the handler.\nThen write tests.",
      })
      .run();

    await expect(runPlanChecker("task-2", "/tmp/plan-checker-test")).rejects.toBeInstanceOf(
      TaskPlanQualityError,
    );

    const row = testDb.current.select().from(tasks).where(eq(tasks.id, "task-2")).get();
    expect(row?.plan).toBe(
      "Implement the feature by editing main.ts and adding the handler.\nThen write tests.",
    );
  });

  it("rejects slash fallback echo before implementation", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-slash-echo",
        projectId: "project-1",
        title: "Planner quality",
        description: "Desc",
        status: "plan_ready",
        plan: "## Plan\n- [ ] /aif-plan fast @.ai-factory/PLAN.md docs:false tests:false",
      })
      .run();

    await expect(
      runPlanChecker("task-slash-echo", "/tmp/plan-checker-test"),
    ).rejects.toBeInstanceOf(TaskPlanQualityError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects weak broad audit plans before implementation", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-weak-audit",
        projectId: "project-1",
        title: "Audit the whole repository",
        taskIntent: "audit",
        description:
          "Run a comprehensive audit of the entire repo. Report artifact: audit/full-repo-audit.md.",
        status: "plan_ready",
        plan: [
          "## Plan",
          "- [ ] Keep this diagnostic-only and do not implement fixes.",
          "- [ ] Write findings to `audit/full-repo-audit.md`.",
          "- [ ] Summarize results.",
        ].join("\n"),
      })
      .run();

    await expect(runPlanChecker("task-weak-audit", "/tmp/plan-checker-test")).rejects.toThrow(
      TaskPlanQualityError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects synthesis-only broad audit plans that target only the final report artifact", async () => {
    testDb.current
      .insert(tasks)
      .values({
        id: "task-final-report-only-synthesis",
        projectId: "project-1",
        title: "Comprehensive repository audit",
        taskIntent: "audit",
        description:
          "Audit the entire repo for security and reliability. Report artifact: audit/final-synthesis.md.",
        status: "plan_ready",
        plan: [
          "## Decomposed audit synthesis plan",
          "Report artifact: `audit/final-synthesis.md`",
          "Scope: existing completed child audit reports.",
          "Scoped evidence targets: `audit/final-synthesis.md`; existing completed child audit reports.",
          "Excluded areas: generated files, dependency caches, and build output.",
          "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
          "Child reports: required existing completed child audit reports plus final synthesis.",
          "Synthesis: combine existing completed child audit reports into `audit/final-synthesis.md`.",
          "- [ ] Keep this diagnostic-only and do not implement fixes.",
          "- [ ] Read the existing completed child audit reports.",
          "- [ ] Produce synthesis report `audit/final-synthesis.md`.",
        ].join("\n"),
      })
      .run();

    await expect(
      runPlanChecker("task-final-report-only-synthesis", "/tmp/plan-checker-test"),
    ).rejects.toThrow(TaskPlanQualityError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("replaces weak synthesis plans with exact registry-derived source report artifact paths", async () => {
    testDb.current
      .insert(tasks)
      .values([
        {
          id: "task-source-a",
          projectId: "project-1",
          title: "Audit source A",
          taskIntent: "audit",
          description: "Report artifact: audit/source-a.md",
          status: "done",
        },
        {
          id: "task-source-b",
          projectId: "project-1",
          title: "Audit source B",
          taskIntent: "audit",
          description: "Report artifact: audit/source-b.md",
          status: "done",
        },
        {
          id: "task-synthesis-exact",
          projectId: "project-1",
          title: "Synthesize audit findings",
          taskIntent: "audit",
          description: "Report artifact: audit/final-synthesis.md.",
          status: "plan_ready",
          plan: [
            "## Decomposed audit synthesis plan",
            "Report artifact: `audit/final-synthesis.md`",
            "Scope: existing completed child audit reports.",
            "Scoped evidence targets: `audit/final-synthesis.md`; existing completed child audit reports.",
            "Excluded areas: generated files, dependency caches, and build output.",
            "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
            "Child reports: required existing completed child audit reports plus final synthesis.",
            "- [ ] Keep this diagnostic-only and do not implement fixes.",
            "- [ ] Produce synthesis report `audit/final-synthesis.md`.",
          ].join("\n"),
        },
      ])
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-exact",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-source-a", "task-source-b", "task-synthesis-exact"],
      synthesisTaskId: "task-synthesis-exact",
      artifacts: [
        { taskId: "task-source-a", role: "report", artifactPath: "audit/source-a.md" },
        { taskId: "task-source-b", role: "report", artifactPath: "audit/source-b.md" },
        {
          taskId: "task-synthesis-exact",
          role: "synthesis",
          artifactPath: "audit/final-synthesis.md",
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-source-a",
      state: "valid",
      validationDetails: {
        evidence: {
          auditReportValidation: {
            sourceClassification: "validated_no_findings",
            manifestStatus: "valid",
          },
        },
      },
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-source-b",
      state: "source_inconclusive",
      failureFamily: "source_inconclusive",
      classification: "source_inconclusive",
      reworkStatus: "terminal_inconclusive",
      validationDetails: { reason: "terminal source inconclusive" },
    });

    await runPlanChecker("task-synthesis-exact", "/tmp/plan-checker-test");

    expect(queryMock).not.toHaveBeenCalled();
    const row = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-synthesis-exact"))
      .get();
    expect(row?.plan).toContain("## Deterministic audit synthesis plan");
    expect(row?.plan).toContain("audit/source-a.md");
    expect(row?.plan).toContain("audit/source-b.md");
    expect(row?.plan).toContain("Source report status: 1 trusted, 1 untrusted");
    expect(row?.plan).toContain("child report status table");
  });

  it("replaces invalid diagnostic audit plans with a deterministic fallback", async () => {
    const description =
      "Diagnostic only. Scope: packages/shared/src/planQuality.ts. Do not implement fixes. Do not create follow-up tasks. Produce a committed report at: audit/2026-05-08-initial-audit.md.";

    testDb.current
      .insert(tasks)
      .values({
        id: "task-diagnostic-fallback",
        projectId: "project-1",
        title: "Audit",
        taskIntent: "audit",
        description,
        status: "plan_ready",
        plan: [
          "</think>",
          "",
          "Here is the plan for the Short task.",
          "",
          "<aif-plan fast @.ai-factory/PLAN.md docs:false tests:false",
        ].join("\n"),
      })
      .run();

    await runPlanChecker("task-diagnostic-fallback", "/tmp/plan-checker-test");

    expect(queryMock).not.toHaveBeenCalled();
    const row = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-diagnostic-fallback"))
      .get();
    expect(row?.plan).toContain("## Diagnostic-only plan");
    expect(row?.plan).toContain("audit/2026-05-08-initial-audit.md");
    expect(row?.plan).toContain("Scoped evidence targets:");
    expect(row?.plan).toContain("Excluded areas:");
    expect(row?.plan).toContain("Expected report structure:");
    expect(row?.plan).toContain("Child audit reports: not required");
    expect(row?.plan).toContain("do not implement fixes");
    expect(row?.plan).not.toContain("<aif-plan");
    expect(
      evaluateTaskPlanQuality({
        task: { title: "Audit", taskIntent: "audit", description },
        plan: row?.plan,
      }).ok,
    ).toBe(true);
  });

  it("does not replace report-only audit plans with deterministic fallback", async () => {
    const description =
      "Diagnostic only. Do not implement fixes. Report artifact: audit/report-only-audit.md.";

    testDb.current
      .insert(tasks)
      .values({
        id: "task-report-only-diagnostic-fallback",
        projectId: "project-1",
        title: "Audit",
        taskIntent: "audit",
        description,
        status: "plan_ready",
        plan: [
          "## Report-only audit plan",
          "Report artifact: `audit/report-only-audit.md`",
          "Scope: audit report.",
          "Scoped evidence targets: `audit/report-only-audit.md`.",
          "Excluded areas: none.",
          "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
          "Child audit reports: not required for this narrow source report.",
          "- [ ] Keep this diagnostic-only and do not implement fixes.",
          "- [ ] Update `audit/report-only-audit.md`.",
        ].join("\n"),
      })
      .run();

    await expect(
      runPlanChecker("task-report-only-diagnostic-fallback", "/tmp/plan-checker-test"),
    ).rejects.toBeInstanceOf(TaskPlanQualityError);

    expect(queryMock).not.toHaveBeenCalled();
    const row = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-report-only-diagnostic-fallback"))
      .get();
    expect(row?.plan).toContain("Report-only audit plan");
  });

  it("does not replace broad decomposition-required audit plans with deterministic fallback", async () => {
    const description =
      "Diagnostic only. Run a comprehensive audit of the entire repo for security and reliability. Report artifact: audit/full-repo-audit.md.";

    testDb.current
      .insert(tasks)
      .values({
        id: "task-broad-diagnostic-fallback",
        projectId: "project-1",
        title: "Audit the entire repository",
        taskIntent: "audit",
        description,
        status: "plan_ready",
        plan: [
          "## Weak broad audit plan",
          "- [ ] Keep this diagnostic-only and do not implement fixes.",
          "- [ ] Write findings to `audit/full-repo-audit.md`.",
        ].join("\n"),
      })
      .run();

    await expect(
      runPlanChecker("task-broad-diagnostic-fallback", "/tmp/plan-checker-test"),
    ).rejects.toBeInstanceOf(TaskPlanQualityError);

    expect(queryMock).not.toHaveBeenCalled();
    const row = testDb.current
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-broad-diagnostic-fallback"))
      .get();
    expect(row?.plan).toContain("Weak broad audit plan");
  });

  it("accepts fenced markdown and persists valid checklist plan", async () => {
    queryMock.mockReturnValue(
      streamSuccess(
        "```markdown\n## Good Plan\n- [ ] Implement step 1 logic\n- [x] Mark the done section as complete\n```",
      ),
    );

    // Plan with prose-only content so it can't be short-circuited
    testDb.current
      .insert(tasks)
      .values({
        id: "task-3",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "plan_ready",
        plan: "## Good Plan\nImplement step 1 logic.\nMark the done section as complete.",
      })
      .run();

    await runPlanChecker("task-3", "/tmp/plan-checker-test");

    const row = testDb.current.select().from(tasks).where(eq(tasks.id, "task-3")).get();
    expect(row?.plan).toBe(
      "## Good Plan\n- [ ] Implement step 1 logic\n- [x] Mark the done section as complete",
    );
  });

  it("writes plan file to custom planPath instead of default PLAN.md", async () => {
    const projectRoot = join("/tmp", `plan-checker-planpath-${Date.now()}`);
    mkdirSync(projectRoot, { recursive: true });

    queryMock.mockReturnValue(
      streamSuccess("## Custom\n- [ ] Implement step 1 logic\n- [x] Mark done section complete"),
    );

    testDb.current
      .insert(projects)
      .values({
        id: "project-planpath",
        name: "PlanPath Test",
        rootPath: projectRoot,
      })
      .run();

    testDb.current
      .insert(tasks)
      .values({
        id: "task-planpath",
        projectId: "project-planpath",
        title: "Task with planPath",
        description: "Desc",
        status: "plan_ready",
        plan: "## Custom\nImplement step 1 logic.\nMark done section complete.",
        planPath: "docs/MY_PLAN.md",
      })
      .run();

    await runPlanChecker("task-planpath", projectRoot);

    const customPlanFile = join(projectRoot, "docs/MY_PLAN.md");
    const defaultPlanFile = join(projectRoot, ".ai-factory/PLAN.md");

    expect(existsSync(customPlanFile)).toBe(true);
    expect(existsSync(defaultPlanFile)).toBe(false);

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("writes plan to FIX_PLAN.md when task.isFix is true", async () => {
    const projectRoot = join("/tmp", `plan-checker-fix-${Date.now()}`);
    mkdirSync(projectRoot, { recursive: true });

    queryMock.mockReturnValue(
      streamSuccess("## Fix\n- [ ] Patch the bug in handler\n- [x] Verify it is done"),
    );

    testDb.current
      .insert(projects)
      .values({
        id: "project-fix",
        name: "Fix Test",
        rootPath: projectRoot,
      })
      .run();

    testDb.current
      .insert(tasks)
      .values({
        id: "task-fix",
        projectId: "project-fix",
        title: "Fix task",
        description: "Desc",
        status: "plan_ready",
        plan: "## Fix\nPatch the bug in handler.\nVerify it is done.",
        isFix: true,
      })
      .run();

    await runPlanChecker("task-fix", projectRoot);

    const fixPlanFile = join(projectRoot, ".ai-factory/FIX_PLAN.md");
    const defaultPlanFile = join(projectRoot, ".ai-factory/PLAN.md");

    expect(existsSync(fixPlanFile)).toBe(true);
    expect(existsSync(defaultPlanFile)).toBe(false);

    rmSync(projectRoot, { recursive: true, force: true });
  });
});
