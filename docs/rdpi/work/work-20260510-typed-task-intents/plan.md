# Plan

## Implementation plan

1. Add the shared task-intent model.
   - Create `packages/shared/src/taskIntent.ts`.
   - Export `TaskIntent`, `TASK_INTENTS`, `TASK_INTENT_CONTRACTS`, `inferTaskIntent`, `resolveTaskIntentDefaults`, `validateGeneratedTaskIntent`, and intent prompt helpers.
   - Re-export from `packages/shared/src/index.ts` and `packages/shared/src/browser.ts`.
   - Encode the defaults matrix from `design.md` directly in the contract and include hard-constraint metadata.

2. Persist task intent.
   - Add `taskIntent` to `packages/shared/src/types.ts`.
   - Add `task_intent` to `packages/shared/src/schema.ts` and `packages/shared/src/db.ts`.
   - Add migration version 22 in `packages/shared/src/db.ts`.
   - Thread the field through `packages/data/src/index.ts` create/update/response/summary paths.

3. Align direct task creation and update.
   - Add `taskIntent` to `packages/api/src/schemas.ts` and `packages/api/src/routes/tasks.ts`.
   - Add `taskIntent` to MCP create/update schemas in `packages/mcp/src/tools/createTask.ts` and `packages/mcp/src/tools/updateTask.ts`.
   - Preserve backward compatibility with `isFix`.
   - Apply intent defaults only when callers omit the corresponding settings; preserve explicit caller choices unless the intent is a hard constraint.

4. Align web and chat task creation.
   - Update `packages/web/src/components/kanban/AddTaskForm.tsx` from Standard/Fix to typed intent selection.
   - Keep compact controls and existing planner settings behavior.
   - Update `CHAT_ACTIONS_PROMPT` in `packages/api/src/routes/chat.ts` to include `taskIntent`.
   - Update `packages/web/src/lib/chatActions.ts`, `packages/web/src/components/chat/CreateTaskCard.tsx`, and shared chat action types to carry `taskIntent` while still honoring legacy `isFix`.
   - Update focused web and chat action tests.

5. Replace audit-only roadmap logic with typed intent logic.
   - Update `packages/api/src/services/roadmapGeneration.ts` to infer and pass shared `TaskIntent`.
   - Extend generated task schema with optional `taskIntent`, defaulting via inference when omitted.
   - Add intent-specific generation/extraction prompt sections.
   - Apply shared import defaults and intent tags.
   - Validate generated cards fail closed for invalid audit cards and incomplete typed generated cards.

6. Align planner, implementer, review, and completion evidence.
   - Add intent guidance to `packages/agent/src/subagents/planner.ts`.
   - Add allowed-change/evidence guidance to `packages/agent/src/subagents/implementer.ts`.
   - Use persisted task intent in `packages/shared/src/planQuality.ts`, `packages/shared/src/taskCompletionEvidence.ts`, and `packages/agent/src/reviewGate.ts` while preserving legacy inference fallback.

7. Add focused tests.
   - Shared tests for intent inference/defaults/validation.
   - API roadmap tests for audit rejection, feature defaults, and intent import defaults.
   - Data/API/MCP tests for taskIntent persistence and direct creation defaults.
   - Web tests for Add Task intent payloads.

8. After implementation and verification, write `docs/rdpi/work/work-20260510-typed-task-intents/result.md`, prepare local memory-review artifacts, and update only the selected `docs/intake/work_status.json` entry.

## Acceptance criteria

- At least `audit`, `feature`, `fix`, `spike`, `docs`, `tests`, and `general` are explicit typed intents.
- Defaults are centralized and documented in code for decomposition, `plannerMode`, `skipReview`, `useSubagents`, evidence, allowed file changes, and gates.
- Audit generation/import cannot create fix/refactor/hardening/test-expansion implementation cards.
- Feature, fix, spike, docs, and tests get intent-appropriate defaults and generated-card requirements.
- Direct task creation and roadmap import both persist `taskIntent`.
- Chat-created tasks round-trip `taskIntent`, while legacy `isFix` chat actions still create `fix` tasks.
- Invalid or incomplete generated typed cards fail before entering the executable backlog.
- Existing generic roadmap behavior remains available as `general`.
- Backward compatibility with legacy `isFix` is preserved.

## Verification plan

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskIntent.test.ts src/__tests__/taskCompletionEvidence.test.ts src/__tests__/planQuality.test.ts`
- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/schema.test.ts src/__tests__/db.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/roadmapGeneration.test.ts src/__tests__/tasks.test.ts`
- `npm.cmd test --workspace=@aif/mcp -- --run src/__tests__/tools.test.ts`
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/AddTaskForm.test.tsx src/__tests__/chatActions.test.ts src/__tests__/CreateTaskCard.test.tsx`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planner.test.ts src/__tests__/implementer.test.ts src/__tests__/reviewGate.test.ts`
- `npm.cmd run build`

## Review gates

- Independent `PLAN PASS` is required before implementation.
- Independent `TEST PASS` is required after verification commands.
- Independent `REVIEW PASS` is required before close-out.

## Reusable patterns

- Put intent semantics in structured code, then let prompts consume that contract. Prompts should not be the only source of task routing truth.
