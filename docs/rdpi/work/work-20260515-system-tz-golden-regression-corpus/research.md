# Research: System TZ Golden Regression Corpus

## Task framing and lane

- Task ID: `work-20260515-system-tz-golden-regression-corpus`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260515-system-tz-golden-regression-corpus.md`
- RDPI needed: yes
- Scope: build deterministic golden regression coverage for System TZ validator failure families without live server evidence.

The task is an implementation task. It may change tests, fixtures, and validator behavior after `PLAN PASS`, but not before.

## Accepted planning sources or local facts

- `AGENTS.md` requires local repo facts first, RDPI gates, independent `PLAN PASS`, `TEST PASS`, `REVIEW PASS`, and no task close-out before successful memsync.
- `.agents/skills/runtask/SKILL.md` selects and executes one queued intake task, runs RDPI preflight, and updates only the matching intake status entry after successful close-out.
- `.agents/skills/rdpi/SKILL.md` requires planning-only `research.md`, `design.md`, and `plan.md` before `PLAN PASS`; implementation and live evidence are not allowed before the plan gate.
- `docs/kb/system-tz-contract-inventory-freeze.md` is the accepted Phase 0 planning source for System TZ tasks. It freezes current task intent, plan quality, completion evidence, audit validator, memory, runtime, permission, and timeline surfaces and says future changes must preserve fail-closed behavior.
- `docs/rdpi/work/work-20260515-system-tz-development-evidence-completion-guard/result.md` records the current development guard: implementation manifests bind task id, plan manifest hash, changed files, dirty files, verification evidence, acceptance evidence, checklist state, review closure, and fix regression explanation.
- `packages/shared/src/__tests__/fixtures/auditContractCorpus.ts` already contains a deterministic audit fixture repository plus invalid/valid report cases and manifest mutation builders.
- `packages/shared/src/__tests__/auditContractCorpus.test.ts` already validates invalid audit reports, valid no-findings/findings reports, source-report synthesis classification, and manifest-backed mutations for evidence refs, source snapshots, scope ids, risk ids, line refs, no-findings reasoning, and command evidence.
- `packages/shared/src/implementationManifest.ts` validates development implementation manifests for task binding, approved plan hash, changed file parity, dirty file coverage, verification evidence, acceptance evidence, checklist drift, review closure evidence, and fix regression explanation.
- `packages/shared/src/taskCompletionEvidence.ts` runs task-intent changed-file checks and delegates development implementation evidence validation during review handoff and completion.
- `packages/shared/src/taskIntent.ts`, `packages/shared/src/planQuality.ts`, `packages/shared/src/permissionPolicy.ts`, `packages/shared/src/auditReportValidator.ts`, and `packages/shared/src/auditSynthesisClassifier.ts` are the primary shared validator surfaces for this task.
- `packages/data/src/__tests__/workflowTimeline.test.ts`, `packages/data/src/__tests__/runtimeProfileResolution.test.ts`, and memory tests in `packages/data/src/__tests__/index.test.ts` already cover timeline, runtime resolution, and redaction behavior. The System TZ corpus must add or run deterministic coverage for these named targets unconditionally, not treat them as optional.
- Static inspection found no need for live server, scheduler, endpoint, log, worker-report, downstream runtime/config, or shared-memory probing before `PLAN PASS`.

## Same-project memory

- Local memory documents under `docs/memory/` were treated as repository artifacts, not shared-memory recall.
- `docs/memory/tasks/work/work-20260515-system-tz-development-evidence-completion-guard-delta.md` is available but contains no additional reusable facts beyond the RDPI result.
- `docs/memory/tasks/work/work-20260515-system-tz-contract-inventory-freeze-delta.md` records that generic timeline and trust rollup surfaces are compatibility read models over audit/roadmap/evidence rows.
- Shared-memory server recall was not used before `PLAN PASS` because the RDPI boundary forbids it unless explicitly waived.

## Cross-project reusable patterns

- No cross-project reusable memory was queried before `PLAN PASS`.
- Reusable local pattern: keep golden corpus fixtures deterministic, redacted, source-backed, and close to the validators they exercise.

## Rejected or stale memory candidates

- Stale API docs, MCP docs, or UI assumptions are not accepted as runtime truth where static code disagrees.
- Existing per-validator tests are useful coverage, but they are not a named System TZ golden corpus by themselves; the task requires an explicit corpus/mutation strategy tied to known failure families.

## Open questions

- Whether the corpus should eventually become a package-public test utility or remain test-only. Planning assumption: keep it test-only for now.
- Whether memory and runtime coverage should duplicate existing data/API tests or be represented by corpus metadata plus targeted smoke assertions. Planning assumption: add only narrow tests where the corpus catches a current validator gap.

## Hypotheses

- H1: Extending the existing audit corpus with exact System TZ failure-family IDs is lower risk than introducing a second audit fixture system.
- H2: A focused shared golden corpus can cover plan, implementation, audit, permission, and review closure validators without broad production changes.
- H3: Passed implementation verification that lacks output identity is a real corpus gap; strengthening `validateImplementationManifest` to require output hash and preview for passed verification will make `tests_no_run_output` and mutation coverage meaningful.
- H4: Data-layer memory, runtime, and timeline coverage can remain targeted because the relevant surfaces already have focused tests, but this task still needs unconditional deterministic corpus tests or commands for those named targets. The corpus should not force new generic persistence or change compatibility sources.
