<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-add-artifact-claim-evidence-timelines::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-add-artifact-claim-evidence-timelines
source_path: docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines
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
- docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines/research.md
- docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines/design.md
- docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines/plan.md
- docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Curated delta for task work-20260513-add-artifact-claim-evidence-timelines.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- The timeline API shape is generic and available through `GET /tasks/:id/timeline`.
- Audit roadmap compatibility rows surface as generic artifacts, attempts, claims, evidence units, evidence links, and timeline events.
- Non-audit tasks receive the same generic timeline envelope with empty timeline arrays until durable generic persistence exists.
- Inconclusive, blocked, missing, rejected, manual exception, and expected compatibility states are not mapped as trusted success.
- Evidence links are display-oriented task-scoped compatibility links until durable claim/evidence link rows exist.

## Decisions

- Use adapter-only timeline reads until generic workflow persistence exists in source.
- Expose one generic task-scoped timeline DTO rather than audit-specific task fields.
- Keep audit-specific details as metadata, not primary UI vocabulary.
- Do not parse artifact markdown in the timeline endpoint; durable evidence rows and artifact rows remain the accepted compatibility sources.
- workflow context: task id, project id, workflow pack id, workflow kind, roadmap alias, source kind, source id, status, and generated timestamp.
- artifacts: generic artifact rows mapped from `roadmap_batch_artifacts` for audit tasks.
- attempts: generic attempt rows mapped from `roadmap_batch_artifact_attempts`.
- claims: compatibility claims derived from artifact current state and attempt state, using generic outcomes such as `supported`, `refuted`, `inconclusive`, `blocked`, `waived`, and `not_evaluated`.
- evidence: generic evidence units exposed through the existing evidence-unit aliases over `audit_evidence_events`.
- evidence links: bounded links from evidence units to the relevant task/artifact/claim as compatibility context.
- events: a sorted presentation timeline composed from artifact creation/update, attempts, claims, and evidence units.

## Patterns

- Adapter-only generic read models are acceptable when a generic persistence design is accepted but durable tables are not implemented.
- Use generic DTO vocabulary at API/UI boundaries while preserving workflow-specific details in metadata.
- Keep evidence links display-oriented unless durable claim/evidence link rows exist.
