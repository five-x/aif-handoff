# Result: System TZ Chat MCP Attachments Gates

Task ID: `work-20260515-system-tz-chat-mcp-attachments-gates`
Date: 2026-05-17
Lane: `work`

## Outcome

Implemented the approved chat, MCP, attachment, and gate-hardening changes.

- Chat actions now support structured `create_task`, `create_follow_up`, `start_explore`, `explain_blocker`, and `prepare_replan` actions without auto-executing mutations.
- Task `sourceRef` is persisted and propagated through chat-created tasks and MCP create/update flows.
- Attachments are capped at 10 MB, validated by MIME/name/path, given provenance metadata, redacted/bounded before prompt inclusion, and binary attachments are stored without being inlined.
- API attachment persistence now fails closed, rejects unsafe storage paths, rejects new path-backed task/comment uploads, rolls back failed comment attachment creation, and only cleans up replaced task files after successful replacement persistence and DB update.
- MCP task creation broadcasts `task:created`; MCP plan mutations are limited to planning-compatible task states; status sync uses guarded human workflow events and rejects invalid/epoch source timestamps.

## Review-Fail Fixes

The first final review returned `REVIEW FAIL`. The blocking findings were fixed before close-out:

- Added shared MCP workflow guards for safe relative artifact paths and planning-compatible plan mutations.
- Guarded `handoff_update_task(plan)` and `handoff_push_plan` so `blocked_external`, `implementing`, `review`, `done`, and `verified` cannot rewrite plans.
- Changed task attachment replacement ordering to persist replacement metadata first and clean up old files only after successful task update.
- Added rollback for comment creation when attachment persistence rejects or throws.
- Rejected invalid/epoch MCP sync timestamps instead of falling back to server time; older valid timestamps lose conflict resolution without mutating status.

## Verification

Local verification passed:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/attachments.test.ts src/__tests__/db.test.ts`
  - Passed: 2 files, 41 tests.
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/chatActions.test.ts src/__tests__/CreateTaskCard.test.tsx src/__tests__/useTaskDetailActions.test.ts`
  - Passed: 3 files, 13 tests.
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/attachmentPersistence.test.ts src/__tests__/chat.test.ts src/__tests__/tasks.test.ts`
  - Passed with exit code 0.
- `npm.cmd test --workspace=@aif/mcp -- --run src/__tests__/workflowContract.test.ts src/__tests__/tools.test.ts src/__tests__/broadcast.test.ts src/__tests__/taskToolsRuntimeContract.test.ts src/__tests__/notifier.test.ts`
  - Passed with exit code 0.
- `npm.cmd run build`
  - Passed across all 7 packages.

Independent gates:

- `PLAN PASS`: independent plan review accepted the revised RDPI plan.
- `TEST PASS`: independent tester reran the focused shared, web, API, MCP, and build verification after review-fail fixes.
- `REVIEW PASS`: independent reviewer rechecked the prior findings and found no blocking issues.

## Notes

- The worktree already contained unrelated dirty files from other queued/completed tasks; this run did not revert them.

## Memory Sync

`$memsync MODE=auto LANE=work TASK_ID=work-20260515-system-tz-chat-mcp-attachments-gates` completed local review artifact generation and skipped auto-publish because there were no publishable curated documents.

- Report: `docs/memory/reports/work-20260515-system-tz-chat-mcp-attachments-gates-memsync-report.md`
- Task delta: `docs/memory/tasks/work/work-20260515-system-tz-chat-mcp-attachments-gates-delta.md`
