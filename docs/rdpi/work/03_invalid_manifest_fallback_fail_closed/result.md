# Result

## Outcome

Completed.

Invalid or missing required implementation manifests now fail closed in the implementer before `implementationManifestJson` can be persisted as accepted evidence. Normalized manifest JSON is retained only as diagnostic state when validation fails.

## Gate outcomes

- Explorer research: completed. Independent explorer identified the extracted-manifest repair and persistence path.
- Plan review: first review returned `PLAN FAIL`; RDPI artifacts were revised to make missing required manifests fail closed and to specify retry/cap ownership.
- Plan review rerun: `PLAN PASS`.
- Coder: completed implementation in the approved write scope.
- Tester: first `TEST PASS` was invalidated by final review findings.
- Final review: first review returned `REVIEW FAIL` because early block paths could leave stale `implementationManifestJson`.
- Revision: early checklist, invalid `aif-result`, and textual block paths were hardened and stale-manifest regressions were added.
- Tester rerun: `TEST PASS`.
- Final review rerun: `REVIEW PASS`.
- User waivers: none.

## Implementation summary

- `packages/agent/src/subagents/implementer.ts`
  - Added `validateImplementationManifestForPersistence`, which validates any candidate manifest against the current task, synced plan, and changed-file evidence before persistence.
  - Added `blockTaskForImplementationManifestFailure`, which sets the shared fail-closed state:
    - below cap: `status="implementing"`, `reworkRequested=true`, `manualReviewRequired=false`, `retryCount` incremented, `blockedReason="implementation_manifest_invalid: <issueCodes>"`;
    - after cap: `status="blocked_external"`, `reworkRequested=false`, `manualReviewRequired=true`, `blockedReason="implementation_manifest_invalid_after_rework_limit: <issueCodes>"`.
  - Added stale manifest clearing for required-manifest block paths by writing `implementationManifestJson: null`.
  - Removed the accepted-evidence repair path that replaced invalid extracted manifests with deterministic fallback.
  - Removed accepted deterministic fallback creation for omitted required manifests.
  - Changed deterministic runtime recovery so it records diagnostic text only and does not emit an accepted manifest block.
  - Routed checklist-manifest failures and textual blocked output without a current manifest through the same manifest fail-closed policy.

- `packages/agent/src/__tests__/implementer.test.ts`
  - Updated omitted-manifest fallback expectations to fail closed.
  - Added/updated regressions for changed-file drift, invalid rework manifests, equivalent-command omitted manifests, runtime recovery, rework limit manual review, and stale manifest clearing.

## Concrete diff locations

Before this change, invalid normalized JSON could become accepted evidence through three implementer-side paths:

- Extracted manifest repair: after `extractNormalizedImplementationManifest(...)`, invalid extracted manifests could be passed to `repairExtractedImplementationManifest(...)` and replaced with a deterministic fallback.
- Missing manifest fallback: when `implementationManifestJson` was absent, `buildDeterministicImplementationManifest(...)` could populate the trusted task field.
- Rework fallback: on rework, `buildDeterministicImplementationManifest(...)` could overwrite stale/invalid agent output with deterministic evidence.

Those paths were changed as follows:

- The extracted-manifest repair helpers were removed from `packages/agent/src/subagents/implementer.ts`.
- Final persistence now only assigns `taskPatch.implementationManifestJson` after `validateImplementationManifestForPersistence(...)` returns `ok=true`.
- Invalid or missing required manifests call `blockTaskForImplementationManifestFailure(...)`, which clears `implementationManifestJson` and records issue codes in the activity log.
- Early returns before final persistence now either route through the manifest failure helper or clear stale `implementationManifestJson` for required-manifest tasks.

## Verification

Local verification run by lead:

- `npm.cmd exec -- tsc --noEmit --pretty false --project packages/agent/tsconfig.json`: passed.
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts`: passed.
- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/implementationManifest.test.ts src/__tests__/taskCompletionEvidence.test.ts`: passed.

Independent tester rerun:

- `npm.cmd exec -- tsc --noEmit --pretty false --project packages/agent/tsconfig.json`: passed.
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts`: passed.
- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/implementationManifest.test.ts src/__tests__/taskCompletionEvidence.test.ts`: passed, 183 tests.
- `npm.cmd test`: passed across the full turbo test suite.

## Review notes

The final reviewer found no blocking issues. One low-priority follow-up was noted: a future targeted regression could seed a stale manifest in another invalid checklist-disposition case, although the current implementation path already clears stale manifests through the shared helper and existing stale-manifest regressions cover the critical early block classes.

## Memsync

- Command: `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id 03_invalid_manifest_fallback_fail_closed --project aif-handoff --entity aif-handoff`
- Status: `success`.
- Reason: `ingested 12 shared-memory items`.
- Report: `docs/memory/reports/03_invalid_manifest_fallback_fail_closed-memsync-report.md`.
