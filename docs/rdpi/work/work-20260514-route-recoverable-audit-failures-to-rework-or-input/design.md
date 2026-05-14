# Route Recoverable Audit Failures To Rework Or Input - Design

## Goals

- Keep audit validators strict while making recoverable audit artifact, report-contract, and content failures actionable rework.
- Preserve `blocked_external` for real external blockers: runtime/provider limits, auth/permission/access failures, branch/worktree isolation, dirty unsafe git state, missing secrets, and explicit operator-required decisions.
- Preserve terminal no-progress controls: same-blocker stall and no-substantive-delta should still end automatic local work.
- Make child/source report cards inside an existing audit batch pass plan-quality decomposition checks when their own plan is scoped to a source report.
- Let auto-queue move past terminal historical/manual audit cards without database patching.

## Non-goals

- Do not weaken audit report, manifest, evidence, or scope validation.
- Do not add a new database table unless existing durable task fields cannot represent the requested waiting behavior.
- Do not remove `blocked_external` from runtime, branch/worktree, permission, missing access, or explicit manual exception paths.
- Do not change non-audit lifecycle behavior except where a shared helper is needed to avoid drift.

## Proposed changes

### Shared audit lifecycle helpers

Introduce or centralize small shared predicates in `@aif/shared` so `coordinator.ts`, `taskEvents.ts`, and data active-count code use the same concepts:

- `isRecoverableAuditFailureFamily(family)`.
- `isTerminalAuditArtifactState(state)` for states that are historical/manual outcomes, not active work.
- Optional `isTerminalAuditReworkStatus(status)` when state alone is not enough.

This avoids further drift between `packages/agent/src/coordinator.ts` and `packages/api/src/services/taskEvents.ts`.

### Completion evidence routing

Adjust audit completion evidence routing so:

- Recoverable audit failure families route to `implementing` with `reworkRequested=true` while `reviewIterationCount < maxReviewIterations`.
- Repeated same failure signatures are recorded in artifact attempts and diagnostics, but do not immediately force `blocked_external` while budget remains.
- Terminal `manualReviewRequired` is reserved for max review budget, same-blocker stall, no-substantive-delta, true external blocker, `manual_exception`, or an explicit operator-input waiting handoff.
- Artifact validation details keep exact issue codes and evidence so the implementer receives actionable diagnostics.

### Deterministic repair fallback

Keep deterministic repair as the first local repair attempt for known audit report issues. When strict validation still fails:

- Persist the repair attempt as an artifact attempt with structured `validationDetails`, issue codes, repair decision, artifact path, and content hash where available.
- Do not set the task to `blocked_external` from the implementer solely because deterministic repair failed validation.
- Continue into the normal runtime implementer path in the same implementation stage, with `reworkRequested=true`, a `blockedReason`/implementation context naming unresolved validator issue codes, and `autoReviewState` carrying a repair snapshot.
- Keep `source_inconclusive` terminal behavior unchanged because the task card only targets recoverable report/content failures and says terminal manual review is allowed when local work is not productive or external input is required.

### Plan-quality source child exemption

Extend `TaskPlanQualityTask` with optional audit batch context:

- `auditArtifactRole?: "report" | "synthesis" | null`
- `roadmapBatchId?: string | null`

Then change `missing_audit_decomposition` logic so a task with `taskIntent="audit"`, `auditArtifactRole="report"`, and a batch id is treated as already decomposed. This exemption should only suppress broad child-decomposition requirements; evidence targets, exclusions, report structure, report artifact path, and concrete boundaries remain enforced.

Update the plan-checker caller to pass roadmap artifact role and batch id.

### Operator input waiting

Use existing durable fields for a narrow waiting state:

- `status="blocked_external"` only when the blocker is genuinely external/operator input.
- `blockedReason` starts with a stable prefix such as `operator_input_required:` and contains a concrete question and requested inputs.
- `blockedFromStatus` preserves the resume stage.
- `paused=true` prevents automatic churn until the operator answers.
- A task comment records the same concrete question for UI/history.

Resume must add explicit semantics to the existing `retry_from_blocked` path:

- If `blockedReason` starts with `operator_input_required:`, reject retry unless a newer human task comment exists after the operator-input hold was created. In the first implementation, use the latest human comment plus task `updatedAt`/activity ordering available in the API service; if exact hold timestamp is not available, require any non-empty latest human comment and record the limitation in tests/docs.
- On accepted retry for an operator-input hold, clear `paused` along with the normal blocked-state reset so the resumed `planning`/`implementing` task is visible to `findCoordinatorTaskCandidates()`.
- Preserve standard `retry_from_blocked` behavior for non-operator external blockers, including runtime retry windows and branch/worktree blocks.
- Add tests proving unanswered operator-input holds remain paused and answered holds become eligible for coordinator pickup.

This satisfies durability without adding a schema surface in this task.

### Auto-queue terminal audit skip

Broaden `countActivePipelineTasksForProject()` so auto-queue skips audit artifacts that are terminal historical/manual outcomes, while still counting real external blockers:

- Skip terminal audit states such as `invalid`, `missing`, `source_inconclusive`, `terminal_inconclusive`, and `manual_exception` only when `manualReviewRequired=true` or the rework status/state proves the artifact is terminal and there is no `retryAfter` and no `reworkRequested`.
- Continue counting `external_blocked`, retryable `blocked_external`, paused operator-input holds, and branch/worktree/runtime blockers.

## Risks and mitigations

- Risk: routing repeated failures to rework could reintroduce loops. Mitigation: keep max-review budget, same-blocker streak, and no-substantive-delta terminalization.
- Risk: source child exemption could let broad audits skip decomposition. Mitigation: require actual roadmap artifact role `report` and batch id from persisted batch context; do not infer solely from text.
- Risk: runtime fallback after deterministic repair could weaken deterministic authority. Mitigation: deterministic validation remains authoritative for acceptance; runtime can only produce another artifact attempt that must pass the same validator.
- Risk: operator-input waiting via existing fields is less structured than a first-class table. Mitigation: use stable `blockedReason` prefix and comments now; future UI/task model can migrate it.

## Verification strategy

- `@aif/shared` plan-quality regression: source report child inside a batch no longer gets `missing_audit_decomposition`; broad audit without batch context still does.
- `@aif/agent` implementer regression: repeated deterministic repair failure falls through to runtime query with structured repair diagnostics and does not terminalize as `manual_review_required`.
- `@aif/agent` coordinator regression: recoverable audit validator failures route to implementing while budget remains; max/no-delta/same-blocker terminal paths remain.
- `@aif/data` and `@aif/agent` auto-queue regressions: terminal historical/manual audit cards do not block the queue; real `blocked_external` continues to count as active.
- `@aif/api`/`@aif/data` operator-input regressions: retry is rejected before an answer, accepted after a human answer, clears `paused`, and the resumed task is eligible for coordinator pickup.
- Existing package tests for affected modules.
