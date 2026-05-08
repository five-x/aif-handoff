# Research

## Task framing and lane

- Task: plan a Proxmox VM for running the `aif-handoff` project locally.
- Lane: personal infrastructure.
- Target cluster inputs from user: local Proxmox hosts `192.168.88.28` and `192.168.88.29`.
- Scope for this pass: read-only planning and discovery only. No VM creation, no Proxmox config changes, no service deployment.

## Accepted planning sources

- Local repo: `README.md`, `docker-compose.yml`, `docker-compose.production.yml`, `.env.example`, `AGENTS.md`.
- Shared-memory lookup performed because the user explicitly asked whether prior cluster information exists.
- Live read-only network discovery was explicitly authorized by the user's "давай следующий шаг" after the proposed discovery step.

## Same-project memory

- No same-project memory existed for `aif-handoff` in this workspace beyond local repo facts.

## Cross-project infrastructure memory

- `192.168.88.29` is remembered as Proxmox host `homeProxmox`, part of cluster `VVKZGhostDC`.
- `192.168.88.29` hosts `ai-embed-02`, VMID `4204`, guest IP `192.168.88.63`, with GTX 1080 Ti passthrough and Ollama on `0.0.0.0:11434`.
- `192.168.88.28` is remembered as another Proxmox host associated with `ai-embed-01`, guest endpoint `192.168.88.61:11434`, GTX 1080 Ti, and Ollama embeddings.
- LAN gateway is remembered as MikroTik `192.168.88.1`; `mptcp-gw` is remembered as `192.168.88.230`.
- Known important or occupied IPs from memory include `192.168.88.60`, `.61`, `.62`, `.63`, `.65`, and `.70`.

References from memory:

- `C:\Users\apron\source\repos\servers\docs\ai_embed_proxmox_live_validation_192.168.88.28_2026-04-05.md`
- `ops/runbooks/ai-embed-02-readme-2026-04-09.md`
- `C:\Users\apron\source\repos\servers\docs\home-network-current-state.md`

## Local repo facts

- `aif-handoff` is a TypeScript/npm monorepo.
- Runtime components are designed to run via Docker Compose:
  - `api` on internal `3009`
  - `web` on `80` in compose production, or host `5180` in dev compose
  - `agent` as background worker
  - `mcp` on internal/localhost `3100`
  - named volumes for SQLite DB, project workspaces, Claude auth, and Codex auth
- GPU is not required for AIF Handoff itself. The app orchestrates runtimes and calls providers/CLIs; GPU-backed embedding services can remain external.
- Production compose resource limits currently imply a modest service footprint:
  - api: 2 CPU, 1 GB RAM
  - agent: 2 CPU, 1 GB RAM
  - web: 0.5 CPU, 256 MB RAM
  - mcp: 0.5 CPU, 256 MB RAM
- Extra headroom is needed for local project checkouts, npm builds, logs, database growth, and concurrent agent subprocesses.

## Live read-only discovery

- `192.168.88.28`:
  - TCP `22` open.
  - TCP `8006` open.
  - ICMP ping did not succeed from this workstation.
  - Hostname: `gpu`.
  - Authenticated root SSH access works with a local redacted SSH-key pointer from `C:\Users\apron\source\repos\servers`.
  - PVE node name: `gpu`.
  - PVE version: `pve-manager/9.1.1/42db4a6cf33dac83`.
  - CPU: AMD Ryzen 9 3900, 12 cores / 24 threads.
  - RAM: about 64 GiB total, about 10 GiB available at discovery time.
  - Rootfs: about 39 GiB total, about 25 GiB available.
  - `nvme-lvm`: about 954 GiB total, about 658 GiB available.
  - Running VMs:
    - `103` `WinWork`, 8 vCPU, 16 GiB RAM, 100 GiB disk.
    - `4202` `ai-embed-01`, 4 vCPU, 8 GiB RAM, 60 GiB disk.
    - `4203` `ai-llm-mi50-01`, 8 vCPU, 32 GiB RAM, 220 GiB disk.
  - Network: `vmbr0` on `192.168.88.28/24`, gateway `192.168.88.1`.
- `192.168.88.29`:
  - TCP `22` open.
  - TCP `8006` open.
  - ICMP ping did not succeed from this workstation.
  - Hostname: `pve`.
  - Authenticated root SSH access works with a local redacted SSH-key pointer from `C:\Users\apron\source\repos\servers`.
  - PVE node name: `pve`.
  - PVE version: `pve-manager/9.1.8/a8e257e1ad64dd92`.
  - CPU: Intel Xeon E5-1620 v3, 4 cores / 8 threads.
  - RAM: about 64 GiB total, about 25 GiB available at discovery time.
  - Rootfs: about 65 GiB total, about 50 GiB available.
  - `nvme-lvm`: about 1.45 TiB total, about 1.16 TiB available.
  - Running VMs/LXCs:
    - `100` `IntevraBuh`, 4 vCPU, 8 GiB RAM, 50 GiB disk.
    - `101` `HomeAssistance`, 3 vCPU, 4 GiB RAM, 32 GiB disk.
    - `102` `openproject-01`, LXC, 4 vCPU, 8 GiB RAM, 80 GiB disk.
    - `4100` `MR`, 4 vCPU, 2 GiB RAM, 4 GiB disk.
    - `4201` `ai-memory-01`, 4 vCPU, 4 GiB RAM, about 60 GiB disk.
    - `4204` `ai-embed-02`, 4 vCPU, 4 GiB RAM, 40 GiB disk.
    - `4205` `openclaw-01`, 2 vCPU, 4 GiB RAM, 40 GiB disk.
    - `4206` `codex-cli-01`, 4 vCPU, 8 GiB RAM, 50 GiB disk.
    - `4305` `tg-memory-bot-01`, LXC, 2 vCPU, 2 GiB RAM, about 12 GiB disk.
    - `9000` `fn-lwo-w10`, 4 vCPU, 8 GiB RAM, 200 GiB disk.
  - Network: `vmbr0` on `192.168.88.29/24`, gateway currently configured as `192.168.88.2`.
- Cluster:
  - Cluster name: `home`.
  - Nodes: `gpu`, `pve`.
  - Quorate: yes.
  - Both nodes online.
- Candidate IP TCP precheck against ports `22`, `80`, `443`, `3009`, `5180`, `8006`:
  - `192.168.88.66`: active on `22,80,443`.
  - `192.168.88.70`: active on `22,80`.
  - `192.168.88.67`, `.68`, `.69`, `.71`, `.72`, `.73`, `.74`, `.75`: no open checked ports observed.
- MikroTik API read-only lookup:
  - DHCP pool `lan88_pool`: `192.168.88.100-192.168.88.160`, `192.168.88.162-192.168.88.215`, `192.168.88.217-192.168.88.249`.
  - DHCP network for `192.168.88.0/24`: gateway `192.168.88.1`, DNS `192.168.88.1,1.1.1.1`.
  - MikroTik ARP table shows active entries for `.28`, `.60`, `.61`, `.62`, `.63`, `.65`, `.66`, `.70`.
  - MikroTik ARP table did not show `.67`, `.68`, `.69`, `.71`, `.72`, `.73`, `.74`, `.75`.
  - DHCP lease lookup did not show `.60-.75`, indicating this server range is not represented as ordinary dynamic leases in the current API view.

## Rejected or stale memory candidates

- Older `homeProxmox` inventory from February 2026 reported different RAM/storage state and is stale relative to live PVE discovery.
- Memory did not contain reliable current free CPU/RAM/storage data; live discovery supersedes it.
- TCP-port silence alone was treated as weak evidence; MikroTik ARP and DHCP pool data were used as stronger planning evidence.

## Open questions

- Which node has enough current CPU/RAM/storage headroom: `192.168.88.28` or `192.168.88.29`?
- Which storage pool should host the VM disk?
- What VMID range is reserved for application/service VMs?
- Which IP should be reserved in DHCP/static records?
- Should the service be LAN-only, reverse-proxied, or exposed through an existing gateway?
- Which runtime credentials will be used on the VM: OpenAI API key, Anthropic API key, Codex OAuth volume, Claude auth volume, or a mix?

## Hypotheses

- AIF Handoff should be deployed without GPU passthrough.
- A baseline VM with 4 vCPU, 8 GB RAM, and 80 GB disk is enough for a small always-on deployment.
- A larger VM with 6-8 vCPU, 16 GB RAM, and 150-200 GB disk is more appropriate if it will run multiple projects and concurrent agent builds.
- The best placement is likely node `pve` (`192.168.88.29`) on `nvme-lvm`, because it has more available RAM and more NVMe headroom than `gpu`.
- Candidate IP should use a static address outside DHCP pool, preferably `192.168.88.67` unless the user prefers another quiet address.
