# Route Recoverable Audit Failures To Rework Or Input - Research

## Task framing and lane

- Task ID: `work-20260514-route-recoverable-audit-failures-to-rework-or-input`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260514-route-recoverable-audit-failures-to-rework-or-input.md`
- RDPI path: `docs/rdpi/work/work-20260514-route-recoverable-audit-failures-to-rework-or-input`
- RDPI needed: yes
- Request: recoverable audit plan/report/content failures should continue through local rework or a concrete operator-input wait, not fall into generic `blocked_external`. True external blockers such as access, runtime/provider limits, missing secrets, permissions, and unsafe branch/worktree isolation must remain `blocked_external`.

## Accepted planning sources or local facts

- `AGENTS.md` and the requested `runtask`/`rdpi` skills require RDPI, independent plan/test/review gates, no implementation before `PLAN PASS`, and no child task execution in this run.
- Required preflight passed: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` reported `STATUS: ready`.
- Required flow audit passed: `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` reported `STATUS: clean`.
- The intake card says recoverable validator issue codes including `missing_scope_coverage`, `speculative_audit_claim`, `invalid_report_manifest`, `missing_report_manifest`, `missing_substantive_evidence`, and related report-contract issues should route to `implementing` with `reworkRequested=true` while budget remains.
- `packages/shared/src/auditRoadmapContract.ts` maps the requested issue-code families to audit failure families that are already recoverable in intent: artifact content, contract, integrity, inventory/evidence, missing artifact/tool evidence, or rework-needed categories.
- `packages/agent/src/coordinator.ts:356` defines `RECOVERABLE_AUDIT_FAILURE_FAMILIES`; `packages/agent/src/coordinator.ts:748` computes completion-evidence failure family, rework budget, repeated signature, and return-to-rework behavior; `packages/agent/src/coordinator.ts:783` returns audit artifacts to `implementing` with `reworkRequested=true`; `packages/agent/src/coordinator.ts:796` terminalizes remaining failures as `blocked_external`.
- `packages/agent/src/coordinator.ts:601` and `packages/agent/src/coordinator.ts:635` preserve two terminal safety guards: same-blocker `stalled_rework_loop` and no-substantive-delta audit rework.
- `packages/agent/src/subagents/implementer.ts:2231` builds a deterministic audit repair manual-review failure snapshot; `packages/agent/src/subagents/implementer.ts:2261` writes `status="blocked_external"`, `manualReviewRequired=true`, and `reworkRequested=false` for strict deterministic repair failure; `packages/agent/src/subagents/implementer.ts:2714` explicitly terminalizes repeated deterministic repair instead of allowing runtime implementation.
- `packages/agent/src/subagents/implementer.ts:2439` already surfaces `blockedReason` to the runtime implementer via `REWORK_BLOCKED_REASON`; `packages/agent/src/subagents/implementer.ts:2778` surfaces `autoReviewState` to the runtime implementer via `BLOCKING_FINDINGS_SNAPSHOT`.
- `packages/api/src/services/taskEvents.ts:49` duplicates the recoverable audit family set; `packages/api/src/services/taskEvents.ts:338` applies similar approve-time audit completion rework/block behavior. This is a drift risk but can be handled narrowly in this task.
- `packages/shared/src/planQuality.ts:456` applies audit plan checks and `packages/shared/src/planQuality.ts:518` raises `missing_audit_decomposition` for broad audit plans without decomposition. The function currently has no roadmap batch/artifact role context, so a source report card inside an existing decomposed batch can be re-blocked for missing broad decomposition.
- `packages/data/src/index.ts:1572` counts active auto-queue pipeline tasks and intentionally ignores terminal manual audit report blocks only when the artifact role is `report` and artifact state is `invalid` or `missing`.
- `packages/agent/src/__tests__/autoQueue.test.ts:139` covers skipping a manual-blocked invalid report artifact. `packages/data/src/__tests__/index.test.ts:2479` covers the lower-level active-count behavior. More terminal audit states and real external blockers need coverage.
- No first-class durable operator question table or task status exists. Existing durable primitives are `blockedReason`, `paused`, comments, `autoReviewStateJson`, task fields, and chat-scoped `tool:question` rendering. A schema migration for a new operator-question primitive would exceed this task unless required by tests; a narrow durable waiting state can use comments plus existing task fields.
- `packages/shared/src/stateMachine.ts:90` handles `retry_from_blocked` but does not clear `paused`.
- `packages/data/src/index.ts:1427` filters coordinator candidates with `paused=false`; an operator-input hold that resumes without clearing `paused` would remain invisible to the coordinator.
- `packages/api/src/services/taskEvents.ts:556` applies human task events and is the narrow place to validate operator-input answer requirements and clear `paused` on retry.
- `packages/data/src/index.ts:1134` exposes `getLatestHumanComment()`, which can be used as the durable answer source before allowing an `operator_input_required:` retry.

## Same-project memory

- `docs/memory/decisions/decision-7e281ad210f9b29c.md`: recoverable audit artifact/content failures map to `implementing` with `reworkRequested=true`, not `blocked_external`. Accepted.
- `docs/memory/decisions/decision-8a60d30eaec0ac60.md`: runtime capability/provider limits, branch/worktree isolation, missing access, and operator-required external intervention remain `blocked_external`. Accepted.
- `docs/memory/decisions/decision-fcf5f9fd370337ae.md`: repeated same blocker reaches `stalled_rework_loop` before max-review exhaustion. Accepted; this is the terminal no-progress guard the current task wants to preserve.
- `docs/memory/tasks/work/work-20260513-terminalize-stalled-audit-rework-loops-delta.md`: previous task outcome is aligned with preserving deterministic stalled-loop terminalization.
- `docs/memory/tasks/work/work-20260513-make-audit-report-rework-deterministic-until-valid-delta.md`: deterministic repair must self-validate before review handoff and `source_inconclusive` remains terminal non-trusted. Partially accepted.

## Cross-project reusable patterns

- None used. The local repo has direct task lifecycle code and same-project decisions that are more specific than cross-project patterns.

## Rejected or stale memory candidates

- `docs/memory/decisions/decision-e21b9f39a245c757.md` says repeated strict validator failures should terminalize instead of falling through to general LLM implementation. This is stale for this task because the new intake card explicitly changes the project goal: deterministic repair failure should fall through to normal runtime implementer rework with structured repair diagnostics until no-progress/same-blocker guards prove local rework is unproductive.

## Working hypotheses

- H1: The smallest safe change is to keep strict validators intact and change only lifecycle routing: validator failures remain failures, but recoverable failure families re-enter `implementing` with precise diagnostics while budget remains.
- H2: Deterministic repair should still run first for known repairable audit report failures, but unresolved strict validation should become a structured rework snapshot for runtime implementation rather than an immediate task-level terminal block.
- H3: Same-failure terminalization should be tied to no-progress evidence, not the first repeated deterministic repair marker. Existing no-substantive-delta and auto-review same-blocker guards should remain the terminal conditions.
- H4: Plan-quality can avoid re-blocking source cards by extending task context with audit artifact role/batch information and treating `role="report"` inside a roadmap batch as already decomposed for `missing_audit_decomposition` only.
- H5: Auto-queue can skip historical/manual terminal audit cards by broadening the ignored terminal artifact states/rework statuses while retaining `blocked_external` for retryable/external blockers and operator holds.
- H6: Operator-input waiting can be made resumable without a new schema by requiring a human comment after the hold was created and clearing `paused` in the `retry_from_blocked` transition only for that answered operator-input prefix.

## Proposed evidence plan

- Package-local tests for shared plan quality and data active-count behavior.
- Agent tests for deterministic repair fallback to runtime rework and coordinator audit rework routing.
- API task-event tests for approve-time recoverable audit routing and preserved true external-blocker behavior if existing coverage needs adjustment.
- Build/typecheck or targeted package tests before final gates.
