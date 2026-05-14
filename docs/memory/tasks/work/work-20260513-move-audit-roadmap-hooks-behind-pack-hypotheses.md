<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-move-audit-roadmap-hooks-behind-pack::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-move-audit-roadmap-hooks-behind-pack
source_path: docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack
stability: draft
sensitivity: forbidden
kind: hypothesis
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
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/research.md
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/design.md
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/plan.md
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Local-only hypotheses collected during task work-20260513-move-audit-roadmap-hooks-behind-pack.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- A narrow API-local `roadmapWorkflowPacks` extension can route audit roadmap generation and import validation through audit-owned hooks without moving database or filesystem side effects into `@aif/shared`.
- Non-audit packs can omit roadmap hooks and keep the current generic/typed roadmap extraction path unchanged.
- Existing audit diagnostics can remain compatible if the hook adapter calls the existing helper logic rather than rewriting validation rules.
- Focused API tests plus shared registry tests should catch regressions in audit strictness and the feature canary boundary.
