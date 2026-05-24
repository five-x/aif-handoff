# Research

## Task

Expand the audit evidence-depth regression corpus and mutation tests so shallow trusted no-findings cannot regress, while legitimate substantive no-findings remain accepted.

## Intake Facts

- Task ID: `work-20260523-expand-audit-evidence-depth-regression-corpus`
- Lane: `work`
- RDPI Needed: `yes`
- Scope is tests and corpus coverage unless a small production adjustment is needed to make an accepted evidence-depth contract pass.
- Follow-up implementation tasks must be queued separately if a larger validator or synthesis bypass is discovered.

## Local Repo Facts

- `packages/shared/src/auditReportValidator.ts` already returns `evidenceDepth` with public `status`, `trustedNoFindingsSupported`, top-level `reasonCodes`, and per-scope/per-risk assessments.
- Current depth reason codes are `shallow_evidence`, `inventory_only_evidence`, `irrelevant_grep_match`, `insufficient_scope_depth`, and `reused_generic_evidence`.
- `packages/shared/src/__tests__/auditReportValidator.test.ts` already has focused examples for generic grep, unrelated risk commands, path-only risk terms, reused evidence, empty-file proof, and mixed explicit/scoped no-risk claims.
- `packages/shared/src/__tests__/fixtures/auditContractCorpus.ts` holds the cross-cutting corpus used by `auditContractCorpus.test.ts`; it currently records expected source classification, issue codes, and failure family, but not evidence-depth expectations.
- `packages/shared/src/__tests__/auditContractCorpus.test.ts` validates invalid, valid no-findings, valid findings, synthesis classification, and manifest-backed mutations. It is the right place to freeze corpus-wide public classification plus depth reason codes.
- `stryker.conf.mjs` includes `packages/shared/src/__tests__/auditContractCorpus.test.ts` in the shared package mutation test set, so strengthening that test wires corpus assertions into shared mutation runs.
- Package scripts support the requested command shape:
  - `npm.cmd test --workspace=@aif/shared -- auditReportValidator auditSynthesisClassifier auditContractCorpus`
  - `npm.cmd test --workspace=@aif/agent -- implementer reviewer`
  - `npm.cmd test --workspace=@aif/data -- index`
  - `npm.cmd run lint`
  - `npm.cmd run build`

## Current Coverage Observations

- Negative examples already present in focused validator tests cover many requested weak-evidence shapes, but the shared corpus needs representative fixtures so those examples become central contract coverage rather than scattered tests only.
- Existing invalid corpus fixtures cover inventory-only commands, file existence checks, mass first-line citations, fake command output, command-shaped future claims, contradiction, missing verification, scope gap, and risk-without-evidence.
- Existing valid no-findings corpus fixtures cover config, runtime boundary, persistence ownership, ops config, and architecture boundary. They include substantive source excerpts and command evidence, but the corpus test does not assert `evidenceDepth.status` or reason codes.
- Positive empty-file proof exists in focused validator tests and implementer tests, but not in the shared corpus.
- Targeted runtime/test output is represented in focused tests; adding one corpus fixture keeps synthesis and mutation coverage closer to the public contract.

## Boundaries

- Do not weaken existing evidence-depth protections.
- Prefer fixture/test expansion in `packages/shared/src/__tests__/fixtures/auditContractCorpus.ts` and `packages/shared/src/__tests__/auditContractCorpus.test.ts`.
- Touch production code only if an accepted contract fails for a narrow corpus-backed reason.
- Do not execute any derived follow-up implementation task in this run.
