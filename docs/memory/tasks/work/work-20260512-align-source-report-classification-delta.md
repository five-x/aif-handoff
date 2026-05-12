<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260512-align-source-report-classification::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260512-align-source-report-classification
source_path: docs/rdpi/work/work-20260512-align-source-report-classification
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-12
supersedes:
expires_at:
tags:

- aif-handoff
- work
- audit
- source-report-validation
- task-delta
  source_refs:
- docs/rdpi/work/work-20260512-align-source-report-classification/research.md
- docs/rdpi/work/work-20260512-align-source-report-classification/design.md
- docs/rdpi/work/work-20260512-align-source-report-classification/plan.md
- docs/rdpi/work/work-20260512-align-source-report-classification/result.md
  created_at: 2026-05-12
  last_verified_at: 2026-05-12

---

# Summary

Curated delta for task work-20260512-align-source-report-classification.

# Why it matters

AIF audit source report validation now rejects inventory-only no-findings before final synthesis, so weak source reports are not persisted as trusted valid artifacts.

# When to reuse

Reuse this when changing audit report validation, synthesis classification, completion evidence, deterministic audit repair, or roadmap batch artifact counting.

# When not to reuse

Do not treat this task-local delta as a substitute for the future evidence ledger, structured report manifest, or first-class audit artifact lifecycle work.

## Facts

- `packages/shared/src/auditSourceEvidence.ts` centralizes source audit evidence classification and inventory command filtering.
- Source report validation exposes `sourceClassification` and rejects inventory-only no-findings as `inventory_only_invalid` with `missing_substantive_evidence`.
- `auditSynthesisClassifier` delegates command extraction and inventory filtering to the shared source evidence classifier while preserving existing synthesis outcome names.
- `taskCompletionEvidence` blocks `inventory_only_invalid` before legacy fallback can mark a no-findings report as substantive.
- `roadmap_batch_artifacts.validationDetailsJson` carries source classification details through existing completion evidence storage.
- Data-layer `valid_artifact_count` counts report artifacts only when validation details contain trusted source classification `validated_findings_present` or `validated_no_findings`; valid synthesis artifacts still count by valid state.
- Deterministic audit report repair now emits substantive `git grep -n "."` inspection output instead of inventory-only `git ls-files` no-findings evidence.

## Decisions

- Use existing `validationDetailsJson` for source classification details instead of adding schema columns in this containment task.
- Preserve terminal-state synthesis readiness for invalid or weak source artifacts so final synthesis can still produce terminal inconclusive outcomes.
- Keep final synthesis inconclusive protections as defense in depth after source-level validation catches inventory-only reports.

## Patterns

- Share inventory/substantive command classification through one helper instead of duplicating command filters in source validation and synthesis.
- Treat legacy markdown no-findings reports as trusted only when they include scoped line references and non-inventory command output.
- When deterministic repair writes no-findings evidence, use substantive inspection commands such as `git grep -n`/`rg`, not inventory commands.
