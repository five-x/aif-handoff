<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260508-prevent-hallucinated-zero-delta-verification::decision-4fc50379b21aaa5c
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260508-prevent-hallucinated-zero-delta-verification
source_path: docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification
stability: validated
sensitivity: shareable
kind: decision
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
- decision
  source_refs:
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/research.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/design.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/plan.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/result.md
  created_at: 2026-05-08
  last_verified_at: 2026-05-08

---

# Summary

Agent-side `done` transitions that would bypass or finish review should move the task to `blocked_external` with a clear reason when the guard fails.

# Why it matters

Captures a reusable decision made during the task.

# When to reuse

Reuse when the same design pressure appears again.

# When not to reuse

Do not reuse when the constraints that justified the decision changed.
