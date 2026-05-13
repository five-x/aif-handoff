# Plan: Split Broad Audit Requests Into Micro Report Cards

## Implementation plan

1. Add shared broad-audit decomposition classification.
   - Implement and export `classifyAuditDecompositionRequest()` from `packages/shared/src/auditRoadmapContract.ts`.
   - Return stable `single_report` or `decomposed_report_batch` mode, `requiresDecomposition`, and reason codes.
   - Add tests in `packages/shared/src/__tests__/auditRoadmapContract.test.ts` for broad repository audits, multi-domain owner audits, concrete single-report audit cards, and narrow file/component audits.

2. Wire classification into audit roadmap generation.
   - Import the classifier in `packages/api/src/services/roadmapGeneration.ts`.
   - Add decomposition classification metadata to `GenerateRoadmapFileResult` for audit roadmap generation.
   - Include the classification and reason codes in the audit generation prompt.
   - Keep deterministic fallback source report generation as the broad decomposition fallback.
   - Add synthesis card text requiring a child report status table and no stronger final outcome than child report states.

3. Gate direct audit task creation.
   - In `packages/api/src/routes/tasks.ts`, classify direct audit task title/description/roadmap alias/tags before `createTask()`.
   - Reject `decomposed_report_batch` direct audit inputs with `400`, a stable error code, and guidance to use audit roadmap generation/import.
   - Do not create a task or roadmap batch on rejection.
   - Preserve `single_report` direct audit inputs.
   - Add or update `packages/api/src/__tests__/tasks.test.ts` to prove concrete narrow audit creation still returns one task and broad direct audit creation creates no runnable broad card.

4. Tighten child report synthesis readiness.
   - Update `packages/data/src/index.ts` so only trusted valid source reports and explicitly terminal source states are synthesis-ready.
   - Keep missing, retryable invalid, external blocked, stale-boundary, and weak source reports out of readiness.
   - Include explicit terminal inconclusive/manual exception source artifacts in `listRoadmapReportArtifactsForSynthesis()`.
   - Update `packages/data/src/__tests__/index.test.ts` for missing/weak blocking, terminal inconclusive readiness, manual exception justification, and child retry unblocking.

5. Keep coordinator parent gating aligned.
   - Update `packages/agent/src/__tests__/coordinator.test.ts` for the new readiness policy: synthesis remains held for missing or retryable weak children, but can run after child reports become trusted valid or explicitly terminal inconclusive.
   - If production coordinator code needs no change beyond data readiness, leave it untouched.

6. Require final synthesis to explain child states.
   - Update synthesis generation text and, if needed, completion evidence or synthesis classifier checks so synthesis output cannot omit source report status.
   - Add focused tests in `packages/shared/src/__tests__/taskCompletionEvidence.test.ts` or `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts` for named child report status and forged stronger outcomes.

7. Run verification.
   - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditRoadmapContract.test.ts src/__tests__/taskCompletionEvidence.test.ts src/__tests__/auditSynthesisClassifier.test.ts`
   - `npm.cmd test --workspace=@aif/data -- src/__tests__/index.test.ts`
   - `npm.cmd test --workspace=@aif/api -- src/__tests__/roadmapGeneration.test.ts src/__tests__/tasks.test.ts`
   - `npm.cmd test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts`
   - `npm.cmd run lint`
   - `npm.cmd run build`

8. Close out.
   - Record `PLAN PASS`, `TEST PASS`, `REVIEW PASS`, implementation summary, and verification commands in `result.md`.
   - Run memory sync with `MODE=auto LANE=work TASK_ID=work-20260513-split-broad-audit-requests-into-micro-report-cards`.
   - Update only this task entry in `docs/intake/work_status.json` to `done`, set `rdpiPath`, and set `updated` to `2026-05-13` after local memory review succeeds.

## Acceptance criteria

- Broad audit requests are classified before execution as `decomposed_report_batch`.
- Broad direct audit task creation is rejected before creating a runnable broad card, with guidance toward audit roadmap decomposition.
- Broad audit generation emits scoped source report cards with clear boundaries, expected evidence, and acceptance criteria.
- Parent synthesis tracks child completion through the existing roadmap batch/artifact model.
- Parent synthesis cannot proceed from missing, retryable weak, stale, or untrusted child outputs.
- Explicitly terminal inconclusive child outputs can unblock synthesis only for an inconclusive-capable final synthesis, not trusted no-findings.
- Child source report cards can be retried independently through existing artifact attempts.
- Final synthesis requirements force reporting of passed, failed, and inconclusive child reports.
- Narrow direct audit cards remain single-card tasks.

## Verification plan

- Independent `PLAN PASS` before implementation.
- Targeted shared, data, API, and agent tests listed in the implementation plan.
- `npm.cmd run lint`.
- `npm.cmd run build`.
- Independent `TEST PASS` after verification.
- Independent `REVIEW PASS` after tests pass.

## Reusable patterns

- Prefer deterministic classification and local contract validation for workflow routing.
- Reuse existing lifecycle tables for narrow audit parent/child semantics before adding generic hierarchy schema.
