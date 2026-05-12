# Plan: Audit Artifact Attempt Lifecycle

## Scope

Implement attempt history, source/terminal inconclusive lifecycle states, retry/terminalization policy hooks, and manual exception auditing for roadmap audit artifacts.

Do not create or execute follow-up tasks. Do not remove task-level `maxReviewIterations`.

## Implementation steps

1. Add the append-only artifact-attempt schema.
   - Add `roadmapBatchArtifactAttempts` to `packages/shared/src/schema.ts`.
   - Add the fresh-table DDL, migration, and indexes to `packages/shared/src/db.ts`.
   - Export the new table/types through `packages/shared/src/index.ts`.

2. Extend shared audit lifecycle vocabulary.
   - Add artifact states `source_inconclusive`, `terminal_inconclusive`, and `manual_exception`.
   - Add granular failure families for contract, integrity, inventory-only, insufficient evidence, source inconclusive, and manual exception.
   - Add `source_inconclusive` to the source classification type and validator manifest outcome set.

3. Centralize failure-family classification.
   - Add helper logic in `auditRoadmapContract.ts` that maps completion-evidence issue codes plus source classification details to the new granular families.
   - Preserve compatibility for existing families and `inconclusive_batch_evidence`.

4. Persist attempt history in the data layer.
   - Extend `updateRoadmapBatchArtifactState()` with optional `classification`, `reworkStatus`, stable `failureSignature`, `attemptBoundaryId`, and stale-update controls.
   - Insert a sequential attempt row for artifact validation/current-state updates.
   - Update current artifact row and attempt row in one transaction.
   - Add `listRoadmapBatchArtifactAttempts()` and focused helpers for latest attempt/terminal status if needed.

5. Add stable failure signatures and boundary semantics.
   - Compute failure signatures from classification, failure family, stable issue codes, artifact role, and manifest/evidence issue classes.
   - Exclude content SHA, timestamps, full messages, branch names, and volatile output from the signature.
   - Add/update current artifact boundary metadata on rework boundaries.
   - Reject stale current-state promotion when an update targets an older boundary than the current artifact row.

6. Update batch summary/readiness.
   - Keep trusted valid counting based on source classification.
   - Treat retryable source attempts as not synthesis-ready.
   - Treat terminalized source inconclusive/manual exception and legacy no-attempt rows as terminal weak inputs.
   - Keep terminal inconclusive synthesis fail-closed.

7. Wire coordinator/API state updates.
   - Pass selected failure family, classification, and `reworkStatus` when returning audit artifacts to rework, blocking at the limit, accepting valid artifacts, and handling `request_changes`.
   - Add same-signature repeated-attempt escalation without removing `maxReviewIterations`.
   - Ensure `request_changes` creates a fresh attempt boundary and that subsequent validation targets that boundary.
   - Add/route a manual exception API path that requires justification and preserves prior validation details.

8. Fix synthesis input trust filtering.
   - Use trusted validated report artifacts for validated synthesis inputs.
   - Keep invalid/source-inconclusive/manual-exception terminal rows as weak artifacts with validation details.
   - Ensure untrusted `state === "valid"` rows without trusted classification cannot be read as validated source reports.

9. Add regression coverage.
   - Data-layer attempt history, sequence numbers, content SHA/classification/failure family/rework status.
   - Same-signature failures escalate despite different content SHA.
   - Different failure signatures do not escalate each other.
   - Stale old-boundary completion evidence cannot mark a reworked artifact valid or synthesis-ready.
   - Retryable failure does not make synthesis ready; terminalized inconclusive does.
   - Source inconclusive/manual exception do not count trusted valid.
   - Manual exception requires justification and preserves prior classifier details.
   - Synthesis uses trusted source filtering.

10. Run focused verification.

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/auditReportValidator.test.ts src/__tests__/auditRoadmapContract.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinator.test.ts src/__tests__/implementer.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts`
- Targeted package builds/lints for touched packages if focused tests pass.
- `git diff --check`

## Acceptance criteria

- Attempt history records attempt number, content SHA, classification, failure family, timestamp, and rework status.
- Retryable weak source attempts do not become synthesis-ready simply because the current state is `invalid`.
- Terminal inconclusive synthesis remains fail-closed and distinguishable from ordinary invalid content.
- `source_inconclusive` is first-class and untrusted.
- Human manual exception requires explicit justification and keeps prior classifier failure reasons.
- Existing compatibility behavior for legacy rows without attempt history is preserved.

## Independent gates

- `PLAN PASS` from independent reviewer before implementation.
- `TEST PASS` from independent tester after implementation.
- `REVIEW PASS` from independent reviewer after tests.
