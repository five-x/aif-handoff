# Typed Structured Review Errors Plan

## Plan

1. Add typed parse result types and helpers in `packages/agent/src/reviewContract.ts`.
2. Replace internal null-only parser branches with typed issue collection for:
   - canonical structured comments;
   - specialized reviewer output;
   - security coverage rows;
   - previous finding coverage when previous findings are supplied.
3. Preserve existing nullable exports as wrappers around typed result APIs.
4. Update `packages/agent/src/reviewGate.ts` to call `parseStructuredReviewCommentsResult` for structured-looking comments.
5. Add parse-error finding construction in the gate with stable fingerprint-derived ID and repair instructions.
6. Route first parse-error fingerprint to `request_changes`.
7. Route repeated same parse-error fingerprint to `manual_review_required` with `malformed_structured_review_contract`.
8. Keep legacy fallback behavior only for non-structured comments.
9. Add or update tests:
   - typed parser returns issue codes and fingerprint for missing Security Coverage;
   - typed parser returns duplicate-row/area issue code;
   - typed parser returns missing Previous Findings coverage issue code;
   - specialized typed parser returns missing verdict issue code;
   - specialized typed parser returns PASS-with-blockers issue code;
   - specialized typed parser returns PASS-without-concrete-evidence issue code;
   - gate returns rework for first malformed structured parse fingerprint;
   - gate returns manual review for repeated same fingerprint.
10. Run focused verification, then broader repository verification as feasible:

- `npm.cmd test --workspace=@aif/agent -- reviewer`
- `npm.cmd test --workspace=@aif/shared -- review`
- `npm.cmd run lint`
- `npm.cmd run build`

## Acceptance Criteria

- Structured review parsing exposes typed success or typed parse-error results.
- Parse errors include stable issue codes and deterministic fingerprints.
- Malformed structured review output never routes to success.
- First malformed structured output returns exact repair instructions in a rework result.
- Repeated same parse fingerprint routes to manual review instead of another generic retry.
- Required malformed cases are covered by tests.

## Evidence Plan

- Unit-test output for parser issue-code tests.
- Unit-test output for review gate first/repeated malformed routing.
- Lint and build output, unless blocked by unrelated existing failures.

## Independent Gates

- Before implementation: independent reviewer must return `PLAN PASS` or `PLAN FAIL`.
- After implementation: independent tester must return `TEST PASS` or `TEST FAIL`.
- After tester pass: independent final reviewer must return `REVIEW PASS` or `REVIEW FAIL`.

## Stop Conditions

- Stop without implementation if the independent plan reviewer returns `PLAN FAIL`.
- Stop without marking intake done if mandatory subagent gates are unavailable.
- Stop and report if verification exposes failures that cannot be fixed within the selected task scope.
