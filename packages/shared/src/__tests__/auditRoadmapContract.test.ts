import { describe, expect, it } from "vitest";
import {
  AUDIT_ARTIFACT_ROLES,
  AUDIT_ARTIFACT_STATES,
  AUDIT_FAILURE_FAMILIES,
  isAuditReportArtifactPath,
  isAuditSynthesisTitle,
  mapTaskCompletionIssueCodeToAuditFailureFamily,
  parseExpectedAuditReportArtifactPath,
  selectTaskCompletionAuditFailureFamily,
  validateGeneratedAuditCard,
} from "../auditRoadmapContract.js";

function completeAuditDescription() {
  return [
    "Scope: src/config.ts",
    "Allowed changes: only create/update one report artifact.",
    "Report artifact: audit/config-audit.md",
    "Acceptance criteria: inspect the scoped files and record findings or none.",
    "Evidence requirements: every finding must include Evidence: src/config.ts:1, Risk:, and Verification: Command rg config src/config.ts output matched.",
    "Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.",
    "Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
    "Evidence: src/config.ts:1",
    "Risk: config drift.",
    "Verification: Command rg config src/config.ts output matched.",
  ].join("\n");
}

describe("auditRoadmapContract", () => {
  it("defines canonical audit artifact roles, states, and failure families", () => {
    expect(AUDIT_ARTIFACT_ROLES).toEqual(["report", "synthesis"]);
    expect(AUDIT_ARTIFACT_STATES).toEqual([
      "expected",
      "valid",
      "invalid",
      "missing",
      "synthesis_not_ready",
      "external_blocked",
    ]);
    expect(AUDIT_FAILURE_FAMILIES).toEqual([
      "invalid_artifact_content",
      "missing_artifact",
      "missing_tool_evidence",
      "rework_needed",
      "synthesis_not_ready",
      "manual_review_required",
      "external_blocker",
    ]);
  });

  it("parses the declared report artifact path from audit card descriptions", () => {
    expect(parseExpectedAuditReportArtifactPath(completeAuditDescription())).toBe(
      "audit/config-audit.md",
    );
    expect(parseExpectedAuditReportArtifactPath("Report artifact: audit report")).toBeNull();
  });

  it("accepts report-like docs paths while rejecting source, config, test, and unsafe paths", () => {
    expect(isAuditReportArtifactPath("docs/security-audit.md")).toBe(true);
    expect(isAuditReportArtifactPath("audit/security-audit.md")).toBe(true);
    expect(isAuditReportArtifactPath("reports/notes.md")).toBe(true);
    expect(isAuditReportArtifactPath("packages/api/src/security-audit.md")).toBe(false);
    expect(isAuditReportArtifactPath("src/security-audit.md")).toBe(false);
    expect(isAuditReportArtifactPath("tests/security-audit.md")).toBe(false);
    expect(isAuditReportArtifactPath("../audit/security-audit.md")).toBe(false);
  });

  it("identifies audit synthesis titles", () => {
    expect(isAuditSynthesisTitle("Synthesize audit findings")).toBe(true);
    expect(isAuditSynthesisTitle("Audit summary for roadmap")).toBe(true);
    expect(isAuditSynthesisTitle("Audit dependency injection")).toBe(false);
  });

  it("validates generated audit cards with stable issue codes and legacy messages", () => {
    expect(
      validateGeneratedAuditCard({
        title: "Audit: security configuration",
        description: completeAuditDescription(),
      }),
    ).toMatchObject({ ok: true, issues: [] });

    const invalid = validateGeneratedAuditCard({
      title: "Fix security bugs",
      description: "Fix the bugs and add tests.",
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.issueDetails.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["missing_diagnostic_markers", "implementation_shaped_title"]),
    );
    expect(invalid.issues).toEqual(
      expect.arrayContaining([
        "audit task is missing diagnostic report markers",
        "audit task title describes implementation work",
      ]),
    );
  });

  it("maps task completion issue codes to audit failure families", () => {
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("missing_report_artifact")).toBe(
      "missing_artifact",
    );
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("insufficient_report_evidence")).toBe(
      "invalid_artifact_content",
    );
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("manual_review_required")).toBe(
      "manual_review_required",
    );
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("synthesis_not_ready")).toBe(
      "synthesis_not_ready",
    );
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("branch_isolation")).toBe(
      "external_blocker",
    );
  });

  it("selects actionable audit failure families before manual review handoff", () => {
    expect(
      selectTaskCompletionAuditFailureFamily([
        "invalid_or_missing_file_references",
        "manual_review_required",
      ]),
    ).toBe("invalid_artifact_content");
    expect(
      selectTaskCompletionAuditFailureFamily(["branch_isolation", "missing_report_artifact"]),
    ).toBe("external_blocker");
    expect(selectTaskCompletionAuditFailureFamily(["manual_review_required"])).toBe(
      "manual_review_required",
    );
  });
});
