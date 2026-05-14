# Research: Terminalize Roadmap Audit Stalls As Inconclusive

Task ID: `work-20260514-terminalize-roadmap-audit-stalls-as-inconclusive`

## Context

The previous lifecycle fix `work-20260514-route-recoverable-audit-failures-to-rework-or-input` was deployed as commit `656c7e8`. It correctly routed recoverable audit validator failures back to implementation while review budget remains. Live `audit-v14` still blocked because a different guard converted repeated same-blocker auto-review results into `blocked_external`.

Shared-memory lookup for prior context returned no usable context, so this task relies on local RDPI docs, source code, and live server evidence.

## Live Server Findings

- API task list from `http://192.168.88.67/api/tasks` shows `audit-v14` source card `5e670add-cc53-47f3-9ee6-06ec5ade358c` in `blocked_external`.
- The blocked reason is `manual_review_required: stalled_rework_loop after 3/3 same-blocker reviews`, with unresolved validator blockers such as `missing_report_manifest`, `missing_risk_hypotheses`, `fake_or_placeholder_command_output`, `synthetic_git_output`, `speculative_audit_claim`, `missing_scope_coverage`, and `missing_substantive_evidence`.
- That card has `maxReviewIterations=100`, so the terminal block bypassed the intended review budget.
- Agent logs show:
  - `Auto review requested another rework cycle` for iterations 1 and 2.
  - `Repeated deterministic audit report repair fell through to runtime implementation rework`.
  - `Auto review stalled on repeated blocker fingerprints; manual review required` at iteration 3.
- `audit-v14` synthesis card `be1dd7eb-d1d5-49e8-9a58-a7d91461a9a4` remains paused with `synthesis_not_ready: waiting for validated audit batch artifacts`, because at least one source artifact is neither trusted valid nor terminal source-inconclusive.

## Local Code Findings

- `packages/agent/src/autoReviewHandler.ts` converts repeated blocker streaks at `AGENT_AUTO_REVIEW_STALL_THRESHOLD` into a `manual_review_required` outcome with handoff reason `stalled_rework_loop`.
- `packages/agent/src/coordinator.ts` handles that outcome with `blockTaskForStalledAutoReview()`, which always writes `status="blocked_external"`, `manualReviewRequired=true`, `reworkRequested=false`, and keeps the auto-review state.
- `packages/agent/src/coordinator.ts` also handles unchanged report content through `blockTaskForNoSubstantiveReworkDeltaIfNeeded()`, which writes `status="blocked_external"` with `manual_review_required: no_substantive_rework_delta`.
- `packages/data/src/index.ts` already treats report artifacts in `source_inconclusive`, `terminal_inconclusive`, or `manual_exception` as ready for synthesis via `roadmapSourceArtifactTerminalForSynthesis()`.
- `packages/data/src/index.ts` only counts trusted `state="valid"` source reports as valid reports; source-inconclusive reports can release synthesis without being treated as trusted evidence.
- `docs/rdpi/work/work-20260513-split-broad-audit-requests-into-micro-report-cards/result.md` states that terminal source states should release synthesis and let the final synthesis classify the audit as inconclusive when needed.
- `docs/rdpi/work/work-20260513-terminalize-stalled-audit-rework-loops/result.md` introduced the current stalled/no-delta guards, but their terminalization target was `blocked_external`, which conflicts with the decomposed audit roadmap completion goal.

## Root Cause

The lifecycle has two competing meanings for terminal no-progress:

- For ordinary tasks, no-progress means stop automation and ask for manual review.
- For generated audit roadmap source-report cards, no-progress means the source report attempt is non-trusted/inconclusive and should feed synthesis as a terminal source outcome.

The code implements only the ordinary-task path for `stalled_rework_loop` and `no_substantive_rework_delta`, so roadmap source cards get stuck as operator-blocked even though the roadmap contract already has `source_inconclusive` as a non-trusted terminal outcome.

## Scope Boundaries

- This task should not loosen report validation.
- This task should not mark weak reports as trusted `valid`.
- This task should not force all audit tasks to complete; direct non-roadmap audit cards can still require manual review.
- This task should only change generated roadmap source-report behavior where a persisted roadmap batch artifact exists with role `report`.
