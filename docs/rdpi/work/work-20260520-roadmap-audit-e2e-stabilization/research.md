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
- Follow-up operator evidence for the 192.168.88.62 outage says the root cause was OOM, not network: between 2026-05-20 18:20 UTC and 2026-05-21 02:05 UTC the kernel killed `llama-server` on port `8003` 9 times, with adjacent `NVRM NV_ERR_NO_MEMORY`.
- The AIF audit workload during the outage sent long-context audit requests, about 60 inspection tool calls, retries/fallbacks, and large ledger/tool-call payloads. The runtime hardening scope must therefore prevent repeated full-context requests from retry-storming `8003`/`8005` after budget exhaustion or transport/timeout failures.
- Required runtime protections are now first-class acceptance scope: per-profile request budgets for `8003` and `8005`, per-endpoint concurrency 1, bounded tool/evidence/ledger payloads, compact-or-fail behavior after repository-inspection budget exhaustion, circuit breaker with cooldown/health check/bounded retry, upstream request cancellation on AIF timeout, and request-estimate logging.

## Risk Hypotheses

- The live server may drift from local `main` despite the recent deployment note; first live step must verify exact commit and health.
- Cleanup may still leave stale live rows if deletion happens through a path other than `DELETE /tasks/:id`.
- UI creation may double-submit or surface a different request body than API tests cover.
- A source card can validly become inconclusive when required project data/access is absent, but false `manualReviewRequired`, `source_inconclusive`, `rework_required`, or retry-loop states are system defects for this task.
- Synthesis can pass lifecycle gates while still being weak if child artifact trust state is misread or weak/discarded findings are promoted as trusted evidence.
- Existing tests include a terminal `source_inconclusive` path with `manualReviewRequired=true`; the live acceptance target requires distinguishing valid user-input blockers from false manual-review/system blockers.
- Without endpoint-level throttling and cooldown, fallback between `8003` and `8005` can amplify transient timeout/transport failures into repeated GPU memory pressure.
- Without request-size estimation and payload compaction, a successful source-inspection loop can still fail finalization by sending the model a larger context than the endpoint can safely handle.
- Without cancellation propagation, AIF stage timeout can leave an upstream llama.cpp request running after the coordinator has already scheduled retry or fallback work.

## Evidence Needed After PLAN PASS

- Server commit, service health, and container status.
- Pre-cleanup and post-cleanup live counts for `tasks`, `roadmap_batches`, `roadmap_batch_artifacts`, and `roadmap_batch_artifact_attempts` for `botIntevra`.
- UI-created audit roadmap alias, request/result evidence, created task ids, and batch id.
- Per-card status timeline, blocked reason, manualReviewRequired, retryAfter, reworkRequested, artifact state, failure family, validation details, branch/worktree/commit evidence, and activity-log snippets when a card stalls or blocks.
- Final source reports and synthesis artifact contents with evidence path/line checks and trust classification.
- Regression tests and deploy evidence for each systemic fix.
- Runtime hardening evidence: request estimate logs include profileId, baseUrl, estimated input tokens, max output tokens, tool-call count, retry count, duration, and failure class; tests prove budgets, endpoint semaphore, cooldown, bounded retry, payload compaction, and abort propagation.

## Live Evidence: auditstrong20260521oom1

- Fresh UI roadmap alias `auditstrong20260521oom1` created 7 audit tasks after deploy.
- The first source card, `Audit: architecture and ownership boundaries`, used `8005` and reached the repository-inspection budget at 60 tool calls. Request estimates stayed inside the `8005` budget and the transcript compacted to about 17k input tokens after budget exhaustion.
- The runtime then denied 3 additional repository-inspection requests and raised controlled `repository_inspection_budget_exhausted` instead of retrying a full repository context or storming between `8003` and `8005`.
- The compact ledger-writer recovery ran with `repositoryInspectionToolBudget: 0`, but timed out before writing the report artifact. Coordinator terminalized the artifact as `source_inconclusive` and blocked the task with `manual_review_required: repository_inspection_budget_exhausted`.
- System cause: the safety layer prevented the OOM-prone behavior, but recovery still depended on a model writer to create the report artifact. If that writer timed out, the workflow had no deterministic artifact finalization path and therefore blocked.

## Live Evidence: auditstrong20260521oom2

- Fresh UI roadmap alias `auditstrong20260521oom2` created 7 audit tasks after cleanup and deploy of the deterministic report-repair fallback.
- The first source card reached 60 repository-inspection calls, compacted to about 17k input tokens, denied 3 further repository-inspection requests, and then used deterministic fallback after ledger-writer timeout. The final artifact closed as trusted `validated_no_findings`.
- The security source card initially started during the endpoint cooldown opened by the previous recovery timeout. The adapter threw immediate `endpoint_cooldown`, so the task entered `blocked_external` with a short retryAfter, then the watchdog released it and a health check closed the circuit.
- The same transient `blocked_external` pattern recurred for later source cards immediately after a prior card's recovery timeout: the next card was advanced by auto-queue before the qwen-local endpoint cooldown had elapsed.
- System cause: endpoint circuit breaking correctly prevented retry storms, but the qwen-local adapter exposed short cooldown as a synchronous task failure. The coordinator/stage-error path then surfaced this expected cooldown as a card block instead of waiting for cooldown plus health check inside the bounded runtime request path.
- Independent review of the initial cooldown-wait patch found two edge cases: aborting while waiting locally for cooldown could be recorded as an endpoint failure, and concurrent waiters could health-check from stale circuit state outside endpoint serialization.
- The refined fix treats local wait aborts as cancellation rather than endpoint failure, and runs cooldown wait plus `/models` health check under the per-endpoint semaphore so reopened circuits are observed by later waiters.
