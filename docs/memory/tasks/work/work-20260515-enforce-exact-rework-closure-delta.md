<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-enforce-exact-rework-closure::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-enforce-exact-rework-closure
source_path: docs/rdpi/work/work-20260515-enforce-exact-rework-closure
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-15
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/research.md
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/design.md
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/plan.md
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/result.md
  created_at: 2026-05-15
  last_verified_at: 2026-05-15

---

# Summary

Curated delta for task work-20260515-enforce-exact-rework-closure.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- Auto-review manual handoffs with unresolved findings are blocked externally, not completed.
- Structured prior-finding closure is accepted only when the reviewer output matches the active strategy and iteration and every prior finding is represented by exact ID and source.
- Previous finding closure evidence must include concrete references such as a file/artifact reference, command output/status, manifest/evidenceRef detail, scope coverage detail, or specific status-field evidence.

## Decisions

- Keep `done` for accepted review plus passing completion evidence.
- Move unresolved manual-review outcomes to `blocked_external` with `manualReviewRequired=true`.
- Change roadmap source-report inconclusive terminalization from task `done` to `blocked_external` while preserving artifact `source_inconclusive` diagnostics.
- Preserve exact unresolved finding IDs in `blockedReason`, `autoReviewState`, artifact validation details, and activity log.
- Keep audit/report validators strict and additive; do not downgrade validation failures into successful completion.

## Patterns

- Use existing `blocked_external` plus `manualReviewRequired=true` for operator action.
- Use existing `AutoReviewState` as the finding snapshot.
- Use existing deterministic audit completion evidence validators as the audit/report self-check contract.
- Treat malformed or stale review closure output as a manual handoff that preserves original blocker IDs instead of guessing convergence.
- Do not let a generic completion-evidence repair path override a higher-priority manual-review handoff decision.
