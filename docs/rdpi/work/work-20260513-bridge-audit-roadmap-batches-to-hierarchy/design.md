<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Design

## Approach

For audit roadmap imports, create or reuse a root container task and attach generated source-report and synthesis tasks as children. Keep roadmap batch tables authoritative for readiness and artifact outcomes.

## Import Behavior

- For audit imports, create a root container titled for the roadmap alias unless a matching container already exists.
- Set the parent `hierarchyRole = container` and `parentCloseoutPolicy = synthesis_child_verified`.
- Create source report tasks and synthesis task as direct children of the parent.
- Leave roadmap alias and tags as display/filter metadata.
- Existing duplicate-title skip behavior should still work for child tasks.

## Readiness

- Do not encode source inconclusive, invalid, missing, external-blocked, or trusted-valid artifact states into generic hierarchy fields.
- Keep synthesis pause/unpause and `synthesis_not_ready` controlled by `refreshRoadmapBatchSummary`.
- Parent rollup closes through the synthesis child verification.

## Authoritative Synthesis Link

- The audit import bridge must create or reuse exactly one audit container parent per roadmap import alias.
- The roadmap batch contract remains the authoritative source for the synthesis task id used by `synthesis_child_verified`.
- `createRoadmapBatchContract` must receive only generated child task ids, not the container id.
- If the batch cannot identify exactly one synthesis task under the parent, runtime rollup remains unsatisfied until the relationship is repaired.

## Compatibility

- Non-audit roadmap imports remain flat.
- Existing roadmap batch contract remains the synthesis readiness source of truth.

## Chosen design

- Attach audit roadmap tasks to hierarchy without moving artifact readiness out of roadmap batch tables.
- Keep non-audit roadmap imports flat.
- Keep the parent as a coordination container and every generated source/synthesis task as a direct child.

## Pre-PLAN boundary

- Planning relied on the local task card, parent RDPI design, current repository files, and explorer output only.
- No live runtime probing, roadmap endpoint execution, scheduler reads, or shared-memory recall were used before `PLAN PASS`.

## Decision candidates

- Prefer reusing an existing matching audit container over creating duplicate parents on repeated imports.
- Prefer preserving existing duplicate-child skip behavior for generated tasks.
