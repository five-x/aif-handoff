import { describe, expect, it } from "vitest";
import { buildRetryContextForRuntimePrompt, getRetryContextThresholds } from "../retryContext.js";
import type { ImplementationManifest } from "../implementationManifest.js";

function manifest(): ImplementationManifest {
  return {
    version: 1,
    taskId: "task-1",
    intent: "feature",
    planManifestHash: null,
    changedFiles: [{ path: "packages/shared/src/retryContext.ts", status: "added" }],
    diffSummary: { summary: "Added retry context compaction.", filesChanged: 1 },
    verificationEvidence: [
      {
        id: "test",
        command: "npm test -- retryContext.test.ts",
        status: "passed",
        outputSha256: "a".repeat(64),
        outputPreview: "passed",
        outputPreviewTruncated: false,
      },
    ],
    acceptanceCriteria: [
      { id: "AC1", status: "satisfied", evidenceRefs: ["retryContext.test.ts"] },
    ],
    evidenceRefs: ["packages/shared/src/__tests__/retryContext.test.ts"],
    planChecklist: { total: 2, completed: 1, pending: 1, synced: true },
    reviewClosure: { status: "skipped", evidenceRefs: [], notes: null },
    commitEvidence: { status: "not_required", commitSha: null, evidenceRefs: [], notes: null },
    regressionExplanation: null,
    knownLimitations: ["manual follow-up remains"],
  };
}

describe("retry context compaction", () => {
  it("reads threshold overrides with defaults for invalid values", () => {
    expect(
      getRetryContextThresholds({
        AIF_RETRY_CONTEXT_ACTIVITY_MAX_CHARS: "10",
        AIF_RETRY_CONTEXT_ACTIVITY_MAX_LINES: "20",
        AIF_RETRY_CONTEXT_ACTIVITY_MAX_ESTIMATED_TOKENS: "30",
        AIF_RETRY_CONTEXT_RUNTIME_USAGE_MAX_TOKENS: "40",
      }),
    ).toEqual({
      activityMaxChars: 10,
      activityMaxLines: 20,
      activityMaxEstimatedTokens: 30,
      runtimeUsageMaxTokens: 40,
    });
  });

  it("preserves below-threshold behavior", () => {
    const result = buildRetryContextForRuntimePrompt(
      { id: "task-1", agentActivityLog: "short log" },
      {
        activityMaxChars: 100,
        activityMaxLines: 10,
        activityMaxEstimatedTokens: 100,
        runtimeUsageMaxTokens: 100,
      },
    );

    expect(result.compacted).toBe(false);
    expect(result.prompt).toBe("");
  });

  it("renders bounded sanitized summary when activity is oversized", () => {
    const rawActivityLog = `line\n${"oversized command output ".repeat(50)} sk-SECRET`;
    const task = {
      id: "task-1",
      title: "Compact retry",
      status: "implementing",
      blockedReason: "provider raw diagnostics authorization: Bearer SECRET",
      retryCount: 2,
      plan: "Accepted plan: add utility and tests.",
      reviewComments: "client_secret=secret-value",
      implementationManifest: manifest(),
      agentActivityLog: rawActivityLog,
    };
    const result = buildRetryContextForRuntimePrompt(task, {
      activityMaxChars: 10,
      activityMaxLines: 100,
      activityMaxEstimatedTokens: 100,
      runtimeUsageMaxTokens: 100,
    });

    expect(result.compacted).toBe(true);
    expect(result.prompt).toContain("Compact retry context:");
    expect(result.prompt).toContain("packages/shared/src/retryContext.ts");
    expect(result.prompt).toContain("npm test -- retryContext.test.ts");
    expect(result.prompt).toContain("AC1=satisfied");
    expect(result.prompt).toContain("pending checklist items: 1");
    expect(result.prompt).not.toContain("sk-SECRET");
    expect(result.prompt).not.toContain("Bearer SECRET");
    expect(result.prompt).not.toContain("secret-value");
    expect(result.prompt).not.toContain("oversized command output");
    expect(task.agentActivityLog).toBe(rawActivityLog);
  });

  it("reads persisted implementationManifestJson for compact summaries", () => {
    const result = buildRetryContextForRuntimePrompt(
      {
        id: "task-json-manifest",
        agentActivityLog: "activity ".repeat(20),
        implementationManifestJson: JSON.stringify(manifest()),
      },
      {
        activityMaxChars: 10,
        activityMaxLines: 100,
        activityMaxEstimatedTokens: 100,
        runtimeUsageMaxTokens: 100,
      },
    );

    expect(result.compacted).toBe(true);
    expect(result.prompt).toContain("packages/shared/src/retryContext.ts");
    expect(result.prompt).toContain("npm test -- retryContext.test.ts");
    expect(result.prompt).toContain("AC1=satisfied");
  });

  it("compacts on runtime usage threshold even when activity log is small", () => {
    const result = buildRetryContextForRuntimePrompt(
      { id: "task-runtime", status: "review", tokenTotal: 1000, agentActivityLog: "" },
      {
        activityMaxChars: 100,
        activityMaxLines: 100,
        activityMaxEstimatedTokens: 100,
        runtimeUsageMaxTokens: 10,
      },
    );

    expect(result.compacted).toBe(true);
    expect(result.reasons).toEqual(["runtime_tokens"]);
    expect(result.prompt).toContain("Continue review from compact task state.");
  });
});
