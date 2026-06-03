<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::04_aif_result_contract_and_output::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 04_aif_result_contract_and_output
source_path: docs/rdpi/work/04_aif_result_contract_and_output
stability: stable
sensitivity: local-only
kind: capsule
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
- capsule
  source_refs:
- docs/rdpi/work/04_aif_result_contract_and_output/research.md
- docs/rdpi/work/04_aif_result_contract_and_output/design.md
- docs/rdpi/work/04_aif_result_contract_and_output/plan.md
- docs/rdpi/work/04_aif_result_contract_and_output/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

Current capsule for entity aif-handoff, refreshed by task 04_aif_result_contract_and_output.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Strict `aif-result` output blocks should be schema-validated in shared code, not by prompt-only conventions.
- Lower-priority missing narrative/contract evidence should not override higher-priority trusted implementation or operator evidence.
- Replace the old loose schema with a strict result model:
- statuses: `completed`, `blocked`, `needs_input`;
- stop reasons: `done`, `blocked_by_validation`, `blocked_by_scope`, `needs_human_input`;
- structured verification entries;
- structured resolved and unresolved blocker entries;
- `taskId` validation against an optional expected task id.
