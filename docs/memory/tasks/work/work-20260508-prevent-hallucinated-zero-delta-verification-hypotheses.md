<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260508-prevent-hallucinated-zero-delta-verification::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260508-prevent-hallucinated-zero-delta-verification
source_path: docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-08
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/research.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/design.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/plan.md
- docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/result.md
  created_at: 2026-05-08
  last_verified_at: 2026-05-08

---

# Summary

Local-only hypotheses collected during task work-20260508-prevent-hallucinated-zero-delta-verification.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- `packages/agent/src/coordinator.ts` can move an implementer stage directly to `done` when `skipReview=true` (line 379), so a roadmap task can bypass review entirely.
- The same coordinator file moves review-accepted tasks to `done` after auto-review success (line 462), but there is no deterministic evidence guard before that transition.
- `packages/shared/src/stateMachine.ts` turns `done + approve_done` into `verified` (line 76) without checking task artifacts or repository delta.
- `packages/api/src/services/taskEvents.ts` applies the `approve_done` transition and writes the patch at line 222; this is the API-side point where a manual approval can be blocked before `verified`.
- `packages/api/src/services/roadmapGeneration.ts` forces imported roadmap tasks to `skipReview: true` (line 549), which increases the need for a deterministic completion guard on `skipReview` completion paths.
- `packages/agent/src/subagents/planChecker.ts` can keep an existing bad plan if checker output and local fallback fail (line 167). Generic plan detection should therefore happen before completion, not only during plan checking.
- `packages/agent/src/subagents/implementer.ts` currently logs a warning when checklist items remain incomplete after auto-sync (line 407) but does not block completion by itself.
