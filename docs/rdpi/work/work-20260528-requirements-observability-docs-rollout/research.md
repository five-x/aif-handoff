# Research - Requirements Observability Docs And Rollout

## Task Framing And Lane

- Task ID: `work-20260528-requirements-observability-docs-rollout`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260528-requirements-observability-docs-rollout.md`
- RDPI path: `docs/rdpi/work/work-20260528-requirements-observability-docs-rollout`
- RDPI needed: yes

This is the final hardening and rollout closure slice for the requirements lifecycle. It must not introduce the core lifecycle from scratch; it should close observability, documentation, rollout, compatibility, and regression coverage after the snapshot/stage-artifact, research/design, QA, late-question, and split-required slices.

Preflight:

- `codex-ensure-rdpi.py` returned `STATUS: ready`.
- `codex-flow-audit.py --repo .` returned `STATUS: clean`.

Boundary:

- Research used local repo files, local docs, and an independent read-only explorer subagent.
- No live services, schedulers, logs, endpoints, worker reports, runtime config reads, or shared-memory recall were used before `PLAN PASS`.

## Accepted Planning Sources Or Local Facts

Task intent and constraints:

- The intake requires structured logs/metrics for snapshot creation, stage artifact writes, question raises/resumes, QA gate decisions, split decisions, and acceptance-pack creation.
- Docs must cover architecture, API, configuration, runbook, compatibility behavior, rollout/canary guidance, rollback, and known limitations.
- Regression/e2e coverage must span Phase 2-4 paths and `AIF_REQUIREMENTS_INTAKE_ENABLED=false` compatibility.
- Raw secrets, raw user answers, and private provider output must not be written to docs or memory.

Implemented lifecycle surface found locally:

- `packages/shared/src/schema.ts` contains persisted requirements lifecycle storage: task requirement questions, requirements snapshots, stage artifacts, stage artifact attempts, and split proposals.
- `packages/shared/src/env.ts` defines rollout flags: `AIF_REQUIREMENTS_INTAKE_ENABLED` defaults true, `AIF_REQUIREMENTS_INTAKE_FOR_EXISTING_TASKS` defaults false, `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED` defaults false, `AIF_REQUIREMENTS_QA_ENABLED` defaults false, and auto-resume defaults true.
- `packages/shared/src/stateMachine.ts` routes `start_ai` to `requirements_analysis` only when requirements intake is enabled, preserving legacy planning when disabled.
- `packages/data/src/index.ts` owns durable requirements writes:
  - `createCurrentRequirementsSnapshot()` creates redacted versioned snapshots and records a requirements stage artifact attempt.
  - `recordTaskStageArtifactAttempt()` writes current and attempt records for requirements, research, design, QA, acceptance, and related artifacts.
  - `createTaskRequirementQuestionBatch()` creates question batches and moves blocking tasks to `needs_input` without storing raw answers in logs.
  - `answerTaskRequirementQuestionBatch()` updates answers and resumes to the target stage when configured.
  - `recordTaskAcceptancePack()` records the final accepted `acceptance.md` artifact.
  - `createOrReusePendingTaskSplitProposal()`, `approveTaskSplitProposal()`, and `rejectTaskSplitProposal()` persist split-required decisions.
- `packages/agent/src/coordinator.ts` flag-gates research/design and QA, emits existing task broadcasts for questions/snapshots/timeline updates, routes terminal handoff through QA when enabled, and records acceptance packs before final done handoff.
- `packages/api/src/routes/tasks.ts` exposes requirements question and snapshot APIs and rejects API-created questions/reanalysis when intake is disabled.
- `packages/api/src/routes/projects.ts` emits `roadmap:split_required` for roadmap import/generation and exposes split proposal approve/reject routes.
- `packages/web/src/hooks/useWebSocket.ts`, `packages/web/src/components/task/TaskDetail.tsx`, `packages/web/src/components/task/QuestionsPanel.tsx`, and `packages/web/src/components/layout/RoadmapDialog.tsx` already have UI/cache surfaces for questions, requirements snapshots, acceptance packs, and split proposals.

Existing tests cover many focused units:

- Requirements questions/snapshots and prompt context: `packages/data/src/__tests__/requirementsQuestions.test.ts`.
- QA gate and acceptance pack behavior: `packages/agent/src/__tests__/coordinatorQaGate.test.ts`, `packages/agent/src/__tests__/coordinatorQaGateIntakeDisabled.test.ts`, `packages/agent/src/__tests__/qaStage.test.ts`, `packages/data/src/__tests__/index.test.ts`, `packages/api/src/__tests__/tasks.test.ts`.
- Late-stage question resume: `packages/agent/src/__tests__/lateStageQuestionResume.test.ts`, `packages/agent/src/__tests__/coordinatorLateStageQuestionResume.test.ts`, `packages/web/src/__tests__/QuestionsPanel.test.tsx`.
- Split-required UI/API/data behavior: `packages/api/src/__tests__/projects.test.ts`, `packages/api/src/__tests__/roadmapGeneration.test.ts`, `packages/web/src/__tests__/RoadmapDialog.test.tsx`, `packages/data/src/__tests__/index.test.ts`.

Current gaps:

- Structured observability is inconsistent. There are activity-log entries and ad hoc `log.info` calls, but no common structured event/metric envelope for every required lifecycle decision/write.
- No dedicated metric sink exists. The pragmatic path is to emit structured log records with stable `metric` names and `requirementsLifecycleEvent` fields so operators can count lifecycle events from logs without adding a new metrics backend in this final slice.
- Docs are stale. `docs/architecture.md` still presents the older `Backlog -> Planning -> Plan Ready -> Implementing -> Review -> Done -> Verified` path and omits `requirements_analysis`, `needs_input`, `research`, `design`, and `qa`.
- `docs/api.md` omits the new requirements question/snapshot routes and several WebSocket events: `task:questions_created`, `task:needs_input`, `task:question_answered`, `task:question_batch_answered`, `task:requirements_snapshot_created`, `task:requirements_snapshot_updated`, and `roadmap:split_required`.
- `docs/configuration.md` lacks the `AIF_REQUIREMENTS_*` rollout flag matrix.
- `docs/ops/runbook.md` has only generic validation notes and no requirements lifecycle rollout/canary/rollback procedure.
- `packages/web/e2e` appears to contain perf-only specs; deterministic Phase 2-4 e2e coverage should be approximated through API/web integration tests in this slice unless a browser e2e harness already exists and is quick to extend.

## Same-Project Memory

Shared-memory recall was not used before `PLAN PASS` because the RDPI pre-plan boundary forbids shared-memory recall for planning unless explicitly waived.

Relevant same-project local memory/RDPI result artifacts were accepted as local docs:

- `docs/rdpi/work/work-20260528-requirements-snapshot-and-stage-artifacts/result.md`
- `docs/rdpi/work/work-20260528-research-design-stages/result.md`
- `docs/rdpi/work/work-20260528-qa-gate-and-acceptance-pack/result.md`
- `docs/rdpi/work/work-20260528-late-stage-question-resume/result.md`
- `docs/rdpi/work/work-20260528-roadmap-split-required/result.md`

Those results establish that the preceding implementation slices landed and that this task should remain a closure slice for docs/observability/tests.

## Cross-Project Reusable Patterns

None used. The local codebase has an existing `@aif/shared` logger and structured event patterns, so no cross-project pattern is needed.

## Rejected Or Stale Memory Candidates

- No shared-memory candidates were queried.
- Stale docs that still describe the old pipeline are treated as documentation gaps, not as authoritative behavior.
