# Plan

## Implementation plan

1. Update shared evidence guards.
   - Change task completion evidence gating to require implementation-manifest validation for inferred `feature`, `fix`, `docs`, and `tests` intents.
   - Add shared regression coverage for inferred feature/fix/docs/tests tasks without explicit `taskIntent`.
   - Extend implementation-manifest waiver parsing and validation with explicit waiver authority/evidence requirements.
   - Add shared regression coverage showing `knownLimitations` alone does not waive acceptance.
2. Update audit-card decision logic.
   - Require non-empty implementation and verification evidence before returning `closed_verified`.
   - Add shared tests for empty implementation and empty verification evidence.
   - Preserve the existing weak/discarded no-findings `closed_verified` regression when evidence arrays are present.
3. Update data/API queue projection and generic trust projection.
   - Infer generic workflow kind for terminal trust projection before deciding whether implementation evidence is required.
   - Add `executionActiveCount` and `queueGatingActiveCount` to `ProjectQueueStateResponse`.
   - Use `countActivePipelineTasksForProject()` for queue-gating count and status-derived execution count for display separation.
   - Add data and API regressions.
4. Update web TaskDetail display.
   - Replace ambiguous `Active queue` with `Execution active` and `Queue-gating active`.
   - Update TaskDetail tests to assert the new display.
5. Run scoped verification, then independent tester and final reviewer gates.
6. After `TEST PASS` and `REVIEW PASS`, write `result.md`, run memsync auto, and update only this task entry in `docs/intake/work_status.json`.

## Acceptance criteria

- Inferred feature/fix/docs/tests tasks require the same implementation manifest evidence as explicit development tasks during review handoff and completion.
- Generic terminal projection for inferred development tasks cannot appear trusted without a valid implementation manifest.
- `classifyAuditCardDecision()` does not return `closed_verified` when implementation evidence is empty or verification evidence is empty.
- Waived acceptance criteria are rejected unless they include explicit waiver authority and evidence refs tied to concrete verification evidence.
- TaskDetail either matches scheduler queue-gating semantics or clearly separates execution-active and queue-gating counts.
- Existing audit behavior remains intact: weak/discarded audit findings do not block a validated no-findings result by themselves.

## Verification plan

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskCompletionEvidence.test.ts src/__tests__/auditCardDecision.test.ts src/__tests__/systemTzGoldenRegressionCorpus.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts src/__tests__/workflowTimeline.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts src/__tests__/projects.test.ts`
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/TaskDetail.test.tsx`
- `npm.cmd run lint`
- Independent tester must return `TEST PASS` or `TEST FAIL`.
- Independent final reviewer must return `REVIEW PASS` or `REVIEW FAIL`.

## Reusable patterns

- Evidence guards should decide from normalized/inferred intent before accepting terminal status.
- UI counts that affect operator trust should either use the same server-side semantics as schedulers or be labeled as distinct concepts.
