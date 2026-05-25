# Plan - Remote Audit Quality Trust Canary

## Steps

1. Run an independent plan review and require `PLAN PASS` before any remote API or shared-memory access.
2. After `PLAN PASS`, set a single base URL variable to `http://192.168.88.67/api` and run a target guard that fails if the host is anything except `192.168.88.67`.
3. Query remote health and projects from that base URL only. Select an existing remote project suitable for a narrow audit canary; if none exists, record the exact remote blocker.
4. Create or trigger the negative audit canary task remotely with a concrete `audit/...md` report artifact path and intentionally weak/fabricated evidence pressure.
5. Start the negative task if needed through `POST /tasks/:id/events` with `start_ai`, then poll only the remote API until it reaches a terminal or blocked state, or until a documented timeout.
6. Capture negative evidence from task detail, artifact trust, timeline, evidence, and comments. Verify that trusted `validated_no_findings` was not produced.
7. Create or trigger the positive trusted audit canary remotely. Prefer the narrowest direct audit task; if direct task creation cannot produce roadmap-backed artifact trust, use the remote roadmap path to create a minimal roadmap-backed audit artifact.
8. Start/poll the positive task through the remote API only. Capture the same evidence surfaces.
9. Classify the canary outcome as `audit quality fixed`, `blocked by trust boundary`, `blocked by runtime saturation`, or `canary failed`.
10. If the canary finds a new implementation defect, create a separate queued intake card and do not run it.
11. Write `result.md` with remote evidence, gate outcomes, classification, and any follow-up card path.
12. Run independent `TEST PASS` and `REVIEW PASS` gates over the diagnostic evidence and RDPI result.
13. Run `$memsync MODE=auto LANE=work TASK_ID=work-20260525-remote-audit-quality-trust-canary` after `result.md` and gates pass.
14. Update only the matching `docs/intake/work_status.json` entry to `done` if the diagnostic task and local memory review phase succeed; otherwise set/leave it waiting with the blocker.

## Acceptance Criteria

- No command starts a local AIF service, loopback browser target, or local e2e runtime.
- Every live API URL uses `http://192.168.88.67/api`.
- Negative canary evidence proves weak/fabricated evidence cannot produce trusted `validated_no_findings`.
- Positive canary evidence proves a manifest-valid, ledger-valid, source-snapshot-valid, committed-blob-verified artifact can produce trusted pass, or records the exact blocker.
- Failure output includes concrete issue codes, fingerprint or failure signature when available, lifecycle state, and next action.
- The result makes one primary classification: fixed, trust-boundary blocked, runtime-saturation blocked, or failed.
- Any new implementation defect is queued as a separate intake card only.

## Verification Commands And Evidence

After `PLAN PASS`, use PowerShell/`Invoke-RestMethod` or `curl.exe` with an explicit base URL:

```powershell
$BaseUrl = "http://192.168.88.67/api"
if (([uri]$BaseUrl).Host -ne "192.168.88.67") { throw "Remote target guard failed: $BaseUrl" }
```

Planned remote reads:

```text
GET  http://192.168.88.67/api/health
GET  http://192.168.88.67/api/projects
GET  http://192.168.88.67/api/tasks/:id
GET  http://192.168.88.67/api/tasks/:id/artifact-trust
GET  http://192.168.88.67/api/tasks/:id/timeline
GET  http://192.168.88.67/api/tasks/:id/evidence
GET  http://192.168.88.67/api/tasks/:id/comments
```

Planned remote writes:

```text
POST http://192.168.88.67/api/tasks
POST http://192.168.88.67/api/tasks/:id/events
POST http://192.168.88.67/api/projects/:id/roadmap/generate or /roadmap/import only if a direct positive task cannot exercise trusted artifact state
```

The final `result.md` must include:

- target URL and target guard evidence;
- negative task id and terminal status;
- negative trust rollup and validator/lifecycle/review reason codes;
- positive task id and terminal status, or blocker;
- positive trust rollup and manifest/ledger/source snapshot/lifecycle/commit proof if available;
- exact reason for `audit quality fixed`, `blocked by trust boundary`, `blocked by runtime saturation`, or `canary failed`.

## Risks

- The deployed service may be saturated or rate-limited. If task execution stalls or runtime endpoints report lease/cooldown/provider blockers, classify as runtime saturation.
- Direct audit task creation may not create roadmap batch artifact rows. If artifact-trust cannot prove trusted pass, use the roadmap-backed path for the positive scenario.
- The remote service may not expose validation details deeply enough through current API DTOs. If issue codes/fingerprint/lifecycle cannot be retrieved, record that as a canary failure or follow-up defect depending on whether the underlying task still fails closed.
- Negative scenario prompts must be clear that this is a diagnostic canary, but the validator outcome, not prompt obedience, is the proof.
