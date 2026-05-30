# Research

## Task framing and lane

- Task ID: `work-20260530-compact-runtime-retry-context`
- Lane: `work`
- RDPI needed: yes
- Intake source: `docs/intake/work/work-20260530-compact-runtime-retry-context.md`
- Goal: when task activity history grows large, retry and continuation prompts must use a compact sanitized task summary instead of replaying raw activity history. Raw activity logs must remain available for audit/UI surfaces allowed to display them.

## Accepted planning sources or local facts

- `AGENTS.md` requires RDPI for non-trivial work and records Node commands: `npm.cmd run build`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run dev`.
- RDPI preflight completed with `STATUS: ready`; flow audit completed with `STATUS: clean`.
- `packages/shared/src/schema.ts` stores raw task activity in `tasks.agent_activity_log`; retry fields such as `retry_after` and `retry_count` sit on the same task row.
- `packages/data/src/index.ts:4972` appends to `agentActivityLog` via `appendTaskActivityLog()`. It redacts incoming lines but does not cap stored log size or create a prompt-specific summary.
- `packages/data/src/index.ts:893` and `packages/data/src/index.ts:923` redact task text for external task responses but preserve full `agentActivityLog` length.
- `packages/agent/src/hooks.ts:148` writes activity entries in sync or batched mode. Batch mode bounds memory queue size but not the persisted task activity log.
- `packages/api/src/routes/chat.ts:229` redacts task context for runtime prompts line by line. `packages/api/src/routes/chat.ts:236` builds task-aware chat context and `packages/api/src/routes/chat.ts:265` currently injects the full redacted `agentActivityLog`.
- `packages/agent/src/subagentQuery.ts:686` builds runtime workflow specs with `resume_if_available` as the default session policy. `packages/agent/src/subagentQuery.ts:1375` passes the prompt, session id, and resume flag to adapters; no activity-size gate exists before run/resume.
- `packages/agent/src/subagents/implementer.ts:249` has implementer-specific prompt compaction, but it compacts the assembled implementer prompt by size, not the raw activity-history context.
- `packages/agent/src/implementationRecoveryPack.ts` already models a bounded sanitized recovery artifact, including changed files, checklist, verification state, remaining acceptance, and explicit exclusion of raw provider diagnostics. This is a useful pattern for a retry-context summary.
- `packages/shared/src/env.ts` already contains activity-log and runtime usage-related settings; new prompt compaction thresholds fit there.

## Same-project memory

- Not consulted before `PLAN PASS`. The RDPI contract forbids shared-memory recall before planning unless explicitly waived.

## Cross-project reusable patterns

- Not consulted before `PLAN PASS`. Local repo facts are sufficient for the plan.

## Rejected or stale memory candidates

- None. No memory candidates were read.

## Key risk hypotheses

- If only chat task context is fixed, subagent continuation can still resume an old provider session without a bounded task summary when activity history indicates retry debt.
- If stored `agentActivityLog` is truncated to protect prompts, audit/UI requirements are violated.
- If summaries reuse raw command output/provider diagnostics, prompt size and secret-redaction risks remain.
- If thresholds are hardcoded only by character count, high runtime usage or line-heavy logs can still bypass compaction.
