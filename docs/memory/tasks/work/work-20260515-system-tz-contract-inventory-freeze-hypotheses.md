<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-system-tz-contract-inventory-freeze::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-system-tz-contract-inventory-freeze
source_path: docs/rdpi/work/work-20260515-system-tz-contract-inventory-freeze
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-15
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260515-system-tz-contract-inventory-freeze/research.md
- docs/rdpi/work/work-20260515-system-tz-contract-inventory-freeze/design.md
- docs/rdpi/work/work-20260515-system-tz-contract-inventory-freeze/plan.md
- docs/rdpi/work/work-20260515-system-tz-contract-inventory-freeze/result.md
  created_at: 2026-05-15
  last_verified_at: 2026-05-15

---

# Summary

Local-only hypotheses collected during task work-20260515-system-tz-contract-inventory-freeze.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- A single inventory/freeze document under `docs/kb/` can satisfy Phase 0 without runtime changes by mapping each current surface to the target backbone and clearly marking compatibility-only DTOs.
- The highest-risk drift surfaces are duplicated audit validators and route-specific task state/completion logic, not the database schema itself.
- The inventory should freeze audit validators as current containment and explicitly defer behavior changes to sibling System TZ cards.
