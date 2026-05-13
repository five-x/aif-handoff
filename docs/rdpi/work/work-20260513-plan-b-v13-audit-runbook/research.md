# Research

## Task framing and lane

- Task ID: `work-20260513-plan-b-v13-audit-runbook`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260513-plan-b-v13-audit-runbook.md`.
- Request: document the v13 audit runbook and prompt pack for Plan B audit behavior, including broad audit decomposition, child report expectations, stalled-loop terminalization, weak-plan rejection, parent synthesis rules, and old v10/v11/v12 cleanup or retry guidance.
- Audience: operators who create and inspect audit cards, not only developers.
- Scope boundary: documentation/runbook work only. Do not execute audit cards, create child implementation tasks, or claim broader Plan B deployment than the completed implementation and regression artifacts support.

## Accepted planning sources or local facts

- `docs/ops/runbook.md` is the current operational runbook location, but it is marked managed by codex-platform and is sparse. Long-lived operational knowledge is still expected under `docs/ops/`, so the likely durable target is a dedicated sibling runbook rather than large direct edits to the managed file.
- `.codex/gpti/project.md` records the project convention: keep long-lived operational knowledge in `docs/kb/` and `docs/ops/`, and record rollout notes and migration procedures in `docs/ops/runbook.md`.
- Direct broad audit task creation rejects decomposition-required requests with `AUDIT_DECOMPOSITION_REQUIRED` in `packages/api/src/routes/tasks.ts:171`.
- Broad audit classification returns `decomposed_report_batch` for repository-wide, comprehensive, multi-domain, owner-grade, or audit-without-boundaries requests in `packages/shared/src/auditRoadmapContract.ts:554`.
- Narrow audit cards can stay single-report when they have concrete scope and report markers or a narrow file/component target in `packages/shared/src/auditRoadmapContract.ts:584` and `packages/shared/src/auditRoadmapContract.ts:592`.
- The audit roadmap generator prompt requires owner-grade diagnostic decomposition, 6-12 small audit tasks, exactly one final synthesis task, concrete source scopes, risk hypotheses, one report artifact per child, and a child report status table before overall synthesis in `packages/api/src/services/roadmapGeneration.ts:1174`.
- The prompt pack includes explicit no-findings and synthesis outcome requirements in `packages/shared/src/auditRoadmapContract.ts:126` through `packages/shared/src/auditRoadmapContract.ts:133`.
- Weak audit plans fail if they omit scoped evidence targets, exclusions, expected report fields, a child/source-report decision, or required broad-audit decomposition in `packages/shared/src/planQuality.ts:470`.
- Parent synthesis readiness is roadmap-batch based. Child source artifacts release synthesis only when trusted valid or explicitly terminal as `source_inconclusive`, `terminal_inconclusive`, or `manual_exception` in `packages/data/src/index.ts:3029`.
- Synthesis inputs include valid, invalid, missing, externally blocked, inconclusive, terminal, and manual-exception report artifacts for final status accounting in `packages/data/src/index.ts:3417`.
- Stalled same-blocker auto-review loops terminalize to `blocked_external` with `manualReviewRequired=true`, preserved diagnostics, and `handoffReason: "stalled_rework_loop"` through `packages/agent/src/autoReviewHandler.ts:266` and `packages/agent/src/coordinator.ts:609`.
- No-substantive audit/report rework terminalizes as `manual_review_required: no_substantive_rework_delta` when the report artifact SHA is unchanged in `packages/agent/src/coordinator.ts:637`.
- Existing docs distinguish broad max-iteration/manual handoff in `done` from stalled/no-delta handoff in `blocked_external` in `docs/api.md:805` and `docs/api.md:806`.
- Focused prior RDPI results record completed behavior for broad audit decomposition, stalled rework terminalization, weak audit plan rejection, and Plan B regression coverage under:
  - `docs/rdpi/work/work-20260513-split-broad-audit-requests-into-micro-report-cards/result.md`
  - `docs/rdpi/work/work-20260513-terminalize-stalled-audit-rework-loops/result.md`
  - `docs/rdpi/work/work-20260513-reject-weak-audit-plans-in-plan-checker/result.md`
  - `docs/rdpi/work/work-20260513-plan-b-audit-decomposition-regression-suite/result.md`
- Explorer subagent `019e226c-6c22-7482-b7ff-5ff38817b55e` independently found the same source areas and flagged the main documentation gap: no durable cleanup/retry procedure for old v10/v11/v12 audit cards exists yet.
- Current worktree contains many pre-existing Plan B code, intake, RDPI, and memory artifacts. This task must avoid reverting or reformatting unrelated changes.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS` because the governing RDPI template forbids querying or summarizing same-project memory before the plan gate unless the user explicitly waives that boundary.
- Local same-project RDPI result artifacts were accepted as repository task history because `docs/rdpi/` is the local source of truth for task history.

## Cross-project reusable patterns

- No cross-project memory was queried. The runbook is specific to this repository's audit roadmap, review, and plan-quality contracts.

## Rejected or stale memory candidates

- Ad hoc guidance such as "delete old cards and rerun" is rejected as an operator procedure because the selected intake card explicitly asks to replace it with a durable cleanup and retry process.
- A generic parent/child task hierarchy is rejected as the basis for this runbook. Current Plan B synthesis readiness is implemented through roadmap batches and artifacts, while generic task hierarchy work is queued separately.
- Treating terminal inconclusive or manual-exception child reports as trusted valid reports is rejected. They may release synthesis only so the parent can close as inconclusive-capable, not as validated no-findings.
- Claiming "v13" as a separately deployed artifact is rejected. Local facts show a set of completed implementation and regression tasks plus this pending operator runbook, not a standalone release marker.

## Open questions

- Should the documentation add a short pointer to managed `docs/ops/runbook.md`, or avoid that file and create a dedicated sibling under `docs/ops/` to preserve the managed boundary?
- Should old v10/v11/v12 cleanup instructions be phrased as product UI operations or as status semantics, since no existing local operator document defines a formal obsolete-card status?

## Hypotheses

- H1: A dedicated `docs/ops/plan-b-v13-audit-runbook.md` can satisfy the operator runbook requirement without conflicting with managed `docs/ops/runbook.md`.
- H2: The runbook can preserve operator clarity by separating card-routing decisions, reviewer feedback expectations, parent synthesis rules, blocked/retry interpretation, prompt constraints, and legacy cleanup.
- H3: Verification can be documentation-focused: validate the presence of all done-when topics and run a focused source search or existing Plan B tests only if needed to confirm referenced contracts still exist.
