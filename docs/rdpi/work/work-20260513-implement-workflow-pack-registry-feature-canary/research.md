# Research - Implement Workflow Pack Registry And Feature Canary

## Task framing and lane

- Selected intake card: `docs/intake/work/work-20260513-implement-workflow-pack-registry-feature-canary.md`.
- Task ID: `work-20260513-implement-workflow-pack-registry-feature-canary`.
- Lane: `work`.
- RDPI Needed: yes.
- RDPI path: `docs/rdpi/work/work-20260513-implement-workflow-pack-registry-feature-canary`.
- Request: implement the smallest shared-library slice from the accepted workflow contract pack plan.

## Accepted planning sources

- Immutable task intent: the selected intake card.
- Parent accepted planning artifacts:
  - `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/design.md`.
  - `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`.
  - `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/result.md`.
- Repository guidance:
  - `AGENTS.md`.
  - `.agents/skills/runtask/SKILL.md`.
- Preflight:
  - `codex-ensure-rdpi.py` reported `STATUS: ready`.
  - `codex-flow-audit.py --repo .` reported `STATUS: clean`.

## Local repo facts

- `packages/shared/src/taskIntent.ts` owns `TASK_INTENTS`, `TaskIntent`, `TaskIntentContract`, `TASK_INTENT_CONTRACTS`, prompt formatting, default resolution, intent inference, and `validateGeneratedTaskIntent`.
- `validateGeneratedTaskIntent` currently preserves the common title-required check, then switches on `taskIntent`.
- The audit branch currently delegates directly to `validateGeneratedAuditCard` from `packages/shared/src/auditRoadmapContract.ts`.
- The feature branch currently requires only `Acceptance criteria:` and `Verification:` markers, which is a useful canary for non-audit generated task validation.
- `packages/shared/src/__tests__/taskIntent.test.ts` already covers task intent defaults, inference, audit generated-card rejection/acceptance, and a minimal feature generated-card pass.
- `packages/shared/src/index.ts` and `packages/shared/src/browser.ts` export task-intent APIs. Any new registry surface needed by consumers should be exported narrowly from the shared package and browser bundle.
- `packages/api/src/services/roadmapGeneration.ts` imports both `validateGeneratedTaskIntent` and `validateGeneratedAuditCard`. This task does not authorize moving roadmap generation/import hooks behind packs, so direct audit imports used outside task-intent validation should remain untouched unless needed for type compatibility.

## Same-project memory

- Same-project memory may be useful after implementation for local review and curated memory artifact generation.
- Per the RDPI boundary, shared memory was not queried before `PLAN PASS`.

## Cross-project reusable patterns

- Local repo facts and the accepted parent plan are sufficient for this implementation plan.
- Cross-project memory was not queried before `PLAN PASS`.

## Open questions

- Whether to colocate `WorkflowPack` in `taskIntent.ts` or a new `workflowPacks.ts`. The parent accepted plan names `packages/shared/src/workflowPacks.ts`; a separate file keeps the routing boundary visible.
- Whether all task intents need explicit pack entries now. A complete registry for all current `TaskIntent` values avoids fallback ambiguity while keeping only audit and feature validators behaviorally meaningful for this slice.

## Hypotheses

- Moving audit generated-task validation behind `getWorkflowPack("audit").validateGeneratedTask` can preserve exact audit issue messages because the pack can call `validateGeneratedAuditCard` without changing its result.
- A feature canary pack can prove non-audit routing by accepting a complete feature card with source/test/docs allowed changes and rejecting only missing feature markers, without adding audit-only requirements.
- Existing API and agent consumers can continue importing `validateGeneratedTaskIntent`; only tests and future pack-aware callers need the new registry exports.
