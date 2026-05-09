# Result

Task: make server 67 audit cards execute through tool-backed agents, produce durable artifacts, and fail closed when the configured runtime cannot inspect or change the repository.

Date: 2026-05-09

## Outcome

- Added a `supportsRepositoryTools` runtime capability and defaulted it to false.
- Marked only controlled repository-tool transports as capable:
  - `qwen-local-agent` API: true.
  - Claude SDK/CLI: true.
  - Codex CLI/SDK: true where the adapter has local tool-event hooks.
  - Codex API, Codex app-server, Claude API, OpenRouter API: false.
- Required `supportsRepositoryTools` for implementer and review/security workflows.
- Removed the implementer deterministic audit-report writer. Diagnostic audit implementation now has to run through the configured runtime.
- Hardened completion evidence for risky audit/review/discovery tasks:
  - report artifacts are commit-required,
  - latest main implementer block must include `Tool:` activity,
  - planner/reviewer/checklist/stale retry tool activity does not count.
- Hardened stage error handling so runtime capability mismatches become `blocked_external` with no retry loop and a sanitized operator-facing reason.
- Configured the botIntevra project on server 67 to use the `qwen-local-agent` runtime profile for task, plan, and review defaults.
- Enabled project auto-queue mode so newly created cards are picked up automatically.

## Local Verification

Passed:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts src/__tests__/subagentQuery.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/subagentQuery.test.ts src/__tests__/stageErrorHandler.test.ts src/__tests__/implementer.test.ts`
- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts`
- `npm.cmd test --workspace=@aif/runtime`
- `npm.cmd test --workspace=@aif/shared`
- `npm.cmd run build`
- `npm.cmd run lint`
- `npm.cmd test`

Observed:

- Two earlier repo-level turbo test runs failed in different packages while those package suites passed directly. The independent TEST gate reran `npm.cmd test` later and it exited 0.

## Deployment

Server 67:

- API: `http://192.168.88.67:3009`
- MCP: `http://192.168.88.67:3100`
- App path: `/opt/aif-handoff`
- Project path: `/srv/aif-handoff/projects/botIntevra`

Actions:

- Copied changed source files to `/opt/aif-handoff`.
- Rebuilt and restarted `api`, `agent`, and `mcp`.
- After the capability-error fix, rebuilt and restarted `agent` again.
- API health returned `{"status":"ok"}`.
- MCP health returned `{"status":"ok"}`.

Project runtime configuration:

- Project ID: `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`
- Tool-capable runtime profile: `93a454a2-4618-4e43-99d6-125962e25de2` (`qwen-local-agent`, `Qwen Local Agent Canary`)
- Legacy text-only profile used for negative validation: `f1f21bb3-523b-4aae-a2d2-83ba7c96e88c` (`codex` API, `QwenLocal`)
- Defaults set for task, plan, and review to the tool-capable profile.
- Auto-queue mode enabled.

## Live Positive Canary

Task:

- ID: `6c10a354-13e6-4495-a350-044d764a1329`
- Title: `Audit canary: verify tool-backed execution on server 67`
- Effective runtime: project default `qwen-local-agent`
- Final status: `done`

Evidence:

- Planner used runtime tools:
  - `Tool: list_files audit`
  - `Tool: write_file @.ai-factory/plans/audit-canary-verify-tool-backed-execution-on-server-67.md`
  - `Tool: git_commit git commit`
- Implementer used runtime tools inside the latest main implementation block:
  - `Tool: read_file @.ai-factory/plans/audit-canary-verify-tool-backed-execution-on-server-67.md`
  - `Tool: list_files audit`
  - `Tool: write_file audit/2026-05-09-aif-runtime-canary-audit.md`
  - `Tool: git_status git status`
  - `Tool: git_commit git commit`
- Report artifact: `audit/2026-05-09-aif-runtime-canary-audit.md`
- Report commit on project branch: `ae69c28 Add audit canary report for AIF runtime verification`
- Plan commit on project branch: `49d4366 Add audit canary plan for tool-backed execution verification on server 67`
- Branch: `feature/audit-canary-verify-tool-backed-executio-6c10a3`

The completion guard accepted the task because the risky audit had a committed report artifact and latest-implementation tool activity.

## Live Negative Canary

Task:

- ID: `1250d717-9a60-4414-8c38-2f178f6a7e58`
- Title: `Negative canary: text-only runtime must not close audit`
- Effective runtime: task override legacy `codex` API profile `QwenLocal`
- Final status: `blocked_external`

Evidence:

- The old profile does not satisfy `supportsRepositoryTools`.
- The implementer was rejected before repository changes could be made.
- Final blocked reason: `Runtime capability check failed. Check the configured runtime profile for this stage.`
- `retryCount` stayed `0` after the capability-error handling fix.
- Agent log recorded: `coordinator moved to blocked_external from implementing at implementer; retryAfter=manual; source=none`.

This confirms a text-only profile no longer closes audit work incorrectly and no longer loops as a transient runtime failure.

## Gates

- PLAN gate: `PLAN PASS` from independent reviewer after the stage-scoped tool-evidence and exact capability semantics were added to the plan.
- TEST gate: `TEST PASS`. Independent tester verified diff cleanliness, focused tests, package tests, repo-level test, build, lint, API/MCP health, and positive/negative live canaries.
- REVIEW gate: `REVIEW PASS`. Independent reviewer found no blocking, high, or medium issues in capability semantics, completion-evidence scoping, or retry/block handling.

## Memory Close-Out

- Ran `codex-memsync.ps1 --mode auto` for task `work-20260509-make-audit-pipeline-toolful`.
- Generated/updated:
  - `docs/memory/tasks/work/work-20260509-make-audit-pipeline-toolful-delta.md`
  - `docs/memory/projects/aif-handoff/capsule.md`
  - `docs/memory/entities/aif-handoff/capsule.md`
  - `docs/memory/reports/work-20260509-make-audit-pipeline-toolful-memsync-report.md`
- Added a curated final shared-memory correction with source `aif-handoff/docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/result.md#curated-closeout`.
- Shared-memory track id: `insert_20260509_081944_ac543883`.

## Residual Risk

- Review/security sidecars are now capability-gated to tool-capable runtimes. The hard completion-evidence guard currently requires implementation-stage tool activity because that is the stage that creates and commits audit artifacts. A separate future hardening can require review-stage tool activity before accepting auto-review output.
