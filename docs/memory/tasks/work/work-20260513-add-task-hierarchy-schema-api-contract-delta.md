<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-add-task-hierarchy-schema-api-contract::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-add-task-hierarchy-schema-api-contract
source_path: docs/rdpi/work/work-20260513-add-task-hierarchy-schema-api-contract
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
- docs/rdpi/work/work-20260513-add-task-hierarchy-schema-api-contract/research.md
- docs/rdpi/work/work-20260513-add-task-hierarchy-schema-api-contract/design.md
- docs/rdpi/work/work-20260513-add-task-hierarchy-schema-api-contract/plan.md
- docs/rdpi/work/work-20260513-add-task-hierarchy-schema-api-contract/result.md
  created_at: 2026-05-23
  last_verified_at: 2026-05-23

---

# Summary

Curated delta for task work-20260513-add-task-hierarchy-schema-api-contract.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Prefer fail-closed validation for invalid hierarchy relationships over automatic repair.
- Prefer additive SQLite columns with defaults over a destructive migration or task backfill.
- Prefer preserving flat list/detail response compatibility while adding optional hierarchy metadata.
- Keep the contract small and first-class in the task model instead of encoding hierarchy through tags, roadmap aliases, or UI-only grouping.
- Keep server-computed hierarchy fields read-only to avoid caller-controlled roots, depths, sibling positions, or child summaries.

## Patterns

- Keep schema, shared types, REST schemas, data mappers, and MCP schemas in sync in one slice.
- Validate hierarchy in the data layer so REST and MCP share the same relationship rules.
