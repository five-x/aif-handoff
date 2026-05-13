# Plan

## Implementation plan

1. Add a shared Plan B regression suite.
   - Create `packages/shared/src/__tests__/planBRegression.test.ts`.
   - Cover broad audit decomposition with `classifyAuditDecompositionRequest()`.
   - Cover weak broad audit `PLAN FAIL` categories with `evaluateTaskPlanQuality()`.
   - Cover missing/forged/inconclusive synthesis metadata with `classifyAuditSynthesisOutput()` and `formatAuditSynthesisOutcomeForArtifact()`.
   - Include a non-audit canary proving a normal implementation plan remains accepted.

2. Add an API Plan B regression suite.
   - Create `packages/api/src/__tests__/planBRegression.test.ts`.
   - Use the existing `@aif/shared/server` test DB mock and mocked `runApiRuntimeOneShot()` pattern.
   - Assert a broad audit roadmap request with invalid model output produces deterministic scoped child report cards and exactly one final synthesis card.
   - Assert generated source report tasks include diagnostic-only constraints, concrete `Scope:`, `Risk hypotheses:`, `Allowed changes: only create/update one report artifact`, report artifacts, no-findings guardrails, and substantive evidence requirements.
   - Assert the synthesis card includes `AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT` and child report status requirements.
   - Assert deterministic valid audit roadmap conversion does not call the extraction model.
   - Assert importing the generated audit tasks creates report/synthesis batch artifacts, pauses synthesis with `synthesis_not_ready`, and keeps report cards review-enabled/full-planning audit tasks.

3. Add a data Plan B regression suite.
   - Create `packages/data/src/__tests__/planBRegression.test.ts`.
   - Use `createTestDb()` and the existing data-layer module mocking pattern.
   - Seed one project plus report/synthesis tasks.
   - Assert synthesis remains blocked while a child report is missing.
   - Assert retryable invalid/weak child states stay out of synthesis readiness.
   - Assert stale boundary updates cannot promote a reopened child report.
   - Assert explicit terminal source states can appear in synthesis inputs without counting as trusted valid reports.

4. Add an agent Plan B regression suite.
   - Create `packages/agent/src/__tests__/planBRegression.test.ts`.
   - Reuse the existing mocked `@aif/data` and `reviewGate` pattern around `handleAutoReviewGate()`.
   - Assert a repeated same-blocker review returns `manual_review_required` with `handoffReason: "stalled_rework_loop"` before `maxReviewIterations`.
   - Assert the generated review summary comment includes the stalled-loop handoff reason and stalled finding section.

5. Document the deterministic regression command in `docs/rdpi/work/work-20260513-plan-b-audit-decomposition-regression-suite/result.md` after implementation and gate results.
   - Use focused commands as the task result's test command.
   - Keep runtime-heavy or root-wide commands optional unless required by the gates.

6. Run `$memsync MODE=auto LANE=work TASK_ID=work-20260513-plan-b-audit-decomposition-regression-suite` only after `PLAN PASS`, `TEST PASS`, and `REVIEW PASS`.

## Acceptance criteria

- Tests reproduce a fast review/rework loop and prove terminalization behavior.
- Tests cover broad audit decomposition into child report-card behavior through API generation/conversion/import contract surfaces, not only through classification.
- Tests prove parent synthesis cannot validate from missing, stale, retryable weak, forged, or inconclusive child-source evidence.
- Tests cover `PLAN FAIL` for weak broad audit plans.
- Tests include at least one non-audit canary guarding against overfitting workflow logic to audit tasks.
- `result.md` records the exact deterministic test command.

## Verification plan

- Independent plan review must return `PLAN PASS` before implementation.
- Focused implementation verification:
  - `npm.cmd test --workspace=@aif/shared -- src/__tests__/planBRegression.test.ts src/__tests__/auditRoadmapContract.test.ts src/__tests__/planQuality.test.ts src/__tests__/auditSynthesisClassifier.test.ts`
  - `npm.cmd test --workspace=@aif/api -- src/__tests__/planBRegression.test.ts src/__tests__/roadmapGeneration.test.ts`
  - `npm.cmd test --workspace=@aif/data -- src/__tests__/planBRegression.test.ts src/__tests__/index.test.ts`
  - `npm.cmd test --workspace=@aif/agent -- src/__tests__/planBRegression.test.ts src/__tests__/autoReviewHandler.test.ts`
- If any focused suite exposes a regression in touched Plan B behavior, fix the narrow blocker and rerun the invalidated focused command.
- Independent tester must return `TEST PASS` after implementation.
- Independent final reviewer must return `REVIEW PASS` after testing.
- Optional broader confidence if time permits and focused gates are green: `npm.cmd run lint` and `npm.cmd run build`.

## Reusable patterns

- Keep multi-incident workflow regression suites deterministic, package-local, and free of live model calls.
- Prefer public contract functions and data-layer APIs over private helper exports when building CI regressions.
