<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Design

## Chosen design

- Add a deterministic task-completion evidence guard that is shared by the agent and API closure paths.
- The guard should be narrow and risk-triggered, not a universal "every task must change files" rule:
  - trigger for diagnostic/audit/review/discovery/inventory/gap-analysis style tasks;
  - trigger when the task plan has obvious generic placeholder content;
  - trigger when agent text references repo-like file paths that do not exist and no valid delta exists.
- The guard should inspect local repository evidence:
  - git worktree changes;
  - committed branch delta from configured base branch to current task branch/HEAD;
  - changed report/doc/artifact paths separate from task plan files.
- Diagnostic/audit/review/discovery/gap-analysis tasks need a stricter completion rule:
  - a concrete inspectable report artifact must be created or changed;
  - report artifacts must not be only task-plan files;
  - repo-like file references inside the report evidence must resolve under the project root unless the task explicitly records them as missing/invalid evidence findings.
- The guard should inspect task text evidence:
  - generic "Short task" / raw slash-command / `</think>` style plan output;
  - repo-like file references in plan, implementation log, and review comments;
  - whether referenced paths exist under the project root.
- The guard should use operator-facing issue codes that map directly to blocked reasons:
  - `zero_delta`;
  - `generic_plan`;
  - `missing_report_artifact`;
  - `invalid_or_missing_file_references`;
  - `branch_isolation`;
  - `manual_review_required`.
- Closure behavior:
  - Agent-side `done` transitions that would bypass or finish review should move the task to `blocked_external` with a clear reason when the guard fails.
  - API-side `approve_done` should not produce `verified` when the guard fails; it should return/record a clear blocked reason instead.
  - Existing branch isolation failures should remain fail-closed and be expressed through the same reason taxonomy instead of being masked as generic runtime failure.
  - If a no-delta task lacks an accepted artifact and needs human judgment, the closure path should block with `manual_review_required` instead of silently verifying.
- Keep schema changes out of the first slice. Existing `blockedReason`, `blockedFromStatus`, `manualReviewRequired`, `agentActivityLog`, and comments are enough for operator visibility.

## Pre-PLAN Boundary

- Before `PLAN PASS`, only local planning evidence and RDPI artifact edits are allowed.
- No production runtime probing, deployment changes, database migrations, or code edits before plan review.

## Decision candidates

- Reusable pattern: "completion evidence guard" for autonomous workflows where the model can claim work without producing a verifiable delta.
- Reusable pattern: pair text-quality heuristics with repository evidence instead of trusting either alone.
