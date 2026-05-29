<!-- Managed by RDPI for task work-20260528-qa-gate-and-acceptance-pack. -->

# Result - QA Gate And Acceptance Pack

## Outcome

Implemented the post-review QA gate and persisted acceptance pack for requirements-intake tasks.

The new QA path is guarded by `AIF_REQUIREMENTS_QA_ENABLED=false` by default and only activates when requirements intake is also enabled. With QA enabled, accepted review and skip-review implementation paths route through `qa` before `done`; with QA disabled, existing review-to-done behavior is preserved.

## Implemented Changes

- Added shared `qa` task status and coordinator stage, plus acceptance-pack and QA metadata types.
- Added `AIF_REQUIREMENTS_QA_ENABLED` with default `false`.
- Added QA task queue/status coverage across coordinator candidates, active counts, stale in-progress handling, branch-bound active checks, and task responses.
- Added a QA runner that requires exactly one `aif-qa-artifact` JSON fence, validates mandatory check IDs, and blocks failed or malformed QA output fail-closed.
- Added QA source fingerprints bound to requirements snapshot/waiver state, implementation manifest, changed files, review comments, review iteration, skip-review state, auto-review state, plan manifest, and mandatory inventory hash.
- Added mandatory QA inventory from implementation verification evidence, review findings, and completion guards.
- Added fresh-QA validation that rechecks accepted QA artifact metadata against current mandatory inventory before allowing close-out.
- Added persisted acceptance pack generation before `done`, bound to the accepted QA artifact and current source fingerprint.
- Added fail-closed acceptance-pack freshness validation for complete ready metadata and non-empty markdown.
- Added API `approve_done` enforcement so verified approval requires fresh QA and acceptance artifacts when QA is enabled.
- Added web QA status/column support and an acceptance tab/readiness display for completed tasks.

## Gate Outcomes

- `PLAN FAIL`: initial plan review rejected the plan because scope and validation coverage were underspecified.
- `PLAN FAIL`: second plan review still required tighter QA artifact, freshness, and acceptance-pack semantics.
- `PLAN PASS`: revised plan passed independent review.
- Initial `TEST PASS` was invalidated by post-review fixes.
- Initial `REVIEW FAIL`: reviewer found that synthetic missing-verification checks could be falsely passed, fresh QA validation trusted state/fingerprint alone, and coordinator/API/web coverage was incomplete.
- Second `REVIEW FAIL`: reviewer found accepted acceptance artifacts were not validated for complete ready metadata and coordinator QA edge-case coverage was still incomplete.
- Final `TEST PASS`: independent tester passed after all fixes.
- Final `REVIEW PASS`: independent reviewer passed after all fixes.

## Review Fixes

- Marked missing verification evidence as a blocked mandatory inventory item and made QA unable to pass when completion-guard inventory is present.
- Revalidated accepted QA artifacts against current mandatory inventory, exact mandatory IDs, passed statuses, command matches, and blocked inventory state.
- Added coordinator regression tests for `skipReview -> qa`, direct-done prevention when QA writes no artifact, stale QA artifact blocking, QA-blocked output, and missing verification evidence.
- Added API regression tests for QA-enabled `approve_done` rejection with missing or malformed acceptance evidence and approval with valid fresh evidence.
- Added acceptance-pack metadata validation before treating an accepted acceptance artifact as fresh.
- Added web acceptance rendering coverage.

## Verification

Passed:

- `npm.cmd test --workspace=@aif/agent -- coordinatorQaGate.test.ts qaStage.test.ts coordinatorQaGateIntakeDisabled.test.ts`
- `npm.cmd test --workspace=@aif/api -- tasks.test.ts`
- `npm.cmd test --workspace=@aif/data -- index.test.ts pause.test.ts`
- `npm.cmd test --workspace=@aif/shared -- env.test.ts schema.test.ts stateMachine.test.ts`
- `npm.cmd test --workspace=@aif/web -- TaskDetail.test.tsx`
- `npm.cmd run build`
- `npm.cmd run lint`
- `npm.cmd test`
- `git diff --check`

Independent tester also ran uncached root verification:

- `npm.cmd run build -- --force`
- `npm.cmd run lint -- --force`
- `npm.cmd test -- --force`

Notes:

- `npm.cmd run lint` exited 0 with an existing non-fatal warning in `packages/agent/src/subagents/reviewer.ts:1341`.
- Agent tests emitted expected local notifier fetch failures to `localhost:3009`; tests passed.
- No browser/manual UI check was run; coverage is through focused web tests, full build/test, and independent gates.

## Memory Sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260528-qa-gate-and-acceptance-pack --project aif-handoff --entity aif-handoff` completed.
- Report: `docs/memory/reports/work-20260528-qa-gate-and-acceptance-pack-memsync-report.md`.
- Sync status: `skipped`.
- Reason: `no publishable curated documents`.
- Generated local artifacts include the task delta, project capsule, entity capsule, and memory sync report.
