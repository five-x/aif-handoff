<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Plan

## Implementation plan

1. Extend shared websocket types in `packages/shared/src/types.ts` with the missing event names and narrow payload interfaces for project/runtime/settings/comment/chat-session-message events.
2. Add API broadcasts after successful mutations:
   - project update/delete in `packages/api/src/routes/projects.ts`
   - runtime profile create/update/delete in `packages/api/src/routes/runtimeProfiles.ts`
   - app runtime default update and project config write in `packages/api/src/routes/settings.ts`
   - task comment creation in `packages/api/src/routes/tasks.ts`
   - chat session update/rename and chat message completion in `packages/api/src/routes/chat.ts`
3. Keep chat token/done/error events targeted to the initiating client; add only metadata-only chat session events after session metadata/messages are saved:
   - `chat:session_updated` for rename/runtime-session metadata changes.
   - `chat:session_messages_updated` after a persisted chat turn changes session messages.
   - Payloads must be `{ id: string; projectId: string }` or equivalently narrow metadata; no transcript text, tokens, attachments, raw runtime output, or message bodies.
4. Update `packages/web/src/hooks/useWebSocket.ts` to handle the new event types and invalidate the precise React Query keys.
5. Update `packages/web/src/hooks/useChatSessions.ts` to listen for `chat:session_updated` and `chat:session_messages_updated` alongside create/delete, filter events to the current `projectId`, and keep local mutation invalidations.
6. Add focused API tests that assert the new broadcasts are emitted only after successful mutations.
7. Add focused web tests for websocket-driven invalidation of project, runtime/settings, task-comments, and chat-session events.
8. Update API/WebSocket documentation only if event names or payload contracts need public documentation consistency.

## Acceptance criteria

- Project create/update/delete changes in one client cause other open clients to refresh project state without waiting for window focus or stale-time expiry.
- Runtime profile create/update/delete and app runtime default changes cause other open clients to refresh runtime settings and effective runtime views.
- Task comments created in one client cause other open task detail views to refresh comments for that task.
- Chat session rename/update causes other open chat session lists to refresh.
- Chat completion causes other clients viewing the same persisted session/project to refresh deterministically without broadcasting live tokens or transcript content broadly.
- Chat broad event payloads are metadata-only and frontend handlers ignore unrelated projects/sessions.
- Shared WS event typing is explicit and compiles without unsafe event-name casts.
- Existing task board realtime behavior is not regressed.

## Verification plan

- Independent `PLAN PASS` before implementation.
- Focused test commands after implementation:
  - `npm.cmd test --workspace=@aif/api -- --runInBand`
  - `npm.cmd test --workspace=@aif/web -- --runInBand`
- If workspace test runner rejects forwarded flags, rerun with the package-local supported command from `packages/api/package.json` / `packages/web/package.json`.
- Build/lint checks:
  - `npm.cmd run build`
  - `npm.cmd run lint`
  - `npm.cmd test`
- Independent tester gate must return `TEST PASS` or `TEST FAIL`.
- Independent final reviewer gate must return `REVIEW PASS` or `REVIEW FAIL`.
- Chat-specific verification:
  - API tests assert broad chat session update/message events do not include token, message, transcript, attachment content, or raw runtime output fields.
  - Web tests assert chat session invalidation ignores events for unrelated projects.

## Reusable patterns

- For each new user-visible server mutation: add a typed `WsEventType`, broadcast after successful persistence, add frontend query invalidation, add one backend broadcast assertion, and add frontend invalidation coverage when the event affects cached UI state.
