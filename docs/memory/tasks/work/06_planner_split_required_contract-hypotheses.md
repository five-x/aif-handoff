<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::06_planner_split_required_contract::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 06_planner_split_required_contract
source_path: docs/rdpi/work/06_planner_split_required_contract
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-06-03
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/06_planner_split_required_contract/research.md
- docs/rdpi/work/06_planner_split_required_contract/design.md
- docs/rdpi/work/06_planner_split_required_contract/plan.md
- docs/rdpi/work/06_planner_split_required_contract/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

Local-only hypotheses collected during task 06_planner_split_required_contract.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- A safe implementation must reject missing or invalid model planner decision blocks before plan persistence/status advancement.
- Extending `TaskSplitProposalSourceKind` with `planner_decision` is enough to reuse the existing proposal persistence without a new table.
- Blocking parent tasks as `blocked_external` with a `split_required:` reason is the least invasive representation of "pending proposal / blocked state".
- Parent-specific proposal identity can be achieved with `roadmapAlias = planner-split:${taskId}`, `sourceRef = task:${taskId}:planner_decision`, and a source fingerprint derived from task id/title/description/decision children.
