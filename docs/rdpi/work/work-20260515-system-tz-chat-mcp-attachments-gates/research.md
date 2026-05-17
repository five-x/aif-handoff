# Research: System TZ Chat MCP Attachments Gates

Task: `work-20260515-system-tz-chat-mcp-attachments-gates`

Source task: `docs/intake/work/work-20260515-system-tz-chat-mcp-attachments-gates.md`

Status: planning evidence only. No runtime endpoint checks, scheduler reads, log inspection, or implementation happened before the plan gate.

## Accepted Planning Sources

- `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 16, 17, 18, and 25.
- `docs/intake/work/work-20260515-system-tz-chat-mcp-attachments-gates.md`.
- `docs/kb/system-tz-contract-inventory-freeze.md`.
- Existing RDPI results for task intent, workflow timeline/trust, and operator API/WS trust surfaces.
- Local source files under `packages/api`, `packages/mcp`, `packages/shared`, `packages/data`, and `packages/web`.
- Explorer subagent report for affected surfaces and current mismatches.

## Process Correction

A same-project shared-memory recall was performed during planning before `PLAN PASS`. That was a boundary violation under this repository's RDPI contract for this task, because no explicit waiver was granted. The recall returned generic context and did not change the task scope, design, plan, or conclusions. This research artifact treats the recall as disallowed context, not as an accepted planning source; the plan is based only on the local task card, local repository documentation, prior local RDPI artifacts, and local source files listed above.

## Requirement Summary

Chat, MCP sync, and attachments must be first-class workflow entrypoints that preserve task intent, source provenance, workflow gates, task state machine rules, completion guards, review/security guards, and timeline/sync visibility.

Concrete acceptance points from the source document:

- Chat can discuss projects, read task context, create task proposals, create follow-ups, start explore mode, explain blockers, and prepare replan proposals through structured actions.
- Chat cannot silently mutate verified memory, bypass the state machine, approve done, or bypass review/security/completion guards.
- Chat-created tasks infer or preserve task intent and source references.
- MCP task operations use the same task state machine, validate task intent, validate artifact paths, create timeline events, broadcast sync events, preserve `sourceRef`, and do not bypass guards.
- MCP-created tasks appear in the UI immediately; invalid MCP artifact paths are rejected.
- Attachments enforce max size, MIME validation, safe storage paths, path traversal defense, redaction/scanning, task/comment provenance, and safe binary handling.
- Large attachments are not fully inlined, binary attachments are not treated as text, and unsafe filenames are rejected.

## Local Facts

### Chat

- `packages/api/src/routes/chat.ts` builds task context for chat and injects a structured action prompt.
- The current structured action surface is only `CREATE_TASK`. It is a proposal emitted in model text and confirmed by the UI, not a server-side mutation.
- Chat requests persist user attachments through `persistAttachments`, then pass attachment metadata/path references into the model prompt.
- Chat can be scoped to a `taskId`, and current task context includes title, status, description, plan, implementation log, review comments, and redacted activity.
- `packages/web/src/lib/chatActions.ts` parses `CREATE_TASK` blocks and infers `taskIntent` when needed.
- `packages/web/src/components/chat/CreateTaskCard.tsx` requires user confirmation and calls `useCreateTask`, but it does not currently send a source reference for the created task.
- Current chat behavior already avoids directly approving `done`, mutating verified memory, or applying task status events. The main gap is making provenance and structured action limits explicit and durable.

### Task State And Workflow Guards

- `packages/shared/src/stateMachine.ts` defines human workflow events. There is no ordinary human event that sets arbitrary statuses or moves a task directly to `done`; `done` and `verified` are protected by coordinator/review and approval flows.
- `packages/api/src/services/taskEvents.ts` routes REST task events through `applyHumanTaskEvent` and adds evidence, branch, review, audit, and completion guards.
- REST `/tasks/:id/events` uses the guarded path and broadcasts timeline/trust/manual handoff events.
- REST `PUT /tasks/:id` still updates record fields directly; this task is about chat/MCP/attachments, so the implementation should avoid expanding that direct mutation surface.

### MCP

- `packages/mcp/src/tools/createTask.ts` creates tasks directly through `@aif/data` and broadcasts `task:moved`.
- `packages/mcp/src/tools/updateTask.ts` updates task fields directly, including plan and review-adjacent fields, without a task event path.
- `packages/mcp/src/tools/syncStatus.ts` directly calls `updateTaskStatus`, so external sync can move tasks to statuses that the state machine would not allow, including terminal statuses.
- `packages/mcp/src/tools/pushPlan.ts` writes plan content directly with `setTaskFields` and broadcasts a generic update.
- `packages/mcp/src/utils/broadcast.ts` posts to `/tasks/:id/broadcast` but does not include `INTERNAL_BROADCAST_TOKEN`; production broadcast auth can reject these calls.
- `packages/api/src/schemas.ts` does not allow `task:created` in the internal broadcast schema even though normal REST task creation emits that event and the web socket consumer handles it.

### Source Provenance

- `memory_items` already has `sourceRef`, but the `tasks` table and `Task` type do not currently have task-level `sourceRef`.
- Task creation schemas accept `taskIntent` and `isFix`, but not `sourceRef`.
- Chat action parsing and MCP task creation can preserve/emit task intent, but cannot currently persist a durable task source reference.

### Attachments

- API attachment schemas allow 100 MB declared size and arbitrary MIME strings. Project docs/UI comments refer to a 10 MB cap.
- `packages/api/src/services/attachmentStorage.ts` sanitizes unsafe names instead of rejecting them.
- `assertWithinBase` uses a string-prefix containment check after normalization; a relative-path check is safer for base-directory containment.
- `packages/api/src/services/attachmentPersistence.ts` trusts existing `path` values, stores metadata-only records when no content is present, and falls back to UTF-8 for invalid binary payloads.
- `packages/shared/src/attachments.ts` can inline `content` into prompts up to 4000 characters regardless of MIME type.
- Attachment records currently do not carry durable source/provenance fields for task, comment, or chat origin.

### Tests

Relevant existing tests:

- `packages/shared/src/__tests__/attachments.test.ts`
- `packages/shared/src/__tests__/db.test.ts`
- `packages/api/src/__tests__/attachmentPersistence.test.ts`
- `packages/api/src/__tests__/chat.test.ts`
- `packages/api/src/__tests__/tasks.test.ts`
- `packages/mcp/src/__tests__/taskToolsRuntimeContract.test.ts`
- `packages/mcp/src/__tests__/notifier.test.ts`
- `packages/web/src/__tests__/useTaskDetailActions.test.ts`
- `packages/web/src/__tests__/attachmentTransfer.test.ts`

## Risks And Open Decisions

- Adding task-level `sourceRef` needs a SQLite migration and type/schema updates. This is worth doing because the acceptance criteria require durable source references for chat/MCP-created tasks.
- MCP status sync cannot share every REST guard because no existing MCP event API maps one-to-one to human task events. The narrow safe design is to map only valid state-machine transitions and reject terminal or guarded transitions.
- `syncStatus` should reject direct `done` and `verified` requests, including conflict-winner requests, because those states depend on completion/review/approval guards outside MCP sync.
- Attachment MIME validation needs a conservative allowlist. Common text, JSON, CSV, markdown, PDF, and image types cover current likely use while preserving binary safety.
- Redaction/scanning should apply to text content before prompt inclusion and persisted text payloads. Binary content should be stored as bytes but never converted to prompt text.
- UI source display is not required for this task as long as `sourceRef` is preserved in task records and created actions.

## Research Conclusion

The implementation should add a single durable provenance field for tasks, harden attachment validation/persistence/prompt formatting, and route MCP status changes through the shared state machine instead of direct status writes. Chat should remain confirmation-based for mutations, with structured-action provenance added rather than introducing silent server-side chat mutations.
