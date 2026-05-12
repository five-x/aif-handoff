<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Research

## Task framing and lane

- Task ID: `work-20260512-server-side-memory-loop`.
- Lane: `work`.
- Intake source: `docs/intake/work/work-20260512-server-side-memory-loop.md`.
- RDPI needed: yes.
- Requested outcome: implement server-owned product memory for AIF Handoff so task close-out can create curated memory candidates and future planner, implementer, reviewer, and chat runtime calls can receive approved project/product memory without local Codex shared-memory tooling.
- Scope is implementation, not audit-only. "Self-learning" means retrieval and curated context injection, not model fine-tuning.

## Accepted planning sources

- Intake card frozen as immutable task intent.
- `AGENTS.md` / local instructions require local repo facts before memory recall, RDPI gates, and independent plan/test/review gates.
- `docs/architecture.md` states the monorepo packages and intended boundaries:
  - `packages/shared` owns types/schema/env/logger.
  - `packages/data` is the centralized SQLite data access layer.
  - `packages/api` exposes Hono REST and WebSocket.
  - `packages/agent` coordinates planner, implementer, and reviewer stage runs through `@aif/runtime`.
  - `packages/web` is the React UI.
- `docs/api.md` documents existing API conventions: Hono routers, JSON endpoints, WebSocket invalidation events, task/chat/runtime profile routes, and task-aware chat context injection.
- `docs/configuration.md` documents server deployment via env vars, SQLite `DATABASE_URL`, isolated project mounts, runtime profile defaults, and the distinction between runtime profiles and local/project MCP setup.
- Prior readiness audit `docs/rdpi/work/work-20260512-server-project-readiness-audit/result.md` recorded finding F6: memory/self-learning is currently operator-driven through local RDPI/memsync artifacts, not server-automatic.
- Static source facts:
  - `packages/shared/src/schema.ts` has tables for projects, tasks, task comments, runtime profiles, chat sessions/messages, usage events, runtime warmup, roadmap artifacts, and Codex indexes, but no product memory tables.
  - `packages/shared/src/db.ts` creates tables manually, runs versioned `PRAGMA user_version` migrations, and bootstraps indexes idempotently.
  - `packages/data/src/index.ts` maps database rows to API-safe domain objects and is the correct place for memory repository functions.
  - `packages/agent/src/subagents/planner.ts`, `implementer.ts`, and `reviewer.ts` hand-build stage prompts before calling `executeSubagentQuery`.
  - `packages/agent/src/subagentQuery.ts` centralizes runtime execution context, query audit, task session reuse, activity logging, and runtime `systemPromptAppend`.
  - `packages/api/src/routes/chat.ts` builds chat `systemPromptAppend` with project/task context and already redacts task fields before prompt injection.
  - `packages/api/src/routes/tasks.ts` handles `approve_done`, where tasks move from `done` to `verified`. That is the strictest hook for "successful close-out" because `done` may still be reopened with `request_changes`.
  - `packages/web/src/lib/api.ts`, React Query hooks, and header dialogs provide the existing UI/API integration pattern.
- Read-only explorer subagent confirmed the same static facts and recommended `approve_done -> verified` as the candidate extraction hook.
- No live service, endpoint, scheduler, log, downstream runtime/config, or shared-memory probing was performed before `PLAN PASS`.

## Same-project memory

- Same-project memory could contain prior decisions about runtime-neutral prompt injection, qwen-local-agent behavior, and memory close-out semantics.
- It was not queried before `PLAN PASS` because local RDPI instructions forbid shared-memory recall during planning unless the user explicitly waives that boundary.

## Cross-project reusable patterns

- Reusable local pattern from current code: usage/audit history should be append-only (`usage_events` precedent) and read-model surfaces should expose sanitized summaries instead of raw provider/runtime payloads.
- Reusable local pattern from current code: create schema in `schema.ts`, idempotent bootstrap/migrations/indexes in `db.ts`, data access in `@aif/data`, API route schemas in `packages/api/src/schemas.ts`, web client methods in `packages/web/src/lib/api.ts`, and React Query hooks for UI.
- No cross-project memory was queried before `PLAN PASS`.

## Rejected or stale memory candidates

- No memory candidates were queried or rejected.
- Do not reuse local `docs/memory/**` or Codex shared-memory tooling as the runtime source of truth. The task explicitly requires server-owned memory independent of local Codex tooling and `.mcp.json`.

## Open questions

- Whether extraction should run at `done` or `verified`: chosen hypothesis is `verified`, because that is the human-approved close-out state and avoids generating candidates from work that may still receive `request_changes`.
- Whether auto-publish should exist in the MVP: chosen hypothesis is no. Candidates remain pending until manually approved because the task requires reviewability unless a safe auto-publish path is proven.
- Whether FTS must be strict ranking or can fall back gracefully: chosen hypothesis is SQLite FTS5-backed search with a safe fallback to recent approved memories if a query is empty.
- Whether memory writes should block task completion: chosen hypothesis is no by default. Extraction failures should be logged/audited and not block ordinary `approve_done`, matching the intake constraint.

## Hypotheses

- A `memory_items` table can represent both pending candidates and approved/expired/rejected memory, avoiding a separate candidate table for MVP.
- A `memory_usage_events` table can provide the task/chat audit trail for injected memory without overloading `agentActivityLog`.
- A deterministic server-side extraction heuristic is acceptable for MVP because it produces reviewable candidates and avoids relying on another runtime call during close-out.
- Publication-grade redaction should use existing provider text redaction plus an explicit publication blocker when secret-shaped material is detected in the original or edited memory body.
- Prompt injection can be added centrally enough by formatting retrieved approved memory and prepending it to stage/chat prompts or `systemPromptAppend`, with citations such as `[memory:<id>]`.
- API/UI can ship as a small memory review dialog first: list pending/approved/rejected/expired items, inspect content, approve, reject, and expire.
