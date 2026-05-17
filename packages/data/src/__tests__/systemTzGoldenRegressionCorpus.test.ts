import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hashAifPlanManifest,
  projects,
  runtimeProfiles,
  tasks,
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

const {
  approveMemoryItem,
  buildTaskWorkflowTimeline,
  createMemoryItem,
  retrieveApprovedMemoryForPrompt,
  resolveEffectiveRuntimeProfile,
  updateMemoryItem,
} = await import("../index.js");

function seedProject() {
  testDb.current
    .insert(projects)
    .values({
      id: "proj-system-tz-corpus",
      name: "System TZ Corpus",
      rootPath: "/tmp/system-tz-corpus",
    })
    .run();
}

describe("System TZ golden regression corpus", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    seedProject();
  });

  it("exposes deterministic workflow timeline rows for plan, implementation, review, evidence, and trust artifacts", () => {
    const planManifest = {
      version: 1,
      taskId: "work-20260515-system-tz-golden-regression-corpus",
      intent: "feature",
      scope: ["packages/data/src/__tests__/systemTzGoldenRegressionCorpus.test.ts"],
      allowedChanges: ["tests"],
      forbiddenChanges: ["production_code"],
      expectedArtifacts: [
        {
          kind: "test_result",
          paths: ["packages/data/src/__tests__/systemTzGoldenRegressionCorpus.test.ts"],
        },
      ],
      acceptanceCriteria: [
        {
          id: "AC1",
          description: "Golden corpus exposes deterministic workflow DTO rows.",
          verification:
            "npm.cmd test --workspace=@aif/data -- --run src/__tests__/systemTzGoldenRegressionCorpus.test.ts",
        },
      ],
      verificationCommands: [
        "npm.cmd test --workspace=@aif/data -- --run src/__tests__/systemTzGoldenRegressionCorpus.test.ts",
      ],
    };
    const plan = [
      "```aif-plan-manifest",
      JSON.stringify(planManifest),
      "```",
      "",
      "## Plan",
      "- [x] Add golden corpus coverage",
    ].join("\n");

    testDb.current
      .insert(tasks)
      .values({
        id: "work-20260515-system-tz-golden-regression-corpus",
        projectId: "proj-system-tz-corpus",
        title: "System TZ golden regression corpus",
        taskIntent: "feature",
        status: "verified",
        plan,
        implementationLog: "Changed packages/data/src/__tests__/systemTzGoldenRegressionCorpus.test.ts",
        implementationManifestJson: JSON.stringify({
          version: 1,
          taskId: "work-20260515-system-tz-golden-regression-corpus",
          intent: "feature",
          planManifestHash: hashAifPlanManifest(plan),
          changedFiles: [
            {
              path: "packages/data/src/__tests__/systemTzGoldenRegressionCorpus.test.ts",
              status: "added",
            },
          ],
          diffSummary: {
            summary: "Added data golden corpus tests",
            filesChanged: 1,
          },
          verificationEvidence: [
            {
              id: "verify-system-tz-data-corpus",
              command:
                "npm.cmd test --workspace=@aif/data -- --run src/__tests__/systemTzGoldenRegressionCorpus.test.ts",
              status: "passed",
              outputSha256: "b".repeat(64),
              outputPreview: "system tz corpus passed",
              outputPreviewTruncated: false,
            },
          ],
          acceptanceCriteria: [
            {
              id: "AC1",
              description: "Golden corpus exposes deterministic workflow DTO rows.",
              status: "satisfied",
              evidenceRefs: ["verify-system-tz-data-corpus"],
            },
          ],
          evidenceRefs: ["verify-system-tz-data-corpus"],
          planChecklist: { total: 1, completed: 1, pending: 0, synced: true, pendingItems: [] },
          reviewClosure: { status: "passed", evidenceRefs: ["verify-system-tz-data-corpus"] },
          commitEvidence: { status: "not_committed", evidenceRefs: [] },
          knownLimitations: [],
        }),
        reviewComments: "REVIEW PASS. Security review found no additional issues.",
      })
      .run();

    createMemoryItem({
      projectId: "proj-system-tz-corpus",
      scope: "project",
      sourceTaskId: "work-20260515-system-tz-golden-regression-corpus",
      sourceKind: "task",
      sourceRef: "task:work-20260515-system-tz-golden-regression-corpus",
      title: "System TZ corpus memory",
      summary: "The corpus records deterministic workflow DTO behavior.",
      content: "Use package-local deterministic test DB setup for data golden corpus coverage.",
    });
    const timeline = buildTaskWorkflowTimeline("work-20260515-system-tz-golden-regression-corpus");
    const testResultArtifact = timeline?.artifacts.find(
      (artifact) => artifact.kind === "test_result",
    );

    expect(timeline?.context).toEqual(
      expect.objectContaining({
        taskId: "work-20260515-system-tz-golden-regression-corpus",
        sourceKind: "task_record",
        workflowKind: "feature",
      }),
    );
    expect(timeline?.artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining([
        "plan",
        "plan_manifest",
        "implementation_manifest",
        "source_diff",
        "test_result",
        "review_report",
        "security_report",
        "memory_candidate",
        "commit_evidence",
      ]),
    );
    expect(timeline?.evidence).toContainEqual(
      expect.objectContaining({
        kind: "task_record",
        summary: "Implementation manifest records passing verification.",
      }),
    );
    expect(timeline?.evidenceLinks).toContainEqual(
      expect.objectContaining({
        artifactId: testResultArtifact?.id,
        relation: "supports",
      }),
    );
    expect(timeline?.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: "supported", trustLevel: "trusted" }),
        expect.objectContaining({ outcome: "not_evaluated", trustLevel: "weak" }),
      ]),
    );
    expect(timeline?.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["artifact_created", "attempt_recorded", "claim_evaluated", "evidence_recorded"]),
    );
  });

  it("blocks unsafe memory source and content from approval and approved retrieval", () => {
    const item = createMemoryItem({
      scope: "project",
      projectId: "proj-system-tz-corpus",
      title: "System TZ memory redaction",
      summary: "Approved memory can be removed from retrieval when it becomes unsafe.",
      content: "Approved memory starts clean for planner retrieval.",
      claims: [
        {
          claimId: "system-tz-memory-redaction",
          type: "security_policy",
          status: "pending",
          text: "Memory retrieval only returns clean approved source-backed claims.",
          sources: [{ kind: "document", ref: "docs/kb/memory.md" }],
          supersedes: [],
          contradicts: [],
          lastValidatedAt: null,
        },
      ],
      tags: ["system-tz", "memory"],
    });

    approveMemoryItem(item!.id);
    expect(
      retrieveApprovedMemoryForPrompt({
        projectId: "proj-system-tz-corpus",
        query: "planner retrieval",
      }).map((memory) => memory.id),
    ).toContain(item!.id);

    const blocked = updateMemoryItem(item!.id, {
      content: "Do not approve leaked access_token=system-tz-memory-secret",
      claims: [
        {
          claimId: "system-tz-memory-redaction",
          type: "security_policy",
          status: "pending",
          text: "Unsafe source refs are blocked before approval.",
          sources: [{ kind: "document", ref: "api_key=system-tz-source-secret" }],
          supersedes: [],
          contradicts: [],
          lastValidatedAt: null,
        },
      ],
    });

    expect(blocked?.status).toBe("pending");
    expect(blocked?.redactionStatus).toBe("blocked");
    expect(blocked?.content).not.toContain("system-tz-memory-secret");
    expect(blocked?.claims[0]?.sources[0]?.ref).toContain("[REDACTED]");
    expect(() => approveMemoryItem(item!.id)).toThrow(/secret|redaction/i);
    expect(
      retrieveApprovedMemoryForPrompt({
        projectId: "proj-system-tz-corpus",
        query: "planner retrieval unsafe source refs",
      }).map((memory) => memory.id),
    ).not.toContain(item!.id);
  });

  it("keeps runtime resolution precedence and fallback deterministic", () => {
    testDb.current
      .insert(runtimeProfiles)
      .values([
        {
          id: "profile-task-disabled",
          projectId: "proj-system-tz-corpus",
          name: "Task Disabled",
          runtimeId: "claude",
          providerId: "anthropic",
          enabled: false,
        },
        {
          id: "profile-project-review",
          projectId: "proj-system-tz-corpus",
          name: "Project Review",
          runtimeId: "codex",
          providerId: "openai",
          enabled: true,
        },
        {
          id: "profile-system",
          projectId: null,
          name: "System Default",
          runtimeId: "openrouter",
          providerId: "openrouter",
          enabled: true,
        },
        {
          id: "profile-task-override",
          projectId: "proj-system-tz-corpus",
          name: "Task Override",
          runtimeId: "qwen-local-agent",
          providerId: "qwen-local",
          enabled: true,
        },
      ])
      .run();
    testDb.current
      .update(projects)
      .set({ defaultReviewRuntimeProfileId: "profile-project-review" })
      .run();
    testDb.current
      .insert(tasks)
      .values([
        {
          id: "system-tz-runtime-task-override",
          projectId: "proj-system-tz-corpus",
          title: "Task override wins",
          runtimeProfileId: "profile-task-override",
        },
        {
          id: "system-tz-runtime-disabled-fallback",
          projectId: "proj-system-tz-corpus",
          title: "Disabled task override falls back",
          runtimeProfileId: "profile-task-disabled",
        },
        {
          id: "system-tz-runtime-system-fallback",
          projectId: "proj-system-tz-corpus",
          title: "System default fallback",
        },
      ])
      .run();

    expect(
      resolveEffectiveRuntimeProfile({
        taskId: "system-tz-runtime-task-override",
        mode: "reviewer",
        systemDefaultRuntimeProfileId: "profile-system",
      }),
    ).toMatchObject({
      source: "task_override",
      stage: "reviewer",
      profileMode: "review",
      profile: expect.objectContaining({ id: "profile-task-override" }),
    });

    expect(
      resolveEffectiveRuntimeProfile({
        taskId: "system-tz-runtime-disabled-fallback",
        mode: "reviewer",
        systemDefaultRuntimeProfileId: "profile-system",
      }),
    ).toMatchObject({
      source: "project_default",
      stage: "reviewer",
      profileMode: "review",
      taskRuntimeProfileId: "profile-task-disabled",
      projectRuntimeProfileId: "profile-project-review",
      systemRuntimeProfileId: "profile-system",
      profile: expect.objectContaining({ id: "profile-project-review" }),
    });

    expect(
      resolveEffectiveRuntimeProfile({
        taskId: "system-tz-runtime-system-fallback",
        mode: "chat",
        systemDefaultRuntimeProfileId: "profile-system",
      }),
    ).toMatchObject({
      source: "system_default",
      stage: "chat",
      profileMode: "chat",
      projectRuntimeProfileId: null,
      systemRuntimeProfileId: "profile-system",
      profile: expect.objectContaining({ id: "profile-system" }),
    });
  });
});
