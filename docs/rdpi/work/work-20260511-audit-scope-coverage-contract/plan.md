# Plan - Audit Scope Coverage Contract

## Owned write set

- `packages/shared/src/auditReportValidator.ts`
- `packages/shared/src/taskCompletionEvidence.ts`
- `packages/shared/src/index.ts` only if new exported types/functions are needed
- `packages/shared/src/__tests__/auditReportValidator.test.ts`
- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts` only for completion integration coverage
- `docs/rdpi/work/work-20260511-audit-scope-coverage-contract/result.md`
- memory review artifacts created by `$memsync MODE=auto`
- `docs/intake/work_status.json` status update after successful close-out

## Implementation steps

1. Add typed scope root and coverage result models to the shared audit report validator.
2. Implement conservative `Scope:` parsing and path normalization.
3. Add helpers for valid line-reference collection by scoped root.
4. Add directory representative coverage checks with capped filesystem enumeration and command evidence tied to the scope root.
5. Add validator issues for missing scope roots and missing scope coverage.
6. Pass `task.description` from completion evidence into the shared validator.
7. Ensure validator scope failures cannot be bypassed by the legacy substantive evidence fallback.
8. Add negative and positive unit fixtures for scoped files, scoped directories, doc-only citations, no-findings coverage, findings coverage, and large-directory representative coverage.

## Verification plan

- Focused shared validator tests:
  - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts`
- Focused completion tests:
  - `npm.cmd test --workspace=@aif/shared -- src/__tests__/taskCompletionEvidence.test.ts`
- Package quality:
  - `npm.cmd run build --workspace=@aif/shared`
  - `npm.cmd run lint --workspace=@aif/shared`

## Gate plan

- Independent plan reviewer must return `PLAN PASS` before implementation.
- Independent tester must return `TEST PASS` after implementation.
- Independent final reviewer must return `REVIEW PASS` after tester pass.
- If any gate fails, revise the invalidated artifact or code and rerun that gate.

## Close-out plan

- Write `result.md` with the gate outcomes and exact verification commands.
- Run `$memsync MODE=auto LANE=work TASK_ID=work-20260511-audit-scope-coverage-contract`.
- Mark only this task entry `done` in `docs/intake/work_status.json` after local memory review succeeds.
