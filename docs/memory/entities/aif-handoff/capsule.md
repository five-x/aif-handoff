<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260512-server-side-memory-loop::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260512-server-side-memory-loop
source_path: docs/rdpi/work/work-20260512-server-side-memory-loop
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-12
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/work-20260512-server-side-memory-loop/research.md
- docs/rdpi/work/work-20260512-server-side-memory-loop/design.md
- docs/rdpi/work/work-20260512-server-side-memory-loop/plan.md
- docs/rdpi/work/work-20260512-server-side-memory-loop/result.md
  created_at: 2026-05-12
  last_verified_at: 2026-05-12

---

# Summary

Current capsule for entity aif-handoff, refreshed by task work-20260512-server-side-memory-loop.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Task memory candidates should be generated at `verified`, not `done`, because `verified` is the human-approved close-out state.
- Server-side product memory is retrieval and curated context injection, not fine-tuning and not local Codex shared-memory.
- Memory usage audit should be append-only and separate from task activity logs.
- Implement an AIF-owned memory domain in the existing SQLite database and server/runtime pipeline.
- Treat memory as curated retrieval context:
- `pending`: reviewable candidate generated after a task reaches `verified`.
- `approved`: eligible for retrieval and prompt injection.
- `rejected`: retained for audit but never injected.
