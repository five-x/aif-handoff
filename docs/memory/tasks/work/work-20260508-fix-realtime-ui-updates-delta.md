<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260508-fix-realtime-ui-updates::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260508-fix-realtime-ui-updates
source_path: docs/rdpi/work/work-20260508-fix-realtime-ui-updates
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-08
supersedes:
expires_at:
tags:

- aif-handoff
- work
- task-delta
- realtime-ui
- websocket
- react-query
  source_refs:
- docs/rdpi/work/work-20260508-fix-realtime-ui-updates/research.md
- docs/rdpi/work/work-20260508-fix-realtime-ui-updates/design.md
- docs/rdpi/work/work-20260508-fix-realtime-ui-updates/plan.md
- docs/rdpi/work/work-20260508-fix-realtime-ui-updates/result.md
  created_at: 2026-05-08
  last_verified_at: 2026-05-08

---

# Summary

Curated delta for task work-20260508-fix-realtime-ui-updates.

# Why It Matters

The web UI now has deterministic online refresh coverage for server mutations that previously updated only the initiating client or required stale-time/window-focus refresh.

# When To Reuse

Reuse when adding or auditing realtime UI coverage for server mutations in aif-handoff.

# When Not To Reuse

Do not use this as a substitute for authorization or topic-subscription design. Broad chat events remain metadata-only because the current WebSocket broadcast channel is not project-authorized.

## Facts

- Shared WebSocket types include explicit events for project update/delete, runtime profile create/update/delete, runtime defaults/config updates, task comments, and chat session metadata/message updates.
- API mutation routes broadcast the new events only after successful persistence.
- Web realtime invalidation is handled by `packages/web/src/hooks/useWebSocket.ts` for broad app state and by `packages/web/src/hooks/useChatSessions.ts` for project-scoped chat session events.
- Broad chat session/message update payloads are metadata-only `{ id, projectId }` and do not include tokens, transcript text, message bodies, attachments, or raw runtime output.
- `POST /chat` rejects reuse of an existing session from another project before runtime execution, message persistence, or realtime broadcast.

## Decisions

- Preserve initiating-client local mutation invalidation while adding server broadcasts for other open clients.
- Keep `chat:token`, `chat:done`, and `chat:error` targeted to the initiating WebSocket client.
- Use metadata-only `chat:session_updated` and `chat:session_messages_updated` broadcasts to make other clients refetch persisted chat state through normal APIs.
- Add focused backend broadcast tests and frontend invalidation tests for the new realtime surfaces.

## Patterns

- For each user-visible server mutation affecting cached UI state, add a typed WebSocket event, backend broadcast coverage, frontend query invalidation, and local mutation invalidation.
- For broad realtime chat notifications on an unauthenticated/non-topic broadcast channel, broadcast only refetch metadata and assert sensitive fields are absent.
- Include cross-project scope regression tests when a realtime event payload includes both resource id and project id.
