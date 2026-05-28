# QA Gate And Acceptance Pack

- Task ID: work-20260528-qa-gate-and-acceptance-pack
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-28
- Due: unset
- Source: decomposition from `work-20260528-requirements-intake-remaining-phases`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260528-qa-gate-and-acceptance-pack

## Request

Implement the QA phase and done acceptance pack for the requirements lifecycle. Add QA status/gate contracts, QA runner behavior, `qa.md` artifact handling, review-to-QA routing, mandatory check enforcement, and done acceptance UI/read model.

## Done When

- QA stage/status and QA runner exist when QA is enabled.
- `review -> qa -> done` is enforced; direct `review -> done` is blocked when QA is required.
- QA produces `qa.md`, records command evidence and skipped checks with reason/risk, and blocks done on failed mandatory checks.
- Done produces an acceptance/result pack showing covered requirements, changed files, review result, QA result, limitations, rollback notes, and readiness for human acceptance.
- `verified` remains reachable only through human approval.

## Constraints

- Depends on `work-20260528-requirements-snapshot-and-stage-artifacts`.
- Should consume research/design artifacts when `work-20260528-research-design-stages` is enabled.
- Preserve Phase 1 behavior from `6565e2f8`.
- Preserve compatibility when QA is disabled and when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- Do not execute follow-up child tasks in the same run.

## Notes

This slice owns QA and acceptance semantics only; broad observability/docs/e2e closure belongs to the rollout child task.

## Links

- Parent RDPI: ../../rdpi/work/work-20260528-requirements-intake-remaining-phases
- Snapshot/artifact prerequisite: work-20260528-requirements-snapshot-and-stage-artifacts.md
