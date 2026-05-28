<!-- Managed by RDPI for task work-20260528-requirements-intake-remaining-phases. -->

# Design

## Chosen design

Treat this umbrella task as an accepted decomposition gate, not as a monolithic implementation task.

The implementation for this run is limited to:

- accepted RDPI research/design/plan artifacts;
- queued child intake cards for the remaining Requirements Intake lifecycle slices;
- empty RDPI scaffolds for those child cards;
- result and memory-review artifacts after gates pass;
- matching intake status/index updates.

No source code, database migration, runtime behavior, API route, UI component, or documentation implementation will be changed by this umbrella task.

## Why decomposition is required

The requested Done When spans every platform layer:

- shared task statuses, events, snapshot/artifact types, env flags, and schema migrations;
- data repositories and timeline/trust projections;
- API routes, event handling, WebSocket broadcasts, and roadmap import behavior;
- coordinator stages and five downstream agent contracts;
- web task detail, artifact, QA, done acceptance, and split approval UI;
- docs, rollout, compatibility mode, and broad regression/e2e coverage.

Running this as one implementation pass would couple schema design, orchestration changes, UI changes, and QA/decomposition policy in a way that is hard to review or roll back. The intake card explicitly permits splitting during the RDPI plan if the scope is too large for one safe run.

## Target implementation order

Child tasks should run in dependency order:

1. `work-20260528-requirements-snapshot-and-stage-artifacts`
   - Own durable requirements snapshot persistence, `requirements.md` generation, stage artifact current/attempt records, API metadata, artifact UI read surface, and planner/implementer/reviewer snapshot gate wiring.
   - Must align with the generic artifact persistence vocabulary in `docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/design.md`.

2. `work-20260528-research-design-stages`
   - Own researcher/designer coordinator stages, strict output contracts, artifact validation gates, prompts referencing requirements snapshots and upstream artifacts, and resume behavior after stage-local questions.
   - Depends on child task 1 because research/design outputs need durable stage artifact persistence.

3. `work-20260528-qa-gate-and-acceptance-pack`
   - Own `qa` status/field contracts, QA runner, `qa.md`, command evidence and skip-risk records, `review -> qa -> done`, acceptance/result pack, and done acceptance UI.
   - Depends on child task 1 for artifact persistence and should consume research/design artifacts from child task 2 when available.

4. `work-20260528-late-stage-question-resume`
   - Own a unified `raise_questions` contract for research/design/planning/implementation/review/QA, target-resume-stage mapping, and prevention of product-clarification waits being modeled as `blocked_external`.
   - Depends on the stage/status model from children 2 and 3.

5. `work-20260528-roadmap-split-required`
   - Own `split_required`, proposed child task persistence, controlled approval UI/API, parent/child creation, and roadmap import integration.
   - Depends on existing hierarchy support and should avoid executing generated child tasks in the same flow that proposes them.

6. `work-20260528-requirements-observability-docs-rollout`
   - Own structured logs/metrics, final env/feature flag documentation, architecture/API/runbook updates, compatibility behavior when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`, and full regression/e2e closure across the prior child tasks.
   - Runs last as the rollout and documentation hardening pass.

## Child card contract

Each child card must:

- keep `RDPI Needed: yes`;
- preserve Phase 1 behavior from `6565e2f8`;
- keep `needs_input` distinct from `blocked_external`;
- preserve human-only `verified`;
- preserve `AIF_REQUIREMENTS_INTAKE_ENABLED=false` compatibility unless the child explicitly adds a narrower flag;
- forbid execution of any derived grandchild task in the same run;
- include targeted unit/integration/UI/e2e expectations for its slice.

## Parent close-out semantics

Closing this umbrella as done means only that the remaining feature work has been researched, designed, planned, and decomposed into queued child tasks. It does not mean the full Requirements Intake lifecycle is implemented.

The result artifact must state this explicitly so later operators do not mistake the umbrella status for feature completion.

## Pre-implementation boundary

Before `PLAN PASS`, only this task's RDPI artifacts are changed. Child intake cards, child RDPI scaffolds, result artifacts, memory artifacts, and status/index updates are created only after the independent plan review accepts this decomposition design.
