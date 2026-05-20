# Plan

## Implementation plan

1. Add or extend a shared helper in `packages/shared/src/auditCardDecision.ts` that builds accepted audit-card decisions from completion evidence, audit artifact role/path data, and report text. It must detect `source_inconclusive` and `inconclusive_batch_evidence` and return `audit_inconclusive` with inaccessible verification.
2. Update `packages/agent/src/coordinator.ts` and `packages/api/src/services/taskEvents.ts` to call the shared helper instead of maintaining duplicate decision logic.
3. Update `packages/shared/src/taskCompletionEvidence.ts` so explicit inconclusive audit synthesis emits `audit_inconclusive` and `ok=false`, while preserving the valid no-findings plus `## Weak/discarded findings` success path.
4. Update `packages/agent/src/subagents/implementer.ts` so terminal `source_inconclusive` writes the artifact terminal state but leaves the task non-green, using existing blocked fields and a preserved reason instead of `status: "done"` and cleared blockers.
5. Remove or adjust coordinator logic that treats `done + source_inconclusive` as successful before review handoff.
6. Update `packages/data/src/index.ts` so `audit_inconclusive` decisions are not trusted synthesis input, do not get next action `none`, and do not make the batch `complete`; include projection fallback for legacy `valid` + `audit_inconclusive`.
7. Update web/data/API/agent/shared tests that currently lock in stale green success, and add focused regressions for API `approve_done` on inconclusive audit evidence.
8. Add or update mandatory UI regressions so `audit_inconclusive` rollups render as untrusted/non-green and the valid weak/discarded report path still renders as trusted/green.
9. Write `docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/result.md` after implementation and verification gates complete.

## Acceptance criteria

- Explicit audit-inconclusive synthesis cannot produce task `done` or `verified`.
- Explicit audit-inconclusive synthesis cannot persist artifact `valid`/trusted in new coordinator or API flows.
- `source_inconclusive` terminalization no longer sets task `done`, no longer clears blocker fields, and does not set `manualReviewRequired=false`.
- API `approve_done` and coordinator use one shared audit-card decision helper.
- Data/API/UI projection shows `audit_inconclusive` as untrusted or non-success, with next action not `none`, and batch not `complete`.
- Valid no-findings with a `## Weak/discarded findings` section still produces `closed_verified` and passes completion evidence.

## Verification plan

- Run targeted shared tests:
  - `npm.cmd test -- --run packages/shared/src/__tests__/auditCardDecision.test.ts packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
- Run targeted agent tests:
  - `npm.cmd test -- --run packages/agent/src/__tests__/coordinator.test.ts`
- Run targeted API tests:
  - `npm.cmd test -- --run packages/api/src/__tests__/tasks.test.ts`
- Run targeted data tests:
  - `npm.cmd test -- --run packages/data/src/__tests__/index.test.ts packages/data/src/__tests__/workflowTimeline.test.ts packages/data/src/__tests__/planBRegression.test.ts`
- Run targeted web tests for mandatory UI regression coverage:
  - `npm.cmd test -- --run packages/web/src/__tests__/TaskCard.test.tsx packages/web/src/__tests__/TaskDetailHeader.test.tsx packages/web/src/__tests__/TaskListTable.test.tsx`
- Run broader verification as time permits:
  - `npm.cmd test`
  - `npm.cmd run lint`

## Required gates

- Independent `PLAN PASS` before code edits.
- Independent coder implementation after `PLAN PASS`.
- Independent `TEST PASS` after implementation.
- Independent final `REVIEW PASS` after `TEST PASS`.

## Reusable patterns

- For lifecycle state, block new invalid success at the lowest shared validation layer and separately downgrade historical/persisted projections.
- Keep positive regression coverage for allowed weak/discarded findings when adding negative inconclusive-evidence regressions.
