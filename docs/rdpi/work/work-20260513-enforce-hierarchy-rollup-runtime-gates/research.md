<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Research

## Task Framing And Lane

- Task: `work-20260513-enforce-hierarchy-rollup-runtime-gates`
- Lane: work
- Intake card: `docs/intake/work/work-20260513-enforce-hierarchy-rollup-runtime-gates.md`
- Scope: runtime execution guards, parent rollup, close-out policy enforcement, and child deletion/attachment guards.
- Depends on: schema/API contract fields from `work-20260513-add-task-hierarchy-schema-api-contract`.

## Accepted Planning Sources Or Local Facts

- Parent design says containers are coordination surfaces and leaf children remain runtime execution units.
- `packages/data/src/index.ts` owns coordinator candidate selection, auto-queue counts, backlog advancement, task status writes, delete, and roadmap summary refresh hooks.
- `packages/api/src/services/taskEvents.ts` owns human event guards for `start_ai`, `accept_existing_plan`, `start_implementation`, `fast_fix`, `retry_from_blocked`, and `approve_done`.
- `packages/agent/src/coordinator.ts` consumes data-layer candidate and queue helpers, so excluding containers in data keeps coordinator behavior centralized.
- Current flat lifecycle and retry semantics must stay unchanged for executable leaves.
- Explorer research confirmed runtime candidate seams in data/coordinator and transition seams in shared/API task events.

## Same-Project Memory

- Not used before `PLAN PASS`.
- Equivalent planning facts came from local sources: the task card, parent RDPI design, repository files, and explorer output.

## Cross-Project Reusable Patterns

- None used.

## Rejected Or Stale Memory Candidates

- No stale memory accepted.

## Key Risks

- Parent rollup can overstate child outcomes if it sets `verified` automatically.
- Container tasks can accidentally enter planner/implementer/reviewer if candidate filters are not fail-closed.
- Child retry/resume can regress if generic rollup overwrites child lifecycle fields.

## Open questions

- Whether existing generated audit batches always expose a single synthesis task id that can be checked as a direct child; implementation must fail closed when this is not true.

## Hypotheses

- Excluding containers at the data query layer will cover coordinator execution without broad coordinator refactoring.
- Rollup can be updated after existing task status writes without changing leaf retry semantics.
