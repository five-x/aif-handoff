# Plan

## Scope

Implement compact, sanitized retry/continuation context for large task activity histories without deleting or truncating raw task activity storage.

## Steps

- [ ] Add shared retry-context utilities and threshold config.
- [ ] Export the utilities from `@aif/shared`.
- [ ] Update chat task context assembly to summarize over-threshold activity logs.
- [ ] Update subagent runtime prompt preparation to summarize over-threshold activity logs and disable provider session resume for that attempt.
- [ ] Add focused tests for threshold behavior, summary fields, redaction, chat prompt replacement, subagent resume suppression, and below-threshold compatibility.
- [ ] Run `npm.cmd run format:check`, `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run build`, documenting any unrelated pre-existing failures.

## Acceptance mapping

- Large histories use compact summaries: chat and subagent prompt assembly both call the shared threshold decision.
- Summary fields: builder renders stage/status, accepted plan, changed files, verification state, blockers, and next allowed action.
- No raw diagnostics/secrets/oversized output in prompts: builder redacts via shared provider redaction and bounds every field.
- Raw logs remain auditable: `agentActivityLog` storage and task response behavior are not truncated by this change.
- Tests cover threshold, field content, redaction, and compatibility.

## Gate plan

- Require independent `PLAN PASS` before implementation.
- After implementation, require independent `TEST PASS`.
- After test pass, require independent `REVIEW PASS`.
