# Result - Add Artifact Claim And Evidence Timelines

## Outcome summary

Implemented an adapter-only generic workflow timeline surface for task detail views.

- Added shared `WorkflowTimeline*` DTO types and exports.
- Added `buildTaskWorkflowTimeline(taskId)` in the data layer.
- Added `GET /tasks/:id/timeline`.
- Added web API/hook support and a task detail `Timeline` tab.
- Added `WorkflowTimelinePanel` for structured artifact, evidence, claim, attempt, and event rendering.
- Added focused data, API, and web tests for audit-compatible data, non-audit generic shape, state mapping, bounded evidence linking, and UI rendering.

The implementation intentionally does not add generic workflow persistence tables, migrations, writes, backfills, file reads, report parsing, or runtime probing. Generic timeline rows are read through an audit-compatibility adapter over existing roadmap batch artifacts, roadmap batch artifact attempts, and audit-backed evidence unit aliases.

## Review-fail revision

The first independent final review returned `REVIEW FAIL`. The revision addressed those findings:

- Non-audit timelines now return empty arrays before any compatibility evidence read, even if an audit-backed evidence unit row exists for the task id.
- Task-scoped evidence links now bind to a single primary current claim from the first compatibility artifact instead of fanning out to every current claim.
- Data tests now cover non-audit evidence suppression, multiple artifact single-link behavior, and compatibility state mappings for invalid, missing, external blocked, manual exception, expected, synthesis-not-ready, source-inconclusive, and terminal-inconclusive states.
- API tests now cover non-audit evidence suppression through `GET /tasks/:id/timeline`.

## Gate verdicts

- Plan review: `PLAN PASS`
- Test gate: `TEST PASS`
- Final review: `REVIEW PASS`
- User waivers: none

## Verification

Local verification completed before the pending test-gate rerun:

- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/workflowTimeline.test.ts`: PASS, 5 tests.
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts`: PASS.
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/WorkflowTimelinePanel.test.tsx src/__tests__/TaskDetail.test.tsx`: PASS, 41 tests.
- `npm.cmd run build --workspace=@aif/shared`: PASS.
- `npm.cmd run build --workspace=@aif/data`: PASS.
- `npm.cmd run build --workspace=@aif/api`: PASS.
- `npm.cmd run build --workspace=@aif/web`: PASS.
- `npm.cmd run lint`: PASS, with a warning that global `turbo 2.9.6` was used instead of the repo-local `^2.8.21`.
- `git diff --check -- <task files>`: PASS.
- `git diff --check`: PASS after removing trailing whitespace from empty metadata lines in `docs/memory/entities/aif-handoff/capsule.md` and `docs/memory/projects/aif-handoff/capsule.md`.

Independent tester reruns initially returned `TEST FAIL` for missing `result.md` and then for workspace-wide memory capsule trailing whitespace. After those closeout issues were fixed, the independent tester returned `TEST PASS`.

## Stable facts

- The timeline API shape is generic and available through `GET /tasks/:id/timeline`.
- Audit roadmap compatibility rows surface as generic artifacts, attempts, claims, evidence units, evidence links, and timeline events.
- Non-audit tasks receive the same generic timeline envelope with empty timeline arrays until durable generic persistence exists.
- Inconclusive, blocked, missing, rejected, manual exception, and expected compatibility states are not mapped as trusted success.
- Evidence links are display-oriented task-scoped compatibility links until durable claim/evidence link rows exist.

## Memory sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-add-artifact-claim-evidence-timelines --project aif-handoff --entity aif-handoff`: completed.
- Report: `docs/memory/reports/work-20260513-add-artifact-claim-evidence-timelines-memsync-report.md`.
- Generated local artifacts include task delta/hypotheses, updated project/entity capsules, decision documents, and pattern documents under `docs/memory/`.
- Auto-publish status: ingested generated decision and pattern documents.
