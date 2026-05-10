<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260510-harden-audit-roadmap-flow-contract::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260510-harden-audit-roadmap-flow-contract
source_path: docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-10
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/research.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/design.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/plan.md
- docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/result.md
  created_at: 2026-05-10
  last_verified_at: 2026-05-10

---

# Summary

Curated delta for task work-20260510-harden-audit-roadmap-flow-contract.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Durable audit batch state should be first-class data, not inferred only from task tags and current checkout state.
- Report artifact validation should be contract-driven and shared across import, review, completion, approve, and synthesis readiness gates.
- `blocked_external` should mean external intervention is required, not “the report content is invalid.”
- Shared machine contract in `@aif/shared`
- Add a shared audit roadmap contract module that defines report roles, required generated-task markers, expected artifact parsing, synthesis detection, canonical validation issues, and failure taxonomy.
- Reuse this module from `taskIntent.ts`, `roadmapGeneration.ts`, `taskCompletionEvidence.ts`, `reviewGate.ts`, `coordinator.ts`, and `taskEvents.ts`.
- Keep generic roadmap and non-audit task behavior unchanged.
- Durable audit batch/artifact model
- Add `roadmap_batches` and `roadmap_batch_artifacts` persistence.
- `roadmap_batches` tracks project, alias, intent, status, created task ids, synthesis task id, expected artifact count, validation summary, and timestamps.
- `roadmap_batch_artifacts` tracks batch id, producer task id, report path, role (`report` or `synthesis`), state (`expected`, `valid`, `invalid`, `missing`, `synthesis_not_ready`, `external_blocked`), branch/worktree pointers, validation details, and timestamps.
- Typed audit imports create the batch/artifact rows atomically with task creation. Existing generic imports do not create these rows.
- Gate behavior and synthesis readiness
- Completion validation uses the expected artifact path from the contract/batch when present. It should not accept unrelated report-like files as proof for a typed audit task that names a different report artifact.
- Recoverable audit artifact/content failures map to rework (`implementing`, `reworkRequested=true`, actionable reason), not `blocked_external`.
- External failures remain `blocked_external`: runtime capability/provider limits, branch/worktree isolation, missing access, and operator-required external intervention.
- Synthesis tasks stay paused with a clear `synthesis_not_ready` reason until all expected non-synthesis artifacts in the batch are valid. When the last report validates, the synthesis task can be unpaused and made eligible for normal execution.
- Synthesis execution input is assembled from `roadmap_batch_artifacts`: enumerate validated non-synthesis artifacts, resolve each producer's `worktreePath` or project root plus branch metadata, load the report content from the declared path, and fail closed with `synthesis_not_ready` if any validated artifact is unavailable.
- Synthesis completion validates only the declared synthesis artifact and must not read unvalidated report-like files from the current checkout.
- Audit batch branch/worktree policy
- For typed audit batches on git projects with branch creation enabled, prefer task worktrees before parallel auto-queue can run the batch.
- If task worktrees are disabled or unsupported, the supported safe default is strict serialization plus dirty-worktree gating. This fallback must be asserted in tests and surfaced in batch policy metadata.
- The batch model records the selected execution policy (`worktree_isolated` or `serialized_shared_checkout`) so later synthesis/readiness decisions understand whether artifacts may live outside the shared checkout.
- Batch-level API/UI surface
- Existing task `blockedReason` and rework fields remain the task-level surface.
- Add or extend project/roadmap responses with a batch summary that reports artifact counts by state, synthesis readiness, and the highest-priority failure family.
- API responses and WebSocket payloads should expose enough structured state to distinguish invalid artifact content, rework needed, external blocker, and synthesis not ready. UI changes can stay minimal if the existing roadmap/task surfaces can display the structured messages.

## Patterns

- Promote task-family contracts into shared typed validators before wiring them into runtime gates.
- Persist batch-level expectations when tasks in separate branches/worktrees must later be synthesized.
- Treat invalid generated artifacts as rework, and reserve external blocking for conditions the implementer cannot fix in the task artifact.
