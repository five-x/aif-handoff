# Reject Weak Audit Plans In Plan Checker

- Task ID: work-20260513-reject-weak-audit-plans-in-plan-checker
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-13
- Due: unset
- Source: Plan B after audit-v12 rework loop and insufficient upfront decomposition
- RDPI Needed: yes
- RDPI Path: unset

## Request

Harden the audit plan-review gate so weak, oversized, or under-specified audit plans fail before implementation begins.

The plan checker should require enough decomposition detail, evidence strategy, and scope boundaries to keep implementation/review loops bounded.

## Done When

- Audit plans must declare scoped evidence targets, excluded areas, and expected report structure.
- Plans that cover too many unrelated areas without decomposition receive `PLAN FAIL`.
- Plans must identify whether child audit reports are required before implementation.
- Plan-review feedback names the missing facts or decomposition gaps needed for a pass.
- Tests cover weak broad plans, acceptable narrow plans, and acceptable decomposed plans.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Keep the checker useful for audit without making all workflow planning audit-specific.
- Preserve the independent `PLAN PASS` / `PLAN FAIL` gate.

## Notes

- This task moves some failure earlier, before runtime spends implementation and review turns on an impossible scope.

## Links

- Related: work-20260513-split-broad-audit-requests-into-micro-report-cards
- Related: work-20260513-define-workflow-contract-pack-interface
