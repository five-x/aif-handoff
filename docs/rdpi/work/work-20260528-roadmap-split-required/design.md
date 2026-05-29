<!-- Managed by RDPI for task work-20260528-roadmap-split-required. -->

# Design

## Chosen design

Add a proposal lifecycle between roadmap extraction and task creation.

Roadmap extraction continues to produce a validated `RoadmapGenerationResult`. Instead of creating task rows immediately from the project roadmap endpoints, the API persists a `split_required` proposal containing the proposed child task payloads. A separate human approval API then turns the proposal into real task rows by reusing `importGeneratedTasks`.

The approval call creates a hierarchy container and child task rows, but all newly created children remain paused and the route does not emit `agent:wake`. This means approval records the children without executing them in the same flow.

## Data model

Add a durable `task_split_proposals` table:

- `id`
- `project_id`
- `parent_task_id`
- `source_kind`
- `source_ref`
- `source_fingerprint`
- `roadmap_alias`
- `task_intent`
- `status`: `pending`, `approved`, or `rejected`
- `decision`: `split_required`
- `summary`
- `proposed_children_json`
- `created_task_ids_json`
- `approved_by`
- `rejected_reason`
- timestamps for create/update/approve/reject

The proposed children are JSON payloads shaped like generated roadmap tasks plus tags/metadata needed for UI review. They are not inserted into `tasks` until approval.

This single-table JSON design is intentionally conservative for this slice. It satisfies separate proposed-child persistence, supports transactional approval semantics with the current SQLite-backed data layer, and avoids introducing per-child editing semantics that the intake card did not require.

`source_ref` is a human-readable source label, for example `roadmap-import:ROADMAP.md` or `roadmap-generation:<alias>`. `source_fingerprint` is a SHA-256 over the normalized source content, requested alias, requested intent, and canonical proposed children. A pending proposal may be reused only when project, alias, intent, source kind, and fingerprint all match. If a pending proposal exists with the same project, alias, intent, and source kind but a different fingerprint, the API returns a conflict instead of silently approving stale children. The user must reject the old proposal or use a different alias before creating a replacement proposal.

## Service flow

Roadmap import/generation:

1. Validate roadmap alias and typed intent as today.
2. Generate or extract `RoadmapGenerationResult` as today.
3. Compute `source_fingerprint` from source content plus canonical generated children.
4. Persist or reuse a pending split proposal for the project, alias, intent, source kind, and matching fingerprint.
5. If a same-alias pending proposal exists with a different fingerprint, return a conflict and create no tasks.
6. Return/broadcast `status: "split_required"` with the proposal.
7. Do not call `importGeneratedTasks`.
8. Do not broadcast `task:created`.
9. Do not broadcast `agent:wake`.

Approval:

1. Load a pending proposal for the requested project.
2. Run approval inside one database transaction. The transaction loads the proposal, verifies `status = pending`, rehydrates a `RoadmapGenerationResult` from `proposed_children_json`, creates the task rows, creates roadmap batch metadata, and marks the proposal `approved` before commit. If any step throws, the transaction rolls back so the proposal remains pending and no partial child rows or batch artifacts are committed.
3. Call `importGeneratedTasks` with split-approval options:
   - create/reuse a hierarchy parent for non-audit imports;
   - keep the existing audit hierarchy parent behavior for audit imports;
   - attach children to the container;
   - create child rows paused;
   - preserve existing workflow-pack hooks and roadmap batch artifact creation.
4. Mark the proposal `approved` with created task ids, including the container id when one was created or reused.
5. Broadcast `task:created` for created container/children so the UI can refresh.
6. Do not broadcast `agent:wake`.

Approval conflict behavior:

- Duplicate approve of an already approved proposal is idempotent: return the stored approved proposal and created task ids, and create no additional rows.
- Approve of a rejected proposal returns conflict.
- Approve with a project/proposal mismatch returns not found.
- A retry after a failed pending approval can safely rerun because the failed transaction does not commit partial work.

Rejection:

1. Mark the proposal `rejected` only when `status = pending`.
2. Keep `proposed_children_json` for auditability.
3. Create no task rows.
4. Reject-after-approve returns conflict; duplicate reject of an already rejected proposal returns the stored rejected proposal.

## Hierarchy and queue behavior

For non-audit proposals, approval creates a roadmap container task:

- `hierarchyRole: "container"`
- `parentCloseoutPolicy: "all_children_done"`
- `autoMode: false`
- `paused: true`
- tags: `roadmap`, `rm:<alias>`, `roadmap-parent`, and `kind:<intent>`

For audit proposals, approval keeps the existing audit container and `synthesis_child_verified` policy so audit batch rollups remain compatible.

Child task rows are created with `parentTaskId` set to the container id and `paused: true`. Existing data-layer queue helpers skip both containers and paused tasks, so approval cannot immediately execute the generated children. A later explicit resume/unpause/start flow is required.

## API and UI

API additions:

- A split proposal response type in shared browser-safe types.
- `POST /projects/:id/task-split-proposals/:proposalId/approve`
- `POST /projects/:id/task-split-proposals/:proposalId/reject`
- Optional list/read endpoint if needed for UI refresh.
- A `roadmap:split_required` websocket payload for async generation.

UI changes:

- `RoadmapDialog` recognizes `split_required` responses and websocket events.
- It renders the proposed child list with approve/reject actions.
- After approval it shows the existing created/skipped result summary.
- It clearly treats created children as queued/paused rather than running.

## Compatibility

- Existing direct broad audit task rejection remains intact unless a future task designs a trusted direct-audit split proposal. This avoids bypassing the audit roadmap contract.
- Existing `importGeneratedTasks` behavior remains available for direct service tests and internal call sites, with split approval using explicit options.
- Workflow-pack validation and audit artifact hooks stay in their current resolver boundary.
- `AIF_REQUIREMENTS_INTAKE_ENABLED=false` does not disable split proposals. Approved children remain backlog rows; when later started they follow the existing flag-aware transition path.

## Out of scope

- Per-child proposal editing.
- Recursive split/grandchild execution.
- Replacing audit roadmap validation.
- Executing or unpausing approved children automatically.
- Documentation rollout beyond code/test artifacts; the follow-up observability/docs task owns final docs.
