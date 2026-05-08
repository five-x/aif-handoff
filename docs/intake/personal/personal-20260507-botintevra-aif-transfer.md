# Prepare botIntevra Transfer Into AIF

- Task ID: personal-20260507-botintevra-aif-transfer
- Lane: personal
- Status: canceled
- Priority: high
- Created: 2026-05-07
- Due: unset
- Source: user request, 2026-05-07
- RDPI Needed: yes
- RDPI Path: docs/rdpi/personal/personal-20260507-botintevra-aif-transfer

## Request

Prepare the transfer of `C:\Users\apron\source\botIntevra` into AIF so the project can be managed from `http://192.168.88.67/`.

## Done When

- The current `botIntevra` repository shape, runtime entry points, configuration, secrets boundaries, and operational requirements are understood through RDPI.
- AIF has a clear project onboarding plan for managing `botIntevra` tasks, planning, implementation, review, and verification from `http://192.168.88.67/`.
- Required AIF configuration, project registration, runtime profile choices, and any migration or import steps are documented before implementation.
- Risks around secrets, local paths, network exposure, process ownership, and rollback are explicitly addressed before changes are made.
- Implementation is not started until the RDPI plan receives `PLAN PASS`.

## Constraints

- Intake only for this turn; do not inspect `botIntevra`, probe `http://192.168.88.67/`, query runtime state, or implement changes during intake.
- Follow RDPI before any non-trivial repository or runtime change.
- Keep secrets outside the repository and outside shared memory.
- Local repo facts and local docs outrank memory recall.
- Use Windows-native commands in this workspace; prefer `npm.cmd` for npm commands if later validation touches `aif-handoff`.

## Notes

- Lane inferred as `personal` because the request references a local source checkout and a private-network URL, with no explicit work lane.
- This task should likely begin with read-only research of both `aif-handoff` project onboarding flows and the target `botIntevra` repository, but that evidence collection belongs to RDPI after intake.
- Canceled on 2026-05-08 because the later remote migration task superseded this local-transfer preparation task.

## Links

- RDPI scaffold: ../../rdpi/personal/personal-20260507-botintevra-aif-transfer
