# Research: System TZ Source Backed Memory Knowledge

## Task framing and lane

- Task ID: `work-20260515-system-tz-source-backed-memory-knowledge`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260515-system-tz-source-backed-memory-knowledge.md`
- RDPI path: `docs/rdpi/work/work-20260515-system-tz-source-backed-memory-knowledge`
- RDPI needed: yes
- Scope: upgrade the existing server-side product memory model into a source-backed knowledge layer. Do not create a parallel filesystem or shared-memory source of truth.

## Accepted planning sources or local facts

- `AGENTS.md` and `.agents/skills/runtask/SKILL.md` require RDPI, independent gates, and local repo facts before memory recall.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, section 10, defines the target memory/knowledge layer: typed memory items, source-backed claims, failure families, bounded role-specific memory briefs, knowledge lint, and optional `.aif-knowledge/` export as cache only.
- `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, Phase 5 and P1, names memory types, source-backed claims, failure families, memory brief, and memory lint as this task's deliverables.
- `docs/kb/system-tz-contract-inventory-freeze.md` is the accepted Phase 0 planning source for System TZ tasks. It freezes current server-side memory as product memory in SQLite and names this task as the owner for source-backed memory claim graph work.
- `docs/rdpi/work/work-20260512-server-side-memory-loop/result.md` records the predecessor memory loop: SQLite memory items, lifecycle events, usage events, redaction blocking, approved prompt retrieval, role prompt injection, API routes, Memory Review UI, and docs.
- `docs/api.md`, `docs/architecture.md`, and `docs/configuration.md` describe current memory as AIF-owned product memory, not Codex shared-memory. Approved memory is reference-only and usage-audited.
- `packages/shared/src/types.ts` currently exposes `MemoryItem` with scope, source task/ref, status, redaction status, review note, title, summary, content, tags, and timestamps. It does not expose memory item type, claim graph, failure family, supersedes/contradicts, or last validated claim timestamps.
- `packages/shared/src/schema.ts` and `packages/shared/src/db.ts` currently define `memory_items`, `memory_usage_events`, and `memory_lifecycle_events`. The current `memory_items` table has single `source_task_id`, `source_kind`, and `source_ref` fields but no structured claims.
- `packages/data/src/index.ts` owns memory creation, redaction review, lifecycle recording, prompt retrieval, prompt formatting, and usage recording. Approval currently blocks only redaction-blocked memory; it does not require source-backed claims.
- `packages/api/src/routes/memory.ts` and `packages/api/src/schemas.ts` expose create/update/approve/reject/expire and usage/lifecycle routes. The API schema currently accepts only item text, tags, source task/ref, and scope.
- `packages/agent/src/memoryContext.ts` retrieves approved memory for planner, implementer, reviewer, and security review and records usage events.
- `packages/api/src/routes/chat.ts` retrieves approved memory for chat and records usage events with `workflowKind: "chat"`.
- `packages/web/src/components/memory/MemoryDialog.tsx` reviews memory items and blocks approval for redaction-blocked items. It shows task presence only as a small badge; it does not show structured claim sources, artifact links, or evidence links.
- Existing focused tests cover memory repository behavior in `packages/data/src/__tests__/index.test.ts`, memory API behavior in `packages/api/src/__tests__/memory.test.ts`, workflow timeline memory candidate projection in `packages/data/src/__tests__/workflowTimeline.test.ts`, and Web UI memory dialog behavior indirectly through API/hook surfaces.

## Same-project memory

- `docs/memory/tasks/work/work-20260512-server-side-memory-loop-delta.md` records reusable local decisions: memory candidates are generated at `verified`; memory is retrieval/context injection, not fine-tuning or local shared-memory; approved retrieval writes usage rows; lifecycle actions are append-only; prompt context must be reference-only.
- `docs/memory/tasks/work/work-20260515-system-tz-contract-inventory-freeze-delta.md` records that `memory_items` is the current compatibility source for `MemoryClaim`; `memory_lifecycle_events` and `memory_usage_events` are existing audit trails; current records lack first-class source-backed claim IDs, supersedes/contradicts relationships, and last validated evidence bindings.
- `docs/memory/projects/aif-handoff/capsule.md` was considered only as a pointer to current project memory freshness. It adds no task-specific implementation detail beyond local RDPI/docs.

## Cross-project reusable patterns

- None used. Local repo docs and same-project curated memory were sufficient.

## Rejected or stale memory candidates

- No shared-memory recall was used before `PLAN PASS`, per the RDPI boundary and System TZ freeze rule.
- Optional `.aif-knowledge/` export is rejected for this implementation slice because the intake explicitly allows it only as export/cache and the existing SQLite memory model is the source of truth.
- A separate memory source of truth is rejected. All planned changes extend existing `memory_items`, API, data, prompt, and UI surfaces.

## Scope boundaries

- In scope:
  - typed memory item vocabulary;
  - structured memory claims with sources, supersedes, contradicts, and last validation timestamp;
  - approval blocking for sourceless or redaction-blocked memory;
  - representable known failure families;
  - bounded source-backed memory brief formatting for planner, implementer, reviewer, security review, and chat;
  - UI visibility for task/artifact/evidence/code source links;
  - focused repository/API/UI tests and documentation updates.
- Out of scope:
  - replacing shared-memory or server-side product memory;
  - filesystem knowledge export;
  - generic artifact/claim/evidence persistence beyond memory claim JSON compatibility fields;
  - runtime scheduler/log/endpoint probing;
  - automatic periodic knowledge lint scheduler. This task can add deterministic validation helpers/tests, but a periodic runner would need a separate owner unless it is already present.

## Open questions and assumptions

- Assumption: `memory_items` remains the source of truth. Structured claims can be stored as JSON on each memory item for this slice rather than introducing first-class claim/source tables.
- Assumption: existing `sourceTaskId/sourceRef` should be converted into or treated as a default claim source so verified-task candidates remain compatible.
- Assumption: source ref validation should be structural and fail-closed for approval; deep existence validation for artifacts/evidence/code paths can be added later by a dedicated knowledge-lint task if needed.

## Proposed verification inputs

- Shared/data tests for typed memory items, claim normalization, source-required approval, redaction-blocked approval, claim prompt formatting, known failure families, and usage event preservation.
- API tests for create/update/approve with source-backed claims and sourceless approval rejection.
- Web component tests or focused existing UI tests for displaying task/artifact/evidence/code links in the memory review dialog.
- Focused build/lint/test commands for touched packages.
