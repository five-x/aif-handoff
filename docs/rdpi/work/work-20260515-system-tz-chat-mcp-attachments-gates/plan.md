# Plan: System TZ Chat MCP Attachments Gates

Task: `work-20260515-system-tz-chat-mcp-attachments-gates`

Plan status: awaiting independent `PLAN PASS`.

## Scope

Implement the design in a narrow set of files for chat action provenance, MCP state/broadcast/artifact safety, task-level source references, and attachment hardening.

## Implementation Steps

1. Add shared source/provenance and attachment safety primitives.
   - Update `packages/shared/src/types.ts` with task `sourceRef` and attachment provenance fields.
   - Update `packages/shared/src/attachments.ts` with size, MIME, filename, storage-path, text/binary, redaction, and prompt-formatting helpers.
   - Export new helpers/constants from `packages/shared/src/index.ts` and browser exports as needed.

2. Add task `sourceRef` persistence.
   - Update `packages/shared/src/schema.ts` with `tasks.sourceRef`.
   - Update `packages/shared/src/db.ts` with `source_ref TEXT` in `ensureTables` and a new migration.
   - Update `packages/data/src/index.ts` to persist `sourceRef` on create/update and return it in task responses.
   - Update relevant DB/sourceRef tests.

3. Harden API schemas and attachment persistence.
   - Update `packages/api/src/schemas.ts` attachment schemas to use the 10 MB cap, MIME allowlist, unsafe filename rejection, and safe-path validation.
   - Add `sourceRef` to task create/update schemas.
   - Update `packages/api/src/services/attachmentStorage.ts` containment checks.
   - Update `packages/api/src/services/attachmentPersistence.ts` to validate paths against context, enforce decoded size, reject invalid binary content, redact text, preserve provenance, and stop silently falling back on unsafe writes.
   - Update route call sites in `packages/api/src/routes/tasks.ts` and `packages/api/src/routes/chat.ts` to pass task/comment/chat context for provenance.

4. Add chat structured action contracts and sourceRef support.
   - Update `packages/api/src/routes/chat.ts` structured-action prompt with explicit allowed/prohibited action contracts.
   - Update `packages/web/src/lib/chatActions.ts` to parse explicit `CREATE_TASK`, `CREATE_FOLLOW_UP`, `START_EXPLORE`, `EXPLAIN_BLOCKER`, and `PREPARE_REPLAN` actions.
   - Treat `CREATE_TASK` and `CREATE_FOLLOW_UP` as mutating proposals that render confirmation UI and call task creation only after user confirmation.
   - Treat `START_EXPLORE`, `EXPLAIN_BLOCKER`, and `PREPARE_REPLAN` as non-mutating UI cards/instructions that do not call task status, memory verification, review, done, or plan-update APIs.
   - Update `packages/web/src/components/chat/CreateTaskCard.tsx` and callers so confirmed task creation sends a clear chat source reference and preserves task intent.
   - Add client-side negative tests proving prohibited/unknown action types are ignored and cannot produce mutating API calls.

5. Enforce MCP workflow contracts.
   - Add safe artifact path validation for MCP task `planPath`.
   - Update `packages/mcp/src/tools/createTask.ts` to validate/resolve task intent, accept/persist `sourceRef`, validate `planPath`, and broadcast `task:created`.
   - Update `packages/mcp/src/tools/updateTask.ts` to validate task intent, accept/persist `sourceRef`, validate `planPath`, and reject direct writes to guarded review/completion fields (`implementationLog`, `reviewComments`, `blockedReason`, status-like fields).
   - Update `packages/mcp/src/tools/syncStatus.ts` to map supported status changes through `applyHumanTaskEvent` and reject terminal/unsupported transitions.
   - Update `packages/mcp/src/tools/pushPlan.ts` to reject completed/verified/implementation/review statuses, keep plan writes planning-compatible, and preserve source/timeline visibility without bypassing guarded status changes.

6. Fix MCP/API broadcast sync.
   - Add `task:created` to `broadcastTaskSchema`.
   - Update internal broadcast fanout for `task:created` to emit queue refresh and agent wake events.
   - Update `packages/mcp/src/utils/broadcast.ts` to include `INTERNAL_BROADCAST_TOKEN` when configured.

7. Update tests.
   - Shared: attachment helpers/prompt formatting and DB migration/sourceRef tests.
   - API: attachment persistence, task schema/sourceRef, chat attachment/provenance behavior, internal broadcast type.
   - MCP: create/update planPath rejection, create sourceRef, syncStatus transition mapping/rejection, broadcast auth token.
   - Web: chat action parsing for all allowed action types, confirmed create/follow-up payload `sourceRef`, and unknown/prohibited actions ignored.
   - Negative MCP tests: invalid/missing task intent handling, guarded field mutation rejection, terminal status rejection, unsupported transition rejection, and direct plan push rejection for completed/review states.

8. Run verification.
   - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/attachments.test.ts src/__tests__/db.test.ts`
   - `npm.cmd test --workspace=@aif/api -- --run src/__tests__/attachmentPersistence.test.ts src/__tests__/chat.test.ts src/__tests__/tasks.test.ts`
   - `npm.cmd test --workspace=@aif/mcp -- --run src/__tests__/taskToolsRuntimeContract.test.ts src/__tests__/notifier.test.ts`
   - `npm.cmd test --workspace=@aif/web -- --run src/__tests__/attachmentTransfer.test.ts src/__tests__/useTaskDetailActions.test.ts`
   - `npm.cmd run build`

## Gate Expectations

- Independent plan reviewer must return explicit `PLAN PASS` before implementation.
- After implementation, independent tester must return explicit `TEST PASS`.
- After testing, independent reviewer must return explicit `REVIEW PASS`.
- Any `FAIL` returns the task to revision before continuing.

## Rollback Notes

- Changes are additive except stricter validation. If a compatibility problem appears, the safe rollback is to keep task `sourceRef` persistence and relax only the specific validation rule with a documented test.
- Do not remove review/completion/state-machine guards to restore old MCP behavior; invalid sync requests should remain rejected or no-op.
