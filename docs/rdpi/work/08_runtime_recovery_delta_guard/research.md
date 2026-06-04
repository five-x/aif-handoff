# Research - 08_runtime_recovery_delta_guard

## Task framing and lane

- Task id: `08_runtime_recovery_delta_guard`.
- Lane: `work`.
- Source task file: `C:/Users/apron/Desktop/aif_stabilization_tz_pack/08_runtime_recovery_delta_guard.md`.
- Priority: P1.
- Goal: runtime recovery must not schedule bounded retries when the current recovery attempt has no new artifact or evidence delta.
- Required delta comparison fields from the task spec:
  - `sameArtifactSha`
  - `sameValidatorFingerprint`
  - `sameToolLoopPattern`
  - `sameBlockedReasonFamily`
  - `sameEvidenceRefs`
  - `sameSourceSnapshot`
- Required no-delta behavior:
  - `status = "blocked_external"`
  - `blockedReason = "runtime_recovery_no_delta_fail_closed:<reason>"`
  - `manualReviewRequired` based on task type
  - `retryAfter = null`
- Runtime categories in scope:
  - `timeout`
  - `context_length`
  - `transport`
  - `stream`
  - `repository_inspection_budget_exhaustion`
  - post-write audit artifact failure
- Acceptance includes a result matrix of categories and expected behavior.

## Accepted planning sources or local facts

- RDPI preflight command: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- Only root `AGENTS.md` applies. No nested `AGENTS.md` files were found under the relevant paths.
- Relevant repo commands from root `AGENTS.md`:
  - Build: `npm.cmd run build`
  - Test: `npm.cmd test`
  - Lint: `npm.cmd run lint`
- Current worktree has pre-existing dirty docs/memory and prior RDPI files. The source and test files named by this task are clean before implementation.
- Current recovery call order in `packages/agent/src/coordinator.ts`:
  - implementation runtime exhaustion is handled before automatic runtime fallback at `coordinator.ts:4546`.
  - post-write audit artifact recovery runs before other runtime recovery hooks at `coordinator.ts:4592`.
  - repository inspection budget exhaustion is handled at `coordinator.ts:4605`.
  - context fallback runs at `coordinator.ts:4618`.
  - audit report timeout bounded recovery runs at `coordinator.ts:4631`.
  - generic transient fallback runs at `coordinator.ts:4644`.
  - audit report transient bounded recovery runs at `coordinator.ts:4657`.
  - generic `classifyStageError()` runs after those hooks at `coordinator.ts:4674`.
- Current bounded retry surfaces in `packages/agent/src/coordinator.ts`:
  - context fallback schedules immediate fallback at `coordinator.ts:1159`.
  - transient runtime fallback for `transport`, `stream`, and `timeout` schedules immediate fallback at `coordinator.ts:1297`.
  - audit report timeout bounded retry is capped by `AUDIT_REPORT_TIMEOUT_RECOVERY_MAX_RETRIES` and schedules retry at `coordinator.ts:1425`.
  - audit report transient bounded retry schedules retry at `coordinator.ts:1515`.
  - post-write audit runtime failure reads the written report and invokes deterministic completion validation at `coordinator.ts:1574` and `coordinator.ts:1595`.
  - repository-inspection budget exhaustion already avoids context fallback and blocks/terminalizes at `coordinator.ts:1001`.
- `packages/agent/src/stageErrorHandler.ts` owns generic error classification after coordinator-specific hooks:
  - repeated tool loop provider metadata is mapped to no-retry `blocked_external` at `stageErrorHandler.ts:350`.
  - implementation runtime exhaustion blocks before recovery at `stageErrorHandler.ts:382`.
  - repository inspection budget exhaustion blocks without retry inside generic classification at `stageErrorHandler.ts:586`.
  - generic external failures still use retry/backoff at `stageErrorHandler.ts:585`.
- Existing failure fingerprint support:
  - `packages/shared/src/auditFailureFingerprint.ts` provides a canonical SHA-256 failure fingerprint over task, stage, artifact path/SHA, validator issue codes, validation fingerprint, blocker ids, source snapshot, allowed write paths, and failure family.
  - audit failure fingerprint construction uses artifact SHA, validation fingerprint, source snapshot, and allowed write paths in `coordinator.ts:1983`.
  - implementation manifest failure fingerprint includes evidence refs and source snapshot inputs in `coordinator.ts:2055`.
  - repeated failure attempts are persisted via `recordTaskStageArtifactAttempt()` in `coordinator.ts:2157`.
  - same-failure blocking writes `same_failure_fingerprint_fail_closed` at `coordinator.ts:2183`.
- Existing data model support:
  - task stage artifacts and attempts have `metadataJson` and `sourceSnapshotId` fields in `packages/shared/src/schema.ts:240` and `packages/shared/src/schema.ts:262`.
  - `recordTaskStageArtifactAttempt()` updates the current artifact and appends an attempt in `packages/data/src/index.ts:2497`.
  - `listTaskStageArtifactAttempts(taskId)` reads attempts for comparison in `packages/data/src/index.ts:2439`.
- Existing tests around relevant behavior:
  - context fallback default blocking begins around `packages/agent/src/__tests__/coordinator.test.ts:4117`.
  - repository-inspection budget exhaustion tests begin around `coordinator.test.ts:4183`.
  - transient fallback default blocking begins around `coordinator.test.ts:4349`.
  - active fallback attribution is covered around `coordinator.test.ts:4526`.
  - audit timeout/transient recovery tests begin around `coordinator.test.ts:4688`.
  - post-write audit artifact recovery tests begin around `coordinator.test.ts:5036`.
  - same failure fingerprint tests cover existing non-runtime rework loops around `coordinator.test.ts:6380`.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS`; the repo RDPI instructions forbid shared-memory recall before `PLAN PASS` unless the user explicitly waives that boundary.
- Local repo RDPI docs were used as planning sources:
  - `docs/rdpi/work/07_same_failure_fingerprint_fail_closed/design.md` records the existing canonical fingerprint contract and explicitly excludes runtime provider/tool-loop fingerprinting from that task.
  - `docs/rdpi/work/07_same_failure_fingerprint_fail_closed/plan.md` records the implementation/testing pattern for storing fingerprints in task-stage attempts.
  - `docs/rdpi/work/01_hard_tool_loop_guard/result.md` records that repeated qwen-local-agent tool loops now emit `repeated_tool_loop_blocked` with a public SHA-256 fingerprint and are classified fail-closed by `stageErrorHandler`.
  - `docs/rdpi/work/work-20260530-fail-closed-implementation-runtime-exhaustion/research.md` records the earlier risk that runtime recovery hooks can bypass fail-closed implementation exhaustion if ordering is wrong.

## Cross-project reusable patterns

- No cross-project reusable memory was consulted before `PLAN PASS`.
- Reusable pattern from local code: persist machine-readable guard inputs in structured attempt metadata, not in activity-log text; use activity logs only for operator observability.

## Rejected or stale memory candidates

- Activity-log-only matching is rejected as a persistence source. Existing same-failure work explicitly uses task-stage artifact attempts or roadmap attempt metadata instead.
- Runtime `runtimeOptionsJson` is rejected as the only persistence location for the guard because it is cleared or overwritten by fallback selection paths and is not append-only evidence.
- Broad string matching on raw runtime error text is rejected. The repo checklist requires structured runtime categories/provider metadata where possible.

## Independent explorer findings

- The independent explorer confirmed that the recovery paths do not currently share a "new delta required" decision before retrying.
- The explorer identified the same change points:
  - `handleContextLengthRecovery`
  - `handleTransientRuntimeFallbackRecovery`
  - `handleAuditReportTimeoutRecovery`
  - `handleAuditReportTransientRecovery`
  - `recoverWrittenAuditArtifactAfterRuntimeFailure`
  - `handleRepositoryInspectionBudgetExhaustion`
- The explorer also flagged that `manualReviewRequired` needs a task-type matrix and that post-write recovery must not skip deterministic validation when a written artifact has actually changed.
