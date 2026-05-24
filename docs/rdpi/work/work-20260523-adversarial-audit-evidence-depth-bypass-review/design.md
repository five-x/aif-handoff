# Design

## Chosen design

Run a read-only adversarial review after `PLAN PASS` using source inspection, existing tests, and constructed in-memory source-report examples. Record all attempted bypass classes and outcomes in `result.md`. Do not change production code or test code in this task.

The review treats the prior hardening result as a claim to verify, not as proof. The primary question is whether any shallow evidence pattern can still reach a trusted `validated_no_findings` outcome through validator, synthesis, deterministic repair/review, completion evidence, or data trust projection paths.

## Pre-PLAN boundary

Before `PLAN PASS`, only planning sources may be recorded: task card, AGENTS guidance, RDPI templates, prior RDPI summary, and a source-map of files to inspect later. No tests, runtime probes, shared-memory recall, bypass validation, or live evidence collection are allowed before the independent plan reviewer returns `PLAN PASS`.

## Adversarial review surface

- Source validator: `packages/shared/src/auditReportValidator.ts`
- Evidence helper/classifier: `packages/shared/src/auditSourceEvidence.ts`
- Synthesis classifier: `packages/shared/src/auditSynthesisClassifier.ts`
- Completion/quality blockers: `packages/shared/src/taskCompletionEvidence.ts`
- Roadmap reason-code mapping: `packages/shared/src/auditRoadmapContract.ts`
- Data trust projection: `packages/data/src/index.ts`
- Deterministic report production and review: `packages/agent/src/subagents/implementer.ts`, `packages/agent/src/subagents/reviewer.ts`
- Existing tests and corpus near `packages/shared/src/__tests__/auditReportValidator.test.ts`, `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts`, `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`, `packages/shared/src/__tests__/fixtures/auditContractCorpus.ts`, `packages/data/src/__tests__/index.test.ts`, and agent tests.

## Bypass classes to attempt

- Mixed claims: one substantive explicit risk claim adjacent to shallow scoped/no-risk absence claims.
- No-risk scoped claims: absence language without manifest risk IDs, including same-line semicolon and plural absence block forms.
- Path-only risk term matches: risk terms appearing only in path-like tokens or file names.
- Generic or quoted dot-grep variants: `git grep -n .`, quoted variants, and broad search output shaped like evidence.
- Reused snippets: identical source lines reused across unrelated risk hypotheses.
- Ledger identity without substance: manifest/ledger evidence that is task/snapshot/risk bound but only inventory or generic inspection.
- Command-output-shaped prose: report text imitating command output without concrete binding or risk-specific interpretation.
- Adjacent risk wording leakage: a substantive line for one risk making nearby shallow lines appear risk-specific.

## Evidence interpretation

- `PASS` for the gate means the bypass attempt fails to produce trusted `validated_no_findings`; the expected result is usually `source_inconclusive`, untrusted projection, or blocked synthesis.
- `FAIL` for the gate means the bypass attempt can still produce or preserve trusted `validated_no_findings` from shallow evidence.
- `TEST GAP` means behavior appears protected by source logic or existing behavior, but no durable regression coverage exists in the current corpus.

## Decision candidates

- Confirmed bypasses become separate queued implementation cards with reproduction inputs and expected classification.
- Test-only gaps become separate queued corpus/test cards or are attached to the existing `work-20260523-expand-audit-evidence-depth-regression-corpus` task.
- If no bypass is confirmed, this task closes as a diagnostic audit with enumerated attempts, verification commands, and residual risks.
