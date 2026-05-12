# Audit Evidence Provenance Contract

- Task: `work-20260512-audit-evidence-provenance-contract`
- Status: target contract
- Scope: audit source reports, audit evidence provenance, and audit batch synthesis trust boundaries
- Related intake: [work-20260512-audit-evidence-provenance-contract.md](../intake/work/work-20260512-audit-evidence-provenance-contract.md)

## Purpose

This contract defines when an audit source report may be trusted, when a no-findings claim may be accepted, and how source report states flow into batch-level audit outcomes.

The target trust boundary is provenance-based. Markdown report prose is a presentation format and compatibility input, not the authoritative proof source. A trusted report conclusion must be backed by a declared audit plan, a bound source snapshot, runtime-captured evidence units, and deterministic classifier rules.

Existing markdown validators, synthesis classifiers, completion evidence, and review-gate behavior remain immediate containment. They preserve fail-closed behavior during migration, including the current rule that inventory-only no-findings source batches produce an inconclusive audit outcome instead of a trusted no-findings pass.

## Domain Contracts

### AuditPlan

`AuditPlan` is the audit mandate for one audit batch or source attempt. It defines:

- task ID, lane, project root, and authorized source boundaries;
- declared scope roots and explicit exclusions;
- risk hypotheses that the audit must test;
- required report and synthesis artifacts;
- allowed evidence classes and minimum evidence expectations;
- change boundaries, including whether the audit is discovery-only, review-only, or authorized to implement changes;
- classifier versions or compatibility classifier names used for the attempt.

An audit plan must be durable enough that a later reviewer can determine what the source report was required to prove. A report that cannot be bound to exactly one audit plan is not trusted for valid no-findings.

### SourceSnapshot

`SourceSnapshot` is the immutable source-tree binding for one audit attempt. It defines:

- repository identity and project root;
- worktree path and branch or detached state;
- commit, content hash, or equivalent source identity available at capture time;
- dirty state relevant to the attempt;
- scoped files inspected and relevant files intentionally excluded;
- generated, vendor, build, or cache paths excluded from substantive review.

The source snapshot binds evidence to the source state that produced it. If the snapshot is stale, missing, contradictory, or cannot be matched to the report, the source report fails closed to `source_inconclusive` or a compatibility invalid state.

### EvidenceLedger

`EvidenceLedger` is the append-only runtime record of evidence units captured during audit execution. It is the future authoritative source for observed commands, file reads, tool calls, outputs, timestamps, and actor/runtime identity.

Each evidence unit should record:

- evidence unit ID;
- audit plan ID and source snapshot ID;
- actor or runtime identity;
- command, file read, tool call, or review action;
- captured input parameters and observed output;
- timestamp and execution context;
- evidence class, such as inventory, source inspection, test execution, build output, runtime check, or reviewer judgment;
- redaction status when outputs contain sensitive or irrelevant data.

The ledger is not introduced by this document. Runtime capture and schema changes are deferred to the evidence-ledger implementation task.

### AuditReportManifest

`AuditReportManifest` binds a source report artifact to structured provenance. It defines:

- report artifact path and content hash;
- audit plan ID;
- source snapshot ID;
- evidence unit IDs cited by the report;
- risk hypothesis IDs covered by the report;
- declared conclusion;
- source report classifier result;
- classifier version;
- attempt number and supersession relationship, when available.

During migration, `validationDetailsJson` is the compatibility bridge for manifest-like details. First-class manifest fields must be added only by runtime/schema tasks that own persistence changes.

### AuditReportClassifier

`AuditReportClassifier` is the deterministic source-report classifier. In the target model, it consumes report text, the report manifest, the source snapshot, and ledger evidence units.

The classifier must:

- reject conclusions that are stronger than their manifest and evidence units support;
- distinguish inventory/discovery evidence from substantive evidence;
- validate declared scope and risk-hypothesis coverage;
- require reproducible, scoped evidence for findings;
- require substantive negative evidence for no-findings;
- fail closed when evidence is missing, stale, contradictory, or cannot be bound to the source snapshot.

Current markdown validators remain compatibility classifiers until manifests and ledger evidence are available.

### AuditBatchClassifier

`AuditBatchClassifier` combines source report classifications into a final audit outcome. It must treat source report manifests as the authority over final synthesis prose.

The batch classifier must:

- preserve validated findings when at least one source report has a valid, scoped finding;
- accept batch no-findings only when every required source report classifies as `valid_no_findings`;
- produce terminal inconclusive when no validated findings survive and the required source reports do not prove trusted no-findings;
- fail closed when source reports are missing, stale, invalid, or source-inconclusive beyond the allowed synthesis policy;
- never let final prose claim a stronger conclusion than source classifications support.

## Trust Invariants

A trusted source report must satisfy all of these invariants:

- It is bound to exactly one `AuditPlan`.
- It is bound to exactly one `SourceSnapshot`.
- Its conclusion is declared in an `AuditReportManifest` or compatibility validation details.
- Every material conclusion cites evidence unit IDs when the ledger exists.
- Evidence units contain observed outputs captured at audit runtime, not only summaries written after the fact.
- Scope coverage maps to declared scope roots and risk hypotheses.
- Stale completion evidence, stale source snapshots, missing evidence units, or contradictory report counts fail closed.
- Human-readable prose explains how evidence supports the conclusion, but prose alone is not proof.

A trusted no-findings claim must additionally satisfy all of these invariants:

- All required scope roots and risk hypotheses are covered.
- The report includes substantive evidence for the absence of each scoped risk.
- Substantive evidence is specific enough for a reviewer to understand what was inspected or executed and why it addresses the risk hypothesis.
- Inventory evidence may support where the audit looked, but it cannot prove absence of a scoped risk.
- The report does not contradict its manifest, evidence units, finding counts, or batch synthesis metadata.
- The source snapshot remains the same snapshot that the cited evidence observed.

## Inventory Evidence Rule

Inventory evidence is discovery-only. It may identify files, paths, repository state, candidate targets, dependency lists, or the presence or absence of files. It cannot prove that scoped risks are absent.

Inventory-only commands and actions include, but are not limited to:

- `git ls-files`
- `git status`
- `git log`
- `ls`
- `dir`
- `find`
- `test -e`
- `Get-ChildItem`

Inventory evidence may support a finding if paired with substantive evidence that explains the defect and risk. Inventory evidence may support an inconclusive result by showing what was or was not discovered. Inventory evidence alone cannot support `valid_no_findings`.

## Classification Vocabulary

### `valid_findings`

A source report contains at least one validated, scoped, reproducible finding. The finding is tied to the audit plan, source snapshot, affected scope, risk hypothesis, and substantive evidence units.

Compatibility mapping: batch synthesis currently reports this as `validated_findings_present`.

### `valid_no_findings`

A source report covers declared scope and risk hypotheses and proves absence of scoped risks through substantive evidence units and reviewer-understandable reasoning.

Compatibility mapping: batch synthesis currently reports this as `validated_no_findings` only when all required source reports support trusted no-findings.

### `inventory_only_invalid`

A source report relies only on discovery or inventory evidence for its conclusion. This is invalid for trusted no-findings and must not be promoted to a successful audit outcome.

Compatibility mapping: current validators may report this through `missing_substantive_evidence` or related validation details; current synthesis maps inventory-only no-findings batches to `inconclusive_batch_evidence`.

### `insufficient_substantive_evidence`

A source report has plausible prose, scoped references, or command-output-shaped text, but lacks enough substantive evidence to support its conclusion.

Compatibility mapping: current validators may report this through `missing_substantive_evidence`, `missing_scope_coverage`, or related compatibility validation details.

### `source_inconclusive`

A source audit attempt reached a terminal artifact, but the classifier cannot accept it as valid or invalid with enough confidence. Causes include incomplete evidence, conflicting evidence, stale evidence, missing source snapshot binding, missing manifests, or incompatible conclusion metadata.

Compatibility mapping: the current runtime may represent this as invalid, rework-needed, or batch-level `inconclusive_batch_evidence` until first-class source inconclusive states exist.

### `terminal_inconclusive`

A batch-level final state. No validated findings survive, and source reports do not support trusted no-findings.

Compatibility mapping: current synthesis uses `inconclusive_batch_evidence`, and completion evidence maps this to `audit_inconclusive`.

## Source Report Artifact State Rules

The target source report lifecycle is:

1. `expected`: the audit plan requires a source report, but no attempt has started.
2. `capturing_evidence`: a source audit attempt has started and runtime evidence capture is in progress.
3. `manifest_pending`: the report artifact exists and evidence capture has ended, but manifest validation and classification have not completed.
4. `classified`: the manifest and report have been evaluated by the source report classifier.
5. `valid`: terminal trusted state for `valid_findings` or `valid_no_findings`.
6. `invalid`: terminal untrusted state for `inventory_only_invalid` or compatibility validation failures.
7. `inconclusive`: terminal untrusted state for `insufficient_substantive_evidence` or `source_inconclusive`.
8. `rework_requested`: a reviewer or deterministic gate requires a new attempt.

Allowed transitions:

- `expected` -> `capturing_evidence`
- `capturing_evidence` -> `manifest_pending`
- `manifest_pending` -> `classified`
- `classified` -> `valid`
- `classified` -> `invalid`
- `classified` -> `inconclusive`
- `valid` -> `rework_requested`
- `invalid` -> `rework_requested`
- `inconclusive` -> `rework_requested`
- `rework_requested` -> `capturing_evidence`

Rework starts a new attempt with a new evidence and snapshot binding. Stale completion evidence from a previous attempt must not be reused to satisfy a later source report.

Current persistence may continue storing compatibility states such as `valid`, `invalid`, `missing`, and `external_blocked` until lifecycle migration work adds first-class attempt and inconclusive states.

## Audit Batch State Rules

The target audit batch lifecycle is:

1. `expected`: required source reports have not all arrived.
2. `source_rework_needed`: any required source report is missing, invalid, or requires another attempt before synthesis.
3. `synthesis_ready`: source outcomes are sufficient to synthesize a valid findings result, valid no-findings result, or terminal inconclusive result.
4. `complete_valid_findings`: at least one validated finding exists and final synthesis preserves it.
5. `complete_valid_no_findings`: every required source report is `valid_no_findings`.
6. `terminal_inconclusive`: no validated findings survive, and the source reports do not prove trusted no-findings.

Batch precedence rules:

- `valid_findings` takes precedence over no-findings when at least one scoped, validated finding exists.
- `complete_valid_no_findings` requires all required source reports to be `valid_no_findings`.
- `inventory_only_invalid`, `insufficient_substantive_evidence`, and `source_inconclusive` cannot produce `complete_valid_no_findings`.
- Missing required source reports block trusted final conclusions.
- Final synthesis prose must be downgraded when it is stronger than source report classifications.
- A terminal inconclusive batch is a fail-closed audit outcome, not a product-quality pass.

## Compatibility With Existing Markdown Reports

Existing markdown reports remain compatibility inputs during migration. They may be used to preserve current containment behavior and to avoid losing useful human-readable findings, but they are not sufficient for provenance-era trust by themselves.

Compatibility rules:

- Markdown-only reports may support `valid_findings` when the compatibility validator can resolve scoped, reproducible finding evidence.
- Markdown-only reports may support terminal inconclusive when they lack enough substantive evidence for no-findings.
- Markdown-only reports must not support trusted no-findings unless acceptable manifests and evidence bindings are present or are safely backfilled.
- Compatibility validation details may continue to be stored in `validationDetailsJson`.
- Existing batch outcomes `validated_findings_present`, `validated_no_findings`, and `inconclusive_batch_evidence` remain supported names until classifier migration is complete.
- Existing review-gate behavior that blocks `audit_inconclusive` remains part of immediate containment.

No existing markdown report should be rewritten in place only to appear provenance-compliant. Backfill must preserve original artifact identity and distinguish original prose from generated manifest metadata.

## Rollout Order

1. Immediate containment: publish this contract; preserve existing validator, synthesis, completion-evidence, and review-gate behavior; continue treating inventory-only no-findings as inconclusive.
2. Near-term source containment: align source report classification with synthesis inventory/substantive definitions so inventory-only no-findings fail at source-report validation time.
3. Manifest introduction: add structured `AuditReportManifest` data while preserving markdown report compatibility.
4. Source snapshot binding: bind each manifest to the source snapshot that evidence observed.
5. Evidence ledger introduction: capture runtime evidence units and bind source reports to evidence unit IDs.
6. Artifact lifecycle migration: add attempt-level classification history and first-class `source_inconclusive` and `terminal_inconclusive` states.
7. Classifier migration: require manifests and ledger evidence for trusted no-findings, with markdown validators retained as compatibility readers.
8. Legacy markdown migration: classify old markdown-only reports as findings-capable or inconclusive-capable, but not trusted no-findings unless provenance is backfilled.
9. UI/API exposure: expose source snapshot, evidence summaries, and classifier vocabulary without requiring users to inspect raw logs.

Queued sibling work owns the implementation details:

- `work-20260512-align-source-report-classification`: near-term source containment.
- `work-20260512-structured-audit-report-manifest`: structured manifests and source snapshot binding.
- `work-20260512-audit-evidence-ledger`: runtime evidence units.
- `work-20260512-audit-artifact-lifecycle`: attempt history and first-class inconclusive states.

## Immediate Containment Decisions

These decisions are effective now as documentation and compatibility policy:

- Markdown report validation is containment, not the target source of proof.
- Inventory-only evidence is discovery-only and cannot prove no-findings.
- Final synthesis cannot claim no-findings when source reports do not support trusted no-findings.
- Existing `inconclusive_batch_evidence` and `audit_inconclusive` blocking behavior remains correct.
- Existing `validationDetailsJson` may carry compatibility classifier details during migration.
- Existing runtime and schema shapes should not be changed by this contract task.

## Deferred Runtime And Evidence-Ledger Changes

These decisions require follow-up implementation tasks:

- creating ledger storage and runtime capture for evidence units;
- adding first-class manifest version, source snapshot ID, evidence IDs, risk hypothesis IDs, classifier version, and attempt number fields;
- introducing first-class `source_inconclusive` and `terminal_inconclusive` artifact states;
- changing report and batch classifiers to require manifests and ledger evidence for trusted no-findings;
- adding UI/API surfaces for source snapshots, evidence summaries, and classifier vocabulary;
- migrating legacy markdown reports through backfilled manifests or explicit compatibility classification.

## Non-Goals

This document does not add runtime logging, database schema changes, tests, child task cards, memory artifacts, or RDPI result artifacts. It defines the durable contract those later changes must implement.
