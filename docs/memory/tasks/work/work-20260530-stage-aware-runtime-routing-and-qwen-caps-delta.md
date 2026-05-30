<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260530-stage-aware-runtime-routing-and-qwen-caps::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260530-stage-aware-runtime-routing-and-qwen-caps
source_path: docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-30
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps/research.md
- docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps/design.md
- docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps/plan.md
- docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps/result.md
  created_at: 2026-05-30
  last_verified_at: 2026-05-30

---

# Summary

Curated delta for task work-20260530-stage-aware-runtime-routing-and-qwen-caps.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- `packages/shared/src/constants.ts` already defines canonical runtime stages and stage-to-profile-mode mapping:
- plan-family stages route to profile mode `plan`
- implementer routes to profile mode `task`
- reviewer/security/qa route to profile mode `review`
- `packages/data/src/index.ts` resolves effective runtime profiles by task override, project default, then system default. It currently checks missing/disabled profiles but not stage capability.
- `packages/agent/src/subagentQuery.ts` converts workflow kind to runtime stage, resolves the effective runtime profile, checks adapter hard capabilities such as `supportsRepositoryTools`, builds runtime execution intent, and passes `maxTurns`, run timeout, budget, and repository-inspection budgets to adapters.
- `packages/agent/src/coordinator.ts` already resolves runtime profile before claiming a task for proactive runtime limit gating. That is the right place to fail closed before implementer runtime if configured candidates exist but none are implementation-capable.
- `packages/runtime/src/adapters/qwenLocalAgent/index.ts` advertises `supportsRepositoryTools: true`, which is necessary but too broad for implementation safety.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts` has local endpoint token budgets, max tool turn handling, run timeout handling, and structured max-tool-turn exhaustion metadata.
- The predecessor fail-closed task already classifies implementer timeout, runtime budget exhaustion, and Qwen max-tool-turn exhaustion as `implementation_runtime_exhausted_requires_split`.

## Decisions

- none

## Patterns

- none
