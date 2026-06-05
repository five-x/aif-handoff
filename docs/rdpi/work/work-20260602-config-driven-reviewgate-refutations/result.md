# Result - work-20260602-config-driven-reviewgate-refutations

## Outcome summary

- Removed the hardcoded LoanOffer duplicate-refutation helper from generic `packages/agent/src/reviewGate.ts`.
- Added config-driven ReviewGate refutations through `reviewGateRefutations` in `.ai-factory/config.yaml`.
- Added shared provider support for `imported_type_without_local_declaration`.
- Preserved the previous LoanOffer false-positive refutation behavior through config-backed tests instead of generic-code literals.
- Kept the generic JSON syntax refutation in ReviewGate.

## Removed hardcoded cases

- Removed the private ReviewGate case that refuted duplicate/conflict findings for `LoanOffer` across `src/data/offers.ts` and `src/types/domain.ts`.
- The replacement is a config entry with scoped `paths`, a `claimPattern`, and a generic imported-type proof.

## New config schema

```yaml
reviewGateRefutations:
  - id: imported-loan-offer-without-local-declaration
    paths:
      - src/data/offers.ts
      - src/types/domain.ts
    claimPattern: "(?:Duplicate type definition|name_conflict|operator_input_required).*LoanOffer"
    proof:
      type: imported_type_without_local_declaration
      symbol: LoanOffer
      importerPath: src/data/offers.ts
      declarationPath: src/types/domain.ts
      importFromPattern: "types/domain"
```

- `importerPath`, `declarationPath`, and `importFromPattern` are optional.
- When proof paths are omitted, the provider explicitly infers importer/declaration candidates from `paths`.
- Invalid entries are ignored fail-closed and cannot refute findings.

## Gate verdicts

- Plan review: `PLAN PASS`.
- Test gate: initial `TEST PASS`; after final-review fix, rerun `TEST PASS`.
- Final review: initial `REVIEW FAIL` for inline named type imports; after fix, rerun `REVIEW PASS`.
- User waivers: none.
- Memsync: `success`; report `docs/memory/reports/work-20260602-config-driven-reviewgate-refutations-memsync-report.md`.

## Verification

- `npm.cmd run test --workspace=@aif/shared -- --run src/__tests__/projectConfig.test.ts src/__tests__/reviewGateRefutations.test.ts`: passed, 2 files and 27 tests.
- `npm.cmd run test --workspace=@aif/agent -- --run src/__tests__/reviewGate.test.ts`: passed, 1 file and 70 tests.
- `npm.cmd run lint`: passed; existing unrelated warning for unused `runRequiredSpecializedReviewers` in `packages/agent/src/subagents/reviewer.ts`.
- `npm.cmd run build`: passed, 7 build tasks.
- Direct source inspection found no `LoanOffer`, `src/data/offers.ts`, or `src/types/domain.ts` in `packages/agent/src/reviewGate.ts`.

## Stable facts

- ReviewGate repository refutations are now split between generic built-in refutations and configured project-specific refutations.
- Configured refutations currently support `imported_type_without_local_declaration`.
- The provider supports both `import type { Symbol } from "..."` and `import { type Symbol } from "..."`.

## Reusable patterns

- For future project-specific ReviewGate exceptions, add a config entry and generic proof handler test instead of adding project terms to `packages/agent/src/reviewGate.ts`.
