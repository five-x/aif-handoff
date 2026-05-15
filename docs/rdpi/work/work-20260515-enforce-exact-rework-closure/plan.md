<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Plan

## Implementation plan

1. Update coordinator unresolved-manual paths.
   - Change `terminalizeRoadmapSourceReportAsInconclusive` to set task status `blocked_external`, not `done`.
   - Preserve `blockedReason`, `blockedFromStatus`, `reviewIterationCount`, `manualReviewRequired=true`, `autoReviewState`, and `reworkRequested=false`.
   - Change generic `manual_review_required` auto-review handling to `blocked_external`, not `done`.

2. Tighten prompt contracts.
   - In implementer rework protocol, require a pre-review self-check against every persisted finding ID and applicable deterministic validator.
   - In reviewer output contract, require closure evidence before a previous finding can be marked `resolved`.
   - Keep audit/report-specific rules explicit: manifest, evidenceRefs, scope coverage, and substantive evidence.

3. Update tests.
   - Repeated same-finding loop: assert `blocked_external`, unresolved finding IDs, no `done`.
   - Successful exact-finding closure: keep accepted rework path reaching `done` only after the prior finding is resolved.
   - Audit report validator failure: assert validator failure routes to rework or blocked/manual, not accepted `done`.
   - Non-audit code/docs rework case: assert unresolved manual-review handoff blocks with finding IDs.
   - Update old roadmap source-report terminalization expectations from `done` to `blocked_external`.

4. Update public docs.
   - Remove statements that manual auto-review handoffs may remain in `done`.
   - Document `blocked_external` as the manual state for unresolved findings and untrusted artifacts.

5. After `TEST PASS` and `REVIEW PASS`, create close-out artifacts.
   - Write `docs/rdpi/work/work-20260515-enforce-exact-rework-closure/result.md`.
   - Create local memory review artifacts under `docs/memory/tasks/work/` and `docs/memory/reports/`.
   - Update only this task's entry in `docs/intake/work_status.json`.

## Acceptance criteria

- `done` is used only for successful completion: accepted review and passing completion evidence.
- Repeated unresolved blockers after rework become `blocked_external` with exact finding IDs and closure evidence gap.
- Implementer/editor prompts include exact IDs, prior context, and self-check requirements.
- Reviewer prompts require evidence-backed `resolved` judgments.
- Audit report rework cannot pass with invalid manifest, unbound evidence refs, missing scope coverage, or weak evidence.
- Tests cover repeated blocker, successful closure, audit validator failure, and non-audit rework blocking.

## Verification plan

- `npm.cmd test --workspace=@aif/agent -- reviewContract.test.ts reviewGate.test.ts coordinator.test.ts`
- `npm.cmd run lint --workspace=@aif/agent`
- `npm.cmd run build --workspace=@aif/agent`
- Independent `TEST PASS` gate after local verification.
- Independent `REVIEW PASS` gate after implementation.

## Reusable patterns

- Use existing `blocked_external` plus `manualReviewRequired=true` for operator action.
- Use existing `AutoReviewState` as the finding snapshot.
- Use existing deterministic audit completion evidence validators as the audit/report self-check contract.
