# Result

## Outcome

Implemented the audit roadmap flow contract as a shared platform contract instead of another local parser exception. Typed audit roadmap import now creates durable batch and artifact records, validates generated audit cards through shared helpers, tracks expected report artifacts, distinguishes recoverable artifact failures from external blockers, and holds final synthesis until validated report artifacts are available.

## Final flow contract

- Generation/import validates typed audit cards through `packages/shared/src/auditRoadmapContract.ts`.
- Import creates `roadmap_batches` plus `roadmap_batch_artifacts` rows for report-producing tasks and synthesis.
- Each report artifact records role, task id, project alias, expected artifact path, validation state, failure family, and producer branch/worktree metadata.
- Completion evidence prefers the declared expected report artifact path and no longer accepts an arbitrary report-like file when a contract path is known.
- Completion evidence uses the same canonical audit report artifact path rules as import/card validation.
- Coordinator and approve-time validation update artifact state using the shared taxonomy.
- Recoverable artifact failures return the producer task to implementation rework with actionable reason text.
- Synthesis is held with `synthesis_not_ready` until all expected non-synthesis artifacts are valid.
- Synthesis input is assembled only from validated batch artifacts and injected into the implementer prompt.
- Validated report artifacts are loaded from producer worktrees when available, or from producer branch metadata via `git show <branch>:<path>` when running in serialized shared-checkout mode.
- If a validated synthesis input is unavailable, coordinator pauses synthesis with `synthesis_not_ready` instead of retry-looping.
- API completion events include batch summary counts, readiness, failure family, and message.

## Failure taxonomy

- `invalid_artifact_content`: report exists but fails the machine-validated audit contract.
- `missing_artifact`: expected report artifact is absent.
- `missing_tool_evidence`: task output does not prove required tool-backed evidence.
- `rework_needed`: findings are recoverable by task implementation changes.
- `synthesis_not_ready`: final synthesis is waiting for validated batch artifacts.
- `manual_review_required`: operator review is explicitly required.
- `external_blocker`: reserved for runtime, provider, access, branch/worktree, git isolation, or other operator/environment blockers.

Recoverable audit artifact failures now route to rework, not `blocked_external`. External blockers still remain external.

## Migration notes

- Database schema version advanced to 23.
- Added `roadmap_batches` and `roadmap_batch_artifacts`.
- Added indexes for batch lookup, artifact lookup by task id, artifact lookup by batch id, and project alias filtering.
- Existing task and generic roadmap behavior remains legacy-compatible when no roadmap batch row exists.

## Verification

- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"`
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .`
- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/auditRoadmapContract.test.ts src/__tests__/taskIntent.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/roadmapGeneration.test.ts src/__tests__/tasks.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts src/__tests__/coordinator.test.ts`
- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/auditRoadmapContract.test.ts src/__tests__/taskCompletionEvidence.test.ts src/__tests__/taskIntent.test.ts`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd exec -- turbo test --concurrency=1`
- `git diff --check`
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .`

## Canary evidence

The platform canary coverage is deterministic and mocked at service/coordinator boundaries rather than tied to botIntevra source files:

- valid audit import creates batch/artifact rows and exposes batch summary.
- invalid or missing audit artifact evidence returns the task to rework.
- approve-time recoverable artifact failure returns the task to rework.
- synthesis is paused until the batch is ready.
- synthesis prompt uses validated batch artifacts only.
- synthesis prompt reads a validated report from its producer branch when the shared checkout lacks the file.
- synthesis pauses cleanly when a validated artifact is unavailable during implementation.
- database migration creates the durable batch/artifact tables and indexes.

## Gates

- Plan review: `PLAN PASS`.
- Test review: `TEST PASS`.
- Final review: `REVIEW PASS`.

## Memory sync

- `codex-memsync.ps1 --mode auto` was blocked by local PowerShell execution policy.
- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260510-harden-audit-roadmap-flow-contract --project aif-handoff --entity aif-handoff` completed successfully.
- Report: `docs/memory/reports/work-20260510-harden-audit-roadmap-flow-contract-memsync-report.md`.
