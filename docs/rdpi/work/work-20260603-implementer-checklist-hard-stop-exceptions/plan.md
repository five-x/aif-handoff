# Plan

## Implementation plan

1. Extend the shared implementation manifest checklist model.
   - Add a checklist disposition entry type.
   - Add `supersededItems`, `cancelledItems`, and `waivedItems` to `ImplementationManifestPlanChecklist`.
   - Normalize those fields from parsed manifest JSON.
   - Preserve backwards compatibility for manifests that do not include the fields.

2. Add shared validation for checklist dispositions.
   - Validate disposition `item`, `reason`, and `evidenceRefs`.
   - Require disposition evidence refs to point to declared verification evidence.
   - When actual pending plan checklist items are available, require every pending item to be covered by a valid disposition entry.
   - Keep `plan_checklist_drift` for pending counts without full valid disposition coverage.

3. Wire the validator into review-handoff evidence.
   - Ensure `evaluateTaskCompletionEvidence` passes enough task plan context for checklist disposition validation.
   - Keep completion/review handoff blocked for invalid or unsupported dispositions.

4. Update the implementer hard-stop branch.
   - Extract and validate the current implementation manifest before applying the pending-checklist block.
   - Allow review handoff only when the manifest validly disposes every pending checklist item.
   - Otherwise preserve the existing blocked fields:
     - `status = "blocked_external"`
     - `blockedReason = "implementation_checklist_incomplete: <N> pending checklist item(s)"`
     - `blockedFromStatus = "implementing"`
     - `retryAfter = null`
     - `manualReviewRequired = false`
     - `reworkRequested = true`
   - Add an activity log entry that includes the pending count for the blocked path.

5. Add tests.
   - Shared manifest tests for valid superseded, cancelled, and waived checklist dispositions.
   - Shared manifest tests for missing reason, missing evidence refs, unknown evidence refs, and pending items not covered by dispositions.
   - Task completion evidence tests proving raw pending plan checklist items cannot pass unless the manifest exception is valid.
   - Implementer tests proving:
     - pending checkbox after implementer result blocks;
     - auto-sync result with pending items blocks;
     - `reworkRequested` remains `true`;
     - `manualReviewRequired` is `false`;
     - valid manifest disposition can pass;
     - invalid/unsupported disposition still blocks.
   - Coordinator test proving the task does not move to `review` when the implementer blocks for incomplete checklist.

## Acceptance criteria

- Unfinished checklist items do not reach `review`, `qa`, or `done` unless every pending item is explicitly superseded, cancelled, or waived by a valid manifest disposition with evidence.
- Blocking happens before review handoff.
- Activity log contains `implementation_checklist_incomplete` and the pending count.
- The implementer remains a fail-closed guard; completion evidence validation is not the only protection.
- `reworkRequested` remains `true` on checklist-incomplete blocks.
- `manualReviewRequired` is `false` for this fixable checklist-incomplete block.
- `result.md` records both a pending-checklist test and an accepted supersede/waiver test.

## Verification plan

- `npm.cmd run test --workspace=@aif/shared -- src/__tests__/implementationManifest.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd run test --workspace=@aif/agent -- src/__tests__/implementer.test.ts src/__tests__/coordinator.test.ts`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run build`
- Independent tester must run the final verification plan and return `TEST PASS` before close-out.
- Independent reviewer must inspect the final diff after `TEST PASS` and return `REVIEW PASS` before close-out.

## Reusable patterns

- Fail-closed exception design: every bypass of a hard stop must be structured, validated, evidence-backed, and covered by negative tests.
