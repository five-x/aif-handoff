<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260508-prevent-hallucinated-zero-delta-verification::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260508-prevent-hallucinated-zero-delta-verification
source_path: docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-08
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/research.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/design.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/plan.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/result.md
  created_at: 2026-05-08
  last_verified_at: 2026-05-08

---

# Summary

Curated delta for task work-20260508-prevent-hallucinated-zero-delta-verification.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Reusable pattern: "completion evidence guard" for autonomous workflows where the model can claim work without producing a verifiable delta.
- Reusable pattern: pair text-quality heuristics with repository evidence instead of trusting either alone.
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

## Patterns

- Completion gates should validate evidence provenance and artifact delta before terminal states, especially when the prior stage was model-generated.
