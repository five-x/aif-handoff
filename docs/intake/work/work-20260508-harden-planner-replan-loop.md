# Harden Planner Replan Loop For Local Runtime Output

- Task ID: work-20260508-harden-planner-replan-loop
- Lane: work
- Status: backlog
- Priority: high
- Created: 2026-05-08
- Due: unset
- Source: user request, 2026-05-08
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260508-harden-planner-replan-loop

## Request

Improve AIF planning so local/OpenAI-compatible runtimes do not move weak or generic planner output into implementation, and so invalid planning can be retried automatically with focused feedback instead of falling directly into `blocked_external`.

The immediate motivation is the `botIntevra` audit task that produced placeholder-style planner output and then blocked on the completion-evidence guard before implementation.

## Done When

- Planner workflows for local/OpenAI-compatible runtimes avoid slash-command fallback when the runtime cannot actually execute AIF agent definitions or slash skills.
- Structured planning stages request no-think/final-answer behavior defensively, without relying only on model server launch flags.
- Plan quality is checked before implementation using semantic guards for placeholder, generic, slash-fallback echo, missing task-specific artifact path, and missing audit/report constraints.
- Invalid or generic plans return to `planning` with explicit feedback and a bounded retry counter instead of immediately becoming `blocked_external`.
- After the retry limit is reached, the task blocks with a clear reason that includes the failed plan-quality category and operator next step.
- Audit/review/discovery tasks keep diagnostic-only constraints: they may create report artifacts, but must not implement fixes or create child implementation tasks during the same run.
- Existing valid fast/simple tasks, fix tasks, and manual approval flows continue to work.
- The behavior is covered by focused unit tests for prompt policy, planner/plan-checker decisions, coordinator retry behavior, and the final blocked path.

## Constraints

- Intake only for this turn; do not implement the fix in the same step that creates this task.
- Follow RDPI before repository changes.
- Keep the implementation narrow: harden planning quality, fallback behavior, and bounded replanning without redesigning the whole scheduler.
- Do not depend on a specific model name; the fix must work whether the runtime is Qwen, OpenAI-compatible llama.cpp, Codex, or another provider.
- Preserve fail-closed behavior after bounded retries. The system should not silently proceed with a bad plan.
- Avoid DB migrations unless RDPI proves an existing retry/status field cannot safely represent plan retry attempts.
- After implementation, run focused tests first, then `npm.cmd run build`, `npm.cmd run lint`, and `npm.cmd test`; run `npm.cmd run ai:validate` when feasible.

## Notes

- Relevant local code entry points include `packages/agent/src/subagents/planner.ts`, `packages/agent/src/subagents/planChecker.ts`, `packages/runtime/src/promptPolicy.ts`, and `packages/agent/src/coordinator.ts`.
- Current risk shape: planner slash fallback can be prepended for runtimes without agent-definition support, plan-checker can normalize weak output without rejecting it semantically, and the completion-evidence guard currently blocks pre-implementation generic plans instead of driving a bounded replan loop.
- The previous guard task protects verification and completion; this task should improve the earlier planning stage so bad plans are repaired or blocked before implementation.
- The production runtime profile has been moved to `Qwen3-32B-Q4_K_M.gguf`, but model quality is not a substitute for planner-pipeline guardrails.

## Links

- RDPI scaffold: ../../rdpi/work/work-20260508-harden-planner-replan-loop
