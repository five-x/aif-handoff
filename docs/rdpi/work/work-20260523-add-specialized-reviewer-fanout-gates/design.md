# Design

## Scope

Implement typed specialized reviewer fan-out inside the existing review stage without replacing `review-sidecar`, `security-sidecar`, `reviewGate`, or the coordinator's fail-closed manual-review handling.

## Data model

- Add first-class specialized reviewer role constants in shared types:
  - `correctness`
  - `security_data_loss`
  - `regression_api_contract`
  - `audit_evidence`
- Extend `AutoReviewFindingSource` to accept these role names. This keeps role/source identity in the existing `autoReviewState.findings[]`, blocked reason formatting, UI display, and stale blocker detection surfaces.
- Keep the current `autoReviewStateJson` schema shape. No DB migration is needed because the field is JSON text and role identity is represented as expanded enum values.

## Review execution

- Keep current compatibility fan-out:
  - `review-sidecar` / `aif-review`
  - `security-sidecar` / `aif-security-checklist`
- Add a typed specialized fan-out stage for eligible tasks. Each role runs as a distinct workflow kind such as `review-correctness` or `review-audit-evidence`, with the role also used as its structured finding source.
- Use existing runtime profile resolution:
  - correctness, regression/API-contract, and audit-evidence use the review profile.
  - security/data-loss uses the security/review profile path.
  - no paid external model is required by default.
- Existing sidecars remain compatible because their structured contract and source values are still accepted.

## Eligibility

The fan-out stage is required when a task is high risk:

- `taskIntent === "audit"`: require all base roles plus `audit_evidence`.
- priority `>= 3` (`High`, `Urgent`, `Critical`): require base roles.
- risk keywords in task title/description/implementation context: schema, API/MCP contract, runtime, permissions, secrets, destructive/data-loss operations, migrations, or RDPI.

Non-audit tasks do not require `audit_evidence` unless explicitly configured in task text for audit-evidence fan-out. Low/medium tasks remain compatible with existing review behavior unless they opt into high-risk fan-out through the same explicit markers or are elevated by priority/risk terms.

## Role output contract

Each specialized reviewer returns a typed role verdict plus the existing structured sidecar sections:

- `PASS`: allowed only when the role reports no blocking findings.
- `FAIL`: requires at least one blocking finding; those findings use the role as source and flow into `autoReviewState`.
- `INCONCLUSIVE`: converted to a `manual_review_required` finding for that role.
- unavailable/malformed role output: converted to a `manual_review_required` finding for that role.

The canonical `reviewComments` builder aggregates legacy sidecars and specialized role outputs into one deterministic structured review summary. Raw role output is retained in redacted raw sections for auditability.

## Aggregation

- Existing `reviewGate` remains the deterministic aggregate gate.
- Any role `FAIL` appears as role-sourced blocking findings and produces the existing rework path (`request_changes`) unless higher-level auto-review limits or stale blockers force manual handoff.
- Any role `INCONCLUSIVE`, unavailable, or missing evidence emits a `manual_review_required:` role finding, so `reviewGate` returns `manual_review_required`.
- The coordinator already maps that outcome to `blocked_external`, `manualReviewRequired=true`, and preserved `autoReviewState`; generic retry remains blocked by the shared state machine.
- Successful closure still requires all required roles to contribute no blockers, tester verification to pass, and the final review gate to pass.

## Verification design

Focused tests will cover:

- all specialized roles passing;
- one role failing;
- one role inconclusive or unavailable;
- audit task requiring `audit_evidence`;
- non-audit task not requiring `audit_evidence` by default;
- role identity preserved in structured findings and hydrated `autoReviewState`;
- manual-review specialized-role blocks cannot be retried with the generic retry action.

Mandatory e2e verification is required after implementation. Service, browser, perf, load, and live API validation must target the deployed service at `http://192.168.88.67` with API checks through `http://192.168.88.67/api` and local dev-server auto-launch disabled unless the user explicitly authorizes local validation. If the existing Playwright stack is unsuitable for the review workflow, add or run the closest e2e-style test that exercises `runReviewer -> reviewComments -> handleAutoReviewGate -> blocked/done state` with mocked runtime sidecar outputs, and record any remaining remote-service validation that must be executed against `192.168.88.67`.
