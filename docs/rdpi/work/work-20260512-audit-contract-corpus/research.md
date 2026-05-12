# Research: Build Audit Contract Corpus And Mutation Tests

## Task Framing And Lane

- Task ID: `work-20260512-audit-contract-corpus`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260512-audit-contract-corpus.md`
- RDPI path: `docs/rdpi/work/work-20260512-audit-contract-corpus`
- Goal: build deterministic audit classification contract coverage so future changes cannot regress to accepting inventory-only no-findings, forged command output, weak line references, missing scope coverage, contradictory outcomes, or provenance mutations.
- RDPI boundary: before `PLAN PASS`, only local repo/document inspection and planning artifacts were used. No tests, runtime probes, scheduler/log inspection, live endpoints, or shared-memory recall were run.

## Accepted Planning Sources Or Local Facts

- `AGENTS.md` and the task card govern this run.
- `docs/kb/audit-evidence-provenance-contract.md` defines the target trust boundary: trusted audit conclusions need an audit plan, source snapshot, ledger evidence units, report manifest, and deterministic classifiers. Inventory evidence is discovery-only and cannot prove no-findings.
- `packages/shared/src/auditSourceEvidence.ts` centralizes source classifications: `validated_findings_present`, `validated_no_findings`, `inventory_only_invalid`, `insufficient_substantive_evidence`, and `source_inconclusive`. It classifies inventory commands such as `git ls-files`, `git status`, `git log`, `ls`, `find`, `test -f`, and `Get-ChildItem` as non-substantive.
- `packages/shared/src/auditReportValidator.ts` is the report-level validator. It parses `audit-report-manifest` blocks, computes report hashes, binds to source snapshots, checks manifest identity/outcome/snapshot/evidence refs, validates referenced paths and line ranges, enforces scope coverage, rejects low-quality/fake output patterns, and returns typed issue codes plus `sourceClassification`.
- `packages/shared/src/auditSynthesisClassifier.ts` is the batch source-report classifier. It returns `inconclusive_batch_evidence` when source reports are inventory-only or weak, and only accepts no-findings when all source reports have substantive no-findings evidence.
- `packages/shared/src/auditRoadmapContract.ts` owns audit artifact states, failure families, generated-card guardrails, task-completion issue family mapping, and stable failure signatures.
- `packages/shared/src/auditEvidenceLedger.ts` defines the runtime evidence unit shape with evidence IDs, task/plan/snapshot binding, scope IDs, risk hypothesis IDs, output hashes/previews, evidence grade, redaction status, and command metadata. Inventory commands are downgraded to discovery evidence.
- `packages/data/src/index.ts` owns roadmap batch state summaries. `valid_artifact_count` counts report artifacts only when `validationDetailsJson` contains trusted source classification; markdown-only `validated_no_findings` requires `manifestStatus: "valid"` to count as trusted.
- `stryker.conf.mjs` currently omits audit-specific shared tests from the `shared.testFiles` allowlist, so shared mutation runs do not exercise the audit validator/classifier corpus.

## Existing Test Coverage

- `packages/shared/src/__tests__/auditReportValidator.test.ts` already has inline tests for a bad observed report, a basic valid no-findings report, inventory-only variants, valid findings, scope coverage, contradictory findings/no-findings, manifests, ledger refs, identity mismatch, snapshot mismatch, content hash mismatch, scope/risk mismatch, and discovery-only evidence.
- `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts` already covers validated findings, substantive no-findings, inventory-only source reports, empty batches, source-outcome precedence, forged no-findings metadata, inventory-only metadata, and missing counts.
- `packages/shared/src/__tests__/auditRoadmapContract.test.ts` already covers canonical state/failure-family vocabulary, generated-card guardrails, failure-family mapping, and stable failure signatures.
- `packages/data/src/__tests__/index.test.ts` already covers roadmap batch valid counts, synthesis readiness, rework, terminal invalid/manual-review behavior, manifest-required trusted no-findings, stale boundary protection, and source-inconclusive/manual-exception readiness.

## Same-Project Memory

- `docs/memory/tasks/work/work-20260512-align-source-report-classification-delta.md` records that source report validation now rejects inventory-only no-findings before synthesis, shares inventory/substantive command classification, and stores source classification in `validationDetailsJson`.
- `docs/memory/tasks/work/work-20260512-audit-evidence-ledger-delta.md` records that ledger entries are append-only, bounded, and redacted; manifest evidence IDs bridge until first-class audit plan/source snapshot tables exist; inventory evidence is discovery-grade and cannot prove no-findings; scope and risk IDs are ledger bindings.
- `docs/rdpi/work/work-20260512-structured-audit-report-manifest/result.md` records that manifest-backed source reports are hash-bound, snapshot-bound, and fail closed on identity/content/outcome/snapshot mismatches. Markdown-only no-findings reports no longer count as trusted batch inputs.
- `docs/rdpi/work/work-20260512-audit-artifact-lifecycle/result.md` records that retryable weak attempts do not release synthesis readiness, while terminal inconclusive and manual-exception states are weak terminal inputs that do not count as trusted valid audit reports.

## Cross-Project Reusable Patterns

- None used. This task is specific to the local audit provenance and roadmap batch contracts.

## Rejected Or Stale Memory Candidates

- No shared-memory MCP recall was performed because this RDPI task is repo-specific and pre-plan runtime/shared-memory probing is disallowed by the repo contract.
- Older inline test fixtures are useful as local source facts, but they are not reusable enough to satisfy this task by themselves because the task specifically asks for an evolvable corpus and fixture mutation strategy.

## Constraints And Risks

- Existing test literals are inline; the corpus should move representative fixtures into reusable test helpers without rewriting every historical test.
- Scope/state transition behavior spans `@aif/shared` and `@aif/data`; source report classification fixtures belong in shared tests, but valid-count and synthesis-ready assertions belong in data tests.
- The implementation should avoid changing production classifier behavior unless the corpus exposes a clear missing contract. The task asks for regression coverage, not a broad validator redesign.
- Fixtures should support the migration path from markdown-only reports to manifest plus evidence ledger reports by making manifest/evidence data first-class in test helpers.
- Full mutation testing can be expensive; a dry-run and Stryker allowlist update are appropriate verification, with focused Vitest suites proving the contract deterministically.
