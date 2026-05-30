# Plan

1. Extend plan-quality issue taxonomy.
   - Add `task_size_split_required` to `TASK_PLAN_QUALITY_ISSUE_CODES`.
   - Add deterministic helper functions for path grouping, subsystem grouping, broad-language detection, verification-surface detection, and split-dimension formatting.
   - Encode these constants: max changed file groups without hard fail = 3, normal changed file group limit = 2, max major subsystems without hard fail = 2, normal major subsystem limit = 1, max verification commands = 4.

2. Implement the shared size gate.
   - Evaluate executable intents (`feature`, `fix`, `docs`, `tests`, and explicit `general`); keep `audit` and `spike` on their existing diagnostic/research validation paths.
   - Use manifest `scope`, `expectedArtifacts`, `verificationCommands`, and task/plan text.
   - For no-manifest executable plans, run a text-only split-required screen using task/plan broad-language signals, repo path boundaries, and concrete verification commands.
   - Emit one `task_size_split_required` issue whose message starts with `split_required:` and names the dimensions that require splitting.
   - Apply the exact reject predicate from `design.md`: always reject missing/broad boundaries; reject group+subsystem, group+ambiguity, subsystem+ambiguity, verification-surface plus any other split dimension; reject group count > 3 or subsystem count > 2 as hard multi-area limits.

3. Protect manual implementation start.
   - In `taskCompletionEvidence.ts`, call `evaluateTaskPlanQuality` during `phase: "pre_implementation"`.
   - Convert plan-quality issues into completion-evidence issues so `start_implementation` fails before runtime starts.

4. Tighten planner/plan-checker guidance.
   - Tell the planner and plan-checker that broad, vague, or multi-area implementation cards must return split-required feedback instead of a runnable manifest.
   - Add a plan-checker pre-model size-only guard that blocks `task_size_split_required` while leaving ordinary checklist-format repair paths available.

5. Add tests.
   - Add plan-quality unit coverage for broad rejection, narrow pass, and roadmap-child pass.
   - Add explicit-general broad roadmap child rejection coverage.
   - Add broad fast/no-manifest rejection coverage for plan quality, pre-implementation evidence, plan-checker, manual API start, and coordinator auto-start.
   - Add pre-implementation evidence coverage for broad-plan blocking.
   - Add plan-checker coverage that broad checklist and plain-bullet no-manifest plans fail before model repair.
   - Add API event coverage for manual `start_implementation` fail-closed behavior.
   - Add or extend coordinator coverage proving auto-mode broad plans do not call `runImplementer`.

6. Run verification.
   - `npm.cmd run format:check`
   - `npm.cmd run lint`
   - `npm.cmd test`
   - `npm.cmd run build`
   - If full-repo commands expose unrelated pre-existing failures from the dirty worktree, record them and run focused package tests for the changed surface.

## Acceptance mapping

- Broad scaffold/dev-stack/config cards are rejected before implementation by `task_size_split_required`.
- Operator-readable rejection names split dimensions in the blocked reason.
- Narrow manifest-backed tasks still pass.
- The gate is deterministic and does not rely on model self-assessment.
- Tests cover shared validation, manual API start, plan-checker behavior, and roadmap-created child pass-through.

## Gate plan

- Independent `PLAN PASS` is required before implementation.
- After implementation, independent `TEST PASS` and `REVIEW PASS` are required before close-out.
