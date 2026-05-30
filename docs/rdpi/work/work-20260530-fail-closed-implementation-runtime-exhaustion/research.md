# Research

## Task

- Task ID: `work-20260530-fail-closed-implementation-runtime-exhaustion`
- Intake card: `docs/intake/work/work-20260530-fail-closed-implementation-runtime-exhaustion.md`
- RDPI needed: yes
- Scope: prevent implementation-stage runtime timeout, max-tool-turn exhaustion, runtime budget exhaustion, and equivalent runtime/provider limits from scheduling automatic same-scope retry.

## Local Facts

- `packages/agent/src/stageErrorHandler.ts` owns coordinator stage error classification. It receives `stageLabel`, `sourceStatus`, current `retryCount`, and the thrown error, then returns either `fast_retry` or `blocked_external` recovery fields.
- Current external runtime failures use `resolveRetryAfter()` and `buildUserSafeExternalReason()`. For `RuntimeExecutionError` category `timeout`, the user-safe reason is `Runtime request timed out. Task will retry automatically.`, `retryAfter` is set by structured reset metadata or deterministic backoff, and `retryCount` increments.
- `packages/agent/src/coordinator.ts` applies `blocked_external` recovery by setting `blockedFromStatus` to the in-progress stage, using the recovery `blockedReason`, `retryAfter`, and `retryCount`.
- Qwen local max-tool-turn exhaustion is currently thrown from `packages/runtime/src/adapters/qwenLocalAgent/api.ts` as `RuntimeExecutionError(..., "timeout")`. Repository-inspection budget exhaustion has structured `providerMeta.status = "repository_inspection_budget_exhausted"` and is already treated specially by `stageErrorHandler` as no-retry manual blocked.
- Coordinator pre-start runtime budget exhaustion in `appendRuntimeBudgetActivity()` already blocks with `retryAfter: null` and preserves `retryCount`, but post-start implementer timeouts still use automatic retry semantics.
- Coordinator error handling invokes runtime recovery hooks before `classifyStageError()`: repository-inspection budget handling, context-length recovery, audit report timeout recovery, transient runtime fallback recovery, and audit report transient recovery. Any implementation-exhaustion fix must either run before these hooks or make these hooks explicitly decline implementation runtime exhaustion, otherwise automatic fallback can still schedule another implementer attempt.
- Parent hierarchy rollup is in `packages/data/src/index.ts`. `refreshParentRollup()` currently sets a generic parent reason, `hierarchy_rollup: child task is blocked`, only when the parent has no existing blocker.
- UI/API task surfaces already expose `blockedReason`, `blockedFromStatus`, `retryAfter`, and `retryCount`. `TaskCard` also derives a blocker family from the prefix before `:`, so a stable `implementation_runtime_exhausted_requires_split` prefix will be visible without new UI plumbing.

## Constraints

- Do not expose raw provider diagnostics in persisted blocker text.
- Preserve existing transient retry/backoff behavior outside implementation exhaustion.
- Preserve existing repository-inspection budget no-retry handling and runtime capability/auth/permission behavior.
- Avoid changing runtime provider configuration, model selection, or Qwen capacity.
- Do not execute follow-up split/recovery tasks as part of this task.

## Hypothesis

The safest implementation is a shared coordinator-side predicate plus fail-closed recovery builder used before any automatic fallback hook and inside `classifyStageError()`. It should trigger only for implementation stage runtime exhaustion, preserve the current retry count, leave `retryAfter` null, and persist a stable blocked reason with a sanitized category/status. A small structured metadata addition for Qwen max-tool-turn exhaustion can make the classification deterministic for new failures while tests still cover generic timeout and runtime-budget statuses.

## Planned Evidence

- Unit tests in `packages/agent/src/__tests__/stageErrorHandler.test.ts` for implementer timeout, max tool turns, and runtime-budget exhaustion.
- Coordinator integration tests in `packages/agent/src/__tests__/coordinator.test.ts` proving an implementer timeout persists `retryAfter = null`, preserves retry count, clears/avoids `contextFallback`, bypasses automatic fallback even when `AIF_RUNTIME_AUTO_FALLBACK_ENABLED` and a fallback profile are available, and does not dispatch a second implementer run on the next poll.
- Data-layer hierarchy tests in `packages/data/src/__tests__/index.test.ts` proving parent rollup includes the child blocked reason family for implementation runtime exhaustion and upgrades stale generic hierarchy rollup reasons while preserving unrelated/manual parent blockers.
- Runtime adapter test or assertion proving Qwen max-tool-turn errors carry structured provider status.
- Verification commands: `npm.cmd run format:check`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`.
