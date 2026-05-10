import { describe, it, expect, beforeEach, vi } from "vitest";
import { generatePlanPath, projects } from "@aif/shared";
import { eq } from "drizzle-orm";
import { createTestDb } from "@aif/shared/server";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
  RoadmapGenerationError,
} = await import("../services/roadmapGeneration.js");
const { findTasksByRoadmapAlias, nextBacklogTaskByPosition } = await import("@aif/data");

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

function auditTaskDescription(reportName = "audit/2026-05-09-config-audit.md") {
  return [
    "Scope: src/config.ts, src/index.ts",
    "Allowed changes: only create/update one report artifact.",
    `Report artifact: ${reportName}`,
    "Acceptance criteria: inspect the scoped files and record findings or none.",
    "Evidence requirements: every finding must include Evidence: <path>:<line>, Risk:, and Verification: Command ... output ...",
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
      expect(callArgs.prompt).toContain("ROADMAP.md");
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

    it("should generate a diagnostic audit roadmap when audit intent is requested", async () => {
      const { projectId } = createProjectWithDescription("# My App\nA service to audit");

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
        roadmapAlias: "audit-logging",
        taskIntent: "audit",
        vision: "\u043f\u0440\u043e\u0432\u0435\u0434\u0438 \u0430\u0443\u0434\u0438\u0442",
      });

      const callArgs = mockRunApiRuntimeOneShot.mock.calls[0][0];
      expect(callArgs.prompt).toContain("diagnostic audit decomposition roadmap");
      expect(callArgs.prompt).toContain(
        "Do not create implementation, fixing, refactoring, hardening",
      );
      expect(callArgs.prompt).toContain("Report artifact: audit/");
      expect(callArgs.prompt).toContain("every summarized finding must include Evidence: audit/");
    });

    it("should replace invalid generated audit roadmaps with a deterministic diagnostic roadmap", async () => {
      const { projectId } = createProjectWithDescription("# My App\nA service to audit");

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
      expect(result.content).toContain("Synthesize audit findings");
      expect(result.content).toContain("Allowed changes: only create/update audit/");
      expect(result.content).not.toContain("Initial Audit & Inventory");
      expect(readFileSync(result.roadmapPath, "utf8")).toBe(result.content);
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
      expect(result.tasks[1]).toMatchObject({
        title: "Synthesize audit findings",
        taskIntent: "audit",
        phase: 2,
        phaseName: "Synthesis",
        sequence: 1,
      });
    });
  });

  describe("importGeneratedTasks", () => {
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
      const task = findTasksByRoadmapAlias(projectId, "audit").find(
        (stored) => stored.title === "Audit: configuration",
      );
      expect(task).toBeDefined();
      expect(task?.taskIntent).toBe("audit");
      expect(task?.plannerMode).toBe("full");
      expect(task?.planDocs).toBe(true);
      expect(task?.planTests).toBe(true);
      expect(task?.skipReview).toBe(false);
      expect(task?.useSubagents).toBe(true);
      expect(task?.tags).toContain("kind:audit");
      expect(task?.tags).toContain("diagnostic-only");
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
        alias: "audit",
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
          alias: "audit",
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

      const stored = findTasksByRoadmapAlias(projectId, "audit");
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

      const result = importGeneratedTasks(projectId, {
        alias: "v1",
        tasks: [
          { title: "Phase 5", description: "", phase: 5, phaseName: "Late", sequence: 1 },
          { title: "Phase 1 second", description: "", phase: 1, phaseName: "Early", sequence: 2 },
          { title: "Phase 1 first", description: "", phase: 1, phaseName: "Early", sequence: 1 },
          { title: "Phase 1 tie A", description: "", phase: 1, phaseName: "Early", sequence: 3 },
          { title: "Phase 1 tie B", description: "", phase: 1, phaseName: "Early", sequence: 3 },
        ],
      });

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
