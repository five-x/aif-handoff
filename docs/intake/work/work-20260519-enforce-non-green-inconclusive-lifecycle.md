# Enforce Non-Green Inconclusive Lifecycle

- Task ID: work-20260519-enforce-non-green-inconclusive-lifecycle
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-19
- Due: immediate
- Source: Follow-up from `docs/rdpi/work/work-20260519-systemic-task-lifecycle-review/result.md`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle`

## Request

Implement the canonical lifecycle correction so weak or inconclusive main evidence cannot become green task success.

## Done When

- Explicit audit-inconclusive synthesis cannot produce task `done`/`verified`, artifact `valid`/`trusted`, next action `none`, or batch `complete`.
- `source_inconclusive` source report terminalization no longer sets task `done` with `manualReviewRequired=false` and cleared blocked fields.
- API `approve_done` and coordinator use one shared audit-card decision path.
- Data/UI projection shows `audit_inconclusive` as non-success or accepted-but-not-trusted, not green trusted success.
- Valid no-findings with a `## Weak/discarded findings` section still returns `closed_verified`.
- Coordinator/API/data/UI/shared regression tests cover both the inconclusive-main-evidence failure and the valid weak/discarded regression.

## Constraints

- Do not weaken audit source validation.
- Do not collapse weak/discarded findings inside a valid report into failure.
- If a new task status is out of scope, use existing status fields with explicit structured non-green semantics.

## Notes

- This is the first implementation task after the systemic lifecycle review.
- Treat the current `source_inconclusive -> done` behavior as stale.
