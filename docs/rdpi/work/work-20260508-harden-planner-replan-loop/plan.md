<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Plan

## Implementation plan

1. Runtime prompt policy.
   - Add an optional runtime capability for AIF skill command execution, defaulting to false.
   - Change slash fallback activation so agent-definition fallback slash commands are only prepended when that capability is true.
   - Add a structured planning system append for `planner` and `plan-checker` workflows requesting final-answer/no-think output and no slash-command echoes.
   - Cover this in `packages/runtime/src/__tests__/workflowSpec.test.ts`.
2. Plan-quality module.
   - Add a pure shared evaluator for plan quality categories: placeholder/generic, slash fallback echo, thinking artifact, missing task-specific path, missing diagnostic report constraints, diagnostic scope violation, and missing checklist.
   - Export it from shared server-facing exports.
   - Add focused tests for the evaluator.
3. Planner prompt feedback.
   - Include prior `blockedReason` feedback in `runPlanner` task context when a plan-quality retry re-enters `planning`.
   - Add diagnostic-task guidance to planner prompts: produce an inspectable report artifact path and do not implement fixes or create child implementation tasks during diagnostic runs.
4. Plan-checker enforcement.
   - Run semantic plan-quality validation after local/LLM checklist repair paths.
   - Throw a typed plan-quality error when the plan is invalid, preserving the existing plan on disk/task.
   - Keep valid checklist fast paths and local bullet conversion behavior intact.
5. Coordinator bounded replan loop.
   - Catch typed plan-quality failures from the `plan-checker` stage before generic stage-error classification.
   - If `retryCount + 1` is within the retry limit, update only the current task to `planning` with explicit feedback in `blockedReason`, `blockedFromStatus = plan_ready`, `retryAfter = null`, and incremented `retryCount`.
   - If the retry limit is exceeded, move to `blocked_external` with a clear operator next step and the quality categories.
   - Keep `failedInCycle` behavior so the same poll cycle does not fall through into implementation.
6. Tests.
   - Add/adjust focused runtime prompt-policy tests.
   - Add shared plan-quality tests.
   - Add plan-checker tests for rejecting fallback echo, preserving valid fast/simple plans, and diagnostic constraints.
   - Add coordinator tests for requeue-to-planning and final blocked path.
7. After implementation, run focused tests first, then broader validation.

## Acceptance criteria

- Planner workflows do not prepend AIF slash fallback for runtimes without explicit AIF skill-command support.
- Structured planning runs include defensive no-think/final-answer output instructions.
- Weak plans are rejected before implementation for placeholder/generic/slash echo/thinking artifacts/path omissions/diagnostic omissions.
- Invalid plans re-enter `planning` with explicit feedback and a bounded retry count.
- After retry exhaustion, tasks fail closed in `blocked_external` with category and operator next step.
- Diagnostic tasks keep diagnostic-only constraints and do not plan same-run fix implementation or child implementation task creation.
- Existing valid fast/simple tasks, fix tasks, and manual approval flows keep their current behavior.
- No DB migration is introduced.

## Verification plan

- Independent `PLAN PASS` before implementation.
- Focused tests:
  - `npm.cmd test --workspace @aif/runtime -- workflowSpec`
  - `npm.cmd test --workspace @aif/shared -- planQuality`
  - `npm.cmd test --workspace @aif/agent -- planChecker`
  - `npm.cmd test --workspace @aif/agent -- coordinator`
- Required broader checks:
  - `npm.cmd run build`
  - `npm.cmd run lint`
  - `npm.cmd test`
- Feasibility check:
  - `npm.cmd run ai:validate` if the required runtime/perf pieces are available within this turn.
- Independent `TEST PASS` after local verification.
- Independent `REVIEW PASS` before close-out.
- Memory review phase after successful RDPI completion before marking the intake item `done`.

## Reusable patterns

- Put semantic guard decisions in pure shared modules, and keep coordinator retry/status policy in the coordinator.
- Treat model-output quality failures separately from runtime availability failures.
