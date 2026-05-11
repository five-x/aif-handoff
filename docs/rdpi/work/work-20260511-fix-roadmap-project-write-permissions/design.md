# Design: Fix Roadmap Project Write Permissions

Task: `work-20260511-fix-roadmap-project-write-permissions`

## Goal

Restore roadmap generation for mounted projects by fixing the live project write permission problem and adding a focused smoke check so this class of deploy failure is caught before user canary runs.

## Diagnosis Model

The API process writes `ROADMAP.md` inside the selected project root. In Docker it runs as `node`, while project files are mounted from `/home/www`. If the host backing directory is owned by another user or has restrictive permissions, API health remains green but roadmap generation fails with `EACCES`.

## Remediation Options

Preferred immediate operations fix:

- after `PLAN PASS`, identify the real compose/mount model on `aif-handoff-01`;
- inspect ownership and mode for `/srv/aif-handoff/projects/botIntevra`, `.ai-factory`, and `ROADMAP.md` if the host bind path exists, plus the container path `/home/www/botIntevra/.ai-factory`;
- correct ownership or group write access only for the affected `.ai-factory` path using the live-inspected API container UID/GID;
- avoid recursive `chown` in container startup for every deployment.

Durable follow-up:

- add an ops smoke check or runbook step that verifies the API/container user can write and remove a temporary file under the real project `.ai-factory` directory;
- optionally add a project writeability preflight before roadmap generation that returns a clearer error if the roadmap path is not writable.
- align production compose/docs if live inspection proves the deployed mount model differs from documented `/srv/aif-handoff/projects`.

## Acceptance Criteria

- API/container user can write to `/home/www/botIntevra/.ai-factory/`.
- Generating/importing a roadmap no longer fails on `EACCES` at `ROADMAP.md`.
- Health checks still pass after any permission change.
- No unrelated project files are deleted or overwritten.

## Non-Goals

- Do not rerun the full audit in this task unless the user asks after permissions are fixed.
- Do not change the audit intent guard again unless live evidence shows it is involved.
- Do not recursively change ownership outside the intended project path.
- Do not recursively change ownership of the whole project tree in this task unless live evidence proves `.ai-factory` repair is insufficient and the user explicitly approves the broader repair.
- Do not assume the host bind path exists until live inspection confirms it.
