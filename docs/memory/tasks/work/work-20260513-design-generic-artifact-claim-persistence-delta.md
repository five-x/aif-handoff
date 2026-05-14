<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-design-generic-artifact-claim-persistence::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-design-generic-artifact-claim-persistence
source_path: docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-13
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/research.md
- docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/design.md
- docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/plan.md
- docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Curated delta for task work-20260513-design-generic-artifact-claim-persistence.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Generic artifact persistence should be parallel to audit roadmap compatibility tables, not an in-place widening of audit tables.
- Claims are first-class structured rows separate from artifacts.
- Evidence links are append-only and can reference compatibility evidence sources until generic evidence units exist.
- Inconclusive and manual exception outcomes are explicit weak/terminal outcomes, not trusted success states.

## Patterns

- Keep pack-neutral persistence separate from workflow-pack semantics.
- Add append-only history plus mutable read models transactionally.
- Preserve audit compatibility through adapters and tests before migrating read/write paths.
- Close design tasks with implementation-ready surfaces, not implementation in the same run.
