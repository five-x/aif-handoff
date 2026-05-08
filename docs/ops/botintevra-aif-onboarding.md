# botIntevra AIF Onboarding

Date: 2026-05-07
Task: `personal-20260507-botintevra-aif-transfer`
AIF UI URL: `http://192.168.88.67/`
AIF API base found: `http://192.168.88.67/api`
Target root: `C:\Users\apron\source\botIntevra`

## Result

Onboarding is blocked before project creation.

The web UI origin is reachable, and the live API is available under `/api`, but the current AIF server does not map the Windows host path `C:\Users\apron\source\botIntevra` into an absolute path that its Linux/container API accepts.

Evidence:

- `GET http://192.168.88.67/agent/readiness` and `GET http://192.168.88.67/projects` returned the web SPA HTML shell, not API JSON.
- `GET http://192.168.88.67:3009/projects` failed to connect, so the API is not directly exposed on port `3009`.
- `GET http://192.168.88.67/api/projects` returned JSON and showed one existing project: `Test` with root path `/home/www/test`.
- `GET http://192.168.88.67/api/health` returned JSON health data.
- `POST http://192.168.88.67/api/projects` with `rootPath = C:\Users\apron\source\botIntevra` returned `400` with `rootPath must be an absolute path`.

No `POST /api/projects` request using `/home/www/botIntevra` was sent. Creating that path could create or register a container-volume directory rather than the intended local repository.

## Project Record

- Project id: unresolved.
- Project root path stored by AIF: unresolved.
- Windows-to-container path mapping: not configured for `C:\Users\apron\source\botIntevra` on the live AIF instance.
- Path accessibility status: unresolved. The server rejected the Windows path before project initialization.

## Target Initialization State

Before onboarding:

- `C:\Users\apron\source\botIntevra\.ai-factory` did not exist.
- `git -C C:\Users\apron\source\botIntevra status --short -- .ai-factory` returned no output.

After onboarding attempt:

- `C:\Users\apron\source\botIntevra\.ai-factory` still did not exist.
- `git -C C:\Users\apron\source\botIntevra status --short -- .ai-factory` returned no output.

## Runtime Posture

- `parallelEnabled` was not changed.
- Auto-queue was not enabled.
- No runtime profile overrides were written.
- No bot services were started.
- No `botIntevra` code was changed.

## Secrets Boundary

No secret values were read, written, copied into docs, or sent to shared memory. `botIntevra` secret names remain documented only as names and operational requirements.

## Rollback

No AIF project record was created by this run, so no rollback API call was needed.

No target repository files were deleted. The target `.ai-factory` directory did not exist before or after the run.

## Required Unblock

Configure the live AIF deployment so the API can resolve the intended repository path. The expected fix is one of:

- Set the AIF Compose/project environment so `PROJECTS_DIR` includes `C:\Users\apron\source` and `PROJECTS_MOUNT` maps it to `/home/www`, then recreate/restart the AIF services.
- Move or copy `botIntevra` into the currently mounted projects directory that backs `/home/www`, then create the project using the matching in-container path.

After that, rerun the onboarding sequence against `http://192.168.88.67/api`:

1. `GET /projects`
2. Reuse or create the `botIntevra` project.
3. Verify `GET /projects/:id/defaults`.
4. Verify `GET /projects/:id/roadmap/status`.
5. Keep auto-queue disabled until mount/path accessibility and branch/worktree policy are confirmed.

Queue any `botIntevra` CLI/orchestrator fixes as separate tasks; they were intentionally not executed during onboarding.
