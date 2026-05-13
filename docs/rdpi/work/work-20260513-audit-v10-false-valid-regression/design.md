# Design - Audit V10 False Valid Regression

## Objective

Add a narrow end-to-end regression canary that recreates the audit-v10 false-valid class and proves the current containment chain fails closed:

- source report tasks declare `Scope: .`;
- the repository fixture makes hidden `.agents/**` files the first eligible text-like files a broad traversal would encounter;
- deterministic repair cannot convert those hidden files into trusted `validated_no_findings`;
- weak/source-inconclusive source reports do not become trusted synthesis inputs;
- final synthesis cannot become successful `validated_no_findings` from weak source reports.

## Scope

Planned code scope:

- Primary: `packages/agent/src/__tests__/implementer.test.ts`
- Possible only if the canary exposes a true contract gap:
  - `packages/agent/src/subagents/implementer.ts`
  - `packages/data/src/index.ts`
  - `packages/data/src/__tests__/index.test.ts`
  - `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`

The first implementation attempt should be test-only. Production changes are allowed only if the canary proves the current behavior still permits the false-valid class.

## Fixture shape

Create a deterministic git-backed fixture in the agent implementer tests:

1. Initialize a repository.
2. Create hidden tooling files before product files in lexical traversal order:
   - `.agents/skills/audit.md`
   - `.agents/tools/checklist.md`
3. Create one small product file, for example `src/app.ts`, so the fixture is not an empty product repository.
4. Create multiple source audit report artifacts, for example:
   - `audit/source-a.md`
   - `audit/source-b.md`
5. Each source task description includes:
   - `Scope: .`
   - a risk hypotheses section or audit context sufficient to demonstrate that broad root scope is the failure trigger.
   - the report artifact path.
6. Each initial source report cites hidden `.agents/**` path-line evidence and claims no findings or candidate findings.
7. Create a roadmap batch with both source report artifacts and one synthesis artifact.

## Expected source repair behavior

For each source report task:

- run deterministic report repair via `runImplementer()`;
- assert repaired report includes `Audit source inconclusive.`;
- assert repaired report does not cite `.agents/**` as product evidence;
- assert the manifest outcome is `source_inconclusive`;
- assert manifest `noFindingsClaims` is empty;
- assert the batch artifact state/failure family/classification is `source_inconclusive`;
- assert trusted valid report count remains zero.

## Expected batch and synthesis behavior

The canary should assert the concrete readiness predicate, not only trust counts:

- `listValidatedRoadmapReportArtifacts(batchId)` returns an empty list.
- `summarizeRoadmapBatch(batchId).counts.valid` remains `0`.
- `summarizeRoadmapBatch(batchId).synthesisReady` remains `false`.
- the persisted roadmap batch readiness remains false after artifact updates.
- the synthesis task remains paused or blocked with `synthesis_not_ready`.
- `claimBacklogTaskForAdvance(synthesisTaskId)` returns `false`.
- no deterministic synthesis rework is run from an all-weak/source-inconclusive source batch.

If current production behavior marks the batch ready when all source reports are terminal but non-trusted, change the data-layer readiness contract in `packages/data/src/index.ts` so non-synthesis source artifacts are ready only when they count as trusted valid report artifacts. Update the existing data tests that currently expect terminal invalid/source-inconclusive source artifacts to release synthesis readiness.

## Diagnostics

The canary should record expected failure families and validation details in assertions:

- source artifact failure family: `source_inconclusive`;
- source validation details include `auditReportValidation.sourceClassification = "source_inconclusive"`;
- deterministic repair details include reasons such as broad/no concrete scope and hidden evidence rejection;
- batch summary remains `synthesisReady: false` with zero trusted valid reports;
- synthesis task remains blocked as `synthesis_not_ready`.

## Constraints

- No live model calls.
- Keep the canary deterministic and CI-suitable.
- Do not create or execute child intake tasks.
- Preserve unrelated dirty worktree changes.
- Do not query shared memory or runtime-visible evidence before `PLAN PASS`.
