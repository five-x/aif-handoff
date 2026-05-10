# Research

## Task framing and lane

- Task: `work-20260510-harden-audit-roadmap-flow-contract`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260510-harden-audit-roadmap-flow-contract.md`
- RDPI path: `docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract`
- User request on 2026-05-10 explicitly asks to run this already queued task.
- The task is platform-level implementation work for the `aif-handoff` audit roadmap flow. BotIntevra is only a canary/proving project, not the architecture target.

## Accepted planning sources and local facts

- `AGENTS.md` requires Node commands: `npm.cmd run build`, `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run dev`.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- Existing task worktree state is dirty from user/local files: `docs/intake/work_index.md`, `docs/intake/work_status.json`, `docs/kb/windows-codex-bootstrap-validation.md`, the selected task card, and the selected RDPI directory. These must not be reverted.
- Typed task intents already exist in `packages/shared/src/taskIntent.ts`; audit generated-card validation requires diagnostic markers, report artifact paths, git commit verification, and diagnostic-only constraints.
- Roadmap generation/import currently performs audit-specific validation in `packages/api/src/services/roadmapGeneration.ts`, including source roadmap validation, deterministic audit extraction, generated/imported task validation, and final synthesis count checks.
- Completion evidence currently lives in `packages/shared/src/taskCompletionEvidence.ts`. It validates risky/audit tasks by inspecting changed report-like files, committed report state, repository references, substantive evidence, review-stage tool activity, and branch isolation reasons.
- Review and completion gates already reuse the completion evaluator in key places:
  - `packages/agent/src/reviewGate.ts` uses `evaluateTaskCompletionEvidence` or `hasSubstantiveReportEvidence` before risky review success.
  - `packages/agent/src/coordinator.ts` blocks terminal transitions when completion evidence fails.
  - `packages/api/src/services/taskEvents.ts` blocks `approve_done` and pre-implementation `start_implementation` when completion evidence fails.
- Audit validation is not one canonical machine contract. Similar path/marker checks are duplicated between `roadmapGeneration.ts` and `taskIntent.ts`.
- The persisted model has task-level fields for `roadmap_alias`, `branch_name`, `worktree_path`, `task_intent`, and status, but no durable roadmap batch or expected artifact table in `packages/shared/src/schema.ts` / `packages/shared/src/db.ts`.
- Roadmap batch identity is currently derived from `roadmapAlias` plus tags such as `roadmap`, `rm:<alias>`, `phase:<number>`, and `seq:<number>`.
- Synthesis readiness is currently prompt/description driven. Generated synthesis cards scope themselves to `audit/<date>-*-audit.md`, but no persisted expected report list prevents synthesis from running before reports are validated or from missing reports on separate task branches/worktrees.
- Auto-queue branch/worktree isolation already has protections:
  - downstream stages use `task.worktreePath ?? project.rootPath`;
  - legacy branch-bound tasks without worktrees force serial execution;
  - dirty shared worktrees pause auto-queue when task worktrees are unavailable.
- Current completion failures that are actually recoverable artifact/content defects are still parked as `blocked_external`, which overloads the external-blocker state.

## Same-project memory

- No shared-memory recall was performed before `PLAN PASS`, per the RDPI boundary.
- Existing local memory documents from recent typed-intent and typed-roadmap-validation tasks may be useful after `PLAN PASS` only if local code or RDPI artifacts are insufficient.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- Reusable pattern likely relevant after implementation: make platform contracts structured, persisted, and reused by every gate instead of relying on prompt text plus scattered regex parsing.

## Rejected or stale memory candidates

- None established before `PLAN PASS`.

## Open questions

- Whether the durable batch/artifact model should be exposed as new public API endpoints in this task or limited to import/gate surfaces with typed failure metadata included in existing task and roadmap responses.
- Whether old audit roadmap batches should be backfilled. Conservative answer for this task: no broad migration/backfill; new model applies to new typed audit batches and existing tasks keep legacy behavior.
- Whether synthesis should read artifact contents from committed task branches/worktrees directly or whether validated report text should be copied into the batch artifact record. Conservative answer: persist artifact metadata and validation state first, then read only validated artifact paths from their producer worktree/root during synthesis readiness checks; avoid duplicating full report contents in the DB.

## Hypotheses

- A shared audit flow contract module can replace duplicated validation helpers and become the single parser/validator for generated tasks, expected report paths, synthesis detection, and failure taxonomy.
- Adding `roadmap_batches` and `roadmap_batch_artifacts` tables is the smallest durable model that satisfies expected artifact tracking without rewriting the generic task model.
- Completion evidence can keep its existing substantive-report heuristics while accepting expected artifact paths from the audit contract, making it validate the named report rather than any report-like changed file.
- Recoverable audit artifact failures can return to `implementing` with `reworkRequested=true` and structured `blockedReason` metadata, while `blocked_external` remains reserved for external/runtime/git/access failures.
- Synthesis readiness can be enforced by pausing the synthesis task until all non-synthesis batch artifacts are validated, then unpausing it automatically when the final artifact becomes valid.
