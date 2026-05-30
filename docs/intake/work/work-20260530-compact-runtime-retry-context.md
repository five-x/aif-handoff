# Compact Runtime Retry Context

- Task ID: work-20260530-compact-runtime-retry-context
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-30
- Source: operator request after a blocked `zai-mi.com` child accumulated thousands of activity-log lines and millions of tokens.
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260530-compact-runtime-retry-context

## Request

Separate raw activity history from model retry/continuation context.

Retries and continuations must receive a compact, sanitized task summary instead of the full raw activity log once the activity history crosses a size threshold. The raw log should remain available for audit, but it must not be blindly fed back into model prompts.

## Problem

The blocked `zai-mi.com` child accumulated a large activity log and very high token usage. Feeding full historical logs back into model prompts can degrade reasoning, amplify earlier mistakes, and make every retry more expensive.

## In Scope

- Compact retry-context summary generation.
- Thresholds for activity-log length, token estimate, and runtime usage.
- Prompt assembly changes so raw logs are replaced by summaries for retry/continuation.
- Audit preservation of raw logs outside model prompt context.
- Tests proving summary use and redaction.

## Out Of Scope

- Deleting historical activity logs.
- Changing immutable evidence-ledger semantics.
- Provider-specific model tuning.

## Acceptance Criteria

- Once activity history exceeds the configured threshold, the next model prompt uses a compact summary instead of raw log replay.
- The summary includes stage, current status, accepted plan, changed files, verification state, blockers, and next allowed action.
- Raw provider diagnostics, secrets, and oversized command output are not included in continuation prompts.
- Raw logs remain available to audited storage and UI surfaces that are allowed to display them.
- Tests cover threshold behavior, summary fields, and redaction.

## Done When

- Large activity histories no longer cause unbounded prompt growth on retry or continuation.
- Continuation prompts are bounded, stage-aware, and sanitized.
- `npm run format:check`, `npm run lint`, `npm run test`, and `npm run build` pass or any pre-existing unrelated failures are documented.
