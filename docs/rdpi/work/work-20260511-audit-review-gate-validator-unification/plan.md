# Plan - Review Gate Uses Audit Validator

## Implementation Plan

1. Add a helper in `reviewGate.ts` that evaluates risky report task completion evidence and returns deterministic review-gate findings.
   - Convert `result.evidence.auditReportValidation.issues` directly into blocking findings that preserve validator issue codes/messages.
   - Convert broader completion evidence issues only when no direct audit validator issues are available.
2. Refactor the existing decision builders so deterministic review-gate findings are merged into structured, legacy blocking-section, and model fallback decisions before success can be returned.
3. Keep the existing manual handoff semantics for malformed rework output and `closure_first` new-blocker cases.
4. Add targeted review gate tests:
   - structured advisory-only sidecar comments cannot accept reports rejected for `synthetic_git_output`.
   - structured advisory-only sidecar comments cannot accept reports rejected for `contradictory_findings_and_no_findings`.
   - structured advisory-only sidecar comments cannot accept reports rejected for `missing_scope_coverage`.
   - structured advisory-only sidecar comments cannot accept reports rejected for `governance_observation_as_finding`.
   - each validator-derived blocking finding text includes the original audit validator issue code.
   - legacy blocking-none comments cannot accept a validator-rejected report.
   - fallback `SUCCESS` cannot accept a validator-rejected report.
   - missing implementation or review-stage tool activity cannot pass as a valid risky report when the audit validator itself has no content issue.
   - valid committed report still passes with advisory-only comments.
5. Run targeted tests:
   - `npm.cmd test --workspace=@aif/agent -- src/__tests__/reviewGate.test.ts`
   - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/taskCompletionEvidence.test.ts`
6. Run independent gates:
   - PLAN review gate before code changes.
   - TEST gate after verification commands.
   - REVIEW gate after implementation.

## Evidence Plan

- Use local source/tests only.
- No live service, scheduler, endpoint, worker-report, or shared-memory probing before `PLAN PASS`.
- After implementation, verify test output and inspect `git diff --check`.
