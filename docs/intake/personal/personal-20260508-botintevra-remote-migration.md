# Migrate botIntevra To Remote Host

- Task ID: personal-20260508-botintevra-remote-migration
- Lane: personal
- Status: done
- Priority: high
- Created: 2026-05-08
- Due: unset
- Source: user clarification, 2026-05-08
- RDPI Needed: yes
- RDPI Path: docs/rdpi/personal/personal-20260508-botintevra-remote-migration

## Request

Fully migrate `C:\Users\apron\source\botIntevra` off the local computer onto the remote host that serves AIF at `http://192.168.88.67/`, so the project no longer lives locally and can be managed from the remote AIF instance.

## Done When

- The remote host has the intended `botIntevra` repository, runtime files, operational docs, and persistent data needed to become the source of truth.
- Required non-secret configuration is present on the remote host, and secret values are handled through the appropriate secret/env mechanism without being committed or written to shared memory.
- AIF at `http://192.168.88.67/` has a project record pointing at the remote-host path, not the local Windows path.
- The remote setup can run the expected `botIntevra` validation and operational checks defined during RDPI.
- Any Telegram bot, status server, orchestrator, transcription service, SQLite data, backup, and sync responsibilities are explicitly assigned to the remote host or deliberately deferred.
- The local checkout is no longer the source of truth after successful verification; any local deletion/archive step is planned and performed only after remote verification and rollback coverage.

## Constraints

- Intake only for this turn; do not inspect `botIntevra`, probe the remote host, copy files, create AIF project records, run services, or delete local files during intake.
- Follow RDPI before migration or any non-trivial repository/runtime change.
- Treat secrets as out of scope for repository files and shared memory; record only secret names/locations, never values.
- Do not assume `/home/www/botIntevra` exists or points to the intended project until RDPI verifies the remote host filesystem/mount model.
- Do not delete or archive the local checkout until the remote migration has passed verification and rollback is documented.
- Keep the previous waiting task `personal-20260507-botintevra-aif-transfer` separate; this task supersedes its narrow local-path registration approach but does not execute cleanup automatically.

## Notes

- Lane inferred as `personal` from the prior task and local personal project context.
- This task corrects the prior assumption: the goal is not to make AIF manage the local Windows checkout, but to move the project to the remote host and manage it there.
- RDPI should design a migration sequence covering source copy, data copy, secrets, service/process ownership, AIF project registration, validation, rollback, and local decommissioning.

## Links

- Prior blocked intake: personal/personal-20260507-botintevra-aif-transfer.md
- RDPI scaffold: ../../rdpi/personal/personal-20260508-botintevra-remote-migration
