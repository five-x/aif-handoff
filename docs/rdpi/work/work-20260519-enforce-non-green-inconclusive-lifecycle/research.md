# Research

## Task framing and lane

- Task: `work-20260519-enforce-non-green-inconclusive-lifecycle`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260519-enforce-non-green-inconclusive-lifecycle.md`.
- RDPI path: `docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle`.
- Task intent: implement the canonical lifecycle correction so weak or inconclusive main audit evidence cannot become green task success.
- Non-goal: do not weaken audit source validation, and do not treat weak/discarded findings inside an otherwise valid report as failure.

## Accepted planning sources or local facts

- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` reported `STATUS: ready`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` reported `STATUS: clean`.
- The systemic review at `docs/rdpi/work/work-20260519-systemic-task-lifecycle-review/result.md` is the immediate source for this implementation task.
- `packages/shared/src/taskCompletionEvidence.ts:1359` defines `terminalAuditInconclusiveSynthesis`, which currently lets explicit inconclusive synthesis suppress missing-substantive-evidence blocking.
- `packages/shared/src/taskCompletionEvidence.ts:1451` only emits `audit_inconclusive` when the synthesis is inconclusive and lacks an explicit inconclusive conclusion.
- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts:3032` currently expects explicit inconclusive synthesis to pass completion evidence.
- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts:2971` already protects the required valid no-findings plus weak/discarded findings exception.
- `packages/agent/src/coordinator.ts:499` has coordinator-local audit card decision logic that marks terminal inconclusive as `audit_inconclusive`, but `packages/agent/src/coordinator.ts:1228` still persists any accepted completion evidence as artifact `valid`.
- `packages/api/src/services/taskEvents.ts:201` has separate API-local audit card decision logic that hardcodes accepted/verified and diverges from coordinator behavior.
- `packages/agent/src/subagents/implementer.ts:3042` terminalizes source-inconclusive report artifacts, then `packages/agent/src/subagents/implementer.ts:3122` sets the task `done`, clears blocked fields, and disables manual review.
- `packages/agent/src/coordinator.ts:1761` treats an implementer-completed `done` task with `source_inconclusive` artifact as successful and skips review handoff.
- `packages/data/src/index.ts:4998` trusts synthesis artifacts with state `valid` and no failure family, while `packages/data/src/index.ts:5057` maps trusted input to next action `none`.
- `packages/data/src/index.ts:6040` has compatibility handling for persisted `valid` synthesis artifacts whose audit card decision is `audit_inconclusive`, but it currently clears failure family instead of projecting non-green trust.
- `packages/web/src/lib/artifactTrust.ts:15` derives green presentation from the data rollup's `trustedSynthesisInput` and `artifactTrustLevel`.
- Independent explorer confirmed the same edit points and test gaps without editing files.

## Same-project memory

- Not queried before `PLAN PASS`. The local task card, repo code, tests, and immediately preceding RDPI review are sufficient planning sources, and the project RDPI boundary says not to use shared-memory recall before the plan gate unless explicitly waived.

## Cross-project reusable patterns

- Not queried before `PLAN PASS` for the same reason.
- Local reusable pattern from repository instructions: centralize lifecycle decisions in shared code, keep projection fail-closed, and preserve explicit regression tests for both the blocked failure and the allowed weak/discarded exception.

## Rejected or stale memory candidates

- The existing `source_inconclusive -> done` behavior is stale by task card instruction and by the systemic review source.
- Any memory or docs claiming accepted explicit audit inconclusive is green success must be treated as stale until validated after implementation.

## Open questions

- Should historical persisted artifacts with `state: "valid"` and `auditCardDecision.finalStatus: "audit_inconclusive"` be migrated, or is projection-only downgrade sufficient for this task?
- Can the existing task status vocabulary represent non-green terminal source inconclusive without a new status? The task constraints prefer existing status fields if a new status is out of scope.
- Should terminal source-inconclusive report tasks use `blocked_external` plus `manualReviewRequired=true`, or a different existing non-green hold? Existing nearby patterns use `blocked_external` for non-success terminal holds.

## Hypotheses

- A shared audit-card decision helper can replace the duplicated coordinator/API decision logic without changing public decision shape.
- Explicit audit-inconclusive synthesis should fail completion evidence with `audit_inconclusive`, causing coordinator/API paths to use the existing block/rework machinery instead of artifact `valid`.
- Source-inconclusive terminalization should keep artifact `source_inconclusive` but set the task to a non-green blocked hold with preserved blocker fields.
- Data projection should defensively downgrade legacy `valid` + `audit_inconclusive` synthesis to untrusted/non-green so old rows cannot still render green.
- The weak/discarded no-findings regression can stay green because the weak/discarded sections are already parsed separately by `auditCardDecision` and validated by shared completion evidence tests.
