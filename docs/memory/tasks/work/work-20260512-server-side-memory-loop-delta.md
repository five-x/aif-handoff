<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260512-server-side-memory-loop::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260512-server-side-memory-loop
source_path: docs/rdpi/work/work-20260512-server-side-memory-loop
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-12
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260512-server-side-memory-loop/research.md
- docs/rdpi/work/work-20260512-server-side-memory-loop/design.md
- docs/rdpi/work/work-20260512-server-side-memory-loop/plan.md
- docs/rdpi/work/work-20260512-server-side-memory-loop/result.md
  created_at: 2026-05-12
  last_verified_at: 2026-05-12

---

# Summary

Curated delta for task work-20260512-server-side-memory-loop.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Task memory candidates should be generated at `verified`, not `done`, because `verified` is the human-approved close-out state.
- Server-side product memory is retrieval and curated context injection, not fine-tuning and not local Codex shared-memory.
- Memory usage audit should be append-only and separate from task activity logs.
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

## Patterns

- For server-side product memory, separate three contracts:
- candidate extraction after close-out;
- review/publish/expire lifecycle;
- retrieval/prompt injection with append-only usage audit.
- Prefer `verified` as the durable task close-out hook when memory is intended to represent accepted project knowledge.
