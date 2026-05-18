import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAuditEvidencePayload,
  buildAuditEvidenceUnit,
  computeAuditReportContentSha256,
  deriveAuditSourceSnapshotId,
  projects,
  resolveAuditPlanId,
  tasks,
} from "@aif/shared";
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

const { runReviewer } = await import("../subagents/reviewer.js");
const { appendAuditEvidenceEvent, createRoadmapBatchContract } = await import("@aif/data");

function sidecarOutput(previousFindingId: string): string {
  return [
    "## Blocking Findings",
    "- none",
    "",
    "## Advisories",
    "- src/review.ts:1 was inspected for the current attempt.",
    "",
    "## Previous Findings",
    `- [${previousFindingId}] still_blocking | Current attempt still lacks verification evidence in src/review.ts:1.`,
    "",
    "## Security Coverage",
    "- secret_leaks | covered | Checked changed review paths for raw secrets.",
    "- permissions_sandbox | covered | Checked permission and sandbox boundaries.",
    "- unsafe_shell_network_file | covered | Checked shell, network, and file operations.",
    "- dependency_config | covered | Checked dependency and configuration risks.",
  ].join("\n");
}

describe("runReviewer", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    executeSubagentQueryMock.mockReset();
  });

  it("passes redacted rework snapshot context to code and security sidecars", async () => {
    const prompts = new Map<string, string>();
    executeSubagentQueryMock.mockImplementation(
      async (input: { agentName: string; prompt: string }) => {
        prompts.set(input.agentName, input.prompt);
        return {
          resultText: input.agentName.includes("security")
            ? sidecarOutput("sec-1")
            : sidecarOutput("code-1"),
        };
      },
    );

    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "project-1",
        name: "Reviewer Context",
        rootPath: "/tmp/reviewer-context",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-reviewer-context",
        projectId: "project-1",
        title: "Review context",
        description: "Verify reviewer receives closure context",
        status: "review",
        useSubagents: true,
        implementationLog: "Changed src/review.ts and ran npm.cmd test.",
        reviewIterationCount: 1,
        autoReviewStateJson: JSON.stringify({
          strategy: "closure_first",
          iteration: 2,
          findings: [
            {
              id: "code-1",
              source: "code_review",
              text: "Preserve prior blocker status without echoing sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
            },
            {
              id: "sec-1",
              source: "security_audit",
              text: "Verify secret leak handling remains redacted",
            },
          ],
          reworkSnapshot: {
            iteration: 2,
            artifactPath: ".",
            artifactContentSha: null,
            findingIds: ["code-1", "sec-1"],
            baselineHeadSha: "abc123",
            changedFilesDigest: "digest-abc",
            changedFilesSummary: [
              "M packages/agent/src/reviewGate.ts",
              "M packages/agent/src/subagents/reviewer.ts",
            ],
            requiredEvidenceByFindingId: {
              "code-1":
                "Run npm.cmd test and do not expose sk-proj-abcdefghijklmnopqrstuvwxyz1234567890.",
              "sec-1": "Confirm https://private.example.invalid/secrets is redacted.",
            },
            forbiddenChanges: [
              "Do not edit unrelated files or print token=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890.",
            ],
          },
        }),
      })
      .run();

    await runReviewer("task-reviewer-context", "/tmp/reviewer-context");

    const reviewPrompt = prompts.get("review-sidecar") ?? "";
    const securityPrompt = prompts.get("security-sidecar") ?? "";

    for (const prompt of [reviewPrompt, securityPrompt]) {
      expect(prompt).toContain("Auto-review rework context:");
      expect(prompt).toContain("exact blocker ids: code-1, sec-1");
      expect(prompt).toContain("required evidence by blocker id:");
      expect(prompt).toContain("[code-1]");
      expect(prompt).toContain("[sec-1]");
      expect(prompt).toContain("forbidden unrelated changes:");
      expect(prompt).toContain("baselineHeadSha: abc123");
      expect(prompt).toContain("changedFilesDigest: digest-abc");
      expect(prompt).toContain("M packages/agent/src/reviewGate.ts");
      expect(prompt).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz1234567890");
      expect(prompt).not.toContain("https://private.example.invalid/secrets");
    }
  });

  it("uses deterministic review-gate output for trusted audit report artifacts", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "aif-reviewer-audit-report-"));
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
      join(projectRoot, "src", "config.ts"),
      "export const timeoutMs = 1000;\n",
      "utf8",
    );
    execFileSync("git", ["add", "src/config.ts"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "project-audit-reviewer",
        name: "Audit Reviewer",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-audit-reviewer",
        projectId: "project-audit-reviewer",
        title: "Audit runtime configuration",
        description: "Scope: src\nReport artifact: audit/runtime.md",
        taskIntent: "audit",
        status: "review",
        useSubagents: true,
        implementationLog:
          "Deterministic audit report repair completed from scoped source evidence and passed strict validation.",
      })
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "project-audit-reviewer",
      roadmapAlias: "audit-reviewer",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-audit-reviewer"],
      artifacts: [
        {
          taskId: "task-audit-reviewer",
          role: "report",
          artifactPath: "audit/runtime.md",
          projectRoot,
        },
      ],
    });
    const auditPlanId = resolveAuditPlanId({
      taskId: "task-audit-reviewer",
      roadmapBatchId: batch.batchId,
    });
    const sourceSnapshotId = deriveAuditSourceSnapshotId(projectRoot);
    appendAuditEvidenceEvent(
      buildAuditEvidenceUnit(
        {
          taskId: "task-audit-reviewer",
          auditPlanId,
          sourceSnapshotId,
          scopeIds: ["src"],
          riskHypothesisIds: ["risk-1"],
        },
        buildAuditEvidencePayload({
          id: "ev-1",
          toolName: "rg",
          evidenceKind: "search",
          evidenceGrade: "substantive",
          scopeIds: ["src"],
          riskHypothesisIds: ["risk-1"],
          paths: ["src/config.ts"],
          command: 'rg -n "timeoutMs" src/config.ts',
          exitCode: 0,
          output: "src/config.ts:1:export const timeoutMs = 1000;",
        }),
      ),
    );

    const [snapshotKind, snapshotCommit, snapshotTree] = sourceSnapshotId.split(":");
    const sourceSnapshot = {
      id: sourceSnapshotId,
      commit: snapshotKind === "git" ? snapshotCommit : null,
      tree: snapshotKind === "git" ? snapshotTree : null,
      dirty: false,
    };
    const body = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src` runtime configuration drift was covered and is absent.",
      "",
      "## Evidence Register",
      "",
      "| Scope | Checked evidence | Verification |",
      "| --- | --- | --- |",
      '| `src` | `src/config.ts:1` | Command `rg -n "timeoutMs" src/config.ts` output includes `src/config.ts:1:export const timeoutMs = 1000;` |',
      "",
      "## Checked Files",
      "",
      "- `src/config.ts:1`",
      "",
      "## Checked Commands",
      "",
      '- Command `rg -n "timeoutMs" src/config.ts` output:',
      "```",
      "src/config.ts:1:export const timeoutMs = 1000;",
      "```",
    ].join("\n");
    const manifest = {
      version: 1,
      auditPlanId,
      taskId: "task-audit-reviewer",
      batchId: batch.batchId,
      roadmapAlias: "audit-reviewer",
      artifactPath: "audit/runtime.md",
      contentSha256: computeAuditReportContentSha256(body),
      sourceSnapshot,
      outcome: "validated_no_findings",
      scopeCoverage: [{ root: "src", covered: true, evidenceRefs: ["ev-1"] }],
      riskHypotheses: [
        {
          id: "risk-1",
          description: "Runtime configuration drift",
          scopeIds: ["src"],
          status: "covered",
          evidenceRefs: ["ev-1"],
        },
      ],
      findings: [],
      noFindingsClaims: [
        {
          id: "nf-1",
          scopeIds: ["src"],
          riskIds: ["risk-1"],
          evidenceRefs: ["ev-1"],
        },
      ],
      evidenceRefs: ["ev-1"],
    };
    writeFileSync(
      join(projectRoot, "audit", "runtime.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
      "utf8",
    );

    await runReviewer("task-audit-reviewer", projectRoot);

    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
    const storedTask = db.select().from(tasks).where(eq(tasks.id, "task-audit-reviewer")).get();
    expect(storedTask?.reviewComments).toContain("## Blocking Findings");
    expect(storedTask?.reviewComments).toContain("- none");
    expect(storedTask?.reviewComments).toContain(
      "review_gate | audit report validation accepted `audit/runtime.md`",
    );
    expect(storedTask?.agentActivityLog).toContain(
      "Agent: review-gate started (deterministic audit report validation)",
    );
    expect(storedTask?.agentActivityLog).toContain("Tool: read_file audit/runtime.md");
  });
});
