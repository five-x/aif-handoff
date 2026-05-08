<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260508-prevent-hallucinated-zero-delta-verification::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260508-prevent-hallucinated-zero-delta-verification
source_path: docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-08
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/research.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/design.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/plan.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/result.md
  created_at: 2026-05-08
  last_verified_at: 2026-05-08

---

# Summary

Current capsule for entity aif-handoff, refreshed by task work-20260508-prevent-hallucinated-zero-delta-verification.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Reusable pattern: "completion evidence guard" for autonomous workflows where the model can claim work without producing a verifiable delta.
- Reusable pattern: pair text-quality heuristics with repository evidence instead of trusting either alone.
- Add a deterministic task-completion evidence guard that is shared by the agent and API closure paths.
- The guard should be narrow and risk-triggered, not a universal "every task must change files" rule:
- trigger for diagnostic/audit/review/discovery/inventory/gap-analysis style tasks;
- trigger when the task plan has obvious generic placeholder content;
- trigger when agent text references repo-like file paths that do not exist and no valid delta exists.
- The guard should inspect local repository evidence:
