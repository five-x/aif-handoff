# Research

- Task ID: `work-20260519-systemic-task-lifecycle-review`
- Lane: `work`
- Date: 2026-05-19
- Scope: systemic review of task lifecycle, audit trust, retry/rework, blocked/manual/operator-input semantics, and prior task intent. This is a review/discovery task. It does not authorize product-code changes in the same RDPI run.

## Intake

The operator reports that cards repeatedly fall into `blocked_external`, prior local fixes treated weak/inconclusive audit output as successful `done`, and the real goal is broader than audit cards. The system must be stable: if it understands and can fix the issue, it should do deterministic rework; if data/access/validation is missing, it must escalate with a concrete operator request; it must not silently close with weak changes that do not satisfy the OTZ.

## RDPI Boundary

- `codex-ensure-rdpi.py` returned `STATUS: ready`.
- Before `PLAN PASS`, this research used only local repository files and local docs. No live runtime/server/API/log probing and no shared-memory server recall were used.
- Same-project local docs under `docs/rdpi`, `docs/kb`, `docs/intake`, and `docs/memory` were treated as local repository facts, with current code and latest operator clarification taking precedence.
- The working tree already had an unrelated dirty file: `docs/kb/windows-codex-bootstrap-validation.md`. This review must not revert or overwrite it.

## Prior Task Arc

Accepted local history shows the intended direction:

- `done` must mean accepted work with completion evidence, not merely that an agent stopped. See `docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification/result.md`.
- Audit trust is provenance based. Markdown reports are presentation/compatibility, not proof. Trusted audit outcomes require bound evidence and deterministic classification. See `docs/kb/audit-evidence-provenance-contract.md`.
- Audit artifact lifecycle is explicit: valid, invalid, inconclusive, and rework requested are different states. Weak terminal inputs should not become trusted valid reports. See `docs/rdpi/work/work-20260512-audit-artifact-lifecycle/result.md`.
- Recoverable audit artifact/content failures should route back to implementation rework with `reworkRequested=true`; true external blockers and operator-input waits are different paths. See `docs/rdpi/work/work-20260514-route-recoverable-audit-failures-to-rework-or-input/result.md`.
- Manual unresolved review should block with preserved blocker IDs and `manualReviewRequired=true`, not finish as `done + manualReviewRequired`. See `docs/rdpi/work/work-20260515-enforce-exact-rework-closure/result.md`.
- The audit-card decision fix intentionally says weak/discarded finding sections must not poison an otherwise valid audit card. That does not mean a weak main result is success. See `docs/rdpi/work/work-20260517-wire-audit-card-decision-output/research.md`.
- The latest top-level audit fix diagnosed the repeated red-card batches as a contract mismatch among roadmap generation, implementer repairability, validator strictness, and terminalization. See `docs/rdpi/work/work-20260519-audit-pipeline-top-level-fix/research.md`.

## Current Code Map

Local code surfaces relevant to this review:

- `packages/shared/src/types.ts` defines task statuses as `backlog`, `planning`, `plan_ready`, `implementing`, `review`, `blocked_external`, `done`, and `verified`.
- `packages/shared/src/stateMachine.ts` allows `approve_done` only from `done`, `request_changes` from `done` to `implementing`, and `retry_from_blocked` only from `blocked_external` with `blockedFromStatus`. Manual-review blocked tasks cannot use normal retry.
- `packages/shared/src/taskCompletionEvidence.ts` treats explicitly inconclusive audit synthesis as a special non-blocking case in completion evidence. This can make `result.ok` true even when the synthesis outcome is `source_inconclusive` or `inconclusive_batch_evidence`.
- `packages/agent/src/coordinator.ts` updates roadmap batch artifacts to `state: "valid"` and `reworkStatus: "accepted"` whenever completion evidence returns `ok`, while attaching an `auditCardDecision`.
- `packages/api/src/services/taskEvents.ts` has a separate `acceptedAuditCardDecision()` for human `approve_done` that hardcodes `otzAcceptanceSatisfied: true` and `verificationStrength: "verified"`.
- `packages/agent/src/subagents/implementer.ts` terminalizes `source_inconclusive` audit reports by setting the artifact to `source_inconclusive` and the task to `status: "done"` with `manualReviewRequired: false`.
- `packages/api/src/services/taskEvents.ts` has a structured `operator_input_required:` retry guard, but that path is not the common route for ambiguity.
- `packages/agent/src/subagents/reviewer.ts` instructs ambiguous/potentially external conditions to become `manual_review_required`.
- `packages/agent/src/taskWatchdog.ts` and `packages/agent/src/stageErrorHandler.ts` use random retry backoff windows.
- `packages/shared/src/implementationManifest.ts` permits waived acceptance criteria when `knownLimitations` is non-empty.

## Independent Agent Findings

Three read-only agents reviewed the local docs and code without live probing.

Docs/history review found that:

- The project goal is a strict lifecycle contract: evidence-backed done, deterministic rework when the system can act, and actionable operator input when the system cannot proceed.
- There is a stale assumption in older tasks where roadmap stalled/source-inconclusive source cards could complete as `done`. Later decisions moved away from stale green completion.
- `blocked_external`, `source_inconclusive`, `manualReviewRequired`, and recoverable rework still lack a single operator-facing vocabulary.

Code mapping found that:

- Shared state-machine invariants exist, but several coordinator/API paths bypass or reinterpret the same semantic decisions.
- Evidence guard, audit-card decision, artifact state, task status, and UI artifact trust can diverge.
- Generic non-audit task proof remains partly inferred from task fields until first-class generic artifact/claim persistence exists.

Systemic reviewer returned `REVIEW FAIL` with blocking issues:

- Weak/inconclusive audit evidence can still become task `done`, artifact `valid`/trusted, and batch `complete`.
- API `approve_done` and coordinator use different audit-card decision logic for inconclusive audit evidence.
- Retry/backoff behavior is intentionally random, making repeated failure behavior hard to reproduce.
- Ambiguity is routed to manual review rather than a structured, actionable operator-input hold.
- Acceptance criteria with `waived` status can pass using only `knownLimitations`, without explicit waiver authority/evidence.

## Stale Or Conflicting Assumptions

- The recent local change that lets non-manual `source_inconclusive` source reports finish as `done` is stale relative to the latest operator clarification. A weak/inconclusive main result must not be green success.
- The audit-card weak/discarded regression remains valid only for weak findings inside an otherwise validated no-findings or findings-present result. It must not be generalized to mean "weak main audit result is closed verified."
- Older docs that used `blocked_external` as a non-trusted terminal bucket conflict with docs that reserve `blocked_external` for external/operator intervention. The code currently inherits both meanings.
- `manualReviewRequired` currently means both "human review is needed" and "the system cannot auto-close safely." The operator's desired behavior is narrower and more actionable: ask for the missing data/access/decision when that is the blocker.

## Hypotheses

1. There is no single canonical lifecycle decision layer that maps evidence failure into exactly one of: success, deterministic rework, operator input, external block, or non-success terminal audit state.
2. `source_inconclusive` should remain an artifact/audit outcome, not task success. If the system can repair it, task status should return to rework. If it cannot repair without external facts/access/decision, task status should become an actionable operator-input hold.
3. The system needs deterministic retry/rework decisions keyed by stable failure signatures; random retry windows and generic retry counters make progress hard to reason about.
4. `done/verified` should require task-intent-specific proof: OTZ acceptance satisfied, implementation evidence, verification evidence, and no unresolved required validation.
5. UI/API must expose both the artifact trust state and the next required action. Operators should not infer from red/green cards whether the system needs data, access, code rework, or acceptance.

## Open Questions For Plan Review

- Should this project add a new task status for non-success terminal inconclusive, or use existing `blocked_external` plus structured fields for now?
- Should ambiguous review output become `operator_input_required:` by default, or only when it contains a concrete missing-input request?
- Should audit synthesis `source_inconclusive` ever close a parent batch as complete, or should completion require operator acknowledgement of residual risk?
