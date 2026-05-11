# Result: Fix Roadmap Project Write Permissions

Task: `work-20260511-fix-roadmap-project-write-permissions`
Date: 2026-05-11

## Outcome

Fixed the live `EACCES` failure for roadmap generation on `botIntevra`.

The deployed API process runs as UID/GID `1000:1000`. The project mount is a bind mount:

```text
/srv/aif-handoff/projects -> /home/www
```

The `botIntevra` project directories were already owned by `1000:1000`, but the existing roadmap file was owned by `root:root` with mode `644`:

```text
/srv/aif-handoff/projects/botIntevra/.ai-factory/ROADMAP.md
```

That made the directory writable but prevented API from overwriting `ROADMAP.md`.

Applied the minimal repair:

```bash
sudo chown 1000:1000 /srv/aif-handoff/projects/botIntevra/.ai-factory/ROADMAP.md
```

No project source files were changed. The smoke check did not write to `ROADMAP.md`.

## Verification

Independent `PLAN PASS` was received before live inspection and repair.

Independent `TEST PASS` verified:

- remote `/opt/aif-handoff` HEAD is `42c6e52`
- `api`, `agent`, `mcp`, and `web` containers are up
- host and container both report `ROADMAP.md` as `1000:1000 644`
- API UID/GID `1000:1000` can write `ROADMAP.md`
- API UID/GID `1000:1000` can create, read, and remove a unique temp file under `/home/www/botIntevra/.ai-factory`
- server-local `http://127.0.0.1:3009/health` returns ok
- LAN `http://192.168.88.67/api/health` returns ok

Independent `REVIEW PASS` confirmed the operation stayed within approved scope.

## Residual Notes

This was an operational ownership repair on the deployed project file, not a code change. A durable follow-up would be to add a deployment smoke check for project writeability and/or a clearer API preflight error before roadmap generation.
