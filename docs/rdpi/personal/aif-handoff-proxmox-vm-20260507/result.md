# Result

## Deployment

- VM: `aif-handoff-01`
- VMID: `4207`
- Proxmox node: `pve` (`192.168.88.29`)
- Guest IP: `192.168.88.67`
- OS: Ubuntu 24.04 cloud image
- CPU/RAM/disk: 6 vCPU, 16 GiB RAM, 200 GiB disk on `nvme-lvm`
- Gateway/DNS: `192.168.88.1`, `192.168.88.1 1.1.1.1`
- Onboot: enabled
- qemu-guest-agent: installed and responsive

## Application

- Repository: `/opt/aif-handoff`
- Projects directory: `/srv/aif-handoff/projects`
- Compose mode: `docker-compose.yml` plus VM-local `docker-compose.override.yml`
- Web URL: `http://192.168.88.67/`
- API: `127.0.0.1:3009` on the VM, exposed through `http://192.168.88.67/api/`
- MCP: `127.0.0.1:3100` on the VM
- Runtime secrets: not installed; `.env` contains only non-secret LAN defaults

## Verification

- `docker compose ps`: `api`, `agent`, `mcp`, and `web` are `Up`.
- VM-local `curl http://127.0.0.1:3009/health`: `{"status":"ok", ...}`.
- VM-local `curl http://127.0.0.1:3100/health`: `{"status":"ok"}`.
- LAN `http://192.168.88.67/`: HTTP 200 and web bundle served.
- LAN `http://192.168.88.67/api/health`: HTTP 200 with API health JSON.
- LAN direct TCP checks for `192.168.88.67:3009` and `192.168.88.67:3100`: closed.
- Guest disk after deployment: root filesystem about 193 GiB total, about 181 GiB free.
- Guest memory after deployment: about 15 GiB total, about 14 GiB available.

## Follow-up

- Configure runtime authentication for the provider to be used first.
- Add backup coverage for Docker volumes and `/srv/aif-handoff/projects`.
- Decide whether to move from LAN compose to production compose with a real domain and ACME.
