<!-- Managed by RDPI for task work-20260528-research-design-stages. -->

# Research - Research And Design Stages

## Task framing and lane

Task: `work-20260528-research-design-stages`.

Lane: `work`.

Intent: add rollout-safe research and design stages after requirements analysis and before planning. The stages must produce validated research/design artifacts, route product clarification to `needs_input`, and make planner inputs include the current requirements snapshot plus validated upstream artifacts.

Dependency: `work-20260528-requirements-snapshot-and-stage-artifacts`.

## Accepted planning sources or local facts

- Task card: `docs/intake/work/work-20260528-research-design-stages.md`.
- Governing repo instructions: `AGENTS.md`.
- Prerequisite result: `docs/rdpi/work/work-20260528-requirements-snapshot-and-stage-artifacts/result.md`.
- Parent decomposition: `docs/rdpi/work/work-20260528-requirements-intake-remaining-phases/research.md`, `design.md`, and `plan.md`.
- Independent read-only explorer findings from subagent `019e7067-39b5-78d3-b522-f098ba04159f`.

Local source facts accepted for planning:

- Current task statuses include `requirements_analysis`, `needs_input`, `planning`, `plan_ready`, `implementing`, `review`, `blocked_external`, `done`, and `verified`; no `research` or `design` status exists yet. See `packages/shared/src/types.ts:5`.
- Current coordinator stages are `requirements-analyst`, `planner`, `plan-checker`, `implementer`, and `reviewer`; no researcher/designer stage exists yet. See `packages/shared/src/types.ts:34`.
- Coordinator pipeline currently moves `requirements_analysis -> planning`. See `packages/agent/src/coordinator.ts:150`.
- The planner guard currently checks only for a current requirements snapshot or waiver before planning. See `packages/agent/src/coordinator.ts:2976`.
- Requirements analyst already preserves the Phase 1 distinction: open product questions move to `needs_input`, while clarification-cycle exhaustion moves to `blocked_external`. See `packages/agent/src/subagents/requirementsAnalyst.ts:105`.
- The current requirements snapshot and stage artifact foundation exists locally through `createCurrentRequirementsSnapshot`, `recordTaskStageArtifactAttempt`, `hasCurrentRequirementsSnapshotOrWaiver`, and `buildTaskRequirementsContextForPrompt`. See `packages/data/src/index.ts:2230`, `packages/data/src/index.ts:2390`, `packages/data/src/index.ts:2518`, and `packages/data/src/index.ts:2548`.
- Research and design already exist as requirement-question stages, but target resume currently maps unsupported stages back to `requirements_analysis` because `research` and `design` are not task statuses. See `packages/shared/src/requirementsQuestions.ts:1` and `packages/data/src/index.ts:918`.
- Planner, implementer, and reviewer already call `buildTaskRequirementsContextForPrompt`, but planner passes `planning`; the helper currently lists only artifacts for the exact requested stage, so existing `research`/`design` artifacts would be omitted from planning context. See `packages/agent/src/subagents/planner.ts:367` and `packages/data/src/index.ts:2556`.
- Existing rollout config covers Phase 1 requirements intake only: `AIF_REQUIREMENTS_INTAKE_ENABLED`, `AIF_REQUIREMENTS_MAX_QUESTIONS_PER_CYCLE`, `AIF_REQUIREMENTS_MAX_CYCLES`, and `AIF_REQUIREMENTS_AUTO_RESUME_ON_ANSWER`. See `packages/shared/src/env.ts:168`.
- Existing disabled behavior routes `start_ai` to `planning` when requirements intake is disabled. See `packages/shared/src/stateMachine.ts:63` and `packages/agent/src/coordinator.ts:299`.

## Same-project memory

No shared-memory recall was used before `PLAN PASS` because this repository's RDPI contract forbids shared-memory recall before the plan gate unless the user explicitly waives that boundary.

Local curated memory/docs search did not produce a better same-project source than the accepted RDPI and KB documents above.

## Cross-project reusable patterns

No cross-project shared-memory lookup was used before `PLAN PASS`.

Reusable local pattern to preserve: stage artifacts use a current read model plus append-only attempts, and manual exceptions are represented as `manual_exception` artifacts with justification metadata.

## Rejected or stale memory candidates

No shared-memory candidates were read or rejected.

## Scope boundaries

In scope:

- Add `research` and `design` task statuses and coordinator labels in rollout-safe form.
- Add researcher and designer runners with strict structured output parsing.
- Record accepted/rejected/blocked/manual-exception research/design stage artifact attempts using existing task stage artifact persistence.
- Route stage-local product questions through the existing requirement question batch APIs and `needs_input`.
- Update resume mapping so answered research/design questions resume the correct stage.
- Update planner prompt context and planner guard so validated research/design artifacts are included and required when the new stage flag is enabled.
- Keep the Phase 1 path unchanged when research/design stages are disabled.

Out of scope:

- QA gate, acceptance pack, late-stage question contract unification, and split-required child approval.
- UI redesign beyond status handling and existing artifact/timeline display compatibility.
- Running any child/follow-up task in the same RDPI run.

## Open questions

- Whether to expose one combined rollout flag or separate research/design flags. Planning assumption: use one combined `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED` flag with default `false`, effective only when `AIF_REQUIREMENTS_INTAKE_ENABLED=true`.
- Whether strict artifact validation failure should retry the stage or block for manual triage. Planning assumption: record a rejected artifact attempt and fail closed via existing stage error handling/manual operator flow, while missing artifacts route back to the needed stage before planner execution.

## Hypotheses

- Adding statuses requires updating shared status config/order, active pipeline counting, coordinator candidate queries, task resume mapping, UI board grouping, and affected tests.
- The narrowest runner implementation can share a generic research/design stage runner helper while keeping two coordinator labels and stage-specific prompts.
- Prompt context should include upstream stage artifacts by lifecycle order, not only exact-stage artifacts.
