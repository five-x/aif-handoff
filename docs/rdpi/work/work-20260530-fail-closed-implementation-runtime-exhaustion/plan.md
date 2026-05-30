# Plan

## Scope

Implement the selected intake card only:

- `docs/intake/work/work-20260530-fail-closed-implementation-runtime-exhaustion.md`

Do not run or create child follow-up tasks. Do not change provider capacity or runtime profile defaults.

## Steps

1. Update `packages/agent/src/stageErrorHandler.ts`.
   - Add a stable blocked reason prefix: `implementation_runtime_exhausted_requires_split`.
   - Detect implementer runtime exhaustion from `RuntimeExecutionError` category/status.
   - Export a predicate/recovery helper so coordinator can apply the same decision before fallback handlers run.
   - Return `blocked_external` with `retryAfter: null`, `retryAfterSource: "none"`, and unchanged `retryCount`.
   - Keep limit snapshot preservation behavior behind `AIF_USAGE_LIMITS_ENABLED`.

2. Update `packages/agent/src/coordinator.ts`.
   - Before automatic context/fallback recovery hooks, detect implementation runtime exhaustion.
   - Apply the fail-closed recovery directly and return.
   - Clear implementation-stage context fallback data so the next poll cannot reuse a larger fallback profile automatically.
   - Leave existing repository-inspection budget handling in place for audit artifact terminalization.

3. Update Qwen max-tool-turn metadata in `packages/runtime/src/adapters/qwenLocalAgent/api.ts`.
   - Attach structured provider metadata for `max_tool_turns_exhausted`.
   - Keep the public error category as `timeout`.

4. Update parent rollup messaging in `packages/data/src/index.ts`.
   - Derive the hierarchy rollup reason from blocked children.
   - Special-case the implementation exhaustion family.
   - Upgrade stale generic hierarchy rollup reasons to the family-specific reason.
   - Preserve unrelated/manual parent blockers.
   - Preserve the generic fallback for other blocked child reasons.

5. Add tests.
   - `packages/agent/src/__tests__/stageErrorHandler.test.ts`: implementer timeout, max tool turns, and runtime-budget status are fail-closed with no retry window and unchanged retry count.
   - `packages/agent/src/__tests__/coordinator.test.ts`: implementer timeout persists blocked fields without automatic retry semantics, even when automatic fallback is enabled and a compatible fallback profile exists. Assert no `contextFallback` remains and a second poll does not call the implementer again.
   - `packages/data/src/__tests__/index.test.ts`: parent rollup shows the implementation exhaustion family and upgrades a stale generic rollup reason.
   - `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`: max-tool-turn exhaustion has structured provider metadata if the local test harness exposes it cleanly.

6. Verify.
   - Run focused tests first for changed packages.
   - Run `npm.cmd run format:check`.
   - Run `npm.cmd run lint`.
   - Run `npm.cmd test`.
   - Run `npm.cmd run build`.

## Gate Requirements

- Independent `PLAN PASS` before implementation.
- Independent `TEST PASS` after verification.
- Independent `REVIEW PASS` before close-out.

## Close-Out

- Write `docs/rdpi/work/work-20260530-fail-closed-implementation-runtime-exhaustion/result.md`.
- Prepare local memory-review artifacts through the repo's memory sync workflow if available.
- Mark only this task entry `done` in `docs/intake/work_status.json` after gates pass.
