# Plan: Terminalize Roadmap Audit Plan Quality Exhaustion

## Implementation Checklist

- [x] Extend roadmap source-report terminalization helper with `plan_quality_exhausted`.
- [x] Pass `projectRoot` into `handlePlanQualityFailure()`.
- [x] After plan-quality retry budget is exhausted, terminalize roadmap `role="report"` artifacts as `source_inconclusive` before falling back to `blocked_external`.
- [x] Preserve non-roadmap `blocked_external` behavior after plan-quality retry limit.
- [x] Add coordinator tests for roadmap terminalization and non-roadmap preservation.
- [x] Run focused tests plus build/lint/diff-check.
- [ ] Deploy and retry the live `audit-v14` security card.

## Acceptance Criteria

- Generated roadmap audit source cards do not remain blocked solely because plan-quality retries were exhausted.
- The validator stays strict; the source becomes non-trusted `source_inconclusive`, not valid.
- Non-roadmap plan-quality retry exhaustion remains an operator block.
- `audit-v14` can continue toward synthesis after the live security card is retried.

## PLAN Gate Request

Review this plan before implementation. A pass means the coordinator can terminalize only roadmap source-report plan-quality exhaustion as a non-trusted source outcome.
