# Plan

## Implementation plan

1. Add terminal closeout idempotency support in `packages/api/src/services/operatorVerifiedCompletion.ts`.
   - Add a helper to compute stable operator evidence fingerprints.
   - Retrieve the latest accepted `operator_verified_completion` evidence for the task.
   - For `done` tasks, return current task unchanged when fingerprints match.
   - For `done` tasks with missing or mismatched accepted evidence, reject before mutation with an `already_done` reason.
   - Extend the ok result shape with an idempotent/no-op marker.
2. Update `packages/api/src/routes/tasks.ts`.
   - Keep the response shape unchanged.
   - Skip `task:moved`, `task:timeline_updated`, and `task:trust_updated` broadcasts when the service result is idempotent.
3. Update generic trust rollup selection in `packages/data/src/index.ts`.
   - Pass task/claim context into the selector.
   - For terminal tasks, select accepted trusted terminal evidence before unrelated rejected/missing plan artifacts.
   - Preserve the existing failure-first selector when no trusted terminal evidence exists.
4. Add focused regression tests.
   - `packages/api/src/__tests__/tasks.test.ts`: same evidence retry on `done` is idempotent, keeps status `done`, does not add another accepted closeout attempt, and does not broadcast a move.
   - `packages/api/src/__tests__/tasks.test.ts`: different evidence retry on `done` is rejected and keeps status `done`.
   - `packages/data/src/__tests__/index.test.ts`: generic card-level rollup selects accepted terminal implementation/operator evidence over an unrelated thin-plan rejection.
   - `packages/data/src/__tests__/index.test.ts`: timeline still contains all artifacts, including the thin-plan artifact.
5. After implementation, record concise before/after readback examples in `result.md`.
   - Before example from the fixed test fixture: selected rollup would have chosen rejected/invalid plan evidence.
   - After example from the test/API response: selected rollup reports trusted terminal evidence and timeline still includes the plan artifact.

## Acceptance criteria

- Repeating the same operator closeout evidence on a `done` task is idempotent and does not mutate task lifecycle or create duplicate accepted closeout attempts.
- Repeating different operator closeout evidence on a `done` task is rejected.
- No path can downgrade a `done` task to `review`, `qa`, `implementing`, or another non-terminal state through operator closeout retry.
- Card-level artifact trust prioritizes accepted terminal implementation/operator evidence.
- Thin-plan artifacts remain visible in the timeline but do not override trusted terminal card summary.
- `result.md` records gate outcomes and before/after readback examples.

## Verification plan

- Plan gate: independent reviewer must return `PLAN PASS` before implementation.
- Focused API test:
  - `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts -t "operator verified completion"`
- Focused data tests:
  - `npm.cmd --workspace @aif/data test -- --run src/__tests__/index.test.ts -t "artifact trust rollups|operator accepted evidence|terminal"`
- Static quality checks after focused tests:
  - `npm.cmd run lint`
  - `npm.cmd run build`
- Test gate: independent tester must return `TEST PASS` after running the verification plan or report exact failures.
- Final review gate: independent reviewer must return `REVIEW PASS` after `TEST PASS`.
- Closeout:
  - Write `result.md` with implementation summary, test outputs, gate outcomes, and readback examples.
  - Run memsync auto for lane/task id unless blocked by the local memory review step.

## Reusable patterns

- Prefer stable evidence fingerprints over full object equality for idempotency when records include timestamps or display previews.
- Separate timeline completeness from card-level rollup selection; cards should summarize the strongest relevant current state, not every historical artifact.
