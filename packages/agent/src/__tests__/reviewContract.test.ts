import { describe, expect, it } from "vitest";
import {
  buildStructuredReviewComments,
  createAutoReviewFindingId,
  normalizeFindingText,
  parseSpecializedRoleOutput,
  parseSpecializedRoleOutputResult,
  parseStructuredReviewComments,
  parseStructuredReviewCommentsResult,
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

  it("parses specialized reviewer role output with role-sourced findings", () => {
    const parsed = parseSpecializedRoleOutput(
      [
        "## Verdict",
        "- FAIL",
        "",
        "## Blocking Findings",
        "- API response shape changed without compatibility coverage",
        "",
        "## Advisories",
        "- packages/api/src/routes/tasks.ts:1 was inspected.",
        "",
        "## Previous Findings",
        "- none",
      ].join("\n"),
      "regression_api_contract",
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.blockingFindings).toHaveLength(1);
    expect(parsed?.blockingFindings[0]).toEqual(
      expect.objectContaining({
        source: "regression_api_contract",
        text: "API response shape changed without compatibility coverage",
      }),
    );
    expect(parsed?.advisories[0]?.source).toBe("regression_api_contract");
  });

  it("rejects specialized reviewer pass with blockers and inconclusive output", () => {
    expect(
      parseSpecializedRoleOutput(
        [
          "## Verdict",
          "- PASS",
          "",
          "## Blocking Findings",
          "- A blocker cannot accompany PASS",
          "",
          "## Advisories",
          "- none",
          "",
          "## Previous Findings",
          "- none",
        ].join("\n"),
        "correctness",
      ),
    ).toBeNull();

    expect(
      parseSpecializedRoleOutput(
        [
          "## Verdict",
          "- INCONCLUSIVE",
          "",
          "## Blocking Findings",
          "- none",
          "",
          "## Advisories",
          "- Evidence was ambiguous.",
          "",
          "## Previous Findings",
          "- none",
        ].join("\n"),
        "security_data_loss",
      ),
    ).toBeNull();
  });

  it("returns typed parse errors for specialized reviewer output without verdict", () => {
    const result = parseSpecializedRoleOutputResult(
      [
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- packages/agent/src/reviewContract.ts:1 was inspected.",
        "",
        "## Previous Findings",
        "- none",
      ].join("\n"),
      "correctness",
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse error");
    expect(result.error.issues.map((issue) => issue.code)).toContain("missing_verdict");
  });

  it("returns typed parse errors for specialized PASS with blockers", () => {
    const result = parseSpecializedRoleOutputResult(
      [
        "## Verdict",
        "- PASS",
        "",
        "## Blocking Findings",
        "- A blocker cannot accompany PASS",
        "",
        "## Advisories",
        "- packages/agent/src/reviewContract.ts:1 was inspected.",
        "",
        "## Previous Findings",
        "- none",
      ].join("\n"),
      "correctness",
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse error");
    expect(result.error.issues.map((issue) => issue.code)).toContain("pass_with_blockers");
  });

  it("rejects specialized reviewer pass without concrete inspection evidence", () => {
    const withoutAdvisoryEvidence = [
      "## Verdict",
      "- PASS",
      "",
      "## Blocking Findings",
      "- none",
      "",
      "## Advisories",
      "- none",
      "",
      "## Previous Findings",
      "- none",
    ].join("\n");
    const genericAdvisory = [
      "## Verdict",
      "- PASS",
      "",
      "## Blocking Findings",
      "- none",
      "",
      "## Advisories",
      "- Everything looks good after review.",
      "",
      "## Previous Findings",
      "- none",
    ].join("\n");

    expect(parseSpecializedRoleOutput(withoutAdvisoryEvidence, "correctness")).toBeNull();
    expect(parseSpecializedRoleOutput(genericAdvisory, "regression_api_contract")).toBeNull();
  });

  it("accepts specialized reviewer pass with env template file evidence", () => {
    const parsed = parseSpecializedRoleOutput(
      [
        "## Verdict",
        "- PASS",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- Inspected `.env.example`; it contains only non-secret defaults and temporary values.",
        "",
        "## Previous Findings",
        "- none",
      ].join("\n"),
      "regression_api_contract",
    );

    expect(parsed?.blockingFindings).toEqual([]);
    expect(parsed?.advisories[0]?.text).toContain(".env.example");
  });

  it("accepts specialized reviewer pass when concrete manifest fallback evidence is provided", () => {
    const parsed = parseSpecializedRoleOutput(
      [
        "## Verdict",
        "- PASS",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- none",
        "",
        "## Previous Findings",
        "- none",
      ].join("\n"),
      "security_data_loss",
      [],
      {
        passEvidenceFallback:
          "Implementation manifest evidence: changedFiles contains .env.example (added); verificationEvidence contains npm.cmd run build status passed.",
      },
    );

    expect(parsed?.blockingFindings).toEqual([]);
    expect(parsed?.advisories[0]?.text).toContain(".env.example");
    expect(parsed?.advisories[0]?.text).toContain("npm.cmd run build");
  });

  it("returns typed parse errors for specialized PASS without concrete evidence", () => {
    const result = parseSpecializedRoleOutputResult(
      [
        "## Verdict",
        "- PASS",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- Everything looks good after review.",
        "",
        "## Previous Findings",
        "- none",
      ].join("\n"),
      "regression_api_contract",
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse error");
    expect(result.error.issues.map((issue) => issue.code)).toContain(
      "pass_without_concrete_evidence",
    );
  });

  it("rejects specialized reviewer output without previous findings section", () => {
    expect(
      parseSpecializedRoleOutput(
        [
          "## Verdict",
          "- PASS",
          "",
          "## Blocking Findings",
          "- none",
          "",
          "## Advisories",
          "- packages/agent/src/reviewContract.ts:1 was inspected.",
        ].join("\n"),
        "correctness",
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

  it("returns typed parse errors for missing Security Coverage", () => {
    const result = parseStructuredReviewCommentsResult(
      [
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
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse error");
    expect(result.error.issues.map((issue) => issue.code)).toContain("missing_security_coverage");
    expect(result.error.fingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(result.error.repairInstructions).toContain('Add a "## Security Coverage" section');
  });

  it("returns typed parse errors for duplicate Security Coverage area rows", () => {
    const result = parseStructuredReviewCommentsResult(
      [
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
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secrets",
        "- secret_leaks | covered | Checked secrets again",
        "- permissions_sandbox | covered | Checked permissions",
        "- unsafe_shell_network_file | covered | Checked operations",
        "- dependency_config | covered | Checked config",
      ].join("\n"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse error");
    expect(result.error.issues.map((issue) => issue.code)).toContain(
      "duplicate_security_coverage_area",
    );
    expect(result.error.issues.map((issue) => issue.row)).toContain(
      "secret_leaks | covered | Checked secrets again",
    );
  });

  it("returns typed parse errors for missing Previous Findings coverage", () => {
    const result = parseStructuredReviewCommentsResult(
      [
        "## Auto Review Metadata",
        "- Strategy: closure_first",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Looks good",
        "",
        ...securityCoverageSection(),
      ].join("\n"),
      [
        {
          id: "persisted-1",
          source: "code_review",
          text: "Fix persisted blocker",
        },
      ],
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse error");
    expect(result.error.issues.map((issue) => issue.code)).toContain("missing_previous_finding");
    expect(result.error.repairInstructions).toContain("persisted-1");
  });

  it.each(["1abc", "1.5"])(
    "returns typed parse errors for malformed Review Iteration metadata %s",
    (iteration) => {
      const result = parseStructuredReviewCommentsResult(
        [
          "## Auto Review Metadata",
          "- Strategy: full_re_review",
          `- Review Iteration: ${iteration}`,
          "",
          "## Previous Findings",
          "- none",
          "",
          "## Blocking Findings",
          "- none",
          "",
          "## Advisories",
          "- code_review | packages/agent/src/reviewContract.ts:1 was inspected.",
          "",
          ...securityCoverageSection(),
        ].join("\n"),
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected parse error");
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_metadata",
            detail: expect.stringContaining(`Review Iteration: ${iteration}`),
          }),
        ]),
      );
    },
  );

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
      specializedReviews: [
        {
          role: "correctness",
          previousFindings: [],
          blockingFindings: [
            {
              id: createAutoReviewFindingId("correctness", "State transition skips review"),
              source: "correctness",
              text: "State transition skips review",
            },
          ],
          advisories: [{ source: "correctness", text: "coordinator.ts:1 inspected" }],
        },
      ],
      rawCodeReview: "structured code review",
      rawSecurityAudit: "structured security audit",
      rawSpecializedReviews: [{ role: "correctness", rawOutput: "raw correctness" }],
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
    expect(parsed?.advisories).toContainEqual({
      source: "security_audit",
      text: "Consider masking internal file paths in human-facing comments",
    });
    expect(parsed?.securityCoverage).toEqual(completeSecurityAuditCoverage);
    expect(parsed?.blockingFindings.map((finding) => finding.source)).toContain("correctness");
    expect(parsed?.advisories).toContainEqual({
      source: "correctness",
      text: "coordinator.ts:1 inspected",
    });
    expect(reviewComments).toContain("## Raw Specialized Review: correctness");
  });

  it("consolidates duplicate previous finding rows before canonical review validation", () => {
    const previousId = "review-gate-1";
    const reviewComments = buildStructuredReviewComments({
      strategy: "full_re_review",
      iteration: 3,
      codeReview: {
        previousFindings: [
          {
            id: previousId,
            source: "review_gate",
            status: "resolved",
            note: "Code reviewer confirmed the structured review contract is repaired.",
            text: "Code reviewer confirmed the structured review contract is repaired.",
          },
        ],
        blockingFindings: [],
        advisories: [],
        securityCoverage: completeCodeReviewSecurityCoverage,
      },
      securityAudit: {
        previousFindings: [
          {
            id: previousId,
            source: "security_audit",
            status: "still_blocking",
            note: "Security reviewer still needs complete security coverage evidence.",
            text: "Security reviewer still needs complete security coverage evidence.",
          },
        ],
        blockingFindings: [],
        advisories: [],
        securityCoverage: completeSecurityAuditCoverage,
      },
      rawCodeReview: "structured code review",
      rawSecurityAudit: "structured security audit",
    });

    expect(
      reviewComments
        .split("\n")
        .filter((line) => line.startsWith("- [review-gate-1] review_gate |")),
    ).toHaveLength(2);
    const result = parseStructuredReviewCommentsResult(reviewComments, [
      {
        id: previousId,
        source: "review_gate",
        text: "Structured review contract blocker",
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected canonical review comments to parse");
    expect(result.value.previousFindings).toEqual([
      expect.objectContaining({
        id: previousId,
        source: "review_gate",
        status: "still_blocking",
      }),
    ]);
    expect(result.value.blockingFindings).toEqual([
      expect.objectContaining({
        id: previousId,
        source: "review_gate",
      }),
    ]);
  });

  it("drops sidecar-invented previous findings when the task has no previous findings", () => {
    const reviewComments = buildStructuredReviewComments({
      strategy: "full_re_review",
      iteration: 1,
      codeReview: {
        previousFindings: [
          {
            id: "invented-previous",
            source: "code_review",
            status: "still_blocking",
            note: "Model copied an old blocker id from implementation log.",
            text: "Model copied an old blocker id from implementation log.",
          },
        ],
        blockingFindings: [],
        advisories: [],
        securityCoverage: completeCodeReviewSecurityCoverage,
      },
      securityAudit: {
        previousFindings: [],
        blockingFindings: [],
        advisories: [],
        securityCoverage: completeSecurityAuditCoverage,
      },
      previousFindingsInput: [],
      rawCodeReview: "structured code review",
      rawSecurityAudit: "structured security audit",
    });

    expect(reviewComments).toContain("## Previous Findings\n- none");
    expect(reviewComments).not.toContain("invented-previous");
    const result = parseStructuredReviewCommentsResult(reviewComments, []);
    expect(result.ok).toBe(true);
  });

  it("demotes stale cross-source specialized previous blockers when the specialized reviewer passed", () => {
    const reviewComments = buildStructuredReviewComments({
      strategy: "full_re_review",
      iteration: 3,
      codeReview: {
        previousFindings: [],
        blockingFindings: [],
        advisories: [],
        securityCoverage: completeCodeReviewSecurityCoverage,
      },
      securityAudit: {
        previousFindings: [],
        blockingFindings: [
          {
            id: createAutoReviewFindingId(
              "security_audit",
              "[old-specialized] still_blocking | security_data_loss | Previous round was inconclusive.",
            ),
            source: "security_audit",
            text: "[old-specialized] still_blocking | security_data_loss | Previous round was inconclusive.",
          },
        ],
        advisories: [],
        securityCoverage: completeSecurityAuditCoverage,
      },
      specializedReviews: [
        {
          role: "security_data_loss",
          previousFindings: [],
          blockingFindings: [],
          advisories: [
            {
              source: "security_data_loss",
              text: "Inspected `.env.example`; only safe template values are present.",
            },
          ],
        },
      ],
      previousFindingsInput: [],
      rawCodeReview: "structured code review",
      rawSecurityAudit: "structured security audit",
      rawSpecializedReviews: [{ role: "security_data_loss", rawOutput: "raw security pass" }],
    });

    const parsed = parseStructuredReviewComments(reviewComments);

    expect(parsed?.blockingFindings).toEqual([]);
    expect(parsed?.advisories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "security_audit",
          text: expect.stringContaining("Ignored stale cross-source previous-finding blocker"),
        }),
        expect.objectContaining({
          source: "security_data_loss",
          text: expect.stringContaining(".env.example"),
        }),
      ]),
    );
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
