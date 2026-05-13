# Design: Terminalize Stalled Audit Rework Loops

## Scope

Implement a deterministic guard for auto-review rework loops. The guard applies to repeated unresolved review blockers and audit/report task loops, without lowering `maxReviewIterations` and without changing the independent reviewer/tester gates.

In scope:

- auto-review finding fingerprint and persisted convergence state;
- auto-review handler terminalization decision;
- coordinator blocked-state handling for stalled review loops;
- environment/default setting and documentation for the stall threshold;
- targeted tests for same-blocker loops, fresh blocker progression, and successful rework.

Out of scope:

- changing roadmap artifact failure signature semantics;
- changing `maxReviewIterations`;
- changing reviewer sidecar prompts beyond what is required by persisted diagnostics;
- executing or creating any follow-up task.

## State model

Extend `AutoReviewFinding` with optional diagnostic metadata:

- `firstSeenIteration`: first review iteration where the blocker fingerprint appeared;
- `lastSeenIteration`: current review iteration;
- `streak`: consecutive review appearances for the same stable finding id.

The stable blocker fingerprint remains the existing finding `id` from `createAutoReviewFindingId(source, text)`. The metadata is advisory and deterministic, not a new source of identity.

Persist and parse these fields in `autoReviewStateJson` through the data layer. Backward compatibility is preserved because old records omit the fields and default to streak `1` when seen again.

Also extend `AutoReviewState` with an optional `reworkSnapshot`:

- `iteration`: review iteration that requested rework;
- `artifactPath`: expected roadmap artifact path, when the task is a roadmap audit artifact;
- `artifactContentSha`: content hash of that artifact at the rework boundary, or `null` if the artifact is missing;
- `findingIds`: blocker ids that caused the rework request.

The snapshot is recorded only for request-changes outcomes that will re-enter implementation. It gives the coordinator an objective boundary for detecting immediate no-change re-submission.

## Stalled-loop threshold

Add `AGENT_AUTO_REVIEW_STALL_THRESHOLD` to the shared env schema, defaulting to `3`.

Semantics:

- threshold counts consecutive review appearances of the same blocker fingerprint;
- a blocker first found in review iteration 1 has streak `1`;
- if the same blocker survives reviews 2 and 3, streak reaches `3` and terminalizes;
- fresh blocker ids start their own streak at `1`;
- successful review still clears `autoReviewState`;
- `maxReviewIterations` remains the broad safety cap and is not reduced.

## Review gate behavior

Centralize blocker enrichment in `reviewGate.ts`:

1. Build the current blocker list as it does today from structured, fallback, legacy, and deterministic review findings.
2. For each current blocker, look up the previous persisted blocker with the same id.
3. If found, preserve `firstSeenIteration` and increment `streak`; otherwise set `firstSeenIteration = input.iteration` and `streak = 1`.
4. Set `lastSeenIteration = input.iteration`.
5. Return enriched findings in `autoReviewState`.

This keeps the gate responsible for finding identity while leaving terminalization policy in the handler.

## Handler behavior

In `handleAutoReviewGate()`:

1. Read `env.AGENT_AUTO_REVIEW_STALL_THRESHOLD`.
2. After `reviewGate.status === "request_changes"`, inspect `reviewGate.autoReviewState.findings`.
3. If any finding has `streak >= threshold`, return `manual_review_required` with a new handoff reason `stalled_rework_loop` instead of `rework_requested`.
4. The summary comment must include:
   - the threshold;
   - stalled finding ids;
   - finding text for unresolved blockers.
5. Keep the existing `max_iterations` handoff behavior as a separate later guard.

Fresh blocker progression remains useful rework because new findings have streak `1`.

## No-substantive-delta guard

Before an implementation-stage rework can move back to `review`, the coordinator must verify that a roadmap audit/report artifact actually changed relative to the rework boundary.

Definition of substantive delta for this task:

- For a roadmap audit artifact with `autoReviewState.reworkSnapshot.artifactPath`, compute the current artifact file SHA after implementation and compare it to `reworkSnapshot.artifactContentSha`.
- Different SHA means there was an artifact content delta. The task may proceed to review, where the existing review gate and completion evidence guard decide whether the change is good enough.
- Same SHA means there was no substantive artifact change. The coordinator must block immediately instead of resubmitting to review.
- If both baseline and current artifact are missing, treat that as no substantive delta and block.
- If there is no roadmap artifact snapshot, do not invent a generic file-diff rule in this task; existing completion evidence and review gates remain responsible for non-artifact tasks.

Blocked no-delta state:

- status: `blocked_external`;
- `blockedReason`: starts with `manual_review_required: no_substantive_rework_delta`, names the artifact path, baseline/current SHA state, and unresolved blocker ids/text;
- `blockedFromStatus`: `implementing`;
- `reworkRequested`: `false`;
- `manualReviewRequired`: `true`;
- `reviewIterationCount` and `autoReviewState` are preserved.

This satisfies the requirement that implementation cannot immediately resubmit an audit task to review without substantive artifact changes, while still preserving useful rework attempts that modify the artifact.

## Coordinator behavior

In `coordinator.ts`, handle `manual_review_required` with handoff reason `stalled_rework_loop` as a terminal blocked state:

- status: `blocked_external`;
- `blockedReason`: `manual_review_required: stalled_rework_loop after <iteration>/<threshold> same-blocker reviews; unresolved blockers: [id] text; ...`;
- `blockedFromStatus`: review in-progress status;
- `reworkRequested`: `false`;
- `manualReviewRequired`: `true`;
- `reviewIterationCount`: current iteration;
- `autoReviewState`: preserved enriched state;
- clear runtime limit snapshot as current blocked transitions do.

Other manual handoff reasons keep their existing behavior unless completion evidence guard already blocks them.

Separately, after `runImplementer()` returns for a task that entered the stage with `reworkRequested=true`, run the no-substantive-delta guard before the generic success transition to `review`.

## Audit artifact diagnostics

Do not change `buildAuditFailureSignature()` or repeated artifact failure grouping. For audit/report task diagnostics, the stalled blocked reason and summary comment will preserve stable review finding ids/text. The new `reworkSnapshot` records artifact SHA only as a rework-boundary delta marker, not as part of the existing failure signature.

This avoids weakening the existing same-fact artifact guard by making content changes reset the artifact failure family.

## Compatibility

- Existing persisted `autoReviewStateJson` remains valid.
- Existing code that reads `AutoReviewFinding` or `AutoReviewState` continues to work because new fields are optional.
- Tests expecting exact finding equality need to use object-containing assertions or include default streak metadata.
- The default threshold is much lower than `maxReviewIterations`, but only for repeated identical blockers.

## Risks

- If reviewer text changes semantically without changing the stable id, the loop may terminalize early. This is acceptable because the id is based on normalized text and source; materially new blocker wording creates a new id.
- If a blocker is resolved and later reintroduced with the same text after a successful pass, auto state clears and streak restarts.
- If fallback output preserves previous blockers without structured closure proof, streak terminalization is desirable because the system cannot prove resolution.
- Content hash only proves artifact text changed, not that the fix is correct. That is intentional; correctness remains the job of review and completion evidence gates.
