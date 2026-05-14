<!-- Managed task artifact for work-20260513-make-audit-report-rework-deterministic-until-valid. -->

# Research

## Task framing and lane

- Task: `work-20260513-make-audit-report-rework-deterministic-until-valid`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260513-make-audit-report-rework-deterministic-until-valid.md`.
- RDPI needed: yes.
- Scope: harden audit report rework so manifest, ledger, scope-coverage, and substantive-evidence failures are resolved deterministically before a report task returns to review, or terminalized with exact validator issue codes and artifact path.

## Accepted planning sources or local facts

- `AGENTS.md` requires local repo facts before memory, RDPI gates, independent plan/test/review gates, and no execution before `PLAN PASS`.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: refreshed`; `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- `docs/architecture.md` defines the task pipeline: `plan_ready` and `implementing` flow through `runImplementer`, then successful implementation moves to `review`; reviewer completion and auto-review gating happen afterward.
- `packages/agent/src/subagents/implementer.ts` contains the deterministic report repair entry points:
  - `buildDeterministicAuditReportRepairContent()` builds deterministic body, manifest, and evidence ledger payloads.
  - `runDeterministicAuditReportRepair()` writes and commits the report artifact, and only explicitly updates roadmap artifact state for `source_inconclusive`.
  - `validateExistingAuditReportArtifact()` currently validates a report with task description and artifact path, but not the full task, batch, alias, snapshot, and ledger context used by the completion guard.
  - `runImplementer()` can skip repeated deterministic repair and route the task back through runtime implementation.
- `packages/agent/src/coordinator.ts` contains the strict completion gate:
  - `blockTaskForCompletionEvidenceIfNeeded()` runs `evaluateTaskCompletionEvidence()` and either returns recoverable audit artifact failures to rework or terminalizes after repeated/max failures.
  - `returnAuditTaskToRework()` persists the artifact attempt and sets `reworkRequested=true`.
  - The coordinator only blocks before implementation and before terminal `done`; the normal implementer success path can move back to `review` without running the full completion validator for audit report rework.
- `packages/shared/src/taskCompletionEvidence.ts` runs `validateAuditReportArtifact()` with task id, roadmap batch id, roadmap alias, audit plan id, expected report path, allowed evidence artifacts, audit evidence units, and ledger requirement.
- `packages/shared/src/auditReportValidator.ts` validates manifest presence, required fields, identity, content hash, source snapshot, manifest outcome, evidence refs, scope coverage, risk hypotheses, and ledger evidence binding.
- Existing tests in `packages/agent/src/__tests__/implementer.test.ts` cover deterministic source-inconclusive repair, generic-evidence inconclusive repair, and positive risk-specific no-findings repair. Current tests also encode the unwanted behavior: repeated deterministic repair can route through runtime implementation.
- Existing tests in `packages/agent/src/__tests__/coordinator.test.ts`, `packages/agent/src/__tests__/reviewGate.test.ts`, `packages/shared/src/__tests__/auditReportValidator.test.ts`, and `packages/shared/src/__tests__/taskCompletionEvidence.test.ts` cover adjacent validator and rework behavior.
- Explorer subagent found the same likely edit points: add a full-context deterministic audit report repair orchestrator, replace repeated-repair runtime fallthrough with deterministic terminalization, strengthen validation context, and add targeted regressions.

## Same-project memory

- Local RDPI/result artifacts for `work-20260513-deterministic-audit-repair-source-inconclusive` show the prior task intentionally prevented deterministic repair from manufacturing trusted no-findings out of generic scoped evidence; this task must preserve that.
- Local RDPI/result artifacts for `work-20260513-terminalize-stalled-audit-rework-loops` show repeated identical audit blockers and no-delta artifact rework should terminalize instead of looping.
- Local memory deltas for the related tasks contain no additional promoted facts, decisions, or patterns.
- Shared-memory recall was not used before `PLAN PASS`, per RDPI boundary.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- Reusable planning pattern from local instructions: keep deterministic validators as the authority for strict contracts, and use independent gates fail-closed.

## Rejected or stale memory candidates

- None rejected from shared memory; no shared-memory lookup was performed.
- The runtime fallthrough behavior in existing implementer tests is treated as an obsolete behavior candidate, pending implementation change after `PLAN PASS`.

## Open questions

- Whether the post-repair validator should reuse `evaluateTaskCompletionEvidence()` directly or a narrower helper that mirrors its audit-context inputs.
- Whether deterministic terminalization should use task status `blocked_external` immediately from `runImplementer()` or persist artifact state and then rely on coordinator post-stage checks. The task requirement says terminalize before review, so the chosen design should make the implementer stop review return explicitly.
- Whether `source_inconclusive` should be validator-ok for the manifest while still task-terminal for trusted-source accounting. Existing code already treats it as a non-trusted artifact state.

## Hypotheses

- Adding a full-context post-repair validation helper in `implementer.ts` can close the gap without broad data-layer or validator changes.
- Replacing the repeated deterministic repair runtime fallthrough with explicit terminalization will satisfy the "general LLM is not final authority" requirement with minimal blast radius.
- Tests can stay mostly in `packages/agent/src/__tests__/implementer.test.ts`, with one shared validator test for placeholder manifest rejection if existing coverage is insufficient.
