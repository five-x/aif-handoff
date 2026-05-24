<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Design

## Approach

Add a small hierarchy contract to the core task model and data/API/MCP edges while keeping behavior inert except for validation and derived child summaries.

## Contract

- Add shared constants/types for `TaskHierarchyRole = executable | container` and `TaskParentCloseoutPolicy = all_children_done | all_children_verified | synthesis_child_verified`.
- Add nullable or defaulted read fields to `Task`:
  - `parentTaskId`
  - `rootTaskId`
  - `hierarchyDepth`
  - `hierarchyRole`
  - `hierarchyPosition`
  - `parentCloseoutPolicy`
  - `childSummary`
  - optional `children` on detailed responses
- Add only writable hierarchy fields to `CreateTaskInput` and `UpdateTaskInput`:
  - `parentTaskId`
  - `hierarchyRole`
  - `parentCloseoutPolicy`
- Add matching SQLite columns with safe defaults:
  - standalone tasks: `parent_task_id = null`, `root_task_id = null`, `hierarchy_depth = 0`, `hierarchy_role = executable`, `hierarchy_position = 1000`, `parent_closeout_policy = null`.

## Writable vs Read-only API Boundary

- `parentTaskId`, `hierarchyRole`, and `parentCloseoutPolicy` are the only client-writable hierarchy fields in REST, MCP, and data inputs.
- `rootTaskId`, `hierarchyDepth`, `hierarchyPosition`, `childSummary`, and `children` are server-computed and read-only.
- REST and MCP must reject or ignore client-supplied computed fields; data tests must prove persisted values come from server computation, not caller input.
- `children` appears only on detail/read responses and is never accepted on create/update.

## Validation

- Creating a child with `parentTaskId` computes `rootTaskId`, `hierarchyDepth`, and sibling `hierarchyPosition` server-side.
- Cross-project parents, self-parenting, cycles, depth greater than `2`, invalid roles, invalid closeout policies, and making a task executable while it has children are rejected.
- A parent that receives a child is promoted to `container` with default `all_children_verified` closeout policy unless already configured.
- MCP create/update tools expose the same hierarchy inputs as REST.

## Derived Read Model

- `childSummary` is computed from direct children: `childCount`, `blockedChildCount`, `activeChildCount`, and `verifiedChildCount`.
- Detail responses can include direct child summaries for navigation.
- Existing list and flat-task responses remain valid.

## Compatibility

- This slice does not implement parent rollup, execution guards, UI rendering, or audit roadmap bridging.
- Existing task rows are treated as standalone executable tasks.

## Chosen design

- Keep the contract small and first-class in the task model instead of encoding hierarchy through tags, roadmap aliases, or UI-only grouping.
- Keep server-computed hierarchy fields read-only to avoid caller-controlled roots, depths, sibling positions, or child summaries.

## Pre-PLAN boundary

- Planning relied on the local task card, parent RDPI design, current repository files, and explorer output only.
- No live runtime probing, scheduler reads, log inspection, endpoint checks, or shared-memory recall were used before `PLAN PASS`.

## Decision candidates

- Prefer fail-closed validation for invalid hierarchy relationships over automatic repair.
- Prefer additive SQLite columns with defaults over a destructive migration or task backfill.
- Prefer preserving flat list/detail response compatibility while adding optional hierarchy metadata.
