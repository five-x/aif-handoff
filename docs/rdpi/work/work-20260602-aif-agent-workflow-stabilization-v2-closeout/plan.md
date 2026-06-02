# Plan

## Acceptance Criteria

- A committed and manually verified implementation task can be closed without starting implementer again.
- `missing_aif_result_contract` does not block when accepted operator verified completion evidence exists.
- `missing_aif_result_contract` still blocks ordinary agent-only rework without trusted evidence.
- Clean committed worktrees validate implementation `changedFiles` from committed evidence.
- Declared changed files must be present in the submitted commit diff or validated task branch diff, not merely present in the commit tree.
- Pending checklist items and unresolved blockers cannot be bypassed without validated superseded/cancelled evidence or an explicit allowed operator override.
- Operator closeout cannot bypass invalid audit/report validation.
- Operator closeout uses a code-enforced lifecycle/event path and does not enqueue or start implementer again.
- Activity log records accepted and rejected operator closeout decisions.
- Focused unit/route tests, lint, full test suite, and build pass.
- A live server E2E replay closes the manually verified task through `operator_verified_completion` to the expected terminal/next lifecycle state.

## Implementation Checklist

- [ ] Add an operator completion evidence schema/type in the appropriate shared/API layer.
- [ ] Add persistence for accepted operator completion evidence, preferably as a task JSON field if schema migration conventions support it cleanly.
- [ ] Add a service function for `operator_verified_completion` policy checks.
- [ ] Add `POST /tasks/:id/operator-verified-completion` route with request validation.
- [ ] Implement git validation:
  - [ ] commit sha is provided and exists;
  - [ ] every declared changed file appears in the submitted commit diff or validated task branch diff;
  - [ ] a declared file that merely exists in the commit tree is rejected when it was not changed by the submitted commit/task branch;
  - [ ] relevant worktree scope is clean;
  - [ ] dirty files outside the relevant scope do not block unrelated tasks.
- [ ] Implement verification validation:
  - [ ] command is non-empty;
  - [ ] status is `passed`;
  - [ ] output preview is non-empty;
  - [ ] output hash is a valid 64-character SHA-256.
- [ ] Implement closeout safety validation:
  - [ ] pending checklist items reject unless validated superseded/cancelled evidence exists;
  - [ ] unresolved blocking findings reject unless an explicit allowed operator override is provided;
  - [ ] human-approval-required metadata is respected before terminal verified/approved state.
- [ ] Integrate accepted operator evidence into completion evidence hierarchy.
- [ ] Update implementation-manifest/changed-files validation so clean committed work is accepted when committed evidence is valid.
- [ ] Preserve audit/report protections by rejecting operator closeout for invalid report artifacts.
- [ ] Route acceptance through a code-enforced `operator_verified_completion` lifecycle/event path rather than ad-hoc direct status mutation.
- [ ] Assert accepted operator closeout does not enqueue `start_ai`, create a runtime session, or start implementer.
- [ ] Add activity-log messages for accepted and rejected operator closeout.
- [ ] Add focused tests:
  - [ ] accepted blocked implementation closeout;
  - [ ] missing commit sha reject;
  - [ ] nonexistent commit reject;
  - [ ] commit missing file reject;
  - [ ] file present in commit tree but absent from commit/task branch diff reject;
  - [ ] failed or empty verification reject;
  - [ ] dirty relevant worktree reject;
  - [ ] pending checklist reject;
  - [ ] unresolved blockers without explicit allowed override reject;
  - [ ] human-approval-required terminal closeout reject when approval is absent;
  - [ ] invalid audit/report artifact reject;
  - [ ] `missing_aif_result_contract` with operator evidence passes;
  - [ ] `missing_aif_result_contract` without operator evidence blocks;
  - [ ] clean committed plan/package/script files validate.
  - [ ] accepted operator closeout does not start/enqueue implementer.
- [ ] Run focused verification:
  - [ ] `npm.cmd run test --workspace=@aif/shared -- src/__tests__/implementationManifest.test.ts src/__tests__/taskCompletionEvidence.test.ts`
  - [ ] `npm.cmd run test --workspace=@aif/api -- src/__tests__/tasks.test.ts`
  - [ ] `npm.cmd run test --workspace=@aif/agent -- src/__tests__/implementer.test.ts`
- [ ] Run repository verification:
  - [ ] `npm.cmd run lint`
  - [ ] `npm.cmd test`
  - [ ] `npm.cmd run build`

## Scope Boundaries

- Do not implement unrelated P1/P2 cards from the large TЗ in this cycle.
- Do not add large prompt-only instructions as the fix.
- Do not weaken existing `aif-result` validation for normal agent-only rework.
- Do not allow operator completion to mutate arbitrary task statuses without evidence validation.
- Do not bypass audit/report manifest validators.

## Evidence Plan

Before implementation:

- Obtain independent `PLAN PASS`.

After implementation:

- Run the focused and repository verification commands listed above.
- Use an independent tester for `TEST PASS`.
- Use an independent reviewer for `REVIEW PASS`.
- After local `TEST PASS` and before final closeout, replay the live server E2E scenario required by the v2 DoD:
  - [ ] project create/list readback;
  - [ ] task create/list readback;
  - [ ] task comment create/readback;
  - [ ] no agent task execution from the smoke flow;
  - [ ] smoke command passes;
  - [ ] `operator_verified_completion` endpoint accepts committed evidence;
  - [ ] task card reaches expected terminal or next lifecycle state without implementer retry.
- Record final command results, touched files, and any remaining edge cases in `result.md`.

## Expected Touched Areas

- `packages/api/src/routes/tasks.ts`
- `packages/api/src/schemas.ts`
- `packages/api/src/services/taskEvents.ts` or a new task-closeout service under `packages/api/src/services/`
- `packages/shared/src/implementationManifest.ts`
- `packages/shared/src/taskCompletionEvidence.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/schema.ts` and data migration code if a new persisted task field is needed
- `packages/api/src/__tests__/tasks.test.ts`
- `packages/shared/src/__tests__/implementationManifest.test.ts`
- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
- `packages/agent/src/__tests__/implementer.test.ts` if rework hierarchy needs agent-side regression coverage
