<!-- Managed by RDPI for task work-20260528-requirements-snapshot-and-stage-artifacts. -->

# Design - Requirements Snapshot And Stage Artifacts

## Chosen Design

Add a task-scoped requirements snapshot table plus a task-stage artifact current/attempt model. This keeps the slice narrow while following the generic artifact design's current-row plus append-only-attempt pattern.

Do not write requirements artifacts into `roadmap_batch_*` tables. Audit compatibility rows remain owned by audit/roadmap behavior.

## Data Model

Add `task_requirements_snapshots`.

Core fields:

- `id`
- `task_id`
- `project_id`
- `snapshot_version`
- `source_stage`
- `source_question_batch_id`
- `requirements_markdown`
- `content_sha`
- `summary_json`
- `source_question_ids_json`
- `created_at`
- `updated_at`

Rules:

- `tasks.requirements_snapshot_id` points at the current snapshot.
- Snapshots are append-only versions. Creating a new snapshot increments per-task `snapshot_version`.
- Snapshot markdown is generated from task title/description and answered/resolved requirements questions after sanitization. Secret-like values are redacted instead of copied.
- The snapshot stores accepted requirements and metadata, not raw unsafe answers or credentials.

Add `task_stage_artifacts`.

Core fields:

- `id`
- `task_id`
- `project_id`
- `stage`
- `role`
- `artifact_kind`
- `artifact_path`
- `state`
- `outcome`
- `trust_level`
- `current_attempt_id`
- `attempt_number`
- `requirements_snapshot_id`
- `content_sha`
- `metadata_json`
- `created_at`
- `updated_at`

Add `task_stage_artifact_attempts`.

Core fields:

- `id`
- `artifact_id`
- `task_id`
- `project_id`
- `stage`
- `role`
- `artifact_kind`
- `artifact_path`
- `attempt_number`
- `state`
- `outcome`
- `trust_level`
- `requirements_snapshot_id`
- `content_sha`
- `metadata_json`
- `created_at`

Rules:

- `task_stage_artifacts` is the mutable current read model.
- `task_stage_artifact_attempts` is append-only.
- Supported artifact roles/kinds in this slice are `requirements`, `research`, and `design`.
- A waiver is represented as a durable requirements stage artifact with `state = manual_exception`, `outcome = waived`, `trust_level = weak`, and a non-empty justification in metadata.
- Attempt numbers are sequential per artifact.

## Shared Types

Extend `WORKFLOW_TIMELINE_GENERIC_ARTIFACT_KINDS` with:

- `requirements`
- `research`
- `design`

Add shared DTOs for:

- `TaskRequirementsSnapshot`
- `TaskStageArtifact`
- `TaskStageArtifactAttempt`
- `TaskRequirementsSnapshotResponse`

Use existing generic timeline state/outcome/trust strings where possible.

## Data Layer

Add repository helpers:

- `createCurrentRequirementsSnapshot(taskId, options)`
- `getCurrentRequirementsSnapshot(taskId)`
- `listTaskRequirementsSnapshots(taskId)`
- `recordTaskStageArtifactAttempt(input)`
- `listTaskStageArtifacts(taskId)`
- `listTaskStageArtifactAttempts(taskId)`
- `recordRequirementsSnapshotWaiver(taskId, justification)`
- `assertCurrentRequirementsSnapshotOrWaiver(taskId, stage)`
- `buildTaskRequirementsContextForPrompt(taskId)`

`createCurrentRequirementsSnapshot()` should:

1. Read the task and answered/resolved requirement questions.
2. Generate sanitized `requirements.md` markdown.
3. Insert a snapshot version.
4. Update `tasks.requirements_snapshot_id`.
5. Record/update the current `requirements.md` stage artifact and append an accepted attempt.
6. Append a task activity log entry.

`recordTaskStageArtifactAttempt()` should create or update the current artifact and append the attempt in one transaction. The initial implementation can support stage-artifact metadata without requiring physical file writes.

`assertCurrentRequirementsSnapshotOrWaiver()` should fail closed only when requirements intake is enabled by the caller. Disabled-flag compatibility remains the caller's responsibility.

## Agent Integration

Requirements analyst:

- After determining requirements are sufficient, create a current snapshot before the coordinator moves the task to `planning`.
- If blocking questions remain or the task moves to `needs_input`, do not create a snapshot.
- If the analyst hits the clarification cycle limit and moves to `blocked_external`, do not create a snapshot. This preserves the `needs_input` versus `blocked_external` distinction.

Coordinator/planner guard:

- Before planner execution, if `AIF_REQUIREMENTS_INTAKE_ENABLED=true`, require a current requirements snapshot or documented waiver.
- If missing, do not execute the planner. Move the task back to `requirements_analysis`, clear stale external-block fields, append an activity-log explanation, and wake the coordinator so the requirements analyst can create a snapshot or ask questions.
- The missing-snapshot guard must not move the task to `needs_input` directly and must not use `blocked_external`. `needs_input` remains owned by question creation; `blocked_external` remains for external/operator/runtime/manual-triage blockers such as the clarification cycle limit.
- If `AIF_REQUIREMENTS_INTAKE_ENABLED=false`, preserve legacy planner behavior.

Prompt context:

- Planner, implementer, and reviewer prompts should include a bounded "Requirements Snapshot And Stage Artifacts" block.
- The block should include snapshot id/version/path/sha and upstream artifact metadata for `requirements`, `research`, and `design`.
- The prompt-context helper must be stage-neutral so future QA can reuse the same contract without this task implementing the QA child task.

## API Exposure

Keep existing timeline exposure and add a focused requirements endpoint:

- `GET /tasks/:id/requirements/snapshot`

Response includes:

- current snapshot or `null`;
- all snapshot versions metadata, without raw unsafe answer bodies;
- current stage artifacts;
- stage artifact attempts.

When no snapshot exists, the endpoint still returns a 200 response for an existing task with `current: null`, empty version/artifact/attempt arrays, and task metadata. Unknown tasks return 404. The endpoint remains read-only and does not create snapshots when the intake feature flag is disabled.

The existing `GET /tasks/:id/timeline` should include `requirements`, `research`, and `design` artifacts from `task_stage_artifacts`.

Broadcast existing timeline invalidation event after snapshot/artifact writes:

- `task:timeline_updated`
- `task:requirements_snapshot_created` or `task:requirements_snapshot_updated` where already typed.

## UI Exposure

Use the existing timeline and artifacts tabs as the primary UI read surface:

- `WorkflowTimelinePanel` should render the new artifact kinds through the existing generic artifact rows.
- The Artifacts tab in task detail should show the artifact label, state, path, and attempts.

Add minimal API client/hook support for the focused requirements snapshot endpoint if needed by tests or future UI, but avoid adding a new large UI panel in this slice.

## Compatibility And Safety

- Do not change `start_ai` disabled-flag routing.
- Do not add generic task events that move a task out of `needs_input`.
- Do not copy secret-like answers into snapshot markdown; run the same secret-like detector before snapshot persistence and redact any unsafe value.
- Do not weaken audit compatibility tables or audit trust mappings.
- Do not run child tasks for research/design/QA/split approval in this task.

## Verification Strategy

- Data tests for snapshot creation, redaction, versioning, current task pointer, stage artifact current/attempt rows, timeline projection, and waiver behavior.
- Agent tests for requirements analyst snapshot creation and planner guard behavior.
- API tests for the snapshot endpoint and timeline projection.
- Web tests proving requirements/research/design artifact metadata renders through existing timeline/artifact UI.
- Regression tests for `AIF_REQUIREMENTS_INTAKE_ENABLED=false` legacy planner routing and existing question behavior.
