# Add Specialized Reviewer Fan-Out Gates

- Task ID: work-20260523-add-specialized-reviewer-fanout-gates
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-23
- Source: Local-first audit hardening follow-up from operator discussion on audit quality and reviewer coverage.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260523-add-specialized-reviewer-fanout-gates`

## Request

Add a mandatory specialized reviewer fan-out gate for high-risk local-first work so a single generic review verdict is not the only model-authored quality signal.

The current system already has `review-sidecar`, `security-sidecar`, RDPI `TEST PASS` / `REVIEW PASS`, audit evidence validators, regression corpus, adversarial audit tasks, and manual-review escalation. This task should turn reviewer fan-out into an explicit, typed, auditable workflow for tasks that need stronger local-model review coverage.

## Problem

Local models are intentionally used to avoid paid token spend. That is acceptable only if the platform compensates with deterministic evidence gates and independent review perspectives.

Today the platform has general review/security paths, but it does not require a fixed set of specialized reviewer roles such as:

- correctness reviewer
- security/data-loss reviewer
- regression/API-contract reviewer
- audit-evidence reviewer

As a result, a task can receive an independent final review without a guaranteed pass over each risk class.

## Required Behavior

Implement a typed reviewer fan-out stage for eligible tasks.

Minimum reviewer roles:

- `correctness`: checks behavior, state transitions, data integrity, edge cases, and unintended regressions.
- `security_data_loss`: checks destructive operations, path safety, secrets, permissions, data deletion, and privilege/routing mistakes.
- `regression_api_contract`: checks API/schema/MCP/UI contract drift, backward compatibility, migration behavior, and required tests.
- `audit_evidence`: for audit/review/discovery tasks, checks evidence depth, manifest/ledger bindings, synthesis trust propagation, no-findings support, and fail-closed behavior.

Aggregation rules:

- Any role `FAIL` blocks the task and feeds structured findings into `autoReviewState`.
- Any role `INCONCLUSIVE` or missing required evidence moves the task to `blocked_external` with `manualReviewRequired=true`, unless a deterministic rework path is explicitly available.
- A task may close only when every required role returns `PASS`, the tester gate passes, and the existing final review gate passes or is replaced by an equivalent aggregate gate.
- Findings must preserve role/source identity so repeat blockers and stale rework detection continue to work.

Eligibility:

- Always required for `taskIntent=audit`, `taskIntent=review`, broad RDPI implementation tasks, schema/API/runtime changes, security/permission changes, data deletion or migration changes, and critical/high-priority tasks.
- Configurable for medium/low tasks without weakening the default audit behavior.

Local-first constraint:

- Do not require paid external model use.
- Use existing runtime profile resolution and local review profiles by default.
- Optional paid-model escalation may be designed only as an explicit operator-configured escape hatch, not as the default path.

## Acceptance Criteria

- The reviewer fan-out roles are represented in code as explicit workflow kinds or typed review roles, not only as prompt text.
- The coordinator/review stage can launch the required roles and aggregate verdicts deterministically.
- Role outputs are stored or projected through existing review state surfaces without leaking raw provider secrets.
- Manual-review escalation is fail-closed when a required reviewer role is unavailable, inconclusive, or blocked by runtime/tooling policy.
- Existing `review-sidecar` and `security-sidecar` behavior remains compatible.
- Audit tasks get the audit-evidence role by default.
- Tests cover:
  - all roles passing
  - one role failing
  - one role inconclusive or unavailable
  - audit task requiring `audit_evidence`
  - non-audit task not requiring audit-specific role unless configured
  - structured `autoReviewState` findings include role identity
  - manual-review blocking cannot be retried by the generic retry action

## Constraints

- Do not weaken existing audit validators, completion evidence gates, RDPI gates, or manual-review blocks.
- Do not require network-paid models for default operation.
- Do not execute this implementation during intake.
- Do not create child implementation tasks from this task run; queue additional follow-ups separately if RDPI discovers more work.

## Suggested Verification

- `npm.cmd test --workspace=@aif/agent -- reviewer reviewGate autoReviewHandler`
- `npm.cmd test --workspace=@aif/shared -- stateMachine taskCompletionEvidence`
- `npm.cmd test --workspace=@aif/api -- tasks`
- `npm.cmd run lint`
- `npm.cmd run build`
