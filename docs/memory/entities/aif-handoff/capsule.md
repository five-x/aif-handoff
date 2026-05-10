<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260510-harden-audit-roadmap-flow-contract::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260510-harden-audit-roadmap-flow-contract
source_path: docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-10
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/research.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/design.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/plan.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/result.md
  created_at: 2026-05-10
  last_verified_at: 2026-05-10

---

# Summary

Current capsule for entity aif-handoff, refreshed by task work-20260510-harden-audit-roadmap-flow-contract.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Durable audit batch state should be first-class data, not inferred only from task tags and current checkout state.
- Report artifact validation should be contract-driven and shared across import, review, completion, approve, and synthesis readiness gates.
- `blocked_external` should mean external intervention is required, not “the report content is invalid.”
- Shared machine contract in `@aif/shared`
- Add a shared audit roadmap contract module that defines report roles, required generated-task markers, expected artifact parsing, synthesis detection, canonical validation issues, and failure taxonomy.
- Reuse this module from `taskIntent.ts`, `roadmapGeneration.ts`, `taskCompletionEvidence.ts`, `reviewGate.ts`, `coordinator.ts`, and `taskEvents.ts`.
- Keep generic roadmap and non-audit task behavior unchanged.
- Durable audit batch/artifact model
