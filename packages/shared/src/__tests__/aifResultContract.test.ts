import { describe, expect, it } from "vitest";
import {
  formatAifResultContractBlockedReason,
  validateAifResultContract,
} from "../aifResultContract.js";

function block(overrides: Record<string, unknown> = {}): string {
  return [
    "```aif-result",
    JSON.stringify(
      {
        status: "completed",
        taskId: "task-1",
        changedFiles: ["src/index.ts"],
        verification: [
          {
            command: "npm.cmd test",
            status: "passed",
            evidence: "Focused tests passed.",
          },
        ],
        resolvedBlockers: [{ id: "finding-1", evidence: "Updated src/index.ts." }],
        unresolvedBlockers: [],
        stopReason: "done",
        ...overrides,
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

describe("aifResultContract", () => {
  it("accepts strict completed results with passed verification", () => {
    const result = validateAifResultContract(`Done.\n\n${block()}`, {
      expectedTaskId: "task-1",
      requireCompleted: true,
      requireVerificationEvidence: true,
    });

    expect(result.ok).toBe(true);
    expect(result.result?.status).toBe("completed");
    expect(result.result?.taskId).toBe("task-1");
    expect(result.result?.verification[0]?.status).toBe("passed");
  });

  it("rejects output without the fenced contract", () => {
    const result = validateAifResultContract("Implementation done.", {
      expectedTaskId: "task-1",
      requireCompleted: true,
      requireVerificationEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["missing_aif_result_contract"]);
    expect(formatAifResultContractBlockedReason(result)).toContain("missing_aif_result_contract");
  });

  it("rejects multiple fenced contracts", () => {
    const result = validateAifResultContract(`${block()}\n\n${block()}`, {
      expectedTaskId: "task-1",
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("multiple_aif_result_contracts");
  });

  it("rejects invalid JSON", () => {
    const result = validateAifResultContract('```aif-result\n{"status":\n```');

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("invalid_aif_result_json");
  });

  it("rejects invalid status and stopReason", () => {
    const result = validateAifResultContract(block({ status: "partial", stopReason: "stopped" }), {
      expectedTaskId: "task-1",
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["invalid_aif_result_status", "invalid_aif_result_stop_reason"]),
    );
  });

  it.each([
    ["completed", "needs_human_input"],
    ["blocked", "done"],
    ["needs_input", "done"],
  ])("rejects inconsistent status/stopReason pairs: %s + %s", (status, stopReason) => {
    const result = validateAifResultContract(block({ status, stopReason }), {
      expectedTaskId: "task-1",
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("invalid_aif_result_stop_reason");
  });

  it("accepts valid blocked and needs_input stop reasons as structured non-success", () => {
    const blocked = validateAifResultContract(
      block({
        status: "blocked",
        verification: [
          { command: "npm.cmd test", status: "failed", evidence: "Validation failed." },
        ],
        resolvedBlockers: [],
        unresolvedBlockers: [{ id: "validation", reason: "Tests still fail." }],
        stopReason: "blocked_by_scope",
      }),
      { expectedTaskId: "task-1" },
    );
    const needsInput = validateAifResultContract(
      block({
        status: "needs_input",
        verification: [
          { command: "npm.cmd test", status: "not_run", evidence: "Needs operator input." },
        ],
        resolvedBlockers: [],
        unresolvedBlockers: [{ id: "operator", reason: "Need credentials." }],
        stopReason: "needs_human_input",
      }),
      { expectedTaskId: "task-1" },
    );

    expect(blocked.ok).toBe(true);
    expect(blocked.result?.stopReason).toBe("blocked_by_scope");
    expect(needsInput.ok).toBe(true);
    expect(needsInput.result?.stopReason).toBe("needs_human_input");
  });

  it("rejects missing or wrong task ids", () => {
    const missing = validateAifResultContract(block({ taskId: "" }), {
      expectedTaskId: "task-1",
    });
    const wrong = validateAifResultContract(block({ taskId: "other-task" }), {
      expectedTaskId: "task-1",
    });

    expect(missing.issues.map((issue) => issue.code)).toContain("invalid_aif_result_schema");
    expect(wrong.issues.map((issue) => issue.code)).toContain("aif_result_task_id_mismatch");
  });

  it("rejects unsupported top-level fields", () => {
    const result = validateAifResultContract(
      block({
        reasoning: "The model should not put reasoning inside the machine contract.",
        rawProviderDiagnostics: "provider trace",
      }),
      { expectedTaskId: "task-1" },
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("unexpected_aif_result_field");
  });

  it.each([
    [
      "verification",
      {
        verification: [
          {
            command: "npm.cmd test",
            status: "passed",
            evidence: "Focused tests passed.",
            rawProviderDiagnostics: "provider trace",
          },
        ],
      },
    ],
    [
      "resolvedBlockers",
      {
        resolvedBlockers: [
          { id: "finding-1", evidence: "Updated src/index.ts.", reasoning: "hidden" },
        ],
      },
    ],
    [
      "unresolvedBlockers",
      {
        unresolvedBlockers: [
          { id: "finding-2", reason: "Still failing.", repeatedReviewComment: "old comment" },
        ],
        stopReason: "blocked_by_validation",
        status: "blocked",
      },
    ],
  ])("rejects unsupported nested fields in %s entries", (_field, overrides) => {
    const result = validateAifResultContract(block(overrides), {
      expectedTaskId: "task-1",
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("invalid_aif_result_schema");
  });

  it("rejects completed results with unresolved blockers", () => {
    const result = validateAifResultContract(
      block({ unresolvedBlockers: [{ id: "finding-2", reason: "Still failing." }] }),
      { expectedTaskId: "task-1", requireCompleted: true, requireVerificationEvidence: true },
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("unresolved_aif_result_blockers");
  });

  it("rejects completed results without passed verification", () => {
    const result = validateAifResultContract(
      block({
        verification: [
          { command: "npm.cmd test", status: "not_run", evidence: "Skipped by operator." },
        ],
      }),
      { expectedTaskId: "task-1", requireCompleted: true, requireVerificationEvidence: true },
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "missing_aif_result_verification_evidence",
    );
  });

  it("accepts blocked results as structured non-success contracts", () => {
    const result = validateAifResultContract(
      block({
        status: "blocked",
        verification: [
          { command: "npm.cmd test", status: "failed", evidence: "Type error remains." },
        ],
        resolvedBlockers: [],
        unresolvedBlockers: [{ id: "typecheck", reason: "Existing type error blocks handoff." }],
        stopReason: "blocked_by_validation",
      }),
      { expectedTaskId: "task-1" },
    );

    expect(result.ok).toBe(true);
    expect(result.result?.status).toBe("blocked");
    expect(result.result?.unresolvedBlockers[0]?.reason).toContain("type error");
  });
});
