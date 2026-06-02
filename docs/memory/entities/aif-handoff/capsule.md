<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260602-close-aif-roadmap-blockers::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260602-close-aif-roadmap-blockers
source_path: docs/rdpi/work/work-20260602-close-aif-roadmap-blockers
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-06-02
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/research.md
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/design.md
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/plan.md
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/result.md
  created_at: 2026-06-02
  last_verified_at: 2026-06-02

---

# Summary

Current capsule for entity aif-handoff, refreshed by task work-20260602-close-aif-roadmap-blockers.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Non-implementation lifecycle stages should default to read-only execution, with explicit write scopes reserved for implementation or deterministic artifact finalization.
- Container parent approval should be based on child closeout state, not parent-owned executable QA artifacts.
- Deterministic schema fallback may pass only from fresh mandatory evidence; malformed or missing evidence remains blocked.
- Stage write safety:
- Extend runtime stage caps with read-only execution defaults for researcher, designer, planner, plan-checker, reviewer, QA, security, audit, and synthesis.
- Apply these defaults to Codex adapter options so non-bypass pre-implementation stages resolve `sandboxMode: read-only`.
- Add Qwen-local read-only shell denial for write-capable shell commands while keeping inspection commands available.
- Plan manifest repair:
