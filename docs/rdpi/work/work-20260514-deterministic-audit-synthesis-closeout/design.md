# Design: Deterministic Audit Synthesis Closeout

## Scope

Implement a narrow synthesis-specific closeout path across plan quality, batch artifact readiness, and deterministic synthesis execution.

## Proposed changes

1. Add source report artifact context to plan-quality task input.

- Extend `TaskPlanQualityTask` with optional `sourceReportArtifacts` entries containing artifact path, task id, state, and failure family.
- Keep `@aif/shared` dependency-free by making this optional data supplied by agent-side callers.
- In `packages/agent/src/subagents/planChecker.ts`, populate synthesis context from `listRoadmapReportArtifactsForSynthesis(batchId)`.

2. Generate deterministic synthesis plans with exact report paths.

- Update `buildDeterministicDiagnosticPlan(...)` to use a synthesis-specific fallback when `auditArtifactRole === "synthesis"` and source report artifacts are available.
- The fallback plan must include:
  - `Report artifact: <summary path>`;
  - exact source report artifact paths;
  - source report status/trust accounting;
  - exclusions for source/config/test edits and non-batch artifacts;
  - expected fields: child report, artifact state, trust level, evidence, risk, proposed fix, verification, final outcome;
  - explicit child/source report decision that source reports are required existing inputs and must be preserved in a status table.
- Continue rejecting source audit plans that are marker-only or lack concrete non-report boundaries.

3. Treat terminal weak source artifact states as synthesis inputs.

- Update roadmap synthesis readiness/listing so `invalid` and `missing` source report artifacts can release synthesis only when their latest attempt rework status is terminal (`manual_review_required`, `terminal_inconclusive`, or `manual_exception`).
- Preserve external blockers by not treating `external_blocked` as synthesis-ready.
- Keep valid report counting limited to trusted classifications.

4. Run deterministic synthesis for first-run synthesis implementation.

- In `runImplementer(...)`, invoke the deterministic synthesis builder for synthesis artifacts whenever terminal/valid source artifacts are available, not only when `reworkRequested` is true.
- Keep the existing `synthesis_not_ready` errors from `readAuditSynthesisInputs(...)` as the guard when inputs are unavailable.

5. Close synthesis plan-quality exhaustion deterministically.

- In `packages/agent/src/coordinator.ts`, add synthesis-specific handling for plan-quality retry exhaustion.
- When the task artifact is `role === "synthesis"` and the batch source artifacts are terminal/valid enough for synthesis, avoid the generic `blocked_external` stranding path.
- Persist a corrected registry-derived exact-source synthesis plan, clear stale plan-quality blocker fields and retry counters as appropriate, preserve useful diagnostics in activity log/validation details, and route the card to the implementation stage that writes the deterministic synthesis artifact.
- Do not use coordinator-only artifact terminalization as the closeout path. A synthesis exhaustion recovery is successful only when the deterministic synthesis path creates a non-empty final summary artifact with the child status table and a validated outcome no stronger than the child artifacts support.
- Preserve true external blockers: missing access, provider/runtime failure, unsafe git isolation, or missing required operator input must still remain `blocked_external`.

## Test strategy

- Add shared plan-quality tests for deterministic synthesis fallback and exact source report paths.
- Add plan-checker coverage that a weak wildcard synthesis plan is replaced with an exact source-report plan from batch artifacts.
- Add data coverage that terminal `missing`/`invalid` artifacts release synthesis and appear in `listRoadmapReportArtifactsForSynthesis(...)`, while non-terminal invalid artifacts do not.
- Add coordinator coverage that synthesis plan-quality retry exhaustion persists a corrected exact-source plan, clears stale plan-quality blocker state, routes the card to deterministic synthesis, and does not strand it in `blocked_external` when batch source artifacts are terminal and synthesis-capable.
- Add implementer coverage that first-run synthesis with terminal weak source artifacts writes an inconclusive summary without calling the runtime query.

## Non-goals

- Do not relax source report audit validation.
- Do not mark missing or invalid source reports as trusted valid.
- Do not create child implementation tasks.
- Do not patch live database records or depend on a live `audit-v14` checkout during implementation.
