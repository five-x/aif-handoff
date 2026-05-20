# Research

## Task framing and lane

- Lane: work.
- Task id: `work-20260520-systemic-blocker-recovery-hardening`.
- User problem: task cards still fall into `blocked_external` repeatedly. The requested fix is systemic: prevent future known blocker classes from becoming dead-end blocks, while still failing closed when acceptance evidence is weak or missing.
- Target behavior: weak/missing/inconclusive work must not close green. It must route to deterministic rework when the system can act, to `operator_input_required` when external facts/access/scope are needed, or to bounded runtime retry/fallback when infrastructure/model capacity fails.

## Accepted planning sources or local facts

- `AGENTS.md` says non-trivial work follows RDPI and local repo facts outrank memory.
- `docs/rdpi/work/work-20260519-systemic-task-lifecycle-review/design.md` defines the lifecycle contract: success requires OTZ/acceptance evidence, implementation/report evidence, verification evidence, and trusted audit/report artifacts when relevant. Weak/inconclusive report output should become rework if repairable or operator input if missing context is needed.
- `docs/rdpi/work/work-20260519-normalize-operator-input-runtime-retry/plan.md` previously fixed auth/permission operator-input routing and deterministic backoff, but intentionally kept context length as fail-closed manual.
- `packages/agent/src/stageErrorHandler.ts` classifies `context_length` as non-retryable and returns `blocked_external` with no `retryAfter`.
- `packages/agent/src/coordinator.ts` uses one stage semaphore keyed by stage, not by runtime profile/endpoint, so a parallel project can run multiple tasks against the same local runtime profile.
- `packages/agent/src/coordinator.ts` allows proactive runtime fallback for stages where `shouldBlockOnRuntimeLimit` is false, but implementer/audit/synthesis are hard-blocked by runtime gates.
- `packages/agent/src/subagents/implementer.ts` has a fixed 26k estimated input-token budget for implementer prompts, but context overflow can still occur after runtime system/tool/schema overhead.
- `packages/agent/src/subagents/implementer.ts` terminalizes first-run audit report cards with non-repairable declared scope before runtime prompt construction.
- `packages/agent/src/subagents/implementer.ts` currently treats scope files with no non-empty line evidence, such as empty package marker files, as having no readable evidence.
- `packages/agent/src/coordinator.ts` uses `blocked_external` for runtime backoff, manual review, operator-input, terminal audit inconclusive, and source/synthesis inconclusive states, so scheduler/UI recovery semantics are overloaded.

## Independent explorer findings

- Explorer confirmed generated audit source cards can terminalize before runtime on unreadable declared scope; key points include `implementer.ts` scope parsing, file evidence collection, and pre-runtime terminalization.
- Explorer confirmed context overflow is fail-closed with no automatic shrink/retry/fallback path; `stageErrorHandler.test.ts` locks the manual behavior.
- Explorer confirmed runtime profile/resource gates fallback for planner but hard-block implementer/audit/synthesis.
- Explorer identified the semantic risk: `blocked_external` is used for both operator/config action and terminal audit inconclusive outcomes.
- Explorer recommended making empty/low-signal scope paths repairable through representative evidence or explicit normalization.

## Same-project memory

- Not used before plan. Local RDPI/code facts were sufficient and outrank memory for this repo-specific change.

## Cross-project reusable patterns

- Not used before plan. The failure modes are local to AIF coordinator/runtime/audit paths.

## Rejected or stale memory candidates

- Older runtime profile names/model assumptions are stale relative to the current operator-stated topology: 4090 endpoint for fast code, MI50 endpoint for planning/review/heavy/long-context work.

## Failure classes to address

1. Runtime context overflow:
   - Current behavior: immediate manual `blocked_external`.
   - Desired behavior: bounded recovery by switching to a larger compatible profile when available, or scheduling a non-manual retry after prompt/session recovery metadata is applied.

2. Runtime endpoint contention:
   - Current behavior: global/stage concurrency can run multiple cards against the same local model endpoint.
   - Desired behavior: per-runtime-profile concurrency cap, defaulting local Qwen profiles to serial unless profile options explicitly raise the cap.

3. Generated audit report scope fragility:
   - Current behavior: empty/low-signal but existing scope files can be treated as non-repairable and terminalized.
   - Desired behavior: normalize scope evidence deterministically; if no evidence can be recovered, ask the operator for concrete scope instead of generic manual review.

4. Inconclusive audit/synthesis routing:
   - Current behavior: weak/invalid source reports can block synthesis with generic inconclusive reasons.
   - Desired behavior: do not close green; route to rework when local repair can act, otherwise `operator_input_required` with the concrete missing input/scope/source decision.

5. UI/API status compatibility:
   - Current behavior: all paths still surface as `blocked_external`.
   - Desired behavior: preserve compatible status, but make `blockedReason`, `manualReviewRequired`, `retryAfter`, `reworkRequested`, artifact state, and activity log unambiguous enough for auto-retry and operator action.
