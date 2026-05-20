# Plan

## Acceptance criteria

- Auth and permission runtime failures block with no automatic retry and sanitized `operator_input_required:` action.
- Concrete review-time missing operator data/access/config is represented as `operator_input_required:`.
- Manual review remains for human judgment, unsafe auto-closure, malformed contracts, policy/security-sensitive ambiguity, max-iteration exhaustion, and stalled/no-progress loops.
- Unknown stage errors persist a sanitized blocked reason and retry counter instead of silently returning to an in-progress state.
- Fallback retry scheduling is deterministic by attempt count.
- Operator-input retry from blocked still requires a newer human answer comment.
- Tests cover the behavior above.

## Steps

1. Update deterministic backoff.
   - Modify `packages/agent/src/taskWatchdog.ts` to replace random backoff with deterministic attempt-based backoff.
   - Update imports/callers in `packages/agent/src/stageErrorHandler.ts` and `packages/agent/src/coordinator.ts`.
   - Rename retry source strings from `random_backoff` to `deterministic_backoff` where applicable.

2. Update stage error classification.
   - Add auth/permission handling before generic external retry handling in `packages/agent/src/stageErrorHandler.ts`.
   - Replace unknown `revert` output with a blocked external recovery carrying a sanitized stage failure reason and incremented retry count.
   - Keep branch isolation, runtime capability failures, and existing non-retryable model/context/content behavior fail-closed with no auto retry.

3. Update review operator-input handling.
   - Update `packages/agent/src/subagents/reviewer.ts` instructions.
   - Extend `packages/agent/src/reviewGate.ts` and `packages/agent/src/autoReviewHandler.ts` so blocking findings beginning with `operator_input_required:` return an operator-input outcome.
   - Add a narrow normalization rule for concrete but unprefixed review findings: if the finding asks for a specific operator-provided data item, access grant, config value/profile choice, or decision text, convert it to an `operator_input_required:` outcome. Do not normalize malformed output, security/policy-sensitive ambiguity, or judgment-dependent ambiguity.
   - Update `packages/agent/src/coordinator.ts` to persist that outcome as `blocked_external` with `manualReviewRequired: false`, `retryAfter: null`, and sanitized diagnostics.
   - Apply existing redaction utilities before persisting blocked reason, `autoReviewState`, activity text, or any review-derived diagnostic text that can be exposed through API/UI.

4. Update tests.
   - Adjust and add tests in:
     - `packages/agent/src/__tests__/stageErrorHandler.test.ts`
     - `packages/agent/src/__tests__/taskWatchdog.test.ts`
     - `packages/agent/src/__tests__/coordinator.test.ts`
     - `packages/agent/src/__tests__/reviewGate.test.ts`
     - `packages/agent/src/__tests__/autoReviewHandler.test.ts` if the outcome contract needs direct coverage
     - `packages/api/src/__tests__/tasks.test.ts` for existing operator-input freshness coverage
   - Update assertions that currently expect random backoff or permission retryAfter.
   - Add review/operator-input tests that:
     - convert an explicit `operator_input_required:` finding to an operator-input hold;
     - convert concrete unprefixed missing operator input to an operator-input hold;
     - keep policy/security-sensitive ambiguity as manual review;
     - prove secret-like values from review output are absent from blocked reason, `autoReviewState`, activity text, and API response JSON.

5. Run targeted verification.
   - `npm.cmd test --workspace=@aif/agent -- src/__tests__/stageErrorHandler.test.ts src/__tests__/taskWatchdog.test.ts src/__tests__/reviewGate.test.ts src/__tests__/autoReviewHandler.test.ts src/__tests__/coordinator.test.ts`
   - `npm.cmd test --workspace=@aif/api -- src/__tests__/tasks.test.ts`
   - If targeted checks pass, run `npm.cmd test` and `npm.cmd run build`.

## Gate plan

- Run independent plan review before implementation.
- After implementation, run independent tester verification.
- After `TEST PASS`, run independent final review.
- If any gate fails, revise and rerun the invalidated gate.
