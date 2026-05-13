<!-- Managed by codex-platform; audit result artifact. -->

# Result

Status: audit evidence updated after SSH access was confirmed with explicit key `codex_linux_key_5`.

## Gate status

- Initial `PLAN FAIL`: independent reviewer rejected broad canary wording because it could authorize write/task execution during an audit.
- Revision: canary scope was reduced to read-only readiness checks; write/execution canary must be separate follow-up or explicit scope expansion.
- `PLAN PASS`: independent reviewer approved the revised read-only plan.
- Initial `TEST FAIL`: tester used invalid Windows glob/quoting for local verification commands; corrected checks found no artifact blocker.
- `TEST PASS`: independent tester reran local checks after SSH evidence was added; `git diff --check` passed, credential-shaped scans found no raw secrets, and result coverage was confirmed.
- `REVIEW PASS`: independent final reviewer approved the updated SSH-backed audit with no blocking issues.
- `memsync MODE=auto`: success after updated final review; generated local memory artifacts and ingested 2 shared-memory pattern items.

## Evidence collected

All live checks below were read-only and performed after `PLAN PASS`.

### SSH and host internals

Command:

```text
ssh -i "$env:USERPROFILE\.ssh\codex_linux_key_5" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=8 ubuntu@192.168.88.67 "hostname && whoami"
```

Observed output:

```text
aif-handoff-01
ubuntu
```

Additional host evidence:

- repo path: `/opt/aif-handoff`.
- latest checked commit: `40211c6 fix: harden audit roadmap guardrails`.
- Docker Compose version: `v5.1.3`.
- services: `api`, `agent`, `mcp`, `web`.
- live ports from `docker compose ps`: `api` is `0.0.0.0:3009->3009`, `mcp` is `0.0.0.0:3100->3100`, `web` is `0.0.0.0:80->80`.
- host listeners from `ss`: `0.0.0.0:80`, `0.0.0.0:3009`, `0.0.0.0:3100` plus IPv6 equivalents.
- host project path exists: `/srv/aif-handoff/projects`.
- disk: `/dev/sda1` is 193G total, 26G used, 168G free, 14% used.

Verdict: SSH access works with an explicit non-default key. Host-level deployment evidence is now available.

### Public/LAN health

Commands:

```text
curl.exe -fsS http://192.168.88.67/api/health
curl.exe -fsSI http://192.168.88.67/
curl.exe -s -o NUL -w "%{http_code}\n" http://192.168.88.67:3009/health
curl.exe -s -o NUL -w "%{http_code}\n" http://192.168.88.67:3100/health
```

Observed output summary:

- `/api/health`: `{"status":"ok","uptime":1488}`.
- `/`: `HTTP/1.1 200 OK`, `Server: Angie/1.11.4`.
- direct API port `3009`: HTTP `200`.
- direct MCP port `3100`: HTTP `200`.

Verdict: web, API, and MCP are reachable. Direct LAN exposure of `3009` and `3100` conflicts with the documented production expectation that API/MCP are bound to localhost on the VM.

### Projects

Command:

```text
curl.exe -fsS http://192.168.88.67/api/projects
```

Observed output summary:

- One project exists: `botIntevra`.
- Project root path: `/home/www/botIntevra`.
- `parallelEnabled=false`.
- `autoQueueMode=true`.
- task/plan/review defaults all point to runtime profile `93a454a2-4618-4e43-99d6-125962e25de2`.
- chat default is unset at project level.

Additional SSH evidence:

- `PROJECTS_DIR=/srv/aif-handoff/projects`.
- `PROJECTS_MOUNT=/home/www`.
- Docker mounts for `api`, `agent`, and `mcp` include bind mount `/srv/aif-handoff/projects -> /home/www`.
- `/srv/aif-handoff/projects/botIntevra` exists and is owned by `ubuntu:ubuntu`.

Verdict: current project storage is now proven end to end: host path `/srv/aif-handoff/projects` is bind-mounted into containers at `/home/www`.

### Runtime profiles

Command:

```text
curl.exe -fsS http://192.168.88.67/api/runtime-profiles
```

Observed output summary:

- 4 enabled profiles exist.
- Global `QwenLocal`: `codex`/`openai`, `api`, `http://192.168.88.62:8003/v1`, model `Qwen3-32B-Q4_K_M.gguf`.
- Global `QwenMI50`: `codex`/`openai`, `api`, `http://192.168.88.62:8004/v1`, model `Qwen3-8B-Q8_0.gguf`.
- Project `QwenLocalAgent Canary`: `codex`/`openai`, `app-server`, model `Qwen3-32B-Q4_K_M.gguf`.
- Project `Qwen Local Agent Canary`: `qwen-local-agent`/`qwen`, `api`, model `Qwen3-32B-Q4_K_M.gguf`, last usage at `2026-05-11T23:03:18.555Z`.

Additional read-only checks:

```text
curl.exe -s -o NUL -w "%{http_code}\n" http://192.168.88.62:8003/v1/models
curl.exe -s -o NUL -w "%{http_code}\n" http://192.168.88.62:8004/v1/models
```

Both returned HTTP `200`.

Verdict: runtime profile records and the referenced Qwen model endpoints are reachable from this environment. The active project uses `qwen-local-agent` for task/plan/review, which is the right profile for repository-tool execution against a local Qwen endpoint.

### Settings

Command:

```text
curl.exe -fsS http://192.168.88.67/api/settings
```

Observed output summary:

- `useSubagents=false`.
- `maxReviewIterations=3`.
- `autoReviewStrategy=full_re_review`.
- `usageLimitsEnabled=false`.
- `warmupEnabled=false`.
- `runtimeProfileCount=4`, `enabledRuntimeProfileCount=4`.
- app task/plan/review defaults use global `QwenLocal`.
- app chat default uses global `QwenMI50`.

Verdict: future tasks default to non-subagent mode unless task/project UI options override it. Current audit-v8 tasks used `useSubagents=true` at task level, so the system can run that mode, but it is not the global default.

### Project config and roadmap

Commands:

```text
curl.exe -fsS "http://192.168.88.67/api/settings/config/status?projectId=e4a3a101-ec7f-4f93-9b68-e297ffe8952f"
curl.exe -fsS "http://192.168.88.67/api/settings/config?projectId=e4a3a101-ec7f-4f93-9b68-e297ffe8952f"
curl.exe -fsS "http://192.168.88.67/api/projects/e4a3a101-ec7f-4f93-9b68-e297ffe8952f/roadmap/status"
```

Observed output summary:

- `.ai-factory/config.yaml` exists at `/home/www/botIntevra/.ai-factory/config.yaml`.
- `ROADMAP.md` exists.
- workflow uses `auto_create_dirs=true`, `plan_id_format=slug`, `verify_mode=normal`.
- git config uses `enabled=true`, `base_branch=main`, `create_branches=true`, `branch_prefix=feature/`, `skip_push_after_commit=false`.

Verdict: the current project has the expected AIF project config and roadmap scaffold.

### Task/pipeline state

Command:

```text
curl.exe -fsS "http://192.168.88.67/api/tasks?projectId=e4a3a101-ec7f-4f93-9b68-e297ffe8952f&limit=200"
```

Observed output summary:

- Task status counts: `done=6`, `blocked_external=1`.
- Blocked task: `Synthesize audit findings`.
- Block reason: `inconclusive_batch_evidence`; manual review is required because source audit reports lacked substantive evidence.
- Effective runtime for the blocked task: project default `Qwen Local Agent Canary` (`qwen-local-agent`).

Verdict: the agent pipeline is active and recently processed audit tasks. The remaining blocked task is a quality-gate block, not an infrastructure outage.

### MCP/project MCP config

Commands:

```text
curl.exe -s -o NUL -w "%{http_code}\n" http://192.168.88.67:3100/health
curl.exe -fsS http://192.168.88.67/api/projects/e4a3a101-ec7f-4f93-9b68-e297ffe8952f/mcp
```

Observed output summary:

- MCP health on direct port `3100`: HTTP `200`.
- Project `.mcp` server map: `{}`.

Verdict: Handoff MCP service is running, but the current project does not expose project-local MCP servers via `.mcp.json`.

### Warmup

Command:

```text
curl.exe -fsS http://192.168.88.67/api/projects/e4a3a101-ec7f-4f93-9b68-e297ffe8952f/warmup
```

Observed output summary:

- `enabled=false`.
- planner/implementer/reviewer targets resolve to project `qwen-local-agent`.
- skip reason: `feature_disabled`.

Verdict: warmup/session-fork is disabled. This is appropriate for the current `qwen-local-agent` profile because it does not expose session-fork support.

### Host feature flags and container readiness

Safe non-secret `.env` flag check:

```text
ACTIVITY_LOG_MODE=batch
AGENT_BYPASS_PERMISSIONS=true
AGENT_USE_SUBAGENTS=false
AIF_ENABLE_CODEX_LOGIN_PROXY=true
AIF_USAGE_LIMITS_ENABLED=false
AIF_WARMUP_ENABLED=false
COORDINATOR_MAX_CONCURRENT_TASKS=2
CORS_ORIGIN=http://192.168.88.67
MCP_PORT=3100
PORT=3009
PROJECTS_DIR=/srv/aif-handoff/projects
PROJECTS_MOUNT=/home/www
WEB_PORT=80
```

Container readiness evidence:

- `agent` container has `git`, `curl`, `claude`, `codex`, `npx`, and `ai-factory 2.10.0`.
- `api`, `agent`, and `mcp` mount `aif-handoff_db-data` at `/data`.
- `api` and `agent` mount auth volumes `aif-handoff_claude-auth` and `aif-handoff_codex-auth`.
- Docker volumes present: `aif-handoff_db-data`, `aif-handoff_claude-auth`, `aif-handoff_codex-auth`, `aif-handoff_projects`, `aif-handoff_ssl-certs`.

Verdict: required container binaries and project/data/auth mounts are present. The running stack is configured like development compose in several important ways: direct `0.0.0.0` API/MCP publishing and Codex login proxy enabled.

### Firewall and backups

Commands:

```text
sudo -n ufw status
sudo -n iptables -S | grep -E '3009|3100| dpt:80|--dport 80'
crontab -l
systemctl list-timers --all --no-pager | grep -Ei 'backup|aif|docker|restic|borg|rsync'
```

Observed output summary:

- `ufw`: inactive.
- Docker iptables rules accept published container ports `80`, `3009`, and `3100`.
- no crontab for `ubuntu`.
- only backup-ish system timer observed was `dpkg-db-backup.timer`; no AIF/Docker/project backup timer was observed.

Verdict: no host firewall or backup job evidence was found for AIF Handoff state.

### Recent logs

Command:

```text
docker compose logs --tail=80 api agent mcp | grep -Ei 'error|warn|failed|permission|denied|blocked|fatal'
```

Observed output summary:

- API logs show repeated `runtime-warmup` warnings: `Runtime session fork requested but unavailable` for `qwen-local-agent`.
- API logs show `audit-v9` roadmap generation failures: `qwen-local-agent exceeded 120000ms limit`.
- Agent logs show expected fallback warnings because `qwen-local-agent` does not support agent definitions or AIF skill command fallback and uses direct workflow prompts.
- Agent logs show completion evidence guard blocked `Synthesize audit findings` as `audit_inconclusive`, which matches API task state.

Verdict: pipeline is operating, but roadmap generation with `qwen-local-agent` is timing out at the API one-shot timeout, and warmup is being requested despite unsupported session fork.

## Findings

### F1: Direct API and MCP ports are exposed on the LAN

Severity: high.

Evidence:

- `curl.exe -s -o NUL -w "%{http_code}\n" http://192.168.88.67:3009/health` returned `200`.
- `curl.exe -s -o NUL -w "%{http_code}\n" http://192.168.88.67:3100/health` returned `200`.
- `docker compose ps` shows `api` published as `0.0.0.0:3009->3009` and `mcp` published as `0.0.0.0:3100->3100`.
- `ss` shows listeners on `0.0.0.0:3009` and `0.0.0.0:3100`.
- `docs/ops/aif-handoff-01.md` says ports `3009/tcp` and `3100/tcp` should be bound to `127.0.0.1` on the VM.
- `docker-compose.production.yml` binds `127.0.0.1:3009:3009` and `127.0.0.1:3100:3100`.

Risk: API and MCP endpoints are reachable directly from the LAN, bypassing the intended localhost-only production boundary. The API currently returns project, runtime-profile, and task data without an auth challenge on the tested LAN path.

Required action: switch to production port bindings or block `3009`/`3100` at host firewall, leaving only web/reverse-proxy ports exposed intentionally.

### F2: Live stack is in dev-like posture, not production posture

Severity: high.

Evidence:

- `.env` has `AIF_ENABLE_CODEX_LOGIN_PROXY=true`.
- `docker compose ps` exposes API/MCP on `0.0.0.0`.
- production compose in this repo sets `AIF_ENABLE_CODEX_LOGIN_PROXY=false` and binds API/MCP to localhost.

Risk: dev-only Codex login proxy and direct service exposure are enabled on the server. This is convenient for LAN operation but does not match the documented production security posture.

Required action: decide whether this server is intentionally LAN-dev or production. If production, run with `docker-compose.production.yml` semantics: `AIF_ENABLE_CODEX_LOGIN_PROXY=false`, API/MCP localhost-only, and only web exposed.

### F3: Project storage convention is proven but docs/compose need alignment

Severity: low.

Evidence:

- API project root is `/home/www/botIntevra`.
- runbook says host projects path is `/srv/aif-handoff/projects`.
- live `.env` has `PROJECTS_DIR=/srv/aif-handoff/projects` and `PROJECTS_MOUNT=/home/www`.
- live Docker mounts bind `/srv/aif-handoff/projects` to `/home/www` for `api`, `agent`, and `mcp`.
- local `docker-compose.production.yml` still declares a named `projects` volume.

Risk: the live server uses the right host bind mount for future projects, but the checked-in production compose says named volume. Operators could redeploy with the wrong file and move project state into an unexpected Docker volume.

Required action: update production compose or runbook so they consistently describe the actual intended storage model:

- named Docker volume only, with backups of that volume; or
- bind mount `/srv/aif-handoff/projects:/home/www`, with backups of that host directory.

### F4: Current project has no project-level chat runtime default

Severity: low.

Evidence:

- `/api/projects` returns `defaultChatRuntimeProfileId:null` for `botIntevra`.
- `/api/runtime-profiles/effective/chat/<projectId>` resolves chat to the system default `QwenMI50`.

Risk: chat behavior for this project can drift from task/plan/review behavior because it uses the app-level chat default instead of an explicit project profile.

Required action: set a project chat default if chat should use the same endpoint/model family as task execution.

### F5: Subagents are not the global default

Severity: low.

Evidence:

- `/api/settings` returns `useSubagents:false`.
- Current audit-v8 tasks used `useSubagents:true` at task level and did execute through the pipeline.

Risk: future tasks will not use the specialized subagent mode unless selected per task/project flow. That may be intentional for speed/cost, but it is not the "always subagents" posture.

Required action: choose the intended default. If future projects should use specialized plan/implement/review orchestration by default, set `AGENT_USE_SUBAGENTS=true` and verify it with the chosen runtime. If direct skills/simple mode is preferred, keep it false and document that future projects must opt in per task.

### F6: Memory/self-learning is operator-driven, not server-automatic

Severity: medium.

Evidence:

- Local project docs and skills define RDPI plus `memsync MODE=auto`.
- `docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/research.md` records that there is no evidence Handoff can safely run host-level `codex-memsync.py` from inside containers without a separate design.
- Live API has no memory-publication endpoint checked in this audit.

Risk: future projects can accumulate RDPI and local memory artifacts, but server-side automatic publication to shared memory is not proven. Operators may assume "self-learning" happens automatically when it actually requires close-out workflow.

Required action: choose one:

- keep memory sync as operator/local close-out using Codex/shared-memory tools; or
- create a separate design/implementation task for a server-supported memory bridge with secret handling, publish gates, and audit logs.

### F7: No AIF Handoff backup job evidence found

Severity: high.

Evidence:

- Docker volumes include `aif-handoff_db-data`, auth volumes, and `aif-handoff_ssl-certs`.
- Project data lives under `/srv/aif-handoff/projects`.
- `crontab -l` for `ubuntu` returned no crontab.
- `systemctl list-timers` did not show AIF/Docker/project backup timers; only `dpkg-db-backup.timer` matched backup-like text.

Risk: DB, auth, project repositories, `.env`, and SSL material may have no scheduled backup despite being required operational state.

Required action: add and document backups for DB volume, auth volumes, `/srv/aif-handoff/projects`, `.env`, and SSL cert volume if used.

### F8: Qwen roadmap generation is timing out at API one-shot limit

Severity: medium.

Evidence:

- Recent API logs show `roadmapAlias="audit-v9"` failures with `QWEN_LOCAL_AGENT_TIMEOUT`.
- Error text says `qwen-local-agent exceeded 120000ms limit`.

Risk: future roadmap generation may fail for larger prompts even though task execution works. This affects onboarding and audit-roadmap creation.

Required action: tune API one-shot runtime timeout/profile options for Qwen roadmap generation, use a faster profile for generation, or route roadmap generation to a more suitable model.

### F9: Secret values were returned during audit command output and should be rotated

Severity: high.

Evidence:

- An audit command intended to print `.env` keys returned `.env` values due quoting/interpolation error. The final artifact intentionally does not repeat those values.

Risk: provider key and internal broadcast token values were exposed to the audit process output. Even if not copied into repo artifacts, treating them as potentially disclosed is the safer operational posture.

Required action: rotate `OPENAI_API_KEY` and `INTERNAL_BROADCAST_TOKEN`, then restart affected services. Review terminal/log retention according to your local policy.

## What needs to be installed or configured

Based on host and API evidence, Dockerized application services and required container tools are already installed. The important work is configuration hardening and operational wiring, not installing Node packages on the host.

Required before relying on this for multiple projects:

- Close or firewall LAN access to direct API `3009` and MCP `3100` unless intentionally exposed.
- Disable dev-only Codex login proxy for production (`AIF_ENABLE_CODEX_LOGIN_PROXY=false`) unless this server is intentionally LAN-dev.
- Align production compose and runbook around `/srv/aif-handoff/projects:/home/www` or explicitly switch to named-volume storage.
- Add backup jobs covering DB data, auth volumes, project storage, `.env`, and SSL certs.
- Rotate `OPENAI_API_KEY` and `INTERNAL_BROADCAST_TOKEN` because audit output briefly exposed their values.
- Set explicit runtime defaults for each project, including chat if desired.
- Decide global `AGENT_USE_SUBAGENTS` default.
- Keep warmup disabled for `qwen-local-agent` unless a future runtime supports session fork and the rollout flags are enabled intentionally.
- Keep usage-limits disabled for Qwen local profiles unless there is a real provider signal source to monitor.
- Tune roadmap generation timeout/model path for Qwen, or route roadmap generation to a faster profile.
- Decide whether memory sync remains operator-local or gets a separate server-side implementation.

Recommended follow-up cards:

1. Harden production network exposure for API/MCP ports and disable dev-only Codex login proxy.
2. Add backup procedure and job for DB/auth/project/env/SSL state.
3. Align production compose/runbook with the live `/srv/aif-handoff/projects:/home/www` bind mount.
4. Rotate exposed credentials and restart affected services.
5. Tune or reroute Qwen roadmap generation to avoid 120s API one-shot timeouts.
6. Define memory close-out operating model for AIF Handoff projects.
7. Decide and set project/global defaults for chat runtime and subagent mode.

## Residual gaps

- No write/execution canary was run by design; this audit stayed read-only.
