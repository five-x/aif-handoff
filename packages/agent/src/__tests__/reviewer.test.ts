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
  formatAuditSynthesisOutcomeForArtifact,
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

const { resolveRequiredSpecializedReviewerRoles, runReviewer } =
  await import("../subagents/reviewer.js");
const { evaluateReviewCommentsForAutoMode } = await import("../reviewGate.js");
const { parseStructuredReviewComments } = await import("../reviewContract.js");
const { appendAuditEvidenceEvent, createRoadmapBatchContract, updateRoadmapBatchArtifactState } =
  await import("@aif/data");

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

function passingSidecarOutput(previousFindingIds: string[] = []): string {
  return [
    "## Blocking Findings",
    "- none",
    "",
    "## Advisories",
    "- review.ts:1 was inspected for this reviewer regression.",
    "",
    "## Previous Findings",
    ...(previousFindingIds.length > 0
      ? previousFindingIds.map(
          (findingId) =>
            `- [${findingId}] resolved | Current artifact review inspected the synthesis output and found no remaining blocker.`,
        )
      : ["- none"]),
    "",
    "## Security Coverage",
    "- secret_leaks | covered | Checked review output for raw secret disclosure.",
    "- permissions_sandbox | covered | Checked deterministic review fallback boundaries.",
    "- unsafe_shell_network_file | covered | Checked read-only review behavior.",
    "- dependency_config | not_applicable | No dependency or configuration change was introduced.",
  ].join("\n");
}

function passingSpecializedRoleOutput(): string {
  return [
    "## Verdict",
    "- PASS",
    "",
    "## Blocking Findings",
    "- none",
    "",
    "## Advisories",
    "- packages/agent/src/subagents/reviewer.ts:1 was inspected for this role.",
    "",
    "## Previous Findings",
    "- none",
  ].join("\n");
}

function failingSpecializedRoleOutput(text: string): string {
  return [
    "## Verdict",
    "- FAIL",
    "",
    "## Blocking Findings",
    `- ${text}`,
    "",
    "## Advisories",
    "- packages/agent/src/subagents/reviewer.ts:1 was inspected for this role.",
    "",
    "## Previous Findings",
    "- none",
  ].join("\n");
}

function isSpecializedReviewerAgent(agentName: string): boolean {
  return [
    "review-correctness",
    "review-security-data-loss",
    "review-regression-api-contract",
    "review-audit-evidence",
  ].includes(agentName);
}

function passingReviewerOutputForAgent(
  agentName: string,
  previousFindingIds: string[] = [],
): string {
  return isSpecializedReviewerAgent(agentName)
    ? passingSpecializedRoleOutput()
    : passingSidecarOutput(previousFindingIds);
}

function expectAuditSpecializedFanoutCalls(): void {
  const agentNames = executeSubagentQueryMock.mock.calls.map(
    (call) => (call[0] as { agentName: string }).agentName,
  );
  expect(executeSubagentQueryMock).toHaveBeenCalledTimes(6);
  expect(agentNames).toEqual(
    expect.arrayContaining([
      "review-sidecar",
      "security-sidecar",
      "review-correctness",
      "review-security-data-loss",
      "review-regression-api-contract",
      "review-audit-evidence",
    ]),
  );
}

function expectDeterministicAuditReviewOnlyCalls(): void {
  expect(executeSubagentQueryMock).not.toHaveBeenCalled();
}

function expectDeterministicAuditCanaryReviewOnlyCalls(): void {
  expect(executeSubagentQueryMock).not.toHaveBeenCalled();
}

type SpecializedRoleResolutionTask = Parameters<typeof resolveRequiredSpecializedReviewerRoles>[0];

function roleResolutionTask(
  overrides: Partial<SpecializedRoleResolutionTask>,
): SpecializedRoleResolutionTask {
  return {
    id: "task-role-resolution",
    projectId: "project-role-resolution",
    title: "Role resolution task",
    description: null,
    status: "review",
    priority: 0,
    taskIntent: "general",
    roadmapAlias: null,
    tags: null,
    ...overrides,
  } as SpecializedRoleResolutionTask;
}

describe("resolveRequiredSpecializedReviewerRoles", () => {
  it("requires audit evidence plus base roles for discovery and review-style risky tasks", () => {
    for (const task of [
      roleResolutionTask({
        title: "Discovery inventory for task lifecycle gaps",
        description: "Findings report for validation coverage",
      }),
      roleResolutionTask({
        title: "Code review findings validation",
        description: "Review the reported evidence for blockers",
      }),
      roleResolutionTask({
        title: "Research spike for audit evidence bypasses",
        taskIntent: "spike",
      }),
    ]) {
      expect(resolveRequiredSpecializedReviewerRoles(task, null)).toEqual([
        "correctness",
        "security_data_loss",
        "regression_api_contract",
        "audit_evidence",
      ]);
    }
  });

  it("keeps high-risk non-audit tasks on base roles and low-risk tasks without fan-out", () => {
    expect(
      resolveRequiredSpecializedReviewerRoles(
        roleResolutionTask({
          title: "Update public API contract",
          description: "High risk schema migration",
          priority: 3,
          taskIntent: "feature",
        }),
        null,
      ),
    ).toEqual(["correctness", "security_data_loss", "regression_api_contract"]);

    expect(
      resolveRequiredSpecializedReviewerRoles(
        roleResolutionTask({
          title: "Adjust button copy",
          description: "Tiny wording change",
          taskIntent: "docs",
        }),
        null,
      ),
    ).toEqual([]);
  });
});

type FixtureSourceClassification = "validated_no_findings" | "validated_findings_present";

function trustedAuditReportValidationDetails(
  sourceClassification: FixtureSourceClassification,
): Record<string, unknown> {
  return {
    auditReportValidation: {
      manifestStatus: "valid",
      sourceClassification,
      ...(sourceClassification === "validated_no_findings"
        ? {
            manifestVersion: 1,
            evidenceDepth: {
              status: "substantive",
              trustedNoFindingsSupported: true,
              reasonCodes: [],
            },
          }
        : {}),
    },
    auditArtifactLifecycle: validAuditArtifactLifecycleEvidence(sourceClassification),
  };
}

function validAuditArtifactLifecycleEvidence(
  sourceClassification: string,
): Record<string, unknown> {
  const artifactSha = "a".repeat(64);
  const contentSha = "b".repeat(64);
  return {
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
    worktreeArtifactSha256: artifactSha,
    committedArtifactSha256: artifactSha,
    worktreeContentSha256: contentSha,
    committedContentSha256: contentSha,
    committedValidation: {
      ok: true,
      issueCodes: [],
      artifactSha256: artifactSha,
      contentSha256: contentSha,
      manifestStatus: "valid",
      manifestVersion: 1,
      sourceClassification,
      sourceSnapshot: { id: "git:commit:tree", commit: "commit", tree: "tree", dirty: false },
    },
  };
}

function seedTrustedSynthesisReviewerFixture(input: {
  idSuffix: string;
  includeManifest?: boolean;
  sourceClassifications?: [FixtureSourceClassification, FixtureSourceClassification];
  previousFindings?: Array<Record<string, unknown>>;
}) {
  const includeManifest = input.includeManifest ?? true;
  const sourceClassifications: [FixtureSourceClassification, FixtureSourceClassification] =
    input.sourceClassifications ?? ["validated_no_findings", "validated_no_findings"];
  const projectRoot = mkdtempSync(join(tmpdir(), `aif-reviewer-synthesis-${input.idSuffix}-`));
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
  writeFileSync(join(projectRoot, "src", "config.ts"), "export const retries = 2;\n", "utf8");
  execFileSync("git", ["add", "src/config.ts"], { cwd: projectRoot, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
    cwd: projectRoot,
    stdio: "ignore",
  });

  const db = testDb.current;
  const projectId = `project-synthesis-${input.idSuffix}`;
  const sourceTaskA = `task-source-a-${input.idSuffix}`;
  const sourceTaskB = `task-source-b-${input.idSuffix}`;
  const synthesisTaskId = `task-synthesis-${input.idSuffix}`;
  const roadmapAlias = `audit-synthesis-${input.idSuffix}`;
  db.insert(projects)
    .values({
      id: projectId,
      name: `Trusted Synthesis ${input.idSuffix}`,
      rootPath: projectRoot,
    })
    .run();
  db.insert(tasks)
    .values([
      {
        id: sourceTaskA,
        projectId,
        title: "Audit source A",
        description: "Scope: src/config.ts\nReport artifact: audit/source-a.md",
        taskIntent: "audit",
        status: "done",
        useSubagents: true,
      },
      {
        id: sourceTaskB,
        projectId,
        title: "Audit source B",
        description: "Scope: src/config.ts\nReport artifact: audit/source-b.md",
        taskIntent: "audit",
        status: "done",
        useSubagents: true,
      },
      {
        id: synthesisTaskId,
        projectId,
        title: "Synthesize audit findings",
        description: "Scope: src/config.ts\nReport artifact: audit/summary.md",
        taskIntent: "audit",
        status: "review",
        useSubagents: true,
        implementationLog:
          "Deterministic audit synthesis completed from validated report artifacts on producer branches.",
        ...(input.previousFindings
          ? {
              autoReviewStateJson: JSON.stringify({
                strategy: "full_re_review",
                iteration: 1,
                findings: input.previousFindings,
              }),
            }
          : {}),
      },
    ])
    .run();
  const batch = createRoadmapBatchContract({
    projectId,
    roadmapAlias,
    taskIntent: "audit",
    executionPolicy: "serialized_shared_checkout",
    createdTaskIds: [sourceTaskA, sourceTaskB, synthesisTaskId],
    artifacts: [
      { taskId: sourceTaskA, role: "report", artifactPath: "audit/source-a.md" },
      { taskId: sourceTaskB, role: "report", artifactPath: "audit/source-b.md" },
      { taskId: synthesisTaskId, role: "synthesis", artifactPath: "audit/summary.md" },
    ],
  });
  [sourceTaskA, sourceTaskB].forEach((taskId, index) => {
    const classification = sourceClassifications[index]!;
    updateRoadmapBatchArtifactState({
      taskId,
      state: "valid",
      failureFamily: null,
      classification,
      validationDetails: trustedAuditReportValidationDetails(classification),
    });
  });

  const auditPlanId = resolveAuditPlanId({
    taskId: synthesisTaskId,
    roadmapBatchId: batch.batchId,
  });
  const sourceSnapshotId = deriveAuditSourceSnapshotId(projectRoot);
  appendAuditEvidenceEvent(
    buildAuditEvidenceUnit(
      {
        taskId: synthesisTaskId,
        auditPlanId,
        sourceSnapshotId,
        scopeIds: ["audit/source-a.md", "audit/source-b.md"],
        riskHypothesisIds: ["risk-deterministic-synthesis-no-findings"],
      },
      buildAuditEvidencePayload({
        id: `ev-synthesis-${input.idSuffix}`,
        toolName: "deterministic_audit_synthesis",
        evidenceKind: "shell_command",
        evidenceGrade: "substantive",
        scopeIds: ["audit/source-a.md", "audit/source-b.md"],
        riskHypothesisIds: ["risk-deterministic-synthesis-no-findings"],
        paths: ["audit/source-a.md", "audit/source-b.md"],
        command: "deterministic-audit-synthesis --artifact audit/summary.md",
        exitCode: 0,
        output: "summaryArtifact=audit/summary.md\nsourceReportCount=2\nweakOrInvalidReportCount=0",
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
    "# Audit Summary",
    "",
    formatAuditSynthesisOutcomeForArtifact({
      kind: "validated_no_findings",
      reason:
        "No findings survived validation and all source reports included substantive no-findings evidence.",
      sourceReportCount: 2,
      validatedFindingCount: 0,
      substantiveNoFindingsReportCount: 2,
      inventoryOnlyNoFindingsReportCount: 0,
      weakReportCount: 0,
    }),
    "",
    "No validated findings.",
    "Risk hypotheses: risk-deterministic-synthesis-no-findings for retries evidence from trusted source reports was covered and absent.",
    "Audit outcome: Validated no-findings with substantive audit evidence.",
    "Absence reasoning: risk-deterministic-synthesis-no-findings trusted source reports `audit/source-a.md`, `audit/source-b.md` were each classified as validated_no_findings with substantive child evidence.",
    "",
    "## Evidence Register",
    "",
    "| Source report | Checked evidence | Verification |",
    "| --- | --- | --- |",
    "| `audit/source-a.md` | `src/config.ts:1` | - Command `git grep -n retries -- src/config.ts` output: ``` src/config.ts:1:export const retries = 2; ``` |",
    "| `audit/source-b.md` | `src/config.ts:1` | - Command `git grep -n retries -- src/config.ts` output: ``` src/config.ts:1:export const retries = 2; ``` |",
    "",
    "## Checked Files",
    "",
    "- `src/config.ts:1`",
    "",
    "## Checked Commands",
    "",
    "- Command `git grep -n retries -- src/config.ts` output:",
    "```",
    "src/config.ts:1:export const retries = 2;",
    "```",
  ].join("\n");
  const manifest = {
    version: 1,
    auditPlanId,
    taskId: synthesisTaskId,
    batchId: batch.batchId,
    roadmapAlias,
    artifactPath: "audit/summary.md",
    contentSha256: computeAuditReportContentSha256(body),
    sourceSnapshot,
    outcome: "validated_no_findings",
    scopeCoverage: [
      {
        root: "audit/source-a.md",
        covered: true,
        evidenceRefs: [`ev-synthesis-${input.idSuffix}`],
      },
      {
        root: "audit/source-b.md",
        covered: true,
        evidenceRefs: [`ev-synthesis-${input.idSuffix}`],
      },
    ],
    riskHypotheses: [
      {
        id: "risk-deterministic-synthesis-no-findings",
        description:
          "Trusted source audit reports contain no validated findings that survived deterministic synthesis.",
        scopeIds: ["audit/source-a.md", "audit/source-b.md"],
        status: "covered",
        evidenceRefs: [`ev-synthesis-${input.idSuffix}`],
      },
    ],
    findings: [],
    noFindingsClaims: [
      {
        id: "nf-deterministic-synthesis",
        scopeIds: ["audit/source-a.md", "audit/source-b.md"],
        riskIds: ["risk-deterministic-synthesis-no-findings"],
        evidenceRefs: [`ev-synthesis-${input.idSuffix}`],
      },
    ],
    evidenceRefs: [`ev-synthesis-${input.idSuffix}`],
  };
  writeFileSync(
    join(projectRoot, "audit", "summary.md"),
    includeManifest
      ? `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`
      : `${body}\n`,
    "utf8",
  );

  return { db, projectRoot, synthesisTaskId, batchId: batch.batchId };
}

describe("runReviewer", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    executeSubagentQueryMock.mockReset();
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => ({
      resultText: passingReviewerOutputForAgent(input.agentName),
    }));
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

  it("fans out base specialized reviewers for high-risk non-audit tasks", async () => {
    const calls: Array<{ agentName: string; profileMode?: string }> = [];
    executeSubagentQueryMock.mockImplementation(
      async (input: { agentName: string; profileMode?: string }) => {
        calls.push({ agentName: input.agentName, profileMode: input.profileMode });
        if (input.agentName === "review-correctness") {
          return { resultText: failingSpecializedRoleOutput("Correctness blocker") };
        }
        if (isSpecializedReviewerAgent(input.agentName)) {
          return { resultText: passingSpecializedRoleOutput() };
        }
        return { resultText: passingSidecarOutput() };
      },
    );

    const db = testDb.current;
    db.insert(projects)
      .values({ id: "project-specialized", name: "Specialized", rootPath: "/tmp/specialized" })
      .run();
    db.insert(tasks)
      .values({
        id: "task-high-risk-review",
        projectId: "project-specialized",
        title: "Update public API contract",
        description: "High risk schema/API contract change",
        status: "review",
        priority: 3,
        taskIntent: "feature",
        useSubagents: true,
        implementationLog: "Changed API contract and ran tests.",
      })
      .run();

    await runReviewer("task-high-risk-review", "/tmp/specialized");

    const agentNames = calls.map((call) => call.agentName);
    expect(agentNames).toEqual(
      expect.arrayContaining([
        "review-sidecar",
        "security-sidecar",
        "review-correctness",
        "review-security-data-loss",
        "review-regression-api-contract",
      ]),
    );
    expect(agentNames).not.toContain("review-audit-evidence");
    expect(calls.find((call) => call.agentName === "review-security-data-loss")?.profileMode).toBe(
      "security",
    );

    const storedTask = db.select().from(tasks).where(eq(tasks.id, "task-high-risk-review")).get();
    const parsed = parseStructuredReviewComments(storedTask?.reviewComments ?? null);
    expect(parsed?.blockingFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "correctness", text: "Correctness blocker" }),
      ]),
    );
  });

  it("requires audit evidence plus base specialized roles for audit tasks by default", async () => {
    const agentNames: string[] = [];
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => {
      agentNames.push(input.agentName);
      if (isSpecializedReviewerAgent(input.agentName)) {
        return { resultText: passingSpecializedRoleOutput() };
      }
      return { resultText: passingSidecarOutput() };
    });

    const db = testDb.current;
    db.insert(projects)
      .values({ id: "project-audit-fanout", name: "Audit Fanout", rootPath: "/tmp/audit-fanout" })
      .run();
    db.insert(tasks)
      .values({
        id: "task-audit-fanout",
        projectId: "project-audit-fanout",
        title: "Review audit report",
        description: "Audit evidence review task",
        status: "review",
        priority: 0,
        taskIntent: "audit",
        useSubagents: true,
        implementationLog: "Produced an audit report for review.",
      })
      .run();

    await runReviewer("task-audit-fanout", "/tmp/audit-fanout");

    expect(agentNames).toEqual(
      expect.arrayContaining([
        "review-correctness",
        "review-security-data-loss",
        "review-regression-api-contract",
        "review-audit-evidence",
      ]),
    );
  });

  it("e2e-style fails closed when a required specialized reviewer is unavailable", async () => {
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => {
      if (input.agentName === "review-regression-api-contract") {
        throw new Error("runtime policy blocked reviewer role");
      }
      if (isSpecializedReviewerAgent(input.agentName)) {
        return { resultText: passingSpecializedRoleOutput() };
      }
      return { resultText: passingSidecarOutput() };
    });

    const db = testDb.current;
    db.insert(projects)
      .values({ id: "project-e2e-fanout", name: "E2E Fanout", rootPath: "/tmp/e2e-fanout" })
      .run();
    db.insert(tasks)
      .values({
        id: "task-e2e-fanout",
        projectId: "project-e2e-fanout",
        title: "Update public API schema",
        description: "High risk API contract change",
        status: "review",
        priority: 3,
        taskIntent: "feature",
        autoMode: true,
        useSubagents: true,
        implementationLog: "Changed API schema.",
      })
      .run();

    await runReviewer("task-e2e-fanout", "/tmp/e2e-fanout");
    const storedTask = db.select().from(tasks).where(eq(tasks.id, "task-e2e-fanout")).get();
    const result = await evaluateReviewCommentsForAutoMode({
      taskId: "task-e2e-fanout",
      projectRoot: "/tmp/e2e-fanout",
      reviewComments: storedTask?.reviewComments ?? null,
      strategy: "full_re_review",
      iteration: 1,
      previousFindings: [],
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status === "manual_review_required") {
      expect(result.autoReviewState.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "regression_api_contract",
            text: expect.stringContaining("manual_review_required"),
          }),
        ]),
      );
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
      "Risk hypotheses: risk-1 for `src` runtime timeout configuration drift was covered and is absent.",
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
          description: "Runtime timeout configuration drift",
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

    expectDeterministicAuditReviewOnlyCalls();
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

  it("keeps direct audit canary report review deterministic when validator already trusts it", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "aif-reviewer-direct-canary-"));
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
    writeFileSync(
      join(projectRoot, "README.md"),
      "# Project\nTRANSCRIPTION_BASE_URL uses placeholder endpoint value.\n",
      "utf8",
    );
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "project-direct-canary-reviewer",
        name: "Direct Canary Reviewer",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-direct-canary-reviewer",
        projectId: "project-direct-canary-reviewer",
        title: "Positive trusted direct audit canary",
        description:
          "Scope: README.md\nReport artifact: audit/direct-canary.md\nRisk hypotheses: risk-readme-env README.md documents TRANSCRIPTION_BASE_URL without exposing a secret.",
        taskIntent: "audit",
        status: "review",
        useSubagents: true,
        implementationLog:
          "Deterministic audit report repair completed from scoped source evidence and passed strict validation.",
      })
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "project-direct-canary-reviewer",
      roadmapAlias: "direct-audit-task-direct",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-direct-canary-reviewer"],
      artifacts: [
        {
          taskId: "task-direct-canary-reviewer",
          role: "report",
          artifactPath: "audit/direct-canary.md",
          projectRoot,
        },
      ],
    });
    const auditPlanId = resolveAuditPlanId({
      taskId: "task-direct-canary-reviewer",
      roadmapBatchId: batch.batchId,
    });
    const sourceSnapshotId = deriveAuditSourceSnapshotId(projectRoot);
    appendAuditEvidenceEvent(
      buildAuditEvidenceUnit(
        {
          taskId: "task-direct-canary-reviewer",
          auditPlanId,
          sourceSnapshotId,
          scopeIds: ["README.md"],
          riskHypothesisIds: ["risk-readme-env"],
        },
        buildAuditEvidencePayload({
          id: "ev-direct-canary-1",
          toolName: "git grep",
          evidenceKind: "search",
          evidenceGrade: "substantive",
          scopeIds: ["README.md"],
          riskHypothesisIds: ["risk-readme-env"],
          paths: ["README.md"],
          command: 'git grep -n "TRANSCRIPTION_BASE_URL" -- README.md',
          exitCode: 0,
          output: "README.md:2:TRANSCRIPTION_BASE_URL uses placeholder endpoint value.",
        }),
      ),
    );
    const [snapshotKind, snapshotCommit, snapshotTree] = sourceSnapshotId.split(":");
    const body = [
      "# Direct Canary Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-readme-env for `README.md` transcription endpoint documentation was covered and is absent.",
      "",
      "## Evidence Register",
      "",
      "| Scope | Checked evidence | Verification |",
      "| --- | --- | --- |",
      '| `README.md` | `README.md:2` | Command `git grep -n "TRANSCRIPTION_BASE_URL" -- README.md` output includes `README.md:2:TRANSCRIPTION_BASE_URL uses placeholder endpoint value.` |',
      "",
      "## Checked Files",
      "",
      "- `README.md:2`",
      "",
      "## Checked Commands",
      "",
      '- Command `git grep -n "TRANSCRIPTION_BASE_URL" -- README.md` output:',
      "```",
      "README.md:2:TRANSCRIPTION_BASE_URL uses placeholder endpoint value.",
      "```",
    ].join("\n");
    const manifest = {
      version: 1,
      auditPlanId,
      taskId: "task-direct-canary-reviewer",
      batchId: batch.batchId,
      roadmapAlias: "direct-audit-task-direct",
      artifactPath: "audit/direct-canary.md",
      contentSha256: computeAuditReportContentSha256(body),
      sourceSnapshot: {
        id: sourceSnapshotId,
        commit: snapshotKind === "git" ? snapshotCommit : null,
        tree: snapshotKind === "git" ? snapshotTree : null,
        dirty: false,
      },
      outcome: "validated_no_findings",
      scopeCoverage: [{ root: "README.md", covered: true, evidenceRefs: ["ev-direct-canary-1"] }],
      riskHypotheses: [
        {
          id: "risk-readme-env",
          description: "README.md transcription endpoint documentation",
          scopeIds: ["README.md"],
          status: "covered",
          evidenceRefs: ["ev-direct-canary-1"],
        },
      ],
      findings: [],
      noFindingsClaims: [
        {
          id: "nf-direct-canary",
          scopeIds: ["README.md"],
          riskIds: ["risk-readme-env"],
          evidenceRefs: ["ev-direct-canary-1"],
        },
      ],
      evidenceRefs: ["ev-direct-canary-1"],
    };
    writeFileSync(
      join(projectRoot, "audit", "direct-canary.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
      "utf8",
    );

    await runReviewer("task-direct-canary-reviewer", projectRoot);

    expectDeterministicAuditCanaryReviewOnlyCalls();
    const storedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-direct-canary-reviewer"))
      .get();
    expect(storedTask?.reviewComments).toContain("- Deterministic Review: audit_report_validation");
    expect(storedTask?.reviewComments).toContain("- none");
    expect(storedTask?.reviewComments).toContain(
      "review_gate | audit report validation accepted `audit/direct-canary.md`",
    );
  });

  it("keeps invalid direct audit canary report review deterministic and blocking", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "aif-reviewer-invalid-direct-canary-"));
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(join(projectRoot, "README.md"), "# Project\n", "utf8");
    writeFileSync(
      join(projectRoot, "audit", "direct-canary-invalid.md"),
      [
        "# Direct Audit Canary",
        "",
        "No validated findings.",
        "",
        "## Evidence Register",
        "| Scope | Checked evidence | Verification |",
        "| --- | --- | --- |",
        "| `README.md` | `README.md:1` | checked manually |",
      ].join("\n"),
      "utf8",
    );
    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "project-invalid-direct-canary-reviewer",
        name: "Invalid Direct Canary Reviewer",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-invalid-direct-canary-reviewer",
        projectId: "project-invalid-direct-canary-reviewer",
        title: "Negative direct audit canary",
        description:
          "Scope: README.md\nReport artifact: audit/direct-canary-invalid.md\nDirect audit canary invalid report should fail closed.",
        taskIntent: "audit",
        status: "review",
        useSubagents: true,
        implementationLog: "Runtime produced invalid direct canary report.",
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-invalid-direct-canary-reviewer",
      roadmapAlias: "direct-audit-task-invalid",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-invalid-direct-canary-reviewer"],
      artifacts: [
        {
          taskId: "task-invalid-direct-canary-reviewer",
          role: "report",
          artifactPath: "audit/direct-canary-invalid.md",
          projectRoot,
        },
      ],
    });

    await runReviewer("task-invalid-direct-canary-reviewer", projectRoot);

    expectDeterministicAuditCanaryReviewOnlyCalls();
    const storedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-invalid-direct-canary-reviewer"))
      .get();
    expect(storedTask?.reviewComments).toContain(
      "- Deterministic Review: audit_report_validation_failed",
    );
    expect(storedTask?.reviewComments).toContain("missing_report_manifest");
    expect(storedTask?.reviewComments).toContain("## Blocking Findings");
    expect(storedTask?.reviewComments).toContain(
      "Security sidecar skipped because deterministic audit report validation already produced blocking issues",
    );
  });

  it("uses deterministic blocker output for audit report artifacts that fail validation", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "aif-reviewer-invalid-audit-report-"));
    mkdirSync(join(projectRoot, "audit"), { recursive: true });
    writeFileSync(
      join(projectRoot, "audit", "runtime.md"),
      [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "",
        "## Evidence Register",
        "| Scope | Checked evidence | Verification |",
        "| --- | --- | --- |",
        "| `src` | `src/config.ts:1` | checked manually |",
      ].join("\n"),
      "utf8",
    );
    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "project-invalid-audit-reviewer",
        name: "Invalid Audit Reviewer",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-invalid-audit-reviewer",
        projectId: "project-invalid-audit-reviewer",
        title: "Audit runtime configuration",
        description: "Scope: src\nReport artifact: audit/runtime.md",
        taskIntent: "audit",
        status: "review",
        useSubagents: true,
        implementationLog: "Runtime produced audit/runtime.md for review.",
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-invalid-audit-reviewer",
      roadmapAlias: "audit-invalid-reviewer",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-invalid-audit-reviewer"],
      artifacts: [
        {
          taskId: "task-invalid-audit-reviewer",
          role: "report",
          artifactPath: "audit/runtime.md",
          projectRoot,
        },
      ],
    });

    await runReviewer("task-invalid-audit-reviewer", projectRoot);

    expectDeterministicAuditReviewOnlyCalls();
    const storedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-invalid-audit-reviewer"))
      .get();
    expect(storedTask?.reviewComments).toContain(
      "- Deterministic Review: audit_report_validation_failed",
    );
    expect(storedTask?.reviewComments).toContain("missing_report_manifest");
    expect(storedTask?.reviewComments).toContain("## Security Coverage");
    expect(storedTask?.reviewComments).toContain("secret_leaks | not_checked");
    expect(storedTask?.reviewComments).toContain(
      "sidecar review was skipped to avoid budget-exhaustion contract failures",
    );
  });

  it("uses deterministic blocker output when the expected audit report artifact is missing", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "aif-reviewer-missing-audit-report-"));
    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "project-missing-audit-reviewer",
        name: "Missing Audit Reviewer",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-missing-audit-reviewer",
        projectId: "project-missing-audit-reviewer",
        title: "Audit runtime configuration",
        description: "Scope: src\nReport artifact: audit/runtime.md",
        taskIntent: "audit",
        status: "review",
        useSubagents: true,
        implementationLog: "Runtime moved to review without creating audit/runtime.md.",
      })
      .run();
    createRoadmapBatchContract({
      projectId: "project-missing-audit-reviewer",
      roadmapAlias: "audit-missing-reviewer",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-missing-audit-reviewer"],
      artifacts: [
        {
          taskId: "task-missing-audit-reviewer",
          role: "report",
          artifactPath: "audit/runtime.md",
          projectRoot,
        },
      ],
    });

    await runReviewer("task-missing-audit-reviewer", projectRoot);

    expectDeterministicAuditReviewOnlyCalls();
    const storedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-missing-audit-reviewer"))
      .get();
    expect(storedTask?.reviewComments).toContain("- Deterministic Review: audit_artifact_missing");
    expect(storedTask?.reviewComments).toContain("missing_report_artifact");
    expect(storedTask?.reviewComments).toContain(
      "Sidecar review was skipped because `audit/runtime.md` is missing",
    );
    expect(storedTask?.agentActivityLog).toContain(
      "Agent: review stage blocked deterministically (audit artifact missing)",
    );
    expect(storedTask?.agentActivityLog).toContain("Tool: read_file audit/runtime.md");
  });

  it("accepts synthesis references to validated source report artifacts outside the current checkout", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "aif-reviewer-synthesis-report-"));
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
        id: "project-synthesis-reviewer",
        name: "Synthesis Reviewer",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values([
        {
          id: "task-source-report",
          projectId: "project-synthesis-reviewer",
          title: "Audit source",
          description: "Scope: src/config.ts\nReport artifact: audit/source-audit.md",
          taskIntent: "audit",
          status: "done",
          useSubagents: true,
        },
        {
          id: "task-synthesis-reviewer",
          projectId: "project-synthesis-reviewer",
          title: "Synthesize audit findings",
          description: "Scope: src/config.ts\nReport artifact: audit/summary.md",
          taskIntent: "audit",
          status: "review",
          useSubagents: true,
          implementationLog:
            "Deterministic audit synthesis completed from validated report artifacts.",
        },
      ])
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "project-synthesis-reviewer",
      roadmapAlias: "audit-synthesis-reviewer",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-source-report", "task-synthesis-reviewer"],
      artifacts: [
        { taskId: "task-source-report", role: "report", artifactPath: "audit/source-audit.md" },
        { taskId: "task-synthesis-reviewer", role: "synthesis", artifactPath: "audit/summary.md" },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-source-report",
      state: "valid",
      failureFamily: null,
      classification: "validated_no_findings",
      validationDetails: trustedAuditReportValidationDetails("validated_no_findings"),
    });

    const auditPlanId = resolveAuditPlanId({
      taskId: "task-synthesis-reviewer",
      roadmapBatchId: batch.batchId,
    });
    const sourceSnapshotId = deriveAuditSourceSnapshotId(projectRoot);
    appendAuditEvidenceEvent(
      buildAuditEvidenceUnit(
        {
          taskId: "task-synthesis-reviewer",
          auditPlanId,
          sourceSnapshotId,
          scopeIds: ["src/config.ts"],
          riskHypothesisIds: ["risk-1"],
        },
        buildAuditEvidencePayload({
          id: "ev-synthesis-1",
          toolName: "rg",
          evidenceKind: "search",
          evidenceGrade: "substantive",
          scopeIds: ["src/config.ts"],
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
      "# Audit Summary",
      "",
      formatAuditSynthesisOutcomeForArtifact({
        kind: "validated_no_findings",
        reason: "No findings survived validation across trusted source reports.",
        sourceReportCount: 1,
        validatedFindingCount: 0,
        substantiveNoFindingsReportCount: 1,
        inventoryOnlyNoFindingsReportCount: 0,
        weakReportCount: 0,
      }),
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` runtime timeout coverage was covered and is absent.",
      "",
      "## Evidence Register",
      "",
      "| Scope | Checked evidence | Verification |",
      "| --- | --- | --- |",
      '| `src/config.ts` | `src/config.ts:1`, source report `audit/source-audit.md` | Command `rg -n "timeoutMs" src/config.ts` output includes `src/config.ts:1:export const timeoutMs = 1000;` |',
      "",
      "## Checked Files",
      "",
      "- `src/config.ts:1`",
      "- Source report provenance: `audit/source-audit.md`",
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
      taskId: "task-synthesis-reviewer",
      batchId: batch.batchId,
      roadmapAlias: "audit-synthesis-reviewer",
      artifactPath: "audit/summary.md",
      contentSha256: computeAuditReportContentSha256(body),
      sourceSnapshot,
      outcome: "validated_no_findings",
      scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-synthesis-1"] }],
      riskHypotheses: [
        {
          id: "risk-1",
          description: "Synthesis runtime timeout coverage",
          scopeIds: ["src/config.ts"],
          status: "covered",
          evidenceRefs: ["ev-synthesis-1"],
        },
      ],
      findings: [],
      noFindingsClaims: [
        {
          id: "nf-1",
          scopeIds: ["src/config.ts"],
          riskIds: ["risk-1"],
          evidenceRefs: ["ev-synthesis-1"],
        },
      ],
      evidenceRefs: ["ev-synthesis-1"],
    };
    writeFileSync(
      join(projectRoot, "audit", "summary.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
      "utf8",
    );

    await runReviewer("task-synthesis-reviewer", projectRoot);

    expectDeterministicAuditReviewOnlyCalls();
    const storedTask = db.select().from(tasks).where(eq(tasks.id, "task-synthesis-reviewer")).get();
    expect(storedTask?.reviewComments).toContain("## Blocking Findings");
    expect(storedTask?.reviewComments).toContain("- none");
    expect(storedTask?.reviewComments).toContain(
      "- Deterministic Review: audit_synthesis_validation",
    );
  });

  it("does not let generic synthesis validation bypass persisted source classification mismatch", async () => {
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => ({
      resultText: passingReviewerOutputForAgent(input.agentName),
    }));

    const projectRoot = mkdtempSync(join(tmpdir(), "aif-reviewer-synthesis-generic-bypass-"));
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
        id: "project-synthesis-generic-bypass",
        name: "Synthesis Generic Bypass",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values([
        {
          id: "task-source-report-generic-bypass",
          projectId: "project-synthesis-generic-bypass",
          title: "Audit source",
          description: "Scope: src/config.ts\nReport artifact: audit/source-audit.md",
          taskIntent: "audit",
          status: "done",
          useSubagents: true,
        },
        {
          id: "task-synthesis-generic-bypass",
          projectId: "project-synthesis-generic-bypass",
          title: "Synthesize audit findings",
          description: "Scope: src/config.ts\nReport artifact: audit/summary.md",
          taskIntent: "audit",
          status: "review",
          useSubagents: true,
          implementationLog:
            "Deterministic audit synthesis completed from validated report artifacts.",
        },
      ])
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "project-synthesis-generic-bypass",
      roadmapAlias: "audit-synthesis-generic-bypass",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-source-report-generic-bypass", "task-synthesis-generic-bypass"],
      artifacts: [
        {
          taskId: "task-source-report-generic-bypass",
          role: "report",
          artifactPath: "audit/source-audit.md",
        },
        {
          taskId: "task-synthesis-generic-bypass",
          role: "synthesis",
          artifactPath: "audit/summary.md",
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-source-report-generic-bypass",
      state: "valid",
      failureFamily: null,
      classification: "validated_findings_present",
      validationDetails: {
        auditReportValidation: {
          manifestStatus: "valid",
          sourceClassification: "validated_findings_present",
        },
        auditArtifactLifecycle: validAuditArtifactLifecycleEvidence("validated_findings_present"),
      },
    });

    const auditPlanId = resolveAuditPlanId({
      taskId: "task-synthesis-generic-bypass",
      roadmapBatchId: batch.batchId,
    });
    const sourceSnapshotId = deriveAuditSourceSnapshotId(projectRoot);
    appendAuditEvidenceEvent(
      buildAuditEvidenceUnit(
        {
          taskId: "task-synthesis-generic-bypass",
          auditPlanId,
          sourceSnapshotId,
          scopeIds: ["src/config.ts"],
          riskHypothesisIds: ["risk-1"],
        },
        buildAuditEvidencePayload({
          id: "ev-synthesis-generic-bypass",
          toolName: "rg",
          evidenceKind: "search",
          evidenceGrade: "substantive",
          scopeIds: ["src/config.ts"],
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
      "# Audit Summary",
      "",
      formatAuditSynthesisOutcomeForArtifact({
        kind: "validated_no_findings",
        reason: "No findings survived validation across trusted source reports.",
        sourceReportCount: 1,
        validatedFindingCount: 0,
        substantiveNoFindingsReportCount: 1,
        inventoryOnlyNoFindingsReportCount: 0,
        weakReportCount: 0,
      }),
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` was covered and is absent.",
      "",
      "## Evidence Register",
      "",
      "| Scope | Checked evidence | Verification |",
      "| --- | --- | --- |",
      '| `src/config.ts` | `src/config.ts:1`, source report `audit/source-audit.md` | Command `rg -n "timeoutMs" src/config.ts` output includes `src/config.ts:1:export const timeoutMs = 1000;` |',
      "",
      "## Checked Files",
      "",
      "- `src/config.ts:1`",
      "- Source report provenance: `audit/source-audit.md`",
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
      taskId: "task-synthesis-generic-bypass",
      batchId: batch.batchId,
      roadmapAlias: "audit-synthesis-generic-bypass",
      artifactPath: "audit/summary.md",
      contentSha256: computeAuditReportContentSha256(body),
      sourceSnapshot,
      outcome: "validated_no_findings",
      scopeCoverage: [
        { root: "src/config.ts", covered: true, evidenceRefs: ["ev-synthesis-generic-bypass"] },
      ],
      riskHypotheses: [
        {
          id: "risk-1",
          description: "Synthesis source report coverage",
          scopeIds: ["src/config.ts"],
          status: "covered",
          evidenceRefs: ["ev-synthesis-generic-bypass"],
        },
      ],
      findings: [],
      noFindingsClaims: [
        {
          id: "nf-1",
          scopeIds: ["src/config.ts"],
          riskIds: ["risk-1"],
          evidenceRefs: ["ev-synthesis-generic-bypass"],
        },
      ],
      evidenceRefs: ["ev-synthesis-generic-bypass"],
    };
    writeFileSync(
      join(projectRoot, "audit", "summary.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
      "utf8",
    );

    await runReviewer("task-synthesis-generic-bypass", projectRoot);

    expectAuditSpecializedFanoutCalls();
    const storedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-synthesis-generic-bypass"))
      .get();
    expect(storedTask?.reviewComments).not.toContain(
      "- Deterministic Review: audit_synthesis_validation",
    );
    expect(storedTask?.reviewComments).not.toContain(
      "- Deterministic Review: audit_report_validation",
    );
  });

  it("accepts trusted deterministic synthesis when source report command evidence lives outside the checkout", async () => {
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => {
      if (isSpecializedReviewerAgent(input.agentName)) {
        return { resultText: passingSpecializedRoleOutput() };
      }
      throw new Error("base sidecar should not run");
    });

    const projectRoot = mkdtempSync(join(tmpdir(), "aif-reviewer-synthesis-trusted-"));
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
    writeFileSync(join(projectRoot, "src", "config.ts"), "export const retries = 2;\n", "utf8");
    execFileSync("git", ["add", "src/config.ts"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "project-synthesis-trusted-reviewer",
        name: "Trusted Synthesis Reviewer",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values([
        {
          id: "task-source-a",
          projectId: "project-synthesis-trusted-reviewer",
          title: "Audit source A",
          description: "Scope: src/config.ts\nReport artifact: audit/source-a.md",
          taskIntent: "audit",
          status: "done",
          useSubagents: true,
        },
        {
          id: "task-source-b",
          projectId: "project-synthesis-trusted-reviewer",
          title: "Audit source B",
          description: "Scope: src/config.ts\nReport artifact: audit/source-b.md",
          taskIntent: "audit",
          status: "done",
          useSubagents: true,
        },
        {
          id: "task-synthesis-trusted-reviewer",
          projectId: "project-synthesis-trusted-reviewer",
          title: "Synthesize audit findings",
          description: "Scope: src/config.ts\nReport artifact: audit/summary.md",
          taskIntent: "audit",
          status: "review",
          useSubagents: true,
          implementationLog:
            "Deterministic audit synthesis completed from validated report artifacts on producer branches.",
        },
      ])
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "project-synthesis-trusted-reviewer",
      roadmapAlias: "audit-synthesis-trusted-reviewer",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-source-a", "task-source-b", "task-synthesis-trusted-reviewer"],
      artifacts: [
        { taskId: "task-source-a", role: "report", artifactPath: "audit/source-a.md" },
        { taskId: "task-source-b", role: "report", artifactPath: "audit/source-b.md" },
        {
          taskId: "task-synthesis-trusted-reviewer",
          role: "synthesis",
          artifactPath: "audit/summary.md",
        },
      ],
    });
    for (const taskId of ["task-source-a", "task-source-b"]) {
      updateRoadmapBatchArtifactState({
        taskId,
        state: "valid",
        failureFamily: null,
        classification: "validated_no_findings",
        validationDetails: trustedAuditReportValidationDetails("validated_no_findings"),
      });
    }

    const auditPlanId = resolveAuditPlanId({
      taskId: "task-synthesis-trusted-reviewer",
      roadmapBatchId: batch.batchId,
    });
    const sourceSnapshotId = deriveAuditSourceSnapshotId(projectRoot);
    appendAuditEvidenceEvent(
      buildAuditEvidenceUnit(
        {
          taskId: "task-synthesis-trusted-reviewer",
          auditPlanId,
          sourceSnapshotId,
          scopeIds: ["audit/source-a.md", "audit/source-b.md"],
          riskHypothesisIds: ["risk-deterministic-synthesis-no-findings"],
        },
        buildAuditEvidencePayload({
          id: "ev-synthesis-trusted",
          toolName: "deterministic_audit_synthesis",
          evidenceKind: "shell_command",
          evidenceGrade: "substantive",
          scopeIds: ["audit/source-a.md", "audit/source-b.md"],
          riskHypothesisIds: ["risk-deterministic-synthesis-no-findings"],
          paths: ["audit/source-a.md", "audit/source-b.md"],
          command: "deterministic-audit-synthesis --artifact audit/summary.md",
          exitCode: 0,
          output:
            "summaryArtifact=audit/summary.md\nsourceReportCount=2\nweakOrInvalidReportCount=0",
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
      "# Audit Summary",
      "",
      formatAuditSynthesisOutcomeForArtifact({
        kind: "validated_no_findings",
        reason:
          "No findings survived validation and all source reports included substantive no-findings evidence.",
        sourceReportCount: 2,
        validatedFindingCount: 0,
        substantiveNoFindingsReportCount: 2,
        inventoryOnlyNoFindingsReportCount: 0,
        weakReportCount: 0,
      }),
      "",
      "No validated findings.",
      "Risk hypotheses: risk-deterministic-synthesis-no-findings for retries evidence from trusted source reports was covered and absent.",
      "Audit outcome: Validated no-findings with substantive audit evidence.",
      "Absence reasoning: risk-deterministic-synthesis-no-findings trusted source reports `audit/source-a.md`, `audit/source-b.md` were each classified as validated_no_findings with substantive child evidence.",
      "",
      "## Evidence Register",
      "",
      "| Source report | Checked evidence | Verification |",
      "| --- | --- | --- |",
      "| `audit/source-a.md` | `src/config.ts:1` | - Command `git grep -n retries -- src/config.ts` output: ``` src/config.ts:1:export const retries = 2; ``` |",
      "| `audit/source-b.md` | `src/config.ts:1` | - Command `git grep -n retries -- src/config.ts` output: ``` src/config.ts:1:export const retries = 2; ``` |",
      "",
      "## Checked Files",
      "",
      "- `src/config.ts:1`",
      "",
      "## Checked Commands",
      "",
      "- Command `git grep -n retries -- src/config.ts` output:",
      "```",
      "src/config.ts:1:export const retries = 2;",
      "```",
    ].join("\n");
    const manifest = {
      version: 1,
      auditPlanId,
      taskId: "task-synthesis-trusted-reviewer",
      batchId: batch.batchId,
      roadmapAlias: "audit-synthesis-trusted-reviewer",
      artifactPath: "audit/summary.md",
      contentSha256: computeAuditReportContentSha256(body),
      sourceSnapshot,
      outcome: "validated_no_findings",
      scopeCoverage: [
        { root: "audit/source-a.md", covered: true, evidenceRefs: ["ev-synthesis-trusted"] },
        { root: "audit/source-b.md", covered: true, evidenceRefs: ["ev-synthesis-trusted"] },
      ],
      riskHypotheses: [
        {
          id: "risk-deterministic-synthesis-no-findings",
          description:
            "Trusted source audit reports contain no validated findings that survived deterministic synthesis.",
          scopeIds: ["audit/source-a.md", "audit/source-b.md"],
          status: "covered",
          evidenceRefs: ["ev-synthesis-trusted"],
        },
      ],
      findings: [],
      noFindingsClaims: [
        {
          id: "nf-deterministic-synthesis",
          scopeIds: ["audit/source-a.md", "audit/source-b.md"],
          riskIds: ["risk-deterministic-synthesis-no-findings"],
          evidenceRefs: ["ev-synthesis-trusted"],
        },
      ],
      evidenceRefs: ["ev-synthesis-trusted"],
    };
    writeFileSync(
      join(projectRoot, "audit", "summary.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
      "utf8",
    );

    await runReviewer("task-synthesis-trusted-reviewer", projectRoot);

    expectDeterministicAuditReviewOnlyCalls();
    const storedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-synthesis-trusted-reviewer"))
      .get();
    expect(storedTask?.reviewComments).toContain(
      "- Deterministic Review: audit_synthesis_validation",
    );
    expect(storedTask?.reviewComments).toContain(
      "weak or untrusted source reports were not promoted",
    );
    expect(storedTask?.agentActivityLog).toContain(
      "Agent: review stage complete (deterministic audit synthesis)",
    );
  });

  it("falls back to sidecars when synthesis outcome metadata lacks a valid manifest", async () => {
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => ({
      resultText: passingReviewerOutputForAgent(input.agentName),
    }));

    const { db, projectRoot, synthesisTaskId } = seedTrustedSynthesisReviewerFixture({
      idSuffix: "missing-manifest",
      includeManifest: false,
    });

    await runReviewer(synthesisTaskId, projectRoot);

    expectAuditSpecializedFanoutCalls();
    const storedTask = db.select().from(tasks).where(eq(tasks.id, synthesisTaskId)).get();
    expect(storedTask?.reviewComments).not.toContain(
      "- Deterministic Review: audit_synthesis_validation",
    );
  });

  it("falls back to sidecars when prior sidecar blockers exist for trusted synthesis", async () => {
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => ({
      resultText: passingReviewerOutputForAgent(
        input.agentName,
        input.agentName.includes("security") ? ["sec-prior"] : [],
      ),
    }));

    const { db, projectRoot, synthesisTaskId } = seedTrustedSynthesisReviewerFixture({
      idSuffix: "prior-sidecar",
      previousFindings: [
        {
          id: "sec-prior",
          source: "security_audit",
          text: "Prior security review blocker must not be closed by deterministic synthesis alone.",
        },
      ],
    });

    await runReviewer(synthesisTaskId, projectRoot);

    expectAuditSpecializedFanoutCalls();
    const storedTask = db.select().from(tasks).where(eq(tasks.id, synthesisTaskId)).get();
    expect(storedTask?.reviewComments).not.toContain(
      "- Deterministic Review: audit_synthesis_validation",
    );
    expect(storedTask?.reviewComments).toContain("[sec-prior] security_audit | resolved");
  });

  it("falls back to sidecars when source classifications contradict no-findings synthesis", async () => {
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => ({
      resultText: passingReviewerOutputForAgent(input.agentName),
    }));

    const { db, projectRoot, synthesisTaskId } = seedTrustedSynthesisReviewerFixture({
      idSuffix: "classification-mismatch",
      sourceClassifications: ["validated_findings_present", "validated_no_findings"],
    });

    await runReviewer(synthesisTaskId, projectRoot);

    expectAuditSpecializedFanoutCalls();
    const storedTask = db.select().from(tasks).where(eq(tasks.id, synthesisTaskId)).get();
    expect(storedTask?.reviewComments).not.toContain(
      "- Deterministic Review: audit_synthesis_validation",
    );
  });

  it("accepts terminal inconclusive synthesis deterministically without sidecars", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "aif-reviewer-inconclusive-synthesis-"));
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
    writeFileSync(join(projectRoot, "README.md"), "# test\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "project-inconclusive-synthesis-reviewer",
        name: "Inconclusive Synthesis Reviewer",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values([
        {
          id: "task-source-inconclusive",
          projectId: "project-inconclusive-synthesis-reviewer",
          title: "Audit source inconclusive",
          description: "Report artifact: audit/source.md",
          taskIntent: "audit",
          status: "done",
          useSubagents: true,
        },
        {
          id: "task-synthesis-inconclusive-reviewer",
          projectId: "project-inconclusive-synthesis-reviewer",
          title: "Synthesize audit findings",
          description: "Report artifact: audit/summary.md",
          taskIntent: "audit",
          status: "review",
          useSubagents: true,
          implementationLog:
            "Deterministic audit synthesis completed as terminal source_inconclusive.",
          autoReviewStateJson: JSON.stringify({
            strategy: "full_re_review",
            iteration: 2,
            findings: [
              {
                id: "review-1",
                source: "review_gate",
                text: "Prior model review claimed the synthesis needed source validation.",
              },
            ],
          }),
        },
      ])
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "project-inconclusive-synthesis-reviewer",
      roadmapAlias: "audit-inconclusive-reviewer",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-source-inconclusive", "task-synthesis-inconclusive-reviewer"],
      artifacts: [
        { taskId: "task-source-inconclusive", role: "report", artifactPath: "audit/source.md" },
        {
          taskId: "task-synthesis-inconclusive-reviewer",
          role: "synthesis",
          artifactPath: "audit/summary.md",
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-source-inconclusive",
      state: "source_inconclusive",
      failureFamily: "source_inconclusive",
      classification: "source_inconclusive",
      reworkStatus: "terminal_inconclusive",
      validationDetails: {
        sourceClassification: "source_inconclusive",
      },
    });

    const auditPlanId = resolveAuditPlanId({
      taskId: "task-synthesis-inconclusive-reviewer",
      roadmapBatchId: batch.batchId,
    });
    const sourceSnapshotId = deriveAuditSourceSnapshotId(projectRoot);
    appendAuditEvidenceEvent(
      buildAuditEvidenceUnit(
        {
          taskId: "task-synthesis-inconclusive-reviewer",
          auditPlanId,
          sourceSnapshotId,
          scopeIds: ["audit/source.md"],
          riskHypothesisIds: ["risk-inconclusive"],
        },
        buildAuditEvidencePayload({
          id: "ev-synthesis-inconclusive",
          toolName: "deterministic_audit_synthesis",
          evidenceKind: "shell_command",
          evidenceGrade: "substantive",
          scopeIds: ["audit/source.md"],
          riskHypothesisIds: ["risk-inconclusive"],
          paths: ["audit/source.md"],
          command: "deterministic-audit-synthesis --artifact audit/summary.md",
          exitCode: 0,
          output: "summaryArtifact=audit/summary.md\nsourceReportCount=0\nweakReportCount=1",
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
      "# Audit Inconclusive",
      "",
      formatAuditSynthesisOutcomeForArtifact({
        kind: "source_inconclusive",
        reason: "Audit inconclusive: source reports are terminal non-trusted.",
        sourceReportCount: 0,
        validatedFindingCount: 0,
        substantiveNoFindingsReportCount: 0,
        inventoryOnlyNoFindingsReportCount: 0,
        weakReportCount: 1,
      }),
      "",
      "Audit outcome: Audit inconclusive",
      "",
      "## Child Report Status",
      "",
      "| Source report | Task | Status | Notes |",
      "| --- | --- | --- | --- |",
      "| `audit/source.md` | `task-source-inconclusive` | source_inconclusive | terminal non-trusted |",
      "",
      "## Checked Files",
      "- `README.md:1`",
    ].join("\n");
    const manifest = {
      version: 2,
      auditPlanId,
      taskId: "task-synthesis-inconclusive-reviewer",
      batchId: batch.batchId,
      roadmapAlias: "audit-inconclusive-reviewer",
      artifactPath: "audit/summary.md",
      contentSha256: computeAuditReportContentSha256(body),
      sourceSnapshot,
      outcome: "source_inconclusive",
      scopeCoverage: [
        { root: "audit/source.md", covered: true, evidenceRefs: ["ev-synthesis-inconclusive"] },
      ],
      riskHypotheses: [
        {
          id: "risk-inconclusive",
          description: "Source report was terminal non-trusted.",
          scopeIds: ["audit/source.md"],
          status: "covered",
          evidenceRefs: ["ev-synthesis-inconclusive"],
        },
      ],
      findings: [],
      noFindingsClaims: [],
      evidenceRefs: ["ev-synthesis-inconclusive"],
    };
    writeFileSync(
      join(projectRoot, "audit", "summary.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
      "utf8",
    );

    await runReviewer("task-synthesis-inconclusive-reviewer", projectRoot);

    expectDeterministicAuditReviewOnlyCalls();
    const storedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-synthesis-inconclusive-reviewer"))
      .get();
    expect(storedTask?.reviewComments).toContain(
      "- Deterministic Review: audit_synthesis_inconclusive",
    );
    expect(storedTask?.reviewComments).toContain("## Blocking Findings");
    expect(storedTask?.reviewComments).toContain("- none");
    expect(storedTask?.reviewComments).toContain("[review-1] review_gate | resolved");
    expect(storedTask?.reviewComments).toContain("terminal audit inconclusive");
    expect(batch.batchId).toBeTruthy();
  });

  it("falls back to sidecars when inconclusive synthesis contradicts trusted source reports", async () => {
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => ({
      resultText: passingReviewerOutputForAgent(input.agentName),
    }));

    const { db, projectRoot, synthesisTaskId, batchId } = seedTrustedSynthesisReviewerFixture({
      idSuffix: "inconclusive-source-mismatch",
    });
    const auditPlanId = resolveAuditPlanId({
      taskId: synthesisTaskId,
      roadmapBatchId: batchId,
    });
    const sourceSnapshotId = deriveAuditSourceSnapshotId(projectRoot);
    const [snapshotKind, snapshotCommit, snapshotTree] = sourceSnapshotId.split(":");
    const sourceSnapshot = {
      id: sourceSnapshotId,
      commit: snapshotKind === "git" ? snapshotCommit : null,
      tree: snapshotKind === "git" ? snapshotTree : null,
      dirty: false,
    };
    const evidenceId = "ev-synthesis-inconclusive-source-mismatch";
    const body = [
      "# Audit Inconclusive",
      "",
      formatAuditSynthesisOutcomeForArtifact({
        kind: "source_inconclusive",
        reason: "Audit inconclusive: source reports are terminal non-trusted.",
        sourceReportCount: 2,
        validatedFindingCount: 0,
        substantiveNoFindingsReportCount: 0,
        inventoryOnlyNoFindingsReportCount: 0,
        weakReportCount: 0,
      }),
      "",
      "Audit outcome: Audit inconclusive",
      "",
      "## Child Report Status",
      "",
      "| Source report | Task | Status | Notes |",
      "| --- | --- | --- | --- |",
      "| `audit/source-a.md` | source A | source_inconclusive | stale synthesis claim |",
      "| `audit/source-b.md` | source B | source_inconclusive | stale synthesis claim |",
    ].join("\n");
    const manifest = {
      version: 2,
      auditPlanId,
      taskId: synthesisTaskId,
      batchId,
      roadmapAlias: "audit-synthesis-inconclusive-source-mismatch",
      artifactPath: "audit/summary.md",
      contentSha256: computeAuditReportContentSha256(body),
      sourceSnapshot,
      outcome: "source_inconclusive",
      scopeCoverage: [
        { root: "audit/source-a.md", covered: true, evidenceRefs: [evidenceId] },
        { root: "audit/source-b.md", covered: true, evidenceRefs: [evidenceId] },
      ],
      riskHypotheses: [
        {
          id: "risk-inconclusive-source-mismatch",
          description: "Stale synthesis claims trusted source reports were terminal.",
          scopeIds: ["audit/source-a.md", "audit/source-b.md"],
          status: "covered",
          evidenceRefs: [evidenceId],
        },
      ],
      findings: [],
      noFindingsClaims: [],
      evidenceRefs: [evidenceId],
    };
    appendAuditEvidenceEvent(
      buildAuditEvidenceUnit(
        {
          taskId: synthesisTaskId,
          auditPlanId,
          sourceSnapshotId,
          scopeIds: ["audit/source-a.md", "audit/source-b.md"],
          riskHypothesisIds: ["risk-inconclusive-source-mismatch"],
        },
        buildAuditEvidencePayload({
          id: evidenceId,
          toolName: "deterministic_audit_synthesis",
          evidenceKind: "shell_command",
          evidenceGrade: "substantive",
          scopeIds: ["audit/source-a.md", "audit/source-b.md"],
          riskHypothesisIds: ["risk-inconclusive-source-mismatch"],
          paths: ["audit/source-a.md", "audit/source-b.md"],
          command: "deterministic-audit-synthesis --artifact audit/summary.md",
          exitCode: 0,
          output: "summaryArtifact=audit/summary.md\nsourceReportCount=2\nweakReportCount=0",
        }),
      ),
    );
    writeFileSync(
      join(projectRoot, "audit", "summary.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
      "utf8",
    );

    await runReviewer(synthesisTaskId, projectRoot);

    expectAuditSpecializedFanoutCalls();
    const storedTask = db.select().from(tasks).where(eq(tasks.id, synthesisTaskId)).get();
    expect(storedTask?.reviewComments).not.toContain(
      "- Deterministic Review: audit_synthesis_inconclusive",
    );
  });

  it("falls back to sidecars for inconclusive synthesis with prior sidecar blockers", async () => {
    executeSubagentQueryMock.mockImplementation(async (input: { agentName: string }) => ({
      resultText: passingReviewerOutputForAgent(
        input.agentName,
        input.agentName.includes("security") ? ["sec-inconclusive"] : [],
      ),
    }));

    const projectRoot = mkdtempSync(join(tmpdir(), "aif-reviewer-inconclusive-sidecar-"));
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
    writeFileSync(join(projectRoot, "README.md"), "# test\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: projectRoot, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "seed", "--no-verify"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "project-inconclusive-sidecar",
        name: "Inconclusive Sidecar Reviewer",
        rootPath: projectRoot,
      })
      .run();
    db.insert(tasks)
      .values([
        {
          id: "task-source-inconclusive-sidecar",
          projectId: "project-inconclusive-sidecar",
          title: "Audit source inconclusive",
          description: "Report artifact: audit/source.md",
          taskIntent: "audit",
          status: "done",
          useSubagents: true,
        },
        {
          id: "task-synthesis-inconclusive-sidecar",
          projectId: "project-inconclusive-sidecar",
          title: "Synthesize audit findings",
          description: "Report artifact: audit/summary.md",
          taskIntent: "audit",
          status: "review",
          useSubagents: true,
          implementationLog:
            "Deterministic audit synthesis completed as terminal source_inconclusive.",
          autoReviewStateJson: JSON.stringify({
            strategy: "full_re_review",
            iteration: 2,
            findings: [
              {
                id: "sec-inconclusive",
                source: "security_audit",
                text: "Prior security blocker must be reviewed by the security sidecar.",
              },
            ],
          }),
        },
      ])
      .run();
    const batch = createRoadmapBatchContract({
      projectId: "project-inconclusive-sidecar",
      roadmapAlias: "audit-inconclusive-sidecar",
      taskIntent: "audit",
      executionPolicy: "serialized_shared_checkout",
      createdTaskIds: ["task-source-inconclusive-sidecar", "task-synthesis-inconclusive-sidecar"],
      artifacts: [
        {
          taskId: "task-source-inconclusive-sidecar",
          role: "report",
          artifactPath: "audit/source.md",
        },
        {
          taskId: "task-synthesis-inconclusive-sidecar",
          role: "synthesis",
          artifactPath: "audit/summary.md",
        },
      ],
    });
    updateRoadmapBatchArtifactState({
      taskId: "task-source-inconclusive-sidecar",
      state: "source_inconclusive",
      failureFamily: "source_inconclusive",
      classification: "source_inconclusive",
      reworkStatus: "terminal_inconclusive",
      validationDetails: {
        sourceClassification: "source_inconclusive",
      },
    });

    const auditPlanId = resolveAuditPlanId({
      taskId: "task-synthesis-inconclusive-sidecar",
      roadmapBatchId: batch.batchId,
    });
    const sourceSnapshotId = deriveAuditSourceSnapshotId(projectRoot);
    appendAuditEvidenceEvent(
      buildAuditEvidenceUnit(
        {
          taskId: "task-synthesis-inconclusive-sidecar",
          auditPlanId,
          sourceSnapshotId,
          scopeIds: ["audit/source.md"],
          riskHypothesisIds: ["risk-inconclusive"],
        },
        buildAuditEvidencePayload({
          id: "ev-synthesis-inconclusive-sidecar",
          toolName: "deterministic_audit_synthesis",
          evidenceKind: "shell_command",
          evidenceGrade: "substantive",
          scopeIds: ["audit/source.md"],
          riskHypothesisIds: ["risk-inconclusive"],
          paths: ["audit/source.md"],
          command: "deterministic-audit-synthesis --artifact audit/summary.md",
          exitCode: 0,
          output: "summaryArtifact=audit/summary.md\nsourceReportCount=0\nweakReportCount=1",
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
      "# Audit Inconclusive",
      "",
      formatAuditSynthesisOutcomeForArtifact({
        kind: "source_inconclusive",
        reason: "Audit inconclusive: source reports are terminal non-trusted.",
        sourceReportCount: 0,
        validatedFindingCount: 0,
        substantiveNoFindingsReportCount: 0,
        inventoryOnlyNoFindingsReportCount: 0,
        weakReportCount: 1,
      }),
      "",
      "Audit outcome: Audit inconclusive",
      "",
      "## Child Report Status",
      "",
      "| Source report | Task | Status | Notes |",
      "| --- | --- | --- | --- |",
      "| `audit/source.md` | `task-source-inconclusive-sidecar` | source_inconclusive | terminal non-trusted |",
    ].join("\n");
    const manifest = {
      version: 2,
      auditPlanId,
      taskId: "task-synthesis-inconclusive-sidecar",
      batchId: batch.batchId,
      roadmapAlias: "audit-inconclusive-sidecar",
      artifactPath: "audit/summary.md",
      contentSha256: computeAuditReportContentSha256(body),
      sourceSnapshot,
      outcome: "source_inconclusive",
      scopeCoverage: [
        {
          root: "audit/source.md",
          covered: true,
          evidenceRefs: ["ev-synthesis-inconclusive-sidecar"],
        },
      ],
      riskHypotheses: [
        {
          id: "risk-inconclusive",
          description: "Source report was terminal non-trusted.",
          scopeIds: ["audit/source.md"],
          status: "covered",
          evidenceRefs: ["ev-synthesis-inconclusive-sidecar"],
        },
      ],
      findings: [],
      noFindingsClaims: [],
      evidenceRefs: ["ev-synthesis-inconclusive-sidecar"],
    };
    writeFileSync(
      join(projectRoot, "audit", "summary.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
      "utf8",
    );

    await runReviewer("task-synthesis-inconclusive-sidecar", projectRoot);

    expectAuditSpecializedFanoutCalls();
    const storedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, "task-synthesis-inconclusive-sidecar"))
      .get();
    expect(storedTask?.reviewComments).not.toContain(
      "- Deterministic Review: audit_synthesis_inconclusive",
    );
    expect(storedTask?.reviewComments).toContain("[sec-inconclusive] security_audit | resolved");
  });
});
