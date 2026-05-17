import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyAuditDecompositionRequest } from "../auditRoadmapContract.js";
import {
  classifyAuditSynthesisOutput,
  formatAuditSynthesisOutcomeForArtifact,
} from "../auditSynthesisClassifier.js";
import { evaluateTaskPlanQuality } from "../planQuality.js";

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "aif-plan-b-shared-"));
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: root, stdio: "ignore" });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "config.ts"), "export const timeoutMs = 1000;\n", "utf8");
  execFileSync("git", ["add", "src/config.ts"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
    cwd: root,
    stdio: "ignore",
  });
  return root;
}

describe("Plan B shared regression contract", () => {
  it("classifies broad audit requests as decomposed and narrow scoped audits as single reports", () => {
    expect(
      classifyAuditDecompositionRequest(
        "Run an owner-grade audit of the entire repository for security, reliability, performance, and correctness.",
      ),
    ).toMatchObject({
      mode: "decomposed_report_batch",
      requiresDecomposition: true,
      reasonCodes: expect.arrayContaining(["broad_repository_scope", "multi_domain_audit_scope"]),
    });

    expect(
      classifyAuditDecompositionRequest({
        title: "Audit: config defaults",
        description: [
          "Scope: packages/shared/src/config.ts",
          "Audit mandate: inspect configuration defaults.",
          "Risk hypotheses: risk-config packages/shared/src/config.ts may contain unsafe defaults.",
          "Report artifact: audit/config-defaults-audit.md",
        ].join("\n"),
      }),
    ).toEqual({
      mode: "single_report",
      requiresDecomposition: false,
      reasonCodes: ["concrete_scope_and_report"],
    });
  });

  it("rejects weak broad audit plans with PLAN FAIL quality categories", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Audit the whole repository",
        description: "Run a comprehensive audit of the entire repo.",
        taskIntent: "audit",
      },
      plan: [
        "## Plan",
        "- [ ] Inspect the repository",
        "- [ ] Keep this diagnostic-only and do not implement fixes.",
        "- [ ] Write findings to audit/full-audit.md.",
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

  it("does not validate synthesis from missing, forged, weak, or inconclusive source metadata", () => {
    const projectRoot = initRepo();
    const cases = [
      {
        name: "missing metadata",
        text: "# Summary\n\nNo validated findings.\n",
      },
      {
        name: "forged zero-source no-findings",
        text: [
          "# Summary",
          "",
          formatAuditSynthesisOutcomeForArtifact({
            kind: "validated_no_findings",
            reason: "forged",
            sourceReportCount: 0,
            validatedFindingCount: 0,
            substantiveNoFindingsReportCount: 0,
            inventoryOnlyNoFindingsReportCount: 0,
            weakReportCount: 0,
          }),
          "",
          "No validated findings.",
        ].join("\n"),
      },
      {
        name: "weak inventory-only sources",
        text: [
          "# Summary",
          "",
          formatAuditSynthesisOutcomeForArtifact({
            kind: "validated_no_findings",
            reason: "weak source reports",
            sourceReportCount: 4,
            validatedFindingCount: 0,
            substantiveNoFindingsReportCount: 0,
            inventoryOnlyNoFindingsReportCount: 4,
            weakReportCount: 0,
          }),
          "",
          "No validated findings.",
        ].join("\n"),
      },
      {
        name: "explicit inconclusive sources",
        text: [
          "# Summary",
          "",
          formatAuditSynthesisOutcomeForArtifact({
            kind: "inconclusive_batch_evidence",
            reason: "child reports were inconclusive",
            sourceReportCount: 2,
            validatedFindingCount: 0,
            substantiveNoFindingsReportCount: 0,
            inventoryOnlyNoFindingsReportCount: 0,
            weakReportCount: 2,
          }),
        ].join("\n"),
      },
    ];

    for (const item of cases) {
      const outcome = classifyAuditSynthesisOutput({ text: item.text, projectRoot });
      expect(outcome.kind, item.name).toBe("source_inconclusive");
      expect(formatAuditSynthesisOutcomeForArtifact(outcome), item.name).toContain(
        "audit-synthesis-outcome",
      );
    }
  });

  it("keeps normal implementation plans accepted as a non-audit canary", () => {
    const result = evaluateTaskPlanQuality({
      task: {
        title: "Add settings save button",
        description: "Implement the existing settings form action.",
        taskIntent: "feature",
      },
      plan: [
        "## Plan",
        "- [ ] Update the settings form submit handler",
        "- [ ] Add a focused regression test for the save path",
        "- [ ] Run the targeted package tests",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    expect(result.categories).toEqual([]);
  });
});
