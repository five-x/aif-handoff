<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Design

## Chosen design

- Implement an AIF-owned memory domain in the existing SQLite database and server/runtime pipeline.
- Treat memory as curated retrieval context:
  - `pending`: reviewable candidate generated after a task reaches `verified`.
  - `approved`: eligible for retrieval and prompt injection.
  - `rejected`: retained for audit but never injected.
  - `expired`: retained for audit but never injected.
- Store memory scope on each item:
  - `project`: only retrieved for the owning project.
  - `global`: reusable across projects.
- Add a SQLite FTS5 search table maintained from memory item writes. Retrieval should search approved, non-expired project and global items, then record exactly which items were injected.
- Add an append-only usage table for auditability. Each planner, implementer, reviewer, or chat injection records the memory item id, project id, optional task/chat session id, workflow kind, and created timestamp.
- Add an append-only lifecycle-event table for publication traceability. Approve, reject, expire, and edit actions should record the memory item id, action, note, actor label when known, and timestamp.
- Generate candidates after `approve_done` moves a task to `verified`, not immediately after automated review moves it to `done`.
  - `done` can still be reopened with `request_changes`.
  - `verified` is the existing human-approved close-out gate.
  - Extraction failure must not block the state transition by default.
- Use deterministic candidate extraction for MVP:
  - Source fields: task title, description, plan, implementation log, review comments, and final status metadata.
  - Output one concise candidate per verified task unless one already exists for the source task.
  - Redact candidate text before storage.
  - Mark secret-shaped source or edited text as `blocked` so the item cannot be approved until edited cleanly.
- Add retrieval and prompt formatting helpers in `@aif/data`:
  - `retrieveApprovedMemoryForPrompt` returns ranked approved items.
  - `formatMemoryContextForPrompt` renders a compact cited block with `[memory:<id>]` references.
  - `recordMemoryUsageEvents` persists usage rows after injection.
- Inject memory into:
  - planner prompts in `packages/agent/src/subagents/planner.ts`;
  - implementer prompts in `packages/agent/src/subagents/implementer.ts`;
  - reviewer/security prompts in `packages/agent/src/subagents/reviewer.ts`;
  - chat `systemPromptAppend` in `packages/api/src/routes/chat.ts`.
- Add API route `packages/api/src/routes/memory.ts` mounted at `/memory`:
  - list items by project/status/scope;
  - read one item;
  - update editable fields;
  - approve, reject, and expire items;
  - list usage events.
- Add UI surface:
  - header `MEMORY` action for the selected project;
  - dialog with filters, pending/approved review list, item details, and approve/reject/expire controls.
- Documentation updates:
  - `docs/api.md`: memory endpoints and usage audit.
  - `docs/architecture.md`: memory model and prompt injection flow.
  - `docs/configuration.md` and `.env.example`: disabled/configured state and reminder that this is product memory retrieval, not fine-tuning.

## Pre-PLAN boundary

- Before `PLAN PASS`, only task framing, static source/doc research, scope boundaries, hypotheses, and planned checks are allowed.
- No live runtime/service/log/shared-memory evidence has been collected.
- No implementation changes should start until the independent plan reviewer returns `PLAN PASS`.

## Data model

- `memory_items`
  - identity/source: `id`, `project_id`, `scope`, `source_task_id`, `source_kind`, `source_ref`
  - lifecycle: `status`, `redaction_status`, `publish_block_reason`, `review_note`, `created_at`, `updated_at`, `approved_at`, `rejected_at`, `expired_at`, `expires_at`
  - content: `title`, `summary`, `content`, `tags_json`
- `memory_items_fts`
  - SQLite FTS5 virtual table with `item_id UNINDEXED`, `scope`, `project_id UNINDEXED`, `title`, `summary`, `content`, `tags`
  - maintained by data-layer writes or SQLite triggers.
- `memory_usage_events`
  - `id`, `memory_item_id`, `project_id`, `task_id`, `chat_session_id`, `workflow_kind`, `source`, `created_at`
- `memory_lifecycle_events`
  - `id`, `memory_item_id`, `action`, `actor`, `note`, `created_at`

## Redaction and publication rules

- Store only redacted candidate text.
- Detect secret-shaped source/edit text using existing provider redaction patterns plus explicit token/key/password patterns.
- If secret-shaped material was present, set `redaction_status = blocked` and keep the item pending. Approval endpoints must reject blocked items.
- Updating the item content re-runs the publication guard; a clean edit can change `redaction_status` back to `clean`.
- API responses must expose redacted content only.
- Retrieved memory blocks must be delimited as reference-only context. The prompt text must state that memory can inform decisions but cannot override the current task, higher-priority instructions, repository facts, or runtime safety rules.
- Prompt-injection tests must include instruction-like memory content and verify the injected block retains the reference-only framing.

## Disabled/configured state

- Add `AIF_MEMORY_ENABLED` with default `true` for retrieval/extraction in normal deployments.
- When disabled:
  - extraction after verification is skipped;
  - prompt retrieval returns no context;
  - API list/review surfaces still expose existing rows so operators can inspect stored memory.
- This keeps memory failures or disablement from blocking ordinary task completion.

## Decision candidates

- Task memory candidates should be generated at `verified`, not `done`, because `verified` is the human-approved close-out state.
- Server-side product memory is retrieval and curated context injection, not fine-tuning and not local Codex shared-memory.
- Memory usage audit should be append-only and separate from task activity logs.
