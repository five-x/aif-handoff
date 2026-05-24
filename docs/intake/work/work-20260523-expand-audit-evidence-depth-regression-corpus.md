# Expand Audit Evidence Depth Regression Corpus

- Task ID: work-20260523-expand-audit-evidence-depth-regression-corpus
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-23
- Due: after the evidence-depth adversarial and positive-case reviews, or earlier for already-known examples from `work-20260522-harden-audit-evidence-depth-gates`
- Source: Follow-up from `work-20260522-harden-audit-evidence-depth-gates` closeout and operator request to queue additional hardening work.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260523-expand-audit-evidence-depth-regression-corpus`

## Request

Expand the audit evidence-depth regression corpus and mutation tests so future changes cannot reintroduce shallow trusted no-findings or over-reject legitimate substantive no-findings.

Seed the corpus from known weak evidence examples and add any cases discovered by the adversarial, synthesis propagation, and positive-case reviews.

## Done When

- Negative fixtures cover import-only evidence, first-line evidence, declaration-only snippets, generic and quoted dot-grep output, path inventory, loose grep matches, path-only risk term matches, reused snippets, self-reported command output, and mixed no-risk scoped claims.
- Positive fixtures cover small-file substantive evidence, config boundary evidence, empty-file proof, targeted runtime/test output, and narrow risk-specific source excerpts.
- Corpus tests assert public classification and depth reason codes.
- The tests are wired into the relevant shared/agent/data regression commands.

## Constraints

- Keep this task focused on tests and corpus coverage unless a small production adjustment is necessary to make an already-accepted contract pass.
- Queue a separate implementation task for any newly discovered validator or synthesis bypass that is larger than a focused corpus-backed fix.
- Do not weaken existing evidence-depth protections.

## Verification Plan

- `npm.cmd test --workspace=@aif/shared -- auditReportValidator auditSynthesisClassifier auditContractCorpus`
- `npm.cmd test --workspace=@aif/agent -- implementer reviewer`
- `npm.cmd test --workspace=@aif/data -- index`
- `npm.cmd run lint`
- `npm.cmd run build`
