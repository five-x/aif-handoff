# Design

## Behavior Contract

Implementation-stage runtime exhaustion must fail closed:

- status: `blocked_external`
- `blockedFromStatus`: the active implementation stage (`implementing`)
- `blockedReason`: starts with `implementation_runtime_exhausted_requires_split:`
- `retryAfter`: `null`
- `retryCount`: unchanged from the task's prior value
- runtime limit snapshot: preserved only when the existing usage-limit feature would preserve it

This blocked state requires an operator split, continuation package, or explicit supported recovery path. It must not advertise automatic retry and must not set a retry window.

## Classification

Add exported helpers in `packages/agent/src/stageErrorHandler.ts` that recognize implementation runtime exhaustion and build the fail-closed recovery:

- `category === "timeout"` for implementer stage
- `providerMeta.status` in a narrow set such as `max_tool_turns_exhausted`, `runtime_budget_exhausted`, or `repository_inspection_budget_exhausted`
- existing repository-inspection budget exhaustion helper remains authoritative

For implementer `timeout`, use a sanitized status/category string in the reason. Raw error messages stay in redacted logs only.

## Coordinator Fallback Ordering

Update `packages/agent/src/coordinator.ts` so implementation runtime exhaustion is handled before automatic runtime recovery hooks:

- Before `handleContextLengthRecovery()`, `handleAuditReportTimeoutRecovery()`, `handleTransientRuntimeFallbackRecovery()`, and `handleAuditReportTransientRecovery()`, check the shared implementation-exhaustion predicate.
- If it matches, clear any task context-fallback runtime option for the implementation stage, apply the fail-closed `blocked_external` fields, preserve/clear runtime limit snapshot according to the recovery output, flush activity, and return.
- This early branch prevents immediate same-scope fallback retries when `AIF_RUNTIME_AUTO_FALLBACK_ENABLED` and a larger compatible profile are available.
- Repository-inspection budget handling can keep its existing more specific audit artifact terminalization path; generic implementation exhaustion should not reach later automatic fallback hooks.

## Runtime Metadata

Update Qwen local max-tool-turn exhaustion in `packages/runtime/src/adapters/qwenLocalAgent/api.ts` to include:

- `providerMeta.status = "max_tool_turns_exhausted"`
- `providerMeta.category = "timeout"`

Repository-inspection budget variants keep their existing structured status.

## Parent Rollup

Update `refreshParentRollup()` in `packages/data/src/index.ts` to derive a parent rollup reason from a blocked child:

- If a child is blocked by `implementation_runtime_exhausted_requires_split:*`, parent reason becomes `hierarchy_rollup: child blocked by implementation_runtime_exhausted_requires_split`.
- Otherwise keep the generic `hierarchy_rollup: child task is blocked`.
- Replace a stale generic hierarchy rollup reason with the new implementation-exhaustion-specific reason when the child blocker changes.
- Do not overwrite unrelated/manual parent blockers.

This keeps the parent message clear without storing raw child details or changing the API schema.

## Tests

- Extend stage error handler tests to assert fail-closed output for implementer timeout, max tool turns, and runtime-budget status.
- Preserve planner/reviewer/external backoff tests so transient non-implementation behavior remains unchanged.
- Add/adjust coordinator tests for persisted task fields after implementer timeout, including fallback-enabled scenarios where a fallback profile exists.
- Add data hierarchy rollup tests for the parent blocked reason and generic-to-specific rollup upgrade.
- Add or update runtime adapter test for Qwen max-tool-turn provider metadata if practical within existing test patterns.
