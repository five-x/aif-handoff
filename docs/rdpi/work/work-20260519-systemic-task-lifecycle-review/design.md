# Design

## Goal

Define the lifecycle contract that the review will audit against. The contract must make task status, artifact trust, audit-card decision, retry behavior, and operator action agree.

## Non-Goals

- No product-code implementation in this review/discovery run.
- No live server/log/API probing before `PLAN PASS`.
- No merge, deployment, commit, push, or runtime repair in this RDPI run unless the operator starts a separate implementation task.

## Proposed Lifecycle Contract

### Success

`done` and `verified` are green only when all required conditions are true:

- OTZ/acceptance criteria are satisfied for the task intent.
- Implementation or report artifact evidence exists.
- Verification evidence exists and is strong enough for the task type.
- Audit/report artifacts are trusted valid when the task depends on them.
- Required production validation, access, security review, or operator approval is not outstanding.

Weak/discarded findings inside an otherwise validated report do not block success by themselves. Weak main evidence, missing evidence, or inconclusive source coverage does block success.

### Deterministic Rework

Use rework when the system can act without operator input:

- The blocker is recoverable by editing code, report content, manifests, evidence refs, or plan/implementation artifacts.
- The failure has a stable family/signature and the next attempt can be scoped to exact blockers.
- The rework prompt carries required evidence and exact closure conditions.
- Same-signature no-progress loops stop after the defined budget and escalate with a concrete reason.

### Operator Input

Use an operator-input hold when the system cannot proceed because it lacks external facts, access, a decision, or production validation:

- Task status may use existing `blocked_external` for compatibility, but `blockedReason` must start with `operator_input_required:`.
- The payload/reason must name the requested input, why it is needed, and what answer will allow retry.
- Retry requires a newer human answer comment, then clears `paused` and resumes from `blockedFromStatus`.
- This path is not a generic manual review bucket. It is a structured question to the operator.

### External Block

Use external block for infrastructure, runtime, auth, filesystem, git/worktree, provider, or deployment conditions that are not resolvable by task rework.

External block should not be used merely because a report is weak or inconclusive. Weak/inconclusive report output should become rework if repairable or operator input if the system needs missing context.

### Audit Artifact Outcomes

Audit artifact state is not the same thing as task success.

- `validated_findings_present` or `validated_no_findings` can support success if OTZ and verification are satisfied.
- `source_inconclusive`, `terminal_inconclusive`, weak sources, unsupported claims, and missing evidence are non-success artifact states.
- A weak/discarded finding section is informational when the validated outcome is otherwise strong.
- An explicit audit-inconclusive synthesis may be a valid report artifact, but it is not a trusted success outcome unless the product deliberately models an acknowledged non-success terminal state.

### Manual Review

Manual review should be reserved for unsafe auto-closure, policy/security-sensitive ambiguity, or cases where a human must judge evidence. If the missing action is simply "provide X", use operator input instead.

### Waivers

Waived acceptance criteria should not satisfy OTZ by default. A waiver needs explicit authority/evidence or must be represented as residual risk that prevents normal `closed_verified`.

## Review Axes

The full review should cover:

- Shared lifecycle contracts: task statuses, state machine, completion evidence, audit-card decision, implementation manifest validation.
- Agent coordinator: planning, implementation, review handoff, completion, audit artifact state updates, batch rollup, rework loops.
- Implementer/reviewer prompts and deterministic terminalization.
- API event handlers: `start_implementation`, `approve_done`, `retry_from_blocked`, manual exception paths.
- Data read/write projections: artifact attempts, trust state, active pipeline selection, operator-input normalization.
- UI exposure: task card/detail, artifact trust, manual review/operator input, next action.
- Tests: unit, coordinator-level, API route, data projection, UI trust display, and deterministic retry behavior.

## Expected Review Output

The review result should lead with findings ordered by severity and include concrete file/line references. It should also produce queued follow-up implementation tasks, because this review/discovery task does not itself authorize code changes.
