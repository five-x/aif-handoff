# Design - Surface Audit Trust State And Next Actions

## Chosen design

Add an adapter-only task trust rollup derived from existing audit roadmap artifact rows.

The rollup is generic at the DTO boundary and audit-compatible in the data adapter. It does not change artifact trust semantics, database schema, validator behavior, synthesis readiness rules, or report classification. It makes the current state visible in normal task API responses and primary UI surfaces.

## API and data model

Extend shared browser-safe task DTOs with an optional `artifactTrust` object:

- `taskStatus`: existing task status copied for compact display.
- `artifactRole`: current artifact role, such as `report` or `synthesis`.
- `artifactState`: original compatibility state, such as `valid`, `source_inconclusive`, `invalid`, `missing`, `external_blocked`, `synthesis_not_ready`, or `terminal_inconclusive`.
- `artifactTrustLevel`: `trusted`, `weak`, or `untrusted`.
- `claimOutcome`: `supported`, `refuted`, `inconclusive`, `blocked`, `waived`, or `not_evaluated`.
- `failureFamily`: persisted artifact or batch failure family.
- `reasonCodes`: stable, compact operator reason codes derived from state, failure family, latest attempt status/classification, and synthesis readiness.
- `latestAttemptOutcome`: latest attempt rework status or mapped claim outcome.
- `trustedSynthesisInput`: true only when an artifact can be used as trusted synthesis input. Terminal inconclusive/manual-exception artifacts may be synthesis-accountable, but remain untrusted.
- `synthesisReady`: whether the batch source artifacts have reached synthesis-ready or terminal-accountable states.
- `nextAction`: a stable code for UI action guidance, for example `none`, `retry_source_rework`, `retry_synthesis`, `provide_operator_input`, `inspect_untrusted_source`, or `wait_for_source_artifacts`.
- `nextActionLabel`: plain-language label for display.
- `summary`: one-line operator explanation, for example `Done with untrusted source artifact`.
- `artifactPath`, `batchId`, `roadmapAlias`, `attemptNumber`, `failureSignature`, `branchName`, and `worktreePath` for recovery without database access.
- `batchCounts`: child/source artifact counts with buckets for `trustedValid`, `inconclusive`, `rejected`, `missing`, `externalBlocked`, `synthesisPending`, and `total`.

The field name stays generic (`artifactTrust`) so future workflow packs can reuse the surface. Audit-specific original states remain values, not field names.

## Data adapter

Implement the adapter in `packages/data/src/index.ts` beside the existing workflow timeline compatibility adapter.

Rules:

- Reuse existing trust predicates instead of reimplementing trust in API or UI.
- `state === "valid"` is trusted for synthesis only when the existing trusted source classification rules accept it for report artifacts; synthesis artifacts can be trusted when valid.
- `source_inconclusive`, `terminal_inconclusive`, `invalid`, `missing`, and `external_blocked` are untrusted.
- `manual_exception` is weak or untrusted display trust, never trusted.
- `expected` and `synthesis_not_ready` are weak or untrusted pending states, not success.
- Batch counts should count source report artifacts, not the synthesis artifact, for child readiness buckets. Include synthesis pending separately when the synthesis artifact is waiting.
- Keep `RoadmapBatchSummary` compatible by adding fields rather than removing or renaming current `counts`.

Expose a single exported function such as `buildTaskArtifactTrustRollup(taskId)` and use it from route response shaping. Normal task rows without audit artifacts return `artifactTrust: null` or omit the field according to the final shared type.

## API routing

Update `toTaskRouteResponse()` in `packages/api/src/routes/tasks.ts` to attach the rollup to every task list/detail response. This keeps existing endpoints stable:

- `GET /tasks`
- `GET /tasks/:id`
- responses after task create/update/event handling

WebSocket payloads can remain minimal if existing clients invalidate/refetch task queries on task updates. If tests show stale display after artifact events, extend `toTaskBroadcastPayload()` to include `artifactTrust` or trigger task-query invalidation.

## UI rendering

Add a small generic helper module in the web package for artifact trust presentation:

- derive badge tone from `artifactTrust.artifactTrustLevel` and `artifactTrust.trustedSynthesisInput`;
- render concise status text without requiring operators to know raw states;
- expose next action text from API-provided `nextActionLabel`, not client-side business rules.

Primary surfaces:

- `TaskCard`: show a visible badge/notice near the status area for audit roadmap tasks, especially `done` with untrusted artifacts. Example: `Done / untrusted artifact`.
- `TaskListTable`: add a compact trust/status indicator in the status cell or title cell without adding a wide new table dependency.
- `TaskDetailHeader`: show the artifact trust badge, summary, batch counts, and next action guidance above normal action buttons.
- `WorkflowTimelinePanel`: show original state, trust level, failure family/reason codes, attempts, evidence, and artifact path in one place. Reuse existing generic rows.

Do not hide strict validation failures behind green badges. The normal task status can remain `done`, but the adjacent artifact trust surface must make untrusted states visible on the same row/card.

## Contextual next actions

Map next actions conservatively:

- Trusted valid source or synthesis artifact: `none`.
- Recoverable source report states such as `invalid` or `missing` with local failure families: `retry_source_rework`.
- Terminal `source_inconclusive` or `terminal_inconclusive`: `inspect_untrusted_source`, not blind retry.
- `external_blocked` or operator-input failure families: `provide_operator_input`.
- Source artifacts not terminal/accountable and synthesis not ready: `wait_for_source_artifacts`.
- Synthesis artifact blocked by source readiness: `wait_for_source_artifacts`.
- Synthesis artifact blocked by plan quality: `retry_synthesis`.
- Synthesis artifact missing after sources are ready: `retry_synthesis`.
- External blocker family: `provide_operator_input`.

The labels should be plain language, but the codes remain stable for tests and future workflow packs.

## Scope boundaries

In scope:

- Shared DTO type additions.
- Data adapter and rollup derivation.
- API response shape additions.
- Board/list/detail/timeline rendering.
- Focused API/data/web tests.

Out of scope:

- Database schema changes.
- Generic artifact persistence tables.
- New audit trust semantics.
- New runtime probing, report parsing, or backfill of old reports.
- Executing or repairing live `audit-v14` cards.
- Creating or running child implementation tasks.

## Risk controls

- Keep the data adapter as the single trust source; API and UI only display returned values.
- Preserve old timeline endpoint fields and add metadata/labels compatibly.
- Make untrusted states visually distinct but avoid treating `done` as an error status in the state machine.
- Test each required state using persisted roadmap batch artifact rows rather than mocked UI-only objects where practical.
