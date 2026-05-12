# Research: Structured Audit Report Manifest

## Task framing and lane

- Task ID: `work-20260512-structured-audit-report-manifest`
- Lane: `work`
- RDPI needed: `yes`
- Intake source: `docs/intake/work/work-20260512-structured-audit-report-manifest.md`

The task asks for a first structured source audit report manifest and source snapshot binding. Markdown remains the human presentation layer, while deterministic validation must read explicit report outcome, scope, risk, snapshot, evidence, artifact path, and content hash fields when a report provides them.

## Accepted planning sources or local facts

- `docs/kb/audit-evidence-provenance-contract.md` defines the target trust boundary: prose is presentation/compatibility input, trusted conclusions require an audit plan, source snapshot, evidence units, structured manifest, and deterministic classifiers.
- `packages/shared/src/auditReportValidator.ts` owns the current source audit report validator. It validates report prose, path references, line references, scope coverage, evidence quality, and source classification.
- `packages/shared/src/auditSourceEvidence.ts` owns source evidence classification names: `validated_findings_present`, `validated_no_findings`, `inventory_only_invalid`, and `insufficient_substantive_evidence`.
- `packages/shared/src/taskCompletionEvidence.ts` calls `validateAuditReportArtifact()` and carries the result through completion evidence.
- `packages/shared/src/schema.ts` and `packages/shared/src/db.ts` already define `roadmap_batch_artifacts.validation_details_json`, `branch_name`, `worktree_path`, `project_root`, `content_sha`, and `validated_at`.
- `packages/data/src/index.ts` already lets callers persist `validationDetails`, branch/worktree/project roots, `contentSha`, and `validatedAt` through `updateRoadmapBatchArtifactState()`, but current callers do not pass a content hash.
- `packages/agent/src/coordinator.ts` and `packages/api/src/services/taskEvents.ts` persist audit artifact validation details when completion or approval gates validate reports.
- `packages/agent/src/subagents/implementer.ts` reads validated audit report content for synthesis from a worktree, producer branch, or project root, but does not verify the loaded content against persisted artifact hash or snapshot binding.
- `packages/api/src/services/roadmapGeneration.ts` generates audit tasks with markdown evidence requirements, but no manifest requirement yet.
- Current `docs/rdpi/work/work-20260512-structured-audit-report-manifest/` files were intake scaffolds before this run.

## Same-project memory

Shared-memory recall was not used before `PLAN PASS` because the repo RDPI boundary forbids shared-memory recall during pre-plan planning unless explicitly waived. Local curated docs under `docs/memory/` were used as local files only.

Accepted same-project local memory facts:

- `docs/memory/tasks/work/work-20260512-align-source-report-classification-delta.md` says current source report validation now rejects inventory-only no-findings and stores source classification in `validationDetailsJson`.
- `docs/memory/tasks/work/work-20260512-align-source-report-classification-delta.md` also says `valid_artifact_count` counts report artifacts only when validation details contain trusted source classification.
- `docs/memory/tasks/work/work-20260512-audit-evidence-provenance-contract-hypotheses.md` records the hypothesis that `validationDetailsJson` is the safest compatibility extension point during migration, with first-class schema fields deferred until provenance becomes authoritative.

## Cross-project reusable patterns

None used. The implementation should follow this repository's existing audit contract, completion evidence, and roadmap batch artifact patterns.

## Rejected or stale memory candidates

- No shared-memory results were requested.
- The task-specific provenance contract explicitly defers evidence-ledger storage and broad schema lifecycle changes, so this task should not implement a full evidence ledger or attempt-history model.

## Implementation observations

- There is no structured manifest parser or manifest validation result in the shared validator today.
- Line reference validation currently uses the live filesystem under `projectRoot`; it does not read the source state declared by a report.
- `content_sha` already exists on roadmap batch artifacts, so the first rollout can persist a computed artifact hash without a migration.
- Because a manifest cannot safely contain a hash of itself, the embedded manifest should declare a hash for the report presentation body with manifest block(s) stripped, while batch artifact storage should persist a full artifact hash computed outside the report.
- Legacy markdown-only reports need a downgrade path: findings-capable compatibility can remain, but no-findings should not count as trusted batch no-findings without a valid manifest/snapshot binding.
