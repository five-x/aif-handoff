<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Design

## Approach

Use the hierarchy fields from the schema slice to exclude containers from execution and recompute parent status from direct child state after child mutations.

## Runtime Guards

- Exclude `hierarchyRole = container` from coordinator candidate queries, auto-queue advancement, scheduled advancement, and active pipeline work counts.
- Reject runtime-starting events for containers in the API event service.
- Allow explicit `approve_done` for a container only from `done` to `verified`; rollup never sets `verified`.

## Rollup

- Recompute ancestors after child create/update/delete/status changes.
- `blocked_external` when any direct child is blocked or manual-review blocked.
- `implementing` when any direct child is active: `planning`, `plan_ready`, `implementing`, or `review`.
- `done` when closeout policy is satisfied:
  - `all_children_done`: every direct child is `done` or `verified`.
  - `all_children_verified`: every direct child is `verified`.
  - `synthesis_child_verified`: the roadmap synthesis child attached under the parent is `verified`.
- `backlog` when no child has started or only backlog/paused children exist.
- Never compute parent `verified`; explicit parent approval owns that transition.

## Synthesis Child Policy

- `synthesis_child_verified` is valid only for audit hierarchy parents whose roadmap batch contract identifies exactly one synthesis task that is a direct child of that parent.
- Rollup must fail closed and avoid marking the parent `done` when there are zero matching roadmap batches, multiple matching batches, no synthesis task, a synthesis task outside the direct child set, duplicate or ambiguous synthesis children, or non-audit use of this policy.
- Generic hierarchy reads only the synthesis child task status for closeout; artifact readiness, source validity, and `synthesis_not_ready` remain roadmap-batch owned.
- Tests must cover missing, duplicate, non-child, unverified, and verified synthesis child cases.

## Delete And Attachment Guards

- Do not delete a task with direct children.
- Do not delete an attached child while its parent is open unless a future detach/repair path owns the relationship change.
- Do not make a task executable while it has children.

## Compatibility

- Leaf retry/resume still uses `blocked_external`, `blockedFromStatus`, `retryAfter`, and `retryCount`.
- Audit-specific `synthesis_not_ready` remains roadmap-batch owned; generic rollup only observes child statuses.

## Chosen design

- Keep runtime exclusion and rollup enforcement in the data/API service boundary, with the coordinator inheriting container safety through existing data queries.
- Keep `verified` as an explicit human/system approval state, not a rollup result.
- Treat ambiguous `synthesis_child_verified` lookup as unsatisfied instead of guessing.

## Pre-PLAN boundary

- Planning relied on the local task card, parent RDPI design, current repository files, and explorer output only.
- No live runtime probing, scheduler reads, log inspection, endpoint checks, or shared-memory recall were used before `PLAN PASS`.

## Decision candidates

- Prefer failing closed over auto-detaching or auto-repairing inconsistent hierarchies.
- Prefer direct-child rollup for this slice; deeper descendant aggregation can be layered later if needed.
