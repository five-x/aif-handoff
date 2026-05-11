# Plan: Fix Roadmap Project Write Permissions

Task: `work-20260511-fix-roadmap-project-write-permissions`

## Steps

1. Run an independent plan review.
2. After `PLAN PASS`, inspect the live compose model:
   - active compose config for the `api` service volume at `/home/www`
   - whether `/srv/aif-handoff/projects/botIntevra` exists on the host
   - container UID/GID for the API process
3. Inspect live host/container ownership and writeability for:
   - `/srv/aif-handoff/projects/botIntevra`
   - `/srv/aif-handoff/projects/botIntevra/.ai-factory`
   - `/srv/aif-handoff/projects/botIntevra/.ai-factory/ROADMAP.md`
   - container path `/home/www/botIntevra/.ai-factory`
4. Apply the smallest safe permission repair, expected to be one of:
   - `chown -R <live-api-uid>:<live-api-gid> <real-botIntevra-.ai-factory-path>`
   - or an equivalent group-write ACL/mode change on the `.ai-factory` directory only.
   - If the whole project tree appears to need ownership repair, stop and report evidence before broadening the operation.
5. Run a write smoke check as the API container user:
   - choose a unique temp file under `/home/www/botIntevra/.ai-factory`, for example `.aif-write-smoke-<timestamp>.tmp`
   - fail if that temp file already exists
   - read it
   - remove it
   - do not touch `ROADMAP.md`
6. Recheck API and web health.
7. Record result.

## Verification

- Remote `docker compose ps` shows services running.
- `curl http://127.0.0.1:3009/health` succeeds on the server.
- LAN `http://192.168.88.67/api/health` succeeds.
- Container write smoke check under `/home/www/botIntevra/.ai-factory` succeeds.

## Safety

- Do not edit source code unless live evidence shows the defect requires code.
- Do not delete or overwrite `ROADMAP.md`.
- If ownership appears intentionally managed by another user and changing it would be risky, stop and report the exact state instead of guessing.
- If the live mount is a Docker named volume instead of `/srv/aif-handoff/projects`, repair the named volume path from inside a container or stop before applying a host-path `chown`.
- Any ownership repair must use the live-inspected API/container UID:GID, not an assumed UID/GID.

## PLAN Gate Request

The plan is ready for independent review. Required verdict: `PLAN PASS` or `PLAN FAIL`.
