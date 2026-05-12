# Research: Model Audit Artifact Attempts And Inconclusive Outcomes

## Task framing and lane

- Task ID: `work-20260512-audit-artifact-lifecycle`
- Lane: `work`
- Intake source: `docs/intake/work/work-20260512-audit-artifact-lifecycle.md`
- RDPI needed: yes
- Request: model audit artifact attempts and inconclusive outcomes so repeated weak source reports do not loop through the same generic task-level review cycle or silently count as valid artifacts.

The implementation is diagnostic/lifecycle infrastructure for audit roadmap artifacts. It must not create or execute a derived child task.

## Accepted planning sources or local facts

- Repository preflight: `codex-ensure-rdpi.py` returned `STATUS: ready`.
- Flow audit: `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- `packages/shared/src/schema.ts:179` stores one current `roadmap_batch_artifacts` row per task/artifact, with `state`, `failureFamily`, `validationDetailsJson`, `contentSha`, and `validatedAt`, but no attempt-history table.
- `packages/shared/src/auditRoadmapContract.ts:5` currently exposes artifact states only for `expected`, `valid`, `invalid`, `missing`, `synthesis_not_ready`, and `external_blocked`.
- `packages/data/src/index.ts:2887`-`2944` already keeps `validArtifactCount` and `listValidatedRoadmapReportArtifacts()` trust-aware by checking source classification details, but the current artifact row still stores only a generic current state.
- `packages/data/src/index.ts:2961`-`2964` marks synthesis ready when all source artifacts are in coarse terminal states. It does not distinguish retryable failures from exhausted or terminalized attempts.
- `packages/data/src/index.ts:3167`-`3199` overwrites artifact state on every `updateRoadmapBatchArtifactState()` call, so prior attempt SHA/classification/failure details are lost except in external logs.
- `packages/agent/src/coordinator.ts:586`-`610` escalates audit failures by task `reviewIterationCount` and `maxReviewIterations`, not artifact attempts.
- `packages/agent/src/coordinator.ts:613`-`638` and `packages/api/src/services/taskEvents.ts:231`-`245` write invalid/missing/current artifact state from completion evidence.
- `packages/api/src/services/taskEvents.ts:178`-`203` records a human `request_changes` rework boundary in `validationDetailsJson`, but it does not create a new artifact attempt record.
- `packages/agent/src/subagents/implementer.ts:441`-`478` builds synthesis input from every terminal source report and currently treats `state === "valid"` as the only validation filter in that function.
- `docs/kb/audit-evidence-provenance-contract.md:170`-`180` defines `source_inconclusive` and `terminal_inconclusive` target vocabulary.
- `docs/kb/audit-evidence-provenance-contract.md:182`-`210` defines the target source report lifecycle and says rework starts a new attempt with a new evidence/snapshot binding.
- `docs/kb/audit-evidence-provenance-contract.md:214`-`230` defines target batch rules: source rework blocks trusted final conclusions; terminal inconclusive is fail-closed, not a no-findings pass.
- `docs/rdpi/work/work-20260512-align-source-report-classification/result.md` records that inventory-only no-findings source reports now fail source validation and that data-layer valid counts are classification-based.
- `docs/rdpi/work/work-20260512-structured-audit-report-manifest/result.md` records manifest/hash/snapshot binding and persistence of artifact SHA in `roadmap_batch_artifacts.content_sha`.
- `docs/rdpi/work/work-20260512-audit-evidence-ledger/result.md` records runtime evidence units and manifest evidence-ref validation, which makes source inconclusive/integrity states meaningful.

## Same-project memory

Shared-memory MCP recall was not used before `PLAN PASS` because this is an implementation task and the repository RDPI boundary forbids shared-memory recall before plan approval unless explicitly waived. Local project docs and RDPI artifacts were sufficient.

## Cross-project reusable patterns

No cross-project patterns were used. The implementation should follow existing AIF audit-roadmap, manifest, ledger, and completion-evidence patterns.

## Rejected or stale memory candidates

- Older compatibility notes that say current runtime may keep only `valid`, `invalid`, `missing`, and `inconclusive_batch_evidence` are accepted as historical context but stale for this task's migration scope.
- Synthesis readiness based solely on generic terminal state is rejected for new attempts because it cannot tell a retryable weak source report from an exhausted or explicitly terminalized artifact.

## Hypotheses

- H1: A small append-only `roadmap_batch_artifact_attempts` table is the cleanest migration path because it preserves current artifact rows as the latest-state read model while making attempts reviewable and queryable.
- H2: New first-class artifact states should be additive and compatibility-safe: `source_inconclusive`, `terminal_inconclusive`, and `manual_exception`, while preserving existing state names.
- H3: Attempt records should capture `attemptNumber`, `contentSha`, classification outcome, failure family, timestamp, validation details, and rework status.
- H4: Retryable invalid/inconclusive source attempts should not make a batch synthesis-ready. Synthesis should become ready only when source reports are trusted valid, legacy/terminal current rows, explicitly terminalized inconclusive, external-blocked, or manual-exception terminal.
- H5: Repeated same-failure attempts need deterministic failure signatures independent of `contentSha`; content SHA must be recorded for provenance but cannot be part of the retry-loop signature because weak reports may be rewritten while preserving the same failure class.
- H6: Manual exception handling must be explicit and auditable: no artifact should be converted to trusted valid by human override, and prior classifier failure details must remain in the attempt history.
- H7: Rework needs an explicit attempt boundary or generation marker. Without it, stale completion evidence from an older run can overwrite a newer rework boundary or mark a reopened artifact valid.

## Open questions

- Whether the UI should expose a manual exception button is out of scope unless the API already has a suitable event. A data/API path with explicit justification is enough for this task if no UI route exists.
- Legacy rows without attempt history should continue to behave as compatibility terminal rows to avoid breaking existing imported batches.
