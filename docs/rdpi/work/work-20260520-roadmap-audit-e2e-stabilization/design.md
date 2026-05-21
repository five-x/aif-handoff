# Design: Roadmap Audit E2E Stabilization

## Approach

Use the live `botIntevra` project as a canary for the platform audit roadmap lifecycle. Treat every non-green state as evidence to classify, not as an automatic failure:

- valid missing user/project data remains blocked with a precise operator-input reason;
- system blockers are fixed in platform code, covered by regression tests, committed, pushed, deployed, and then the live canary is restarted from a clean state;
- weak audit output is not promoted to trusted success.

## Live Run Model

1. Implement and deploy the runtime protections before any new live audit rerun.
2. Verify deployed state, service health, and LLM endpoint health from the AIF host.
3. Clean all current `botIntevra` cards through supported task deletion paths.
4. Verify no related rows remain in `tasks`, `roadmap_batches`, `roadmap_batch_artifacts`, and `roadmap_batch_artifact_attempts`.
5. Create a new audit roadmap through the web Roadmap UI using a fresh alias.
6. Start or enable execution for all created cards.
7. Observe cards until all reach terminal success or a diagnosable blocker appears, while checking runtime-protection logs for budgets, endpoint concurrency, cooldown, bounded retries, and cancellation.
8. For each blocker, inspect task state, artifact state, validation details, activity, runtime/deploy logs if needed, and report content.
9. If platform code is fixed, run targeted and relevant broad validation, commit, push, deploy, cleanup, and restart with a new alias.
10. After one clean run, cleanup and repeat with another fresh alias.
11. After the second clean run, judge audit quality from final source reports and synthesis.

## Fix Strategy

- Prefer narrow platform fixes in the lifecycle component that produced the bad state: API import/cleanup, data rollup, coordinator status transition, audit validator, implementer deterministic repair, reviewer gate, synthesis classifier, or UI submit path.
- Add or extend regression tests at the smallest level that reproduces the failure.
- Keep the audit contract strict: invalid, weak, unsupported, missing, or source-inconclusive evidence must not close as trusted.
- Do not special-case live aliases, `botIntevra`, or concrete artifact files.

## Runtime Protection Design

Treat the 192.168.88.62 outage as a runtime safety failure class: the audit workflow must not repeatedly send oversized full-context requests or concurrent generations to local llama.cpp endpoints after evidence collection has already exhausted its budget.

- Introduce OpenAI-compatible local-profile budgets, keyed by resolved profile/baseUrl rather than by task alias:
  - `8003`: estimated input 16k-20k, max output 2k-4k, total no more than 24k.
  - `8005`: estimated input 48k-60k, max output 4k-8k, total no more than 64k-70k.
- Enforce endpoint-level concurrency 1 for `8003` and `8005`, so two profiles pointing at the same host:port cannot run simultaneously even if their profile ids differ.
- When repository-inspection budget is exhausted, forbid another full-context source-inspection retry. The next path must either:
  - send a compact ledger/evidence summary for finalization only, or
  - terminalize as controlled non-trusted/source-inconclusive if compact finalization cannot fit the endpoint budget.
- Bound model-facing tool, evidence, and ledger payloads before appending them to chat-completion messages. Preserve exact evidence ids, paths, line references, classifications, and hashes, but cap verbose outputs and repeated ledger bodies.
- Add a circuit breaker around `transport`, `stream`, and `timeout` failures for local endpoint profiles. After a failure, put the endpoint into cooldown, require a lightweight `/models` health check before reuse, and limit fallback retries so `8003` and `8005` cannot alternate indefinitely.
- Ensure AIF timeouts abort the active HTTP request and any tool subprocess still owned by the run before coordinator retry/fallback state is written.
- Log a structured request estimate for every qwen-local-agent chat completion attempt: `profileId`, `baseUrl`, estimated input tokens, max output tokens, tool-call count, retry count, duration, and failure class.

## Recovery Refinement After Live Blocker

The first post-hardening canary proved that compact-or-fail behavior works, but the "compact summary + finalization" path must not rely solely on another model turn. When source audit evidence already exists and the ledger-writer recovery itself times out, the implementer should run deterministic audit report repair:

- write the declared report artifact locally from scoped source evidence and existing audit ledger context;
- pass strict audit report validation as `validated_no_findings` or `validated_findings_present` when the deterministic evidence is sufficient;
- otherwise terminalize as non-trusted `source_inconclusive` without re-entering full repository inspection;
- preserve the existing guard that empty or non-line-addressable scopes remain source-inconclusive.

## Verification Design

- Runtime unit tests cover request body budgeting, endpoint semaphore keying, compacted tool/evidence/ledger payloads, cooldown and health-check behavior, bounded retry after transport/timeout, and abort propagation to `fetch`.
- Agent/coordinator tests cover the critical audit failure shape: after repository-inspection budget exhaustion and enough ledger evidence, the system finalizes from compact summary or fails controlled without re-entering full repository inspection.
- Implementer tests cover ledger-writer timeout falling back to deterministic repair, while empty tracked files still terminalize source-inconclusive.
- Live E2E runs remain required only after `PLAN PASS` and after local regression coverage passes.

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
