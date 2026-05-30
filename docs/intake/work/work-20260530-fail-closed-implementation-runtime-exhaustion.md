# Fail Closed On Implementation Runtime Exhaustion

- Task ID: work-20260530-fail-closed-implementation-runtime-exhaustion
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-30
- Source: operator request after repeated `zai-mi.com` implementation blocks and Qwen local implementer timeout/tool-turn exhaustion.
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260530-fail-closed-implementation-runtime-exhaustion

## Request

Prevent implementation-stage runtime exhaustion from returning to the same implementer prompt as an automatic retry.

When an implementer run fails because of timeout, max tool turns, runtime budget exhaustion, or equivalent provider/runtime limit, the task must fail closed into an explicit blocked state that requires split, continuation packaging, or operator action. It must not silently schedule another same-scope retry that reuses the polluted context.

## Problem

The `zai-mi.com` first implementation child reached a blocked state after the local Qwen implementer exceeded the max tool-turn limit. The workflow treated this as a retryable runtime timeout with deterministic backoff, even though the task had already consumed millions of tokens and the next attempt would likely repeat the same broad loop.

## In Scope

- Coordinator handling of implementer runtime timeout, max tool turns, runtime budget exhaustion, and equivalent provider errors.
- Mapping runtime exhaustion into a deterministic blocked status such as `implementation_runtime_exhausted_requires_split`.
- Parent roadmap rollup messaging when a child is blocked by implementation runtime exhaustion.
- Operator-facing status, retry controls, and API response semantics.
- Acceptance tests proving no same-scope retry is scheduled for implementer exhaustion.

## Out Of Scope

- Changing model provider configuration or GPU cluster capacity.
- Rewriting implementation prompts beyond the minimal status/error contract needed for the fail-closed path.
- Recovering the already polluted `zai-mi.com` card.

## Acceptance Criteria

- An implementer timeout or max-tool-turn error blocks the task instead of returning it to automatic same-scope retry.
- The blocked state preserves the previous stage, retry count, and sanitized error category without exposing raw provider diagnostics.
- `retryAfter` is not set for fail-closed implementation exhaustion unless an operator explicitly chooses a supported recovery path.
- Parent roadmap tasks show a clear child-blocked rollup reason.
- Tests cover implementer timeout, max tool turns, and runtime-budget exhaustion routing.

## Done When

- The implementation lifecycle has a deterministic fail-closed branch for exhausted implementer runs.
- Existing transient retry behavior remains available for genuinely transient non-implementation failures where safe.
- `npm run format:check`, `npm run lint`, `npm run test`, and `npm run build` pass or any pre-existing unrelated failures are documented.
