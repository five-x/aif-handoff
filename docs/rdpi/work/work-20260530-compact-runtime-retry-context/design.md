# Design

## Proposed design

Add a shared compact retry-context builder that accepts a task-shaped object and threshold settings. It will decide whether prompt compaction is required based on activity log characters, line count, estimated prompt tokens, and persisted runtime token usage. When any threshold is exceeded, it renders a bounded markdown summary for runtime prompt use.

The summary will include:

- stage and current status: task id, title, current status, blocked-from status, retry count, retry-after/manual-review state
- accepted plan: bounded plan/checklist summary
- changed files: parsed from implementation manifest when present
- verification state: manifest verification evidence and acceptance criteria status summaries
- blockers: blocked reason, unresolved review comments, manual review state, pending checklist items
- next allowed action: derived from the current task status
- redaction metadata: explicit note that raw provider diagnostics are excluded

## Prompt integration

- Chat task context: replace the full `Agent activity log:` block with the compact summary once thresholds are exceeded. Below threshold, preserve existing full redacted activity-log behavior for compatibility.
- Subagent runtime continuation: when the task exceeds thresholds, prepend the compact summary to the subagent prompt and force a fresh runtime session by setting the effective session reuse policy to `never`. This avoids using a provider session that may already carry large/raw historical context. Below threshold, preserve current `resume_if_available` behavior.
- Stored data: do not delete or truncate `agentActivityLog`. Existing task API/UI surfaces may continue reading redacted raw activity as today.

## Configuration

Add environment settings near existing activity-log settings:

- `AIF_RETRY_CONTEXT_ACTIVITY_MAX_CHARS`
- `AIF_RETRY_CONTEXT_ACTIVITY_MAX_LINES`
- `AIF_RETRY_CONTEXT_ACTIVITY_MAX_ESTIMATED_TOKENS`
- `AIF_RETRY_CONTEXT_RUNTIME_USAGE_MAX_TOKENS`

Defaults should be conservative enough to stop pathological growth while leaving ordinary task histories unchanged.

## Test strategy

- Unit tests for threshold decisions, required summary fields, bounded output, and redaction.
- API chat test proving oversized activity log is summarized and raw repeated entries/provider diagnostics are absent from `systemPromptAppend`.
- Agent subagent-query test proving oversized activity history disables resume and prepends compact context.
- Regression test proving below-threshold activity logs retain existing behavior.
