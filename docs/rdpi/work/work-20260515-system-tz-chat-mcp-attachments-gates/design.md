# Design: System TZ Chat MCP Attachments Gates

Task: `work-20260515-system-tz-chat-mcp-attachments-gates`

## Design Goals

- Preserve task intent and source provenance from chat and MCP entrypoints.
- Prevent chat and MCP from bypassing the task state machine, completion guards, review gates, or security guards.
- Make MCP-created and MCP-updated tasks visible through the same internal broadcast path used by the API.
- Reject unsafe attachment inputs before storage or prompt construction.
- Keep attachment prompt formatting bounded, text-only for inline excerpts, and provenance-aware.

## Non-Goals

- Rebuilding the whole task mutation model or replacing REST `PUT /tasks/:id`.
- Adding silent server-side chat mutations beyond existing UI-confirmed task proposals.
- Implementing a new UI provenance viewer.
- Changing audit/report validator containment from earlier System TZ tasks.
- Publishing memory automatically before local memsync artifacts are reviewed.

## Proposed Changes

### 1. Task Source Provenance

Add optional task-level `sourceRef`:

- Add `source_ref TEXT` to the `tasks` table and Drizzle schema.
- Add a SQLite migration from the current user version to the next version.
- Extend shared task types and create/update task input types with `sourceRef?: string | null`.
- Extend data-layer `createTask` and `updateTask` to persist `sourceRef`.
- Extend API create/update schemas with a bounded nullable `sourceRef`.
- Extend MCP create/update schemas with bounded nullable `sourceRef`.
- Extend chat structured action parsing and `CreateTaskCard` to carry a UI-generated chat source reference when creating a task.

Source reference format should be human-readable and non-secret, for example:

- `chat:session:<sessionId>`
- `chat:task:<taskId>:session:<sessionId>`
- `mcp:createTask`
- `mcp:updateTask`

### 2. Chat Structured Action Guardrails

Keep chat actions as proposals that require UI confirmation.

Changes:

- Update the chat structured-actions prompt to state the permitted action contract clearly.
- Support these explicit structured action types:
  - `CREATE_TASK`: mutating proposal for a new standalone task. Requires UI confirmation before API mutation.
  - `CREATE_FOLLOW_UP`: mutating proposal for a child/follow-up task tied to the current task context. Requires UI confirmation before API mutation and must include a `sourceRef` pointing to the chat session/current task context.
  - `START_EXPLORE`: non-mutating UI action that starts an explore-mode chat turn or opens the existing explore affordance. It must not change task state.
  - `EXPLAIN_BLOCKER`: non-mutating structured summary of blockers and source task context. It must not write `blockedReason` or status.
  - `PREPARE_REPLAN`: non-mutating structured replan proposal. It can present suggested plan text and rationale, but it must not call `request_replanning`, update `plan`, or change status without an existing guarded task event outside chat.
- Include `taskIntent` and optional `sourceRef` in task-creation action payloads.
- Generate a source reference in the UI when the model does not provide one.
- Reject or ignore unknown/prohibited action types on the client, including direct status change, memory verification, done approval, review approval, completion override, and raw field update actions.

This satisfies the destructive-action confirmation constraint because task creation remains user-confirmed by `CreateTaskCard`.

### 3. MCP State Machine Enforcement

Replace direct MCP status writes with state-machine mapping for safe transitions.

`syncStatus` should:

- Load the current task.
- Reject requests to move to `done` or `verified`.
- Keep the existing protection against overwriting current `done` or `verified`.
- Treat same-status sync as a no-op that still updates sync metadata when appropriate.
- Map only supported transitions to shared human task events:
  - `backlog -> planning`: `start_ai`
  - `backlog -> plan_ready`: `accept_existing_plan`
  - `plan_ready -> implementing`: `start_implementation`
  - `plan_ready -> planning`: `request_replanning`
  - `blocked_external -> blockedFromStatus`: `retry_from_blocked`
- Apply the resulting patch through `applyHumanTaskEvent`.
- Reject unsupported transitions with `applied: false` and a clear reason.
- Continue to write `lastSyncedAt` and optional `paused` only after a valid transition or safe no-op.

This avoids a new MCP-only state machine while still reusing the shared workflow contract.

All MCP task mutation tools should also validate task intent with the shared `normalizeTaskIntent`/`validateGeneratedTaskIntent` path:

- `createTask` accepts only valid explicit task intent values, infers `fix` from `isFix`, and persists resolved intent.
- `updateTask` accepts only valid task intent values and rejects `taskIntent`/`isFix` combinations that violate the task intent contract.
- MCP-created tasks cannot omit intent in a way that bypasses defaults; omitted intent resolves to the shared `general` default unless `isFix` resolves it to `fix`.

### 4. MCP Artifact Path And Broadcast Safety

MCP task tools should validate artifact paths before writing.

Changes:

- Validate `planPath` in MCP create/update using the same safe relative-path rules used for roadmap artifacts: no absolute paths, drive letters, `.`/`..`, traversal, trailing traversal markers, or colon-prefixed Windows drive syntax.
- Reject MCP `updateTask` payloads that attempt to mutate review/completion guard fields directly, including `implementationLog`, `reviewComments`, `blockedReason`, and any future status-like fields. These fields must be changed through guarded task events or coordinator/review flows, not MCP field updates.
- Keep MCP `pushPlan` limited to plan-content updates for tasks that are still in planning-compatible statuses (`backlog`, `planning`, or `plan_ready`). It must reject `done`, `verified`, and implementation/review statuses so external plan pushes cannot rewrite completed work or bypass replan gates.
- Ensure `pushPlan` creates visible timeline/sync evidence through normal task update broadcast fanout without changing task status.
- Add tests that invalid MCP artifact paths are rejected.
- Add `task:created` to the internal broadcast schema.
- Update MCP create to broadcast `task:created` after task creation.
- Update API internal broadcast fanout so `task:created` also refreshes queues and wakes agents when appropriate.
- Update MCP broadcast helper to include `INTERNAL_BROADCAST_TOKEN` when configured.
- Keep best-effort broadcast behavior; failed sync notification should not corrupt task data.

### 5. Attachment Validation And Storage

Centralize attachment safety rules in shared helpers and enforce them in API schemas plus persistence.

Rules:

- Max declared and decoded attachment size: 10 MB.
- Reject unsafe filenames instead of silently sanitizing user-provided names.
- Allow only a conservative MIME set:
  - Text: `text/plain`, `text/markdown`, `text/csv`, `application/json`
  - Binary/reference: `application/pdf`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- Existing file-backed paths must be safe relative paths under `.ai-factory/files` and must match the task/comment/chat storage context when that context is known.
- Text content is decoded as UTF-8, scanned/redacted with existing redaction utilities, and persisted as redacted text if secrets are detected.
- Binary content must be valid base64/data URI bytes and is never treated as text.
- Oversized decoded content is rejected.
- Storage write failures should surface instead of silently downgrading to metadata-only.
- Persisted attachment records should include source provenance:
  - `sourceKind`: `task`, `comment`, or `chat`
  - `sourceRef`: task/comment/chat reference
  - `redactionStatus`: `none`, `redacted`, or `not_scanned`

### 6. Prompt Formatting

Update shared prompt formatting:

- Inline only text attachments.
- Keep inline excerpts bounded.
- Redact text before inline prompt output.
- Never inline binary content; show metadata and safe path/reference instead.
- Include source provenance when present.
- Continue to support old attachment records without new fields.

## Compatibility

- Existing tasks without `sourceRef` remain valid.
- Existing attachment records without provenance continue parsing.
- Existing file-backed attachments remain downloadable if their stored paths are under `.ai-factory/files`.
- MCP unsupported status syncs become explicit no-ops/rejections instead of unsafe writes.

## Verification Design

Focused tests should cover:

- DB migration and task `sourceRef` persistence.
- API task creation/update schema acceptance for valid `sourceRef`.
- Chat action parsing and UI-confirmed create payload including `sourceRef`.
- MCP `createTask` sourceRef and invalid `planPath` rejection.
- MCP `syncStatus` valid transition mapping and terminal/invalid transition rejection.
- MCP broadcast helper including auth token and `task:created` broadcast type.
- Attachment schema rejection for oversized, invalid MIME, unsafe filename, unsafe path.
- Attachment persistence rejecting invalid binary payloads and unsafe file-backed paths.
- Prompt formatting never inlining binary content and redacting/bounding text.

## Design Decision

Use incremental hardening around the existing task/event/data surfaces instead of adding a parallel workflow engine. The safest boundary is to keep chat proposal-only, make MCP status sync reuse the shared state machine, and make attachment validation reject unsafe inputs before they enter storage, prompts, or timeline-visible task records.
