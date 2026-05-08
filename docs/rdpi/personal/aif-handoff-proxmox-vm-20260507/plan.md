# Plan

## Status

Executed after `PLAN PASS` and explicit user authorization (`okey, deploy`).

## Verification gates

- Required before implementation: independent `PLAN PASS`.
- Required after implementation: service verification and review of exposed ports, persistence, and backups.
- Implementation result is recorded in `result.md`.

## Phase 1: Authenticated Proxmox inventory

Completed:

- Read-only root SSH access was found via local redacted key material in `C:\Users\apron\source\repos\servers`.
- PVE inventory was collected for nodes `gpu` (`192.168.88.28`) and `pve` (`192.168.88.29`).
- MikroTik API read-only lookup was used for DHCP pool and ARP data.

Decision:

- Use node `pve` (`192.168.88.29`) unless the user overrides it.
- Use storage `nvme-lvm`.
- Use bridge `vmbr0`.

## Phase 2: Network allocation

Completed:

1. Used IP `192.168.88.67`.
2. Configured static cloud-init network:
   - hostname: `aif-handoff-01`
   - IP: `192.168.88.67`
   - gateway: `192.168.88.1`
   - DNS: `192.168.88.1`, `1.1.1.1`
3. Avoided currently remembered or active IPs:
   - `192.168.88.60`, `.61`, `.62`, `.63`, `.65`, `.66`, `.70`

## Phase 3: VM sizing decision

Baseline sizing considered:

- 4 vCPU
- 8 GB RAM
- 120 GB disk on `nvme-lvm`
- Set AIF/Handoff concurrency conservatively at first:
  - keep project parallel execution disabled by default
  - set or retain `COORDINATOR_MAX_CONCURRENT_TASKS=1` until load is observed

Actual sizing selected because the user asked whether there is enough capacity for many projects:

- 6 vCPU
- 16 GB RAM
- 200 GB disk on `nvme-lvm`
- `COORDINATOR_MAX_CONCURRENT_TASKS=2` initially

Do not assume the current `pve` node can comfortably handle high concurrency.
It has enough disk, but only 8 physical CPU threads and is already materially
overcommitted by VM/LXC allocations.

## Phase 4: VM creation design

Completed:

1. Created `aif-handoff-01` on node `pve`.
2. Used VMID `4207` following the local 420x service-lane convention.
3. Installed Ubuntu 24.04 cloud image.
4. Enabled qemu-guest-agent.
5. Installed Docker Engine and Compose plugin.
6. Created `/opt/aif-handoff` and `/srv/aif-handoff/projects`.
7. Cloned `https://github.com/five-x/aif-handoff.git`.
8. Created `.env` with LAN-safe settings and no raw runtime secrets.

## Phase 5: Service deployment

Completed LAN deployment:

1. Ran `docker compose up -d --build`.
2. Verify:
   - web on `http://192.168.88.67/`
   - API health through web proxy on `http://192.168.88.67/api/health`
   - API local health on VM at `http://127.0.0.1:3009/health`
   - MCP local health on VM at `http://127.0.0.1:3100/health`
3. Confirmed direct LAN access to `3009` and `3100` is closed.

Stable deployment option:

1. Switch to `docker-compose.production.yml` after LAN dev validation.
2. Expose only `80` and optionally `443`.
3. Keep API/MCP localhost-bound unless an explicit integration requires LAN exposure.

## Phase 6: Backup and operations

1. Define backup coverage for DB, project workspaces, and auth volumes.
2. Record VM details in ops docs:
   - node
   - VMID
   - IP
   - storage pool
   - compose mode
   - exposed ports
   - backup path
3. Add a smoke-test runbook for restart and health checks.

## Current blockers

- Runtime provider credentials are not configured in `.env`; UI/API can run, but AI task execution requires Codex/Claude/OpenAI/OpenRouter auth setup.
- Backup policy is not yet wired into Proxmox Backup or a file-level backup job.
