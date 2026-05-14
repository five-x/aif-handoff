# Plan - Add Artifact Claim And Evidence Timelines

## Implementation plan

1. Add shared timeline DTO types.
   - Edit `packages/shared/src/types.ts`.
   - Define generic workflow timeline state, outcome, trust, artifact, attempt, claim, evidence link, event, and response types.
   - Export the types from `packages/shared/src/index.ts` and `packages/shared/src/browser.ts`.

2. Add adapter-only data read model.
   - Edit `packages/data/src/index.ts`.
   - Add `buildTaskWorkflowTimeline(taskId)`.
   - Map existing `roadmap_batch_artifacts`, `roadmap_batch_artifact_attempts`, and evidence-unit events into the generic DTO.
   - Return the same generic shape for non-audit tasks with empty timeline arrays.
   - Do not add tables, migrations, writes, backfills, file reads, or report parsing.

3. Add a task API endpoint.
   - Edit `packages/api/src/routes/tasks.ts`.
   - Add `GET /tasks/:id/timeline`.
   - Return `404` when the task does not exist.
   - Return the generic timeline DTO for audit and non-audit tasks.

4. Add web client and hook.
   - Edit `packages/web/src/lib/api.ts`.
   - Edit `packages/web/src/hooks/useTasks.ts`.
   - Add `getTaskTimeline(id)` and `useTaskTimeline(id)`.

5. Add structured task detail UI.
   - Add `packages/web/src/components/task/WorkflowTimelinePanel.tsx`.
   - Edit `packages/web/src/components/task/TaskDetailHeader.tsx` to add a `timeline` tab.
   - Edit `packages/web/src/components/task/TaskDetail.tsx` to render the new panel.
   - Keep primary UI labels generic and audit details secondary.

6. Add focused tests.
   - Data test: audit compatibility rows map to generic artifacts, attempts, claims, evidence, links, and events; feature/non-audit task returns an empty generic timeline.
   - API test: `GET /tasks/:id/timeline` returns audit-compatible data, non-audit generic shape, and `404` for missing tasks.
   - Web component test: populated audit-compatible timeline renders generic labels plus audit details, and a feature-shaped generic fixture renders without audit-only wording.

7. Run verification.
   - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/workflowTimeline.test.ts`
   - `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts`
   - `npm.cmd test --workspace=@aif/web -- --run src/__tests__/WorkflowTimelinePanel.test.tsx`
   - `npm.cmd run build --workspace=@aif/shared`
   - `npm.cmd run build --workspace=@aif/data`
   - `npm.cmd run build --workspace=@aif/api`
   - `npm.cmd run build --workspace=@aif/web`
   - `git diff --check`

8. Complete RDPI close-out.
   - Write `result.md` with implementation summary, verification, and gate outcomes.
   - Require independent `TEST PASS`.
   - Require independent `REVIEW PASS`.
   - Run `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-add-artifact-claim-evidence-timelines --project aif-handoff --entity aif-handoff`.
   - Update only the matching `docs/intake/work_status.json` entry after local memory review succeeds.

## Acceptance criteria

- `GET /tasks/:id/timeline` exposes a generic timeline DTO.
- Audit roadmap artifact rows appear as generic artifacts with attempt, claim, evidence, and event data.
- Inconclusive, blocked, missing, rejected, and manual exception audit states are not rendered or mapped as trusted success.
- Non-audit tasks receive the same generic DTO shape without audit-only response fields.
- The task detail UI includes a structured timeline tab.
- The UI renders audit-compatible populated data and a non-audit workflow-shaped fixture with generic primary labels.
- No generic workflow persistence tables, migrations, backfills, or writes are added.
- Existing audit behavior and tests remain compatible.

## Verification plan

- Independent plan reviewer returns `PLAN PASS` before source edits.
- Focused data, API, and web tests pass.
- Shared, data, API, and web builds pass.
- `git diff --check` passes.
- Independent tester returns `TEST PASS`.
- Independent final reviewer returns `REVIEW PASS`.
- Memory sync local review succeeds before marking the intake task done.

## Reusable patterns

- Adapter-only generic read models are acceptable when a generic persistence design is accepted but durable tables are not implemented.
- Use generic DTO vocabulary at API/UI boundaries while preserving workflow-specific details in metadata.
- Keep evidence links display-oriented unless durable claim/evidence link rows exist.
