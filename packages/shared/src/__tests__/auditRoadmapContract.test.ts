import { describe, expect, it } from "vitest";
import {
  AUDIT_ARTIFACT_ROLES,
  AUDIT_ARTIFACT_REWORK_STATUSES,
  AUDIT_ARTIFACT_STATES,
  AUDIT_FAILURE_FAMILIES,
  AUDIT_NO_TRACKED_SCOPE_SENTINEL,
  AUDIT_NO_FINDINGS_PROOF_GUARDRAIL,
  AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT,
  AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT,
  buildAuditFailureSignature,
  classifyAuditDecompositionRequest,
  isAuditReportArtifactPath,
  isAuditSynthesisTitle,
  mapTaskCompletionIssueCodeToAuditFailureFamily,
  parseExpectedAuditReportArtifactPath,
  selectAuditArtifactFailureFamily,
  selectTaskCompletionAuditFailureFamily,
  validateGeneratedAuditCard,
} from "../auditRoadmapContract.js";

function completeAuditDescription(options: { synthesis?: boolean } = {}) {
  const synthesis = options.synthesis ?? false;
  return [
    synthesis
      ? "Scope: all audit/2026-05-13-*-audit.md reports from this audit batch."
      : "Scope: src/config.ts",
    "Audit mandate: Act as the security owner and find actionable technical-quality risks.",
    ...(synthesis
      ? []
      : ["Risk hypotheses: risk-config-1 src/config.ts may contain unsafe defaults."]),
    "Allowed changes: only create/update one report artifact.",
    synthesis ? "Report artifact: audit/summary.md" : "Report artifact: audit/config-audit.md",
    "Acceptance criteria: inspect the scoped files and record findings or none.",
    "Evidence requirements: every finding must include Evidence: src/config.ts:1, Risk:, Proposed fix:, and Verification: Command rg config src/config.ts output matched.",
    'Quality bar: inventory notes, "uses X", "file exists", "tests pass", broad maintainability smells, product-scope gaps, and speculative may/might/could claims are not findings.',
    'No-findings rule: if no actionable finding is found, write "No validated findings" plus checked files and commands with observed outputs.',
    AUDIT_NO_FINDINGS_PROOF_GUARDRAIL,
    AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT,
    ...(synthesis ? [AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT] : []),
    "Git requirements: run git status --short; git add the report artifact; git commit the report artifact; verify with git log -1 --name-only --oneline.",
    "Constraint: diagnostic-only; do not implement fixes; do not edit source/config/test files; do not create child implementation tasks.",
    "Evidence: src/config.ts:1",
    "Risk: config drift.",
    "Proposed fix: pin the configuration contract.",
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
      "source_inconclusive",
      "terminal_inconclusive",
      "manual_exception",
    ]);
    expect(AUDIT_FAILURE_FAMILIES).toEqual([
      "invalid_artifact_content",
      "invalid_artifact_contract",
      "invalid_artifact_integrity",
      "invalid_inventory_only",
      "insufficient_substantive_evidence",
      "source_inconclusive",
      "manual_exception",
      "missing_artifact",
      "missing_tool_evidence",
      "rework_needed",
      "inconclusive_batch_evidence",
      "synthesis_not_ready",
      "manual_review_required",
      "external_blocker",
    ]);
    expect(AUDIT_ARTIFACT_REWORK_STATUSES).toEqual([
      "accepted",
      "rework_requested",
      "manual_review_required",
      "terminal_inconclusive",
      "manual_exception",
      "not_applicable",
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
    expect(isAuditReportArtifactPath(".ai-factory/plans/audit-security.md")).toBe(false);
    expect(isAuditReportArtifactPath("aif-plan/audit-security.md")).toBe(false);
    expect(
      isAuditReportArtifactPath(
        "docs/rdpi/work/work-20260514-harden-source-audit-report-production/result.md",
      ),
    ).toBe(false);
    expect(
      isAuditReportArtifactPath(
        "docs/intake/work/work-20260514-harden-source-audit-report-production.md",
      ),
    ).toBe(false);
    expect(isAuditReportArtifactPath("docs/intake/work_status.json")).toBe(false);
    expect(isAuditReportArtifactPath("docs/intake/work_index.md")).toBe(false);
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

  it("does not classify audit guardrails as implementation-shaped work", () => {
    const result = validateGeneratedAuditCard({
      title: "Audit: architecture and ownership boundaries",
      description: [
        completeAuditDescription(),
        "Evidence ID rule: manifest evidenceRefs must cite actual runtime audit ledger IDs (ev_*) only; finding labels such as AOB-001 are never evidenceRefs.",
        "Path rule: every repository reference must use an existing scoped path plus line/range; do not use basename-only references such as config.py.",
        "Rejected finding shapes: duplicated initialization/DRY/refactor-helper claims, import-chain/tight-coupling claims without a real cycle, and private-method/direct-store/abstraction-bypass smells are not trusted findings.",
        "Inconclusive rule: a partially inspected source_inconclusive observation is not a finding.",
      ].join("\n"),
    });

    expect(result.issueDetails.map((issue) => issue.code)).not.toContain(
      "implementation_shaped_description",
    );
  });

  it("classifies broad repository audit requests as decomposed report batches", () => {
    expect(
      classifyAuditDecompositionRequest(
        "Run a comprehensive audit of the whole repository for technical risks.",
      ),
    ).toEqual({
      mode: "decomposed_report_batch",
      requiresDecomposition: true,
      reasonCodes: ["broad_repository_scope", "comprehensive_audit_scope"],
    });
  });

  it("classifies multi-domain owner audit requests as decomposed report batches", () => {
    expect(
      classifyAuditDecompositionRequest(
        "Act as the platform owner and run a production-readiness audit for security, performance, correctness, and ops.",
      ),
    ).toEqual({
      mode: "decomposed_report_batch",
      requiresDecomposition: true,
      reasonCodes: ["multi_domain_audit_scope", "owner_grade_production_readiness_scope"],
    });
  });

  it("classifies unbounded audit requests as decomposed report batches", () => {
    expect(
      classifyAuditDecompositionRequest({
        title: "audit-logging",
        description: "# My App\nA service to audit\nпроведи аудит",
      }),
    ).toEqual({
      mode: "decomposed_report_batch",
      requiresDecomposition: true,
      reasonCodes: ["audit_without_concrete_boundaries"],
    });
  });

  it("classifies concrete single-report audit cards as single reports", () => {
    expect(
      classifyAuditDecompositionRequest({
        title: "Audit: security configuration",
        description: completeAuditDescription(),
      }),
    ).toEqual({
      mode: "single_report",
      requiresDecomposition: false,
      reasonCodes: ["concrete_scope_and_report"],
    });
  });

  it("keeps broad audit signals ahead of concrete scope and report markers", () => {
    expect(
      classifyAuditDecompositionRequest({
        title: "Audit entire repository",
        description: [
          "Scope: src, packages, tests, docs",
          "Audit mandate: Audit security, performance, correctness, and operations readiness across the whole project.",
          "Report artifact: audit/full.md",
        ].join("\n"),
      }),
    ).toEqual({
      mode: "decomposed_report_batch",
      requiresDecomposition: true,
      reasonCodes: ["broad_repository_scope", "multi_domain_audit_scope"],
    });
  });

  it("classifies bare repository audit targets as broad even with concrete report markers", () => {
    expect(
      classifyAuditDecompositionRequest({
        title: "Audit repository",
        description: [
          "Scope: src, packages, tests, docs",
          "Audit mandate: Inspect repository quality risks.",
          "Report artifact: audit/full.md",
        ].join("\n"),
      }),
    ).toEqual({
      mode: "decomposed_report_batch",
      requiresDecomposition: true,
      reasonCodes: ["broad_repository_scope"],
    });
  });

  it("classifies narrow file and component audits as single reports", () => {
    expect(classifyAuditDecompositionRequest("Audit src/config.ts for unsafe defaults.")).toEqual({
      mode: "single_report",
      requiresDecomposition: false,
      reasonCodes: ["narrow_file_or_component_scope"],
    });
    expect(
      classifyAuditDecompositionRequest("Review component SettingsPanel for state bugs."),
    ).toEqual({
      mode: "single_report",
      requiresDecomposition: false,
      reasonCodes: ["narrow_file_or_component_scope"],
    });
  });

  it("rejects audit cards missing canonical no-findings guardrails", () => {
    const invalid = validateGeneratedAuditCard({
      title: "Audit: security configuration",
      description: completeAuditDescription()
        .replace(`${AUDIT_NO_FINDINGS_PROOF_GUARDRAIL}\n`, "")
        .replace(`${AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT}\n`, ""),
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.issueDetails.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "missing_no_findings_proof_guardrail",
        "missing_substantive_no_findings_requirement",
      ]),
    );
  });

  it("rejects audit synthesis cards missing outcome requirements", () => {
    const invalid = validateGeneratedAuditCard({
      title: "Synthesize audit findings",
      description: completeAuditDescription({ synthesis: true }).replace(
        `${AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT}\n`,
        "",
      ),
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.issueDetails.map((issue) => issue.code)).toContain(
      "missing_synthesis_outcome_requirement",
    );
  });

  it("rejects source audit cards with broad or non-concrete scope", () => {
    for (const scope of [
      ".",
      "./",
      "*",
      "packages/*",
      "all files",
      "entire repository",
      "the runtime behavior",
    ]) {
      const invalid = validateGeneratedAuditCard({
        title: "Audit: security configuration",
        description: completeAuditDescription().replace("Scope: src/config.ts", `Scope: ${scope}`),
      });

      expect(invalid.ok, scope).toBe(false);
      expect(invalid.issueDetails.map((issue) => issue.code)).toContain("invalid_source_scope");
    }
  });

  it("requires parseable risk hypotheses for every source scope root", () => {
    const missingLine = validateGeneratedAuditCard({
      title: "Audit: security configuration",
      description: completeAuditDescription().replace(
        "Risk hypotheses: risk-config-1 src/config.ts may contain unsafe defaults.\n",
        "",
      ),
    });
    expect(missingLine.issueDetails.map((issue) => issue.code)).toContain(
      "missing_risk_hypotheses",
    );

    const missingScope = validateGeneratedAuditCard({
      title: "Audit: security configuration",
      description: completeAuditDescription().replace(
        "Scope: src/config.ts",
        "Scope: src/config.ts, src/index.ts",
      ),
    });
    expect(missingScope.issueDetails.map((issue) => issue.code)).toContain(
      "missing_scope_risk_hypothesis",
    );
  });

  it("rejects metadata-only or broad generated audit source scopes", () => {
    const invalid = validateGeneratedAuditCard({
      title: "Audit: architecture and ownership boundaries",
      description: completeAuditDescription()
        .replace("Scope: src/config.ts", "Scope: README.md, AGENTS.md, pyproject.toml, src")
        .replace(
          "Risk hypotheses: risk-config-1 src/config.ts may contain unsafe defaults.",
          "Risk hypotheses: risk-arch-1 README.md, AGENTS.md, pyproject.toml, src describe architecture ownership risks.",
        ),
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.issueDetails.map((issue) => issue.code)).toContain("weak_source_scope");
  });

  it("rejects generic owner-area generated audit source hypotheses", () => {
    const invalid = validateGeneratedAuditCard({
      title: "Audit: architecture and ownership boundaries",
      description: completeAuditDescription()
        .replace("Scope: src/config.ts", "Scope: src/bot_intevra/app.py")
        .replace(
          "Risk hypotheses: risk-config-1 src/config.ts may contain unsafe defaults.",
          "Risk hypotheses: risk-arch-1 src/bot_intevra/app.py scoped files may contain owner-area defects that produce actionable audit findings.",
        ),
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.issueDetails.map((issue) => issue.code)).toContain("generic_risk_hypotheses");
  });

  it("allows the no tracked scope sentinel for source cards", () => {
    const result = validateGeneratedAuditCard({
      title: "Audit: security configuration",
      description: completeAuditDescription()
        .replace("Scope: src/config.ts", `Scope: ${AUDIT_NO_TRACKED_SCOPE_SENTINEL}`)
        .replace(
          "Risk hypotheses: risk-config-1 src/config.ts may contain unsafe defaults.",
          `Risk hypotheses: risk-config-1 ${AUDIT_NO_TRACKED_SCOPE_SENTINEL} marks this card non-repairable before runtime.`,
        ),
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("exempts synthesis cards from product risk hypotheses but requires report batch scope", () => {
    expect(
      validateGeneratedAuditCard({
        title: "Synthesize audit findings",
        description: completeAuditDescription({ synthesis: true }),
      }),
    ).toMatchObject({ ok: true });

    const invalidScope = validateGeneratedAuditCard({
      title: "Synthesize audit findings",
      description: completeAuditDescription({ synthesis: true }).replace(
        "Scope: all audit/2026-05-13-*-audit.md reports from this audit batch.",
        "Scope: src/config.ts",
      ),
    });
    expect(invalidScope.issueDetails.map((issue) => issue.code)).toContain(
      "invalid_synthesis_scope",
    );
  });

  it("requires report-only allowed changes for source and synthesis cards", () => {
    for (const [title, description] of [
      [
        "Audit: security configuration",
        completeAuditDescription().replace(
          "Allowed changes: only create/update one report artifact.",
          "Allowed changes: only create/update audit/config-audit.md and src/config.ts.",
        ),
      ],
      [
        "Synthesize audit findings",
        completeAuditDescription({ synthesis: true }).replace(
          "Allowed changes: only create/update one report artifact.",
          "Allowed changes: only create/update audit/summary.md and src/config.ts.",
        ),
      ],
    ]) {
      const invalid = validateGeneratedAuditCard({ title, description });
      expect(invalid.issueDetails.map((issue) => issue.code)).toContain(
        "allowed_changes_not_report_only",
      );
    }
  });

  it("maps task completion issue codes to audit failure families", () => {
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("missing_report_artifact")).toBe(
      "missing_artifact",
    );
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("insufficient_report_evidence")).toBe(
      "invalid_artifact_content",
    );
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("low_quality_report_evidence")).toBe(
      "invalid_artifact_content",
    );
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("malformed_report_artifact")).toBe(
      "invalid_artifact_content",
    );
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("unexpected_non_report_changes")).toBe(
      "invalid_artifact_content",
    );
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("missing_report_manifest")).toBe(
      "invalid_artifact_contract",
    );
    expect(
      mapTaskCompletionIssueCodeToAuditFailureFamily("audit_evidence_source_snapshot_mismatch"),
    ).toBe("invalid_artifact_integrity");
    expect(mapTaskCompletionIssueCodeToAuditFailureFamily("audit_inconclusive")).toBe(
      "inconclusive_batch_evidence",
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

  it("selects granular source report failure families", () => {
    expect(
      selectAuditArtifactFailureFamily({
        validationDetails: {
          auditReportValidation: { sourceClassification: "inventory_only_invalid" },
        },
      }),
    ).toBe("invalid_inventory_only");
    expect(
      selectAuditArtifactFailureFamily({
        validationDetails: {
          auditReportValidation: { sourceClassification: "insufficient_substantive_evidence" },
        },
      }),
    ).toBe("insufficient_substantive_evidence");
    expect(
      selectAuditArtifactFailureFamily({
        validationDetails: {
          auditReportValidation: { sourceClassification: "insufficient_substantive_evidence" },
          issues: [{ code: "missing_report_artifact" }],
        },
      }),
    ).toBe("missing_artifact");
    expect(
      selectAuditArtifactFailureFamily({
        validationDetails: {
          auditReportValidation: { sourceClassification: "inventory_only_invalid" },
          issues: [{ code: "missing_substantive_evidence" }],
        },
      }),
    ).toBe("invalid_inventory_only");
    expect(
      selectAuditArtifactFailureFamily({ issueCodes: ["manifest_content_hash_mismatch"] }),
    ).toBe("invalid_artifact_integrity");
  });

  it("builds stable failure signatures without content hashes", () => {
    const first = buildAuditFailureSignature({
      role: "report",
      classification: "inventory_only_invalid",
      failureFamily: "invalid_inventory_only",
      validationDetails: {
        contentSha: "sha-a",
        issues: [{ code: "missing_substantive_evidence", message: "first text" }],
      },
    });
    const second = buildAuditFailureSignature({
      role: "report",
      classification: "inventory_only_invalid",
      failureFamily: "invalid_inventory_only",
      validationDetails: {
        contentSha: "sha-b",
        issues: [{ code: "missing_substantive_evidence", message: "different text" }],
      },
    });

    expect(first).toBe(second);
    expect(first).not.toContain("sha-a");
    expect(first).not.toContain("first text");
    expect(
      buildAuditFailureSignature({
        role: "report",
        classification: "source_inconclusive",
        failureFamily: "source_inconclusive",
        validationDetails: { issues: [{ code: "manifest_source_snapshot_mismatch" }] },
      }),
    ).not.toBe(first);
  });
});
