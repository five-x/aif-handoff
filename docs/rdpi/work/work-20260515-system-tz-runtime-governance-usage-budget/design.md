# Design: System TZ Runtime Governance Usage Budget

## Direction

Add an explicit runtime governance layer around the existing runtime primitives instead of replacing them. The implementation will keep task/plan/review/chat database defaults as compatibility storage, but introduce canonical System TZ stages and policy decisions so runtime behavior is visible and auditable.

## Stage Model

Define canonical runtime stages:

- `planner`
- `plan_checker`
- `implementer`
- `reviewer`
- `security`
- `chat`
- `audit`
- `synthesis`

Each stage maps to the current compatibility runtime profile mode:

- `planner`, `plan_checker` -> `plan`
- `implementer`, `audit`, `synthesis` -> `task`
- `reviewer`, `security` -> `review`
- `chat` -> `chat`

This preserves existing DB columns and API contracts while making per-stage defaults explicit. Follow-up work can add physically separate defaults per stage if product needs independent UI selection for every stage.

## Resolution Contract

Data-layer runtime resolution should accept either a compatibility mode or a canonical stage. It will return the same effective profile shape as today, plus enough stage metadata for logs/tests:

- selected stage;
- compatibility mode;
- task override id;
- project default id;
- app default id;
- selected source.

Existing callers can continue to use modes. Coordinator, subagent execution, warmup, and API runtime context can move to stages where they know the semantic stage.

## Fallback Policy

The policy is about runtime-limit fallback before a stage starts:

- planner: fallback to a lower-priority configured runtime is allowed when the selected higher-priority profile is blocked, and must be logged;
- plan checker: same as planner;
- implementer: block; do not switch;
- reviewer: fallback allowed with warning;
- security: fallback allowed with warning through review compatibility mode;
- audit: block for evidence consistency;
- synthesis: block for evidence consistency;
- chat: no automatic task-stage fallback; preserve current effective chat behavior.

This task will implement policy decisions centrally and record them in task activity/blocked reason. It will not silently switch audit/synthesis runtime.

## Limit Snapshots

The existing `RuntimeLimitSnapshot` contract already includes the required fields and sanitization. This task should preserve that contract and focus on how snapshots drive policy:

- blocked/threshold snapshots from exact or blocked heuristic sources can drive pre-start decisions;
- fallback decisions must name the blocked profile/source and chosen profile/source;
- blocking decisions must persist task-level snapshot data for UI and audit trail.

## Auto-Resume

Runtime-limit blocking uses the existing task release lifecycle:

- runtime limit snapshot reset hints are normalized through `resolveRuntimeLimitFutureHint`;
- coordinator persists `blocked_external`, `blockedFromStatus`, `retryAfter`, task runtime-limit snapshot, and an activity log entry;
- task watchdog releases due blocked tasks at the beginning of each poll cycle when `retryAfter <= now`;
- release restores `blockedFromStatus`, clears the task runtime-limit snapshot, clears blocked fields, broadcasts the move, and lets the normal pipeline continue.

This task will make that behavior part of the runtime governance contract with runtime-limit-specific tests. If no future provider hint exists, the current random backoff fallback remains visible as `retryAfterSource=random_backoff`.

## Usage Events

The registry wrapper remains the source of truth. It will record an append-only event for every adapter invocation outcome:

- `success`: concrete usage from provider;
- `missing_usage`: adapter returned no usage, including `PARTIAL`/`NONE` paths;
- `failed`: adapter threw before a result.

Missing/failed events use zero token/cost values and do not change aggregate counters. New outcome fields make them distinguishable from genuine zero-token successful calls.

## Budget Gate

Budget enforcement starts with current project stage budget fields:

- planner budget -> `plannerMaxBudgetUsd`;
- plan checker budget -> `planCheckerMaxBudgetUsd`;
- implementer budget -> `implementerMaxBudgetUsd`;
- reviewer/security budget -> `reviewSidecarMaxBudgetUsd`.

The pre-start gate sums task-scoped usage for the relevant workflow kinds and compares against the configured budget. Behavior:

- below 80%: allow;
- at or above 80% but below 100%: allow and write a visible activity warning once per stage/budget signature;
- at or above 100%: block as `blocked_external` with an actionable reason;
- task `runtimeOptions.runtimeBudgetOverride.justification` allows a manual override and must be logged.

Project monthly, task-wide, and chat budgets are left as follow-up because no current schema fields exist for them.

## Cost And Budget UI Compatibility

Existing UI already shows cost/usage in these places:

- per-task token and cost totals in task detail/header surfaces;
- per-project token and cost totals in project overview and metrics surfaces;
- runtime-profile last usage and limit windows in the runtime usage dialog.

Chat usage is persisted and aggregated through `chat_sessions`, but chat budget enforcement and a dedicated chat budget state UI are not backed by current schema. This implementation will expose budget state through blocked reasons/activity logs for stage budgets and keep aggregate cost displays intact. Monthly, task-wide, and chat budgets remain explicitly unsupported in this compatibility slice until schema fields and UI workflows are added.

## Warmup

Warmup targets become stage-aware:

- planner target uses `planner`;
- implementer target uses `implementer`;
- reviewer target uses `reviewer`;
- security target reuses reviewer/review profile compatibility;
- audit and synthesis targets use task compatibility mode and can only fork when runtime/profile/model match.

Unsupported runtimes still produce safe skip reasons and no prompt or secret logging.

## Scope Boundaries

- Do not weaken audit validators, evidence ledgers, artifact trust, review gates, or completion evidence.
- Do not expose raw provider diagnostics.
- Do not add broad UI redesigns unless a touched data contract requires it. Existing runtime limit, usage, blocked reason, and activity log UI are acceptable visibility surfaces for this slice.
- Do not claim monthly, task-wide, or chat budget enforcement is complete; only current project stage budgets are enforceable in this slice.
- Do not create child implementation cards in this run.

## Risks

- Adding usage outcome columns requires schema migration and tests.
- Fallback from lower-priority profile candidates must avoid accidental cross-project profile visibility issues. Existing visibility constraints remain the source of truth.
- Budget gates can block more work once projects configure low budgets. Manual override logging mitigates accidental dead ends.
