<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260510-harden-audit-roadmap-flow-contract::decision-ad881a7d2d0c188d
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260510-harden-audit-roadmap-flow-contract
source_path: docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract
stability: validated
sensitivity: shareable
kind: decision
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
- decision
  source_refs:
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/research.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/design.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/plan.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/result.md
  created_at: 2026-05-10
  last_verified_at: 2026-05-10

---

# Summary

The batch model records the selected execution policy (`worktree_isolated` or `serialized_shared_checkout`) so later synthesis/readiness decisions understand whether artifacts may live outside the shared checkout.

# Why it matters

Captures a reusable decision made during the task.

# When to reuse

Reuse when the same design pressure appears again.

# When not to reuse

Do not reuse when the constraints that justified the decision changed.
