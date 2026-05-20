# Research: Roadmap Audit E2E Stabilization

## Task

Stabilize the live `botIntevra` audit roadmap workflow end to end until two clean post-deploy runs complete without false system blockers and with trustworthy audit synthesis.

## Boundaries

- Pre-`PLAN PASS` work is local-source and local-docs research only.
- Live AIF API/UI/database/log/scheduler probing, task deletion, roadmap creation, execution, deploy, and synthesis quality review start only after the independent plan gate passes.
- The target canary project is `botIntevra`; platform fixes must remain project-agnostic and must not special-case `botIntevra`, concrete aliases, task ids, or live artifact paths.
- Raw secrets are out of scope.

## Local Facts

- Live AIF is documented at `http://192.168.88.67/` with API base `http://192.168.88.67/api`; `botIntevra` project id is `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`, root path `/home/www/botIntevra`, and host path `/srv/aif-handoff/projects/botIntevra` (`docs/ops/botintevra-remote-migration.md`).
- Deploy host is `ubuntu@192.168.88.67` using `C:\Users\apron\.ssh\codex_linux_key_5`; repository path is `/opt/aif-handoff` (`docs/ops/aif-handoff-01.md`, `docs/ops/botintevra-remote-migration.md`).
- The current worktree is clean on `main`.
- Recent local RDPI result `work-20260520-roadmap-repeat-blocker-hardening` says commit `4c30ef15` was pushed and deployed, and stale `audit-v18` live rows were deleted from `tasks`, `roadmap_batches`, `roadmap_batch_artifacts`, and `roadmap_batch_artifact_attempts`.
- `POST /projects/:id/roadmap/generate` performs intent validation, reused-alias rejection, config governance check, then claims a process-local alias lock before starting a background job. The lock is released in `.finally()` (`packages/api/src/routes/projects.ts:467`).
- `POST /projects/:id/roadmap/import` performs the same intent/reused-alias checks, uses the same alias lock, imports synchronously, wakes the coordinator for created tasks, and releases the lock in `finally` (`packages/api/src/routes/projects.ts:511`).
- `rejectReusedRoadmapAlias()` delegates to the typed workflow pack hook (`packages/api/src/services/roadmapGeneration.ts:315`). For audit imports, existing task rows and existing roadmap batch metadata both block alias reuse (`packages/api/src/services/roadmapGeneration.ts:2149`).
- Audit roadmap import forces audit defaults: full planner, review enabled, subagents enabled, diagnostic-only tags, and paused synthesis with `synthesis_not_ready` until child artifacts are ready (`packages/api/src/services/roadmapGeneration.ts:1348`, `packages/api/src/services/roadmapGeneration.ts:2236`).
- `importGeneratedTasks()` creates a roadmap batch contract with created task ids, synthesis task id, and report/synthesis artifact rows (`packages/api/src/services/roadmapGeneration.ts:2297`).
- `deleteTask()` now deletes roadmap artifact attempts, task artifacts, metadata-linked batch references, and empty batches; non-empty remaining batches are refreshed (`packages/data/src/index.ts:1442`).
- `holdSynthesisIfNotReady()` keeps synthesis blocked with batch artifact counts until `summary.synthesisReady` is true (`packages/agent/src/coordinator.ts:968`).
- Auto-queue counts terminal report/synthesis artifacts as non-active but keeps true external audit blockers active, covered by tests in `packages/data/src/__tests__/index.test.ts:3763` and `packages/data/src/__tests__/index.test.ts:3817`.
- UI Roadmap creation is handled by `packages/web/src/components/layout/RoadmapDialog.tsx`; the dialog selects `taskIntent` and calls `api.generateRoadmap()` or `api.importRoadmap()`, which map to `/projects/:id/roadmap/generate` and `/projects/:id/roadmap/import`.
- BotIntevra-like deterministic audit scope generation is already covered by `packages/api/src/__tests__/roadmapGeneration.test.ts:508`.
- Cleanup and stale metadata behavior are covered by `packages/data/src/__tests__/index.test.ts:834`, `packages/api/src/__tests__/roadmapGeneration.test.ts:1231`, and `packages/api/src/__tests__/projects.test.ts:651`.
- Strict weak-audit behavior is covered across shared and agent tests, including source inconclusive and generic-evidence repair cases in `packages/agent/src/__tests__/implementer.test.ts:3090` and `packages/agent/src/__tests__/implementer.test.ts:3522`.
- Current local code has mixed source-inconclusive terminalization paths: operator-input variants use `manualReviewRequired=false`, while some terminal source-inconclusive tests still expect `manualReviewRequired=true`. The live run must determine whether any such state is valid missing user data or a false system blocker.
- Older Plan B runbook guidance preserved/superseded old audit cards, while the latest hardening result and this task require deletion plus stale metadata cleanup. The live cleanup evidence must follow the current task acceptance criteria.

## Risk Hypotheses

- The live server may drift from local `main` despite the recent deployment note; first live step must verify exact commit and health.
- Cleanup may still leave stale live rows if deletion happens through a path other than `DELETE /tasks/:id`.
- UI creation may double-submit or surface a different request body than API tests cover.
- A source card can validly become inconclusive when required project data/access is absent, but false `manualReviewRequired`, `source_inconclusive`, `rework_required`, or retry-loop states are system defects for this task.
- Synthesis can pass lifecycle gates while still being weak if child artifact trust state is misread or weak/discarded findings are promoted as trusted evidence.
- Existing tests include a terminal `source_inconclusive` path with `manualReviewRequired=true`; the live acceptance target requires distinguishing valid user-input blockers from false manual-review/system blockers.

## Evidence Needed After PLAN PASS

- Server commit, service health, and container status.
- Pre-cleanup and post-cleanup live counts for `tasks`, `roadmap_batches`, `roadmap_batch_artifacts`, and `roadmap_batch_artifact_attempts` for `botIntevra`.
- UI-created audit roadmap alias, request/result evidence, created task ids, and batch id.
- Per-card status timeline, blocked reason, manualReviewRequired, retryAfter, reworkRequested, artifact state, failure family, validation details, branch/worktree/commit evidence, and activity-log snippets when a card stalls or blocks.
- Final source reports and synthesis artifact contents with evidence path/line checks and trust classification.
- Regression tests and deploy evidence for each systemic fix.
