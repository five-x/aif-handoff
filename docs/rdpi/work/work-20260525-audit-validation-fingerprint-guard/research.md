# Research: Audit Validation Fingerprint Guard

Task: `work-20260525-audit-validation-fingerprint-guard`

## Intake Summary

Replace audit validation loop protection that depends on repeated tool-call counts with a validator issue fingerprint. Validator failures must expose stable issue codes, blocking issue details, repair mode, and a validation fingerprint so repeated identical failures stop generic repair and route deterministically.

## Local Findings

- `packages/shared/src/auditReportValidator.ts` already returns stable typed issue codes through `AuditReportValidationIssue.code`, but `AuditReportValidationResult` does not expose a canonical `issueCodes`, `blockingIssues`, `repairMode`, or `validationFingerprint` field.
- `packages/runtime/src/adapters/qwenLocalAgent/tools.ts` formats `validate_audit_report` failures for the model with source classification, manifest status, sorted issue codes, repair directives, and issue lines. It does not surface a semantic validation fingerprint in the tool payload.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts` currently suppresses repeated identical tool calls with `buildToolCallSignature(...)`, `repeatedToolCallLimitForTool(...)`, and `repeatedToolCallResult(...)`. For audit workflows, `validate_audit_report` and `finalize_audit_report_manifest` have a lower repeat limit, but the guard is still tool-signature/count based.
- `packages/agent/src/subagents/implementer.ts` detects repeated audit tool loops by parsing implementation text for `Stopped after a repeated ... tool-call loop`, then decides whether deterministic repair should run based on the current validator issue codes. This is downstream of the generic tool-loop text.
- `packages/agent/src/subagents/reviewer.ts` builds deterministic audit report review comments from `validateAuditReportArtifact(...)`; adding validator fingerprint fields lets deterministic review comments and auto-review state carry the same stable failure identity.
- Existing tests already cover deterministic repair, terminal source-inconclusive, operator-input routing, max review iterations, repeated review blockers, and runtime repeated tool-call suppression. New coverage should focus on the semantic fingerprint guard and payload shape rather than re-testing all existing audit flows.

## Constraints

- No local AIF service, local browser, or local e2e validation.
- Do not weaken audit validator requirements or convert failed validation into success.
- Do not use generic LLM retries after the same blocking validation fingerprint repeats.
- Before implementation, use an independent plan review gate.

## Hypotheses

- H1: A fingerprint built from validator kind, repair mode, source classification, manifest status, sorted issue codes, and stable blocking issue descriptors is enough to detect unchanged failures without depending on repeated tool-call counts.
- H2: The runtime adapter can track `validate_audit_report` failure fingerprints within one execution attempt. If the fingerprint repeats, it can return a deterministic terminal result before another generic model turn.
- H3: Deterministic routing can remain additive: source-inconclusive and operator-input outcomes stay in implementer/coordinator paths, bounded deterministic repair stays where current repair logic already exists, and repeated unchanged validator failures stop generic repair in the runtime.

## Evidence Plan

- Unit tests in `@aif/shared` for fingerprint stability and stable ordering.
- Runtime adapter tests for repeated same fingerprint stop, changed fingerprint after repair continues, and max pass exhaustion behavior.
- Agent tests for deterministic routing visibility: source-inconclusive, operator-input, and deterministic repair payload propagation.
- Verification commands:
  - `npm.cmd test --workspace=@aif/shared -- auditReportValidator`
  - `npm.cmd test --workspace=@aif/runtime -- qwenLocalAgent`
  - `npm.cmd test --workspace=@aif/agent -- implementer reviewer`
  - `npm.cmd run lint`
  - `npm.cmd run build`
