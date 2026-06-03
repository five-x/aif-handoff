# Research

## Task framing and lane

- Task ID: `03_invalid_manifest_fallback_fail_closed`.
- Lane: `work`, inferred from the P0 stabilization task content and the repository's existing work-lane stabilization history.
- Source task file: `C:/Users/apron/Desktop/aif_stabilization_tz_pack/03_invalid_manifest_fallback_fail_closed.md`.
- Goal: invalid or missing implementation manifests must fail closed. If `validateImplementationManifest` returns `ok=false`, `validation.normalizedJson` must not be persisted or returned as accepted `implementationManifestJson`.
- Required behavior: missing/invalid development manifests request rework while below implementation evidence rework limit; after the limit, block with manual review required.

## Accepted planning sources or local facts

- RDPI preflight command was run before touching artifacts: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- `packages/agent/src/subagents/implementer.ts:541` extracts and normalizes `aif-implementation-manifest` blocks from implementer output before validation.
- `packages/agent/src/subagents/implementer.ts:736` builds deterministic fallback manifests and validates those fallback manifests before returning them.
- `packages/agent/src/subagents/implementer.ts:811` already returns `null` when the deterministic fallback builder's own validation fails, but the task requires missing required manifests to block instead of being silently filled by fallback.
- `packages/agent/src/subagents/implementer.ts:846` validates extracted manifests, but currently attempts deterministic repair for selected validation failures.
- `packages/agent/src/subagents/implementer.ts:865` and `packages/agent/src/subagents/implementer.ts:874` can return the original extracted manifest when validation failed but repair is skipped or unavailable.
- `packages/agent/src/subagents/implementer.ts:869` can replace an invalid extracted manifest with a deterministic fallback.
- `packages/agent/src/subagents/implementer.ts:6273` extracts the normalized manifest, then repair/build logic decides the value that later flows into persistence.
- `packages/agent/src/subagents/implementer.ts:6372` currently builds a deterministic implementation manifest when the implementer omitted one.
- `packages/agent/src/subagents/implementer.ts:6379` currently rebuilds a rework implementation manifest deterministically whenever one can be built, even if the agent returned a stale but invalid manifest.
- `packages/agent/src/subagents/implementer.ts:6423` persists any non-null `implementationManifestJson` into the task patch.
- `packages/shared/src/implementationManifest.ts:1027` defines `validateImplementationManifest`.
- `packages/shared/src/implementationManifest.ts:1072` normalizes manifest JSON, and `packages/shared/src/implementationManifest.ts:1329` returns `normalizedJson` even when semantic validation issues make `ok=false`.
- Existing validator issue coverage includes changed-file mismatch, unobserved verification, unsupported verification, missing acceptance evidence, checklist drift, scope mismatch, and missing fix regression explanation.
- `packages/shared/src/taskCompletionEvidence.ts:1566` validates persisted `task.implementationManifestJson` during completion/review evidence evaluation.
- `packages/agent/src/coordinator.ts:2802` lists implementation evidence issue codes eligible for rework.
- `packages/agent/src/coordinator.ts:2830` returns implementation evidence failures to rework using `retryCount`.
- `packages/agent/src/coordinator.ts:2842` caps implementation evidence rework with `min(bounded maxReviewIterations, AGENT_IMPLEMENTATION_EVIDENCE_MAX_REWORK)`.
- Existing regression tests in `packages/agent/src/__tests__/implementer.test.ts` cover omitted-manifest deterministic fallback and invalid fallback rejection; the omitted-manifest fallback tests must be revised because the task explicitly requires missing manifests to block.
- Existing test `packages/agent/src/__tests__/implementer.test.ts:6993` currently expects a changed-files-drift extracted manifest to be repaired into accepted fallback evidence; that expectation conflicts with this task.
- Explorer subagent completed read-only research and independently identified the same leak path through extracted normalized manifest repair and final persistence.

## Same-project memory

- Not queried before `PLAN PASS` per RDPI boundary. Local repo facts and local docs are sufficient for the plan.

## Cross-project reusable patterns

- Not queried before `PLAN PASS` per RDPI boundary.
- Applicable local reusable pattern: fail-closed evidence gates should preserve diagnostics but avoid upgrading untrusted normalized artifacts into trusted evidence.

## Rejected or stale memory candidates

- No shared-memory candidates were evaluated before `PLAN PASS`.

## Open questions

- No blocking planning questions remain after plan-review revision.
- Implementation detail to preserve: the same cap policy as coordinator must be used if blocking before review handoff, so this pre-persistence guard does not create an uncapped rework loop.

## Hypotheses

- The minimal safe fix is in `packages/agent/src/subagents/implementer.ts`: final validation before persistence must gate `implementationManifestJson`; invalid or missing required manifests must block/rework rather than be repaired into accepted evidence.
- Shared validators probably need no production change because they already return issue codes and `ok=false`; tests can document that `normalizedJson` may exist while still being invalid.
- Focused tests in `packages/agent/src/__tests__/implementer.test.ts` should catch the main regression because the bug exists in implementer extraction/repair/persistence behavior.
