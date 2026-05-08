# botIntevra Remote Migration

Date: 2026-05-08
Task: `personal-20260508-botintevra-remote-migration`
AIF UI URL: `http://192.168.88.67/`
AIF API base: `http://192.168.88.67/api`
Remote host: `aif-handoff-01`
Remote SSH: `ubuntu@192.168.88.67` using local key
`C:\Users\apron\.ssh\codex_linux_key_5`
Remote host path: `/srv/aif-handoff/projects/botIntevra`
AIF project path: `/home/www/botIntevra`
Local source path: `C:\Users\apron\source\botIntevra`

## Result

The source tree was migrated to the remote AIF host and registered in AIF.

The earlier SSH blocker was caused by testing the host without the configured
username/key. A plain SSH command tried the local Windows user (`apron`) and was
rejected with `Permission denied (publickey)`. The host operations document
identifies the SSH user as `ubuntu`; the accepted key is
`C:\Users\apron\.ssh\codex_linux_key_5`.

## Remote Path Mapping

- `PROJECTS_DIR=/srv/aif-handoff/projects`
- `PROJECTS_MOUNT=/home/www`
- Physical project path: `/srv/aif-handoff/projects/botIntevra`
- AIF/container project path: `/home/www/botIntevra`

The remote target was absent before transfer.

## Transfer

Transferred 215 selected files from the current local working tree.

Selection source:

```powershell
git -C C:\Users\apron\source\botIntevra ls-files --cached --modified --others --exclude-standard
```

The transfer intentionally included tracked, modified, and untracked files that
Git does not ignore.

Excluded or absent from transfer:

- `.git/`
- root `.env`
- secret-like `.env.*` files other than the tracked `.env.example` template
- `.venv`
- `.pytest_cache`
- `__pycache__`
- local `data/`
- local SQLite database files

## Remote Validation

Remote validation was run under
`/srv/aif-handoff/projects/botIntevra/.venv`.

The VM did not have Python venv support installed initially. Installed
`python3.12-venv` with `apt-get`; no AIF containers needed restart.

Validation outcomes:

- `python3 -m compileall -q src tests`: passed with system Python before venv
  creation.
- `python3 -m venv .venv`: passed after installing `python3.12-venv`.
- `.venv/bin/python -m pip install -e .`: passed.
- `.venv/bin/python -m compileall -q src`: passed.
- `.venv/bin/python -m compileall -q src tests`: passed.
- `.venv/bin/python -m pytest -q`: passed after installing `pytest` into the
  remote venv.
- Test result: `295 passed, 116 subtests passed in 21.69s`.
- `.venv/bin/python -m bot_intevra init-db`: passed and initialized
  `/srv/aif-handoff/projects/botIntevra/data/bot-intevra/notes.sqlite3`.

## AIF Project

Created AIF project:

- Project id: `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`
- Name: `botIntevra`
- Root path: `/home/www/botIntevra`
- `parallelEnabled`: `false`
- `autoQueueMode`: `false`

Verification:

- `GET /api/projects` lists `botIntevra` at `/home/www/botIntevra`.
- `GET /api/projects/e4a3a101-ec7f-4f93-9b68-e297ffe8952f/defaults` returns
  parseable JSON.
- `GET /api/projects/e4a3a101-ec7f-4f93-9b68-e297ffe8952f/roadmap/status`
  returns `{"exists":false}`.
- AIF initialized `.ai-factory/config.yaml` in the remote project.

## Data And Secrets

- No secret values were read, copied, written to docs, or sent to memory.
- The remote project has `.env.example` but no root `.env`.
- No local runtime data existed to migrate.
- An empty remote SQLite database was initialized at
  `data/bot-intevra/notes.sqlite3`.
- Real runtime secrets for Telegram, LightRAG, transcription, and related
  integrations remain pending external provisioning before running services.

## Runtime Services

No bot, status server, transcription server, orchestrator, worker, or process
supervisor was started by this migration.

## Git State

The local `.git` directory was not transferred. During AIF project creation, AIF
initialized a new Git repository at the remote path. The transferred files are
present as the initial remote source tree.

No Git commit was created during this run.

## Local Checkout

The local checkout at `C:\Users\apron\source\botIntevra` was not deleted,
archived, or modified. Local decommissioning should be performed only as a
separate explicit cleanup step after this remote state is accepted.

## Rollback Notes

Rollback requires explicit approval before deleting remote content. The current
remote artifacts are:

- AIF project id `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`
- Remote host path `/srv/aif-handoff/projects/botIntevra`
- AIF path `/home/www/botIntevra`

Do not delete the local checkout until remote ownership and any required secret
provisioning are accepted.
