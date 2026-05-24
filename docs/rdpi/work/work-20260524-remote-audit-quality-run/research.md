# Research

## Task Framing

- Task ID: `work-20260524-remote-audit-quality-run`
- Lane: `work`
- Source: direct operator request on 2026-05-24: run a separate remote-only audit-quality validation.
- Scope: diagnostic live validation only; do not implement fixes in this run.
- Remote service: `http://192.168.88.67`
- Remote API: `http://192.168.88.67/api`

## Accepted Local Facts

- Project guidance forbids local service/browser/perf/load validation by default; service validation must target `192.168.88.67`.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: refreshed`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- API routes expose:
  - `GET /api/health`
  - `GET /api/projects`
  - `GET /api/tasks`
  - `POST /api/tasks`
  - `GET /api/tasks/:id`
  - `GET /api/tasks/:id/timeline`
  - `GET /api/tasks/:id/artifact-trust`
  - `GET /api/tasks/:id/evidence`
- Audit tasks are valid only when scoped and diagnostic. Broad audit requests must be decomposed into an audit roadmap before execution.

## Live Remote Planning Evidence After PLAN PASS

- `GET http://192.168.88.67/api/health` returned `status=ok`.
- `GET http://192.168.88.67/api/agent/status` returned `activeTaskCount=0`.
- `GET http://192.168.88.67/api/projects` did not include an `aif-handoff` project.
- Available remote projects:
  - `botIntevra`, project id `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`, root `/home/www/botIntevra`, auto queue enabled.
  - `LWO`, project id `39a8cd6b-91a3-4fa7-99f9-f1830e4fcb67`, root `/home/www/lwoio`, auto queue enabled.
- `GET /api/tasks` showed existing completed `botIntevra` audit tasks with scoped paths such as `src/bot_intevra/attachments.py`, `src/bot_intevra/backup_crypto.py`, and `src/bot_intevra/service.py`.
- Because `aif-handoff` is absent from remote project registry, the fresh audit-quality canary must either stop as blocked or use a registered remote project. This plan uses `botIntevra` because it has known scoped audit paths and no active tasks.

## Boundaries

- Do not start a local dev server.
- Do not call `localhost`, `127.0.0.0/8`, `0.0.0.0`, `::1`, or `::` service targets.
- Do not edit product code as part of this diagnostic run.
- Remote writes are limited to creating one narrow diagnostic audit task and reading its resulting state/artifacts.
