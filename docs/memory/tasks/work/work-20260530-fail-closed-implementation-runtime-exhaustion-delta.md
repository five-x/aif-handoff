<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260530-fail-closed-implementation-runtime-exhaustion::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260530-fail-closed-implementation-runtime-exhaustion
source_path: docs/rdpi/work/work-20260530-fail-closed-implementation-runtime-exhaustion
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-29
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260530-fail-closed-implementation-runtime-exhaustion/research.md
- docs/rdpi/work/work-20260530-fail-closed-implementation-runtime-exhaustion/design.md
- docs/rdpi/work/work-20260530-fail-closed-implementation-runtime-exhaustion/plan.md
- docs/rdpi/work/work-20260530-fail-closed-implementation-runtime-exhaustion/result.md
  created_at: 2026-05-29
  last_verified_at: 2026-05-29

---

# Summary

Curated delta for task work-20260530-fail-closed-implementation-runtime-exhaustion.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- `packages/agent/src/stageErrorHandler.ts` owns coordinator stage error classification and now exports implementation runtime exhaustion helpers. For implementer runtime exhaustion it returns `blocked_external` with a reason prefixed by `implementation_runtime_exhausted_requires_split`, `retryAfter: null`, `retryAfterSource: "none"`, and the existing `retryCount`.
- Non-implementation runtime failures still use the existing retry/backoff path through `resolveRetryAfter()` and `buildUserSafeExternalReason()` where that behavior is safe.
- `packages/agent/src/coordinator.ts` applies implementation runtime exhaustion recovery before automatic context-length, audit-timeout, and transient runtime fallback handlers. The branch preserves `blockedFromStatus`, uses the recovery `blockedReason`, clears implementation-stage context fallback state, and keeps the prior `retryCount`.
- Qwen local max-tool-turn exhaustion in `packages/runtime/src/adapters/qwenLocalAgent/api.ts` now throws `RuntimeExecutionError` category `timeout` with structured `providerMeta.status = "max_tool_turns_exhausted"`, `providerMeta.category = "timeout"`, and `maxToolTurns`.
- Coordinator pre-start runtime budget exhaustion in `appendRuntimeBudgetActivity()` and post-start implementer runtime exhaustion both block without retry windows, preserving retry count.
- Coordinator error handling keeps the repository-inspection budget path first, then checks implementation runtime exhaustion before recovery hooks that could otherwise schedule an automatic fallback implementation attempt.
- Parent hierarchy rollup is in `packages/data/src/index.ts`. `refreshParentRollup()` now derives a specific parent reason, `hierarchy_rollup: child blocked by implementation_runtime_exhausted_requires_split`, when a blocked child uses the `implementation_runtime_exhausted_requires_split:` prefix; stale hierarchy rollup reasons are upgraded while unrelated/manual parent blockers are preserved.
- UI/API task surfaces already expose `blockedReason`, `blockedFromStatus`, `retryAfter`, and `retryCount`. `TaskCard` also derives a blocker family from the prefix before `:`, so the stable `implementation_runtime_exhausted_requires_split` prefix is visible without new UI plumbing.

## Decisions

- none

## Patterns

- none
