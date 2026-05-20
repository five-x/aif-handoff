# Result: Roadmap Repeat Blocker Hardening

## Outcome

Implemented systemic hardening for repeat audit roadmap/card blockers:

- duplicate generate/import requests for the same project + roadmap alias are rejected while a job is in flight;
- reused audit aliases are rejected when stale roadmap batch metadata exists, even if task rows were already deleted;
- task deletion now cleans roadmap batch artifacts, artifact attempts, metadata-linked batches, metadata-only batches, and empty batches;
- the roadmap dialog prevents same-tick duplicate submit before React state disables the action;
- deterministic audit report validation exhaustion remains fail-closed as `blocked_external`/`source_inconclusive`, but now asks for concrete operator input instead of setting `manualReviewRequired`.

The change does not mark weak or inconclusive audit output as done. It keeps invalid audit evidence blocked until the user supplies missing scope/evidence/operator decision.

## Verification

- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts` passed.
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/roadmapGeneration.test.ts src/__tests__/projects.test.ts` passed.
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts` passed.
- `npm.cmd run build` passed.
- `npm.cmd run lint` passed.
- `npm.cmd test` passed.

## Gates

- `PLAN PASS`: received after revising the plan for `finally` lock release, retry-after-release coverage, fail-closed assertions, and stale-batch cleanup precedence.
- `TEST PASS`: independent tester verdict received.
- `REVIEW PASS`: independent final reviewer verdict received.

## Deployment

- Commit `4c30ef15` was pushed to `origin/main`.
- Server `192.168.88.67` was updated from `f4c1870` to `4c30ef1` in `/opt/aif-handoff`.
- `docker compose build api agent web` passed on the server.
- `docker compose up -d api agent web` restarted the changed services.
- Server health checks passed: `http://192.168.88.67/api/health` returned `{"status":"ok"}` and `http://192.168.88.67:3100/health` returned `{"status":"ok"}`.
- `docker compose ps api agent web mcp` showed all four services running.

## Live Cleanup

- Deleted the 7 stale `audit-v18` botIntevra cards that were created before this deploy.
- Verified `GET /api/tasks?projectId=e4a3a101-ec7f-4f93-9b68-e297ffe8952f` returned 0 tasks after cleanup.
- Verified the live database had no remaining `audit-v18` rows in `tasks`, `roadmap_batches`, `roadmap_batch_artifacts`, or `roadmap_batch_artifact_attempts`.

## Memory Sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260520-roadmap-repeat-blocker-hardening --project aif-handoff --entity aif-handoff` completed local artifact generation.
- Report: `docs/memory/reports/work-20260520-roadmap-repeat-blocker-hardening-memsync-report.md`.
- Final memsync publish status: `skipped`, because there were no publishable curated documents after pre-implementation facts were labeled as historical.
- A corrective shared-memory short fact was added so any earlier remembered pre-fix state is superseded by the new hardened behavior.
