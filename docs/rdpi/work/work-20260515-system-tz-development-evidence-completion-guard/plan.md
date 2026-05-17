# Plan

## Scope

Implement the first System TZ development evidence slice for `feature`, `fix`, `docs`, and `tests` tasks, while preserving strict audit/report behavior.

## Steps

1. Add shared implementation manifest contract.
   - Create `packages/shared/src/implementationManifest.ts`.
   - Define v1 manifest, verification evidence, acceptance status, commit evidence, issue codes, parser, stable plan-manifest hashing, and validation helpers.
   - Export the contract from `packages/shared/src/index.ts` and browser-safe exports only if needed by existing web imports.

2. Persist the manifest.
   - Add `implementationManifest` / `implementation_manifest_json` to shared task schema, SQLite bootstrap, migration v27, shared task DTOs, and data row hydration.
   - Keep the column nullable for existing tasks.

3. Extend completion evidence.
   - Extend `TaskCompletionEvidenceTask`, result evidence, and issue codes in `packages/shared/src/taskCompletionEvidence.ts`.
   - Add a review-handoff phase for resolved intents `feature`, `fix`, `docs`, and `tests`, requiring a valid `implementationManifest` before non-skip implementer success can move to `review`.
   - For completion phase and resolved intents `feature`, `fix`, `docs`, and `tests`, require and validate `implementationManifest`.
   - Preserve existing audit report rules and existing intent changed-file checks.
   - Add blocking issues for missing/invalid manifest, plan hash drift, changed-file mismatch, missing verification, missing acceptance evidence, checklist drift, unintended dirty files, and missing fix regression explanation.

4. Capture manifest from implementer output.
   - Update `packages/agent/src/subagents/implementer.ts` prompt rules to require an `aif-implementation-manifest` JSON block for development intents.
   - Parse the block after runtime completion and store canonical JSON in `implementationManifestJson`.
   - Keep audit/report deterministic paths unchanged.

5. Update timeline/trust projection.
   - Update `packages/data/src/index.ts` generic projection so `implementation_manifest` is backed by `implementationManifest`, not `implementationLog`.
   - Derive source diff, test result, and commit evidence artifacts from manifest content.
   - Keep implementation logs as context only.

6. Add focused tests.
   - Shared manifest parser/validator tests.
   - Completion evidence tests for feature/fix/docs/tests pass and fail cases.
   - Coordinator tests proving non-skip development work cannot enter `review` without a valid manifest and skip-review development work cannot enter `done` without one.
   - API task-event tests for direct terminal transitions when applicable.
   - Shared schema/database tests for fresh DB creation, migration v26 to v27, nullable legacy task rows, and task create/update/read hydration of `implementationManifest`.
   - Data timeline test showing plain `implementationLog` does not create trusted implementation-manifest evidence.
   - Implementer test proving runtime output with an `aif-implementation-manifest` block is stored as canonical task manifest JSON.

7. Run verification.
   - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskCompletionEvidence.test.ts src/__tests__/taskIntent.test.ts src/__tests__/planQuality.test.ts`
   - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/schema.test.ts`
   - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
   - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/workflowTimeline.test.ts`
   - `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinator.test.ts src/__tests__/implementer.test.ts`
   - `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts`
   - `npm.cmd run build`
   - `npm.cmd run lint`
   - `git diff --check`

## Acceptance Criteria

- ImplementationManifest v1 schema records task id, intent, plan manifest hash, changed files, verification evidence, acceptance criteria status, evidence refs, and known limitations.
- Development `review`, `done`, and `verified` transitions block when the manifest is absent/invalid, changed files violate intent, plan hash drifts, acceptance criteria lack evidence, verification is missing, checklist drift remains, or unintended dirty files exist.
- Feature and fix tasks without passing verification cannot become done through coordinator completion paths.
- Fix tasks without a regression explanation block.
- Docs source changes and tests source changes continue to require explicit pre-implementation authorization.
- Audit/report tasks continue to use existing audit completion evidence semantics and do not require development manifests.
- Generic timeline projection no longer treats `implementationLog` as proof of an implementation manifest.

## PLAN PASS Requirements

An independent reviewer must return `PLAN PASS` before implementation starts. A `PLAN FAIL` requires revising `design.md` and `plan.md` before coding.
