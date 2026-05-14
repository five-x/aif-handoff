# Research - Design Generic Artifact Claim Persistence

## Task framing and lane

- Task: `work-20260513-design-generic-artifact-claim-persistence`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260513-design-generic-artifact-claim-persistence.md`.
- Requested outcome: design generic artifact and claim persistence for workflow packs, including artifacts, attempts, claims, evidence links, inconclusive outcomes, ownership, indexes, retention, compatibility, and migration boundaries.
- Explicit boundary: this run must produce an implementation-ready plan without changing runtime persistence, database migrations, API timeline surfaces, or UI behavior.
- Required dependency state is satisfied locally: `work-20260513-implement-workflow-pack-registry-feature-canary` and `work-20260513-move-audit-roadmap-hooks-behind-pack` are marked done in `docs/intake/work_status.json`.
- Preflight was clean: `codex-ensure-rdpi.py` returned `STATUS: ready`; `codex-flow-audit.py --repo .` returned `STATUS: clean`.

## Accepted planning sources or local facts

- The selected intake card is immutable task intent for this run.
- The parent workflow-pack plan intentionally deferred generic artifact and claim persistence until after the audit pack and feature canary passed (`docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`).
- The feature canary implementation completed without database schema, generic artifact persistence, scheduler behavior, or UI/API timeline work (`docs/rdpi/work/work-20260513-implement-workflow-pack-registry-feature-canary/result.md`).
- The audit roadmap hook migration completed and kept roadmap behavior behind an API-local workflow-pack extension, while still excluding generic artifact persistence and UI/API timeline work (`docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/result.md`).
- `packages/shared/src/workflowPacks.ts` defines the current `WorkflowPack` registry. It owns generated-task validation only and currently registers `general`, `audit`, `feature`, `fix`, `spike`, `docs`, and `tests`.
- `docs/kb/workflow-contract-pack-registry.md` states that artifact, completion, review, and memory behavior remain outside the registry until separately authorized.
- `packages/api/src/services/roadmapWorkflowPacks.ts` provides the current API-local hook resolver keyed by shared workflow-pack identity. This is the precedent for dependency-heavy pack behavior outside `@aif/shared`.
- Current durable artifact persistence is audit/roadmap-shaped:
  - `roadmap_batches` stores project, alias, task intent, batch status, synthesis task, artifact counts, created task ids, and summary JSON (`packages/shared/src/schema.ts:150`).
  - `roadmap_batch_artifacts` stores the current-state artifact read model by batch, task, role, artifact path, state, failure family, validation details, content hash, attempt number, boundary id, failure signature, and validation timestamp (`packages/shared/src/schema.ts:179`).
  - `roadmap_batch_artifact_attempts` stores append-only artifact attempts with artifact id, batch, task, role, path, attempt number, boundary id, state, classification, failure family, signature, content hash, rework status, validation details, and source snapshot id (`packages/shared/src/schema.ts:211`).
  - `audit_evidence_events` stores append-only audit evidence units with task, audit plan, source snapshot, tool, kind, grade, scope/risk ids, hashes, bounded previews, summaries, redaction status, and timestamp (`packages/shared/src/schema.ts:240`).
- `packages/data/src/index.ts` exposes the current audit compatibility repository surface:
  - `createRoadmapBatchContract()` creates roadmap batch and current artifact rows.
  - `updateRoadmapBatchArtifactState()` transactionally appends an attempt and updates the current artifact row.
  - `listRoadmapBatchArtifactAttempts()` reads append-only attempts.
  - `listValidatedRoadmapReportArtifacts()` and `listRoadmapReportArtifactsForSynthesis()` preserve trusted audit-source semantics instead of relying only on `state === "valid"`.
- `docs/rdpi/work/work-20260512-audit-artifact-lifecycle/design.md` requires `roadmap_batch_artifacts` to remain the compatibility current-state read model and `roadmap_batch_artifact_attempts` to remain append-only.
- The audit lifecycle design also requires attempt numbers, attempt boundaries, stable failure signatures, source classifications, failure families, rework status, source inconclusive, terminal inconclusive, and manual exception behavior.
- `docs/kb/audit-evidence-provenance-contract.md` defines source report trust in terms of audit plan, source snapshot, evidence units, manifests, deterministic classifiers, and fail-closed no-findings rules. Inventory evidence cannot prove no-findings.
- `packages/shared/src/auditRoadmapContract.ts` owns the audit failure-family vocabulary and failure-signature helpers. These names are audit compatibility vocabulary, not generic workflow vocabulary.
- Current generic aliases exist for evidence in shared/data code (`EvidenceUnit`, `appendEvidenceUnitEvent`, `listEvidenceUnitEvents`), but the physical storage is still `audit_evidence_events`.
- `findRoadmapBatchArtifactByTaskId()` assumes a single latest artifact per task. Generic workflow packs may need multiple artifacts and claims per task, so this assumption should not be copied into the generic model.

## Same-project memory

- Shared-memory recall was not queried before `PLAN PASS` because the repository RDPI boundary prohibits shared-memory recall before the plan gate unless explicitly waived.
- Local completed RDPI artifacts and `docs/kb/**` were sufficient for this planning pass and take precedence over memory.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- Reusable local pattern: keep core handoff primitives separate from workflow-pack semantics, keep audit compatibility in adapter layers, and add generic persistence in parallel rather than broadening audit-shaped tables in place.

## Rejected or stale memory candidates

- No memory candidates were marked stale. No shared-memory recall was performed.
- Broadening `roadmap_batch_*` tables into generic workflow tables is rejected because the table names, roles, synthesis fields, failure families, and readiness semantics are audit/roadmap-specific.
- Treating `audit_evidence_events` as fully generic without a schema/API migration is rejected because the table requires audit plan and source snapshot fields.
- Using only current artifact `state` as a claim-trust source is rejected because audit validity also depends on trusted source classification and manifest/evidence provenance.

## Open questions

- Whether the first generic implementation should dual-write audit rows into the generic model, or introduce the generic model for new non-audit packs first and bridge audit read paths later.
- Whether a first-class generic `evidence_units` table should ship with the artifact/claim schema or remain a separate migration after claim links can reference compatibility evidence sources.
- Whether generic claims should support human-authored claims in the first implementation slice, or only classifier/generated claims.
- Whether retention policy should be global or workflow-pack-specific in the first slice.

## Hypotheses

- The safest design is a pack-neutral persistence layer beside the existing audit roadmap tables, not a rename or reinterpretation of the audit tables.
- Current-row artifact tables plus append-only attempts are still the right shape, but generic artifacts need run id, pack id, artifact type, URI/ref, and multiple artifacts per task.
- Claims should be first-class rows separate from artifacts because one artifact can assert many conclusions and one conclusion may be supported by multiple evidence links.
- Evidence links should support both future generic evidence-unit rows and compatibility references to `audit_evidence_events` until the evidence ledger is fully generalized.
- Inconclusive outcomes should be explicit and terminal/non-terminal, not overloaded into `invalid`, so feature/fix/docs packs can distinguish unsupported, refuted, blocked, and manually waived claims.
