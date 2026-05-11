# Plan - Audit Rework Freshness Contract

## Owned write set

- `packages/api/src/services/taskEvents.ts`
- `packages/api/src/__tests__/tasks.test.ts`
- `packages/agent/src/coordinator.ts`
- `packages/agent/src/__tests__/coordinator.test.ts`
- `docs/rdpi/work/work-20260511-audit-rework-freshness-contract/result.md`
- memory review artifacts created by `memsync MODE=auto`
- `docs/intake/work_status.json` status update after successful close-out

## Implementation steps

1. Add a small helper in `taskEvents.ts` that invalidates a roadmap report artifact for manual rework.
2. Call that helper only when the human event is `request_changes` and the task has a roadmap artifact with role `report`.
3. Store `state="expected"`, `failureFamily="rework_needed"`, and validation details with the rework boundary timestamp/comment metadata.
4. Remove or bypass `reworkCompletionEvidenceAlreadySatisfied()` for report rework in `coordinator.ts` so the implementer cannot be skipped from stale evidence.
5. Add API regression coverage for artifact invalidation on manual `request_changes`.
6. Add coordinator regression coverage that a report task with `reworkRequested=true` still runs the implementer even when old report evidence is valid.

## Verification plan

- Focused API test:
  - `npm.cmd test --workspace=@aif/api -- src/__tests__/tasks.test.ts`
- Focused agent test:
  - `npm.cmd test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts`
- Package checks:
  - `npm.cmd run build --workspace=@aif/api`
  - `npm.cmd run build --workspace=@aif/agent`
  - `npm.cmd run lint --workspace=@aif/api`
  - `npm.cmd run lint --workspace=@aif/agent`

## Gate plan

- Independent `PLAN PASS` before implementation.
- Independent `TEST PASS` after implementation.
- Independent `REVIEW PASS` after tests pass.
- Any `FAIL` sends the task back for revision and reruns the invalidated gate.

## Close-out plan

- Write `result.md` with gate outcomes and verification commands.
- Run `memsync MODE=auto LANE=work TASK_ID=work-20260511-audit-rework-freshness-contract`.
- Mark only this task entry `done` in `docs/intake/work_status.json` after local memory review succeeds.
