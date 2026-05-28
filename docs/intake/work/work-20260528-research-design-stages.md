# Research And Design Stages For Requirements Intake

- Task ID: work-20260528-research-design-stages
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-28
- Due: unset
- Source: decomposition from `work-20260528-requirements-intake-remaining-phases`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260528-research-design-stages

## Request

Add research and design stages to the requirements intake lifecycle. Implement coordinator stages, runners, strict output contracts, artifact validation gates, and prompt linkage so planning receives the current requirements snapshot plus validated research/design artifacts.

## Done When

- Research and design stages exist behind rollout-safe configuration.
- Research/design runners produce validated artifacts and can raise structured blocking questions.
- Planner inputs reference requirements, research, and design artifacts.
- Research/design artifacts block downstream progress when missing or invalid unless an explicit waiver is recorded.
- Existing Phase 1 requirements behavior remains unchanged when research/design stages are disabled.

## Constraints

- Depends on `work-20260528-requirements-snapshot-and-stage-artifacts`.
- Preserve Phase 1 behavior from `6565e2f8`.
- Keep product clarification in `needs_input`, not `blocked_external`.
- Preserve compatibility when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- Do not execute follow-up child tasks in the same run.

## Notes

This slice should define the stage contracts narrowly enough that QA and late-stage question routing can build on them without redefining research/design artifacts.

## Links

- Parent RDPI: ../../rdpi/work/work-20260528-requirements-intake-remaining-phases
- Snapshot/artifact prerequisite: work-20260528-requirements-snapshot-and-stage-artifacts.md
