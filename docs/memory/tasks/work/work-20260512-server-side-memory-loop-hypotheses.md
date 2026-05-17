<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260512-server-side-memory-loop::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260512-server-side-memory-loop
source_path: docs/rdpi/work/work-20260512-server-side-memory-loop
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-12
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260512-server-side-memory-loop/research.md
- docs/rdpi/work/work-20260512-server-side-memory-loop/design.md
- docs/rdpi/work/work-20260512-server-side-memory-loop/plan.md
- docs/rdpi/work/work-20260512-server-side-memory-loop/result.md
  created_at: 2026-05-12
  last_verified_at: 2026-05-12

---

# Summary

Local-only hypotheses collected during task work-20260512-server-side-memory-loop.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- A `memory_items` table can represent both pending candidates and approved/expired/rejected memory, avoiding a separate candidate table for MVP.
- A `memory_usage_events` table can provide the task/chat audit trail for injected memory without overloading `agentActivityLog`.
- A deterministic server-side extraction heuristic is acceptable for MVP because it produces reviewable candidates and avoids relying on another runtime call during close-out.
- Publication-grade redaction should use existing provider text redaction plus an explicit publication blocker when secret-shaped material is detected in the original or edited memory body.
- Prompt injection can be added centrally enough by formatting retrieved approved memory and prepending it to stage/chat prompts or `systemPromptAppend`, with citations such as `[memory:<id>]`.
- API/UI can ship as a small memory review dialog first: list pending/approved/rejected/expired items, inspect content, approve, reject, and expire.
