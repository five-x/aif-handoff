# External Systemic AIF Stability Review

- Task ID: work-20260529-external-systemic-aif-stability-review
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-29
- Source: operator request after repeated AIF production workflow failures during `zai-mi.com` project startup.
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260529-external-systemic-aif-stability-review

## Request

Run an independent, diagnostic-only systemic review of `aif-handoff` and explain why new production-like runs keep revealing serious workflow defects.

The review must not treat each incident as an isolated bug. It must identify architectural, lifecycle, prompt, validator, runtime-governance, and observability reasons that allow bad model output, dirty worktrees, retry loops, fake evidence, or blocked states to escape into live task execution.

## External Reviewer Prompt

You are an independent senior systems reviewer. Do not assume recent fixes are correct. Treat the repository, RDPI history, tests, and live incident evidence as claims to verify.

Your job is to answer:

- Why does `aif-handoff` repeatedly fail in new project execution despite many guardrails?
- Which guardrails are prompt-only and therefore unreliable?
- Which validators detect failures but route them into expensive loops instead of fail-closed states?
- Which lifecycle transitions allow invalid, untrusted, or dirty work to continue?
- Where do runtime cancellation, pause, retry, fallback, and budget controls fail to stop cost or state drift?
- Where does roadmap/task decomposition semantics diverge between direct task creation, roadmap import, split proposals, and executable children?
- Which tests are proving implementation details but not proving the actual production contract?

Do not implement fixes in this task. Produce a review report and separate follow-up intake cards for confirmed implementation work.

## Known Incidents To Investigate

- Direct task creation was used when roadmap/split flow was expected, creating a monolithic executable task with no children.
- A stale untracked plan artifact caused dirty-worktree failures in the `zai-mi.com` project until manually removed.
- The `zai-mi.com` first child task `948681dd-f379-4a3d-8613-7e63d966512b` reached implementation with excessive runtime usage on a scaffold task: about 13.43M total tokens.
- That task repeatedly returned from the implementation evidence guard to implementer rework, reaching `rework 11/100`.
- The implementation report claimed `npm install`, `npm run build`, `npm test`, and `docker-compose up` passed while also admitting commands were not actually executed and hashes were placeholders.
- Pausing the task did not abort the in-flight implementer immediately; the active runtime continued until its current iteration completed.
- The task API allowed setting `paused` and blocker metadata, but did not allow an operator status correction through normal update schema, requiring direct database intervention.
- A hotfix was applied locally and to live containers to cap implementation evidence rework at 2 attempts and reject empty-output or admitted-placeholder verification evidence. This hotfix is not a substitute for the systemic review.

## Areas In Scope

- Coordinator lifecycle and transition policy:
  - `packages/agent/src/coordinator.ts`
  - `packages/shared/src/stateMachine.ts`
  - `packages/api/src/services/taskEvents.ts`
  - `packages/api/src/routes/tasks.ts`
- Plan and implementation contracts:
  - `packages/shared/src/planQuality.ts`
  - `packages/shared/src/implementationManifest.ts`
  - `packages/shared/src/taskCompletionEvidence.ts`
  - `packages/agent/src/subagents/planner.ts`
  - `packages/agent/src/subagents/planChecker.ts`
  - `packages/agent/src/subagents/implementer.ts`
- Runtime governance and cancellation:
  - `packages/agent/src/stageAbort.ts`
  - `packages/agent/src/subagentQuery.ts`
  - `packages/runtime/src/**`
  - runtime usage and budget persistence in `packages/data/src/index.ts`
- Worktree and branch isolation:
  - `packages/agent/src/gitBranch.ts`
  - `packages/agent/src/reworkSnapshot.ts`
  - dirty-worktree handling in coordinator and task events.
- Roadmap and hierarchy flow:
  - roadmap generation/import/split proposal APIs
  - parent/child rollup and executable child start rules
  - `docs/intake/work/work-20260528-roadmap-split-required.md`
- Trust and artifact projection:
  - `packages/data/src/index.ts`
  - workflow timeline and artifact trust tests
  - UI surfaces that may make untrusted, blocked, or inconclusive states look healthy.
- Historical context:
  - `docs/intake/work/`
  - `docs/rdpi/work/`
  - `docs/memory/`
  - shared-memory recall, noting that memory currently lacks specific context for the latest development-manifest runaway incident.

## Required Review Output

Create `docs/rdpi/work/work-20260529-external-systemic-aif-stability-review/result.md` with:

- Executive verdict: fit for production-like project execution or not.
- Incident timeline for the recent `zai-mi.com` run.
- Root-cause taxonomy grouped by lifecycle, prompt/validator contract, runtime governance, worktree isolation, API/operator controls, tests, and observability.
- A fail-open matrix: each row must name the guard, expected behavior, actual behavior, source file/function, reproduction path, and severity.
- A cost-control analysis explaining why token usage could reach millions on a simple task and where hard stops should exist.
- A prompt-vs-validator analysis identifying where the system relies on model compliance instead of deterministic validation.
- A test gap analysis mapping current tests to the real production contract they fail to prove.
- Prioritized follow-up queue:
  - P0 items that must block further production project runs.
  - P1 items needed before broad use.
  - P2 cleanup or observability work.
- For every confirmed defect, include exact reproduction steps or a reason why it cannot be reproduced locally.
- For every proposed fix, specify the minimal validator or lifecycle invariant that would have prevented the incident.

## Constraints

- Diagnostic only. Do not modify production code in this task.
- Do not create and execute child implementation tasks in the same run.
- Do not treat prompt hardening as sufficient when deterministic validation is possible.
- Do not mark the review complete without concrete file/function references.
- Do not rely on shared memory over current repo state; memory is secondary context only.
- Do not expose secrets, provider credentials, raw tokens, or private runtime diagnostics.
- If live service access is needed, record why local repo evidence is insufficient before probing.

## Done When

- The review report exists and answers why repeated failures keep surfacing.
- Confirmed defects are grouped into P0/P1/P2 follow-up intake cards, not implemented directly.
- The review includes at least one end-to-end lifecycle diagram or state table for a development task from roadmap child creation to review handoff.
- The review explicitly says which current guardrails are trustworthy, weak, or misleading.
- An independent reviewer returns `REVIEW PASS` on the review report, or the task remains blocked with exact missing evidence.
