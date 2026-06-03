# Plan

## Implementation plan

1. Update `packages/agent/src/subagents/implementer.ts`.
2. Remove or bypass `repairExtractedImplementationManifest` behavior that replaces invalid extracted manifests with deterministic fallback.
3. Add a helper that validates a candidate implementation manifest before persistence.
4. Remove accepted deterministic fallback creation for missing required manifests. Missing required manifests must be handled through the same final validation/block path with `missing_implementation_manifest`.
5. On validation failure, persist the implementation log and synced plan, but do not write `implementationManifestJson`.
6. Set task state with issue codes using the existing implementation evidence rework counter policy:
   - Compute `currentIteration = task.retryCount ?? 0`.
   - Compute `maxIterations = min(bounded maxReviewIterations, AGENT_IMPLEMENTATION_EVIDENCE_MAX_REWORK)`.
   - If `currentIteration + 1 <= maxIterations`, set `status="implementing"`, `blockedReason="implementation_manifest_invalid: <issueCodes>"`, `retryCount=currentIteration + 1`, `manualReviewRequired=false`, `reworkRequested=true`.
   - Otherwise set `status="blocked_external"`, `blockedReason="implementation_manifest_invalid_after_rework_limit: <issueCodes>"`, keep `retryCount`, `manualReviewRequired=true`, `reworkRequested=false`.
7. Update or remove deterministic runtime-recovery behavior that would otherwise produce accepted `implementationManifestJson` without an agent-provided valid manifest.
8. Update tests in `packages/agent/src/__tests__/implementer.test.ts`:
   - Change the changed-files-drift repair test to expect blocked rework and no persisted manifest.
   - Add a regression proving an invalid normalized extracted manifest is not persisted as accepted evidence.
   - Add a rework regression proving deterministic fallback does not override invalid agent output.
   - Add a rework-limit regression proving manual review is required after the cap.
   - Change omitted-manifest fallback tests to expect rework/manual review behavior instead of accepted deterministic evidence.
9. Add or adjust shared tests if needed to document `validation.ok=false` with non-null `normalizedJson`.

## Acceptance criteria

- Invalid manifest never becomes accepted `implementationManifestJson`.
- Missing required manifest never becomes accepted deterministic fallback `implementationManifestJson`.
- `implementationManifestJson` is updated only after `validateImplementationManifest(...).ok === true`.
- Activity log records manifest issue codes when blocking.
- Tests prove `validation.normalizedJson` alone does not pass.
- `result.md` records the concrete diff location where invalid normalized JSON could previously be returned or saved and how it changed.

## Verification plan

- Independent `PLAN PASS` gate before edits.
- Focused tests after implementation:
  - `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts`
  - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/implementationManifest.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- If focused tests pass and scope warrants, run:
  - `npm.cmd test`
- Independent tester gate must return `TEST PASS`.
- Independent final reviewer gate must return `REVIEW PASS`.

## Reusable patterns

- Final evidence persistence must validate at the last write boundary, not only at parse/normalization time.
- Diagnostic normalized artifacts may be logged, but cannot cross into trusted evidence fields without a passing validator result.
