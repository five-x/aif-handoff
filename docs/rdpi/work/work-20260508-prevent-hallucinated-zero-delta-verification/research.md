<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Research

## Task framing and lane

- Task: prevent AIF from letting tasks reach `verified` when the agent output is generic/hallucinated and there is no meaningful code, documentation, report, or persisted artifact delta.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260508-prevent-hallucinated-zero-delta-verification.md`.
- This is an implementation task in `aif-handoff`, not a follow-up task for `botIntevra`.

## Accepted planning sources

- Intake card request and acceptance criteria.
- Local repo instructions in `AGENTS.md`.
- Local source files inspected during research:
  - `packages/agent/src/coordinator.ts`
  - `packages/api/src/services/taskEvents.ts`
  - `packages/shared/src/stateMachine.ts`
  - `packages/agent/src/subagents/planChecker.ts`
  - `packages/agent/src/subagents/implementer.ts`
  - `packages/api/src/services/roadmapGeneration.ts`
  - existing tests under `packages/agent/src/__tests__` and `packages/api/src/__tests__`

## Same-project memory

- Not queried before `PLAN PASS`; local repo facts were sufficient for planning.

## Cross-project reusable patterns

- Use fail-closed gates where agent output cannot prove evidence quality.
- Keep the first implementation narrow and deterministic; do not add another LLM review loop to validate hallucination risk.

## Rejected or stale memory candidates

- None.

## Open questions

- Whether a future override action should let an operator verify a no-delta diagnostic task intentionally. This should not be part of the first production hardening slice unless existing UI flows require it.
- Whether roadmap-generated tasks should keep forcing `skipReview=true`; this task can protect the closure path without changing roadmap import defaults.

## Hypotheses

- `packages/agent/src/coordinator.ts` can move an implementer stage directly to `done` when `skipReview=true` (line 379), so a roadmap task can bypass review entirely.
- The same coordinator file moves review-accepted tasks to `done` after auto-review success (line 462), but there is no deterministic evidence guard before that transition.
- `packages/shared/src/stateMachine.ts` turns `done + approve_done` into `verified` (line 76) without checking task artifacts or repository delta.
- `packages/api/src/services/taskEvents.ts` applies the `approve_done` transition and writes the patch at line 222; this is the API-side point where a manual approval can be blocked before `verified`.
- `packages/api/src/services/roadmapGeneration.ts` forces imported roadmap tasks to `skipReview: true` (line 549), which increases the need for a deterministic completion guard on `skipReview` completion paths.
- `packages/agent/src/subagents/planChecker.ts` can keep an existing bad plan if checker output and local fallback fail (line 167). Generic plan detection should therefore happen before completion, not only during plan checking.
- `packages/agent/src/subagents/implementer.ts` currently logs a warning when checklist items remain incomplete after auto-sync (line 407) but does not block completion by itself.
