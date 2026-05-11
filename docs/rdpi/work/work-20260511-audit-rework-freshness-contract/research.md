# Research - Audit Rework Freshness Contract

## Task framing and lane

- Task ID: `work-20260511-audit-rework-freshness-contract`
- Lane: `work`
- RDPI needed: yes
- Request: fix audit rework state so `request_changes` cannot be bypassed by stale completion evidence.
- Scope: `aif-handoff` platform task/review/roadmap-artifact flow. Do not change canary-project files or run a child task.

## Accepted planning sources or local facts

- RDPI preflight returned `STATUS: ready`.
- `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- Intake card: `docs/intake/work/work-20260511-audit-rework-freshness-contract.md`.
- Parent analysis: `docs/rdpi/work/work-20260511-audit-quality-system-analysis/*`.
- `packages/shared/src/stateMachine.ts` handles `request_changes` as `done -> implementing` and sets `reworkRequested=true`.
- `packages/api/src/services/taskEvents.ts` applies the human event patch directly after completion evidence checks. It does not currently invalidate a roadmap report artifact when the event is `request_changes`.
- `packages/agent/src/coordinator.ts` has `reworkCompletionEvidenceAlreadySatisfied()`. For `reworkRequested` report artifacts, it evaluates completion evidence and returns `result.ok`.
- `packages/agent/src/coordinator.ts` uses that helper before the implementer stage and can move the task straight back to `review` with the activity message "skipping implementer and returning to review."
- `packages/data/src/index.ts` already has `updateRoadmapBatchArtifactState()` with persisted `validationDetails`, `contentSha`, and `validatedAt` fields.
- `packages/shared/src/schema.ts` confirms roadmap artifact rows persist `state`, `failureFamily`, `validationDetailsJson`, `contentSha`, and `validatedAt`.
- `packages/data/src/index.ts` treats report artifact states `valid`, `invalid`, `missing`, and `external_blocked` as terminal for synthesis readiness. A fresh rework request should not make a report look terminal while rework is active.
- `packages/agent/src/subagents/implementer.ts` already reads the latest rework comment for rework prompts, but the coordinator can skip before that prompt is used.
- Existing tests:
  - `packages/api/src/__tests__/tasks.test.ts` verifies generic `request_changes` sets implementing/rework flags.
  - `packages/agent/src/__tests__/coordinator.test.ts` verifies synthesis rework runs even when completion evidence is satisfied, but not report-artifact manual rework freshness.

## Same-project memory

- Shared memory was not queried before `PLAN PASS` because the RDPI contract forbids shared-memory recall before the planning gate unless explicitly waived.
- Local code and parent RDPI artifacts are sufficient.

## Cross-project reusable patterns

- None accepted. This is a local platform state-machine/roadmap-artifact contract.

## Rejected or stale memory candidates

- No memory candidates were queried.

## Failure model

1. Manual QA requests changes on a done audit report task.
2. Task status becomes `implementing` and `reworkRequested=true`.
3. The roadmap report artifact can remain `valid`, so batch state still treats it as validated.
4. The coordinator picks up the implementing task and runs `reworkCompletionEvidenceAlreadySatisfied()`.
5. Old report evidence still passes, so the implementer is skipped and the task returns unchanged to `review`.

## Implementation hypotheses

- On manual `request_changes` for a roadmap report artifact, update the artifact to a non-valid, non-terminal state. `expected` plus `failureFamily=rework_needed` and validation details is safer than `invalid` because `invalid` is terminal for synthesis readiness.
- Record a rework boundary in artifact validation details using the event timestamp and latest human comment metadata. This is reviewable evidence that prior validation is stale.
- Remove or disable the coordinator's stale report-artifact skip. Synthesis already returns false from that helper; normal non-report tasks do not need it.
- Preserve normal auto-review convergence: auto-review rework paths can continue to use existing `returnAuditTaskToRework()` and completion-evidence repair routing.
- Add regression tests for the manual observed path rather than broad refactors.

## Acceptance checks

- API: `request_changes` on a done audit report task with a valid artifact moves the task to `implementing`, sets `reworkRequested=true`, and changes artifact state away from `valid` with actionable `rework_needed` details.
- Coordinator: an implementing audit report task with `reworkRequested=true` and otherwise valid old completion evidence still calls the implementer and does not log the skip message.
- Coordinator: after rework flow completes through reviewer acceptance, `reworkRequested` clears normally.
- Existing `blocked_external` behavior remains unchanged for true external/operator blockers.
