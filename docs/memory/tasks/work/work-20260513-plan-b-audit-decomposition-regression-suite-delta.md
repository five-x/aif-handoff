<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-plan-b-audit-decomposition-regression-suite::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-plan-b-audit-decomposition-regression-suite
source_path: docs/rdpi/work/work-20260513-plan-b-audit-decomposition-regression-suite
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-13
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260513-plan-b-audit-decomposition-regression-suite/research.md
- docs/rdpi/work/work-20260513-plan-b-audit-decomposition-regression-suite/design.md
- docs/rdpi/work/work-20260513-plan-b-audit-decomposition-regression-suite/plan.md
- docs/rdpi/work/work-20260513-plan-b-audit-decomposition-regression-suite/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Curated delta for task work-20260513-plan-b-audit-decomposition-regression-suite.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Stable regression suites for multi-incident workflow behavior should be deterministic and package-local, with any runtime-heavy canaries kept out of normal CI.
- Parent/child audit synthesis should be tested through the current roadmap batch/artifact contract until the generic hierarchy contract lands.
- `packages/shared/src/__tests__/planBRegression.test.ts` for pure shared behavior:
- broad audit decomposition versus narrow audit single-report classification;
- weak broad audit `PLAN FAIL` categories;
- synthesis output cannot validate from missing, forged, stale/weak, or inconclusive child-source metadata;
- non-audit implementation plans remain accepted so workflow logic is not overfit to audit.
- `packages/api/src/__tests__/planBRegression.test.ts` for deterministic child report-card decomposition:
- broad audit roadmap generation falls back to or converts into scoped source report cards plus exactly one final synthesis card;
- conversion/import runs without the extraction model for valid audit roadmaps;
- generated/imported report cards are diagnostic-only audit tasks with concrete `Scope:`, `Risk hypotheses:`, `Report artifact:`, no-findings guardrails, and report-only allowed changes;
- the synthesis card is paused behind `synthesis_not_ready`, carries child report status requirements, and creates roadmap batch artifacts for source reports plus synthesis.
- `packages/data/src/__tests__/planBRegression.test.ts` for roadmap batch parent/child readiness:
- missing child report artifacts keep synthesis paused;
- retryable weak/invalid reports do not release synthesis;
- stale attempt-boundary updates cannot promote a reopened child;
- explicit terminal source states can release only as non-trusted synthesis inputs.
- `packages/agent/src/__tests__/planBRegression.test.ts` for fast rework-loop terminalization:
- repeated same blocker reaches `stalled_rework_loop` before max-review exhaustion;
- the resulting comment includes operator-facing stalled finding details.

## Patterns

- Keep multi-incident workflow regression suites deterministic, package-local, and free of live model calls.
- Prefer public contract functions and data-layer APIs over private helper exports when building CI regressions.
