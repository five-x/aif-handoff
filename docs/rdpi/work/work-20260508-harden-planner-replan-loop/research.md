<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Research

## Task framing and lane

- Task: `work-20260508-harden-planner-replan-loop`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260508-harden-planner-replan-loop.md`
- RDPI path: `docs/rdpi/work/work-20260508-harden-planner-replan-loop`
- The card asks to harden planning so weak local/OpenAI-compatible runtime output cannot advance into implementation, and invalid plans get bounded replanning feedback before fail-closed blocking.

## Accepted planning sources

- Immutable task intent: `docs/intake/work/work-20260508-harden-planner-replan-loop.md`
- Global and project guidance from `AGENTS.md` in the user-provided thread context.
- Local source files inspected:
  - `packages/agent/src/subagents/planner.ts`
  - `packages/agent/src/subagents/planChecker.ts`
  - `packages/runtime/src/promptPolicy.ts`
  - `packages/runtime/src/workflowSpec.ts`
  - `packages/runtime/src/types.ts`
  - `packages/agent/src/coordinator.ts`
  - `packages/agent/src/stageErrorHandler.ts`
  - `packages/shared/src/taskCompletionEvidence.ts`
  - `packages/shared/src/types.ts`
  - `packages/shared/src/schema.ts`
  - `packages/api/src/services/taskEvents.ts`
  - `packages/shared/src/stateMachine.ts`
- Nearby tests inspected:
  - `packages/runtime/src/__tests__/workflowSpec.test.ts`
  - `packages/agent/src/__tests__/planner.test.ts`
  - `packages/agent/src/__tests__/planChecker.test.ts`
  - `packages/agent/src/__tests__/coordinator.test.ts`
  - `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
- No runtime-visible evidence, service checks, scheduler reads, logs, endpoint probes, or shared-memory recall were used before `PLAN PASS`.

## Local findings

- `planner.ts` builds a natural-language planner prompt in subagent mode, but its workflow still declares `fallbackSlashCommand: "/aif-plan ..."` and `fallbackStrategy: "slash_command"` when `useSubagents` is true. That lets runtimes without agent-definition support receive a slash fallback they may only echo.
- `promptPolicy.ts` currently prepends the fallback slash command whenever the runtime lacks agent definitions and the workflow wants slash fallback. It has no separate capability for AIF skill/slash command execution.
- `promptPolicy.ts` also has no no-think/final-answer append for structured planning stages. Current behavior only resolves fallback, agent definition name, and `systemPromptAppend`.
- `planChecker.ts` validates checklist shape, can locally convert mixed plain bullets to checkboxes, and falls back to LLM correction. If both LLM output and local fallback are non-plan-like, it keeps the existing plan instead of signaling a planner-quality failure.
- `coordinator.ts` runs `planning -> planner -> plan_ready`, then `plan_ready -> plan-checker -> plan_ready`, then implementation/review. The plan-checker stage is the narrow place to block implementation without changing the pipeline shape.
- `coordinator.ts` already has `retryCount`, `blockedReason`, `blockedFromStatus`, and `retryAfter` status fields available. No new database field is needed for bounded plan-quality retry.
- `stageErrorHandler.ts` classifies external runtime failures to `blocked_external`, fast stream failures to retry-in-place, and generic errors to status revert. Plan-quality failures need a separate semantic path because they are not runtime failures.
- `taskCompletionEvidence.ts` already detects some generic terminal evidence cases, including slash fallback echo, `</think>`, `docs:false`, `tests:false`, and risky audit/review/discovery tasks. That guard runs too late for this task's goal, because implementation can be reached before the terminal evidence guard.

## Same-project memory

- Same-project curated memory was not queried before `PLAN PASS` because local task files and source were sufficient for planning, and RDPI pre-plan boundaries prohibit memory/runtime probing unless explicitly waived.

## Cross-project reusable patterns

- The task should reuse the repository's existing fail-closed pattern: deterministic guard returns structured categories, coordinator persists a concise operator-facing reason, and retries are bounded with existing task fields.

## Rejected or stale memory candidates

- None. No memory evidence was queried or evaluated.

## Open questions

- Exact retry limit is not specified by the task card. Use a small local constant unless an existing environment value is discovered during implementation.
- "Missing task-specific artifact path" can be over-broad if applied to every plan. Narrow interpretation: when the task card names repository paths or when the task is diagnostic and must produce a report artifact, the plan must retain those path/report constraints.

## Hypotheses

- A pure `@aif/shared` plan-quality evaluator can cover placeholder/generic/slash echo/thinking artifacts and diagnostic report constraints without adding a migration.
- The plan-checker stage can throw a typed plan-quality error; the coordinator can catch that type and requeue to `planning` with feedback until the retry limit is reached.
- Adding a runtime capability for AIF skill command support lets future runtimes opt into slash fallback without assuming local/OpenAI-compatible runtimes can execute AIF slash skills.
