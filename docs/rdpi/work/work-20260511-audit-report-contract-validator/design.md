# Design - Shared Audit Report Contract Validator

## Goals

- Introduce one deterministic shared audit report validator with typed issue codes.
- Reject the observed weak report class as a fixture, including:
  - short numeric synthetic git output like `1234567 (HEAD -> main)`;
  - findings mixed with `No Validated Findings`;
  - governance/documentation observations presented as technical architecture findings;
  - speculative or unverified audit claims;
  - fake command output and placeholder verification.
- Preserve valid no-findings reports when they include checked files/commands and observed command evidence.
- Preserve valid findings reports when findings include concrete `path:line` evidence, `Risk:`, `Proposed fix:`, and `Verification:`.
- Preserve existing report artifact path handling and report-only delta behavior.

## Non-goals

- Do not implement the separate audit scope coverage contract in this task.
- Do not implement rework freshness semantics in this task.
- Do not redesign the review gate; only add compatibility through the shared validator and existing completion-evidence path.
- Do not change database schema or roadmap artifact state enums unless the validator integration proves it is unavoidable.
- Do not execute or create child follow-up tasks.

## Proposed shape

- Add `packages/shared/src/auditReportValidator.ts`.
- Export:
  - `AUDIT_REPORT_VALIDATION_ISSUE_CODES`;
  - `AuditReportValidationIssueCode`;
  - `AuditReportValidationIssue`;
  - `AuditReportValidationInput`;
  - `AuditReportValidationResult`;
  - `validateAuditReportArtifact()`;
  - `formatAuditReportValidationIssues()`.
- Keep the validator deterministic and text/file-reference based. It should accept the report text plus project root, report artifact paths to exclude from evidence, allowed evidence artifact paths, and whether a proposed fix is required.
- Move or share report-specific helpers from `taskCompletionEvidence.ts` so the validator owns:
  - report path reference extraction/classification;
  - line-reference validation;
  - structured finding/no-finding evidence checks;
  - low-quality report pattern checks;
  - contradiction checks.
- Preserve the existing completion evidence public contract by adding validator result details under `evidence.auditReportValidation` and still emitting `low_quality_report_evidence`, `invalid_or_missing_file_references`, and `insufficient_report_evidence` as appropriate.

## Issue-code strategy

- Use report-level typed issue codes for precise downstream details, for example:
  - `synthetic_git_output`;
  - `placeholder_author_metadata`;
  - `unverified_inspection_claim`;
  - `future_tense_git_verification`;
  - `speculative_audit_claim`;
  - `non_actionable_audit_observation`;
  - `governance_observation_as_finding`;
  - `contradictory_findings_and_no_findings`;
  - `fake_or_placeholder_command_output`;
  - `false_missing_path_claim`;
  - `missing_report_file_references`;
  - `missing_substantive_evidence`;
- Map validator failures into existing completion issue codes so existing approve/coordinator/batch behavior remains stable.
- Add report-level issue codes to validation details so review gate, approve flow, and batch artifact state can consume typed details through the existing result object.

## Test strategy

- Add a focused shared validator test file for direct validator semantics.
- Update completion evidence tests to prove the validator is used by completion evidence.
- Add or adjust thin integration assertions where existing approve/coordinator paths store `validationDetails.issues` and `validationDetails.evidence`.
- Keep tests fixture-driven and avoid live runtime/model dependencies.

## Risks

- Moving helper logic can accidentally relax existing evidence guards. Mitigation: preserve current positive/negative completion evidence tests and add validator-specific tests.
- Adding many new completion issue codes could disrupt failure-family mapping. Mitigation: keep new report-level codes nested under validator details and map to existing completion issue codes for task state transitions.
- Valid no-findings reports may be blocked by contradiction detection. Mitigation: only flag contradiction when no-findings language coexists with finding headings or finding fields.
