<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-plan-b-v13-audit-runbook::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-plan-b-v13-audit-runbook
source_path: docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook
stability: validated
sensitivity: local-only
kind: artifact
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
- task-delta
  source_refs:
- docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md
- docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/design.md
- docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/plan.md
- docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Curated delta for task work-20260513-plan-b-v13-audit-runbook.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Broad audit operator procedure: broad audit requests should become decomposed parent audits with independent source report children and one final synthesis, while narrow concrete audit requests may remain one card.
- Legacy audit cleanup procedure: old audit cards are preserved as historical context and superseded by a fresh v13 parent when they fail the new decomposition, evidence, or synthesis standards.
- decision rules for one audit card versus a decomposed parent audit;
- expected shape of decomposed parent, child source reports, and final synthesis;
- what reviewers should report back as unresolved facts during implementation and review loops;
- how to interpret blocked parent and child cards, including `stalled_rework_loop`, `no_substantive_rework_delta`, and `synthesis_not_ready`;
- weak-plan rejection rules and the v13 audit prompt constraints used for validation;
- cleanup and retry procedure for old v10/v11/v12 audit cards.

## Patterns

- For operator runbooks, prefer durable, visible procedures under `docs/ops/` with explicit source references and avoid relying on hidden runtime assumptions.
- For legacy audit cleanup, preserve historical cards and artifacts, then supersede them with traceable new audit parents instead of deleting old work.
