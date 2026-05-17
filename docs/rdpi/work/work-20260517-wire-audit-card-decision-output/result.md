# Result: wire auditCardDecision into real audit card output

## Outcome

Implemented. Accepted audit artifacts now persist and expose the `auditCardDecision` object as the real final audit-card decision surface for coordinator/API/UI/report output.

## Implementation Summary

- Added report-driven audit-card decision helpers in `packages/shared/src/auditCardDecision.ts` to extract weak/discarded findings, count valid findings outside weak sections, and build decisions through `classifyAuditCardDecision()`.
- Persisted `auditCardDecision` from accepted coordinator and API audit artifact completion paths.
- Exposed `auditCardDecision` through task artifact trust rollups and workflow timeline metadata.
- Updated deterministic audit synthesis output to include `requirementCompletion`, `verificationStrength`, `auditFindingValidity`, `residualRisks`, and `finalStatus`, plus a separate `## Weak/discarded findings` section.
- Updated task detail UI surfaces to consume `task.artifactTrust.auditCardDecision` without treating weak/discarded counts as manual-review triggers.

## Regression Coverage

- Added coordinator-level regression for a valid no-findings report with a `## Weak/discarded findings` section. The test asserts the task closes as `done`, the real card decision is `closed_verified`, weak/discarded findings are counted, and no manual review/source inconclusive/weak source/rework status is emitted.
- Added data/API tests proving `artifactTrust.auditCardDecision` is exposed in list/detail/trust output.
- Added shared helper coverage for weak/discarded extraction and final decision construction.
- Added report/UI tests proving the new fields render and weak/discarded counts do not produce manual-review UI.

## Verification

- `npm.cmd --workspace @aif/shared test -- auditCardDecision.test.ts auditReportValidator.test.ts`: passed, 72 tests.
- `npm.cmd --workspace @aif/data test -- src/__tests__/index.test.ts`: passed.
- `npm.cmd --workspace @aif/api test -- src/__tests__/tasks.test.ts`: passed.
- `npm.cmd --workspace @aif/agent test -- src/__tests__/coordinator.test.ts`: passed.
- `npm.cmd --workspace @aif/agent test -- src/__tests__/implementer.test.ts`: passed.
- `npm.cmd --workspace @aif/web test -- src/__tests__/TaskDetailHeader.test.tsx src/__tests__/TaskDetail.test.tsx`: passed, 62 tests.
- `npm.cmd run build`: passed.
- `npm.cmd run lint`: passed with non-blocking pre-existing warnings in `packages/data/src/index.ts` for `summarizeRuntimeProfileForAudit` and `summarizeTaskRuntimeOverride`.
- `git diff --check`: passed.

## Gates

- `PLAN PASS`: independent reviewer Ohm accepted the plan before implementation.
- `TEST PASS`: independent tester Nash verified targeted tests, build, lint, and regression coverage.
- `REVIEW PASS`: independent reviewer Dewey found no blocking or non-blocking issues.

## Mempub

`$memsync MODE=auto LANE=work TASK_ID=work-20260517-wire-audit-card-decision-output` completed successfully.

- Command: `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260517-wire-audit-card-decision-output --project aif-handoff --entity aif-handoff`
- Status: `success`
- Report: `docs/memory/reports/work-20260517-wire-audit-card-decision-output-memsync-report.md`
