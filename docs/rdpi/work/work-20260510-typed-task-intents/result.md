# Result: Typed Task Intents

Task: `work-20260510-typed-task-intents`
Date: 2026-05-10
Status: implemented

## Outcome

Typed task intents are now represented as a first-class task field across shared types, persistence, API, MCP, agent prompts, roadmap flows, chat task creation, and web task creation/import UI.

The supported intents are `general`, `audit`, `feature`, `fix`, `spike`, `docs`, and `tests`. Omitted task intent now defaults to `general` except legacy `isFix` creation paths, which resolve to `fix` for compatibility.

## Implementation Summary

- Added shared task-intent contracts, normalization, inference helpers for local/intake use, per-intent defaults, prompt formatting, and generated-task validation.
- Added persisted `tasks.task_intent` with migration v22, including a legacy `is_fix = 1` backfill to `fix` and a missing-column skip guard for historical schemas without `is_fix`.
- Updated data/API/MCP create and update paths so explicit intents apply defaults consistently; audit/spike invariants are enforced on both create and update.
- Updated chat and roadmap flows so aliases and task text do not imply typed intent. Roadmap batch `taskIntent` is authoritative; generic imports persist `general`, and explicitly typed batches reject per-task intent mismatches.
- Updated plan-quality and completion-evidence heuristics so explicit `taskIntent: "general"` suppresses legacy audit/risky classification from audit-looking titles, aliases, and tags.
- Injected the task-intent contract into planner and implementer prompts.
- Added web controls and propagation for task intent in add-task, create-task-card, chat action, and roadmap import/generate flows.
- Added focused regression tests across shared, data, API, MCP, agent, and web packages.

## Review Remediations

The implementation went through multiple independent review rounds:

- REVIEW FAIL 1: omitted `taskIntent` was inferred from text, generic roadmap generation could select typed prompts from body text, and updating a task to audit did not enforce audit defaults. Fixed by making create/chat/API/MCP defaults explicit-general unless legacy `isFix` is true, by requiring explicit roadmap task intent, and by enforcing audit invariants on update.
- REVIEW FAIL 2: roadmap aliases still inferred typed intent too broadly. Fixed by making roadmap alias a label only and adding explicit `taskIntent` to generation/import.
- REVIEW FAIL 3: legacy persisted fix tasks migrated as general, and roadmap imports could persist per-task typed intent without an explicit batch intent. Fixed with v22 `is_fix` backfill and batch-intent authority/mismatch rejection.
- REVIEW FAIL 4: explicit general still triggered legacy audit/risky heuristics, and audit validation allowed implementation-shaped titles if the description had diagnostic markers. Fixed by suppressing legacy heuristics when an explicit valid intent exists and by rejecting implementation-shaped audit titles unless the title is diagnostically framed.
- TEST FAIL follow-up: direct DB test fixtures that intentionally exercise audit behavior were relying on title inference. Updated affected API and agent plan-checker fixtures to set `taskIntent: "audit"` explicitly.

## Verification

Local verification passed after the final remediation:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskIntent.test.ts src/__tests__/planQuality.test.ts src/__tests__/taskCompletionEvidence.test.ts src/__tests__/db.test.ts src/__tests__/schema.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/roadmapGeneration.test.ts src/__tests__/tasks.test.ts`
- `npm.cmd test --workspace=@aif/mcp -- --run src/__tests__/tools.test.ts`
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/AddTaskForm.test.tsx src/__tests__/chatActions.test.ts src/__tests__/CreateTaskCard.test.tsx`
- `npm.cmd test --workspace=@aif/agent -- --run`
- `npm.cmd run build`
- `npm.cmd run lint`
- Scoped `git diff --check` for typed-task-intents files

Build and lint passed with the existing environment warning that global Turbo `2.9.6` is being used instead of a locally installed repo version matching `^2.8.21`.

Unscoped and scoped diff checks passed after normalizing trailing whitespace in memsync-generated memory front matter.

## Gates

- PLAN review: initial `PLAN FAIL`, then revised artifacts and obtained `PLAN PASS`.
- Independent review: several `REVIEW FAIL` rounds, then final `REVIEW PASS`.
- Independent test: initial `TEST FAIL` due to an affected direct-DB audit fixture; after the fixture fix, an additional test attempt failed on unscoped memory-doc whitespace; generated memory front matter was normalized and final scoped independent `TEST PASS` was obtained.

## Memory Sync

Memsync completed successfully in `auto` mode.

- Report: `docs/memory/reports/work-20260510-typed-task-intents-memsync-report.md`
- Task delta: `docs/memory/tasks/work/work-20260510-typed-task-intents-delta.md`
- Hypotheses: `docs/memory/tasks/work/work-20260510-typed-task-intents-hypotheses.md`
- Shared-memory publish result: 19 decisions and 1 pattern ingested
