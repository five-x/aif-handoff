# Plan - work-20260602-config-driven-reviewgate-refutations

## Implementation plan

1. Extend `packages/shared/src/projectConfig.ts`.
   - Add review-gate refutation types to `AifProjectConfig`.
   - Add default empty `reviewGateRefutations`.
   - Normalize YAML entries through a strict helper that returns only valid entries.

2. Add `packages/shared/src/reviewGateRefutations.ts`.
   - Implement safe path reads under `projectRoot`.
   - Implement configured finding matching.
   - Implement `imported_type_without_local_declaration`.
   - Export the public helper and types through `packages/shared/src/index.ts`.

3. Update `packages/agent/src/reviewGate.ts`.
   - Remove the hardcoded LoanOffer refutation helper.
   - Load project config in `filterRefutedRepositoryFindings`.
   - Apply configured refutations before the generic JSON syntax refutation.

4. Update tests.
   - Add shared provider tests in `packages/shared/src/__tests__/reviewGateRefutations.test.ts`.
   - Extend `packages/shared/src/__tests__/projectConfig.test.ts`.
   - Update LoanOffer ReviewGate tests to create `.ai-factory/config.yaml`.
   - Add a generic-code guard test for removed project-specific terms.

5. Update `result.md` after implementation and gates.
   - List removed hardcoded cases.
   - Document the new config schema.
   - Record `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` outcomes.

## Verification plan

- Targeted shared tests:
  - `npm.cmd test -- --run packages/shared/src/__tests__/projectConfig.test.ts packages/shared/src/__tests__/reviewGateRefutations.test.ts`
- Targeted agent tests:
  - `npm.cmd test -- --run packages/agent/src/__tests__/reviewGate.test.ts`
- Final project checks if targeted tests pass:
  - `npm.cmd run lint`
  - `npm.cmd run build`

## Acceptance criteria mapping

- Hardcoded project exception removed: covered by code removal and guard test.
- Config-driven behavior tested: covered by shared provider tests and updated agent regression.
- ReviewGate remains deterministic: provider is local-file-backed and ignores invalid entries.
- `result.md` lists removed hardcoded cases and new config schema: close-out step.

## Required gates

- Plan review: independent reviewer must return `PLAN PASS` before implementation.
- Implementation: coder may edit only after `PLAN PASS`.
- Test gate: independent tester must return `TEST PASS`.
- Final review: independent reviewer must return `REVIEW PASS`.
