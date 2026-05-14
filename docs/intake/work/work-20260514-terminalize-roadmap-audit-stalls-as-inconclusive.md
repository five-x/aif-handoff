# Terminalize Roadmap Audit Stalls As Inconclusive

- Task ID: work-20260514-terminalize-roadmap-audit-stalls-as-inconclusive
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-14
- Due: unset
- Source: audit-v14 live failure after deploy `656c7e8`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260514-terminalize-roadmap-audit-stalls-as-inconclusive

## Request

Fix roadmap audit execution so generated roadmap source-report cards do not park in `blocked_external` after the system has enough evidence to classify the report attempt as non-trusted or inconclusive.

The project goal is that a decomposed audit roadmap runs to completion: source report cards either produce trusted validated reports, or they are terminalized as inconclusive/non-trusted source artifacts that let the synthesis card produce the final audit outcome. Recoverable report quality failures should keep returning to rework while productive. Repeated no-progress/stalled report loops should become durable audit artifact outcomes, not operator-blocked cards.

## Done When

- A roadmap source-report card that hits auto-review `stalled_rework_loop` no longer becomes `blocked_external`; it records the report artifact as `source_inconclusive`, clears active rework flags, and completes the source card.
- A roadmap source-report card that resubmits an unchanged artifact during rework no longer becomes `blocked_external`; it records `source_inconclusive` and completes the source card.
- Roadmap synthesis is released when all source reports are either trusted valid or terminal source outcomes (`source_inconclusive`, `terminal_inconclusive`, `manual_exception`).
- Direct non-roadmap tasks keep the existing manual-review safeguards.
- True external blockers still use `blocked_external`.
- Tests cover stalled-loop, no-delta, synthesis release, and preserved non-roadmap behavior.

## Constraints

- Do not weaken audit validators or accept weak reports as trusted valid.
- Do not hide inconclusive source outcomes; synthesis must be able to see and summarize them.
- Do not change runtime/provider/branch-isolation external blocker behavior.
- Follow RDPI gates before implementation.

## Live Evidence

- `audit-v14` source card `5e670add-cc53-47f3-9ee6-06ec5ade358c` reached `blocked_external` at `2026-05-14T10:17:36.806Z` with `manual_review_required: stalled_rework_loop after 3/3 same-blocker reviews`.
- The same card has `maxReviewIterations=100`, so the block came from `AGENT_AUTO_REVIEW_STALL_THRESHOLD=3`, not from the configured review budget.
- Logs on `192.168.88.67` show `Auto review stalled on repeated blocker fingerprints; manual review required` after three review iterations.
- Current code in `packages/agent/src/coordinator.ts` sends `stalled_rework_loop` to `blocked_external` through `blockTaskForStalledAutoReview()`.
- Current code also sends unchanged audit rework to `blocked_external` through `blockTaskForNoSubstantiveReworkDeltaIfNeeded()`.
