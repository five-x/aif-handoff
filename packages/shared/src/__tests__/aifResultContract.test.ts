import { describe, expect, it } from "vitest";
import {
  formatAifResultContractBlockedReason,
  validateAifResultContract,
} from "../aifResultContract.js";

describe("aifResultContract", () => {
  it("accepts compact completed rework results with verification evidence", () => {
    const result = validateAifResultContract(
      [
        "Done.",
        "```aif-result",
        JSON.stringify({
          status: "completed",
          resolvedBlockers: ["finding-1"],
          unresolvedBlockers: [],
          verificationEvidence: ["npm.cmd test"],
          changedFiles: ["src/index.ts"],
        }),
        "```",
      ].join("\n"),
      { requireCompleted: true, requireVerificationEvidence: true },
    );

    expect(result.ok).toBe(true);
    expect(result.result?.status).toBe("completed");
    expect(result.result?.verificationEvidence).toEqual(["npm.cmd test"]);
  });

  it("rejects rework output without the fenced contract", () => {
    const result = validateAifResultContract("Implementation done.", {
      requireCompleted: true,
      requireVerificationEvidence: true,
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["missing_aif_result_contract"]);
    expect(formatAifResultContractBlockedReason(result)).toContain("missing_aif_result_contract");
  });

  it("rejects completed rework with unresolved blockers", () => {
    const result = validateAifResultContract(
      [
        "```aif-result",
        JSON.stringify({
          status: "completed",
          unresolvedBlockers: ["finding-2"],
          verificationEvidence: ["npm.cmd test"],
        }),
        "```",
      ].join("\n"),
      { requireCompleted: true, requireVerificationEvidence: true },
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("unresolved_aif_result_blockers");
  });

  it("rejects completed rework without verification evidence", () => {
    const result = validateAifResultContract(
      ["```aif-result", JSON.stringify({ status: "completed" }), "```"].join("\n"),
      { requireCompleted: true, requireVerificationEvidence: true },
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "missing_aif_result_verification_evidence",
    );
  });
});
