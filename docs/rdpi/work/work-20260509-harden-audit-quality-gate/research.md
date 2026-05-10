# Research

Task ID: `work-20260509-harden-audit-quality-gate`
Lane: `work`
Date: 2026-05-09

## Task Framing And Lane

This is a work-lane RDPI task selected from `docs/intake/work/work-20260509-harden-audit-quality-gate.md`.

The task asks to harden the server-67 audit pipeline so audit cards are not accepted merely because an agent used repository tools and committed a report. The prior mechanical canary proved tool-backed execution, but the accepted report was weak and self-referential rather than a substantive audit.

Before `PLAN PASS`, this research is planning-only. It uses local task files, repository files, static docs, and prior local RDPI/memory artifacts. It does not probe server-67 live state, logs, schedulers, endpoints, worker reports, or shared memory.

## Accepted Planning Sources Or Local Facts

- `docs/intake/work/work-20260509-harden-audit-quality-gate.md` defines the immutable task intent, acceptance criteria, constraints, server task id `fead5a05-6fc5-4e1a-adfb-8f629d36b31b`, prior weak report path `audit/2026-05-09-aif-runtime-canary-audit.md`, positive canary task `6c10a354-13e6-4495-a350-044d764a1329`, and negative canary task `1250d717-9a60-4414-8c38-2f178f6a7e58`.
- `AGENTS.md` and the referenced `runtask`/`rdpi` skills require Research -> Design -> Plan -> Implementation, an independent `PLAN PASS` gate before implementation, independent `TEST PASS` and `REVIEW PASS` gates before close-out, and `memsync MODE=auto` after a successful RDPI result.
- Preflight `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` reported `STATUS: ready`.
- Flow audit `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` reported `STATUS: clean`.
- `packages/shared/src/taskCompletionEvidence.ts` is the core terminal evidence guard. It currently detects risky audit/review/discovery tasks, report artifact files, dirty/committed report state, deterministic fallback reports, implementation-stage tool activity, and repository path references.
- `packages/agent/src/coordinator.ts` calls the completion evidence guard before skip-review done transitions, auto-review accepted done transitions, generic done transitions, and human `approve_done` through the API service path.
- `packages/agent/src/reviewGate.ts` accepts structured review success when blocking findings are empty. When structured parsing fails, it runs a legacy fallback extraction workflow whose prompt explicitly says not to use tools; if fallback returns `SUCCESS` on a first pass, the gate can accept.
- `packages/agent/src/subagents/reviewer.ts` requires `supportsRepositoryTools` for review/security sidecar runtime workflows, but malformed sidecar output is converted to legacy review comments and may then enter the review-gate fallback path.
- `packages/agent/src/subagentQuery.ts` enforces hard runtime capabilities, including `supportsRepositoryTools`, and records runtime-neutral `Tool:` and `Agent:` activity in `agentActivityLog`.
- Existing tests cover much of the mechanical guard surface:
  - `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
  - `packages/agent/src/__tests__/reviewGate.test.ts`
  - `packages/agent/src/__tests__/reviewContract.test.ts`
  - `packages/agent/src/__tests__/coordinator.test.ts`
  - `packages/api/src/__tests__/tasks.test.ts`

## Same-Project Memory

Same-project reusable facts were taken only from local repository memory/RDPI documents, not from shared-memory recall.

- `docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/result.md` records the previous outcome: audit/review/discovery completion now requires committed report artifacts and latest main implementation-stage tool activity.
- That same result records the positive canary accepted because it had a committed report artifact and latest implementation tool activity. This is the weakness this task must close.
- The prior result records the residual risk that review/security sidecars are tool-capability gated, but the hard completion-evidence guard did not yet require review-stage tool activity before accepting auto-review output.
- `docs/memory/tasks/work/work-20260509-make-audit-pipeline-toolful-delta.md` repeats the stable local facts: `supportsRepositoryTools` exists, text-only API transports are not tool-capable for implementation/review workflows, and completion evidence only counts latest main implementation-stage tool activity.
- `docs/rdpi/work/work-20260509-harden-audit-completion-evidence/result.md` records the earlier hardening that blocked uncommitted/dirty report artifacts and deterministic inventory fallback reports.

## Cross-Project Reusable Patterns

No cross-project shared-memory recall was performed before `PLAN PASS` because this task is explicitly constrained against shared-memory recall and live/runtime probing during the planning-only phase. The useful patterns were already available in local project docs and memory artifacts.

## Rejected Or Stale Memory Candidates

- The prior accepted canary report path `audit/2026-05-09-aif-runtime-canary-audit.md` is documented as evidence of mechanical execution only. It is not valid evidence of audit quality for this task.
- No active `audit/` file was found in this repository during static inspection; only local docs and memory artifacts reference the weak report path.
- A fallback parser result of `SUCCESS` is not accepted as proof of audit quality, because it can be produced without repository tools or substantive evidence.

## Planning Risks

- The current completion guard is structural. A report that cites any existing path can pass, even if it only proves that the report exists or that the task ran.
- Requiring line/function/symbol references too rigidly could reject legitimate audit reports where command output is the practical evidence. The implementation should accept either exact file references with line/symbol detail or concrete command-output evidence.
- Review sidecars may run in parallel, so review-stage tool-activity detection should count the latest review validation window without assuming a single linear sidecar block.
- Live server-67 validation must wait until after `PLAN PASS` and should use purpose-built negative and positive canaries, not the already-known weak canary as a success path.
