---
memory_id: ops::aif-handoff::aif-handoff-01::deploy-anchor
project_id: aif-handoff
repo_name: aif-handoff
stability: stable
sensitivity: local-only
updated_at: 2026-05-08
tags:
  - deployment
  - operations
  - aif-handoff-01
---

# aif-handoff-01 Deploy Anchor

## Stable Facts

- The deployed AIF instance is `aif-handoff-01`.
- LAN UI URL: `http://192.168.88.67/`.
- LAN API base: `http://192.168.88.67/api`.
- SSH route: `ubuntu@192.168.88.67` with local key
  `C:\Users\apron\.ssh\codex_linux_key_5`.
- Host repository path: `/opt/aif-handoff`.
- Host projects path: `/srv/aif-handoff/projects`.
- AIF project mount path: `/home/www`.

## Local Artifacts To Check

- `docs/ops/aif-handoff-01.md`
- `docs/ops/runbook.md`
- `docs/ops/botintevra-remote-migration.md`
- `docs/rdpi/personal/aif-handoff-proxmox-vm-20260507/result.md`

## Operating Note

For future deploy or rollout questions in this project, do not treat the server
as unknown before checking the artifacts above. Deployment usually means pushing
the intended commit, then running the server-side rollout from `/opt/aif-handoff`
on `aif-handoff-01`.
