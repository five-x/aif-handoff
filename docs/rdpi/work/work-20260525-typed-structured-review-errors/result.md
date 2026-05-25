# Typed Structured Review Errors Result

## Outcome

Implemented typed structured review parse errors and review-gate routing for malformed structured review output.

Changed files:

- `packages/agent/src/reviewContract.ts`
- `packages/agent/src/reviewGate.ts`
- `packages/agent/src/__tests__/reviewContract.test.ts`
- `packages/agent/src/__tests__/reviewGate.test.ts`

## Implementation Summary

- Added typed parser result APIs with stable issue codes, deterministic fingerprints, and repair instructions.
- Preserved nullable parser wrappers for compatibility with existing reviewer aggregation call sites.
- Added typed parse diagnostics for missing or malformed sections, duplicate section/rows, missing Security Coverage, missing Previous Findings coverage, missing verdicts, PASS-with-blockers, PASS-without-concrete-evidence, and invalid metadata.
- Updated auto review gate handling so first malformed structured review output routes to `request_changes` with exact repair instructions.
- Updated repeated same structured parse fingerprint handling to route to `manual_review_required` with `malformed_structured_review_contract`.
- Preserved fail-closed behavior: malformed structured review output cannot become `success`, and structured-looking malformed output does not fall through to legacy fallback acceptance.
- Fixed final-review finding by requiring `Review Iteration` metadata to match an exact positive integer before parsing, so values such as `1abc` and `1.5` fail closed with `invalid_metadata`.

## Gate Outcomes

- `PLAN PASS`: independent plan review passed. Only low note was to assert a stable duplicate issue code.
- `TEST PASS`: independent tester passed after implementation and again after the final-review remediation.
- `REVIEW FAIL`: first final reviewer found partial numeric `Review Iteration` parsing accepted malformed metadata.
- `REVIEW PASS`: final reviewer rerun passed after exact positive-integer validation and regression tests.

## Verification

Passed:

- `npm.cmd test --workspace=@aif/agent -- reviewContract reviewGate`
  - Final run: 2 files passed, 77 tests passed.
- `npm.cmd test --workspace=@aif/agent -- reviewer`
  - 1 file passed, 18 tests passed.
- `npm.cmd run build --workspace=@aif/agent`
- `npm.cmd run lint --workspace=@aif/agent`
- `npm.cmd run lint`
  - 10/10 turbo tasks successful.
- `npm.cmd run build`
  - 7/7 turbo tasks successful.
- `npm.cmd test --workspace=@aif/shared -- taskCompletionEvidence auditSynthesisClassifier auditContractCorpus`
  - 3 files passed, 192 tests passed.
- `git diff --check -- packages/agent/src/reviewContract.ts packages/agent/src/reviewGate.ts packages/agent/src/__tests__/reviewContract.test.ts packages/agent/src/__tests__/reviewGate.test.ts docs/rdpi/work/work-20260525-typed-structured-review-errors`

Command-level note:

- `npm.cmd test --workspace=@aif/shared -- review` exited with code 1 because no `@aif/shared` test files match the filter `review`. Relevant shared suites were run by concrete names and passed.

Not run, by task constraint:

- Local AIF service
- Local browser
- Local e2e checks
- Runtime endpoint checks

## Memory Sync

`$memsync MODE=auto LANE=work TASK_ID=work-20260525-typed-structured-review-errors` completed local memory review artifact generation.

- Command: `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260525-typed-structured-review-errors --project aif-handoff --entity aif-handoff`
- Report: `docs/memory/reports/work-20260525-typed-structured-review-errors-memsync-report.md`
- Task delta: `docs/memory/tasks/work/work-20260525-typed-structured-review-errors-delta.md`
- Status: `skipped`
- Reason: no publishable curated documents.
