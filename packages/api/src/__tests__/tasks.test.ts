import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appSettings,
  buildEvidenceUnit,
  buildEvidenceUnitPayload,
  computeAuditReportContentSha256,
  configAuditEvents,
  formatAuditSynthesisOutcomeForArtifact,
  projects,
  roadmapBatchArtifacts,
  runtimeProfiles,
  taskStageArtifacts,
  usageEvents,
  memoryItems,
  taskRequirementQuestions,
  taskComments,
  tasks,
} from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

// Mock the shared db module to use test db
const testDb = { current: createTestDb() };
const mockInternalBroadcastToken = { value: "" };
const mockRequirementsIntakeEnabled = { value: undefined as boolean | undefined };
const mockRequirementsQaEnabled = { value: undefined as boolean | undefined };

vi.mock("@aif/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared")>();
  const resolvedEnv = actual.getEnv();
  return {
    ...actual,
    getEnv: () => ({
      ...resolvedEnv,
      INTERNAL_BROADCAST_TOKEN: mockInternalBroadcastToken.value,
      AIF_REQUIREMENTS_INTAKE_ENABLED:
        mockRequirementsIntakeEnabled.value ?? resolvedEnv.AIF_REQUIREMENTS_INTAKE_ENABLED,
      AIF_REQUIREMENTS_QA_ENABLED:
        mockRequirementsQaEnabled.value ?? resolvedEnv.AIF_REQUIREMENTS_QA_ENABLED,
    }),
  };
});

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

// Mock broadcast to prevent WS errors in tests
vi.mock("../ws.js", () => ({
  broadcast: vi.fn(),
  setupWebSocket: vi.fn(() => ({
    injectWebSocket: vi.fn(),
    upgradeWebSocket: vi.fn(),
  })),
  getInjectWebSocket: vi.fn(),
}));

// Mock attachment storage for download tests
const mockReadAttachment = vi.fn();
vi.mock("../services/attachmentStorage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/attachmentStorage.js")>();
  return {
    ...actual,
    readAttachment: (...args: unknown[]) => mockReadAttachment(...args),
  };
});

const mockRunApiRuntimeOneShot = vi.fn();
vi.mock("../services/runtime.js", () => ({
  runApiRuntimeOneShot: (...args: unknown[]) => mockRunApiRuntimeOneShot(...args),
  resolveApiLightModel: async () => "claude-haiku-3-5",
}));

// Import after mocks
const { tasksRouter } = await import("../routes/tasks.js");
const { broadcast: mockBroadcast } = await import("../ws.js");
const dataModule = await import("@aif/data");
const {
  createRoadmapBatchContract,
  createCurrentRequirementsSnapshot,
  appendEvidenceUnitEvent,
  buildTaskQaSourceFingerprint,
  recordTaskAcceptancePack,
  listRoadmapBatchArtifacts,
  listRoadmapBatchArtifactAttempts,
  recordTaskStageArtifactAttempt,
  updateRoadmapBatchArtifactState,
} = dataModule;

function createApp() {
  const app = new Hono();
  app.route("/tasks", tasksRouter);
  return app;
}

function createAppWithSettings() {
  const app = new Hono();
  app.get("/settings", async (c) => {
    const { getEnv } = await import("@aif/shared");
    const env = getEnv();
    return c.json({
      useSubagents: env.AGENT_USE_SUBAGENTS,
      maxReviewIterations: env.AGENT_MAX_REVIEW_ITERATIONS,
      autoReviewStrategy: env.AGENT_AUTO_REVIEW_STRATEGY,
      warmupEnabled: env.AIF_WARMUP_ENABLED,
    });
  });
  return app;
}

function insertTestProject(db: ReturnType<typeof createTestDb>, rootPath = "/tmp/test-project") {
  db.insert(projects).values({ id: "test-project", name: "Test Project", rootPath }).run();
}

function initGitProject(rootPath: string) {
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: rootPath, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@t.local"], {
    cwd: rootPath,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "T"], { cwd: rootPath, stdio: "ignore" });
  writeFileSync(join(rootPath, "README.md"), "# test\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: rootPath, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
    cwd: rootPath,
    stdio: "ignore",
  });
}

const IMPLEMENTATION_VERIFICATION_COMMAND = "npm.cmd test";

function implementationActivityLog(command = IMPLEMENTATION_VERIFICATION_COMMAND): string {
  return [
    "[2026-05-29T19:00:00.000Z] Agent: aif-implement started",
    `[2026-05-29T19:00:01.000Z] Tool: ${command}`,
    "[2026-05-29T19:00:02.000Z] Agent: aif-implement completed",
  ].join("\n");
}

function implementationManifest(input: {
  taskId: string;
  intent: "feature" | "fix" | "docs" | "tests";
  changedFiles: string[];
  regressionExplanation?: string | null;
}): string {
  return JSON.stringify({
    version: 1,
    taskId: input.taskId,
    intent: input.intent,
    planManifestHash: null,
    changedFiles: input.changedFiles.map((path) => ({ path, status: "modified" })),
    diffSummary: {
      summary: input.changedFiles.length
        ? `Changed ${input.changedFiles.join(", ")}`
        : "No source file delta required.",
      filesChanged: input.changedFiles.length,
    },
    verificationEvidence: [
      {
        id: "verify-api",
        command: IMPLEMENTATION_VERIFICATION_COMMAND,
        status: "passed",
        outputSha256: "a".repeat(64),
        outputPreview: "tests passed",
        outputPreviewTruncated: false,
      },
    ],
    acceptanceCriteria: [
      {
        id: "AC1",
        status: "satisfied",
        evidenceRefs: ["verify-api"],
      },
    ],
    evidenceRefs: ["verify-api"],
    planChecklist: { total: 1, completed: 1, pending: 0, synced: true, pendingItems: [] },
    reviewClosure: { status: "passed", evidenceRefs: ["verify-api"] },
    commitEvidence: { status: "not_required", evidenceRefs: [] },
    regressionExplanation: input.regressionExplanation ?? null,
    knownLimitations: [],
  });
}

describe("tasks API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    testDb.current = createTestDb();
    app = createApp();
    mockInternalBroadcastToken.value = "";
    mockRequirementsIntakeEnabled.value = undefined;
    mockRequirementsQaEnabled.value = undefined;
    vi.mocked(mockBroadcast).mockClear();
    mockRunApiRuntimeOneShot.mockReset();
    mockRunApiRuntimeOneShot.mockResolvedValue({
      result: {
        outputText: "## Updated plan\n- Fast fix applied",
      },
      context: {},
    });
  });

  describe("GET /tasks", () => {
    it("should return empty list initially", async () => {
      const res = await app.request("/tasks");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("should return all tasks", async () => {
      const db = testDb.current;
      db.insert(tasks).values({ id: "1", projectId: "test-project", title: "Task 1" }).run();
      db.insert(tasks).values({ id: "2", projectId: "test-project", title: "Task 2" }).run();

      const res = await app.request("/tasks");
      const body = await res.json();
      expect(body).toHaveLength(2);
    });

    it("resolves the app task default for every listed task", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.update(appSettings).set({ defaultTaskRuntimeProfileId: "app-task-default" }).run();
      db.insert(runtimeProfiles)
        .values({
          id: "app-task-default",
          projectId: null,
          name: "App Task Default",
          runtimeId: "claude",
          providerId: "anthropic",
          enabled: true,
        })
        .run();
      db.insert(tasks)
        .values([
          { id: "1", projectId: "test-project", title: "Task 1" },
          { id: "2", projectId: "test-project", title: "Task 2" },
        ])
        .run();

      const res = await app.request("/tasks");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body).toHaveLength(2);
      expect(
        body.map((task: { effectiveRuntime: Record<string, string> }) => task.effectiveRuntime),
      ).toEqual([
        {
          source: "system_default",
          profileId: "app-task-default",
          runtimeId: "claude",
          providerId: "anthropic",
          profileName: "App Task Default",
        },
        {
          source: "system_default",
          profileId: "app-task-default",
          runtimeId: "claude",
          providerId: "anthropic",
          profileName: "App Task Default",
        },
      ]);
    });

    it("attaches audit artifact trust rollups to list and detail responses", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values([
          {
            id: "audit-valid",
            projectId: "test-project",
            title: "Audit valid source",
            taskIntent: "audit",
            roadmapAlias: "audit-rollup",
            status: "done",
          },
          {
            id: "audit-rejected",
            projectId: "test-project",
            title: "Audit rejected source",
            taskIntent: "audit",
            roadmapAlias: "audit-rollup",
            status: "done",
          },
          {
            id: "audit-inconclusive",
            projectId: "test-project",
            title: "Audit inconclusive source",
            taskIntent: "audit",
            roadmapAlias: "audit-rollup",
            status: "done",
          },
          {
            id: "audit-synthesis",
            projectId: "test-project",
            title: "Synthesize audit",
            taskIntent: "audit",
            roadmapAlias: "audit-rollup",
            status: "blocked_external",
          },
        ])
        .run();
      createRoadmapBatchContract({
        projectId: "test-project",
        roadmapAlias: "audit-rollup",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: ["audit-valid", "audit-rejected", "audit-inconclusive", "audit-synthesis"],
        synthesisTaskId: "audit-synthesis",
        artifacts: [
          { taskId: "audit-valid", role: "report", artifactPath: "audit/valid.md" },
          { taskId: "audit-rejected", role: "report", artifactPath: "audit/rejected.md" },
          {
            taskId: "audit-inconclusive",
            role: "report",
            artifactPath: "audit/inconclusive.md",
          },
          { taskId: "audit-synthesis", role: "synthesis", artifactPath: "audit/final.md" },
        ],
      });
      updateRoadmapBatchArtifactState({
        taskId: "audit-valid",
        state: "valid",
        failureFamily: null,
        validationDetails: {
          auditReportValidation: {
            sourceClassification: "validated_findings_present",
            manifestStatus: "valid",
          },
          auditArtifactLifecycle: {
            ok: true,
            artifactPath: "audit/valid.md",
            committedRef: "HEAD",
            states: {
              draft_written: true,
              manifest_finalized: true,
              validator_passed: true,
              git_committed: true,
              committed_blob_revalidated: true,
              artifact_state_valid: true,
            },
            issues: [],
            worktreeArtifactSha256: "a".repeat(64),
            committedArtifactSha256: "a".repeat(64),
            worktreeContentSha256: "b".repeat(64),
            committedContentSha256: "b".repeat(64),
            committedValidation: {
              ok: true,
              issueCodes: [],
              artifactSha256: "a".repeat(64),
              contentSha256: "b".repeat(64),
              manifestStatus: "valid",
              manifestVersion: 1,
              sourceClassification: "validated_findings_present",
              sourceSnapshot: {
                id: "git:commit:tree",
                commit: "commit",
                tree: "tree",
                dirty: false,
              },
            },
          },
          auditCardDecision: {
            otzRequirement: "Produce an accepted audit source report.",
            acceptanceCriteria: ["Report artifact exists and is trusted valid."],
            implementationEvidence: ["audit/valid.md"],
            verificationEvidence: ["completion evidence guard accepted audit artifact"],
            requirementCompletion: "satisfied",
            verificationStrength: "verified",
            auditFindingValidity: {
              validFindings: 0,
              weakFindings: 1,
              discardedFindings: 1,
            },
            residualRisks: [],
            finalStatus: "closed_verified",
          },
        },
      });
      updateRoadmapBatchArtifactState({
        taskId: "audit-rejected",
        state: "invalid",
        failureFamily: "invalid_artifact_content",
        reworkStatus: "manual_review_required",
        validationDetails: { issues: [{ code: "malformed_report_artifact" }] },
      });
      updateRoadmapBatchArtifactState({
        taskId: "audit-inconclusive",
        state: "source_inconclusive",
        failureFamily: "source_inconclusive",
        reworkStatus: "terminal_inconclusive",
        validationDetails: {
          auditReportValidation: { sourceClassification: "source_inconclusive" },
        },
      });
      updateRoadmapBatchArtifactState({
        taskId: "audit-synthesis",
        state: "synthesis_not_ready",
        failureFamily: "synthesis_not_ready",
        validationDetails: { reason: "plan_quality" },
      });

      const listRes = await app.request("/tasks");
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(
        listBody.find((task: { id: string }) => task.id === "audit-valid").artifactTrust,
      ).toEqual(
        expect.objectContaining({
          artifactState: "valid",
          artifactTrustLevel: "trusted",
          trustedSynthesisInput: true,
          nextAction: "none",
          auditCardDecision: expect.objectContaining({
            requirementCompletion: "satisfied",
            verificationStrength: "verified",
            auditFindingValidity: {
              validFindings: 0,
              weakFindings: 1,
              discardedFindings: 1,
            },
            residualRisks: [],
            finalStatus: "closed_verified",
          }),
        }),
      );
      const trustRes = await app.request("/tasks/audit-valid/artifact-trust");
      expect(trustRes.status).toBe(200);
      const trustBody = await trustRes.json();
      expect(trustBody.auditCardDecision).toEqual(
        expect.objectContaining({
          requirementCompletion: "satisfied",
          verificationStrength: "verified",
          finalStatus: "closed_verified",
        }),
      );
      expect(
        listBody.find((task: { id: string }) => task.id === "audit-rejected").artifactTrust,
      ).toEqual(
        expect.objectContaining({
          artifactState: "invalid",
          artifactTrustLevel: "untrusted",
          claimOutcome: "refuted",
          nextAction: "retry_source_rework",
        }),
      );
      expect(
        listBody.find((task: { id: string }) => task.id === "audit-inconclusive").artifactTrust,
      ).toEqual(
        expect.objectContaining({
          artifactState: "source_inconclusive",
          artifactTrustLevel: "untrusted",
          claimOutcome: "inconclusive",
          latestAttemptOutcome: "terminal_inconclusive",
          nextAction: "inspect_untrusted_source",
        }),
      );

      const detailRes = await app.request("/tasks/audit-synthesis");
      expect(detailRes.status).toBe(200);
      const detailBody = await detailRes.json();
      expect(detailBody.artifactTrust).toEqual(
        expect.objectContaining({
          taskStatus: "blocked_external",
          artifactRole: "synthesis",
          artifactState: "synthesis_not_ready",
          failureFamily: "synthesis_not_ready",
          nextAction: "retry_synthesis",
          reasonCodes: expect.arrayContaining([
            "plan_quality",
            "synthesis_not_ready",
            "untrusted_artifact",
          ]),
        }),
      );

      updateRoadmapBatchArtifactState({
        taskId: "audit-synthesis",
        state: "terminal_inconclusive",
        failureFamily: "inconclusive_batch_evidence",
        reworkStatus: "terminal_inconclusive",
        validationDetails: { auditSynthesisOutcome: { kind: "inconclusive_batch_evidence" } },
      });
      const inconclusiveRes = await app.request("/tasks/audit-synthesis");
      expect(inconclusiveRes.status).toBe(200);
      const inconclusiveBody = await inconclusiveRes.json();
      expect(inconclusiveBody.artifactTrust).toEqual(
        expect.objectContaining({
          artifactState: "terminal_inconclusive",
          artifactTrustLevel: "untrusted",
          claimOutcome: "inconclusive",
          nextAction: "inspect_untrusted_source",
          reasonCodes: expect.arrayContaining(["inconclusive_batch_evidence"]),
          batchCounts: expect.objectContaining({ trustedValid: 1, inconclusive: 1, rejected: 1 }),
        }),
      );
    });

    it("should return 400 for invalid projectId format", async () => {
      const res = await app.request("/tasks?projectId=not-a-uuid");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid projectId format/);
    });
  });

  describe("POST /tasks scheduledAt", () => {
    it("accepts a future ISO-8601 scheduledAt", async () => {
      const future = new Date(Date.now() + 3_600_000).toISOString();
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Scheduled",
          projectId: "test-project",
          scheduledAt: future,
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.scheduledAt).toBe(future);
    });

    it("rejects a past scheduledAt with 400", async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Past",
          projectId: "test-project",
          scheduledAt: past,
        }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects a non-ISO-8601 scheduledAt", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Garbage",
          projectId: "test-project",
          scheduledAt: "tomorrow",
        }),
      });
      expect(res.status).toBe(400);
    });

    it("normalizes non-UTC scheduledAt to UTC Z form", async () => {
      // +03:00 offset, 2 hours in the future as UTC instant
      const future = new Date(Date.now() + 2 * 60 * 60_000);
      const futureInOffset = new Date(future.getTime() + 3 * 60 * 60_000);
      const yyyy = futureInOffset.getUTCFullYear();
      const mm = String(futureInOffset.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(futureInOffset.getUTCDate()).padStart(2, "0");
      // Express the same instant with +03:00 offset (UTC+3)
      const offsetIso = `${yyyy}-${mm}-${dd}T${String(futureInOffset.getUTCHours()).padStart(2, "0")}:${String(futureInOffset.getUTCMinutes()).padStart(2, "0")}:00+03:00`;

      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "TZ",
          projectId: "test-project",
          scheduledAt: offsetIso,
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      // Must be normalized to UTC Z so DB lexical compare matches instant compare
      expect(body.scheduledAt).toMatch(/Z$/);
      expect(new Date(body.scheduledAt).getTime()).toBe(new Date(offsetIso).getTime());
    });

    it("PUT allows null to clear scheduledAt", async () => {
      const future = new Date(Date.now() + 3_600_000).toISOString();
      const created = await (
        await app.request("/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "S", projectId: "test-project", scheduledAt: future }),
        })
      ).json();

      const res = await app.request(`/tasks/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: null }),
      });
      expect(res.status).toBe(200);
      const updated = await res.json();
      expect(updated.scheduledAt).toBeNull();
    });
  });

  describe("POST /tasks", () => {
    it("should create a task", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New task",
          description: "Description",
          priority: 2,
          projectId: "test-project",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.title).toBe("New task");
      expect(body.description).toBe("Description");
      expect(body.priority).toBe(2);
      expect(body.autoMode).toBe(true);
      expect(body.taskIntent).toBe("general");
      expect(body.isFix).toBe(false);
      expect(body.status).toBe("backlog");
    });

    it("creates hierarchy children with server-computed fields and ignores computed input", async () => {
      const parentRes = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Parent",
          description: "Container",
          projectId: "test-project",
          hierarchyRole: "container",
          parentCloseoutPolicy: "all_children_done",
        }),
      });
      expect(parentRes.status).toBe(201);
      const parent = await parentRes.json();
      expect(parent.parentCloseoutPolicy).toBe("all_children_done");

      const childRes = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Child",
          description: "Leaf",
          projectId: "test-project",
          parentTaskId: parent.id,
          rootTaskId: "caller-root",
          hierarchyDepth: 99,
          hierarchyPosition: -1,
          childSummary: { childCount: 99 },
          children: [{ id: "caller-child" }],
        }),
      });

      expect(childRes.status).toBe(201);
      const child = await childRes.json();
      expect(child.parentTaskId).toBe(parent.id);
      expect(child.rootTaskId).toBe(parent.id);
      expect(child.hierarchyDepth).toBe(1);
      expect(child.hierarchyPosition).toBe(1000);
      expect(child.childSummary).toEqual({
        childCount: 0,
        blockedChildCount: 0,
        activeChildCount: 0,
        verifiedChildCount: 0,
      });
      expect(child.children).toBeUndefined();
    });

    it("returns controlled 4xx responses for hierarchy create validation failures", async () => {
      const missingParent = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Missing parent child",
          projectId: "test-project",
          parentTaskId: "missing-parent",
        }),
      });
      expect(missingParent.status).toBe(400);
      await expect(missingParent.json()).resolves.toMatchObject({
        code: "TASK_HIERARCHY_INVALID",
      });

      testDb.current
        .insert(projects)
        .values([
          { id: "test-project", name: "Test Project", rootPath: "/tmp/test" },
          { id: "other-project", name: "Other Project", rootPath: "/tmp/other" },
        ])
        .run();
      testDb.current
        .insert(tasks)
        .values({
          id: "foreign-parent",
          projectId: "other-project",
          title: "Foreign parent",
          hierarchyRole: "container",
        })
        .run();

      const crossProject = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Cross project child",
          projectId: "test-project",
          parentTaskId: "foreign-parent",
        }),
      });
      expect(crossProject.status).toBe(400);
      await expect(crossProject.json()).resolves.toMatchObject({
        code: "TASK_HIERARCHY_INVALID",
      });

      const root = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Root",
          projectId: "test-project",
          hierarchyRole: "container",
        }),
      });
      const rootBody = await root.json();
      const level1 = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Level 1",
          projectId: "test-project",
          parentTaskId: rootBody.id,
          hierarchyRole: "container",
        }),
      });
      const level1Body = await level1.json();
      const level2 = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Level 2",
          projectId: "test-project",
          parentTaskId: level1Body.id,
          hierarchyRole: "container",
        }),
      });
      expect(level2.status).toBe(201);
      const level2Body = await level2.json();

      const tooDeep = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Too deep",
          projectId: "test-project",
          parentTaskId: level2Body.id,
        }),
      });
      expect(tooDeep.status).toBe(400);
      const tooDeepBody = await tooDeep.json();
      expect(tooDeepBody).toMatchObject({ code: "TASK_HIERARCHY_INVALID" });
      expect(tooDeepBody.error).toContain("depth");
    });

    it("should keep omitted taskIntent as general for ordinary create callers", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Fix audit logging feature",
          description: "Add security review coverage",
          projectId: "test-project",
          isFix: false,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.taskIntent).toBe("general");
      expect(body.isFix).toBe(false);
      expect(body.plannerMode).toBe("fast");
      expect(body.skipReview).toBe(true);
    });

    it("should reject runtime profiles owned by a different project on create", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(runtimeProfiles)
        .values({
          id: "foreign-runtime-profile",
          projectId: "other-project",
          name: "Foreign Runtime",
          runtimeId: "claude",
          providerId: "anthropic",
          enabled: true,
        })
        .run();

      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Scoped task",
          projectId: "test-project",
          runtimeProfileId: "foreign-runtime-profile",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeTruthy();
      expect(body.fieldErrors.runtimeProfileId).toBeDefined();
    });

    it("should reject disabled runtime profiles on create", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(runtimeProfiles)
        .values({
          id: "disabled-runtime-profile",
          projectId: null,
          name: "Disabled Runtime",
          runtimeId: "codex",
          providerId: "openai",
          enabled: false,
        })
        .run();

      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Disabled runtime task",
          projectId: "test-project",
          runtimeProfileId: "disabled-runtime-profile",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeTruthy();
      expect(body.fieldErrors.runtimeProfileId).toBeDefined();
    });

    it("should reject secret-like runtime option keys on create", async () => {
      const db = testDb.current;
      insertTestProject(db);

      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Secret runtime option",
          projectId: "test-project",
          runtimeOptions: { nested: { apiKey: "raw-secret-value" } },
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.reasonCodes).toEqual(["TASK_RUNTIME_SECRET_LIKE_OPTION_KEY"]);
      expect(body.fieldErrors.runtimeOptions[0]).toContain("nested.apiKey");
    });

    it("should append redacted config audit and activity for create-time runtime overrides", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(runtimeProfiles)
        .values({
          id: "task-profile",
          projectId: "test-project",
          name: "Task Profile",
          runtimeId: "claude",
          providerId: "anthropic",
          enabled: true,
        })
        .run();

      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Create override",
          projectId: "test-project",
          runtimeProfileId: "task-profile",
          modelOverride: "sonnet",
          runtimeOptions: { timeoutMs: 1000 },
        }),
      });

      expect(res.status).toBe(201);
      const task = await res.json();
      const audit = db
        .select()
        .from(configAuditEvents)
        .where(eq(configAuditEvents.taskId, task.id))
        .get();
      expect(audit).toMatchObject({
        projectId: "test-project",
        runtimeProfileId: "task-profile",
        action: "task_runtime_override_updated",
        sourceKind: "task_override",
      });
      expect(audit?.afterJson).toContain("timeoutMs");
      expect(audit?.afterJson).not.toContain("sonnet");
      const persisted = db.select().from(tasks).where(eq(tasks.id, task.id)).get();
      expect(persisted?.agentActivityLog).toContain("Task runtime override updated");
      expect(persisted?.agentActivityLog).not.toContain("sonnet");
    });

    it("should persist planner settings from create payload", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Task with planner settings",
          projectId: "test-project",
          plannerMode: "fast",
          planPath: ".ai-factory/custom-plan.md",
          planDocs: true,
          planTests: true,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.plannerMode).toBe("fast");
      expect(body.planPath).toBe(".ai-factory/custom-plan.md");
      expect(body.planDocs).toBe(true);
      expect(body.planTests).toBe(true);
    });

    it("should persist skipReview from create payload", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Task with skip review",
          projectId: "test-project",
          skipReview: true,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.skipReview).toBe(true);
    });

    it("should apply fast-mode flag defaults when flags are omitted (default plannerMode=fast)", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Task without flags",
          projectId: "test-project",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.plannerMode).toBe("fast");
      expect(body.skipReview).toBe(true);
      expect(body.planDocs).toBe(false);
      expect(body.planTests).toBe(false);
    });

    it("should apply full-mode flag defaults when plannerMode=full and flags omitted", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Full mode task",
          projectId: "test-project",
          plannerMode: "full",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.plannerMode).toBe("full");
      expect(body.skipReview).toBe(false);
      expect(body.planDocs).toBe(true);
      expect(body.planTests).toBe(true);
    });

    it("should respect explicit false flag values over mode defaults", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Explicit flags",
          projectId: "test-project",
          plannerMode: "full",
          skipReview: false,
          planDocs: false,
          planTests: false,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.skipReview).toBe(false);
      expect(body.planDocs).toBe(false);
      expect(body.planTests).toBe(false);
    });

    it("should persist useSubagents from create payload", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Task without subagents",
          projectId: "test-project",
          useSubagents: false,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.useSubagents).toBe(false);
    });

    it("should default useSubagents to AGENT_USE_SUBAGENTS env value", async () => {
      const { getEnv } = await import("@aif/shared");
      const envDefault = getEnv().AGENT_USE_SUBAGENTS;

      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Task with default subagents",
          projectId: "test-project",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.useSubagents).toBe(envDefault);
    });

    it("should create a task with explicit maxReviewIterations", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Task with max iterations",
          projectId: "test-project",
          maxReviewIterations: 10,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.maxReviewIterations).toBe(10);
      expect(body.reviewIterationCount).toBe(0);
    });

    it("should default maxReviewIterations to AGENT_MAX_REVIEW_ITERATIONS env value", async () => {
      const { getEnv } = await import("@aif/shared");
      const envDefault = getEnv().AGENT_MAX_REVIEW_ITERATIONS;

      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Task with default max iterations",
          projectId: "test-project",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.maxReviewIterations).toBe(envDefault);
    });

    it("should create a fix task when isFix=true", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Fix task",
          description: "Fix mode task",
          projectId: "test-project",
          isFix: true,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.isFix).toBe(true);
      expect(body.taskIntent).toBe("fix");
    });

    it("should apply typed intent defaults on create", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Audit src/config.ts",
          description: [
            "Scope: src/config.ts",
            "Audit mandate: Inspect configuration defaults for unsafe runtime behavior.",
            "Report artifact: audit/config-audit.md",
          ].join("\n"),
          projectId: "test-project",
          taskIntent: "audit",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.taskIntent).toBe("audit");
      expect(body.plannerMode).toBe("full");
      expect(body.planDocs).toBe(true);
      expect(body.planTests).toBe(true);
      expect(body.skipReview).toBe(false);
      expect(body.useSubagents).toBe(true);
      expect(body.isFix).toBe(false);
      expect(body.artifactTrust).toMatchObject({
        artifactRole: "report",
        artifactState: "expected",
        artifactTrustLevel: "weak",
        artifactPath: "audit/config-audit.md",
      });
      const artifact = testDb.current
        .select()
        .from(roadmapBatchArtifacts)
        .where(eq(roadmapBatchArtifacts.taskId, body.id))
        .get();
      expect(artifact).toMatchObject({
        role: "report",
        artifactPath: "audit/config-audit.md",
        state: "expected",
      });
    });

    it("should reject direct audit tasks without a concrete report artifact", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Audit src/config.ts",
          description: [
            "Scope: src/config.ts",
            "Audit mandate: Inspect configuration defaults for unsafe runtime behavior.",
          ].join("\n"),
          projectId: "test-project",
          taskIntent: "audit",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("AUDIT_REPORT_ARTIFACT_REQUIRED");
      expect(testDb.current.select().from(tasks).all()).toEqual([]);
      expect(testDb.current.select().from(roadmapBatchArtifacts).all()).toEqual([]);
    });

    it("should reject broad direct audit tasks before create", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Audit entire repository",
          description:
            "Audit security, performance, correctness, and operations readiness across the whole project.",
          projectId: "test-project",
          taskIntent: "audit",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("AUDIT_DECOMPOSITION_REQUIRED");
      expect(body.decomposition).toMatchObject({
        mode: "decomposed_report_batch",
        requiresDecomposition: true,
      });
      expect(testDb.current.select().from(tasks).all()).toEqual([]);
    });

    it("should reject broad direct audit tasks even with concrete report markers", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Audit entire repository",
          description: [
            "Scope: src, packages, tests, docs",
            "Audit mandate: Audit security, performance, correctness, and operations readiness across the whole project.",
            "Report artifact: audit/full.md",
          ].join("\n"),
          projectId: "test-project",
          taskIntent: "audit",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("AUDIT_DECOMPOSITION_REQUIRED");
      expect(body.decomposition.reasonCodes).toEqual(
        expect.arrayContaining(["broad_repository_scope", "multi_domain_audit_scope"]),
      );
      expect(testDb.current.select().from(tasks).all()).toEqual([]);
    });

    it("should reject bare repository audit targets with concrete report markers", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Audit repository",
          description: [
            "Scope: src, packages, tests, docs",
            "Audit mandate: Inspect repository quality risks.",
            "Report artifact: audit/full.md",
          ].join("\n"),
          projectId: "test-project",
          taskIntent: "audit",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("AUDIT_DECOMPOSITION_REQUIRED");
      expect(body.decomposition.reasonCodes).toEqual(
        expect.arrayContaining(["broad_repository_scope"]),
      );
      expect(testDb.current.select().from(tasks).all()).toEqual([]);
    });

    it("should create a task with paused=true", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Paused task",
          projectId: "test-project",
          paused: true,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.paused).toBe(true);
    });

    it("should default paused to false", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Default paused task",
          projectId: "test-project",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.paused).toBe(false);
    });

    it("should reject empty title", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", projectId: "test-project" }),
      });

      expect(res.status).toBe(400);
    });

    it("should reject missing title", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "No title", projectId: "test-project" }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /tasks/:id", () => {
    it("should return a task by id", async () => {
      const db = testDb.current;
      db.insert(tasks).values({ id: "test-1", projectId: "test-project", title: "Find me" }).run();

      const res = await app.request("/tasks/test-1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe("Find me");
    });

    it("should expose app-level effective runtime when project defaults are missing", async () => {
      const db = testDb.current;
      db.insert(projects)
        .values({ id: "test-project", name: "Test Project", rootPath: "/tmp/test-project" })
        .run();
      db.update(appSettings)
        .set({
          defaultTaskRuntimeProfileId: "app-task-default",
        })
        .where(eq(appSettings.id, 1))
        .run();
      db.insert(runtimeProfiles)
        .values({
          id: "app-task-default",
          projectId: null,
          name: "App Task Default",
          runtimeId: "claude",
          providerId: "anthropic",
          enabled: true,
        })
        .run();
      db.insert(tasks)
        .values({ id: "task-app-default", projectId: "test-project", title: "Find me" })
        .run();

      const res = await app.request("/tasks/task-app-default");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.effectiveRuntime).toEqual({
        source: "system_default",
        profileId: "app-task-default",
        runtimeId: "claude",
        providerId: "anthropic",
        profileName: "App Task Default",
      });
    });

    it("should expose manualReviewRequired and autoReviewState in task payload", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "test-manual-review",
          projectId: "test-project",
          title: "Manual review task",
          status: "done",
          manualReviewRequired: true,
          autoReviewStateJson: JSON.stringify({
            strategy: "closure_first",
            iteration: 2,
            findings: [
              {
                id: "finding-1",
                source: "code_review",
                status: "still_blocking",
                text: "Add manual review badge without client_secret=secret-value",
              },
            ],
            securityCoverage: [
              {
                area: "secret_leaks",
                status: "covered",
                note: "checked access_token=oauth-token in review output",
              },
              {
                area: "permissions_sandbox",
                status: "covered",
                note: "checked sandbox boundaries",
              },
              {
                area: "unsafe_shell_network_file",
                status: "covered",
                note: "checked shell and file operations",
              },
              {
                area: "dependency_config",
                status: "covered",
                note: "checked dependency configuration",
              },
            ],
          }),
        })
        .run();

      const res = await app.request("/tasks/test-manual-review");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.manualReviewRequired).toBe(true);
      expect(body.autoReviewState).toEqual({
        strategy: "closure_first",
        iteration: 2,
        findings: [
          {
            id: "finding-1",
            source: "code_review",
            status: "still_blocking",
            text: "Add manual review badge without client_secret=[REDACTED]",
          },
        ],
        securityCoverage: [
          {
            area: "secret_leaks",
            status: "covered",
            note: "checked access_token=[REDACTED] in review output",
          },
          {
            area: "permissions_sandbox",
            status: "covered",
            note: "checked sandbox boundaries",
          },
          {
            area: "unsafe_shell_network_file",
            status: "covered",
            note: "checked shell and file operations",
          },
          {
            area: "dependency_config",
            status: "covered",
            note: "checked dependency configuration",
          },
        ],
      });
      expect(JSON.stringify(body.autoReviewState)).not.toContain("secret-value");
      expect(JSON.stringify(body.autoReviewState)).not.toContain("oauth-token");
    });

    it("should return 404 for non-existent task", async () => {
      const res = await app.request("/tasks/non-existent");
      expect(res.status).toBe(404);
    });

    it("redacts legacy agent activity and strips task runtime account identifiers", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "legacy-task",
          projectId: "test-project",
          title: "Legacy",
          agentActivityLog: "Bearer SECRET\nhttps://internal.local",
          runtimeLimitSnapshotJson: JSON.stringify({
            source: "sdk_event",
            status: "warning",
            precision: "exact",
            checkedAt: "2026-04-19T10:00:00.000Z",
            providerId: "anthropic",
            runtimeId: "claude",
            profileId: "profile-1",
            primaryScope: "time",
            resetAt: "2026-04-19T11:00:00.000Z",
            retryAfterSeconds: null,
            warningThreshold: 10,
            windows: [
              {
                scope: "time",
                percentRemaining: 4,
                warningThreshold: 10,
                resetAt: "2026-04-19T11:00:00.000Z",
              },
            ],
            providerMeta: {
              providerLabel: "Anthropic",
              accountLabel: "Shared Account",
            },
          }),
        })
        .run();

      const res = await app.request("/tasks/legacy-task");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentActivityLog).toContain("[REDACTED]");
      expect(body.agentActivityLog).not.toContain("SECRET");
      expect(body.agentActivityLog).not.toContain("internal.local");
      expect(body.runtimeLimitSnapshot.providerMeta).toEqual({
        providerLabel: "Anthropic",
      });
    });
  });

  describe("GET /tasks/:id/timeline", () => {
    it("returns audit-compatible data as a generic timeline", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "timeline-audit",
          projectId: "test-project",
          title: "Timeline audit",
          taskIntent: "audit",
          roadmapAlias: "audit-pack",
          status: "done",
        })
        .run();
      createRoadmapBatchContract({
        projectId: "test-project",
        roadmapAlias: "audit-pack",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: ["timeline-audit"],
        artifacts: [
          {
            taskId: "timeline-audit",
            role: "report",
            artifactPath: "docs/audit/report.md",
          },
        ],
      });
      updateRoadmapBatchArtifactState({
        taskId: "timeline-audit",
        state: "source_inconclusive",
        failureFamily: "source_inconclusive",
        validationDetails: { sourceClassification: "insufficient_evidence" },
      });
      appendEvidenceUnitEvent(
        buildEvidenceUnit(
          {
            taskId: "timeline-audit",
            auditPlanId: "task:timeline-audit",
            sourceSnapshotId: "git:test",
          },
          buildEvidenceUnitPayload({
            id: "timeline-ev",
            toolName: "Search",
            evidenceKind: "search",
            output: "No stable source was found",
          }),
        ),
      );

      const res = await app.request("/tasks/timeline-audit/timeline");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.context).toEqual(
        expect.objectContaining({
          taskId: "timeline-audit",
          workflowPackId: "audit",
          sourceKind: "roadmap_batch",
        }),
      );
      expect(body.artifacts[0]).toEqual(
        expect.objectContaining({
          kind: "audit_report",
          state: "inconclusive",
        }),
      );
      expect(body.claims[0]).toEqual(
        expect.objectContaining({
          outcome: "inconclusive",
          trustLevel: "untrusted",
        }),
      );
      expect(body.evidence[0]).toEqual(expect.objectContaining({ id: "timeline-ev" }));
      expect(body.events.map((event: { kind: string }) => event.kind)).toContain(
        "evidence_recorded",
      );
    });

    it("returns task-record timeline data for non-audit tasks", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "timeline-feature",
          projectId: "test-project",
          title: "Timeline feature",
          taskIntent: "feature",
          status: "done",
          implementationLog: "Changed packages/api/src/__tests__/tasks.test.ts\nTests passed",
          agentActivityLog: implementationActivityLog(),
          implementationManifestJson: implementationManifest({
            taskId: "timeline-feature",
            intent: "feature",
            changedFiles: ["packages/api/src/__tests__/tasks.test.ts"],
          }),
        })
        .run();
      appendEvidenceUnitEvent(
        buildEvidenceUnit(
          {
            taskId: "timeline-feature",
            auditPlanId: "task:timeline-feature",
            sourceSnapshotId: "git:feature",
          },
          buildEvidenceUnitPayload({
            id: "timeline-feature-ev",
            toolName: "Search",
            evidenceKind: "search",
            output: "Compatibility evidence should not appear on non-audit timelines",
          }),
        ),
      );

      const res = await app.request("/tasks/timeline-feature/timeline");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.context).toEqual(
        expect.objectContaining({
          taskId: "timeline-feature",
          workflowPackId: "feature",
          workflowKind: "feature",
          sourceKind: "task_record",
        }),
      );
      expect(body.artifacts.map((artifact: { kind: string }) => artifact.kind)).toEqual(
        expect.arrayContaining(["implementation_manifest", "source_diff", "test_result"]),
      );
      expect(body.evidence.map((unit: { id: string }) => unit.id)).not.toContain(
        "timeline-feature-ev",
      );
      expect(body.claims.length).toBeGreaterThan(0);
      expect(body.evidenceLinks.length).toBeGreaterThan(0);
      expect(body.events.map((event: { kind: string }) => event.kind)).toContain("claim_evaluated");
      expect(body.selectedArtifact).toBeUndefined();
    });

    it("returns 404 for missing tasks", async () => {
      const res = await app.request("/tasks/missing-task/timeline");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Task not found" });
    });
  });

  describe("GET /tasks/:id/requirements/snapshot", () => {
    it("returns current snapshot versions and stage artifact attempts with redacted snapshot content", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "requirements-snapshot-task",
          projectId: "test-project",
          title: "Requirements snapshot",
          description: "Capture requirements safely.",
          taskIntent: "feature",
          status: "planning",
        })
        .run();
      db.insert(taskRequirementQuestions)
        .values({
          id: "requirements-secret-question",
          taskId: "requirements-snapshot-task",
          projectId: "test-project",
          stage: "requirements_analysis",
          targetResumeStage: "requirements_analysis",
          cycleNumber: 1,
          batchId: "requirements-batch",
          question: "Which credential reference should be used?",
          whyNeeded: "Implementation needs the reference.",
          status: "answered",
          answer: "api_key=sk-secretsecretsecretsecret",
          answerAuthor: "human",
          answeredAt: "2026-05-28T00:00:00.000Z",
        })
        .run();

      createCurrentRequirementsSnapshot("requirements-snapshot-task");
      createCurrentRequirementsSnapshot("requirements-snapshot-task");
      recordTaskStageArtifactAttempt({
        taskId: "requirements-snapshot-task",
        stage: "research",
        kind: "research",
        path: "research.md",
        state: "accepted",
        summary: "Research metadata recorded.",
      });

      const res = await app.request("/tasks/requirements-snapshot-task/requirements/snapshot");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.snapshot).toEqual(expect.objectContaining({ version: 2 }));
      expect(body.snapshots.map((snapshot: { version: number }) => snapshot.version)).toEqual([
        2, 1,
      ]);
      expect(body.snapshot.markdown).toContain("[REDACTED_SECRET_LIKE_ANSWER]");
      expect(JSON.stringify(body)).not.toContain("sk-secretsecretsecretsecret");
      expect(body.stageArtifacts.map((artifact: { kind: string }) => artifact.kind)).toEqual(
        expect.arrayContaining(["requirements", "research"]),
      );
      expect(body.stageArtifactAttempts.map((attempt: { kind: string }) => attempt.kind)).toEqual(
        expect.arrayContaining(["requirements", "research"]),
      );
    });

    it("returns an empty no-snapshot response for existing tasks and 404 for unknown tasks", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "requirements-no-snapshot-task",
          projectId: "test-project",
          title: "No snapshot yet",
          status: "backlog",
        })
        .run();

      const res = await app.request("/tasks/requirements-no-snapshot-task/requirements/snapshot");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(
        expect.objectContaining({
          taskId: "requirements-no-snapshot-task",
          projectId: "test-project",
          snapshot: null,
          snapshots: [],
          stageArtifacts: [],
          stageArtifactAttempts: [],
          hasWaiver: false,
          waiverJustification: null,
        }),
      );

      const missing = await app.request("/tasks/missing-requirements-task/requirements/snapshot");
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: "Task not found" });
    });
  });

  describe("requirements question resume targets", () => {
    it("returns and broadcasts the active target resume stage", async () => {
      const db = testDb.current;
      db.insert(projects)
        .values({ id: "question-project", name: "Questions", rootPath: "/tmp/questions" })
        .run();
      db.insert(tasks)
        .values({
          id: "api-question-target",
          projectId: "question-project",
          title: "Question target",
          status: "review",
          tags: JSON.stringify(["qa-decision"]),
          attachments: JSON.stringify([
            {
              name: "qa-notes.txt",
              mimeType: "text/plain",
              size: 12,
              path: ".ai-factory/files/tasks/api-question-target/qa-notes.txt",
            },
          ]),
        })
        .run();

      const createRes = await app.request("/tasks/api-question-target/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "review",
          targetResumeStage: "qa",
          idempotencyKey: "review-product-decision",
          question: "Should QA cover the new behavior?",
          whyNeeded: "Review cannot hand off without the QA decision.",
          blocking: true,
          answerType: "textarea",
        }),
      });

      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const batch = createBody.batches[0];
      expect(batch.targetResumeStage).toBe("qa");
      expect(mockBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "task:questions_created",
          payload: expect.objectContaining({
            taskId: "api-question-target",
            stage: "review",
            targetResumeStage: "qa",
          }),
        }),
      );
      expect(mockBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "task:needs_input",
          payload: expect.objectContaining({
            taskId: "api-question-target",
            stage: "review",
            targetResumeStage: "qa",
          }),
        }),
      );

      const answerRes = await app.request(
        `/tasks/api-question-target/question-batches/${batch.batchId}/answers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            autoResume: true,
            answers: [{ questionId: batch.questions[0].id, answer: "Yes, QA must cover it." }],
          }),
        },
      );

      expect(answerRes.status).toBe(200);
      const answerBody = await answerRes.json();
      expect(answerBody.resumed).toBe(true);
      expect(answerBody.resumeStatus).toBe("qa");
      expect(answerBody.task).toEqual(
        expect.objectContaining({
          id: "api-question-target",
          status: "qa",
          tags: ["qa-decision"],
          attachments: [
            expect.objectContaining({
              name: "qa-notes.txt",
              path: ".ai-factory/files/tasks/api-question-target/qa-notes.txt",
            }),
          ],
        }),
      );
      expect(Object.prototype.hasOwnProperty.call(answerBody.task, "artifactTrust")).toBe(true);
      expect(mockBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "task:question_batch_answered",
          payload: expect.objectContaining({
            taskId: "api-question-target",
            stage: "review",
            targetResumeStage: "qa",
            resumed: true,
            resumeStatus: "qa",
          }),
        }),
      );
    });

    it("rejects API-created questions without inserting rows when intake is disabled", async () => {
      mockRequirementsIntakeEnabled.value = false;
      const db = testDb.current;
      db.insert(projects)
        .values({
          id: "question-disabled-project",
          name: "Questions Off",
          rootPath: "/tmp/questions",
        })
        .run();
      db.insert(tasks)
        .values({
          id: "api-question-disabled",
          projectId: "question-disabled-project",
          title: "Question disabled",
          status: "review",
        })
        .run();

      const createRes = await app.request("/tasks/api-question-disabled/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "review",
          targetResumeStage: "qa",
          idempotencyKey: "review-disabled-decision",
          question: "Should QA cover the new behavior?",
          whyNeeded: "Review cannot hand off without the QA decision.",
          blocking: true,
          answerType: "textarea",
        }),
      });

      expect(createRes.status).toBe(409);
      expect(await createRes.json()).toEqual({ error: "Requirements intake is disabled" });
      const rows = db
        .select()
        .from(taskRequirementQuestions)
        .where(eq(taskRequirementQuestions.taskId, "api-question-disabled"))
        .all();
      expect(rows).toHaveLength(0);
      expect(mockBroadcast).not.toHaveBeenCalled();
    });
  });

  describe("operator trust surfaces", () => {
    it("returns artifact trust, evidence, memory, and runtime projections", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "operator-task",
          projectId: "test-project",
          title: "Operator task",
          status: "review",
          tokenInput: 7,
          tokenOutput: 11,
          tokenTotal: 18,
          costUsd: 0.04,
        })
        .run();
      appendEvidenceUnitEvent(
        buildEvidenceUnit(
          {
            taskId: "operator-task",
            auditPlanId: "task:operator-task",
            sourceSnapshotId: "git:test",
          },
          buildEvidenceUnitPayload({
            id: "operator-evidence",
            toolName: "npm",
            evidenceKind: "shell_command",
            output: "Tests passed",
          }),
        ),
      );
      db.insert(memoryItems)
        .values({
          id: "operator-memory",
          projectId: "test-project",
          sourceTaskId: "operator-task",
          sourceKind: "task",
          sourceRef: "task:operator-task",
          title: "Operator memory",
          summary: "Memory summary",
          content: "Memory content",
          claimsJson: "[]",
          tagsJson: "[]",
        })
        .run();
      db.insert(usageEvents)
        .values({
          id: "operator-usage",
          source: "agent",
          projectId: "test-project",
          taskId: "operator-task",
          runtimeId: "codex",
          providerId: "openai",
          profileId: "profile-1",
          usageReporting: "reported",
          inputTokens: 7,
          outputTokens: 11,
          totalTokens: 18,
          costUsd: 0.04,
        })
        .run();

      const trustRes = await app.request("/tasks/operator-task/artifact-trust");
      expect(trustRes.status).toBe(200);
      expect(await trustRes.json()).toEqual(expect.objectContaining({ taskStatus: "review" }));

      const evidenceRes = await app.request("/tasks/operator-task/evidence");
      expect(evidenceRes.status).toBe(200);
      expect(await evidenceRes.json()).toEqual(
        expect.objectContaining({
          taskId: "operator-task",
          projectId: "test-project",
          evidence: expect.arrayContaining([expect.objectContaining({ taskId: "operator-task" })]),
        }),
      );

      const memoryRes = await app.request("/tasks/operator-task/memory");
      expect(memoryRes.status).toBe(200);
      expect(await memoryRes.json()).toEqual(
        expect.objectContaining({
          taskId: "operator-task",
          candidates: [expect.objectContaining({ id: "operator-memory" })],
        }),
      );

      const usageRes = await app.request("/tasks/operator-task/runtime-usage");
      expect(usageRes.status).toBe(200);
      expect(await usageRes.json()).toEqual(
        expect.objectContaining({
          totals: expect.objectContaining({ totalTokens: 18, costUsd: 0.04 }),
          events: [expect.objectContaining({ id: "operator-usage" })],
        }),
      );
    });

    it("builds bounded internal manual task broadcast payloads", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "broadcast-task",
          projectId: "test-project",
          title: "Broadcast task",
          status: "blocked_external",
          blockedReason: `operator_input_required: ${"x".repeat(800)}`,
        })
        .run();

      const res = await app.request("/tasks/broadcast-task/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "task:manual_handoff_required" }),
      });

      expect(res.status).toBe(200);
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "task:manual_handoff_required",
        payload: expect.objectContaining({
          id: "broadcast-task",
          projectId: "test-project",
          blockedReason: expect.stringMatching(/^\S[\s\S]{0,503}$/),
        }),
      });

      vi.mocked(mockBroadcast).mockClear();

      const movedRes = await app.request("/tasks/broadcast-task/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "task:moved" }),
      });

      expect(movedRes.status).toBe(200);
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "task:moved",
        payload: expect.objectContaining({ id: "broadcast-task", status: "blocked_external" }),
      });
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "task:timeline_updated",
        payload: expect.objectContaining({ id: "broadcast-task", projectId: "test-project" }),
      });
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "task:trust_updated",
        payload: expect.objectContaining({ id: "broadcast-task", projectId: "test-project" }),
      });
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "project:queue_updated",
        payload: { projectId: "test-project", taskId: "broadcast-task" },
      });
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "task:manual_handoff_required",
        payload: expect.objectContaining({ id: "broadcast-task", projectId: "test-project" }),
      });
    });

    it("does not emit explicit manual handoff broadcasts for non-manual blocked tasks", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "broadcast-explicit-runtime-backoff",
          projectId: "test-project",
          title: "Explicit runtime backoff",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "Runtime request timed out. Task will retry automatically.",
          retryAfter: new Date(Date.now() + 60_000).toISOString(),
        })
        .run();

      const res = await app.request("/tasks/broadcast-explicit-runtime-backoff/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "task:manual_handoff_required" }),
      });

      expect(res.status).toBe(200);
      expect(mockBroadcast).not.toHaveBeenCalledWith({
        type: "task:manual_handoff_required",
        payload: expect.anything(),
      });
    });

    it("does not broadcast manual handoff for runtime backoff blocked task moves", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "broadcast-runtime-backoff",
          projectId: "test-project",
          title: "Runtime backoff",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "Watchdog: task stale in implementing for 90m; auto-recover scheduled",
          retryAfter: new Date(Date.now() + 60_000).toISOString(),
        })
        .run();

      const res = await app.request("/tasks/broadcast-runtime-backoff/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "task:moved" }),
      });

      expect(res.status).toBe(200);
      expect(mockBroadcast).not.toHaveBeenCalledWith({
        type: "task:manual_handoff_required",
        payload: expect.anything(),
      });
    });

    it("broadcasts manual handoff for operator and manual task moves", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values([
          {
            id: "broadcast-operator-hold",
            projectId: "test-project",
            title: "Operator hold",
            status: "blocked_external",
            blockedReason: "operator_input_required: provide fixture access",
          },
          {
            id: "broadcast-manual-review",
            projectId: "test-project",
            title: "Manual review",
            status: "blocked_external",
            blockedReason: "manual-review: inspect rejected evidence",
          },
          {
            id: "broadcast-operator-cancelled",
            projectId: "test-project",
            title: "Operator cancelled",
            status: "blocked_external",
            blockedReason: "operator_cancelled: task cancelled by operator from implementing",
          },
          {
            id: "broadcast-manual-exception",
            projectId: "test-project",
            title: "Manual exception",
            status: "blocked_external",
            blockedReason: "manual_exception: accepted by operator",
          },
          {
            id: "broadcast-branch-isolation",
            projectId: "test-project",
            title: "Branch isolation",
            status: "blocked_external",
            blockedReason: "Branch isolation failure (branch_missing): persisted branch is missing",
          },
          {
            id: "broadcast-runtime-auth",
            projectId: "test-project",
            title: "Runtime auth",
            status: "blocked_external",
            blockedReason: "Runtime authentication failed. Check the configured runtime profile.",
          },
        ])
        .run();

      for (const taskId of [
        "broadcast-operator-hold",
        "broadcast-manual-review",
        "broadcast-operator-cancelled",
        "broadcast-manual-exception",
        "broadcast-branch-isolation",
        "broadcast-runtime-auth",
      ]) {
        vi.mocked(mockBroadcast).mockClear();
        const res = await app.request(`/tasks/${taskId}/broadcast`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "task:moved" }),
        });

        expect(res.status).toBe(200);
        expect(mockBroadcast).toHaveBeenCalledWith({
          type: "task:manual_handoff_required",
          payload: expect.objectContaining({ id: taskId, projectId: "test-project" }),
        });
      }
    });
  });

  describe("POST /tasks/:id/broadcast", () => {
    it("returns 401 without the internal broadcast token when auth is configured", async () => {
      const db = testDb.current;
      mockInternalBroadcastToken.value = "internal-token";
      db.insert(tasks)
        .values({ id: "broadcast-auth-task", projectId: "test-project", title: "Broadcast me" })
        .run();

      const res = await app.request("/tasks/broadcast-auth-task/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "task:updated" }),
      });

      expect(res.status).toBe(401);
    });

    it("returns 401 for an invalid internal broadcast token", async () => {
      const db = testDb.current;
      mockInternalBroadcastToken.value = "internal-token";
      db.insert(tasks)
        .values({ id: "broadcast-invalid-token", projectId: "test-project", title: "Broadcast me" })
        .run();

      const res = await app.request("/tasks/broadcast-invalid-token/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-token",
        },
        body: JSON.stringify({ type: "task:updated" }),
      });

      expect(res.status).toBe(401);
    });

    it("returns 200 with a valid internal broadcast token", async () => {
      const db = testDb.current;
      mockInternalBroadcastToken.value = "internal-token";
      db.insert(tasks)
        .values({ id: "broadcast-valid-token", projectId: "test-project", title: "Broadcast me" })
        .run();

      const res = await app.request("/tasks/broadcast-valid-token/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Broadcast-Token": "internal-token",
        },
        body: JSON.stringify({ type: "task:updated" }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(vi.mocked(mockBroadcast)).toHaveBeenCalledWith({
        type: "task:updated",
        payload: {
          id: "broadcast-valid-token",
          title: "Broadcast me",
          status: "backlog",
        },
      });
    });

    it("rejects event types outside the task broadcast allowlist", async () => {
      const db = testDb.current;
      mockInternalBroadcastToken.value = "internal-token";
      db.insert(tasks)
        .values({ id: "broadcast-invalid-type", projectId: "test-project", title: "Broadcast me" })
        .run();

      const res = await app.request("/tasks/broadcast-invalid-type/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Broadcast-Token": "internal-token",
        },
        body: JSON.stringify({ type: "project:created" }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /tasks/:id", () => {
    it("should update a task", async () => {
      const db = testDb.current;
      db.insert(tasks).values({ id: "upd-1", projectId: "test-project", title: "Original" }).run();

      const res = await app.request("/tasks/upd-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe("Updated");
    });

    it("blocks manual agentActivityLog edits through the task API by default", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "upd-agent-log-immutable",
          projectId: "test-project",
          title: "Immutable log",
          agentActivityLog: "server-only entry",
        })
        .run();

      const res = await app.request("/tasks/upd-agent-log-immutable", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentActivityLog: "manual overwrite" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("AGENT_ACTIVITY_LOG_IMMUTABLE");
      const persisted = db
        .select()
        .from(tasks)
        .where(eq(tasks.id, "upd-agent-log-immutable"))
        .get();
      expect(persisted?.agentActivityLog).toBe("server-only entry");
    });

    it("should update maxReviewIterations", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "upd-mri", projectId: "test-project", title: "Iter task" })
        .run();

      const res = await app.request("/tasks/upd-mri", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxReviewIterations: 10 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.maxReviewIterations).toBe(10);
    });

    it("should return 404 for non-existent task", async () => {
      const res = await app.request("/tasks/non-existent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Nope" }),
      });

      expect(res.status).toBe(404);
    });

    it("returns controlled 4xx responses for hierarchy update validation failures", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values([
          {
            id: "upd-parent",
            projectId: "test-project",
            title: "Parent",
            hierarchyRole: "container",
            parentCloseoutPolicy: "all_children_verified",
          },
          {
            id: "upd-child",
            projectId: "test-project",
            title: "Child",
            parentTaskId: "upd-parent",
            rootTaskId: "upd-parent",
            hierarchyDepth: 1,
            hierarchyRole: "executable",
          },
        ])
        .run();

      const cycle = await app.request("/tasks/upd-parent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentTaskId: "upd-child" }),
      });
      expect(cycle.status).toBe(409);
      await expect(cycle.json()).resolves.toMatchObject({
        code: "TASK_HIERARCHY_INVALID",
      });

      const executableParent = await app.request("/tasks/upd-parent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hierarchyRole: "executable" }),
      });
      expect(executableParent.status).toBe(409);
      const executableParentBody = await executableParent.json();
      expect(executableParentBody).toMatchObject({ code: "TASK_HIERARCHY_INVALID" });
      expect(executableParentBody.error).toContain("children");
    });

    it("keeps path-backed attachments when hierarchy update validation fails", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-put-hierarchy-attach-safe-"));
      const attachmentDir = join(rootPath, ".ai-factory", "files", "tasks", "upd-h-parent");
      const attachmentPath = ".ai-factory/files/tasks/upd-h-parent/keep.txt";
      mkdirSync(attachmentDir, { recursive: true });
      writeFileSync(join(attachmentDir, "keep.txt"), "old", "utf8");
      const existingAttachments = [
        { name: "keep.txt", mimeType: "text/plain", size: 3, content: null, path: attachmentPath },
      ];

      db.insert(projects)
        .values({ id: "project-hierarchy-attach", name: "Hierarchy Attach", rootPath })
        .run();
      db.insert(tasks)
        .values([
          {
            id: "upd-h-parent",
            projectId: "project-hierarchy-attach",
            title: "Parent",
            attachments: JSON.stringify(existingAttachments),
            hierarchyRole: "container",
            parentCloseoutPolicy: "all_children_verified",
          },
          {
            id: "upd-h-child",
            projectId: "project-hierarchy-attach",
            title: "Child",
            parentTaskId: "upd-h-parent",
            rootTaskId: "upd-h-parent",
            hierarchyDepth: 1,
            hierarchyRole: "executable",
          },
        ])
        .run();

      const res = await app.request("/tasks/upd-h-parent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hierarchyRole: "executable",
          attachments: existingAttachments,
        }),
      });

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toMatchObject({ code: "TASK_HIERARCHY_INVALID" });
      const row = db.select().from(tasks).where(eq(tasks.id, "upd-h-parent")).get();
      expect(JSON.parse(row!.attachments)).toEqual(existingAttachments);
      expect(existsSync(join(attachmentDir, "keep.txt"))).toBe(true);
    });

    it("should update skipReview via PUT", async () => {
      const db = testDb.current;
      db.insert(tasks).values({ id: "upd-sr", projectId: "test-project", title: "SR task" }).run();

      const res = await app.request("/tasks/upd-sr", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipReview: true }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.skipReview).toBe(true);
    });

    it("should update useSubagents via PUT", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "upd-usa", projectId: "test-project", title: "USA task" })
        .run();

      const res = await app.request("/tasks/upd-usa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useSubagents: false }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.useSubagents).toBe(false);
    });

    it("should reject taskIntent audit updates without a concrete report artifact", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "upd-audit-intent",
          projectId: "test-project",
          title: "Audit candidate",
          plannerMode: "fast",
          skipReview: true,
          planDocs: false,
          planTests: false,
          useSubagents: false,
          isFix: false,
        })
        .run();

      const res = await app.request("/tasks/upd-audit-intent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskIntent: "audit",
          title: "Review README transcription endpoint",
          description: [
            "Scope: README.md",
            "Audit mandate: Inspect README transcription endpoint documentation.",
          ].join("\n"),
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("AUDIT_REPORT_ARTIFACT_REQUIRED");
      expect(testDb.current.select().from(roadmapBatchArtifacts).all()).toEqual([]);
    });

    it("should enforce audit defaults and create a report contract when updating taskIntent to audit", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "upd-audit-intent-contract",
          projectId: "test-project",
          title: "Audit candidate",
          plannerMode: "fast",
          skipReview: true,
          planDocs: false,
          planTests: false,
          useSubagents: false,
          isFix: false,
        })
        .run();

      const res = await app.request("/tasks/upd-audit-intent-contract", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskIntent: "audit",
          description: [
            "Scope: README.md",
            "Audit mandate: Inspect README transcription endpoint documentation.",
            "Report artifact: audit/update-direct-audit.md",
          ].join("\n"),
          plannerMode: "fast",
          skipReview: true,
          planDocs: false,
          planTests: false,
          useSubagents: false,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.taskIntent).toBe("audit");
      expect(body.isFix).toBe(false);
      expect(body.plannerMode).toBe("full");
      expect(body.skipReview).toBe(false);
      expect(body.planDocs).toBe(true);
      expect(body.planTests).toBe(true);
      expect(body.useSubagents).toBe(true);
      expect(body.artifactTrust).toMatchObject({
        artifactRole: "report",
        artifactState: "expected",
        artifactTrustLevel: "weak",
        artifactPath: "audit/update-direct-audit.md",
      });
      const artifact = testDb.current
        .select()
        .from(roadmapBatchArtifacts)
        .where(eq(roadmapBatchArtifacts.taskId, "upd-audit-intent-contract"))
        .get();
      expect(artifact).toMatchObject({
        role: "report",
        artifactPath: "audit/update-direct-audit.md",
        state: "expected",
      });
    });

    it("rolls back task updates when audit report contract creation fails", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "upd-audit-contract-failure",
          projectId: "test-project",
          title: "General task",
          description: "Original description",
          taskIntent: "general",
          plannerMode: "fast",
          skipReview: true,
          planDocs: false,
          planTests: false,
          useSubagents: false,
          isFix: false,
        })
        .run();
      const contractSpy = vi
        .spyOn(dataModule, "createRoadmapBatchContract")
        .mockImplementationOnce(() => {
          throw new Error("synthetic contract failure");
        });

      const res = await app.request("/tasks/upd-audit-contract-failure", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskIntent: "audit",
          title: "Audit candidate",
          description: [
            "Scope: README.md",
            "Audit mandate: Inspect README transcription endpoint documentation.",
            "Report artifact: audit/update-direct-audit.md",
          ].join("\n"),
        }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.code).toBe("AUDIT_ARTIFACT_CONTRACT_CREATE_FAILED");
      expect(contractSpy).toHaveBeenCalledTimes(1);
      const task = db.select().from(tasks).where(eq(tasks.id, "upd-audit-contract-failure")).get();
      expect(task).toMatchObject({
        title: "General task",
        description: "Original description",
        taskIntent: "general",
        plannerMode: "fast",
        skipReview: true,
        planDocs: false,
        planTests: false,
        useSubagents: false,
      });
      expect(
        db
          .select()
          .from(roadmapBatchArtifacts)
          .where(eq(roadmapBatchArtifacts.taskId, "upd-audit-contract-failure"))
          .all(),
      ).toEqual([]);
    });

    it("should preserve audit invariants when updating an audit task without taskIntent", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "upd-existing-audit",
          projectId: "test-project",
          title: "Existing audit",
          description: [
            "Scope: README.md",
            "Audit mandate: Inspect README transcription endpoint documentation.",
            "Report artifact: audit/existing-direct-audit.md",
          ].join("\n"),
          taskIntent: "audit",
          plannerMode: "full",
          skipReview: false,
          planDocs: true,
          planTests: true,
          useSubagents: true,
          isFix: false,
        })
        .run();

      const res = await app.request("/tasks/upd-existing-audit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannerMode: "fast",
          skipReview: true,
          planDocs: false,
          planTests: false,
          useSubagents: false,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.taskIntent).toBe("audit");
      expect(body.plannerMode).toBe("full");
      expect(body.skipReview).toBe(false);
      expect(body.planDocs).toBe(true);
      expect(body.planTests).toBe(true);
      expect(body.useSubagents).toBe(true);
      const artifact = testDb.current
        .select()
        .from(roadmapBatchArtifacts)
        .where(eq(roadmapBatchArtifacts.taskId, "upd-existing-audit"))
        .get();
      expect(artifact).toMatchObject({
        role: "report",
        artifactPath: "audit/existing-direct-audit.md",
      });
    });

    it("should update paused via PUT", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "upd-paused", projectId: "test-project", title: "Pause test" })
        .run();

      const res = await app.request("/tasks/upd-paused", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: true }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.paused).toBe(true);
    });

    it("should update autoMode via PUT", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "upd-auto", projectId: "test-project", title: "Auto task" })
        .run();

      const res = await app.request("/tasks/upd-auto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoMode: false }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.autoMode).toBe(false);
    });

    it("should update planner settings via PUT", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "upd-planner", projectId: "test-project", title: "Planner task" })
        .run();

      const res = await app.request("/tasks/upd-planner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannerMode: "fast",
          planPath: ".ai-factory/custom.md",
          planDocs: true,
          planTests: true,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plannerMode).toBe("fast");
      expect(body.planPath).toBe(".ai-factory/custom.md");
      expect(body.planDocs).toBe(true);
      expect(body.planTests).toBe(true);
    });

    it("should reject runtime profiles owned by a different project on update", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "upd-runtime-scope", projectId: "test-project", title: "Scoped task" })
        .run();
      db.insert(runtimeProfiles)
        .values({
          id: "foreign-runtime-profile",
          projectId: "other-project",
          name: "Foreign Runtime",
          runtimeId: "claude",
          providerId: "anthropic",
          enabled: true,
        })
        .run();

      const res = await app.request("/tasks/upd-runtime-scope", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtimeProfileId: "foreign-runtime-profile" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeTruthy();
      expect(body.fieldErrors.runtimeProfileId).toBeDefined();
    });

    it("should apply full-mode flag defaults when PUT sends only plannerMode=full", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "upd-mode-full",
          projectId: "test-project",
          title: "Mode switch",
          plannerMode: "fast",
          skipReview: true,
          planDocs: false,
          planTests: false,
        })
        .run();

      const res = await app.request("/tasks/upd-mode-full", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannerMode: "full" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plannerMode).toBe("full");
      expect(body.skipReview).toBe(false);
      expect(body.planDocs).toBe(true);
      expect(body.planTests).toBe(true);
    });

    it("should respect explicit flag values over mode defaults on PUT", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "upd-mode-explicit", projectId: "test-project", title: "Explicit" })
        .run();

      const res = await app.request("/tasks/upd-mode-explicit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannerMode: "full",
          skipReview: true,
          planDocs: false,
          planTests: false,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plannerMode).toBe("full");
      expect(body.skipReview).toBe(true);
      expect(body.planDocs).toBe(false);
      expect(body.planTests).toBe(false);
    });

    it("should not touch flags when PUT omits plannerMode", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "upd-mode-absent",
          projectId: "test-project",
          title: "No mode",
          plannerMode: "fast",
          skipReview: true,
          planDocs: false,
          planTests: false,
        })
        .run();

      const res = await app.request("/tasks/upd-mode-absent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "renamed" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plannerMode).toBe("fast");
      expect(body.skipReview).toBe(true);
      expect(body.planDocs).toBe(false);
      expect(body.planTests).toBe(false);
    });

    it("should handle attachments update via PUT", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-put-attach-"));
      mkdirSync(join(rootPath, ".ai-factory"), { recursive: true });
      db.insert(projects).values({ id: "project-attach", name: "Attach Project", rootPath }).run();
      db.insert(tasks)
        .values({
          id: "upd-attach-1",
          projectId: "project-attach",
          title: "Attach task",
          attachments: JSON.stringify([]),
        })
        .run();

      const res = await app.request("/tasks/upd-attach-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachments: [{ name: "note.txt", mimeType: "text/plain", size: 5, content: "hello" }],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.attachments).toHaveLength(1);
      expect(body.attachments[0].name).toBe("note.txt");
      expect(body.attachments[0].path).toBeDefined();
    });

    it("should keep existing attachment file when a replacement is rejected", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-put-attach-safe-"));
      const oldDir = join(rootPath, ".ai-factory", "files", "tasks", "upd-attach-safe");
      const oldPath = ".ai-factory/files/tasks/upd-attach-safe/keep.txt";
      mkdirSync(oldDir, { recursive: true });
      writeFileSync(join(oldDir, "keep.txt"), "old", "utf8");
      const oldAttachments = [
        { name: "keep.txt", mimeType: "text/plain", size: 3, content: null, path: oldPath },
      ];

      db.insert(projects)
        .values({ id: "project-attach-safe", name: "Attach Safe", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "upd-attach-safe",
          projectId: "project-attach-safe",
          title: "Attach task",
          attachments: JSON.stringify(oldAttachments),
        })
        .run();

      const res = await app.request("/tasks/upd-attach-safe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachments: [
            {
              name: "evil.txt",
              mimeType: "text/plain",
              size: 1,
              content: null,
              path: ".ai-factory/files/tasks/other-task/evil.txt",
            },
          ],
        }),
      });

      expect(res.status).toBe(400);
      const row = db.select().from(tasks).where(eq(tasks.id, "upd-attach-safe")).get();
      expect(JSON.parse(row!.attachments)).toEqual(oldAttachments);
      expect(existsSync(join(oldDir, "keep.txt"))).toBe(true);
    });

    it("should sync physical plan file when updating plan via PUT", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-put-plan-sync-"));
      db.insert(projects)
        .values({
          id: "project-put-plan",
          name: "Project Put Plan",
          rootPath,
        })
        .run();
      db.insert(tasks)
        .values({
          id: "upd-plan-1",
          projectId: "project-put-plan",
          title: "Update plan",
          isFix: false,
        })
        .run();

      const res = await app.request("/tasks/upd-plan-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "## PUT Plan\n- [ ] Step from API" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plan).toBe("## PUT Plan\n- [ ] Step from API");

      const filePlan = readFileSync(join(rootPath, ".ai-factory", "PLAN.md"), "utf8");
      expect(filePlan).toBe("## PUT Plan\n- [ ] Step from API\n");
    });
  });

  describe("POST /tasks/:id/sync-plan", () => {
    it("should sync db plan from physical PLAN.md", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-sync-plan-"));
      const aiFactoryDir = join(rootPath, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      writeFileSync(join(aiFactoryDir, "PLAN.md"), "## Synced Plan\n- Step from file\n", "utf8");

      db.insert(projects)
        .values({
          id: "project-sync",
          name: "Project Sync",
          rootPath,
        })
        .run();
      db.insert(tasks)
        .values({
          id: "task-sync",
          projectId: "project-sync",
          title: "Sync task",
          plan: "## Old Plan\n- old step",
        })
        .run();

      const res = await app.request("/tasks/task-sync/sync-plan", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plan).toBe("## Synced Plan\n- Step from file\n");
    });

    it("should return 404 when physical plan file is missing", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-sync-plan-missing-"));
      mkdirSync(join(rootPath, ".ai-factory"), { recursive: true });

      db.insert(projects)
        .values({
          id: "project-sync-missing",
          name: "Project Sync Missing",
          rootPath,
        })
        .run();
      db.insert(tasks)
        .values({
          id: "task-sync-missing",
          projectId: "project-sync-missing",
          title: "Sync task missing",
        })
        .run();

      const res = await app.request("/tasks/task-sync-missing/sync-plan", {
        method: "POST",
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/Plan file not found/);
    });

    it("should return 404 when project for task does not exist", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "task-sync-no-project",
          projectId: "missing-project",
          title: "Task without project",
        })
        .run();

      const res = await app.request("/tasks/task-sync-no-project/sync-plan", {
        method: "POST",
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/Task or project not found/);
    });
  });

  describe("POST /tasks/:id/sync-plan — edge cases", () => {
    it("should return 404 for non-existent task", async () => {
      const res = await app.request("/tasks/totally-missing/sync-plan", {
        method: "POST",
      });
      expect(res.status).toBe(404);
    });

    it("should sync empty plan file as null plan", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-sync-empty-plan-"));
      const aiFactoryDir = join(rootPath, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      writeFileSync(join(aiFactoryDir, "PLAN.md"), "   \n  \n", "utf8");

      db.insert(projects)
        .values({ id: "project-sync-empty", name: "Empty Plan Sync", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "task-sync-empty",
          projectId: "project-sync-empty",
          title: "Sync empty plan",
          plan: "## Old Plan",
        })
        .run();

      const res = await app.request("/tasks/task-sync-empty/sync-plan", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plan).toBeNull();
    });
  });

  describe("GET /tasks/:id/plan-file-status — edge cases", () => {
    it("should return 404 for non-existent task", async () => {
      const res = await app.request("/tasks/totally-missing/plan-file-status");
      expect(res.status).toBe(404);
    });

    it("should return 404 when project for task does not exist", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "task-pfs-no-project",
          projectId: "missing-project",
          title: "No project",
        })
        .run();

      const res = await app.request("/tasks/task-pfs-no-project/plan-file-status");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /tasks/:id/plan-file-status", () => {
    it("should report existing canonical plan file", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-plan-status-"));
      const aiFactoryDir = join(rootPath, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      writeFileSync(join(aiFactoryDir, "PLAN.md"), "## Existing Plan\n", "utf8");

      db.insert(projects)
        .values({
          id: "project-plan-status",
          name: "Project Plan Status",
          rootPath,
        })
        .run();
      db.insert(tasks)
        .values({
          id: "task-plan-status",
          projectId: "project-plan-status",
          title: "Status task",
        })
        .run();

      const res = await app.request("/tasks/task-plan-status/plan-file-status");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.exists).toBe(true);
      const normalizedPath = String(body.path).replaceAll("\\", "/");
      expect(normalizedPath).toContain(".ai-factory/PLAN.md");
    });

    it("should report missing canonical plan file", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-plan-status-missing-"));
      mkdirSync(join(rootPath, ".ai-factory"), { recursive: true });

      db.insert(projects)
        .values({
          id: "project-plan-status-missing",
          name: "Project Plan Status Missing",
          rootPath,
        })
        .run();
      db.insert(tasks)
        .values({
          id: "task-plan-status-missing",
          projectId: "project-plan-status-missing",
          title: "Status task missing",
        })
        .run();

      const res = await app.request("/tasks/task-plan-status-missing/plan-file-status");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.exists).toBe(false);
      const normalizedPath = String(body.path).replaceAll("\\", "/");
      expect(normalizedPath).toContain(".ai-factory/PLAN.md");
    });
  });

  describe("DELETE /tasks/:id", () => {
    it("should delete a task", async () => {
      const db = testDb.current;
      db.insert(tasks).values({ id: "del-1", projectId: "test-project", title: "Delete me" }).run();

      const res = await app.request("/tasks/del-1", { method: "DELETE" });
      expect(res.status).toBe(200);

      const check = db.select().from(tasks).where(eq(tasks.id, "del-1")).get();
      expect(check).toBeUndefined();
    });

    it("should return 404 for non-existent task", async () => {
      const res = await app.request("/tasks/non-existent", { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /tasks/:id/operator-verified-completion", () => {
    function operatorVerificationPayload(overrides: Record<string, unknown> = {}) {
      return {
        commitSha: "a".repeat(40),
        changedFiles: ["src/feature.ts"],
        verification: [
          {
            command: "npm.cmd test",
            status: "passed",
            outputPreview: "Tests passed",
            outputSha256: "b".repeat(64),
          },
        ],
        worktreeClean: true,
        ...overrides,
      };
    }

    function commitFile(rootPath: string, path: string, content: string): string {
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) mkdirSync(join(rootPath, dir), { recursive: true });
      writeFileSync(join(rootPath, path), content, "utf8");
      execFileSync("git", ["add", path], { cwd: rootPath, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", `change ${path}`, "--no-verify"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      return execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootPath, encoding: "utf8" }).trim();
    }

    function commitFiles(rootPath: string, files: Record<string, string>): string {
      for (const [path, content] of Object.entries(files)) {
        const dir = path.split("/").slice(0, -1).join("/");
        if (dir) mkdirSync(join(rootPath, dir), { recursive: true });
        writeFileSync(join(rootPath, path), content, "utf8");
      }
      execFileSync("git", ["add", ...Object.keys(files)], { cwd: rootPath, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "operator closeout changes", "--no-verify"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      return execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootPath, encoding: "utf8" }).trim();
    }

    function initEmptyGitProject(rootPath: string) {
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: rootPath, stdio: "ignore" });
      execFileSync("git", ["config", "user.email", "t@t.local"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      execFileSync("git", ["config", "user.name", "T"], { cwd: rootPath, stdio: "ignore" });
    }

    function gitSnapshot(rootPath: string): { id: string; commit: string; tree: string } {
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

    function validRoadmapAuditReport(input: {
      taskId: string;
      batchId: string;
      roadmapAlias: string;
      artifactPath: string;
      snapshot: { id: string; commit: string; tree: string };
    }): string {
      const body = [
        "No validated findings.",
        "",
        "Risk hypotheses: risk-1 for runtime evidence marker integrity in `README.md:2` was covered and is absent.",
        "",
        "Checked files:",
        "- `README.md:2`",
        "",
        "Checked commands:",
        '- Command `rg -n "runtime evidence" README.md` output: `README.md:2:runtime evidence marker`',
        "",
      ].join("\n");
      const manifest = {
        version: 1,
        auditPlanId: `batch:${input.batchId}:task:${input.taskId}`,
        taskId: input.taskId,
        batchId: input.batchId,
        roadmapAlias: input.roadmapAlias,
        artifactPath: input.artifactPath,
        contentSha256: computeAuditReportContentSha256(body),
        sourceSnapshot: { ...input.snapshot, dirty: false },
        outcome: "validated_no_findings",
        scopeCoverage: [{ root: "README.md", covered: true, evidenceRefs: ["ev-1"] }],
        riskHypotheses: [
          { id: "risk-1", description: "Runtime evidence can be forged", status: "covered" },
        ],
        findings: [],
        noFindingsClaims: [{ id: "nf-1", evidenceRefs: ["ev-1"] }],
        evidenceRefs: ["ev-1"],
      };
      return `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`;
    }

    function auditCompletionActivityLog(): string {
      return [
        "[2026-05-09T00:00:00.000Z] Agent: implement-coordinator started",
        "[2026-05-09T00:00:01.000Z] Tool: read_file README.md",
        "[2026-05-09T00:00:02.000Z] Tool: write_file audit/report.md",
        "[2026-05-09T00:00:03.000Z] Agent: implement-coordinator complete",
        "[2026-05-09T00:00:04.000Z] Agent: review-gate started",
        "[2026-05-09T00:00:05.000Z] Tool: read_file audit/report.md",
        "[2026-05-09T00:00:06.000Z] Agent: review-gate complete",
      ].join("\n");
    }

    function planWithManifest(
      taskId: string,
      changedFiles = ["src/feature.ts"],
      acceptanceCriterionIds = ["operator-verified-completion"],
    ): string {
      return [
        "```aif-plan-manifest",
        JSON.stringify({
          version: 1,
          taskId,
          intent: "feature",
          scope: changedFiles,
          allowedChanges: ["source", "tests", "docs", "config"],
          forbiddenChanges: ["report"],
          expectedArtifacts: [{ kind: "source_diff", paths: changedFiles }],
          acceptanceCriteria: acceptanceCriterionIds.map((id) => ({
            id,
            description: `${id} is satisfied by operator verification evidence.`,
            verification: "npm.cmd test",
          })),
          verificationCommands: ["npm.cmd test"],
        }),
        "```",
        "",
        "## Plan",
        "- [x] Commit the implementation delta",
        "- [x] Run focused verification",
      ].join("\n");
    }

    it("accepts committed operator evidence without waking implementer", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-closeout-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-closeout-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "missing_aif_result_contract",
          skipReview: true,
        })
        .run();

      const res = await app.request("/tasks/operator-closeout-task/operator-verified-completion", {
        method: "POST",
        body: JSON.stringify(operatorVerificationPayload({ commitSha })),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("done");
      expect(body.implementationManifest.commitEvidence.commitSha).toBe(commitSha);
      expect(body.artifactTrust).toMatchObject({
        artifactTrustLevel: "trusted",
        claimOutcome: "supported",
        nextAction: "none",
      });
      expect(body.artifactTrust.reasonCodes ?? []).not.toEqual(
        expect.arrayContaining([
          "verification_command_not_observed",
          "missing_verification_evidence",
        ]),
      );
      const detailRes = await app.request("/tasks/operator-closeout-task");
      expect(detailRes.status).toBe(200);
      const detailBody = await detailRes.json();
      expect(detailBody.artifactTrust).toMatchObject({
        artifactTrustLevel: "trusted",
        claimOutcome: "supported",
        nextAction: "none",
      });
      expect(detailBody.artifactTrust.reasonCodes ?? []).not.toEqual(
        expect.arrayContaining([
          "verification_command_not_observed",
          "missing_verification_evidence",
        ]),
      );
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "task:moved",
        payload: expect.objectContaining({ id: "operator-closeout-task", status: "done" }),
      });
      expect(mockBroadcast).not.toHaveBeenCalledWith({
        type: "agent:wake",
        payload: expect.anything(),
      });
    });

    it("routes skip-review operator closeout to QA when the QA lifecycle is enabled", async () => {
      mockRequirementsIntakeEnabled.value = true;
      mockRequirementsQaEnabled.value = true;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-closeout-qa-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-closeout-qa-task",
          projectId: "test-project",
          title: "Build feature with QA",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "missing_aif_result_contract",
          skipReview: true,
        })
        .run();

      const res = await app.request(
        "/tasks/operator-closeout-qa-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("qa");
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "task:moved",
        payload: expect.objectContaining({ id: "operator-closeout-qa-task", status: "qa" }),
      });
    });

    it("routes reviewed operator closeout to review before QA when the QA lifecycle is enabled", async () => {
      mockRequirementsIntakeEnabled.value = true;
      mockRequirementsQaEnabled.value = true;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-closeout-review-qa-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-closeout-review-qa-task",
          projectId: "test-project",
          title: "Build feature with review and QA",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "missing_aif_result_contract",
          skipReview: false,
        })
        .run();

      const res = await app.request(
        "/tasks/operator-closeout-review-qa-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("review");
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "task:moved",
        payload: expect.objectContaining({
          id: "operator-closeout-review-qa-task",
          status: "review",
        }),
      });
    });

    it("accepts root commit operator evidence using submitted commit diff collection", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-root-commit-"));
      initEmptyGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-root-commit-task",
          projectId: "test-project",
          title: "Build feature from root commit",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "missing_aif_result_contract",
          skipReview: true,
        })
        .run();

      const res = await app.request(
        "/tasks/operator-root-commit-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("done");
      expect(body.implementationManifest.changedFiles).toEqual([
        expect.objectContaining({ path: "src/feature.ts" }),
      ]);
    });

    it("preserves plan manifest binding for planned operator closeout readbacks", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-planned-closeout-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-planned-closeout-task",
          projectId: "test-project",
          title: "Build planned feature",
          description: "Implement planned feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "missing_aif_result_contract",
          skipReview: true,
          plan: planWithManifest("operator-planned-closeout-task"),
        })
        .run();

      const res = await app.request(
        "/tasks/operator-planned-closeout-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("done");
      expect(body.implementationManifest.planManifestHash).toEqual(expect.any(String));
      expect(body.artifactTrust).toMatchObject({
        artifactState: "accepted",
        artifactTrustLevel: "trusted",
        claimOutcome: "supported",
        nextAction: "none",
      });
      const timelineRes = await app.request("/tasks/operator-planned-closeout-task/timeline");
      expect(timelineRes.status).toBe(200);
      const timelineBody = await timelineRes.json();
      const manifestArtifact = timelineBody.artifacts.find(
        (artifact: { kind: string }) => artifact.kind === "implementation_manifest",
      );
      expect(manifestArtifact).toEqual(
        expect.objectContaining({
          state: "accepted",
          metadata: expect.objectContaining({
            reasonCodes: ["implementation_manifest_valid"],
          }),
        }),
      );
      expect(
        timelineBody.claims.find(
          (claim: { artifactId: string }) => claim.artifactId === manifestArtifact?.id,
        ),
      ).toEqual(expect.objectContaining({ outcome: "supported", trustLevel: "trusted" }));
    });

    it("derives acceptance criteria from the approved plan manifest", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-custom-ac-closeout-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-custom-ac-closeout-task",
          projectId: "test-project",
          title: "Build planned feature with custom criteria",
          description: "Implement planned feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "missing_aif_result_contract",
          skipReview: true,
          plan: planWithManifest(
            "operator-custom-ac-closeout-task",
            ["src/feature.ts"],
            ["AC1", "AC2"],
          ),
        })
        .run();

      const res = await app.request(
        "/tasks/operator-custom-ac-closeout-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(
        body.implementationManifest.acceptanceCriteria.map((entry: { id: string }) => entry.id),
      ).toEqual(["AC1", "AC2"]);
      expect(body.artifactTrust).toMatchObject({
        artifactTrustLevel: "trusted",
        claimOutcome: "supported",
        nextAction: "none",
      });
    });

    it("rejects operator evidence that omits files changed by the submitted commit", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-subset-diff-"));
      initGitProject(rootPath);
      const commitSha = commitFiles(rootPath, {
        "src/feature.ts": "export const value = 1;\n",
        "package.json": '{"scripts":{"test":"vitest"}}\n',
      });
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-subset-diff-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "missing_aif_result_contract",
          skipReview: true,
        })
        .run();

      const res = await app.request(
        "/tasks/operator-subset-diff-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(
            operatorVerificationPayload({ commitSha, changedFiles: ["src/feature.ts"] }),
          ),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("undeclared_commit_files");
      const detailRes = await app.request("/tasks/operator-subset-diff-task");
      expect((await detailRes.json()).status).toBe("blocked_external");
    });

    it("rejects out-of-plan committed files before moving task state", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-out-of-plan-"));
      initGitProject(rootPath);
      const changedFiles = ["src/feature.ts", "package.json"];
      const commitSha = commitFiles(rootPath, {
        "src/feature.ts": "export const value = 1;\n",
        "package.json": '{"scripts":{"test":"vitest"}}\n',
      });
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-out-of-plan-task",
          projectId: "test-project",
          title: "Build scoped feature",
          description: "Implement scoped feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "missing_aif_result_contract",
          skipReview: true,
          plan: planWithManifest("operator-out-of-plan-task", ["src/feature.ts"], ["AC1"]),
        })
        .run();

      const res = await app.request(
        "/tasks/operator-out-of-plan-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha, changedFiles })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("implementation_manifest_invalid");
      expect(body.error).toContain("implementation_scope_mismatch");
      const detailRes = await app.request("/tasks/operator-out-of-plan-task");
      expect((await detailRes.json()).status).toBe("blocked_external");
    });

    it("rejects declared files that only exist in the commit tree", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-tree-only-"));
      initGitProject(rootPath);
      commitFile(rootPath, "src/existing.ts", "export const oldValue = 1;\n");
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-tree-only-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          skipReview: true,
        })
        .run();

      const res = await app.request("/tasks/operator-tree-only-task/operator-verified-completion", {
        method: "POST",
        body: JSON.stringify(
          operatorVerificationPayload({ commitSha, changedFiles: ["src/existing.ts"] }),
        ),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("changed_file_not_in_commit_diff");
    });

    it("rejects pending checklist items before closeout", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-checklist-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-checklist-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          skipReview: true,
          implementationManifestJson: JSON.stringify({
            planChecklist: { total: 2, completed: 1, pending: 1, pendingItems: ["finish"] },
          }),
        })
        .run();

      const res = await app.request("/tasks/operator-checklist-task/operator-verified-completion", {
        method: "POST",
        body: JSON.stringify(operatorVerificationPayload({ commitSha })),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("pending_checklist_items");
    });

    it("rejects pending checklist even when pendingItems is empty", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-empty-checklist-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-empty-checklist-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          skipReview: true,
          implementationManifestJson: JSON.stringify({
            planChecklist: { total: 2, completed: 1, pending: 1, pendingItems: [] },
          }),
        })
        .run();

      const res = await app.request(
        "/tasks/operator-empty-checklist-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("pending_checklist_items");
    });

    it("rejects nonexistent commits", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-missing-commit-"));
      initGitProject(rootPath);
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-missing-commit-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          skipReview: true,
        })
        .run();

      const res = await app.request(
        "/tasks/operator-missing-commit-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha: "c".repeat(40) })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("commit_not_found");
    });

    it("rejects invalid verification evidence before closeout", async () => {
      const res = await app.request("/tasks/operator-closeout-task/operator-verified-completion", {
        method: "POST",
        body: JSON.stringify(
          operatorVerificationPayload({
            verification: [
              {
                command: "npm.cmd test",
                status: "failed",
                outputPreview: "",
                outputSha256: "not-a-sha",
              },
            ],
          }),
        ),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(400);
    });

    it("rejects dirty files that intersect declared task scope", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-dirty-relevant-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      writeFileSync(join(rootPath, "src", "feature.ts"), "export const value = 2;\n", "utf8");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-dirty-relevant-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          skipReview: true,
        })
        .run();

      const res = await app.request(
        "/tasks/operator-dirty-relevant-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("dirty_relevant_worktree");
    });

    it("rejects dirty files inside approved plan scope even when outside the submitted commit", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-dirty-plan-scope-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      writeFileSync(join(rootPath, "src", "other.ts"), "export const other = 1;\n", "utf8");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-dirty-plan-scope-task",
          projectId: "test-project",
          title: "Build scoped feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          skipReview: true,
          plan: planWithManifest("operator-dirty-plan-scope-task", ["src/**"]),
        })
        .run();

      const res = await app.request(
        "/tasks/operator-dirty-plan-scope-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("dirty_relevant_worktree");
      expect(body.error).toContain("src/other.ts");
    });

    it("allows unrelated dirty files outside declared task scope", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-dirty-unrelated-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      writeFileSync(join(rootPath, "notes.txt"), "unrelated operator note\n", "utf8");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-dirty-unrelated-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          skipReview: true,
        })
        .run();

      const res = await app.request(
        "/tasks/operator-dirty-unrelated-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("done");
      const artifact = testDb.current
        .select()
        .from(taskStageArtifacts)
        .where(eq(taskStageArtifacts.taskId, "operator-dirty-unrelated-task"))
        .all()
        .find((row) => row.stage === "operator_verified_completion");
      const metadata = JSON.parse(artifact?.metadataJson ?? "{}");
      expect(metadata.relevantWorktreeClean).toBe(true);
      expect(metadata.dirtyUnrelatedFiles).toEqual(["notes.txt"]);
      expect(metadata.evidence).toEqual(
        expect.objectContaining({
          relevantWorktreeClean: true,
          dirtyUnrelatedFiles: ["notes.txt"],
        }),
      );
    });

    it("rejects unresolved blocking findings without an allowed override", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-blocker-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-blocker-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "review",
          skipReview: true,
          autoReviewStateJson: JSON.stringify({
            strategy: "fix_first",
            iteration: 1,
            findings: [{ id: "finding-1", status: "still_blocking" }],
          }),
        })
        .run();

      const res = await app.request("/tasks/operator-blocker-task/operator-verified-completion", {
        method: "POST",
        body: JSON.stringify(operatorVerificationPayload({ commitSha })),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("unresolved_blockers");
    });

    it("records blocker override evidence when an allowed override is accepted", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-blocker-override-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-blocker-override-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "review",
          skipReview: true,
          autoReviewStateJson: JSON.stringify({
            strategy: "fix_first",
            iteration: 1,
            findings: [{ id: "finding-1", status: "still_blocking" }],
          }),
        })
        .run();

      const res = await app.request(
        "/tasks/operator-blocker-override-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(
            operatorVerificationPayload({
              commitSha,
              allowBlockerOverride: true,
              blockerOverrideJustification: "Operator verified finding-1 is stale after commit.",
            }),
          ),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(200);
      const artifact = testDb.current
        .select()
        .from(taskStageArtifacts)
        .where(eq(taskStageArtifacts.taskId, "operator-blocker-override-task"))
        .all()
        .find((row) => row.stage === "operator_verified_completion");
      const metadata = JSON.parse(artifact?.metadataJson ?? "{}");
      expect(metadata.evidence.overriddenBlockers).toEqual(["finding-1"]);
      expect(metadata.evidence.blockerOverrideJustification).toBe(
        "Operator verified finding-1 is stale after commit.",
      );
      expect(metadata.blockerOverride).toEqual({
        blockers: ["finding-1"],
        justification: "Operator verified finding-1 is stale after commit.",
      });
    });

    it("rejects manual-review blocked tasks before terminal operator closeout", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-manual-review-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "src/feature.ts", "export const value = 1;\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-manual-review-task",
          projectId: "test-project",
          title: "Build feature",
          description: "Implement feature",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "review",
          blockedReason: "manual_review_required: unresolved review finding",
          skipReview: true,
        })
        .run();

      const res = await app.request(
        "/tasks/operator-manual-review-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("manual_review_required");
    });

    it("rejects invalid audit artifacts instead of bypassing audit validation", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-invalid-audit-"));
      initGitProject(rootPath);
      const commitSha = commitFile(rootPath, "audit/report.md", "# Incomplete audit\n");
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-invalid-audit-task",
          projectId: "test-project",
          title: "Write audit report",
          description: "Report artifact: audit/report.md",
          taskIntent: "audit",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          skipReview: true,
        })
        .run();
      createRoadmapBatchContract({
        projectId: "test-project",
        roadmapAlias: "operator-invalid-audit",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: ["operator-invalid-audit-task"],
        artifacts: [
          {
            taskId: "operator-invalid-audit-task",
            role: "report",
            artifactPath: "audit/report.md",
            projectRoot: rootPath,
          },
        ],
      });

      const res = await app.request(
        "/tasks/operator-invalid-audit-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(
            operatorVerificationPayload({ commitSha, changedFiles: ["audit/report.md"] }),
          ),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("operator_verified_completion rejected");
    });

    it("uses roadmap batch audit plan ids when validating operator audit closeout evidence", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-batch-audit-"));
      initGitProject(rootPath);
      commitFile(rootPath, "README.md", "# test\nruntime evidence marker\n");
      const sourceSnapshot = gitSnapshot(rootPath);
      execFileSync("git", ["checkout", "-b", "feature/operator-batch-audit"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-batch-audit-task",
          projectId: "test-project",
          title: "Write batch audit report",
          description: "Report artifact: audit/report.md",
          taskIntent: "audit",
          roadmapAlias: "operator-batch-audit",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          skipReview: true,
          agentActivityLog: auditCompletionActivityLog(),
        })
        .run();
      const batch = createRoadmapBatchContract({
        projectId: "test-project",
        roadmapAlias: "operator-batch-audit",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: ["operator-batch-audit-task"],
        artifacts: [
          {
            taskId: "operator-batch-audit-task",
            role: "report",
            artifactPath: "audit/report.md",
            projectRoot: rootPath,
            branchName: "feature/operator-batch-audit",
          },
        ],
      });
      const auditPlanId = `batch:${batch.batchId}:task:operator-batch-audit-task`;
      const commitSha = commitFile(
        rootPath,
        "audit/report.md",
        validRoadmapAuditReport({
          taskId: "operator-batch-audit-task",
          batchId: batch.batchId,
          roadmapAlias: "operator-batch-audit",
          artifactPath: "audit/report.md",
          snapshot: sourceSnapshot,
        }),
      );
      appendEvidenceUnitEvent(
        buildEvidenceUnit(
          {
            taskId: "operator-batch-audit-task",
            auditPlanId,
            sourceSnapshotId: sourceSnapshot.id,
            scopeIds: ["README.md"],
            riskHypothesisIds: ["risk-1"],
          },
          buildEvidenceUnitPayload({
            id: "ev-1",
            toolName: "Grep",
            evidenceKind: "search",
            evidenceGrade: "substantive",
            scopeIds: ["README.md"],
            riskHypothesisIds: ["risk-1"],
            paths: ["README.md"],
            command: 'rg -n "runtime evidence" README.md',
            output: "README.md:2:runtime evidence marker",
          }),
        ),
      );

      const res = await app.request(
        "/tasks/operator-batch-audit-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(
            operatorVerificationPayload({ commitSha, changedFiles: ["audit/report.md"] }),
          ),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("done");
      const artifact = listRoadmapBatchArtifacts(batch.batchId)[0];
      expect(artifact.state).toBe("valid");
      expect(artifact.failureFamily).toBeNull();
    });

    it("accepts clean committed plan, package, and smoke script evidence", async () => {
      const rootPath = mkdtempSync(join(tmpdir(), "aif-operator-smoke-shape-"));
      initGitProject(rootPath);
      const changedFiles = [".ai-factory/PLAN.md", "package.json", "scripts/smoke-api-contract.js"];
      const commitSha = commitFiles(rootPath, {
        ".ai-factory/PLAN.md": "## Plan\n- [x] Add smoke test\n",
        "package.json": '{"scripts":{"test:smoke":"node scripts/smoke-api-contract.js"}}\n',
        "scripts/smoke-api-contract.js": "console.log('27 PASS / 0 FAIL');\n",
      });
      insertTestProject(testDb.current, rootPath);
      testDb.current
        .insert(tasks)
        .values({
          id: "operator-smoke-shape-task",
          projectId: "test-project",
          title: "Add API contract smoke script",
          description: "Add smoke script and npm command.",
          taskIntent: "feature",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "missing_aif_result_contract",
          skipReview: true,
        })
        .run();

      const res = await app.request(
        "/tasks/operator-smoke-shape-task/operator-verified-completion",
        {
          method: "POST",
          body: JSON.stringify(operatorVerificationPayload({ commitSha, changedFiles })),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("done");
      expect(
        body.implementationManifest.changedFiles.map((entry: { path: string }) => entry.path),
      ).toEqual(changedFiles);
    });
  });

  describe("POST /tasks/:id/events", () => {
    it("blocks runtime-starting events when project config has deterministic errors", async () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "config-governance-block-"));
      mkdirSync(join(projectRoot, ".ai-factory"), { recursive: true });
      writeFileSync(
        join(projectRoot, ".ai-factory", "config.yaml"),
        "workflow:\n  auto_create_dirs: yes\n",
      );
      testDb.current
        .insert(projects)
        .values({ id: "test-project", name: "Test Project", rootPath: projectRoot })
        .run();
      testDb.current
        .insert(tasks)
        .values({
          id: "task-config-blocked",
          projectId: "test-project",
          title: "Blocked",
          description: "",
          status: "backlog",
        })
        .run();

      const res = await app.request("/tasks/task-config-blocked/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_ai" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("PROJECT_CONFIG_INVALID_BOOLEAN");
      const blocked = testDb.current
        .select()
        .from(tasks)
        .where(eq(tasks.id, "task-config-blocked"))
        .get();
      expect(blocked?.status).toBe("blocked_external");
      expect(blocked?.blockedReason).toContain("PROJECT_CONFIG_INVALID_BOOLEAN");
    });

    it("rejects runtime-starting events for container tasks", async () => {
      testDb.current
        .insert(tasks)
        .values({
          id: "task-container-start",
          projectId: "test-project",
          title: "Container",
          description: "",
          status: "backlog",
          hierarchyRole: "container",
          parentCloseoutPolicy: "all_children_verified",
        })
        .run();

      const res = await app.request("/tasks/task-container-start/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_ai" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("Container tasks");
    });

    it("should return 404 for events on non-existent task", async () => {
      const res = await app.request("/tasks/missing/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_ai" }),
      });

      expect(res.status).toBe(404);
    });

    it("should return 500 when fast_fix second attempt throws unexpectedly", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-fast-fix-err",
          projectId: "project-fast-fix-err",
          title: "Fast fix error path",
          status: "plan_ready",
          autoMode: false,
          plan: "## Plan\n- Step A",
        })
        .run();
      db.insert(taskComments)
        .values({
          id: "ev-fast-fix-err-comment",
          taskId: "ev-fast-fix-err",
          author: "human",
          message: "Please amend plan",
          attachments: "[]",
        })
        .run();
      const rootPath = mkdtempSync(join(tmpdir(), "aif-fast-fix-err-"));
      mkdirSync(join(rootPath, ".ai-factory"), { recursive: true });
      db.insert(projects)
        .values({
          id: "project-fast-fix-err",
          name: "Fast fix error project",
          rootPath,
        })
        .run();

      mockRunApiRuntimeOneShot.mockReset();
      mockRunApiRuntimeOneShot
        .mockResolvedValueOnce({
          result: { outputText: "bad" },
          context: {},
        })
        .mockRejectedValueOnce(new Error("second attempt failed"));

      const res = await app.request("/tasks/ev-fast-fix-err/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "fast_fix" }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Internal server error");
    });

    it("should start AI from backlog into requirements analysis when intake is enabled", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "mov-1", projectId: "test-project", title: "Move me", status: "backlog" })
        .run();

      const res = await app.request("/tasks/mov-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_ai" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("requirements_analysis");
    });

    it("should preserve legacy start AI routing when requirements intake is disabled", async () => {
      mockRequirementsIntakeEnabled.value = false;
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "mov-disabled",
          projectId: "test-project",
          title: "Move me legacy",
          status: "backlog",
        })
        .run();

      const res = await app.request("/tasks/mov-disabled/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_ai" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("planning");
    });

    it("should accept existing plan from backlog and transition to plan_ready", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-accept-plan-"));
      const aiFactoryDir = join(rootPath, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      writeFileSync(
        join(aiFactoryDir, "PLAN.md"),
        [
          "# Existing Plan",
          "",
          "- [ ] Inspect README.md for the requested acceptance flow.",
          "- [ ] Update README.md with the accepted behavior.",
          "- [ ] Run npm.cmd test for the focused regression check.",
        ].join("\n"),
      );

      db.insert(projects).values({ id: "proj-accept", name: "Accept", rootPath }).run();
      db.insert(tasks)
        .values({
          id: "ev-accept-plan-1",
          projectId: "proj-accept",
          title: "Accept README plan",
          description: "Scope: README.md.",
          status: "backlog",
        })
        .run();

      const res = await app.request("/tasks/ev-accept-plan-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "accept_existing_plan" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("plan_ready");
      expect(body.plan).toContain("Existing Plan");
    });

    it("repairs malformed full-mode manifest blocks before accepting existing plans", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-accept-plan-repair-"));
      const aiFactoryDir = join(rootPath, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      writeFileSync(
        join(aiFactoryDir, "PLAN.md"),
        [
          "# Existing Full Plan",
          "",
          "```aif-plan-manifest",
          '{"version":1,"taskId":',
          "```",
          "",
          "- [ ] Update packages/api/src/services/taskEvents.ts to normalize existing plans before validation.",
          "- [ ] Add a regression test in packages/api/src/__tests__/tasks.test.ts.",
          "- [ ] Run npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts.",
        ].join("\n"),
      );

      db.insert(projects)
        .values({ id: "proj-accept-repair", name: "Accept Repair", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-accept-plan-repair",
          projectId: "proj-accept-repair",
          title: "Repair accept existing plan manifest",
          description:
            "Scope: packages/api/src/services/taskEvents.ts and packages/api/src/__tests__/tasks.test.ts.",
          status: "backlog",
          taskIntent: "feature",
          plannerMode: "full",
          createdAt: "2026-05-20T00:00:00.000Z",
        })
        .run();

      const res = await app.request("/tasks/ev-accept-plan-repair/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "accept_existing_plan" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("plan_ready");
      expect(body.plan).toContain("```aif-plan-manifest");
      expect(body.plan).toContain('"taskId": "ev-accept-plan-repair"');
      expect(body.plan).not.toContain('{"version":1,"taskId":');
      expect(readFileSync(join(aiFactoryDir, "PLAN.md"), "utf8")).toContain(
        '"taskId": "ev-accept-plan-repair"',
      );
    });

    it("blocks accept_existing_plan when the on-disk plan is generic", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-accept-plan-generic-"));
      const aiFactoryDir = join(rootPath, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      writeFileSync(join(aiFactoryDir, "PLAN.md"), "## Plan\n- [ ] Implement task\n");

      db.insert(projects)
        .values({ id: "proj-accept-generic", name: "Accept Generic", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-accept-plan-generic",
          projectId: "proj-accept-generic",
          title: "Generic plan should block",
          status: "backlog",
        })
        .run();

      const res = await app.request("/tasks/ev-accept-plan-generic/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "accept_existing_plan" }),
      });

      expect(res.status).toBe(409);
      const persisted = db.select().from(tasks).where(eq(tasks.id, "ev-accept-plan-generic")).get();
      expect(persisted?.status).toBe("blocked_external");
      expect(persisted?.blockedFromStatus).toBe("backlog");
      expect(persisted?.manualReviewRequired).toBe(true);
      expect(persisted?.blockedReason).toContain("Plan quality guard");
      expect(persisted?.blockedReason).toContain("generic_plan");
      expect(persisted?.plan).toBeNull();
    });

    it("should reject accept_existing_plan when plan file is missing", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-accept-plan-missing-"));

      db.insert(projects).values({ id: "proj-accept-miss", name: "Accept Miss", rootPath }).run();
      db.insert(tasks)
        .values({
          id: "ev-accept-plan-2",
          projectId: "proj-accept-miss",
          title: "No plan file",
          status: "backlog",
        })
        .run();

      const res = await app.request("/tasks/ev-accept-plan-2/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "accept_existing_plan" }),
      });

      expect(res.status).toBe(404);
    });

    it("should create and persist a feature branch when accepting an existing plan in a git repo with create_branches=true", async () => {
      const db = testDb.current;
      const { execFileSync } = await import("node:child_process");
      const rootPath = mkdtempSync(join(tmpdir(), "aif-accept-branch-"));
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: rootPath, stdio: "ignore" });
      execFileSync("git", ["config", "user.email", "t@t.local"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      execFileSync("git", ["config", "user.name", "T"], { cwd: rootPath, stdio: "ignore" });
      execFileSync("git", ["config", "commit.gpgsign", "false"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      const aiFactoryDir = join(rootPath, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      writeFileSync(
        join(aiFactoryDir, "PLAN.md"),
        [
          "# Existing Plan",
          "",
          "- [ ] Inspect README.md before accepting the branch plan.",
          "- [ ] Update README.md on the task branch.",
          "- [ ] Run npm.cmd test for the branch acceptance check.",
        ].join("\n"),
      );
      writeFileSync(join(rootPath, "README.md"), "# t\n");
      execFileSync("git", ["add", "-A"], { cwd: rootPath, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
        cwd: rootPath,
        stdio: "ignore",
      });

      db.insert(projects)
        .values({ id: "proj-accept-branch", name: "Accept Branch", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-accept-branch-1",
          projectId: "proj-accept-branch",
          title: "Auto accept README branch",
          description: "Scope: README.md.",
          status: "backlog",
          autoMode: true,
        })
        .run();

      const res = await app.request("/tasks/ev-accept-branch-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "accept_existing_plan" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("plan_ready");
      expect(body.branchName).toMatch(/^feature\/auto-accept-readme-branch-/);

      // HEAD now on the task's feature branch
      const current = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: rootPath,
        encoding: "utf8",
      }).trim();
      expect(current).toBe(body.branchName);
    });

    it("should reject accept_existing_plan from non-backlog status", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-accept-plan-3",
          projectId: "test-project",
          title: "Wrong status",
          status: "planning",
        })
        .run();

      const res = await app.request("/tasks/ev-accept-plan-3/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "accept_existing_plan" }),
      });

      expect(res.status).toBe(409);
    });

    it("should reject invalid event payload", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "mov-2", projectId: "test-project", title: "Invalid move" })
        .run();

      const res = await app.request("/tasks/mov-2/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "invalid_event" }),
      });

      expect(res.status).toBe(400);
    });

    it("should reject invalid transition", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "mov-3",
          projectId: "test-project",
          title: "Invalid transition",
          status: "planning",
        })
        .run();

      const res = await app.request("/tasks/mov-3/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(409);
    });

    it("should start implementation from plan_ready when autoMode=false", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "ev-plan-1",
          projectId: "test-project",
          title: "Manual plan gate",
          status: "plan_ready",
          autoMode: false,
        })
        .run();

      const res = await app.request("/tasks/ev-plan-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_implementation" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
    });

    it("should block start_implementation when a prior sequential task branch is not integrated", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-start-unmerged-branch-"));
      initGitProject(rootPath);
      mkdirSync(join(rootPath, ".ai-factory"), { recursive: true });
      writeFileSync(
        join(rootPath, ".ai-factory", "config.yaml"),
        "git:\n  enabled: true\n  base_branch: main\n  create_branches: true\n",
      );
      execFileSync("git", ["add", ".ai-factory/config.yaml"], { cwd: rootPath, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "aif config", "--no-verify"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      execFileSync("git", ["checkout", "-b", "feature/previous"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      writeFileSync(join(rootPath, "package.json"), '{"scripts":{"test":"node -e ok"}}\n');
      execFileSync("git", ["add", "package.json"], { cwd: rootPath, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "previous task", "--no-verify"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      execFileSync("git", ["checkout", "main"], { cwd: rootPath, stdio: "ignore" });
      insertTestProject(db, rootPath);
      db.insert(tasks)
        .values([
          {
            id: "ev-prior-branch",
            projectId: "test-project",
            title: "Prior branch task",
            status: "done",
            position: 100,
            branchName: "feature/previous",
          },
          {
            id: "ev-plan-branch-block",
            projectId: "test-project",
            title: "Next task",
            status: "plan_ready",
            autoMode: false,
            position: 200,
            plan: "Update src/index.ts and run npm.cmd test.",
          },
        ])
        .run();

      const res = await app.request("/tasks/ev-plan-branch-block/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_implementation" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedFromStatus).toBe("plan_ready");
      expect(body.blockedReason).toContain("sequential_branch_dependency_blocked");
      expect(body.blockedReason).toContain("feature/previous");
    });

    it("should block start_implementation when the plan is generic placeholder output", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "ev-plan-generic-block",
          projectId: "test-project",
          title: "Generic plan",
          status: "plan_ready",
          autoMode: false,
          plan: 'Short task\n<aif-plan mode="fast" docs:false tests:false>',
        })
        .run();

      const res = await app.request("/tasks/ev-plan-generic-block/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_implementation" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedFromStatus).toBe("plan_ready");
      expect(body.blockedReason).toContain("generic_plan");
    });

    it("should block start_implementation when npm test is impossible within declared plan scope", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-plan-infeasible-"));
      initGitProject(rootPath);
      writeFileSync(
        join(rootPath, "package.json"),
        JSON.stringify(
          {
            name: "infeasible-plan",
            private: true,
            scripts: {
              build: "vite build",
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      mkdirSync(join(rootPath, "src", "app"), { recursive: true });
      writeFileSync(join(rootPath, "src", "app", "index.ts"), "export const app = true;\n");
      execFileSync("git", ["add", "package.json", "src/app/index.ts"], { cwd: rootPath });
      execFileSync("git", ["commit", "-m", "add app skeleton", "--no-verify"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      insertTestProject(db, rootPath);
      const plan = [
        "## Plan",
        "- [ ] Implement the first visible workflow under src/app.",
        "- [ ] Run npm.cmd test.",
        "",
        "```aif-plan-manifest",
        JSON.stringify(
          {
            version: 1,
            taskId: "ev-plan-infeasible-verification",
            intent: "feature",
            scope: ["src/app"],
            allowedChanges: ["source"],
            forbiddenChanges: ["report"],
            expectedArtifacts: [{ kind: "source_diff", paths: ["src/app"] }],
            acceptanceCriteria: [
              {
                id: "ac-visible-workflow",
                description: "The first visible workflow renders deterministic sample data.",
                verification: "npm.cmd test",
              },
            ],
            verificationCommands: ["npm.cmd test"],
          },
          null,
          2,
        ),
        "```",
      ].join("\n");
      db.insert(tasks)
        .values({
          id: "ev-plan-infeasible-verification",
          projectId: "test-project",
          title: "Implement first slice",
          description: "File boundaries: src/app/**",
          taskIntent: "feature",
          plannerMode: "full",
          status: "plan_ready",
          autoMode: false,
          plan,
        })
        .run();

      const res = await app.request("/tasks/ev-plan-infeasible-verification/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_implementation" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedFromStatus).toBe("plan_ready");
      expect(body.blockedReason).toContain("plan_manifest_infeasible_verification");
      expect(body.blockedReason).toContain("package.json script `test`");
    });

    it("should block manual start_implementation when a broad plan requires splitting", async () => {
      const db = testDb.current;
      insertTestProject(db);
      const plan = [
        "## Plan",
        "",
        "```aif-plan-manifest",
        JSON.stringify(
          {
            version: 1,
            taskId: "ev-plan-split-required",
            intent: "feature",
            scope: ["package.json", "tsconfig.json", ".gitignore", "src/index.ts"],
            allowedChanges: ["source", "config"],
            forbiddenChanges: ["report"],
            expectedArtifacts: [
              { kind: "config_update", paths: ["package.json", "tsconfig.json", ".gitignore"] },
              { kind: "source_diff", paths: ["src/index.ts"] },
            ],
            acceptanceCriteria: [
              {
                id: "ac-build",
                description: "Skeleton application and base configuration build.",
                verification: "npm run build",
              },
            ],
            verificationCommands: ["npm install", "npm run build", "node dist/index.js"],
          },
          null,
          2,
        ),
        "```",
        "",
        "- [ ] Create the skeleton application and base configuration.",
        "- [ ] Run npm install, npm run build, and node dist/index.js.",
      ].join("\n");
      db.insert(tasks)
        .values({
          id: "ev-plan-split-required",
          projectId: "test-project",
          title: "Setup Project Architecture and Core Engine Skeleton",
          description: "Create a skeleton application, local dev stack, and base configuration.",
          taskIntent: "feature",
          plannerMode: "full",
          status: "plan_ready",
          autoMode: false,
          plan,
        })
        .run();

      const res = await app.request("/tasks/ev-plan-split-required/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_implementation" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedFromStatus).toBe("plan_ready");
      expect(body.blockedReason).toContain("task_size_split_required");
      expect(body.blockedReason).toContain("split_required:");
    });

    it("should block manual start_implementation when a broad no-manifest plan requires splitting", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "ev-plan-split-required-no-manifest",
          projectId: "test-project",
          title: "Setup Project Architecture and Core Engine Skeleton",
          description: "Create a skeleton application, local dev stack, and base configuration.",
          taskIntent: "feature",
          plannerMode: "fast",
          status: "plan_ready",
          autoMode: false,
          plan: [
            "## Plan",
            "- [ ] Create the skeleton application and base configuration.",
            "- [ ] Wire the local dev stack.",
          ].join("\n"),
        })
        .run();

      const res = await app.request("/tasks/ev-plan-split-required-no-manifest/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_implementation" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedFromStatus).toBe("plan_ready");
      expect(body.blockedReason).toContain("task_size_split_required");
      expect(body.blockedReason).toContain("split_required:");
    });

    it("should start implementation for short concrete plans without markdown structure", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "ev-plan-short-concrete",
          projectId: "test-project",
          title: "Fix form validation error",
          status: "plan_ready",
          autoMode: false,
          plan: "Update validation handling in the form submit path",
        })
        .run();

      const res = await app.request("/tasks/ev-plan-short-concrete/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_implementation" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
    });

    it("should reject start_implementation when autoMode=true", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-plan-2",
          projectId: "test-project",
          title: "Auto plan",
          status: "plan_ready",
          autoMode: true,
        })
        .run();

      const res = await app.request("/tasks/ev-plan-2/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_implementation" }),
      });

      expect(res.status).toBe(409);
    });

    it("should reject manual start for audit roadmap children before predecessors release", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values([
          {
            id: "audit-order-child-1",
            projectId: "test-project",
            title: "Audit: first child",
            taskIntent: "audit",
            roadmapAlias: "audit-order",
            status: "backlog",
            autoMode: true,
            position: 100,
          },
          {
            id: "audit-order-child-2",
            projectId: "test-project",
            title: "Audit: second child",
            taskIntent: "audit",
            roadmapAlias: "audit-order",
            status: "backlog",
            autoMode: true,
            position: 50,
          },
        ])
        .run();
      createRoadmapBatchContract({
        projectId: "test-project",
        roadmapAlias: "audit-order",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: ["audit-order-child-1", "audit-order-child-2"],
        artifacts: [
          {
            taskId: "audit-order-child-1",
            role: "report",
            artifactPath: "audit/first.md",
          },
          {
            taskId: "audit-order-child-2",
            role: "report",
            artifactPath: "audit/second.md",
          },
        ],
      });

      const res = await app.request("/tasks/audit-order-child-2/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start_ai" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("audit_child_dependency_not_ready");
    });

    it("should approve done task to verified", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({ id: "ev-1", projectId: "test-project", title: "Done task", status: "done" })
        .run();

      const res = await app.request("/tasks/ev-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("verified");
    });

    it("should block approve_done for risky generic no-delta audit tasks", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-audit-block-"));
      mkdirSync(join(rootPath, ".ai-factory"), { recursive: true });
      db.insert(projects)
        .values({ id: "project-audit-block", name: "Audit Block", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-audit-block-1",
          projectId: "project-audit-block",
          title: "Initial audit",
          taskIntent: "audit",
          status: "done",
          plan: 'Short task\n<aif-plan mode="fast" docs:false tests:false>',
        })
        .run();

      const res = await app.request("/tasks/ev-audit-block-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedFromStatus).toBe("done");
      expect(body.blockedReason).toContain("generic_plan");
      expect(body.blockedReason).toContain("missing_report_artifact");
    });

    it("should block approve_done when docs intent changed files contradict policy", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-docs-block-"));
      initGitProject(rootPath);
      mkdirSync(join(rootPath, "src"), { recursive: true });
      writeFileSync(join(rootPath, "src", "api.ts"), "export const api = true;\n", "utf8");
      db.insert(projects).values({ id: "project-docs-block", name: "Docs Block", rootPath }).run();
      db.insert(tasks)
        .values({
          id: "ev-docs-block-1",
          projectId: "project-docs-block",
          title: "Update API docs",
          taskIntent: "docs",
          status: "done",
          plan: "## Plan\n- [ ] Update docs/api.md\n- [ ] Run docs validation",
        })
        .run();

      const res = await app.request("/tasks/ev-docs-block-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedFromStatus).toBe("done");
      expect(body.blockedReason).toContain("intent_changed_files_contradiction");
      expect(body.blockedReason).toContain("src/api.ts");
    });

    it("should block approve_done when docs intent plan forbids source code changes", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-docs-no-source-"));
      initGitProject(rootPath);
      mkdirSync(join(rootPath, "docs"), { recursive: true });
      mkdirSync(join(rootPath, "src"), { recursive: true });
      writeFileSync(join(rootPath, "docs", "api.md"), "# API\n", "utf8");
      writeFileSync(join(rootPath, "src", "api.ts"), "export const api = true;\n", "utf8");
      db.insert(projects)
        .values({ id: "project-docs-no-source", name: "Docs No Source", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-docs-no-source-1",
          projectId: "project-docs-no-source",
          title: "Update API docs",
          taskIntent: "docs",
          status: "done",
          plan: "## Plan\n- [ ] Do not change source code for docs correctness.\n- [ ] Update docs/api.md",
        })
        .run();

      const res = await app.request("/tasks/ev-docs-no-source-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedFromStatus).toBe("done");
      expect(body.blockedReason).toContain("intent_changed_files_contradiction");
      expect(body.blockedReason).toContain("src/api.ts");
    });

    it("should allow approve_done when docs intent changed files match policy", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-docs-allow-"));
      initGitProject(rootPath);
      mkdirSync(join(rootPath, "docs"), { recursive: true });
      writeFileSync(join(rootPath, "docs", "api.md"), "# API\n", "utf8");
      db.insert(projects).values({ id: "project-docs-allow", name: "Docs Allow", rootPath }).run();
      db.insert(tasks)
        .values({
          id: "ev-docs-allow-1",
          projectId: "project-docs-allow",
          title: "Update API docs",
          taskIntent: "docs",
          status: "done",
          plan: "## Plan\n- [ ] Update docs/api.md\n- [ ] Run docs validation",
          agentActivityLog: implementationActivityLog(),
          implementationManifestJson: implementationManifest({
            taskId: "ev-docs-allow-1",
            intent: "docs",
            changedFiles: ["docs/api.md"],
          }),
        })
        .run();

      const res = await app.request("/tasks/ev-docs-allow-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(expect.objectContaining({ status: "verified" }));
    });

    it("should block approve_done when audit intent changes source beside its report", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-audit-source-block-"));
      initGitProject(rootPath);
      execFileSync("git", ["checkout", "-b", "feature/audit-source-block"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      mkdirSync(join(rootPath, "audit"), { recursive: true });
      mkdirSync(join(rootPath, "src"), { recursive: true });
      writeFileSync(join(rootPath, "src", "api.ts"), "export const api = true;\n", "utf8");
      writeFileSync(
        join(rootPath, "audit", "report.md"),
        [
          "## Finding",
          "Evidence: `src/api.ts:1` defines the API surface inspected by this audit.",
          "Risk: Audit completion could otherwise smuggle source changes beside the report.",
          "Verification: Command `rg api src/api.ts` output matched `src/api.ts:1:export const api = true;`.",
          "",
        ].join("\n"),
        "utf8",
      );
      execFileSync("git", ["add", "audit/report.md", "src/api.ts"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      execFileSync("git", ["commit", "-m", "add report and source", "--no-verify"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      db.insert(projects)
        .values({ id: "project-audit-source-block", name: "Audit Source Block", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-audit-source-block-1",
          projectId: "project-audit-source-block",
          title: "Audit API surface",
          description: "Report artifact: audit/report.md",
          taskIntent: "audit",
          status: "done",
          plan: "## Plan\n- [ ] Inspect src/api.ts\n- [ ] Write audit/report.md",
          branchName: "feature/audit-source-block",
          agentActivityLog: [
            "[2026-05-09T00:00:00.000Z] Agent: implement-coordinator started",
            "[2026-05-09T00:00:01.000Z] Tool: read_file src/api.ts",
            "[2026-05-09T00:00:02.000Z] Tool: write_file audit/report.md",
            "[2026-05-09T00:00:03.000Z] Agent: implement-coordinator complete",
            "[2026-05-09T00:00:04.000Z] Agent: review-gate started",
            "[2026-05-09T00:00:05.000Z] Tool: read_file audit/report.md",
            "[2026-05-09T00:00:06.000Z] Agent: review-gate complete",
          ].join("\n"),
        })
        .run();

      const res = await app.request("/tasks/ev-audit-source-block-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedFromStatus).toBe("done");
      expect(body.blockedReason).toContain("intent_changed_files_contradiction");
      expect(body.blockedReason).toContain("src/api.ts");
    });

    it("should return audit roadmap report tasks to rework on recoverable approve_done failures", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-audit-rework-"));
      db.insert(projects)
        .values({ id: "project-audit-rework", name: "Audit Rework", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-audit-rework-1",
          projectId: "project-audit-rework",
          title: "Audit configuration",
          description: "Report artifact: audit/config.md",
          taskIntent: "audit",
          status: "done",
          plan: "## Plan\n- Inspect configuration\n- Write report",
        })
        .run();

      const batch = createRoadmapBatchContract({
        projectId: "project-audit-rework",
        roadmapAlias: "audit",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: ["ev-audit-rework-1"],
        artifacts: [
          {
            taskId: "ev-audit-rework-1",
            role: "report",
            artifactPath: "audit/config.md",
            projectRoot: rootPath,
          },
        ],
      });

      const res = await app.request("/tasks/ev-audit-rework-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
      expect(body.reworkRequested).toBe(true);
      expect(body.blockedReason).toContain("missing_artifact");
      const artifact = listRoadmapBatchArtifacts(batch.batchId)[0];
      expect(artifact.state).toBe("missing");
      expect(artifact.failureFamily).toBe("missing_artifact");

      db.update(tasks)
        .set({
          status: "done",
          blockedReason: null,
          blockedFromStatus: null,
          reworkRequested: false,
          manualReviewRequired: false,
          reviewIterationCount: 1,
          maxReviewIterations: 3,
        })
        .where(eq(tasks.id, "ev-audit-rework-1"))
        .run();

      const repeatedRes = await app.request("/tasks/ev-audit-rework-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(repeatedRes.status).toBe(200);
      const repeatedBody = await repeatedRes.json();
      expect(repeatedBody.status).toBe("blocked_external");
      expect(repeatedBody.reworkRequested).toBe(false);
      expect(repeatedBody.manualReviewRequired).toBe(true);
      expect(repeatedBody.blockedReason).toContain("missing_artifact");
      expect(repeatedBody.blockedReason).toContain(
        "repeated audit artifact failure signature failed closed",
      );
      const repeatedArtifact = listRoadmapBatchArtifacts(batch.batchId)[0];
      expect(repeatedArtifact.state).toBe("missing");
      expect(listRoadmapBatchArtifactAttempts(repeatedArtifact.id).length).toBeGreaterThanOrEqual(
        2,
      );

      db.update(tasks)
        .set({
          status: "done",
          blockedReason: null,
          blockedFromStatus: null,
          reworkRequested: false,
          manualReviewRequired: false,
          reviewIterationCount: 3,
          maxReviewIterations: 3,
        })
        .where(eq(tasks.id, "ev-audit-rework-1"))
        .run();

      const maxedRes = await app.request("/tasks/ev-audit-rework-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(maxedRes.status).toBe(200);
      const maxedBody = await maxedRes.json();
      expect(maxedBody.status).toBe("blocked_external");
      expect(maxedBody.reworkRequested).toBe(false);
      expect(maxedBody.manualReviewRequired).toBe(true);
      expect(maxedBody.blockedReason).toContain(
        "repeated audit artifact failure signature failed closed",
      );
    });

    it("should block approve_done for explicit inconclusive audit synthesis", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-audit-inconclusive-"));
      initGitProject(rootPath);
      execFileSync("git", ["checkout", "-b", "feature/audit-inconclusive"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      mkdirSync(join(rootPath, "audit"), { recursive: true });
      writeFileSync(
        join(rootPath, "audit", "summary.md"),
        [
          "# Audit Inconclusive",
          "",
          formatAuditSynthesisOutcomeForArtifact({
            kind: "inconclusive_batch_evidence",
            reason: "Audit inconclusive: source reports did not contain trusted evidence.",
            sourceReportCount: 2,
            validatedFindingCount: 0,
            substantiveNoFindingsReportCount: 0,
            inventoryOnlyNoFindingsReportCount: 0,
            weakReportCount: 2,
          }),
          "",
          "Audit outcome: Audit inconclusive",
          "",
          "## Child Report Status",
          "",
          "| Task | Report | State | Trust | Decision |",
          "| --- | --- | --- | --- | --- |",
          "| source-one | `audit/source-1.md` | source_inconclusive | untrusted | Excluded from validated no-findings. |",
          "| source-two | `audit/source-2.md` | missing | untrusted | Excluded from validated no-findings. |",
        ].join("\n"),
        "utf8",
      );
      execFileSync("git", ["add", "audit/summary.md"], { cwd: rootPath, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "add inconclusive synthesis", "--no-verify"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      db.insert(projects)
        .values({ id: "project-audit-inconclusive", name: "Audit Inconclusive", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-audit-inconclusive-1",
          projectId: "project-audit-inconclusive",
          title: "Synthesize audit",
          description: "Report artifact: audit/summary.md",
          taskIntent: "audit",
          status: "done",
          plan: "## Plan\n- Synthesize reports\n- Write final report",
          agentActivityLog: [
            "[2026-05-09T00:00:00.000Z] Agent: implement-coordinator started",
            "[2026-05-09T00:00:01.000Z] Tool: read_file audit/summary.md",
            "[2026-05-09T00:00:02.000Z] Tool: git_commit git commit",
            "[2026-05-09T00:00:03.000Z] Agent: implement-coordinator complete",
            "[2026-05-09T00:00:04.000Z] Agent: review-gate started",
            "[2026-05-09T00:00:05.000Z] Tool: read_file audit/summary.md",
            "[2026-05-09T00:00:06.000Z] Agent: review-gate complete",
          ].join("\n"),
        })
        .run();
      const batch = createRoadmapBatchContract({
        projectId: "project-audit-inconclusive",
        roadmapAlias: "audit-inconclusive",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: ["ev-audit-inconclusive-1"],
        synthesisTaskId: "ev-audit-inconclusive-1",
        artifacts: [
          {
            taskId: "ev-audit-inconclusive-1",
            role: "synthesis",
            artifactPath: "audit/summary.md",
            projectRoot: rootPath,
          },
        ],
      });

      const res = await app.request("/tasks/ev-audit-inconclusive-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedReason).toContain("audit_inconclusive");
      const artifact = listRoadmapBatchArtifacts(batch.batchId)[0];
      expect(artifact.state).not.toBe("valid");
      expect(artifact.failureFamily).toBe("inconclusive_batch_evidence");
    });

    it("should not read unsafe roadmap artifact paths while approving audit tasks", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-audit-unsafe-"));
      initGitProject(rootPath);
      const outsideName = `outside-audit-${Date.now()}-${Math.random().toString(16).slice(2)}.md`;
      writeFileSync(
        join(rootPath, "..", outsideName),
        [
          "```audit-report-manifest",
          JSON.stringify({ evidenceRefs: ["outside-ref"] }),
          "```",
          "",
        ].join("\n"),
        "utf8",
      );
      db.insert(projects)
        .values({ id: "project-audit-unsafe", name: "Audit Unsafe", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-audit-unsafe-1",
          projectId: "project-audit-unsafe",
          title: "Audit configuration",
          taskIntent: "audit",
          status: "done",
          plan: "## Plan\n- Inspect configuration\n- Write report",
        })
        .run();

      createRoadmapBatchContract({
        projectId: "project-audit-unsafe",
        roadmapAlias: "audit",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: ["ev-audit-unsafe-1"],
        artifacts: [
          {
            taskId: "ev-audit-unsafe-1",
            role: "report",
            artifactPath: "audit/config.md",
            projectRoot: rootPath,
          },
        ],
      });
      db.update(roadmapBatchArtifacts)
        .set({ artifactPath: `../${outsideName}` })
        .where(eq(roadmapBatchArtifacts.taskId, "ev-audit-unsafe-1"))
        .run();

      const res = await app.request("/tasks/ev-audit-unsafe-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
      expect(body.blockedReason).toContain("missing_report_artifact");
      expect(body.blockedReason).not.toContain("missing_report_manifest");
    });

    it("should not treat RDPI close-out result files as audit reports during approve_done", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-rdpi-result-"));
      initGitProject(rootPath);
      execFileSync("git", ["checkout", "-b", "feature/rdpi-result"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      const resultDir = join(
        rootPath,
        "docs",
        "rdpi",
        "work",
        "work-20260514-harden-source-audit-report-production",
      );
      mkdirSync(resultDir, { recursive: true });
      writeFileSync(join(resultDir, "result.md"), "TEST PASS\nREVIEW PASS\n", "utf8");
      execFileSync(
        "git",
        ["add", "docs/rdpi/work/work-20260514-harden-source-audit-report-production/result.md"],
        { cwd: rootPath, stdio: "ignore" },
      );
      execFileSync("git", ["commit", "-m", "add rdpi result", "--no-verify"], {
        cwd: rootPath,
        stdio: "ignore",
      });
      db.insert(projects)
        .values({ id: "project-rdpi-result", name: "RDPI Result", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-rdpi-result-1",
          projectId: "project-rdpi-result",
          title: "Harden Source Audit Report Production",
          taskIntent: "audit",
          status: "done",
          plan: "## Plan\n- Harden audit report production",
        })
        .run();

      const res = await app.request("/tasks/ev-rdpi-result-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedReason).toContain("missing_report_artifact");
      expect(body.blockedReason).not.toContain("malformed_report_artifact");
    });

    it("should block approve_done when audit report references missing files only", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-audit-refs-"));
      initGitProject(rootPath);
      mkdirSync(join(rootPath, "reports"), { recursive: true });
      writeFileSync(
        join(rootPath, "reports", "audit.md"),
        "Finding references `src/ghost.ts` and `packages/missing/file.ts`.\n",
        "utf8",
      );
      db.insert(projects).values({ id: "project-audit-refs", name: "Audit Refs", rootPath }).run();
      db.insert(tasks)
        .values({
          id: "ev-audit-refs-1",
          projectId: "project-audit-refs",
          title: "Audit generated findings",
          status: "done",
          plan: "## Plan\n- Validate references\n- Write report",
        })
        .run();

      const res = await app.request("/tasks/ev-audit-refs-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedReason).toContain("invalid_or_missing_file_references");
    });

    it("should block approve_done with branch isolation reason when persisted branch is missing", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-branch-block-"));
      initGitProject(rootPath);
      db.insert(projects)
        .values({ id: "project-branch-block", name: "Branch Block", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-branch-block-1",
          projectId: "project-branch-block",
          title: "Done branch-bound task",
          status: "done",
          branchName: "feature/missing-branch",
        })
        .run();

      const res = await app.request("/tasks/ev-branch-block-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.blockedFromStatus).toBe("done");
      expect(body.blockedReason).toContain("branch_isolation");
    });

    it("should delete PLAN.md on approve_done when deletePlanFile=true", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-delete-plan-"));
      const aiFactoryDir = join(rootPath, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      const planFilePath = join(aiFactoryDir, "PLAN.md");
      writeFileSync(planFilePath, "## Plan\n- [ ] Step\n", "utf8");

      db.insert(projects)
        .values({ id: "project-approve-plan", name: "Approve Plan", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-approve-plan-1",
          projectId: "project-approve-plan",
          title: "Done task with plan file",
          status: "done",
          isFix: false,
          planPath: ".ai-factory/PLAN.md",
        })
        .run();

      const res = await app.request("/tasks/ev-approve-plan-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done", deletePlanFile: true }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("verified");
      expect(existsSync(planFilePath)).toBe(false);
    });

    it("should approve done without deleting plan file when deletePlanFile is not set", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-no-delete-"));
      const aiFactoryDir = join(rootPath, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      const planFilePath = join(aiFactoryDir, "PLAN.md");
      writeFileSync(planFilePath, "## Plan\n- [ ] Keep\n", "utf8");

      db.insert(projects)
        .values({ id: "project-approve-keep", name: "Approve Keep", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-approve-keep-1",
          projectId: "project-approve-keep",
          title: "Done task keep plan",
          status: "done",
        })
        .run();

      const res = await app.request("/tasks/ev-approve-keep-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      expect(existsSync(planFilePath)).toBe(true);
    });

    it("should handle approve_done with deletePlanFile when plan file does not exist", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-no-file-"));
      mkdirSync(join(rootPath, ".ai-factory"), { recursive: true });

      db.insert(projects)
        .values({ id: "project-approve-nofile", name: "Approve No File", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-approve-nofile-1",
          projectId: "project-approve-nofile",
          title: "Done task no plan file",
          status: "done",
          isFix: false,
          planPath: ".ai-factory/PLAN.md",
        })
        .run();

      const res = await app.request("/tasks/ev-approve-nofile-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done", deletePlanFile: true }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(expect.objectContaining({ status: "verified" }));
    });

    it("should delete FIX_PLAN.md on approve_done when task isFix=true", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-approve-delete-fix-plan-"));
      const aiFactoryDir = join(rootPath, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      const planFilePath = join(aiFactoryDir, "PLAN.md");
      const fixPlanFilePath = join(aiFactoryDir, "FIX_PLAN.md");
      writeFileSync(planFilePath, "## Plan\n- [ ] Keep this\n", "utf8");
      writeFileSync(fixPlanFilePath, "## Fix Plan\n- [ ] Remove this\n", "utf8");

      db.insert(projects)
        .values({ id: "project-approve-fix-plan", name: "Approve Fix Plan", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-approve-fix-plan-1",
          projectId: "project-approve-fix-plan",
          title: "Done fix task with fix plan file",
          status: "done",
          isFix: true,
          planPath: ".ai-factory/PLAN.md",
          agentActivityLog: implementationActivityLog(),
          implementationManifestJson: implementationManifest({
            taskId: "ev-approve-fix-plan-1",
            intent: "fix",
            changedFiles: [],
            regressionExplanation: "Verified fix-plan approval cleanup does not delete PLAN.md.",
          }),
        })
        .run();

      const res = await app.request("/tasks/ev-approve-fix-plan-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done", deletePlanFile: true }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(expect.objectContaining({ status: "verified" }));
      expect(existsSync(fixPlanFilePath)).toBe(false);
      expect(existsSync(planFilePath)).toBe(true);
    });

    it("should run deterministic commit flow when commitOnApprove=true", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-commit-approve-"));
      mkdirSync(rootPath, { recursive: true });
      initGitProject(rootPath);
      writeFileSync(join(rootPath, "feature.txt"), "feature\n", "utf8");
      insertTestProject(db, rootPath);
      db.insert(tasks)
        .values({
          id: "ev-commit-1",
          projectId: "test-project",
          title: "Done commit task",
          status: "done",
        })
        .run();

      mockRunApiRuntimeOneShot.mockClear();
      vi.mocked(mockBroadcast).mockClear();

      const res = await app.request("/tasks/ev-commit-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done", commitOnApprove: true }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("verified");
      await vi.waitFor(
        () => {
          const types = vi
            .mocked(mockBroadcast)
            .mock.calls.map((c) => (c[0] as { type: string }).type);
          expect(types).toContain("task:commit_started");
          expect(types).toContain("task:commit_done");
        },
        { timeout: 5_000 },
      );

      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
      const latestCommit = execFileSync("git", ["log", "-1", "--pretty=%s"], {
        cwd: rootPath,
        encoding: "utf8",
      }).trim();
      expect(latestCommit).toBe("chore: Done commit task");
    });

    it("should block commitOnApprove when project config has deterministic errors", async () => {
      const db = testDb.current;
      const projectRoot = mkdtempSync(join(tmpdir(), "aif-commit-config-block-"));
      mkdirSync(join(projectRoot, ".ai-factory"), { recursive: true });
      writeFileSync(
        join(projectRoot, ".ai-factory", "config.yaml"),
        "workflow:\n  auto_create_dirs: yes\n",
        "utf8",
      );
      db.insert(projects)
        .values({ id: "test-project", name: "Test Project", rootPath: projectRoot })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-commit-config-block",
          projectId: "test-project",
          title: "Done commit blocked",
          status: "done",
        })
        .run();

      mockRunApiRuntimeOneShot.mockClear();
      vi.mocked(mockBroadcast).mockClear();

      const res = await app.request("/tasks/ev-commit-config-block/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done", commitOnApprove: true }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("config_governance_blocked:");
      expect(body.reasonCodes).toContain("PROJECT_CONFIG_INVALID_BOOLEAN");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
      const types = vi.mocked(mockBroadcast).mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types).not.toContain("task:commit_started");
      expect(types).not.toContain("task:commit_done");
      expect(types).not.toContain("task:commit_failed");
      const task = db.select().from(tasks).where(eq(tasks.id, "ev-commit-config-block")).get();
      expect(task?.status).toBe("done");
    });

    it("should block commitOnApprove when task runtime profile is disabled", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(runtimeProfiles)
        .values({
          id: "disabled-commit-profile",
          projectId: "test-project",
          name: "Disabled Commit Profile",
          runtimeId: "claude",
          providerId: "anthropic",
          enabled: false,
        })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-commit-disabled-profile",
          projectId: "test-project",
          title: "Done commit disabled profile",
          status: "done",
          runtimeProfileId: "disabled-commit-profile",
        })
        .run();

      mockRunApiRuntimeOneShot.mockClear();
      vi.mocked(mockBroadcast).mockClear();

      const res = await app.request("/tasks/ev-commit-disabled-profile/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done", commitOnApprove: true }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("config_governance_blocked:");
      expect(body.reasonCodes).toContain("TASK_RUNTIME_PROFILE_DISABLED");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
      const types = vi.mocked(mockBroadcast).mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types).not.toContain("task:commit_started");
      expect(types).not.toContain("task:commit_done");
      expect(types).not.toContain("task:commit_failed");
      const task = db.select().from(tasks).where(eq(tasks.id, "ev-commit-disabled-profile")).get();
      expect(task?.status).toBe("done");
    });

    it("should broadcast task:commit_failed when deterministic git commit fails", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-commit-fail-"));
      insertTestProject(db, rootPath);
      db.insert(tasks)
        .values({
          id: "ev-commit-fail",
          projectId: "test-project",
          title: "Done commit approval",
          status: "done",
        })
        .run();

      mockRunApiRuntimeOneShot.mockClear();
      vi.mocked(mockBroadcast).mockClear();

      const res = await app.request("/tasks/ev-commit-fail/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done", commitOnApprove: true }),
      });
      expect(res.status).toBe(200);
      await vi.waitFor(
        () => {
          const types = vi
            .mocked(mockBroadcast)
            .mock.calls.map((c) => (c[0] as { type: string }).type);
          expect(types).toContain("task:commit_failed");
        },
        { timeout: 5_000 },
      );

      const calls = vi.mocked(mockBroadcast).mock.calls as Array<
        [{ type: string; payload: unknown }]
      >;
      const failed = calls.find((c) => c[0].type === "task:commit_failed");
      expect(failed).toBeDefined();
      expect((failed![0].payload as { error?: string }).error).toContain("git add -A");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should not start commit flow when commitOnApprove is not set", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "ev-commit-2",
          projectId: "test-project",
          title: "Done no commit",
          status: "done",
        })
        .run();

      mockRunApiRuntimeOneShot.mockClear();
      vi.mocked(mockBroadcast).mockClear();

      const res = await app.request("/tasks/ev-commit-2/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      await Promise.resolve();
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
      const types = vi.mocked(mockBroadcast).mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types).not.toContain("task:commit_started");
      expect(types).not.toContain("task:commit_done");
      expect(types).not.toContain("task:commit_failed");
    });

    it("should block approve_done when QA is enabled and fresh acceptance evidence is missing", async () => {
      const db = testDb.current;
      insertTestProject(db);
      mockRequirementsIntakeEnabled.value = true;
      mockRequirementsQaEnabled.value = true;
      db.insert(tasks)
        .values({
          id: "ev-qa-missing",
          projectId: "test-project",
          title: "Done QA missing",
          status: "done",
          taskIntent: "general",
          agentActivityLog: implementationActivityLog(),
          implementationManifestJson: implementationManifest({
            taskId: "ev-qa-missing",
            intent: "feature",
            changedFiles: [],
            regressionExplanation: "No source delta is needed for this QA approval gate test.",
          }),
          reviewComments: "Review accepted.",
        })
        .run();

      const res = await app.request("/tasks/ev-qa-missing/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("fresh accepted QA and acceptance artifacts");
    });

    it("should allow satisfied container parents to approve without parent QA artifacts", async () => {
      const db = testDb.current;
      insertTestProject(db);
      mockRequirementsIntakeEnabled.value = true;
      mockRequirementsQaEnabled.value = true;
      db.insert(tasks)
        .values({
          id: "ev-container-qa-bypass",
          projectId: "test-project",
          title: "Roadmap parent",
          status: "done",
          hierarchyRole: "container",
          parentCloseoutPolicy: "all_children_verified",
        })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-container-child-verified",
          projectId: "test-project",
          title: "Executable child",
          status: "verified",
          hierarchyRole: "executable",
          parentTaskId: "ev-container-qa-bypass",
          rootTaskId: "ev-container-qa-bypass",
          hierarchyDepth: 1,
        })
        .run();

      const res = await app.request("/tasks/ev-container-qa-bypass/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const updated = db.select().from(tasks).where(eq(tasks.id, "ev-container-qa-bypass")).get();
      expect(updated?.status).toBe("verified");
    });

    it("should block approve_done when QA acceptance artifact metadata is malformed", async () => {
      const db = testDb.current;
      insertTestProject(db);
      mockRequirementsIntakeEnabled.value = true;
      mockRequirementsQaEnabled.value = true;
      db.insert(tasks)
        .values({
          id: "ev-qa-malformed-pack",
          projectId: "test-project",
          title: "Done QA malformed acceptance pack",
          status: "done",
          taskIntent: "general",
          agentActivityLog: implementationActivityLog(),
          implementationManifestJson: implementationManifest({
            taskId: "ev-qa-malformed-pack",
            intent: "feature",
            changedFiles: [],
            regressionExplanation: "No source delta is needed for this QA approval gate test.",
          }),
          reviewComments: "Review accepted.",
        })
        .run();
      const fingerprint = buildTaskQaSourceFingerprint("ev-qa-malformed-pack");
      const qaAttempt = recordTaskStageArtifactAttempt({
        taskId: "ev-qa-malformed-pack",
        stage: "qa",
        kind: "qa",
        label: "QA artifact",
        path: "qa.md",
        state: "accepted",
        summary: "QA passed.",
        markdown: "# QA\n\nPassed.",
        metadata: {
          status: "passed",
          sourceFingerprint: fingerprint,
          commands: [
            {
              id: "manifest:verify-api",
              command: IMPLEMENTATION_VERIFICATION_COMMAND,
              status: "passed",
              mandatory: true,
              outputSummary: "tests passed",
            },
          ],
        },
      });
      recordTaskStageArtifactAttempt({
        taskId: "ev-qa-malformed-pack",
        stage: "acceptance",
        kind: "acceptance",
        label: "Malformed acceptance pack",
        path: "acceptance.md",
        state: "accepted",
        summary: "Malformed acceptance pack.",
        markdown: "# Acceptance Pack\n\nMalformed.",
        metadata: {
          taskId: "ev-qa-malformed-pack",
          generatedAt: "2026-05-29T00:00:00.000Z",
          readiness: { ready: false, reason: "Acceptance pack is incomplete." },
          sourceFingerprint: fingerprint,
          qaArtifactId: qaAttempt.artifactId,
          qaAttemptNumber: qaAttempt.attemptNumber,
        },
      });

      const res = await app.request("/tasks/ev-qa-malformed-pack/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("fresh accepted QA and acceptance artifacts");
    });

    it("should allow approve_done when QA is enabled and fresh acceptance evidence exists", async () => {
      const db = testDb.current;
      insertTestProject(db);
      mockRequirementsIntakeEnabled.value = true;
      mockRequirementsQaEnabled.value = true;
      db.insert(tasks)
        .values({
          id: "ev-qa-ready",
          projectId: "test-project",
          title: "Done QA ready",
          status: "done",
          taskIntent: "general",
          agentActivityLog: implementationActivityLog(),
          implementationManifestJson: implementationManifest({
            taskId: "ev-qa-ready",
            intent: "feature",
            changedFiles: [],
            regressionExplanation: "No source delta is needed for this QA approval gate test.",
          }),
          reviewComments: "Review accepted.",
        })
        .run();
      const fingerprint = buildTaskQaSourceFingerprint("ev-qa-ready");
      recordTaskStageArtifactAttempt({
        taskId: "ev-qa-ready",
        stage: "qa",
        kind: "qa",
        label: "QA artifact",
        path: "qa.md",
        state: "accepted",
        summary: "QA passed.",
        markdown: "# QA\n\nPassed.",
        metadata: {
          status: "passed",
          sourceFingerprint: fingerprint,
          commands: [
            {
              id: "manifest:verify-api",
              command: IMPLEMENTATION_VERIFICATION_COMMAND,
              status: "passed",
              mandatory: true,
              outputSummary: "tests passed",
            },
          ],
        },
      });
      recordTaskAcceptancePack("ev-qa-ready");

      const res = await app.request("/tasks/ev-qa-ready/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "approve_done" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("verified");
    });

    it("should send done task to implementing with rework flag on request_changes", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-2",
          projectId: "test-project",
          title: "Done task",
          status: "done",
          retryCount: 2,
        })
        .run();

      const res = await app.request("/tasks/ev-2/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "request_changes" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
      expect(body.reworkRequested).toBe(true);
      expect(body.retryCount).toBe(0);
      expect(body.lastHeartbeatAt).toBeTruthy();
    });

    it("should mark valid audit report artifacts expected with rework details on request_changes", async () => {
      const db = testDb.current;
      const rootPath = mkdtempSync(join(tmpdir(), "aif-request-changes-report-"));
      db.insert(projects)
        .values({ id: "project-report-rework", name: "Report Rework", rootPath })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-report-rework-1",
          projectId: "project-report-rework",
          title: "Audit report rework",
          description: "Report artifact: audit/report.md",
          taskIntent: "audit",
          status: "done",
          branchName: "feature/audit-report",
          worktreePath: rootPath,
        })
        .run();
      db.insert(taskComments)
        .values({
          id: "ev-report-rework-comment-1",
          taskId: "ev-report-rework-1",
          author: "human",
          message: "Please refresh the report with current evidence and remove stale claims.",
          attachments: "[]",
          createdAt: "2026-05-11T10:00:00.000Z",
        })
        .run();
      const batch = createRoadmapBatchContract({
        projectId: "project-report-rework",
        roadmapAlias: "audit",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: ["ev-report-rework-1"],
        artifacts: [
          {
            taskId: "ev-report-rework-1",
            role: "report",
            artifactPath: "audit/report.md",
            projectRoot: rootPath,
          },
        ],
      });
      updateRoadmapBatchArtifactState({
        taskId: "ev-report-rework-1",
        state: "valid",
        failureFamily: null,
        validationDetails: { action: "approve_done" },
      });

      const res = await app.request("/tasks/ev-report-rework-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "request_changes" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
      expect(body.reworkRequested).toBe(true);
      const artifact = listRoadmapBatchArtifacts(batch.batchId)[0];
      expect(artifact.state).toBe("expected");
      expect(artifact.failureFamily).toBe("rework_needed");
      const details = JSON.parse(artifact.validationDetailsJson ?? "{}");
      expect(details.reworkBoundary).toMatchObject({
        action: "request_changes",
        previousState: "valid",
        latestHumanComment: {
          id: "ev-report-rework-comment-1",
          createdAt: "2026-05-11T10:00:00.000Z",
          messageExcerpt:
            "Please refresh the report with current evidence and remove stale claims.",
        },
      });
      expect(details.reworkBoundary.requestedAt).toBeTruthy();
    });

    it("should record manual_exception with justification for blocked audit artifacts", async () => {
      const db = testDb.current;
      db.insert(projects)
        .values({ id: "project-manual-exception", name: "Manual Exception", rootPath: "/tmp/test" })
        .run();
      db.insert(tasks)
        .values({
          id: "ev-manual-exception-1",
          projectId: "project-manual-exception",
          title: "Audit source limitation",
          description: "Report artifact: audit/source.md",
          taskIntent: "audit",
          status: "blocked_external",
          blockedReason: "invalid_artifact_content: repeated weak evidence",
          manualReviewRequired: true,
        })
        .run();
      const batch = createRoadmapBatchContract({
        projectId: "project-manual-exception",
        roadmapAlias: "audit",
        taskIntent: "audit",
        executionPolicy: "serialized_shared_checkout",
        createdTaskIds: ["ev-manual-exception-1"],
        artifacts: [
          {
            taskId: "ev-manual-exception-1",
            role: "report",
            artifactPath: "audit/source.md",
          },
        ],
      });
      updateRoadmapBatchArtifactState({
        taskId: "ev-manual-exception-1",
        state: "invalid",
        failureFamily: "invalid_artifact_content",
        reworkStatus: "manual_review_required",
        validationDetails: { issues: ["low_quality_report_evidence"] },
      });

      const res = await app.request("/tasks/ev-manual-exception-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "manual_exception",
          manualExceptionJustification: "External evidence source is unavailable.",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.manualReviewRequired).toBe(true);
      expect(body.blockedReason).toContain("manual_exception");
      const artifact = listRoadmapBatchArtifacts(batch.batchId)[0];
      expect(artifact.state).toBe("manual_exception");
      expect(artifact.failureFamily).toBe("manual_exception");
      const details = JSON.parse(artifact.validationDetailsJson ?? "{}");
      expect(details).toMatchObject({
        action: "manual_exception",
        justification: "External evidence source is unavailable.",
        previousState: "invalid",
        previousFailureFamily: "invalid_artifact_content",
      });
      const attempts = listRoadmapBatchArtifactAttempts(artifact.id);
      expect(attempts.at(-1)).toMatchObject({
        state: "manual_exception",
        reworkStatus: "manual_exception",
        failureFamily: "manual_exception",
      });
    });

    it("should send plan_ready task back to planning on request_replanning", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-plan-replan-1",
          projectId: "test-project",
          title: "Need replanning",
          status: "plan_ready",
          autoMode: false,
        })
        .run();

      const res = await app.request("/tasks/ev-plan-replan-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "request_replanning" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("planning");
    });

    it("should reject request_replanning for container tasks", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-plan-replan-container",
          projectId: "test-project",
          title: "Container needs child replanning",
          status: "plan_ready",
          autoMode: false,
          hierarchyRole: "container",
          parentCloseoutPolicy: "all_children_verified",
        })
        .run();

      const res = await app.request("/tasks/ev-plan-replan-container/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "request_replanning" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("Container tasks");
    });

    it("should retry blocked task to blockedFromStatus", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-3",
          projectId: "test-project",
          title: "Blocked task",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "rate limit",
        })
        .run();

      const res = await app.request("/tasks/ev-3/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
      expect(body.blockedFromStatus).toBeNull();
      expect(body.blockedReason).toBeNull();
      expect(body.retryAfter).toBeNull();
    });

    it("should persist cancel_task as a paused operator-cancelled manual handoff", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-cancel-active",
          projectId: "test-project",
          title: "Cancel active task",
          status: "implementing",
          autoMode: true,
          paused: false,
        })
        .run();

      const res = await app.request("/tasks/ev-cancel-active/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "cancel_task" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("blocked_external");
      expect(body.paused).toBe(true);
      expect(body.manualReviewRequired).toBe(true);
      expect(body.blockedReason).toMatch(/^operator_cancelled:/);
      const persisted = db.select().from(tasks).where(eq(tasks.id, "ev-cancel-active")).get();
      expect(persisted?.status).toBe("blocked_external");
      expect(persisted?.paused).toBe(true);
      expect(persisted?.manualReviewRequired).toBe(true);
    });

    it("should retry operator-cancelled tasks after a newer human answer", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-operator-cancelled-answered",
          projectId: "test-project",
          title: "Operator cancelled task",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "operator_cancelled: task cancelled by operator from implementing",
          manualReviewRequired: true,
          paused: true,
          updatedAt: "2026-05-14T10:00:00.000Z",
        })
        .run();
      db.insert(taskComments)
        .values({
          id: "ev-operator-cancelled-answer",
          taskId: "ev-operator-cancelled-answered",
          author: "human",
          message: "Operator approved retry after triage.",
          attachments: "[]",
          createdAt: "2026-05-14T10:05:00.000Z",
        })
        .run();

      const res = await app.request("/tasks/ev-operator-cancelled-answered/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
      expect(body.paused).toBe(false);
      expect(body.manualReviewRequired).toBe(false);
      expect(body.blockedFromStatus).toBeNull();
      expect(body.blockedReason).toBeNull();
    });

    it("should reject retry_from_blocked for manual review required blocks", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-manual-review-retry",
          projectId: "test-project",
          title: "Manual review blocked task",
          status: "blocked_external",
          blockedFromStatus: "review",
          blockedReason: "manual_review_required: unresolved audit finding",
          manualReviewRequired: true,
        })
        .run();

      const res = await app.request("/tasks/ev-manual-review-retry/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("manual review");
      const persisted = db.select().from(tasks).where(eq(tasks.id, "ev-manual-review-retry")).get();
      expect(persisted?.status).toBe("blocked_external");
      expect(persisted?.manualReviewRequired).toBe(true);
    });

    it("should retry malformed review-output handoffs from review", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-malformed-review-output-retry",
          projectId: "test-project",
          title: "Malformed review output",
          status: "blocked_external",
          blockedFromStatus: "review",
          blockedReason:
            "manual_review_required: malformed_review_output_fallback; closure evidence gap for unresolved blockers.",
          manualReviewRequired: true,
          reviewComments: "## Blocking Findings\n- stale malformed reviewer blocker",
        })
        .run();

      const res = await app.request("/tasks/ev-malformed-review-output-retry/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("review");
      expect(body.manualReviewRequired).toBe(false);
      expect(body.blockedReason).toBeNull();
      expect(body.reviewComments).toBeNull();
      const persisted = db
        .select()
        .from(tasks)
        .where(eq(tasks.id, "ev-malformed-review-output-retry"))
        .get();
      expect(persisted?.status).toBe("review");
      expect(persisted?.manualReviewRequired).toBe(false);
      expect(persisted?.reviewComments).toBeNull();
    });

    it("should route malformed review-output retries with product blockers through rework", async () => {
      const db = testDb.current;
      const reviewComments = [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Blocking Findings",
        "- [structured-review-contract] review_gate | Structured review contract not satisfied: missing security coverage rows.",
        "- [domain-contract] code_review | Conflict with existing domain types in `src/data/offers.ts`; import `LoanOffer` from `src/types/domain.ts`.",
        "",
        "## Advisories",
        "- none",
      ].join("\n");
      db.insert(tasks)
        .values({
          id: "ev-malformed-review-product-rework",
          projectId: "test-project",
          title: "Malformed review output with product blocker",
          status: "blocked_external",
          blockedFromStatus: "review",
          blockedReason:
            "manual_review_required: malformed_review_output_fallback; closure evidence gap for unresolved blockers.",
          manualReviewRequired: true,
          reviewComments,
        })
        .run();

      const res = await app.request("/tasks/ev-malformed-review-product-rework/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
      expect(body.reworkRequested).toBe(true);
      expect(body.manualReviewRequired).toBe(false);
      expect(body.blockedReason).toBeNull();
      expect(body.reviewComments).toContain("domain-contract");
      const persisted = db
        .select()
        .from(tasks)
        .where(eq(tasks.id, "ev-malformed-review-product-rework"))
        .get();
      expect(persisted?.status).toBe("implementing");
      expect(persisted?.reworkRequested).toBe(true);
      expect(persisted?.reviewComments).toContain("domain-contract");
      expect(persisted?.agentActivityLog).toContain(
        "Retrying malformed review handoff through implementing because review comments contain non-contract blockers.",
      );
    });

    it("should clear stale malformed review rework when retrying implementer loop blocks", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-malformed-review-rework-retry",
          projectId: "test-project",
          title: "Malformed review rework loop",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason:
            "Unexpected implementer stage failure. Operator action required before retry.",
          implementationLog:
            "Stopped after a repeated run_shell tool-call loop. Partial repository changes may exist; coordinator evidence checks must decide whether rework is required.",
          manualReviewRequired: false,
          reworkRequested: true,
          reviewComments:
            "## Blocking Findings\n- [da760947c2a9] code_review | [62ad42446d2a] manual_review_required | correctness reviewer returned INCONCLUSIVE or malformed output.",
          autoReviewStateJson: JSON.stringify({
            findings: [
              {
                id: "da760947c2a9",
                source: "code_review",
                text: "[62ad42446d2a] manual_review_required | correctness reviewer returned INCONCLUSIVE or malformed output.",
              },
            ],
          }),
        })
        .run();

      const res = await app.request("/tasks/ev-malformed-review-rework-retry/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
      expect(body.reworkRequested).toBe(false);
      expect(body.reviewComments).toBeNull();
      expect(body.autoReviewState).toBeNull();
      const persisted = db
        .select()
        .from(tasks)
        .where(eq(tasks.id, "ev-malformed-review-rework-retry"))
        .get();
      expect(persisted?.status).toBe("implementing");
      expect(persisted?.reworkRequested).toBe(false);
      expect(persisted?.reviewComments).toBeNull();
      expect(persisted?.autoReviewStateJson).toBeNull();
    });

    it("should allow retry_from_blocked for exhausted plan quality guard blocks", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-plan-quality-retry",
          projectId: "test-project",
          title: "Plan quality retry task",
          status: "blocked_external",
          blockedFromStatus: "planning",
          blockedReason:
            "Plan quality guard (missing_plan_manifest): Retry limit reached (3). Operator next step: edit the task prompt or plan constraints, then retry from blocked.",
          manualReviewRequired: true,
          retryCount: 4,
        })
        .run();

      const res = await app.request("/tasks/ev-plan-quality-retry/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("planning");
      expect(body.blockedReason).toBeNull();
      expect(body.blockedFromStatus).toBeNull();
      expect(body.manualReviewRequired).toBe(false);
      expect(body.retryCount).toBe(0);
    });

    it("should allow retry_from_blocked for QA schema fallback blocks", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-qa-schema-retry",
          projectId: "test-project",
          title: "QA schema retry task",
          status: "blocked_external",
          blockedFromStatus: "qa",
          blockedReason:
            "qa_stage_blocked: QA output failed schema validation and deterministic fallback is unavailable: Expected exactly one fenced aif-qa-artifact JSON block, found 0",
          manualReviewRequired: true,
        })
        .run();

      const res = await app.request("/tasks/ev-qa-schema-retry/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("qa");
      expect(body.blockedReason).toBeNull();
      expect(body.blockedFromStatus).toBeNull();
      expect(body.manualReviewRequired).toBe(false);
    });

    it("should reject operator input retry when the only human comment is stale", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-operator-input-stale",
          projectId: "test-project",
          title: "Needs operator answer",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "operator_input_required: provide missing source credentials",
          paused: true,
          updatedAt: "2026-05-14T10:00:00.000Z",
        })
        .run();
      db.insert(taskComments)
        .values({
          id: "ev-operator-input-stale-comment",
          taskId: "ev-operator-input-stale",
          author: "human",
          message: "Previous unrelated note",
          attachments: "[]",
          createdAt: "2026-05-14T09:00:00.000Z",
        })
        .run();

      const res = await app.request("/tasks/ev-operator-input-stale/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(409);
      const persisted = db
        .select()
        .from(tasks)
        .where(eq(tasks.id, "ev-operator-input-stale"))
        .get();
      expect(persisted?.status).toBe("blocked_external");
      expect(persisted?.paused).toBe(true);
      expect(persisted?.blockedReason).toContain("operator_input_required");
    });

    it("should clear paused and retry operator input holds after a newer human answer", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-operator-input-answered",
          projectId: "test-project",
          title: "Needs operator answer",
          status: "blocked_external",
          blockedFromStatus: "implementing",
          blockedReason: "operator_input_required: provide missing source credentials",
          paused: true,
          updatedAt: "2026-05-14T10:00:00.000Z",
        })
        .run();
      db.insert(taskComments)
        .values({
          id: "ev-operator-input-answer",
          taskId: "ev-operator-input-answered",
          author: "human",
          message: "Use the approved read-only token from the operator vault.",
          attachments: "[]",
          createdAt: "2026-05-14T10:05:00.000Z",
        })
        .run();

      const res = await app.request("/tasks/ev-operator-input-answered/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("implementing");
      expect(body.paused).toBe(false);
      expect(body.blockedFromStatus).toBeNull();
      expect(body.blockedReason).toBeNull();
      expect(body.retryAfter).toBeNull();
    });

    it("should reject retry_from_blocked without blockedFromStatus", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-4",
          projectId: "test-project",
          title: "Blocked task",
          status: "blocked_external",
        })
        .run();

      const res = await app.request("/tasks/ev-4/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "retry_from_blocked" }),
      });

      expect(res.status).toBe(409);
    });

    it("should apply fast_fix by updating plan without status transition", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-fast-fix-1",
          projectId: "project-fast-fix",
          title: "Need tiny plan update",
          status: "plan_ready",
          autoMode: false,
          plan: "## Plan\n- Step A",
        })
        .run();
      db.insert(taskComments)
        .values({
          id: "ev-fast-fix-comment-1",
          taskId: "ev-fast-fix-1",
          author: "human",
          message: "Please add one QA step",
          attachments: "[]",
        })
        .run();
      const ffRootPath = mkdtempSync(join(tmpdir(), "aif-fast-fix-"));
      mkdirSync(join(ffRootPath, ".ai-factory"), { recursive: true });
      db.insert(projects)
        .values({
          id: "project-fast-fix",
          name: "Fast fix project",
          rootPath: ffRootPath,
        })
        .run();

      const res = await app.request("/tasks/ev-fast-fix-1/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "fast_fix" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("plan_ready");
      expect(body.plan).toBe("## Updated plan\n- Fast fix applied");
      expect(mockRunApiRuntimeOneShot).toHaveBeenCalledTimes(1);
    });

    it("should reject fast_fix when task has no plan", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-fast-fix-no-plan",
          projectId: "project-fast-fix",
          title: "No plan task",
          status: "plan_ready",
          autoMode: false,
          plan: null,
        })
        .run();
      db.insert(taskComments)
        .values({
          id: "ev-ff-no-plan-comment",
          taskId: "ev-fast-fix-no-plan",
          author: "human",
          message: "fix it",
          attachments: "[]",
        })
        .run();
      const noPlanRootPath = mkdtempSync(join(tmpdir(), "aif-fast-fix-no-plan-"));
      mkdirSync(join(noPlanRootPath, ".ai-factory"), { recursive: true });
      db.insert(projects)
        .values({ id: "project-fast-fix", name: "FF project", rootPath: noPlanRootPath })
        .onConflictDoNothing()
        .run();

      const res = await app.request("/tasks/ev-fast-fix-no-plan/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "fast_fix" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/existing plan/);
    });

    it("should reject fast_fix when task has no human comment", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-fast-fix-no-comment",
          projectId: "test-project",
          title: "No comment task",
          status: "plan_ready",
          autoMode: false,
          plan: "## Plan\n- Step",
        })
        .run();

      const res = await app.request("/tasks/ev-fast-fix-no-comment/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "fast_fix" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/human comment/);
    });

    it("should reject fast_fix when task is not in plan_ready", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-fast-fix-wrong-status",
          projectId: "test-project",
          title: "Wrong status",
          status: "backlog",
          autoMode: false,
          plan: "## Plan",
        })
        .run();

      const res = await app.request("/tasks/ev-fast-fix-wrong-status/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "fast_fix" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/plan_ready/);
    });

    it("should reject fast_fix for autoMode=true", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "ev-fast-fix-2",
          projectId: "test-project",
          title: "Auto mode task",
          status: "plan_ready",
          autoMode: true,
        })
        .run();

      const res = await app.request("/tasks/ev-fast-fix-2/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "fast_fix" }),
      });

      expect(res.status).toBe(409);
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /tasks/:id/position", () => {
    it("should reorder a task", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "pos-1", projectId: "test-project", title: "Reorder me", position: 1000 })
        .run();

      const res = await app.request("/tasks/pos-1/position", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: 1500.5 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.position).toBe(1500.5);
    });

    it("should return 404 for reorder on non-existent task", async () => {
      const res = await app.request("/tasks/pos-missing/position", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: 1234 }),
      });

      expect(res.status).toBe(404);
    });

    it("does not bump updatedAt — reorder is metadata, not content", async () => {
      const db = testDb.current;
      const frozen = "2026-01-01T00:00:00.000Z";
      db.insert(tasks)
        .values({
          id: "pos-keep-ts",
          projectId: "test-project",
          title: "Keep updatedAt",
          position: 2000,
          createdAt: frozen,
          updatedAt: frozen,
        })
        .run();

      const res = await app.request("/tasks/pos-keep-ts/position", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: 1500 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.position).toBe(1500);
      // updatedAt must remain unchanged — list views sorted by "updated" stay stable
      expect(body.updatedAt).toBe(frozen);
    });
  });

  describe("comments", () => {
    it("should return 404 for listing comments on non-existent task", async () => {
      const res = await app.request("/tasks/nope/comments");
      expect(res.status).toBe(404);
    });

    it("should return 404 for creating comments on non-existent task", async () => {
      const res = await app.request("/tasks/nope/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "comment" }),
      });

      expect(res.status).toBe(404);
    });

    it("should create and list task comments with attachments", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({ id: "c-1", projectId: "test-project", title: "Comment target" })
        .run();

      const createRes = await app.request("/tasks/c-1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Please update the API section in the plan",
          attachments: [
            {
              name: "notes.md",
              mimeType: "text/markdown",
              size: 20,
              content: "Use OpenAPI-first approach",
            },
          ],
        }),
      });

      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.message).toBe("Please update the API section in the plan");
      expect(created.attachments).toHaveLength(1);
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: "task:comment_created",
        payload: { id: created.id, taskId: "c-1", projectId: "test-project" },
      });

      const listRes = await app.request("/tasks/c-1/comments");
      expect(listRes.status).toBe(200);
      const listed = await listRes.json();
      expect(listed).toHaveLength(1);
      expect(listed[0].attachments[0].name).toBe("notes.md");
    });

    it("should reject path-backed comment attachments without creating a comment", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({ id: "c-path-reject", projectId: "test-project", title: "Comment target" })
        .run();

      const createRes = await app.request("/tasks/c-path-reject/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Please review this file",
          attachments: [
            {
              name: "notes.md",
              mimeType: "text/markdown",
              size: 5,
              content: null,
              path: ".ai-factory/files/tasks/c-path-reject/comments/other/notes.md",
            },
          ],
        }),
      });

      expect(createRes.status).toBe(400);
      const comments = db
        .select()
        .from(taskComments)
        .where(eq(taskComments.taskId, "c-path-reject"))
        .all();
      expect(comments).toHaveLength(0);
    });

    it("should delete task comments when deleting a task", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "c-2", projectId: "test-project", title: "Delete cascade" })
        .run();
      db.insert(taskComments)
        .values({
          id: "comment-1",
          taskId: "c-2",
          author: "human",
          message: "comment",
          attachments: "[]",
        })
        .run();

      const delRes = await app.request("/tasks/c-2", { method: "DELETE" });
      expect(delRes.status).toBe(200);

      const comments = db.select().from(taskComments).where(eq(taskComments.taskId, "c-2")).all();
      expect(comments).toHaveLength(0);
    });
  });

  describe("GET /tasks/:id/attachments/:filename", () => {
    it("should return 404 for non-existent task", async () => {
      const res = await app.request("/tasks/no-task/attachments/file.txt");
      expect(res.status).toBe(404);
    });

    it("should return 404 when attachment not found on task", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "dl-1",
          projectId: "test-project",
          title: "Download test",
          attachments: JSON.stringify([
            {
              name: "readme.md",
              mimeType: "text/markdown",
              size: 10,
              content: null,
              path: ".ai-factory/files/tasks/dl-1/readme.md",
            },
          ]),
        })
        .run();

      const res = await app.request("/tasks/dl-1/attachments/missing.txt");
      expect(res.status).toBe(404);
    });

    it("should download file-backed attachment", async () => {
      const db = testDb.current;
      insertTestProject(db);
      const fileContent = Buffer.from("# Hello World");
      db.insert(tasks)
        .values({
          id: "dl-2",
          projectId: "test-project",
          title: "Download test",
          attachments: JSON.stringify([
            {
              name: "readme.md",
              mimeType: "text/markdown",
              size: fileContent.length,
              content: null,
              path: ".ai-factory/files/tasks/dl-2/readme.md",
            },
          ]),
        })
        .run();

      mockReadAttachment.mockResolvedValue(fileContent);

      const res = await app.request("/tasks/dl-2/attachments/readme.md");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/markdown");
      expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="readme.md"');
      const body = await res.arrayBuffer();
      expect(Buffer.from(body).toString()).toBe("# Hello World");
    });

    it("should return 404 when file missing from disk", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks)
        .values({
          id: "dl-3",
          projectId: "test-project",
          title: "Download test",
          attachments: JSON.stringify([
            {
              name: "gone.txt",
              mimeType: "text/plain",
              size: 5,
              content: null,
              path: ".ai-factory/files/tasks/dl-3/gone.txt",
            },
          ]),
        })
        .run();

      mockReadAttachment.mockRejectedValue(new Error("ENOENT"));

      const res = await app.request("/tasks/dl-3/attachments/gone.txt");
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /tasks/:id — plan update error path", () => {
    it("should return 404 when plan update fails due to missing project", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({
          id: "upd-plan-no-proj",
          projectId: "missing-project",
          title: "Plan update no project",
        })
        .run();

      const res = await app.request("/tasks/upd-plan-no-proj", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "## New plan" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/Project not found/);
    });
  });

  describe("comments — no attachments path", () => {
    it("should create comment without attachments", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "c-no-att", projectId: "test-project", title: "No attachment comment" })
        .run();

      const res = await app.request("/tasks/c-no-att/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "plain comment" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.message).toBe("plain comment");
      expect(body.attachments).toHaveLength(0);
    });

    it("should create comment with empty attachments array", async () => {
      const db = testDb.current;
      db.insert(tasks)
        .values({ id: "c-empty-att", projectId: "test-project", title: "Empty attachment comment" })
        .run();

      const res = await app.request("/tasks/c-empty-att/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "comment with empty attachments", attachments: [] }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.message).toBe("comment with empty attachments");
    });
  });

  describe("GET /tasks/:id/comments/:commentId/attachments/:filename", () => {
    it("should return 404 for non-existent comment", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks).values({ id: "cdl-1", projectId: "test-project", title: "T" }).run();

      const res = await app.request("/tasks/cdl-1/comments/no-comment/attachments/file.txt");
      expect(res.status).toBe(404);
    });

    it("should download comment attachment", async () => {
      const db = testDb.current;
      insertTestProject(db);
      db.insert(tasks).values({ id: "cdl-2", projectId: "test-project", title: "T" }).run();
      const fileContent = Buffer.from("comment file data");
      db.insert(taskComments)
        .values({
          id: "cm-1",
          taskId: "cdl-2",
          author: "human",
          message: "see attached",
          attachments: JSON.stringify([
            {
              name: "notes.md",
              mimeType: "text/markdown",
              size: fileContent.length,
              content: null,
              path: ".ai-factory/files/tasks/cdl-2/comments/cm-1/notes.md",
            },
          ]),
        })
        .run();

      mockReadAttachment.mockResolvedValue(fileContent);

      const res = await app.request("/tasks/cdl-2/comments/cm-1/attachments/notes.md");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/markdown");
      expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="notes.md"');
      const body = await res.arrayBuffer();
      expect(Buffer.from(body).toString()).toBe("comment file data");
    });
  });

  describe("GET /settings", () => {
    it("should return useSubagents from env", async () => {
      const settingsApp = createAppWithSettings();
      const res = await settingsApp.request("/settings");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.useSubagents).toBe("boolean");
      expect(typeof body.warmupEnabled).toBe("boolean");
      expect(["full_re_review", "closure_first"]).toContain(body.autoReviewStrategy);
    });
  });
});
