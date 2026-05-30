import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAN_MANIFEST_REQUIRED_CREATED_AT,
  TaskPlanQualityError,
  projects,
  resetEnvCache,
  taskComments,
  taskRequirementQuestions,
  tasks,
} from "@aif/shared";
import { createTestDb } from "@aif/shared/server";
import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

const { runPlanner } = await import("../subagents/planner.js");
const {
  createCurrentRequirementsSnapshot,
  createRoadmapBatchContract,
  findTaskById,
  recordTaskStageArtifactAttempt,
} = await import("@aif/data");

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

function fullModePlan(input: {
  taskId: string;
  intent?: "general" | "feature";
  scope?: string[];
  allowedChanges?: string[];
  forbiddenChanges?: string[];
  verificationCommand?: string;
}): string {
  const intent = input.intent ?? "general";
  const scope = input.scope ?? ["src/main.ts"];
  const verificationCommand = input.verificationCommand ?? "npm.cmd run build";
  return [
    "## Plan",
    `- [ ] Update ${scope[0]} for ${input.taskId} within the declared task scope.`,
    `- [ ] Run ${verificationCommand} and record the result.`,
    "",
    "```aif-plan-manifest",
    JSON.stringify(
      {
        version: 1,
        taskId: input.taskId,
        intent,
        scope,
        allowedChanges: input.allowedChanges ?? ["source"],
        forbiddenChanges: input.forbiddenChanges ?? ["report"],
        expectedArtifacts: [{ kind: "source_diff", paths: scope }],
        acceptanceCriteria: [
          {
            id: "ac-1",
            description: "The task-specific implementation delta is complete.",
            verification: verificationCommand,
          },
        ],
        verificationCommands: [verificationCommand],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

describe("runPlanner comment selection", () => {
  beforeEach(() => {
    (globalThis as { __AIF_CLAUDE_QUERY_MOCK__?: typeof queryMock }).__AIF_CLAUDE_QUERY_MOCK__ =
      queryMock;
    testDb.current = createTestDb();
    delete process.env.AIF_TASK_WORKTREES_ENABLED;
    resetEnvCache();
    queryMock.mockReset();
    queryMock.mockReturnValue(streamSuccess("## New Plan\n- [ ] Step"));

    testDb.current
      .insert(projects)
      .values({
        id: "project-1",
        name: "Test",
        rootPath: "/tmp/planner-test",
      })
      .run();
  });

  it("uses only the latest comment in replanning prompt", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-1",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "planning",
        plan: "Old plan",
        useSubagents: true,
      })
      .run();

    for (let i = 1; i <= 12; i += 1) {
      db.insert(taskComments)
        .values({
          id: `c-${String(i).padStart(2, "0")}`,
          taskId: "task-1",
          author: "human",
          message: `comment-${String(i).padStart(2, "0")}`,
          attachments: "[]",
          createdAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        })
        .run();
    }

    await runPlanner("task-1", "/tmp/planner-test");

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).not.toContain("/aif-plan");
    expect(call.prompt).toContain("Mode: fast, tests: false, docs: false.");
    expect(call.prompt).toContain("Plan file reference: @.ai-factory/PLAN.md");
    expect(call.prompt).toContain("Filesystem plan path: .ai-factory/PLAN.md");
    expect(call.prompt).toContain("Fast-mode planning compatibility");
    expect(call.prompt).toContain("do not require an aif-plan-manifest block");
    expect(call.prompt).toContain("message: comment-12");
    expect(call.prompt).not.toContain("message: comment-11");
    expect(call.prompt).not.toContain("message: comment-01");
  });

  it("breaks same-timestamp ties by id and still uses one latest comment", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-2",
        projectId: "project-1",
        title: "Task 2",
        description: "Desc",
        status: "planning",
        plan: "Old plan",
      })
      .run();

    db.insert(taskComments)
      .values({
        id: "c-1",
        taskId: "task-2",
        author: "human",
        message: "older-by-id",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-2",
        taskId: "task-2",
        author: "human",
        message: "latest-by-id",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      .run();

    await runPlanner("task-2", "/tmp/planner-test");

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("message: latest-by-id");
    expect(call.prompt).not.toContain("message: older-by-id");

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-2")).get();
    expect(updatedTask?.plan).toBe("## New Plan\n- [ ] Step");
  });

  it("requires an aif-plan-manifest block in full-mode planner prompts", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-full-manifest-"));
    queryMock.mockReturnValue(
      streamSuccess(
        fullModePlan({
          taskId: "task-full-manifest-prompt",
          intent: "feature",
          scope: ["packages/shared/src/planQuality.ts"],
          verificationCommand:
            "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts",
        }),
      ),
    );
    db.insert(tasks)
      .values({
        id: "task-full-manifest-prompt",
        projectId: "project-1",
        title: "Full mode manifest prompt",
        description: "Add manifest validation to packages/shared/src/planQuality.ts.",
        status: "planning",
        plannerMode: "full",
        taskIntent: "feature",
        useSubagents: true,
      })
      .run();

    await runPlanner("task-full-manifest-prompt", projectRoot);

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("Full-mode planning requirement");
    expect(call.prompt).toContain("fenced `aif-plan-manifest` JSON block");
    expect(call.prompt).toContain("version 1");
    expect(call.prompt).toContain("taskId");
    expect(call.prompt).toContain("intent");
    expect(call.prompt).toContain("scope");
    expect(call.prompt).toContain("allowedChanges");
    expect(call.prompt).toContain("forbiddenChanges");
    expect(call.prompt).toContain("expectedArtifacts");
    expect(call.prompt).toContain("acceptanceCriteria");
    expect(call.prompt).toContain("verificationCommands");
    expect(call.prompt).toContain("must not convert audit, spike, docs, or tests tasks");
  });

  it("includes plan-quality feedback from planning-stage retries", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-quality-feedback-"));
    const feedback =
      "Plan quality guard replan 2/3: Plan quality guard (missing_checklist): Plan must contain actionable markdown checklist items.";
    queryMock.mockReturnValue(
      streamSuccess(
        fullModePlan({
          taskId: "task-quality-feedback-prompt",
          intent: "feature",
          scope: ["src/main.ts"],
          verificationCommand: "npm.cmd run build",
        }),
      ),
    );
    db.insert(tasks)
      .values({
        id: "task-quality-feedback-prompt",
        projectId: "project-1",
        title: "Quality feedback prompt",
        description: "Use the captured plan quality feedback.",
        status: "planning",
        blockedFromStatus: "planning",
        blockedReason: feedback,
        plannerMode: "full",
        taskIntent: "feature",
        useSubagents: true,
      })
      .run();

    await runPlanner("task-quality-feedback-prompt", projectRoot);

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("Previous plan-quality feedback that must be addressed:");
    expect(call.prompt).toContain(feedback);
  });

  it("includes requirements snapshot markdown in planner prompts", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-requirements-prompt",
        projectId: "project-1",
        title: "Requirements prompt",
        description: "Use the captured requirement.",
        status: "planning",
        useSubagents: true,
      })
      .run();
    db.insert(taskRequirementQuestions)
      .values({
        id: "q-requirements-prompt",
        taskId: "task-requirements-prompt",
        projectId: "project-1",
        stage: "requirements_analysis",
        targetResumeStage: "requirements_analysis",
        cycleNumber: 1,
        batchId: "batch-requirements-prompt",
        question: "Who is the primary user?",
        whyNeeded: "The implementation must know the actor.",
        status: "answered",
        answer: "Administrators",
        answerAuthor: "human",
        answeredAt: "2026-05-28T00:00:00.000Z",
      })
      .run();
    createCurrentRequirementsSnapshot("task-requirements-prompt");

    await runPlanner("task-requirements-prompt", "/tmp/planner-test");

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("# Task Requirements Context");
    expect(call.prompt).toContain("Answer: Administrators");
    expect(call.prompt).not.toContain("[object Object]");
  });

  it("rejects malformed raise-questions text instead of persisting it as a plan", async () => {
    queryMock.mockReturnValue(
      streamSuccess(`аиф-raise-questions
{
  "version": 1,
  "action": "raise_questions",
  "stage": "planning",
  "targetResumeStage": "planning",
  "reason": "Product clarification is required before planning can continue.",
  "questions": [
    {
      "idempotencyKey": "planning-product-clarification",
      "question": "What product behavior should this stage assume?",
      "whyNeeded": "The stage cannot proceed safely without this product decision.",
      "blocking": true,
      "answerType": "textarea"
    }
  ]
}`),
    );
    testDb.current
      .insert(tasks)
      .values({
        id: "task-malformed-raise-questions-plan",
        projectId: "project-1",
        title: "Инициализировать скелет",
        description: [
          "File boundaries: package.json, src/main.ts",
          "Acceptance criteria: entry point builds.",
          "Verification: npm.cmd run build",
        ].join("\n"),
        status: "planning",
        useSubagents: false,
        plannerMode: "full",
        planPath: ".ai-factory/plans/skeleton.md",
        taskIntent: "feature",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      })
      .run();

    await expect(
      runPlanner("task-malformed-raise-questions-plan", "/tmp/planner-test"),
    ).rejects.toBeInstanceOf(TaskPlanQualityError);
    expect(findTaskById("task-malformed-raise-questions-plan")?.plan).toBeNull();
  });

  it("includes accepted research and design artifact bodies in planner prompts", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-stage-artifact-prompt",
        projectId: "project-1",
        title: "Stage artifact prompt",
        description: "Use the accepted stage artifacts.",
        status: "planning",
        useSubagents: true,
      })
      .run();
    const snapshot = createCurrentRequirementsSnapshot("task-stage-artifact-prompt");
    const researchAttempt = recordTaskStageArtifactAttempt({
      taskId: "task-stage-artifact-prompt",
      stage: "research",
      kind: "research",
      label: "Research artifact",
      path: "research.md",
      state: "accepted",
      summary: "Research summary.",
      markdown: "# Research\n\nPlanner-only research fact: offline mode is mandatory.",
      sourceSnapshotId: snapshot.id,
    });
    recordTaskStageArtifactAttempt({
      taskId: "task-stage-artifact-prompt",
      stage: "design",
      kind: "design",
      label: "Design artifact",
      path: "design.md",
      state: "accepted",
      summary: "Design summary.",
      markdown: "# Design\n\nPlanner-only design decision: use local queue persistence.",
      sourceSnapshotId: snapshot.id,
      metadata: {
        sourceResearchArtifactId: researchAttempt.artifactId,
        sourceResearchAttemptNumber: researchAttempt.attemptNumber,
      },
    });

    await runPlanner("task-stage-artifact-prompt", "/tmp/planner-test");

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("Planner-only research fact: offline mode is mandatory.");
    expect(call.prompt).toContain("Planner-only design decision: use local queue persistence.");
  });

  it("normalizes json-fenced aif-plan-manifest output before persisting planner results", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-normalize-"));
    const manifestJson = JSON.stringify(
      {
        version: 1,
        taskId: "task-planner-normalize",
        intent: "feature",
        scope: ["packages/shared/src/planQuality.ts"],
        allowedChanges: ["source", "tests"],
        forbiddenChanges: ["report", "unrelated modules", "secrets"],
        expectedArtifacts: [{ kind: "source_diff", paths: ["packages/shared/src/planQuality.ts"] }],
        acceptanceCriteria: [
          {
            id: "ac-1",
            description: "Planner normalizes manifest fences before saving.",
            verification:
              "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planner.test.ts",
          },
        ],
        verificationCommands: [
          "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planner.test.ts",
        ],
      },
      null,
      2,
    );
    db.insert(projects)
      .values({
        id: "project-planner-normalize",
        name: "Planner Normalize",
        rootPath: projectRoot,
      })
      .run();
    queryMock.mockReturnValue(
      streamSuccess(
        [
          "## Plan",
          "",
          "## aif-plan-manifest",
          "",
          "```json",
          manifestJson,
          "```",
          "",
          "- [ ] Update packages/shared/src/planQuality.ts with manifest normalization.",
        ].join("\n"),
      ),
    );
    db.insert(tasks)
      .values({
        id: "task-planner-normalize",
        projectId: "project-planner-normalize",
        title: "Normalize manifest",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        status: "planning",
        useSubagents: true,
      })
      .run();

    await runPlanner("task-planner-normalize", projectRoot);

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-planner-normalize")).get();
    expect(updatedTask?.plan).toContain("```aif-plan-manifest");
    expect(updatedTask?.plan).not.toContain("```json");
  });

  it("uses deterministic diagnostic plans for persisted audit source-report tasks before querying planner runtime", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-deterministic-"));
    db.insert(projects)
      .values({
        id: "project-planner-deterministic",
        name: "Planner Deterministic",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-audit-source",
        projectId: "project-planner-deterministic",
        title: "Audit: security and configuration controls",
        description:
          "Scope: .env.example, .ai-factory/config.yaml, src/bot_intevra/config.py, src/bot_intevra/secret_scan.py, src, docs/ops. Report artifact: audit/2026-05-15-audit-security-and-configuration-controls-audit.md.",
        taskIntent: "audit",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
        status: "planning",
        useSubagents: true,
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-planner-deterministic",
      roadmapAlias: "audit-v16",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-source"],
      artifacts: [
        {
          taskId: "task-audit-source",
          role: "report",
          artifactPath: "audit/2026-05-15-audit-security-and-configuration-controls-audit.md",
        },
      ],
    });

    await runPlanner("task-audit-source", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-audit-source")).get();
    expect(updatedTask?.plan).toContain("```aif-plan-manifest");
    expect(updatedTask?.plan).toContain("## Diagnostic-only plan");
    expect(updatedTask?.plan).toContain("Child audit reports: not required");
    expect(updatedTask?.plan).toContain(
      "audit/2026-05-15-audit-security-and-configuration-controls-audit.md",
    );
  });

  it("uses deterministic direct audit canary plans for root-level file scopes", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-direct-audit-"));
    db.insert(projects)
      .values({
        id: "project-planner-direct-audit",
        name: "Planner Direct Audit",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-direct-audit-canary",
        projectId: "project-planner-direct-audit",
        title: "Positive trusted direct audit canary",
        description: [
          "Scope: README.md",
          "Risk hypotheses: risk-readme README.md onboarding claims may drift from repository evidence.",
          "Report artifact: audit/direct-audit-positive-canary.md",
          "Remote validation target: http://192.168.88.67",
        ].join("\n"),
        taskIntent: "audit",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
        status: "planning",
        useSubagents: true,
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-planner-direct-audit",
      roadmapAlias: "direct-audit-canary",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-direct-audit-canary"],
      artifacts: [
        {
          taskId: "task-direct-audit-canary",
          role: "report",
          artifactPath: "audit/direct-audit-positive-canary.md",
        },
      ],
    });

    await runPlanner("task-direct-audit-canary", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-direct-audit-canary"))
      .get();
    expect(updatedTask?.plan).toContain("## Diagnostic-only plan");
    expect(updatedTask?.plan).toContain(
      "Expected report artifact: `audit/direct-audit-positive-canary.md`",
    );
    expect(updatedTask?.plan).toContain("Declared scope: `README.md`");
    expect(updatedTask?.plan).toContain("Allowed write paths:");
    expect(updatedTask?.plan).toContain("Ledger evidence required: yes");
    expect(updatedTask?.plan).toContain("Local AIF service/e2e: forbidden");
    expect(updatedTask?.plan).toContain("Remote validation target: http://192.168.88.67");
  });

  it("uses narrowed diagnostic-only prompt wording", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-diagnostic-wording",
        projectId: "project-1",
        title: "Fix validation error display",
        description: "Implementation task that should not be treated as diagnostic.",
        status: "planning",
        useSubagents: true,
      })
      .run();

    await runPlanner("task-diagnostic-wording", "/tmp/planner-test");

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("Diagnostic-only planning applies only to explicit audit");
    expect(call.prompt).toContain("security-review");
    expect(call.prompt).toContain("validation-report");
    expect(call.prompt).toContain("verification-findings");
    expect(call.prompt).toContain("Planning is planning-only");
    expect(call.prompt).toContain("never the report artifact");
    expect(call.prompt).toContain("Planning stage must not create report artifacts");
    expect(call.prompt).toContain("exact `path:line` evidence");
    expect(call.prompt).toContain("git log -1 --name-only --oneline");
    expect(call.prompt).not.toContain("audit, review, discovery, validation, verification");
  });

  it("uses /aif-fix --plan-first when task is marked as fix", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-fix-1",
        projectId: "project-1",
        title: "Fix login bug",
        description: "Users get 500 on /login",
        attachments:
          '[{"name":"error-log.txt","mimeType":"text/plain","size":12,"path":"tasks/task-fix-1/error-log.txt"}]',
        status: "planning",
        isFix: true,
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-fix-latest",
        taskId: "task-fix-1",
        author: "human",
        message: "Please include retry and preserve session tokens",
        attachments:
          '[{"name":"request.txt","mimeType":"text/plain","size":10,"path":"tasks/task-fix-1/comments/c-fix-latest/request.txt"}]',
        createdAt: "2026-01-01T00:00:10.000Z",
      })
      .run();

    await runPlanner("task-fix-1", "/tmp/planner-test");

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as {
      prompt: string;
      options: { extraArgs?: { agent?: string } };
    };
    expect(call.prompt).toContain("/aif-fix --plan-first");
    expect(call.prompt).toContain("Fix login bug");
    expect(call.prompt).toContain("Users get 500 on /login");
    expect(call.prompt).toContain("Task attachments:");
    expect(call.prompt).toContain("error-log.txt");
    expect(call.prompt).toContain("User comments and replanning feedback:");
    expect(call.prompt).toContain("message: Please include retry and preserve session tokens");
    expect(call.prompt).toContain("request.txt");
    expect(call.options.extraArgs).toBeUndefined();
  });

  it("loads plan text from fallback PLAN.md when skill wrote outside canonical plan path", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-fallback-"));
    mkdirSync(projectRoot, { recursive: true });
    const fallbackPlanPath = join(projectRoot, "PLAN.md");

    db.insert(projects)
      .values({
        id: "project-fallback",
        name: "Fallback Project",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-fallback",
        projectId: "project-fallback",
        title: "Task fallback",
        description: "Desc",
        status: "planning",
        planPath: ".ai-factory/PLAN.md",
      })
      .run();

    queryMock.mockReset();
    queryMock.mockImplementation(() => {
      writeFileSync(fallbackPlanPath, "## Fallback Plan\n- [ ] Step from fallback", "utf8");
      return streamSuccess("Plan written to PLAN.md");
    });

    await runPlanner("task-fallback", projectRoot);

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-fallback")).get();
    expect(updatedTask?.plan).toBe("## Fallback Plan\n- [ ] Step from fallback");
  });

  it("ignores stale disk plans that were not updated by the current planner run", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-stale-plan-"));
    mkdirSync(join(projectRoot, ".ai-factory"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".ai-factory", "PLAN.md"),
      "## Stale Plan\n- [ ] stale",
      "utf8",
    );

    db.insert(projects)
      .values({
        id: "project-stale-plan",
        name: "Stale Plan Project",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-stale-plan",
        projectId: "project-stale-plan",
        title: "Use fresh planner output",
        description: "Update src/main.ts.",
        status: "planning",
        plannerMode: "fast",
      })
      .run();

    queryMock.mockReturnValue(
      streamSuccess("## Fresh Plan\n- [ ] Update src/main.ts from the planner response."),
    );

    await runPlanner("task-stale-plan", projectRoot);

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-stale-plan")).get();
    expect(updatedTask?.plan).toContain("Fresh Plan");
    expect(updatedTask?.plan).not.toContain("Stale Plan");
  });

  it("uses deterministic implementation fallback for concrete roadmap child plans", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-implementation-fallback-"));

    db.insert(tasks)
      .values({
        id: "task-implementation-fallback",
        projectId: "project-1",
        title: "Initialize skeleton: Project structure initialization",
        description:
          "Create only the minimal project skeleton.\nFile boundaries: package.json, src/app/**, src/main.*, src/index.*\nAcceptance criteria: The application entry point exists and starts without placeholder-only wiring.\nVerification: npm.cmd run build\nDependencies: none",
        status: "planning",
        plannerMode: "full",
        taskIntent: "feature",
        roadmapAlias: "roadmap-fallback",
      })
      .run();

    queryMock.mockReturnValue(streamSuccess("Plan written to PLAN.md"));

    await runPlanner("task-implementation-fallback", projectRoot);

    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-implementation-fallback"))
      .get();
    expect(updatedTask?.plan).toContain("```aif-plan-manifest");
    expect(updatedTask?.plan).toContain("- [ ] Inspect the declared file boundaries");
    expect(updatedTask?.plan).toContain("npm.cmd run build");
    expect(updatedTask?.plan).toContain("package.json");
  });

  it("creates a feature branch when plannerMode=full and git.create_branches=true", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-git-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "T"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "commit.gpgsign", "false"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# t\n");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({
        id: "project-git",
        name: "Git Project",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-git-1",
        projectId: "project-git",
        title: "Add user authentication",
        description: "Implement JWT login",
        status: "planning",
        plannerMode: "full",
        taskIntent: "feature",
        useSubagents: true,
      })
      .run();

    queryMock.mockReturnValue(
      streamSuccess(
        fullModePlan({
          taskId: "task-git-1",
          intent: "feature",
          scope: ["src/auth.ts"],
          verificationCommand: "npm.cmd run build",
        }),
      ),
    );

    await runPlanner("task-git-1", projectRoot);

    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(branch).toMatch(/^feature\/add-user-authentication-/);

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-git-1")).get();
    expect(updatedTask?.branchName).toBe(branch);
  });

  it("creates a task worktree for parallel full planning when the rollout flag is enabled", async () => {
    process.env.AIF_TASK_WORKTREES_ENABLED = "true";
    resetEnvCache();
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-worktree-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "T"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "commit.gpgsign", "false"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# t\n");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({
        id: "project-worktree",
        name: "Worktree Project",
        rootPath: projectRoot,
        parallelEnabled: true,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-worktree-1",
        projectId: "project-worktree",
        title: "Parallel worktree",
        description: "",
        status: "planning",
        plannerMode: "full",
        taskIntent: "feature",
        useSubagents: true,
      })
      .run();

    queryMock.mockReturnValue(
      streamSuccess(
        fullModePlan({
          taskId: "task-worktree-1",
          intent: "feature",
          scope: ["src/worktree.ts"],
          verificationCommand: "npm.cmd run build",
        }),
      ),
    );

    await runPlanner("task-worktree-1", projectRoot);

    const sharedBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-worktree-1")).get();

    expect(sharedBranch).toBe("main");
    expect(updatedTask?.branchName).toMatch(/^feature\/parallel-worktree-/);
    expect(updatedTask?.worktreePath).toContain("planner-worktree-");
    expect(updatedTask?.worktreePath).toContain("task-worktree-1");
    expect(
      execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: updatedTask?.worktreePath ?? projectRoot,
        encoding: "utf8",
      }).trim(),
    ).toBe(updatedTask?.branchName);
  });

  it("restores persisted branch in fast plannerMode for already-bound task (mode-drift safe)", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-mode-drift-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "T"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "commit.gpgsign", "false"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# t\n");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    // Bind a feature branch then drift HEAD back to main.
    execFileSync("git", ["checkout", "-b", "feature/bound-fast"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "main"], { cwd: projectRoot, stdio: "ignore" });

    db.insert(projects)
      .values({ id: "project-mode-drift", name: "Mode drift", rootPath: projectRoot })
      .run();
    db.insert(tasks)
      .values({
        id: "task-mode-drift-1",
        projectId: "project-mode-drift",
        title: "Mode drift",
        description: "",
        status: "planning",
        // FAST mode + persisted branchName = the dangerous case the previous
        // gating broke: restore must still happen, otherwise the planner
        // writes plan/log on whatever HEAD happens to be.
        plannerMode: "fast",
        useSubagents: false,
        branchName: "feature/bound-fast",
      })
      .run();

    queryMock.mockReset();
    queryMock.mockReturnValue(streamSuccess("## Plan\n- [ ] x"));

    await runPlanner("task-mode-drift-1", projectRoot);

    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(branch).toBe("feature/bound-fast");
  });

  it("throws BranchIsolationError when subagent silently switched branches (drift)", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-drift-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "T"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "commit.gpgsign", "false"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# t\n");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    // Pre-create the branch so drift test has something to drift AWAY from
    execFileSync("git", ["checkout", "-b", "feature/some-drift"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "main"], { cwd: projectRoot, stdio: "ignore" });

    db.insert(projects).values({ id: "project-drift", name: "Drift", rootPath: projectRoot }).run();
    db.insert(tasks)
      .values({
        id: "task-drift-1",
        projectId: "project-drift",
        title: "Drift test",
        description: "",
        status: "planning",
        plannerMode: "full",
        useSubagents: true,
        branchName: "feature/some-drift",
      })
      .run();

    // Simulate subagent switching HEAD away while "running"
    queryMock.mockReset();
    queryMock.mockImplementation(() => {
      execFileSync("git", ["checkout", "main"], { cwd: projectRoot, stdio: "ignore" });
      return streamSuccess("## Plan\n- [ ] x");
    });

    const { isBranchIsolationError } = await import("../gitBranch.js");
    try {
      await runPlanner("task-drift-1", projectRoot);
      throw new Error("expected throw");
    } catch (err) {
      expect(isBranchIsolationError(err)).toBe(true);
      if (isBranchIsolationError(err)) {
        expect(err.kind).toBe("branch_drift");
      }
    }
  });

  it("injects HANDOFF_BRANCH_PREPARED + HANDOFF_BRANCH_NAME into prompt", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-env-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "T"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "commit.gpgsign", "false"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# t\n");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(projects).values({ id: "project-env", name: "Env", rootPath: projectRoot }).run();
    db.insert(tasks)
      .values({
        id: "task-env-1",
        projectId: "project-env",
        title: "Env contract",
        description: "",
        status: "planning",
        plannerMode: "full",
        taskIntent: "feature",
        useSubagents: true,
      })
      .run();

    queryMock.mockReturnValue(
      streamSuccess(
        fullModePlan({
          taskId: "task-env-1",
          intent: "feature",
          scope: ["src/env.ts"],
          verificationCommand: "npm.cmd run build",
        }),
      ),
    );

    await runPlanner("task-env-1", projectRoot);

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("HANDOFF_BRANCH_PREPARED: 1");
    expect(call.prompt).toMatch(/HANDOFF_BRANCH_NAME: feature\/env-contract-/);
  });

  it("skips branch creation when plannerMode=fast", async () => {
    const db = testDb.current;
    const projectRoot = mkdtempSync(join(tmpdir(), "planner-fast-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "T"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "commit.gpgsign", "false"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# t\n");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({
        id: "project-fast",
        name: "Fast Project",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-fast-1",
        projectId: "project-fast",
        title: "Quick fix",
        description: "",
        status: "planning",
        plannerMode: "fast",
        useSubagents: true,
      })
      .run();

    await runPlanner("task-fast-1", projectRoot);

    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(branch).toBe("main");

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-fast-1")).get();
    expect(updatedTask?.branchName).toBeNull();
  });

  it("uses /aif-plan command format only in skill mode", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-skill-1",
        projectId: "project-1",
        title: "Skill mode task",
        description: "Desc",
        status: "planning",
        planPath: ".ai-factory/PLAN.md",
        useSubagents: false,
      })
      .run();

    await runPlanner("task-skill-1", "/tmp/planner-test");

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("/aif-plan fast @.ai-factory/PLAN.md docs:false tests:false");
  });
});
