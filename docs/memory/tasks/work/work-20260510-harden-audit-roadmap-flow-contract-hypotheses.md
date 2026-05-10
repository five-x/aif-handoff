<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260510-harden-audit-roadmap-flow-contract::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260510-harden-audit-roadmap-flow-contract
source_path: docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-10
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/research.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/design.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/plan.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/result.md
  created_at: 2026-05-10
  last_verified_at: 2026-05-10

---

# Summary

Local-only hypotheses collected during task work-20260510-harden-audit-roadmap-flow-contract.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- A shared audit flow contract module can replace duplicated validation helpers and become the single parser/validator for generated tasks, expected report paths, synthesis detection, and failure taxonomy.
- Adding `roadmap_batches` and `roadmap_batch_artifacts` tables is the smallest durable model that satisfies expected artifact tracking without rewriting the generic task model.
- Completion evidence can keep its existing substantive-report heuristics while accepting expected artifact paths from the audit contract, making it validate the named report rather than any report-like changed file.
- Recoverable audit artifact failures can return to `implementing` with `reworkRequested=true` and structured `blockedReason` metadata, while `blocked_external` remains reserved for external/runtime/git/access failures.
- Synthesis readiness can be enforced by pausing the synthesis task until all non-synthesis batch artifacts are validated, then unpausing it automatically when the final artifact becomes valid.
