# aif-handoff-01 Operations

## Host

- Proxmox node: `pve` (`192.168.88.29`)
- VMID: `4207`
- Guest IP: `192.168.88.67`
- SSH user: `ubuntu`
- Repository path: `/opt/aif-handoff`
- Projects path: `/srv/aif-handoff/projects`

## Service Commands

```bash
cd /opt/aif-handoff
docker compose ps
docker compose logs --tail=100 api agent mcp web
docker compose up -d
docker compose pull
docker compose up -d --build
```

## Health Checks

```bash
curl -fsS http://127.0.0.1:3009/health
curl -fsS http://127.0.0.1:3100/health
curl -fsSI http://localhost/
```

From the LAN:

```bash
curl -fsS http://192.168.88.67/api/health
```

## Ports

- `80/tcp`: open on LAN for the web UI and `/api/` reverse proxy.
- `3009/tcp`: bound to `127.0.0.1` on the VM.
- `3100/tcp`: bound to `127.0.0.1` on the VM.

## Backup Scope

- Docker volume `aif-handoff_db-data`.
- Docker volumes `aif-handoff_claude-auth` and `aif-handoff_codex-auth` if OAuth logins are used.
- `/srv/aif-handoff/projects`.
- `/opt/aif-handoff/.env` as secret-bearing runtime config after provider credentials are added.
