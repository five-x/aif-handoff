# Research: Align Source Audit Report Classification

## Task framing and lane

- Task ID: `work-20260512-align-source-report-classification`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260512-align-source-report-classification.md`
- RDPI path: `docs/rdpi/work/work-20260512-align-source-report-classification`
- Request: align source audit report classification with stricter synthesis semantics so inventory-only `No validated findings` source reports fail during source-report validation instead of being persisted as trusted valid artifacts.
- Scope: source audit report validation, synthesis/source evidence classification sharing, roadmap artifact validation details/counting, and regression coverage.
- Out of scope: full evidence ledger, first-class source attempt lifecycle migration, schema columns for manifests/snapshots/evidence IDs, and weakening existing final synthesis protections.

## Accepted planning sources or local facts

- Required RDPI preflight completed with `STATUS: ready`.
- Required flow audit completed with `STATUS: clean`.
- `AGENTS.md` requires npm workspace commands: `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run lint`.
- The selected intake card is currently present at `docs/intake/work/work-20260512-align-source-report-classification.md` and declares `RDPI Needed: yes`.
- `packages/shared/src/auditReportValidator.ts` owns typed source-report validation, issue codes, scope coverage, referenced-path validation, and the `substantiveEvidence` boolean.
- `packages/shared/src/auditReportValidator.ts:546` currently treats generic command-output wording as command evidence and includes broad command names such as `ls`, `find`, and `git`.
- `packages/shared/src/auditReportValidator.ts:565` currently accepts `No validated findings` when checked-file wording exists, at least one existing `path:line` reference exists, and generic command-output evidence exists.
- `packages/shared/src/auditSynthesisClassifier.ts:51` defines stricter inventory command patterns for `git ls-files`, `git status`, `git log`, `ls`, `dir`, `find`, `test -e`, and `Get-ChildItem`.
- `packages/shared/src/auditSynthesisClassifier.ts:102` filters inventory commands out of synthesis command evidence.
- `packages/shared/src/auditSynthesisClassifier.ts:116` requires existing line refs plus non-inventory command evidence for substantive no-findings.
- `packages/shared/src/auditSynthesisClassifier.ts:131` detects inventory-only no-findings separately.
- `packages/shared/src/auditSynthesisClassifier.ts:166` classifies source reports into `validated_findings_present`, `validated_no_findings`, or `inconclusive_batch_evidence`.
- `packages/shared/src/taskCompletionEvidence.ts:1205` already runs `validateAuditReportArtifact()` for completion evidence.
- `packages/shared/src/taskCompletionEvidence.ts:1234` combines validator and legacy evidence booleans before deciding whether source reports are substantive.
- `packages/data/src/index.ts:2773` computes roadmap batch counts from raw artifact states.
- `packages/data/src/index.ts:2963` persists `validArtifactCount` from raw `summary.counts.valid`, not from trusted source classifications.
- `packages/shared/src/schema.ts:174` shows `roadmap_batch_artifacts` already has `state`, `failureFamily`, and `validationDetailsJson`, so precise classification details can be recorded without an immediate schema migration.
- `packages/agent/src/coordinator.ts:388` and `packages/agent/src/coordinator.ts:500` persist roadmap artifact validation details from completion evidence.
- `packages/agent/src/subagents/implementer.ts` deterministic synthesis reads valid report artifacts and already calls `classifyAuditSynthesisSourceReports()`.
- `packages/shared/src/__tests__/auditReportValidator.test.ts` contains positive no-findings and source-scope coverage tests.
- `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts` already covers inventory-only no-findings as inconclusive.
- `packages/data/src/__tests__/index.test.ts` contains roadmap batch state/count tests.

## Same-project memory

- Same-project local RDPI and KB artifacts were consulted after current source facts:
  - `docs/rdpi/work/work-20260511-audit-inconclusive-synthesis-gate/result.md` records that synthesis already fails closed for inventory-only zero-finding source batches.
  - `docs/kb/audit-evidence-provenance-contract.md` defines `inventory_only_invalid`, `insufficient_substantive_evidence`, `valid_findings`, and `valid_no_findings` as the target vocabulary.
  - `docs/rdpi/work/work-20260512-audit-evidence-provenance-contract/research.md` records that `auditReportValidator` is still the compatibility source-level gate and that synthesis already excludes inventory commands.
- Shared-memory recall was not used before `PLAN PASS` because the RDPI contract forbids shared-memory recall during pre-plan work unless explicitly waived.

## Cross-project reusable patterns

- None used. This task is repository-specific and local source/RDPI facts are sufficient.

## Rejected or stale memory candidates

- No shared-memory candidates were consulted.
- The future evidence-ledger contract is accepted as direction but not as implementation scope for this containment task.

## Hypotheses

- H1: The smallest safe containment is a shared audit evidence classifier for command evidence and inventory/existence detection, consumed by both source validation and synthesis classification.
- H2: Source-report validation should fail inventory-only no-findings with `missing_substantive_evidence` while adding structured classification details that distinguish inventory-only from other weak evidence.
- H3: `validationDetailsJson` is sufficient for this task; no schema migration is required to record classification details.
- H4: `valid_artifact_count` should count only trusted source classifications (`validated_findings_present` or `validated_no_findings`) and valid synthesis artifacts, not generic `state === "valid"` report rows whose details do not prove trusted classification.
- H5: Existing final synthesis protections should remain in place as a defense in depth even after source reports are caught earlier.

## Proposed evidence plan

- Shared validator/classifier tests:
  - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/auditSynthesisClassifier.test.ts src/__tests__/auditRoadmapContract.test.ts`
- Data counting tests:
  - `npm.cmd test --workspace=@aif/data -- src/__tests__/index.test.ts`
- Agent/API integration spot checks if coordinator/event details are touched:
  - `npm.cmd test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts src/__tests__/implementer.test.ts`
  - `npm.cmd test --workspace=@aif/api -- src/__tests__/tasks.test.ts`
- Build/lint checks for touched workspaces:
  - `npm.cmd run build --workspace=@aif/shared`
  - `npm.cmd run build --workspace=@aif/data`
  - `npm.cmd run lint --workspace=@aif/shared`
  - `npm.cmd run lint --workspace=@aif/data`
- Repository hygiene:
  - `git diff --check`
