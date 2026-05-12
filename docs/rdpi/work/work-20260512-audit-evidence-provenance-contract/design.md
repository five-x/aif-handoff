# Design: Audit Evidence Provenance Contract

## Goal

Define a durable audit evidence provenance contract in `docs/kb/audit-evidence-provenance-contract.md`. The document will be the target architecture and migration reference for moving audit trust from markdown plausibility checks toward an evidence-provenance lifecycle.

## Contract boundaries

The contract will define six named domains:

- `AuditPlan`: the audit mandate, declared scope, risk hypotheses, allowed change boundaries, report/synthesis artifact expectations, and required evidence classes.
- `SourceSnapshot`: the immutable source tree binding used by an audit attempt, including source identity, git/worktree state, relevant files inspected, and excluded/generated paths.
- `EvidenceLedger`: append-only runtime evidence units captured during audit execution. This is the future authoritative source for commands, file reads, tool calls, observed outputs, timestamps, and actor/runtime identity.
- `AuditReportManifest`: structured manifest for a source report artifact, binding report text to the audit plan, source snapshot, evidence unit IDs, declared conclusion, and classifier result.
- `AuditReportClassifier`: deterministic source-report classifier that consumes report text plus manifests and ledger evidence. Current markdown validators remain compatibility inputs until manifests/ledger are available.
- `AuditBatchClassifier`: deterministic batch classifier that combines source report classifications into final audit outcomes with source-outcome precedence over stronger final prose.

## Classification vocabulary

The target vocabulary will distinguish:

- `valid_findings`: source report contains at least one validated, scoped, reproducible finding with evidence units.
- `valid_no_findings`: source report covers declared scope/risk hypotheses and proves absence of scoped risks through substantive evidence units.
- `inventory_only_invalid`: source report relies only on inventory/discovery evidence such as listings, status checks, or existence checks.
- `insufficient_substantive_evidence`: source report has plausible markdown, references, or commands, but lacks enough scoped runtime evidence to support its conclusion.
- `source_inconclusive`: source attempt reached a terminal artifact, but evidence is incomplete, conflicting, stale, missing, or cannot be bound to the source snapshot.
- `terminal_inconclusive`: batch-level final state when no validated findings survive and source reports do not support trusted no-findings.

The document will map the vocabulary to the current compatibility names:

- `validated_findings_present` remains the current batch equivalent of `valid_findings`.
- `validated_no_findings` remains the current batch equivalent of all source reports classifying as `valid_no_findings`.
- `inconclusive_batch_evidence` remains the current failure-family/batch outcome for `terminal_inconclusive`.

## Trust invariants

Trusted source reports and trusted no-findings claims must satisfy these invariants:

- The report is bound to exactly one audit plan and one source snapshot.
- Every report conclusion cites evidence unit IDs, not only markdown prose.
- Evidence units record observed command/tool/file-read outputs at capture time.
- Inventory evidence is discovery-only and can establish where to inspect, but cannot prove absence of scoped risk.
- Valid no-findings requires coverage of declared scope and risk hypotheses with substantive evidence units and reviewer-understandable reasoning.
- A final synthesis cannot claim a stronger conclusion than the source report manifests support.
- Stale source snapshots, missing evidence units, contradictory counts, or incompatible report/manifest conclusions fail closed to source or terminal inconclusive.

## State transitions

The target report-artifact lifecycle will be specified as:

- `expected` -> `capturing_evidence` when a source audit attempt begins.
- `capturing_evidence` -> `manifest_pending` after runtime evidence units are captured and the report artifact is written.
- `manifest_pending` -> `classified` after report manifest validation and deterministic source classification.
- `classified` -> `valid` only for `valid_findings` or `valid_no_findings`.
- `classified` -> `invalid` for `inventory_only_invalid` or compatibility validation failures.
- `classified` -> `inconclusive` for `insufficient_substantive_evidence` or `source_inconclusive`.
- `valid|invalid|inconclusive` -> `rework_requested` when human or deterministic review requests changes.
- `rework_requested` starts a new attempt with a new evidence/snapshot binding, not reuse of stale completion evidence.

The target batch lifecycle will be specified as:

- `expected` until source reports are available.
- `source_rework_needed` if any required source report is invalid or missing.
- `synthesis_ready` when all required source reports are valid or source-inconclusive with enough information to synthesize terminal inconclusive.
- `complete_valid_findings` when validated findings exist.
- `complete_valid_no_findings` only when all required source reports are valid no-findings.
- `terminal_inconclusive` when no findings survive but evidence cannot prove no-findings.

The current runtime may continue storing compatible states such as `valid`, `invalid`, `missing`, and `inconclusive_batch_evidence` until schema/runtime changes are staged.

## Compatibility and rollout

The contract will define staged rollout:

1. Immediate containment: document the contract; keep existing validator/synthesis/review behavior; keep inventory-only no-findings inconclusive.
2. Near-term source containment: align source report classification with synthesis inventory/substantive definitions so inventory-only no-findings fail at source-report validation time.
3. Manifest introduction: add structured report manifests while preserving markdown report compatibility.
4. Evidence ledger introduction: capture runtime evidence units and bind source reports to unit IDs.
5. Artifact lifecycle migration: add attempt-level classification history and first-class source inconclusive/terminal inconclusive states.
6. Classifier migration: update report/batch classifiers to require manifests and ledger evidence for trusted no-findings.
7. Legacy markdown migration: treat old markdown-only reports as compatibility inputs that may support findings or inconclusive outcomes, but cannot support trusted no-findings unless backfilled with acceptable manifests/evidence.
8. UI/API exposure: expose source snapshot, evidence unit summaries, and classifier vocabulary without requiring users to inspect raw logs.

`validationDetailsJson` is the current bridge for manifest/classifier details during migration. First-class schema fields for manifest version, source snapshot binding, evidence IDs, risk hypothesis IDs, classifier version, and attempt number should be added only in the later implementation tasks that own runtime/schema changes.

## Risks and mitigations

- Risk: a contract-only implementation may appear too weak. Mitigation: explicitly separate immediate containment from runtime/evidence-ledger tasks and list follow-up boundaries.
- Risk: new vocabulary may conflict with current three-kind synthesis outcomes. Mitigation: map target source-level vocabulary to existing batch outcome names and failure families.
- Risk: future schema work may overfit this document. Mitigation: specify invariants and lifecycle semantics without freezing final database tables or exact JSON field names.

## Files to change

- Add `docs/kb/audit-evidence-provenance-contract.md`.
- Update RDPI artifacts in `docs/rdpi/work/work-20260512-audit-evidence-provenance-contract/`.
- After gates pass, run memsync auto, which may update `docs/memory/**`.
- Update only the matching intake status entry if the task is present in `docs/intake/work_status.json`; do not rewrite unrelated task entries.
