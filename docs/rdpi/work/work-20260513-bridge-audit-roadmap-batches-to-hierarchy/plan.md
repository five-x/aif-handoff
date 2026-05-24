<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Plan

## Implementation Plan

1. Add audit roadmap import parent creation/reuse in `roadmapGeneration.ts`.
2. Pass `parentTaskId` into generated audit source and synthesis child task creation.
3. Set parent closeout policy to `synthesis_child_verified`.
4. Ensure `createRoadmapBatchContract` still receives only actual generated child task ids and preserves its synthesis task identifier as the authoritative closeout link.
5. Refresh parent rollup after batch summary changes and synthesis pause/unpause.
6. Add tests for audit parent creation/reuse, child attachment, synthesis child policy lookup, duplicate import behavior, and non-audit flat import compatibility.

## Verification Plan

- `npm.cmd test --workspace=@aif/api -- roadmapGeneration`
- `npm.cmd test --workspace=@aif/data -- index planBRegression`
- `npm.cmd test --workspace=@aif/agent -- coordinator`
- `npm.cmd run lint`
- `npm.cmd run build`

## Acceptance Criteria

- Audit roadmap import creates or reuses a hierarchy root container.
- Source and synthesis tasks are children of that parent.
- The parent uses `synthesis_child_verified`.
- Existing audit artifact readiness remains roadmap-batch owned.
- The batch contract does not include the container id in generated child task ids.

## Reusable patterns

- Preserve roadmap batch/artifact ownership of audit readiness and use hierarchy only as task organization plus parent rollup.
- Keep parent reuse deterministic by matching an audit container identity derived from the roadmap alias.
