# Audit V10 False Valid Regression

- Task ID: work-20260513-audit-v10-false-valid-regression
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-13
- Due: unset
- Source: audit-v10 quality review
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260513-audit-v10-false-valid-regression

## Request

Add an end-to-end regression canary that reproduces the audit-v10 false-valid class: source audit cards with `Scope: .`, deterministic repair, evidence from hidden agent/tooling files, and final synthesis marked `validated_no_findings`.

## Done When

- A fixture or integration test reproduces a repository where the first eligible text files are `.agents/**`.
- The test proves deterministic repair cannot produce trusted `validated_no_findings` from those files.
- Batch readiness remains false when all source reports are irrelevant, insufficient, or source-inconclusive.
- Final synthesis cannot become successful `validated_no_findings` from weak source reports.
- The test records expected failure families and validation details for diagnosis.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Prefer deterministic fixtures over live model calls.
- Keep the canary narrow enough to run in normal CI/test commands.

## Notes

- This should be the permanent regression for the botIntevra audit-v10 incident.
- It should fail on the current behavior where repair can turn irrelevant scoped evidence into trusted no-findings.

## Links

- Related intake: work-20260513-deterministic-audit-repair-source-inconclusive
- Related intake: work-20260513-audit-evidence-relevance-gate
