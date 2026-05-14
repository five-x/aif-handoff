# Result - Move Audit Roadmap Hooks Behind Workflow Pack

## Outcome

Moved audit roadmap generation and import ownership behind workflow-pack keyed API hooks while preserving the existing public roadmap service API.

The shared workflow pack registry remains the source of pack identity and generated-task validation. The API service now has a local roadmap workflow-pack extension resolver keyed by shared `TaskIntent`; audit-specific roadmap behavior is attached to the audit pack hook set, while generic and non-audit typed roadmaps continue through the existing generic path.

## Changed Files

- `packages/api/src/services/roadmapWorkflowPacks.ts`: added the API-local hook resolver keyed by shared workflow-pack identity.
- `packages/api/src/services/roadmapGeneration.ts`: routed audit request guards, audit prompt/fallback/conversion, batch validation, reused-alias handling, import defaults, artifact collection, synthesis blocking, and batch summary creation through the audit roadmap hook.
- `packages/api/src/routes/projects.ts`: replaced the route-local audit alias reuse helper with the hook-backed roadmap alias guard.
- `packages/api/src/__tests__/roadmapGeneration.test.ts`: added coverage proving reused audit alias checks use the hook path and feature imports remain non-audit.
- `docs/kb/workflow-contract-pack-registry.md`: documented the roadmap hook ownership boundary and API-local extension rationale.
- `docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack/research.md`, `design.md`, and `plan.md`: replaced managed placeholders with task-specific RDPI planning artifacts.

## Gate Outcomes

- `PLAN PASS`: independent plan reviewer accepted the scope and boundary.
- `TEST PASS`: independent tester reran all planned verification commands successfully.
- `REVIEW PASS`: independent final reviewer found no critical, high, medium, or low severity issues.

## Verification

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskIntent.test.ts src/__tests__/auditRoadmapContract.test.ts` passed.
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/roadmapGeneration.test.ts src/__tests__/projects.test.ts` passed.
- `npm.cmd run build --workspace=@aif/shared` passed.
- `npm.cmd run build --workspace=@aif/api` passed.
- `npm.cmd run lint --workspace=@aif/shared` passed.
- `npm.cmd run lint --workspace=@aif/api` passed.
- `git diff --check` passed.

## Scope Boundaries

No database schema, generic artifact persistence, audit evidence ledger rename, UI/API timeline work, finance pack, analytics pack, or new real workflow pack was introduced.

Feature typed roadmap imports remain non-audit and do not receive audit-only diagnostic tags or batch summaries.

## Memory Sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-move-audit-roadmap-hooks-behind-pack --project aif-handoff --entity aif-handoff` completed.
- Report: `docs/memory/reports/work-20260513-move-audit-roadmap-hooks-behind-pack-memsync-report.md`.
- Generated local task artifacts:
  - `docs/memory/tasks/work/work-20260513-move-audit-roadmap-hooks-behind-pack-delta.md`
  - `docs/memory/tasks/work/work-20260513-move-audit-roadmap-hooks-behind-pack-hypotheses.md`
- Auto-publish status: ingested generated decision and pattern documents.
