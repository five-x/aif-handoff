<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260528-research-design-stages::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260528-research-design-stages
source_path: docs/rdpi/work/work-20260528-research-design-stages
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-28
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260528-research-design-stages/research.md
- docs/rdpi/work/work-20260528-research-design-stages/design.md
- docs/rdpi/work/work-20260528-research-design-stages/plan.md
- docs/rdpi/work/work-20260528-research-design-stages/result.md
  created_at: 2026-05-28
  last_verified_at: 2026-05-28

---

# Summary

Curated delta for task work-20260528-research-design-stages.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED` as a conservative combined rollout flag.
- Reusable stage-artifact runner contract: one fenced JSON block, versioned schema, accepted/questions/blocked outcomes, and stage-local question routing.
- `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED=false` by default.
- The flag is effective only when `AIF_REQUIREMENTS_INTAKE_ENABLED=true`.
- Disabled behavior remains the current Phase 1 path: `requirements_analysis -> planning`.
- Enabled behavior becomes `requirements_analysis -> research -> design -> planning`.

## Patterns

- Use a versioned fenced JSON contract for stage runner outputs.
- Keep missing-artifact planner guards as routing decisions, while product clarification remains `needs_input` and infrastructure/manual failures remain `blocked_external`.
