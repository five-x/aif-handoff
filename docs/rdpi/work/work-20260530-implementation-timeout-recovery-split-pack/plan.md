# Plan

## Implementation Steps

1. Extend shared split proposal typing.
   - Add `implementation_recovery` to `TaskSplitProposalSourceKind` in `packages/shared/src/types.ts`.
   - Keep roadmap import/generation behavior unchanged.

2. Add a recovery-pack builder.
   - Create `packages/agent/src/implementationRecoveryPack.ts`.
   - Define the versioned pack interfaces and constants locally in the agent package unless a broader shared export becomes necessary.
   - Parse markdown checklist items from `task.plan` into completed/pending/blocked-by-timeout groups.
   - Parse optional `implementationManifestJson` for verification evidence and acceptance status summaries.
   - Reuse `readGitWorktreeReworkSnapshot()` for changed-file digest and bounded file summaries.
   - Sanitize every persisted string with `redactProviderText()` and cap arrays/strings.
   - Emit both structured metadata and an operator-readable markdown summary.
   - Export a deterministic sanitized fingerprint builder for the split proposal source. Exclude generated timestamps, raw error text, provider metadata, attempt ids, and proposal ids.

3. Broaden implementation timeout detection.
   - Update `packages/agent/src/stageErrorHandler.ts` so implementer wrapper timeout errors from `runStageWithTimeout()` classify as implementation exhaustion.
   - Preserve existing `RuntimeExecutionError` timeout/status behavior.
   - Add focused stage error handler tests proving implementer wrapper timeout blocks without retry and non-implementer timeout does not use the implementation exhaustion reason.

4. Persist the pack and proposal in the coordinator.
   - Import `recordTaskStageArtifactAttempt()` and `createOrReusePendingTaskSplitProposal()` from `@aif/data`.
   - In the existing pre-fallback implementation exhaustion branch in `packages/agent/src/coordinator.ts`, build and record the pack before the final `blocked_external` update.
   - Create/reuse a pending split proposal with source kind `implementation_recovery`, deterministic `sourceFingerprint`, `summary`, `sourceRef`, `roadmapAlias`, `taskIntent`, appropriate `parentTaskId`, and the pack's proposed children.
   - On `created` or `reused`, add the proposal id/status to the recovery artifact metadata, blocked reason, and activity log.
   - On `conflict`, do not approve, reject, overwrite, or create children. Still block the task, persist the recovery pack, and add a sanitized activity line plus blocked-reason suffix showing `splitProposalStatus=conflict` and the existing proposal id.
   - Broadcast `task:timeline_updated`.
   - If recording fails, fail closed anyway and record a sanitized recovery-pack failure line.

5. Add regression tests.
   - Recovery-pack builder test: partial git changes produce `hasChanges=true`, a digest, bounded summaries, pending checklist items, and proposed child cards.
   - Recovery-pack builder test: no git changes produces `hasChanges=false` or an unavailable/no-change source and still proposes a safe split/continuation recommendation.
   - Recovery-pack builder test: secret-like provider/task/checklist/verification text is redacted from markdown, metadata, and proposed children.
   - Coordinator test: implementation exhaustion records a `recovery_pack` stage artifact, creates a pending `implementation_recovery` proposal, points `blockedReason` to both, preserves retry count, clears fallback state, and does not rerun implementer on a second poll.
   - Coordinator/data-facing test: repeated identical timeout recovery reuses the pending proposal; changed recovery proposal content returns conflict, leaves the existing proposal pending, creates no tasks, and still fails closed with an operator-visible conflict reference.

6. Update docs if needed.
   - If API-visible types or docs mention split proposal source kinds, update them to include implementation recovery.
   - Avoid broad architecture rewrites.

## Verification Commands

- `npm.cmd test --workspace=@aif/agent -- implementationRecoveryPack stageErrorHandler coordinator`
- `npm.cmd test --workspace=@aif/data -- workflowTimeline`
- `npm.cmd run format:check`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run build`

## Acceptance Mapping

- Recovery pack recorded on timeout/exhaustion: steps 2 and 4, coordinator test.
- Sanitized summaries and evidence references only: step 2 redaction tests.
- Follow-up work proposed but not executed: step 4 pending split proposal only, coordinator test.
- Same-scope auto-retry not scheduled: existing predecessor behavior preserved plus coordinator test.
- Partial changes, no changes, redaction covered: step 5.

## Out Of Scope Guardrails

- Do not create child tasks directly from the timeout path.
- Do not approve split proposals.
- Do not change GPU, model, runtime capacity, or provider configuration.
- Do not replace independent review/test gates with the recovery pack.
- Do not add live runtime probing or scheduler/log inspection as evidence for this task.
