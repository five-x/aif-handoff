<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-system-tz-audit-classifier-synthesis-v2::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-system-tz-audit-classifier-synthesis-v2
source_path: docs/rdpi/work/work-20260515-system-tz-audit-classifier-synthesis-v2
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-16
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260515-system-tz-audit-classifier-synthesis-v2/research.md
- docs/rdpi/work/work-20260515-system-tz-audit-classifier-synthesis-v2/design.md
- docs/rdpi/work/work-20260515-system-tz-audit-classifier-synthesis-v2/plan.md
- docs/rdpi/work/work-20260515-system-tz-audit-classifier-synthesis-v2/result.md
  created_at: 2026-05-16
  last_verified_at: 2026-05-16

---

# Summary

Curated delta for task work-20260515-system-tz-audit-classifier-synthesis-v2.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- Public audit source report outcomes are limited to `validated_findings_present`, `validated_no_findings`, and `source_inconclusive`.
- Lower-level audit diagnostics such as `inventory_only_invalid` and `insufficient_substantive_evidence` remain internal classifier signals and are not valid manifest v2 public outcomes.
- Legacy manifest v1 reports may still contain older lower-level diagnostic outcomes, but validation normalizes them to the public `source_inconclusive` outcome.
- Inventory-only and weak source reports remain untrusted and cannot become trusted synthesis input.
- `source_inconclusive` is terminal diagnostic output, not positive source evidence.

## Decisions

- none

## Patterns

- Keep public outcome vocabularies in one shared module and convert from lower-level diagnostics at public boundaries.
- For manifest version migrations, accept legacy inputs through explicit normalization while making the new version strict.
- Treat inconclusive audit outputs as terminal evidence states and not as repairable trusted inputs.
