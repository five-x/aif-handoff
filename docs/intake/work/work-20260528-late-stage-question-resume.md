# Late Stage Question Resume

- Task ID: work-20260528-late-stage-question-resume
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-28
- Due: unset
- Source: decomposition from `work-20260528-requirements-intake-remaining-phases`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260528-late-stage-question-resume

## Request

Unify downstream structured question handling across research, design, planning, implementation, review, and QA. Add a shared `raise_questions` contract, target resume routing, and coordinator/API behavior so product clarification pauses in `needs_input` and resumes to the correct stage after answers.

## Done When

- Research, design, planning, implementation, review, and QA agents can emit a shared `raise_questions` contract.
- Product clarification routes to `needs_input`, not `blocked_external`.
- Answering all blocking questions resumes the correct target stage.
- Runtime, infrastructure, access, and external operator failures continue to use `blocked_external`.
- UI/API surfaces clearly show the active question batch and resume target.

## Constraints

- Depends on stage/status contracts from `work-20260528-research-design-stages` and `work-20260528-qa-gate-and-acceptance-pack`.
- Preserve Phase 1 behavior from `6565e2f8`.
- Do not store raw user answers or secrets in shared memory.
- Preserve compatibility when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- Do not execute follow-up child tasks in the same run.

## Notes

The MVP question table already includes downstream stage names, but target resume mapping and downstream agent contracts still need to be made real.

## Links

- Parent RDPI: ../../rdpi/work/work-20260528-requirements-intake-remaining-phases
