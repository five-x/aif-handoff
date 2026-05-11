# Plan - Audit Quality System Analysis

## Child tasks to create

1. `work-20260511-audit-report-contract-validator`
   - Build the shared audit report validator and migrate completion evidence to use it.
   - Include the observed bad report as a negative fixture.

2. `work-20260511-audit-scope-coverage-contract`
   - Parse declared audit scope and require report coverage evidence for each scope root.
   - Include positive and negative coverage fixtures.

3. `work-20260511-audit-rework-freshness-contract`
   - Fix `request_changes` and rework loops so stale completion evidence cannot skip implementer work.
   - Tie validation to report content SHA or a rework timestamp boundary.

4. `work-20260511-audit-review-gate-validator-unification`
   - Feed shared validator issues into review gate blocking findings.
   - Keep sidecar reviews additive rather than authoritative.

5. `work-20260511-audit-batch-integration-canary`
   - Add deterministic or mocked integration coverage for the full audit batch lifecycle.
   - Include local-vs-external usage/cost expectations.

## Task creation rules

- Create cards only; do not start them in this turn.
- Use `taskIntent: fix`, `plannerMode: full`, `skipReview: false`, `useSubagents: true`, and keep `autoMode: false` or `paused: true` so they do not execute immediately.
- Attach this RDPI analysis path in each card description.
- Mark each card as platform-level `aif-handoff` work, not canary-project work.

## Verification plan for later implementation

- Focused shared tests:
  - `npm.cmd test --workspace=@aif/shared -- src/__tests__/taskCompletionEvidence.test.ts`
  - new or updated validator tests.
- Focused agent tests:
  - `npm.cmd test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts src/__tests__/reviewGate.test.ts`
- API/data tests if batch artifact state or task events change:
  - `npm.cmd test --workspace=@aif/api -- src/__tests__/tasks.test.ts src/__tests__/roadmapGeneration.test.ts`
  - `npm.cmd test --workspace=@aif/data`
- Broad checks after focused tests:
  - `npm.cmd run build`
  - `npm.cmd run lint`

## PLAN PASS criteria for child implementation tasks

- Each child task has a narrow owned write set.
- Each child task includes at least one negative fixture derived from the observed failure.
- No child task depends on `botIntevra` paths or server state.
- Integration canary uses deterministic/mocked runtime behavior, not a real model as the only proof.
- Local runtime token usage is treated as observability/capacity data, not paid spend; external runtime usage/cost remains recorded and budget-aware.
