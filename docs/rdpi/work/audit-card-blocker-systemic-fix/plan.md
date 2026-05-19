# Plan: Audit Card Blocker Systemic Fix

## Scope

Implement a systemic fix for audit report cards blocking repeatedly:

- `packages/agent/src/subagents/implementer.ts`
- `packages/agent/src/__tests__/implementer.test.ts`
- `packages/agent/src/taskWatchdog.ts`
- `packages/agent/src/__tests__/taskWatchdog.test.ts`
- `packages/api/src/routes/tasks.ts`
- `packages/api/src/__tests__/tasks.test.ts`
- `packages/shared/src/stateMachine.ts`
- `packages/shared/src/__tests__/stateMachine.test.ts`
- `packages/shared/src/auditRoadmapContract.ts`
- `packages/shared/src/__tests__/auditRoadmapContract.test.ts`

## Steps

1. Remove the audit report retry branch that bypasses deterministic handling and reaches runtime.
2. Add an explicit final guard in the implementer: any task with `expectedAuditReportArtifactPath` must return before generic `executeSubagentQuery`.
3. Allow readable legacy audit source cards to run deterministic audit report repair instead of terminalizing before evidence collection.
4. Preserve the existing terminal source-inconclusive lifecycle: artifact state `source_inconclusive`, task status `blocked_external`, `manualReviewRequired=false` unless an independent manual blocker exists.
5. Preserve retry counts when due blocked tasks are released from backoff.
6. Restrict manual handoff broadcasts to true manual/operator states using the explicit predicate from `design.md`.
7. Reject generic `retry_from_blocked` for manual-review-required blocked tasks.
8. Tighten generated audit card validation for metadata-only/broad roots and generic risk hypotheses.
9. Add regression tests for each changed boundary.

## Required Regressions

- Retried terminal source-inconclusive legacy audit report card does not call runtime.
- Readable legacy audit card is normalized deterministically and returns before runtime.
- Non-readable audit report card remains terminal `blocked_external` with `source_inconclusive` artifact and `manualReviewRequired=false`, without runtime execution.
- No audit report artifact path reaches generic runtime fallback.
- Due blocked release preserves retry count.
- Runtime backoff/Qwen max-tool-turn blocked task does not broadcast manual handoff.
- Operator-input/manual-review/manual-exception/branch-isolation blocked task does broadcast manual handoff.
- Manual-review-required blocked task cannot use generic retry.
- Weak generated audit card with `README.md, AGENTS.md, pyproject.toml, .ai-factory/config.yaml, src` and generic owner-area risk is rejected upstream.

## Verification

Run targeted tests:

- `npm.cmd --workspace packages/agent test -- implementer taskWatchdog`
- `npm.cmd --workspace packages/shared test -- stateMachine auditRoadmapContract`
- `npm.cmd --workspace packages/api test -- tasks`

Then run:

- `npm.cmd run build`
- `npm.cmd run lint`
- `git diff --check`

## Gate

Implementation starts only after an independent reviewer returns `PLAN PASS`.
