# Research

## Task Framing And Lane

- Task: `work-20260522-harden-audit-evidence-depth-gates`
- Lane: work
- Intake card: `docs/intake/work/work-20260522-harden-audit-evidence-depth-gates.md`
- RDPI path: `docs/rdpi/work/work-20260522-harden-audit-evidence-depth-gates`
- Scope: harden audit source-report validation, repair, synthesis, and trust surfacing so shallow no-findings artifacts cannot be treated as trusted source reports or synthesis input.
- Out of scope: fixing botIntevra audit findings, weakening OOM/request-budget/semaphore/circuit-breaker/cancellation hardening, creating or running child tasks, or replacing the existing manifest/snapshot/hash/membership checks.

## Accepted Planning Sources Or Local Facts

- `AGENTS.md` requires Node commands through `npm.cmd`, keeps `docs/rdpi/` as task history, and requires local repo facts before memory.
- The intake requires explicit evidence-depth assessment per source report, risk hypothesis, and scoped file/root. Shallow evidence must classify as non-green with reason codes such as `shallow_evidence`, `inventory_only_evidence`, `irrelevant_grep_match`, `insufficient_scope_depth`, or `reused_generic_evidence`.
- `docs/kb/audit-evidence-provenance-contract.md:118` says trusted no-findings require substantive evidence for absence of each scoped risk. `docs/kb/audit-evidence-provenance-contract.md:129` says inventory evidence is discovery-only and cannot prove scoped risks are absent. `docs/kb/audit-evidence-provenance-contract.md:227` says inventory-only, insufficient-substantive, and source-inconclusive reports cannot produce synthesis-ready or valid no-findings outcomes.
- `packages/shared/src/auditSourceEvidence.ts:5` defines internal source classifications. `packages/shared/src/auditSourceEvidence.ts:215` filters some low-signal evidence lines, including imports, comments, metadata, bootstrap lines, and empty lines. `packages/shared/src/auditSourceEvidence.ts:434` currently classifies no-findings with coarse criteria: register + scoped risk claim + at least one substantive line/empty-file ref + at least one non-inventory command.
- `packages/shared/src/auditReportValidator.ts:19` defines validator issue codes. It currently lacks first-class depth issue codes for shallow evidence, irrelevant grep match, insufficient scope depth, and reused generic evidence.
- `packages/shared/src/auditReportValidator.ts:121` returns `substantiveEvidence`, `sourceClassification`, `reportQualityIssues`, and `scopeCoverage`, but no explicit per-risk/per-root evidence-depth assessment.
- `packages/shared/src/auditReportValidator.ts:702` validates manifest evidence refs against ledger IDs, task/plan/source snapshot, scope IDs, and risk IDs. This proves binding but not behavior relevance or non-generic reuse.
- `packages/shared/src/auditReportValidator.ts:811` has a ledger-backed no-findings path that requires a substantive inspection unit, report citation of the runtime evidence ID, and at least one existing line ref. It does not score each cited risk/root for depth.
- `packages/shared/src/auditReportValidator.ts:1850` computes scope coverage by root/file count and command evidence. It does not require behavior-relevant evidence per risk hypothesis.
- `packages/shared/src/auditReportValidator.ts:2520` computes `substantiveEvidence` after source classification and legacy heuristics. `packages/shared/src/auditReportValidator.ts:2550` excludes several evidence/coverage issues from `reportQualityIssues`, which currently lets some shallow artifacts avoid quality warnings.
- `packages/shared/src/auditSynthesisClassifier.ts:96` classifies source reports for synthesis. It requires every trusted report to classify as substantive no-findings before returning `validated_no_findings`, so the main gap is upstream source classification/trust, not synthesis aggregation shape.
- `packages/shared/src/taskCompletionEvidence.ts:1422` calls `validateAuditReportArtifact()`. `packages/shared/src/taskCompletionEvidence.ts:1454` maps a subset of validator issues to blocking evidence issues. `packages/shared/src/taskCompletionEvidence.ts:1476` can still accept a report when validator or legacy substantive heuristics say evidence is substantive.
- `packages/data/src/index.ts:4955` treats `validated_no_findings` report artifacts as trusted when manifest status is valid. It does not consult any separate evidence-depth dimension.
- `packages/data/src/index.ts:5089` maps trusted synthesis input from `roadmapArtifactCountsAsValid()`, so adding a persisted depth requirement there can prevent UI/API overstatement without inventing a new endpoint.
- `packages/agent/src/subagents/implementer.ts:2400` can choose deterministic repair outcome `validated_no_findings` when no decision reasons remain. `packages/agent/src/subagents/implementer.ts:3254` accepts deterministic repair if strict validation passes. The strict validator therefore needs to reject depth-insufficient no-findings, and repair should preserve reason codes when terminalizing as `source_inconclusive`.
- `packages/agent/src/subagents/reviewer.ts:334` treats deterministic review validation as trusted when source classification is trusted. It needs the same depth-aware validation surface to avoid accepting shallow reports.
- Existing UI already surfaces artifact trust and reason codes in `packages/web/src/components/task/TaskDetailHeader.tsx:235` and workflow timeline reason codes in `packages/web/src/components/task/WorkflowTimelinePanel.tsx:70`, so a backend reason-code/trust change can be surfaced with limited UI churn.
- Independent explorer research confirmed these seams and did not edit files or run runtime-visible probes.

## Same-Project Memory

- Local curated memory `docs/memory/tasks/work/work-20260513-audit-evidence-relevance-gate-delta.md` says trusted no-findings already require concrete scoped risk/absence claims, metadata-only `path:1` evidence is excluded, and hidden/generated/report artifacts are not product evidence by default.
- Local curated memory `docs/memory/tasks/work/work-20260514-harden-source-audit-report-production-delta.md` says no-findings reports must be evidence-bearing and file existence, `git ls-files`, `ls`, broad grep, and inventory-only checks are not enough.
- Local curated memory `docs/memory/tasks/work/work-20260515-system-tz-audit-classifier-synthesis-v2-delta.md` says public audit report outcomes are limited to `validated_findings_present`, `validated_no_findings`, and `source_inconclusive`, while lower-level diagnostics remain internal. It also says inventory-only and weak reports are untrusted and cannot become synthesis input.
- Local curated memory `docs/memory/tasks/work/work-20260519-tighten-generic-evidence-gates-delta.md` says evidence guards should decide from normalized/inferred intent before accepting terminal status.

## Cross-Project Reusable Patterns

- None used. Shared-memory recall was not run before `PLAN PASS` because the local RDPI boundary forbids shared-memory recall before the plan gate unless explicitly waived.

## Rejected Or Stale Memory Candidates

- No stale memory candidates were accepted. Local docs and code are authoritative for this task.

## Key Risks

- Depth heuristics that are too strict could make small files, config files, or empty-file checks impossible to validate. The implementation must preserve pragmatic positive fixtures for genuinely behavior-relevant no-findings.
- Depth heuristics that are too loose will reproduce the regression: first class declarations, imports, broad grep dumps, and reused snippets may still become trusted no-findings.
- Manifest/ledger identity, source snapshot, content hash, and artifact path checks are already strict and must not be weakened while adding the depth dimension.
- Deterministic repair and review gates should depend on the same shared validator output rather than introducing parallel trust rules.
