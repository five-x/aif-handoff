# Design: Audit Validation Fingerprint Guard

Task: `work-20260525-audit-validation-fingerprint-guard`

## Goal

Make audit report validation failures self-identifying and route repeated identical failures deterministically, without relying on repeated tool-call-count text as the primary guard.

## Shared Validator Contract

Add exported validation metadata to `validateAuditReportArtifact(...)`:

- `issueCodes`: sorted unique issue codes.
- `blockingIssues`: stable, sorted list of issue objects with `code`, `message`, and sorted `paths`.
- `repairMode`: deterministic routing hint:
  - `none` when validation passes.
  - `bounded_deterministic_repair` when known strict audit issues can be repaired from the report/ledger path.
  - `source_inconclusive` when the validator classification is source-inconclusive or the failure is not safely repairable as a trusted artifact.
  - `operator_input_required` when the failure indicates missing or invalid declared scope.
  - `manual_review_required` as the fail-closed fallback for failures that should not auto-repair.
- `validationFingerprint`: stable SHA-256-derived fingerprint over validator kind, `repairMode`, `sourceClassification`, `manifestStatus`, `issueCodes`, and normalized blocking issue descriptors.

The fingerprint intentionally excludes artifact/content hashes so that cosmetic rewrites that preserve the same blocking failure do not reset the guard. Fingerprint issue descriptors should prefer stable issue codes and normalized sorted paths/details; user-visible `blockingIssues` may include canonical validator messages, but wording-only message churn should not be the primary fingerprint input.

## Runtime Guard

In `packages/runtime/src/adapters/qwenLocalAgent/tools.ts`, include `repairMode`, `validationFingerprint`, `blockingIssues`, and stable `issueCodes` in `validate_audit_report` output.

In `packages/runtime/src/adapters/qwenLocalAgent/api.ts`, track failed `validate_audit_report` fingerprints during one runtime attempt. On a repeated identical blocking fingerprint:

- stop before another generic model repair turn;
- return deterministic output that names the fingerprint, repair mode, issue codes, and route;
- keep existing repeated tool-call suppression as a fallback for non-semantic loops.

Changed fingerprints after a repair continue through the bounded validation path until the normal tool-turn, budget, or max-pass guards fire.

## Agent Integration

Update implementer/reviewer validation-details builders to persist the new fields under `evidence.auditReportValidation` and top-level validation details where applicable. Keep current deterministic repair/source-inconclusive/operator-input behavior, but let it read `validation.repairMode` and `validation.validationFingerprint` instead of reconstructing intent from text only.

The existing deterministic routes remain:

- source-inconclusive: terminal non-trusted artifact state, no generic retry.
- operator-input-required: blocked external with `operator_input_required:` and `manualReviewRequired=false`.
- manual-review-required: fail-closed auto-review handoff.
- bounded deterministic repair: one deterministic report repair path from existing scoped evidence/ledger.

Repeated blocking fingerprints with `manual_review_required` repair mode must stop generic repair in the same attempt and surface a fail-closed manual route with the repeated fingerprint metadata.

## Scope

Expected edits:

- `packages/shared/src/auditReportValidator.ts`
- `packages/runtime/src/adapters/qwenLocalAgent/tools.ts`
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts`
- `packages/agent/src/subagents/implementer.ts`
- `packages/agent/src/subagents/reviewer.ts`
- Focused tests in shared, runtime, and agent packages.

Out of scope:

- Schema migrations.
- Local service/browser/e2e checks.
- Weakening audit validation requirements.
- Creating or executing follow-up implementation tasks.

## Risks

- Fingerprint inputs must be stable across issue collection order.
- Runtime guard must not stop valid changed-fingerprint repairs prematurely.
- Existing downstream checks that parse issue-code text must continue to work until callers migrate.
