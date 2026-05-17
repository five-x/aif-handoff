# Research

## Task Framing And Lane

- Task ID: `work-20260515-system-tz-task-intent-contract-v2`
- Lane: `work`
- Intake: `docs/intake/work/work-20260515-system-tz-task-intent-contract-v2.md`
- RDPI needed: yes
- Request: implement TaskIntentContract v2 as a deterministic policy layer for `general`, `feature`, `fix`, `spike`, `docs`, `tests`, and `audit`.
- Scope boundary: source changes are allowed only after `PLAN PASS`; before that, this document records planning sources, current local facts, hypotheses, and proposed verification.

## Accepted Planning Sources Or Local Facts

- Preflight: `codex-ensure-rdpi.py` reported `STATUS: ready`.
- Flow audit: `codex-flow-audit.py --repo .` reported `STATUS: clean`.
- Accepted Phase 0 source: `docs/kb/system-tz-contract-inventory-freeze.md`.
- Prior typed-intents source: `docs/rdpi/work/work-20260510-typed-task-intents/result.md`.
- Current shared intent vocabulary is `packages/shared/src/taskIntentContracts.ts`, with `TASK_INTENTS`, `TaskIntent`, `TaskIntentContract`, and `TASK_INTENT_CONTRACTS`.
- Current helper entrypoint is `packages/shared/src/taskIntent.ts`; `formatTaskIntentContractForPrompt()` renders prose used by planner and implementer prompts.
- Current workflow-pack registry is `packages/shared/src/workflowPacks.ts`; generated-task validation is separate per-intent code.
- Current completion evidence guard is `packages/shared/src/taskCompletionEvidence.ts`; it is strict for audit/review/discovery and treats audit/spike as risky, but it does not enforce deterministic file-change contradictions for every non-audit intent.
- Current plan quality guard is `packages/shared/src/planQuality.ts`; it is audit-focused and not a PlanManifest implementation.
- Data create/update paths in `packages/data/src/index.ts` normalize persisted intent, preserve `isFix` compatibility, apply defaults, and force audit/spike invariants.
- REST task creation in `packages/api/src/routes/tasks.ts` normalizes intent, applies defaults, rejects broad direct audit tasks, and delegates persistence.
- Roadmap generation/import in `packages/api/src/services/roadmapGeneration.ts` consumes `formatTaskIntentContractForPrompt()` in typed prompts but also has separate description guidance.
- Chat task creation prompt in `packages/api/src/routes/chat.ts` hardcodes intent descriptions instead of consuming shared policy formatting.
- MCP task create/update tools in `packages/mcp/src/tools/createTask.ts` and `packages/mcp/src/tools/updateTask.ts` expose `taskIntent` as an enum and delegate to the data layer.
- Web task creation in `packages/web/src/components/kanban/AddTaskForm.tsx` consumes shared intent labels/defaults and displays only decomposition prose.
- Web roadmap dialog in `packages/web/src/components/layout/RoadmapDialog.tsx` exposes intent labels only.
- Web chat create card in `packages/web/src/components/chat/CreateTaskCard.tsx` passes task intent through but does not display the policy constraints.
- Web task detail/card surfaces in `packages/web/src/components/task/TaskDetailHeader.tsx` and `packages/web/src/components/kanban/TaskCard.tsx` display status/trust/priority/tags, not intent or primary constraints.
- Planner and implementer already consume the shared prompt formatter at `packages/agent/src/subagents/planner.ts` and `packages/agent/src/subagents/implementer.ts`.
- Reviewer prompt in `packages/agent/src/subagents/reviewer.ts` has audit/report-specific rules, but does not include the shared intent policy.
- Review gate in `packages/agent/src/reviewGate.ts` invokes completion evidence only for risky audit-like tasks.
- Agent coordinator terminal transitions already call `blockTaskForCompletionEvidenceIfNeeded()` in `packages/agent/src/coordinator.ts` before skip-review done transitions, accepted review done transitions, generic stage `onSuccess === "done"` transitions, and pre-implementation checks before implementer starts.
- API human task events call `evaluateTaskCompletionEvidence()` in `packages/api/src/services/taskEvents.ts` for `start_implementation` pre-implementation checks and `approve_done` verification/terminalization.

## Same-Project Memory

- `docs/memory/projects/aif-handoff/capsule.md` confirms that `docs/kb/system-tz-contract-inventory-freeze.md` is the accepted Phase 0 planning source for queued System TZ implementation tasks.
- `docs/memory/tasks/work/work-20260510-typed-task-intents-delta.md` records the reusable pattern: put intent semantics in structured code and let prompts consume that contract.
- `docs/memory/tasks/work/work-20260515-system-tz-contract-inventory-freeze-delta.md` records that current audit validators and completion evidence are immediate containment and must remain fail-closed until an approved task changes them.

## Cross-Project Reusable Patterns

- None used. Local facts and same-project memory were sufficient.

## Rejected Or Stale Memory Candidates

- No shared-memory recall was used before `PLAN PASS`, per the RDPI boundary. Local reviewed memory docs were sufficient.
- No stale candidate was accepted over local source.

## Working Hypotheses

- The safest implementation is to extend the existing shared `TaskIntentContract` rather than replace it or add a parallel registry.
- A structured `policy` block can coexist with current prose fields and preserve compatibility for existing callers.
- `formatTaskIntentContractForPrompt()` can be regenerated from deterministic policy data while keeping the public function name unchanged.
- Completion enforcement should start with deterministic changed-file contradiction checks for non-audit intents inside `evaluateTaskCompletionEvidence()`, because that function is already used by agent terminal transitions and API `approve_done` handling.
- Chat/API/MCP/UI surfaces can consume shared policy helpers without database schema changes.
- PlanManifest validation should remain out of scope and be handled by the queued `work-20260515-system-tz-plan-manifest-quality-gate` task.
