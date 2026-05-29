import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeAuditReportContentSha256,
  evaluateTaskCompletionEvidence,
  tasks,
  projects,
} from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };
const originalFetch = global.fetch;

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("@aif/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared")>();
  return { ...actual, getEnv: vi.fn() };
});

const { getEnv } = await import("@aif/shared");
const mockedGetEnv = vi.mocked(getEnv);

const {
  logActivity,
  flushActivityQueue,
  flushAllActivityQueues,
  disposeActivityQueue,
  sanitizeForActivityLog,
  createAuditEvidenceLogger,
} = await import("../hooks.js");
const { listAuditEvidenceEvents } = await import("@aif/data");

const PROJECT_ID = "test-project";
const TASK_ID = "test-task-1";

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    ANTHROPIC_API_KEY: undefined,
    OPENAI_API_KEY: undefined,
    OPENAI_BASE_URL: undefined,
    CODEX_CLI_PATH: undefined,
    AIF_RUNTIME_MODULES: [],
    AIF_DEFAULT_RUNTIME_ID: "claude",
    AIF_DEFAULT_PROVIDER_ID: "anthropic",
    PORT: 3009,
    POLL_INTERVAL_MS: 30000,
    AGENT_STAGE_STALE_TIMEOUT_MS: 5400000,
    AGENT_STAGE_STALE_MAX_RETRY: 3,
    AGENT_STAGE_RUN_TIMEOUT_MS: 3600000,
    AGENT_QUERY_START_TIMEOUT_MS: 60000,
    AGENT_QUERY_START_RETRY_DELAY_MS: 1000,
    API_RUNTIME_START_TIMEOUT_MS: 60000,
    API_RUNTIME_RUN_TIMEOUT_MS: 120000,
    DATABASE_URL: "./data/aif.sqlite",
    CORS_ORIGIN: "*",
    API_BASE_URL: "http://localhost:3009",
    AGENT_QUERY_AUDIT_ENABLED: true,
    LOG_LEVEL: "debug" as const,
    ACTIVITY_LOG_MODE: "sync" as const,
    ACTIVITY_LOG_BATCH_SIZE: 20,
    ACTIVITY_LOG_BATCH_MAX_AGE_MS: 5000,
    ACTIVITY_LOG_QUEUE_LIMIT: 500,
    AGENT_WAKE_ENABLED: true,
    AGENT_BYPASS_PERMISSIONS: true,
    COORDINATOR_MAX_CONCURRENT_TASKS: 1,
    AGENT_CHAT_MAX_TURNS: 50,
    AGENT_MAX_REVIEW_ITERATIONS: 3,
    AGENT_PLAN_QUALITY_MAX_RETRIES: 3,
    AGENT_IMPLEMENTATION_EVIDENCE_MAX_REWORK: 3,
    AGENT_AUTO_REVIEW_STALL_THRESHOLD: 3,
    AGENT_AUTO_REVIEW_STRATEGY: "full_re_review" as const,
    AGENT_USE_SUBAGENTS: true,
    AGENT_FIRST_ACTIVITY_TIMEOUT_MS: 60_000,
    AIF_USAGE_LIMITS_ENABLED: false,
    AIF_ROADMAP_IMPORT_CHILDREN_PAUSED_BY_DEFAULT: true,
    AIF_RUNTIME_AUTO_FALLBACK_ENABLED: false,
    AIF_SYNTHESIS_PLAN_QUALITY_RECOVERY_ENABLED: false,
    AIF_AGENT_ACTIVITY_LOG_API_EDITS_ENABLED: false,
    AIF_AUDIT_REPEATED_FAILURE_FAIL_CLOSED: true,
    AIF_MEMORY_ENABLED: true,
    AIF_WARMUP_ENABLED: false,
    AIF_TASK_WORKTREES_ENABLED: false,
    AIF_RUNTIME_SESSION_FORK_ENABLED: false,
    AIF_REQUIREMENTS_INTAKE_ENABLED: true,
    AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED: false,
    AIF_REQUIREMENTS_QA_ENABLED: false,
    AIF_REQUIREMENTS_INTAKE_FOR_EXISTING_TASKS: false,
    AIF_REQUIREMENTS_MAX_QUESTIONS_PER_CYCLE: 7,
    AIF_REQUIREMENTS_MAX_CYCLES: 5,
    AIF_REQUIREMENTS_AUTO_RESUME_ON_ANSWER: true,
    AIF_AUTO_QUEUE_COUNT_NEEDS_INPUT_AS_ACTIVE: true,
    AIF_ENABLE_CODEX_LOGIN_PROXY: false,
    AIF_CODEX_LOGIN_BROKER_PORT: 3010,
    AGENT_INTERNAL_URL: "http://agent:3010",
    ...overrides,
  };
}

function insertTestTask() {
  testDb.current
    .insert(projects)
    .values({ id: PROJECT_ID, name: "Test", rootPath: "/tmp/test" })
    .run();
  testDb.current
    .insert(tasks)
    .values({
      id: TASK_ID,
      projectId: PROJECT_ID,
      title: "Test Task",
      status: "planning",
      position: 0,
    })
    .run();
}

function getTaskLog(taskId: string = TASK_ID): string {
  const task = testDb.current.select().from(tasks).where(eq(tasks.id, taskId)).get();
  return task?.agentActivityLog ?? "";
}

function initGitFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "aif-hooks-audit-ledger-"));
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "README.md"), "# audit fixture\nruntime audit evidence\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
    cwd: root,
    stdio: "ignore",
  });
  return root;
}

function gitSnapshot(root: string): { id: string; commit: string; tree: string } {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return { id: `git:${commit}:${tree}`, commit, tree };
}

function withAuditManifest(input: {
  body: string;
  taskId: string;
  artifactPath: string;
  evidenceId: string;
  snapshot: { id: string; commit: string; tree: string };
}): string {
  const manifest = {
    version: 1,
    auditPlanId: `task:${input.taskId}`,
    taskId: input.taskId,
    artifactPath: input.artifactPath,
    contentSha256: computeAuditReportContentSha256(input.body),
    sourceSnapshot: { ...input.snapshot, dirty: false },
    outcome: "validated_no_findings",
    scopeCoverage: [{ root: "README.md", covered: true, evidenceRefs: [input.evidenceId] }],
    riskHypotheses: [
      {
        id: "risk-readme-1",
        description: "Runtime evidence refs must be captured",
        status: "covered",
      },
    ],
    findings: [],
    noFindingsClaims: [
      { id: "nf-1", riskIds: ["risk-readme-1"], evidenceRefs: [input.evidenceId] },
    ],
    evidenceRefs: [input.evidenceId],
  };
  return `${input.body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`;
}

const RISKY_COMPLETION_ACTIVITY = [
  "[2026-05-09T00:00:00.000Z] Agent: implement-coordinator started",
  "[2026-05-09T00:00:01.000Z] Tool: read_file README.md",
  "[2026-05-09T00:00:02.000Z] Tool: write_file reports/audit.md",
  "[2026-05-09T00:00:03.000Z] Agent: implement-coordinator complete",
  "[2026-05-09T00:00:04.000Z] Agent: review-gate started",
  "[2026-05-09T00:00:05.000Z] Tool: read_file reports/audit.md",
  "[2026-05-09T00:00:06.000Z] Agent: review-gate complete",
].join("\n");

describe("hooks - activity logging", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    insertTestTask();
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
  });

  afterEach(() => {
    disposeActivityQueue(TASK_ID);
    global.fetch = originalFetch;
  });

  describe("sync mode", () => {
    beforeEach(() => {
      mockedGetEnv.mockReturnValue(makeEnv({ ACTIVITY_LOG_MODE: "sync" }));
    });

    it("writes each entry to DB immediately", () => {
      logActivity(TASK_ID, "Tool", "bash: ls");
      logActivity(TASK_ID, "Tool", "bash: pwd");

      const log = getTaskLog();
      expect(log).toContain("Tool: bash: ls");
      expect(log).toContain("Tool: bash: pwd");
      // Two lines = two entries
      expect(log.split("\n")).toHaveLength(2);
    });

    it("includes timestamp in each entry", () => {
      logActivity(TASK_ID, "Agent", "started planning");
      const log = getTaskLog();
      // Matches ISO timestamp pattern
      expect(log).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("batch mode", () => {
    beforeEach(() => {
      mockedGetEnv.mockReturnValue(
        makeEnv({
          ACTIVITY_LOG_MODE: "batch",
          ACTIVITY_LOG_BATCH_SIZE: 3,
          ACTIVITY_LOG_BATCH_MAX_AGE_MS: 60000, // high so timer doesn't fire
          ACTIVITY_LOG_QUEUE_LIMIT: 10,
        }),
      );
    });

    it("does not write to DB until batch size is reached", () => {
      logActivity(TASK_ID, "Tool", "bash: ls");
      logActivity(TASK_ID, "Tool", "bash: pwd");

      // Only 2 entries, batch size is 3 — should NOT have flushed
      const log = getTaskLog();
      expect(log).toBe("");
    });

    it("flushes when batch size is reached", () => {
      logActivity(TASK_ID, "Tool", "entry 1");
      logActivity(TASK_ID, "Tool", "entry 2");
      logActivity(TASK_ID, "Tool", "entry 3"); // triggers flush at size 3

      const log = getTaskLog();
      expect(log).toContain("entry 1");
      expect(log).toContain("entry 2");
      expect(log).toContain("entry 3");
    });

    it("manual flush writes buffered entries", () => {
      logActivity(TASK_ID, "Tool", "buffered 1");
      logActivity(TASK_ID, "Tool", "buffered 2");

      // Not flushed yet
      expect(getTaskLog()).toBe("");

      // Manual flush
      flushActivityQueue(TASK_ID);

      const log = getTaskLog();
      expect(log).toContain("buffered 1");
      expect(log).toContain("buffered 2");
    });

    it("flushAllActivityQueues flushes all tasks", () => {
      // Create a second task
      const TASK_ID_2 = "test-task-2";
      testDb.current
        .insert(tasks)
        .values({
          id: TASK_ID_2,
          projectId: PROJECT_ID,
          title: "Test Task 2",
          status: "planning",
          position: 1,
        })
        .run();

      logActivity(TASK_ID, "Tool", "task1-entry");
      logActivity(TASK_ID_2, "Tool", "task2-entry");

      // Neither flushed
      expect(getTaskLog()).toBe("");

      flushAllActivityQueues();

      expect(getTaskLog()).toContain("task1-entry");
      expect(getTaskLog(TASK_ID_2)).toContain("task2-entry");

      disposeActivityQueue(TASK_ID_2);
    });

    it("drops oldest entry when queue limit is reached", () => {
      mockedGetEnv.mockReturnValue(
        makeEnv({
          ACTIVITY_LOG_MODE: "batch",
          ACTIVITY_LOG_BATCH_SIZE: 100, // high so it won't auto-flush
          ACTIVITY_LOG_BATCH_MAX_AGE_MS: 60000,
          ACTIVITY_LOG_QUEUE_LIMIT: 3,
        }),
      );

      logActivity(TASK_ID, "Tool", "oldest");
      logActivity(TASK_ID, "Tool", "middle");
      logActivity(TASK_ID, "Tool", "newest");
      // Queue full, next push should drop "oldest"
      logActivity(TASK_ID, "Tool", "after-limit");

      flushActivityQueue(TASK_ID);

      const log = getTaskLog();
      expect(log).not.toContain("oldest");
      expect(log).toContain("middle");
      expect(log).toContain("newest");
      expect(log).toContain("after-limit");
    });

    it("disposeActivityQueue flushes and cleans up", () => {
      logActivity(TASK_ID, "Tool", "before-dispose");

      disposeActivityQueue(TASK_ID);

      const log = getTaskLog();
      expect(log).toContain("before-dispose");

      // Further flush should be a no-op (queue cleared)
      flushActivityQueue(TASK_ID);
    });
  });

  describe("audit evidence logger", () => {
    beforeEach(() => {
      mockedGetEnv.mockReturnValue(makeEnv({ ACTIVITY_LOG_MODE: "sync" }));
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
    });

    it("persists bounded redacted evidence for read tool responses", async () => {
      const logger = createAuditEvidenceLogger(TASK_ID, "/tmp/test");

      await logger(
        {
          tool_name: "Read",
          tool_input: { file_path: "src/config.ts" },
          tool_response: {
            content: "src/config.ts:1:OPENAI_API_KEY=sk-SECRETSECRETSECRETSECRET\n",
          },
        },
        "tool-use-1",
        {},
      );

      const events = listAuditEvidenceEvents({ taskId: TASK_ID });
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(
        expect.objectContaining({
          taskId: TASK_ID,
          auditPlanId: `task:${TASK_ID}`,
          evidenceKind: "file_read",
          evidenceGrade: "substantive",
          redactionStatus: "redacted",
        }),
      );
      expect(events[0]?.scopeIds).toEqual(expect.arrayContaining(["src", "src/config.ts"]));
      expect(events[0]?.outputPreview).toContain("[REDACTED]");
      expect(JSON.stringify(events[0])).not.toContain("sk-SECRETSECRETSECRETSECRET");
      expect(getTaskLog()).toContain(`AuditEvidence ${events[0]?.id}`);
      expect(getTaskLog()).not.toContain("sk-SECRETSECRETSECRETSECRET");
      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3009/tasks/test-task-1/broadcast",
        expect.objectContaining({
          body: JSON.stringify({ type: "task:evidence_recorded" }),
        }),
      );
    });

    it("allows a report manifest to cite the actual persisted runtime evidence id", async () => {
      const root = initGitFixture();
      execFileSync("git", ["checkout", "-b", "task/runtime-evidence-report"], {
        cwd: root,
        stdio: "ignore",
      });
      testDb.current
        .update(projects)
        .set({ rootPath: root })
        .where(eq(projects.id, PROJECT_ID))
        .run();
      testDb.current
        .update(tasks)
        .set({
          description:
            "Scope: README.md\nRisk hypotheses: risk-readme-1 README.md runtime audit evidence may be uncaptured.\nReport artifact: reports/audit.md",
          taskIntent: "general",
          agentActivityLog: RISKY_COMPLETION_ACTIVITY,
        })
        .where(eq(tasks.id, TASK_ID))
        .run();

      const logger = createAuditEvidenceLogger(TASK_ID, root);
      await logger(
        {
          tool_name: "Grep",
          tool_input: { pattern: "runtime audit", path: "README.md" },
          tool_response: {
            content: "README.md:2:runtime audit evidence\n",
          },
        },
        "tool-use-grep",
        {},
      );

      const events = listAuditEvidenceEvents({ taskId: TASK_ID });
      expect(events).toHaveLength(1);
      const evidenceId = events[0]?.id;
      expect(evidenceId).toMatch(/^ev_/);
      expect(events[0]?.scopeIds).toEqual(["README.md"]);
      expect(events[0]?.riskHypothesisIds).toEqual(["risk-readme-1"]);
      expect(getTaskLog()).toContain(`AuditEvidence ${evidenceId}`);

      const artifactPath = "reports/audit.md";
      const body = [
        "# Audit",
        "",
        "No validated findings.",
        "Risk hypotheses: risk-readme-1 for `README.md:2` runtime audit evidence was covered and absent.",
        "",
        "Checked files:",
        "- `README.md:2`",
        "",
        "Checked commands:",
        "- Command `Grep README.md` output: `README.md:2:runtime audit evidence`",
        "",
      ].join("\n");
      mkdirSync(join(root, "reports"), { recursive: true });
      writeFileSync(
        join(root, artifactPath),
        withAuditManifest({
          body,
          taskId: TASK_ID,
          artifactPath,
          evidenceId: evidenceId ?? "",
          snapshot: gitSnapshot(root),
        }),
        "utf8",
      );
      execFileSync("git", ["add", artifactPath], { cwd: root, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "Add audit report", "--no-verify"], {
        cwd: root,
        stdio: "ignore",
      });

      const result = evaluateTaskCompletionEvidence({
        projectRoot: root,
        auditEvidenceUnits: events,
        requireAuditLedgerEvidence: true,
        task: {
          id: TASK_ID,
          title: "Runtime evidence report",
          description: `Scope: README.md\nReport artifact: ${artifactPath}`,
          taskIntent: "general",
          agentActivityLog: RISKY_COMPLETION_ACTIVITY,
        },
      });

      expect(result.ok).toBe(true);
      expect(result.evidence.auditReportValidation.issues.map((issue) => issue.code)).not.toContain(
        "missing_audit_evidence_ref",
      );
    });
  });
});

describe("sanitizeForActivityLog", () => {
  it("returns single-line strings unchanged", () => {
    expect(sanitizeForActivityLog("git status")).toBe("git status");
  });

  it("truncates multiline strings to first line with count", () => {
    const multiline = "git commit -m \"$(cat <<'EOF'\nFix bug\n\nCo-Authored-By: ...\nEOF\n)\"";
    const result = sanitizeForActivityLog(multiline);
    expect(result).toContain("git commit -m \"$(cat <<'EOF'");
    expect(result).toMatch(/\[\+\d+ lines\]$/);
  });

  it("handles heredoc-style commands cleanly", () => {
    const heredoc = "git commit -m \"$(cat <<'EOF'\ncommit message\nEOF\n)\"";
    const result = sanitizeForActivityLog(heredoc);
    expect(result).not.toContain("\\n");
    expect(result).not.toContain("EOF\n)");
  });

  it("respects maxLen parameter", () => {
    const long = "a".repeat(300);
    expect(sanitizeForActivityLog(long, 50).length).toBeLessThanOrEqual(60);
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeForActivityLog("")).toBe("");
    expect(sanitizeForActivityLog("\n\n")).toBe("");
  });

  it("strips blank lines from line count", () => {
    const input = "line1\n\nline2\n\nline3";
    const result = sanitizeForActivityLog(input);
    expect(result).toBe("line1 [+2 lines]");
  });
});
