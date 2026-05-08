<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Design

## Chosen design

- Extend the existing broadcast-and-invalidate pattern instead of replacing the WebSocket transport or React Query setup.
- Add typed WS events for the missing cross-client mutation surfaces:
  - `project:updated`
  - `project:deleted`
  - `runtime_profile:created`
  - `runtime_profile:updated`
  - `runtime_profile:deleted`
  - `settings:runtime_defaults_updated`
  - `settings:config_updated`
  - `task:comment_created`
  - `chat:session_updated`
  - `chat:session_messages_updated`
- Use full entity payloads where they already exist and narrow id/project payloads where broad invalidation is enough.
- Chat payloads must be narrow metadata only:
  - `chat:session_updated`: `{ id: string; projectId: string }` or the existing sanitized `ChatSession` only if it contains no transcript/message content.
  - `chat:session_messages_updated`: `{ id: string; projectId: string }`.
  - Never include chat tokens, assistant/user message text, attachments, runtime raw output, or transcript content in broad chat broadcasts.
- Keep initiating-client mutation invalidations intact for immediate feedback.
- Update `useWebSocket` to invalidate affected query keys centrally:
  - project events invalidate `projects`, `projectDefaults`, runtime effective queries, warmup state, and related task lists where needed.
  - runtime profile/settings events invalidate `runtimeProfiles`, `appRuntimeDefaults`, `settings`, effective runtime queries, warmup state, and `projects` when defaults may change.
  - comment events invalidate `task-comments` for the affected task and the individual task when useful.
  - chat session update events are dispatched to the existing chat-session DOM event path so `useChatSessions` can refresh on create/update/delete, but handlers must ignore events for another project.
  - chat session message completion events invalidate chat-session lists/messages only when the event project/session matches the active view.
- Preserve chat token privacy/scope by keeping `chat:token`, `chat:done`, and `chat:error` targeted to the initiating client. Use metadata-only session update/completion invalidation for other clients.
- Do not add server-side chat fanout beyond what the current unauthenticated broadcast channel can safely carry. If future per-client project subscriptions/authorization are needed, queue that as separate work rather than embedding it in this task.

## Pre-PLAN boundary

- Before `PLAN PASS`, only task framing, local static source review, accepted planning sources, hypotheses, acceptance criteria, and verification plans are allowed.
- No implementation, runtime-visible probing, log inspection, service checks, or memory recall before `PLAN PASS`.

## Decision candidates

- If implementation succeeds, consider a memory candidate: "Realtime UI state changes should have a typed WS event plus frontend query invalidation coverage, even when the initiating mutation already invalidates locally."
- If chat completion invalidation is chosen over multi-client token fanout, consider documenting that token streams are client-scoped while persisted session metadata/history updates are broadcast-safe only when payloads are metadata-only and frontend-scoped by project/session.
