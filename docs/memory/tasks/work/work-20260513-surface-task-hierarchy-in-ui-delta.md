<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-surface-task-hierarchy-in-ui::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-surface-task-hierarchy-in-ui
source_path: docs/rdpi/work/work-20260513-surface-task-hierarchy-in-ui
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-23
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260513-surface-task-hierarchy-in-ui/research.md
- docs/rdpi/work/work-20260513-surface-task-hierarchy-in-ui/design.md
- docs/rdpi/work/work-20260513-surface-task-hierarchy-in-ui/plan.md
- docs/rdpi/work/work-20260513-surface-task-hierarchy-in-ui/result.md
  created_at: 2026-05-23
  last_verified_at: 2026-05-23

---

# Summary

Curated delta for task work-20260513-surface-task-hierarchy-in-ui.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Prefer compact badges, indentation, and detail sections over nested cards.
- Prefer hiding or disabling unsafe container actions where the role is known in the current response.
- Add small hierarchy indicators to existing operational views instead of introducing a separate tree editor.
- Use API-provided `childSummary`, parent metadata, and direct children rather than deriving relationships client-side.
- Preserve status-first Kanban as the primary scan model.

## Patterns

- Reuse existing shared `Task` types, route responses, and component test style.
- Keep hierarchy UI as additive metadata on existing views.
