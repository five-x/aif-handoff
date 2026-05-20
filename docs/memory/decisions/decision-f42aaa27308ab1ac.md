<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260519-enforce-non-green-inconclusive-lifecycle::decision-f42aaa27308ab1ac
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260519-enforce-non-green-inconclusive-lifecycle
source_path: docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle
stability: validated
sensitivity: shareable
kind: decision
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-19
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- decision
  source_refs:
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/research.md
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/design.md
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/plan.md
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/result.md
  created_at: 2026-05-19
  last_verified_at: 2026-05-19

---

# Summary

UI behavior remains mostly projection-driven. If data sends untrusted/non-green rollup semantics, existing UI trust presentation can render warning/untrusted labels; small UI tests may be updated only where labels encode the stale trusted result.

# Why it matters

Captures a reusable decision made during the task.

# When to reuse

Reuse when the same design pressure appears again.

# When not to reuse

Do not reuse when the constraints that justified the decision changed.
