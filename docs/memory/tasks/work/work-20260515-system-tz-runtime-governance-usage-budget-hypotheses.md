<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-system-tz-runtime-governance-usage-budget::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-system-tz-runtime-governance-usage-budget
source_path: docs/rdpi/work/work-20260515-system-tz-runtime-governance-usage-budget
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-17
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260515-system-tz-runtime-governance-usage-budget/research.md
- docs/rdpi/work/work-20260515-system-tz-runtime-governance-usage-budget/design.md
- docs/rdpi/work/work-20260515-system-tz-runtime-governance-usage-budget/plan.md
- docs/rdpi/work/work-20260515-system-tz-runtime-governance-usage-budget/result.md
  created_at: 2026-05-17
  last_verified_at: 2026-05-17

---

# Summary

Local-only hypotheses collected during task work-20260515-system-tz-runtime-governance-usage-budget.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: A canonical stage-policy layer can satisfy the governance requirement without a broad schema migration by mapping System TZ stages to existing compatibility slots and making the mapping explicit in shared/data/agent code.
- H2: Usage-event append coverage can be improved safely by recording zero-usage outcome rows for failed and missing-usage calls while preserving current aggregate counters.
- H3: Budget enforcement can start as a deterministic pre-start stage gate over project budget fields and task-scoped stage usage, with warning/block decisions visible in activity logs and blocked reasons.
- H4: Warmup can become stage-aware by adding audit/synthesis targets and by documenting/reusing reviewer/security compatibility where the current runtime profile slot is shared.
- H5: Auto-resume can be satisfied by preserving the existing `retryAfter` release path and adding runtime-limit-specific acceptance/tests so provider `resetAt` / `retryAfterSeconds` snapshots are demonstrably what schedules the release.
