import { describe, expect, it } from "vitest";
import {
  buildStructuredReviewComments,
  createAutoReviewFindingId,
  normalizeFindingText,
  parseStructuredReviewComments,
  parseStructuredSidecarOutput,
} from "../reviewContract.js";

describe("reviewContract", () => {
  const completeCodeReviewSecurityCoverage = [
    {
      area: "secret_leaks" as const,
      status: "not_applicable" as const,
      note: "Code review did not inspect secret handling",
    },
    {
      area: "permissions_sandbox" as const,
      status: "not_applicable" as const,
      note: "Code review did not inspect permission boundaries",
    },
    {
      area: "unsafe_shell_network_file" as const,
      status: "not_applicable" as const,
      note: "Code review did not inspect shell network or file operations",
    },
    {
      area: "dependency_config" as const,
      status: "not_applicable" as const,
      note: "Code review did not inspect dependency configuration",
    },
  ];

  const completeSecurityAuditCoverage = [
    {
      area: "secret_leaks" as const,
      status: "covered" as const,
      note: "No raw secrets were present in changed review paths",
    },
    {
      area: "permissions_sandbox" as const,
      status: "covered" as const,
      note: "Checked permission and sandbox boundaries",
    },
    {
      area: "unsafe_shell_network_file" as const,
      status: "covered" as const,
      note: "Checked shell network and file operation risks",
    },
    {
      area: "dependency_config" as const,
      status: "covered" as const,
      note: "Checked dependency and configuration changes",
    },
  ];

  function securityCoverageSection(): string[] {
    return [
      "## Security Coverage",
      "- secret_leaks | not_applicable | Code review did not inspect secret handling",
      "- permissions_sandbox | not_applicable | Code review did not inspect permission boundaries",
      "- unsafe_shell_network_file | not_applicable | Code review did not inspect shell network or file operations",
      "- dependency_config | not_applicable | Code review did not inspect dependency configuration",
    ];
  }

  it("creates stable finding ids from normalized text", () => {
    const first = createAutoReviewFindingId("code_review", "Missing   null check");
    const second = createAutoReviewFindingId("code_review", "Missing null check");

    expect(first).toBe(second);
    expect(normalizeFindingText("  Missing   null check ")).toBe("Missing null check");
  });

  it("preserves previous finding source when parsing structured sidecar output", () => {
    const previousFindings = [
      {
        id: "persisted-1",
        source: "review_gate" as const,
        text: "Tighten regression coverage for retry path",
      },
    ];

    const parsed = parseStructuredSidecarOutput(
      [
        "## Blocking Findings",
        "- Add null guard before accessing runtime metadata",
        "",
        "## Advisories",
        "- none",
        "",
        "## Previous Findings",
        "- [persisted-1] still_blocking | Retry path still lacks regression coverage",
        "",
        ...securityCoverageSection(),
      ].join("\n"),
      "code_review",
      previousFindings,
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.previousFindings).toEqual([
      {
        id: "persisted-1",
        source: "review_gate",
        status: "still_blocking",
        note: "Retry path still lacks regression coverage",
        text: "Retry path still lacks regression coverage",
        closureEvidence: "Retry path still lacks regression coverage",
      },
    ]);
    expect(parsed?.securityCoverage).toEqual(completeCodeReviewSecurityCoverage);
  });

  it("rejects structured sidecar output without complete security coverage", () => {
    expect(
      parseStructuredSidecarOutput(
        ["## Blocking Findings", "- none", "", "## Advisories", "- none"].join("\n"),
        "code_review",
      ),
    ).toBeNull();

    expect(
      parseStructuredSidecarOutput(
        [
          "## Blocking Findings",
          "- none",
          "",
          "## Advisories",
          "- none",
          "",
          "## Security Coverage",
          "- secret_leaks | covered | Checked secrets",
        ].join("\n"),
        "security_audit",
      ),
    ).toBeNull();
  });

  it("rejects canonical review comments without complete unique security coverage", () => {
    const withoutSecurityCoverage = [
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
    ].join("\n");

    const duplicateSecurityCoverage = [
      withoutSecurityCoverage,
      "",
      "## Security Coverage",
      "- secret_leaks | covered | Checked secrets",
      "- secret_leaks | covered | Checked secrets again",
      "- permissions_sandbox | covered | Checked permissions",
      "- unsafe_shell_network_file | covered | Checked operations",
      "- dependency_config | covered | Checked config",
    ].join("\n");

    expect(parseStructuredReviewComments(withoutSecurityCoverage)).toBeNull();
    expect(parseStructuredReviewComments(duplicateSecurityCoverage)).toBeNull();
  });

  it("round-trips structured review comments with previous, blocking, and advisory sections", () => {
    const previousId = createAutoReviewFindingId(
      "code_review",
      "Ensure manual handoff badge is rendered on done tasks",
    );

    const reviewComments = buildStructuredReviewComments({
      strategy: "closure_first",
      iteration: 2,
      codeReview: {
        previousFindings: [
          {
            id: previousId,
            source: "code_review",
            status: "still_blocking",
            note: "Badge is still missing on the kanban card",
            text: "Badge is still missing on the kanban card",
          },
        ],
        blockingFindings: [
          {
            id: createAutoReviewFindingId("code_review", "Add manual review banner to detail view"),
            source: "code_review",
            text: "Add manual review banner to detail view",
          },
        ],
        advisories: [],
        securityCoverage: completeCodeReviewSecurityCoverage,
      },
      securityAudit: {
        previousFindings: [],
        blockingFindings: [],
        advisories: [
          {
            source: "security_audit",
            text: "Consider masking internal file paths in human-facing comments",
          },
        ],
        securityCoverage: completeSecurityAuditCoverage,
      },
      rawCodeReview: "structured code review",
      rawSecurityAudit: "structured security audit",
    });

    const parsed = parseStructuredReviewComments(reviewComments);

    expect(parsed).not.toBeNull();
    expect(parsed?.strategy).toBe("closure_first");
    expect(parsed?.iteration).toBe(2);
    expect(parsed?.previousFindings).toEqual([
      {
        id: previousId,
        source: "code_review",
        status: "still_blocking",
        note: "Badge is still missing on the kanban card",
        text: "Badge is still missing on the kanban card",
        closureEvidence: "Badge is still missing on the kanban card",
      },
    ]);
    expect(parsed?.blockingFindings.map((finding) => finding.id)).toContain(previousId);
    expect(parsed?.advisories).toEqual([
      {
        source: "security_audit",
        text: "Consider masking internal file paths in human-facing comments",
      },
    ]);
    expect(parsed?.securityCoverage).toEqual(completeSecurityAuditCoverage);
  });

  it("round-trips expanded previous statuses and redacts secret-like review text", () => {
    const manualId = "manual-1";
    const newBlockerId = "new-1";
    const comments = buildStructuredReviewComments({
      strategy: "closure_first",
      iteration: 3,
      codeReview: {
        previousFindings: [
          {
            id: manualId,
            source: "code_review",
            status: "manual_review_required",
            note: "Needs operator decision; token=sk-test_12345678901234567890 was mentioned",
            text: "Needs operator decision",
          },
          {
            id: newBlockerId,
            source: "code_review",
            status: "new_blocker",
            note: "New blocker appears in `packages/agent/src/reviewGate.ts`",
            text: "New blocker appears in `packages/agent/src/reviewGate.ts`",
          },
        ],
        blockingFindings: [],
        advisories: [
          {
            source: "code_review",
            text: "Avoid logging api_key=abcd1234abcd1234abcd1234 in review notes",
          },
        ],
        securityCoverage: completeCodeReviewSecurityCoverage,
      },
      securityAudit: {
        previousFindings: [
          {
            id: "not-repro-1",
            source: "security_audit",
            status: "not_reproducible",
            note: "Inspected `packages/agent/src/reviewContract.ts`; no token echo path remains",
            text: "No token echo path remains",
          },
        ],
        blockingFindings: [],
        advisories: [],
        securityCoverage: [
          {
            ...completeSecurityAuditCoverage[0],
          },
          {
            ...completeSecurityAuditCoverage[1],
          },
          {
            ...completeSecurityAuditCoverage[2],
          },
          {
            area: "dependency_config",
            status: "covered",
            note: "Checked package config without exposing access_token=abcdef1234567890",
          },
        ],
      },
      rawCodeReview: "Raw token=sk-test_12345678901234567890",
      rawSecurityAudit: "Raw access_token=abcdef1234567890",
    });

    expect(comments).toContain("[REDACTED]");
    expect(comments).not.toContain("sk-test_12345678901234567890");
    expect(comments).not.toContain("abcdef1234567890");

    const parsed = parseStructuredReviewComments(comments);
    expect(parsed?.previousFindings.map((finding) => finding.status)).toEqual([
      "manual_review_required",
      "new_blocker",
      "not_reproducible",
    ]);
    expect(parsed?.securityCoverage).toEqual([
      completeSecurityAuditCoverage[0],
      completeSecurityAuditCoverage[1],
      completeSecurityAuditCoverage[2],
      {
        area: "dependency_config",
        status: "covered",
        note: "Checked package config without exposing access_token=[REDACTED]",
      },
    ]);
  });
});
