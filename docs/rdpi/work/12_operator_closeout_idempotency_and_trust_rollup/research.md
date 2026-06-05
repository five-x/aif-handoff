# Research

## Task framing and lane

- Task id: `12_operator_closeout_idempotency_and_trust_rollup`.
- Lane: `work`.
- Task input: `C:\Users\apron\Desktop\aif_stabilization_tz_pack\12_operator_closeout_idempotency_and_trust_rollup.md`.
- Scope: harden operator verified closeout retry behavior for terminal `done` tasks and adjust user-facing generic artifact trust rollup selection so strongest terminal evidence wins over unrelated thin-plan refutations.
- Out of scope before `PLAN PASS`: live endpoint readbacks, service checks, scheduler/log probing, shared-memory recall, and implementation.

## Accepted planning sources or local facts

- RDPI preflight command completed with `STATUS: ready`; managed repository files already looked current.
- `AGENTS.md` defines this as a Node/TypeScript repository and lists `npm.cmd run build`, `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run dev`.
- Existing worktree has unrelated modified docs/memory files. This task must not revert or rewrite them.
- Operator closeout is handled in `packages/api/src/services/operatorVerifiedCompletion.ts`.
  - `handleOperatorVerifiedCompletion` currently permits `done` tasks in the allowed status list at lines 392-404.
  - `nextStatusForOperatorCloseout` can return `review`, `qa`, or `done` based on `skipReview` and QA flags at lines 319-323.
  - Successful handling mutates lifecycle fields with `setTaskFields`, records an `operator_verified_completion` stage artifact, emits an accepted guardrail event, and appends activity at lines 543-590.
  - A repeated call against a `done` task can therefore create another stage artifact attempt and, for non-`skipReview` tasks, risk moving the task back to `review`.
- The operator route in `packages/api/src/routes/tasks.ts` always broadcasts `task:moved` after an ok service result at lines 1606-1616.
- Stage artifact persistence in `packages/data/src/index.ts` increments `currentAttemptNumber` and inserts a new attempt whenever the same task/stage/kind is recorded again at lines 2497-2564.
- Generic artifact trust is built in `packages/data/src/index.ts`.
  - `buildGenericArtifactSeeds` already reads accepted operator evidence and validates implementation manifests at lines 8694-8788.
  - `buildGenericTaskProjection` preserves task-record artifacts and task-stage artifacts in the timeline at lines 8940-9131.
  - `selectGenericRollupArtifact` currently sorts blocked/bad-plan/missing/rejected artifacts ahead of accepted artifacts at lines 9216-9236.
  - `buildGenericTaskArtifactTrustRollup` uses that selected artifact for the card-level rollup returned by `/artifact-trust` and normal task responses at lines 9258-9310.
- Task route responses attach `artifactTrust: buildTaskArtifactTrustRollup(task.id)` in `packages/api/src/routes/tasks.ts` at lines 410-424.
- Existing tests cover initial operator closeout and trusted generic implementation manifest rollups, but not terminal idempotent retry or terminal-evidence rollup selection.
  - API operator closeout test helpers and first success path are in `packages/api/src/__tests__/tasks.test.ts` around lines 3143-3353.
  - Data generic rollup tests are in `packages/data/src/__tests__/index.test.ts` around lines 1179-1423.

## Same-project memory

- Not queried before `PLAN PASS`; the RDPI contract forbids shared-memory recall before the plan gate unless explicitly waived.
- Locally visible `docs/memory/**` changes are pre-existing and unrelated to this task.

## Cross-project reusable patterns

- Not queried before `PLAN PASS`.
- Reusable planning pattern from local RDPI instructions: keep planning artifacts separate from implementation evidence; run independent plan, test, and review gates fail-closed.

## Rejected or stale memory candidates

- No memory candidates were evaluated. Any stale memory assessment must wait until after `PLAN PASS` and only if needed.

## Open questions

- Evidence fingerprint should ignore volatile fields such as `acceptedAt` while comparing stable terminal evidence fields: commit SHA, normalized changed files, verification command/status/output SHA, worktree cleanliness, and blocker override identity/justification.
- For different evidence on a `done` task, using the existing rejection path records a guardrail event and activity log. That is acceptable because the task only forbids duplicate confusing artifacts for identical retries.
- The task acceptance asks for before/after readback examples in `result.md`; those should be captured after implementation and verification, not as pre-plan live evidence.

## Hypotheses

- H1: An early terminal idempotency branch in `handleOperatorVerifiedCompletion` can return the current task unchanged for the same evidence fingerprint and reject differing evidence before lifecycle mutation.
- H2: Extending the ok result with an idempotency marker lets the route avoid a misleading `task:moved` broadcast for no-op retries.
- H3: Making `selectGenericRollupArtifact` terminal-aware can keep all artifacts in the timeline while selecting accepted operator closeout or implementation manifest evidence for the card-level rollup.
- H4: Focused API and data tests are sufficient for this hardening slice; full repository tests can remain an optional broader verification if focused tests pass and time permits.
