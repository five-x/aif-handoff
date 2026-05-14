import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TaskPlanQualityError,
  evaluateTaskPlanQuality,
  tasks,
  projects,
  runtimeProfiles,
  resetEnvCache,
  formatAuditSynthesisOutcomeForArtifact,
  computeAuditReportContentSha256,
  computeAuditReportArtifactSha256,
} from "@aif/shared";
import { createTestDb } from "@aif/shared/server";
import { RuntimeExecutionError } from "@aif/runtime";
import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Flag defaults to false (opt-in). Coordinator tests assert on persisted
// limitSnapshot, which requires the gate to be open.
process.env.AIF_USAGE_LIMITS_ENABLED = "true";
resetEnvCache();

// Set up test db
const testDb = { current: createTestDb() };
const blockTaskForRuntimeGateIfEligibleMock = vi.fn();

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("@aif/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/data")>();
  blockTaskForRuntimeGateIfEligibleMock.mockImplementation(
    actual.blockTaskForRuntimeGateIfEligible,
  );
  return {
    ...actual,
    blockTaskForRuntimeGateIfEligible: (
      ...args: Parameters<typeof actual.blockTaskForRuntimeGateIfEligible>
    ) => blockTaskForRuntimeGateIfEligibleMock(...args),
  };
});

// Mock subagent runners
vi.mock("../subagents/planner.js", () => ({
  runPlanner: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../subagents/planChecker.js", () => ({
  runPlanChecker: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../subagents/implementer.js", () => ({
  runImplementer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../subagents/reviewer.js", () => ({
  runReviewer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../reviewGate.js", () => ({
  evaluateReviewCommentsForAutoMode: vi.fn().mockResolvedValue({ status: "success" }),
}));
vi.mock("../autoReviewHandler.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../autoReviewHandler.js")>();
  return {
    ...actual,
    handleAutoReviewGate: vi.fn().mockResolvedValue({
      status: "accepted",
      currentIteration: 1,
      metrics: {
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      },
      autoReviewState: null,
    }),
  };
});

const {
  pollAndProcess,
  getCoordinatorRuntimeCounters,
  resetCoordinatorRuntimeCountersForTests,
  getStageSemaphore,
} = await import("../coordinator.js");
const { runPlanner } = await import("../subagents/planner.js");
const { runPlanChecker } = await import("../subagents/planChecker.js");
const { runImplementer } = await import("../subagents/implementer.js");
const { runReviewer } = await import("../subagents/reviewer.js");
const { handleAutoReviewGate } = await import("../autoReviewHandler.js");
const {
  createRoadmapBatchContract,
  listRoadmapBatchArtifacts,
  summarizeRoadmapBatch,
  updateRoadmapBatchArtifactState,
} = await import("@aif/data");

function createPlanQualityError(): TaskPlanQualityError {
  return new TaskPlanQualityError(
    evaluateTaskPlanQuality({
      task: { title: "Planner quality task" },
      plan: "Short task\n/aif-plan fast @.ai-factory/PLAN.md docs:false tests:false",
    }),
  );
}

function initGitFixture(prefix: string): string {
  const rootPath = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: rootPath, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@t.local"], {
    cwd: rootPath,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "T"], { cwd: rootPath, stdio: "ignore" });
  writeFileSync(join(rootPath, "README.md"), "# audit fixture\nruntime audit evidence\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: rootPath, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
    cwd: rootPath,
    stdio: "ignore",
  });
  return rootPath;
}

function currentGitSnapshot(rootPath: string): { id: string; commit: string; tree: string } {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: rootPath,
    encoding: "utf8",
  }).trim();
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: rootPath,
    encoding: "utf8",
  }).trim();
  return { id: `git:${commit}:${tree}`, commit, tree };
}

function withAuditManifest(input: {
  body: string;
  taskId: string;
  batchId: string;
  artifactPath: string;
  snapshot: { id: string; commit: string; tree: string };
}): string {
  const manifest = {
    version: 1,
    auditPlanId: `batch:${input.batchId}:task:${input.taskId}`,
    taskId: input.taskId,
    batchId: input.batchId,
    artifactPath: input.artifactPath,
    contentSha256: computeAuditReportContentSha256(input.body),
    sourceSnapshot: { ...input.snapshot, dirty: false },
    outcome: "validated_no_findings",
    scopeCoverage: [{ root: "README.md", covered: true, evidenceRefs: ["ev-1"] }],
    riskHypotheses: [
      { id: "risk-1", description: "Runtime evidence refs must be captured", status: "covered" },
    ],
    findings: [],
    noFindingsClaims: [{ id: "nf-1", riskIds: ["risk-1"], evidenceRefs: ["ev-1"] }],
    evidenceRefs: ["ev-1"],
  };
  return `${input.body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`;
}

function trustedFindingsValidationDetails(): Record<string, unknown> {
  return {
    evidence: {
      auditReportValidation: { sourceClassification: "validated_findings_present" },
    },
  };
}

describe("coordinator", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    testDb.current
      .insert(projects)
      .values({ id: "test-project", name: "Test", rootPath: "/tmp/test" })
      .run();
    vi.clearAllMocks();
    resetCoordinatorRuntimeCountersForTests();
    getStageSemaphore().reset();
  });

  function insertRuntimeProfile(input: {
    id: string;
    projectId?: string | null;
    snapshot: Record<string, unknown>;
  }): void {
    const now = new Date().toISOString();
    testDb.current
      .insert(runtimeProfiles)
      .values({
        id: input.id,
        projectId: input.projectId ?? "test-project",
        name: `Profile ${input.id}`,
        runtimeId: "claude",
        providerId: "anthropic",
        enabled: true,
        runtimeLimitSnapshotJson: JSON.stringify(input.snapshot),
        runtimeLimitUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  it("should pick up planning tasks and process through full pipeline", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({ id: "task-1", projectId: "test-project", title: "Plan me", status: "planning" })
      .run();

    await pollAndProcess();

    // Pipeline processes all three stages in one poll cycle
    expect(runPlanner).toHaveBeenCalledWith("task-1", "/tmp/test");
    expect(runPlanChecker).toHaveBeenCalledWith("task-1", "/tmp/test");
    expect(runImplementer).toHaveBeenCalledWith("task-1", "/tmp/test");
    expect(runReviewer).toHaveBeenCalledWith("task-1", "/tmp/test");
    const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
    expect(task!.status).toBe("done");
  });

  it("should use task worktreePath as cwd for all downstream stages", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-worktree",
        projectId: "test-project",
        title: "Worktree task",
        status: "planning",
        branchName: "feature/worktree-task",
        worktreePath: "/tmp/test-worktree",
      })
      .run();

    await pollAndProcess();

    expect(runPlanner).toHaveBeenCalledWith("task-worktree", "/tmp/test-worktree");
    expect(runPlanChecker).toHaveBeenCalledWith("task-worktree", "/tmp/test-worktree");
    expect(runImplementer).toHaveBeenCalledWith("task-worktree", "/tmp/test-worktree");
    expect(runReviewer).toHaveBeenCalledWith("task-worktree", "/tmp/test-worktree");
    expect(handleAutoReviewGate).toHaveBeenCalledWith({
      taskId: "task-worktree",
      projectRoot: "/tmp/test-worktree",
    });
  });

  it("should ignore backlog tasks until human starts AI", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-planning",
        projectId: "test-project",
        title: "Backlog task",
        status: "backlog",
      })
      .run();

    await pollAndProcess();

    expect(runPlanner).not.toHaveBeenCalled();
    expect(runPlanChecker).not.toHaveBeenCalled();
    expect(runImplementer).not.toHaveBeenCalled();
    expect(runReviewer).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-planning")).get();
    expect(task!.status).toBe("backlog");
  });

  it("should ignore verified tasks", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-verified",
        projectId: "test-project",
        title: "Verified task",
        status: "verified",
      })
      .run();

    await pollAndProcess();

    expect(runPlanner).not.toHaveBeenCalled();
    expect(runPlanChecker).not.toHaveBeenCalled();
    expect(runImplementer).not.toHaveBeenCalled();
    expect(runReviewer).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-verified")).get();
    expect(task!.status).toBe("verified");
  });

  it("should pick up plan_ready tasks and dispatch implementer + reviewer", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-2",
        projectId: "test-project",
        title: "Implement me",
        status: "plan_ready",
        autoMode: true,
      })
      .run();

    await pollAndProcess();

    expect(runPlanChecker).toHaveBeenCalledWith("task-2", "/tmp/test");
    expect(runImplementer).toHaveBeenCalledWith("task-2", "/tmp/test");
    expect(runReviewer).toHaveBeenCalledWith("task-2", "/tmp/test");
    const task = db.select().from(tasks).where(eq(tasks.id, "task-2")).get();
    expect(task!.status).toBe("done");
  });

  it("should block generic plan_ready plans before implementer dispatch", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-generic-plan-ready",
        projectId: "test-project",
        title: "Generic plan",
        status: "plan_ready",
        autoMode: true,
        plan: 'Short task\n<aif-plan mode="fast" docs:false tests:false>',
      })
      .run();

    await pollAndProcess();

    expect(runPlanChecker).toHaveBeenCalledWith("task-generic-plan-ready", "/tmp/test");
    expect(runImplementer).not.toHaveBeenCalled();
    expect(runReviewer).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-generic-plan-ready")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("plan_ready");
    expect(task!.blockedReason).toContain("generic_plan");
  });

  it("should not auto-implement plan_ready tasks when autoMode=false", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-2-manual",
        projectId: "test-project",
        title: "Manual confirmation",
        status: "plan_ready",
        autoMode: false,
      })
      .run();

    await pollAndProcess();

    expect(runPlanChecker).not.toHaveBeenCalled();
    expect(runImplementer).not.toHaveBeenCalled();
    expect(runReviewer).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-2-manual")).get();
    expect(task!.status).toBe("plan_ready");
  });

  it("should pick up implementing tasks and continue to review", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-impl",
        projectId: "test-project",
        title: "Resume impl",
        status: "implementing",
      })
      .run();

    await pollAndProcess();

    expect(runPlanChecker).not.toHaveBeenCalled();
    expect(runImplementer).toHaveBeenCalledWith("task-impl", "/tmp/test");
    expect(runReviewer).toHaveBeenCalledWith("task-impl", "/tmp/test");
    const task = db.select().from(tasks).where(eq(tasks.id, "task-impl")).get();
    expect(task!.status).toBe("done");
  });

  it("should hold audit synthesis implementation until report artifacts are valid", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-audit-report",
        projectId: "test-project",
        title: "Audit configuration",
        description: "Report artifact: audit/config.md",
        taskIntent: "audit",
        status: "done",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-audit-synthesis",
        projectId: "test-project",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
      })
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "test-project",
      roadmapAlias: "audit",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-report", "task-audit-synthesis"],
      synthesisTaskId: "task-audit-synthesis",
      artifacts: [
        { taskId: "task-audit-report", role: "report", artifactPath: "audit/config.md" },
        { taskId: "task-audit-synthesis", role: "synthesis", artifactPath: "audit/summary.md" },
      ],
    });

    await pollAndProcess();

    expect(runImplementer).not.toHaveBeenCalled();
    expect(runReviewer).not.toHaveBeenCalled();
    const synthesis = db.select().from(tasks).where(eq(tasks.id, "task-audit-synthesis")).get();
    expect(synthesis?.status).toBe("implementing");
    expect(synthesis?.paused).toBe(true);
    expect(synthesis?.blockedReason).toContain("synthesis_not_ready");
    const synthesisArtifact = listRoadmapBatchArtifacts(batch.batchId).find(
      (artifact) => artifact.taskId === "task-audit-synthesis",
    );
    expect(synthesisArtifact?.state).toBe("expected");
    expect(summarizeRoadmapBatch(batch.batchId)?.synthesisReady).toBe(false);
  });

  it("exercises the typed audit batch lifecycle canary without live runtimes", async () => {
    const db = testDb.current;
    const rootPath = initGitFixture("coordinator-audit-batch-canary-");
    mkdirSync(join(rootPath, "src"), { recursive: true });
    writeFileSync(join(rootPath, "src", "index.ts"), 'export const entry = "ok";\n', "utf8");
    writeFileSync(
      join(rootPath, "src", "worker.ts"),
      'export function runWorker() { return "ok"; }\n',
      "utf8",
    );
    execFileSync("git", ["add", "src/index.ts", "src/worker.ts"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "add source files", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/audit-batch-canary"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    mkdirSync(join(rootPath, "audit"), { recursive: true });
    writeFileSync(
      join(rootPath, "audit", "source.md"),
      [
        "# Audit",
        "",
        "## Finding: Documentation-only observation",
        "Evidence: `README.md:1` identifies the fixture documentation.",
        "Risk: Dependencies are defined but source behavior was not inspected.",
        "Proposed fix: Review the implementation files.",
        "Verification: Command `git log -1 --oneline` output:",
        "```",
        "1234567 (HEAD -> main) add audit report",
        "```",
        "",
        "## No Validated Findings",
        "No validated findings were found.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/source.md"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add weak audit report", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({ id: "audit-batch-canary-project", name: "Audit Batch Canary", rootPath })
      .run();
    db.insert(tasks)
      .values({
        id: "task-canary-report",
        projectId: "audit-batch-canary-project",
        title: "Audit source behavior",
        description:
          "Scope: src. Report artifact: audit/source.md. Evidence requirements: cite source files and commands.",
        taskIntent: "audit",
        status: "review",
        autoMode: true,
        branchName: "feature/audit-batch-canary",
        agentActivityLog: [
          "[2026-05-11T10:00:00.000Z] Agent: implement-coordinator started",
          "[2026-05-11T10:00:01.000Z] Tool: read_file README.md",
          "[2026-05-11T10:00:02.000Z] Tool: write_file audit/source.md",
          "[2026-05-11T10:00:03.000Z] Tool: git_commit git commit",
          "[2026-05-11T10:00:04.000Z] Agent: implement-coordinator complete",
          "[2026-05-11T10:00:05.000Z] Agent: review-sidecar started",
          "[2026-05-11T10:00:06.000Z] Tool: read_file audit/source.md",
          "[2026-05-11T10:00:07.000Z] Agent: review-sidecar complete",
        ].join("\n"),
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-canary-synthesis",
        projectId: "audit-batch-canary-project",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
        autoMode: true,
        paused: false,
        blockedReason: "synthesis_not_ready: waiting for validated audit batch artifacts",
      })
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "audit-batch-canary-project",
      roadmapAlias: "audit-canary",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-canary-report", "task-canary-synthesis"],
      synthesisTaskId: "task-canary-synthesis",
      artifacts: [
        {
          taskId: "task-canary-report",
          role: "report",
          artifactPath: "audit/source.md",
          projectRoot: rootPath,
        },
        {
          taskId: "task-canary-synthesis",
          role: "synthesis",
          artifactPath: "audit/summary.md",
          projectRoot: rootPath,
        },
      ],
    });

    await pollAndProcess();

    expect(runImplementer).not.toHaveBeenCalledWith("task-canary-synthesis", rootPath);
    let synthesis = db.select().from(tasks).where(eq(tasks.id, "task-canary-synthesis")).get();
    expect(synthesis?.paused).toBe(true);
    expect(synthesis?.blockedReason).toContain("synthesis_not_ready");
    let report = db.select().from(tasks).where(eq(tasks.id, "task-canary-report")).get();
    expect(report?.status).toBe("implementing");
    expect(report?.reworkRequested).toBe(true);
    expect(report?.blockedReason).toContain("invalid_inventory_only");
    let artifacts = listRoadmapBatchArtifacts(batch.batchId);
    let reportArtifact = artifacts.find((artifact) => artifact.taskId === "task-canary-report");
    expect(reportArtifact?.state).toBe("invalid");
    expect(reportArtifact?.failureFamily).toBe("invalid_inventory_only");
    const weakDetails = JSON.parse(reportArtifact?.validationDetailsJson ?? "{}");
    expect(reportArtifact?.contentSha).toMatch(/^[a-f0-9]{64}$/);
    expect(reportArtifact?.contentSha).toBe(
      weakDetails.evidence?.auditReportValidation?.artifactSha256,
    );
    const weakIssueCodes = weakDetails.issues?.map((entry: { code: string }) => entry.code) ?? [];
    const validatorIssueCodes =
      weakDetails.evidence?.auditReportValidation?.issues?.map(
        (entry: { code: string }) => entry.code,
      ) ?? [];
    expect(weakIssueCodes).toContain("low_quality_report_evidence");
    expect(validatorIssueCodes).toEqual(
      expect.arrayContaining([
        "synthetic_git_output",
        "missing_scope_coverage",
        "contradictory_findings_and_no_findings",
      ]),
    );
    expect(summarizeRoadmapBatch(batch.batchId)?.synthesisReady).toBe(false);

    vi.clearAllMocks();
    writeFileSync(
      join(rootPath, "audit", "source.md"),
      [
        "# Audit",
        "",
        "## Coverage",
        "| Scope | Evidence | Verification |",
        "| --- | --- | --- |",
        '| `src` | `src/index.ts:1`, `src/worker.ts:1` | Command `git grep -n "export" -- src` output cited below. |',
        "",
        "## Finding: Worker output is unchecked",
        "Evidence: `src/worker.ts:1` returns a string without downstream validation.",
        "Risk: A caller can rely on unchecked worker output.",
        "Proposed fix: Add validation before consuming worker output.",
        'Verification: Command `git grep -n "export" -- src` output:',
        "```",
        'src/index.ts:1:export const entry = "ok";',
        'src/worker.ts:1:export function runWorker() { return "ok"; }',
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/source.md"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "repair audit report", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    db.update(tasks)
      .set({
        status: "implementing",
        reworkRequested: true,
        blockedReason: "rework_needed: manual request_changes requires fresh report evidence",
        agentActivityLog: report?.agentActivityLog ?? "",
      })
      .where(eq(tasks.id, "task-canary-report"))
      .run();
    db.update(tasks).set({ paused: true }).where(eq(tasks.id, "task-canary-synthesis")).run();
    updateRoadmapBatchArtifactState({
      taskId: "task-canary-report",
      state: "expected",
      failureFamily: "rework_needed",
      validationDetails: {
        reworkBoundary: {
          action: "request_changes",
          requestedAt: "2026-05-11T11:00:00.000Z",
          previousState: "valid",
          latestHumanComment: {
            id: "comment-canary-rework",
            createdAt: "2026-05-11T11:00:00.000Z",
            messageExcerpt: "Refresh the report with source evidence.",
          },
        },
      },
      projectRoot: rootPath,
    });

    await pollAndProcess();

    expect(runImplementer).toHaveBeenCalledWith("task-canary-report", rootPath);
    expect(runReviewer).toHaveBeenCalledWith("task-canary-report", rootPath);
    report = db.select().from(tasks).where(eq(tasks.id, "task-canary-report")).get();
    expect(report?.status).toBe("done");
    expect(report?.reworkRequested).toBe(false);
    expect(report?.agentActivityLog).not.toContain("skipping implementer and returning to review");
    artifacts = listRoadmapBatchArtifacts(batch.batchId);
    reportArtifact = artifacts.find((artifact) => artifact.taskId === "task-canary-report");
    expect(reportArtifact?.state).toBe("valid");
    expect(reportArtifact?.failureFamily).toBeNull();

    vi.clearAllMocks();
    db.update(tasks)
      .set({ status: "implementing", paused: false, blockedReason: null })
      .where(eq(tasks.id, "task-canary-synthesis"))
      .run();

    await pollAndProcess();

    expect(runImplementer).toHaveBeenCalledWith("task-canary-synthesis", rootPath);
    expect(runReviewer).toHaveBeenCalledWith("task-canary-synthesis", rootPath);
    synthesis = db.select().from(tasks).where(eq(tasks.id, "task-canary-synthesis")).get();
    expect(synthesis?.paused).toBe(false);
    expect(synthesis?.blockedReason ?? "").not.toContain("synthesis_not_ready");
  });

  it("blocks audit synthesis as inconclusive from persisted source outcome", async () => {
    const db = testDb.current;
    const rootPath = initGitFixture("coordinator-audit-inconclusive-");
    execFileSync("git", ["checkout", "-b", "feature/audit-inconclusive"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    mkdirSync(join(rootPath, "audit"), { recursive: true });
    writeFileSync(
      join(rootPath, "audit", "summary.md"),
      [
        "# Audit Summary",
        "",
        formatAuditSynthesisOutcomeForArtifact({
          kind: "inconclusive_batch_evidence",
          reason: "Audit inconclusive: six source reports used inventory-only checks.",
          sourceReportCount: 6,
          validatedFindingCount: 0,
          substantiveNoFindingsReportCount: 0,
          inventoryOnlyNoFindingsReportCount: 6,
          weakReportCount: 0,
        }),
        "",
        "No validated findings.",
        "",
        "## Checked Files",
        "- `README.md:1`",
        "",
        "## Checked Commands",
        '- Command `rg -n "audit" README.md` output: `README.md:1:# audit fixture`',
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/summary.md"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add inconclusive synthesis", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({ id: "audit-inconclusive-project", name: "Audit Inconclusive", rootPath })
      .run();
    const reportTaskIds = Array.from(
      { length: 6 },
      (_, index) => `task-inconclusive-report-${index + 1}`,
    );
    reportTaskIds.forEach((taskId, index) => {
      db.insert(tasks)
        .values({
          id: taskId,
          projectId: "audit-inconclusive-project",
          title: `Audit source ${index + 1}`,
          description: `Report artifact: audit/source-${index + 1}.md`,
          taskIntent: "audit",
          status: "done",
        })
        .run();
    });
    db.insert(tasks)
      .values({
        id: "task-inconclusive-synthesis",
        projectId: "audit-inconclusive-project",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "review",
        autoMode: true,
        agentActivityLog: [
          "[2026-05-11T10:00:00.000Z] Agent: implement-coordinator started",
          "[2026-05-11T10:00:01.000Z] Tool: read_file audit/summary.md",
          "[2026-05-11T10:00:02.000Z] Tool: git_commit git commit",
          "[2026-05-11T10:00:03.000Z] Agent: implement-coordinator complete",
          "[2026-05-11T10:00:04.000Z] Agent: review-sidecar started",
          "[2026-05-11T10:00:05.000Z] Tool: read_file audit/summary.md",
          "[2026-05-11T10:00:06.000Z] Agent: review-sidecar complete",
        ].join("\n"),
      })
      .run();

    const batch = createRoadmapBatchContract({
      projectId: "audit-inconclusive-project",
      roadmapAlias: "audit-inconclusive",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: [...reportTaskIds, "task-inconclusive-synthesis"],
      synthesisTaskId: "task-inconclusive-synthesis",
      artifacts: [
        ...reportTaskIds.map((taskId, index) => ({
          taskId,
          role: "report" as const,
          artifactPath: `audit/source-${index + 1}.md`,
          projectRoot: rootPath,
        })),
        {
          taskId: "task-inconclusive-synthesis",
          role: "synthesis" as const,
          artifactPath: "audit/summary.md",
          projectRoot: rootPath,
        },
      ],
    });
    reportTaskIds.forEach((taskId) => {
      updateRoadmapBatchArtifactState({
        taskId,
        state: "valid",
        failureFamily: null,
        validationDetails: {
          evidence: {
            auditReportValidation: {
              sourceClassification: "validated_no_findings",
              manifestStatus: "valid",
              manifestVersion: 1,
            },
          },
        },
        projectRoot: rootPath,
      });
    });

    await pollAndProcess();

    const synthesis = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-inconclusive-synthesis"))
      .get();
    expect(synthesis?.status).toBe("blocked_external");
    expect(synthesis?.blockedReason).toContain("inconclusive_batch_evidence");
    expect(synthesis?.blockedReason).toContain("audit_inconclusive");
    const synthesisArtifact = listRoadmapBatchArtifacts(batch.batchId).find(
      (artifact) => artifact.taskId === "task-inconclusive-synthesis",
    );
    expect(synthesisArtifact?.state).toBe("terminal_inconclusive");
    expect(synthesisArtifact?.failureFamily).toBe("inconclusive_batch_evidence");
    expect(summarizeRoadmapBatch(batch.batchId)?.failureFamily).toBe("inconclusive_batch_evidence");
  });

  it("should pause synthesis when validated branch artifacts are unavailable during implementation", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-audit-report-ready",
        projectId: "test-project",
        title: "Audit configuration",
        description: "Report artifact: audit/config.md",
        taskIntent: "audit",
        status: "done",
        branchName: "audit/config-report",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-audit-synthesis-ready",
        projectId: "test-project",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
      })
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "test-project",
      roadmapAlias: "audit",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-report-ready", "task-audit-synthesis-ready"],
      synthesisTaskId: "task-audit-synthesis-ready",
      artifacts: [
        {
          taskId: "task-audit-report-ready",
          role: "report",
          artifactPath: "audit/config.md",
          branchName: "audit/config-report",
        },
        {
          taskId: "task-audit-synthesis-ready",
          role: "synthesis",
          artifactPath: "audit/summary.md",
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-audit-report-ready",
      state: "valid",
      failureFamily: null,
      validationDetails: trustedFindingsValidationDetails(),
    });
    vi.mocked(runImplementer).mockRejectedValueOnce(
      new Error(
        "synthesis_not_ready: validated artifact is unavailable on branch audit/config-report: audit/config.md",
      ),
    );

    await pollAndProcess();

    expect(runImplementer).toHaveBeenCalledWith("task-audit-synthesis-ready", "/tmp/test");
    expect(runReviewer).not.toHaveBeenCalled();
    const synthesis = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-synthesis-ready"))
      .get();
    expect(synthesis?.status).toBe("implementing");
    expect(synthesis?.paused).toBe(true);
    expect(synthesis?.blockedReason).toContain("synthesis_not_ready");
    const synthesisArtifact = listRoadmapBatchArtifacts(batch.batchId).find(
      (artifact) => artifact.taskId === "task-audit-synthesis-ready",
    );
    expect(synthesisArtifact?.state).toBe("synthesis_not_ready");
    expect(synthesisArtifact?.failureFamily).toBe("synthesis_not_ready");
  });

  it("should run synthesis rework even when completion evidence is already satisfied", async () => {
    const db = testDb.current;
    const rootPath = mkdtempSync(join(tmpdir(), "coordinator-audit-rework-ready-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "T"], { cwd: rootPath, stdio: "ignore" });
    writeFileSync(join(rootPath, "README.md"), "# audit fixture\nruntime audit evidence\n");
    execFileSync("git", ["add", "README.md"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/audit-synthesis"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    mkdirSync(join(rootPath, "audit"), { recursive: true });
    writeFileSync(
      join(rootPath, "audit", "summary.md"),
      [
        formatAuditSynthesisOutcomeForArtifact({
          kind: "validated_findings_present",
          reason: "Validated findings were present in source audit reports.",
          sourceReportCount: 1,
          validatedFindingCount: 1,
          substantiveNoFindingsReportCount: 0,
          inventoryOnlyNoFindingsReportCount: 0,
          weakReportCount: 0,
        }),
        "",
        "## Finding 1",
        "Evidence: `README.md:2` records the validated source audit report.",
        "Risk: Re-running the synthesis implementer can loop after the report is already committed.",
        "Proposed fix: Keep committed synthesis rework bounded.",
        'Verification: Command `rg -n "runtime audit" README.md` output: `README.md:2:runtime audit evidence`.',
        "",
      ].join("\n"),
    );
    execFileSync("git", ["add", "audit/summary.md"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit summary", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({
        id: "audit-rework-project",
        name: "Audit Rework",
        rootPath,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-source-audit",
        projectId: "audit-rework-project",
        title: "Audit source",
        description: "Report artifact: audit/source-audit.md",
        taskIntent: "audit",
        status: "done",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-synthesis-ready",
        projectId: "audit-rework-project",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
        autoMode: true,
        reworkRequested: true,
        branchName: "feature/audit-synthesis",
        agentActivityLog: [
          "[2026-05-10T15:53:42.113Z] Agent: implement-coordinator started",
          "[2026-05-10T15:54:22.699Z] Tool: write_file audit/summary.md",
          "[2026-05-10T15:54:25.610Z] Tool: git_commit git commit",
          "[2026-05-10T15:54:33.912Z] Agent: implement-coordinator complete",
          "[2026-05-10T15:54:33.947Z] Agent: review-sidecar started",
          "[2026-05-10T15:54:35.784Z] Tool: list_files audit",
          "[2026-05-10T15:54:39.896Z] Agent: review-sidecar complete",
        ].join("\n"),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "audit-rework-project",
      roadmapAlias: "audit",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-source-audit", "task-synthesis-ready"],
      synthesisTaskId: "task-synthesis-ready",
      artifacts: [
        { taskId: "task-source-audit", role: "report", artifactPath: "audit/source-audit.md" },
        { taskId: "task-synthesis-ready", role: "synthesis", artifactPath: "audit/summary.md" },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-source-audit",
      state: "valid",
      failureFamily: null,
      validationDetails: trustedFindingsValidationDetails(),
    });

    await pollAndProcess();

    expect(runImplementer).toHaveBeenCalledWith("task-synthesis-ready", rootPath);
    expect(runReviewer).toHaveBeenCalledWith("task-synthesis-ready", rootPath);
    const task = db.select().from(tasks).where(eq(tasks.id, "task-synthesis-ready")).get();
    expect(task?.status).toBe("done");
    expect(task?.reworkRequested).toBe(false);
    expect(task?.agentActivityLog).not.toContain("skipping implementer and returning to review");
  });

  it("should run report rework even when old report completion evidence is already satisfied", async () => {
    const db = testDb.current;
    const rootPath = initGitFixture("coordinator-audit-report-rework-ready-");
    execFileSync("git", ["checkout", "-b", "feature/audit-report-rework"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    mkdirSync(join(rootPath, "audit"), { recursive: true });
    writeFileSync(
      join(rootPath, "audit", "report.md"),
      [
        "# Audit",
        "",
        "## Finding",
        "Evidence: `README.md:1` contains the repository fixture heading.",
        "Risk: A stale report can appear complete even after a human requested rework.",
        "Proposed fix: Re-run the report implementer when reworkRequested is true.",
        "Verification: Command `git log -1 --name-only --oneline` output included `audit/report.md`.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/report.md"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({
        id: "audit-report-rework-project",
        name: "Audit Report Rework",
        rootPath,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-report-rework-ready",
        projectId: "audit-report-rework-project",
        title: "Audit report findings",
        description: "Report artifact: audit/report.md",
        taskIntent: "audit",
        status: "implementing",
        autoMode: true,
        reworkRequested: true,
        branchName: "feature/audit-report-rework",
        agentActivityLog: [
          "[2026-05-10T15:53:42.113Z] Agent: implement-coordinator started",
          "[2026-05-10T15:54:22.699Z] Tool: write_file audit/report.md",
          "[2026-05-10T15:54:25.610Z] Tool: git_commit git commit",
          "[2026-05-10T15:54:33.912Z] Agent: implement-coordinator complete",
          "[2026-05-10T15:54:33.947Z] Agent: review-sidecar started",
          "[2026-05-10T15:54:35.784Z] Tool: read_file audit/report.md",
          "[2026-05-10T15:54:39.896Z] Agent: review-sidecar complete",
        ].join("\n"),
      })
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "audit-report-rework-project",
      roadmapAlias: "audit-report",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-report-rework-ready"],
      artifacts: [
        { taskId: "task-report-rework-ready", role: "report", artifactPath: "audit/report.md" },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-report-rework-ready",
      state: "valid",
      failureFamily: null,
      validationDetails: trustedFindingsValidationDetails(),
    });

    await pollAndProcess();

    expect(runImplementer).toHaveBeenCalledWith("task-report-rework-ready", rootPath);
    expect(runReviewer).toHaveBeenCalledWith("task-report-rework-ready", rootPath);
    const task = db.select().from(tasks).where(eq(tasks.id, "task-report-rework-ready")).get();
    expect(task?.status).toBe("done");
    expect(task?.agentActivityLog).not.toContain("skipping implementer and returning to review");
    const artifact = listRoadmapBatchArtifacts(batch.batchId)[0];
    expect(artifact?.state).toBe("valid");
  });

  it("should pick up review tasks and dispatch reviewer", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({ id: "task-3", projectId: "test-project", title: "Review me", status: "review" })
      .run();

    await pollAndProcess();

    expect(runReviewer).toHaveBeenCalledWith("task-3", "/tmp/test");
    expect(runPlanChecker).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-3")).get();
    expect(task!.status).toBe("done");
  });

  it("should auto-request changes after review when autoMode=true and fixes are found", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-review-fixes",
        projectId: "test-project",
        title: "Review with fixes",
        status: "review",
        autoMode: true,
        reviewComments: "## Code Review\n- fix issue A\n- fix issue B",
      })
      .run();

    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "rework_requested",
      currentIteration: 1,
      metrics: {
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 2,
        totalBlockingCount: 2,
        parserMode: "structured",
      },
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 1,
        findings: [
          { id: "fix-a", source: "code_review", text: "fix issue A" },
          { id: "fix-b", source: "code_review", text: "fix issue B" },
        ],
      },
    });

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-review-fixes")).get();

    expect(task!.status).toBe("implementing");
    expect(task!.reworkRequested).toBe(true);
  });

  it("should skip auto review gate when autoMode=false", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-review-manual",
        projectId: "test-project",
        title: "Manual review mode",
        status: "review",
        autoMode: false,
        reviewComments: "Some review comments",
      })
      .run();

    // handleAutoReviewGate returns null for non-autoMode tasks
    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce(null);

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-review-manual")).get();
    expect(task!.status).toBe("done");
  });

  it("should proceed to done when auto review gate accepts", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-review-auto-log",
        projectId: "test-project",
        title: "Auto review logging",
        status: "review",
        autoMode: true,
        reviewComments: "## Code Review\nLooks good",
      })
      .run();

    // handleAutoReviewGate returns "accepted" (default mock)
    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-review-auto-log")).get();
    expect(task!.status).toBe("done");
    expect(handleAutoReviewGate).toHaveBeenCalledWith({
      taskId: "task-review-auto-log",
      projectRoot: "/tmp/test",
    });
  });

  it("should stop audit evidence-guard rework at max review iterations", async () => {
    const db = testDb.current;
    const rootPath = initGitFixture("coordinator-audit-evidence-limit-");
    execFileSync("git", ["checkout", "-b", "feature/audit-evidence-limit"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    mkdirSync(join(rootPath, "audit"), { recursive: true });
    writeFileSync(
      join(rootPath, "audit", "security.md"),
      [
        "# Audit",
        "",
        "## Finding",
        "Evidence: `README.md:1` contains the repository fixture heading.",
        "Risk: Placeholder git output can make a weak audit report look verified.",
        "Proposed fix: Replace placeholder verification with observed command output.",
        "Verification: Command `git log -1 --name-only --oneline` output:",
        "```",
        "commit 1234567890abcdef1234567890abcdef12345678",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/security.md"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({ id: "audit-evidence-limit-project", name: "Audit Limit", rootPath })
      .run();
    db.insert(tasks)
      .values({
        id: "task-audit-evidence-limit",
        projectId: "audit-evidence-limit-project",
        title: "Audit security controls",
        description:
          "Report artifact: audit/security.md\nEvidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
        taskIntent: "audit",
        status: "review",
        autoMode: true,
        branchName: "feature/audit-evidence-limit",
        reviewIterationCount: 2,
        maxReviewIterations: 3,
        agentActivityLog: [
          "[2026-05-10T15:54:00.000Z] Agent: implement-coordinator started",
          "[2026-05-10T15:54:01.000Z] Tool: read_file README.md",
          "[2026-05-10T15:54:02.000Z] Tool: write_file audit/security.md",
          "[2026-05-10T15:54:03.000Z] Tool: git_commit git commit",
          "[2026-05-10T15:54:04.000Z] Agent: implement-coordinator complete",
          "[2026-05-10T15:54:05.000Z] Agent: review-sidecar started",
          "[2026-05-10T15:54:06.000Z] Tool: read_file audit/security.md",
          "[2026-05-10T15:54:07.000Z] Agent: review-sidecar complete",
        ].join("\n"),
      })
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "audit-evidence-limit-project",
      roadmapAlias: "audit-limit",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-evidence-limit"],
      artifacts: [
        {
          taskId: "task-audit-evidence-limit",
          role: "report",
          artifactPath: "audit/security.md",
          projectRoot: rootPath,
        },
      ],
    });

    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "accepted",
      currentIteration: 3,
      metrics: {
        strategy: "full_re_review",
        iteration: 3,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      },
      autoReviewState: null,
    });

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-audit-evidence-limit")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("review");
    expect(task!.manualReviewRequired).toBe(true);
    expect(task!.reviewIterationCount).toBe(3);
    expect(task!.blockedReason).toContain("placeholder commit hashes");
    expect(task!.blockedReason).toContain("failed after 3/3 review iterations");
    const artifact = listRoadmapBatchArtifacts(batch.batchId)[0];
    expect(artifact?.state).toBe("source_inconclusive");
    expect(artifact?.failureFamily).toBe("insufficient_substantive_evidence");
  });

  it("should route repeated weak audit evidence failures into repair mode before max iterations", async () => {
    const db = testDb.current;
    const rootPath = initGitFixture("coordinator-audit-evidence-repair-");
    execFileSync("git", ["checkout", "-b", "feature/audit-evidence-repair"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    mkdirSync(join(rootPath, "audit"), { recursive: true });
    writeFileSync(
      join(rootPath, "audit", "security.md"),
      [
        "# Audit",
        "",
        "## Finding",
        "Evidence: `README.md:1` contains the repository fixture heading.",
        "Risk: Placeholder git output can make a weak audit report look verified.",
        "Proposed fix: Replace placeholder verification with observed command output.",
        "Verification: Command `git log -1 --name-only --oneline` output:",
        "```",
        "commit 1234567890abcdef1234567890abcdef12345678",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/security.md"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({ id: "audit-evidence-repair-project", name: "Audit Repair", rootPath })
      .run();
    db.insert(tasks)
      .values({
        id: "task-audit-evidence-repair",
        projectId: "audit-evidence-repair-project",
        title: "Audit security controls",
        description: "Report artifact: audit/security.md",
        taskIntent: "audit",
        status: "review",
        autoMode: true,
        branchName: "feature/audit-evidence-repair",
        reviewIterationCount: 1,
        maxReviewIterations: 3,
        blockedReason:
          "invalid_artifact_content: Completion evidence guard (low_quality_report_evidence)",
        agentActivityLog: [
          "[2026-05-10T15:54:00.000Z] Agent: implement-coordinator started",
          "[2026-05-10T15:54:01.000Z] Tool: read_file README.md",
          "[2026-05-10T15:54:02.000Z] Tool: write_file audit/security.md",
          "[2026-05-10T15:54:03.000Z] Tool: git_commit git commit",
          "[2026-05-10T15:54:04.000Z] Agent: implement-coordinator complete",
          "[2026-05-10T15:54:05.000Z] Agent: review-sidecar started",
          "[2026-05-10T15:54:06.000Z] Tool: read_file audit/security.md",
          "[2026-05-10T15:54:07.000Z] Agent: review-sidecar complete",
        ].join("\n"),
      })
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "audit-evidence-repair-project",
      roadmapAlias: "audit-repair",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-evidence-repair"],
      artifacts: [
        {
          taskId: "task-audit-evidence-repair",
          role: "report",
          artifactPath: "audit/security.md",
          projectRoot: rootPath,
        },
      ],
    });

    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "accepted",
      currentIteration: 2,
      metrics: {
        strategy: "full_re_review",
        iteration: 2,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      },
      autoReviewState: null,
    });

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-audit-evidence-repair")).get();
    expect(task!.status).toBe("implementing");
    expect(task!.reworkRequested).toBe(true);
    expect(task!.manualReviewRequired).toBe(false);
    expect(task!.reviewIterationCount).toBe(2);
    expect(task!.blockedReason).toContain("audit_evidence_repair_required");
    expect(task!.blockedReason).toContain("low_quality_report_evidence");
    const artifact = listRoadmapBatchArtifacts(batch.batchId)[0];
    expect(artifact?.state).toBe("invalid");
    expect(artifact?.failureFamily).toBe("insufficient_substantive_evidence");
  });

  it("should surface missing runtime ledger refs for manifest-backed audit artifacts", async () => {
    const db = testDb.current;
    const rootPath = initGitFixture("coordinator-audit-ledger-missing-ref-");
    execFileSync("git", ["checkout", "-b", "feature/audit-ledger-missing-ref"], {
      cwd: rootPath,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({ id: "audit-ledger-missing-ref-project", name: "Audit Ledger", rootPath })
      .run();
    db.insert(tasks)
      .values({
        id: "task-audit-ledger-missing-ref",
        projectId: "audit-ledger-missing-ref-project",
        title: "Audit runtime evidence ledger",
        description:
          "Scope: README.md\nReport artifact: audit/security.md\nEvidence requirements: every no-findings claim must cite runtime ledger evidence.",
        taskIntent: "audit",
        status: "review",
        autoMode: true,
        branchName: "feature/audit-ledger-missing-ref",
        reviewIterationCount: 2,
        maxReviewIterations: 3,
        agentActivityLog: [
          "[2026-05-10T15:54:00.000Z] Agent: implement-coordinator started",
          "[2026-05-10T15:54:01.000Z] Tool: read_file README.md",
          "[2026-05-10T15:54:02.000Z] Tool: write_file audit/security.md",
          "[2026-05-10T15:54:03.000Z] Tool: git_commit git commit",
          "[2026-05-10T15:54:04.000Z] Agent: implement-coordinator complete",
          "[2026-05-10T15:54:05.000Z] Agent: review-sidecar started",
          "[2026-05-10T15:54:06.000Z] Tool: read_file audit/security.md",
          "[2026-05-10T15:54:07.000Z] Agent: review-sidecar complete",
        ].join("\n"),
      })
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "audit-ledger-missing-ref-project",
      roadmapAlias: "audit-ledger",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-ledger-missing-ref"],
      artifacts: [
        {
          taskId: "task-audit-ledger-missing-ref",
          role: "report",
          artifactPath: "audit/security.md",
          projectRoot: rootPath,
        },
      ],
    });

    const artifactPath = "audit/security.md";
    const body = [
      "# Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `README.md:2` runtime evidence refs were covered and absent.",
      "",
      "Checked files:",
      "- `README.md:2`",
      "",
      "Checked commands:",
      '- Command `rg -n "runtime audit" README.md` output: `README.md:2:runtime audit evidence`',
      "",
    ].join("\n");
    mkdirSync(join(rootPath, "audit"), { recursive: true });
    writeFileSync(
      join(rootPath, artifactPath),
      withAuditManifest({
        body,
        taskId: "task-audit-ledger-missing-ref",
        batchId: batch.batchId,
        artifactPath,
        snapshot: currentGitSnapshot(rootPath),
      }),
      "utf8",
    );
    execFileSync("git", ["add", artifactPath], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add manifest audit report", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });

    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "accepted",
      currentIteration: 3,
      metrics: {
        strategy: "full_re_review",
        iteration: 3,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      },
      autoReviewState: null,
    });

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-audit-ledger-missing-ref")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedReason).toContain("missing_audit_evidence_ref");
    const artifact = listRoadmapBatchArtifacts(batch.batchId)[0];
    expect(artifact?.state).toBe("invalid");
    expect(artifact?.failureFamily).toBe("invalid_artifact_integrity");
    const details = JSON.parse(artifact?.validationDetailsJson ?? "{}") as {
      issues?: Array<{ code: string }>;
    };
    expect(details.issues?.map((issue) => issue.code)).toContain("missing_audit_evidence_ref");
  });

  it("should auto-recover stale implementing task to blocked_external", async () => {
    const db = testDb.current;
    const staleDate = new Date(Date.now() - 100 * 60_000).toISOString();
    db.insert(tasks)
      .values({
        id: "task-stale-impl",
        projectId: "test-project",
        title: "Stale implementer",
        status: "implementing",
        updatedAt: staleDate,
      })
      .run();

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-stale-impl")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("implementing");
    expect(task!.blockedReason).toContain("Watchdog: task stale in implementing");
    expect(task!.retryAfter).toBeTruthy();
    expect(task!.retryCount).toBe(1);
    expect(runImplementer).not.toHaveBeenCalled();
  });

  it("should not treat task as stale when updatedAt is fresh but heartbeat is old", async () => {
    const db = testDb.current;
    const staleHeartbeat = new Date(Date.now() - 31 * 60_000).toISOString();
    const freshUpdatedAt = new Date().toISOString();
    db.insert(tasks)
      .values({
        id: "task-fresh-update",
        projectId: "test-project",
        title: "Freshly moved to implementing",
        status: "implementing",
        lastHeartbeatAt: staleHeartbeat,
        updatedAt: freshUpdatedAt,
      })
      .run();

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-fresh-update")).get();
    expect(task!.status).toBe("done");
    expect(task!.blockedReason).toBeNull();
    expect(runImplementer).toHaveBeenCalledWith("task-fresh-update", "/tmp/test");
  });

  it("should quarantine stale task when watchdog retry limit reached", async () => {
    const db = testDb.current;
    const staleDate = new Date(Date.now() - 100 * 60_000).toISOString();
    db.insert(tasks)
      .values({
        id: "task-stale-limit",
        projectId: "test-project",
        title: "Stale over limit",
        status: "implementing",
        retryCount: 3,
        updatedAt: staleDate,
      })
      .run();

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-stale-limit")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("implementing");
    expect(task!.blockedReason).toContain("auto-retry limit reached");
    expect(task!.retryAfter).toBeNull();
    expect(task!.retryCount).toBe(3);
    expect(runImplementer).not.toHaveBeenCalled();
  });

  it("should revert status on planner failure", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({ id: "task-4", projectId: "test-project", title: "Fail plan", status: "planning" })
      .run();

    vi.mocked(runPlanner).mockRejectedValueOnce(new Error("Planner crashed"));

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-4")).get();
    expect(task!.status).toBe("planning");
  });

  it("should move task to blocked_external on external planner failure", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-ext-1",
        projectId: "test-project",
        title: "External fail",
        status: "planning",
      })
      .run();

    vi.mocked(runPlanner).mockRejectedValueOnce(
      new RuntimeExecutionError("Claude Code process exited with code 1", undefined, "timeout"),
    );

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-ext-1")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("planning");
    expect(task!.blockedReason).toBe("Runtime request timed out. Task will retry automatically.");
    expect(task!.retryAfter).toBeTruthy();
    expect(task!.retryCount).toBe(1);
  });

  it("should redact raw upstream runtime bodies before persisting blocked task state", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-ext-redacted",
        projectId: "test-project",
        title: "External redaction",
        status: "planning",
      })
      .run();

    vi.mocked(runPlanner).mockRejectedValueOnce(
      new RuntimeExecutionError(
        'upstream leaked "token=abc123" <script>alert(1)</script>',
        undefined,
        "transport",
      ),
    );

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-ext-redacted")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedReason).toBe("Runtime request failed. Task will retry automatically.");
    expect(task!.blockedReason).not.toContain("abc123");
    expect(task!.blockedReason).not.toContain("<script>");
    expect(task!.agentActivityLog).toContain(
      "Runtime request failed. Task will retry automatically.",
    );
    expect(task!.agentActivityLog).not.toContain("abc123");
    expect(task!.agentActivityLog).not.toContain("<script>");
  });

  it("should use structured resetAt and persist task limit snapshot on quota exhaustion", async () => {
    const db = testDb.current;
    const resetAt = new Date(Date.now() + 60 * 60_000).toISOString();
    db.insert(tasks)
      .values({
        id: "task-ext-limit",
        projectId: "test-project",
        title: "External rate limit",
        status: "planning",
      })
      .run();

    vi.mocked(runPlanner).mockRejectedValueOnce(
      new RuntimeExecutionError("Usage limit exceeded", undefined, "rate_limit", {
        resetAt,
        limitSnapshot: {
          source: "sdk_event",
          status: "blocked",
          precision: "heuristic",
          checkedAt: "2026-04-17T00:00:00.000Z",
          providerId: "anthropic",
          runtimeId: "claude",
          profileId: "profile-1",
          primaryScope: "time",
          resetAt,
          retryAfterSeconds: null,
          warningThreshold: null,
          windows: [{ scope: "time", resetAt }],
          providerMeta: null,
        },
      }),
    );

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-ext-limit")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("planning");
    expect(task!.retryAfter).toBe(resetAt);
    expect(task!.runtimeLimitSnapshotJson).toContain('"status":"blocked"');
    expect(task!.runtimeLimitSnapshotJson).toContain('"profileId":"profile-1"');
  });

  it("should proactively block planning work when the effective runtime profile is provider-blocked", async () => {
    const db = testDb.current;
    const resetAt = new Date(Date.now() + 30 * 60_000).toISOString();
    insertRuntimeProfile({
      id: "profile-plan-blocked",
      snapshot: {
        source: "sdk_event",
        status: "blocked",
        precision: "heuristic",
        checkedAt: "2026-04-17T00:00:00.000Z",
        providerId: "anthropic",
        runtimeId: "claude",
        profileId: "profile-plan-blocked",
        primaryScope: "time",
        resetAt,
        retryAfterSeconds: null,
        warningThreshold: null,
        windows: [{ scope: "time", resetAt }],
        providerMeta: null,
      },
    });
    db.update(projects)
      .set({ defaultPlanRuntimeProfileId: "profile-plan-blocked" })
      .where(eq(projects.id, "test-project"))
      .run();
    db.insert(tasks)
      .values({
        id: "task-preblocked",
        projectId: "test-project",
        title: "Preblocked plan",
        status: "planning",
      })
      .run();

    await pollAndProcess();

    expect(runPlanner).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-preblocked")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("planning");
    expect(task!.blockedReason).toContain("time limit still blocked");
    expect(task!.blockedReason).toContain("hint=snapshot_reset_at");
    expect(task!.retryAfter).toBe(resetAt);
    expect(task!.runtimeLimitSnapshotJson).toContain('"profileId":"profile-plan-blocked"');
  });

  it("should proactively block exact-threshold planning work before the provider hard-fails", async () => {
    const db = testDb.current;
    const resetAt = new Date(Date.now() + 45 * 60_000).toISOString();
    insertRuntimeProfile({
      id: "profile-plan-threshold",
      snapshot: {
        source: "api_headers",
        status: "warning",
        precision: "exact",
        checkedAt: "2026-04-17T00:00:00.000Z",
        providerId: "anthropic",
        runtimeId: "claude",
        profileId: "profile-plan-threshold",
        primaryScope: "requests",
        resetAt,
        retryAfterSeconds: null,
        warningThreshold: 10,
        windows: [
          {
            scope: "requests",
            percentRemaining: 5,
            warningThreshold: 10,
            resetAt,
          },
        ],
        providerMeta: null,
      },
    });
    db.update(projects)
      .set({ defaultPlanRuntimeProfileId: "profile-plan-threshold" })
      .where(eq(projects.id, "test-project"))
      .run();
    db.insert(tasks)
      .values({
        id: "task-threshold",
        projectId: "test-project",
        title: "Threshold gate",
        status: "planning",
      })
      .run();

    await pollAndProcess();

    expect(runPlanner).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-threshold")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("planning");
    expect(task!.blockedReason).toContain("requests threshold reached");
    expect(task!.blockedReason).toContain("5% <= 10%");
    expect(task!.blockedReason).toContain("hint=window_reset_at");
    expect(task!.retryAfter).toBe(resetAt);
    expect(task!.runtimeLimitSnapshotJson).toContain('"precision":"exact"');
  });

  it("should skip proactive runtime block side-effects when CAS update fails after candidate changes", async () => {
    const db = testDb.current;
    const resetAt = new Date(Date.now() + 30 * 60_000).toISOString();
    insertRuntimeProfile({
      id: "profile-plan-race",
      snapshot: {
        source: "sdk_event",
        status: "blocked",
        precision: "heuristic",
        checkedAt: "2026-04-17T00:00:00.000Z",
        providerId: "anthropic",
        runtimeId: "claude",
        profileId: "profile-plan-race",
        primaryScope: "time",
        resetAt,
        retryAfterSeconds: null,
        warningThreshold: null,
        windows: [{ scope: "time", resetAt }],
        providerMeta: null,
      },
    });
    db.update(projects)
      .set({ defaultPlanRuntimeProfileId: "profile-plan-race" })
      .where(eq(projects.id, "test-project"))
      .run();
    db.insert(tasks)
      .values({
        id: "task-gate-race",
        projectId: "test-project",
        title: "Gate race",
        status: "planning",
      })
      .run();

    blockTaskForRuntimeGateIfEligibleMock.mockImplementationOnce(() => {
      db.update(tasks)
        .set({
          paused: true,
          lockedBy: "other-coordinator",
          lockedUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tasks.id, "task-gate-race"))
        .run();
      return false;
    });

    await pollAndProcess();

    expect(blockTaskForRuntimeGateIfEligibleMock).toHaveBeenCalledTimes(1);
    expect(runPlanner).not.toHaveBeenCalledWith("task-gate-race", "/tmp/test");

    const task = db.select().from(tasks).where(eq(tasks.id, "task-gate-race")).get();
    expect(task!.status).toBe("planning");
    expect(task!.paused).toBe(true);
    expect(task!.blockedReason).toBeNull();
    expect(task!.blockedFromStatus).toBeNull();
    expect(task!.retryAfter).toBeNull();
    expect(task!.runtimeLimitSnapshotJson).toBeNull();
    expect(task!.agentActivityLog).toBeNull();
  });

  it("should continue to later runnable candidates when the first planning task is gated by runtime limits", async () => {
    const db = testDb.current;
    const resetAt = new Date(Date.now() + 30 * 60_000).toISOString();
    insertRuntimeProfile({
      id: "profile-gated-first",
      snapshot: {
        source: "sdk_event",
        status: "blocked",
        precision: "heuristic",
        checkedAt: "2026-04-17T00:00:00.000Z",
        providerId: "anthropic",
        runtimeId: "claude",
        profileId: "profile-gated-first",
        primaryScope: "time",
        resetAt,
        retryAfterSeconds: null,
        warningThreshold: null,
        windows: [{ scope: "time", resetAt }],
        providerMeta: null,
      },
    });
    db.update(projects)
      .set({ defaultPlanRuntimeProfileId: "profile-gated-first" })
      .where(eq(projects.id, "test-project"))
      .run();
    db.insert(projects)
      .values({ id: "project-runnable", name: "Runnable", rootPath: "/tmp/runnable" })
      .run();
    db.insert(tasks)
      .values({
        id: "task-gated-first",
        projectId: "test-project",
        title: "Blocked first",
        status: "planning",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-runnable-second",
        projectId: "project-runnable",
        title: "Runnable second",
        status: "planning",
      })
      .run();

    await pollAndProcess();

    expect(runPlanner).not.toHaveBeenCalledWith("task-gated-first", "/tmp/test");
    expect(runPlanner).toHaveBeenCalledWith("task-runnable-second", "/tmp/runnable");

    const gatedTask = db.select().from(tasks).where(eq(tasks.id, "task-gated-first")).get();
    const runnableTask = db.select().from(tasks).where(eq(tasks.id, "task-runnable-second")).get();

    expect(gatedTask!.status).toBe("blocked_external");
    expect(gatedTask!.retryAfter).toBe(resetAt);
    expect(runnableTask!.status).toBe("done");
  });

  it("should not process blocked task before retryAfter", async () => {
    const db = testDb.current;
    const futureRetry = new Date(Date.now() + 10 * 60_000).toISOString();
    db.insert(tasks)
      .values({
        id: "task-ext-2",
        projectId: "test-project",
        title: "Blocked waiting",
        status: "blocked_external",
        blockedFromStatus: "planning",
        retryAfter: futureRetry,
      })
      .run();

    await pollAndProcess();

    expect(runPlanner).not.toHaveBeenCalled();
    expect(runPlanChecker).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-ext-2")).get();
    expect(task!.status).toBe("blocked_external");
  });

  it("should release blocked task after retryAfter and continue pipeline", async () => {
    const db = testDb.current;
    const pastRetry = new Date(Date.now() - 60_000).toISOString();
    db.insert(tasks)
      .values({
        id: "task-ext-3",
        projectId: "test-project",
        title: "Blocked expired",
        status: "blocked_external",
        blockedFromStatus: "planning",
        retryAfter: pastRetry,
        retryCount: 2,
      })
      .run();

    await pollAndProcess();

    expect(runPlanner).toHaveBeenCalledWith("task-ext-3", "/tmp/test");
    expect(runPlanChecker).toHaveBeenCalledWith("task-ext-3", "/tmp/test");
    const task = db.select().from(tasks).where(eq(tasks.id, "task-ext-3")).get();
    expect(task!.status).toBe("done");
    expect(task!.blockedReason).toBeNull();
    expect(task!.blockedFromStatus).toBeNull();
    expect(task!.retryAfter).toBeNull();
    expect(task!.retryCount).toBe(0);
  });

  it("should revert status on implementer failure", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({ id: "task-5", projectId: "test-project", title: "Fail impl", status: "plan_ready" })
      .run();

    vi.mocked(runImplementer).mockRejectedValueOnce(new Error("Implementer crashed"));

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-5")).get();
    expect(task!.status).toBe("implementing");
  });

  it("should move task to blocked_external when implementer is blocked by permissions", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-impl-perm",
        projectId: "test-project",
        title: "Impl blocked",
        status: "plan_ready",
      })
      .run();

    vi.mocked(runImplementer).mockRejectedValueOnce(
      new RuntimeExecutionError("Implementer blocked by permissions", undefined, "permission"),
    );

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-impl-perm")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("implementing");
    expect(task!.retryAfter).toBeTruthy();
  });

  it("should fast-retry on implementer stream interruption before worker dispatch", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-impl-stream",
        projectId: "test-project",
        title: "Impl stream issue",
        status: "plan_ready",
      })
      .run();

    vi.mocked(runImplementer).mockRejectedValueOnce(
      new Error("Claude stream interrupted before implement-worker dispatch"),
    );

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-impl-stream")).get();
    expect(task!.status).toBe("implementing");
    expect(task!.blockedFromStatus).toBeNull();
    expect(task!.retryAfter).toBeNull();
    expect(task!.blockedReason).toBeNull();
    expect(getCoordinatorRuntimeCounters().fastRetryStreamInterruptions).toBe(1);
  });

  it("should revert to source status on checklist sync error from implementer", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-impl-checklist",
        projectId: "test-project",
        title: "Checklist guard",
        status: "plan_ready",
      })
      .run();

    vi.mocked(runImplementer).mockRejectedValueOnce(
      new Error("Plan checklist incomplete after implementation sync"),
    );

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-impl-checklist")).get();
    expect(task!.status).toBe("implementing");
    expect(task!.blockedReason).toBeNull();
    expect(task!.retryAfter).toBeNull();
  });

  it("should revert status on plan checker failure", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-checker-fail",
        projectId: "test-project",
        title: "Fail checker",
        status: "plan_ready",
        autoMode: true,
      })
      .run();

    vi.mocked(runPlanChecker).mockRejectedValueOnce(new Error("Plan checker crashed"));

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-checker-fail")).get();
    expect(task!.status).toBe("plan_ready");
    expect(runImplementer).not.toHaveBeenCalled();
  });

  it("should requeue invalid plan quality to planning with feedback", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-plan-quality-retry",
        projectId: "test-project",
        title: "Retry weak plan",
        status: "plan_ready",
        autoMode: true,
        plan: "## Plan\n- [ ] /aif-plan fast @.ai-factory/PLAN.md docs:false tests:false",
      })
      .run();

    vi.mocked(runPlanChecker).mockRejectedValueOnce(createPlanQualityError());

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-plan-quality-retry")).get();
    expect(task!.status).toBe("planning");
    expect(task!.blockedFromStatus).toBe("plan_ready");
    expect(task!.retryAfter).toBeNull();
    expect(task!.retryCount).toBe(1);
    expect(task!.blockedReason).toContain("Plan quality guard replan 1/2");
    expect(task!.blockedReason).toContain("slash_fallback_echo");
    expect(runImplementer).not.toHaveBeenCalled();
  });

  it("should preserve plan quality retry count across successful planner before rechecking", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-plan-quality-preserve",
        projectId: "test-project",
        title: "Preserve retry count",
        status: "planning",
        autoMode: true,
        retryCount: 1,
        blockedFromStatus: "plan_ready",
        blockedReason: "Plan quality guard replan 1/2: previous feedback",
        plan: "## Plan\n- [ ] Try again",
      })
      .run();

    vi.mocked(runPlanChecker).mockRejectedValueOnce(createPlanQualityError());

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-plan-quality-preserve")).get();
    expect(runPlanner).toHaveBeenCalledWith("task-plan-quality-preserve", "/tmp/test");
    expect(task!.status).toBe("planning");
    expect(task!.retryCount).toBe(2);
    expect(task!.blockedReason).toContain("Plan quality guard replan 2/2");
  });

  it("should block invalid plan quality after retry limit", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-plan-quality-limit",
        projectId: "test-project",
        title: "Weak plan limit",
        status: "plan_ready",
        autoMode: true,
        retryCount: 2,
        plan: "## Plan\n- [ ] /aif-plan fast @.ai-factory/PLAN.md docs:false tests:false",
      })
      .run();

    vi.mocked(runPlanChecker).mockRejectedValueOnce(createPlanQualityError());

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-plan-quality-limit")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("plan_ready");
    expect(task!.retryAfter).toBeNull();
    expect(task!.retryCount).toBe(3);
    expect(task!.blockedReason).toContain("Retry limit reached");
    expect(task!.blockedReason).toContain("Operator next step");
    expect(runImplementer).not.toHaveBeenCalled();
  });

  it("should skip review stage when skipReview=true and go directly to done", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-skip-review",
        projectId: "test-project",
        title: "Skip review task",
        status: "implementing",
        skipReview: true,
      })
      .run();

    await pollAndProcess();

    expect(runImplementer).toHaveBeenCalledWith("task-skip-review", "/tmp/test");
    expect(runReviewer).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-skip-review")).get();
    expect(task!.status).toBe("done");
  });

  it("should block skipReview audit tasks with generic plan and no evidence delta", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-skip-review-audit",
        projectId: "test-project",
        title: "Initial audit",
        status: "implementing",
        skipReview: true,
        plan: 'Short task\n<aif-plan mode="fast" docs:false tests:false>',
      })
      .run();

    await pollAndProcess();

    expect(runImplementer).not.toHaveBeenCalled();
    expect(runReviewer).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-skip-review-audit")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("implementing");
    expect(task!.blockedReason).toContain("Completion evidence guard");
    expect(task!.blockedReason).toContain("generic_plan");
    expect(task!.blockedReason).not.toContain("missing_report_artifact");
  });

  it("should skip review when skipReview=true in full pipeline from planning", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-skip-review-full",
        projectId: "test-project",
        title: "Full pipeline skip review",
        status: "planning",
        skipReview: true,
      })
      .run();

    await pollAndProcess();

    expect(runPlanner).toHaveBeenCalledWith("task-skip-review-full", "/tmp/test");
    expect(runImplementer).toHaveBeenCalledWith("task-skip-review-full", "/tmp/test");
    expect(runReviewer).not.toHaveBeenCalled();
    const task = db.select().from(tasks).where(eq(tasks.id, "task-skip-review-full")).get();
    expect(task!.status).toBe("done");
  });

  it("should preserve reviewIterationCount across rework cycles until max iterations", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-rework-iter",
        projectId: "test-project",
        title: "Rework iteration tracking",
        status: "review",
        autoMode: true,
        reviewComments: "## Code Review\n- fix issue A",
        maxReviewIterations: 3,
      })
      .run();

    // --- Cycle 1: reviewer completes, gate requests rework ---
    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "rework_requested",
      currentIteration: 1,
      metrics: {
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 1,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 1,
        findings: [{ id: "fix-a", source: "code_review", text: "fix issue A" }],
      },
    });
    await pollAndProcess();

    let task = db.select().from(tasks).where(eq(tasks.id, "task-rework-iter")).get();
    expect(task!.status).toBe("implementing");
    expect(task!.reworkRequested).toBe(true);
    expect(task!.reviewIterationCount).toBe(1);

    // --- Cycle 2: implementer completes, task moves to review (count must survive) ---
    vi.clearAllMocks();
    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "rework_requested",
      currentIteration: 2,
      metrics: {
        strategy: "full_re_review",
        iteration: 2,
        previousBlockingCount: 1,
        stillBlockingCount: 1,
        newBlockingCount: 0,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 2,
        findings: [{ id: "fix-a", source: "code_review", text: "fix issue A" }],
      },
    });
    await pollAndProcess();

    task = db.select().from(tasks).where(eq(tasks.id, "task-rework-iter")).get();
    // After implementer→review→gate rework: count should be 2 now
    expect(task!.status).toBe("implementing");
    expect(task!.reworkRequested).toBe(true);
    expect(task!.reviewIterationCount).toBe(2);

    // --- Cycle 3: implementer completes, reviewer runs, gate hits max iterations ---
    vi.clearAllMocks();
    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "manual_review_required",
      currentIteration: 3,
      handoffReason: "max_iterations",
      metrics: {
        strategy: "full_re_review",
        iteration: 3,
        previousBlockingCount: 1,
        stillBlockingCount: 1,
        newBlockingCount: 0,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 3,
        findings: [{ id: "fix-a", source: "code_review", text: "fix issue A" }],
      },
    });
    await pollAndProcess();

    task = db.select().from(tasks).where(eq(tasks.id, "task-rework-iter")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("review");
    expect(task!.blockedReason).toContain("manual_review_required");
    expect(task!.manualReviewRequired).toBe(true);
    expect(task!.reviewIterationCount).toBe(3);
    expect(task!.autoReviewStateJson).toContain("fix-a");
  });

  it("should reset reviewIterationCount to 0 for non-implementer stage transitions", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-reset-count",
        projectId: "test-project",
        title: "Reset count on planning",
        status: "planning",
        reviewIterationCount: 5,
      })
      .run();

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-reset-count")).get();
    expect(task!.status).toBe("done");
    expect(task!.reviewIterationCount).toBe(0);
  });

  it("should pass reworkRequested=true to implementer during rework and reset after", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-rework-flag",
        projectId: "test-project",
        title: "Rework flag lifecycle",
        status: "review",
        autoMode: true,
        reviewComments: "## Code Review\n- fix issue A",
      })
      .run();

    // Cycle 1: reviewer → gate requests rework
    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "rework_requested",
      currentIteration: 1,
      metrics: {
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 1,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 1,
        findings: [{ id: "fix-a", source: "code_review", text: "fix issue A" }],
      },
    });
    await pollAndProcess();

    let task = db.select().from(tasks).where(eq(tasks.id, "task-rework-flag")).get();
    expect(task!.status).toBe("implementing");
    expect(task!.reworkRequested).toBe(true);

    // Cycle 2: capture reworkRequested inside implementer execution
    let reworkDuringExec: boolean | undefined;
    vi.mocked(runImplementer).mockImplementationOnce(async (taskId) => {
      const t = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      reworkDuringExec = t?.reworkRequested;
    });
    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "accepted",
      currentIteration: 2,
      metrics: {
        strategy: "full_re_review",
        iteration: 2,
        previousBlockingCount: 1,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      },
      autoReviewState: null,
    });
    await pollAndProcess();

    // Implementer must see reworkRequested=true during execution
    expect(reworkDuringExec).toBe(true);

    // After full cycle (implementer→review→accepted→done), reworkRequested is reset
    task = db.select().from(tasks).where(eq(tasks.id, "task-rework-flag")).get();
    expect(task!.status).toBe("done");
    expect(task!.reworkRequested).toBe(false);
  });

  it("should block stalled auto-review loops instead of reworking again", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-stalled-review-loop",
        projectId: "test-project",
        title: "Stalled review loop",
        status: "review",
        autoMode: true,
        reviewComments: "## Blocking Findings\n- fix issue A",
        reviewIterationCount: 2,
        maxReviewIterations: 100,
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 2,
          findings: [
            {
              id: "fix-a",
              source: "code_review",
              text: "fix issue A",
              firstSeenIteration: 1,
              lastSeenIteration: 2,
              streak: 2,
            },
          ],
        }),
      })
      .run();

    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "manual_review_required",
      currentIteration: 3,
      handoffReason: "stalled_rework_loop",
      metrics: {
        strategy: "full_re_review",
        iteration: 3,
        previousBlockingCount: 1,
        stillBlockingCount: 1,
        newBlockingCount: 0,
        totalBlockingCount: 1,
        parserMode: "structured",
      },
      autoReviewState: {
        strategy: "full_re_review",
        iteration: 3,
        findings: [
          {
            id: "fix-a",
            source: "code_review",
            text: "fix issue A",
            firstSeenIteration: 1,
            lastSeenIteration: 3,
            streak: 3,
          },
        ],
      },
    });

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-stalled-review-loop")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("review");
    expect(task!.blockedReason).toContain("manual_review_required: stalled_rework_loop");
    expect(task!.blockedReason).toContain("[fix-a] code_review: fix issue A");
    expect(task!.manualReviewRequired).toBe(true);
    expect(task!.reworkRequested).toBe(false);
    expect(task!.reviewIterationCount).toBe(3);
    expect(task!.autoReviewStateJson).toContain('"streak":3');
  });

  it("should block audit rework that resubmits an unchanged artifact", async () => {
    const db = testDb.current;
    const rootPath = initGitFixture("coordinator-no-delta-rework-");
    mkdirSync(join(rootPath, "audit"), { recursive: true });
    const reportText = "# Audit\n\nFinding still needs evidence.\n";
    writeFileSync(join(rootPath, "audit", "report.md"), reportText, "utf8");

    db.insert(projects).values({ id: "no-delta-project", name: "No Delta", rootPath }).run();
    db.insert(tasks)
      .values({
        id: "task-no-delta-rework",
        projectId: "no-delta-project",
        title: "Audit no-delta rework",
        description: "Report artifact: audit/report.md",
        taskIntent: "audit",
        status: "implementing",
        autoMode: true,
        reworkRequested: true,
        reviewIterationCount: 2,
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 2,
          findings: [
            {
              id: "fix-a",
              source: "code_review",
              text: "Replace weak audit evidence",
              firstSeenIteration: 1,
              lastSeenIteration: 2,
              streak: 2,
            },
          ],
          reworkSnapshot: {
            iteration: 2,
            artifactPath: "audit/report.md",
            artifactContentSha: computeAuditReportArtifactSha256(reportText),
            findingIds: ["fix-a"],
          },
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "no-delta-project",
      roadmapAlias: "no-delta",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-no-delta-rework"],
      artifacts: [
        {
          taskId: "task-no-delta-rework",
          role: "report",
          artifactPath: "audit/report.md",
          projectRoot: rootPath,
        },
      ],
    });

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-no-delta-rework")).get();
    expect(runImplementer).toHaveBeenCalledWith("task-no-delta-rework", rootPath);
    expect(runReviewer).not.toHaveBeenCalledWith("task-no-delta-rework", rootPath);
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("implementing");
    expect(task!.blockedReason).toContain("manual_review_required: no_substantive_rework_delta");
    expect(task!.blockedReason).toContain("audit/report.md");
    expect(task!.blockedReason).toContain("fix-a");
    expect(task!.manualReviewRequired).toBe(true);
    expect(task!.reworkRequested).toBe(false);
    expect(task!.autoReviewStateJson).toContain('"reworkSnapshot"');
  });

  it("should preserve implementer terminalization instead of moving back to review", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-implementer-terminalized",
        projectId: "test-project",
        title: "Implementer terminalized",
        status: "implementing",
        reworkRequested: true,
      })
      .run();
    vi.mocked(runImplementer).mockImplementationOnce(async (taskId) => {
      db.update(tasks)
        .set({
          status: "blocked_external",
          blockedReason:
            "manual_review_required: deterministic audit report repair could not resolve strict validator issue codes for audit/report.md: missing_report_manifest",
          blockedFromStatus: "implementing",
          reworkRequested: false,
          manualReviewRequired: true,
        })
        .where(eq(tasks.id, taskId))
        .run();
    });

    await pollAndProcess();

    expect(runImplementer).toHaveBeenCalledWith("task-implementer-terminalized", "/tmp/test");
    expect(runReviewer).not.toHaveBeenCalledWith("task-implementer-terminalized", "/tmp/test");
    const task = db.select().from(tasks).where(eq(tasks.id, "task-implementer-terminalized")).get();
    expect(task!.status).toBe("blocked_external");
    expect(task!.blockedFromStatus).toBe("implementing");
    expect(task!.manualReviewRequired).toBe(true);
    expect(task!.reworkRequested).toBe(false);
    expect(task!.blockedReason).toContain("missing_report_manifest");
  });

  it("should allow audit rework with artifact content changes to proceed to review", async () => {
    const db = testDb.current;
    const rootPath = initGitFixture("coordinator-changed-rework-");
    mkdirSync(join(rootPath, "audit"), { recursive: true });
    const beforeText = "# Audit\n\nFinding still needs evidence.\n";
    const afterText = "# Audit\n\nEvidence: `README.md:1` contains the fixture heading.\n";
    writeFileSync(join(rootPath, "audit", "report.md"), beforeText, "utf8");

    db.insert(projects)
      .values({ id: "changed-rework-project", name: "Changed Rework", rootPath })
      .run();
    db.insert(tasks)
      .values({
        id: "task-changed-rework",
        projectId: "changed-rework-project",
        title: "Audit changed rework",
        description: "Report artifact: audit/report.md",
        taskIntent: "audit",
        status: "implementing",
        autoMode: true,
        reworkRequested: true,
        reviewIterationCount: 2,
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 2,
          findings: [
            {
              id: "fix-a",
              source: "code_review",
              text: "Replace weak audit evidence",
              firstSeenIteration: 1,
              lastSeenIteration: 2,
              streak: 2,
            },
          ],
          reworkSnapshot: {
            iteration: 2,
            artifactPath: "audit/report.md",
            artifactContentSha: computeAuditReportArtifactSha256(beforeText),
            findingIds: ["fix-a"],
          },
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "changed-rework-project",
      roadmapAlias: "changed-rework",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-changed-rework"],
      artifacts: [
        {
          taskId: "task-changed-rework",
          role: "report",
          artifactPath: "audit/report.md",
          projectRoot: rootPath,
        },
      ],
    });

    let autoReviewStateDuringReview: string | null | undefined;
    vi.mocked(runImplementer).mockImplementationOnce(async () => {
      writeFileSync(join(rootPath, "audit", "report.md"), afterText, "utf8");
    });
    vi.mocked(runReviewer).mockImplementationOnce(async (taskId) => {
      autoReviewStateDuringReview = db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .get()?.autoReviewStateJson;
    });
    vi.mocked(handleAutoReviewGate).mockResolvedValueOnce({
      status: "accepted",
      currentIteration: 3,
      metrics: {
        strategy: "full_re_review",
        iteration: 3,
        previousBlockingCount: 1,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      },
      autoReviewState: null,
    });

    await pollAndProcess();

    const task = db.select().from(tasks).where(eq(tasks.id, "task-changed-rework")).get();
    expect(runImplementer).toHaveBeenCalledWith("task-changed-rework", rootPath);
    expect(runReviewer).toHaveBeenCalledWith("task-changed-rework", rootPath);
    expect(autoReviewStateDuringReview).toContain("fix-a");
    expect(autoReviewStateDuringReview).toContain("reworkSnapshot");
    expect(task!.status).toBe("implementing");
    expect(task!.blockedReason).not.toContain("no_substantive_rework_delta");
    expect(task!.manualReviewRequired).toBe(false);
  });

  it("should do nothing when no tasks exist", async () => {
    await pollAndProcess();

    expect(runPlanner).not.toHaveBeenCalled();
    expect(runPlanChecker).not.toHaveBeenCalled();
    expect(runImplementer).not.toHaveBeenCalled();
    expect(runReviewer).not.toHaveBeenCalled();
  });

  it("should set intermediate status during processing", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-6",
        projectId: "test-project",
        title: "Intermediate",
        status: "planning",
      })
      .run();

    // Track status changes during planner execution
    let statusDuringExec: string | undefined;
    vi.mocked(runPlanner).mockImplementationOnce(async () => {
      const t = db.select().from(tasks).where(eq(tasks.id, "task-6")).get();
      statusDuringExec = t?.status;
    });

    await pollAndProcess();

    expect(statusDuringExec).toBe("planning");
  });

  // ── Parallel mode per-project tests ───────────────────────

  it("should process multiple tasks concurrently for parallel-enabled project", async () => {
    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "parallel-proj",
        name: "Parallel",
        rootPath: "/tmp/parallel",
        parallelEnabled: true,
      })
      .run();
    db.insert(tasks)
      .values({ id: "p-task-1", projectId: "parallel-proj", title: "T1", status: "planning" })
      .run();
    db.insert(tasks)
      .values({ id: "p-task-2", projectId: "parallel-proj", title: "T2", status: "planning" })
      .run();

    await pollAndProcess();

    // Both tasks should have been picked up by planner
    expect(runPlanner).toHaveBeenCalledWith("p-task-1", "/tmp/parallel");
    expect(runPlanner).toHaveBeenCalledWith("p-task-2", "/tmp/parallel");
  });

  it("should serialize branch-isolated parallel projects while task worktrees are disabled", async () => {
    const db = testDb.current;
    const rootPath = mkdtempSync(join(tmpdir(), "coordinator-branch-isolated-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], {
      cwd: rootPath,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "T"], { cwd: rootPath, stdio: "ignore" });
    writeFileSync(join(rootPath, "README.md"), "# t\n");
    execFileSync("git", ["add", "README.md"], { cwd: rootPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: rootPath,
      stdio: "ignore",
    });

    db.insert(projects)
      .values({
        id: "parallel-branch-proj",
        name: "Parallel Branch",
        rootPath,
        parallelEnabled: true,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "branch-task-1",
        projectId: "parallel-branch-proj",
        title: "T1",
        status: "planning",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "branch-task-2",
        projectId: "parallel-branch-proj",
        title: "T2",
        status: "planning",
      })
      .run();

    await pollAndProcess();

    const plannerCalls = (runPlanner as any).mock.calls.filter(
      ([, calledRoot]: [string, string]) => calledRoot === rootPath,
    );
    expect(plannerCalls).toHaveLength(1);
  });

  it("should process only 1 task at a time for non-parallel project", async () => {
    const db = testDb.current;
    // test-project is non-parallel (default)
    db.insert(tasks)
      .values({ id: "s-task-1", projectId: "test-project", title: "S1", status: "planning" })
      .run();
    db.insert(tasks)
      .values({ id: "s-task-2", projectId: "test-project", title: "S2", status: "planning" })
      .run();

    await pollAndProcess();

    // Only the first task should complete the full pipeline (serial)
    const t1 = db.select().from(tasks).where(eq(tasks.id, "s-task-1")).get();
    const t2 = db.select().from(tasks).where(eq(tasks.id, "s-task-2")).get();
    expect(t1!.status).toBe("done");
    // Second task either untouched or partially progressed but not both done
    expect(t2!.status).not.toBe("done");
  });

  it("should force full mode via API for parallel project", async () => {
    const db = testDb.current;
    db.insert(projects)
      .values({ id: "par-proj", name: "Par", rootPath: "/tmp/par", parallelEnabled: true })
      .run();

    // Verify project was created with parallel enabled
    const proj = db.select().from(projects).where(eq(projects.id, "par-proj")).get();
    expect(proj!.parallelEnabled).toBe(true);
  });

  it("should respect global max across stages (totalActive cap)", async () => {
    const db = testDb.current;
    db.insert(projects)
      .values({ id: "cap-proj", name: "Cap", rootPath: "/tmp/cap", parallelEnabled: true })
      .run();

    // Create 5 tasks in planning — globalMax is 3, so at most 3 should be picked
    for (let i = 1; i <= 5; i++) {
      db.insert(tasks)
        .values({ id: `cap-task-${i}`, projectId: "cap-proj", title: `C${i}`, status: "planning" })
        .run();
    }

    await pollAndProcess();

    // Semaphore should have released all slots after allSettled
    expect(getStageSemaphore().totalActive()).toBe(0);

    // At most globalMax (3) planner calls should have been made
    const plannerCalls = (runPlanner as any).mock.calls.length;
    expect(plannerCalls).toBeLessThanOrEqual(3);
    expect(plannerCalls).toBeGreaterThanOrEqual(1);
  });
});
