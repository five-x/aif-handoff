# Design

## Chosen design

Add a deterministic Plan B regression suite that consolidates the incident-class coverage into focused Vitest files while leaving production behavior unchanged unless a missing seam blocks testability.

The suite will be additive:

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

This design intentionally reuses existing public functions and mocked test patterns instead of adding runtime services or model calls. It avoids generic hierarchy assertions because current parent/child audit behavior is encoded in roadmap batches, while generic hierarchy schema/API work is queued under separate intake cards.

## Pre-PLAN boundary

- Before `PLAN PASS`, only task framing, local file research, RDPI artifacts, and proposed verification are allowed.
- No implementation edits, runtime-visible service probing, or shared-memory recall are included before the plan gate.

## Decision candidates

- Stable regression suites for multi-incident workflow behavior should be deterministic and package-local, with any runtime-heavy canaries kept out of normal CI.
- Parent/child audit synthesis should be tested through the current roadmap batch/artifact contract until the generic hierarchy contract lands.
