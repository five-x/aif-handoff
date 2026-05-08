---
memory_id: task::aif-handoff::personal::personal-20260508-botintevra-remote-migration::delta
project_id: aif-handoff
repo_name: aif-handoff
lane: personal
task_id: personal-20260508-botintevra-remote-migration
source_path: docs/rdpi/personal/personal-20260508-botintevra-remote-migration/result.md
stability: stable
sensitivity: local-only
updated_at: 2026-05-08
supersedes: []
tags:
  - aif
  - botintevra
  - migration
  - remote-host
---

# botIntevra Remote Migration Delta

## Stable Facts

- `botIntevra` was migrated from `C:\Users\apron\source\botIntevra` to the
  remote AIF host `aif-handoff-01`.
- The physical host path is `/srv/aif-handoff/projects/botIntevra`.
- The AIF/container project path is `/home/www/botIntevra`.
- AIF project id is `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`.
- AIF project settings at creation: `parallelEnabled=false`,
  `autoQueueMode=false`.
- The valid SSH route used for migration was `ubuntu@192.168.88.67` with the
  configured local key named `codex_linux_key_5`.
- Remote validation passed: editable install, compileall, and pytest.
- Test result recorded during migration: `295 passed, 116 subtests passed`.
- A remote SQLite database was initialized at
  `/srv/aif-handoff/projects/botIntevra/data/bot-intevra/notes.sqlite3`.

## Boundaries

- No secret values were copied or recorded.
- Runtime service startup was not part of the migration.
- Real runtime secrets remain pending external provisioning before starting
  Telegram, LightRAG, transcription, or orchestrator services.
- Local `.git` history was not transferred; AIF initialized a new remote Git
  repository and no commit was created during the migration.
- The local checkout was retained. Local deletion or archival requires a
  separate explicit cleanup step.
