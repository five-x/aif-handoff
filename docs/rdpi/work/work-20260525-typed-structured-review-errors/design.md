# Typed Structured Review Errors Design

## Scope

In scope:

- Add typed parse result APIs for structured review comments and specialized reviewer output.
- Preserve existing nullable parser exports as compatibility wrappers unless call sites can be safely migrated.
- Introduce stable parse issue codes and deterministic fingerprints.
- Convert malformed structured review attempts into deterministic `review_gate` findings with exact repair instructions.
- Route the first malformed structured review parse fingerprint to `request_changes`.
- Route a repeated same parse fingerprint to `manual_review_required` before another generic retry.
- Add focused unit tests for required malformed cases.

Out of scope:

- Changing the reviewer LLM prompt contract beyond repair-instruction text emitted by the gate.
- Running local services, browser tests, local e2e, or endpoint checks.
- Creating or executing follow-up tasks.
- Changing database schema unless a code-level state shape requires it. The preferred design stores parse diagnostics inside existing `AutoReviewFinding` fields.

## Typed Parse Model

Add a discriminated parse result model in `packages/agent/src/reviewContract.ts`:

- `StructuredReviewParseIssueCode`: stable string union for machine-actionable reasons.
- `StructuredReviewParseIssue`: `{ code, section?, row?, detail, repair }`.
- `StructuredReviewParseError`: `{ kind, issues, fingerprint, repairInstructions }`.
- `StructuredReviewParseResult<T>`: `{ ok: true, value: T } | { ok: false, error: StructuredReviewParseError }`.

The deterministic fingerprint should be derived from the parse kind plus sorted issue codes and normalized issue details, not from raw provider text. That keeps fingerprints stable across whitespace and raw-output noise while still changing when the repair target changes.

Initial issue codes should cover the intake requirements:

- `missing_required_section`
- `duplicate_section`
- `malformed_list_section`
- `missing_metadata`
- `invalid_metadata`
- `missing_verdict`
- `invalid_verdict`
- `pass_with_blockers`
- `fail_without_blockers`
- `inconclusive_verdict`
- `pass_without_concrete_evidence`
- `malformed_previous_finding`
- `missing_previous_finding`
- `unknown_previous_finding`
- `duplicate_previous_finding`
- `missing_security_coverage`
- `missing_security_coverage_area`
- `duplicate_security_coverage_area`
- `malformed_security_coverage`
- `malformed_blocking_finding`
- `malformed_advisory`

## Parser Behavior

Structured comments:

- Parse only the canonical summary before `## Raw Code Review`, preserving current behavior that ignores raw embedded headings.
- Track duplicate `##` sections while collecting sections.
- Require `Auto Review Metadata`, `Previous Findings`, `Blocking Findings`, `Advisories`, and `Security Coverage`.
- Preserve valid PASS/FAIL semantics as today: no blocking findings means success candidate, blocking findings means rework candidate.
- Treat missing previous finding coverage as a parse error when `previousFindingsInput` is supplied to the typed structured-comments parser.

Specialized reviewer output:

- Require `Verdict`, `Blocking Findings`, `Advisories`, and `Previous Findings`.
- Return typed parse errors for missing verdict, invalid verdict, PASS with blockers, FAIL without blockers, INCONCLUSIVE, missing previous coverage, and PASS without concrete evidence.
- Keep the existing nullable `parseSpecializedRoleOutput` wrapper returning `null` for compatibility.

Security coverage:

- Keep the existing four required areas.
- Emit distinct issue codes for missing section, missing required area, duplicate area, and malformed row.

## Gate Routing

In `evaluateReviewCommentsForAutoMode`:

- Use the typed structured-comments parser for structured-looking review comments.
- On parse success, keep existing `buildStructuredDecision` behavior.
- On parse error, build a deterministic parse-error finding:
  - `source: "review_gate"`
  - `id` derived from the parse error fingerprint
  - `text` includes the fingerprint, issue codes, and exact repair instructions.
  - `closureEvidence` records that the structured parser rejected the output.
- If the parse-error finding ID is already in `previousFindings`, return `manual_review_required` with `handoffReason: "malformed_structured_review_contract"`.
- Otherwise return `request_changes` with `parserMode: "structured"` and the parse-error finding. This remains fail-closed because malformed output cannot return success.

This design intentionally does not route malformed output to `operator_input_required` by default. Malformed review output is not missing operator data; it is an automatic reviewer contract failure and should become manual if repeated.

## Compatibility

- Keep nullable wrapper functions so current callers that only need truthiness continue to compile.
- Add typed functions with explicit names:
  - `parseStructuredReviewCommentsResult`
  - `parseSpecializedRoleOutputResult`
  - optionally `parseStructuredSidecarOutputResult` if sidecar tests or reviewer aggregation need typed sidecar diagnostics.
- Update `extractSpecializedContractFailureFindings` to use nullable wrapper or typed success value safely.

## Risks And Mitigations

- Risk: parser API changes break reviewer aggregation. Mitigation: keep wrappers and migrate only the gate to the typed structured-comments API.
- Risk: first malformed output rework loops endlessly. Mitigation: deterministic parse-error finding IDs make the second same fingerprint route to manual immediately.
- Risk: fail-closed behavior weakens. Mitigation: parse errors produce non-success results only; no fallback model extraction is used for structured-looking malformed output.
- Risk: evidence-free PASS semantics are ambiguous for canonical structured comments because canonical comments have no explicit verdict. Mitigation: enforce evidence-free PASS for specialized role output, where PASS is explicit, and preserve existing risky-task substantive evidence guard for canonical success candidates.
