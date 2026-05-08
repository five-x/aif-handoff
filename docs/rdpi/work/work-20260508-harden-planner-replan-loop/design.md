<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Design

## Chosen design

- Add a deterministic plan-quality guard in shared code, then enforce it from the agent plan-checker stage.
- Keep `runPlanner` responsible for creating/refining the plan, and make it include prior plan-quality feedback when the coordinator has requeued a task to `planning`.
- Keep `runPlanChecker` responsible for shape repair plus semantic validation. It should locally repair checklist formatting where possible, then reject semantically weak output with a typed error rather than silently preserving junk.
- Update the coordinator to catch typed plan-quality failures from the plan-checker stage:
  - below the retry limit, set status back to `planning`;
  - persist concise feedback in `blockedReason`;
  - set `blockedFromStatus` to `plan_ready`;
  - increment `retryCount`;
  - keep `retryAfter` null so the next coordinator pass can replan immediately;
  - after the retry limit, move to `blocked_external` with the failed quality categories and an operator next step.
- Update runtime prompt policy so slash fallback only activates when the runtime both lacks agent definitions and explicitly supports AIF skill commands. Also append a no-think/final-answer instruction for structured planning workflows.

This keeps the change narrow. It does not redesign the scheduler, change task statuses, add DB columns, or create child implementation tasks.

## Guard categories

- `placeholder_plan`: placeholder text or obviously non-actionable plan.
- `generic_plan`: generic "do task" style content with no task-specific detail.
- `slash_fallback_echo`: raw `/aif-plan`, `$aif-plan`, `<aif-plan>`, `docs:false`, or `tests:false` style fallback echo.
- `thinking_artifact`: leaked `<think>` or `</think>` content.
- `missing_task_specific_artifact_path`: task card named concrete repo paths but the plan dropped them.
- `missing_diagnostic_report_constraints`: audit/review/discovery/gap-analysis plan lacks a concrete report artifact path or diagnostic-only constraints.
- `diagnostic_scope_violation`: audit/review/discovery/gap-analysis plan asks to implement fixes in the same task.
- `missing_checklist`: plan is not an implementation-ready markdown checklist after local repair attempts.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: static local file reads, task card framing, source/test inspection, and RDPI artifact drafting.
- Not allowed before `PLAN PASS`: live service checks, scheduler reads, worker-report inspection, runtime profile probing, log inspection, endpoint checks, shared-memory recall, or implementation changes.

## Decision candidates

- Plan-quality gates should run before implementation and should be deterministic when their purpose is to catch model-output shape and task-specific omissions.
- Bounded replanning can use existing task status fields when the failure is semantic planning quality rather than external runtime availability.
