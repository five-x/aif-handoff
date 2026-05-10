<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260510-harden-typed-roadmap-content-validation::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260510-harden-typed-roadmap-content-validation
source_path: docs/rdpi/work/work-20260510-harden-typed-roadmap-content-validation
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-10
supersedes:
expires_at:
tags:

- aif-handoff
- work
- task-delta
- typed-task-intents
- audit-roadmap-validation
  source_refs:

- docs/rdpi/work/work-20260510-harden-typed-roadmap-content-validation/research.md
- docs/rdpi/work/work-20260510-harden-typed-roadmap-content-validation/design.md
- docs/rdpi/work/work-20260510-harden-typed-roadmap-content-validation/plan.md
- docs/rdpi/work/work-20260510-harden-typed-roadmap-content-validation/result.md
  created_at: 2026-05-10
  last_verified_at: 2026-05-10

---

# Summary

Curated delta for task work-20260510-harden-typed-roadmap-content-validation.

# Why it matters

Audit task generation is a fail-closed boundary: typed audit roadmap output must not silently become implementation work or partially import invalid batches.

# When to reuse

Reuse this document when checking why explicit audit roadmap generation/import validates source roadmaps, generated task batches, and duplicate batches before side effects.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless promoted into decisions or patterns.

## Facts

- Explicit audit roadmap validation now rejects implementation-shaped source or generated content, non-report `Allowed changes`, missing concrete `.md` report artifacts, missing/extra final synthesis cards, and partial imports from invalid typed batches.

## Decisions

- Source audit roadmaps are validated before extraction when `taskIntent` is explicitly `audit`.
- Generated/imported audit task batches are validated before duplicate skipping or task creation.
- Audit generated cards must allow only report artifact writes and must name a concrete `.md` report artifact path.
- Prompt constraints remain advisory; deterministic validators own typed-intent safety.

## Patterns

- For fail-closed generated batches, validate the whole typed batch before any side effects, including duplicate filtering.
