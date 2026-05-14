<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-generalize-evidence-unit-aliases::pattern-3fc529d8c3429e26
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-generalize-evidence-unit-aliases
source_path: docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases
stability: validated
sensitivity: shareable
kind: pattern
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
- pattern
  source_refs:
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/research.md
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/design.md
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/plan.md
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

For durable audit/runtime vocabulary migrations, add generic aliases first, keep existing storage and routing keys stable, and prove old and new consumers can read the same payload before attempting any destructive rename.

# Why it matters

Captures a reusable implementation or runbook pattern.

# When to reuse

Reuse when the same operational or implementation pattern appears again.

# When not to reuse

Do not reuse when the pattern depends on obsolete tools or constraints.
