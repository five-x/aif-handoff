# Design

## Goal

Make task blocking recoverable and typed without weakening acceptance gates. The system must not mark weak or missing work as done, but it also must not strand cards in opaque `blocked_external` when an automatic or operator-input path is available.

## Non-goals

- Do not make weak audit evidence pass.
- Do not bypass audit card decision, completion evidence, or implementation manifest gates.
- Do not globally move implementer work to MI50; 4090 remains the normal fast-code profile. MI50/long-context is only a fallback for context overflow or explicitly selected heavy stages.
- Do not add database schema in this pass unless the current persisted fields cannot express the behavior.

## Recovery contract

Use existing task fields with stricter meaning:

- `retryAfter != null`, `manualReviewRequired=false`: infrastructure/runtime retry path. The watchdog can release it.
- `reworkRequested=true`, `manualReviewRequired=false`: deterministic local rework path. The coordinator can run it.
- `blockedReason` starts with `operator_input_required:`, `manualReviewRequired=false`: the system needs human data/access/scope/decision. Retry requires a newer human answer through existing API freshness checks.
- `manualReviewRequired=true`: human judgment or unsafe/malformed no-progress terminal state. This is not the default for generated bad artifacts.

## Runtime recovery

- Keep `context_length` non-retryable in the generic stage classifier so it cannot blindly retry the same oversized prompt.
- Add coordinator-level context-overflow recovery before the generic classifier persists the block:
  - Detect structured `RuntimeExecutionError` with category `context_length`.
  - Resolve the current runtime profile for the failed stage.
  - For implementer/audit/synthesis overflow, look for a compatible larger fallback from project/app plan or review defaults first, then remaining visible profiles.
  - A compatible fallback must be enabled, visible to the project, support the same runtime stage/workflow capabilities, exclude the current failed profile, and have a strictly larger effective context/token capacity when both capacities are known.
  - Context capacity is read from profile options using explicit non-secret metadata such as `contextWindow`, `nCtx`, `n_ctx`, `maxContextTokens`, or `promptTokenBudget`; unknown capacity can be used only when the failed profile capacity is unknown and the fallback is from an operator-selected plan/review heavy default.
  - If a fallback profile is found, persist a durable one-shot runtime override on the task for the next attempt and record the previous profile in task runtime options as a failed context profile. Do not rely on the existing in-memory fallback map, because the coordinator clears it before candidate execution.
  - The one-shot override must be revalidated before use against the current project-visible enabled profile set and the same compatibility/capacity rules used during selection. Stale, disabled, other-project, or no-longer-larger fallback profiles are cleared instead of applied.
  - The one-shot override must be consumed/cleared after successful stage execution, after a non-context failure, or when it fails revalidation, so it does not permanently move fast implementation to MI50.
  - Persist a short `blocked_external` retry with `retryAfter`, `retryCount + 1`, `manualReviewRequired=false`, `reworkRequested=false`, and a concrete reason naming the fallback profile.
  - If no fallback exists, persist `operator_input_required:` asking for a larger runtime profile or a smaller task/scope, not generic manual review.
  - Bound automatic context fallback attempts. If the task already tried the selected fallback for context overflow, stop and ask for operator input instead of cycling.

## Runtime concurrency

- Extend coordinator semaphore usage with runtime-profile keys.
- Add `resolveRuntimeProfileConcurrency(profile, stage)`:
  - Profile option `maxConcurrent`, `maxConcurrentTasks`, or `stageConcurrency[stage]` wins when positive.
  - Local `qwen-local-agent` profiles default to `1` per profile across task pipeline stages because the endpoint is a single GPU-bound worker.
  - Profiles without a resolved id keep existing stage/global concurrency behavior.
- Apply this before claiming candidates and release the profile key after stage completion.

## Audit scope normalization

- Treat an existing empty file as a valid scope object for deterministic no-findings checks only when the report includes command output that proves the empty content for that exact file; do not invent a line reference that would fail validation.
- When `git grep` finds no content for an existing tracked empty file, fall back to `git hash-object -- <path>` as the captured evidence command so the ledger records concrete file-content evidence, not inventory-only path existence.
- For such empty-file coverage, cite the concrete path without `:line` and attach a captured evidence unit. This supports “file is empty/no findings in this file” without pretending line evidence exists.
- If a declared scope root does not exist or is unbounded, route generated audit cards to `operator_input_required:` with requested concrete scope, while preserving artifact state `source_inconclusive`.
- Reject empty-file no-findings reports that only echo the path, list the path, or provide command output for an unrelated file.

## Audit/synthesis inconclusive routing

- Keep `source_inconclusive` and `inconclusive_batch_evidence` as non-success artifact outcomes.
- If local rework is still possible, keep returning to deterministic rework.
- If no trusted source report survives and rework cannot proceed, use `operator_input_required:` asking for corrected source scope/reports or an explicit decision to accept an inconclusive audit outcome.
- Do not set `manualReviewRequired=true` for routine missing source/scope data. Reserve manual review for malformed contracts, no-progress loops, policy/security judgment, and exhausted review budgets.

## Test strategy

- Coordinator-level context overflow test: implementer throws `context_length`, coordinator schedules non-manual retry/fallback instead of manual block, stores a durable one-shot fallback, releases the retry, and proves the next execution uses the fallback profile.
- Coordinator-level no-fallback context overflow test: no compatible larger profile exists, so the task becomes `operator_input_required`, `manualReviewRequired=false`, and `retryCount` is incremented or preserved according to the recovery contract.
- Coordinator-level runtime-profile concurrency test: parallel qwen-local-agent tasks sharing one profile only spawn one stage at a time.
- Implementer deterministic audit test: empty tracked scope file is normalized into deterministic report evidence instead of pre-runtime non-repairable block, and the generated manifest `scopeCoverage.covered` plus validator acceptance prove path-only evidence is valid only with empty-content command proof.
- Shared validator/completion tests: adversarial empty-file reports with `echo`, inventory-only path listing, or unrelated command output must remain non-validated and block completion.
- Implementer non-existent generated scope test: block reason is `operator_input_required:` and `manualReviewRequired=false`.
- Existing lifecycle/audit decision tests must continue to prove weak audit evidence does not close as green.
