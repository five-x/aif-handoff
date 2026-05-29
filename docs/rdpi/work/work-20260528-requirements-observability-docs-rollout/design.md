# Design - Requirements Observability Docs And Rollout

## Goal

Close the final requirements lifecycle rollout slice without changing core lifecycle semantics:

- add consistent structured observability for required lifecycle writes/decisions;
- document the lifecycle in architecture, API, configuration, and runbook docs;
- add focused regression coverage for Phase 2-4 happy paths and disabled-intake compatibility;
- record known limitations with follow-up references instead of hiding them in code comments.

## Observability Design

Use structured application logs as the metric carrier. No dedicated metrics sink exists in the repo, and adding a backend would expand this closure task beyond the intake scope. Each required lifecycle point should emit a stable log object with:

- `requirementsLifecycleEvent`: a stable event name;
- `metric`: a stable counter-like metric key, for example `aif_requirements_snapshot_created_total`;
- non-secret dimensions such as `taskId`, `projectId`, `stage`, `kind`, `state`, `attemptNumber`, `batchId`, `proposalId`, `roadmapAlias`, `decision`, `sourceKind`, `status`, counts, and booleans;
- no raw user answers, raw provider output, raw question text, raw roadmap content, or secrets.

Implement a small helper in `@aif/shared` to build the event envelope and export its event-name type. Use it from data/API/agent code so tests can assert stable keys without depending on Pino internals.

Required coverage mapping:

- Snapshot creation: log from `createCurrentRequirementsSnapshot()` after the snapshot and artifact attempt persist.
- Stage artifact writes: log from `recordTaskStageArtifactAttempt()` after the attempt row persists.
- Question raises/resumes: log from `createTaskRequirementQuestionBatch()` for created/deduped batches and from `answerTaskRequirementQuestionBatch()` for resume decisions.
- QA gate decisions: log from coordinator QA routing/blocking/acceptance-pack handoff points.
- Split decisions: log from split proposal create/reuse/conflict, approve, reject, already-approved/rejected, and conflict paths.
- Acceptance-pack creation: log from `recordTaskAcceptancePack()` after accepted `acceptance.md` persists.

## Documentation Design

Update existing docs rather than creating a separate hidden requirements guide:

- `docs/architecture.md`
  - Add requirements lifecycle stages to the agent pipeline.
  - Explain persisted snapshot/stage artifact/QA/acceptance/split-proposal records.
  - Update real-time events and database table descriptions.
- `docs/api.md`
  - Add requirements question and snapshot REST endpoints.
  - Add split proposal approve/reject endpoints if missing from the roadmap section.
  - Update task statuses and WebSocket event table for requirements lifecycle events.
  - Document compatibility behavior when intake is disabled.
- `docs/configuration.md`
  - Add `AIF_REQUIREMENTS_*` flags, defaults, rollout posture, compatibility matrix, and log/metric keys.
- `docs/ops/runbook.md`
  - Add enable/canary/verify/rollback guidance.
  - Include deterministic validation commands.
  - List known limitations with follow-up references.

## Test Design

Focused tests should prove stable behavior without a live LLM/runtime:

- Shared helper test for event/metric envelope construction and no accidental raw payload requirements.
- Data tests for structured lifecycle event emission around snapshot creation, stage artifact writes, question raise/resume, split proposal decisions, and acceptance-pack creation.
- Agent coordinator tests for QA gate structured decision logging and disabled-intake compatibility.
- API tests for documented disabled-intake behavior and split/question/snapshot route contracts where existing coverage is thin.
- Web tests for requirements event cache invalidation/UI surfaces if existing assertions do not already cover the closure path.

Full browser e2e is not required unless the existing harness can run deterministically without live runtime. The regression evidence should explicitly state that live runtime end-to-end was not run and that Phase 2-4 behavior is covered by deterministic package-level integration tests.

## Compatibility Design

Preserve current flag defaults and routing:

- `AIF_REQUIREMENTS_INTAKE_ENABLED=false`: `start_ai` routes backlog tasks to legacy planning; requirement question creation/reanalysis rejects or blocks without question rows.
- `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED=false`: requirements analysis flows to planning after snapshot/waiver.
- `AIF_REQUIREMENTS_QA_ENABLED=false`: review/skip-review can flow to done without QA/acceptance pack.
- `AIF_REQUIREMENTS_INTAKE_FOR_EXISTING_TASKS=false`: existing tasks are not forcibly migrated into intake during rollout.

Docs and logs must make these compatibility paths visible; implementation must not make research/design or QA default-on.

## Non-Goals

- Do not add new requirements schema tables unless a test proves the existing schema cannot support observability.
- Do not add a new metrics backend.
- Do not run live LLM/provider lifecycle e2e.
- Do not create or execute follow-up tasks in this same run.
- Do not alter Phase 1 behavior from the baseline or disabled-intake compatibility.
