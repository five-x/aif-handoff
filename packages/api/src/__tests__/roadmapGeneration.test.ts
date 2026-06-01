import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AUDIT_ABSENCE_PROOF_REQUIREMENT,
  AUDIT_CHILD_ORDER_REQUIREMENT,
  AUDIT_NO_FINDINGS_PROOF_GUARDRAIL,
  AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT,
  AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT,
  AUDIT_TRUSTED_ARTIFACT_LIFECYCLE_REQUIREMENT,
  generatePlanPath,
  projects,
  roadmapBatches,
  taskSplitProposals,
} from "@aif/shared";
import { eq } from "drizzle-orm";
import { createTestDb } from "@aif/shared/server";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
  resolveApiLightModel: async () => "claude-haiku-3-5",
}));

const {
  generateRoadmapFile,
  generateRoadmapTasks,
  importGeneratedTasks,
  buildTaskTags,
  createRoadmapSplitProposal,
  approveRoadmapSplitProposal,
  computeRoadmapSplitProposalFingerprint,
  commitGeneratedRoadmapIfNeeded,
  rejectReusedRoadmapAlias,
  RoadmapGenerationError,
} = await import("../services/roadmapGeneration.js");
const {
  findRoadmapBatchByProjectAlias,
  findTaskById,
  findTasksByRoadmapAlias,
  listRoadmapBatchArtifacts,
  nextBacklogTaskByPosition,
} = await import("@aif/data");

function createProjectWithRoadmap(roadmapContent: string) {
  const tmpDir = mkdtempSync(join(tmpdir(), "roadmap-test-"));
  const aiFactoryDir = join(tmpDir, ".ai-factory");
  mkdirSync(aiFactoryDir, { recursive: true });
  writeFileSync(join(aiFactoryDir, "ROADMAP.md"), roadmapContent);

  const db = testDb.current;
  const projectId = crypto.randomUUID();
  db.insert(projects)
    .values({
      id: projectId,
      name: "Test Project",
      rootPath: tmpDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();

  return { projectId, tmpDir };
}

function createProjectWithDescription(descriptionContent: string) {
  const tmpDir = mkdtempSync(join(tmpdir(), "roadmap-test-"));
  const aiFactoryDir = join(tmpDir, ".ai-factory");
  mkdirSync(aiFactoryDir, { recursive: true });
  writeFileSync(join(aiFactoryDir, "DESCRIPTION.md"), descriptionContent);

  const db = testDb.current;
  const projectId = crypto.randomUUID();
  db.insert(projects)
    .values({
      id: projectId,
      name: "Test Project",
      rootPath: tmpDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();

  return { projectId, tmpDir };
}

function runGit(cwd: string, args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function trackFiles(cwd: string, paths: string[]) {
  runGit(cwd, ["init"]);
  runGit(cwd, ["add", "--", ...paths]);
}

function auditTaskDescription(reportName = "audit/2026-05-09-config-audit.md") {
  const synthesis = /\b(?:summary|synthesis)\b/i.test(reportName);
  return [
    synthesis
      ? "Scope: all audit/2026-05-09-*-audit.md reports from this audit batch."
      : "Scope: src/config.ts, src/index.ts",
    "Task intent: audit",
    "Audit mandate: Act as the area owner and find actionable technical-quality risks.",
    ...(synthesis
      ? []
      : [
          "Risk hypotheses: risk-config-1 src/config.ts may contain unsafe defaults; risk-config-2 src/index.ts may contain unsafe exports.",
        ]),
    "Allowed changes: only create/update one report artifact.",
    `Report artifact: ${reportName}`,
    `Expected report artifact: ${reportName}`,
    `Allowed write paths: ${reportName}`,
    synthesis
      ? "Dependency order: after all source audit report children are trusted valid or accepted terminal inconclusive/manual-exception."
      : "Dependency order: source report sequence 1; no predecessor.",
    "Acceptance criteria: inspect the scoped files and record only actionable findings or no validated findings.",
    "Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, Proposed fix:, and Verification: Command ... output ...",
    "Manifest requirements: include a fenced audit-report-manifest JSON block with version 1, outcome, scopeCoverage, riskHypotheses, findings or noFindingsClaims, and evidenceRefs.",
    AUDIT_TRUSTED_ARTIFACT_LIFECYCLE_REQUIREMENT,
    "Evidence ID rule: manifest evidenceRefs must cite actual runtime audit ledger IDs (ev_*) only; finding labels such as AOB-001 are never evidenceRefs.",
    "Path rule: every repository reference must use an existing scoped path plus line/range; do not use basename-only references such as config.py.",
    AUDIT_ABSENCE_PROOF_REQUIREMENT,
    'Quality bar: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims are not findings.',
    "Rejected finding shapes: line counts, import counts, orphan/no-wiring/dead-code guesses, late-import/mixed-import/split-import/cold-start-footprint observations, duplicated initialization/DRY/refactor-helper claims, import-chain/tight-coupling claims without a real cycle, and private-method/direct-store/abstraction-bypass smells are not trusted findings.",
    "Inconclusive rule: a partially inspected source_inconclusive observation is not a finding.",
    'No-findings rule: if no actionable finding is found, write "No validated findings" plus checked files and commands with observed outputs.',
    AUDIT_NO_FINDINGS_PROOF_GUARDRAIL,
    AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT,
    ...(synthesis ? [AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT] : [AUDIT_CHILD_ORDER_REQUIREMENT]),
    "Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.",
    "Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
  ].join("\n");
}

function auditRoadmapItem(title: string, reportName?: string) {
  return [
    `- [ ] **${title}** - Diagnostic-only audit.`,
    ...auditTaskDescription(reportName)
      .split("\n")
      .map((line) => `  - ${line}`),
  ].join("\n");
}

function validAuditRoadmapContent() {
  return [
    "# Project Audit Roadmap",
    "",
    "> Audit the project",
    "",
    "## Audit Tasks",
    "",
    auditRoadmapItem("Audit: configuration", "audit/2026-05-09-config-audit.md"),
    "",
    auditRoadmapItem("Synthesize audit findings", "audit/2026-05-09-summary.md"),
  ].join("\n");
}

describe("roadmapGeneration", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    mockRunApiRuntimeOneShot.mockReset();
  });

  describe("buildTaskTags", () => {
    it("should generate required tag set", () => {
      const tags = buildTaskTags("v1.0", {
        title: "Setup auth",
        description: "",
        phase: 2,
        phaseName: "User Management",
        sequence: 3,
      });

      expect(tags).toContain("roadmap");
      expect(tags).toContain("rm:v1.0");
      expect(tags).toContain("phase:2");
      expect(tags).toContain("phase:user-management");
      expect(tags).toContain("seq:03");
    });

    it("should handle empty phaseName", () => {
      const tags = buildTaskTags("mvp", {
        title: "Init",
        description: "",
        phase: 1,
        phaseName: "",
        sequence: 1,
      });

      expect(tags).toContain("roadmap");
      expect(tags).toContain("rm:mvp");
      expect(tags).toContain("phase:1");
      expect(tags).toContain("seq:01");
      expect(tags).not.toContain("phase:");
    });
  });

  describe("commitGeneratedRoadmapIfNeeded", () => {
    it("commits the generated roadmap without hiding unrelated dirty files", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "roadmap-git-test-"));
      const aiFactoryDir = join(tmpDir, ".ai-factory");
      mkdirSync(aiFactoryDir, { recursive: true });
      const roadmapPath = join(aiFactoryDir, "ROADMAP.md");
      writeFileSync(roadmapPath, "# Old Roadmap\n");

      runGit(tmpDir, ["init"]);
      if (runGit(tmpDir, ["branch", "--show-current"]) !== "main") {
        runGit(tmpDir, ["checkout", "-b", "main"]);
      }
      runGit(tmpDir, ["config", "user.name", "Test User"]);
      runGit(tmpDir, ["config", "user.email", "test@example.invalid"]);
      runGit(tmpDir, ["add", ".ai-factory/ROADMAP.md"]);
      runGit(tmpDir, ["commit", "-m", "docs: seed roadmap"]);

      writeFileSync(roadmapPath, "# New Roadmap\n");
      writeFileSync(join(tmpDir, "dirty.txt"), "operator note\n");

      const result = commitGeneratedRoadmapIfNeeded({
        projectRoot: tmpDir,
        roadmapPath,
        roadmapAlias: "audit",
      });

      expect(result.committed).toBe(true);
      expect(result.remainingDirty).toContain("?? dirty.txt");
      expect(runGit(tmpDir, ["log", "-1", "--format=%s"])).toBe(
        "docs: update generated roadmap (audit)",
      );
      expect(runGit(tmpDir, ["status", "--porcelain", "--", ".ai-factory/ROADMAP.md"])).toBe("");
    });
  });

  describe("generateRoadmapFile", () => {
    it("should throw NO_CONTEXT when no description and no vision", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "roadmap-test-"));
      mkdirSync(join(tmpDir, ".ai-factory"), { recursive: true });
      const db = testDb.current;
      const projectId = crypto.randomUUID();
      db.insert(projects)
        .values({
          id: projectId,
          name: "Empty",
          rootPath: tmpDir,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      await expect(generateRoadmapFile({ projectId })).rejects.toThrow(
        "Cannot generate roadmap without project context",
      );
    });

    it("should generate ROADMAP.md from DESCRIPTION.md", async () => {
      const { projectId } = createProjectWithDescription("# My App\nA todo app");

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText:
            "# Project Roadmap\n\n> A todo app\n\n## Milestones\n\n- [ ] **Setup** — init\n- [ ] **Auth** — login\n\n## Completed\n\n| Milestone | Date |\n|-----------|------|\n",
          usage: {
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
            costUsd: 0.002,
          },
        },
        context: {},
      });

      const result = await generateRoadmapFile({ projectId });
      expect(result.roadmapPath).toContain("ROADMAP.md");
      expect(result.content).toContain("# Project Roadmap");
      expect(result.content).toContain("Setup");

      const { existsSync, readFileSync } = await import("node:fs");
      expect(existsSync(result.roadmapPath)).toBe(true);
      expect(readFileSync(result.roadmapPath, "utf8")).toContain("# Project Roadmap");

      // Prompt must include roadmap generation instructions
      const callArgs = mockRunApiRuntimeOneShot.mock.calls[0][0];
      expect(callArgs.profileMode).toBe("plan");
      expect(callArgs.prompt).toContain("ROADMAP.md");
    });

    it("does not reuse a stale existing ROADMAP.md when runtime returns fresh content", async () => {
      const { projectId, tmpDir } = createProjectWithDescription("# My App\nA todo app");
      const roadmapPath = join(tmpDir, ".ai-factory", "ROADMAP.md");
      writeFileSync(
        roadmapPath,
        "# Stale Roadmap\n\n## Old Milestones\n\n- [ ] **Old setup** - stale content that should not be reused by generation.\n",
      );

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText:
            "# Fresh Roadmap\n\n> A todo app\n\n## Milestones\n\n- [ ] **Fresh setup** - initialize current project\n",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
          },
        },
        context: {},
      });

      const result = await generateRoadmapFile({ projectId });

      expect(result.content).toContain("Fresh setup");
      expect(result.content).not.toContain("Old setup");
      expect(readFileSync(roadmapPath, "utf8")).toContain("Fresh setup");
    });

    it("should accept vision without DESCRIPTION.md", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "roadmap-test-"));
      mkdirSync(join(tmpDir, ".ai-factory"), { recursive: true });
      const db = testDb.current;
      const projectId = crypto.randomUUID();
      db.insert(projects)
        .values({
          id: projectId,
          name: "Vision Only",
          rootPath: tmpDir,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText:
            "# Project Roadmap\n\n> Build an e-commerce platform\n\n## Milestones\n\n- [ ] **Products** — catalog\n",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
          },
        },
        context: {},
      });

      const result = await generateRoadmapFile({
        projectId,
        vision: "Build an e-commerce platform",
      });
      expect(result.content).toContain("e-commerce");
    });

    it.each(["audit-logging", "security-review", "tests", "coverage", "build", "add-checkout"])(
      "should keep generic roadmap prompts for typed-looking alias %s without explicit intent",
      async (roadmapAlias) => {
        const { projectId } = createProjectWithDescription("# My App\nA platform service");

        mockRunApiRuntimeOneShot.mockResolvedValue({
          result: {
            outputText:
              "# Project Roadmap\n\n> Add audit logging and improve test coverage\n\n## Milestones\n\n- [ ] **Audit logging** - Capture events\n",
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              costUsd: 0,
            },
          },
          context: {},
        });

        await generateRoadmapFile({
          projectId,
          roadmapAlias,
          vision: "Add audit logging, run a security review, and improve test coverage",
        });

        const callArgs = mockRunApiRuntimeOneShot.mock.calls[0][0];
        expect(callArgs.prompt).toContain("ROADMAP.md");
        expect(callArgs.prompt).not.toContain("diagnostic audit decomposition roadmap");
        expect(callArgs.prompt).not.toContain("test-only backlog");
        expect(callArgs.prompt).not.toContain('Every task must set "taskIntent": "feature"');
      },
    );

    it("should reject audit-shaped aliases without audit intent before runtime generation", async () => {
      const { projectId } = createProjectWithDescription("# My App\nA service to audit");

      await expect(
        generateRoadmapFile({
          projectId,
          roadmapAlias: "audit-v6",
          taskIntent: "general",
          vision: "Review the project",
        }),
      ).rejects.toMatchObject({ code: "ROADMAP_INTENT_MISMATCH" });
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit-only vision without audit intent before runtime generation", async () => {
      const { projectId } = createProjectWithDescription("# My App\nA service to audit");

      await expect(
        generateRoadmapFile({
          projectId,
          roadmapAlias: "quality-review",
          vision: "diagnostic audit only; do not fix code",
        }),
      ).rejects.toMatchObject({ code: "ROADMAP_INTENT_MISMATCH" });
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject Russian audit-only vision without audit intent before runtime generation", async () => {
      const { projectId } = createProjectWithDescription("# My App\nA service to audit");

      await expect(
        generateRoadmapFile({
          projectId,
          roadmapAlias: "quality-review",
          vision:
            "\u0442\u043e\u043b\u044c\u043a\u043e \u0430\u0443\u0434\u0438\u0442; \u043d\u0435 \u0438\u0441\u043f\u0440\u0430\u0432\u043b\u044f\u0442\u044c \u043a\u043e\u0434",
        }),
      ).rejects.toMatchObject({ code: "ROADMAP_INTENT_MISMATCH" });
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should generate a diagnostic audit roadmap when audit intent is requested", async () => {
      const { projectId, tmpDir } = createProjectWithDescription("# My App\nA service to audit");
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(join(tmpDir, "src", "config.ts"), "export const debug = false;\n");
      writeFileSync(join(tmpDir, "src", "index.ts"), "export const app = true;\n");
      trackFiles(tmpDir, ["src/config.ts", "src/index.ts"]);

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: validAuditRoadmapContent(),
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
          },
        },
        context: {},
      });

      const result = await generateRoadmapFile({
        projectId,
        roadmapAlias: "audit-logging",
        taskIntent: "audit",
        vision: "\u043f\u0440\u043e\u0432\u0435\u0434\u0438 \u0430\u0443\u0434\u0438\u0442",
      });

      expect(result.auditDecomposition).toMatchObject({
        mode: "decomposed_report_batch",
        requiresDecomposition: true,
      });
      const callArgs = mockRunApiRuntimeOneShot.mock.calls[0][0];
      expect(callArgs.prompt).toContain("owner-grade diagnostic audit decomposition roadmap");
      expect(callArgs.prompt).toContain("Request decomposition mode: decomposed_report_batch");
      expect(callArgs.prompt).toContain(
        "Do not create implementation, fixing, refactoring, hardening",
      );
      expect(callArgs.prompt).toContain("Audit mandate:");
      expect(callArgs.prompt).toContain("Risk hypotheses:");
      expect(callArgs.prompt).toContain("Proposed fix:");
      expect(callArgs.prompt).toContain("Quality bar:");
      expect(callArgs.prompt).toContain("Report artifact: audit/");
      expect(callArgs.prompt).toContain(AUDIT_NO_FINDINGS_PROOF_GUARDRAIL);
      expect(callArgs.prompt).toContain(AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT);
      expect(callArgs.prompt).toContain(AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT);
      expect(callArgs.prompt).toContain("Child report status:");
      expect(callArgs.prompt).toContain(
        "every summarized finding must include Evidence: <source repo path>:<line>",
      );
      expect(callArgs.prompt).toContain("never use Scope: .");
    });

    it("should replace invalid generated audit roadmaps with a deterministic diagnostic roadmap", async () => {
      const { projectId, tmpDir } = createProjectWithDescription("# My App\nA service to audit");
      writeFileSync(
        join(tmpDir, "README.md"),
        "# My App\n\nService entry points and ownership are documented here.\n",
      );
      writeFileSync(join(tmpDir, "pyproject.toml"), '[project]\nname = "my-app"\n');
      mkdirSync(join(tmpDir, "src", "my_app"), { recursive: true });
      writeFileSync(join(tmpDir, "src", "my_app", "config.py"), "DEBUG = False\n");
      mkdirSync(join(tmpDir, ".codex"), { recursive: true });
      writeFileSync(join(tmpDir, ".codex", "local.md"), "generated\n");
      mkdirSync(join(tmpDir, "data"), { recursive: true });
      writeFileSync(join(tmpDir, "data", "cache.json"), "{}\n");
      writeFileSync(join(tmpDir, "scratch.py"), "print('untracked')\n");
      trackFiles(tmpDir, ["README.md", "pyproject.toml", "src/my_app/config.py"]);

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: [
            "# Project Audit Roadmap",
            "",
            "## Audit Tasks",
            "",
            "- [ ] **Initial Audit & Inventory** - Review the codebase and plan security hardening.",
          ].join("\n"),
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
          },
        },
        context: {},
      });

      const result = await generateRoadmapFile({
        projectId,
        roadmapAlias: "audit",
        taskIntent: "audit",
        vision: "Audit security, performance, and optimality",
      });

      const { readFileSync } = await import("node:fs");
      expect(result.content).toContain("Audit: security and configuration controls");
      expect(result.content).toContain("Audit: architecture and ownership boundaries");
      expect(result.content).toContain("Audit mandate:");
      expect(result.content).toContain("Proposed fix:");
      expect(result.content).toContain("Quality bar:");
      expect(result.content).toContain("No-findings rule:");
      expect(result.content).toContain(AUDIT_NO_FINDINGS_PROOF_GUARDRAIL);
      expect(result.content).toContain(AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT);
      expect(result.content).toContain(AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT);
      expect(result.content).toContain("Child report status:");
      expect(result.content).toContain("Scope: README.md, pyproject.toml, src/my_app/config.py");
      expect(result.content).toContain("Risk hypotheses: risk-");
      expect(result.content).toContain("src/my_app/config.py");
      expect(result.content).not.toContain("Scope: .");
      expect(result.content).not.toMatch(/^\s+- Scope: src\s*$/m);
      expect(result.content).not.toMatch(/^\s+- Scope: tests\s*$/m);
      expect(result.content).not.toContain(".codex");
      expect(result.content).not.toMatch(/^\s+- Scope: data\s*$/m);
      expect(result.content).not.toMatch(/^\s+- Scope: .*data\/cache\.json/m);
      expect(result.content).not.toContain("scratch.py");
      expect(result.content).not.toContain(
        "owner-area defects that produce actionable audit findings",
      );
      expect(result.content).not.toContain("packages/api/src");
      expect(result.content).toContain("Synthesize audit findings");
      expect(result.content).toContain("Scope: all audit/");
      expect(result.content).toContain("Allowed changes: only create/update audit/");
      expect(result.content).not.toContain("Initial Audit & Inventory");
      expect(readFileSync(result.roadmapPath, "utf8")).toBe(result.content);
    });

    it("should remove stale generated prior audit context when the current request has none", async () => {
      const { projectId, tmpDir } = createProjectWithDescription("# My App\nA service to audit");
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(join(tmpDir, "src", "config.ts"), "export const debug = false;\n");
      writeFileSync(join(tmpDir, "src", "index.ts"), "export const app = true;\n");
      trackFiles(tmpDir, ["src/config.ts", "src/index.ts"]);

      const staleContextRoadmap = validAuditRoadmapContent().replace(
        "  - Allowed changes:",
        "  - Prior audit context: roadmap context: roadmap context: source backed diagnostic audit only and mark inconclusive if child reports are weak\n  - Allowed changes:",
      );
      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: staleContextRoadmap,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
        },
        context: {},
      });

      const result = await generateRoadmapFile({
        projectId,
        roadmapAlias: "audit-current",
        taskIntent: "audit",
        vision: "audit current code",
      });

      expect(result.content).not.toContain("Prior audit context:");
      expect(result.content).not.toContain("roadmap context: roadmap context");
    });

    it("should enforce code-only audit scopes instead of trusting generated docs/governance scopes", async () => {
      const { projectId, tmpDir } = createProjectWithDescription("# botIntevra\nTelegram bot");
      mkdirSync(join(tmpDir, "src", "bot_intevra"), { recursive: true });
      mkdirSync(join(tmpDir, "tests"), { recursive: true });
      writeFileSync(join(tmpDir, "README.md"), "# botIntevra\nArchitecture notes\n");
      writeFileSync(join(tmpDir, "AGENTS.md"), "# Agent rules\n");
      writeFileSync(join(tmpDir, "pyproject.toml"), "[project]\nname='bot-intevra'\n");
      writeFileSync(
        join(tmpDir, "src", "bot_intevra", "bot.py"),
        "def handle():\n    return True\n",
      );
      writeFileSync(
        join(tmpDir, "src", "bot_intevra", "attachments.py"),
        "def save():\n    return True\n",
      );
      writeFileSync(
        join(tmpDir, "src", "bot_intevra", "backup_crypto.py"),
        "def encrypt():\n    return True\n",
      );
      writeFileSync(
        join(tmpDir, "src", "bot_intevra", "service.py"),
        "def run():\n    return True\n",
      );
      writeFileSync(join(tmpDir, "tests", "test_bot.py"), "def test_bot():\n    assert True\n");
      trackFiles(tmpDir, [
        "README.md",
        "AGENTS.md",
        "pyproject.toml",
        "src/bot_intevra/bot.py",
        "src/bot_intevra/attachments.py",
        "src/bot_intevra/backup_crypto.py",
        "src/bot_intevra/service.py",
        "tests/test_bot.py",
      ]);

      const generatedWithDocsScope = validAuditRoadmapContent().replace(
        "Scope: src/config.ts, src/index.ts",
        "Scope: README.md, AGENTS.md, src/bot_intevra/bot.py",
      );
      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: generatedWithDocsScope,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
        },
        context: {},
      });

      const result = await generateRoadmapFile({
        projectId,
        roadmapAlias: "audit-code-only",
        taskIntent: "audit",
        vision: "audit botIntevra code only with source evidence",
      });

      const sourceScopeLines = result.content
        .split(/\r?\n/)
        .filter((line) => /^\s+- Scope: /.test(line))
        .filter((line) => !line.includes("all audit/"));
      expect(sourceScopeLines.length).toBeGreaterThan(0);
      expect(sourceScopeLines.join("\n")).not.toMatch(
        /\b(?:README(?:\.md)?|AGENTS\.md|docs\/|\.ai-factory\/|pyproject\.toml|package\.json)/i,
      );
      expect(sourceScopeLines.join("\n")).toContain("src/bot_intevra/bot.py");
      expect(mockRunApiRuntimeOneShot.mock.calls[0][0].prompt).toContain(
        "Code-only audit requested",
      );
      expect(mockRunApiRuntimeOneShot.mock.calls[0][0].prompt).toContain("Evidence ID rule");
      expect(result.content).toContain("Evidence ID rule");
      expect(result.content).toContain("duplicated initialization/DRY/refactor-helper claims");
      expect(result.content).toContain("source_inconclusive");
    });

    it("should replace generated audit roadmaps that omit dynamic guardrail requirements", async () => {
      const { projectId, tmpDir } = createProjectWithDescription("# My App\nA service to audit");
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(join(tmpDir, "src", "config.ts"), "export const debug = false;\n");
      writeFileSync(join(tmpDir, "src", "index.ts"), "export const app = true;\n");
      trackFiles(tmpDir, ["src/config.ts", "src/index.ts"]);

      const generatedWithoutDynamicGuardrails = validAuditRoadmapContent()
        .replace(/^\s+- Manifest requirements:.*\n/gm, "")
        .replace(/^\s+- Evidence ID rule:.*\n/gm, "")
        .replace(/^\s+- Path rule:.*\n/gm, "")
        .replace(/^\s+- Absence-proof rule:.*\n/gm, "")
        .replace(/^\s+- Rejected finding shapes:.*\n/gm, "")
        .replace(/^\s+- Inconclusive rule:.*\n/gm, "");
      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: generatedWithoutDynamicGuardrails,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
        },
        context: {},
      });

      const result = await generateRoadmapFile({
        projectId,
        roadmapAlias: "audit",
        taskIntent: "audit",
        vision: "audit current code",
      });

      expect(result.content).not.toContain("Audit: API entrypoint");
      expect(result.content).toContain("Evidence ID rule");
      expect(result.content).toContain("Path rule");
      expect(result.content).toContain("Inconclusive rule");
    });

    it("should build deterministic audit scopes for botIntevra-like projects", async () => {
      const { projectId, tmpDir } = createProjectWithDescription("# botIntevra\nTelegram bot");
      mkdirSync(join(tmpDir, "src", "bot_intevra"), { recursive: true });
      mkdirSync(join(tmpDir, "tests"), { recursive: true });
      writeFileSync(
        join(tmpDir, "src", "bot_intevra", "__init__.py"),
        '"""Single-user Telegram bot."""\n\n__all__ = ["__version__"]\n__version__ = "0.1.0"\n',
      );
      writeFileSync(
        join(tmpDir, "src", "bot_intevra", "__main__.py"),
        'from bot_intevra.cli import main\n\nif __name__ == "__main__":\n    raise SystemExit(main())\n',
      );
      writeFileSync(join(tmpDir, "src", "bot_intevra", "config.py"), "TOKEN = None\n");
      writeFileSync(join(tmpDir, "src", "bot_intevra", "secret_scan.py"), "def scan(): pass\n");
      writeFileSync(join(tmpDir, "src", "bot_intevra", "service.py"), "def run(): pass\n");
      writeFileSync(join(tmpDir, "tests", "__init__.py"), "\n");
      writeFileSync(join(tmpDir, "tests", "test_bot.py"), "def test_bot():\n    assert True\n");
      trackFiles(tmpDir, [
        "src/bot_intevra/__init__.py",
        "src/bot_intevra/__main__.py",
        "src/bot_intevra/config.py",
        "src/bot_intevra/secret_scan.py",
        "src/bot_intevra/service.py",
        "tests/__init__.py",
        "tests/test_bot.py",
      ]);

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: "- [ ] **Initial Audit & Inventory** - Review everything.",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
        },
        context: {},
      });

      const result = await generateRoadmapFile({
        projectId,
        roadmapAlias: "audit",
        taskIntent: "audit",
        vision: "Audit botIntevra",
      });

      expect(result.content).toContain("src/bot_intevra/config.py");
      expect(result.content).toContain("src/bot_intevra/secret_scan.py");
      expect(result.content).toContain("src/bot_intevra/service.py");
      expect(result.content).toContain("tests/test_bot.py");
      expect(result.content).not.toContain("src/bot_intevra/__init__.py");
      expect(result.content).not.toContain("src/bot_intevra/__main__.py");
      expect(result.content).toContain("Risk hypotheses: risk-");
      expect(result.content).not.toContain("Scope: .");
      expect(result.content).not.toMatch(/^\s+- Scope: src\s*$/m);
      expect(result.content).not.toContain("tests/__init__.py");
    });

    it("should reject generated audit roadmap scope roots without readable evidence", async () => {
      const { projectId, tmpDir } = createProjectWithDescription("# botIntevra\nTelegram bot");
      mkdirSync(join(tmpDir, "tests"), { recursive: true });
      writeFileSync(join(tmpDir, "tests", "__init__.py"), "\n");
      writeFileSync(join(tmpDir, "tests", "test_bot.py"), "def test_bot():\n    assert True\n");
      trackFiles(tmpDir, ["tests/__init__.py", "tests/test_bot.py"]);

      const generated = validAuditRoadmapContent().replace(
        "Scope: src/config.ts, src/index.ts",
        "Scope: tests/__init__.py, tests/test_bot.py",
      );
      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: generated,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
        },
        context: {},
      });

      const result = await generateRoadmapFile({
        projectId,
        roadmapAlias: "audit",
        taskIntent: "audit",
        vision: "Audit botIntevra tests",
      });

      expect(result.content).toContain("tests/test_bot.py");
      expect(result.content).not.toContain("tests/__init__.py");
    });

    it("handles deterministic audit fallback when no usable tracked scope files exist", async () => {
      const { projectId, tmpDir } = createProjectWithDescription("# Empty\nNo tracked code yet");
      runGit(tmpDir, ["init"]);
      writeFileSync(join(tmpDir, "README.md"), "# Untracked README\n");
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(join(tmpDir, "src", "app.ts"), "export const app = true;\n");
      mkdirSync(join(tmpDir, ".codex"), { recursive: true });
      writeFileSync(join(tmpDir, ".codex", "local.md"), "generated\n");
      mkdirSync(join(tmpDir, "data"), { recursive: true });
      writeFileSync(join(tmpDir, "data", "cache.json"), "{}\n");

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: "- [ ] **Initial Audit & Inventory** - Review everything.",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
        },
        context: {},
      });

      const result = await generateRoadmapFile({
        projectId,
        roadmapAlias: "audit",
        taskIntent: "audit",
        vision: "Audit empty repository",
      });

      expect(result.content).toContain("Audit: architecture and ownership boundaries");
      expect(result.content).toContain("Scope: no tracked audit scope");
      expect(result.content).not.toMatch(/^\s+- Scope: \.\s*$/m);
      expect(result.content).not.toMatch(/^\s+- Scope: .*README\.md/m);
      expect(result.content).not.toMatch(/^\s+- Scope: src\s*$/m);
      expect(result.content).not.toContain("src/app.ts");
      expect(result.content).not.toContain(".ai-factory/DESCRIPTION.md");
      expect(result.content).not.toContain(".codex");
      expect(result.content).not.toContain("data/cache.json");
      expect(result.content).not.toContain(
        "owner-area defects that produce actionable audit findings",
      );
    });

    it("should preserve v8-like prior inconclusive context in generated audit task descriptions", async () => {
      const { projectId, tmpDir } = createProjectWithDescription("# My App\nA service to audit");
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(join(tmpDir, "src", "config.ts"), "export const debug = false;\n");
      writeFileSync(join(tmpDir, "src", "index.ts"), "export const app = true;\n");
      trackFiles(tmpDir, ["src/config.ts", "src/index.ts"]);

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: validAuditRoadmapContent(),
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
          },
        },
        context: {},
      });

      await generateRoadmapFile({
        projectId,
        roadmapAlias: "audit-v8-after-audit-v7-inconclusive",
        taskIntent: "audit",
        vision:
          "Generate audit-v8 as a follow-up because audit-v7 was inconclusive and no-inventory proof was weak.",
      });

      const result = await generateRoadmapTasks({
        projectId,
        roadmapAlias: "audit-v8-after-audit-v7-inconclusive",
        taskIntent: "audit",
      });

      expect(result.tasks).toHaveLength(2);
      for (const task of result.tasks) {
        expect(task.description).toContain("Prior audit context:");
        expect(task.description).toContain("audit-v7");
        expect(task.description).toContain("inconclusive");
        expect(task.description).toContain(AUDIT_NO_FINDINGS_PROOF_GUARDRAIL);
        expect(task.description).toContain(AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT);
      }

      const report = result.tasks.find((task) => task.title === "Audit: configuration");
      const synthesis = result.tasks.find((task) => task.title === "Synthesize audit findings");
      expect(report?.description).toContain("git ls-files");
      expect(report?.description).toContain("directory listings");
      expect(report?.description).toContain("file-existence checks");
      expect(report?.description).toContain("inventory-only observations");
      expect(synthesis?.description).toContain(AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT);
      expect(synthesis?.description).toContain("validated findings present");
      expect(synthesis?.description).toContain("validated no-findings with substantive evidence");
      expect(synthesis?.description).toContain("audit inconclusive");
    });
  });

  describe("generateRoadmapTasks", () => {
    it("should throw ROADMAP_NOT_FOUND when file missing", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "roadmap-test-"));
      const db = testDb.current;
      const projectId = crypto.randomUUID();
      db.insert(projects)
        .values({
          id: projectId,
          name: "No Roadmap",
          rootPath: tmpDir,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      await expect(generateRoadmapTasks({ projectId, roadmapAlias: "test" })).rejects.toThrow(
        RoadmapGenerationError,
      );
    });

    it("should throw PROJECT_NOT_FOUND for invalid project", async () => {
      await expect(
        generateRoadmapTasks({ projectId: "nonexistent", roadmapAlias: "test" }),
      ).rejects.toThrow("not found");
    });

    it("should parse valid agent response", async () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap\n- [ ] Task A\n- [ ] Task B");

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: JSON.stringify({
            alias: "v1",
            tasks: [
              { title: "Task A", description: "Do A", phase: 1, phaseName: "Setup", sequence: 1 },
              { title: "Task B", description: "Do B", phase: 1, phaseName: "Setup", sequence: 2 },
            ],
          }),
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            costUsd: 0.001,
          },
        },
        context: {},
      });

      const result = await generateRoadmapTasks({ projectId, roadmapAlias: "v1" });
      expect(result.alias).toBe("v1");
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].title).toBe("Task A");
      expect(mockRunApiRuntimeOneShot.mock.calls[0][0].profileMode).toBe("plan");
    });

    it("extracts typed feature roadmap markdown deterministically without runtime metadata loss", async () => {
      const { projectId } = createProjectWithRoadmap(`# Project Feature Roadmap

> Build a clean feature roadmap.

## Feature Tasks

- [ ] **Initialize repository and test harness** - Create the first runnable scaffold.
  - Task intent: feature
  - Acceptance criteria: package.json defines build and test scripts.
  - Verification: npm.cmd run build; npm.cmd test
  - Dependencies: none
  - Scope: package.json, vitest.config.*, src/**/*.test.*
  - Evidence requirements: verification command output.
  - Allowed changes: Source, tests, docs, and config only as needed for the feature.
`);

      const result = await generateRoadmapTasks({
        projectId,
        roadmapAlias: "feature-v1",
        taskIntent: "feature",
      });

      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
      expect(result).toMatchObject({ alias: "feature-v1", taskIntent: "feature" });
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]).toMatchObject({
        title: "Initialize repository and test harness",
        taskIntent: "feature",
        phase: 1,
        phaseName: "Feature Tasks",
        sequence: 1,
      });
      expect(result.tasks[0].description).toContain("Acceptance criteria:");
      expect(result.tasks[0].description).toContain(
        "Verification: npm.cmd run build; npm.cmd test",
      );
      expect(result.tasks[0].description).toContain("Scope: package.json");
    });

    it("should reject audit-shaped aliases without audit intent before runtime extraction", async () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap\n- [ ] Task A");

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit_20260511" }),
      ).rejects.toMatchObject({ code: "ROADMAP_INTENT_MISMATCH" });
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it.each(["audit-logging", "security-review", "tests", "coverage", "build", "add-checkout"])(
      "keeps generic roadmap extraction general for typed-looking alias %s",
      async (roadmapAlias) => {
        const { projectId } = createProjectWithRoadmap(
          "# Roadmap\n- [ ] **Add audit logging** - Capture security review events",
        );

        mockRunApiRuntimeOneShot.mockResolvedValue({
          result: {
            outputText: JSON.stringify({
              alias: "v1",
              tasks: [
                {
                  title: "Add audit logging",
                  taskIntent: "audit",
                  description: "Capture security review events",
                  phase: 1,
                  phaseName: "Observability",
                  sequence: 1,
                },
              ],
            }),
            usage: {
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              costUsd: 0.001,
            },
          },
          context: {},
        });

        const result = await generateRoadmapTasks({ projectId, roadmapAlias });

        expect(result.tasks[0].taskIntent).toBe("general");
        const callArgs = mockRunApiRuntimeOneShot.mock.calls[0][0];
        expect(callArgs.prompt).toContain("project roadmap");
        expect(callArgs.prompt).not.toContain("diagnostic audit roadmap");
      },
    );

    it("should handle agent returning markdown-fenced JSON", async () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap\n- [ ] X");

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText:
            '```json\n{"alias":"v1","tasks":[{"title":"X","description":"","phase":1,"phaseName":"P1","sequence":1}]}\n```',
          usage: {
            inputTokens: 50,
            outputTokens: 30,
            totalTokens: 80,
            costUsd: 0.0005,
          },
        },
        context: {},
      });

      const result = await generateRoadmapTasks({ projectId, roadmapAlias: "v1" });
      expect(result.tasks).toHaveLength(1);
    });

    it("should extract JSON from fence even when agent adds extra text after", async () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap\n- [ ] Y");

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText:
            '```json\n{"alias":"v1","tasks":[{"title":"Y","description":"do Y","phase":1,"phaseName":"P1","sequence":1}]}\n```\n\nThe ROADMAP.md file currently only contains a summary. Please provide detailed milestones.',
          usage: {
            inputTokens: 50,
            outputTokens: 30,
            totalTokens: 80,
            costUsd: 0.0005,
          },
        },
        context: {},
      });

      const result = await generateRoadmapTasks({ projectId, roadmapAlias: "v1" });
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].title).toBe("Y");
    });

    it("should throw PARSE_ERROR for invalid JSON", async () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap\n- [ ] X");

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: "not json at all",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
          },
        },
        context: {},
      });

      await expect(generateRoadmapTasks({ projectId, roadmapAlias: "v1" })).rejects.toThrow(
        RoadmapGenerationError,
      );
    });

    it("should reject generic implementation tasks for audit roadmap imports", async () => {
      const { projectId } = createProjectWithRoadmap(
        "# Project Audit Roadmap\n- [ ] **Resolve Critical Bugs** - Fix crashes",
      );

      mockRunApiRuntimeOneShot.mockResolvedValue({
        result: {
          outputText: JSON.stringify({
            alias: "audit",
            tasks: [
              {
                title: "Resolve Critical Bugs",
                description: "Fix crashes",
                phase: 1,
                phaseName: "Phase 1",
                sequence: 1,
              },
            ],
          }),
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
          },
        },
        context: {},
      });

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit-logging", taskIntent: "audit" }),
      ).rejects.toThrow("Audit roadmap generation produced implementation-shaped milestones");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it.each([
      "Critical Bug Resolution",
      "Architecture Refactoring",
      "Security Hardening",
      "Test Suite Expansion",
    ])("should reject implementation-shaped audit source roadmap term %s", async (term) => {
      const { projectId } = createProjectWithRoadmap(
        [
          "# Project Audit Roadmap",
          "",
          `- [ ] **Audit: ${term}** - Diagnostic-only audit.`,
          "  - Scope: src",
          "  - Allowed changes: only create/update one report artifact.",
          "  - Report artifact: audit/bad.md",
          "  - Acceptance criteria: inspect only.",
          "  - Evidence requirements: every finding must include Evidence: src/index.ts:1, Risk:, and Verification: Command rg test src output matched.",
          "  - Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.",
          "  - Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
          "",
          auditRoadmapItem("Synthesize audit findings", "audit/summary.md"),
        ].join("\n"),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("Audit roadmap generation produced implementation-shaped milestones");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit source roadmap with Allowed changes: None before extraction", async () => {
      const { projectId } = createProjectWithRoadmap(
        validAuditRoadmapContent().replace(
          "Allowed changes: only create/update one report artifact.",
          "Allowed changes: None",
        ),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("Allowed changes: None");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit source roadmap with Allowed changes that include source edits", async () => {
      const { projectId } = createProjectWithRoadmap(
        validAuditRoadmapContent().replace(
          "Allowed changes: only create/update one report artifact.",
          "Allowed changes: only create/update audit/config-audit.md and packages/api/src/index.ts.",
        ),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("must limit Allowed changes to the report artifact");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit synthesis roadmap with Allowed changes that include source edits", async () => {
      const { projectId } = createProjectWithRoadmap(
        validAuditRoadmapContent().replace(
          "Report artifact: audit/2026-05-09-summary.md",
          "Allowed changes: only create/update audit/2026-05-09-summary.md and src/config.ts.\n  - Report artifact: audit/2026-05-09-summary.md",
        ),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("must limit Allowed changes to the report artifact");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit source roadmap with Scope: . before extraction", async () => {
      const { projectId } = createProjectWithRoadmap(
        validAuditRoadmapContent().replace("Scope: src/config.ts, src/index.ts", "Scope: ."),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("scope must use concrete files or directories");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit source roadmap without parseable risk hypotheses", async () => {
      const { projectId } = createProjectWithRoadmap(
        validAuditRoadmapContent().replace(
          "Risk hypotheses: risk-config-1 src/config.ts may contain unsafe defaults; risk-config-2 src/index.ts may contain unsafe exports.\n",
          "",
        ),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("Risk hypotheses");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit source roadmap missing the final synthesis item before extraction", async () => {
      const { projectId } = createProjectWithRoadmap(
        [
          "# Project Audit Roadmap",
          "",
          "> Audit the project",
          "",
          "## Audit Tasks",
          "",
          auditRoadmapItem("Audit: configuration", "audit/config-audit.md"),
        ].join("\n"),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("expected exactly one final synthesis card, found 0");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit source roadmap with extra synthesis items before extraction", async () => {
      const { projectId } = createProjectWithRoadmap(
        [
          validAuditRoadmapContent(),
          "",
          auditRoadmapItem("Synthesize final audit summary", "audit/final-summary.md"),
        ].join("\n"),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("expected exactly one final synthesis card, found 2");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit source roadmap missing a report artifact path before extraction", async () => {
      const missingReportArtifact = auditRoadmapItem("Audit: configuration", "audit/config.md")
        .split("\n")
        .filter((line) => !line.includes("Report artifact:"))
        .join("\n");
      const { projectId } = createProjectWithRoadmap(
        [
          "# Project Audit Roadmap",
          "",
          missingReportArtifact,
          "",
          auditRoadmapItem("Synthesize audit findings", "audit/summary.md"),
        ].join("\n"),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("missing a report artifact path");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit source roadmap with non-path report artifact text before extraction", async () => {
      const { projectId } = createProjectWithRoadmap(
        validAuditRoadmapContent().replace(
          "Report artifact: audit/2026-05-09-config-audit.md",
          "Report artifact: audit report",
        ),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("missing a report artifact path");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should reject audit source roadmap missing canonical no-findings guardrails", async () => {
      const { projectId } = createProjectWithRoadmap(
        validAuditRoadmapContent().replace(`${AUDIT_NO_FINDINGS_PROOF_GUARDRAIL}\n`, ""),
      );

      await expect(
        generateRoadmapTasks({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).rejects.toThrow("no-findings proof guardrail");
      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
    });

    it("should convert valid audit source roadmap deterministically without extraction model", async () => {
      const { projectId } = createProjectWithRoadmap(validAuditRoadmapContent());

      const result = await generateRoadmapTasks({
        projectId,
        roadmapAlias: "audit",
        taskIntent: "audit",
      });

      expect(mockRunApiRuntimeOneShot).not.toHaveBeenCalled();
      expect(result).toMatchObject({ alias: "audit", taskIntent: "audit" });
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0]).toMatchObject({
        title: "Audit: configuration",
        taskIntent: "audit",
        phase: 1,
        phaseName: "Audit",
        sequence: 1,
      });
      expect(result.tasks[0].description).toContain(
        "Report artifact: audit/2026-05-09-config-audit.md",
      );
      expect(result.tasks.every((task) => task.description.includes("Prior audit context:"))).toBe(
        false,
      );
      expect(result.tasks[1]).toMatchObject({
        title: "Synthesize audit findings",
        taskIntent: "audit",
        phase: 2,
        phaseName: "Synthesis",
        sequence: 1,
      });
    });

    it("should preserve prior inconclusive source roadmap context in deterministic audit conversion", async () => {
      const { projectId } = createProjectWithRoadmap(
        validAuditRoadmapContent().replace(
          "> Audit the project",
          "> audit-v8 follow-up because audit-v7 was inconclusive",
        ),
      );

      const result = await generateRoadmapTasks({
        projectId,
        roadmapAlias: "audit-v8",
        taskIntent: "audit",
      });

      expect(result.tasks.every((task) => task.description.includes("Prior audit context:"))).toBe(
        true,
      );
      expect(result.tasks.every((task) => task.description.includes("audit-v7"))).toBe(true);
      expect(result.tasks.every((task) => task.description.includes("inconclusive"))).toBe(true);
    });

    it("should append current prior context when source cards contain stale prior context", async () => {
      const staleContext = "Prior audit context: audit-v6 was inconclusive.";
      const { projectId } = createProjectWithRoadmap(
        validAuditRoadmapContent()
          .replace("> Audit the project", "> audit-v8 follow-up because audit-v7 was inconclusive")
          .replaceAll("Audit mandate: Act as", `${staleContext}\n  - Audit mandate: Act as`),
      );

      const result = await generateRoadmapTasks({
        projectId,
        roadmapAlias: "audit-v8",
        taskIntent: "audit",
      });

      for (const task of result.tasks) {
        expect(task.description).toContain("audit-v6 was inconclusive");
        expect(task.description).toContain("roadmap context: audit-v8 follow-up because audit-v7");
        expect(task.description).toContain("audit-v7");
      }
    });
  });

  describe("importGeneratedTasks", () => {
    it("creates a paused hierarchy parent and paused children for split approval imports", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const result = importGeneratedTasks(
        projectId,
        {
          alias: "split-approved",
          taskIntent: "general",
          tasks: [
            {
              title: "Build API",
              description: "REST endpoints",
              taskIntent: "general",
              phase: 1,
              phaseName: "Backend",
              sequence: 1,
            },
          ],
        },
        { createHierarchyParent: true, pauseCreatedTasks: true },
      );

      expect(result.created).toBe(1);
      expect(result.containerTaskId).toBeTruthy();
      const parent = findTaskById(result.containerTaskId!)!;
      const child = findTaskById(result.taskIds[0]!)!;
      expect(parent.hierarchyRole).toBe("container");
      expect(parent.parentCloseoutPolicy).toBe("all_children_done");
      expect(parent.paused).toBe(true);
      expect(child.parentTaskId).toBe(parent.id);
      expect(child.paused).toBe(true);
      expect(child.autoMode).toBe(false);
      expect(child.maxReviewIterations).toBe(3);
      expect(child.blockedReason).toMatch(/^operator_input_required:/);
    });

    it("persists split proposals without creating tasks and detects changed source content", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");
      const generation = {
        alias: "split-pending",
        taskIntent: "feature" as const,
        tasks: [
          {
            title: "Build API",
            description: "REST endpoints",
            taskIntent: "feature" as const,
            phase: 1,
            phaseName: "Backend",
            sequence: 1,
          },
        ],
      };

      const first = createRoadmapSplitProposal({
        projectId,
        sourceKind: "roadmap_import",
        sourceRef: "roadmap-import:ROADMAP.md",
        sourceContent: "# Roadmap\n- [ ] Build API",
        generation,
      });
      expect(first.status).toBe("created");
      expect(findTasksByRoadmapAlias(projectId, "split-pending")).toHaveLength(0);

      const reused = createRoadmapSplitProposal({
        projectId,
        sourceKind: "roadmap_import",
        sourceRef: "roadmap-import:ROADMAP.md",
        sourceContent: "# Roadmap\n- [ ] Build API",
        generation,
      });
      expect(reused.status).toBe("reused");
      expect(reused.proposal.id).toBe(first.proposal.id);

      const changed = createRoadmapSplitProposal({
        projectId,
        sourceKind: "roadmap_import",
        sourceRef: "roadmap-import:ROADMAP.md",
        sourceContent: "# Roadmap\n- [ ] Build a different API",
        generation,
      });
      expect(changed.status).toBe("conflict");
    });

    it("decomposes broad generated app children into proposal microtasks before persistence", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const result = createRoadmapSplitProposal({
        projectId,
        sourceKind: "roadmap_import",
        sourceRef: "roadmap-import:ROADMAP.md",
        sourceContent:
          "# Roadmap\n- [ ] Build zai-mi.com - scaffold the app, configure the dev stack, and implement app code",
        generation: {
          alias: "zai-mi",
          taskIntent: "general",
          tasks: [
            {
              title: "Build zai-mi.com",
              description:
                "Scaffold the app, configure the dev stack, set runtime config, implement app code, and add smoke verification.",
              taskIntent: "general",
              phase: 1,
              phaseName: "MVP",
              sequence: 1,
            },
            {
              title: "Polish footer copy",
              description:
                "Scope: src/components/Footer.tsx\nAcceptance criteria: footer copy is updated.\nVerification: npm.cmd test -- footer",
              taskIntent: "general",
              phase: 1,
              phaseName: "MVP",
              sequence: 1,
            },
          ],
        },
      });

      expect(result.status).toBe("created");
      expect(result.proposal.proposedChildren.map((child) => child.title)).toEqual([
        "Initialize zai-mi.com scaffold",
        "Configure zai-mi.com development stack",
        "Implement zai-mi.com first app slice",
        "Add zai-mi.com smoke verification",
        "Polish footer copy",
      ]);
      expect(result.proposal.proposedChildren.map((child) => child.sequence)).toEqual([
        1, 2, 3, 4, 5,
      ]);
      for (const child of result.proposal.proposedChildren) {
        expect(child.fileBoundaries?.length).toBeGreaterThan(0);
        expect(child.acceptanceCriteria?.length).toBeGreaterThan(0);
        expect(child.verificationCommands?.length).toBeGreaterThan(0);
      }
      expect(result.proposal.proposedChildren[1]).toEqual(
        expect.objectContaining({
          fileBoundaries: expect.arrayContaining(["vitest.config.*"]),
          acceptanceCriteria: expect.arrayContaining([
            "package.json defines executable build and test scripts; the test script can run before feature tests exist.",
          ]),
          verificationCommands: ["npm.cmd run build", "npm.cmd test"],
        }),
      );
      expect(result.proposal.proposedChildren[2]).toEqual(
        expect.objectContaining({
          fileBoundaries: expect.arrayContaining(["src/**/*.test.*"]),
          acceptanceCriteria: expect.arrayContaining([
            "A focused test covers the first workflow against deterministic sample data.",
          ]),
          verificationCommands: ["npm.cmd test"],
        }),
      );
      expect(result.proposal.proposedChildren.slice(0, 4)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            splitRationale: expect.stringContaining("split into executable microtasks"),
          }),
        ]),
      );
      expect(findTasksByRoadmapAlias(projectId, "zai-mi")).toHaveLength(0);
    });

    it("keeps structured domain feature tasks as one proposal child", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const result = createRoadmapSplitProposal({
        projectId,
        sourceKind: "roadmap_import",
        sourceRef: "roadmap-import:ROADMAP.md",
        sourceContent: "# Roadmap\n- [ ] Define domain types",
        generation: {
          alias: "domain-types",
          taskIntent: "feature",
          tasks: [
            {
              title: "Define domain types and data contracts",
              description:
                "Acceptance criteria: Offer, UserProfile, Consent, and RoutingResult types exist without passport fields.\nVerification: npm.cmd test -- domain-types\nScope: src/types/domain.ts, src/types/offer.ts, src/types/consent.ts, src/types/routing.ts\nEvidence requirements: focused test output.\nAllowed changes: Source, tests, docs, and config only as needed for the feature.",
              taskIntent: "feature",
              phase: 1,
              phaseName: "Feature",
              sequence: 1,
            },
          ],
        },
      });

      expect(result.status).toBe("created");
      expect(result.proposal.proposedChildren).toHaveLength(1);
      expect(result.proposal.proposedChildren[0]).toEqual(
        expect.objectContaining({
          title: "Define domain types and data contracts",
          verificationCommands: ["npm.cmd test -- domain-types"],
          fileBoundaries: expect.arrayContaining(["src/types/domain.ts", "src/types/offer.ts"]),
          splitRationale: "Roadmap item is already narrow enough for one executable microtask.",
        }),
      );
      expect(result.proposal.proposedChildren[0]?.title).not.toContain("development stack");
      expect(findTasksByRoadmapAlias(projectId, "domain-types")).toHaveLength(0);
    });

    it("keeps Russian structured domain initialization tasks as one proposal child", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");
      const seedTitle =
        "\u0418\u043d\u0438\u0446\u0438\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0430 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0439 (Seed Data)";

      const result = createRoadmapSplitProposal({
        projectId,
        sourceKind: "roadmap_import",
        sourceRef: "roadmap-import:ROADMAP.md",
        sourceContent: `# Roadmap\n- [ ] ${seedTitle}`,
        generation: {
          alias: "ru-seed-data",
          taskIntent: "feature",
          tasks: [
            {
              title: seedTitle,
              description:
                "Acceptance criteria: Offer catalog returns deterministic sample offers.\nVerification: npm.cmd test -- offerCatalog\nScope: src/data/offers.json, src/services/offerCatalog.ts\nAllowed changes: Source, tests, docs, and config only as needed for the feature.",
              taskIntent: "feature",
              phase: 1,
              phaseName: "Feature",
              sequence: 1,
            },
          ],
        },
      });

      expect(result.status).toBe("created");
      expect(result.proposal.proposedChildren).toHaveLength(1);
      expect(result.proposal.proposedChildren[0]).toEqual(
        expect.objectContaining({
          title: seedTitle,
          verificationCommands: ["npm.cmd test -- offerCatalog"],
          fileBoundaries: ["src/data/offers.json", "src/services/offerCatalog.ts"],
          splitRationale: "Roadmap item is already narrow enough for one executable microtask.",
        }),
      );
      expect(result.proposal.proposedChildren[0]?.title).not.toContain("dev-");
      expect(findTasksByRoadmapAlias(projectId, "ru-seed-data")).toHaveLength(0);
    });

    it("decomposes Russian broad feature children into proposal microtasks before persistence", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const result = createRoadmapSplitProposal({
        projectId,
        sourceKind: "roadmap_import",
        sourceRef: "roadmap-import:ROADMAP.md",
        sourceContent:
          "# Roadmap\n- [ ] Настройка инфраструктуры: docker-compose, env и базовая структура",
        generation: {
          alias: "zai-mi-ru",
          taskIntent: "feature",
          tasks: [
            {
              title: "Настройка инфраструктуры: docker-compose, env и базовая структура",
              description:
                "Acceptance criteria: приложение запускается локально; секреты берутся из env; структура директорий соответствует стандартам.\nVerification: npm.cmd run build; npm.cmd test\nScope: docker-compose.yml, .env.example, src/main, src/config, package.json, tests/**",
              taskIntent: "feature",
              phase: 1,
              phaseName: "MVP",
              sequence: 1,
            },
          ],
        },
      });

      expect(result.status).toBe("created");
      expect(result.proposal.proposedChildren.map((child) => child.title)).not.toEqual([
        "Инициализировать скелет: Настройка инфраструктуры: docker-compose, env и базовая структура",
        "Настроить dev-стек: Настройка инфраструктуры: docker-compose, env и базовая структура",
        "Реализовать первый срез: Настройка инфраструктуры: docker-compose, env и базовая структура",
        "Добавить smoke-проверку: Настройка инфраструктуры: docker-compose, env и базовая структура",
      ]);
      expect(
        result.proposal.proposedChildren.every((child) => !/docker-compose|env/i.test(child.title)),
      ).toBe(true);
      expect(result.proposal.proposedChildren).toHaveLength(4);
      for (const child of result.proposal.proposedChildren) {
        expect(child.taskIntent).toBe("feature");
        expect(child.tags).toContain("microtask");
        expect(child.fileBoundaries?.length).toBeGreaterThan(0);
        expect(child.acceptanceCriteria?.length).toBeGreaterThan(0);
        expect(child.verificationCommands?.length).toBeGreaterThan(0);
        expect(child.splitRationale).toContain("split into executable microtasks");
      }
      expect(findTasksByRoadmapAlias(projectId, "zai-mi-ru")).toHaveLength(0);
    });

    it("decomposes local environment config fanout into proposal microtasks", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");
      const sourceTitle =
        "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0439 \u0441\u0440\u0435\u0434\u044b: Docker, \u043f\u0435\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0435 \u043e\u043a\u0440\u0443\u0436\u0435\u043d\u0438\u044f \u0438 CI/CD \u0431\u0430\u0437\u043e\u0432\u0430\u044f \u043a\u043e\u043d\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044f";

      const result = createRoadmapSplitProposal({
        projectId,
        sourceKind: "roadmap_import",
        sourceRef: "roadmap-import:ROADMAP.md",
        sourceContent: `# Roadmap\n- [ ] ${sourceTitle}`,
        generation: {
          alias: "zai-mi-local-env",
          taskIntent: "feature",
          tasks: [
            {
              title: sourceTitle,
              description:
                "Acceptance criteria: local services start; env defaults are documented; CI command exists.\nVerification: npm.cmd run build; npm.cmd test\nScope: docker-compose.yml, .env.example, .github/workflows/ci.yml, src/config/index.ts, package.json",
              taskIntent: "feature",
              phase: 1,
              phaseName: "MVP",
              sequence: 1,
            },
          ],
        },
      });

      expect(result.status).toBe("created");
      expect(result.proposal.proposedChildren).toHaveLength(4);
      expect(result.proposal.proposedChildren[0]?.fileBoundaries).not.toContain("Dockerfile");
      expect(result.proposal.proposedChildren[1]?.fileBoundaries).toEqual(
        expect.arrayContaining(["Dockerfile", ".dockerignore", "docker-compose*.yml"]),
      );
      for (const child of result.proposal.proposedChildren) {
        expect(child.title).not.toContain(sourceTitle);
        expect(child.taskIntent).toBe("feature");
        expect(child.tags).toContain("microtask");
        expect(child.splitRationale).toContain("split into executable microtasks");
      }
      expect(findTasksByRoadmapAlias(projectId, "zai-mi-local-env")).toHaveLength(0);

      const approved = approveRoadmapSplitProposal({
        projectId,
        proposalId: result.proposal.id,
        approvedBy: "test",
      });

      expect(approved.status).toBe("approved");
      if (approved.status !== "approved")
        throw new Error(`Unexpected approval status ${approved.status}`);
      expect(approved.proposal.createdTaskIds).toHaveLength(5);
      expect(findTasksByRoadmapAlias(projectId, "zai-mi-local-env")).toHaveLength(5);
    });

    it("rejects approval for a manually persisted stale broad proposal child", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");
      const proposalId = crypto.randomUUID();
      testDb.current
        .insert(taskSplitProposals)
        .values({
          id: proposalId,
          projectId,
          sourceKind: "roadmap_import",
          sourceRef: "roadmap-import:ROADMAP.md",
          sourceFingerprint: "f".repeat(64),
          roadmapAlias: "stale-broad",
          taskIntent: "general",
          status: "pending",
          summary: "Stale broad proposal",
          proposedChildrenJson: JSON.stringify([
            {
              title: "Build zai-mi.com",
              description:
                "Scaffold the app, configure the dev stack, set runtime config, implement app code, and add smoke verification.",
              taskIntent: "general",
              phase: 1,
              phaseName: "MVP",
              sequence: 1,
              fileBoundaries: ["package.json", "src/**", "config/**", "tests/**"],
              acceptanceCriteria: ["The whole site is built and verified."],
              verificationCommands: ["npm.cmd test"],
              dependsOn: [],
              splitRationale: "Spoofed marker: split into executable microtasks",
            },
          ]),
        })
        .run();

      expect(() =>
        approveRoadmapSplitProposal({ projectId, proposalId, approvedBy: "test" }),
      ).toThrow("non-microtask executable children");
      expect(findTasksByRoadmapAlias(projectId, "stale-broad")).toHaveLength(0);
    });

    it("approves legacy narrow proposals without stored microtask metadata", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");
      const proposalId = crypto.randomUUID();
      testDb.current
        .insert(taskSplitProposals)
        .values({
          id: proposalId,
          projectId,
          sourceKind: "roadmap_import",
          sourceRef: "roadmap-import:ROADMAP.md",
          sourceFingerprint: "a".repeat(64),
          roadmapAlias: "legacy-narrow",
          taskIntent: "general",
          status: "pending",
          summary: "Legacy narrow proposal",
          proposedChildrenJson: JSON.stringify([
            {
              title: "Polish footer copy",
              description:
                "Scope: src/components/Footer.tsx\nAcceptance criteria: footer copy is updated.\nVerification: npm.cmd test -- footer",
              taskIntent: "general",
              phase: 1,
              phaseName: "MVP",
              sequence: 1,
            },
          ]),
        })
        .run();

      const result = approveRoadmapSplitProposal({ projectId, proposalId, approvedBy: "test" });

      expect(result.status).toBe("approved");
      const created = findTasksByRoadmapAlias(projectId, "legacy-narrow");
      expect(created).toHaveLength(2);
      const child = created.find((task) => task.hierarchyRole !== "container");
      expect(child?.title).toBe("Polish footer copy");
      expect(child?.description).toContain("File boundaries:");
      expect(child?.description).toContain("Acceptance criteria:");
      expect(child?.description).toContain("Verification:");
    });

    it("fingerprints source content, alias, intent, and canonical proposed children", () => {
      const base = {
        sourceContent: "# Roadmap\n- [ ] Build API",
        roadmapAlias: "fp",
        taskIntent: "feature" as const,
        tasks: [
          {
            title: "Build API",
            description: "REST endpoints",
            taskIntent: "feature" as const,
            phase: 1,
            phaseName: "Backend",
            sequence: 1,
          },
        ],
      };

      expect(computeRoadmapSplitProposalFingerprint(base)).toBe(
        computeRoadmapSplitProposalFingerprint({
          ...base,
          sourceContent: `${base.sourceContent}\n`,
        }),
      );
      expect(computeRoadmapSplitProposalFingerprint(base)).not.toBe(
        computeRoadmapSplitProposalFingerprint({
          ...base,
          tasks: [{ ...base.tasks[0], title: "Build API v2" }],
        }),
      );
    });

    it("should create tasks with proper tags", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const result = importGeneratedTasks(projectId, {
        alias: "sprint-1",
        tasks: [
          {
            title: "Build API",
            description: "REST endpoints",
            phase: 1,
            phaseName: "Backend",
            sequence: 1,
          },
          {
            title: "Add auth",
            description: "JWT auth",
            phase: 1,
            phaseName: "Backend",
            sequence: 2,
          },
        ],
      });

      expect(result.created).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.taskIds).toHaveLength(2);
      expect(result.roadmapAlias).toBe("sprint-1");

      const stored = findTasksByRoadmapAlias(projectId, "sprint-1");
      expect(stored).toHaveLength(2);
      // Every generated task must have skipReview=true so the auto-pipeline
      // doesn't pause on review for roadmap imports. Regular (non-parallel)
      // projects fall back to fast-mode flag defaults.
      for (const task of stored) {
        expect(task.skipReview).toBe(true);
        expect(task.plannerMode).toBe("fast");
        expect(task.planDocs).toBe(false);
        expect(task.planTests).toBe(false);
      }
    });

    it.each(["audit-logging", "security-review", "tests", "coverage", "build", "add-checkout"])(
      "should keep typed-looking import alias %s as general without explicit intent",
      (alias) => {
        const { projectId } = createProjectWithRoadmap("# Roadmap");

        const result = importGeneratedTasks(projectId, {
          alias,
          tasks: [
            {
              title: "Add audit logging",
              description: "Capture security review events and test coverage notes",
              phase: 1,
              phaseName: "Observability",
              sequence: 1,
            },
          ],
        });

        expect(result.created).toBe(1);
        const [task] = findTasksByRoadmapAlias(projectId, alias);
        expect(task.taskIntent).toBe("general");
        expect(task.plannerMode).toBe("fast");
        expect(task.skipReview).toBe(true);
        expect(task.tags).toContain("kind:general");
        expect(task.tags).not.toContain("diagnostic-only");
      },
    );

    it("should reject audit-shaped import aliases without audit intent before creating tasks", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");
      const importAuditShapedRoadmap = () =>
        importGeneratedTasks(projectId, {
          alias: "audit.6",
          tasks: [
            {
              title: "Audit project",
              description: "Review the codebase",
              phase: 1,
              phaseName: "Audit",
              sequence: 1,
            },
          ],
        });

      expect(importAuditShapedRoadmap).toThrow(RoadmapGenerationError);
      expect(importAuditShapedRoadmap).toThrow("Audit-shaped roadmap requests must set taskIntent");
      expect(findTasksByRoadmapAlias(projectId, "audit.6")).toHaveLength(0);
    });

    it("should import audit roadmap tasks with full planning and review enabled", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const result = importGeneratedTasks(projectId, {
        alias: "audit",
        taskIntent: "audit",
        tasks: [
          {
            title: "Audit: configuration",
            description: auditTaskDescription(),
            phase: 1,
            phaseName: "Audit",
            sequence: 1,
          },
          {
            title: "Synthesize audit findings",
            description: auditTaskDescription("audit/2026-05-09-summary.md"),
            phase: 2,
            phaseName: "Synthesis",
            sequence: 1,
          },
        ],
      });

      expect(result.created).toBe(2);
      expect(result.containerTaskId).toBeTruthy();
      expect(result.batchSummary?.status).toBe("expected");
      expect(result.batchSummary?.executionPolicy).toBe("serialized_shared_checkout");
      expect(result.batchSummary?.counts.total).toBe(2);
      const storedTasks = findTasksByRoadmapAlias(projectId, "audit");
      const task = storedTasks.find((stored) => stored.title === "Audit: configuration");
      const synthesis = storedTasks.find((stored) => stored.title === "Synthesize audit findings");
      const parent = storedTasks.find((stored) => stored.id === result.containerTaskId);
      expect(parent).toBeDefined();
      expect(parent?.hierarchyRole).toBe("container");
      expect(parent?.parentCloseoutPolicy).toBe("synthesis_child_verified");
      expect(task).toBeDefined();
      expect(task?.parentTaskId).toBe(parent?.id);
      expect(task?.taskIntent).toBe("audit");
      expect(task?.plannerMode).toBe("full");
      expect(task?.planDocs).toBe(true);
      expect(task?.planTests).toBe(true);
      expect(task?.skipReview).toBe(false);
      expect(task?.useSubagents).toBe(true);
      expect(task?.tags).toContain("kind:audit");
      expect(task?.tags).toContain("diagnostic-only");
      expect(task?.description).toContain("Task intent: audit");
      expect(task?.description).toContain(
        "Expected report artifact: audit/2026-05-09-config-audit.md",
      );
      expect(task?.description).toContain("Allowed write paths: audit/2026-05-09-config-audit.md");
      expect(task?.description).toContain("Dependency order:");
      expect(task?.description).toContain("Trusted artifact lifecycle:");
      expect(synthesis?.paused).toBe(true);
      expect(synthesis?.parentTaskId).toBe(parent?.id);
      expect(synthesis?.blockedReason).toContain("synthesis_not_ready");
      const batch = findRoadmapBatchByProjectAlias(projectId, "audit");
      expect(batch).toBeDefined();
      expect(JSON.parse(batch!.createdTaskIdsJson)).toEqual(result.taskIds);
      expect(JSON.parse(batch!.createdTaskIdsJson)).not.toContain(result.containerTaskId);
      const artifacts = listRoadmapBatchArtifacts(batch!.id);
      expect(artifacts.map((artifact) => artifact.role).sort()).toEqual(["report", "synthesis"]);
      expect(artifacts.map((artifact) => artifact.artifactPath).sort()).toEqual([
        "audit/2026-05-09-config-audit.md",
        "audit/2026-05-09-summary.md",
      ]);
    });

    it("should reject reused audit roadmap aliases instead of partially importing duplicates", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");
      const generation = {
        alias: "audit",
        taskIntent: "audit" as const,
        tasks: [
          {
            title: "Audit: configuration",
            description: auditTaskDescription(),
            phase: 1,
            phaseName: "Audit",
            sequence: 1,
          },
          {
            title: "Synthesize audit findings",
            description: auditTaskDescription("audit/2026-05-09-summary.md"),
            phase: 2,
            phaseName: "Synthesis",
            sequence: 1,
          },
        ],
      };

      expect(importGeneratedTasks(projectId, generation).created).toBe(2);
      expect(() => importGeneratedTasks(projectId, generation)).toThrow(RoadmapGenerationError);
      expect(() => importGeneratedTasks(projectId, generation)).toThrow(/already has 2 task\(s\)/);
      expect(
        rejectReusedRoadmapAlias({ projectId, roadmapAlias: "audit", taskIntent: "audit" }),
      ).toMatch(/already has 2 task\(s\)/);
      expect(
        rejectReusedRoadmapAlias({
          projectId,
          roadmapAlias: "feature-checkout",
          taskIntent: "feature",
        }),
      ).toBeNull();
    });

    it("should reject reused audit aliases when stale batch metadata exists without tasks", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");
      testDb.current
        .insert(roadmapBatches)
        .values({
          id: "stale-audit-batch",
          projectId,
          roadmapAlias: "audit-stale",
          taskIntent: "audit",
          status: "expected",
          executionPolicy: "serialized_shared_checkout",
          createdTaskIdsJson: "[]",
        })
        .run();
      const generation = {
        alias: "audit-stale",
        taskIntent: "audit" as const,
        tasks: [
          {
            title: "Audit: configuration",
            description: auditTaskDescription(),
            phase: 1,
            phaseName: "Audit",
            sequence: 1,
          },
          {
            title: "Synthesize audit findings",
            description: auditTaskDescription("audit/2026-05-09-summary.md"),
            phase: 2,
            phaseName: "Synthesis",
            sequence: 1,
          },
        ],
      };

      expect(() => importGeneratedTasks(projectId, generation)).toThrow(RoadmapGenerationError);
      expect(() => importGeneratedTasks(projectId, generation)).toThrow(/batch metadata/);
      expect(
        rejectReusedRoadmapAlias({ projectId, roadmapAlias: "audit-stale", taskIntent: "audit" }),
      ).toMatch(/batch metadata/);
    });

    it("should ignore per-task typed intent when import batch intent is omitted", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const result = importGeneratedTasks(projectId, {
        alias: "feature-checkout",
        tasks: [
          {
            title: "Add checkout flow",
            taskIntent: "feature",
            description:
              "Acceptance criteria: users can submit checkout.\nVerification: npm test -- checkout passes.",
            phase: 1,
            phaseName: "Feature",
            sequence: 1,
          },
        ],
      });

      expect(result.created).toBe(1);
      const [task] = findTasksByRoadmapAlias(projectId, "feature-checkout");
      expect(task.taskIntent).toBe("general");
      expect(task.plannerMode).toBe("fast");
      expect(task.planDocs).toBe(false);
      expect(task.planTests).toBe(false);
      expect(task.skipReview).toBe(true);
      expect(task.tags).toContain("kind:general");
    });

    it("should import feature roadmap tasks with typed feature defaults when batch intent is explicit", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const result = importGeneratedTasks(projectId, {
        alias: "feature-checkout",
        taskIntent: "feature",
        tasks: [
          {
            title: "Add checkout flow",
            taskIntent: "feature",
            description:
              "Acceptance criteria: users can submit checkout.\nVerification: npm test -- checkout passes.",
            phase: 1,
            phaseName: "Feature",
            sequence: 1,
          },
        ],
      });

      expect(result.created).toBe(1);
      const [task] = findTasksByRoadmapAlias(projectId, "feature-checkout");
      expect(task.taskIntent).toBe("feature");
      expect(task.plannerMode).toBe("full");
      expect(task.planDocs).toBe(true);
      expect(task.planTests).toBe(true);
      expect(task.skipReview).toBe(false);
      expect(task.tags).toContain("kind:feature");
      expect(task.tags).not.toContain("diagnostic-only");
      expect(result.batchSummary).toBeUndefined();
    });

    it("should reject per-task intent mismatches in explicitly typed import batches", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      expect(() =>
        importGeneratedTasks(projectId, {
          alias: "feature-checkout",
          taskIntent: "feature",
          tasks: [
            {
              title: "Add checkout flow",
              taskIntent: "docs",
              description:
                "Acceptance criteria: users can submit checkout.\nVerification: npm test -- checkout passes.",
              phase: 1,
              phaseName: "Feature",
              sequence: 1,
            },
          ],
        }),
      ).toThrow("expected taskIntent feature but received docs");
    });

    it("should reject audit import batches without exactly one generated synthesis card", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      expect(() =>
        importGeneratedTasks(projectId, {
          alias: "audit",
          taskIntent: "audit",
          tasks: [
            {
              title: "Audit: configuration",
              taskIntent: "audit",
              description: auditTaskDescription(),
              phase: 1,
              phaseName: "Audit",
              sequence: 1,
            },
          ],
        }),
      ).toThrow("expected exactly one final synthesis card, found 0");
      expect(findTasksByRoadmapAlias(projectId, "audit")).toHaveLength(0);
    });

    it("should reject audit import batches with extra generated synthesis cards", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      expect(() =>
        importGeneratedTasks(projectId, {
          alias: "audit",
          taskIntent: "audit",
          tasks: [
            {
              title: "Audit: configuration",
              taskIntent: "audit",
              description: auditTaskDescription(),
              phase: 1,
              phaseName: "Audit",
              sequence: 1,
            },
            {
              title: "Synthesize audit findings",
              taskIntent: "audit",
              description: auditTaskDescription("audit/summary.md"),
              phase: 2,
              phaseName: "Synthesis",
              sequence: 1,
            },
            {
              title: "Synthesize final audit summary",
              taskIntent: "audit",
              description: auditTaskDescription("audit/final-summary.md"),
              phase: 2,
              phaseName: "Synthesis",
              sequence: 2,
            },
          ],
        }),
      ).toThrow("expected exactly one final synthesis card, found 2");
      expect(findTasksByRoadmapAlias(projectId, "audit")).toHaveLength(0);
    });

    it("should reject audit import batches with Allowed changes: None", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      expect(() =>
        importGeneratedTasks(projectId, {
          alias: "audit",
          taskIntent: "audit",
          tasks: [
            {
              title: "Audit: configuration",
              taskIntent: "audit",
              description: auditTaskDescription().replace(
                "Allowed changes: only create/update one report artifact.",
                "Allowed changes: None",
              ),
              phase: 1,
              phaseName: "Audit",
              sequence: 1,
            },
            {
              title: "Synthesize audit findings",
              taskIntent: "audit",
              description: auditTaskDescription("audit/summary.md"),
              phase: 2,
              phaseName: "Synthesis",
              sequence: 1,
            },
          ],
        }),
      ).toThrow("Allowed changes: None");
      expect(findTasksByRoadmapAlias(projectId, "audit")).toHaveLength(0);
    });

    it("should reject audit import batches with Allowed changes that include source edits", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      expect(() =>
        importGeneratedTasks(projectId, {
          alias: "audit",
          taskIntent: "audit",
          tasks: [
            {
              title: "Audit: configuration",
              taskIntent: "audit",
              description: auditTaskDescription().replace(
                "Allowed changes: only create/update one report artifact.",
                "Allowed changes: only create/update audit/config-audit.md and packages/api/src/index.ts.",
              ),
              phase: 1,
              phaseName: "Audit",
              sequence: 1,
            },
            {
              title: "Synthesize audit findings",
              taskIntent: "audit",
              description: auditTaskDescription("audit/summary.md"),
              phase: 2,
              phaseName: "Synthesis",
              sequence: 1,
            },
          ],
        }),
      ).toThrow("must limit Allowed changes to the report artifact");
      expect(findTasksByRoadmapAlias(projectId, "audit")).toHaveLength(0);
    });

    it("should reject audit import batches without a concrete report artifact path", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      expect(() =>
        importGeneratedTasks(projectId, {
          alias: "audit",
          taskIntent: "audit",
          tasks: [
            {
              title: "Audit: configuration",
              taskIntent: "audit",
              description: auditTaskDescription().replace(
                "Report artifact: audit/2026-05-09-config-audit.md",
                "Report artifact: audit report",
              ),
              phase: 1,
              phaseName: "Audit",
              sequence: 1,
            },
            {
              title: "Synthesize audit findings",
              taskIntent: "audit",
              description: auditTaskDescription("audit/summary.md"),
              phase: 2,
              phaseName: "Synthesis",
              sequence: 1,
            },
          ],
        }),
      ).toThrow("report artifact must be a concrete .md report path");
      expect(findTasksByRoadmapAlias(projectId, "audit")).toHaveLength(0);
    });

    it("should reject audit import batches missing canonical no-findings guardrails", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      expect(() =>
        importGeneratedTasks(projectId, {
          alias: "audit",
          taskIntent: "audit",
          tasks: [
            {
              title: "Audit: configuration",
              taskIntent: "audit",
              description: auditTaskDescription().replace(AUDIT_NO_FINDINGS_PROOF_GUARDRAIL, ""),
              phase: 1,
              phaseName: "Audit",
              sequence: 1,
            },
            {
              title: "Synthesize audit findings",
              taskIntent: "audit",
              description: auditTaskDescription("audit/summary.md"),
              phase: 2,
              phaseName: "Synthesis",
              sequence: 1,
            },
          ],
        }),
      ).toThrow("no-findings proof guardrail");
      expect(findTasksByRoadmapAlias(projectId, "audit")).toHaveLength(0);
    });

    it("should reject audit import batches missing prior inconclusive alias context", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      expect(() =>
        importGeneratedTasks(projectId, {
          alias: "audit-v8-after-audit-v7-inconclusive",
          taskIntent: "audit",
          tasks: [
            {
              title: "Audit: configuration",
              taskIntent: "audit",
              description: auditTaskDescription(),
              phase: 1,
              phaseName: "Audit",
              sequence: 1,
            },
            {
              title: "Synthesize audit findings",
              taskIntent: "audit",
              description: auditTaskDescription("audit/summary.md"),
              phase: 2,
              phaseName: "Synthesis",
              sequence: 1,
            },
          ],
        }),
      ).toThrow("Prior audit context");
      expect(
        findTasksByRoadmapAlias(projectId, "audit-v8-after-audit-v7-inconclusive"),
      ).toHaveLength(0);
    });

    it("should validate a full typed batch before creating any tasks", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      expect(() =>
        importGeneratedTasks(projectId, {
          alias: "feature-checkout",
          taskIntent: "feature",
          tasks: [
            {
              title: "Add checkout flow",
              taskIntent: "feature",
              description:
                "Acceptance criteria: users can submit checkout.\nVerification: npm test -- checkout passes.",
              phase: 1,
              phaseName: "Feature",
              sequence: 1,
            },
            {
              title: "Add checkout confirmation",
              taskIntent: "feature",
              description: "Acceptance criteria: users see a confirmation.",
              phase: 1,
              phaseName: "Feature",
              sequence: 2,
            },
          ],
        }),
      ).toThrow("feature task is missing Verification");
      expect(findTasksByRoadmapAlias(projectId, "feature-checkout")).toHaveLength(0);
    });

    it("should validate invalid duplicates before creating valid new typed tasks", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      importGeneratedTasks(projectId, {
        alias: "legacy-audit",
        tasks: [
          {
            title: "Audit: Critical Bug Resolution",
            description: "Legacy generic duplicate.",
            phase: 1,
            phaseName: "Legacy",
            sequence: 1,
          },
        ],
      });

      expect(() =>
        importGeneratedTasks(projectId, {
          alias: "legacy-audit",
          taskIntent: "audit",
          tasks: [
            {
              title: "Audit: Critical Bug Resolution",
              taskIntent: "audit",
              description: auditTaskDescription(),
              phase: 1,
              phaseName: "Audit",
              sequence: 1,
            },
            {
              title: "Audit: configuration",
              taskIntent: "audit",
              description: auditTaskDescription("audit/configuration.md"),
              phase: 1,
              phaseName: "Audit",
              sequence: 2,
            },
            {
              title: "Synthesize audit findings",
              taskIntent: "audit",
              description: auditTaskDescription("audit/summary.md"),
              phase: 2,
              phaseName: "Synthesis",
              sequence: 1,
            },
          ],
        }),
      ).toThrow("audit task title describes implementation work");

      const stored = findTasksByRoadmapAlias(projectId, "legacy-audit");
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toBe("Audit: Critical Bug Resolution");
    });

    it("should apply full-mode defaults for parallel-enabled projects (still skipReview=true)", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");
      // Force parallelEnabled — roadmap import must honor the same rule
      // POST /tasks applies: parallel projects are locked to full mode.
      testDb.current
        .update(projects)
        .set({ parallelEnabled: true })
        .where(eq(projects.id, projectId))
        .run();

      const result = importGeneratedTasks(projectId, {
        alias: "sprint-parallel",
        tasks: [
          {
            title: "Parallel task",
            description: "",
            phase: 1,
            phaseName: "P",
            sequence: 1,
          },
        ],
      });

      expect(result.created).toBe(1);
      const [task] = findTasksByRoadmapAlias(projectId, "sprint-parallel");
      expect(task.plannerMode).toBe("full");
      expect(task.planDocs).toBe(true);
      expect(task.planTests).toBe(true);
      expect(task.skipReview).toBe(true);
    });

    it("should position imported roadmap tasks in phase and sequence order for auto-queue", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const result = importGeneratedTasks(
        projectId,
        {
          alias: "v1",
          tasks: [
            { title: "Phase 5", description: "", phase: 5, phaseName: "Late", sequence: 1 },
            { title: "Phase 1 second", description: "", phase: 1, phaseName: "Early", sequence: 2 },
            { title: "Phase 1 first", description: "", phase: 1, phaseName: "Early", sequence: 1 },
            { title: "Phase 1 tie A", description: "", phase: 1, phaseName: "Early", sequence: 3 },
            { title: "Phase 1 tie B", description: "", phase: 1, phaseName: "Early", sequence: 3 },
          ],
        },
        { pauseCreatedTasks: false },
      );

      expect(result.created).toBe(5);
      const stored = findTasksByRoadmapAlias(projectId, "v1")
        .sort((a, b) => a.position - b.position)
        .map((task) => task.title);

      expect(stored).toEqual([
        "Phase 1 first",
        "Phase 1 second",
        "Phase 1 tie A",
        "Phase 1 tie B",
        "Phase 5",
      ]);
      expect(nextBacklogTaskByPosition(projectId)?.title).toBe("Phase 1 first");
    });

    it("should not leave position gaps for skipped duplicate roadmap tasks", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      importGeneratedTasks(projectId, {
        alias: "v1",
        tasks: [
          { title: "Already exists", description: "", phase: 1, phaseName: "P1", sequence: 1 },
        ],
      });

      const result = importGeneratedTasks(projectId, {
        alias: "v1",
        tasks: [
          { title: "Already exists", description: "", phase: 1, phaseName: "P1", sequence: 1 },
          { title: "Created first", description: "", phase: 1, phaseName: "P1", sequence: 2 },
          { title: "Created second", description: "", phase: 1, phaseName: "P1", sequence: 3 },
        ],
      });

      expect(result.created).toBe(2);
      expect(result.skipped).toBe(1);

      const createdPositions = findTasksByRoadmapAlias(projectId, "v1")
        .filter((task) => task.title.startsWith("Created "))
        .sort((a, b) => a.position - b.position)
        .map((task) => task.position);

      expect(createdPositions).toHaveLength(2);
      expect(createdPositions[1] - createdPositions[0]).toBe(100);
    });

    it("should skip duplicates by normalized title", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");
      const generation = {
        alias: "v1",
        tasks: [{ title: "Setup DB", description: "", phase: 1, phaseName: "Init", sequence: 1 }],
      };

      // First import
      const first = importGeneratedTasks(projectId, generation);
      expect(first.created).toBe(1);

      // Second import — same title should be skipped
      const second = importGeneratedTasks(projectId, generation);
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(1);
    });

    it("should track per-phase statistics", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const result = importGeneratedTasks(projectId, {
        alias: "v1",
        tasks: [
          { title: "T1", description: "", phase: 1, phaseName: "A", sequence: 1 },
          { title: "T2", description: "", phase: 2, phaseName: "B", sequence: 1 },
          { title: "T3", description: "", phase: 2, phaseName: "B", sequence: 2 },
        ],
      });

      expect(result.byPhase[1]).toEqual({ created: 1, skipped: 0 });
      expect(result.byPhase[2]).toEqual({ created: 2, skipped: 0 });
    });

    // Regression: lee-to/aif-handoff#55 — roadmap import used to assign every
    // task the shared default plan path `.ai-factory/PLAN.md` because
    // importGeneratedTasks didn't compute a per-task planPath, so successive
    // tasks would overwrite each other's plan file on disk. The fix derives a
    // unique slug-based planPath per task while leaving plannerMode untouched.
    it("should assign a unique per-task planPath on roadmap import (#55)", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const tasks = [
        {
          title: "Implement auth flow",
          description: "JWT + refresh",
          phase: 1,
          phaseName: "Backend",
          sequence: 1,
        },
        {
          title: "Add product search",
          description: "Postgres FTS",
          phase: 1,
          phaseName: "Backend",
          sequence: 2,
        },
        {
          title: "Build dashboard page",
          description: "React + Tailwind",
          phase: 2,
          phaseName: "Frontend",
          sequence: 1,
        },
      ];

      const result = importGeneratedTasks(projectId, {
        alias: "v1",
        tasks,
      });

      expect(result.created, "all three tasks should be created").toBe(3);
      expect(result.skipped).toBe(0);

      const stored = findTasksByRoadmapAlias(projectId, "v1");
      expect(stored).toHaveLength(3);

      const planPaths = stored.map((t) => t.planPath);
      const uniquePlanPaths = new Set(planPaths);
      expect(uniquePlanPaths.size, "each imported task must have a distinct planPath").toBe(3);

      for (const path of planPaths) {
        expect(
          path,
          "no imported task should inherit the shared default `.ai-factory/PLAN.md`",
        ).not.toBe(".ai-factory/PLAN.md");
        expect(path.startsWith(".ai-factory/plans/")).toBe(true);
        expect(path.endsWith(".md")).toBe(true);
      }

      // Each planPath must match the slug computed from the title via the
      // shared helper — keeps the contract with `generatePlanPath` explicit.
      for (const task of tasks) {
        const expectedPath = generatePlanPath(task.title, "full", {
          plansDir: ".ai-factory/plans/",
          defaultPlanPath: ".ai-factory/PLAN.md",
        });
        const matched = stored.find((t) => t.title === task.title);
        expect(matched, `task ${task.title} should exist`).toBeDefined();
        expect(matched?.planPath).toBe(expectedPath);
      }
    });

    // Regression: slug collisions between distinct titles must not produce
    // duplicate planPaths. When two titles slugify to the same string (e.g.
    // punctuation-only differences), the second task should get a `-2`
    // suffix before `.md`, and so on.
    it("should resolve slug collisions with numeric suffixes", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      const tasks = [
        {
          title: "Fix bug!",
          description: "first",
          phase: 1,
          phaseName: "Backend",
          sequence: 1,
        },
        {
          title: "Fix bug?",
          description: "second",
          phase: 1,
          phaseName: "Backend",
          sequence: 2,
        },
        {
          title: "Fix bug.",
          description: "third",
          phase: 1,
          phaseName: "Backend",
          sequence: 3,
        },
      ];

      const result = importGeneratedTasks(projectId, { alias: "v1", tasks });
      expect(result.created).toBe(3);

      const stored = findTasksByRoadmapAlias(projectId, "v1");
      const planPaths = stored.map((t) => t.planPath).sort();

      expect(new Set(planPaths).size, "collisions must be resolved to unique paths").toBe(3);
      expect(planPaths).toEqual(
        [
          ".ai-factory/plans/fix-bug.md",
          ".ai-factory/plans/fix-bug-2.md",
          ".ai-factory/plans/fix-bug-3.md",
        ].sort(),
      );
    });

    // A second import against the same project should keep stepping the
    // suffix forward instead of overwriting any existing plan file.
    it("should avoid collisions across repeated imports", () => {
      const { projectId } = createProjectWithRoadmap("# Roadmap");

      importGeneratedTasks(projectId, {
        alias: "v1",
        tasks: [
          {
            title: "Fix bug",
            description: "first pass",
            phase: 1,
            phaseName: "Backend",
            sequence: 1,
          },
        ],
      });

      importGeneratedTasks(projectId, {
        alias: "v2",
        tasks: [
          {
            title: "Fix bug",
            description: "second pass",
            phase: 1,
            phaseName: "Backend",
            sequence: 1,
          },
        ],
      });

      const all = [
        ...findTasksByRoadmapAlias(projectId, "v1"),
        ...findTasksByRoadmapAlias(projectId, "v2"),
      ];
      const planPaths = all.map((t) => t.planPath).sort();
      expect(planPaths).toEqual(
        [".ai-factory/plans/fix-bug.md", ".ai-factory/plans/fix-bug-2.md"].sort(),
      );
    });
  });
});
