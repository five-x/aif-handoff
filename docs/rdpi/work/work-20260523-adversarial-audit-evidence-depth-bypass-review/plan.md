# Plan

## Implementation plan

1. Obtain independent `PLAN PASS` using only the task card plus `research.md`, `design.md`, and this `plan.md`.
2. After `PLAN PASS`, inspect the validator, evidence helper, synthesis, trust projection, deterministic repair/review, and related tests listed in `design.md`.
3. Build a compact bypass matrix for the required classes:
   - mixed claims;
   - no-risk scoped claims;
   - path-only risk term matches;
   - generic or quoted dot-grep variants;
   - reused snippets;
   - identity-bound but non-substantive ledger evidence;
   - command-output-shaped prose;
   - adjacent line/risk wording leakage.
4. For each bypass class, construct the smallest report/manifest/ledger shape needed to exercise the risk. Prefer existing test builders and in-memory execution over writing new files.
5. Run targeted validator and synthesis/data trust checks where applicable. Classify each attempt as `PASS`, `FAIL`, or `TEST GAP`.
6. If any confirmed bypass exists, create a queued implementation intake card only. Do not implement the fix in this task.
7. If any behavior is protected but lacks durable regression coverage, either attach the gap to `work-20260523-expand-audit-evidence-depth-regression-corpus` or create a separate queued test/corpus intake card.
8. Write `result.md` with the bypass matrix, exact commands, gate verdicts, follow-up cards, and memory-sync status.
9. Run independent tester gate and final reviewer gate. Close only after `TEST PASS`, `REVIEW PASS`, and memsync local review succeeds.

## Acceptance criteria

- Every bypass class named in the intake is listed with an attempted input shape and a `PASS`, `FAIL`, or `TEST GAP` outcome.
- Confirmed bypasses, if any, have separate queued implementation cards with reproduction steps and expected classification.
- Test-only gaps, if any, are queued separately or explicitly attached to `work-20260523-expand-audit-evidence-depth-regression-corpus`.
- Production code and committed test code are unchanged by this diagnostic task.
- Existing manifest, source snapshot, content hash, artifact path, ledger identity, scope membership, and synthesis membership checks are not weakened.
- The review preserves the possibility of genuinely substantive `validated_no_findings`.

## Verification plan

- `npm.cmd test --workspace=@aif/shared -- auditReportValidator`
- `npm.cmd test --workspace=@aif/shared -- auditSynthesisClassifier taskCompletionEvidence auditContractCorpus`
- If trust propagation is part of any attempted bypass: `npm.cmd test --workspace=@aif/data -- index`
- If deterministic repair/review is part of any attempted bypass: `npm.cmd test --workspace=@aif/agent -- implementer reviewer`
- Use read-only source inspection and targeted in-memory constructed examples to document exact bypass inputs and classifications.
- Independent tester must return `TEST PASS` or `TEST FAIL`.
- Independent final reviewer must return `REVIEW PASS` or `REVIEW FAIL`.

## Reusable patterns

- For diagnostic audit tasks, record bypass matrices as result evidence and queue implementation/test work separately. Do not merge diagnostic review and remediation in one RDPI run.
