<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-move-audit-roadmap-hooks-behind-pack::pattern-e2de755baa6a51c7
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-move-audit-roadmap-hooks-behind-pack
source_path: docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack
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
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/research.md
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/design.md
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/plan.md
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Keep dependency-heavy workflow behavior in the package that already owns those dependencies, but key it by shared workflow-pack identity so pack semantics are explicit and testable.

# Why it matters

Captures a reusable implementation or runbook pattern.

# When to reuse

Reuse when the same operational or implementation pattern appears again.

# When not to reuse

Do not reuse when the pattern depends on obsolete tools or constraints.
