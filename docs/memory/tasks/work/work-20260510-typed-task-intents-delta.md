<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260510-typed-task-intents::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260510-typed-task-intents
source_path: docs/rdpi/work/work-20260510-typed-task-intents
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-09
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260510-typed-task-intents/research.md
- docs/rdpi/work/work-20260510-typed-task-intents/design.md
- docs/rdpi/work/work-20260510-typed-task-intents/plan.md
- docs/rdpi/work/work-20260510-typed-task-intents/result.md
  created_at: 2026-05-09
  last_verified_at: 2026-05-09

---

# Summary

Curated delta for task work-20260510-typed-task-intents.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- The shared intent contract is reusable project knowledge after implementation if tests and review pass.
- The compatibility rule between `isFix` and `taskIntent: "fix"` may be worth documenting in memory after close-out.
- `general`
- `audit`
- `feature`
- `fix`
- `spike`
- `docs`
- `tests`
- decomposition rules
- default `plannerMode`
- default `skipReview`
- default `useSubagents`
- `planDocs` and `planTests` defaults
- whether generated cards may enter the executable backlog immediately
- allowed file-change scope
- evidence requirements
- required planning, implementation, review, and test gates
- planning/implementer prompt guidance

## Patterns

- Put intent semantics in structured code, then let prompts consume that contract. Prompts should not be the only source of task routing truth.
