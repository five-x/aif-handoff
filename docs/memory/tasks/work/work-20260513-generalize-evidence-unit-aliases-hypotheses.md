<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-generalize-evidence-unit-aliases::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-generalize-evidence-unit-aliases
source_path: docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases
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
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/research.md
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/design.md
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/plan.md
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Local-only hypotheses collected during task work-20260513-generalize-evidence-unit-aliases.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: The smallest safe shared/API boundary is to add generic `EvidenceUnit*` type/function aliases in the shared ledger module and root export while retaining all audit-named exports.
- H2: Data-layer generic append/list wrappers can call the existing audit ledger functions and return the same persisted row shape, proving storage compatibility.
- H3: Runtime event payloads can carry both `auditEvidence` and `evidenceUnit` keys while keeping `audit:evidence` as the event type, allowing newer code to read the generic alias and older code to keep working.
- H4: Agent event persistence should prefer the audit key for compatibility but accept `evidenceUnit` as an additive alias.
- H5: Focused shared, data, runtime, and agent tests can prove aliases are identity-compatible and existing audit flows still work without a broad monorepo test run.
