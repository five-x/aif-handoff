# Design - Generic Artifact Claim Persistence

## Chosen design

Add a generic workflow persistence layer in a future implementation task, beside the existing audit roadmap tables.

The generic layer should model workflow runs, artifacts, artifact attempts, claims, and evidence links in pack-neutral terms. Workflow packs own how their domain evidence is classified, but shared/data code owns durable storage shape, transactional append-only history, indexes, and compatibility adapters.

Existing audit tables remain the compatibility source of truth until a separate migration card explicitly moves audit read/write paths. Do not rename or reinterpret `roadmap_batch_*` and `audit_evidence_events` in place.

## Core vocabulary

Use pack-neutral state and outcome names at the generic layer:

- artifact state: `expected`, `capturing`, `submitted`, `accepted`, `rejected`, `missing`, `blocked`, `inconclusive`, `manual_exception`, `superseded`.
- attempt status: `accepted`, `rework_requested`, `blocked`, `terminal_inconclusive`, `manual_exception`, `not_applicable`.
- claim outcome: `supported`, `refuted`, `inconclusive`, `blocked`, `waived`, `not_evaluated`.
- trust level: `trusted`, `weak`, `untrusted`.

Audit compatibility names remain audit names:

- source classification: `validated_findings_present`, `validated_no_findings`, `inventory_only_invalid`, `insufficient_substantive_evidence`, `source_inconclusive`.
- batch outcome/failure compatibility: `inconclusive_batch_evidence`, `source_inconclusive`, `terminal_inconclusive`, `manual_exception`.

Pack adapters map audit names into generic outcomes for generic readers, but audit validators and synthesis code keep the existing names until the migration task.

## Persistence model

### `workflow_runs`

Represents one workflow-pack execution group, such as an imported roadmap, feature validation run, audit batch, or future docs/tests workflow.

Fields:

- `id`
- `project_id`
- `workflow_pack_id`
- `task_intent`
- `source_kind`
- `source_id`
- `alias`
- `root_task_id`
- `status`
- `execution_policy`
- `created_task_ids_json`
- `summary_json`
- `retention_policy`
- `created_at`
- `updated_at`

Compatibility mapping:

- Audit `roadmap_batches` can later map to `workflow_runs` with `workflow_pack_id = "audit"`, `source_kind = "roadmap"`, and `source_id = roadmap alias or batch id`.
- Do not replace `roadmap_batches` in the first generic implementation unless the migration task explicitly authorizes dual-write/backfill.

### `workflow_artifacts`

Current-state read model for artifacts produced or expected by a workflow run.

Fields:

- `id`
- `run_id`
- `project_id`
- `workflow_pack_id`
- `task_id`
- `role`
- `artifact_kind`
- `artifact_uri`
- `artifact_path`
- `state`
- `outcome`
- `trust_level`
- `content_sha`
- `current_attempt_id`
- `attempt_number`
- `attempt_boundary_id`
- `failure_family`
- `failure_signature`
- `validation_details_json`
- `validated_at`
- `created_at`
- `updated_at`

Rules:

- `workflow_artifacts` is mutable only as a current read model.
- Multiple artifacts per task are allowed.
- A task lookup must use `(task_id, workflow_pack_id, role/artifact_kind)` or `artifact_id`, not a single latest row assumption.
- Artifact URI/path is metadata; claim truth comes from linked claims and evidence.

### `workflow_artifact_attempts`

Append-only attempt history for each artifact.

Fields:

- `id`
- `artifact_id`
- `run_id`
- `project_id`
- `workflow_pack_id`
- `task_id`
- `role`
- `artifact_kind`
- `artifact_uri`
- `artifact_path`
- `attempt_number`
- `attempt_boundary_id`
- `state`
- `outcome`
- `classification`
- `failure_family`
- `failure_signature`
- `content_sha`
- `rework_status`
- `validation_details_json`
- `source_snapshot_id`
- `created_at`

Rules:

- Insert attempts transactionally with current-row updates.
- Attempt numbers are sequential per artifact.
- Attempt boundary ids prevent stale completion evidence from promoting old attempts.
- Failure signatures are built from stable classifier fields, not raw output or timestamps.

### `workflow_claims`

Structured assertions made by or about an artifact attempt.

Fields:

- `id`
- `run_id`
- `artifact_id`
- `attempt_id`
- `project_id`
- `workflow_pack_id`
- `task_id`
- `claim_type`
- `subject_ref`
- `statement`
- `scope_json`
- `outcome`
- `trust_level`
- `classifier`
- `classifier_version`
- `source_snapshot_id`
- `failure_family`
- `details_json`
- `created_at`
- `updated_at`

Rules:

- Claims are append-only for classifier decisions unless a human manual exception creates a new waiver claim.
- Current claim projection is derived by latest claim per `(artifact_id, claim_type, subject_ref, classifier)` or by an explicit current-claim view if needed later.
- A supported claim requires at least one supporting evidence link unless the pack explicitly classifies the claim as policy/manual metadata.
- A `waived` claim requires human actor and justification in `details_json`.

### `workflow_evidence_links`

Links claims, artifacts, and attempts to evidence without requiring all evidence to live in one table immediately.

Fields:

- `id`
- `run_id`
- `claim_id`
- `artifact_id`
- `attempt_id`
- `evidence_source`
- `evidence_unit_id`
- `evidence_ref`
- `relation`
- `evidence_grade`
- `details_json`
- `created_at`

Rules:

- `relation` values: `supports`, `refutes`, `context`, `blocks`, `cites`.
- `evidence_source` values initially include `audit_evidence_events`, `external_ref`, and future `workflow_evidence_units`.
- Links are append-only.
- Links may point to `audit_evidence_events.id` during audit compatibility migration.
- Future generic evidence-unit persistence should be introduced separately if the first artifact/claim slice only needs links.

## Inconclusive and manual outcomes

Generic inconclusive is not the same as invalid.

- `inconclusive` means the classifier or workflow cannot safely support or refute the claim from available evidence.
- `blocked` means required evidence or runtime conditions are unavailable and may be retried.
- `terminal_inconclusive` as an attempt rework status means retry is exhausted or explicitly terminalized, but it is still not a trusted success.
- `manual_exception` is human closure with justification. It may unblock workflow progress but never upgrades a claim to `supported` or an artifact to trusted accepted.

Audit mapping:

- Audit `source_inconclusive` maps to generic claim outcome `inconclusive`, trust `untrusted`, attempt status `terminal_inconclusive` when terminalized.
- Audit `inconclusive_batch_evidence` maps to generic run/artifact outcome `inconclusive`.
- Audit `manual_exception` maps to generic claim outcome `waived`, artifact state `manual_exception`, trust `weak` or `untrusted` according to pack policy.

## Ownership boundaries

`packages/shared` owns:

- generic type vocabulary;
- schema definitions and migration declarations;
- pack-neutral validation helpers for state/outcome compatibility;
- exported interfaces for workflow persistence inputs and summary payloads.

`packages/data` owns:

- repository functions;
- transactional current-row plus append-only attempt writes;
- claim insertion and evidence-link insertion;
- read models and summary queries;
- compatibility readers for audit rows.

`packages/api` owns:

- workflow-pack hook orchestration;
- import/create-event mapping into generic repository calls;
- API response shaping;
- manual exception endpoint behavior and actor/justification validation.

`packages/agent` owns:

- calling repository APIs when completion evidence changes;
- passing classifier details, source snapshot ids, evidence ids, and attempt boundary ids;
- preserving fail-closed behavior for stale attempts.

`packages/web` is out of scope for this design task. Future UI should read API-provided summaries rather than infer trust from artifact paths or prose.

## Indexes

Future migration should add indexes for these hot paths:

- `workflow_runs(project_id, workflow_pack_id, alias, created_at)`
- `workflow_runs(root_task_id)`
- `workflow_artifacts(run_id, role, state)`
- `workflow_artifacts(task_id, workflow_pack_id)`
- `workflow_artifacts(project_id, workflow_pack_id, artifact_kind)`
- `workflow_artifact_attempts(artifact_id, attempt_number)`
- `workflow_artifact_attempts(run_id, role, state)`
- `workflow_artifact_attempts(artifact_id, failure_signature)`
- `workflow_claims(artifact_id, claim_type, subject_ref, created_at)`
- `workflow_claims(run_id, outcome, trust_level)`
- `workflow_evidence_links(claim_id)`
- `workflow_evidence_links(evidence_source, evidence_unit_id)`
- `workflow_evidence_links(artifact_id, attempt_id)`

## Retention expectations

- Runs, attempts, claims, and evidence links are append-only audit/history data and should not be pruned silently.
- Current artifact rows may be compacted or superseded only when the append-only attempt history remains intact.
- Evidence previews remain bounded and redacted. Raw command/file output must not be persisted in generic evidence links.
- Pack-specific retention policy belongs on `workflow_runs.retention_policy` and can later drive archival, not deletion.
- Manual exceptions and waived claims must retain actor, timestamp, and justification.

## Audit compatibility and migration

Preserve all current audit behavior in the first generic implementation:

- `roadmap_batches`, `roadmap_batch_artifacts`, `roadmap_batch_artifact_attempts`, and `audit_evidence_events` remain existing read/write paths.
- Audit synthesis readiness continues to use trusted source classification and terminal weak states, not only generic `state`.
- Existing functions such as `createRoadmapBatchContract()`, `updateRoadmapBatchArtifactState()`, `listRoadmapBatchArtifactAttempts()`, `listValidatedRoadmapReportArtifacts()`, and `listRoadmapReportArtifactsForSynthesis()` remain stable.
- Generic APIs may expose mapped summaries, but must not change audit lifecycle semantics.

Migration should be a separate task with one of two explicit modes:

- adapter-only: read existing audit rows and expose generic summaries without writing generic rows;
- dual-write/backfill: insert generic run/artifact/attempt/claim/link rows alongside audit writes, with tests proving audit behavior is unchanged.

Do not backfill old audit markdown reports as trusted no-findings unless provenance requirements are satisfied.

## Rejected unsafe paths

- Rename audit tables to generic names in place.
- Treat audit failure-family strings as generic failure vocabulary.
- Trust artifact `state === "valid"` without checking pack-owned classification and evidence rules.
- Store raw evidence outputs in generic claim/evidence tables.
- Add UI timeline or API route behavior before the persistence contract is implemented and reviewed.
- Create runtime migrations or source implementation in this design task.

## Pre-PLAN boundary

Before `PLAN PASS`, this task may edit only `research.md`, `design.md`, and `plan.md`. It must not change source code, migrations, runtime persistence, API routes, UI behavior, shared-memory state, worker reports, live services, or downstream runtime configuration.

## Decision candidates

- Generic artifact persistence should be parallel to audit roadmap compatibility tables, not an in-place widening of audit tables.
- Claims are first-class structured rows separate from artifacts.
- Evidence links are append-only and can reference compatibility evidence sources until generic evidence units exist.
- Inconclusive and manual exception outcomes are explicit weak/terminal outcomes, not trusted success states.
