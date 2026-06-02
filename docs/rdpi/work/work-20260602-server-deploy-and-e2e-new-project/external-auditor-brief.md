# External Auditor Brief: AIF Agent Workflow Stabilization

Date: 2026-06-02

Repository: `five-x/aif-handoff`

Branch: `codex/roadmap-audit-oom-hardening`

Server: `aif-handoff-01`, `192.168.88.67`

Prepared for: external review of the rollout and E2E behavior after agent workflow hardening.

## Executive Summary

We deployed the `aif-handoff` workflow-hardening branch to the server and ran a new end-to-end project through the live system. The deployed hardening helped: repeated tool-loop behavior was stopped fail-closed instead of spinning indefinitely.

However, the full autonomous task workflow is not yet stable through final closeout. The task implementation artifact was completed, committed, and verified manually against the deployed API, but the task card itself remained blocked during closeout because the runtime/evidence contract validation rejected the agent's final handoff output.

Conclusion:

- The hardening is effective as a containment layer for repeated tool loops and malformed workflow output.
- The remaining gap is not the API smoke artifact itself; it is the closeout/rework path for already-committed implementation work, especially around `aif-result` and implementation-manifest evidence validation.

## GitHub State

The branch has been pushed to GitHub.

Remote:

```text
https://github.com/five-x/aif-handoff.git
```

Branch:

```text
codex/roadmap-audit-oom-hardening
```

Relevant commits:

```text
09a67172 docs: record e2e continuation result
b902ddab docs: record deploy review pass
3ece4eec docs: record server deploy e2e result
88b4fc39 fix: harden agent workflow contracts
```

The only known local dirty file after push is unrelated and was not staged or committed:

```text
docs/kb/windows-codex-bootstrap-validation.md
```

## What Changed In The Hardening Commit

Deploy commit:

```text
88b4fc39ecb909329d406caf33574065302fdd16
fix: harden agent workflow contracts
```

The commit touched these main areas:

- Runtime Qwen local agent adapter and tool handling.
- Agent implementer behavior and related tests.
- Subagent query handling tests.
- Runtime stage policy.
- Shared `aif-result` contract validation.
- RDPI and intake artifacts documenting the stabilization work.

Files changed included:

```text
packages/runtime/src/adapters/qwenLocalAgent/api.ts
packages/runtime/src/adapters/qwenLocalAgent/tools.ts
packages/runtime/src/__tests__/qwenLocalAgent.test.ts
packages/agent/src/subagents/implementer.ts
packages/agent/src/__tests__/implementer.test.ts
packages/agent/src/__tests__/subagentQuery.test.ts
packages/shared/src/aifResultContract.ts
packages/shared/src/runtimeStagePolicy.ts
packages/shared/src/__tests__/aifResultContract.test.ts
packages/shared/src/__tests__/runtimeStagePolicy.test.ts
```

High-level intent:

- Stop repeated identical local-agent tool calls before they become unbounded loops.
- Enforce stricter result contracts for implementation/rework closeout.
- Make runtime-stage policy behavior explicit and tested.
- Record the stabilization work in RDPI/intake artifacts.

## Pre-Deploy Local Validation

Before rollout, the following local checks passed:

```text
npm.cmd run test --workspace=@aif/runtime -- src/__tests__/qwenLocalAgent.test.ts
npm.cmd run test --workspace=@aif/agent -- src/__tests__/implementer.test.ts src/__tests__/subagentQuery.test.ts
npm.cmd run test --workspace=@aif/shared -- src/__tests__/runtimeStagePolicy.test.ts src/__tests__/aifResultContract.test.ts
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Observed note:

- `npm.cmd run lint` passed with a known non-failing warning in `packages/agent/src/subagents/reviewer.ts:1462`.

## Server Rollout

Server:

```text
192.168.88.67
```

Server repo:

```text
/opt/aif-handoff
```

Rollout state:

- Server checkout was clean before rollout.
- Server branch was `codex/roadmap-audit-oom-hardening`.
- Server fast-forwarded to `88b4fc39ecb909329d406caf33574065302fdd16`.
- `docker compose up -d --build` completed successfully.
- Containers were rebuilt/recreated and started.

Post-rollout services:

```text
aif-handoff-api-1    Up, port 3009
aif-handoff-mcp-1    Up, port 3100
aif-handoff-web-1    Up, port 80
aif-handoff-agent-1  Up, port 3010
```

Health checks:

```text
http://127.0.0.1:3009/health  -> {"status":"ok"}
http://127.0.0.1:3100/health  -> {"status":"ok"}
http://localhost/             -> HTTP 200
http://192.168.88.67/api/health -> {"status":"ok"}
```

## New E2E Project

Project created on the deployed server:

```text
Name: E2E Launch Lab 2026-06-02
ID: 020398d6-0a24-4fc1-ab9e-efa575133391
Root path: /home/www/e2e-launch-lab-20260602
```

Initial backlog tasks:

```text
1dbcc531-66b6-4a85-bb7d-d62cfe7e9f47  Add API contract smoke tests
87c2d580-ef4d-4095-a668-d2cc365357a0  Add deployment health probe script
735e8d40-484e-4f83-82f0-90395a2b5a76  Build remote launch checklist
2a4c3c67-d74e-4e83-9476-7bd52f590f31  Write onboarding smoke-test notes
```

The first task was used for the active workflow execution.

## Remote Perf E2E

Environment:

```text
AIF_SKIP_DEV_SERVER=1
AIF_WEB_URL=http://192.168.88.67
AIF_API_URL=http://192.168.88.67/api
```

Command:

```text
npm run perf --workspace=@aif/web
```

Result:

```text
3 passed
```

Measured checks included:

- `chat/sessions`
- `dashboard cold load`
- `runtime-profiles`

## Workflow Execution Behavior

Task:

```text
1dbcc531-66b6-4a85-bb7d-d62cfe7e9f47
Add API contract smoke tests
```

### Requirements

The task initially requested blocking clarification:

```text
Question: What behavior must be included in the first version?
Question ID: 967be3ff-9460-416c-b8a5-46594ad02212
Batch ID: 36f3b996-41c9-41c9-8d8b-79a335fb1091
```

Answer provided:

- Build a small API contract smoke artifact.
- Cover project create/list readback.
- Cover paused backlog task create/list readback.
- Cover task comment create/readback if clean.
- Do not start or execute agent tasks.
- Do not add broad UI coverage.
- Do not change Docker, runtime profiles, scheduler, secrets, or deployment config.

Result:

- Requirements resumed successfully.
- Research completed.
- Design completed.

### Planning

The first planning attempt hit the new hardening:

```text
operator_input_required
repeated_tool_loop_blocked
qwen-local-agent repeated run_shell with the same normalized fingerprint 3 time(s), exceeding limit 2
```

Interpretation:

- This is the expected fail-closed behavior from the deployed hardening.
- The system stopped repeated shell-tool behavior rather than allowing an unbounded loop.

After operator guidance and `retry_from_blocked`:

- Planning resumed.
- Plan quality guard requested two replans.
- The planner eventually reached `plan_ready`.

Observed plan-quality issues:

```text
missing_checklist
slash_fallback_echo
```

### Implementation

Implementation started and created the intended files, but the generated script had contract mistakes:

- It incorrectly required `AIF_API_TOKEN`.
- It used `/comments` with `content`.
- The actual API contract uses `/tasks/:id/comments` with `message`.
- `POST /projects` requires `rootPath`.

The automatic implementer then blocked during commit/runtime handling:

```text
operator_input_required: Runtime permissions blocked this task.
```

Manual correction was applied in the remote E2E project.

## Completed Remote Artifact

Remote project path inside the API container:

```text
/home/www/e2e-launch-lab-20260602
```

Committed artifact:

```text
1e296ad test: add API contract smoke script
```

Files committed:

```text
.ai-factory/PLAN.md
package.json
scripts/smoke-api-contract.js
```

The project worktree was clean after commit.

## API Smoke Test

Command run against the deployed server:

```text
AIF_API_URL=http://192.168.88.67/api npm run test:smoke
```

Auth mode:

```text
No AIF_API_TOKEN
```

Result:

```text
27 PASS
0 FAIL
```

Coverage:

- `POST /projects` with required `rootPath`.
- `GET /projects` readback.
- `POST /tasks` with `autoMode=false` and `paused=true`.
- `GET /tasks?projectId=<projectId>` readback.
- Confirmed task remained `status=backlog`.
- Confirmed task preserved `autoMode=false`.
- Confirmed task preserved `paused=true`.
- `POST /tasks/:id/comments` with `message`.
- `GET /tasks/:id/comments` readback.

## Closeout/Rework Behavior

After the artifact was manually completed and verified, we retried the workflow so the task card could close normally.

Observed behavior:

1. Retry advanced past the original runtime block.
2. Evidence validation then blocked with:

```text
aif_result_contract_invalid: missing_aif_result_contract
```

3. A follow-up retry provided an explicit `aif-result` contract.
4. The task reached implementation evidence guard rework.
5. It then returned to:

```text
operator_input_required: Runtime permissions blocked this task.
```

Final state of the task card:

```text
status: blocked_external
blockedFromStatus: implementing
paused: true
autoMode: false
blockedReason: operator_input_required: Runtime permissions blocked this task. Grant the required runtime access or update the approval/sandbox policy before retry.
```

Important distinction:

- The implementation artifact itself is complete and verified.
- The workflow card did not complete because closeout/rework contract handling still has defects.

## Final Remote Project Readback

After continuation:

```text
1dbcc531-66b6-4a85-bb7d-d62cfe7e9f47  Add API contract smoke tests      blocked_external  autoMode=false  paused=true
87c2d580-ef4d-4095-a668-d2cc365357a0  Add deployment health probe script backlog           autoMode=false  paused=false
735e8d40-484e-4f83-82f0-90395a2b5a76  Build remote launch checklist     backlog           autoMode=false  paused=false
2a4c3c67-d74e-4e83-9476-7bd52f590f31  Write onboarding smoke-test notes  backlog           autoMode=false  paused=false
```

## What Helped

The deployed hardening helped in these ways:

- Repeated tool-loop behavior was detected.
- The task failed closed with a clear `operator_input_required` state.
- The system avoided uncontrolled repeated shell/tool execution.
- Plan quality checks caught malformed or weak plan output and forced replan attempts.
- Strict result-contract validation surfaced incomplete closeout output instead of accepting an untrusted completion claim.

## What Still Needs Work

Remaining issues surfaced by the E2E run:

1. Planner still tends to repeat shell probes enough to trip the repeated-tool guard.
2. Implementation can produce a functionally wrong script despite passing broad plan stages.
3. Implementation closeout can fail even after the artifact is already committed and verified.
4. `aif-result` contract and implementation-manifest validation are strict, but the agent does not reliably produce a valid final handoff.
5. Rework handling does not cleanly account for already-committed work where meaningful changed files are no longer dirty.
6. The system lacks a smooth operator path to attach verified manual completion evidence and close the card without re-triggering fragile implementation loops.

## Recommended Follow-Up Work

Recommended next fixes:

- Add a closeout path for already-committed implementations with clean worktrees.
- Teach the implementation/rework prompt to always emit exactly one valid fenced `aif-result` block.
- Align implementation-manifest `changedFiles` validation with committed-but-clean worktrees.
- Improve deterministic fallback manifest generation for rework attempts.
- Add focused tests covering:
  - completed artifact plus clean git tree,
  - valid `aif-result` closeout,
  - retry after `operator_input_required`,
  - no repeated commit attempts,
  - no repeated shell probes in planner/implementer loops.

## Auditor Review Focus

Suggested audit questions:

- Does `repeated_tool_loop_blocked` correctly stop pathological local-agent loops without masking recoverable work?
- Are `operator_input_required` states actionable enough for an operator?
- Should closeout validation accept committed changes when the worktree is clean?
- Is the `aif-result` contract enforced at the right stage and with the right recovery path?
- Are the plan-quality and evidence guards too strict, or are the prompts insufficiently aligned with them?
- Does the workflow need a formal "operator verified completion" event instead of repeated implementation retries?

## Source Artifacts

Primary result artifact:

```text
docs/rdpi/work/work-20260602-server-deploy-and-e2e-new-project/result.md
```

This auditor brief:

```text
docs/rdpi/work/work-20260602-server-deploy-and-e2e-new-project/external-auditor-brief.md
```
