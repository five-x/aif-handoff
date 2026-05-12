# Design: Audit Artifact Attempt Lifecycle

## Goal

Add a first-class, auditable attempt lifecycle for roadmap audit artifacts while preserving the existing latest-state artifact row used by current coordinator, API, and synthesis code.

The design should make failed source reports visible as attempts with specific classifications, avoid treating retryable weak reports as trusted valid inputs, and allow terminal inconclusive/manual exception states without weakening fail-closed behavior.

## Data model

Add an append-only `roadmap_batch_artifact_attempts` table.

Required fields:

- `id`
- `artifact_id`
- `batch_id`
- `project_id`
- `roadmap_alias`
- `task_id`
- `role`
- `artifact_path`
- `attempt_number`
- `attempt_boundary_id`
- `state`
- `classification`
- `failure_family`
- `failure_signature`
- `content_sha`
- `rework_status`
- `validation_details_json`
- `source_snapshot_id`
- `created_at`

The existing `roadmap_batch_artifacts` row remains the current-state read model. `updateRoadmapBatchArtifactState()` records a new attempt when the caller supplies validation details or moves the artifact into a meaningful artifact lifecycle state. This keeps call sites small and preserves existing APIs.

Add current-row boundary fields to `roadmap_batch_artifacts`:

- `attempt_number`
- `attempt_boundary_id`
- `failure_signature`

The update of the current artifact row and insertion of the attempt row must be transactional.

## Vocabulary

Add artifact states:

- `source_inconclusive`: a source report attempt produced an artifact but cannot be trusted as valid or precisely invalid.
- `terminal_inconclusive`: a final synthesis or terminalized source path concluded that no trusted audit conclusion can be reached.
- `manual_exception`: a human explicitly closed/excepted the artifact without converting it to trusted valid.

Add failure-family vocabulary for the source lifecycle:

- `invalid_artifact_contract`
- `invalid_artifact_integrity`
- `invalid_inventory_only`
- `insufficient_substantive_evidence`
- `source_inconclusive`
- `manual_exception`

Keep existing compatibility families such as `invalid_artifact_content`, `inconclusive_batch_evidence`, `missing_artifact`, `missing_tool_evidence`, `synthesis_not_ready`, `external_blocker`, `manual_review_required`, and `rework_needed`.

The existing synthesis outcome kind `inconclusive_batch_evidence` remains the compatibility outcome name; the artifact lifecycle state should carry `terminal_inconclusive` for terminal inconclusive synthesis artifacts.

## Classification and mapping

Create one shared mapping layer for completion-evidence results to artifact failure families:

- manifest contract problems -> `invalid_artifact_contract`
- hash/snapshot/branch/non-report integrity problems -> `invalid_artifact_integrity`
- source classification `inventory_only_invalid` -> `invalid_inventory_only`
- source classification `insufficient_substantive_evidence` -> `insufficient_substantive_evidence`
- stale/missing/contradictory source snapshot or evidence refs -> `source_inconclusive`
- synthesis `audit_inconclusive` -> compatibility family `inconclusive_batch_evidence`, with artifact state `terminal_inconclusive`

Source inconclusive is untrusted. It can be a terminal diagnostic output after attempts are exhausted or explicitly terminalized, but it never counts toward trusted source validity.

## Attempt policy

Each attempt receives:

- next sequential `attempt_number` per artifact;
- current `attempt_boundary_id`;
- current `content_sha` when available;
- classification from audit report validation or synthesis outcome details;
- failure family selected by the mapping layer;
- stable `failure_signature`;
- `rework_status`.

Supported `rework_status` values:

- `accepted`
- `rework_requested`
- `manual_review_required`
- `terminal_inconclusive`
- `manual_exception`
- `not_applicable`

Failure signature:

- Compute from stable diagnostic fields, not artifact bytes.
- Minimum fields: artifact role, classification, failure family, stable issue codes, and manifest/evidence issue classes when present.
- Exclude `contentSha`, timestamps, branch names, full messages, and volatile command output.
- Repeated attempts with the same signature but different content SHA must still count as repeated same-failure attempts.

Boundary policy:

- `request_changes` starts a new boundary by incrementing the current artifact attempt number and assigning a new `attempt_boundary_id`.
- Rework execution and completion evidence updates must target the current boundary. A stale update that references an older boundary must record no trusted current-state transition and must not make synthesis ready.
- Existing callers that do not pass a boundary are treated as legacy compatibility updates only when no active rework boundary exists.

Retry and terminalization policy:

- Valid artifacts record `accepted`.
- Recoverable source failures that are still below the task review/attempt limit record `rework_requested`.
- Repeated same-signature attempts can escalate to `manual_review_required` or `terminal_inconclusive` according to classification/failure family.
- Exhausted inconclusive/evidence-insufficient source attempts can terminalize as `source_inconclusive` or allow the batch to produce `terminal_inconclusive`.
- Human manual exception records `manual_exception` and requires an explicit justification.

This policy complements, but does not remove, task-level `maxReviewIterations`.

## Synthesis readiness

New source attempts should make the batch synthesis-ready only when the source report is:

- trusted valid;
- terminalized inconclusive/source-inconclusive/manual-exception;
- external-blocked/manual-review terminal;
- a legacy current row without attempt history, for backward compatibility.

Retryable attempts with `rework_status = rework_requested` should keep synthesis paused.

Synthesis input assembly should use the existing trusted report helper for valid inputs, and treat non-trusted terminal rows as weak artifacts. A `state === "valid"` row without trusted classification must not be read as a validated source report.

## Manual exception path

Add a data/API-level manual exception path that:

- is allowed only for blocked/manual-review audit artifacts;
- requires a non-empty human justification;
- records `manual_exception` in artifact state and attempt history;
- preserves prior validation details and failure reasons;
- does not convert the artifact to `valid` or trusted source input.

No UI work is required for this task unless an existing UI action already fits without scope growth.

## Compatibility

- Existing artifact rows without attempt history remain valid compatibility inputs.
- Existing tests that assert historical `inconclusive_batch_evidence` metadata should keep that outcome in validation details, even if the current artifact state becomes `terminal_inconclusive`.
- Existing task-level rework behavior remains in place; the new attempt lifecycle adds deterministic evidence for why a task is still reworking or terminalized.

## Files expected to change

- `packages/shared/src/schema.ts`
- `packages/shared/src/db.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/auditRoadmapContract.ts`
- `packages/shared/src/auditSourceEvidence.ts`
- `packages/shared/src/auditReportValidator.ts`
- `packages/data/src/index.ts`
- `packages/agent/src/coordinator.ts`
- `packages/agent/src/subagents/implementer.ts`
- `packages/api/src/services/taskEvents.ts`
- Targeted tests in `packages/shared`, `packages/data`, `packages/agent`, and `packages/api`

## Risks

- Schema churn: keep the new table additive and leave existing read model columns intact.
- Compatibility breakage: preserve legacy terminal behavior when rows have no attempts.
- Over-trusting manual exceptions: manual exception closes the artifact state but never counts as valid.
- Duplicate classification logic: keep mapping centralized in shared contract helpers and reuse it from coordinator/API paths.
