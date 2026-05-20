# Result

## Outcome

Completed.

The runtime retry and review handoff paths now separate automatic retry from operator input:

- Auth and permission runtime failures become sanitized `operator_input_required:` external blocks with no `retryAfter`.
- Unknown stage errors become `blocked_external` with a sanitized operator-action reason and incremented retry count.
- Fallback retry scheduling is deterministic by attempt count.
- Review output can become `operator_input_required:` only when all current blockers are concrete operator-input requests.
- Mixed operator-input and code/test blockers remain `request_changes` and preserve every blocker.
- Review-derived persisted diagnostics are redacted before task/API/UI-visible storage.
- Existing operator-input retry freshness behavior still requires a newer human answer comment.

The required full-test gate exposed an existing audit-roadmap fallback contract mismatch. The deterministic fallback now emits specific/falsifiable risk hypotheses and chooses package source roots before weak metadata-only scopes, so the suite can validate the task changes without weakening the audit validator.

## Files Changed

- `packages/agent/src/stageErrorHandler.ts`
- `packages/agent/src/taskWatchdog.ts`
- `packages/agent/src/coordinator.ts`
- `packages/agent/src/reviewGate.ts`
- `packages/agent/src/autoReviewHandler.ts`
- `packages/agent/src/subagents/reviewer.ts`
- `packages/agent/src/__tests__/stageErrorHandler.test.ts`
- `packages/agent/src/__tests__/taskWatchdog.test.ts`
- `packages/agent/src/__tests__/reviewGate.test.ts`
- `packages/agent/src/__tests__/coordinator.test.ts`
- `packages/api/src/__tests__/tasks.test.ts`
- `packages/api/src/services/roadmapGeneration.ts`

## Gates

- PLAN PASS: independent plan review passed after one revision.
- TEST PASS: independent tester reran `git diff --check`, targeted agent tests, targeted API tests, `npm.cmd run build`, and full `npm.cmd test`; all passed.
- REVIEW PASS: independent final reviewer passed after the mixed-blocker operator-input issue was fixed.
- Memory sync: `skipped` auto-publish because there were no publishable curated documents; local memory review artifacts were generated.

## Verification

- `git diff --check`
- `npm.cmd test --workspace=@aif/agent -- src/__tests__/stageErrorHandler.test.ts src/__tests__/taskWatchdog.test.ts src/__tests__/reviewGate.test.ts src/__tests__/autoReviewHandler.test.ts src/__tests__/coordinator.test.ts`
- `npm.cmd test --workspace=@aif/api -- src/__tests__/tasks.test.ts src/__tests__/roadmapGeneration.test.ts src/__tests__/planBRegression.test.ts`
- `npm.cmd run build`
- `npm.cmd test`

## Follow-up

No follow-up task was created.
