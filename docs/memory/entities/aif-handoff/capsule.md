<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-add-artifact-claim-evidence-timelines::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-add-artifact-claim-evidence-timelines
source_path: docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-13
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines/research.md
- docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines/design.md
- docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines/plan.md
- docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Current capsule for entity aif-handoff, refreshed by task work-20260513-add-artifact-claim-evidence-timelines.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Use adapter-only timeline reads until generic workflow persistence exists in source.
- Expose one generic task-scoped timeline DTO rather than audit-specific task fields.
- Keep audit-specific details as metadata, not primary UI vocabulary.
- Do not parse artifact markdown in the timeline endpoint; durable evidence rows and artifact rows remain the accepted compatibility sources.
- workflow context: task id, project id, workflow pack id, workflow kind, roadmap alias, source kind, source id, status, and generated timestamp.
- artifacts: generic artifact rows mapped from `roadmap_batch_artifacts` for audit tasks.
- attempts: generic attempt rows mapped from `roadmap_batch_artifact_attempts`.
- claims: compatibility claims derived from artifact current state and attempt state, using generic outcomes such as `supported`, `refuted`, `inconclusive`, `blocked`, `waived`, and `not_evaluated`.
