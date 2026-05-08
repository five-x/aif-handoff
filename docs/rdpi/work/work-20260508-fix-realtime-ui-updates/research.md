<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Research

## Task framing and lane

- Task ID: `work-20260508-fix-realtime-ui-updates`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260508-fix-realtime-ui-updates.md`.
- Task intent: fix confirmed gaps where the web UI does not update online across open clients after backend state changes.
- RDPI needed: yes, because the change spans shared WS types, API routes, frontend websocket cache invalidation, and tests.

## Accepted planning sources

- Frozen task card:
  - `docs/intake/work/work-20260508-fix-realtime-ui-updates.md`
- Governing local docs and instructions:
  - `AGENTS.md`
  - `.agents/skills/runtask/SKILL.md`
  - `.agents/skills/rdpi/SKILL.md`
  - `docs/architecture.md`
  - `docs/api.md`
- Static repo facts gathered before `PLAN PASS`:
  - `packages/shared/src/types.ts` defines `WsEventType` and `WsEvent` payload unions. It currently includes `project:created`, task events, chat stream events, `chat:session_created`, `chat:session_deleted`, runtime-limit, warmup, and commit events, but not project update/delete, runtime settings/profile, task comment, or chat session update events.
  - `packages/api/src/ws.ts` provides both per-client `sendToClient` and broadcast-channel `broadcast`.
  - `packages/api/src/routes/projects.ts` broadcasts `project:created`, but project update/delete return without a project update/delete broadcast.
  - `packages/api/src/routes/runtimeProfiles.ts` create/update/delete runtime profiles without a realtime broadcast.
  - `packages/api/src/routes/settings.ts` updates app runtime defaults and project config without a realtime broadcast.
  - `packages/api/src/routes/tasks.ts` broadcasts task mutations, but comment creation returns the created comment without a comment event.
  - `packages/api/src/routes/chat.ts` broadcasts chat session create/delete, but not session update/rename. Chat tokens, done, and errors are sent to the initiating websocket client via `sendToClient`.
  - `packages/web/src/hooks/useWebSocket.ts` invalidates task, auto-queue, runtime-limit, warmup, delete, roadmap, and commit surfaces, but not project create/update/delete, runtime profile/settings changes, task comments, or chat session updates.
  - `packages/web/src/hooks/useRuntimeProfiles.ts`, `useProjects.ts`, `useTasks.ts`, and `useChatSessions.ts` have local mutation invalidations for the initiating client.
- Relevant tests to extend:
  - API: `packages/api/src/__tests__/projects.test.ts`, `runtimeProfiles.test.ts`, `settings.test.ts`, `tasks.test.ts`, `chatSessions.test.ts`.
  - Web: add or extend focused tests around websocket-driven invalidation, likely including `useWebSocket` coverage and `useChatSessions.test.ts`.
- Boundary:
  - No runtime-visible probes, live service checks, scheduler reads, log inspection, or memory recall were performed before `PLAN PASS`.

## Same-project memory

- Not queried before `PLAN PASS`.
- Same-project memory may be useful after implementation only if the final pattern for realtime invalidation should be captured as reusable project knowledge.

## Cross-project reusable patterns

- Not queried before `PLAN PASS`.
- Local reusable pattern from the existing codebase: backend emits typed WS events through `broadcast`, frontend converts WS messages into React Query invalidations or custom DOM events, and initiating-client hooks still keep local mutation invalidations for immediate feedback.

## Rejected or stale memory candidates

- None.

## Open questions

- Whether project config writes through `PUT /settings/config` should receive a dedicated `settings:config_updated` event or be folded into a broader runtime/settings invalidation event. Current intake emphasizes app/project runtime defaults and online UI state, so a broad settings invalidation event is likely sufficient.
- Whether chat transcript streaming should become true live multi-client streaming. Current code shape points away from broad token broadcast because token state is client-local and keyed by initiating `conversationId`; deterministic session refresh on completion is lower risk.
- The current WebSocket channel is a broadcast channel without topic subscriptions or per-project authorization in `ws.ts`. Therefore any new broad chat event must be metadata-only and frontend handlers must filter by project/session before invalidating.

## Hypotheses

- Adding explicit WS event types for project update/delete, runtime profile changes, app runtime defaults/settings changes, task comments, and chat session update will compile cleanly with the existing payload union once shared types are extended.
- Frontend `useWebSocket` can centralize all cross-client invalidation without changing the React Query client setup.
- Existing local mutation invalidations should remain for immediate UI response; new WS invalidations will cover other clients and eventual consistency.
- Chat stream fanout should be implemented as metadata-only session update/completion invalidation and not broad token fanout.
