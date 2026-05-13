# Plan - Audit V10 False Valid Regression

Pending independent `PLAN PASS` or `PLAN FAIL`.

## Implementation plan

1. Add an end-to-end regression canary in `packages/agent/src/__tests__/implementer.test.ts` near the existing deterministic audit repair tests.
   - Use the existing test helpers for temporary git repos, task insertion, roadmap batch contracts, `runImplementer()`, manifest parsing, artifact summaries, and attempt inspection.
   - Build a fixture whose lexically first eligible text-like files are under `.agents/**`.
   - Include a product file under `src/` only to prove hidden tooling is not the only repository content.

2. Model an audit-v10-style batch.
   - Create at least two report tasks with `Scope: .`, hidden `.agents/**` evidence, report artifact paths, and audit intent.
   - Create one synthesis task and a roadmap batch containing the two report artifacts plus the synthesis artifact.
   - Set report tasks into rework conditions that trigger deterministic audit report repair without live model calls.

3. Assert source report repair fails closed.
   - Run `runImplementer()` for each source report task.
   - Assert each repaired report is `source_inconclusive`, has no trusted no-findings claim, and omits hidden `.agents/**` evidence as product proof.
   - Assert each report artifact state, failure family, classification, validation details, and attempt history record `source_inconclusive`.
   - Assert batch trusted valid report count remains zero.

4. Fix data-layer readiness if required.
   - Check whether `packages/data/src/index.ts` still treats terminal non-trusted source states or terminal attempts as ready for synthesis.
   - If so, update `roadmapSourceArtifactReadyForSynthesis()` so report artifacts release synthesis only when `roadmapArtifactCountsAsValid(artifact)` is true, with no fallback for `source_inconclusive`, `terminal_inconclusive`, retry-exhausted invalid, or manual-review invalid source reports.
   - Preserve trusted valid report behavior and unrelated operator holds.
   - Update existing data tests that currently expect terminal non-trusted source reports to release synthesis readiness so they now assert `synthesisReady === false`, synthesis task remains paused/blocked, and validated report artifact inputs stay empty.

5. Assert weak reports cannot become trusted or runnable synthesis input.
   - Assert `listValidatedRoadmapReportArtifacts(batchId)` is empty.
   - Assert `summarizeRoadmapBatch(batchId).counts.valid` is zero.
   - Assert `summarizeRoadmapBatch(batchId).synthesisReady` is false.
   - Assert the synthesis task remains paused or blocked with `synthesis_not_ready`.
   - Assert `claimBacklogTaskForAdvance(synthesisTaskId)` returns false.

6. Assert final synthesis cannot become successful `validated_no_findings`.
   - Do not run deterministic synthesis from an all-weak/source-inconclusive batch.
   - Assert no synthesis artifact is written as a successful `validated_no_findings` result.
   - Keep existing shared forged-metadata tests as the independent guard that visible or embedded final synthesis text cannot override weak source outcomes.

7. Add additional production fixes only if the canary exposes more gaps.
   - If deterministic repair still trusts hidden/root-scope evidence, fix `packages/agent/src/subagents/implementer.ts`.
   - If data counts weak/source-inconclusive reports as trusted, fix `packages/data/src/index.ts` and focused data tests.
   - If final synthesis metadata can be forged into success, fix shared synthesis/task completion evidence tests and classifier behavior.

8. Verification after implementation.
   - Run targeted agent test:
     - `npm.cmd test --workspace=@aif/agent -- src/__tests__/implementer.test.ts`
   - Run targeted data tests if readiness code changes:
     - `npm.cmd test --workspace=@aif/data -- src/__tests__/index.test.ts`
   - If shared production behavior changes, run corresponding targeted tests:
     - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditSynthesisClassifier.test.ts src/__tests__/taskCompletionEvidence.test.ts`
   - Run targeted build for changed package(s):
     - `npm.cmd run build --workspace=@aif/agent`
     - plus `@aif/data` or `@aif/shared` if touched.
   - Run diff hygiene:
     - `git diff --check -- <changed-files>`

9. Gate and close-out.
   - Independent tester must return `TEST PASS` or `TEST FAIL`.
   - Independent final reviewer must return `REVIEW PASS` or `REVIEW FAIL`.
   - Write `docs/rdpi/work/work-20260513-audit-v10-false-valid-regression/result.md`.
   - Run memory sync:
     - `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-audit-v10-false-valid-regression --project aif-handoff --entity aif-handoff`
   - Update only the selected entry in `docs/intake/work_status.json` after successful gates and local memory review.

## Acceptance mapping

- Fixture first eligible text files under `.agents/**`: covered by the new git fixture.
- Deterministic repair cannot produce trusted `validated_no_findings`: covered by repaired source manifests and artifact state assertions.
- Batch readiness remains false when all source reports are weak/source-inconclusive: covered by concrete `synthesisReady === false`, blocked synthesis task, and unclaimable synthesis backlog assertions.
- Final synthesis cannot become successful `validated_no_findings`: covered by preventing synthesis release from the all-weak/source-inconclusive batch plus existing forged synthesis classifier/completion guards.
- Expected failure families and validation details are recorded: covered by source artifact assertions plus blocked synthesis task assertions.

## Independent gates

- `PLAN PASS` is required before implementation.
- `TEST PASS` is required after implementation.
- `REVIEW PASS` is required after testing.
