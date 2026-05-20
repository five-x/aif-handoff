# Design

## Goals

Make runtime and review blocking behavior deterministic, inspectable, and actionable without exposing raw provider output.

The behavior should distinguish:

- operator input/config needed: block as `operator_input_required:` with no automatic retry;
- transient runtime issue: block with deterministic retry scheduling;
- unknown stage failure: block with a sanitized stage failure reason and retry counter;
- human judgment or unsafe/security-sensitive ambiguity: keep `manual_review_required`.

## Non-goals

- Do not change runtime adapter classification tables except where tests reveal a direct need.
- Do not remove runtime limit `resetAt` or `retryAfterSeconds` handling.
- Do not alter branch/worktree isolation behavior.
- Do not move operator-input freshness checks out of the API event path.

## Proposed changes

1. Replace random backoff with deterministic attempt-based backoff.
   - Replace `getRandomBackoffMinutes()` with a deterministic helper such as `getDeterministicBackoffMinutes(retryCount)`.
   - Use a fixed sequence by attempt count, capped to a bounded window. This satisfies the task requirement that retry/backoff be fixed by attempt count.
   - Update fallback retry sources from `random_backoff` to `deterministic_backoff` in stage error and coordinator runtime-gate code.
   - Keep structured `resetAt` and `retryAfterSeconds` as higher-priority sources.

2. Make auth and permission runtime failures operator-input holds.
   - Treat runtime categories `auth` and `permission` as non-auto-retryable in `classifyStageError`.
   - Persist `blocked_external` with:
     - `blockedReason` starting with `operator_input_required:`;
     - a sanitized operator/config action;
     - `retryAfter: null`;
     - `retryAfterSource: "none"`;
     - `manualReviewRequired` unchanged by the stage handler, with data-layer operator-input normalization setting `paused`.
   - Do not include the raw provider message in task state or activity text.

3. Persist unknown stage failures instead of reverting silently.
   - Replace the generic `revert` recovery with a blocked external recovery for unexpected stage failures.
   - Persist a sanitized reason that names the stage and says an unexpected stage failure occurred, without raw provider text.
   - Increment the retry counter for visibility.
   - Use `retryAfter: null` so the operator must intentionally decide whether to retry.

4. Convert concrete review-time operator needs into operator-input holds.
   - Update reviewer instructions so reviewers use a blocking finding beginning exactly `operator_input_required:` when the missing item is concrete operator-provided data, access, config, or approval text.
   - Normalize concrete but unprefixed review findings into `operator_input_required:` when they plainly ask the operator to provide data, credentials/access, config, or a decision and do not require human judgment to interpret. This includes ambiguous review output whose ambiguity is resolvable by a named operator answer.
   - Preserve `manual_review_required` for ambiguous judgment, unsafe auto-closure, policy/security-sensitive uncertainty, malformed contracts, max iterations, and stalled/no-progress loops.
   - Add review-gate handling that detects `operator_input_required:` blocking findings and returns an operator-input outcome instead of sending the task back to implementation or manual review.
   - Coordinator should block such outcomes as `blocked_external` with `manualReviewRequired: false`, `retryAfter: null`, and sanitized diagnostics only.
   - Any persisted review diagnostics, `autoReviewState`, activity text, blocked reason, API-visible task fields, and UI-visible task fields must be redacted with the existing provider-text redaction utilities before storage or exposure. Do not preserve raw sidecar/provider text for operator-input holds.

5. Preserve operator-input retry freshness.
   - Keep the existing `packages/api/src/services/taskEvents.ts` freshness rule: a newer human comment is required before `retry_from_blocked`.
   - Add or retain tests that stale comments fail and newer comments resume.

## Data and UI safety

The blocked reason is already included in API and UI surfaces, so persisted strings must be sanitized at the source. For this task, persisted operator input messages should be generic and actionable:

- auth: refresh/select a valid runtime profile or login state;
- permission: grant required runtime permissions or update the approval/sandbox policy;
- review input: provide the exact missing input described by the reviewer;
- unknown stage: inspect sanitized diagnostics and decide whether to retry.

Operator-input review diagnostics are task fields and can be surfaced through API/UI. They must therefore store only redacted finding text and redacted closure/diagnostic evidence. Tests should include secret-like tokens in review output and assert they are absent from blocked reason, `autoReviewState`, task activity, and API response JSON.

## Test strategy

- Agent stage error unit tests:
  - auth blocks as `operator_input_required:` with no retryAfter;
  - permission blocks as `operator_input_required:` with no retryAfter;
  - unknown errors block with sanitized stage reason and incremented retry count;
  - fallback retry source is deterministic.
- Agent watchdog tests:
  - deterministic backoff returns fixed values by attempt count;
  - stale auto-recovery uses deterministic delay.
- Coordinator tests:
  - planner/implementer auth or permission failures block with no automatic retry;
  - unexpected stage errors persist blocked reason and retry count instead of reverting;
  - runtime-gate fallback retry source is deterministic.
- Review-gate/coordinator tests:
  - structured concrete operator-input finding produces an `operator_input_required:` blocked task, not manual review or implementation rework;
  - concrete but unprefixed ambiguous review output is normalized to `operator_input_required:`;
  - policy/security-sensitive ambiguity stays `manual_review_required`;
  - persisted blocked reason, activity text, `autoReviewState`, and API-visible task JSON are redacted.
- API tests:
  - stale operator comment still rejects retry;
  - newer human answer still resumes and clears paused/blocking fields.
