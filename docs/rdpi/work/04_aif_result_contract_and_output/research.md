# Research

## Task framing and lane

- Task ID: `04_aif_result_contract_and_output`.
- Lane: `work`, inferred from the P0 stabilization source pack and existing work-lane task IDs `01_*`, `03_*`, and `03b_*`.
- Source task file: `C:/Users/apron/Desktop/aif_stabilization_tz_pack/04_aif_result_contract_and_output.md`.
- Goal: make rework and implementation closeout output compact, machine-checkable, and free of narrative result text by enforcing exactly one fenced `aif-result` JSON block.
- Required contract shape:
  - `status`: `completed | blocked | needs_input`
  - `taskId`
  - `changedFiles`
  - `verification[]` entries with `command`, `status`, and `evidence`
  - `resolvedBlockers[]` entries with `id` and `evidence`
  - `unresolvedBlockers[]` entries with `id` and `reason`
  - `stopReason`: `done | blocked_by_validation | blocked_by_scope | needs_human_input`
- Required evidence hierarchy: missing/invalid `aif-result` blocks rework unless stronger trusted evidence exists, in order: valid current implementation manifest; valid current `aif-result` plus observed verification; accepted operator verified completion evidence; deterministic recovery manifest only when `validation.ok=true`.

## Accepted planning sources or local facts

- RDPI preflight command `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- Existing unrelated dirty state: `docs/kb/windows-codex-bootstrap-validation.md`; leave it untouched.
- `packages/shared/src/aifResultContract.ts:1` currently defines `AifResultStatus` as `completed | blocked | partial`; it does not support `needs_input`.
- `packages/shared/src/aifResultContract.ts:17` models only `status`, string-array blockers, `verificationEvidence`, `changedFiles`, and `raw`; it does not model `taskId`, structured verification entries, structured blocker entries, or `stopReason`.
- `packages/shared/src/aifResultContract.ts:80` already detects a missing fenced block as `missing_aif_result_contract`.
- `packages/shared/src/aifResultContract.ts:93` already detects multiple fenced blocks.
- `packages/shared/src/aifResultContract.ts:100` already rejects invalid JSON.
- `packages/shared/src/aifResultContract.ts:135` currently validates the old status set.
- `packages/shared/src/aifResultContract.ts:156` accepts either `verificationEvidence`, `verification`, or `evidenceRefs`, but flattens object entries to string summaries instead of validating the required `verification[]` object shape.
- `packages/shared/src/__tests__/aifResultContract.test.ts:8` covers a happy path using the old `verificationEvidence` field.
- `packages/shared/src/__tests__/aifResultContract.test.ts:31` covers missing fenced contract.
- `packages/shared/src/__tests__/aifResultContract.test.ts:42` covers completed output with unresolved blockers.
- `packages/shared/src/__tests__/aifResultContract.test.ts:60` covers completed output without verification evidence.
- `packages/agent/src/subagents/implementer.ts:4123` appends deterministic `aif-result` blocks using the old shape and no `taskId` or `stopReason`.
- `packages/agent/src/subagents/implementer.ts:5613` rework prompt already asks for `aif-result`, but the protocol still asks for final result prose such as explicit textual explanations and blocking-finding lists.
- `packages/agent/src/subagents/implementer.ts:6398` validates `aif-result` only for `task.reworkRequested`, currently with `requireCompleted: true` and `requireVerificationEvidence: true`.
- `packages/agent/src/__tests__/implementer.test.ts:158` has a helper that emits old-shape `aif-result` fixtures.
- `packages/agent/src/__tests__/implementer.test.ts:7309` and nearby tests cover rework missing the `aif-result` contract.
- `packages/shared/src/taskCompletionEvidence.ts:1566` validates implementation manifests during review handoff and completion.
- `packages/shared/src/taskCompletionEvidence.ts:1975` adds implementation-manifest validation issues into completion evidence.
- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts:708` covers development review handoff without an implementation manifest.
- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts:818` covers operator-trusted implementation evidence without agent-observed commands.
- Local memory task delta `docs/memory/tasks/work/work-20260602-aif-agent-workflow-stabilization-delta.md` records the existing compact `aif-result` rework contract as validated P0 hardening, but it still reflects the older compact contract, not this stricter schema.
- Prior RDPI result `docs/rdpi/work/work-20260602-aif-agent-workflow-stabilization/result.md` records that rework handoff currently requires exactly one valid fenced `aif-result` block and deterministic audit repair/synthesis closeouts append validated blocks before clearing `reworkRequested`.
- Prior RDPI result `docs/rdpi/work/work-20260602-aif-agent-workflow-stabilization-v2-closeout/result.md` records accepted operator verified completion evidence and trusted committed files/commands as existing trusted closeout surfaces.
- Explorer subagent independently confirmed no expected task files are missing and identified the same schema, prompt, deterministic-output, and evidence-hierarchy mismatches.

## Same-project memory

- Used only local curated memory artifacts under `docs/memory/**`, not shared-memory recall, because the RDPI boundary forbids shared-memory recall before `PLAN PASS` unless explicitly waived.
- Same-project local memory supports the planning conclusion that existing `aif-result` hardening is present but incomplete for this stricter task.

## Cross-project reusable patterns

- No cross-project shared-memory recall was performed before `PLAN PASS`.
- Applicable local reusable pattern: evidence gates must fail closed by default, while preserving trusted operator or validated manifest evidence as higher-priority proof when the lower-priority narrative/contract output is missing.

## Rejected or stale memory candidates

- The prior `partial` status contract is stale for this task because the source brief explicitly requires `needs_input`.
- Old `verificationEvidence` string-array fixtures are compatibility context only; the target contract requires structured `verification` objects.
- Prompt instructions that require textual final-result explanations are stale for rework output because the source brief requires no long prose, no reasoning, no repeated comments, and at most one short paragraph before the single block.

## Open questions

- No blocking planning questions remain.
- Implementation choice to validate: whether non-success statuses (`blocked`, `needs_input`) should pass the parser as valid contracts while the implementer treats them as non-success terminal/blocked outcomes rather than successful rework completion.
- Implementation choice to validate: whether completed verification requires at least one `passed` verification entry. The source says completed without verification is rejected; the strictest practical interpretation is at least one `verification` entry with `status="passed"` and non-empty command/evidence.

## Follow-up after commit 555596e9

- User direction: do not close `04_aif_result_contract_and_output` yet; follow up on commit `555596e9`.
- New gap: the contract is strict at the top level, but still accepts inconsistent `status`/`stopReason` pairs.
- Required status/stopReason matrix:
  - `completed` -> `done` only.
  - `blocked` -> `blocked_by_validation` or `blocked_by_scope` only.
  - `needs_input` -> `needs_human_input` only.
- New gap: nested object readers accept extra fields because they read the required properties without checking object key sets.
- Required nested allowlists:
  - `verification[]`: `command`, `status`, `evidence` only.
  - `resolvedBlockers[]`: `id`, `evidence` only.
  - `unresolvedBlockers[]`: `id`, `reason` only.
- Regression requirement: implementer rework output with `status=completed` and `stopReason=needs_human_input` must be blocked as an invalid contract, not treated as successful closeout.
- Explicit exclusions: do not loosen the validator, do not restore stale `implementationManifestJson` override, and do not implement the change as prompt-only guidance.
- Closeout boundary: do not update `result.md` to close the task and do not run memsync during this follow-up unless the user later asks to close 04.

## Hypotheses

- The safest change is to make `packages/shared/src/aifResultContract.ts` the single strict schema parser/validator and keep prompt/implementer code as consumers.
- The implementer rework prompt should require exactly the new JSON block and move closure evidence into `resolvedBlockers`, `unresolvedBlockers`, and `verification`, removing prose-oriented final-result instructions.
- Deterministic `aif-result` builders should emit the new schema so internal deterministic closeouts do not fail their own validator.
- The missing/invalid `aif-result` hierarchy can be implemented in shared completion-evidence code as a small helper that classifies stronger trusted evidence, then used by implementer rework handoff to decide whether an invalid/missing block is a blocker.
- Focused shared and agent tests are sufficient for the behavioral surface, with full lint/test/build retained as final verification.
