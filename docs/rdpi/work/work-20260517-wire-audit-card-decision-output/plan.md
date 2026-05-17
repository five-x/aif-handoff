# Plan

## Implementation plan

1. Add shared decision plumbing.
   - Add or reuse a helper that extracts weak/discarded finding counts/labels from report text.
   - Add a helper to build an `AuditCardDecision` from accepted audit completion evidence, report text, and artifact context.
   - Export any browser-safe decision types through `@aif/shared/browser` as needed for UI typing.
2. Persist decision objects at acceptance points.
   - In `packages/agent/src/coordinator.ts`, when `blockTaskForCompletionEvidenceIfNeeded()` accepts an audit artifact and writes `state: "valid"`, include `auditCardDecision` in validation details.
   - In `packages/api/src/services/taskEvents.ts`, when manual `approve_done` accepts an audit artifact, include the same decision in validation details.
   - Ensure failure/blocker paths still use existing failure-family behavior for true malformed, missing, inaccessible, branch, runtime, or manual blockers.
3. Expose the decision object through real output surfaces.
   - Add `auditCardDecision` to `TaskArtifactTrustRollup`.
   - Teach `buildTaskArtifactTrustRollup()` to read `auditCardDecision` from artifact validation details, with a conservative derivation fallback for accepted valid artifacts.
   - Add the decision to workflow timeline artifact/claim metadata so report-like timeline output also carries it.
4. Update deterministic report output.
   - Expand `Card Decision Matrix` columns to include `requirementCompletion` and `verificationStrength`.
   - Include the full decision fields, not only final decision.
   - Add `## Weak/discarded findings` output for omitted weak/discarded source finding text and keep it separate from validated findings.
5. Update UI consumption.
   - Render `task.artifactTrust.auditCardDecision` in `TaskDetailHeader` and overview details.
   - Keep manual review badges tied to `manualReviewRequired`; do not infer manual review from weak/discarded finding counts.
6. Add integration tests.
   - Coordinator-level regression: committed audit report with valid `No validated findings`, valid manifest/evidence, and a `## Weak/discarded findings` section containing weak/missing/unsupported claims. After processing, assert task/card final status is `closed_verified`, weak/discarded finding count is exposed, task is not `blocked_external`, `manualReviewRequired` is false, and no `source_inconclusive`/`weak_sources` reason is emitted.
   - API/data test: accepted artifact trust rollup includes `auditCardDecision` with all required fields.
   - Report-output test: deterministic synthesis output includes required decision columns and weak/discarded findings under a weak/discarded section.
   - UI test: task detail renders audit card final status/details from `artifactTrust.auditCardDecision` and does not show manual review for the weak-finding regression case.

## Acceptance criteria

- The real card/API output exposes `requirementCompletion`, `verificationStrength`, `auditFindingValidity`, `residualRisks`, and `finalStatus`.
- For the regression case, `artifactTrust.auditCardDecision.finalStatus` is `closed_verified`.
- The task/card does not become `rework_required`, `blocked_external`, `source_inconclusive`, `weak_sources`, or `manualReviewRequired` solely because a weak/discarded findings section exists.
- Weak/discarded findings remain visible under a weak/discarded section or count and are not promoted to validated findings.
- Independent blockers still block: malformed/missing artifact, invalid manifest/evidence refs, missing required implementation/verification evidence, missing access, branch/runtime/provider blockers, or explicit required production validation gaps.

## Verification plan

- `npm.cmd --workspace @aif/shared test -- auditCardDecision.test.ts auditReportValidator.test.ts`
- Targeted agent/coordinator test command for the new coordinator regression.
- Targeted data/API tests for `artifactTrust.auditCardDecision`.
- Targeted web component tests for the new UI rendering.
- `npm.cmd run build`
- Independent tester gate must return `TEST PASS`.
- Independent final reviewer gate must return `REVIEW PASS`.

## Reusable patterns

- Persist semantic audit decisions in artifact validation details, then project them through the existing artifact trust/timeline surfaces. Avoid duplicating final decision logic in UI code.
