import { describe, expect, it } from "vitest";
import {
  PLAN_MANIFEST_REQUIRED_CREATED_AT,
  TaskPlanQualityError,
  buildDeterministicDiagnosticPlan,
  evaluateTaskPlanQuality,
  formatTaskPlanQualityBlockedReason,
  normalizeAifPlanManifestForTask,
  normalizeAifPlanManifestFence,
} from "../planQuality.js";

function planManifest(overrides: Record<string, unknown> = {}): string {
  return [
    "```aif-plan-manifest",
    JSON.stringify(
      {
        version: 1,
        taskId: "task-full",
        intent: "feature",
        scope: ["packages/shared/src/planQuality.ts"],
        allowedChanges: ["source", "tests"],
        forbiddenChanges: ["report", "unrelated modules", "secrets"],
        expectedArtifacts: [
          {
            kind: "source_diff",
            paths: ["packages/shared/src/planQuality.ts"],
          },
        ],
        acceptanceCriteria: [
          {
            id: "ac-1",
            description: "Plan manifest validation rejects weak full-mode plans.",
            verification:
              "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts",
          },
        ],
        verificationCommands: [
          "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts",
        ],
        ...overrides,
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function fullPlanWithManifest(manifest = planManifest()): string {
  return [
    "## Manifest plan",
    "",
    manifest,
    "",
    "- [ ] Update packages/shared/src/planQuality.ts with manifest validation.",
    "- [ ] Run npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts.",
  ].join("\n");
}

describe("evaluateTaskPlanQuality", () => {
  it("normalizes model-produced aif-plan-manifest sections fenced as json", () => {
    const jsonManifest = JSON.stringify(
      {
        version: 1,
        taskId: "task-full",
        intent: "feature",
        scope: ["packages/shared/src/planQuality.ts"],
        allowedChanges: ["source", "tests"],
        forbiddenChanges: ["report", "unrelated modules", "secrets"],
        expectedArtifacts: [{ kind: "source_diff", paths: ["packages/shared/src/planQuality.ts"] }],
        acceptanceCriteria: [
          {
            id: "ac-1",
            description: "The plan quality manifest is normalized before validation.",
            verification:
              "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts",
          },
        ],
        verificationCommands: [
          "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts",
        ],
      },
      null,
      2,
    );
    const normalized = normalizeAifPlanManifestFence(
      [
        "## AIF plan manifest",
        "",
        "```json",
        jsonManifest,
        "```",
        "",
        "- [ ] Update packages/shared/src/planQuality.ts with manifest normalization.",
        "- [ ] Run npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts.",
      ].join("\n"),
    );

    expect(normalized).toContain("```aif-plan-manifest");
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Normalize plan manifest",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: normalized,
    });
    expect(result.ok).toBe(true);
    expect(result.categories).not.toContain("missing_plan_manifest");
  });

  it("rejects broad scaffold, local dev stack, and base configuration manifests", () => {
    const malformedManifest = JSON.stringify(
      {
        version: 1,
        taskId: "task-full-descriptive",
        intent: "feature",
        scope: ["package.json", "tsconfig.json", ".gitignore", "src/index.ts", "src/core/types.ts"],
        allowedChanges: [
          "Config: package.json, tsconfig.json, .gitignore",
          "Source: src/ directory tree with core types and service layer",
        ],
        forbiddenChanges: [
          "No diagnostic-only audit, security-review, or code-review artifacts",
          "No database integrations or persistent storage",
        ],
        expectedArtifacts: [
          "Valid dist/ build output from npm run build",
          "Type definitions (.d.ts) for core types in dist/core/",
        ],
        acceptanceCriteria: [
          "package.json and tsconfig.json exist and are valid",
          "npm run build completes without TypeScript errors",
        ],
        verificationCommands: ["npm install", "npm run build", "node dist/index.js"],
      },
      null,
      2,
    );
    const plan = [
      "## Feature plan",
      "",
      "## aif-plan-manifest",
      "",
      "```json",
      malformedManifest,
      "```",
      "",
      "- [ ] Create package.json and tsconfig.json.",
      "- [ ] Add src/index.ts and src/core/types.ts.",
      "- [ ] Run npm install, npm run build, and node dist/index.js.",
    ].join("\n");

    const task = {
      id: "task-full-descriptive",
      title: "Setup Project Architecture and Core Engine Skeleton",
      description: "Scope: package.json, tsconfig.json, src/index.ts, src/core/types.ts.",
      taskIntent: "feature" as const,
      plannerMode: "full",
      createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
    };
    const normalized = normalizeAifPlanManifestForTask({ task, plan });
    const result = evaluateTaskPlanQuality({ task, plan: normalized });

    expect(normalized).toContain('"allowedChanges": [\n    "source",\n    "config"');
    expect(normalized).toContain('"kind": "source_diff"');
    expect(normalized).toContain('"kind": "config_update"');
    expect(result.ok).toBe(false);
    expect(result.categories).toContain("task_size_split_required");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "task_size_split_required",
          message: expect.stringMatching(
            /^split_required:.*major_subsystems=2>1.*verification_surface=setup_runtime_command:npm install.*ambiguity=project architecture/,
          ),
        }),
      ]),
    );
  });

  it("rejects broad no-manifest scaffold plans before implementation", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-broad-fast",
        title: "Setup Project Architecture and Core Engine Skeleton",
        description: "Create a skeleton application, local dev stack, and base configuration.",
        taskIntent: "feature",
        plannerMode: "fast",
      },
      plan: [
        "## Plan",
        "- [ ] Create the skeleton application and base configuration.",
        "- [ ] Wire the local dev stack.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("task_size_split_required");
    expect(
      result.issues.find((entry) => entry.code === "task_size_split_required")?.message,
    ).toMatch(/^split_required:/);
  });

  it("accepts a focused checklist plan for a simple task", () => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Update navbar copy", description: "Use the existing component." },
      plan: "## Plan\n- [ ] Update the navbar copy in the existing component\n- [ ] Run the focused UI test",
    });

    expect(result.ok).toBe(true);
    expect(result.categories).toEqual([]);
  });

  it("requires a plan manifest for new full-mode tasks", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Add plan manifest gate",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: [
        "## Plan",
        "- [ ] Update packages/shared/src/planQuality.ts with manifest validation.",
        "- [ ] Run npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("missing_plan_manifest");
    expect(result.planManifest).toMatchObject({
      required: true,
      present: false,
      status: "missing",
    });
  });

  it("treats src/index.ts as source, not metadata, in plan manifests", () => {
    const task = {
      id: "task-index-source",
      title: "Add entrypoint",
      description: "Scope: src/index.ts.",
      taskIntent: "feature" as const,
      plannerMode: "full",
      createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
    };
    const plan = [
      "## Plan",
      "",
      planManifest({
        taskId: "task-index-source",
        scope: ["src/index.ts"],
        allowedChanges: ["source"],
        forbiddenChanges: ["report"],
        expectedArtifacts: [{ kind: "source_diff", paths: ["src/index.ts"] }],
        acceptanceCriteria: [
          {
            id: "ac-entrypoint",
            description: "The application entrypoint is implemented as source.",
            verification: "npm.cmd run build",
          },
        ],
        verificationCommands: ["npm.cmd run build"],
      }),
      "",
      "- [ ] Update src/index.ts with the entrypoint wiring.",
      "- [ ] Run npm.cmd run build.",
    ].join("\n");

    const result = evaluateTaskPlanQuality({ task, plan });

    expect(result.ok).toBe(true);
    expect(result.categories).not.toContain("plan_manifest_expected_artifact_violation");
  });

  it("does not require a missing manifest for pre-rollout full-mode plans", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-old-full",
        title: "Old full-mode task",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: "2026-05-15T23:59:59.000Z",
      },
      plan: [
        "## Plan",
        "- [ ] Update packages/shared/src/planQuality.ts with a focused guard.",
        "- [ ] Run npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts.",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    expect(result.planManifest).toMatchObject({
      required: false,
      present: false,
      status: "not_required",
    });
  });

  it("requires a manifest for pre-rollout full-mode tasks intentionally replanned after plan-quality feedback", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-old-replanned",
        title: "Old full-mode replan",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: "2026-05-15T23:59:59.000Z",
        blockedFromStatus: "plan_ready",
        blockedReason: "Plan quality guard replan 1/3: previous feedback",
      },
      plan: [
        "## Plan",
        "- [ ] Update packages/shared/src/planQuality.ts with a focused guard.",
        "- [ ] Run npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("missing_plan_manifest");
    expect(result.planManifest?.required).toBe(true);
  });

  it("accepts a valid manifest for new full-mode tasks", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Add plan manifest gate",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest(),
    });

    expect(result.ok).toBe(true);
    expect(result.planManifest).toMatchObject({
      required: true,
      present: true,
      status: "valid",
      taskId: "task-full",
      intent: "feature",
    });
  });

  it("accepts a narrow concrete source and test manifest", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Add task-size gate",
        description:
          "Scope: packages/shared/src/planQuality.ts and packages/shared/src/__tests__/planQuality.test.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest(
        planManifest({
          scope: [
            "packages/shared/src/planQuality.ts",
            "packages/shared/src/__tests__/planQuality.test.ts",
          ],
          expectedArtifacts: [
            { kind: "source_diff", paths: ["packages/shared/src/planQuality.ts"] },
            {
              kind: "test_delta",
              paths: ["packages/shared/src/__tests__/planQuality.test.ts"],
            },
          ],
        }),
      ),
    });

    expect(result.ok).toBe(true);
    expect(result.categories).not.toContain("task_size_split_required");
  });

  it("accepts a narrow roadmap-created child with concrete boundaries", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "roadmap-child-1",
        title: "Child: add focused plan-quality regression",
        description:
          "Implement only packages/shared/src/__tests__/planQuality.test.ts. Acceptance: focused regression proves the validator accepts narrow child tasks. Verification: focused shared package test command.",
        taskIntent: "tests",
        plannerMode: "full",
        roadmapAlias: "task-size-gate",
        tags: ["roadmap-child"],
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest(
        planManifest({
          taskId: "roadmap-child-1",
          intent: "tests",
          scope: ["packages/shared/src/__tests__/planQuality.test.ts"],
          allowedChanges: ["tests"],
          forbiddenChanges: ["source", "docs", "config", "report"],
          expectedArtifacts: [
            {
              kind: "test_delta",
              paths: ["packages/shared/src/__tests__/planQuality.test.ts"],
            },
          ],
        }),
      ),
    });

    expect(result.ok).toBe(true);
    expect(result.categories).not.toContain("task_size_split_required");
  });

  it("rejects broad explicit-general roadmap children before implementation", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "roadmap-general-broad",
        title: "Setup Project Architecture and Core Engine Skeleton",
        description: "Create a skeleton application, local dev stack, and base configuration.",
        taskIntent: "general",
        plannerMode: "full",
        roadmapAlias: "generic-roadmap",
        tags: ["roadmap-child", "kind:general"],
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest(
        planManifest({
          taskId: "roadmap-general-broad",
          intent: "general",
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
        }),
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("task_size_split_required");
  });

  it("rejects malformed present manifests even when manifest is optional", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-fast",
        title: "Fast plan with bad manifest",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "fast",
      },
      plan: fullPlanWithManifest("```aif-plan-manifest\nnot-json\n```"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("invalid_plan_manifest");
    expect(result.planManifest).toMatchObject({
      required: false,
      present: true,
      status: "invalid",
    });
  });

  it("rejects multiple plan manifest blocks", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Add plan manifest gate",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest([planManifest(), planManifest()].join("\n\n")),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("invalid_plan_manifest");
    expect(result.planManifest).toMatchObject({
      required: true,
      present: true,
      status: "invalid",
    });
  });

  it("rejects manifest task and intent mismatches", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Add plan manifest gate",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest(planManifest({ taskId: "other-task", intent: "docs" })),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toEqual(
      expect.arrayContaining(["plan_manifest_task_mismatch", "plan_manifest_intent_mismatch"]),
    );
  });

  it("rejects untestable manifest acceptance criteria and missing verification commands", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Add plan manifest gate",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest(
        planManifest({
          acceptanceCriteria: [{ id: "ac-1", description: "Do the thing", verification: "TBD" }],
          verificationCommands: [],
        }),
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toEqual(
      expect.arrayContaining([
        "plan_manifest_untestable_acceptance_criteria",
        "plan_manifest_missing_verification_commands",
      ]),
    );
  });

  it("rejects prose-only verification commands and acceptance verification", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Add plan manifest gate",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest(
        planManifest({
          acceptanceCriteria: [
            {
              id: "ac-1",
              description: "Manual check is not enough",
              verification: "check manually",
            },
          ],
          verificationCommands: ["verify manually"],
        }),
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toEqual(
      expect.arrayContaining([
        "plan_manifest_untestable_acceptance_criteria",
        "plan_manifest_missing_verification_commands",
      ]),
    );
  });

  it("rejects allowed changes that contradict task intent policy", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Audit should remain report only",
        description:
          "Scope: packages/shared/src/planQuality.ts. Report artifact: audit/plan-quality.md.",
        taskIntent: "audit",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: [
        "## Audit manifest plan",
        "",
        planManifest({
          intent: "audit",
          allowedChanges: ["source", "report"],
          forbiddenChanges: ["source", "tests", "docs", "config"],
          scope: ["packages/shared/src/planQuality.ts"],
          expectedArtifacts: [{ kind: "audit_report", paths: ["audit/plan-quality.md"] }],
        }),
        "",
        "Report artifact: `audit/plan-quality.md`",
        "Scope: `packages/shared/src/planQuality.ts`.",
        "Scoped evidence targets: `packages/shared/src/planQuality.ts`.",
        "Excluded areas: generated files and unrelated source.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this narrow source report.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Inspect packages/shared/src/planQuality.ts and update audit/plan-quality.md.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("plan_manifest_allowed_change_violation");
  });

  it("rejects audit manifests with source expected artifacts", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Audit should not expect source diffs",
        description:
          "Scope: packages/shared/src/planQuality.ts. Report artifact: audit/plan-quality.md.",
        taskIntent: "audit",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: [
        "## Audit manifest plan",
        "",
        planManifest({
          intent: "audit",
          allowedChanges: ["report"],
          forbiddenChanges: ["source", "tests", "docs", "config"],
          scope: ["packages/shared/src/planQuality.ts"],
          expectedArtifacts: [
            { kind: "source_diff", paths: ["packages/shared/src/planQuality.ts"] },
          ],
        }),
        "",
        "Report artifact: `audit/plan-quality.md`",
        "Scope: `packages/shared/src/planQuality.ts`.",
        "Scoped evidence targets: `packages/shared/src/planQuality.ts`.",
        "Excluded areas: generated files and unrelated source.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this narrow source report.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Inspect packages/shared/src/planQuality.ts and update audit/plan-quality.md.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("plan_manifest_expected_artifact_violation");
  });

  it("rejects expected artifact categories omitted from manifest allowedChanges", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Feature manifest must allow expected source artifacts",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest(
        planManifest({
          allowedChanges: ["tests"],
          forbiddenChanges: ["report"],
          expectedArtifacts: [
            { kind: "source_diff", paths: ["packages/shared/src/planQuality.ts"] },
          ],
        }),
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("plan_manifest_expected_artifact_violation");
  });

  it("rejects expected artifact categories listed in manifest forbiddenChanges", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Feature manifest must not forbid expected source artifacts",
        description: "Scope: packages/shared/src/planQuality.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest(
        planManifest({
          allowedChanges: ["tests"],
          forbiddenChanges: ["report", "source"],
          expectedArtifacts: [
            { kind: "source_diff", paths: ["packages/shared/src/planQuality.ts"] },
          ],
        }),
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("plan_manifest_expected_artifact_violation");
  });

  it("rejects manifest categories listed in both allowedChanges and forbiddenChanges", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Feature manifest must not both allow and forbid source",
        description: "Scope: packages/shared/src/__tests__/planQuality.test.ts.",
        taskIntent: "feature",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: fullPlanWithManifest(
        planManifest({
          scope: ["packages/shared/src/__tests__/planQuality.test.ts"],
          allowedChanges: ["source", "tests"],
          forbiddenChanges: ["report", "source"],
          expectedArtifacts: [
            {
              kind: "test_delta",
              paths: ["packages/shared/src/__tests__/planQuality.test.ts"],
            },
          ],
        }),
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("plan_manifest_allowed_change_violation");
  });

  it("rejects manifests that omit required forbidden change policy categories", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Audit should declare source changes forbidden",
        description:
          "Scope: packages/shared/src/planQuality.ts. Report artifact: audit/plan-quality.md.",
        taskIntent: "audit",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: [
        "## Audit manifest plan",
        "",
        planManifest({
          intent: "audit",
          allowedChanges: ["report"],
          forbiddenChanges: [],
          scope: ["packages/shared/src/planQuality.ts"],
          expectedArtifacts: [{ kind: "audit_report", paths: ["audit/plan-quality.md"] }],
        }),
        "",
        "Report artifact: `audit/plan-quality.md`",
        "Scope: `packages/shared/src/planQuality.ts`.",
        "Scoped evidence targets: `packages/shared/src/planQuality.ts`.",
        "Excluded areas: generated files and unrelated source.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this narrow source report.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Inspect packages/shared/src/planQuality.ts and update audit/plan-quality.md.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toEqual(
      expect.arrayContaining([
        "missing_plan_manifest_fields",
        "plan_manifest_forbidden_change_violation",
      ]),
    );
  });

  it("rejects docs manifests that omit policy-forbidden source, tests, config, and report categories", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Document plan quality",
        description: "Scope: docs/ops/runbook.md.",
        taskIntent: "docs",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: [
        "## Docs manifest plan",
        "",
        planManifest({
          intent: "docs",
          allowedChanges: ["docs"],
          forbiddenChanges: ["source"],
          scope: ["docs/ops/runbook.md"],
          expectedArtifacts: [{ kind: "docs_diff", paths: ["docs/ops/runbook.md"] }],
        }),
        "",
        "- [ ] Update docs/ops/runbook.md with plan quality behavior.",
        "- [ ] Run npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("plan_manifest_forbidden_change_violation");
  });

  it("rejects docs manifests with source expected artifacts", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Document plan quality",
        description:
          "Scope: docs/ops/runbook.md and packages/shared/src/planQuality.ts for source facts.",
        taskIntent: "docs",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: [
        "## Docs manifest plan",
        "",
        planManifest({
          intent: "docs",
          allowedChanges: ["docs"],
          forbiddenChanges: ["source", "tests", "config", "report"],
          scope: ["docs/ops/runbook.md", "packages/shared/src/planQuality.ts"],
          expectedArtifacts: [
            { kind: "source_diff", paths: ["packages/shared/src/planQuality.ts"] },
          ],
        }),
        "",
        "- [ ] Verify packages/shared/src/planQuality.ts as the source fact input.",
        "- [ ] Update docs/ops/runbook.md with plan quality behavior.",
        "- [ ] Run npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("plan_manifest_expected_artifact_violation");
  });

  it("rejects tests manifests with source and docs expected artifacts", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        id: "task-full",
        title: "Add plan quality regression tests",
        description:
          "Scope: packages/shared/src/__tests__/planQuality.test.ts, packages/shared/src/planQuality.ts, and docs/ops/runbook.md.",
        taskIntent: "tests",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: [
        "## Tests manifest plan",
        "",
        planManifest({
          intent: "tests",
          allowedChanges: ["tests"],
          forbiddenChanges: ["source", "docs", "config", "report"],
          scope: [
            "packages/shared/src/__tests__/planQuality.test.ts",
            "packages/shared/src/planQuality.ts",
            "docs/ops/runbook.md",
          ],
          expectedArtifacts: [
            { kind: "source_diff", paths: ["packages/shared/src/planQuality.ts"] },
            { kind: "docs_diff", paths: ["docs/ops/runbook.md"] },
          ],
        }),
        "",
        "- [ ] Add regression coverage in packages/shared/src/__tests__/planQuality.test.ts.",
        "- [ ] Do not change packages/shared/src/planQuality.ts or docs/ops/runbook.md.",
        "- [ ] Run npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("plan_manifest_expected_artifact_violation");
  });

  it("rejects slash fallback echo and thinking artifacts", () => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Add audit report" },
      plan: "Short task\n/aif-plan fast @.ai-factory/PLAN.md docs:false tests:false\n</think>",
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toEqual(
      expect.arrayContaining(["placeholder_plan", "slash_fallback_echo", "thinking_artifact"]),
    );
  });

  it.each(["Do task", "Implement task"])("rejects generic checklist item text: %s", (itemText) => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Planner quality task" },
      plan: `## Plan\n- [ ] ${itemText}\n- [ ] Run tests`,
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("generic_plan");
  });

  it("does not treat implementation tasks mentioning review validation or verification as diagnostic", () => {
    for (const title of [
      "Fix review comment rendering",
      "Fix validation error display",
      "Add verification status badge",
    ]) {
      const result = evaluateTaskPlanQuality({
        task: { title, description: "Implementation task." },
        plan: "## Plan\n- [ ] Update the targeted UI behavior\n- [ ] Run the focused regression tests",
      });

      expect(result.ok).toBe(true);
      expect(result.categories).not.toContain("missing_diagnostic_report_constraints");
    }
  });

  it("requires task-mentioned repository paths to stay in the plan", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Patch planner",
        description: "Touch packages/agent/src/subagents/planner.ts and add tests.",
      },
      plan: "## Plan\n- [ ] Update the planner behavior\n- [ ] Run tests",
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("missing_task_specific_artifact_path");
    expect(result.issues[0]?.message).toContain("packages/agent/src/subagents/planner.ts");
  });

  it("requires diagnostic report path and diagnostic-only constraints", () => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Audit planner output quality", description: "Discovery task." },
      plan: "## Plan\n- [ ] Inspect planner and plan-checker code\n- [ ] Summarize findings",
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("missing_diagnostic_report_constraints");
  });

  it("accepts diagnostic report artifacts under audit with summary filenames", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Synthesize audit findings",
        description:
          "Scope: audit reports generated by this audit batch under audit/. Report artifact: audit/2026-05-10-summary.md.",
        taskIntent: "audit",
      },
      plan: [
        "## Synthesize audit findings",
        "Report artifact: `audit/2026-05-10-summary.md`",
        "Scope: existing child audit reports from this audit batch.",
        "Scoped evidence targets: `audit/source-audit-one.md`, `audit/source-audit-two.md`.",
        "Excluded areas: source code, config, and test files.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child reports: required existing completed source audit reports plus synthesis summary.",
        "- [ ] Keep this diagnostic-only and do not edit source, config, or test files.",
        "- [ ] Create or update `audit/2026-05-10-summary.md` with exact Evidence: <path>:<line>, Risk:, and Verification: Command ... output ... markers.",
        "- [ ] Commit `audit/2026-05-10-summary.md` and verify with git log -1 --name-only --oneline.",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    expect(result.categories).not.toContain("missing_diagnostic_report_constraints");
  });

  it("rejects weak broad audit plans with missing contract markers and decomposition", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Audit the whole repository",
        description: "Run a comprehensive audit of the entire repo.",
        taskIntent: "audit",
      },
      plan: [
        "## Plan",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Write findings to `audit/repo-audit.md`.",
        "- [ ] Summarize findings.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toEqual(
      expect.arrayContaining([
        "missing_audit_evidence_targets",
        "missing_audit_exclusions",
        "missing_audit_report_structure",
        "missing_child_audit_report_decision",
        "missing_audit_decomposition",
      ]),
    );
  });

  it("rejects oversized unrelated broad audit plans without decomposed structure", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Owner-grade production readiness audit",
        description:
          "Audit the repository for security, performance, reliability, and correctness. Report artifact: audit/production-readiness.md.",
        taskIntent: "audit",
      },
      plan: [
        "## Plan",
        "Report artifact: `audit/production-readiness.md`",
        "Scope: entire repository.",
        "Scoped evidence targets: app code, deployment config, tests, and docs.",
        "Excluded areas: none.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Inspect everything and update `audit/production-readiness.md`.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("missing_audit_decomposition");
  });

  it("builds deterministic source-report plans for persisted audit batch children", () => {
    const task = {
      id: "task-security-audit",
      title: "Audit: security and configuration controls",
      description:
        "Scope: .env.example, .ai-factory/config.yaml, src/bot_intevra/config.py, src/bot_intevra/secret_scan.py, src, docs/ops. Report artifact: audit/2026-05-15-audit-security-and-configuration-controls-audit.md.",
      taskIntent: "audit" as const,
      plannerMode: "full",
      createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      auditArtifactRole: "report" as const,
      roadmapBatchId: "batch-1",
    };

    const plan = buildDeterministicDiagnosticPlan({ task });

    expect(plan).toContain("```aif-plan-manifest");
    expect(plan).toContain("audit/2026-05-15-audit-security-and-configuration-controls-audit.md");
    const result = evaluateTaskPlanQuality({ task, plan });
    expect(result.ok).toBe(true);
    expect(result.categories).toEqual([]);
  });

  it("does not require decomposition again for source report children in a persisted audit batch", () => {
    const task = {
      title: "Owner-grade production readiness audit source report",
      description:
        "Audit security, performance, reliability, and correctness for packages/agent/src. Report artifact: audit/agent-source-audit.md.",
      taskIntent: "audit" as const,
      auditArtifactRole: "report" as const,
      roadmapBatchId: "batch-1",
    };
    const plan = [
      "## Source report audit plan",
      "Report artifact: `audit/agent-source-audit.md`",
      "Scope: `packages/agent/src`.",
      "Scoped evidence targets: `packages/agent/src`.",
      "Excluded areas: generated files, dependency caches, build output, and unrelated packages.",
      "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
      "Child audit reports: not required for this persisted source report child.",
      "- [ ] Keep this diagnostic-only and do not implement fixes.",
      "- [ ] Inspect `packages/agent/src` and update `audit/agent-source-audit.md`.",
    ].join("\n");
    const result = evaluateTaskPlanQuality({ task, plan });
    const missingExclusions = evaluateTaskPlanQuality({
      task,
      plan: [
        "## Source report audit plan",
        "Report artifact: `audit/agent-source-audit.md`",
        "Scope: `packages/agent/src`.",
        "Scoped evidence targets: `packages/agent/src`.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this persisted source report child.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Inspect `packages/agent/src` and update `audit/agent-source-audit.md`.",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    expect(result.categories).not.toContain("missing_audit_decomposition");
    expect(missingExclusions.ok).toBe(false);
    expect(missingExclusions.categories).toContain("missing_audit_exclusions");
    expect(missingExclusions.categories).not.toContain("missing_audit_decomposition");
  });

  it("still rejects broad audit plans without persisted batch source report context", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Owner-grade production readiness audit source report",
        description:
          "Audit security, performance, reliability, and correctness for packages/agent/src. Report artifact: audit/agent-source-audit.md.",
        taskIntent: "audit",
      },
      plan: [
        "## Source report audit plan",
        "Report artifact: `audit/agent-source-audit.md`",
        "Scope: `packages/agent/src`.",
        "Scoped evidence targets: `packages/agent/src`.",
        "Excluded areas: generated files, dependency caches, build output, and unrelated packages.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this persisted source report child.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Inspect `packages/agent/src` and update `audit/agent-source-audit.md`.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("missing_audit_decomposition");
  });

  it("accepts a narrow audit plan with scoped evidence, exclusions, report fields, and no child reports", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Audit plan-quality evaluator",
        description:
          "Scope: packages/shared/src/planQuality.ts. Report artifact: audit/plan-quality-audit.md.",
        taskIntent: "audit",
      },
      plan: [
        "## Plan-quality audit",
        "Report artifact: `audit/plan-quality-audit.md`",
        "Scope: `packages/shared/src/planQuality.ts`.",
        "Scoped evidence targets: `packages/shared/src/planQuality.ts` and `packages/shared/src/__tests__/planQuality.test.ts`.",
        "Excluded areas: runtime services, generated files, and unrelated packages.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this narrow source report.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Inspect the scoped files and update `audit/plan-quality-audit.md`.",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    expect(result.categories).toEqual([]);
  });

  it("rejects marker-only narrow audit plans without concrete evidence boundaries", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Audit planner quality",
        description: "Report artifact: audit/planner-quality.md.",
        taskIntent: "audit",
      },
      plan: [
        "## Planner quality audit",
        "Report artifact: `audit/planner-quality.md`",
        "Scope: planner quality audit.",
        "Scoped evidence targets: audit findings and report artifact.",
        "Excluded areas: none.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this narrow source report.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Update `audit/planner-quality.md` with findings.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("audit_without_concrete_boundaries");
  });

  it("rejects decomposed broad audit plans with marker-only source targets", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Comprehensive repository audit",
        description: "Audit the entire repo for security and reliability.",
        taskIntent: "audit",
      },
      plan: [
        "## Decomposed audit plan",
        "Report artifact: `audit/final-synthesis.md`",
        "Scope: entire repository split by source report.",
        "Scoped evidence targets: child reports, source audit outputs, and final synthesis.",
        "Excluded areas: generated files, dependency caches, and build output.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child reports: required source reports plus final synthesis.",
        "Synthesis: combine child report outcomes into `audit/final-synthesis.md`.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Produce child source reports.",
        "- [ ] Produce synthesis report `audit/final-synthesis.md`.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("audit_without_concrete_boundaries");
  });

  it("rejects synthesis plans that omit registry-provided exact source report artifacts", () => {
    const task = {
      title: "Synthesize audit findings",
      description: "Report artifact: audit/final-synthesis.md.",
      taskIntent: "audit" as const,
      auditArtifactRole: "synthesis" as const,
      roadmapBatchId: "batch-1",
      sourceReportArtifacts: [
        {
          taskId: "source-a",
          artifactPath: "audit/source-a.md",
          state: "valid",
          trusted: true,
        },
        {
          taskId: "source-b",
          artifactPath: "audit/source-b.md",
          state: "source_inconclusive",
          failureFamily: "source_inconclusive",
          trusted: false,
        },
      ],
    };

    const result = evaluateTaskPlanQuality({
      task,
      plan: [
        "## Decomposed audit synthesis plan",
        "Report artifact: `audit/final-synthesis.md`",
        "Scope: existing completed child audit reports.",
        "Scoped evidence targets: `audit/source-a.md`.",
        "Excluded areas: generated files, dependency caches, and build output.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child reports: required existing completed child audit reports plus final synthesis.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Produce synthesis report `audit/final-synthesis.md`.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("audit_without_concrete_boundaries");
  });

  it("builds deterministic synthesis fallback with exact source report paths and child status context", () => {
    const task = {
      title: "Synthesize audit findings",
      description: "Report artifact: audit/final-synthesis.md.",
      taskIntent: "audit" as const,
      auditArtifactRole: "synthesis" as const,
      roadmapBatchId: "batch-1",
      sourceReportArtifacts: [
        {
          taskId: "source-a",
          artifactPath: "audit/source-a.md",
          state: "valid",
          trusted: true,
        },
        {
          taskId: "source-b",
          artifactPath: "audit/source-b.md",
          state: "missing",
          failureFamily: "missing_artifact",
          trusted: false,
        },
      ],
    };

    const plan = buildDeterministicDiagnosticPlan({
      task,
      extraText: ["</think>\n/aif-plan fast"],
    });

    expect(plan).toContain("audit/source-a.md");
    expect(plan).toContain("audit/source-b.md");
    expect(plan).toContain("Source report status: 1 trusted, 1 untrusted");
    expect(plan).toContain("child report status table");
    expect(plan).toContain("audit inconclusive");
    expect(evaluateTaskPlanQuality({ task, plan }).ok).toBe(true);
  });

  it("rejects synthesis-only broad audit plans that target only the final report artifact", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Comprehensive repository audit",
        description: "Audit the entire repo for security and reliability.",
        taskIntent: "audit",
      },
      plan: [
        "## Decomposed audit synthesis plan",
        "Report artifact: `audit/final-synthesis.md`",
        "Scope: existing completed child audit reports.",
        "Scoped evidence targets: `audit/final-synthesis.md`; existing completed child audit reports.",
        "Excluded areas: generated files, dependency caches, and build output.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child reports: required existing completed child audit reports plus final synthesis.",
        "Synthesis: combine existing completed child audit reports into `audit/final-synthesis.md`.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Read the existing completed child audit reports.",
        "- [ ] Produce synthesis report `audit/final-synthesis.md`.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("audit_without_concrete_boundaries");
  });

  it("accepts a decomposed broad audit plan with child reports and synthesis", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Comprehensive repository audit",
        description: "Audit the entire repo for security and reliability.",
        taskIntent: "audit",
      },
      plan: [
        "## Decomposed audit plan",
        "Report artifact: `audit/final-synthesis.md`",
        "Scope: entire repository split by source report.",
        "Scoped evidence targets: `packages/agent/src`, `packages/shared/src`, and `docs/ops`.",
        "Excluded areas: generated files, dependency caches, and build output.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child reports: required source reports plus final synthesis.",
        "Synthesis: combine child report outcomes into `audit/final-synthesis.md`.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Produce child source report `audit/agent-source-audit.md`.",
        "- [ ] Produce child source report `audit/shared-source-audit.md`.",
        "- [ ] Produce synthesis report `audit/final-synthesis.md`.",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    expect(result.categories).toEqual([]);
  });

  it("rejects audit plans with an empty exclusions line", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Audit plan-quality evaluator",
        description:
          "Scope: packages/shared/src/planQuality.ts. Report artifact: audit/plan-quality-audit.md.",
        taskIntent: "audit",
      },
      plan: [
        "## Plan-quality audit",
        "Report artifact: `audit/plan-quality-audit.md`",
        "Scope: `packages/shared/src/planQuality.ts`.",
        "Scoped evidence targets: `packages/shared/src/planQuality.ts`.",
        "Excluded areas:",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this narrow source report.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Inspect the scoped file and update `audit/plan-quality-audit.md`.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("missing_audit_exclusions");
  });

  it("rejects diagnostic plans that use the plan file as the report artifact", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Audit: architecture and ownership boundaries",
        description:
          "Scope: src.\nReport artifact: audit/2026-05-11-audit-architecture-and-ownership-boundaries-audit.md\nConstraint: diagnostic-only.",
        taskIntent: "audit",
        planPath: ".ai-factory/plans/audit-architecture-and-ownership-boundaries-4.md",
      },
      plan: [
        "## Diagnostic-only plan",
        "",
        "Report artifact: `.ai-factory/plans/audit-architecture-and-ownership-boundaries-4.md`",
        "",
        "- [ ] Keep the run diagnostic-only: do not implement fixes.",
        "- [ ] Create or update `.ai-factory/plans/audit-architecture-and-ownership-boundaries-4.md` with findings.",
        "- [ ] Verify every repository path referenced in `.ai-factory/plans/audit-architecture-and-ownership-boundaries-4.md` exists.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toEqual(
      expect.arrayContaining([
        "missing_diagnostic_report_constraints",
        "diagnostic_report_artifact_mismatch",
      ]),
    );
  });

  it.each(["security-review", "code-review", "validation-report", "verification-findings"])(
    "requires diagnostic constraints for hyphenated diagnostic task names: %s",
    (title) => {
      const result = evaluateTaskPlanQuality({
        task: { title },
        plan: "## Plan\n- [ ] Inspect the target behavior\n- [ ] Summarize the outcome",
      });

      expect(result.ok).toBe(false);
      expect(result.categories).toContain("missing_diagnostic_report_constraints");
    },
  );

  it.each(["audit-logging", "security-review", "tests", "coverage", "build", "add-checkout"])(
    "does not apply legacy diagnostic constraints to explicit general task alias %s",
    (roadmapAlias) => {
      const result = evaluateTaskPlanQuality({
        task: {
          title: "Add audit logging",
          description: "Capture security review events and test coverage notes.",
          taskIntent: "general",
          roadmapAlias,
          tags: [`rm:${roadmapAlias}`, "kind:general"],
        },
        plan: "## Plan\n- [ ] Update the targeted implementation path\n- [ ] Run the focused regression tests",
      });

      expect(result.ok).toBe(true);
      expect(result.categories).not.toContain("missing_diagnostic_report_constraints");
    },
  );

  it("detects diagnostic plans that implement fixes in the same run", () => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Audit planner output quality" },
      plan: [
        "## Plan",
        "- [ ] Write findings to docs/reports/planner-audit.md",
        "- [ ] Keep this diagnostic-only",
        "- [ ] Implement fixes for the findings",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("diagnostic_scope_violation");
  });

  it("builds a valid deterministic fallback for diagnostic tasks with report paths", () => {
    const task = {
      title: "Audit",
      description:
        "Diagnostic only. Scope: packages/shared/src/planQuality.ts. Do not implement fixes. Write the report to audit/2026-05-08-initial-audit.md.",
    };
    const plan = buildDeterministicDiagnosticPlan({
      task,
      extraText: ["</think>\n<aif-plan fast @.ai-factory/PLAN.md docs:false tests:false"],
    });

    expect(plan).toContain("Diagnostic-only plan");
    expect(plan).toContain("audit/2026-05-08-initial-audit.md");
    expect(plan).toContain("Scoped evidence targets:");
    expect(plan).toContain("Excluded areas:");
    expect(plan).toContain("Expected report structure:");
    expect(plan).toContain("Child audit reports: not required");
    expect(plan).toContain("- [ ] Keep the run diagnostic-only");
    expect(plan).not.toContain("<aif-plan");
    expect(evaluateTaskPlanQuality({ task, plan }).ok).toBe(true);
  });

  it("builds a valid deterministic direct audit canary plan for a root-level scoped file", () => {
    const task = {
      id: "task-direct-positive-canary",
      title: "Positive trusted direct audit canary",
      taskIntent: "audit" as const,
      plannerMode: "full",
      createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      description: [
        "Scope: README.md",
        "Risk hypotheses: risk-readme README.md onboarding claims may drift from repository evidence.",
        "Report artifact: audit/direct-audit-positive-canary.md",
        "Remote validation target: http://192.168.88.67",
      ].join("\n"),
      auditArtifactRole: "report" as const,
      roadmapBatchId: "direct-audit-batch",
    };
    const plan = buildDeterministicDiagnosticPlan({ task });

    expect(plan).toContain("Expected report artifact: `audit/direct-audit-positive-canary.md`");
    expect(plan).toContain("Declared scope: `README.md`");
    expect(plan).toContain("Allowed write paths:");
    expect(plan).toContain("Trusted artifact required: yes");
    expect(plan).toContain("Ledger evidence required: yes");
    expect(plan).toContain("Committed blob revalidation required: yes");
    expect(plan).toContain("Local AIF service/e2e: forbidden");
    expect(plan).toContain("Remote validation target: http://192.168.88.67");
    const result = evaluateTaskPlanQuality({ task, plan });
    expect(result.ok).toBe(true);
    expect(result.categories).toEqual([]);
  });

  it("rejects direct audit canary plans missing the expected report artifact", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Positive trusted direct audit canary",
        description: "Scope: README.md\nReport artifact: audit/direct-audit-positive-canary.md.",
        taskIntent: "audit",
      },
      plan: [
        "## Direct audit canary",
        "Scope: `README.md`.",
        "Scoped evidence targets: `README.md`.",
        "Excluded areas: source code, config, tests, generated files.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this narrow source report.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Inspect `README.md`.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("missing_diagnostic_report_constraints");
    expect(result.categories).toContain("diagnostic_report_artifact_mismatch");
  });

  it("rejects direct audit canary plans missing concrete scope", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Positive trusted direct audit canary",
        description: "Report artifact: audit/direct-audit-positive-canary.md.",
        taskIntent: "audit",
      },
      plan: [
        "## Direct audit canary",
        "Report artifact: `audit/direct-audit-positive-canary.md`",
        "Scope: audit report.",
        "Scoped evidence targets: audit report.",
        "Excluded areas: source code, config, tests, generated files.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this narrow source report.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("audit_without_concrete_boundaries");
  });

  it("rejects direct audit canary plans that propose source fixes", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Audit config canary",
        description: "Scope: src/config.ts\nReport artifact: audit/config-canary.md.",
        taskIntent: "audit",
      },
      plan: [
        "## Direct audit canary",
        "Report artifact: `audit/config-canary.md`",
        "Scope: `src/config.ts`.",
        "Scoped evidence targets: `src/config.ts`.",
        "Excluded areas: generated files and unrelated modules.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this narrow source report.",
        "- [ ] Patch code in `src/config.ts` if the audit finds a risky default.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("diagnostic_scope_violation");
  });

  it("rejects direct audit canary plans that use local AIF validation", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Audit config canary",
        description: "Scope: src/config.ts\nReport artifact: audit/config-canary.md.",
        taskIntent: "audit",
      },
      plan: [
        "## Direct audit canary",
        "Report artifact: `audit/config-canary.md`",
        "Scope: `src/config.ts`.",
        "Scoped evidence targets: `src/config.ts`.",
        "Excluded areas: generated files and unrelated modules.",
        "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
        "Child audit reports: not required for this narrow source report.",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Run local AIF validation at http://localhost:3000.",
      ].join("\n"),
    });

    expect(result.ok).toBe(false);
    expect(result.categories).toContain("local_aif_validation_forbidden");
  });

  it("does not build deterministic fallback when only the report artifact is available", () => {
    const plan = buildDeterministicDiagnosticPlan({
      task: {
        title: "Audit",
        taskIntent: "audit",
        description:
          "Diagnostic only. Do not implement fixes. Report artifact: audit/2026-05-08-initial-audit.md.",
      },
      extraText: ["</think>\n<aif-plan fast @.ai-factory/PLAN.md docs:false tests:false"],
    });

    expect(plan).toBeNull();
  });

  it("does not build deterministic fallback for broad audit tasks that need decomposition", () => {
    const plan = buildDeterministicDiagnosticPlan({
      task: {
        title: "Audit the entire repository",
        taskIntent: "audit",
        description:
          "Diagnostic only. Comprehensive audit of the whole repo for security and performance. Report artifact: audit/full-repo-audit.md.",
      },
      extraText: ["</think>\n<aif-plan fast @.ai-factory/PLAN.md docs:false tests:false"],
    });

    expect(plan).toBeNull();
  });

  it("builds deterministic diagnostic fallback from the declared report artifact before stale plan text", () => {
    const task = {
      title: "Audit: architecture and ownership boundaries",
      taskIntent: "audit" as const,
      description:
        "Scope: src.\nReport artifact: audit/2026-05-11-audit-architecture-and-ownership-boundaries-audit.md\nConstraint: diagnostic-only.",
      planPath: ".ai-factory/plans/audit-architecture-and-ownership-boundaries-4.md",
    };
    const plan = buildDeterministicDiagnosticPlan({
      task,
      extraText: [
        "Report artifact: `.ai-factory/plans/audit-architecture-and-ownership-boundaries-4.md`",
      ],
    });

    expect(plan).toContain("audit/2026-05-11-audit-architecture-and-ownership-boundaries-audit.md");
    expect(plan).not.toContain(
      ".ai-factory/plans/audit-architecture-and-ownership-boundaries-4.md",
    );
    expect(evaluateTaskPlanQuality({ task, plan }).ok).toBe(true);
  });

  it("formats typed errors with categories", () => {
    const result = evaluateTaskPlanQuality({
      task: { title: "Task" },
      plan: "do it",
    });
    const error = new TaskPlanQualityError(result);

    expect(formatTaskPlanQualityBlockedReason(result)).toContain("Plan quality guard");
    expect(error.message).toContain("generic_plan");
  });
});
