# Route Recoverable Audit Failures To Rework Or Input - Plan

## Scope

- Update audit lifecycle routing only for recoverable audit artifact/report/plan-quality cases.
- Preserve strict validation and all true external-blocker semantics.
- Do not run or create child tasks.

## Implementation checklist

- [ ] Add shared audit lifecycle predicates for recoverable audit failure families and terminal audit artifact outcomes.
- [ ] Replace duplicated recoverable-family sets in `packages/agent/src/coordinator.ts` and `packages/api/src/services/taskEvents.ts` with the shared predicate.
- [ ] Change completion evidence routing so recoverable audit failures return to `implementing` with `reworkRequested=true` while review budget remains, even when the same failure signature has appeared before; keep max-review/no-progress terminalization.
- [ ] Change deterministic audit repair failure handling in `packages/agent/src/subagents/implementer.ts` so failed strict repair records structured diagnostics and falls through to runtime implementer rework instead of setting task `blocked_external`.
- [ ] Preserve `source_inconclusive` terminal behavior and true external/manual exception behavior.
- [ ] Extend `TaskPlanQualityTask` and the plan-checker caller with persisted audit artifact role/batch context, then exempt already-decomposed source report child cards from `missing_audit_decomposition` only.
- [ ] Add operator-input retry semantics in the task event path: detect `operator_input_required:` holds, require a concrete human answer comment before retry, clear `paused` on accepted retry, and preserve normal retry behavior for non-operator external blockers.
- [ ] Broaden auto-queue active-count terminal audit skipping for historical/manual audit states while preserving active counting for real `blocked_external` and operator-input holds.
- [ ] Add or update focused tests for implementer deterministic repair fallback, coordinator rework routing, plan-quality child source cards, operator-input waiting/resume, auto-queue skip behavior, and preserved external blocker behavior.
- [ ] Run targeted package tests, then build or broader tests as time permits.

## Acceptance criteria mapping

- Recoverable validator issue codes route to `implementing` with `reworkRequested=true`: covered by coordinator/API routing changes and tests.
- Deterministic repair failures fall through to runtime rework: covered by implementer changes and tests.
- Terminal `manual_review_required` only after no-progress/same-blocker/max-budget or true external input: covered by preserving stalled/no-delta/max paths and changing repeated repair terminalization.
- Missing external input creates concrete waiting state: covered by stable `operator_input_required:` blocked reason, task comment, `paused=true`, retry rejection until a human answer comment exists, and accepted retry clearing `paused`.
- Plan-quality child source card handling: covered by artifact role/batch context regression.
- Auto-queue continues past terminal historical/manual audit cards: covered by data/agent auto-queue regressions.
- True external blockers preserved: covered by existing stage error paths and regression tests.

## Verification commands

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts src/__tests__/auditRoadmapContract.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts src/__tests__/coordinator.test.ts src/__tests__/autoQueue.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts`
- `npm.cmd run build`

## Open questions

- The task asks for a durable operator question or equivalent waiting state. This plan uses existing fields and comments rather than a new schema table. If product UI requires first-class question rendering outside chat, that should be a separate queued task after this lifecycle fix.
