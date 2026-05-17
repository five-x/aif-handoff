# Design

## Goals

Expose the existing System TZ trust backbone through operator-facing APIs, WebSocket invalidation events, and UI surfaces without changing trust semantics.

The design must:

- keep the existing data layer as the source for timeline, trust, usage, and memory projections;
- expose bounded, redacted read models;
- preserve existing WebSocket behavior while adding target event names;
- avoid raw provider diagnostics, secrets, and unbounded command output;
- keep worktree cleanup behind existing fail-closed service checks;
- add operator UI navigation for repeated diagnostic work.

## Non-Goals

- No schema migration unless strictly required.
- No new trust classifier or trust-level reinterpretation.
- No generic event-sourced persistence migration.
- No broad redesign of task status, queue, memory approval, runtime budget, or audit evidence semantics.
- No automatic worktree deletion.

## Backend Shape

### Shared DTOs

Add browser-safe shared DTOs for operator surfaces:

- `TaskEffectiveRuntime`: existing runtime response shape currently returned by API but not typed on `Task`.
- `TaskOperatorEvidenceResponse`: timeline evidence plus links and context.
- `TaskRuntimeUsageEvent` and `TaskRuntimeUsageResponse`: bounded usage event projection and aggregate totals.
- `TaskMemoryCandidatesResponse`: task-scoped memory candidates.
- `ProjectKnowledgeResponse`: project/global source-backed memory knowledge, counts by status/type/failure family, and source-backed claim summaries.
- `ProjectRuntimeUsageResponse`: project-scoped usage events and aggregate totals.
- `ProjectQueueStateResponse`: counts and queued backlog items by project.
- `TaskWorktreeInspection` and `TaskWorktreeCleanupResult`: web-safe copies of existing service response shapes.
- targeted WebSocket payloads for timeline/evidence/trust/manual handoff/memory candidate/usage/queue/worktree warning.

The DTOs should include IDs, timestamps, reason/warning codes, status, bounded summaries, runtime/profile identifiers, and aggregate numbers. They must not include raw command output, provider diagnostics, raw secrets, or artifact bodies.

### Data Layer

Add exported data functions that return safe operator projections:

- `listTaskMemoryCandidates(taskId)` using existing memory items whose `sourceTaskId` equals the task.
- `buildProjectKnowledge(projectId, options)` using existing `memory_items` as the source of truth, including project-scoped items and optionally approved global memory.
- `listTaskRuntimeUsageEvents(taskId, limit)` from `usage_events`.
- `listProjectRuntimeUsageEvents(projectId, limit)` from `usage_events`.
- `buildProjectQueueState(projectId)` from tasks and project auto-queue setting.

These functions should reuse existing redaction/truncation paths where possible and only return bounded rows.

### API Routes

Add or complete routes:

- `GET /tasks/:id/artifact-trust`
- `GET /tasks/:id/evidence`
- `GET /tasks/:id/memory`
- `GET /tasks/:id/runtime-usage`
- `POST /tasks/:id/manual-exception`
- `POST /tasks/:id/worktree/cleanup`
- `GET /projects/:id/knowledge`
- `GET /projects/:id/runtime-usage`
- `GET /projects/:id/queue`

Existing routes remain compatible:

- `GET /tasks/:id/timeline` stays the canonical timeline read model.
- `POST /tasks/:id/events` still handles task state-machine events.
- `POST /tasks/:id/worktree/archive` and `POST /tasks/:id/worktree/delete` remain explicit cleanup routes.

`POST /tasks/:id/manual-exception` should delegate to `handleTaskEvent({ event: "manual_exception" })` and preserve existing validation. `POST /tasks/:id/worktree/cleanup` should delegate to archive or delete based on an explicit action, defaulting to archive if no action is supplied only if the schema and tests establish that behavior clearly.

### WebSocket Events

Extend `WsEventType` and payload unions with target events:

- `task:timeline_updated`
- `task:evidence_recorded`
- `task:trust_updated`
- `task:manual_handoff_required`
- `project:memory_candidate_created`
- `project:usage_updated`
- `project:queue_updated`
- `project:worktree_warning`

Event payloads should be bounded:

- task event payload: `{ id, projectId, reasonCodes?, generatedAt? }`
- manual handoff payload: `{ id, projectId, blockedReason?, reasonCodes? }`, with `blockedReason` redacted/truncated through existing redaction helpers.
- memory candidate payload: `{ id, projectId, taskId, status }`
- usage payload: `{ projectId, taskId?, runtimeProfileId? }`
- queue payload: `{ projectId, taskId? }`
- worktree warning payload: `{ projectId, taskId, warnings }`

Broadcast emission policy:

- Task create/update/move/delete should continue existing events and additionally emit queue/timeline/trust invalidation where relevant.
- Manual review or blocked external transitions should emit `task:manual_handoff_required`.
- Memory candidate creation on approve-done should emit `project:memory_candidate_created` in addition to memory item update.
- Runtime usage recording should emit `project:usage_updated`; runtime-limit events should remain `project:runtime_limit_updated`.
- Worktree inspect/archive/delete should emit `project:worktree_warning` when warnings are present.
- Internal broadcast routes should accept target event names, with existing token/dev-loopback auth and relation validation.

Task-scoped internal broadcasts must not accept caller-supplied payloads. `POST /tasks/:id/broadcast` should accept only an allow-listed type, load the task by route id, and construct bounded payloads from the task row and read models. Because the project id comes from the loaded task, task/project relation validation is not caller-controlled. Tests should cover unauthorized task broadcast rejection, invalid type rejection, bounded payload construction, and manual-handoff payload redaction/truncation.

Project-scoped internal broadcasts should continue to validate the target project, task ownership when a task id is supplied, and runtime-profile ownership/global scope when a runtime profile id is supplied. New project events should follow the same relation-validation path.

## Web UI Shape

### Task Cards

Extend task-card badges using existing compact badge style:

- intent: already present;
- runtime profile: use typed `task.effectiveRuntime`;
- cost: use task `costUsd`;
- manual review: already present;
- blocked reason family: derive from `blockedReason`;
- artifact trust: already present;
- worktree: show branch/worktree badge when present;
- scheduled: already present;
- auto-queue/auto mode: show `Auto` when task `autoMode` is true and `Manual` otherwise;
- memory candidate: show count when `memoryCandidateCount > 0`.

### Task Detail

Replace the narrow tab list with first-class operator navigation:

- Overview
- Plan
- Implementation
- Review
- Timeline
- Evidence
- Artifacts
- Memory
- Runtime
- Git
- Comments

The existing default tab logic should map to the nearest new view: review tasks open Review, tasks with implementation log open Implementation, tasks with activity but no log can open Timeline or Overview.

View contents:

- Overview: description, attachments, current blocker/trust summary, settings where applicable.
- Plan: existing plan plus sync action.
- Implementation: implementation log and manifest summary if available.
- Review: review comments plus auto-review blocker history.
- Timeline: existing `WorkflowTimelinePanel`.
- Evidence: timeline evidence rows and evidence links.
- Artifacts: timeline artifacts, claims, and attempts.
- Memory: task-scoped memory candidates.
- Runtime: effective runtime, token/cost totals, runtime-limit snapshot summary, task usage events.
- Git: branch/worktree path, worktree inspection warnings, archive/delete actions.
- Comments: existing comments.

Project knowledge should be reachable from the Memory view or an adjacent project knowledge panel. It should show source-backed memory items for the task's project, approved global entries when requested, claim source summaries, status/type/failure-family badges, and lifecycle/usage links through existing memory APIs. It must reuse the existing product memory source of truth.

### WebSocket Hook

Update `useWebSocket` so new events invalidate:

- `task:timeline_updated`, `task:evidence_recorded`, `task:trust_updated`, `task:manual_handoff_required`: task detail, task list, and task timeline queries.
- `project:memory_candidate_created`: memory queries and task memory queries.
- `project:usage_updated`: runtime usage queries, runtime profiles, task detail when taskId exists.
- `project:queue_updated`: tasks and project queue query.
- `project:worktree_warning`: task detail and task worktree query.

## Security And Safety

- Continue using `internalBroadcastAuth` for internal emit routes.
- Keep production tokening as the required path when `INTERNAL_BROADCAST_TOKEN` is configured.
- Keep development loopback fallback limited to `NODE_ENV=development`.
- Validate project/task/runtime-profile relations before project-scoped broadcast.
- Bound all new list endpoints by a small limit default and max.
- Return only sanitized metadata, summaries, warning codes, and counters.
- Use existing worktree service for cleanup; no direct recursive delete in UI or route code.

## Compatibility

Existing clients keep working because existing endpoints/events remain unchanged. New endpoints and events are additive. Existing task payloads gain optional fields used by web UI, which is backward-compatible for TypeScript/browser clients.
