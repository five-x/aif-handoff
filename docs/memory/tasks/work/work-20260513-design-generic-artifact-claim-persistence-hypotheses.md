<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-design-generic-artifact-claim-persistence::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-design-generic-artifact-claim-persistence
source_path: docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence
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
- docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/research.md
- docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/design.md
- docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/plan.md
- docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Local-only hypotheses collected during task work-20260513-design-generic-artifact-claim-persistence.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- The safest design is a pack-neutral persistence layer beside the existing audit roadmap tables, not a rename or reinterpretation of the audit tables.
- Current-row artifact tables plus append-only attempts are still the right shape, but generic artifacts need run id, pack id, artifact type, URI/ref, and multiple artifacts per task.
- Claims should be first-class rows separate from artifacts because one artifact can assert many conclusions and one conclusion may be supported by multiple evidence links.
- Evidence links should support both future generic evidence-unit rows and compatibility references to `audit_evidence_events` until the evidence ledger is fully generalized.
- Inconclusive outcomes should be explicit and terminal/non-terminal, not overloaded into `invalid`, so feature/fix/docs packs can distinguish unsupported, refuted, blocked, and manually waived claims.
