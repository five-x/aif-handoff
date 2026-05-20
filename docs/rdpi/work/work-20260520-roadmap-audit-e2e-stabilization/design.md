# Design: Roadmap Audit E2E Stabilization

## Approach

Use the live `botIntevra` project as a canary for the platform audit roadmap lifecycle. Treat every non-green state as evidence to classify, not as an automatic failure:

- valid missing user/project data remains blocked with a precise operator-input reason;
- system blockers are fixed in platform code, covered by regression tests, committed, pushed, deployed, and then the live canary is restarted from a clean state;
- weak audit output is not promoted to trusted success.

## Live Run Model

1. Verify deployed state and collect baseline health.
2. Clean all current `botIntevra` cards through supported task deletion paths.
3. Verify no related rows remain in `tasks`, `roadmap_batches`, `roadmap_batch_artifacts`, and `roadmap_batch_artifact_attempts`.
4. Create a new audit roadmap through the web Roadmap UI using a fresh alias.
5. Start or enable execution for all created cards.
6. Observe cards until all reach terminal success or a diagnosable blocker appears.
7. For each blocker, inspect task state, artifact state, validation details, activity, runtime/deploy logs if needed, and report content.
8. If platform code is fixed, run targeted and relevant broad validation, commit, push, deploy, cleanup, and restart with a new alias.
9. After one clean run, cleanup and repeat with another fresh alias.
10. After the second clean run, judge audit quality from final source reports and synthesis.

## Fix Strategy

- Prefer narrow platform fixes in the lifecycle component that produced the bad state: API import/cleanup, data rollup, coordinator status transition, audit validator, implementer deterministic repair, reviewer gate, synthesis classifier, or UI submit path.
- Add or extend regression tests at the smallest level that reproduces the failure.
- Keep the audit contract strict: invalid, weak, unsupported, missing, or source-inconclusive evidence must not close as trusted.
- Do not special-case live aliases, `botIntevra`, or concrete artifact files.

## Stop Conditions

- Stop as blocked if deploy access is unavailable and a code fix is required.
- Stop as waiting if the only blocker is a valid missing operator input or external project data that cannot be inferred safely.
- Stop as failed if independent test/review gates cannot run.

## Success Definition

Two separate fresh aliases complete after the final deploy with:

- all created roadmap cards terminally `done` or semantically `closed_verified`;
- no false `blocked_external`, `manualReviewRequired`, `source_inconclusive`, `weak_sources`, `rework_required`, or retry-loop states;
- no stale batch/artifact rows after cleanup;
- final synthesis grounded in trusted child reports with concrete evidence paths and lines;
- weak/discarded findings excluded from trusted blocker status and visible as weak/discarded where appropriate.
