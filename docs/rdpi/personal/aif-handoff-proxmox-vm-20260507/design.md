# Design

## Goal

Run AIF Handoff as a stable local LAN service on a dedicated Proxmox VM while keeping GPU embedding VMs separate and preserving room for future project workspaces.

## Proposed VM profile

- VM name: `aif-handoff-01`
- Proposed node: `pve` (`192.168.88.29`)
- Proposed storage: `nvme-lvm`
- Proposed VMID: `4207`, if the local 420x service-lane convention is accepted. Note: PVE `nextid` currently returns `104`, so `4207` is a convention choice rather than the automatic next ID.
- Proposed IP: `192.168.88.67`
- OS: Debian 12 or Ubuntu 24.04 LTS
- Firmware: OVMF or SeaBIOS according to local Proxmox standard
- Agent: qemu-guest-agent enabled
- CPU: 4 vCPU baseline; 6 vCPU only if concurrency is raised after observation
- RAM: 8 GB baseline; 16 GB preferred if this will run several active projects concurrently
- Disk: 120 GB baseline; 200 GB preferred if project workspaces and node_modules are retained long-term
- GPU passthrough: none
- Network: `vmbr0`, static IP in `192.168.88.0/24`

## Capacity note

The limiting factor for "many projects" is concurrent execution, not the count
of projects registered in the UI. Storing many projects mostly consumes disk;
running many active implementation/review jobs consumes CPU and RAM through
agent subprocesses and project build/test commands.

Current `pve` discovery:

- physical CPU: 8 threads
- allocated VM/LXC vCPU on `pve`: 35
- total RAM: about 64 GiB
- allocated VM/LXC RAM on `pve`: about 52 GiB
- currently available RAM: about 25 GiB
- `nvme-lvm` available: about 1.16 TiB

Conclusion: `pve` is suitable for an initial AIF Handoff control-plane VM, but
not for unconstrained high-concurrency agent execution. Start with conservative
agent concurrency and scale only after observing load.

## Placement preference

Do not place this VM based on GPU availability. Existing GPU lanes are tied to embedding/LLM workloads, and AIF Handoff does not need direct GPU access.

Use node `pve` (`192.168.88.29`) for the first deployment:

- `pve` has about 25 GiB available RAM at discovery time versus about 10 GiB on `gpu`.
- `pve` has about 1.16 TiB available on `nvme-lvm` versus about 658 GiB on `gpu`.
- `gpu` currently runs GPU/large-memory workloads (`WinWork`, `ai-embed-01`, `ai-llm-mi50-01`) and should keep headroom for those.
- `pve` already hosts service/runtime VMs and LXCs, including `ai-memory-01`, `codex-cli-01`, `openproject-01`, and `tg-memory-bot-01`.

## Candidate IP policy

Avoid remembered active service IPs:

- `192.168.88.60`, `.61`, `.62`, `.63`, `.65`, `.66`, `.70`

Use `192.168.88.67` unless the user wants a different address. It is outside the dynamic DHCP pool and was absent from MikroTik ARP during discovery.

Fallback quiet candidates:

- `192.168.88.68`
- `192.168.88.69`
- `192.168.88.71`
- `192.168.88.72`

## Deployment design

Use Docker Compose on the VM.

Actual initial LAN mode:

- Development/internal LAN: `docker-compose.yml`
  - Web: `http://192.168.88.67/`
  - API: localhost-bound on the VM at `127.0.0.1:3009`, proxied through `/api/`
  - MCP: localhost-bound on the VM at `127.0.0.1:3100`
  - `docker-compose.override.yml` is used on the VM to keep API/MCP off the LAN
- Stable always-on mode: `docker-compose.production.yml`
  - Web: `http://<vm-ip>/`
  - API and MCP bound to localhost in production compose

Use a persistent directory layout such as:

- `/opt/aif-handoff` for the repository checkout
- `/srv/aif-handoff/projects` for managed project workspaces
- Docker named volumes for DB/auth unless local backup tooling requires bind mounts

## Secrets and auth

- Keep `.env` on the VM and out of git.
- Prefer API keys for production-style operation.
- Codex OAuth login broker is dev-only in this repo; do not enable it for production compose.
- Do not publish raw secrets into shared memory or RDPI artifacts.

## Security posture

- Keep service LAN-only by default.
- Open only required ports:
  - current LAN compose: `80` from trusted LAN/admin hosts; `3009` and `3100` stay localhost-bound
  - production compose: `80` and optionally `443`
  - SSH from trusted LAN/admin hosts
- If remote access is needed later, put it behind existing VPN/reverse proxy rather than direct WAN exposure.

## Backup posture

- Back up Docker volumes or bind-mounted data:
  - SQLite DB volume
  - `projects` workspace volume
  - auth volumes if OAuth-based runtimes are used
- Keep VM-level snapshots before major upgrades, but do not rely only on snapshots for persistent service data.
