import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUDIT_NO_FINDINGS_PROOF_GUARDRAIL,
  AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT,
  AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT,
  projects,
} from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };
vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

const mockRunApiRuntimeOneShot = vi.fn();
vi.mock("../services/runtime.js", () => ({
  runApiRuntimeOneShot: (...args: unknown[]) => mockRunApiRuntimeOneShot(...args),
  resolveApiLightModel: async () => "test-light-model",
}));

const { generateRoadmapFile, generateRoadmapTasks, importGeneratedTasks } =
  await import("../services/roadmapGeneration.js");
const { findTasksByRoadmapAlias, listRoadmapBatchArtifacts } = await import("@aif/data");

function createProject(description = "# Test Project\nA service to audit") {
  const tmpDir = mkdtempSync(join(tmpdir(), "aif-plan-b-api-"));
  mkdirSync(join(tmpDir, ".ai-factory"), { recursive: true });
  writeFileSync(join(tmpDir, ".ai-factory", "DESCRIPTION.md"), description, "utf8");
  writeFileSync(join(tmpDir, "README.md"), "# Test Project\n", "utf8");
  writeFileSync(join(tmpDir, "package.json"), '{"scripts":{"test":"vitest"}}\n', "utf8");
  mkdirSync(join(tmpDir, "packages", "api", "src"), { recursive: true });
  mkdirSync(join(tmpDir, "packages", "shared", "src"), { recursive: true });
  writeFileSync(join(tmpDir, "packages", "api", "src", "index.ts"), "export const api = true;\n");
  writeFileSync(
    join(tmpDir, "packages", "shared", "src", "index.ts"),
    "export const shared = true;\n",
  );

  const projectId = crypto.randomUUID();
  testDb.current
    .insert(projects)
    .values({
      id: projectId,
      name: "Plan B API",
      rootPath: tmpDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();
  return { projectId, tmpDir };
}

function validAuditRoadmapContent(): string {
  const common = [
    "Audit mandate: Act as the owner and find actionable technical-quality risks.",
    "Allowed changes: only create/update one report artifact.",
    "Acceptance criteria: inspect scoped files and record findings or no validated findings.",
    "Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
    "Manifest requirements: include a fenced audit-report-manifest JSON block with version 1, outcome, scopeCoverage, riskHypotheses, findings or noFindingsClaims, and evidenceRefs.",
    "Evidence ID rule: manifest evidenceRefs must cite actual runtime audit ledger IDs (ev_*) only; finding labels such as AOB-001 are never evidenceRefs.",
    "Path rule: every repository reference must use an existing scoped path plus line/range; do not use basename-only references such as config.py.",
    'Quality bar: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims are not findings.',
    "Rejected finding shapes: line counts, import counts, duplicated initialization/DRY/refactor-helper claims, import-chain/tight-coupling claims without a real cycle, and private-method/direct-store/abstraction-bypass smells are not trusted findings.",
    "Inconclusive rule: a partially inspected source_inconclusive observation is not a finding.",
    'No-findings rule: if no actionable finding is found, write "No validated findings" plus checked files and commands with observed outputs.',
    AUDIT_NO_FINDINGS_PROOF_GUARDRAIL,
    AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT,
    "Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.",
    "Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
    "Evidence: packages/api/src/index.ts:1",
    "Risk: API entrypoint may drift.",
    "Proposed fix: tighten the contract.",
    "Verification: Command rg api packages/api/src/index.ts output matched.",
  ];
  return [
    "# Project Audit Roadmap",
    "",
    "## Audit Tasks",
    "",
    "- [ ] **Audit: API entrypoint** - Diagnostic-only audit.",
    "  - Scope: packages/api/src/index.ts",
    "  - Risk hypotheses: risk-api packages/api/src/index.ts may contain unsafe exports.",
    "  - Report artifact: audit/2026-05-13-api-entrypoint-audit.md",
    ...common.map((line) => `  - ${line}`),
    "",
    "- [ ] **Synthesize audit findings** - Diagnostic-only audit.",
    "  - Scope: all audit/2026-05-13-*-audit.md reports from this audit batch.",
    "  - Audit mandate: Act as the synthesis owner and combine only validated child report evidence.",
    "  - Allowed changes: only create/update one report artifact.",
    "  - Report artifact: audit/2026-05-13-summary.md",
    "  - Acceptance criteria: summarize child reports and keep weak reports inconclusive.",
    "  - Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
    "  - Manifest requirements: include a fenced audit-report-manifest JSON block with version 1, outcome, scopeCoverage, riskHypotheses, findings or noFindingsClaims, and evidenceRefs.",
    "  - Evidence ID rule: manifest evidenceRefs must cite actual runtime audit ledger IDs (ev_*) only; finding labels such as AOB-001 are never evidenceRefs.",
    "  - Path rule: every repository reference must use an existing scoped path plus line/range; do not use basename-only references such as config.py.",
    '  - Quality bar: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims are not findings.',
    "  - Rejected finding shapes: line counts, import counts, duplicated initialization/DRY/refactor-helper claims, import-chain/tight-coupling claims without a real cycle, and private-method/direct-store/abstraction-bypass smells are not trusted findings.",
    "  - Inconclusive rule: a partially inspected source_inconclusive observation is not a finding.",
    '  - No-findings rule: if no actionable finding is found, write "No validated findings" plus checked files and commands with observed outputs.',
    `  - ${AUDIT_NO_FINDINGS_PROOF_GUARDRAIL}`,
    `  - ${AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT}`,
    `  - ${AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT}`,
    "  - Child report status: final synthesis must include a table listing every source report artifact with status passed, failed, or inconclusive and must not claim a stronger outcome than child reports support.",
    "  - Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.",
    "  - Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
    "  - Evidence: packages/api/src/index.ts:1",
    "  - Risk: synthesis may overclaim.",
    "  - Proposed fix: preserve child outcome limits.",
    "  - Verification: Command rg api packages/api/src/index.ts output matched.",
  ].join("\n");
}

describe("Plan B API regression contract", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    mockRunApiRuntimeOneShot.mockReset();
  });

  it("falls back from invalid broad audit model output to scoped reports plus one synthesis card", async () => {
    const { projectId, tmpDir } = createProject();
    mockRunApiRuntimeOneShot.mockResolvedValue({
      result: {
        outputText: [
          "# Project Audit Roadmap",
          "",
          "## Audit Tasks",
          "",
          "- [ ] **Initial Audit & Inventory** - Review the whole codebase and plan fixes.",
        ].join("\n"),
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
      },
      context: {},
    });

    const file = await generateRoadmapFile({
      projectId,
      roadmapAlias: "audit-plan-b",
      taskIntent: "audit",
      vision: "Audit the whole repository for security, performance, correctness, and ops.",
    });
    const tasks = await generateRoadmapTasks({
      projectId,
      roadmapAlias: "audit-plan-b",
      taskIntent: "audit",
    });

    expect(readFileSync(join(tmpDir, ".ai-factory", "ROADMAP.md"), "utf8")).toBe(file.content);
    expect(tasks.tasks.filter((task) => /synthes/i.test(task.title))).toHaveLength(1);
    const reportTasks = tasks.tasks.filter((task) => !/synthes/i.test(task.title));
    expect(reportTasks.length).toBeGreaterThanOrEqual(2);

    for (const task of reportTasks) {
      expect(task.description).toContain("Scope:");
      expect(task.description).toMatch(/Scope: (?!\.($|\s|,))/);
      expect(task.description).toContain("Risk hypotheses:");
      expect(task.description).toContain("Report artifact: audit/");
      expect(task.description).toContain("Allowed changes: only create/update audit/");
      expect(task.description).toContain("diagnostic-only");
      expect(task.description).toContain("do not implement fixes");
      expect(task.description).toContain(AUDIT_NO_FINDINGS_PROOF_GUARDRAIL);
      expect(task.description).toContain(AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT);
      expect(task.description).toContain("Evidence requirements:");
      expect(task.description).toContain("No-findings rule:");
      expect(task.description).not.toContain("Initial Audit & Inventory");
    }

    const synthesis = tasks.tasks.find((task) => /synthes/i.test(task.title));
    expect(synthesis?.description).toContain(AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT);
    expect(synthesis?.description).toContain("Child report status:");
  });

  it("converts valid audit roadmaps deterministically without calling the extraction model", async () => {
    const { projectId, tmpDir } = createProject();
    writeFileSync(join(tmpDir, ".ai-factory", "ROADMAP.md"), validAuditRoadmapContent(), "utf8");

    const result = await generateRoadmapTasks({
      projectId,
      roadmapAlias: "audit-valid",
      taskIntent: "audit",
    });

    expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    expect(result.taskIntent).toBe("audit");
    expect(result.tasks.map((task) => task.title)).toEqual([
      "Audit: API entrypoint",
      "Synthesize audit findings",
    ]);
  });

  it("imports audit tasks as report/synthesis artifacts and pauses synthesis until reports validate", async () => {
    const { projectId, tmpDir } = createProject();
    writeFileSync(join(tmpDir, ".ai-factory", "ROADMAP.md"), validAuditRoadmapContent(), "utf8");
    const generation = await generateRoadmapTasks({
      projectId,
      roadmapAlias: "audit-import",
      taskIntent: "audit",
    });

    const imported = importGeneratedTasks(projectId, generation);
    const stored = findTasksByRoadmapAlias(projectId, "audit-import");
    const synthesis = stored.find((task) => /synthes/i.test(task.title));
    const reports = stored.filter((task) => !/synthes/i.test(task.title));

    expect(imported.created).toBe(2);
    expect(imported.batchSummary).toMatchObject({
      roadmapAlias: "audit-import",
      taskIntent: "audit",
      synthesisReady: false,
      counts: expect.objectContaining({ total: 2 }),
    });
    expect(synthesis).toMatchObject({
      paused: true,
      blockedReason: "synthesis_not_ready: waiting for validated audit batch artifacts",
      taskIntent: "audit",
    });
    for (const report of reports) {
      expect(report).toMatchObject({
        taskIntent: "audit",
        plannerMode: "full",
        planDocs: true,
        planTests: true,
        skipReview: false,
      });
    }

    const artifacts = listRoadmapBatchArtifacts(imported.batchSummary!.batchId);
    expect(artifacts.map((artifact) => artifact.role).sort()).toEqual(["report", "synthesis"]);
    expect(artifacts.find((artifact) => artifact.role === "synthesis")?.state).toBe("expected");
    expect(artifacts.find((artifact) => artifact.role === "report")?.artifactPath).toBe(
      "audit/2026-05-13-api-entrypoint-audit.md",
    );
  });
});
