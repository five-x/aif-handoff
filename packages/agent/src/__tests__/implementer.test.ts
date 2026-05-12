import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projects, taskComments, tasks, validateAuditReportArtifact } from "@aif/shared";
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
  createRoadmapBatchContract,
  findRoadmapBatchArtifactByTaskId,
  listAuditEvidenceEvents,
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

  it("injects validated audit report artifacts into synthesis prompts", async () => {
    const db = testDb.current;
    queryMock.mockReturnValueOnce(streamSuccess("Synthesis done"));
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
        id: "task-weak-report",
        projectId: "project-1",
        title: "Audit security",
        description: "Report artifact: audit/security.md",
        taskIntent: "audit",
        status: "blocked_external",
        manualReviewRequired: true,
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
      createdTaskIds: ["task-synthesis-report", "task-weak-report", "task-synthesis"],
      synthesisTaskId: "task-synthesis",
      artifacts: [
        {
          taskId: "task-synthesis-report",
          role: "report",
          artifactPath: "audit/config.md",
          projectRoot,
        },
        {
          taskId: "task-weak-report",
          role: "report",
          artifactPath: "audit/security.md",
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
    updateRoadmapBatchArtifactState({
      taskId: "task-weak-report",
      state: "invalid",
      failureFamily: "invalid_artifact_content",
      reworkStatus: "manual_review_required",
      validationDetails: { issues: ["low_quality_report_evidence"] },
    });

    await runImplementer("task-synthesis", projectRoot);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("<<<VALIDATED_AUDIT_BATCH_INPUTS");
    expect(call.prompt).toContain("--- artifact: audit/config.md");
    expect(call.prompt).toContain("Evidence: `README.md:1` identifies project docs.");
    expect(call.prompt).toContain("--- weak_or_invalid_artifacts ---");
    expect(call.prompt).toContain("artifact: audit/security.md");
    expect(call.prompt).toContain("failureFamily: invalid_artifact_content");
    expect(call.prompt).not.toContain("INVALID_REPORT_CONTENT_SHOULD_NOT_BE_SYNTHESIZED");
    expect(call.prompt).toContain("use those exact validated report contents");
  });

  it("reads validated audit report artifacts from producer branches for synthesis prompts", async () => {
    const db = testDb.current;
    queryMock.mockReturnValueOnce(streamSuccess("Synthesis done"));
    execFileSync("git", ["init", "-b", "main"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
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

    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("source: audit/config-report:audit/config.md");
    expect(call.prompt).toContain("producer branch");
    expect(call.prompt).toContain("use those exact validated report contents");
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
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(
      join(projectRoot, "audit", "config.md"),
      [
        "## Finding: Valid source evidence",
        "Evidence: `README.md:1` identifies project docs from the report branch.",
        "Risk: Synthesis can miss validated source evidence.",
        "Proposed fix: carry source report branch content into synthesis deterministically.",
        "Verification: Command `git log -1 --name-only --oneline` output included audit/config.md.",
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
    expect(summary).toContain("Evidence: `README.md:1`");
    expect(summary).toContain("Risk: Synthesis can miss validated source evidence.");
    expect(summary).toContain("Proposed fix: carry source report branch content");
    expect(summary).toContain("Included findings: 1");
    expect(summary).toContain("Omitted findings: 1");
    expect(summary).not.toContain("file is too large");
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
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
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
        "## Evidence Register",
        "",
        "| Scope | Checked evidence | Verification |",
        "| --- | --- | --- |",
        '| `README.md` | `README.md:1` | Command `rg -n "Project" README.md` output includes `README.md:1:# Project` |',
        '| `src/config.ts` | `src/config.ts:1` | Command `rg -n "timeoutMs" src/config.ts` output includes `src/config.ts:1:export const timeoutMs = 1000;` |',
        "",
        "## Checked Files",
        "",
        "- `README.md:1`",
        "- `src/config.ts:1`",
        "",
        "## Checked Commands",
        "",
        '- Command `rg -n "Project" README.md` output:',
        "```",
        "README.md:1:# Project",
        "```",
        '- Command `rg -n "timeoutMs" src/config.ts` output:',
        "```",
        "src/config.ts:1:export const timeoutMs = 1000;",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "README.md", "src/config.ts", "audit/runtime.md"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
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
    expect(summary).toContain("## Checked Files");
    expect(summary).toContain("`README.md:1`");
    expect(summary).toContain("`src/config.ts:1`");
    expect(summary).toContain('Command `rg -n "Project" README.md` output:');
    expect(summary).toContain("Audit outcome: Validated no-findings");
    expect(summary).not.toContain("Risk:");
    expect(summary).not.toContain("Proposed fix:");

    const validation = validateAuditReportArtifact({
      text: summary,
      projectRoot,
      taskDescription:
        "Scope: all audit/*-audit.md reports from this audit batch\nReport artifact: audit/summary.md\nEvidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
      reportArtifactPaths: ["audit/summary.md"],
      allowedEvidenceArtifactPaths: ["audit/runtime.md"],
      requireProposedFix: true,
    });
    expect(validation.ok).toBe(true);
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
    expect(summary).toContain('"kind":"inconclusive_batch_evidence"');
    expect(summary).toContain("Inventory-only no-findings source reports: 6.");
    expect(summary).not.toContain("No validated findings.");
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

  it("adds a focused audit evidence repair contract for repeated evidence guard failures", async () => {
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

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("Audit evidence repair mode:");
    expect(call.prompt).toContain(
      "Edit only the expected audit report artifact: audit/security.md",
    );
    expect(call.prompt).toContain("Evidence Register");
    expect(call.prompt).toContain("ID | Claim | Evidence | Verification");
    expect(call.prompt).toContain("Do not edit source, config, test, dependency, or runtime files");
    expect(call.prompt).toContain("exactly one bounded report-only git transaction");
    expect(call.prompt).toContain("Do not create repeated empty commits");
    expect(call.prompt).toContain("stage only audit/security.md");
  });

  it("enables audit evidence repair prompt mode from auto-review findings even without blockedReason", async () => {
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

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("Audit evidence repair mode:");
    expect(call.prompt).toContain("Do not preserve review-rejected findings");
    expect(call.prompt).toContain("Never type an example git hash into the report");
    expect(call.prompt).toContain("audit/architecture.md");
    expect(call.prompt).toContain("finding-insufficient-evidence");
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
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Agents\n", "utf8");
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

    await runImplementer("task-audit-deterministic-repair", projectRoot);

    expect(queryMock).not.toHaveBeenCalled();
    const repaired = readFileSync(join(projectRoot, "audit", "architecture.md"), "utf8");
    expect(repaired).toContain("No validated findings.");
    expect(repaired).toContain("`README.md:1`");
    expect(repaired).toContain("`AGENTS.md:1`");
    expect(repaired).toContain("`pyproject.toml:1`");
    expect(repaired).toContain("`src/config.py:1`");
    expect(repaired).not.toContain("Missing Ownership Clarity");
    expect(repaired).not.toContain("1234567");
    expect(repaired).toContain("```audit-report-manifest");
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-deterministic-repair");
    if (!artifact) throw new Error("missing deterministic repair artifact");
    const auditEvidenceUnits = listAuditEvidenceEvents({
      taskId: "task-audit-deterministic-repair",
      auditPlanId: `batch:${artifact.batchId}:task:task-audit-deterministic-repair`,
    });
    const validation = validateAuditReportArtifact({
      text: repaired,
      projectRoot,
      taskId: "task-audit-deterministic-repair",
      roadmapBatchId: artifact.batchId,
      roadmapAlias: artifact.roadmapAlias,
      taskDescription: description,
      reportArtifactPaths: ["audit/architecture.md"],
      requireProposedFix: true,
      auditEvidenceUnits,
      requireLedgerEvidence: true,
    });
    expect(validation.ok).toBe(true);
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-deterministic-repair"))
      .get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain("Deterministic audit report repair completed");
  });

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
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
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
    expect(repaired).toContain("`README.md:1`");
    expect(repaired).toContain("`src/alpha.ts:1`");
    expect(repaired).toContain("`src/beta.ts:1`");
    expect(repaired).toContain("`src/gamma.ts:1`");
    expect(repaired).not.toContain("Candidate");
    expect(repaired).not.toContain("would show");
    expect(repaired).toContain("```audit-report-manifest");
    const artifact = findRoadmapBatchArtifactByTaskId("task-audit-repeated-validator-repair");
    if (!artifact) throw new Error("missing repeated validator repair artifact");
    const auditEvidenceUnits = listAuditEvidenceEvents({
      taskId: "task-audit-repeated-validator-repair",
      auditPlanId: `batch:${artifact.batchId}:task:task-audit-repeated-validator-repair`,
    });
    const validation = validateAuditReportArtifact({
      text: repaired,
      projectRoot,
      taskId: "task-audit-repeated-validator-repair",
      roadmapBatchId: artifact.batchId,
      roadmapAlias: artifact.roadmapAlias,
      taskDescription: description,
      reportArtifactPaths: ["audit/security.md"],
      requireProposedFix: true,
      auditEvidenceUnits,
      requireLedgerEvidence: true,
    });
    expect(validation.ok).toBe(true);
    const updatedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-audit-repeated-validator-repair"))
      .get();
    expect(updatedTask?.reworkRequested).toBe(false);
    expect(updatedTask?.implementationLog).toContain("Deterministic audit report repair completed");
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
      "## Evidence Register",
      "",
      "| Scope | Checked evidence | Verification |",
      "| --- | --- | --- |",
      '| `README.md` | `README.md:1` | Command `git grep -n "." -- README.md` output includes `README.md:1:# Project` |',
      '| `src` | `src/alpha.ts:1`, `src/beta.ts:1`, `src/gamma.ts:1` | Command `git grep -n "." -- src/alpha.ts` output includes `src/alpha.ts:1:export const alpha = 1;` |',
      "",
      "## Checked Files",
      "",
      "- `README.md:1`",
      "- `src/alpha.ts:1`",
      "- `src/beta.ts:1`",
      "- `src/gamma.ts:1`",
      "",
      "## Checked Commands",
      "",
      '- Command `git grep -n "." -- README.md` output:',
      "```",
      "README.md:1:# Project",
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
    expect(updatedTask?.implementationLog).toContain("already valid before rework");
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
