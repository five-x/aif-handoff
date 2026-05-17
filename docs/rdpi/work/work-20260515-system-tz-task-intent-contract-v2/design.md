# Design

## Goal

Implement TaskIntentContract v2 by extending the existing typed-intent source into a structured shared policy model. The model must remain compatible with existing `taskIntent` values and `isFix` behavior while providing deterministic policy fields for prompts, task creation, UI display, review, and completion evidence.

## Proposed Shape

Extend `packages/shared/src/taskIntentContracts.ts` with a structured policy block on each `TaskIntentContract`.

The policy will include:

- `allowedChanges`: deterministic categories and summary text.
- `forbiddenChanges`: deterministic categories and summary text.
- `expectedArtifacts`: deterministic artifact expectations per intent.
- `requiredGates`: keep existing gate list and treat it as policy data.
- `verificationRequirements`: command/evidence expectations per intent.
- `memoryRules`: whether memory use is allowed, required, or prohibited, plus summary text.
- `reviewRules`: review expectations and whether automatic review can be skipped by default.
- `completion`: deterministic changed-file policy for final completion checks.

The existing fields such as `allowedFileChanges`, `evidenceRequirements`, `planningPrompt`, and `implementationPrompt` will remain for compatibility but will be backed by the structured policy data.

## Shared Helpers

Add or update shared helpers in `packages/shared/src/taskIntent.ts`:

- `getTaskIntentContract(intent)`
- `getTaskIntentPolicy(intent)`
- `formatTaskIntentContractForPrompt(intent)`
- `formatTaskIntentPrimaryConstraints(intent)`
- `formatTaskIntentOptionsForPrompt()`
- `validateTaskIntentChangedFiles({ task, changedFiles, meaningfulChangedFiles })`

The prompt formatter will render the structured policy fields, including allowed changes, forbidden changes, expected artifacts, verification, memory, review, required gates, planning guidance, and implementation guidance.

The changed-file validator will be deterministic and intentionally conservative. It will receive task title, description, plan, implementation log, review comments, tags, and changed-file lists through the task-like input so evidence can be checked against persisted task context rather than hidden prompt state. Docs, tests, and spike changed-file exceptions may be authorized only by pre-implementation task/plan fields, not by implementation logs, review comments, or agent activity evidence.

- `audit`: enforce report-only completion in the shared changed-file validator using the audit report artifact contract; the existing audit completion guard remains the downstream evidence and lifecycle guard.
- `spike`: block source/config/test changes unless an explicitly named proof-of-concept artifact is affirmatively present in the task description or approved plan; negated or prohibitive proof-of-concept/prototype artifact language does not authorize an exception, and named artifact paths are matched case-sensitively after separator normalization.
- `docs`: block non-doc source/test/config changes unless the task description or approved plan explicitly and affirmatively states that specific support category is needed for docs correctness; negated or prohibitive change/touch/modify/never language does not authorize an exception.
- `tests`: block source/config/docs changes unless the task description or approved plan explicitly and affirmatively states that specific support category is needed for testing; negated or prohibitive change/touch/modify/never language does not authorize an exception.
- `feature`, `fix`, `general`: do not add broad file category blockers beyond existing zero-delta and audit checks.

Completion call sites:

- Agent auto pipeline: keep using `evaluateTaskCompletionEvidence()` through `blockTaskForCompletionEvidenceIfNeeded()` in `packages/agent/src/coordinator.ts`; because the policy validator is inside the shared evidence function, skip-review, accepted-review, and generic reviewer success paths all receive the same contradiction checks.
- API/manual path: keep using `evaluateTaskCompletionEvidence()` in `packages/api/src/services/taskEvents.ts` for `approve_done`; this ensures operator approval cannot verify a task whose changed files contradict its intent policy.
- Pre-implementation path: keep current pre-implementation calls to the shared evidence function. Policy contradiction checks should apply only to completion phase unless a rule is explicitly safe before implementation.

## Consumers

Shared:

- `packages/shared/src/taskIntentContracts.ts`
- `packages/shared/src/taskIntent.ts`
- `packages/shared/src/workflowPacks.ts` only where generated validation should read policy summaries or shared helpers.
- `packages/shared/src/taskCompletionEvidence.ts` for policy contradiction checks at completion; this is the shared choke point used by the agent coordinator and API human event handler.

Agent:

- Planner and implementer continue using `formatTaskIntentContractForPrompt()`.
- Reviewer prompt adds the same formatter so review consumes policy source rather than audit-only hand text.
- Review gate keeps existing audit-specific completion evidence invocation; broader completion enforcement happens in the shared completion evidence guard.

API and MCP:

- REST task creation already consumes shared defaults; add shared formatted policy to chat task-action prompt instead of hardcoded intent descriptions.
- MCP create/update descriptions can include the shared intent option summary.

Web:

- Add a small reusable intent policy summary component or local render helper.
- Task creation form and roadmap dialog show primary constraints from shared policy.
- Chat create-task card displays intent label and primary constraints.
- Task detail header displays intent and primary constraints.
- Task card can display a compact intent badge.

## Out Of Scope

- Database schema changes.
- First-class PlanManifest persistence or validation.
- Generic artifact/evidence/claim persistence.
- Replacing audit validators, audit evidence ledger, or audit artifact lifecycle.
- Weakening audit invariants, broad audit decomposition rejection, report-only audit completion, or review-gate behavior.
- Rewriting roadmap workflow-pack architecture.

## Risks

- Adding browser-exposed shared policy must remain browser-safe.
- File-category completion checks can be too strict if they do not allow task text exceptions; the first slice must be conservative and tested.
- Existing tests may assert prompt strings loosely; prompt updates should keep key headings stable.
- The worktree has pre-existing unrelated changes. This task must not revert or fold those into the close-out claim.
