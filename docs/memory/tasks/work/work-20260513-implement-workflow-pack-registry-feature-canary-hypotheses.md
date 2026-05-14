<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-implement-workflow-pack-registry-feature-canary::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-implement-workflow-pack-registry-feature-canary
source_path: docs/rdpi/work/work-20260513-implement-workflow-pack-registry-feature-canary
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-13
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260513-implement-workflow-pack-registry-feature-canary/research.md
- docs/rdpi/work/work-20260513-implement-workflow-pack-registry-feature-canary/design.md
- docs/rdpi/work/work-20260513-implement-workflow-pack-registry-feature-canary/plan.md
- docs/rdpi/work/work-20260513-implement-workflow-pack-registry-feature-canary/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Local-only hypotheses collected during task work-20260513-implement-workflow-pack-registry-feature-canary.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- Moving audit generated-task validation behind `getWorkflowPack("audit").validateGeneratedTask` can preserve exact audit issue messages because the pack can call `validateGeneratedAuditCard` without changing its result.
- A feature canary pack can prove non-audit routing by accepting a complete feature card with source/test/docs allowed changes and rejecting only missing feature markers, without adding audit-only requirements.
- Existing API and agent consumers can continue importing `validateGeneratedTaskIntent`; only tests and future pack-aware callers need the new registry exports.
