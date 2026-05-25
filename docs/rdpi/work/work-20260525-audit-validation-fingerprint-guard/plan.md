# Plan: Audit Validation Fingerprint Guard

Task: `work-20260525-audit-validation-fingerprint-guard`

## Preconditions

- Preflight: `codex-ensure-rdpi.py` returned `STATUS: ready`.
- Flow audit: `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- No local service, browser, or e2e validation will be run.
- Implementation waits for independent `PLAN PASS`.

## Implementation Steps

1. Extend `AuditReportValidationResult` in `packages/shared/src/auditReportValidator.ts` with `issueCodes`, `blockingIssues`, `repairMode`, and `validationFingerprint`.
2. Add helper functions for stable issue ordering, repair-mode selection, and fingerprint construction. Export types if needed by callers.
3. Update `formatAuditReportValidationResult(...)` in `packages/runtime/src/adapters/qwenLocalAgent/tools.ts` so `validate_audit_report` failures expose the fingerprint payload and deterministic repair mode.
4. Add a runtime attempt-local fingerprint tracker in `packages/runtime/src/adapters/qwenLocalAgent/api.ts`. Repeated failed `validate_audit_report` fingerprints stop generic repair and return deterministic route text before another model turn.
5. Update implementer/reviewer validation-details payloads to persist the fingerprint metadata and prefer `validation.issueCodes` / `validation.repairMode` where available.
6. Add tests:
   - shared validator fingerprint is stable under issue ordering and changes when blocking issues change;
   - runtime repeated same fingerprint stops generic repair;
   - runtime changed fingerprint after repair continues;
   - runtime max validation pass exhaustion remains deterministic;
   - runtime `manual_review_required` repeated-fingerprint route stops generic repair and surfaces route/fingerprint metadata;
   - agent source-inconclusive and operator-input routes retain correct status details;
   - agent manual-review-required route remains fail-closed without generic retry after an identical blocking fingerprint;
   - deterministic repair path records the new fingerprint metadata.
7. Run focused tests, then lint and build.

## Verification Commands

- `npm.cmd test --workspace=@aif/shared -- auditReportValidator`
- `npm.cmd test --workspace=@aif/runtime -- qwenLocalAgent`
- `npm.cmd test --workspace=@aif/agent -- implementer reviewer`
- `npm.cmd run lint`
- `npm.cmd run build`

## Review Gates

- Independent `PLAN PASS` before code edits.
- Independent `TEST PASS` after verification.
- Independent `REVIEW PASS` before close-out.
