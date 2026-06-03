# Plan

## Implementation plan

1. Update `packages/shared/src/aifResultContract.ts`.
   - Change status type to `completed | blocked | needs_input`.
   - Add `AifResultStopReason`, structured verification, resolved blocker, and unresolved blocker types.
   - Validate exactly one fenced block.
   - Validate `taskId` when expected.
   - Validate arrays and required fields instead of flattening old aliases.
   - Reject `completed` with unresolved blockers.
   - Reject `completed` with no passed verification item when verification is required.
   - Preserve clear issue codes for missing contract, multiple blocks, invalid JSON, invalid status, missing verification, and related schema problems.
2. Update shared tests in `packages/shared/src/__tests__/aifResultContract.test.ts`.
   - Cover the required happy path.
   - Cover missing block, multiple blocks, invalid JSON, invalid status, missing/wrong task id, completed with unresolved blockers, completed without verification, and blocked with reason accepted as structured non-success.
3. Add stronger-evidence classification in `packages/shared/src/taskCompletionEvidence.ts`.
   - Export a helper that takes a task, optional current result text, project root, and phase, then reports whether trusted evidence exists and why.
   - Use implementation-manifest validation for current manifests.
   - Treat trusted committed files plus trusted verification commands as accepted operator evidence.
   - Treat valid current `aif-result` plus passed verification as trusted result evidence.
   - Treat deterministic recovery only through already-valid implementation-manifest validation, not by accepting invalid normalized JSON.
4. Add focused `taskCompletionEvidence` tests.
   - Missing `aif-result` has no override without trusted evidence.
   - Missing `aif-result` is overridden by valid implementation manifest evidence.
   - Missing `aif-result` is overridden by accepted operator completion evidence.
   - Invalid deterministic/manifest evidence does not override.
5. Update `packages/agent/src/subagents/implementer.ts`.
   - Replace deterministic `appendDeterministicAifResultContract` output shape with the new schema and pass `taskId`.
   - Replace rework prompt output instructions with the single-block contract and remove prose/listing requirements.
   - Validate rework output against expected `taskId`.
   - If `aif-result` is missing/invalid and no stronger trusted evidence exists, block as `aif_result_contract_invalid`.
   - If status is `blocked` or `needs_input`, persist a non-success blocked/input state with the structured reason instead of treating the rework as complete.
6. Update `packages/agent/src/__tests__/implementer.test.ts`.
   - Update `aifResultSuccessBlock` and all old-shape fixtures.
   - Add/adjust tests for missing `aif-result`, multiple blocks, invalid JSON, blocked status, completed without verification, operator/trusted evidence override where applicable, and prompt text no longer requiring restatement or narrative prose.
7. Deferred closeout work.
   - Do not update `result.md` as a closeout artifact during this follow-up.
   - Do not run memsync during this follow-up.
   - Record final gates and run memsync only after the user explicitly asks to close 04.

## Acceptance criteria

- Rework output without valid `aif-result` is not considered successful unless stronger trusted evidence exists.
- Narrative output is not required by the rework prompt.
- Parser/validator covers the strict result contract with tests.
- `blocked` and `needs_input` are structured outcomes, not successful closeout.
- This follow-up does not close 04 and does not run memsync.
- Mandatory follow-up gates pass before final response: `PLAN PASS`, `TEST PASS`, `REVIEW PASS`.

## Verification plan

- `npm.cmd run test --workspace=@aif/shared -- src/__tests__/aifResultContract.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd run test --workspace=@aif/agent -- src/__tests__/implementer.test.ts`
- `rg -n "FIRST, restate the rework request|restate the rework request|final result text|verificationEvidence" packages/agent/src/subagents/implementer.ts packages/agent/src/__tests__/implementer.test.ts packages/shared/src/aifResultContract.ts packages/shared/src/__tests__/aifResultContract.test.ts`
- `git diff --check`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run build`

## Reusable patterns

- Centralize machine-readable result contracts in shared validators and let prompts consume the validator contract.
- Keep evidence hierarchy explicit: higher-trust manifests/operator evidence can override lower-trust missing closeout text, but invalid deterministic recovery cannot.

## Follow-up implementation plan after commit 555596e9

1. Update `packages/shared/src/aifResultContract.ts`.
   - Add nested exact-key allowlist validation for `verification`, `resolvedBlockers`, and `unresolvedBlockers`.
   - Add `status`/`stopReason` matrix validation after enum checks.
   - Keep valid non-success contracts accepted only when their stop reason matches the status.
2. Update `packages/shared/src/__tests__/aifResultContract.test.ts`.
   - Add passing cases for valid `blocked` and `needs_input` stop reasons.
   - Add failing cases for `completed + needs_human_input`, `blocked + done`, and `needs_input + done`.
   - Add failing cases for extra nested fields in each nested array type.
3. Update `packages/agent/src/__tests__/implementer.test.ts`.
   - Add a rework regression where the model returns `status=completed` with `stopReason=needs_human_input`.
   - Assert the task remains blocked with `invalid_aif_result_stop_reason` and does not clear `reworkRequested`.
4. Do not modify the stale persisted manifest override tests except as necessary to keep them passing.
5. Verification for this follow-up:
   - `npm.cmd run test --workspace=@aif/shared -- src/__tests__/aifResultContract.test.ts`
   - `npm.cmd run test --workspace=@aif/agent -- src/__tests__/implementer.test.ts`
   - `git diff --check`
