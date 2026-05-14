# Terminalize Roadmap Audit Plan Quality Exhaustion

- Task ID: work-20260514-terminalize-roadmap-audit-plan-quality-exhaustion
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-14
- Due: unset
- Source: live `audit-v14` security source card after deploy `8a2a38d`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260514-terminalize-roadmap-audit-plan-quality-exhaustion

## Request

Generated roadmap audit source-report cards must not remain in `blocked_external` when the plan-quality replan budget is exhausted. If the system cannot produce an acceptable plan for a generated source-report card, record that source as non-trusted/inconclusive and let the synthesis card finish the roadmap outcome.

## Done When

- A roadmap source-report card that exhausts `Plan quality guard` replans no longer parks in `blocked_external`.
- The corresponding roadmap artifact becomes `source_inconclusive` with `terminal_inconclusive` attempt metadata.
- The source task moves to `done` with active blocked/rework fields cleared.
- Non-roadmap plan-quality failures still block after retry limit.
- Tests cover both roadmap terminalization and preserved non-roadmap blocking.

## Constraints

- Do not weaken the plan-quality validator.
- Do not mark weak plans or weak reports as trusted valid.
- Do not change direct/manual audit task behavior.
- Synthesis must remain responsible for summarizing incomplete or inconclusive sources.
