# Research - 11_observability_and_metrics

## Task framing and lane

- Task ID: `11_observability_and_metrics`.
- Lane: `work`.
- Source task: `C:/Users/apron/Desktop/aif_stabilization_tz_pack/11_observability_and_metrics.md`.
- Goal: add diagnostic counters/events and readable activity log entries for guardrails without creating unnecessary storage.
- Required event/counter names:
  - `agent_tool_loop_blocked_total`
  - `agent_checklist_incomplete_block_total`
  - `agent_invalid_manifest_rejected_total`
  - `agent_same_failure_fail_closed_total`
  - `agent_split_required_decision_total`
  - `agent_prompt_contract_missing_total`
  - `agent_write_path_denied_total`
  - `agent_runtime_recovery_no_delta_total`
  - `agent_operator_verified_completion_accepted_total`
  - `agent_operator_verified_completion_rejected_total`

## Accepted planning sources or local facts

- RDPI preflight: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- Repo instructions: `AGENTS.md` says this is a Node/TypeScript repository; build/test/lint commands are `npm.cmd run build`, `npm.cmd test`, and `npm.cmd run lint`.
- Existing dirty worktree entries are unrelated memory/bootstrap artifacts; this task should leave them untouched.
- Requirements observability already uses structured Pino logs as the metrics carrier: `docs/configuration.md` records `metricKey`, `metricValue: 1`, `event`, and redaction-safe dimensions.
- `packages/shared/src/requirementsObservability.ts` provides the local pattern for stable event names and sorted, redaction-safe dimensions.
- `packages/data/src/index.ts` appends task activity through `appendTaskActivityLog`, which calls `redactProviderText` before persisting.
- `packages/data/src/index.ts` records task-stage artifact attempts with `recordTaskStageArtifactAttempt`; those attempts already feed workflow timeline/artifact readback.
- `packages/data/src/index.ts` also logs a structured requirements metric whenever a task-stage artifact attempt is persisted.
- `usage_events` exists, but local facts show it is scoped to LLM token/cost usage, not arbitrary guardrail counters.
- Generic workflow timeline readback projects `task_stage_artifacts` and `task_stage_artifact_attempts` into artifacts, attempts, claims, evidence, and timeline events.
- API readback exists at `/tasks/:id/timeline`, `/tasks/:id/artifact-trust`, and `/tasks/:id/evidence`.
- Tool-loop guard: qwen emits `repeated_tool_loop_blocked`; `packages/agent/src/subagentQuery.ts` already converts it to a readable activity line.
- Write-path guard: qwen tool policy errors use `write_path_not_allowed` with target-path metadata in `packages/runtime/src/adapters/qwenLocalAgent/tools.ts` and promotion logic in `api.ts`.
- Checklist hard stop: implementer marks incomplete checklist failures with `implementation_checklist_incomplete`.
- Invalid manifest rejection: implementer and coordinator paths already persist invalid-manifest state and blocked reasons.
- Same-failure fail-closed: coordinator and API completion-evidence paths append `same_failure_fingerprint_fail_closed` activity lines and persist `failureFingerprint` metadata.
- Split-required: planner creates or reuses pending split proposals and blocks the parent with `split_required`.
- Prompt/result contract missing: `packages/shared/src/aifResultContract.ts` defines and detects `missing_aif_result_contract`.
- Runtime recovery no-delta: coordinator records `runtime_recovery_no_delta_fail_closed` and task-stage artifact attempts.
- Operator verified completion: API service records an accepted task-stage artifact attempt and appends accepted/rejected activity lines.
- Explorer subagent completed read-only mapping and confirmed the exact TZ counter names are not implemented yet; no single existing guardrail envelope carries all required fields.

## Same-project memory

- Not queried before `PLAN PASS` because the RDPI boundary forbids shared-memory recall during planning unless explicitly waived.
- Local `docs/memory/**` files exist and may be candidates for post-plan validation only if implementation needs prior decision context.

## Cross-project reusable patterns

- Use the local requirements-observability pattern for structured metrics instead of adding new persistent counter storage.
- Use existing append-only task activity for readable operator diagnostics.
- Use existing task-stage artifact attempts for guard events that are evidence or attempt related, so API timeline/trust readback remains sourced from existing mechanisms.

## Rejected or stale memory candidates

- None evaluated. No memory was queried.
- `usage_events` is rejected as the primary guardrail event store because local code and docs define it around runtime usage, tokens, cost, and usage outcomes.
- A new database table is rejected for the initial design because existing logs, activity, and task-stage attempts satisfy the storage instruction with less migration risk.

## Open questions

- Resolved in design revision: not every guard path can supply `runtimeProfileId`, `runtimeId`, and `providerId`; the event shape keeps these keys present with `null` values when unavailable.
- Resolved in design revision: runtime adapters may emit neutral runtime events, but the authoritative counter/activity emission point is the owner that has task/project context. This prevents duplicate counter increments.
- Resolved in design revision: `agent_split_required_decision_total` covers the initial planner split-required decision only, not split proposal approval/rejection lifecycle events.

## Hypotheses

- A shared `guardrailObservability` helper in `@aif/shared` can standardize counter names, action values, reason codes, dimensions, and readable activity formatting.
- Emitting structured Pino logs with `metricKey` equal to the requested counter name and `metricValue: 1` will make counters available for diagnostics in the same way requirements metrics are available.
- Recording task-stage artifact attempts with a `guardrail_event` kind for evidence-related guard events will make them visible in existing timeline/artifact readback without schema changes.
- Focused tests can verify the five required guard categories and redaction without running live services.
