# Design - Hierarchical Task And Subtask Model

## Chosen design

Add a small generic hierarchy layer to `tasks`, while keeping leaf tasks as the only runtime execution unit.

Parent tasks are coordination containers. Child and grandchild tasks are normal executable tasks unless explicitly marked as containers themselves. Existing Kanban statuses remain the task lifecycle vocabulary; parent rows use the same `status` column as a rollup projection rather than a separate lifecycle.

## Core model

Add these task fields in the first hierarchy implementation slice:

- `parentTaskId`: nullable task id. Null means top-level task.
- `rootTaskId`: nullable task id. For hierarchy members, this is the root container id; standalone legacy tasks can remain null.
- `hierarchyDepth`: integer default `0`. Root/top-level is `0`, child is `1`, grandchild is `2`.
- `hierarchyRole`: `executable` or `container`, default `executable`.
- `hierarchyPosition`: numeric sibling ordering independent from Kanban `position`.
- `parentCloseoutPolicy`: nullable policy on container tasks. Initial policies are `all_children_verified` and `synthesis_child_verified`.

Do not add generic dependency edges, closure tables, optional children, new task statuses, or generic artifact/evidence tables in the first hierarchy slice.

## Relationship rules

- A child must belong to the same project as its parent.
- A child cannot point to itself, a descendant, or a task in another root tree.
- Maximum supported depth is `2`: task -> subtask -> sub-subtask.
- Creating a child computes `rootTaskId`, `hierarchyDepth`, and `hierarchyPosition` server-side.
- A parent with children should be `hierarchyRole=container` unless a later implementation explicitly supports executable parents.
- Containers are not valid coordinator work candidates. Starting AI on a container is rejected by API/state-machine guardrails.
- Existing `roadmapAlias` and tags may be copied to children for filtering, but they are display metadata only. The parent-child relationship is the source of truth.

## Status rollup

Leaf/executable tasks keep the existing state machine unchanged.

Container status is recalculated when a direct or descendant child changes:

- `blocked_external` when any blocking descendant is externally blocked or manual-review blocked.
- `implementing` when any blocking descendant is in `planning`, `plan_ready`, `implementing`, or `review`.
- `done` when the container close-out policy is satisfied but the parent has not been human-approved.
- `verified` only after the parent container is explicitly approved.
- `backlog` when the container has no active children yet or all children are backlog/paused and no work has started.

The parent rollup must not claim a stronger result than the children. In particular, `verified` requires explicit parent approval, and Plan B audit parents with source inconclusive results must close through the synthesis child rather than pretending every source child verified cleanly.

## Blocking semantics

For the first slice, all direct children are blocking children.

Child blockers stay on the child task:

- leaf retry uses current `blocked_external`, `blockedFromStatus`, `retryAfter`, and `retryCount`;
- `retry_from_blocked` resumes the blocked child task through the existing state machine;
- parent containers update their status and blocked summary after child changes;
- parent retry does not cascade in the first slice.

This keeps retry behavior narrow and avoids hidden multi-task writes from a single button. A future dependency-card can add optional/non-blocking children or cascade retry only if a real workflow requires it.

## Close-out rules

`all_children_verified`:

- Container reaches `done` when every direct child is `verified`.
- If a direct child is itself a container, that child must be `verified`, not merely internally complete.
- Parent reaches `verified` only through explicit parent approval.

`synthesis_child_verified`:

- Container reaches `done` when the designated synthesis child is `verified`.
- Source/report children do not directly close the parent; they block the synthesis child through the workflow-specific contract.
- This policy is the Plan B audit bridge because roadmap batch artifacts already decide when synthesis may run.

For both policies, deleting a child is blocked while it is required for an open parent unless the delete request also repairs the parent relationship or marks the parent blocked for manual repair.

## Child creation, resume, retry, and attachment

Creation:

- API accepts `parentTaskId` and optional `parentCloseoutPolicy` only where the caller creates a container or child.
- The server validates same-project, acyclic, max-depth relationships.
- Child task creation still uses the normal task creation path for title, description, intent defaults, plan path, runtime profile, and attachments.
- Bulk roadmap import can create a root parent container, attach generated report tasks and synthesis task as children, and keep `roadmap_batches` as the audit artifact contract.

Resume:

- Leaf children resume exactly like current tasks. Existing `sessionId`, branch/worktree fields, and runtime profile fields stay on the child.
- Parent containers have no runtime session in the first slice. A parent detail view links to child sessions instead.

Retry:

- Failed or blocked child tasks retry through existing child actions.
- Updating a child recomputes parent rollup.
- Parent retry/cascade retry is deferred because it would create multi-task transition semantics outside the current state machine.

Attachment:

- A child is attached to a parent by `parentTaskId`, not by tags or prose links.
- Existing intake and RDPI links can remain as human-readable references.
- Child comments, plans, implementation logs, review comments, branch/worktree paths, and artifact rows remain child-owned.

## API contracts

Extend create/update/list/read responses with hierarchy fields:

- `parentTaskId`
- `rootTaskId`
- `hierarchyDepth`
- `hierarchyRole`
- `hierarchyPosition`
- `parentCloseoutPolicy`
- derived read-only child summary: `childCount`, `blockedChildCount`, `activeChildCount`, `verifiedChildCount`, and optional `children` only on detail endpoints.

Create/update validation must reject cross-project parents, depth overflow, cycles, container start events, and attempts to make a task executable while it still has children.

MCP task tools should gain parity with API once the API contract is stable.

## UI model

Kanban remains status-first:

- top-level tasks and containers appear in status columns;
- child tasks can be shown nested under their parent in a detail view and optionally collapsed under a parent card;
- list view adds hierarchy indentation and parent title/short id;
- filters by roadmap alias and tags keep working because tags remain metadata.

The first UI slice should prioritize visibility and safe navigation over complex drag-and-drop tree editing.

## RDPI and intake artifacts

RDPI remains per task id under `docs/rdpi/<lane>/<task-id>/`.

Parent-child metadata should be recorded in task cards and result artifacts after the runtime model exists:

- parent card links to child task ids;
- child card records `Parent Task: <id>`;
- result artifacts list child close-out status and parent rollup outcome;
- follow-up tasks are queued as intake cards and never auto-run in the same diagnostic/design run.

Do not move RDPI artifacts into nested directories. The database relationship should be the hierarchy source of truth; docs stay flat and link by task id.

## Plan B audit bridge

For broad audit decomposition:

- create a root container task for the audit request;
- create source report child tasks and one synthesis child task;
- keep `roadmap_batches` and `roadmap_batch_artifacts` authoritative for report artifact readiness, attempts, and source inconclusive states;
- set the root parent `parentCloseoutPolicy` to `synthesis_child_verified`;
- keep the synthesis child paused/blocked through existing `synthesis_not_ready` behavior until roadmap batch readiness allows it to run;
- parent closes only after synthesis is verified, and the synthesis content must report every child source artifact status.

This avoids duplicating audit artifact semantics in the generic hierarchy layer.

## Pre-PLAN boundary

Before `PLAN PASS`, this task may write only planning artifacts: research, design, plan, scope boundaries, hypotheses, acceptance criteria, and proposed follow-up cards. It must not implement schema/API/runtime/UI changes, probe live services, inspect runtime logs, query shared memory, or mark any child behavior validated from live execution.

## Follow-up implementation cards to queue after PLAN PASS

- Add task hierarchy schema and API contract.
- Enforce hierarchy runtime rollup and execution guards.
- Surface task hierarchy in Kanban, list, and task detail UI.
- Bridge audit roadmap batches to the generic hierarchy model.

The existing `work-20260513-plan-b-audit-decomposition-regression-suite` card remains the broader deterministic regression suite and should include hierarchy scenarios after the behavior exists.

## Decision candidates

- Parent tasks are coordination containers; leaf children remain the runtime execution unit.
- Generic hierarchy uses first-class task fields, not tags or roadmap aliases.
- Generic hierarchy has max depth `2` until a real workflow requires deeper nesting.
- Audit roadmap batches remain the artifact readiness contract; hierarchy only attaches the generated cards to a parent.
