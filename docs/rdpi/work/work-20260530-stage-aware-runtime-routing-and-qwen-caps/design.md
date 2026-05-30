# Design

## Goal

Make runtime eligibility stage-aware and make local Qwen implementation opt-in. A configured Qwen profile may still run planning, review, audit, and synthesis workflows by default, but it must not run implementation unless the profile explicitly declares implementer capability or records passing implementation canary evidence.

## Capability Contract

Add a shared policy module that evaluates a runtime profile against a canonical `RuntimeStage`.

Supported profile option contract:

- `stageCapabilities.<stage>` may be:
  - `true` or `{ enabled: true }` to explicitly allow a stage.
  - `false` or `{ enabled: false }` to deny a stage.
- `allowedStages` may list allowed runtime stages for non-Qwen explicit matrices.
- `runtimeStageCaps.<stage>` or `stageCaps.<stage>` may define caps.
- Qwen implementation opt-in is accepted when any of these are true:
  - `stageCapabilities.implementer` is explicitly enabled.
  - `qwenLocalAgent.allowImplementation` is true.
  - `qwenLocalAgent.implementationCanaryPassed` is true.
  - `qwenLocalAgent.implementationCanary.passed` is true.

Qwen local default policy:

- allowed by default for `researcher`, `designer`, `planner`, `plan_checker`, `reviewer`, `qa`, `security`, `audit`, and `synthesis`
- denied by default for `implementer`
- no chat change in this task

## Cap Contract

Stage caps are parsed from profile options and combined with strict local Qwen defaults.

Cap fields:

- `maxToolTurns`
- `wallClockMs`
- `maxBudgetUsd`
- `retryCount`
- `contextTokens`
- `tokenBudget`
- `maxOutputTokens`
- `repositoryInspectionToolBudget`

Agent enforcement:

- `maxToolTurns` caps `RuntimeExecutionIntent.maxTurns`.
- `wallClockMs` caps `RuntimeExecutionIntent.runTimeoutMs`.
- `maxBudgetUsd` caps `RuntimeExecutionIntent.maxBudgetUsd`.
- `retryCount` caps first-activity retry attempts.
- `repositoryInspectionToolBudget` caps the runtime inspection budget.
- `contextTokens`, `tokenBudget`, and `maxOutputTokens` are injected as adapter options and cannot be raised by call-specific options.

Qwen adapter enforcement:

- `contextWindowTokens` and `maxInputTokens` reduce endpoint input/total budgets.
- `maxTokens` and `maxOutputTokens` reduce output token budgets.
- Exceeding the capped context fails closed as existing `context_length` before `fetch`.

## Routing Changes

Data layer:

- In `resolveEffectiveRuntimeProfile`, skip missing, disabled, and stage-disallowed candidates.
- In `resolveEffectiveRuntimeProfileExcluding`, apply the same stage filter.
- In `resolveEffectiveRuntimeProfilesForTasks`, apply the same stage filter.
- Keep `taskRuntimeProfileId`, `projectRuntimeProfileId`, and `systemRuntimeProfileId` metadata so callers can distinguish "nothing configured" from "configured but no capable candidate."

Agent layer:

- In `resolveExecutionContext`, re-evaluate the selected profile before runtime resolution.
- If a selected profile is denied for the stage, throw a sanitized `RuntimeExecutionError` with category `permission` and provider metadata `status=runtime_stage_not_capable`.
- If the implementer stage has configured runtime profile IDs but no capable profile after filtering, throw the same sanitized category with reason `no_implementation_capable_profile`.
- Apply caps to execution intent and adapter options immediately before adapter invocation.

Coordinator:

- Before claiming an implementer task, if configured candidates exist but effective runtime profile is `none`, block the task with an operator-readable reason and no retry window.
- This prevents entering `runImplementer` when only unsupported/underpowered configured profiles exist.

Stage error handler:

- Special-case `permission` runtime errors with `providerMeta.status = runtime_stage_not_capable`.
- Return a stable sanitized blocked reason that names the stage-capability problem without provider raw text.

## Safety Boundaries

- Existing runtime capability checks remain in place; this task adds stage eligibility before the adapter run.
- Existing runtime limit gates remain in place.
- Existing implementation exhaustion split-pack behavior remains in place.
- Existing no-profile env fallback is preserved unless configured profile IDs existed but were not capable for implementation.
- The new contract is option-based; no schema migration is required.

## Test Matrix

- Shared policy:
  - Qwen implementer denied by default.
  - Qwen implementer allowed by explicit flag.
  - Qwen implementer allowed by canary evidence flag.
  - Explicit stage deny wins.
  - Caps parse and cap values are sanitized.
- Data:
  - Qwen task default is skipped for implementer and falls back to project/system capable profile.
  - Explicit Qwen implementer profile is selected.
  - Batch resolution applies the same stage filter.
- Agent:
  - Denied Qwen implementer does not invoke adapter.
  - Enabled Qwen implementer invokes adapter with capped execution intent.
  - Coordinator blocks configured-but-incapable implementation before implementer runner.
  - Runtime-stage errors redact raw provider text.
- Runtime:
  - Qwen request builder enforces a configured context cap before network.
