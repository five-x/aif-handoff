# Result: Split Broad Audit Requests Into Micro Report Cards

## Outcome

Implemented a shared audit decomposition classifier and wired it into direct task creation and audit roadmap generation.

Broad audit requests now require decomposed audit roadmap generation before execution. Direct audit task creation rejects broad repository, comprehensive, multi-domain, owner-grade, and unbounded audit requests with `AUDIT_DECOMPOSITION_REQUIRED`. Narrow concrete audit cards with explicit scope and report artifact are still allowed.

Audit roadmap generation now carries decomposition metadata into the prompt and requires final synthesis cards to list every source report artifact with a passed, failed, or inconclusive status. Deterministic synthesis output now includes the same child report status table.

Roadmap synthesis release now accepts explicit terminal source states (`source_inconclusive`, `terminal_inconclusive`, and `manual_exception`) without counting those artifacts as trusted valid source reports. This lets all-terminal audit batches close with an inconclusive synthesis instead of looping forever.

## Implementation Summary

- Added `classifyAuditDecompositionRequest` and exported audit decomposition types from `@aif/shared`.
- Added shared classifier tests for broad repository audits, concrete narrow audits, Russian audit phrasing, broad requests with concrete markers, and bare `Audit repository` requests with concrete markers.
- Updated `POST /tasks` to reject broad direct audit creation before persistence.
- Updated audit roadmap generation to include decomposition mode/reasons and child report status requirements in prompts, fallback content, and synthesis task descriptions.
- Updated roadmap artifact readiness so terminal source states can release synthesis while remaining outside trusted valid report counts.
- Updated deterministic audit synthesis to emit a `Child Report Status` table for passed, failed, and inconclusive child reports.

## Gate Outcomes

- `PLAN FAIL`: first independent plan review rejected the initial RDPI artifacts for leaving acceptance coverage and decomposition boundaries under-specified.
- Revision applied: tightened the design and plan around direct-task rejection, roadmap decomposition, synthesis release, deterministic output, and verification.
- `PLAN PASS`: independent plan review accepted the revised research/design/plan.
- `TEST PASS`: independent testing passed data, API, agent, lint, and build commands after implementation. The shared command initially timed out after about 124 seconds, then passed on an independent rerun with a longer timeout.
- `REVIEW FAIL`: first final review found that broad direct audits with `Scope:` and `Report artifact:` markers could bypass decomposition because the concrete-scope shortcut ran before broad-scope checks.
- Revision applied: moved broad audit signal checks before the concrete-scope/report shortcut and added shared/API regression coverage.
- `REVIEW FAIL`: second final review found that bare `Audit repository` plus concrete markers still bypassed decomposition because broad target detection was too narrow.
- Revision applied: expanded broad target detection to catch bare repository/codebase audit phrasing and added shared/API regression coverage.
- `TEST PASS`: independent shared-command rerun passed after the second review fix; the rest of the required gate commands had already passed in the same test cycle.
- `REVIEW PASS`: independent final review found no blocking or non-blocking issues after the second fix.

## Verification

Passed:

- `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditRoadmapContract.test.ts src/__tests__/auditSynthesisClassifier.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd test --workspace=@aif/data -- src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/api -- src/__tests__/tasks.test.ts src/__tests__/roadmapGeneration.test.ts`
- `npm.cmd test --workspace=@aif/agent -- src/__tests__/implementer.test.ts src/__tests__/coordinator.test.ts`
- `npm.cmd run lint`
- `npm.cmd run build`

Observed but not accepted as regressions:

- The first independent shared test command timed out at about 124 seconds. Local and independent reruns with a longer timeout passed with 107 shared tests.
- `npm.cmd run lint` and `npm.cmd run build` emitted the existing Turbo warning that no local `turbo` install was found and global `turbo 2.9.6` was used.

## Memory Sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-split-broad-audit-requests-into-micro-report-cards --project aif-handoff --entity aif-handoff` completed local review and publish.
- Report: `docs/memory/reports/work-20260513-split-broad-audit-requests-into-micro-report-cards-memsync-report.md`.
- Sync status: `success`.
- Reason: `ingested 10 shared-memory items`.
- Generated local artifacts:
  - `docs/memory/tasks/work/work-20260513-split-broad-audit-requests-into-micro-report-cards-delta.md`
  - `docs/memory/tasks/work/work-20260513-split-broad-audit-requests-into-micro-report-cards-hypotheses.md`
  - `docs/memory/projects/aif-handoff/capsule.md`
  - `docs/memory/entities/aif-handoff/capsule.md`
  - `docs/memory/decisions/decision-71269c536f8e3666.md`
  - `docs/memory/decisions/decision-8deb949f74bd1a68.md`
  - `docs/memory/decisions/decision-b2ddfe08c3130a21.md`
  - `docs/memory/decisions/decision-190cb2854f9c1421.md`
  - `docs/memory/decisions/decision-cd946189f5a56b54.md`
  - `docs/memory/decisions/decision-194a28d9a17d0678.md`
  - `docs/memory/decisions/decision-8c10682794c780fe.md`
  - `docs/memory/decisions/decision-65f896ed83a84fb9.md`
  - `docs/memory/patterns/pattern-d7fe5f03e6e71dcd.md`
  - `docs/memory/patterns/pattern-a268ded6c9ef8285.md`
