<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-terminalize-stalled-audit-rework-loops::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-terminalize-stalled-audit-rework-loops
source_path: docs/rdpi/work/work-20260513-terminalize-stalled-audit-rework-loops
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
- docs/rdpi/work/work-20260513-terminalize-stalled-audit-rework-loops/research.md
- docs/rdpi/work/work-20260513-terminalize-stalled-audit-rework-loops/design.md
- docs/rdpi/work/work-20260513-terminalize-stalled-audit-rework-loops/plan.md
- docs/rdpi/work/work-20260513-terminalize-stalled-audit-rework-loops/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Local-only hypotheses collected during task work-20260513-terminalize-stalled-audit-rework-loops.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: Persisting a same-blocker streak on each auto-review finding is the smallest deterministic way to group repeated reviewer failures by stable fingerprint.
- H2: A separate environment setting, for example `AGENT_AUTO_REVIEW_STALL_THRESHOLD`, can terminalize repeated blocker loops without changing `maxReviewIterations`.
- H3: For audit/report tasks, diagnostics should include both stable blocker ids and report artifact content hash/attempt context when available, but terminalization should not depend on changing the existing audit failure signature algorithm.
- H4: Coordinator should surface stalled auto-review loops as `blocked_external` with `manualReviewRequired=true`, `reworkRequested=false`, preserved `autoReviewState`, and a blocked reason listing unresolved finding ids/text.
- H5: Fresh blocker progression should not stall the task. A cycle with new blocker ids should reset or start separate streaks for those blockers.
- H6: For roadmap audit/report rework, recording an artifact-content snapshot at `request_changes` and comparing it after implementation is the narrowest way to reject immediate unchanged resubmission while still allowing genuine artifact edits to proceed to review.
