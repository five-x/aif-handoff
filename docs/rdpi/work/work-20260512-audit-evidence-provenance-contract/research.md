# Research: Audit Evidence Provenance Contract

## Task framing and lane

- Task ID: `work-20260512-audit-evidence-provenance-contract`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260512-audit-evidence-provenance-contract.md`
- RDPI path: `docs/rdpi/work/work-20260512-audit-evidence-provenance-contract`
- Request: define the target audit trust contract so source reports are trusted only when their conclusions are backed by declared scope, risk hypotheses, source snapshot binding, runtime-captured evidence units, and shared conclusion rules.
- Scope: architecture and migration contract for `AuditPlan`, `SourceSnapshot`, `EvidenceLedger`, `AuditReportManifest`, `AuditReportClassifier`, and `AuditBatchClassifier`.
- Out of scope for this task: runtime logging, database schema changes, ingestion of live audit artifacts, worker/report inspection, and implementation of the evidence ledger runtime. Those belong to staged follow-up tasks after this contract is accepted.

## Accepted planning sources or local facts

- `AGENTS.md` requires local repo facts first, keeps long-lived knowledge in `docs/kb/`, and keeps task history in `docs/rdpi/`.
- Required preflight completed with `STATUS: refreshed`; required flow audit completed with `STATUS: clean`.
- The project is an npm workspace. Root scripts include `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run lint` in `package.json`.
- No existing `docs/kb/` audit contract document is present; current `docs/kb/` files are bootstrap/GPTI reports.
- `packages/shared/src/auditReportValidator.ts` owns report-level validation issue codes and result shape, including `missing_substantive_evidence`, `missing_declared_scope_root`, and `missing_scope_coverage`.
- `packages/shared/src/auditReportValidator.ts` accepts only reports with resolvable repository references, scoped coverage, command-output-shaped evidence, and either valid no-findings evidence or structured finding evidence.
- `packages/shared/src/auditSynthesisClassifier.ts` owns current batch-level outcome kinds: `validated_findings_present`, `validated_no_findings`, and `inconclusive_batch_evidence`.
- `packages/shared/src/auditSynthesisClassifier.ts` explicitly filters inventory commands, including `git ls-files`, `git status`, `git log`, `ls`, `dir`, `find`, `test -e`, and `Get-ChildItem`, out of substantive no-findings command evidence.
- `packages/shared/src/auditSynthesisClassifier.ts` persists source-report outcome metadata in markdown comments and validates parsed metadata before accepting no-findings.
- `packages/shared/src/auditRoadmapContract.ts` owns audit artifact roles, states, failure families, generated card guardrails, and the `audit_inconclusive` to `inconclusive_batch_evidence` mapping.
- `packages/data/src/index.ts` currently models roadmap batch artifacts as `report` or `synthesis` artifacts with states including expected, valid, invalid, missing, and rework-needed behavior through summary functions.
- `packages/shared/src/schema.ts` persists roadmap batch artifact `role`, `artifactPath`, `state`, `failureFamily`, `validationDetailsJson`, `branchName`, `worktreePath`, `projectRoot`, `contentSha`, and `validatedAt`. It does not yet persist first-class manifest version, source snapshot ID, evidence IDs, risk hypothesis IDs, or classifier version.
- `packages/data/src/index.ts` treats `valid`, `invalid`, `missing`, and `external_blocked` as terminal source states for synthesis readiness. This is a compatibility state model and is too coarse for provenance-era report trust.
- `packages/agent/src/subagents/implementer.ts` deterministic synthesis now writes `Audit outcome: Audit inconclusive.` for inconclusive source outcomes and carries substantive evidence for validated no-findings.
- `packages/shared/src/taskCompletionEvidence.ts` runs synthesis classification and emits `audit_inconclusive` when the combined source/visible outcome is inconclusive.
- `packages/agent/src/reviewGate.ts` converts `audit_inconclusive` completion evidence into blocking review-gate findings.
- Prior RDPI `work-20260511-audit-report-contract-validator` established the shared deterministic audit report validator and kept completion evidence as the compatibility wrapper.
- Prior RDPI `work-20260511-audit-scope-coverage-contract` established machine-checkable declared scope coverage for audit report validation.
- Prior RDPI `work-20260511-audit-rework-freshness-contract` established that manual audit report rework cannot be bypassed by stale completion evidence.
- Prior RDPI `work-20260511-audit-inconclusive-synthesis-gate` established that inventory-only zero-finding source batches produce an inconclusive audit outcome instead of a successful product-quality no-findings conclusion.
- Related intake `work-20260512-structured-audit-report-manifest` covers the future structured source report manifest and source snapshot binding work.
- Related intake `work-20260512-audit-evidence-ledger` covers future runtime evidence events and explicitly requires inventory commands to remain discovery evidence.
- Related intake `work-20260512-audit-artifact-lifecycle` covers future attempt history, first-class source inconclusive output, terminal inconclusive policy, and manual exception semantics.
- Related intake `work-20260512-align-source-report-classification` covers near-term source-level containment so inventory-only no-findings fail before final synthesis.
- Local curated memory for `work-20260511-audit-inconclusive-synthesis-gate` records the stable decision that `validated_no_findings` passes only when every source report supplies substantive no-findings evidence and no weak, inventory-only, or finding counts contradict it.

## Same-project memory

- Same-project local curated memory was read from `docs/memory/tasks/work/work-20260511-audit-inconclusive-synthesis-gate-delta.md`.
- Shared-memory recall was not used before `PLAN PASS` because the local RDPI contract forbids shared-memory recall during pre-plan work unless explicitly waived.

## Cross-project reusable patterns

- None used. The task is specific to `aif-handoff` audit artifact contracts, and local source/RDPI facts are sufficient.

## Rejected or stale memory candidates

- No shared-memory candidates were consulted.
- Existing markdown-only validation is treated as a compatibility layer, not as the target trust boundary. The target contract must make runtime evidence units and source snapshot binding authoritative before source reports can claim trusted no-findings.

## Hypotheses

- H1: A durable `docs/kb/` contract is the correct implementation surface for this task because the intake asks to define architecture, migration order, and immediate containment boundaries, while separately constraining runtime logging/schema changes.
- H2: Immediate containment should preserve the current `auditReportValidator`, `auditSynthesisClassifier`, completion evidence, review gate, and roadmap failure-family behavior without broad runtime rewrites.
- H3: Future evidence-ledger work should introduce structured runtime evidence units and source snapshot IDs first, then move source report manifests and batch classifiers onto that provenance instead of trusting markdown alone.
- H4: The shared classification vocabulary should be wider than the current three synthesis outcomes so source-level invalidity and terminal batch inconclusiveness can be represented without overloading `inconclusive_batch_evidence`.
- H5: `validationDetailsJson` is the safest compatibility extension point during migration, but first-class schema fields are needed before provenance can become authoritative.

## Proposed evidence plan

- Static verification: inspect the new `docs/kb/audit-evidence-provenance-contract.md` for all required domains, invariants, classification vocabulary, state transitions, compatibility handling, rollout order, and immediate vs deferred decisions.
- Regression verification: run targeted shared tests covering existing audit validator/classifier contracts:
  - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/auditSynthesisClassifier.test.ts src/__tests__/auditRoadmapContract.test.ts`
- Repository hygiene: run `git diff --check`.
