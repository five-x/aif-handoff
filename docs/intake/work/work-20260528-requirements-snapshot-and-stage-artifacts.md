# Requirements Snapshot And Stage Artifacts

- Task ID: work-20260528-requirements-snapshot-and-stage-artifacts
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-28
- Due: unset
- Source: decomposition from `work-20260528-requirements-intake-remaining-phases`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260528-requirements-snapshot-and-stage-artifacts

## Request

Implement the durable foundation for requirements snapshots and stage artifacts after the Requirements Intake MVP. Add current requirements snapshot persistence, `requirements.md` generation/metadata, stage artifact current/attempt records for non-trivial work, API exposure, and UI artifact read surfaces.

## Done When

- Durable requirements snapshots exist and version task requirements without storing raw unsafe answers or secrets.
- Non-trivial tasks can expose `requirements.md`, `research.md`, and `design.md` artifact metadata through backend APIs and UI.
- Planner, implementer, reviewer, and future QA gate inputs can reference the current requirements snapshot and relevant upstream artifacts.
- Downstream stages cannot proceed without a current snapshot or an explicit documented waiver.
- Existing Phase 1 question intake behavior remains unchanged.

## Constraints

- Preserve Phase 1 behavior from `6565e2f8`.
- Keep `needs_input` distinct from `blocked_external`.
- Preserve compatibility when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- Align artifact vocabulary with the generic artifact persistence design; do not weaken audit/roadmap compatibility tables.
- Do not execute follow-up child tasks in the same run.

## Notes

This is the first implementation slice for the remaining requirements lifecycle and should be completed before research/design stages, QA, late-stage question routing, and split approval work.

## Links

- Parent RDPI: ../../rdpi/work/work-20260528-requirements-intake-remaining-phases
- Phase 1 MVP RDPI: ../../rdpi/work/work-20260528-requirements-intake-mvp
