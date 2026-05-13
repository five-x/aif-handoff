# Plan B V13 Audit Runbook And Prompt Pack

- Task ID: work-20260513-plan-b-v13-audit-runbook
- Lane: work
- Status: queued
- Priority: medium
- Created: 2026-05-13
- Due: unset
- Source: Plan B rollout planning after audit-v12 loop
- RDPI Needed: yes
- RDPI Path: unset

## Request

Document the v13 audit runbook and prompt pack for using Plan B behavior: broad audit decomposition, child report expectations, stalled-loop terminalization, weak-plan rejection, and parent synthesis rules.

The runbook should be written for operators who create and inspect audit cards, not only for developers.

## Done When

- The runbook explains when to create one audit card versus a decomposed parent audit.
- It defines what reviewers should report back to implementation as unresolved facts.
- It explains how a blocked parent or child card should be interpreted and retried.
- It records the v13 audit prompt text or prompt constraints used for validation.
- It includes a cleanup/retry procedure for old v10/v11/v12 cards.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Do not claim Plan B is deployed until implementation and regression tasks pass.
- Keep operator guidance separate from hidden runtime assumptions.

## Notes

- This should replace ad hoc guidance like "delete old cards and rerun" with a durable procedure.

## Links

- Related: work-20260513-terminalize-stalled-audit-rework-loops
- Related: work-20260513-split-broad-audit-requests-into-micro-report-cards
