# Implementation Timeout Recovery Split Pack

- Task ID: work-20260530-implementation-timeout-recovery-split-pack
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-30
- Source: operator request after repeated same-scope implementation retries on an exhausted `zai-mi.com` child task.
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260530-implementation-timeout-recovery-split-pack

## Request

When implementation times out after partial work, generate a compact recovery split pack instead of retrying the same implementer run.

The recovery pack must capture sanitized state, changed files, remaining acceptance work, verification status, and proposed next child cards. It must queue follow-up intake work only; it must not execute those child tasks in the same run.

## Problem

After runtime exhaustion, the system currently has no high-quality continuation artifact that lets an operator or a future child task resume safely. Retrying the same broad task with the same large activity context risks spending more tokens without reducing scope.

## In Scope

- Recovery-pack artifact schema for exhausted implementation runs.
- Sanitized capture of branch, changed files, tests attempted, completed checklist items, blocked checklist items, and next split recommendations.
- Integration with blocked status and operator controls.
- Tests proving the recovery pack is generated without exposing secrets or raw provider diagnostics.

## Out Of Scope

- Executing generated follow-up tasks in the same run.
- Making the recovery pack a substitute for independent review/test gates.
- Changing GPU/model infrastructure.

## Acceptance Criteria

- On implementation timeout/tool-turn exhaustion, the task records a recovery pack with enough context to split or continue safely.
- The pack contains sanitized summaries and evidence references, not raw provider diagnostics or secrets.
- Follow-up work is proposed as queued intake cards or operator-visible split recommendations only.
- Same-scope auto-retry is not scheduled from this path.
- Tests cover timeout with partial changes, timeout with no changes, and recovery-pack redaction.

## Done When

- Operators can see what was done, what remains, and how to split the next work item after implementation exhaustion.
- The blocked task state points to the recovery pack.
- `npm run format:check`, `npm run lint`, `npm run test`, and `npm run build` pass or any pre-existing unrelated failures are documented.
