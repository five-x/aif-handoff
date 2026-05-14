<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-move-audit-roadmap-hooks-behind-pack::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-move-audit-roadmap-hooks-behind-pack
source_path: docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack
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
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/research.md
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/design.md
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/plan.md
- docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Curated delta for task work-20260513-move-audit-roadmap-hooks-behind-pack.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Roadmap behavior that depends on API/data/project-root concerns should be behind an API-local workflow-pack extension, not forced into `@aif/shared`.
- The shared `WorkflowPack` registry remains the stable pack identity source; service-local extensions may use it to avoid making AIF Handoff an audit-only product.
- Audit roadmap strictness is preserved by calling existing validators and helpers through the hook boundary rather than reimplementing rules.
- request guard behavior for audit-shaped aliases and audit-only vision text;
- audit generation context enrichment, including audit decomposition classification;
- audit generation prompt text;
- generated audit roadmap content normalization and deterministic fallback;
- deterministic audit roadmap extraction to generated task objects;
- audit generated-batch validation;
- import duplicate-alias rejection;
- audit import decoration for tags, review/subagent defaults, synthesis pause/block reason, artifact collection, and batch summary creation.
- project lookup and project configuration reads;
- reading/writing `ROADMAP.md`;
- runtime model invocation for non-audit extraction/generation;
- zod parsing of model output;
- task creation, dedupe, plan path reservation, ordering, and return payload shape;
- route response mapping and websocket broadcasts.

## Patterns

- Keep dependency-heavy workflow behavior in the package that already owns those dependencies, but key it by shared workflow-pack identity so pack semantics are explicit and testable.
- Preserve compatibility by moving existing validators behind an extension boundary before changing behavior.
