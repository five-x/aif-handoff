# Plan: Roadmap Audit Decomposition Ordered E2E

## Acceptance criteria

- Broad audit requests remain classified as `decomposition_required` and cannot execute as one broad direct audit card.
- Audit roadmap decomposition produces scoped report child cards and one synthesis card with explicit deterministic contract metadata.
- Child audit report cards execute in deterministic order even when project auto-queue parallelism is enabled.
- Final synthesis waits until required child report artifacts are trusted valid or accepted terminal inconclusive/manual-exception outcomes.
- Raw, missing, stale, dirty, or untrusted child report evidence remains fail-closed.
- UI/API surfaces continue to expose the hierarchy, child order, artifact trust state, and synthesis readiness.
- Local source gates pass, then remote-only positive and negative e2e are run and recorded.

## Implementation steps

1. Harden shared audit generated-card contract.
   - Update `packages/shared/src/auditRoadmapContract.ts`.
   - Update `packages/shared/src/__tests__/auditRoadmapContract.test.ts`.
   - Add or verify issue codes for missing task intent, expected artifact, allowed write path, dependency order, and trusted lifecycle text.

2. Update roadmap audit generation/import contract text.
   - Update `packages/api/src/services/roadmapGeneration.ts`.
   - Update `packages/api/src/__tests__/roadmapGeneration.test.ts`.
   - Ensure fallback generation and model prompts both require the explicit contract fields.
   - Ensure import still creates hierarchy parent, report artifacts, one synthesis artifact, and deterministic phase/sequence order.

3. Enforce ordered child execution in data/queue gates.
   - Update `packages/data/src/index.ts`.
   - Update `packages/agent/src/__tests__/autoQueue.test.ts` and/or data tests.
   - Use roadmap batch membership plus task order to keep later audit report children from advancing until earlier report children are terminal.
   - Define "terminal enough to release successor" as trusted valid report artifact or accepted terminal inconclusive/manual-exception with persisted machine-readable issue codes, matching synthesis readiness semantics.
   - Add a targeted regression where a predecessor task is terminal-looking but has invalid/untrusted artifact evidence and the next child must not advance.
   - Apply the same predicate to due scheduled tasks and `claimBacklogTaskForAdvance()`.

4. Verify deterministic planner/plan-checker behavior.
   - Update `packages/shared/src/planQuality.ts` only if existing quality checks fail to recognize the strengthened contract.
   - Update `packages/shared/src/__tests__/planQuality.test.ts`, `packages/agent/src/__tests__/planner.test.ts`, and `packages/agent/src/__tests__/planChecker.test.ts` as needed.

5. Verify synthesis and trust behavior.
   - Prefer existing `auditSynthesisClassifier`, `taskCompletionEvidence`, `implementer`, and `reviewer` protections.
   - Add targeted regressions only where the strengthened child contract or order gate needs coverage.

6. Run local gates.
   - `npm.cmd test --workspace=@aif/shared -- auditRoadmapContract planQuality auditSynthesisClassifier taskCompletionEvidence`
   - `npm.cmd test --workspace=@aif/api -- roadmapGeneration tasks`
   - `npm.cmd test --workspace=@aif/agent -- autoQueue planner planChecker coordinator implementer reviewer`
   - `npm.cmd test`
   - `npm.cmd run lint`
   - `npm.cmd run build`
   - `git diff --check`

7. Run remote-only e2e after local gates and before independent `TEST PASS`.
   - Positive: stable scope set `README.md`, `docs/ops/audit-trust-callsite-map-20260525.md`, `docs/ops/external-audit-handoff-20260525.md`.
   - Negative: missing usable scope or invalid/untrusted child evidence.
   - Record exact remote task IDs, project IDs, child IDs, artifact paths, issue codes, lifecycle states, commit SHAs, validation fingerprints, final classifications, and remote worktree status.
   - Provide the recorded local and remote evidence to the independent tester.

## Evidence plan

- Local tests prove deterministic decomposition contracts and queue-order enforcement.
- Local full gates prove repository consistency.
- Remote-only e2e proves the end-to-end operator workflow on `http://192.168.88.67/api` before the independent tester issues `TEST PASS`.
- `result.md` will record `PLAN PASS`, `TEST PASS`, `REVIEW PASS`, remote evidence, and memory sync status.

## Gate plan

- Independent plan reviewer must return `PLAN PASS` before implementation.
- Coder role performs file edits after `PLAN PASS`.
- Independent tester must return `TEST PASS` only after reviewing implementation plus recorded local and remote verification evidence.
- Independent final reviewer must return `REVIEW PASS` before close-out.

## Current planning boundary

No runtime-visible remote probing, logs, scheduler reads, service checks, or shared-memory recall were performed before this plan review.
