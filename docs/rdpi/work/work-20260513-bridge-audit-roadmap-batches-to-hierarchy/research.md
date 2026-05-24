<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Research

## Task Framing And Lane

- Task: `work-20260513-bridge-audit-roadmap-batches-to-hierarchy`
- Lane: work
- Intake card: `docs/intake/work/work-20260513-bridge-audit-roadmap-batches-to-hierarchy.md`
- Scope: attach broad audit roadmap batch tasks to generic hierarchy while preserving roadmap batch artifact readiness semantics.
- Depends on: schema/API and runtime rollup slices.

## Accepted Planning Sources Or Local Facts

- `packages/api/src/services/roadmapGeneration.ts` imports generated roadmap tasks and creates roadmap batch summaries through workflow hooks.
- Audit workflow hooks already mark synthesis tasks paused with `synthesis_not_ready` until batch readiness allows synthesis.
- `packages/data/src/index.ts` owns `createRoadmapBatchContract`, `refreshRoadmapBatchSummary`, artifact attempts/readiness, and synthesis pause/unpause.
- `roadmap_batches` and `roadmap_batch_artifacts` are authoritative for audit artifact readiness and should not be duplicated into generic hierarchy states.
- Existing Plan B docs say parent/child audit synthesis should use roadmap batch/artifact contract until generic hierarchy lands, then bridge to hierarchy.

## Same-Project Memory

- Not used before `PLAN PASS`.
- Equivalent planning facts came from local sources: the task card, parent RDPI design, repository files, and explorer output.

## Cross-Project Reusable Patterns

- None used.

## Rejected Or Stale Memory Candidates

- No stale memory accepted.

## Key Risks

- Creating duplicate audit parent tasks on repeated imports.
- Accidentally treating source inconclusive/invalid/missing artifact states as generic hierarchy states.
- Weakening `synthesis_not_ready` readiness behavior while attaching children.

## Open questions

- Whether existing duplicate import behavior is title-based or batch-based; implementation should preserve the existing child skip behavior while adding deterministic parent reuse.

## Hypotheses

- Audit parent creation can be introduced inside the roadmap import service without changing artifact readiness code.
- Passing `parentTaskId` through generated child creation should be enough for UI and rollup once hierarchy fields exist.
