# Research

## Task framing and lane

- Task ID: `personal-20260508-botintevra-remote-migration`.
- Lane: `personal`.
- Immutable task intent: fully migrate `C:\Users\apron\source\botIntevra` off the local computer onto the remote host serving AIF at `http://192.168.88.67/`, so the project no longer lives locally and can be managed from the remote AIF instance.
- This supersedes the prior narrow local-path onboarding task `personal-20260507-botintevra-aif-transfer`, which ended `waiting` because the live AIF server rejected the Windows path.
- RDPI is required because the task involves cross-host file transfer, source-of-truth change, potential service ownership, secrets handling, AIF project registration, verification, rollback, and local decommissioning.

## Accepted planning sources and local facts

- Intake card: `docs/intake/personal/personal-20260508-botintevra-remote-migration.md`.
- Current repo guidance: `AGENTS.md`.
- Preflight: `codex-ensure-rdpi.py` reported `STATUS: ready`; `codex-flow-audit.py --repo .` reported `STATUS: clean`.
- Prior onboarding note: `docs/ops/botintevra-aif-onboarding.md`.
- Prior RDPI result: `docs/rdpi/personal/personal-20260507-botintevra-aif-transfer/result.md`.
- AIF docs state that dev Docker Compose maps host `PROJECTS_DIR` into `PROJECTS_MOUNT`; host paths under `PROJECTS_DIR` are stored as container paths so agents can access them (`docs/getting-started.md:62`, `docs/getting-started.md:65`). Production Compose uses a named Docker volume at `PROJECTS_MOUNT` and projects should be created with an in-container path such as `/home/www/app` (`docs/getting-started.md:70`, `docs/getting-started.md:72`).
- AIF API project creation requires an absolute `rootPath` (`docs/api.md:145`, `docs/api.md:152`).
- Prior live evidence recorded that the AIF API base is `http://192.168.88.67/api`; existing project `Test` had root `/home/www/test`; `C:\Users\apron\source\botIntevra` was rejected as `rootPath must be an absolute path`.

## botIntevra local repository facts

- `botIntevra` is a Python package, not Node. Package metadata is in `C:\Users\apron\source\botIntevra\pyproject.toml`; source is under `src/bot_intevra`, tests under `tests`, and package script is `bot-intevra = bot_intevra.cli:main`.
- Declared commands from `C:\Users\apron\source\botIntevra\AGENTS.md` and `docs/ops/runbook.md`:
  - Build: `python -m compileall src`
  - Test: `python -m pytest -q`
  - Lint: `python -m compileall src tests`
  - Run: `python -m bot_intevra run-bot`
- Runtime entrypoints:
  - Telegram bot: `python -m bot_intevra run-bot`
  - status server: `python -m bot_intevra run-status-server`, default `127.0.0.1:8081`
  - transcription server: `python -m bot_intevra run-transcription-server --host 0.0.0.0 --port 8172`
  - orchestrator server parser exists, but `main()` currently routes only `run-bot`, `run-status-server`, and `run-transcription-server` to `sync_main`; `run-orchestrator-server` likely needs a follow-up fix before relying on it.
- Default persistent data path is `./data/bot-intevra`, resolved from `BOT_DATA_DIR`.
- Persistent paths are:
  - SQLite DB: `data/bot-intevra/notes.sqlite3`
  - inbox mirrors: `data/bot-intevra/inbox`
  - attachments: `data/bot-intevra/attachments`
  - backups: `data/bot-intevra/backups`
- Local scan found no `data/`, `.env`, or `.ai-factory` under `C:\Users\apron\source\botIntevra`; only `.env.example` exists. Therefore actual runtime secrets and persisted bot data are either absent, located outside this checkout, or not yet created.
- `.gitignore` excludes `.env`, `.env.*`, virtualenvs, caches, build outputs, and editor directories. It does not ignore `data/`, but the local `data/` directory was not present.
- Worktree is heavily dirty. Modified core source files include `src/bot_intevra/db.py`, `memory_client.py`, `models.py`, `service.py`; modified tests include `tests/test_bot.py`, `test_memory_client.py`, `test_service.py`, `test_store.py`; untracked source/test files include `src/bot_intevra/company_profile.py`, `tests/test_ask_contract_matrix.py`, `tests/test_company_profile.py`, `tests/test_local_state_adapters.py`, and scripts/docs/memory/RDPI artifacts. Migration must preserve current dirty/untracked work unless explicitly excluded.

## Secret and configuration names only

- Bot env names from `.env.example`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`, `LIGHTRAG_BASE_URL`, `LIGHTRAG_API_KEY`, `LIGHTRAG_DEFAULT_MODE`, `LIGHTRAG_FALLBACK_MODES`, `LIGHTRAG_TIMEOUT_SECONDS`, `NORMALIZER_BASE_URL`, `NORMALIZER_API_KEY`, `NORMALIZER_MODEL`, `NORMALIZER_TIMEOUT_SECONDS`, `TRANSCRIPTION_BASE_URL`, `TRANSCRIPTION_API_KEY`, `TRANSCRIPTION_MODEL`, `TRANSCRIPTION_LANGUAGE`, `TRANSCRIPTION_TIMEOUT_SECONDS`, `BOT_DATA_DIR`, `BOT_AUTO_PUBLISH_INBOX`, `BOT_DEFAULT_RESPONSE_TYPE`, `BOT_SOURCE_PREFIX`, `BOT_PRIMARY_COMPANY_NAME`, `BOT_BACKUP_PASSPHRASE`, `BOT_RUNTIME_ENV_FILE`.
- Transcription server also accepts `WHISPER_API_KEY`.
- Orchestrator config uses `ORCHESTRATOR_*` and `OLLAMA_*` names.
- No secret values were read or recorded.

## Same-project memory

- Not queried before `PLAN PASS` because the RDPI boundary forbids shared-memory recall before the plan gate unless explicitly waived.
- Local repo facts and prior RDPI artifacts were sufficient for the migration plan.

## Cross-project reusable patterns

- Use public APIs and idempotent checks before mutation.
- Keep secrets out of repository files, RDPI artifacts, and shared memory.
- Separate transfer, service cutover, and local decommissioning into gated phases.
- Do not delete or archive the old local source until the remote source has been verified and rollback is documented.

## Rejected or stale memory candidates

- None. Memory was not queried before `PLAN PASS`.

## Open questions

- What authenticated remote access method is available to write files onto the host behind `192.168.88.67`: SSH/SCP, SMB, RDP, a deploy share, or only the AIF HTTP API?
- What host directory backs AIF container path `/home/www`? Is `/home/www/botIntevra` the intended final project path?
- Are runtime secrets already present on the remote host, or must they be provisioned separately by the user/secret layer?
- Are any real bot data files present outside `C:\Users\apron\source\botIntevra`, since the local checkout has no `data/` directory?

## Hypotheses

- If SSH/SCP or another authenticated file-transfer path to `192.168.88.67` is available, the safest migration is to copy a curated source snapshot to the host directory backing `/home/www/botIntevra`, verify Python install/build/test there, then register `/home/www/botIntevra` in AIF.
- If no authenticated remote write path exists, this task must stop as `waiting`; the AIF HTTP API alone can create project records but cannot safely upload the dirty local repository.
- Because the local checkout has no data or `.env`, this run can migrate source and docs but must record runtime secrets/data as unresolved unless a verified external location is supplied after `PLAN PASS`.
