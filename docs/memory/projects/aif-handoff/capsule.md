<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-add-artifact-claim-evidence-timelines::project-capsule
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

Current capsule for project aif-handoff, refreshed by task work-20260513-add-artifact-claim-evidence-timelines.

# Why it matters

Provides compact recall for future work on the same project.

# When to reuse

Reuse before starting related work in this repository.

# When not to reuse

Do not reuse blindly if the project architecture changed after this task.

## Current stable facts

- The timeline API shape is generic and available through `GET /tasks/:id/timeline`.
- Audit roadmap compatibility rows surface as generic artifacts, attempts, claims, evidence units, evidence links, and timeline events.
- Non-audit tasks receive the same generic timeline envelope with empty timeline arrays until durable generic persistence exists.
- Inconclusive, blocked, missing, rejected, manual exception, and expected compatibility states are not mapped as trusted success.
- Evidence links are display-oriented task-scoped compatibility links until durable claim/evidence link rows exist.
