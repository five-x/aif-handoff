<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260602-config-driven-reviewgate-refutations::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260602-config-driven-reviewgate-refutations
source_path: docs/rdpi/work/work-20260602-config-driven-reviewgate-refutations
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-06-05
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260602-config-driven-reviewgate-refutations/research.md
- docs/rdpi/work/work-20260602-config-driven-reviewgate-refutations/design.md
- docs/rdpi/work/work-20260602-config-driven-reviewgate-refutations/plan.md
- docs/rdpi/work/work-20260602-config-driven-reviewgate-refutations/result.md
  created_at: 2026-06-05
  last_verified_at: 2026-06-05

---

# Summary

Curated delta for task work-20260602-config-driven-reviewgate-refutations.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- ReviewGate repository refutations are now split between generic built-in refutations and configured project-specific refutations.
- Configured refutations currently support `imported_type_without_local_declaration`.
- The provider supports both `import type { Symbol } from "..."` and `import { type Symbol } from "..."`.

## Decisions

- none

## Patterns

- For future project-specific ReviewGate exceptions, add a config entry and generic proof handler test instead of adding project terms to `packages/agent/src/reviewGate.ts`.
