import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  projects,
  roadmapBatchArtifacts,
  taskComments,
  tasks,
  computeAuditReportContentSha256,
  hashAifPlanManifest,
  resolveAuditPlanId,
  evaluateTaskCompletionEvidence,
  validateImplementationManifest,
  validateAuditReportArtifact,
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

const { runImplementer } = await import("../subagents/implementer.js");
const {
  claimBacklogTaskForAdvance,
  createRoadmapBatchContract,
  findRoadmapBatchArtifactByTaskId,
  listRoadmapBatchArtifactAttempts,
  listRoadmapBatchArtifacts,
  listAuditEvidenceEvents,
  listRoadmapReportArtifactsForSynthesis,
  listValidatedRoadmapReportArtifacts,
  summarizeRoadmapBatch,
  updateRoadmapBatchArtifactState,
} = await import("@aif/data");

function trustedFindingsValidationDetails(): Record<string, unknown> {
  return {
    evidence: {
      auditReportValidation: { sourceClassification: "validated_findings_present" },
    },
  };
}

function trustedNoFindingsValidationDetails(): Record<string, unknown> {
  return {
    evidence: {
      auditReportValidation: {
        sourceClassification: "validated_no_findings",
        manifestStatus: "valid",
        manifestVersion: 1,
      },
    },
  };
}

function readAuditReportManifest(text: string): Record<string, unknown> {
  const match = text.match(/```audit-report-manifest\s*([\s\S]*?)```/);
  if (!match) throw new Error("missing audit-report-manifest block");
  return JSON.parse(match[1] ?? "{}") as Record<string, unknown>;
}

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

describe("runImplementer rework behavior", () => {
  let projectRoot: string;

  beforeEach(() => {
    (globalThis as { __AIF_CLAUDE_QUERY_MOCK__?: typeof queryMock }).__AIF_CLAUDE_QUERY_MOCK__ =
      queryMock;
    testDb.current = createTestDb();
    queryMock.mockReset();
    queryMock.mockReturnValue(streamSuccess("Implementation done"));
    projectRoot = mkdtempSync(join(tmpdir(), "aif-implementer-test-"));

    testDb.current
      .insert(projects)
      .values({
        id: "project-1",
        name: "Test",
        rootPath: projectRoot,
      })
      .run();
  });

  it("skips execution when all plan tasks are complete and rework is not requested", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-1",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [x] Task 1: Done",
        reworkRequested: false,
      })
      .run();

    await runImplementer("task-1", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
    expect(updatedTask?.implementationLog).toContain("No pending tasks detected in plan");
  });

  it("runs the runtime for diagnostic-only fallback plans instead of writing a local report", async () => {
    const db = testDb.current;
    queryMock.mockReturnValueOnce(streamSuccess("Implementation done"));
    writeFileSync(join(projectRoot, "README.md"), "# Test project\n");
    writeFileSync(join(projectRoot, "pyproject.toml"), '[project]\nname = "test"\n');
    const description =
      "Diagnostic only. Do not implement fixes. Produce a committed report at: audit/2026-05-08-initial-audit.md.";

    db.insert(tasks)
      .values({
        id: "task-diagnostic-report",
        projectId: "project-1",
        title: "Audit",
        description,
        status: "implementing",
        plan: [
          "## Diagnostic-only plan",
          "",
          "Report artifact: `audit/2026-05-08-initial-audit.md`",
          "",
          "- [ ] Keep the run diagnostic-only: do not implement fixes; do not patch code; do not modify source files; do not create child implementation tasks.",
          "- [ ] Inspect the repository evidence needed for `audit/2026-05-08-initial-audit.md` and cite exact existing file paths for every finding.",
          "- [ ] Create or update `audit/2026-05-08-initial-audit.md` with finding id, severity, evidence, risk, proposed fix, confidence, and verification command or manual check.",
        ].join("\n"),
      })
      .run();

    await runImplementer("task-diagnostic-report", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const implementCall = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(implementCall.prompt).toContain("/aif-implement @.ai-factory/PLAN.md");
    expect(implementCall.prompt).toContain("Plan path:\n@.ai-factory/PLAN.md");
    expect(implementCall.prompt).toContain(
      "For diagnostic-only audit/review/discovery/validation plans",
    );
    expect(implementCall.prompt).not.toContain("aif-implementation-manifest");
    expect(implementCall.prompt).toContain("git log -1 --name-only --oneline");
    expect(implementCall.prompt).toContain("Do not loop on `git_commit`");
    const reportPath = join(projectRoot, "audit/2026-05-08-initial-audit.md");
    expect(existsSync(reportPath)).toBe(false);

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-diagnostic-report")).get();
    expect(updatedTask?.implementationLog).toContain("Implementation done");
    expect(updatedTask?.implementationLog).not.toContain(
      "Deterministic diagnostic report generated",
    );
    expect(updatedTask?.plan).toContain("- [ ] Keep the run diagnostic-only");
  });

  it("routes imported audit report cards with non-repairable declared scope to operator input before runtime", async () => {
    const db = testDb.current;
    writeFileSync(join(projectRoot, "README.md"), "# Test project\n");

    db.insert(tasks)
      .values({
        id: "task-imported-broad-audit",
        projectId: "project-1",
        title: "Audit imported broad card",
        description: [
          "Scope: .",
          "Audit mandate: Review the imported top-level audit card.",
          "Risk hypotheses: risk-imported-1 . may contain broad findings.",
          "Allowed changes: only create/update audit/imported.md.",
          "Report artifact: audit/imported.md",
          "Constraint: diagnostic-only; do not implement fixes.",
        ].join("\n"),
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Produce imported audit report",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-imported",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-imported-broad-audit"],
      synthesisTaskId: null,
      artifacts: [
        {
          taskId: "task-imported-broad-audit",
          role: "report",
          artifactPath: "audit/imported.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-imported-broad-audit", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-imported-broad-audit"))
      .get();
    expect(updatedTask?.implementationLog).toContain(
      "non-repairable declared scope; waiting for operator input before runtime prompt construction",
    );
    expect(updatedTask?.implementationLog).toContain("Declared scope roots: none");
    expect(updatedTask?.status).toBe("blocked_external");
    expect(updatedTask?.blockedReason).toContain("operator_input_required:");
    expect(updatedTask?.manualReviewRequired).toBe(false);

    const artifact = findRoadmapBatchArtifactByTaskId("task-imported-broad-audit");
    expect(artifact?.state).toBe("source_inconclusive");
    expect(artifact?.failureFamily).toBe("source_inconclusive");
  });

  it("routes generated audit cards with no tracked scope sentinel to operator input before runtime", async () => {
    const db = testDb.current;
    writeFileSync(join(projectRoot, "README.md"), "# Untracked README\n");

    db.insert(tasks)
      .values({
        id: "task-generated-no-tracked-scope",
        projectId: "project-1",
        title: "Audit generated empty repo card",
        description: [
          "Scope: no tracked audit scope",
          "Audit mandate: Review generated fallback audit card.",
          "Risk hypotheses: risk-empty-1 no tracked audit scope has no concrete tracked evidence.",
          "Allowed changes: only create/update audit/generated-empty.md.",
          "Report artifact: audit/generated-empty.md",
          "Constraint: diagnostic-only; do not implement fixes.",
        ].join("\n"),
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Produce generated fallback audit report",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-generated",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-generated-no-tracked-scope"],
      synthesisTaskId: null,
      artifacts: [
        {
          taskId: "task-generated-no-tracked-scope",
          role: "report",
          artifactPath: "audit/generated-empty.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-generated-no-tracked-scope", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-generated-no-tracked-scope"))
      .get();
    expect(updatedTask?.implementationLog).toContain(
      "non-repairable declared scope; waiting for operator input before runtime prompt construction",
    );
    expect(updatedTask?.implementationLog).toContain("Declared scope roots: none");
    expect(updatedTask?.status).toBe("blocked_external");
    expect(updatedTask?.blockedReason).toContain("operator_input_required:");
    expect(updatedTask?.manualReviewRequired).toBe(false);

    const artifact = findRoadmapBatchArtifactByTaskId("task-generated-no-tracked-scope");
    expect(artifact?.state).toBe("source_inconclusive");
    expect(artifact?.failureFamily).toBe("source_inconclusive");
  });

  it("normalizes empty tracked audit scope files deterministically before runtime", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "tests"), { recursive: true });
    writeFileSync(join(projectRoot, "tests", "__init__.py"), "");
    execFileSync("git", ["add", "tests/__init__.py"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "seed empty scope", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(tasks)
      .values({
        id: "task-empty-file-scope-audit",
        projectId: "project-1",
        title: "Audit empty test marker",
        description: [
          "Scope: tests/__init__.py",
          "Audit mandate: Review empty test package marker.",
          "Risk hypotheses: risk-empty-marker tests/__init__.py may hide package bootstrap defects.",
          "Allowed changes: only create/update audit/empty-marker.md.",
          "Report artifact: audit/empty-marker.md",
          "Constraint: diagnostic-only; do not implement fixes.",
        ].join("\n"),
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Produce empty marker audit report",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-empty-marker",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-empty-file-scope-audit"],
      artifacts: [
        {
          taskId: "task-empty-file-scope-audit",
          role: "report",
          artifactPath: "audit/empty-marker.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-empty-file-scope-audit", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-empty-file-scope-audit"))
      .get();
    expect(updatedTask?.blockedReason).toBeNull();
    expect(updatedTask?.manualReviewRequired).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Deterministic audit report repair completed from scoped source evidence and passed strict validation",
    );

    const artifact = findRoadmapBatchArtifactByTaskId("task-empty-file-scope-audit");
    if (!artifact) throw new Error("missing empty scope artifact");
    expect(artifact.state).toBe("valid");
    const report = readFileSync(join(projectRoot, "audit", "empty-marker.md"), "utf8");
    expect(report).toContain("`tests/__init__.py`");
    expect(report).not.toContain("`tests/__init__.py:1`");
    const manifest = readAuditReportManifest(report);
    expect(manifest.scopeCoverage).toContainEqual(
      expect.objectContaining({
        root: "tests/__init__.py",
        covered: true,
      }),
    );
    const validation = validateAuditReportArtifact({
      text: report,
      projectRoot,
      taskId: "task-empty-file-scope-audit",
      roadmapBatchId: artifact.batchId,
      roadmapAlias: artifact.roadmapAlias,
      taskDescription: updatedTask?.description ?? "",
      reportArtifactPaths: ["audit/empty-marker.md"],
      auditEvidenceUnits: listAuditEvidenceEvents({
        taskId: "task-empty-file-scope-audit",
        auditPlanId: `batch:${artifact.batchId}:task:task-empty-file-scope-audit`,
      }),
      requireLedgerEvidence: true,
    });
    expect(validation.ok).toBe(true);
  });

  it("normalizes readable legacy generated audit cards deterministically before runtime", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "src", "bot_intevra"), { recursive: true });
    mkdirSync(join(projectRoot, ".ai-factory"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Test project\nRuntime handoff app.\n");
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Agents\nReview gates are documented here.\n");
    writeFileSync(join(projectRoot, "pyproject.toml"), '[project]\nname = "test"\n');
    writeFileSync(join(projectRoot, ".ai-factory", "config.yaml"), "name: test\n");
    writeFileSync(join(projectRoot, "src", "bot_intevra", "app.py"), "print('ok')\n");
    execFileSync(
      "git",
      ["add", "README.md", "AGENTS.md", "pyproject.toml", ".ai-factory/config.yaml", "src"],
      { cwd: projectRoot, stdio: "ignore" },
    );
    execFileSync("git", ["commit", "-m", "seed readable legacy scope", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(tasks)
      .values({
        id: "task-legacy-generated-audit",
        projectId: "project-1",
        title: "Audit: architecture and ownership boundaries",
        description: [
          "Scope: README.md, AGENTS.md, pyproject.toml, .ai-factory/config.yaml, src, src/bot_intevra",
          "Audit mandate: Review architecture and ownership boundaries.",
          "Risk hypotheses: risk-arch-1 scoped files may contain owner-area defects that produce actionable audit findings.",
          "Allowed changes: only create/update audit/legacy.md.",
          "Report artifact: audit/legacy.md",
          "Constraint: diagnostic-only; do not implement fixes.",
        ].join("\n"),
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Produce legacy generated audit report",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-v17",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-legacy-generated-audit"],
      synthesisTaskId: null,
      artifacts: [
        {
          taskId: "task-legacy-generated-audit",
          role: "report",
          artifactPath: "audit/legacy.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-legacy-generated-audit", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-legacy-generated-audit"))
      .get();
    expect(updatedTask?.implementationLog).toContain(
      "Deterministic audit report repair completed from scoped source evidence and passed strict validation",
    );
    expect(updatedTask?.implementationLog).not.toContain("Runtime implementer result:");
    expect(updatedTask?.blockedReason).toBeNull();
    expect(updatedTask?.manualReviewRequired).toBe(false);

    const artifact = findRoadmapBatchArtifactByTaskId("task-legacy-generated-audit");
    expect(artifact?.state).toBe("valid");
    expect(artifact?.failureFamily).toBeNull();
  });

  it("does not let retried terminal source-inconclusive legacy audit cards reach runtime", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "src", "bot_intevra"), { recursive: true });
    mkdirSync(join(projectRoot, ".ai-factory"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Test project\nRuntime handoff app.\n");
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Agents\nReview gates are documented here.\n");
    writeFileSync(join(projectRoot, "pyproject.toml"), '[project]\nname = "test"\n');
    writeFileSync(join(projectRoot, ".ai-factory", "config.yaml"), "name: test\n");
    writeFileSync(join(projectRoot, "src", "bot_intevra", "app.py"), "print('ok')\n");
    execFileSync(
      "git",
      ["add", "README.md", "AGENTS.md", "pyproject.toml", ".ai-factory/config.yaml", "src"],
      { cwd: projectRoot, stdio: "ignore" },
    );
    execFileSync("git", ["commit", "-m", "seed readable legacy retry scope", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(tasks)
      .values({
        id: "task-legacy-generated-audit-retry",
        projectId: "project-1",
        title: "Audit: architecture and ownership boundaries",
        description: [
          "Scope: README.md, AGENTS.md, pyproject.toml, .ai-factory/config.yaml, src, src/bot_intevra",
          "Audit mandate: Review architecture and ownership boundaries.",
          "Risk hypotheses: risk-arch-1 scoped files may contain owner-area defects that produce actionable audit findings.",
          "Allowed changes: only create/update audit/legacy-retry.md.",
          "Report artifact: audit/legacy-retry.md",
          "Constraint: diagnostic-only; do not implement fixes.",
        ].join("\n"),
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Produce legacy generated audit report",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-v17",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-legacy-generated-audit-retry"],
      synthesisTaskId: null,
      artifacts: [
        {
          taskId: "task-legacy-generated-audit-retry",
          role: "report",
          artifactPath: "audit/legacy-retry.md",
          projectRoot,
        },
      ],
    });

    const initialArtifact = findRoadmapBatchArtifactByTaskId("task-legacy-generated-audit-retry");
    expect(initialArtifact).toBeTruthy();
    updateRoadmapBatchArtifactState({
      taskId: "task-legacy-generated-audit-retry",
      state: "source_inconclusive",
      failureFamily: "source_inconclusive",
      classification: "source_inconclusive",
      reworkStatus: "terminal_inconclusive",
      projectRoot,
      validationDetails: {
        issues: [
          {
            code: "legacy_weak_audit_card_contract",
            message: "legacy generated audit card uses generic owner-area risk hypotheses",
          },
          {
            code: "non_repairable_declared_scope",
            message: "declared scope includes broad and hidden roots",
          },
        ],
        evidence: {
          auditReportValidation: {
            ok: false,
            issueCodes: ["legacy_weak_audit_card_contract", "non_repairable_declared_scope"],
            sourceClassification: "source_inconclusive",
            manifestStatus: "not_applicable",
          },
        },
        sourceInconclusiveTerminal: {
          artifactPath: "audit/legacy-retry.md",
          reasons: ["legacy generated audit card has already terminalized once"],
          issueCodes: ["legacy_weak_audit_card_contract", "non_repairable_declared_scope"],
        },
      },
    });

    await runImplementer("task-legacy-generated-audit-retry", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-legacy-generated-audit-retry"))
      .get();
    expect(updatedTask?.implementationLog).toContain(
      "Deterministic audit report repair completed from scoped source evidence and passed strict validation",
    );
    expect(updatedTask?.implementationLog).not.toContain(
      "non-repairable declared scope; terminalized as source_inconclusive before runtime prompt construction",
    );
    expect(updatedTask?.implementationLog).not.toContain("Runtime implementer result:");
    expect(updatedTask?.blockedReason).toBeNull();

    const artifact = findRoadmapBatchArtifactByTaskId("task-legacy-generated-audit-retry");
    expect(artifact?.state).toBe("valid");
    const attempts = listRoadmapBatchArtifactAttempts(initialArtifact!.id);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.reworkStatus).toBe("terminal_inconclusive");
    expect(attempts[1]?.reworkStatus).toBe("accepted");
  });

  it("uses the final deterministic guard instead of runtime for unmatched audit report rework", async () => {
    const db = testDb.current;
    writeFileSync(join(projectRoot, "README.md"), "# Test project\n");

    db.insert(tasks)
      .values({
        id: "task-audit-final-runtime-guard",
        projectId: "project-1",
        title: "Audit final guard",
        description: [
          "Scope: README.md",
          "Audit mandate: Review final guard behavior.",
          "Risk hypotheses: risk-final-guard-1 README.md documents the project behavior.",
          "Allowed changes: only create/update audit/final-guard.md.",
          "Report artifact: audit/final-guard.md",
          "Constraint: diagnostic-only; do not implement fixes.",
        ].join("\n"),
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report",
        reworkRequested: true,
        blockedReason: "unmatched upstream audit rework marker",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-final-runtime-guard",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-final-runtime-guard"],
      synthesisTaskId: null,
      artifacts: [
        {
          taskId: "task-audit-final-runtime-guard",
          role: "report",
          artifactPath: "audit/final-guard.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-final-runtime-guard", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-final-runtime-guard"))
      .get();
    expect(updatedTask?.status).toBe("blocked_external");
    expect(updatedTask?.manualReviewRequired).toBe(false);
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Audit report card reached the final deterministic guard",
    );
    expect(updatedTask?.implementationLog).not.toContain("Runtime implementer result:");
    expect(updatedTask?.blockedReason).toContain("operator_input_required:");

    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-final-runtime-guard");
    expect(artifact?.state).toBe("source_inconclusive");
    expect(artifact?.failureFamily).toBe("source_inconclusive");
    const attempts = listRoadmapBatchArtifactAttempts(artifact!.id);
    expect(attempts.at(-1)?.reworkStatus).toBe("terminal_inconclusive");
  });

  it("injects validated audit report artifacts into synthesis prompts", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# Project\nsynthesis evidence\n", "utf8");
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(
      join(projectRoot, "audit", "config.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` identifies project docs.",
        "Risk: Configuration drift can be missed.",
        "Proposed fix: add an owner-reviewed configuration checklist.",
        "Verification: Command `git log -1 --name-only --oneline` output included audit/config.md.",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "audit", "security.md"),
      [
        "## Finding: Invalid source should stay out of findings",
        "Evidence: `README.md:1` is not enough to validate this source.",
        "Risk: INVALID_REPORT_CONTENT_SHOULD_NOT_BE_SYNTHESIZED.",
        "Proposed fix: keep invalid reports out of validated synthesis inputs.",
        "Verification: Command `git log -1 --oneline` output: `1234567 (HEAD -> main)`.",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "README.md", "audit/config.md"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "seed synthesis source", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(tasks)
      .values({
        id: "task-synthesis-report",
        projectId: "project-1",
        title: "Audit configuration",
        description: "Report artifact: audit/config.md",
        taskIntent: "audit",
        status: "done",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-synthesis",
        projectId: "project-1",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Synthesize validated audit reports",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-synthesis-report", "task-synthesis"],
      synthesisTaskId: "task-synthesis",
      artifacts: [
        {
          taskId: "task-synthesis-report",
          role: "report",
          artifactPath: "audit/config.md",
          projectRoot,
        },
        {
          taskId: "task-synthesis",
          role: "synthesis",
          artifactPath: "audit/summary.md",
          projectRoot,
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-synthesis-report",
      state: "valid",
      failureFamily: null,
      validationDetails: trustedFindingsValidationDetails(),
    });

    await runImplementer("task-synthesis", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const synthesis = readFileSync(join(projectRoot, "audit", "summary.md"), "utf8");
    expect(synthesis).toContain("Included source findings: 1.");
    expect(synthesis).toContain("| `audit/config.md` | `task-synthesis-report` | passed |");
    expect(synthesis).not.toContain("artifact: audit/security.md");
    expect(synthesis).not.toContain("INVALID_REPORT_CONTENT_SHOULD_NOT_BE_SYNTHESIZED");
    expect(synthesis).toContain("## Child Report Status");
  });

  it("reads validated audit report artifacts from producer branches for synthesis prompts", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# Project\nproducer branch evidence\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "initial", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "audit/config-report"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(
      join(projectRoot, "audit", "config.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` identifies project docs from the producer branch.",
        "Risk: Synthesis can miss branch-only reports.",
        "Proposed fix: read validated report artifacts from producer branches.",
        "Verification: Command `git log -1 --name-only --oneline` output included audit/config.md.",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "audit/config.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "main"], { cwd: projectRoot, stdio: "ignore" });
    expect(existsSync(join(projectRoot, "audit", "config.md"))).toBe(false);

    db.insert(tasks)
      .values({
        id: "task-branch-report",
        projectId: "project-1",
        title: "Audit configuration",
        description: "Report artifact: audit/config.md",
        taskIntent: "audit",
        status: "done",
        branchName: "audit/config-report",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-branch-synthesis",
        projectId: "project-1",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Synthesize validated audit reports",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-branch-report", "task-branch-synthesis"],
      synthesisTaskId: "task-branch-synthesis",
      artifacts: [
        {
          taskId: "task-branch-report",
          role: "report",
          artifactPath: "audit/config.md",
          branchName: "audit/config-report",
          projectRoot,
        },
        {
          taskId: "task-branch-synthesis",
          role: "synthesis",
          artifactPath: "audit/summary.md",
          projectRoot,
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-branch-report",
      state: "valid",
      failureFamily: null,
      validationDetails: trustedFindingsValidationDetails(),
    });

    await runImplementer("task-branch-synthesis", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const synthesis = readFileSync(join(projectRoot, "audit", "summary.md"), "utf8");
    expect(synthesis).toContain("Included source findings: 1.");
    expect(synthesis).toContain("| `audit/config.md` | `task-branch-report` | passed |");
    expect(synthesis).toContain("## Child Report Status");
  });

  it("reports missing producer branch artifacts before synthesis", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# Project\nproducer branch evidence\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "initial", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "audit/missing-report"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "main"], { cwd: projectRoot, stdio: "ignore" });

    db.insert(tasks)
      .values({
        id: "task-missing-branch-report",
        projectId: "project-1",
        title: "Audit missing report",
        description: "Report artifact: audit/missing.md",
        taskIntent: "audit",
        status: "done",
        branchName: "audit/missing-report",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-missing-branch-synthesis",
        projectId: "project-1",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Synthesize validated audit reports",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-missing-branch-report", "task-missing-branch-synthesis"],
      synthesisTaskId: "task-missing-branch-synthesis",
      artifacts: [
        {
          taskId: "task-missing-branch-report",
          role: "report",
          artifactPath: "audit/missing.md",
          branchName: "audit/missing-report",
          projectRoot,
        },
        {
          taskId: "task-missing-branch-synthesis",
          role: "synthesis",
          artifactPath: "audit/summary.md",
          projectRoot,
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-missing-branch-report",
      state: "valid",
      failureFamily: null,
      validationDetails: trustedFindingsValidationDetails(),
    });

    let thrown: unknown;
    try {
      await runImplementer("task-missing-branch-synthesis", projectRoot);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(
      /missing_report_artifact.*audit\/missing-report.*audit\/missing\.md/,
    );
    const validationDetails = (thrown as Error & { validationDetails?: Record<string, unknown> })
      .validationDetails;
    expect(validationDetails).toMatchObject({
      code: "missing_report_artifact",
      artifactPath: "audit/missing.md",
      source: "branch",
      sourceLocation: "audit/missing-report",
      branchName: "audit/missing-report",
      worktreePath: null,
      projectRoot,
      contentSha: null,
      missingReportArtifact: {
        code: "missing_report_artifact",
        artifactPath: "audit/missing.md",
        source: "branch",
        sourceLocation: "audit/missing-report",
        branchName: "audit/missing-report",
        worktreePath: null,
        projectRoot,
        contentSha: null,
      },
    });
    expect(validationDetails?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_report_artifact",
          artifactPath: "audit/missing.md",
          source: "branch",
          branchName: "audit/missing-report",
          contentSha: null,
        }),
      ]),
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("uses deterministic audit synthesis for rework instead of looping through runtime commits", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# Project\nproducer branch evidence\n", "utf8");
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(
      join(projectRoot, "audit", "config.md"),
      [
        "## Finding: Valid source evidence",
        "Evidence: `README.md:2` identifies project docs from the report branch.",
        "Risk: Synthesis can miss validated source evidence.",
        "Proposed fix: carry source report branch content into synthesis deterministically.",
        'Verification: Command `rg -n "producer branch evidence" README.md` output included `README.md:2:producer branch evidence`.',
        "",
        "### Finding: Tool limit placeholder",
        "Evidence: `README.md` was reported as file is too large (8409 bytes > 1000 byte limit).",
        "Risk: Placeholder inspection claims can make audit synthesis look validated.",
        "Proposed fix: replace placeholder inspection with targeted line reads.",
        "Verification: Command `read_file README.md` output: `file is too large (8409 bytes > 1000 byte limit)`.",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "README.md", "audit/config.md"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "seed report", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(tasks)
      .values({
        id: "task-report-for-deterministic-synthesis",
        projectId: "project-1",
        title: "Audit configuration",
        description: "Report artifact: audit/config.md",
        taskIntent: "audit",
        status: "done",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-deterministic-synthesis",
        projectId: "project-1",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Synthesize validated audit reports",
        reworkRequested: true,
        blockedReason:
          "invalid_artifact_content: Completion evidence guard (low_quality_report_evidence)",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-report-for-deterministic-synthesis", "task-deterministic-synthesis"],
      synthesisTaskId: "task-deterministic-synthesis",
      artifacts: [
        {
          taskId: "task-report-for-deterministic-synthesis",
          role: "report",
          artifactPath: "audit/config.md",
          projectRoot,
        },
        {
          taskId: "task-deterministic-synthesis",
          role: "synthesis",
          artifactPath: "audit/summary.md",
          projectRoot,
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-report-for-deterministic-synthesis",
      state: "valid",
      failureFamily: null,
      validationDetails: trustedFindingsValidationDetails(),
    });

    await runImplementer("task-deterministic-synthesis", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const summary = readFileSync(join(projectRoot, "audit", "summary.md"), "utf8");
    expect(summary).toContain("Generated from terminal audit batch report artifacts.");
    expect(summary).toContain("Evidence: `README.md:2`");
    expect(summary).toContain("Risk: Synthesis can miss validated source evidence.");
    expect(summary).toContain("Proposed fix: carry source report branch content");
    expect(summary).toContain("Included findings: 1");
    expect(summary).toContain("Omitted findings: 1");
    expect(summary).toContain("Requirement completion");
    expect(summary).toContain("Verification strength");
    expect(summary).toContain("Weak findings");
    expect(summary).toContain("Discarded findings");
    expect(summary).toContain("Residual risks");
    expect(summary).toContain("Final decision");
    expect(summary).toContain("## Weak/discarded findings");
    expect(summary).toContain("Decision: discarded from synthesis output");
    expect(summary).toContain("file is too large");
    expect(summary).toContain("```audit-report-manifest");
    const artifact = findRoadmapBatchArtifactByTaskId("task-deterministic-synthesis");
    if (!artifact) throw new Error("missing deterministic synthesis artifact");
    const auditEvidenceUnits = listAuditEvidenceEvents({
      taskId: "task-deterministic-synthesis",
      auditPlanId: `batch:${artifact.batchId}:task:task-deterministic-synthesis`,
    });
    const validation = validateAuditReportArtifact({
      text: summary,
      projectRoot,
      taskId: "task-deterministic-synthesis",
      roadmapBatchId: artifact.batchId,
      roadmapAlias: artifact.roadmapAlias,
      taskDescription: "Report artifact: audit/summary.md",
      reportArtifactPaths: ["audit/summary.md"],
      allowedEvidenceArtifactPaths: ["audit/config.md"],
      requireProposedFix: true,
      auditEvidenceUnits,
      requireLedgerEvidence: true,
    });
    expect(validation.ok).toBe(true);
    const gitLog = execFileSync("git", ["log", "-1", "--name-only", "--oneline"], {
      cwd: projectRoot,
      encoding: "utf8",
    });
    expect(gitLog).toContain("audit/summary.md");
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-deterministic-synthesis"))
      .get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Deterministic audit synthesis rework completed",
    );
    expect(updatedTask?.agentActivityLog).toContain(
      "implement-coordinator started (deterministic audit synthesis)",
    );
    expect(updatedTask?.agentActivityLog).toContain("Tool: read_file audit/config.md");
    expect(updatedTask?.agentActivityLog).toContain("Tool: write_file audit/summary.md");
    const completionEvidence = evaluateTaskCompletionEvidence({
      task: { ...updatedTask!, manualReviewRequired: false },
      projectRoot,
      auditEvidenceUnits,
      requireAuditLedgerEvidence: true,
    });
    expect(completionEvidence.evidence.implementationToolActivityCount).toBeGreaterThan(0);
    expect(completionEvidence.issues.map((issue) => issue.code)).not.toContain(
      "missing_implementation_tool_activity",
    );
  });

  it("uses deterministic audit synthesis on first run when terminal source inputs are available", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# Test\n");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(tasks)
      .values([
        {
          id: "task-first-run-source-a",
          projectId: "project-1",
          title: "Audit source A",
          taskIntent: "audit",
          description: "Report artifact: audit/source-a.md",
          status: "done",
        },
        {
          id: "task-first-run-source-b",
          projectId: "project-1",
          title: "Audit source B",
          taskIntent: "audit",
          description: "Report artifact: audit/source-b.md",
          status: "done",
        },
        {
          id: "task-first-run-synthesis",
          projectId: "project-1",
          title: "Synthesize audit findings",
          taskIntent: "audit",
          description: "Report artifact: audit/summary.md.",
          status: "implementing",
          plan: "## Plan\n- [ ] Produce deterministic synthesis",
          reworkRequested: false,
        },
      ])
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-first-run-synthesis",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: [
        "task-first-run-source-a",
        "task-first-run-source-b",
        "task-first-run-synthesis",
      ],
      synthesisTaskId: "task-first-run-synthesis",
      artifacts: [
        { taskId: "task-first-run-source-a", role: "report", artifactPath: "audit/source-a.md" },
        { taskId: "task-first-run-source-b", role: "report", artifactPath: "audit/source-b.md" },
        { taskId: "task-first-run-synthesis", role: "synthesis", artifactPath: "audit/summary.md" },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-first-run-source-a",
      state: "source_inconclusive",
      failureFamily: "source_inconclusive",
      classification: "source_inconclusive",
      reworkStatus: "terminal_inconclusive",
      validationDetails: {
        sourceClassification: "source_inconclusive",
        issues: [
          {
            code: "missing_report_file_references",
            paths: [".ai-factory/DESCRIPTION.md", "data/bot-intevra/notes.sqlite3"],
          },
          {
            code: "irrelevant_audit_evidence",
            paths: [".ai-factory/DESCRIPTION.md"],
          },
        ],
        evidence: {
          auditReportValidation: {
            sourceClassification: "source_inconclusive",
            manifestStatus: "valid",
          },
        },
        deterministicRepair: { outcome: "source_inconclusive" },
        terminalizationReason: "inventory-only source report",
      },
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-first-run-source-b",
      state: "missing",
      failureFamily: "missing_artifact",
      reworkStatus: "terminal_inconclusive",
      validationDetails: { reason: "terminal missing report" },
    });

    await runImplementer("task-first-run-synthesis", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const synthesis = readFileSync(join(projectRoot, "audit", "summary.md"), "utf8");
    expect(synthesis).toContain("# Audit Inconclusive");
    expect(synthesis).toContain("## Child Report Status");
    expect(synthesis).toContain("## Source Report Carry Forward");
    expect(synthesis).not.toContain("## Findings By Source Report");
    expect(synthesis).toContain(
      "| `audit/source-a.md` | `task-first-run-source-a` | inconclusive |",
    );
    expect(synthesis).toContain("| `audit/source-b.md` | `task-first-run-source-b` | failed |");
    expect(synthesis).toContain(
      "Validation summary: issue codes: irrelevant_audit_evidence, missing_report_file_references",
    );
    expect(synthesis).toContain("deterministic repair outcome: source_inconclusive");
    expect(synthesis).not.toContain("Validation details:");
    expect(synthesis).not.toContain(".ai-factory/DESCRIPTION.md");
    expect(synthesis).not.toContain("data/bot-intevra/notes.sqlite3");
    const sourceADecisionRow = synthesis
      .split("\n")
      .find(
        (line) =>
          line.startsWith("| `audit/source-a.md` | `task-first-run-source-a` |") &&
          line.includes("Produce a terminal audit source report"),
      );
    expect(sourceADecisionRow).toBeDefined();
    expect(sourceADecisionRow ?? "").toContain("| `not_verifiable` |");
    expect(sourceADecisionRow ?? "").toContain("| `inaccessible` |");
    expect(sourceADecisionRow ?? "").toContain("| `audit_inconclusive` |");
    expect(sourceADecisionRow ?? "").not.toContain("rework_required");
    expect(readAuditReportManifest(synthesis).outcome).not.toBe("validated_no_findings");
    const artifact = findRoadmapBatchArtifactByTaskId("task-first-run-synthesis");
    if (!artifact) throw new Error("missing first-run synthesis artifact");
    const auditEvidenceUnits = listAuditEvidenceEvents({
      taskId: "task-first-run-synthesis",
      auditPlanId: `batch:${artifact.batchId}:task:task-first-run-synthesis`,
    });
    const validation = validateAuditReportArtifact({
      text: synthesis,
      projectRoot,
      taskId: "task-first-run-synthesis",
      roadmapBatchId: artifact.batchId,
      roadmapAlias: artifact.roadmapAlias,
      taskDescription: "Report artifact: audit/summary.md",
      reportArtifactPaths: ["audit/summary.md"],
      allowedEvidenceArtifactPaths: ["audit/source-a.md", "audit/source-b.md"],
      requireProposedFix: true,
      auditEvidenceUnits,
      requireLedgerEvidence: true,
    });
    const validationIssueCodes = validation.issues.map((issue) => issue.code);
    expect(validationIssueCodes).not.toContain("contradictory_findings_and_no_findings");
    expect(validation.missingReferencedPaths).not.toContain(".ai-factory/DESCRIPTION.md");
    expect(validation.missingReferencedPaths).not.toContain("data/bot-intevra/notes.sqlite3");
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-first-run-synthesis"))
      .get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Deterministic audit synthesis rework completed",
    );
  });

  it("writes substantive no-findings synthesis evidence when all source findings are rejected", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    mkdirSync(join(projectRoot, ".ai-factory"), { recursive: true });
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Project\nruntime evidence\n", "utf8");
    writeFileSync(
      join(projectRoot, ".ai-factory", "config.yaml"),
      "# AI Factory Configuration\n",
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "src", "config.ts"),
      "export const timeoutMs = 1000;\n",
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "audit", "runtime.md"),
      [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "",
        "Risk hypotheses: risk-runtime `src/config.ts` timeout behavior is covered with no findings.",
        "",
        "## Evidence Register",
        "",
        "| Scope | Checked evidence | Verification |",
        "| --- | --- | --- |",
        '| `.ai-factory/config.yaml` | `.ai-factory/config.yaml:1` | Command `git grep -n "AI Factory" -- .ai-factory/config.yaml` output includes `.ai-factory/config.yaml:1:# AI Factory Configuration` |',
        '| `README.md` | `README.md:2` | Command `rg -n "runtime evidence" README.md` output includes `README.md:2:runtime evidence` |',
        '| `src/config.ts` | `src/config.ts:1` | Command `rg -n "timeoutMs" src/config.ts` output includes `src/config.ts:1:export const timeoutMs = 1000;` |',
        "",
        "## Checked Files",
        "",
        "- `.ai-factory/config.yaml:1`",
        "- `README.md:2`",
        "- `src/config.ts:1`",
        "",
        "## Checked Commands",
        "",
        '- Command `git grep -n "AI Factory" -- .ai-factory/config.yaml` output:',
        "```",
        ".ai-factory/config.yaml:1:# AI Factory Configuration",
        "```",
        '- Command `rg -n "runtime evidence" README.md` output:',
        "```",
        "README.md:2:runtime evidence",
        "```",
        '- Command `rg -n "timeoutMs" src/config.ts` output:',
        "```",
        "src/config.ts:1:export const timeoutMs = 1000;",
        "```",
        "- Command `git grep -n -m 1 . -- src/config.ts` output:",
        "```",
        "src/config.ts:1:export const timeoutMs = 1000;",
        "```",
        '- Command `git grep -n -m 1 -E "contain|owner-area|defects|that|produce|actionable" -- src/config.ts` output:',
        "```",
        "src/config.ts:1:export const timeoutMs = 1000;",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync(
      "git",
      ["add", "README.md", ".ai-factory/config.yaml", "src/config.ts", "audit/runtime.md"],
      {
        cwd: projectRoot,
        stdio: "ignore",
      },
    );
    execFileSync("git", ["commit", "-m", "seed no findings report", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(tasks)
      .values({
        id: "task-report-no-findings-source",
        projectId: "project-1",
        title: "Audit runtime behavior",
        description: "Report artifact: audit/runtime.md",
        taskIntent: "audit",
        status: "done",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-no-findings-synthesis",
        projectId: "project-1",
        title: "Synthesize audit findings",
        description:
          "Scope: all audit/*-audit.md reports from this audit batch\nReport artifact: audit/summary.md\nEvidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Synthesize validated audit reports",
        reworkRequested: true,
        blockedReason:
          "Completion evidence guard (missing_substantive_evidence): Report artifact lacks substantive evidence markers.",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-no-findings",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-report-no-findings-source", "task-no-findings-synthesis"],
      synthesisTaskId: "task-no-findings-synthesis",
      artifacts: [
        {
          taskId: "task-report-no-findings-source",
          role: "report",
          artifactPath: "audit/runtime.md",
          projectRoot,
        },
        {
          taskId: "task-no-findings-synthesis",
          role: "synthesis",
          artifactPath: "audit/summary.md",
          projectRoot,
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-report-no-findings-source",
      state: "valid",
      failureFamily: null,
      validationDetails: trustedNoFindingsValidationDetails(),
    });

    await runImplementer("task-no-findings-synthesis", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const summary = readFileSync(join(projectRoot, "audit", "summary.md"), "utf8");
    expect(summary).toContain("No validated findings.");
    expect(summary).toContain("## Child Report Status");
    expect(summary).toContain("| `audit/runtime.md` | `task-report-no-findings-source` | passed |");
    expect(summary).toContain("## Checked Files");
    expect(summary).not.toContain(".ai-factory/config.yaml");
    expect(summary).toContain("`README.md:2`");
    expect(summary).toContain("`src/config.ts:1`");
    expect(summary).toContain('Command `rg -n "runtime evidence" README.md` output:');
    expect(summary).not.toContain("git grep -n -m 1 . --");
    expect(summary).not.toContain("owner-area|defects|that|produce");
    expect(summary).not.toContain("git ls-files --");
    expect(summary).toContain("Audit outcome: Validated no-findings");
    expect(summary).toContain(
      "Absence reasoning: trusted source report `audit/runtime.md` was classified as validated_no_findings with substantive child evidence",
    );
    expect(summary).not.toContain("ruled out validated source-report findings");
    expect(summary).not.toContain("Risk:");
    expect(summary).not.toContain("Proposed fix:");
    expect(summary).toContain("```audit-report-manifest");

    const artifact = findRoadmapBatchArtifactByTaskId("task-no-findings-synthesis");
    if (!artifact) throw new Error("missing no-findings synthesis artifact");
    const auditEvidenceUnits = listAuditEvidenceEvents({
      taskId: "task-no-findings-synthesis",
      auditPlanId: `batch:${artifact.batchId}:task:task-no-findings-synthesis`,
    });
    const validation = validateAuditReportArtifact({
      text: summary,
      projectRoot,
      taskId: "task-no-findings-synthesis",
      roadmapBatchId: artifact.batchId,
      roadmapAlias: artifact.roadmapAlias,
      taskDescription:
        "Scope: all audit/*-audit.md reports from this audit batch\nReport artifact: audit/summary.md\nEvidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
      reportArtifactPaths: ["audit/summary.md"],
      allowedEvidenceArtifactPaths: ["audit/runtime.md"],
      requireProposedFix: true,
      auditEvidenceUnits,
      requireLedgerEvidence: true,
    });
    expect(validation.ok).toBe(true);
    expect(validation.sourceClassification).toBe("validated_no_findings");
  });

  it("writes inconclusive synthesis when all source reports are inventory-only no-findings", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
    writeFileSync(
      join(projectRoot, "src", "config.ts"),
      "export const timeoutMs = 1000;\n",
      "utf8",
    );

    const reportTaskIds = Array.from(
      { length: 6 },
      (_, index) => `task-inventory-source-${index + 1}`,
    );
    const reportPaths = reportTaskIds.map((_, index) => `audit/source-${index + 1}.md`);
    reportPaths.forEach((reportPath) => {
      writeFileSync(
        join(projectRoot, reportPath),
        [
          "# Runtime Audit",
          "",
          "No validated findings.",
          "",
          "## Evidence Register",
          "",
          "| Scope | Checked evidence | Verification |",
          "| --- | --- | --- |",
          "| `src/config.ts` | `src/config.ts:1` | Command `git ls-files -- src/config.ts` output includes `src/config.ts` |",
          "",
          "## Checked Files",
          "",
          "- `src/config.ts:1`",
          "",
          "## Checked Commands",
          "",
          "- Command `git ls-files -- src/config.ts` output:",
          "```",
          "src/config.ts",
          "```",
          "",
        ].join("\n"),
        "utf8",
      );
    });
    execFileSync("git", ["add", "README.md", "src/config.ts", "audit"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "seed inventory-only reports", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    reportTaskIds.forEach((taskId, index) => {
      db.insert(tasks)
        .values({
          id: taskId,
          projectId: "project-1",
          title: `Audit source ${index + 1}`,
          description: `Report artifact: ${reportPaths[index]}`,
          taskIntent: "audit",
          status: "done",
        })
        .run();
    });
    db.insert(tasks)
      .values({
        id: "task-inconclusive-synthesis",
        projectId: "project-1",
        title: "Synthesize audit findings",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Synthesize validated audit reports",
        reworkRequested: true,
        blockedReason:
          "invalid_artifact_content: Completion evidence guard (low_quality_report_evidence)",
      })
      .run();

    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-inconclusive",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: [...reportTaskIds, "task-inconclusive-synthesis"],
      synthesisTaskId: "task-inconclusive-synthesis",
      artifacts: [
        ...reportTaskIds.map((taskId, index) => ({
          taskId,
          role: "report" as const,
          artifactPath: reportPaths[index],
          projectRoot,
        })),
        {
          taskId: "task-inconclusive-synthesis",
          role: "synthesis" as const,
          artifactPath: "audit/summary.md",
          projectRoot,
        },
      ],
    });
    reportTaskIds.forEach((taskId) => {
      updateRoadmapBatchArtifactState({
        taskId,
        state: "valid",
        failureFamily: null,
        validationDetails: trustedNoFindingsValidationDetails(),
      });
    });

    await runImplementer("task-inconclusive-synthesis", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const summary = readFileSync(join(projectRoot, "audit", "summary.md"), "utf8");
    expect(summary).toContain("# Audit Inconclusive");
    expect(summary).toContain('"kind":"source_inconclusive"');
    expect(summary).toContain("## Child Report Status");
    expect(summary).toContain("| `audit/source-1.md` | `task-inventory-source-1` | passed |");
    expect(summary).toContain("Inventory-only no-findings source reports: 6.");
    expect(summary).not.toContain("No validated findings.");
    expect(summary).toContain("```audit-report-manifest");
  });

  it("surfaces a loud rework header and injects the latest comment when rework is requested", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-2",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [x] Done",
        reworkRequested: true,
        useSubagents: true,
        blockedReason:
          "invalid_artifact_content: Completion evidence guard (invalid_or_missing_file_references): Report artifact contains repository path references that do not resolve under the project root: `src/1-2`, `src/bot_intevra/1-20`.",
        reviewComments: "## Blocking Findings\n- [finding-1] code_review | Fix the retry path",
        autoReviewStateJson: JSON.stringify({
          strategy: "closure_first",
          iteration: 2,
          findings: [
            {
              id: "finding-1",
              source: "code_review",
              text: "Fix the retry path",
            },
          ],
        }),
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-1",
        taskId: "task-2",
        author: "agent",
        message: "agent-msg",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-2",
        taskId: "task-2",
        author: "human",
        message: "first-human",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:01.000Z",
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-3",
        taskId: "task-2",
        author: "human",
        message: "latest-human",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:02.000Z",
      })
      .run();

    await runImplementer("task-2", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };

    // Rework header is the very first content of the coordinator prompt
    const firstLine = call.prompt.split("\n")[0] ?? "";
    expect(firstLine.startsWith("====")).toBe(true);
    expect(call.prompt).toContain("REWORK REQUEST — THIS IS THE PRIMARY TASK");
    expect(call.prompt).toContain("<<<REWORK_COMMENT");
    expect(call.prompt).toContain("\nREWORK_COMMENT\n");
    expect(call.prompt).toContain("<<<FULL_REVIEW_COMMENTS");
    expect(call.prompt).toContain("<<<REWORK_BLOCKED_REASON");
    expect(call.prompt).toContain("src/1-2");
    expect(call.prompt).toContain("src/bot_intevra/1-20");
    expect(call.prompt).toContain("## Blocking Findings");
    expect(call.prompt).toContain("<<<BLOCKING_FINDINGS_SNAPSHOT");
    expect(call.prompt).toContain("strategy: closure_first");
    expect(call.prompt).toContain("- [finding-1] code_review | Fix the retry path");
    expect(call.prompt).toContain("Rework handling protocol:");
    expect(call.prompt).toContain("MUST remove every exact bad reference token");
    expect(call.prompt).toContain("read-back check proving the bad tokens are absent");
    expect(call.prompt).toContain("blocking finding IDs from BLOCKING_FINDINGS_SNAPSHOT");

    // Coordinator lead line is still present further down the prompt
    expect(call.prompt).toContain("Implement the task using the provided plan.");
    expect(call.prompt).toContain("Plan path:\n@.ai-factory/PLAN.md");
    expect(call.prompt).toContain("Rework mode: true");
    expect(call.prompt).toContain("message: latest-human");
    expect(call.prompt).not.toContain("message: first-human");
    expect(call.prompt).not.toContain("message: agent-msg");

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-2")).get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toBe("Implementation done");
  });

  it("compacts oversized implement-coordinator rework prompts before runtime dispatch", async () => {
    const db = testDb.current;
    const longDescription = `Desc start\n${"d".repeat(90_000)}\nDesc end`;
    const longReview = `## Blocking Findings\n- [finding-large] code_review | Review start ${"r".repeat(
      100_000,
    )} Review end`;
    db.insert(tasks)
      .values({
        id: "task-large-rework",
        projectId: "project-1",
        title: "Large rework",
        description: longDescription,
        status: "implementing",
        plan: "## Plan\n- [x] Done",
        reworkRequested: true,
        useSubagents: true,
        blockedReason: `Context failure ${"b".repeat(20_000)} final instruction`,
        reviewComments: longReview,
        autoReviewStateJson: JSON.stringify({
          strategy: "closure_first",
          iteration: 3,
          findings: Array.from({ length: 30 }, (_, index) => ({
            id: `finding-${index + 1}`,
            source: "code_review",
            text: `Finding ${index + 1} ${"x".repeat(2_000)}`,
          })),
        }),
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "large-comment",
        taskId: "task-large-rework",
        author: "human",
        message: `Please repair ${"m".repeat(50_000)} final ask`,
        attachments: "[]",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      .run();

    await runImplementer("task-large-rework", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt.length).toBeLessThanOrEqual(78_000);
    expect(call.prompt).toContain("REWORK REQUEST");
    expect(call.prompt).toContain("TASK_DESCRIPTION compacted");
    expect(call.prompt).toContain("FULL_REVIEW_COMMENTS compacted");
    expect(call.prompt).toContain("REWORK_COMMENT_MESSAGE compacted");
    expect(call.prompt).toContain("additional blocking finding(s) omitted");
    expect(call.prompt).toContain("Implement the task using the provided plan.");
  });

  it("terminalizes audit evidence repair requests without declared scope before runtime", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-audit-repair",
        projectId: "project-1",
        title: "Audit security",
        description: "Report artifact: audit/security.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report evidence",
        reworkRequested: true,
        useSubagents: true,
        blockedReason:
          "invalid_artifact_content: audit_evidence_repair_required (low_quality_report_evidence): Completion evidence guard",
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-repair",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-repair"],
      artifacts: [
        {
          taskId: "task-audit-repair",
          role: "report",
          artifactPath: "audit/security.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-repair", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-audit-repair")).get();
    expect(updatedTask?.status).toBe("blocked_external");
    expect(updatedTask?.manualReviewRequired).toBe(false);
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Audit report card reached the final deterministic guard",
    );
    expect(updatedTask?.implementationLog).not.toContain("Runtime implementer result:");
    expect(updatedTask?.blockedReason).toContain("operator_input_required:");
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-repair");
    expect(artifact?.state).toBe("source_inconclusive");
    expect(artifact?.failureFamily).toBe("source_inconclusive");
  });

  it("terminalizes auto-review audit evidence repair findings without declared scope before runtime", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-audit-review-finding-repair",
        projectId: "project-1",
        title: "Audit architecture",
        description: "Report artifact: audit/architecture.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report",
        reworkRequested: true,
        useSubagents: true,
        blockedReason: null,
        reviewComments: "## Blocking Findings\n- Audit report lacks substantive scoped evidence.",
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 1,
          findings: [
            {
              id: "finding-insufficient-evidence",
              source: "review_gate",
              text: "Audit report validator blocked completion (insufficient_report_evidence): report artifact lacks substantive scoped evidence markers.",
            },
          ],
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-review-finding-repair",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-review-finding-repair"],
      artifacts: [
        {
          taskId: "task-audit-review-finding-repair",
          role: "report",
          artifactPath: "audit/architecture.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-review-finding-repair", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-review-finding-repair"))
      .get();
    expect(updatedTask?.status).toBe("blocked_external");
    expect(updatedTask?.manualReviewRequired).toBe(false);
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Audit report card reached the final deterministic guard",
    );
    expect(updatedTask?.implementationLog).not.toContain("Runtime implementer result:");
    expect(updatedTask?.blockedReason).toContain("operator_input_required:");
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-review-finding-repair");
    expect(artifact?.state).toBe("source_inconclusive");
    expect(artifact?.failureFamily).toBe("source_inconclusive");
  });

  it("rejects unsafe report artifact paths before deterministic repair can write outside the project root", async () => {
    const db = testDb.current;
    const outsideName = `${basename(projectRoot)}-outside-report.md`;
    const unsafeArtifactPath = `../${outsideName}`;
    const outsidePath = join(projectRoot, "..", outsideName);
    expect(existsSync(outsidePath)).toBe(false);

    db.insert(tasks)
      .values({
        id: "task-unsafe-report-artifact",
        projectId: "project-1",
        title: "Audit unsafe report path",
        description: "Report artifact: audit/report.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report",
        reworkRequested: true,
        useSubagents: true,
        blockedReason:
          "invalid_artifact_content: audit_evidence_repair_required (missing_report_manifest)",
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-unsafe-report-path",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-unsafe-report-artifact"],
      artifacts: [
        {
          taskId: "task-unsafe-report-artifact",
          role: "report",
          artifactPath: "audit/report.md",
          projectRoot,
        },
      ],
    });
    db.update(roadmapBatchArtifacts)
      .set({ artifactPath: unsafeArtifactPath })
      .where(eq(roadmapBatchArtifacts.taskId, "task-unsafe-report-artifact"))
      .run();

    await expect(runImplementer("task-unsafe-report-artifact", projectRoot)).rejects.toThrow(
      /unsafe roadmap artifact path/,
    );

    expect(existsSync(outsidePath)).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe synthesis artifact paths before deterministic synthesis can write outside the project root", async () => {
    const db = testDb.current;
    const outsideName = `${basename(projectRoot)}-outside-synthesis.md`;
    const unsafeArtifactPath = `../${outsideName}`;
    const outsidePath = join(projectRoot, "..", outsideName);
    expect(existsSync(outsidePath)).toBe(false);

    db.insert(tasks)
      .values({
        id: "task-unsafe-synthesis-source",
        projectId: "project-1",
        title: "Audit source for unsafe synthesis",
        description: "Report artifact: audit/source.md",
        taskIntent: "audit",
        status: "done",
        plan: "## Plan\n- [x] Audit source",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-unsafe-synthesis-artifact",
        projectId: "project-1",
        title: "Synthesize unsafe report path",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Synthesize audit reports",
        reworkRequested: true,
        useSubagents: true,
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-unsafe-synthesis-path",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-unsafe-synthesis-source", "task-unsafe-synthesis-artifact"],
      synthesisTaskId: "task-unsafe-synthesis-artifact",
      artifacts: [
        {
          taskId: "task-unsafe-synthesis-source",
          role: "report",
          artifactPath: "audit/source.md",
          projectRoot,
        },
        {
          taskId: "task-unsafe-synthesis-artifact",
          role: "synthesis",
          artifactPath: "audit/summary.md",
          projectRoot,
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-unsafe-synthesis-source",
      state: "source_inconclusive",
      failureFamily: "source_inconclusive",
      reworkStatus: "terminal_inconclusive",
      validationDetails: {
        auditReportValidation: { sourceClassification: "source_inconclusive" },
      },
    });
    db.update(roadmapBatchArtifacts)
      .set({ artifactPath: unsafeArtifactPath })
      .where(eq(roadmapBatchArtifacts.taskId, "task-unsafe-synthesis-artifact"))
      .run();

    await expect(runImplementer("task-unsafe-synthesis-artifact", projectRoot)).rejects.toThrow(
      /unsafe roadmap artifact path/,
    );

    expect(existsSync(outsidePath)).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("deterministically rewrites governance-only audit report rework", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Project\nArchitecture notes\n", "utf8");
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Agents\nOwnership boundaries\n", "utf8");
    writeFileSync(join(projectRoot, "pyproject.toml"), '[project]\nname = "test"\n', "utf8");
    writeFileSync(join(projectRoot, "src", "config.py"), "VALUE = 1\n", "utf8");
    writeFileSync(
      join(projectRoot, "audit", "architecture.md"),
      [
        "# Audit",
        "",
        "## Finding: Missing Ownership Clarity",
        "Evidence: `AGENTS.md:1-1`",
        "Risk: The project has unclear ownership.",
        "Proposed fix: Add ownership docs.",
        "Verification: Command `git log -1 --oneline` output: `1234567 (HEAD -> main)`",
      ].join("\n"),
      "utf8",
    );
    execFileSync(
      "git",
      ["add", "README.md", "AGENTS.md", "pyproject.toml", "src/config.py", "audit/architecture.md"],
      { cwd: projectRoot, stdio: "ignore" },
    );
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const description =
      "Scope: README.md, AGENTS.md, pyproject.toml, src\nReport artifact: audit/architecture.md";
    db.insert(tasks)
      .values({
        id: "task-audit-deterministic-repair",
        projectId: "project-1",
        title: "Audit architecture",
        description,
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report",
        reworkRequested: true,
        blockedReason:
          "Audit report validator blocked completion (missing_report_manifest): missing source report manifest.",
        useSubagents: true,
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 2,
          findings: [
            {
              id: "finding-governance",
              source: "review_gate",
              text: "Audit report validator blocked completion (governance_observation_as_finding): Report artifact contains governance/documentation observations instead of concrete technical-quality findings.",
            },
          ],
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-deterministic-repair",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-deterministic-repair"],
      artifacts: [
        {
          taskId: "task-audit-deterministic-repair",
          role: "report",
          artifactPath: "audit/architecture.md",
          projectRoot,
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-audit-deterministic-repair",
      state: "invalid",
      failureFamily: "invalid_artifact_contract",
      reworkStatus: "rework_requested",
      createAttemptBoundary: true,
      validationDetails: {
        auditReportValidation: { sourceClassification: "inventory_only_invalid" },
      },
    });

    await runImplementer("task-audit-deterministic-repair", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const repaired = readFileSync(join(projectRoot, "audit", "architecture.md"), "utf8");
    expect(repaired).toContain("No validated findings.");
    expect(repaired).toContain("`README.md:2`");
    expect(repaired).toContain("`AGENTS.md:2`");
    expect(repaired).toContain("`pyproject.toml:1`");
    expect(repaired).toContain("`src/config.py:1`");
    expect(repaired).not.toContain("Missing Ownership Clarity");
    expect(repaired).not.toContain("1234567");
    expect(repaired).toContain("```audit-report-manifest");
    const manifest = readAuditReportManifest(repaired);
    expect(manifest.outcome).toBe("validated_no_findings");
    expect(JSON.stringify(manifest.noFindingsClaims)).toContain("risk-readme-md-audit-coverage");
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-deterministic-repair");
    if (!artifact) throw new Error("missing deterministic repair artifact");
    expect(artifact.state).toBe("valid");
    expect(artifact.failureFamily).toBeNull();
    const attempts = listRoadmapBatchArtifactAttempts(artifact.id);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.state).toBe("invalid");
    expect(attempts[1]?.state).toBe("valid");
    expect(attempts[1]?.classification).toBe("validated_no_findings");
    expect(summarizeRoadmapBatch(artifact.batchId)?.counts.valid).toBe(1);
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-deterministic-repair"))
      .get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Deterministic audit report repair completed from scoped source evidence and passed strict validation",
    );
  }, 60_000);

  it("deterministically rewrites structurally invalid audit validator reports", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Project\nRuntime notes\n", "utf8");
    writeFileSync(join(projectRoot, "src", "alpha.ts"), "export const alpha = 1;\n", "utf8");
    writeFileSync(join(projectRoot, "src", "beta.ts"), "export const beta = 1;\n", "utf8");
    writeFileSync(join(projectRoot, "src", "gamma.ts"), "export const gamma = 1;\n", "utf8");
    writeFileSync(
      join(projectRoot, "audit", "security.md"),
      [
        "# Audit",
        "",
        "No validated findings.",
        "",
        "## Finding: Candidate",
        "Evidence: `alpha.ts:1`",
        "Risk: This was not verified.",
        "Verification: expected command output would show the issue.",
      ].join("\n"),
      "utf8",
    );
    execFileSync(
      "git",
      ["add", "README.md", "src/alpha.ts", "src/beta.ts", "src/gamma.ts", "audit/security.md"],
      { cwd: projectRoot, stdio: "ignore" },
    );
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const description = "Scope: README.md, src\nReport artifact: audit/security.md";
    db.insert(tasks)
      .values({
        id: "task-audit-repeated-validator-repair",
        projectId: "project-1",
        title: "Audit security",
        description,
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report",
        reworkRequested: true,
        useSubagents: true,
        reviewComments: [
          "## Auto Review Metadata",
          "- Strategy: full_re_review",
          "- Review Iteration: 1",
          "",
          "## Blocking Findings",
          "- none",
        ].join("\n"),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-repeated-validator-repair",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-repeated-validator-repair"],
      artifacts: [
        {
          taskId: "task-audit-repeated-validator-repair",
          role: "report",
          artifactPath: "audit/security.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-repeated-validator-repair", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const repaired = readFileSync(join(projectRoot, "audit", "security.md"), "utf8");
    expect(repaired).toContain("No validated findings.");
    expect(repaired).toContain("`README.md:2`");
    expect(repaired).toContain("`src/alpha.ts:1`");
    expect(repaired).toContain("`src/beta.ts:1`");
    expect(repaired).toContain("`src/gamma.ts:1`");
    expect(repaired).not.toContain("Candidate");
    expect(repaired).not.toContain("would show");
    expect(repaired).toContain("```audit-report-manifest");
    const manifest = readAuditReportManifest(repaired);
    expect(manifest.outcome).toBe("validated_no_findings");
    expect(JSON.stringify(manifest.noFindingsClaims)).toContain("risk-src-audit-coverage");
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-repeated-validator-repair");
    if (!artifact) throw new Error("missing repeated validator repair artifact");
    expect(artifact.state).toBe("valid");
    expect(artifact.failureFamily).toBeNull();
    expect(summarizeRoadmapBatch(artifact.batchId)?.counts.valid).toBe(1);
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-repeated-validator-repair"))
      .get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Deterministic audit report repair completed from scoped source evidence and passed strict validation",
    );
  }, 60_000);

  it("generates deterministic audit report artifacts on first run instead of model-authored manifests", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, ".ai-factory"), { recursive: true });
    mkdirSync(join(projectRoot, "src", "bot_intevra"), { recursive: true });
    mkdirSync(join(projectRoot, "docs", "ops"), { recursive: true });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(join(projectRoot, ".env.example"), "SECRET_KEY=change-me\n", "utf8");
    writeFileSync(join(projectRoot, ".ai-factory", "config.yaml"), "retryCount: 100\n", "utf8");
    writeFileSync(join(projectRoot, "src", "app.py"), "APP = 'bot'\n", "utf8");
    writeFileSync(join(projectRoot, "src", "settings.py"), "SAFE_DIRECTORY = True\n", "utf8");
    writeFileSync(join(projectRoot, "src", "worker.py"), "def run():\n    return True\n", "utf8");
    writeFileSync(
      join(projectRoot, "src", "bot_intevra", "config.py"),
      "TOKEN_ENV='BOT_TOKEN'\n",
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "src", "bot_intevra", "secret_scan.py"),
      "def scan(value):\n    return 'REDACTED' in value\n",
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "docs", "ops", "runbook.md"),
      "# Runbook\nRetry and deployment controls are documented here.\n",
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "docs", "ops", "deploy.md"),
      "# Deploy\nProduction rollout checks are documented here.\n",
      "utf8",
    );
    execFileSync("git", ["add", ".env.example", ".ai-factory/config.yaml", "src", "docs/ops"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "seed audit scope", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const description = [
      "Audit security and configuration controls.",
      "Scope: .env.example, .ai-factory/config.yaml, src/bot_intevra/config.py, src/bot_intevra/secret_scan.py, src, docs/ops",
      "Report artifact: audit/security-controls.md",
    ].join("\n");
    db.insert(tasks)
      .values({
        id: "task-audit-first-run-report",
        projectId: "project-1",
        title: "Audit security and configuration controls",
        description,
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Inspect scoped files and write the audit report.",
        reworkRequested: false,
        useSubagents: true,
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-first-run-report",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-first-run-report"],
      artifacts: [
        {
          taskId: "task-audit-first-run-report",
          role: "report",
          artifactPath: "audit/security-controls.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-first-run-report", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const reportPath = join(projectRoot, "audit", "security-controls.md");
    expect(existsSync(reportPath)).toBe(true);
    const report = readFileSync(reportPath, "utf8");
    expect(report).toContain("No validated findings.");
    expect(report).toContain("```audit-report-manifest");
    expect(report).not.toContain("<computed_sha256");
    expect(report).not.toContain("<commit_hash");
    expect(report).not.toContain("would show");
    const manifest = readAuditReportManifest(report);
    const body = report.split(/\n```audit-report-manifest\b/)[0]?.trimEnd() ?? "";
    expect(manifest.outcome).toBe("validated_no_findings");
    expect(manifest.contentSha256).toBe(computeAuditReportContentSha256(body));
    expect(manifest.sourceSnapshot).toMatchObject({
      dirty: false,
    });
    expect(JSON.stringify(manifest.scopeCoverage)).toContain("src/bot_intevra/secret_scan.py");

    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-first-run-report");
    if (!artifact) throw new Error("missing first-run report artifact");
    const auditPlanId = resolveAuditPlanId({
      taskId: "task-audit-first-run-report",
      roadmapBatchId: artifact.batchId,
    });
    const validation = validateAuditReportArtifact({
      text: report,
      projectRoot,
      taskId: "task-audit-first-run-report",
      roadmapBatchId: artifact.batchId,
      roadmapAlias: artifact.roadmapAlias,
      auditPlanId,
      taskDescription: description,
      reportArtifactPaths: ["audit/security-controls.md"],
      expectedReportArtifactPath: "audit/security-controls.md",
      requireProposedFix: true,
      auditEvidenceUnits: listAuditEvidenceEvents({
        taskId: "task-audit-first-run-report",
        auditPlanId,
      }),
      requireLedgerEvidence: true,
    });
    expect(validation.ok).toBe(true);
    expect(validation.sourceClassification).toBe("validated_no_findings");
    expect(artifact.state).toBe("valid");
    expect(artifact.failureFamily).toBeNull();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-first-run-report"))
      .get();
    expect(updatedTask?.implementationLog).toContain(
      "Deterministic audit report repair completed from scoped source evidence and passed strict validation",
    );
    expect(updatedTask?.agentActivityLog).toContain(
      "Agent: implement-coordinator started (deterministic audit report repair)",
    );
    expect(updatedTask?.agentActivityLog).toContain("Tool: git_grep scoped audit evidence");
  }, 60_000);

  it("terminalizes repeated deterministic audit report repair before runtime rework", async () => {
    const db = testDb.current;
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");

    db.insert(tasks)
      .values({
        id: "task-audit-repeated-deterministic-loop",
        projectId: "project-1",
        title: "Audit architecture",
        description: "Scope: README.md, AGENTS.md\nReport artifact: audit/architecture.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "Runtime repair required.",
        reworkRequested: true,
        useSubagents: true,
        implementationLog: [
          "Deterministic audit report repair completed from risk-specific declared scope evidence.",
          "Report artifact: audit/architecture.md",
        ].join("\n"),
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 50,
          findings: [
            {
              id: "935884566c2b",
              source: "review_gate",
              text: "Audit report validator blocked completion (speculative_audit_claim): Report artifact contains speculative audit claims that are not backed by evidence.",
            },
            {
              id: "24c7efaea330",
              source: "review_gate",
              text: "Audit report validator blocked completion (missing_scope_coverage): Report artifact does not cover declared audit scope roots. AGENTS.md needs an existing path:line citation; README.md needs an existing path:line citation.",
            },
          ],
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-repeated-deterministic-loop",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-repeated-deterministic-loop"],
      artifacts: [
        {
          taskId: "task-audit-repeated-deterministic-loop",
          role: "report",
          artifactPath: "audit/architecture.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-repeated-deterministic-loop", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-repeated-deterministic-loop");
    if (!artifact) throw new Error("missing repeated deterministic artifact");
    expect(artifact.state).toBe("source_inconclusive");
    expect(artifact.failureFamily).toBe("source_inconclusive");
    const attempts = listRoadmapBatchArtifactAttempts(artifact.id);
    expect(attempts.at(-1)).toMatchObject({
      state: "source_inconclusive",
      failureFamily: "source_inconclusive",
      reworkStatus: "terminal_inconclusive",
    });
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-repeated-deterministic-loop"))
      .get();
    expect(updatedTask?.status).toBe("blocked_external");
    expect(updatedTask?.manualReviewRequired).toBe(false);
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Repeated deterministic audit report repair did not satisfy strict validation; terminalized as source_inconclusive before runtime implementation rework.",
    );
    expect(updatedTask?.implementationLog).not.toContain("Runtime implementer result:");
    expect(updatedTask?.implementationLog).not.toContain("Implementation done");
    expect(updatedTask?.implementationLog).toContain("missing_report_file_references");
    expect(updatedTask?.blockedReason).toContain("operator_input_required:");
    expect(updatedTask?.agentActivityLog).toContain(
      "Repeated deterministic audit report repair terminalized as source_inconclusive",
    );
  });

  it("uses the activity log to detect repeated deterministic audit report repair", async () => {
    const db = testDb.current;

    db.insert(tasks)
      .values({
        id: "task-audit-repeated-deterministic-activity-log",
        projectId: "project-1",
        title: "Audit architecture",
        description: "Scope: README.md, AGENTS.md\nReport artifact: audit/architecture.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "Runtime repair required.",
        reworkRequested: true,
        useSubagents: true,
        implementationLog: "Runtime repair previously ran and overwrote the implementation log.",
        agentActivityLog:
          "[2026-05-13T11:27:10.192Z] Agent: Deterministic audit report repair complete",
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 55,
          findings: [
            {
              id: "24c7efaea330",
              source: "review_gate",
              text: "Audit report validator blocked completion (missing_scope_coverage): Report artifact does not cover declared audit scope roots.",
            },
          ],
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-repeated-deterministic-activity-log",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-repeated-deterministic-activity-log"],
      artifacts: [
        {
          taskId: "task-audit-repeated-deterministic-activity-log",
          role: "report",
          artifactPath: "audit/architecture.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-repeated-deterministic-activity-log", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-repeated-deterministic-activity-log"))
      .get();
    expect(updatedTask?.status).toBe("blocked_external");
    expect(updatedTask?.manualReviewRequired).toBe(false);
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Repeated deterministic audit report repair did not satisfy strict validation; terminalized as source_inconclusive before runtime implementation rework.",
    );
    expect(updatedTask?.implementationLog).not.toContain("Runtime implementer result:");
    expect(updatedTask?.blockedReason).toContain("operator_input_required:");
    expect(updatedTask?.agentActivityLog).toContain(
      "Repeated deterministic audit report repair terminalized as source_inconclusive",
    );
  });

  it("terminalizes repeated deterministic repair for strict low-quality validator issues", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
    writeFileSync(
      join(projectRoot, "audit", "architecture.md"),
      [
        "# Audit",
        "",
        "## Finding",
        "Evidence: `README.md:1` contains the repository overview.",
        "Risk: Placeholder author metadata can make an audit report look verified without observed command output.",
        "Proposed fix: Replace placeholder metadata with exact observed command output.",
        "Verification: Command `git log -1 --oneline -- audit/architecture.md` output:",
        "```",
        "Author: Your Name <your.email@example.com>",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "README.md", "audit/architecture.md"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    db.insert(tasks)
      .values({
        id: "task-audit-repeated-low-quality-validator",
        projectId: "project-1",
        title: "Audit architecture",
        description: "Scope: README.md\nReport artifact: audit/architecture.md",
        taskIntent: "audit",
        status: "implementing",
        plan: "Runtime repair required.",
        reworkRequested: true,
        useSubagents: true,
        implementationLog: [
          "Deterministic audit report repair completed from risk-specific declared scope evidence.",
          "Report artifact: audit/architecture.md",
        ].join("\n"),
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 50,
          findings: [
            {
              id: "deterministic_repair_placeholder_author_metadata",
              source: "review_gate",
              text: "Audit report validator blocked completion (placeholder_author_metadata): Report artifact contains placeholder author metadata instead of real git output.",
            },
          ],
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-repeated-low-quality-validator",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-repeated-low-quality-validator"],
      artifacts: [
        {
          taskId: "task-audit-repeated-low-quality-validator",
          role: "report",
          artifactPath: "audit/architecture.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-repeated-low-quality-validator", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-repeated-low-quality-validator");
    if (!artifact) throw new Error("missing repeated low-quality validator artifact");
    expect(artifact.state).toBe("source_inconclusive");
    expect(artifact.failureFamily).toBe("source_inconclusive");
    const attempts = listRoadmapBatchArtifactAttempts(artifact.id);
    expect(attempts.at(-1)).toMatchObject({
      state: "source_inconclusive",
      failureFamily: "source_inconclusive",
      reworkStatus: "terminal_inconclusive",
    });
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-repeated-low-quality-validator"))
      .get();
    expect(updatedTask?.status).toBe("blocked_external");
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.manualReviewRequired).toBe(false);
    expect(updatedTask?.implementationLog).toContain(
      "Repeated deterministic audit report repair did not satisfy strict validation; terminalized as source_inconclusive before runtime implementation rework.",
    );
    expect(updatedTask?.implementationLog).toContain("placeholder_author_metadata");
    expect(updatedTask?.implementationLog).not.toContain("Runtime implementer result:");
    expect(updatedTask?.blockedReason).toContain("operator_input_required:");
    expect(updatedTask?.agentActivityLog).toContain(
      "Repeated deterministic audit report repair terminalized as source_inconclusive",
    );
  });

  it("does not use hidden tooling files as broad deterministic repair evidence", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, ".agents", "skills"), { recursive: true });
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(join(projectRoot, ".agents", "skills", "audit.md"), "# Hidden tooling\n", "utf8");
    writeFileSync(join(projectRoot, "src", "app.ts"), "export const app = true;\n", "utf8");
    writeFileSync(
      join(projectRoot, "audit", "hidden.md"),
      [
        "# Audit",
        "",
        "No validated findings.",
        "",
        "## Finding: Candidate",
        "Evidence: `.agents/skills/audit.md:1`",
        "Risk: Hidden tooling was treated as product source.",
        "Verification: expected command output would show the issue.",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", ".agents/skills/audit.md", "src/app.ts", "audit/hidden.md"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const description = "Report artifact: audit/hidden.md";
    db.insert(tasks)
      .values({
        id: "task-audit-hidden-tooling-broad-repair",
        projectId: "project-1",
        title: "Audit hidden tooling fallback",
        description,
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report",
        reworkRequested: true,
        useSubagents: true,
        reviewComments: "## Blocking Findings\n- Missing declared source scope.",
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 2,
          findings: [
            {
              id: "finding-missing-manifest",
              source: "review_gate",
              text: "Audit report validator blocked completion (missing_report_manifest): missing source report manifest.",
            },
          ],
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-hidden-tooling-broad-repair",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-hidden-tooling-broad-repair"],
      artifacts: [
        {
          taskId: "task-audit-hidden-tooling-broad-repair",
          role: "report",
          artifactPath: "audit/hidden.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-hidden-tooling-broad-repair", projectRoot);

    const repaired = readFileSync(join(projectRoot, "audit", "hidden.md"), "utf8");
    expect(repaired).toContain("Audit source inconclusive.");
    expect(repaired).toContain("No concrete audit scope roots were parsed.");
    expect(repaired).not.toContain("`.agents/skills/audit.md:1`");
    expect(readAuditReportManifest(repaired).outcome).toBe("source_inconclusive");
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-hidden-tooling-broad-repair");
    if (!artifact) throw new Error("missing hidden tooling repair artifact");
    expect(artifact.state).toBe("source_inconclusive");
    expect(summarizeRoadmapBatch(artifact.batchId)?.counts.valid).toBe(0);
  });

  it("releases all-hidden broad audit repairs to final inconclusive synthesis", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, ".agents", "aaa"), { recursive: true });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    mkdirSync(join(projectRoot, "zsrc"), { recursive: true });
    writeFileSync(join(projectRoot, ".agents", "aaa", "policy.md"), "# Hidden policy\n", "utf8");
    writeFileSync(
      join(projectRoot, ".agents", "aaa", "workflow.md"),
      "# Hidden workflow\n",
      "utf8",
    );
    writeFileSync(join(projectRoot, "zsrc", "app.ts"), "export const app = true;\n", "utf8");

    const sourceTasks = [
      {
        id: "task-audit-hidden-source-a",
        title: "Audit hidden source A",
        reportPath: "audit/source-a.md",
        evidencePath: ".agents/aaa/policy.md",
      },
      {
        id: "task-audit-hidden-source-b",
        title: "Audit hidden source B",
        reportPath: "audit/source-b.md",
        evidencePath: ".agents/aaa/workflow.md",
      },
    ];

    for (const sourceTask of sourceTasks) {
      writeFileSync(
        join(projectRoot, sourceTask.reportPath),
        [
          "# Audit",
          "",
          "No validated findings.",
          "",
          "## Finding: Candidate",
          `Evidence: \`${sourceTask.evidencePath}:1\``,
          "Risk: Hidden tooling was treated as product source.",
          "Verification: expected command output would show the issue.",
        ].join("\n"),
        "utf8",
      );
      db.insert(tasks)
        .values({
          id: sourceTask.id,
          projectId: "project-1",
          title: sourceTask.title,
          description: [`Scope: .`, `Report artifact: ${sourceTask.reportPath}`].join("\n"),
          taskIntent: "audit",
          status: "implementing",
          plan: "## Plan\n- [ ] Repair audit report",
          reworkRequested: true,
          useSubagents: true,
          reviewComments:
            "## Blocking Findings\n- Hidden tooling evidence is not product evidence.",
          autoReviewStateJson: JSON.stringify({
            strategy: "full_re_review",
            iteration: 2,
            findings: [
              {
                id: "finding-hidden-tooling",
                source: "review_gate",
                text: "Audit report validator blocked completion (missing_report_manifest): hidden .agents evidence cannot support a trusted product audit.",
              },
            ],
          }),
        })
        .run();
    }

    db.insert(tasks)
      .values({
        id: "task-audit-hidden-synthesis",
        projectId: "project-1",
        title: "Synthesize hidden-source audit",
        description: "Report artifact: audit/summary.md",
        taskIntent: "audit",
        status: "backlog",
        paused: true,
        blockedReason: "synthesis_not_ready: waiting for validated audit batch artifacts",
      })
      .run();
    execFileSync(
      "git",
      [
        "add",
        ".agents/aaa/policy.md",
        ".agents/aaa/workflow.md",
        "zsrc/app.ts",
        "audit/source-a.md",
        "audit/source-b.md",
      ],
      { cwd: projectRoot, stdio: "ignore" },
    );
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const summary = createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-hidden-batch-canary",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: [
        "task-audit-hidden-source-a",
        "task-audit-hidden-source-b",
        "task-audit-hidden-synthesis",
      ],
      synthesisTaskId: "task-audit-hidden-synthesis",
      artifacts: [
        {
          taskId: "task-audit-hidden-source-a",
          role: "report",
          artifactPath: "audit/source-a.md",
          projectRoot,
        },
        {
          taskId: "task-audit-hidden-source-b",
          role: "report",
          artifactPath: "audit/source-b.md",
          projectRoot,
        },
        {
          taskId: "task-audit-hidden-synthesis",
          role: "synthesis",
          artifactPath: "audit/summary.md",
          projectRoot,
        },
      ],
    });

    for (const sourceTask of sourceTasks) {
      await runImplementer(sourceTask.id, projectRoot);
    }

    expect(queryMock).not.toHaveBeenCalled();
    for (const sourceTask of sourceTasks) {
      const repaired = readFileSync(join(projectRoot, sourceTask.reportPath), "utf8");
      const manifest = readAuditReportManifest(repaired);
      expect(manifest.outcome).toBe("source_inconclusive");
      expect(manifest.noFindingsClaims).toEqual([]);
      expect(repaired).toContain("Audit source inconclusive.");
      expect(repaired).not.toContain("`.agents/");

      const artifact = findRoadmapBatchArtifactByTaskId(sourceTask.id);
      if (!artifact) throw new Error(`missing artifact for ${sourceTask.id}`);
      expect(artifact.state).toBe("source_inconclusive");
      expect(artifact.failureFamily).toBe("source_inconclusive");
      const validationDetails = JSON.parse(artifact.validationDetailsJson ?? "{}") as {
        evidence?: { auditReportValidation?: { sourceClassification?: string } };
      };
      expect(validationDetails.evidence?.auditReportValidation?.sourceClassification).toBe(
        "source_inconclusive",
      );
      const attempts = listRoadmapBatchArtifactAttempts(artifact.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        state: "source_inconclusive",
        classification: "source_inconclusive",
        failureFamily: "source_inconclusive",
        reworkStatus: "terminal_inconclusive",
      });
      const attemptValidationDetails = JSON.parse(attempts[0]!.validationDetailsJson ?? "{}") as {
        evidence?: { auditReportValidation?: { sourceClassification?: string } };
      };
      expect(attemptValidationDetails.evidence?.auditReportValidation?.sourceClassification).toBe(
        "source_inconclusive",
      );
    }

    const batch = summarizeRoadmapBatch(summary.batchId);
    expect(batch?.counts.valid).toBe(0);
    expect(listValidatedRoadmapReportArtifacts(summary.batchId)).toEqual([]);
    expect(
      listRoadmapReportArtifactsForSynthesis(summary.batchId).map((artifact) => ({
        taskId: artifact.taskId,
        state: artifact.state,
      })),
    ).toEqual([
      { taskId: "task-audit-hidden-source-a", state: "source_inconclusive" },
      { taskId: "task-audit-hidden-source-b", state: "source_inconclusive" },
    ]);
    expect(batch?.synthesisReady).toBe(true);
    expect(
      db.select().from(tasks).where(eq(tasks.id, "task-audit-hidden-synthesis")).get(),
    ).toEqual(
      expect.objectContaining({
        paused: false,
        blockedReason: null,
      }),
    );
    expect(claimBacklogTaskForAdvance("task-audit-hidden-synthesis")).toBe(true);
    expect(
      listRoadmapBatchArtifacts(summary.batchId).find(
        (artifact) => artifact.taskId === "task-audit-hidden-synthesis",
      ),
    ).toEqual(expect.objectContaining({ state: "expected" }));
    db.update(tasks)
      .set({
        status: "implementing",
        reworkRequested: true,
        plan: "## Plan\n- [ ] Synthesize terminal source outcomes",
        blockedReason: "invalid_artifact_content: previous synthesis was too strong",
      })
      .where(eq(tasks.id, "task-audit-hidden-synthesis"))
      .run();

    await runImplementer("task-audit-hidden-synthesis", projectRoot);

    const synthesis = readFileSync(join(projectRoot, "audit", "summary.md"), "utf8");
    expect(synthesis).toContain("# Audit Inconclusive");
    expect(synthesis).toContain("## Child Report Status");
    expect(synthesis).toContain(
      "| `audit/source-a.md` | `task-audit-hidden-source-a` | inconclusive |",
    );
    expect(synthesis).toContain(
      "| `audit/source-b.md` | `task-audit-hidden-source-b` | inconclusive |",
    );
  });

  it("repairs explicit readable product scope to validated no-findings with scoped evidence", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(join(projectRoot, "src", "app.ts"), "export const app = true;\n", "utf8");
    writeFileSync(
      join(projectRoot, "audit", "generic.md"),
      [
        "# Audit",
        "",
        "No validated findings.",
        "",
        "## Finding: Candidate",
        "Evidence: `src/app.ts:1`",
        "Risk: This was not verified.",
        "Verification: expected command output would show the issue.",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "src/app.ts", "audit/generic.md"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const description = [
      "Scope: src",
      "Risk hypotheses:",
      "- risk-timeout: src timeout handling may deadlock under cancellation.",
      "Report artifact: audit/generic.md",
    ].join("\n");
    db.insert(tasks)
      .values({
        id: "task-audit-generic-evidence-repair",
        projectId: "project-1",
        title: "Audit generic evidence",
        description,
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report",
        reworkRequested: true,
        useSubagents: true,
        reviewComments:
          "## Blocking Findings\n- Generic source presence is not risk-specific evidence.",
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 2,
          findings: [
            {
              id: "finding-missing-manifest",
              source: "review_gate",
              text: "Audit report validator blocked completion (missing_report_manifest): missing source report manifest.",
            },
          ],
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-generic-evidence-repair",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-generic-evidence-repair"],
      artifacts: [
        {
          taskId: "task-audit-generic-evidence-repair",
          role: "report",
          artifactPath: "audit/generic.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-generic-evidence-repair", projectRoot);

    const repaired = readFileSync(join(projectRoot, "audit", "generic.md"), "utf8");
    expect(repaired).toContain("No validated findings.");
    expect(repaired).toContain("Absence reasoning: risk-timeout covered `src/app.ts:1`");
    expect(repaired).toContain("`src/app.ts:1`");
    const manifest = readAuditReportManifest(repaired);
    expect(manifest.outcome).toBe("validated_no_findings");
    expect(JSON.stringify(manifest.noFindingsClaims)).toContain("risk-timeout");
    expect(JSON.stringify(manifest.riskHypotheses)).toContain("risk-timeout");
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-generic-evidence-repair");
    if (!artifact) throw new Error("missing generic evidence repair artifact");
    expect(artifact.state).toBe("valid");
    expect(artifact.failureFamily).toBeNull();
    expect(listRoadmapBatchArtifactAttempts(artifact.id)[0]?.classification).toBe(
      "validated_no_findings",
    );
    expect(summarizeRoadmapBatch(artifact.batchId)?.counts.valid).toBe(1);
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-generic-evidence-repair"))
      .get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain("passed strict validation");
  });

  it("keeps incidental paths inside scoped command output out of repaired audit references", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, ".ai-factory"), { recursive: true });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".ai-factory", "config.yaml"),
      [
        "owner-area: runtime-audit",
        "audit_mode: strict",
        "description: .ai-factory/DESCRIPTION.md",
        "architecture: .ai-factory/ARCHITECTURE.md",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "audit", "generic.md"),
      [
        "# Audit",
        "",
        "No validated findings.",
        "",
        "## Finding: Candidate",
        "Evidence: `.ai-factory/config.yaml:1`",
        "Risk: This was not verified.",
        "Verification: expected command output would show the issue.",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", ".ai-factory/config.yaml", "audit/generic.md"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const description = [
      "Scope: .ai-factory/config.yaml",
      "Risk hypotheses:",
      "- risk-config: .ai-factory/config.yaml owner-area defects are covered.",
      "Report artifact: audit/generic.md",
    ].join("\n");
    db.insert(tasks)
      .values({
        id: "task-audit-scoped-config-repair",
        projectId: "project-1",
        title: "Audit scoped config",
        description,
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report",
        reworkRequested: true,
        useSubagents: true,
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 2,
          findings: [
            {
              id: "finding-missing-manifest",
              source: "review_gate",
              text: "Audit report validator blocked completion (missing_report_manifest): missing source report manifest.",
            },
          ],
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-scoped-config-repair",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-scoped-config-repair"],
      artifacts: [
        {
          taskId: "task-audit-scoped-config-repair",
          role: "report",
          artifactPath: "audit/generic.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-scoped-config-repair", projectRoot);

    const repaired = readFileSync(join(projectRoot, "audit", "generic.md"), "utf8");
    expect(repaired).toContain("No validated findings.");
    expect(repaired).toContain("`.ai-factory/config.yaml:1`");
    expect(repaired).not.toContain(".ai-factory/DESCRIPTION.md");
    expect(repaired).not.toContain(".ai-factory/ARCHITECTURE.md");
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-scoped-config-repair");
    if (!artifact) throw new Error("missing scoped config repair artifact");
    const auditEvidenceUnits = listAuditEvidenceEvents({
      taskId: "task-audit-scoped-config-repair",
      auditPlanId: `batch:${artifact.batchId}:task:task-audit-scoped-config-repair`,
    });
    const validation = validateAuditReportArtifact({
      text: repaired,
      projectRoot,
      taskId: "task-audit-scoped-config-repair",
      roadmapBatchId: artifact.batchId,
      roadmapAlias: artifact.roadmapAlias,
      taskDescription: description,
      reportArtifactPaths: ["audit/generic.md"],
      requireProposedFix: true,
      auditEvidenceUnits,
      requireLedgerEvidence: true,
    });
    expect(validation.ok).toBe(true);
    expect(validation.missingReferencedPaths).toEqual([]);
    expect(artifact.state).toBe("valid");
    expect(artifact.failureFamily).toBeNull();
    expect(listRoadmapBatchArtifactAttempts(artifact.id)[0]?.classification).toBe(
      "validated_no_findings",
    );
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-scoped-config-repair"))
      .get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.blockedReason).toBeNull();
    expect(updatedTask?.implementationLog).toContain("passed strict validation");
  });

  it("keeps deterministic no-findings repair trusted when evidence is risk-specific", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(
      join(projectRoot, "src", "app.ts"),
      "export function cancelTimeout(timeoutMs: number) { return timeoutMs > 0; }\n",
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "audit", "risk-specific.md"),
      [
        "# Audit",
        "",
        "## Finding: Candidate",
        "Evidence: `src/app.ts:1`",
        "Risk: This was not verified.",
        "Verification: expected command output would show the issue.",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "src/app.ts", "audit/risk-specific.md"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const description = [
      "Scope: src",
      "Risk hypotheses:",
      "- risk-timeout: src timeout cancellation handling may fail.",
      "Report artifact: audit/risk-specific.md",
    ].join("\n");
    db.insert(tasks)
      .values({
        id: "task-audit-risk-specific-repair",
        projectId: "project-1",
        title: "Audit risk-specific evidence",
        description,
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report",
        reworkRequested: true,
        blockedReason:
          "Audit report validator blocked completion (missing_report_manifest): missing source report manifest.",
        useSubagents: true,
        reviewComments: "## Blocking Findings\n- Generic candidate finding must be repaired.",
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 2,
          findings: [
            {
              id: "finding-placeholder",
              source: "review_gate",
              text: "Audit report validator blocked completion (placeholder commit hash): fake command output.",
            },
          ],
        }),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-risk-specific-repair",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-risk-specific-repair"],
      artifacts: [
        {
          taskId: "task-audit-risk-specific-repair",
          role: "report",
          artifactPath: "audit/risk-specific.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-risk-specific-repair", projectRoot);

    const repaired = readFileSync(join(projectRoot, "audit", "risk-specific.md"), "utf8");
    expect(repaired).toContain("No validated findings.");
    expect(repaired).toContain("risk-timeout");
    expect(repaired).toContain("`src/app.ts:1`");
    const manifest = readAuditReportManifest(repaired);
    expect(manifest.outcome).toBe("validated_no_findings");
    expect(JSON.stringify(manifest.noFindingsClaims)).toContain("risk-timeout");
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-risk-specific-repair");
    if (!artifact) throw new Error("missing risk-specific repair artifact");
    expect(artifact.state).toBe("valid");
    expect(artifact.failureFamily).toBeNull();
    const auditEvidenceUnits = listAuditEvidenceEvents({
      taskId: "task-audit-risk-specific-repair",
      auditPlanId: `batch:${artifact.batchId}:task:task-audit-risk-specific-repair`,
    });
    const validation = validateAuditReportArtifact({
      text: repaired,
      projectRoot,
      taskId: "task-audit-risk-specific-repair",
      roadmapBatchId: artifact.batchId,
      roadmapAlias: artifact.roadmapAlias,
      taskDescription: description,
      reportArtifactPaths: ["audit/risk-specific.md"],
      requireProposedFix: true,
      auditEvidenceUnits,
      requireLedgerEvidence: true,
    });
    expect(validation.ok).toBe(true);
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-risk-specific-repair"))
      .get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.blockedReason).toBeNull();
  });

  it("skips runtime repair when retrying an already-valid audit report after timeout", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
    writeFileSync(join(projectRoot, "src", "alpha.ts"), "export const alpha = 1;\n", "utf8");
    writeFileSync(join(projectRoot, "src", "beta.ts"), "export const beta = 1;\n", "utf8");
    writeFileSync(join(projectRoot, "src", "gamma.ts"), "export const gamma = 1;\n", "utf8");
    const validReport = [
      "# Audit security",
      "",
      "No validated findings.",
      "",
      "Risk hypotheses: risk-runtime `src/alpha.ts` runtime behavior is covered with no findings.",
      "",
      "## Evidence Register",
      "",
      "| Scope | Checked evidence | Verification |",
      "| --- | --- | --- |",
      '| `README.md` | `README.md:2` | Command `git grep -n "." -- README.md` output includes `README.md:2:runtime notes` |',
      '| `src` | `src/alpha.ts:1`, `src/beta.ts:1`, `src/gamma.ts:1` | Command `git grep -n "." -- src/alpha.ts` output includes `src/alpha.ts:1:export const alpha = 1;` |',
      "",
      "## Checked Files",
      "",
      "- `README.md:2`",
      "- `src/alpha.ts:1`",
      "- `src/beta.ts:1`",
      "- `src/gamma.ts:1`",
      "",
      "## Checked Commands",
      "",
      '- Command `git grep -n "." -- README.md` output:',
      "```",
      "README.md:2:runtime notes",
      "```",
      '- Command `git grep -n "." -- src/alpha.ts` output:',
      "```",
      "src/alpha.ts:1:export const alpha = 1;",
      "```",
      "",
    ].join("\n");
    writeFileSync(join(projectRoot, "audit", "security.md"), validReport, "utf8");
    execFileSync(
      "git",
      ["add", "README.md", "src/alpha.ts", "src/beta.ts", "src/gamma.ts", "audit/security.md"],
      { cwd: projectRoot, stdio: "ignore" },
    );
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const description = "Scope: README.md, src\nReport artifact: audit/security.md";
    const validation = validateAuditReportArtifact({
      text: validReport,
      projectRoot,
      taskDescription: description,
      reportArtifactPaths: ["audit/security.md"],
      requireProposedFix: true,
    });
    expect(validation.ok).toBe(true);

    db.insert(tasks)
      .values({
        id: "task-audit-timeout-valid-report",
        projectId: "project-1",
        title: "Audit security",
        description,
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Repair audit report",
        reworkRequested: true,
        blockedReason:
          "Audit report validator blocked completion (missing_report_file_references): retry after timeout.",
        useSubagents: true,
        autoReviewStateJson: JSON.stringify({
          findings: [{ id: "stale-review-finding", text: "stale finding from an earlier gate" }],
        }),
        reviewComments: [
          "## Auto Review Metadata",
          "- Strategy: full_re_review",
          "- Review Iteration: 2",
          "",
          "## Blocking Findings",
          "- none",
        ].join("\n"),
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-timeout-valid-report",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-timeout-valid-report"],
      artifacts: [
        {
          taskId: "task-audit-timeout-valid-report",
          role: "report",
          artifactPath: "audit/security.md",
          projectRoot,
        },
      ],
    });

    await runImplementer("task-audit-timeout-valid-report", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-timeout-valid-report"))
      .get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.blockedReason).toBeNull();
    expect(updatedTask?.implementationLog).toContain("already valid before rework");
  });

  it("terminalizes an existing source_inconclusive report instead of treating it as trusted valid", async () => {
    const db = testDb.current;
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const batch = createRoadmapBatchContract({
      projectId: "project-1",
      roadmapAlias: "audit-existing-source-inconclusive",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-existing-source-inconclusive"],
      artifacts: [
        {
          taskId: "task-audit-existing-source-inconclusive",
          role: "report",
          artifactPath: "audit/inconclusive.md",
          projectRoot,
        },
      ],
    });
    const body = [
      "Audit source inconclusive.",
      "Checked files:",
      "- `README.md:1`",
      "Checked commands:",
      '- Command `git grep -n "Project" -- README.md` output: `README.md:1:# Project`',
    ].join("\n");
    const manifest = {
      version: 1,
      auditPlanId: `batch:${batch.batchId}:task:task-audit-existing-source-inconclusive`,
      batchId: batch.batchId,
      roadmapAlias: "audit-existing-source-inconclusive",
      taskId: "task-audit-existing-source-inconclusive",
      artifactPath: "audit/inconclusive.md",
      contentSha256: "<computed_sha256>",
      sourceSnapshot: {
        id: "<source_snapshot>",
        commit: "<commit>",
        tree: "<tree>",
        dirty: false,
      },
      outcome: "source_inconclusive",
      scopeCoverage: [{ root: "README.md", covered: true, evidenceRefs: ["ev-1"] }],
      riskHypotheses: [],
      findings: [],
      noFindingsClaims: [],
      evidenceRefs: ["ev-1"],
    };
    const report = `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`;
    writeFileSync(join(projectRoot, "audit", "inconclusive.md"), report, "utf8");
    execFileSync("git", ["add", "audit/inconclusive.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add inconclusive report", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const description = "Scope: README.md\nReport artifact: audit/inconclusive.md";

    db.insert(tasks)
      .values({
        id: "task-audit-existing-source-inconclusive",
        projectId: "project-1",
        title: "Audit inconclusive",
        description,
        taskIntent: "audit",
        status: "implementing",
        plan: "## Plan\n- [ ] Retry audit report",
        reworkRequested: true,
        useSubagents: true,
        reviewComments: [
          "## Auto Review Metadata",
          "- Strategy: full_re_review",
          "- Review Iteration: 2",
          "",
          "## Blocking Findings",
          "- none",
        ].join("\n"),
      })
      .run();

    await runImplementer("task-audit-existing-source-inconclusive", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-existing-source-inconclusive"))
      .get();
    expect(updatedTask?.status).toBe("blocked_external");
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.manualReviewRequired).toBe(true);
    expect(updatedTask?.blockedReason).toContain("source_inconclusive");
    expect(updatedTask?.implementationLog).toContain(
      "manifest already declares source_inconclusive",
    );
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-existing-source-inconclusive");
    if (!artifact) throw new Error("missing existing source_inconclusive artifact");
    expect(artifact.state).toBe("source_inconclusive");
    expect(artifact.failureFamily).toBe("source_inconclusive");
    const details = JSON.parse(artifact.validationDetailsJson ?? "{}") as {
      evidence?: { auditReportValidation?: { issueCodes?: string[] } };
      sourceInconclusiveTerminal?: { artifactPath?: string };
    };
    expect(details.evidence?.auditReportValidation?.issueCodes).toEqual(
      expect.arrayContaining(["missing_report_manifest_fields"]),
    );
    expect(details.sourceInconclusiveTerminal?.artifactPath).toBe("audit/inconclusive.md");
    const attempts = listRoadmapBatchArtifactAttempts(artifact.id);
    expect(attempts[0]).toMatchObject({
      state: "source_inconclusive",
      classification: "source_inconclusive",
      reworkStatus: "terminal_inconclusive",
    });
  });

  it("does NOT resume a stored session when rework is requested", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-rework-no-resume",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [x] Done",
        reworkRequested: true,
        sessionId: "old-session-abc",
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-rework-no-resume",
        taskId: "task-rework-no-resume",
        author: "human",
        message: "please fix the login bug",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:01.000Z",
      })
      .run();

    await runImplementer("task-rework-no-resume", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as {
      prompt: string;
      options: { resume?: string };
    };
    expect(call.options.resume).toBeUndefined();
  });

  it("resumes a stored session in the standard (non-rework) implement flow", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-normal-resume",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "Plan:\n- remove old code\n- update docs",
        reworkRequested: false,
        sessionId: "session-xyz",
      })
      .run();

    await runImplementer("task-normal-resume", projectRoot);

    expect(queryMock).toHaveBeenCalled();
    const call = queryMock.mock.calls[0]?.[0] as {
      prompt: string;
      options: { resume?: string };
    };
    expect(call.options.resume).toBe("session-xyz");
  });

  it("does not skip when checkbox Task checklist has pending items", async () => {
    const db = testDb.current;
    queryMock
      .mockReturnValueOnce(streamSuccess("Implementation done"))
      .mockReturnValueOnce(
        streamSuccess("## Fix Steps\n- [x] Task 1: Pending step\n- [x] Task 2: Done step"),
      );

    db.insert(tasks)
      .values({
        id: "task-3",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Fix Steps\n- [ ] Task 1: Pending step\n- [x] Task 2: Done step",
        reworkRequested: false,
        useSubagents: true,
      })
      .run();

    await runImplementer("task-3", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(2);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    const firstLine = call.prompt.split("\n")[0] ?? "";
    expect(firstLine).toBe("Implement the task using the provided plan.");
    expect(call.prompt).toContain("Implement the task using the provided plan.");
    const syncCall = queryMock.mock.calls[1]?.[0] as { prompt: string };
    expect(syncCall.prompt).toContain("Update only checkbox states");
    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-3")).get();
    expect(updatedTask?.implementationLog).toContain("Implementation done");
    expect(updatedTask?.implementationLog).toContain("Plan checklist auto-synced");
    expect(updatedTask?.implementationLog).not.toContain("No pending tasks detected in plan");
  });

  it("does not skip when plan task format is unrecognized", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-4",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "Plan:\n- remove old code\n- update docs",
        reworkRequested: false,
        useSubagents: true,
      })
      .run();

    await runImplementer("task-4", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    const firstLine = call.prompt.split("\n")[0] ?? "";
    expect(firstLine).toBe("Implement the task using the provided plan.");
    expect(call.prompt).toContain("Implement the task using the provided plan.");
    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-4")).get();
    expect(updatedTask?.implementationLog).toBe("Implementation done");
  });

  it("does not fail when checkbox Task checklist remains pending after auto-sync", async () => {
    const db = testDb.current;
    queryMock
      .mockReturnValueOnce(streamSuccess("Implementation done"))
      .mockReturnValueOnce(streamSuccess("## Plan\n- [ ] Task 1: Still pending"));

    db.insert(tasks)
      .values({
        id: "task-5",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [ ] Task 1: Still pending",
        reworkRequested: false,
      })
      .run();

    await expect(runImplementer("task-5", projectRoot)).resolves.toBeUndefined();

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-5")).get();
    expect(updatedTask?.implementationLog).toContain("Implementation done");
    expect(updatedTask?.implementationLog).toContain(
      "Checklist remains incomplete after auto-sync",
    );
  });

  it("uses /aif-implement command format only in skill mode", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-skill-impl",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [ ] Task 1: Pending",
        reworkRequested: false,
        useSubagents: false,
      })
      .run();

    await runImplementer("task-skill-impl", projectRoot);

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("/aif-implement @.ai-factory/PLAN.md");
  });

  it("asks development intents for an implementation manifest in the result", async () => {
    const db = testDb.current;
    queryMock.mockReturnValueOnce(
      streamSuccess(
        [
          "Implementation done",
          "",
          "```aif-implementation-manifest",
          JSON.stringify({
            version: 1,
            taskId: "task-feature-manifest",
            intent: "feature",
            planManifestHash: null,
            changedFiles: [{ path: "src/feature.ts", status: "modified" }],
            diffSummary: { summary: "Updated feature behavior." },
            verificationEvidence: [
              {
                id: "verify-1",
                command: "npm.cmd test",
                status: "passed",
                outputSha256: "a".repeat(64),
                outputPreview: "tests passed",
                outputPreviewTruncated: false,
              },
            ],
            acceptanceCriteria: [
              {
                id: "ac-1",
                status: "satisfied",
                evidenceRefs: ["verify-1"],
              },
            ],
            evidenceRefs: ["verify-1"],
            planChecklist: { total: 1, completed: 1, pending: 0, synced: true },
            reviewClosure: { status: "pending", evidenceRefs: [] },
            commitEvidence: { status: "not_required" },
            knownLimitations: [],
          }),
          "```",
        ].join("\n"),
      ),
    );
    db.insert(tasks)
      .values({
        id: "task-feature-manifest",
        projectId: "project-1",
        title: "Feature manifest",
        description: "Add a small feature.",
        taskIntent: "feature",
        status: "implementing",
        plan: "Plan:\n- add the feature",
        reworkRequested: false,
        useSubagents: true,
      })
      .run();

    await runImplementer("task-feature-manifest", projectRoot);

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("fenced `aif-implementation-manifest` JSON block");
    expect(call.prompt).toContain("`intent` to `feature`");
    expect(call.prompt).toContain("`changedFiles`");
    expect(call.prompt).toContain("`verificationEvidence`");
    expect(call.prompt).toContain("`outputSha256`");
    expect(call.prompt).toContain("`outputPreview`");
    expect(call.prompt).toContain("`outputPreviewTruncated`");

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-feature-manifest")).get();
    const manifestJson = (updatedTask as { implementationManifestJson?: string | null } | undefined)
      ?.implementationManifestJson;
    expect(manifestJson).toBeTruthy();
    expect(JSON.parse(manifestJson ?? "{}")).toMatchObject({
      taskId: "task-feature-manifest",
      intent: "feature",
      changedFiles: [{ path: "src/feature.ts", status: "modified" }],
    });
  });

  it("prompts plan-manifest-backed tasks with the expected hash and stores validating evidence", async () => {
    const db = testDb.current;
    const plan = [
      "```aif-plan-manifest",
      JSON.stringify({
        version: 1,
        taskId: "task-feature-plan-hash",
        intent: "feature",
        scope: ["src/feature.ts"],
        allowedChanges: ["source", "tests"],
        forbiddenChanges: ["audit-report"],
        expectedArtifacts: [{ kind: "source_diff", paths: ["src/feature.ts"] }],
        acceptanceCriteria: [
          {
            id: "AC1",
            description: "Feature behavior is implemented.",
            verification: "npm.cmd test",
          },
        ],
        verificationCommands: ["npm.cmd test"],
      }),
      "```",
      "",
      "## Plan",
      "- [x] Implement feature behavior",
      "- [x] Run tests",
    ].join("\n");
    const expectedPlanManifestHash = hashAifPlanManifest(plan);
    queryMock.mockReturnValueOnce(
      streamSuccess(
        [
          "Implementation done",
          "",
          "```aif-implementation-manifest",
          JSON.stringify({
            version: 1,
            taskId: "task-feature-plan-hash",
            intent: "feature",
            planManifestHash: expectedPlanManifestHash,
            changedFiles: [{ path: "src/feature.ts", status: "modified" }],
            diffSummary: { summary: "Updated feature behavior." },
            verificationEvidence: [
              {
                id: "verify-1",
                command: "npm.cmd test",
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
                evidenceRefs: ["verify-1"],
              },
            ],
            evidenceRefs: ["verify-1"],
            planChecklist: { total: 2, completed: 2, pending: 0, synced: true },
            reviewClosure: { status: "pending", evidenceRefs: [] },
            commitEvidence: { status: "not_required" },
            knownLimitations: [],
          }),
          "```",
        ].join("\n"),
      ),
    );
    db.insert(tasks)
      .values({
        id: "task-feature-plan-hash",
        projectId: "project-1",
        title: "Feature manifest with plan hash",
        description: "Add a small feature.",
        taskIntent: "feature",
        status: "implementing",
        plan,
        reworkRequested: false,
        useSubagents: true,
      })
      .run();

    await runImplementer("task-feature-plan-hash", projectRoot);

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain(
      `set \`planManifestHash\` exactly to \`${expectedPlanManifestHash}\``,
    );
    expect(call.prompt).toContain(
      "`acceptanceCriteria` and `reviewClosure` evidence refs must point to concrete verification evidence or actual review comments",
    );

    const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-feature-plan-hash")).get();
    const manifestJson = (updatedTask as { implementationManifestJson?: string | null } | undefined)
      ?.implementationManifestJson;
    expect(manifestJson).toBeTruthy();
    const validation = validateImplementationManifest({
      task: {
        id: "task-feature-plan-hash",
        title: "Feature manifest with plan hash",
        taskIntent: "feature",
        plan,
      },
      manifestJson,
      changedFiles: ["src/feature.ts"],
      meaningfulChangedFiles: ["src/feature.ts"],
      dirtyChangedFiles: ["src/feature.ts"],
      phase: "review_handoff",
    });
    expect(validation.ok).toBe(true);
    expect(validation.planManifestHash).toBe(expectedPlanManifestHash);
  });

  it("asks fix tasks to include a regression explanation in the implementation manifest", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-fix-manifest",
        projectId: "project-1",
        title: "Fix stale cache invalidation",
        description: "Patch the cache invalidation regression.",
        taskIntent: "fix",
        isFix: true,
        status: "implementing",
        plan: "Plan:\n- patch the regression\n- run regression tests",
        reworkRequested: false,
        useSubagents: true,
      })
      .run();

    await runImplementer("task-fix-manifest", projectRoot);

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("fenced `aif-implementation-manifest` JSON block");
    expect(call.prompt).toContain("`intent` to `fix`");
    expect(call.prompt).toContain("`regressionExplanation`");
    expect(call.prompt).toContain(
      "`regressionExplanation` is required and must explain the regression or failure mode that was fixed",
    );
  });

  it("applies rework header and disables resume in skill mode", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-skill-rework",
        projectId: "project-1",
        title: "Task",
        description: "Desc",
        status: "implementing",
        plan: "## Plan\n- [x] Done",
        reworkRequested: true,
        useSubagents: false,
        sessionId: "skill-old-session",
        reviewComments: "## Blocking Findings\n- [finding-2] code_review | Fix skill mode rework",
        autoReviewStateJson: JSON.stringify({
          strategy: "full_re_review",
          iteration: 1,
          findings: [
            {
              id: "finding-2",
              source: "code_review",
              text: "Fix skill mode rework",
            },
          ],
        }),
      })
      .run();
    db.insert(taskComments)
      .values({
        id: "c-skill-rework",
        taskId: "task-skill-rework",
        author: "human",
        message: "skill-rework-request",
        attachments: "[]",
        createdAt: "2026-01-01T00:00:01.000Z",
      })
      .run();

    await runImplementer("task-skill-rework", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as {
      prompt: string;
      options: { resume?: string };
    };

    // Slash command stays on the first line so Claude Code can expand it
    const firstLine = call.prompt.split("\n")[0] ?? "";
    expect(firstLine).toBe("/aif-implement @.ai-factory/PLAN.md");

    // Rework header + comment + protocol are still injected into the body
    expect(call.prompt).toContain("REWORK REQUEST — THIS IS THE PRIMARY TASK");
    expect(call.prompt).toContain("<<<REWORK_COMMENT");
    expect(call.prompt).toContain("<<<FULL_REVIEW_COMMENTS");
    expect(call.prompt).toContain("<<<BLOCKING_FINDINGS_SNAPSHOT");
    expect(call.prompt).toContain("message: skill-rework-request");
    expect(call.prompt).toContain("Rework handling protocol:");
    expect(call.prompt).toContain("Rework mode: true");

    // Stored session must NOT be resumed for rework, even in skill mode
    expect(call.options.resume).toBeUndefined();
  });
});

describe("runImplementer feature branch routing", () => {
  let projectRoot: string;

  beforeEach(() => {
    (globalThis as { __AIF_CLAUDE_QUERY_MOCK__?: typeof queryMock }).__AIF_CLAUDE_QUERY_MOCK__ =
      queryMock;
    testDb.current = createTestDb();
    queryMock.mockReset();
    queryMock.mockReturnValue(streamSuccess("Implementation done"));
    projectRoot = mkdtempSync(join(tmpdir(), "aif-implementer-branch-"));
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
    // Pre-create the task's feature branch so implementer can switch to it
    execFileSync("git", ["checkout", "-b", "feature/my-task"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "main"], { cwd: projectRoot, stdio: "ignore" });

    testDb.current
      .insert(projects)
      .values({ id: "project-b", name: "Branch", rootPath: projectRoot })
      .run();
  });

  it("switches HEAD to task.branchName before running implementer", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-b-1",
        projectId: "project-b",
        title: "Has branch",
        description: "",
        status: "implementing",
        plan: "## Plan\n- [ ] Do work",
        branchName: "feature/my-task",
      })
      .run();

    // HEAD is on main before run
    const before = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(before).toBe("main");

    await runImplementer("task-b-1", projectRoot);

    const after = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(after).toBe("feature/my-task");
  });

  it("does not touch HEAD when task has no branchName", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-b-2",
        projectId: "project-b",
        title: "No branch",
        description: "",
        status: "implementing",
        plan: "## Plan\n- [ ] Do work",
      })
      .run();

    await runImplementer("task-b-2", projectRoot);

    const after = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(after).toBe("main");
  });

  it("restores branch BEFORE no-op early return (so plan is read from the right branch)", async () => {
    const db = testDb.current;
    // Plan text on feature branch shows pending work; plan text on main
    // (current HEAD before implementer runs) would be "all done" — if we
    // evaluated pending-task count on main, we'd wrongly early-return.
    db.insert(tasks)
      .values({
        id: "task-b-3",
        projectId: "project-b",
        title: "Must switch first",
        description: "",
        status: "implementing",
        plan: "## Plan\n- [ ] still pending\n- [x] already done",
        branchName: "feature/my-task",
      })
      .run();

    // HEAD on main — restore must happen before any config/plan read.
    const before = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(before).toBe("main");

    await runImplementer("task-b-3", projectRoot);

    const after = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    expect(after).toBe("feature/my-task");
    // Subagent WAS invoked (pending task remains) — if branch restore ran
    // after the no-op check on a stale plan, the test would see 0 calls.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("throws BranchIsolationError when task.branchName is missing from git", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-b-missing",
        projectId: "project-b",
        title: "Branch gone",
        description: "",
        status: "implementing",
        plan: "## Plan\n- [ ] work",
        branchName: "feature/never-existed",
      })
      .run();

    const { isBranchIsolationError } = await import("../gitBranch.js");
    try {
      await runImplementer("task-b-missing", projectRoot);
      throw new Error("expected throw");
    } catch (err) {
      expect(isBranchIsolationError(err)).toBe(true);
      if (isBranchIsolationError(err)) {
        expect(err.kind).toBe("branch_missing");
      }
    }
    // Subagent was NOT invoked — stage aborted before prompt build
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws branch_drift when subagent switches HEAD mid-run", async () => {
    const db = testDb.current;
    db.insert(tasks)
      .values({
        id: "task-b-drift",
        projectId: "project-b",
        title: "Drift implementer",
        description: "",
        status: "implementing",
        plan: "## Plan\n- [ ] work",
        branchName: "feature/my-task",
      })
      .run();

    // Simulate subagent switching HEAD off the task branch during its run
    queryMock.mockReset();
    queryMock.mockImplementation(() => {
      execFileSync("git", ["checkout", "main"], { cwd: projectRoot, stdio: "ignore" });
      return streamSuccess("Implementation done");
    });

    const { isBranchIsolationError } = await import("../gitBranch.js");
    try {
      await runImplementer("task-b-drift", projectRoot);
      throw new Error("expected throw");
    } catch (err) {
      expect(isBranchIsolationError(err)).toBe(true);
      if (isBranchIsolationError(err)) {
        expect(err.kind).toBe("branch_drift");
      }
    }
  });
});
