# Research: Audit Card Blocker Systemic Fix

## Task

The user asked for a systemic code review and durable fix because all audit cards are blocked again. The goal is to stop fixing only the newest local blocker and close the root class of failures.

## Live Incident Evidence

The current audit-v17 report cards no longer block on the declared-scope preflight after commit `4542b84`, but then enter the runtime path:

- task effective runtime resolves to project default `qwen-local-agent`
- profile points to `http://192.168.88.62:8005/v1`
- model is `Qwen3.6-35B-A3B-MTP-UD-Q5_K_XL.gguf`
- recent blocks were runtime failures:
  - `qwen-local-agent exceeded max tool turns (200)`
  - `Cannot reach the Qwen local endpoint. Check profile baseUrl or QWEN_BASE_URL.`

This means the newest visible block is not the original audit validator. It is caused by audit report cards reaching generic runtime execution.

## Code Findings

### Audit Report Runtime Escape

`packages/agent/src/subagents/implementer.ts` contains `isRetryingTerminalSourceInconclusiveAuditReport()` and a branch that logs:

`Audit report retry bypassed non-repairable declared-scope preflight and will run runtime implementation`

The regression test `lets retried terminal source-inconclusive legacy audit cards reach runtime` locks in this behavior. This is now the primary root cause for the live cards entering Qwen.

### Deterministic Path Exists But Is Too Narrow

The deterministic audit report path can generate/repair report artifacts from scoped evidence and classify the artifact as either trusted valid or `source_inconclusive`. However, `diagnoseDeclaredAuditScopeRepairability()` returns non-repairable immediately for legacy generated cards before considering whether readable scoped source files exist.

That leaves legacy-but-readable audit cards no safe deterministic retry path.

### Terminal Source Inconclusive Becomes Blocked

`terminalizeSourceInconclusiveAuditReport()` persists artifact state `source_inconclusive` and then sets the task to `blocked_external`, even when manual review is false and no independent blocker exists. This causes weak/inconclusive audit source output to look like a task blocker instead of a terminal untrusted audit source result.

This behavior is intentionally documented by the validated 2026-05-15 decision in `docs/rdpi/work/work-20260515-enforce-exact-rework-closure/` and `docs/memory/decisions/decision-f8986d2f14bad906.md`: roadmap source-report inconclusive terminalization was moved from `done` to `blocked_external` to avoid stale green completion for untrusted artifacts. This task does not supersede that decision.

### Retry Counts Are Reset By Automatic Release

`packages/agent/src/taskWatchdog.ts` increments retry counts when moving stale/runtime tasks to `blocked_external`, but `releaseDueBlockedTasks()` resets `retryCount` to `0` when the retry window elapses. This makes transient runtime failures cycle indefinitely and hides the real attempt count.

### API/UI Manual Handoff Is Over-Broad

`packages/api/src/routes/tasks.ts` broadcasts `task:manual_handoff_required` whenever task status is `blocked_external`, even when `manualReviewRequired` is false and the block is a retryable runtime backoff. This collapses external retry state into manual operator state.

`packages/shared/src/stateMachine.ts` allows `retry_from_blocked` for every `blocked_external` task with `blockedFromStatus`, including manual-review-required blocks. The API only protects a narrower operator-input hold.

### Generated Audit Card Contract Still Allows Weak Cards

`packages/shared/src/auditRoadmapContract.ts` accepts broad roots such as `src`, `packages`, and metadata-only roots as concrete. Risk hypotheses are only structurally validated by `risk-*` ids and scope text, so generic owner-area/card-generator language can pass.

## Agent Review Summary

- Runtime/backoff review found infinite retry-count reset, Qwen `maxToolTurns` mapped to retryable external block, and endpoint failures with random backoff.
- Implementer/audit review found the explicit runtime retry escape and recommended a final guard that report artifacts never reach `executeSubagentQuery`.
- Generation/plan review found weak audit-v17 shapes are still generated upstream through broad fallback scopes and generic risk text.
- Status/UI/API review found `blocked_external` is surfaced as manual handoff even when it is only runtime backoff, and manual-review retries are too permissive.

## Conclusion

The durable boundary is:

Audit report artifact tasks must never use the generic model runtime. They must either complete deterministic report generation/repair or persist a terminal non-trusted audit source outcome using the existing blocked-external inconclusive lifecycle. Runtime provider failures should not be able to block audit source cards.
