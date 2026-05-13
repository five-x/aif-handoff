# Plan B Audit Decomposition Regression Suite

- Task ID: work-20260513-plan-b-audit-decomposition-regression-suite
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-13
- Due: unset
- Source: Plan B validation needs after audit-v12 loop
- RDPI Needed: yes
- RDPI Path: unset

## Request

Build a regression suite for Plan B audit decomposition, stalled rework terminalization, weak-plan rejection, and parent/child synthesis behavior.

The suite should be deterministic enough to run in normal CI and should capture the failure classes seen in the audit-v10/v12 incidents.

## Done When

- Tests reproduce a fast review/rework loop and prove terminalization behavior.
- Tests cover a broad audit decomposed into child report cards.
- Tests prove parent synthesis cannot validate from missing, stale, or inconclusive child reports.
- Tests cover `PLAN FAIL` for weak broad audit plans.
- The suite includes at least one non-audit canary or guard against overfitting core workflow logic to audit.
- The test command is documented in the task result.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Prefer deterministic unit/integration tests over live model calls.
- Keep runtime-heavy canaries opt-in if they are too slow for standard CI.

## Notes

- This card should land after the first Plan B behavior exists, or alongside it if the implementation task is narrow enough.

## Links

- Related: work-20260513-terminalize-stalled-audit-rework-loops
- Related: work-20260513-split-broad-audit-requests-into-micro-report-cards
- Related: work-20260513-reject-weak-audit-plans-in-plan-checker
