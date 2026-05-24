# Plan

Task ID: `work-20260523-audit-evidence-depth-positive-case-review`

## Goal

Determine whether the current audit no-findings evidence-depth gate is too strict for legitimate compact positive evidence while preserving rejection of shallow, generic, inventory-only, path-only, query-only, and reused evidence.

## Steps

1. Obtain independent `PLAN PASS` on `research.md`, `design.md`, and this `plan.md`.
2. After `PLAN PASS`, inspect the current validator and tests:
   - `packages/shared/src/auditReportValidator.ts`
   - `packages/shared/src/auditSourceEvidence.ts`
   - `packages/shared/src/__tests__/auditReportValidator.test.ts`
   - `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts`
   - `packages/agent/src/__tests__/implementer.test.ts`
   - `docs/intake/work/work-20260523-expand-audit-evidence-depth-regression-corpus.md`
3. Enumerate positive no-findings scenarios and expected accepted evidence shapes for:
   - small-file source evidence
   - config-only evidence
   - empty-file evidence
   - narrow scoped roots
   - targeted runtime/test command output
   - ledger-backed compact evidence
4. Construct and run focused diagnostic checks against the current gate for at least one substantive small/config/empty-file scenario, with exact observed `ok`, `sourceClassification`, `substantiveEvidence`, `evidenceDepth.trustedNoFindingsSupported`, and reason codes.
5. Run targeted existing tests that cover audit validator and positive synthesis/implementer behavior.
6. Write `result.md` with:
   - positive-case matrix
   - checked scenarios and observed outcomes
   - false-negative assessment
   - missing regression/corpus attachment decision
   - commands and gate outcomes
7. If a false negative is confirmed, queue a separate implementation card with exact reproduction and desired behavior, plus an empty RDPI scaffold only. Do not execute it.
8. If only missing regression coverage is found, attach the expected scenario to the existing evidence-depth corpus task. Do not execute the corpus task.
9. Run independent tester gate and require `TEST PASS`.
10. Run independent final review gate and require `REVIEW PASS`.
11. Run `$memsync MODE=auto LANE=work TASK_ID=work-20260523-audit-evidence-depth-positive-case-review`.
12. If memsync local review succeeds, update only this task entry in `docs/intake/work_status.json` to `done`, preserving other entries.

## Verification Plan

- Preflight already passed:
  - `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"`
  - `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .`
- Planned commands after `PLAN PASS`:
  - focused one-off `tsx` validator checks for compact positive scenarios
  - `npm.cmd test --workspace=@aif/shared -- auditReportValidator`
  - `npm.cmd test --workspace=@aif/shared -- auditSynthesisClassifier`
  - `npm.cmd test --workspace=@aif/agent -- implementer`
  - `git diff --check`

## Acceptance Criteria

- Positive no-findings scenarios are enumerated with expected accepted evidence shapes.
- At least one substantive compact scenario is checked against the current gate.
- Any false negative has a separate queued implementation card with reproduction and desired behavior.
- Any missing positive regression case is attached to the evidence-depth corpus task.
- Production code remains unchanged.
- Independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` are recorded before close-out.
