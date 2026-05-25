# Audit Validation Fingerprint Guard

- Task ID: work-20260525-audit-validation-fingerprint-guard
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-25
- Due: after `work-20260525-typed-structured-review-errors`
- Source: External independent review `operator-supplied external review file aif-independent-code-review-6713a389.md` for commit `6713a389e326cadbeeb5f7c244f491a02ec15c55`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260525-audit-validation-fingerprint-guard`

## Request

Replace tool-call-count-only audit validation loop protection with an issue-fingerprint-based guard. Validator failures must return stable issue codes, blocking issues, repair mode, and a validation fingerprint so repeated identical failures stop generic repair and route deterministically.

## Done When

- Audit validator failure payloads include `validationFingerprint`, stable issue codes, blocking issue list, and repair mode.
- Repeated same fingerprint in the same attempt stops generic repair.
- Deterministic routes exist for source-inconclusive, operator-input-required, manual-review-required, and bounded deterministic repair.
- Tests cover repeated same validator fingerprint, changed fingerprint after repair, max pass exhaustion, source-inconclusive routing, and operator input routing.

## Constraints

- Do not lower validation requirements to avoid repeated failures.
- Do not use generic LLM retries after repeated identical blocking fingerprints.
- Do not run local AIF service, local browser, or local e2e checks. Runtime/e2e verification is remote-only against `192.168.88.67`.
- This intake card does not execute the task.

## Verification Plan

- Unit tests for fingerprint construction and stable ordering.
- Agent orchestration tests for repeat detection and deterministic routing.
- Regression test for malformed or invalid audit report repair loop.
- `npm.cmd test --workspace=@aif/shared -- auditReportValidator`
- `npm.cmd test --workspace=@aif/agent -- implementer reviewer`
- `npm.cmd run lint`
- `npm.cmd run build`
