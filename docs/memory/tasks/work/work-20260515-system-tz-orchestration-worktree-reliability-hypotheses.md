<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-system-tz-orchestration-worktree-reliability::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-system-tz-orchestration-worktree-reliability
source_path: docs/rdpi/work/work-20260515-system-tz-orchestration-worktree-reliability
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
- docs/rdpi/work/work-20260515-system-tz-orchestration-worktree-reliability/research.md
- docs/rdpi/work/work-20260515-system-tz-orchestration-worktree-reliability/design.md
- docs/rdpi/work/work-20260515-system-tz-orchestration-worktree-reliability/plan.md
- docs/rdpi/work/work-20260515-system-tz-orchestration-worktree-reliability/result.md
  created_at: 2026-05-17
  last_verified_at: 2026-05-17

---

# Summary

Local-only hypotheses collected during task work-20260515-system-tz-orchestration-worktree-reliability.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: Adding explicit `lockStage` and `coordinatorId` persistence around the existing atomic claim/release functions will satisfy lock provenance without changing the public task pipeline states.
- H2: Owner-scoped lock release on shutdown is safer than broad unlock by task ID because it avoids clearing another coordinator's live claim.
- H3: Extracting thin orchestration service modules around lock, scheduler, auto-queue, and worktree cleanup can improve coordinator reliability while keeping high-risk stage/gate logic in place.
- H4: Explicit worktree cleanup should be API-initiated and audited, blocked before verified task state, and should return disk usage warnings instead of deleting automatically.
- H5: Focused tests around the data lock contract, coordinator scheduler/auto-queue contract, task API worktree cleanup, and schema migrations will catch the main regressions without requiring full end-to-end runtime execution.
