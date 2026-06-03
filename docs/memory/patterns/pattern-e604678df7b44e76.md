<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::06_planner_split_required_contract::pattern-e604678df7b44e76
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 06_planner_split_required_contract
source_path: docs/rdpi/work/06_planner_split_required_contract
stability: validated
sensitivity: shareable
kind: pattern
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-06-03
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- pattern
  source_refs:
- docs/rdpi/work/06_planner_split_required_contract/research.md
- docs/rdpi/work/06_planner_split_required_contract/design.md
- docs/rdpi/work/06_planner_split_required_contract/plan.md
- docs/rdpi/work/06_planner_split_required_contract/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

Route terminal planning decisions before plan persistence so downstream stages cannot misinterpret them as runnable plans.

# Why it matters

Captures a reusable implementation or runbook pattern.

# When to reuse

Reuse when the same operational or implementation pattern appears again.

# When not to reuse

Do not reuse when the pattern depends on obsolete tools or constraints.
