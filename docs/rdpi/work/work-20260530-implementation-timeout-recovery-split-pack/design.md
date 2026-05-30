# Design

## Behavior Contract

Implementation timeout or runtime exhaustion should still fail closed:

- task status: `blocked_external`
- `blockedFromStatus`: `implementing`
- `blockedReason`: starts with `implementation_runtime_exhausted_requires_split:`
- `retryAfter`: `null`
- `retryCount`: unchanged
- no context/runtime fallback retry is scheduled

New behavior:

- Record one current task stage artifact with `stage = "implementation"`, `kind = "recovery_pack"`, `state = "blocked"`, `trustLevel = "weak"`, and a bounded markdown body.
- Store the structured recovery pack in stage artifact metadata under `recoveryPack`.
- Create or reuse one pending split proposal with source kind `implementation_recovery`; do not approve it and do not create child task rows.
- Add artifact and proposal references to the blocked task state and activity log.

## Recovery Pack Schema

Define an agent-owned versioned pack shape:

- `version`: `1`
- `kind`: `implementation_timeout_recovery_pack`
- `generatedAt`: ISO timestamp
- `task`: task id, project id, sanitized title, task intent, status before block, `blockedFromStatus`, branch name, worktree path
- `exhaustion`: reason family, sanitized runtime category/status, retry count, retry-after source, and raw diagnostics exclusion marker
- `changedFiles`: git snapshot source, baseline head, digest, bounded status summaries, `hasChanges`, truncation flag
- `checklist`: completed, pending, and blocked-by-timeout checklist items parsed from the task plan
- `verification`: implementation-manifest verification entries when present, otherwise `not_recorded`; include only command/status/sha/short preview after redaction
- `remainingAcceptance`: pending checklist or acceptance criteria summaries that still need follow-up
- `proposedChildren`: bounded `TaskSplitProposedChild` entries suitable for a pending split proposal
- `redaction`: `applied: true`, `rawProviderDiagnosticsIncluded: false`

All user-visible strings pass through `redactProviderText()` and length caps. The pack stores no raw error message, raw provider metadata object, raw diff, stdout, stderr, stack trace, or provider diagnostics.

## Timeout Classification

Extend implementation exhaustion recognition to include:

- existing implementer `RuntimeExecutionError` category `timeout`
- existing structured statuses such as `max_tool_turns_exhausted` and runtime budget exhaustion
- coordinator wrapper timeout errors matching `Stage implementer timed out after ...`

The wrapper timeout should be reported as sanitized category/status such as `category=timeout; status=stage_timeout`.

Non-implementation stage timeouts keep their existing behavior unless separately authorized.

## Persistence Flow

Inside the existing coordinator pre-fallback exhaustion branch:

1. Re-read the latest task row.
2. Build the recovery pack from the task row, execution root, stage/error classification, git snapshot, plan text, and optional implementation manifest JSON.
3. Persist it with `recordTaskStageArtifactAttempt()`.
4. Create or reuse a pending split proposal through `createOrReusePendingTaskSplitProposal()`:
   - `sourceKind = "implementation_recovery"`
   - `sourceRef = "implementation-recovery-pack:<taskId>"`
   - `sourceFingerprint = sha256(stable sanitized recovery proposal input)`
   - `roadmapAlias = "implementation-recovery:<taskId>"`
   - `taskIntent = task.taskIntent`
   - `parentTaskId = task.parentTaskId ?? task.id` only when safe for the existing hierarchy contract; otherwise keep the source task id in `sourceRef`/summary and leave parent null
   - `summary = "Implementation recovery split proposed for <taskId> after runtime exhaustion."`
   - `proposedChildren = pack.proposedChildren`
5. Handle split proposal idempotency:
   - `created` and `reused`: store that proposal id in the recovery pack metadata and blocked task reference.
   - `conflict`: do not overwrite or approve the existing proposal, do not create children, and still fail closed. Persist the recovery pack with `splitProposalStatus = "conflict"` and include a sanitized activity line telling the operator that an existing pending recovery proposal has different source content.
6. Update the task to `blocked_external` with the original fail-closed fields plus sanitized references:
   - `recoveryPackArtifact=<artifactId>`
   - `recoveryPackAttempt=<attemptId>`
   - `splitProposal=<proposalId>` when created/reused/conflicting proposal id is available
   - `splitProposalStatus=<created|reused|conflict|failed>`
7. Append a compact activity line and broadcast timeline refresh.

If pack/proposal persistence fails, the coordinator should still fail closed and include a sanitized `recovery_pack_recording_failed` activity line. The task must not fall through to automatic fallback.

The source fingerprint must be deterministic across identical recovery inputs and must not include volatile fields such as generated timestamp, stage artifact attempt id, random proposal id, raw error text, or raw provider metadata. It should include stable sanitized task identity, changed-file digest/summary, pending checklist/acceptance summaries, verification statuses, and proposed child card contents.

## Proposed Child Heuristic

Use deterministic bounded recommendations:

- If pending checklist items exist, create one child per first three pending items.
- If no pending checklist items exist but there are changed files, create a continuation child focused on validating and finishing the partial change set.
- If no changes and no pending checklist items are known, create a narrow replan/split child that asks the operator to decompose the implementation before retry.

Each child description includes:

- source task id
- recovery pack reference
- changed-file digest if available
- remaining work summary
- explicit instruction not to rely on raw provider diagnostics
- focused verification requirement

Children are recommendations only until a later approval path creates backlog tasks.

## Redaction Boundaries

Apply redaction to:

- task title, branch, worktree path, blocked reason, runtime category/status
- changed-file status entries
- checklist and acceptance text
- verification command/output previews
- proposed child titles/descriptions/tags
- markdown and metadata pack copies

Do not store:

- raw provider metadata
- raw error messages
- raw stdout/stderr
- raw diffs
- stack traces
- API keys, bearer tokens, OAuth tokens, secret-like key/value pairs, emails, or URLs in client-visible text

## Compatibility

- Reuse task stage artifacts instead of adding a recovery-pack table.
- Add `implementation_recovery` to `TaskSplitProposalSourceKind`; the SQLite column is text, so this is a type/API contract update, not a migration.
- Use the existing split proposal helper's idempotency semantics. Reusing a matching pending proposal is safe; conflicting pending proposals are surfaced to the operator and never auto-resolved.
- Keep existing roadmap split proposal behavior unchanged.
- Keep existing predecessor tests for no same-scope retry and fallback suppression.
- Do not approve proposals, create task rows, wake the agent, or execute child tasks in this path.
