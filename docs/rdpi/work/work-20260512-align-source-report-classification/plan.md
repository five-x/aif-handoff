# Plan: Align Source Audit Report Classification

## Implementation steps

1. Add shared source evidence classification.
   - Create a shared helper under `packages/shared/src/`.
   - Move the minimal command evidence extraction and inventory/existence command filtering into that helper so validator and synthesis code delegate to one implementation.
   - Export the helper and its types from `packages/shared/src/index.ts`.

2. Align source report validation.
   - Update `packages/shared/src/auditReportValidator.ts` to use the shared helper for `No validated findings`.
   - Add a source classification field to `AuditReportValidationResult`.
   - Ensure inventory-only no-findings reports fail with `missing_substantive_evidence`.
   - Preserve valid finding and valid substantive no-findings behavior.

3. Align synthesis classification.
   - Update `packages/shared/src/auditSynthesisClassifier.ts` to use the shared helper for command evidence extraction and inventory filtering.
   - Preserve the public synthesis outcome names and existing inconclusive protections.

4. Persist classification details through existing flows.
   - Ensure completion evidence exposes the validator's source classification in the `evidence.auditReportValidation` object already stored to roadmap artifact `validationDetailsJson`.
   - If needed, add a compact top-level classification field in validation details while retaining full evidence details.

5. Fix trusted valid artifact counting.
   - Update `packages/data/src/index.ts` summary logic so trusted valid counts for report artifacts require a valid source classification.
   - Keep synthesis readiness based on terminal artifact states so invalid terminal reports still allow terminal inconclusive synthesis.
   - Preserve valid synthesis artifact counting.

6. Add regressions.
   - Add source validator negative tests for inventory-only no-findings using `git ls-files`, `git status`, `ls`, `find`, `Get-ChildItem`, file-existence checks, and mass `path:1` citations.
   - Keep positive no-findings tests using `rg` or another substantive command.
   - Add a data-layer test proving a generic `state === "valid"` report without trusted classification does not increment `validArtifactCount`.
   - Add or adjust integration tests so source validation is the first detector for inventory-only no-findings.

## Verification plan

- `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/auditSynthesisClassifier.test.ts src/__tests__/auditRoadmapContract.test.ts`
- `npm.cmd test --workspace=@aif/data -- src/__tests__/index.test.ts`
- If coordinator/API behavior changes:
  - `npm.cmd test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts src/__tests__/implementer.test.ts`
  - `npm.cmd test --workspace=@aif/api -- src/__tests__/tasks.test.ts`
- `npm.cmd run build --workspace=@aif/shared`
- `npm.cmd run build --workspace=@aif/data`
- `npm.cmd run lint --workspace=@aif/shared`
- `npm.cmd run lint --workspace=@aif/data`
- `git diff --check`

## Acceptance criteria mapping

- Inventory-only reports cannot become trusted no-findings: steps 1, 2, and validator regressions.
- Validators share vocabulary/definitions: steps 1 through 3.
- `roadmap_batch_artifacts` stores precise details: step 4 through `validationDetailsJson`.
- `valid_artifact_count` counts only trusted classifications: step 5.
- Audit-v9 shape classifies as source-level insufficient/inventory-only: validator and integration regressions.
- Final synthesis is no longer first detector: source validator and coordinator/event regressions.
