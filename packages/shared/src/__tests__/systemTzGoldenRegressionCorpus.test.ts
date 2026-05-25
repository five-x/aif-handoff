import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyAuditSynthesisSourceReports } from "../auditSynthesisClassifier.js";
import {
  computeAuditReportContentSha256,
  validateAuditReportArtifact,
} from "../auditReportValidator.js";
import { selectAuditArtifactFailureFamily } from "../auditRoadmapContract.js";
import { hashAifPlanManifest } from "../implementationManifest.js";
import { decideShellPermission } from "../permissionPolicy.js";
import { evaluateTaskPlanQuality, PLAN_MANIFEST_REQUIRED_CREATED_AT } from "../planQuality.js";
import { applyHumanTaskEvent } from "../stateMachine.js";
import { evaluateTaskCompletionEvidence } from "../taskCompletionEvidence.js";
import { validateTaskIntentChangedFiles } from "../taskIntent.js";
import type { Task } from "../types.js";
import {
  auditSnapshot,
  buildManifestBackedReport,
  initAuditContractRepo,
  invalidAuditReportCases,
  validNoFindingsAuditReportCases,
} from "./fixtures/auditContractCorpus.js";

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "aif-system-tz-corpus-"));
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "README.md"), "# System TZ Corpus\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init system tz corpus", "--no-verify"], {
    cwd: root,
    stdio: "ignore",
  });
  return root;
}

function completionCodes(result: ReturnType<typeof evaluateTaskCompletionEvidence>): string[] {
  return result.issues.map((issue) => issue.code);
}

function auditIssueCodes(result: ReturnType<typeof validateAuditReportArtifact>): string[] {
  return result.issues.map((issue) => issue.code);
}

function auditFailureFamily(result: ReturnType<typeof validateAuditReportArtifact>): string | null {
  return selectAuditArtifactFailureFamily({
    validationDetails: {
      auditReportValidation: {
        sourceClassification: result.sourceClassification,
        issues: result.issues,
      },
      issues: result.issues,
    },
  });
}

function implementationManifest(input: {
  taskId: string;
  intent: "feature" | "fix" | "docs" | "tests";
  changedFiles: string[];
  planManifestHash?: string | null;
  acceptanceCriteria?: Array<{
    id: string;
    status?: "satisfied" | "unsatisfied" | "waived";
    evidenceRefs?: string[];
  }>;
  includeVerificationOutput?: boolean;
  reviewClosure?: { status: "pending" | "passed" | "skipped" | "blocked"; evidenceRefs: string[] };
  regressionExplanation?: string | null;
}): string {
  const includeVerificationOutput = input.includeVerificationOutput ?? true;
  return JSON.stringify({
    version: 1,
    taskId: input.taskId,
    intent: input.intent,
    planManifestHash: input.planManifestHash ?? null,
    changedFiles: input.changedFiles.map((path) => ({ path, status: "modified" })),
    diffSummary: {
      summary: `Changed ${input.changedFiles.join(", ")}`,
      filesChanged: input.changedFiles.length,
    },
    verificationEvidence: [
      {
        id: "verify-1",
        command:
          "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/systemTzGoldenRegressionCorpus.test.ts",
        status: "passed",
        ...(includeVerificationOutput
          ? {
              outputSha256: "a".repeat(64),
              outputPreview: "tests passed",
              outputPreviewTruncated: false,
            }
          : {}),
      },
    ],
    acceptanceCriteria: input.acceptanceCriteria ?? [
      { id: "AC1", status: "satisfied", evidenceRefs: ["verify-1"] },
    ],
    evidenceRefs: ["verify-1"],
    planChecklist: { total: 1, completed: 1, pending: 0, synced: true, pendingItems: [] },
    reviewClosure: input.reviewClosure ?? { status: "passed", evidenceRefs: ["verify-1"] },
    commitEvidence: { status: "not_required", evidenceRefs: [] },
    regressionExplanation: input.regressionExplanation ?? null,
    knownLimitations: [],
  });
}

function planWithManifest(input: {
  taskId: string;
  intent: "feature" | "fix" | "docs" | "tests";
  scope?: string[];
  acceptanceCriteria?: Array<{ id: string; description: string; verification: string }>;
}): string {
  return [
    "```aif-plan-manifest",
    JSON.stringify({
      version: 1,
      taskId: input.taskId,
      intent: input.intent,
      scope: input.scope ?? ["src/feature.ts"],
      allowedChanges: ["source", "tests"],
      forbiddenChanges: ["report", "docs", "secrets"],
      expectedArtifacts: [{ kind: "source_diff", paths: input.scope ?? ["src/feature.ts"] }],
      acceptanceCriteria: input.acceptanceCriteria ?? [
        {
          id: "AC1",
          description: "Corpus fixture is covered by deterministic verification.",
          verification:
            "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/systemTzGoldenRegressionCorpus.test.ts",
        },
      ],
      verificationCommands: [
        "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/systemTzGoldenRegressionCorpus.test.ts",
      ],
    }),
    "```",
    "",
    "## Plan",
    "- [x] Implement the scoped change",
    "- [x] Run deterministic verification",
  ].join("\n");
}

function makeTask(status: Task["status"]): Task {
  return {
    id: "system-tz-state-machine",
    projectId: "project-1",
    title: "State machine corpus",
    description: "",
    autoMode: true,
    isFix: false,
    plannerMode: "full",
    planPath: ".ai-factory/PLAN.md",
    planDocs: false,
    planTests: false,
    skipReview: false,
    useSubagents: true,
    status,
    priority: 0,
    position: 1000,
    plan: null,
    implementationLog: null,
    reviewComments: null,
    agentActivityLog: null,
    blockedReason: null,
    blockedFromStatus: null,
    retryAfter: null,
    retryCount: 0,
    roadmapAlias: null,
    tags: [],
    reworkRequested: false,
    reviewIterationCount: 0,
    maxReviewIterations: 3,
    manualReviewRequired: false,
    autoReviewState: null,
    paused: false,
    lastHeartbeatAt: null,
    lockStage: null,
    coordinatorId: null,
    lastSyncedAt: null,
    runtimeProfileId: null,
    modelOverride: null,
    runtimeOptions: null,
    sessionId: null,
    scheduledAt: null,
    branchName: null,
    worktreePath: null,
    createdAt: "2026-05-17T00:00:00.000Z",
    updatedAt: "2026-05-17T00:00:00.000Z",
  };
}

describe("System TZ golden regression corpus", () => {
  it.each([
    {
      id: "inventory_only_no_findings",
      fixtureId: "inventory-only-command",
      expectedIssues: ["missing_substantive_evidence"],
      expectedFamily: "invalid_inventory_only",
    },
    {
      id: "mass_line_one_citations",
      fixtureId: "mass-line-one-citations",
      expectedIssues: ["missing_substantive_evidence"],
      expectedFamily: "invalid_inventory_only",
    },
    {
      id: "fake_command_output",
      fixtureId: "fake-command-output",
      expectedIssues: ["fake_or_placeholder_command_output"],
      expectedFamily: "insufficient_substantive_evidence",
    },
  ])("rejects audit invalid corpus case $id", (corpusCase) => {
    const root = initAuditContractRepo();
    const fixture = invalidAuditReportCases.find((entry) => entry.id === corpusCase.fixtureId);
    if (!fixture) throw new Error(`Missing fixture ${corpusCase.fixtureId}`);

    const result = validateAuditReportArtifact({
      text: fixture.body,
      projectRoot: root,
      scopeRoots: fixture.scopeRoots,
      reportArtifactPaths: [fixture.artifactPath],
      expectedReportArtifactPath: fixture.artifactPath,
      requireProposedFix: true,
    });

    expect(result.ok, corpusCase.id).toBe(false);
    expect(auditIssueCodes(result), corpusCase.id).toEqual(
      expect.arrayContaining(corpusCase.expectedIssues),
    );
    expect(auditFailureFamily(result), corpusCase.id).toBe(corpusCase.expectedFamily);
  });

  it.each([
    {
      id: "missing_evidence_ref",
      mutate: (root: string) => {
        const report = buildManifestBackedReport({
          report: validNoFindingsAuditReportCases[0],
          snapshot: auditSnapshot(root),
        });
        return { ...report, evidenceUnits: [] };
      },
      expectedIssues: ["missing_audit_evidence_ref"],
      expectedFamily: "invalid_artifact_integrity",
    },
    {
      id: "manifest_snapshot_mismatch",
      mutate: (root: string) => {
        const snapshot = auditSnapshot(root);
        return buildManifestBackedReport({
          report: validNoFindingsAuditReportCases[0],
          snapshot,
          manifestSourceSnapshot: {
            id: `git:${snapshot.commit}:${"3".repeat(40)}`,
            tree: "3".repeat(40),
          },
        });
      },
      expectedIssues: ["manifest_source_snapshot_mismatch"],
      expectedFamily: "invalid_artifact_contract",
    },
    {
      id: "scope_mismatch",
      mutate: (root: string) =>
        buildManifestBackedReport({
          report: validNoFindingsAuditReportCases[0],
          snapshot: auditSnapshot(root),
          evidenceScopeIds: ["src/runtime.ts"],
        }),
      expectedIssues: ["audit_evidence_scope_mismatch"],
      expectedFamily: "invalid_artifact_integrity",
    },
    {
      id: "risk_mismatch",
      mutate: (root: string) =>
        buildManifestBackedReport({
          report: validNoFindingsAuditReportCases[0],
          snapshot: auditSnapshot(root),
          evidenceRiskHypothesisIds: ["risk-other"],
        }),
      expectedIssues: ["audit_evidence_risk_mismatch"],
      expectedFamily: "invalid_artifact_integrity",
    },
    {
      id: "substantive_command_output_removed",
      mutate: (root: string) => {
        const snapshot = auditSnapshot(root);
        const fixture = validNoFindingsAuditReportCases[0];
        const body = fixture.body.replace(/\nChecked commands:\n[\s\S]*$/m, "\n");
        return buildManifestBackedReport({
          report: fixture,
          snapshot,
          body,
          contentSha256: computeAuditReportContentSha256(body),
        });
      },
      expectedIssues: ["manifest_outcome_mismatch", "missing_substantive_evidence"],
      expectedFamily: "invalid_artifact_contract",
    },
  ])("rejects audit mutation corpus case $id", (corpusCase) => {
    const root = initAuditContractRepo();
    const report = corpusCase.mutate(root);
    const result = validateAuditReportArtifact({
      text: report.text,
      projectRoot: root,
      taskId: report.taskId,
      scopeRoots: validNoFindingsAuditReportCases[0].scopeRoots,
      reportArtifactPaths: [report.artifactPath],
      expectedReportArtifactPath: report.artifactPath,
      auditEvidenceUnits: report.evidenceUnits,
      requireLedgerEvidence: true,
      requireProposedFix: true,
    });

    expect(result.ok, corpusCase.id).toBe(false);
    expect(auditIssueCodes(result), corpusCase.id).toEqual(
      expect.arrayContaining(corpusCase.expectedIssues),
    );
    expect(auditFailureFamily(result), corpusCase.id).toBe(corpusCase.expectedFamily);
  });

  it("keeps source_inconclusive outside trusted audit synthesis", () => {
    const root = initAuditContractRepo();
    const outcome = classifyAuditSynthesisSourceReports({
      projectRoot: root,
      blockingSourceArtifacts: [
        {
          artifactPath: "audit/source-inconclusive.md",
          taskId: "source-inconclusive",
          required: true,
          state: "source_inconclusive",
          sourceClassification: "source_inconclusive",
          reasonCodes: ["source_inconclusive"],
        },
      ],
    });

    expect(outcome.kind).toBe("source_inconclusive");
    expect(outcome.validatedFindingCount).toBe(0);
    expect(outcome.substantiveNoFindingsReportCount).toBe(0);
  });

  it.each([
    {
      id: "feature_out_of_scope_diff",
      run: () => {
        const root = initRepo();
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "src", "feature.ts"), "export const feature = true;\n", "utf8");
        writeFileSync(join(root, "src", "outside.ts"), "export const outside = true;\n", "utf8");
        const plan = planWithManifest({
          taskId: "feature-out-of-scope-diff",
          intent: "feature",
          scope: ["src/feature.ts"],
        });
        return completionCodes(
          evaluateTaskCompletionEvidence({
            projectRoot: root,
            phase: "review_handoff",
            task: {
              id: "feature-out-of-scope-diff",
              title: "Add feature",
              taskIntent: "feature",
              plan,
              implementationManifestJson: implementationManifest({
                taskId: "feature-out-of-scope-diff",
                intent: "feature",
                changedFiles: ["src/feature.ts", "src/outside.ts"],
                planManifestHash: hashAifPlanManifest(plan),
              }),
            },
          }),
        );
      },
      expectedCodes: ["implementation_scope_mismatch"],
    },
    {
      id: "fix_without_regression",
      run: () => {
        const root = initRepo();
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "src", "bug.ts"), "export const fixed = true;\n", "utf8");
        return completionCodes(
          evaluateTaskCompletionEvidence({
            projectRoot: root,
            task: {
              id: "fix-without-regression",
              title: "Fix broken bug flag",
              taskIntent: "fix",
              implementationManifestJson: implementationManifest({
                taskId: "fix-without-regression",
                intent: "fix",
                changedFiles: ["src/bug.ts"],
              }),
              skipReview: true,
            },
          }),
        );
      },
      expectedCodes: ["missing_fix_regression_explanation"],
    },
    {
      id: "docs_source_change",
      run: () => {
        const root = initRepo();
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "src", "api.ts"), "export const api = true;\n", "utf8");
        return completionCodes(
          evaluateTaskCompletionEvidence({
            projectRoot: root,
            task: {
              id: "docs-source-change",
              title: "Update API docs",
              taskIntent: "docs",
              plan: "## Plan\n- [ ] Update docs/api.md\n- [ ] Run docs validation",
            },
          }),
        );
      },
      expectedCodes: ["intent_changed_files_contradiction"],
    },
    {
      id: "tests_no_run_output",
      run: () => {
        const root = initRepo();
        mkdirSync(join(root, "src", "__tests__"), { recursive: true });
        writeFileSync(
          join(root, "src", "__tests__", "feature.test.ts"),
          "it('works', () => {});\n",
          "utf8",
        );
        return completionCodes(
          evaluateTaskCompletionEvidence({
            projectRoot: root,
            phase: "review_handoff",
            task: {
              id: "tests-no-run-output",
              title: "Add feature coverage",
              taskIntent: "tests",
              implementationManifestJson: implementationManifest({
                taskId: "tests-no-run-output",
                intent: "tests",
                changedFiles: ["src/__tests__/feature.test.ts"],
                includeVerificationOutput: false,
              }),
            },
          }),
        );
      },
      expectedCodes: ["missing_verification_evidence"],
    },
    {
      id: "review_unclosed_blocker",
      run: () => {
        const root = initRepo();
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "src", "feature.ts"), "export const feature = true;\n", "utf8");
        return completionCodes(
          evaluateTaskCompletionEvidence({
            projectRoot: root,
            phase: "completion",
            task: {
              id: "review-unclosed-blocker",
              title: "Add feature",
              taskIntent: "feature",
              implementationManifestJson: implementationManifest({
                taskId: "review-unclosed-blocker",
                intent: "feature",
                changedFiles: ["src/feature.ts"],
                reviewClosure: { status: "passed", evidenceRefs: ["missing-review-proof"] },
              }),
            },
          }),
        );
      },
      expectedCodes: ["missing_review_closure_evidence"],
    },
    {
      id: "inferred_feature_missing_manifest",
      run: () => {
        const root = initRepo();
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "src", "feature.ts"), "export const feature = true;\n", "utf8");
        return completionCodes(
          evaluateTaskCompletionEvidence({
            projectRoot: root,
            phase: "review_handoff",
            task: {
              id: "inferred-feature-missing-manifest",
              title: "Add feature",
            },
          }),
        );
      },
      expectedCodes: ["missing_implementation_manifest"],
    },
    {
      id: "waiver_known_limitations_only",
      run: () => {
        const root = initRepo();
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "src", "feature.ts"), "export const feature = true;\n", "utf8");
        const manifest = JSON.parse(
          implementationManifest({
            taskId: "waiver-known-limitations-only",
            intent: "feature",
            changedFiles: ["src/feature.ts"],
            acceptanceCriteria: [{ id: "AC1", status: "waived", evidenceRefs: [] }],
          }),
        ) as { knownLimitations: string[] };
        manifest.knownLimitations = ["Production verification was unavailable."];
        return completionCodes(
          evaluateTaskCompletionEvidence({
            projectRoot: root,
            phase: "review_handoff",
            task: {
              id: "waiver-known-limitations-only",
              title: "Add feature",
              taskIntent: "feature",
              implementationManifestJson: JSON.stringify(manifest),
            },
          }),
        );
      },
      expectedCodes: ["missing_acceptance_evidence"],
    },
    {
      id: "rework_without_delta",
      run: () =>
        completionCodes(
          evaluateTaskCompletionEvidence({
            projectRoot: initRepo(),
            task: {
              id: "rework-without-delta",
              title: "Review prior blocker closure",
              description: "Security review rework must include a concrete delta.",
              taskIntent: "audit",
              expectedReportArtifactPath: "audit/rework.md",
            },
          }),
        ),
      expectedCodes: ["zero_delta"],
    },
  ])("rejects development invalid corpus case $id", (corpusCase) => {
    expect(corpusCase.run(), corpusCase.id).toEqual(
      expect.arrayContaining(corpusCase.expectedCodes),
    );
  });

  it("rejects unsafe_shell_command without a human approval bridge", () => {
    const decision = decideShellPermission({
      intent: "fix",
      command: "Remove-Item -Recurse -Force .\\dist",
      humanApprovalBridgeAvailable: false,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.outcome).toBe("deny");
    expect(decision.classification.categories).toContain("destructive_filesystem");
  });

  it("keeps plan manifest acceptance and task intent policies fail-closed", () => {
    const plan = planWithManifest({
      taskId: "plan-manifest-corpus",
      intent: "feature",
      acceptanceCriteria: [
        { id: "AC1", description: "Feature code changed.", verification: "npm.cmd test" },
        { id: "AC2", description: "Verification evidence exists.", verification: "npm.cmd test" },
      ],
    });
    const missingAcceptance = JSON.parse(
      implementationManifest({
        taskId: "plan-manifest-corpus",
        intent: "feature",
        changedFiles: ["src/feature.ts"],
        planManifestHash: hashAifPlanManifest(plan),
        acceptanceCriteria: [{ id: "AC1", status: "satisfied", evidenceRefs: ["verify-1"] }],
      }),
    );
    const root = initRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "feature.ts"), "export const feature = true;\n", "utf8");

    const completion = evaluateTaskCompletionEvidence({
      projectRoot: root,
      phase: "review_handoff",
      task: {
        id: "plan-manifest-corpus",
        title: "Add feature",
        taskIntent: "feature",
        plan,
        implementationManifestJson: JSON.stringify(missingAcceptance),
      },
    });
    expect(completionCodes(completion)).toContain("missing_acceptance_evidence");

    const outputlessRefManifest = JSON.parse(
      implementationManifest({
        taskId: "plan-manifest-corpus",
        intent: "feature",
        changedFiles: ["src/feature.ts"],
        planManifestHash: hashAifPlanManifest(plan),
        acceptanceCriteria: [
          { id: "AC1", status: "satisfied", evidenceRefs: ["verify-outputless"] },
        ],
      }),
    ) as {
      verificationEvidence: Array<Record<string, unknown>>;
      acceptanceCriteria: Array<{ evidenceRefs: string[] }>;
    };
    outputlessRefManifest.verificationEvidence.push({
      id: "verify-outputless",
      command:
        "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/systemTzGoldenRegressionCorpus.test.ts",
      status: "passed",
    });
    const outputlessCompletion = evaluateTaskCompletionEvidence({
      projectRoot: root,
      phase: "review_handoff",
      task: {
        id: "plan-manifest-corpus",
        title: "Add feature",
        taskIntent: "feature",
        plan,
        implementationManifestJson: JSON.stringify(outputlessRefManifest),
      },
    });
    expect(completionCodes(outputlessCompletion)).toEqual(
      expect.arrayContaining(["missing_verification_evidence", "missing_acceptance_evidence"]),
    );

    const missingTruncationFlagManifest = JSON.parse(
      implementationManifest({
        taskId: "plan-manifest-corpus",
        intent: "feature",
        changedFiles: ["src/feature.ts"],
        planManifestHash: hashAifPlanManifest(plan),
      }),
    ) as {
      verificationEvidence: Array<Record<string, unknown>>;
    };
    delete missingTruncationFlagManifest.verificationEvidence[0]?.outputPreviewTruncated;
    const missingTruncationFlagCompletion = evaluateTaskCompletionEvidence({
      projectRoot: root,
      phase: "review_handoff",
      task: {
        id: "plan-manifest-corpus",
        title: "Add feature",
        taskIntent: "feature",
        plan,
        implementationManifestJson: JSON.stringify(missingTruncationFlagManifest),
      },
    });
    expect(completionCodes(missingTruncationFlagCompletion)).toEqual(
      expect.arrayContaining(["missing_verification_evidence", "missing_acceptance_evidence"]),
    );

    const planQuality = evaluateTaskPlanQuality({
      task: {
        id: "docs-source-artifact-plan",
        title: "Update API docs",
        description: "Scope: docs/api.md and packages/shared/src/planQuality.ts for source facts.",
        taskIntent: "docs",
        plannerMode: "full",
        createdAt: PLAN_MANIFEST_REQUIRED_CREATED_AT,
      },
      plan: planWithManifest({
        taskId: "docs-source-artifact-plan",
        intent: "docs",
        scope: ["docs/api.md", "packages/shared/src/planQuality.ts"],
      }),
    });
    expect(planQuality.ok).toBe(false);
    expect(planQuality.categories).toContain("plan_manifest_expected_artifact_violation");

    const intent = validateTaskIntentChangedFiles({
      task: { taskIntent: "docs", title: "Update docs" },
      changedFiles: ["packages/api/src/index.ts"],
    });
    expect(intent.ok).toBe(false);
    expect(intent.issues[0]?.code).toBe("intent_changed_files_contradiction");
  });

  it("keeps state-machine rework and retry transitions explicit", () => {
    const done = makeTask("done");
    const rework = applyHumanTaskEvent(done, "request_changes");
    expect(rework.ok).toBe(true);
    if (rework.ok) {
      expect(rework.patch.status).toBe("implementing");
      expect(rework.patch.reworkRequested).toBe(true);
    }

    const blocked = {
      ...makeTask("blocked_external"),
      blockedFromStatus: "implementing" as const,
      reworkRequested: true,
    };
    const retry = applyHumanTaskEvent(blocked, "retry_from_blocked");
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.patch.status).toBe("implementing");
      expect(retry.patch.reworkRequested).toBe(true);
    }
  });
});
