import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAutoReviewFindingId } from "../reviewContract.js";

const { executeSubagentQueryMock } = vi.hoisted(() => ({
  executeSubagentQueryMock: vi.fn(),
}));

vi.mock("../subagentQuery.js", () => ({
  executeSubagentQuery: executeSubagentQueryMock,
}));

import { evaluateReviewCommentsForAutoMode } from "../reviewGate.js";

describe("evaluateReviewCommentsForAutoMode", () => {
  const originalAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const baseInput = {
    taskId: "test-task-1",
    projectRoot: "/tmp/test-project",
    strategy: "full_re_review" as const,
    iteration: 1,
    previousFindings: [],
    reviewComments: [
      "## Auto Review Metadata",
      "- Strategy: full_re_review",
      "- Review Iteration: 1",
      "",
      "## Previous Findings",
      "- none",
      "",
      "## Blocking Findings",
      "- none",
      "",
      "## Advisories",
      "- code_review | Looks good",
    ].join("\n"),
  };

  beforeEach(() => {
    executeSubagentQueryMock.mockReset();
    delete process.env.ANTHROPIC_BASE_URL;
  });

  afterAll(() => {
    if (originalAnthropicBaseUrl == null) {
      delete process.env.ANTHROPIC_BASE_URL;
      return;
    }
    process.env.ANTHROPIC_BASE_URL = originalAnthropicBaseUrl;
  });

  function initReportRepo(): string {
    const root = mkdtempSync(join(tmpdir(), "aif-review-gate-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });
    writeFileSync(join(root, "README.md"), "# reviewed\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/audit-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports", "audit.md"),
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: The audit scope depends on that documented root.",
        "Verification: Command `rg reviewed README.md` output matched the inspected line.",
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    return root;
  }

  it("returns success for structured review comments with no blocking findings", async () => {
    const result = await evaluateReviewCommentsForAutoMode(baseInput);

    expect(result).toEqual({
      status: "success",
      metrics: expect.objectContaining({
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      }),
      blockingFindings: [],
      fixesMarkdown: "- none",
      autoReviewState: null,
    });
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it("ignores raw embedded sidecar headings when parsing the canonical summary", async () => {
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | README.md:1 was inspected.",
        "",
        "## Raw Code Review",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- README.md:1 was inspected.",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Raw Security Audit",
        "## Blocking Findings",
        "- none",
      ].join("\n"),
    });

    expect(result.status).toBe("success");
    expect(result.metrics.parserMode).toBe("structured");
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it("returns request_changes with persisted autoReviewState for structured blockers", async () => {
    const blockerId = createAutoReviewFindingId("code_review", "Add null guard before plan sync");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        `- [${blockerId}] code_review | Add null guard before plan sync`,
        "",
        "## Advisories",
        "- none",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }

    expect(result.metrics).toEqual(
      expect.objectContaining({
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 1,
        totalBlockingCount: 1,
        parserMode: "structured",
      }),
    );
    expect(result.autoReviewState.findings).toEqual([
      {
        id: blockerId,
        source: "code_review",
        text: "Add null guard before plan sync",
      },
    ]);
    expect(result.fixesMarkdown).toContain(blockerId);
  });

  it("returns manual_review_required in closure_first when previous blockers are resolved but new blockers appear", async () => {
    const previousId = "prev-1";
    const newId = createAutoReviewFindingId("code_review", "Add manual review badge to done tasks");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      strategy: "closure_first",
      iteration: 2,
      previousFindings: [
        {
          id: previousId,
          source: "code_review",
          text: "Keep rework banner visible until human action",
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: closure_first",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${previousId}] code_review | resolved | Banner is now shown in detail view`,
        "",
        "## Blocking Findings",
        `- [${newId}] code_review | Add manual review badge to done tasks`,
        "",
        "## Advisories",
        "- none",
      ].join("\n"),
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }

    expect(result.handoffReason).toBe("new_blockers_after_rework");
    expect(result.metrics).toEqual(
      expect.objectContaining({
        strategy: "closure_first",
        previousBlockingCount: 1,
        stillBlockingCount: 0,
        newBlockingCount: 1,
        totalBlockingCount: 1,
        parserMode: "structured",
      }),
    );
  });

  it("uses legacy fallback extraction for malformed first-pass review comments", async () => {
    executeSubagentQueryMock.mockResolvedValueOnce({
      resultText: "- Fix missing error handling in api.ts\n- Add input validation",
    });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: "## Code Review\n\nNeed fixes.",
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }

    expect(result.metrics.parserMode).toBe("fallback");
    expect(result.metrics.newBlockingCount).toBe(2);
    expect(result.autoReviewState.findings[0]?.source).toBe("review_gate");
    expect(executeSubagentQueryMock).toHaveBeenCalledTimes(1);
  });

  it("requires manual review when malformed rework output falls back after previous blockers exist", async () => {
    executeSubagentQueryMock.mockResolvedValueOnce({
      resultText: "- New blocker discovered during fallback",
    });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      strategy: "closure_first",
      iteration: 2,
      previousFindings: [
        {
          id: "persisted-1",
          source: "code_review",
          text: "Ensure request_changes clears manual flag",
        },
      ],
      reviewComments: "legacy malformed review text",
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }

    expect(result.handoffReason).toBe("malformed_review_output_fallback");
    expect(result.metrics.parserMode).toBe("fallback");
    expect(result.metrics.previousBlockingCount).toBe(1);
    expect(result.metrics.stillBlockingCount).toBe(1);
    expect(result.autoReviewState.findings).toHaveLength(2);
  });

  it("throws on empty fallback response", async () => {
    executeSubagentQueryMock.mockResolvedValueOnce({ resultText: "   " });

    await expect(
      evaluateReviewCommentsForAutoMode({
        ...baseInput,
        reviewComments: "legacy malformed review text",
      }),
    ).rejects.toThrow("Review auto-check returned empty response");
  });

  it("delegates model resolution to subagentQuery on fallback (no modelOverride)", async () => {
    executeSubagentQueryMock.mockResolvedValueOnce({ resultText: "SUCCESS" });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: "legacy malformed review text",
    });

    expect(result.status).toBe("success");
    const call = executeSubagentQueryMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call.modelOverride).toBeUndefined();
    expect(call.suppressModelFallback).toBeUndefined();
    expect(call.workflowSpec).toEqual(expect.objectContaining({ sessionReusePolicy: "never" }));
  });

  it("requires manual review when fallback SUCCESS tries to accept risky output without evidence", async () => {
    executeSubagentQueryMock.mockResolvedValueOnce({ resultText: "SUCCESS" });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: "Looks good.",
      task: {
        id: "audit-task",
        title: "Full repository audit",
        description: "Review the generated audit report.",
      },
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }
    expect(result.handoffReason).toBe("risky_review_without_substantive_evidence");
    expect(result.metrics.parserMode).toBe("fallback");
    expect(result.blockingFindings[0]?.source).toBe("review_gate");
  });

  it("allows risky structured success when review comments contain substantive evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "aif-review-gate-"));
    writeFileSync(join(root, "README.md"), "# reviewed\n", "utf8");

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Evidence reviewed",
        "",
        "## Evidence",
        "Evidence: `README.md:1` was inspected for the audit report.",
        "Risk: The report scope depends on the repository root documentation.",
        "Verification: Command `rg reviewed README.md` output matched the inspected line.",
      ].join("\n"),
      task: {
        id: "audit-task",
        title: "Full repository audit",
      },
    });

    expect(result.status).toBe("success");
  });

  it("allows risky structured success when the committed report artifact is substantive", async () => {
    const root = initReportRepo();

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | The audit report was committed and reviewed.",
      ].join("\n"),
      task: {
        id: "audit-task",
        title: "Full repository audit",
        description: "Report artifact: reports/audit.md",
      },
    });

    expect(result.status).toBe("success");
  });
});
