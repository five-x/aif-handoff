# Result

Task: `personal-20260508-botintevra-remote-migration`
Date: 2026-05-08
Outcome: done

## Summary

`botIntevra` was copied from `C:\Users\apron\source\botIntevra` to the remote
AIF host and registered in AIF.

The correct remote source path is
`/srv/aif-handoff/projects/botIntevra`. The AIF/container path is
`/home/www/botIntevra`.

The earlier SSH blocker was a verification error: the default SSH attempt used
`apron@192.168.88.67`, while the host document identifies the VM user as
`ubuntu`. The working non-interactive SSH path is `ubuntu@192.168.88.67` with
the local key `C:\Users\apron\.ssh\codex_linux_key_5`.

## Gate Outcomes

- PLAN PASS: independent reviewer approved the RDPI plan on 2026-05-08.
- TEST PASS: independent tester verified the successful migration state on
  2026-05-08.
- REVIEW PASS: independent reviewer verified the successful migration close-out
  on 2026-05-08.

## Remote Evidence

- Hostname: `aif-handoff-01`.
- `PROJECTS_DIR=/srv/aif-handoff/projects`.
- `PROJECTS_MOUNT=/home/www`.
- Remote transfer target was absent before copy.
- 215 files were transferred to `/srv/aif-handoff/projects/botIntevra`.
- AIF initialized `.ai-factory/config.yaml`.

## Transfer Manifest

See `transfer-manifest.md`.

The transfer included tracked, modified, and untracked files selected by:

```powershell
git -C C:\Users\apron\source\botIntevra ls-files --cached --modified --others --exclude-standard
```

The transfer did not include `.git/`, root `.env`, secret-like `.env.*` files,
`.venv`, Python caches, `.pytest_cache`, local `data/`, or local SQLite
database files.

## Remote Validation

Remote validation was run from `/srv/aif-handoff/projects/botIntevra`.

- Installed `python3.12-venv` on the VM because Ubuntu lacked `ensurepip`.
- `python3 -m compileall -q src tests`: passed.
- `.venv/bin/python -m pip install -e .`: passed.
- `.venv/bin/python -m compileall -q src`: passed.
- `.venv/bin/python -m compileall -q src tests`: passed.
- `.venv/bin/python -m pytest -q`: passed after installing `pytest` into the
  remote venv.
- Test result: `295 passed, 116 subtests passed in 21.69s`.
- `.venv/bin/python -m bot_intevra init-db`: passed.
- Remote SQLite database initialized at
  `/srv/aif-handoff/projects/botIntevra/data/bot-intevra/notes.sqlite3`.

## AIF Project

Created project:

- Project id: `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`
- Name: `botIntevra`
- Root path: `/home/www/botIntevra`
- `parallelEnabled`: `false`
- `autoQueueMode`: `false`

Verification:

- `GET http://192.168.88.67/api/projects` lists `botIntevra` at
  `/home/www/botIntevra`.
- `GET /api/projects/e4a3a101-ec7f-4f93-9b68-e297ffe8952f/defaults` returned
  parseable JSON.
- `GET /api/projects/e4a3a101-ec7f-4f93-9b68-e297ffe8952f/roadmap/status`
  returned `{"exists":false}`.

## Data And Secrets

- No secret values were read, copied, written, or published.
- Local scan found `.env.example` but no root `.env`.
- Remote project has `.env.example` but no root `.env`.
- No local runtime data existed to migrate.
- An empty remote SQLite database was initialized for remote runtime ownership.
- Real runtime secrets remain pending external provisioning before starting bot
  services.

## Runtime Services

No Telegram bot, status server, transcription server, orchestrator, process
supervisor, or background worker was started.

## Git And Local Decommission

The local `.git` directory was not transferred. AIF initialized a new Git
repository at the remote path. No Git commit was created during this run.

The local checkout at `C:\Users\apron\source\botIntevra` was retained and not
modified. Local deletion or archival remains a separate explicit cleanup step.

## Memosync

MODE=auto completed with local artifact and shared-memory short fact.

- Local memory artifact:
  `docs/memory/tasks/personal/personal-20260508-botintevra-remote-migration-delta.md`
- Shared-memory insertion status: success.
- Shared-memory track id: `insert_20260507_221056_608c71ea`.
