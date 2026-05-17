# Plan

## Implementation Steps

- [ ] Extend `TaskIntentContract` with structured policy data in `packages/shared/src/taskIntentContracts.ts`.
- [ ] Add shared policy helpers in `packages/shared/src/taskIntent.ts`, keeping existing exports compatible.
- [ ] Update `formatTaskIntentContractForPrompt()` to render structured policy fields.
- [ ] Add deterministic changed-file contradiction validation in `packages/shared/src/taskCompletionEvidence.ts` using the shared policy helper and persisted task context.
- [ ] Add focused shared tests for policy shape, prompt formatting, and bounded completion contradiction checks, including blocked and allowed audit/docs/tests/spike cases.
- [ ] Replace chat task-action hardcoded intent guidance in `packages/api/src/routes/chat.ts` with `formatTaskIntentOptionsForPrompt()`.
- [ ] Update MCP create/update task descriptions to use the shared intent option summary.
- [ ] Add reviewer prompt policy context in `packages/agent/src/subagents/reviewer.ts`.
- [ ] Confirm agent completion call sites continue to route skip-review, accepted-review, and reviewer success terminal transitions through `blockTaskForCompletionEvidenceIfNeeded()`.
- [ ] Confirm API `approve_done` continues to route through `evaluateTaskCompletionEvidence()` in `packages/api/src/services/taskEvents.ts`.
- [ ] Update web task creation, roadmap dialog, chat create card, task detail, and task card surfaces to show intent and primary constraints from shared policy.
- [ ] Add or update focused API/MCP/web/agent tests for policy consumption and display.

## Acceptance Criteria

- A single shared contract model represents all supported intents and exports deterministic policy data.
- `formatTaskIntentContractForPrompt()` renders the structured policy model rather than relying only on free-form prompt text.
- Planner, implementer, reviewer, completion guard, API/MCP task creation, chat task creation, and UI task surfaces consume the same shared policy source.
- Audit-specific rules remain stricter than generic feature/fix rules.
- Completion evidence can block final completion when changed files contradict audit/docs/tests/spike policy in deterministic cases.
- Existing `taskIntent` and `isFix` compatibility is preserved.
- Agent auto-completion and API `approve_done` both block deterministic audit/docs/tests/spike changed-file contradictions.
- At least one allowed audit/docs/tests/spike completion case remains non-blocking.
- PlanManifest validation is not bundled into this slice.

## Verification Plan

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskIntent.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts src/__tests__/roadmapGeneration.test.ts`
- API tests must include a completion-path case proving `approve_done` blocks a contradictory non-audit intent and allows a matching intent/path case.
- `npm.cmd test --workspace=@aif/mcp -- --run src/__tests__/tools.test.ts`
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/AddTaskForm.test.tsx src/__tests__/CreateTaskCard.test.tsx src/__tests__/TaskCard.test.tsx src/__tests__/TaskDetailHeader.test.tsx src/__tests__/chatActions.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/reviewGate.test.ts src/__tests__/implementer.test.ts`
- `npm.cmd run build`
- `npm.cmd run lint`

## Gate Notes

- Independent `PLAN PASS` is required before implementation.
- Independent `TEST PASS` is required after implementation.
- Independent `REVIEW PASS` is required before close-out.
- If any gate fails, revise the implementation or plan and rerun the invalidated gate.
