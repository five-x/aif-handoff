<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Plan

## Implementation Plan

1. Add data-layer helpers to list children, summarize direct children, refresh ancestor rollups, and locate authoritative synthesis children for policy checks.
2. Invoke rollup refresh after task create/update/status/delete and roadmap batch summary changes where synthesis pause/unpause can alter child state.
3. Exclude containers from coordinator candidate, backlog advancement, scheduled due, stale-progress, and active pipeline count queries.
4. Reject runtime-starting events for containers in API task event handling.
5. Add delete and role-change guards for open hierarchies.
6. Add focused data/API/agent tests for rollup, fail-closed synthesis-child lookup, container execution rejection, leaf retry compatibility, and deletion guards.

## Verification Plan

- `npm.cmd test --workspace=@aif/data -- index pause`
- `npm.cmd test --workspace=@aif/api -- tasks`
- `npm.cmd test --workspace=@aif/agent -- coordinator autoQueue`
- `npm.cmd run lint`
- `npm.cmd run build`

## Acceptance Criteria

- Containers are not executable runtime candidates.
- Parent status never claims a stronger state than children support.
- Child retry/resume remains unchanged.
- Closeout policies are enforced without duplicating audit artifact readiness.
- `all_children_done` closes parents only when every direct child is `done` or `verified`.
- `synthesis_child_verified` does not close parents when synthesis-child lookup is missing, duplicate, non-child, or non-audit.

## Reusable patterns

- Centralize runtime safety in data helpers and API transition guards instead of duplicating coordinator-side checks.
- Keep audit artifact readiness in roadmap batch tables and use hierarchy only for task attachment/rollup.
