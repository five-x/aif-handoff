# Research

## Task Framing And Lane

- Task ID: `work-20260515-system-tz-operator-api-ws-trust-surfaces`
- Lane: `work`
- Intake source: `docs/intake/work/work-20260515-system-tz-operator-api-ws-trust-surfaces.md`
- RDPI needed: yes
- Scope: expose existing System TZ trust-backbone state through operator REST, WebSocket, and UI surfaces. The task is implementation work, not a semantic redesign of trust.

The intake requires REST or equivalent API surfaces for task timeline, artifact trust, evidence, project knowledge, project runtime usage, manual exception action, and worktree cleanup action. It also requires WebSocket coverage for timeline, evidence, trust, manual handoff, memory candidate, usage, queue, and worktree warnings, plus task-card and task-detail operator UI surfaces.

## Accepted Planning Sources Or Local Facts

### System TZ Source

The source document names the target REST surfaces as:

- `GET /tasks/:id/timeline`
- `GET /tasks/:id/artifact-trust`
- `GET /tasks/:id/evidence`
- `GET /projects/:id/runtime-usage`
- `POST /tasks/:id/manual-exception`
- `POST /tasks/:id/worktree/cleanup`

It names target WebSocket events:

- `task:timeline_updated`
- `task:evidence_recorded`
- `task:trust_updated`
- `task:manual_handoff_required`
- `project:memory_candidate_created`
- `project:usage_updated`
- `project:queue_updated`
- `project:worktree_warning`

It names task card and detail operator views for blocked reason, manual review, artifact trust, runtime, worktree, queue, evidence, memory, Git, and comments. Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 14 and 15.

### Existing Trust Backbone

The contract inventory says the repo already has task intent contracts, plan quality checks, runtime profiles, server-side memory, audit evidence events, audit artifact attempts, workflow timeline DTOs, worktree isolation, auto-review, and usage events, but they are not yet unified as one operator surface. Source: `docs/kb/system-tz-contract-inventory-freeze.md`.

Current package ownership:

- `packages/shared` owns shared task, timeline, trust, memory, runtime, and WebSocket DTO contracts.
- `packages/data` owns database reads, timeline construction, trust rollup construction, memory records, and usage persistence.
- `packages/api` owns Hono routes, WebSocket broadcasts, task events, and worktree lifecycle services.
- `packages/web` owns task cards/detail, timeline UI, memory dialog, runtime usage UI, and WebSocket cache invalidation.

### Existing API Surfaces

- `packages/api/src/routes/tasks.ts` already adds `artifactTrust` and `effectiveRuntime` to task route responses.
- `packages/api/src/routes/tasks.ts` already exposes `GET /tasks/:id/timeline`.
- `packages/api/src/routes/tasks.ts` already exposes `GET /tasks/:id/worktree`, `POST /tasks/:id/worktree/archive`, and `POST /tasks/:id/worktree/delete`.
- `packages/api/src/routes/tasks.ts` already handles `manual_exception` through `POST /tasks/:id/events` with `manualExceptionJustification`.
- `packages/api/src/routes/projects.ts` already exposes project internal broadcast for auto-queue and runtime-limit events with project/task/runtime-profile relation validation.
- `packages/api/src/routes/tasks.ts` exposes task internal broadcast with only a caller-supplied event type; the server loads the task row and constructs the payload itself.
- `packages/api/src/middleware/internalBroadcastAuth.ts` already enforces configured token auth, test bypass, and development loopback fallback.

Gap: dedicated REST surfaces for artifact trust, evidence, task memory candidates, task runtime usage, project runtime usage, project queue state, manual-exception alias, and `worktree/cleanup` alias are absent or only indirectly covered.

### Existing Project Knowledge Surface

- `packages/api/src/routes/memory.ts` exposes the current server-side product memory API. `GET /memory` can filter by `projectId`, `status`, `scope`, and `includeGlobal`.
- `packages/data/src/index.ts` stores project/global source-backed memory in `memory_items` and lifecycle/usage in `memory_lifecycle_events` and `memory_usage_events`.
- `packages/web/src/components/memory/MemoryDialog.tsx` already provides a project-scoped memory review UI, but task detail does not have a first-class project knowledge/operator memory view and there is no project-route alias named as "knowledge".

Gap: project knowledge is technically available through `/memory`, but the System TZ operator API needs an explicit project knowledge surface or a documented/tested equivalent. The implementation should add a project-owned `GET /projects/:id/knowledge` projection that wraps the existing memory source of truth rather than creating a second knowledge store.

### Existing WebSocket Contract

- `packages/shared/src/types.ts` defines current WebSocket event names.
- `packages/api/src/ws.ts` broadcasts full event JSON to every connected client.
- `docs/api.md` states `/ws` is a broadcast channel with no topic subscriptions and must not include raw provider diagnostics or secrets.
- Current WebSocket behavior is mostly cache invalidation: task created/updated/moved/deleted, project updates, runtime-limit invalidation, memory item lifecycle, chat events, and commit lifecycle.

Gap: named trust/timeline/evidence/manual-handoff/memory-candidate/usage/queue/worktree-warning events are not yet in the shared contract or web invalidation hook.

### Existing Data Models

- `packages/shared/src/types.ts` defines `Task`, `WorkflowTimeline`, `WorkflowTimelineArtifact`, `WorkflowTimelineAttempt`, `WorkflowTimelineClaim`, `WorkflowTimelineEvidence`, `WorkflowTimelineEvidenceLink`, `WorkflowTimelineEvent`, and `TaskArtifactTrustRollup`.
- `packages/data/src/index.ts` builds generic task timelines from task fields, manifests, memory candidates, work branch metadata, and blocker state.
- `packages/data/src/index.ts` builds roadmap/audit artifact trust rollups, with generic fallback trust rollups for non-audit tasks.
- `packages/data/src/index.ts` persists append-only runtime usage events into `usage_events` and rolls up task/project/chat totals.
- `packages/data/src/index.ts` has memory item creation/listing/lifecycle, but task-scoped memory candidate listing is currently private.

Gap: usage event rows and task-scoped memory candidates need safe public read projections for operator views.

### Existing UI Surfaces

- `packages/web/src/components/kanban/TaskCard.tsx` already shows manual review, artifact trust, plan quality, priority, intent, scheduled state, runtime-limit blocked details, and blocked reason text.
- `packages/web/src/components/task/TaskDetailHeader.tsx` already shows status, manual review, paused, artifact trust details, plan quality, token/cost totals, runtime-limit blocked details, and tabs for Implementation, Review, Comments, Activity, Timeline.
- `packages/web/src/components/task/TaskDetail.tsx` already fetches task and timeline and renders description, attachments, worktree path, settings, plan, implementation/review/activity/timeline, and comments.
- `packages/web/src/components/task/WorkflowTimelinePanel.tsx` already renders artifacts, evidence, claims, attempts, and events.

Gap: requested detail views are not first-class navigation. Missing or weak surfaces include Overview, Plan, Evidence, Artifacts, Memory, Runtime, Git/worktree action, runtime profile badge, blocked reason family badge, memory candidate badge, worktree badge/warnings, and queue/auto-mode badges.

### Existing Worktree Safety

- `packages/api/src/services/taskWorktrees.ts` performs fail-closed worktree inspect/archive/delete safety checks.
- Cleanup is verified-task only and checks expected path, branch, git repo, git worktree registry, root alias containment, archive collision, and disk warning advisory.

Gap: web API/hooks and UI do not expose inspect warnings or cleanup actions; only `task.worktreePath` is rendered.

## Same-Project Memory

No shared-memory MCP recall was used before `PLAN PASS`, because the repo RDPI contract forbids shared-memory recall and runtime-visible probing before plan approval unless explicitly waived.

Local same-project memory artifacts and RDPI results were used as static local docs:

- `docs/rdpi/work/work-20260515-system-tz-workflow-timeline-trust-backbone/result.md` says generic workflow timelines and task trust rollups already exist for non-audit tasks and preserve the audit/roadmap path as priority.
- `docs/rdpi/work/work-20260515-system-tz-runtime-governance-usage-budget/result.md` says runtime usage events, outcomes, runtime-limit fallback/blocking policy, and budget gates are implemented.
- `docs/rdpi/work/work-20260515-system-tz-orchestration-worktree-reliability/result.md` says task worktree inspect/archive/delete APIs and fail-closed safety are implemented server-side.
- `docs/rdpi/work/work-20260515-system-tz-source-backed-memory-knowledge/result.md` says source-backed memory item types, claims, redaction, lifecycle, and UI review surfaces exist.

These local artifacts support an additive operator-surface implementation rather than introducing new trust semantics or persistence.

## Cross-Project Reusable Patterns

None used. The implementation should follow existing local route/data/UI patterns rather than importing cross-project patterns.

## Rejected Or Stale Memory Candidates

- Shared-memory recall was intentionally not queried before `PLAN PASS`.
- Stale API docs are not treated as runtime truth where code disagrees. The current code already has some surfaces not fully reflected in docs and lacks some System TZ target events.

## Planning Hypotheses

- The lowest-risk backend approach is additive: expose bounded projections of existing timeline/trust/evidence/memory/usage/worktree state instead of changing persistence or trust classification.
- The lowest-risk WebSocket approach is bounded invalidation payloads that carry IDs, project relation, and warning/reason codes only, never raw logs, raw provider diagnostics, artifact bodies, or command output.
- The lowest-risk UI approach is to reuse `WorkflowTimelinePanel`, `TaskDetailHeader`, `TaskCard`, and existing badges/components while adding the missing operator navigation and read-only summaries.
