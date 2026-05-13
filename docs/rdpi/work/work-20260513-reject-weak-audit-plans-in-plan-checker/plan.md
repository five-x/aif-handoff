# Plan: Reject Weak Audit Plans In Plan Checker

## Gate status

Pending independent `PLAN PASS` or `PLAN FAIL`.

## Implementation steps

1. Extend shared plan-quality issue taxonomy.
   - Add audit-specific issue codes for missing scoped evidence targets, missing excluded areas, missing expected report structure, missing child-report decision, and missing audit decomposition.
   - Keep existing issue codes stable.

2. Add audit plan contract helpers in `packages/shared/src/planQuality.ts`.
   - Detect scoped evidence target markers and concrete target language.
   - Detect explicit exclusions/out-of-scope markers, accepting explicit `none`.
   - Detect expected report fields: finding ID, severity or confidence, evidence, risk, proposed fix, and verification.
   - Detect narrow no-child-report decisions and decomposed child/source report plus synthesis decisions.
   - Reuse `extractReportArtifactPaths()` and existing diagnostic task inference.

3. Integrate broad audit decomposition classification.
   - Import and call `classifyAuditDecompositionRequest()` for audit/diagnostic task plans.
   - Treat `requiresDecomposition: true` as acceptable only when the plan has decomposed audit structure.
   - Include classifier reason codes in the issue message for missing decomposition.

4. Update deterministic diagnostic fallback.
   - Do not emit fallback for audits classified as requiring decomposition.
   - Add scoped evidence targets, exclusions, expected report structure, and no-child-report decision to fallback plans for narrow diagnostic tasks.
   - Keep fallback output validated by `evaluateTaskPlanQuality()`.

5. Add focused tests.
   - Update `packages/shared/src/__tests__/planQuality.test.ts` for weak broad, oversized broad, acceptable narrow, acceptable decomposed, deterministic fallback, and non-audit unaffected cases.
   - Update `packages/agent/src/__tests__/planChecker.test.ts` for plan-checker rejection of weak broad audit plans and preserved narrow fallback behavior.

6. Run verification after implementation.
   - `npm.cmd test --workspace @aif/shared -- planQuality`
   - `npm.cmd test --workspace @aif/agent -- planChecker`
   - If classifier behavior is touched beyond import/use, also run `npm.cmd test --workspace @aif/shared -- auditRoadmapContract planQuality`.

7. Close out.
   - Record `PLAN PASS`, `TEST PASS`, `REVIEW PASS`, implementation summary, and verification commands in `result.md`.
   - Run `$memsync MODE=auto LANE=work TASK_ID=work-20260513-reject-weak-audit-plans-in-plan-checker`.
   - Update only the matching entry in `docs/intake/work_status.json` after successful local memory review.

## Acceptance criteria

- Weak broad audit plans fail before implementation with `TaskPlanQualityError`.
- Oversized audit plans that cover unrelated areas fail unless they declare decomposition.
- Narrow scoped audit plans pass when they declare evidence targets, exclusions, expected report structure, and no-child-report decision.
- Decomposed audit plans pass when they declare child/source reports, synthesis expectations, evidence targets, exclusions, and report structure.
- Plan-review feedback names missing facts or decomposition gaps.
- Non-audit plans are not forced to carry audit-only fields.

## Required gates

- Independent `PLAN PASS` before source/test edits.
- Independent `TEST PASS` after verification.
- Independent `REVIEW PASS` after tests pass.
