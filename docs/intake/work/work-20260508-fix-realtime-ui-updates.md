# Fix Realtime UI Update Coverage

- Task ID: work-20260508-fix-realtime-ui-updates
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-08
- Due: unset
- Source: user request from UI realtime audit findings, 2026-05-08
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260508-fix-realtime-ui-updates

## Request

Fix the confirmed gaps where the web UI does not update online across open clients after backend state changes.

The intake is based on four audit findings:

- Project changes are not realtime.
- Runtime settings are local-only.
- Task comments do not broadcast.
- Chat rename and stream visibility are partial.

## Done When

- Project create, update, and delete flows have consistent WebSocket events and all open clients refresh affected `projects` state, selected project details, project defaults, and related runtime/warmup state where applicable.
- Runtime profile create, update, and delete flows have consistent WebSocket events and all open clients refresh `runtimeProfiles`, `appRuntimeDefaults`, `settings`, effective task/chat runtime queries, and any dependent project/task views.
- App runtime default updates and project runtime default changes are covered by the same realtime invalidation strategy.
- Task comment creation emits a realtime event and other open task detail views refresh `task-comments` for the affected task.
- Chat session rename/update emits a realtime event and other open chat session lists refresh without relying on local mutation callbacks.
- Chat transcript streaming scope is explicitly resolved during RDPI, then implemented so same-session viewers either receive live updates or refresh deterministically at completion without stale visible state.
- Shared `WsEventType` and payload types describe the new events without unsafe casts.
- Focused tests cover server broadcasts and frontend query invalidation for the affected surfaces.
- Existing task board realtime behavior remains intact.

## Constraints

- Intake only for this turn; do not implement the fixes in the same step that creates this task.
- Follow RDPI before repository changes.
- Keep changes narrow to realtime events, query invalidation, and related type/test coverage.
- Do not redesign the API, React Query setup, or WebSocket transport unless RDPI proves it is necessary.
- Preserve privacy/scope boundaries for chat stream fanout; do not broadcast client-private data broadly without an explicit design decision.
- After implementation, run focused API/web tests first, then `npm.cmd run build`, `npm.cmd run lint`, and `npm.cmd test` when feasible.

## Notes

- Relevant API entry points include `packages/api/src/routes/projects.ts`, `packages/api/src/routes/runtimeProfiles.ts`, `packages/api/src/routes/settings.ts`, `packages/api/src/routes/tasks.ts`, and `packages/api/src/routes/chat.ts`.
- Relevant frontend entry points include `packages/web/src/hooks/useWebSocket.ts`, `packages/web/src/hooks/useProjects.ts`, `packages/web/src/hooks/useRuntimeProfiles.ts`, `packages/web/src/hooks/useTasks.ts`, and `packages/web/src/hooks/useChatSessions.ts`.
- Relevant shared type entry point is `packages/shared/src/types.ts`.
- Initial audit evidence pointed to missing broadcasts for project update/delete, runtime profile mutations, task comment creation, and chat session update/rename; chat token events are currently sent only to the initiating WebSocket client.

## Links

- RDPI scaffold: ../../rdpi/work/work-20260508-fix-realtime-ui-updates
