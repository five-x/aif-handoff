# Result

- Verdict: `REVIEW FAIL`
- RDPI gates: `PLAN PASS` received from independent reviewer before post-plan review.
- Scope: read-only systemic code review. No product-code changes, runtime probing, server/API/log inspection, deployment, commit, or push were performed.

## Trust Verdict

Do not trust the current audit/card lifecycle as a final green signal.

The audit content can still be useful as evidence, and the valid no-findings plus weak/discarded findings regression is correctly preserved. But the system can still surface weak or inconclusive main audit evidence as `done`, `valid`, `trusted`, `complete`, or `closed_verified` depending on the path. That means the card status is not yet a reliable source of truth for whether the OTZ was actually satisfied.

## Findings

### Critical: Explicit audit-inconclusive synthesis can become green success

`packages/shared/src/taskCompletionEvidence.ts:1359` classifies explicit inconclusive synthesis as `terminalAuditInconclusiveSynthesis`. That flag suppresses missing-substantive-evidence blocking at `packages/shared/src/taskCompletionEvidence.ts:1379` and `packages/shared/src/taskCompletionEvidence.ts:1525`. The existing shared test locks this in with `expect(result.ok).toBe(true)` in `packages/shared/src/__tests__/taskCompletionEvidence.test.ts:3032`.

The coordinator then treats any `result.ok` as accepted and writes the artifact as `state: "valid"`, `failureFamily: null`, `reworkStatus: "accepted"` at `packages/agent/src/coordinator.ts:1228` and `packages/agent/src/coordinator.ts:1236`. The coordinator regression explicitly expects task `done`, artifact `valid`, trust `trusted`, next action `none`, and batch `complete` at `packages/agent/src/__tests__/coordinator.test.ts:1071`, `packages/agent/src/__tests__/coordinator.test.ts:1076`, `packages/agent/src/__tests__/coordinator.test.ts:1088`, `packages/agent/src/__tests__/coordinator.test.ts:1091`, and `packages/agent/src/__tests__/coordinator.test.ts:1105`.

This contradicts the operator goal: an inconclusive main audit result is not OTZ success. It should either stay non-green and actionable, or be represented by an explicit non-success terminal state. It must not become `done/trusted/complete`.

Required regression: explicit inconclusive synthesis must not produce task `done/verified`, artifact `valid/trusted`, next action `none`, or batch `complete`. The valid no-findings report with weak/discarded section must still produce `closed_verified`.

### Critical: Source-inconclusive report terminalization writes task `done`

`packages/agent/src/subagents/implementer.ts:3042` terminalizes source-inconclusive audit reports, writes the artifact as `source_inconclusive` at `packages/agent/src/subagents/implementer.ts:3109`, then sets the task to `status: "done"` and `manualReviewRequired: false` at `packages/agent/src/subagents/implementer.ts:3122`.

`packages/agent/src/coordinator.ts:1761` then accepts an implementer-completed `done` task with a `source_inconclusive` artifact and skips the normal review handoff.

This is the stale behavior the latest operator clarification rejected. `source_inconclusive` is a non-trusted artifact outcome. If locally repairable, the task should rework with exact blockers. If not locally repairable, the task should ask for operator input or become a non-green terminal outcome. It should not be green completion.

Required regression: non-repairable or terminal source-inconclusive source cards must not be `done` with `manualReviewRequired=false` and cleared blocked fields.

### Critical: API `approve_done` and coordinator disagree on audit-card decisions

The coordinator's `acceptedAuditCardDecision()` detects terminal inconclusive evidence and sets `otzAcceptanceSatisfied: false`, `verificationStrength: "inaccessible"`, and residual risks at `packages/agent/src/coordinator.ts:507`, `packages/agent/src/coordinator.ts:535`, and `packages/agent/src/coordinator.ts:538`.

The API path has a separate `acceptedAuditCardDecision()` that hardcodes `otzAcceptanceSatisfied: true` and `verificationStrength: "verified"` at `packages/api/src/services/taskEvents.ts:231` and `packages/api/src/services/taskEvents.ts:234`. On `approve_done`, it writes artifact `state: "valid"` and `reworkStatus: "accepted"` at `packages/api/src/services/taskEvents.ts:798`.

The same audit result can therefore be `audit_inconclusive` via coordinator but `closed_verified` via human/API approval. This breaks the central decision contract.

Required regression: API `approve_done` for explicit `source_inconclusive` or `inconclusive_batch_evidence` must use the same decision layer as coordinator and must not mark the artifact valid/trusted/closed_verified.

### High: Data/UI projection turns accepted audit-inconclusive into trusted/no-action

`packages/data/src/index.ts:6040` treats a `valid` synthesis artifact with `auditCardDecision.finalStatus === "audit_inconclusive"` as an accepted terminal audit-inconclusive artifact and clears its failure family. `packages/data/src/index.ts:4998` treats any synthesis artifact with `state === "valid"` and no failure family as trusted. `packages/data/src/index.ts:5057` returns next action `none` for trusted input, and `packages/data/src/index.ts:5819` makes the batch `complete`.

The web presentation then renders trusted artifacts as green-ish success labels through `packages/web/src/lib/artifactTrust.ts:15`, while tests expect "Done with untrusted inconclusive artifact" only for untrusted source/terminal inconclusive paths.

Required regression: `audit_inconclusive` must project as non-success or accepted-but-not-trusted, with a non-green next action. It must not be `trustedSynthesisInput=true` or `nextAction=none`.

### High: Runtime auth/permission failures can auto-retry instead of asking for input

`packages/agent/src/stageErrorHandler.ts:118` falls back to random backoff when provider/runtime errors lack a structured reset time. The agent runtime slice found auth/permission failures can then be released again by the watchdog, hiding the fact that operator/config input is required.

Auth and likely permission failures are not normal transient rework. They need explicit operator input or external configuration correction. Auto-retrying them produces repeated blocks without progress.

Required regression: auth/permission runtime failures should block with `retryAfter: null`, preserve a sanitized reason, and require operator/config action before retry.

### High: Inferred development tasks can skip implementation manifest evidence

The shared reviewer found that `evaluateTaskCompletionEvidence()` validates implementation manifests only when explicit `task.taskIntent` or `isFix` selects the development path, while task intent can also be inferred from title/description. This means a development-like task without normalized `taskIntent` can pass completion without the structured manifest/acceptance/verification guard.

Relevant area: `packages/shared/src/taskCompletionEvidence.ts:1238` and `packages/shared/src/taskCompletionEvidence.ts:1265`.

Required regression: inferred development tasks such as feature/fix/docs/test work must require the same implementation manifest, acceptance evidence, verification evidence, and review closure evidence as explicit development tasks, or completion must first require normalized task intent.

### Medium: Random retry/backoff makes repeated failures non-reproducible

`packages/agent/src/taskWatchdog.ts:21`, `packages/agent/src/taskWatchdog.ts:126`, `packages/agent/src/stageErrorHandler.ts:118`, and `packages/agent/src/coordinator.ts:331` use `getRandomBackoffMinutes()` / `random_backoff`.

This makes repeated task behavior hard to reproduce and hides stable failure signatures behind changing retry windows. It also makes it harder to tell whether the system is converging or simply retrying.

Required regression: backoff must be deterministic for the same task/stage/failure signature, or fixed exponential by attempt count.

### Medium: Ambiguity becomes manual review instead of actionable operator input

Reviewer instructions route ambiguous, external, permission-sensitive, or unsafe-to-close evidence to `manual_review_required` at `packages/agent/src/subagents/reviewer.ts:638`. Manual review blocks cannot resume via normal retry because `packages/shared/src/stateMachine.ts:119` rejects `retry_from_blocked` for manual-review blocked tasks.

The project already has a structured operator-input retry path: `packages/api/src/services/taskEvents.ts:134` recognizes `operator_input_required:` and `packages/api/src/services/taskEvents.ts:675` requires a newer human answer before retry. But ambiguity is not consistently converted into that structured path.

Required regression: when the missing action is "provide X", the task must use operator input with a concrete requested input and freshness-gated retry. Reserve manual review for actual human judgment or unsafe auto-closure.

### Medium: Waived acceptance criteria can satisfy completion with only `knownLimitations`

`packages/shared/src/implementationManifest.ts:611` treats an acceptance criterion with `status === "waived"` as supported when `knownLimitations` is non-empty.

A known limitation is not proof of acceptance unless there is an explicit waiver authority or operator-approved residual risk. This can allow `done` while acceptance criteria were not actually satisfied.

Required regression: waived acceptance criteria require explicit waiver authority/evidence, or they must prevent normal `closed_verified`.

### Medium: UI active queue count can disagree with scheduler semantics

The data scheduler counts `plan_ready` and `blocked_external` as active pipeline work to prevent queue overshoot, while the TaskDetail active queue display omits those statuses. The relevant UI/data mismatch is around `packages/web/src/components/task/TaskDetail.tsx:475` and `packages/data/src/index.ts:1931`.

This does not directly make audit trust wrong, but it makes operators misread why cards are not starting or why retries are holding capacity.

Required regression: TaskDetail should display the same active-pipeline semantics as the scheduler, or explicitly distinguish active execution from queue-gating work.

## Queued Follow-Up Implementation Tasks

The following follow-up tasks were queued as intake artifacts only. They must each run through RDPI before code changes:

1. `work-20260519-enforce-non-green-inconclusive-lifecycle`
   - Fix the canonical success/non-success lifecycle decision across shared evidence, coordinator, implementer, API, data, and UI.
   - Preserve the valid no-findings plus weak/discarded findings `closed_verified` regression.

2. `work-20260519-normalize-operator-input-runtime-retry`
   - Convert missing access/data/config decisions into structured operator-input holds.
   - Make auth/permission and unknown stage failures deterministic and inspectable.
   - Replace random backoff with deterministic retry scheduling.

3. `work-20260519-tighten-generic-evidence-gates`
   - Require implementation manifest evidence for inferred development tasks.
   - Harden audit-card decision evidence requirements.
   - Require explicit waiver authority for waived acceptance criteria.

## Close-Out

This review task is complete as a read-only RDPI audit. It should not be considered a product fix. The next step is to run the queued implementation tasks, starting with `work-20260519-enforce-non-green-inconclusive-lifecycle`.
