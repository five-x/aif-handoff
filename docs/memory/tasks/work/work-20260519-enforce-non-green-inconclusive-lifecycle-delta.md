<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260519-enforce-non-green-inconclusive-lifecycle::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260519-enforce-non-green-inconclusive-lifecycle
source_path: docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-19
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/research.md
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/design.md
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/plan.md
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/result.md
  created_at: 2026-05-19
  last_verified_at: 2026-05-19

---

# Summary

Curated delta for task work-20260519-enforce-non-green-inconclusive-lifecycle.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Decision: explicit audit inconclusive is an accepted artifact classification but not a trusted task-success lifecycle state.
- Decision: coordinator and API approval must share one audit-card decision path.
- Decision: projection must fail closed for legacy `valid` + `audit_inconclusive` synthesis rows.
- Shared completion evidence becomes the first guard. Explicit `source_inconclusive` or `inconclusive_batch_evidence` synthesis remains a valid report classification, but it is not successful task completion. It emits `audit_inconclusive` so coordinator/API approval cannot mark the task verified or write a trusted artifact.
- Shared audit-card decision construction becomes reusable. Coordinator and API both call the same helper so `source_inconclusive` and inconclusive synthesis are consistently `finalStatus: "audit_inconclusive"` with inaccessible verification.
- Source-inconclusive implementer terminalization remains terminal for the artifact but non-green for the task. It writes `source_inconclusive` artifact state and blocks the task with a concrete reason instead of setting `done` with cleared blockers.
- Data projection defensively treats `audit_inconclusive` decisions as untrusted even when legacy persisted rows still say `state: "valid"`. Such rows must not have `trustedSynthesisInput=true`, next action `none`, or batch `complete`.
- UI behavior remains mostly projection-driven. If data sends untrusted/non-green rollup semantics, existing UI trust presentation can render warning/untrusted labels; small UI tests may be updated only where labels encode the stale trusted result.

## Patterns

- For lifecycle state, block new invalid success at the lowest shared validation layer and separately downgrade historical/persisted projections.
- Keep positive regression coverage for allowed weak/discarded findings when adding negative inconclusive-evidence regressions.
