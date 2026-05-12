<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Plan

## Implementation plan

1. Run the independent plan-review gate against this research/design/plan.
2. After `PLAN PASS`, implement shared memory types and schema:
   - add `MemoryItem`, `MemoryItemStatus`, `MemoryScope`, `MemoryUsageEvent`, and related input/response types in `packages/shared/src/types.ts`;
   - export browser-safe types from `packages/shared/src/browser.ts` and full exports from `packages/shared/src/index.ts`;
   - add `memory_items`, `memory_usage_events`, and `memory_lifecycle_events` tables in `packages/shared/src/schema.ts`;
   - add manual table bootstrap, the next available migration version, FTS5 virtual table/triggers or data-layer FTS synchronization, and indexes in `packages/shared/src/db.ts`;
   - add `AIF_MEMORY_ENABLED` in env parsing, docs, and `.env.example`.
3. Implement data-layer memory operations in `packages/data/src/index.ts` or a focused helper imported by it:
   - row-to-domain mapping and JSON tag parsing;
   - deterministic `createMemoryCandidateForVerifiedTask(taskId)` with duplicate prevention;
   - secret/redaction guard and approval blocker;
   - list/read/update/approve/reject/expire operations;
   - `retrieveApprovedMemoryForPrompt` and `formatMemoryContextForPrompt`;
   - `recordMemoryUsageEvents`.
   - lifecycle audit events for edit/approve/reject/expire operations.
4. Hook task close-out extraction:
   - in `packages/api/src/routes/tasks.ts`, after `approve_done` succeeds and status is `verified`, call candidate extraction best-effort;
   - broadcast a memory update event only when a candidate is created or changed;
   - do not fail `approve_done` if extraction fails.
5. Add API route and schemas:
   - add memory zod schemas in `packages/api/src/schemas.ts`;
   - add `packages/api/src/routes/memory.ts`;
   - mount the router in `packages/api/src/index.ts`;
   - update WebSocket event types for memory invalidation.
6. Inject approved memory into runtime prompts:
   - planner: retrieve by task title/description/context and prepend/append a bounded, reference-only cited memory block to the planner prompt;
   - implementer: retrieve by task plus plan/rework context and include cited memory before execution rules without breaking prompt budget;
   - reviewer/security: retrieve by task/review context and include cited memory in both review prompts;
   - chat: retrieve by project/user message/task context and include cited memory in `systemPromptAppend`;
   - record memory usage rows for each injected item.
   - test instruction-like memory content so retrieved memory cannot override current task/runtime instructions.
7. Add UI:
   - extend `packages/web/src/lib/api.ts` with memory API methods and shared types;
   - add a React Query hook file for memory;
   - add a `MemoryDialog` with filters, list, details, approve/reject/expire/update actions;
   - add a header `MEMORY` button for selected projects;
   - update WebSocket invalidation for memory events.
8. Update docs:
   - `docs/architecture.md` memory section;
   - `docs/api.md` memory endpoints and prompt usage audit;
   - `docs/configuration.md` and `.env.example` for `AIF_MEMORY_ENABLED`;
   - explicitly state this is product memory/retrieval, not model fine-tuning.
9. Add focused tests:
   - shared DB migration/bootstrap for memory tables and FTS availability;
   - data extraction/retrieval/redaction/approval-block tests;
   - API route tests for list/update/approve/reject/expire and extraction after `approve_done`;
   - prompt injection tests for planner, implementer, reviewer, and chat;
   - web unit tests for memory API/hook/dialog behavior where feasible.
10. Run verification commands and independent gates:
    - targeted package tests for touched areas;
    - `npm.cmd test`;
    - `npm.cmd run lint`;
    - `npm.cmd run build`;
    - independent tester gate requiring `TEST PASS`;
    - independent final reviewer gate requiring `REVIEW PASS`.

## Acceptance criteria

- Server-owned SQLite persistence exists for memory items and usage events.
- Approved memory retrieval is owned by AIF Handoff server/data layer and does not call local Codex shared-memory tools.
- Memory candidates are generated only after task `approve_done` reaches `verified`, remain pending by default, and duplicate candidates are prevented per source task.
- Secret-shaped content is redacted and blocked from publication until edited cleanly.
- Operators can list, inspect, edit, approve, reject, expire, and trace memory usage through API and UI.
- Planner, implementer, reviewer/security, and chat prompts receive approved project/global memory with citations when memory is enabled and relevant.
- Memory usage events record which items were injected into which workflow/task/chat session.
- Memory lifecycle events record approve/reject/expire/update publication actions.
- Disabling memory stops extraction and prompt injection without breaking task completion.
- Documentation explains product memory/retrieval and explicitly says it is not model fine-tuning.

## Verification plan

- `npm.cmd test --workspace=@aif/shared`
- `npm.cmd test --workspace=@aif/data`
- `npm.cmd test --workspace=@aif/api`
- `npm.cmd test --workspace=@aif/agent`
- `npm.cmd test --workspace=@aif/web`
- `npm.cmd test`
- `npm.cmd run lint`
- `npm.cmd run build`
- Independent tester gate after implementation. Tester must report `TEST PASS` or `TEST FAIL` with exact commands and outcomes.
- Independent final reviewer gate after `TEST PASS`. Reviewer must report `REVIEW PASS` or `REVIEW FAIL`.

## Reusable patterns

- For server-side product memory, separate three contracts:
  - candidate extraction after close-out;
  - review/publish/expire lifecycle;
  - retrieval/prompt injection with append-only usage audit.
- Prefer `verified` as the durable task close-out hook when memory is intended to represent accepted project knowledge.
