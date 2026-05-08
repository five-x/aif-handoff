<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Runbook

## Scope

Operational notes, rollout procedures, migration steps, and validation commands for `aif-handoff`.

## Bootstrap Notes

- Runtime files are managed through `codex-bootstrap-repo.py` and `codex-gpti-compile.py`.
- Memory curation runs through `codex-memsync.py`.

## Local Validation

- Build: npm.cmd run build
- Test: npm.cmd test
- Lint: npm.cmd run lint
- Run: npm.cmd run dev

## Deployment Anchor

- Production-like AIF host: `aif-handoff-01`.
- LAN UI: `http://192.168.88.67/`.
- LAN API base: `http://192.168.88.67/api`.
- SSH route: `ubuntu@192.168.88.67` with local key `C:\Users\apron\.ssh\codex_linux_key_5`.
- Host repository path: `/opt/aif-handoff`.
- Host projects path: `/srv/aif-handoff/projects`.
- AIF project mount path: `/home/www`.

Before treating deployment as unknown, consult:

- `docs/ops/aif-handoff-01.md`
- `docs/ops/botintevra-remote-migration.md`
- `docs/rdpi/personal/aif-handoff-proxmox-vm-20260507/result.md`

Typical server-side rollout sequence after the intended commit is pushed:

```bash
cd /opt/aif-handoff
git pull --ff-only
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3009/health
curl -fsS http://127.0.0.1:3100/health
curl -fsSI http://localhost/
```

LAN health check:

```bash
curl -fsS http://192.168.88.67/api/health
```

## Secrets Boundary

- Keep raw secrets in a dedicated secret layer.
- Shared memory may store only redacted pointers and non-secret operational notes.
