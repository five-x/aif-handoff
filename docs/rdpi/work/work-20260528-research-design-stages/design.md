<!-- Managed by RDPI for task work-20260528-research-design-stages. -->

# Design - Research And Design Stages

## Chosen design

Add research/design as optional lifecycle stages controlled by a new rollout flag:

- `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED=false` by default.
- The flag is effective only when `AIF_REQUIREMENTS_INTAKE_ENABLED=true`.
- Disabled behavior remains the current Phase 1 path: `requirements_analysis -> planning`.
- Enabled behavior becomes `requirements_analysis -> research -> design -> planning`.

This keeps Phase 1 safe by default while allowing the new stages to be tested independently.

## Stage and status model

Add task statuses:

- `research`
- `design`

Add coordinator stages:

- `researcher`
- `designer`

Map both coordinator stages to the existing planner runtime profile/mode. They are analysis/planning stages, not implementation or review stages.

Update status ordering, board grouping, active-pipeline counts, branch-bound active checks, coordinator candidate queries, lock-stage typing, and question resume status mapping so `research` and `design` behave like non-terminal in-progress stages.

## Runner contract

Create a shared helper for research/design runners, with thin stage-specific entry points:

- `runResearcher(taskId, projectRoot)`
- `runDesigner(taskId, projectRoot)`

Each runner builds a prompt from:

- task title/description/comments;
- current requirements snapshot or waiver;
- upstream accepted artifacts;
- explicit instructions to return exactly one fenced `aif-stage-artifact` JSON block.

The strict output contract should be versioned:

```json
{
  "version": 1,
  "stage": "research",
  "status": "accepted",
  "summary": "Short artifact summary.",
  "markdown": "# Research\n\n...",
  "questions": []
}
```

Allowed `stage` values: `research`, `design`.

Allowed `status` values:

- `accepted`: persist the artifact as accepted/trusted and allow downstream progress.
- `questions`: create a blocking requirement-question batch and move the task to `needs_input`.
- `blocked`: record a blocked artifact attempt and block via existing stage error/manual operator path.

Validation requirements:

- The fenced JSON block must exist exactly once.
- `version` must be `1`.
- `stage` must match the runner.
- `summary` must be non-empty.
- `markdown` must be non-empty for `accepted`.
- `questions` entries must include non-empty `question` and `whyNeeded`; product questions use `blocking=true`, `stage=<current stage>`, and `targetResumeStage=<current stage>`.

## Artifact persistence and gates

Use existing `recordTaskStageArtifactAttempt` for both current artifact state and append-only attempts.

Add data-layer read/gate helpers:

- `hasAcceptedTaskStageArtifactOrWaiver(taskId, stage, kind)`
- `getTaskStageArtifactGateState(taskId, requirements)`

Gate rules:

- `accepted` artifacts satisfy the gate.
- `manual_exception` artifacts satisfy the gate only when metadata contains a non-empty waiver justification.
- `missing`, `rejected`, `blocked`, `inconclusive`, and `expected` do not satisfy the gate.
- When research/design stages are enabled, planner execution requires both `research/research` and `design/design` gates to pass, in addition to the current requirements snapshot or waiver.

Planner guard behavior:

- Missing requirements snapshot or waiver routes to `requirements_analysis`.
- Missing/invalid research routes to `research`.
- Missing/invalid design routes to `design`.
- The guard clears stale external-block fields and appends an activity-log explanation.
- It does not use `needs_input` directly and does not use `blocked_external` for missing artifacts.

## Prompt linkage

Change requirements prompt context to include upstream artifacts by lifecycle order.

Expected prompt artifact inclusion:

- `research` runner: requirements snapshot/waiver.
- `design` runner: requirements snapshot/waiver plus accepted research artifact metadata.
- `planning` runner: requirements snapshot/waiver plus accepted research and design artifact metadata.
- `implementing` and `review`: requirements snapshot/waiver plus accepted research/design artifact metadata.

This fixes the current exact-stage filter where a planner context for `planning` would omit `research` and `design` artifacts.

## Coordinator integration

Implementation can either make the pipeline dynamic or keep static transitions with dynamic post-run handoff:

- With research/design disabled: requirements analyst success transitions to `planning`.
- With research/design enabled: requirements analyst success transitions to `research`.
- Researcher success transitions to `design`.
- Designer success transitions to `planning`.
- Planner continues to `plan_ready`.

Generalize the coordinator's runner-updated-status handling beyond only `requirements-analyst` so research/design runners can move a task to `needs_input` or `blocked_external` without being overwritten by the generic success transition.

Broadcasts:

- Reuse `task:questions_created` and `task:needs_input` when a runner creates questions.
- Reuse `task:timeline_updated` when stage artifacts are recorded.
- Use `task:moved` for status changes as today.

## Compatibility and safety

- Do not change `AIF_REQUIREMENTS_INTAKE_ENABLED=false` behavior.
- Do not route product clarification to `blocked_external`.
- Do not add generic human events that move tasks out of `needs_input`; answers continue through question APIs.
- Do not execute QA, split-required, or acceptance-pack follow-up work.
- Do not write research/design output into audit roadmap tables.

## Pre-PLAN boundary

Before `PLAN PASS`, only `research.md`, `design.md`, and `plan.md` for this task may be edited. No source code, tests, docs, runtime probing, service checks, shared-memory recall, or live endpoint checks are part of the pre-plan phase.

## Decision candidates

- `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED` as a conservative combined rollout flag.
- Reusable stage-artifact runner contract: one fenced JSON block, versioned schema, accepted/questions/blocked outcomes, and stage-local question routing.
