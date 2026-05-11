# Research: Fix Roadmap Project Write Permissions

Task: `work-20260511-fix-roadmap-project-write-permissions`
Date: 2026-05-11

## Task Framing And Lane

Lane: `work`

The user attempted to generate an audit roadmap for `botIntevra` after the audit intent guard deployment. The UI showed:

```text
EACCES: permission denied, open '/home/www/botIntevra/.ai-factory/ROADMAP.md'
```

The prior fix verified service health but did not perform a live write-path smoke test against a real mounted project. That missed a project filesystem permissions defect.

## Accepted Planning Sources Or Local Facts

- `.docker/docker-entrypoint.sh` starts containers as root, fixes ownership for `/data`, `/home/node/.claude`, and `/home/node/.codex`, then drops to the `node` user.
- `.docker/docker-entrypoint.sh` intentionally does not `chown` the projects mount to avoid slow or disruptive recursive ownership changes on host bind mounts.
- `docker-compose.yml` mounts `${PROJECTS_DIR}` into `${PROJECTS_MOUNT:-/home/www}` for `api`, `agent`, and `mcp`.
- `docker-compose.production.yml` mounts the Docker `projects` volume at `${PROJECTS_MOUNT:-/home/www}`.
- `packages/api/src/services/roadmapGeneration.ts` writes generated roadmap content to the configured project roadmap path under the project root.
- The deployed project path is expected to be `/home/www/botIntevra`, with host backing path previously documented as `/srv/aif-handoff/projects`.
- Independent explorer noted a local documentation/config ambiguity: production compose declares a named `projects` volume, while ops docs describe `/srv/aif-handoff/projects` as the host backing path. The live server may have an override or env-specific compose model, so live inspection must identify the real mount before any ownership change.

## Same-Project Memory

Same-project curated local docs record:

- AIF instance `aif-handoff-01` runs at `192.168.88.67`.
- SSH route is `ubuntu@192.168.88.67` with key `C:\Users\apron\.ssh\codex_linux_key_5`.
- Host repository path is `/opt/aif-handoff`.
- Host projects path is `/srv/aif-handoff/projects`.
- AIF/container project path is `/home/www/botIntevra`.

## Cross-Project Reusable Patterns

No cross-project reusable memory was needed. The issue is specific to this repository's Docker project mount and live deployment.

## Rejected Or Stale Memory Candidates

No stale memory candidates were used.

## Hypothesis

The `botIntevra` project directory or `.ai-factory/ROADMAP.md` is not writable by the container `node` user. The immediate remediation is likely to make the relevant host project tree writable by the container UID/GID used by the app, then add a deploy smoke check that verifies roadmap write permission before asking users to run a canary audit.

Live permission inspection is intentionally deferred until after `PLAN PASS`.
