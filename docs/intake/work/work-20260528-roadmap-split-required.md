# Roadmap Split Required

- Task ID: work-20260528-roadmap-split-required
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-28
- Due: unset
- Source: decomposition from `work-20260528-requirements-intake-remaining-phases`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260528-roadmap-split-required

## Request

Implement controlled broad-task decomposition through a `split_required` decision. Persist proposed child tasks separately from approved children, expose approval UI/API, and integrate the flow with roadmap import and parent/child handling.

## Done When

- Broad roadmap or epic items can return `split_required`.
- Proposed child tasks are persisted separately from approved task rows.
- UI/API require controlled human approval before children are created.
- Parent/child handling preserves queue gating and hierarchy rollups.
- Generated child tasks are not executed in the same approval flow that creates them.

## Constraints

- Build on existing hierarchy support; do not replace it.
- Preserve audit roadmap compatibility and workflow pack boundaries.
- Preserve Phase 1 behavior from `6565e2f8`.
- Preserve compatibility when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- Do not execute follow-up child tasks in the same run.

## Notes

This slice should distinguish proposing children, approving children, creating child task rows, and scheduling/running those children as separate lifecycle steps.

## Links

- Parent RDPI: ../../rdpi/work/work-20260528-requirements-intake-remaining-phases
