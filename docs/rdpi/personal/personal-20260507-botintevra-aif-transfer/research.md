# Research

## Task framing and lane

- Task ID: `personal-20260507-botintevra-aif-transfer`.
- Lane: `personal`.
- Immutable intake request: prepare transfer of `C:\Users\apron\source\botIntevra` into AIF so it can be managed from `http://192.168.88.67/`.
- RDPI is required because the task crosses repositories, runtime configuration, secrets boundaries, and a live AIF instance.
- This task is onboarding/integration work. It must not fix `botIntevra` implementation defects in the same run unless those fixes are strictly required to register the project in AIF.

## Accepted planning sources and local facts

- Intake card: `docs/intake/personal/personal-20260507-botintevra-aif-transfer.md`.
- Current repo guidance: `AGENTS.md` after `codex-ensure-rdpi.py` refreshed managed files.
- Preflight: `codex-ensure-rdpi.py` reported `STATUS: refreshed`; `codex-flow-audit.py --repo .` reported `STATUS: clean`.
- Boundary accounting for the preflight refresh: the refresh is a required `runtask`/`rdpi` preflight, not task implementation. Observed local effects before implementation are managed instruction refresh in `AGENTS.md`, an untracked `AGENTS.md.bak.20260507204903`, and managed docs directories already present/untracked in the repo status. These must be recorded in `result.md` and left reviewable rather than silently treated as transfer implementation.
- AIF project records store `name`, `rootPath`, budgets, parallel mode, auto-queue mode, and project-level runtime defaults in the `projects` schema (`packages/shared/src/schema.ts` and `packages/shared/src/types.ts`).
- AIF API supports `POST /projects` with required `name` and absolute `rootPath`; optional project defaults include per-stage runtime profile ids (`docs/api.md:145`, `docs/api.md:151`, `docs/api.md:152`, `docs/api.md:157`, `docs/api.md:158`, `docs/api.md:159`, `docs/api.md:160`).
- AIF task creation is separate from project creation: `POST /tasks` requires `projectId` and `title`; task runtime overrides fall back to project, app, then environment defaults (`docs/api.md:583`, `docs/api.md:589`, `docs/api.md:590`, `docs/api.md:599`).
- Docker dev mode maps host paths under `PROJECTS_DIR` into `PROJECTS_MOUNT`; paths outside the mount may be stored unchanged and may not be accessible to agent containers (`docs/getting-started.md:62`, `docs/getting-started.md:65`, `docs/getting-started.md:70`, `docs/getting-started.md:72`).
- `packages/api/src/repositories/projects.ts` maps a host root under `PROJECTS_DIR` to `PROJECTS_MOUNT` before validation and project initialization (`packages/api/src/repositories/projects.ts:40`, `packages/api/src/repositories/projects.ts:48`, `packages/api/src/repositories/projects.ts:55`, `packages/api/src/repositories/projects.ts:82`, `packages/api/src/repositories/projects.ts:83`, `packages/api/src/repositories/projects.ts:90`).
- `POST /projects` rolls back the project record when `initProject()` fails; `initProject()` creates the base project directory/git repo and runs `ai-factory init` only when `.ai-factory/` is absent (`packages/runtime/src/projectInit.ts`).
- `GET /projects/:id/defaults` resolves project config from the stored root path, and `GET /projects/:id/roadmap/status` checks for the configured roadmap path under the stored project root (`packages/api/src/routes/projects.ts:277`, `packages/api/src/routes/projects.ts:285`, `packages/api/src/routes/projects.ts:289`, `packages/api/src/routes/projects.ts:297`, `packages/api/src/routes/projects.ts:299`).
- Local path validation requires an absolute root path and rejects shell metacharacters and system directories (`packages/shared/src/pathValidation.ts`).
- The web UI create/edit project dialog submits `name`, `rootPath`, budget fields, `parallelEnabled`, and then toggles auto-queue separately when requested (`packages/web/src/components/project/ProjectSelector.tsx:118`, `packages/web/src/components/project/ProjectSelector.tsx:147`, `packages/web/src/components/project/ProjectSelector.tsx:148`, `packages/web/src/components/project/ProjectSelector.tsx:153`, `packages/web/src/components/project/ProjectSelector.tsx:157`).
- Parallel auto-queue with branch isolation requires `AIF_TASK_WORKTREES_ENABLED=true`; otherwise the API rejects that combination and keeps branch-isolated projects serial (`docs/api.md:174`, `docs/api.md:175`, `docs/api.md:176`).

## Target repository facts

- `botIntevra` is a Python project, not a Node project.
- Project identity: single-user Telegram memory bot with local SQLite storage, review flow, and Shared Memory sync (`C:\Users\apron\source\botIntevra\AGENTS.md:20`).
- Source layout: `src/bot_intevra`, tests in `tests`, docs in `docs`.
- Python requirement: `>=3.11`; console script `bot-intevra = bot_intevra.cli:main` (`C:\Users\apron\source\botIntevra\pyproject.toml:8`, `C:\Users\apron\source\botIntevra\pyproject.toml:23`).
- Runtime dependencies include FastAPI, httpx, MCP, pyaes, pypdf, python-multipart, python-telegram-bot, and uvicorn (`C:\Users\apron\source\botIntevra\pyproject.toml:11`).
- Declared commands: build `python -m compileall src`, test `python -m pytest -q`, lint `python -m compileall src tests`, run `python -m bot_intevra run-bot` (`C:\Users\apron\source\botIntevra\AGENTS.md:90`, `C:\Users\apron\source\botIntevra\docs\ops\runbook.md:16`).
- CLI includes `init-db`, `run-bot`, `run-status-server`, `run-transcription-server`, `run-orchestrator-server`, backups, records, reconcile, and other commands (`C:\Users\apron\source\botIntevra\src\bot_intevra\cli.py:23`).
- Telegram bot uses polling via `python-telegram-bot` (`C:\Users\apron\source\botIntevra\src\bot_intevra\bot.py:159`).
- Local SQLite data path defaults include `notes.sqlite3`; settings create DB/inbox paths (`C:\Users\apron\source\botIntevra\src\bot_intevra\config.py:55`, `C:\Users\apron\source\botIntevra\src\bot_intevra\db.py:61`).
- Status server defaults to `127.0.0.1:8081` and exposes `/`, `/healthz`, `/health` (`C:\Users\apron\source\botIntevra\src\bot_intevra\cli.py:71`, `C:\Users\apron\source\botIntevra\src\bot_intevra\status_server.py:14`).
- Transcription server defaults to `0.0.0.0:8172`, requires bearer token, and serves `/audio/transcriptions` (`C:\Users\apron\source\botIntevra\src\bot_intevra\transcription_server.py:118`).
- Internal orchestrator FastAPI and MCP server exposes `/health`, job APIs, and `/mcp` (`C:\Users\apron\source\botIntevra\src\bot_intevra\orchestrator\app.py:40`).
- `.env` is ignored and `.env.example` is present. Important env names include `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`, `LIGHTRAG_API_KEY`, `NORMALIZER_API_KEY`, optional `TRANSCRIPTION_API_KEY`, and `BOT_BACKUP_PASSPHRASE` (`C:\Users\apron\source\botIntevra\README.md:65`). No secret values were read or recorded.
- Local defaults reference services at `192.168.88.60`, `192.168.88.62`, and `192.168.88.63`; no local reference to `http://192.168.88.67/` was found.
- `run-orchestrator-server` appears registered and implemented in `sync_main`, but `main()` dispatch only routes `run-bot`, `run-status-server`, and `run-transcription-server` into `sync_main`; this likely prevents the orchestrator command from running as intended (`C:\Users\apron\source\botIntevra\src\bot_intevra\cli.py:108`).
- `BOT_RUNTIME_ENV_FILE` appears in settings, but observed config reads process env directly via `Settings.from_env()`; dotenv/env-file loading was not observed (`C:\Users\apron\source\botIntevra\src\bot_intevra\config.py:82`).
- `botIntevra` worktree is dirty with many modified/untracked files. This is a transfer risk, but not necessarily a blocker for registering the project in AIF.

## Same-project memory

- Not queried before `PLAN PASS` because the RDPI boundary forbids shared-memory recall before the plan gate unless explicitly waived.
- No explicit historical/prior-decision question was needed for the initial plan; local docs and source facts were sufficient for onboarding design.

## Cross-project reusable patterns

- Use local repo facts first and do not publish raw RDPI notes to shared memory.
- Keep secrets outside repository files and shared memory.
- Queue follow-up implementation work separately rather than fixing `botIntevra` defects during onboarding.
- For runtime-visible operations, use idempotent checks before mutation: list existing AIF projects, avoid duplicate project records, then create/update only the selected project.

## Rejected or stale memory candidates

- None. Memory was not queried before `PLAN PASS`.

## Open questions

- Does the live AIF instance at `http://192.168.88.67/` expose the API on the same origin and currently have access to `C:\Users\apron\source\botIntevra` or a container-mapped equivalent?
- Is `PROJECTS_DIR` configured to include `C:\Users\apron\source`, or should `botIntevra` be copied/symlinked under the configured projects mount first?
- Should AIF only manage `botIntevra` as a project/task board now, or should a later task also manage the bot/orchestrator process lifecycle?
- Which runtime profile should be used for `botIntevra` planning/implementation/review, or should it inherit AIF app defaults initially?

## Hypotheses

- The safest first integration is to register `botIntevra` as an AIF project with `parallelEnabled=false` and `autoQueueMode=false`, then let the user manage tasks from the web UI before any automatic pipeline is enabled.
- If the live AIF server maps `C:\Users\apron\source` into `/home/www`, submitting the Windows host path may store `/home/www/botIntevra` and initialize `.ai-factory` in the correct mounted repo.
- If the live AIF server is production-compose with only a named volume at `/home/www`, project creation from the Windows path will fail or create an inaccessible record; in that case the transfer should stop and produce a mount/config remediation note.
- The `botIntevra` CLI/orchestrator mismatch should become a separate follow-up task after registration, not part of this onboarding run.
