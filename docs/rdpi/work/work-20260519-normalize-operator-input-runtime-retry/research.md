# Research

## Task framing and lane

- Task ID: `work-20260519-normalize-operator-input-runtime-retry`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260519-normalize-operator-input-runtime-retry.md`
- RDPI path: `docs/rdpi/work/work-20260519-normalize-operator-input-runtime-retry`
- RDPI needed: yes

The task requires deterministic and actionable retry behavior. When data, access, config, or a decision is needed, the system must ask the operator for the exact missing input rather than retrying automatically, blocking with generic text, or closing.

## Accepted planning sources or local facts

- The selected intake card requires:
  - auth and permission runtime failures block with no automatic retry and sanitized operator/config action;
  - concrete ambiguous review needs become structured `operator_input_required:`;
  - manual review stays reserved for human judgment, unsafe auto-closure, or policy/security-sensitive ambiguity;
  - unknown stage errors persist a sanitized failure reason and retry counter instead of silently reverting to in-progress;
  - retry/backoff is deterministic for the same task/stage/failure signature or fixed by attempt count;
  - `retry_from_blocked` for operator input still requires a newer human answer comment;
  - tests cover auth/permission failure, unknown stage failure, deterministic backoff, and operator-input resume.
- The source audit in `docs/rdpi/work/work-20260519-systemic-task-lifecycle-review/result.md` identifies the same findings:
  - auth/permission failures can auto-retry through `packages/agent/src/stageErrorHandler.ts`;
  - retry/backoff uses random scheduling in `packages/agent/src/taskWatchdog.ts`, `packages/agent/src/stageErrorHandler.ts`, and `packages/agent/src/coordinator.ts`;
  - ambiguous review guidance favors `manual_review_required` even when concrete operator input would be enough.
- Preflight status:
  - `codex-ensure-rdpi.py`: `STATUS: ready`
  - `codex-flow-audit.py --repo .`: `STATUS: clean`
- `packages/runtime/src/errors.ts` defines `auth` and `permission` as external failure categories, so `packages/agent/src/errorClassifier.ts` routes them into the stage external-failure branch.
- `packages/agent/src/stageErrorHandler.ts` currently treats only `model_not_found`, `context_length`, and `content_filter` as non-retryable runtime categories. `auth` and `permission` fall through to external retry handling.
- `packages/agent/src/stageErrorHandler.ts` currently resolves missing structured retry metadata with `getRandomBackoffMinutes()` and returns `retryAfterSource: "random_backoff"`.
- `packages/agent/src/stageErrorHandler.ts` currently returns `{ kind: "revert" }` for unknown errors. `packages/agent/src/coordinator.ts` then resets the status back to the in-progress stage without persisting a blocked reason or incrementing a retry counter.
- `packages/agent/src/taskWatchdog.ts` currently exposes `getRandomBackoffMinutes()` and uses it when stale in-progress work is auto-recovered.
- `packages/agent/src/coordinator.ts` currently uses `getRandomBackoffMinutes()` when runtime-gate retry metadata lacks a reset time or retry-after seconds.
- `packages/api/src/services/taskEvents.ts` already recognizes blocked reasons beginning with `operator_input_required:` and requires the latest human comment to be newer than the blocked task before `retry_from_blocked`.
- `packages/data/src/index.ts` already normalizes operator input holds by forcing `paused = true` and `retryAfter = null` when a task is `blocked_external` with an `operator_input_required:` blocked reason.
- `packages/shared/src/stateMachine.ts` rejects `retry_from_blocked` for manual-review blocks and otherwise resumes to `blockedFromStatus`. The operator-input answer freshness rule is API-level, because it needs task comments.
- `packages/agent/src/subagents/reviewer.ts` currently instructs reviewers to mark ambiguous, externally dependent, or permission-sensitive evidence as `manual_review_required`, which is broader than the new task allows.

## Same-project memory

Shared memory was not consulted for this planning phase. The task is repo-specific, the local intake card and RDPI source audit are present, and the RDPI planning boundary does not waive shared-memory recall before `PLAN PASS`.

## Cross-project reusable patterns

No cross-project memory was consulted. The relevant behavior is implemented in local runtime, agent, API, data, and shared state-machine code.

## Rejected or stale memory candidates

- No memory candidates were loaded or rejected.
- The prior systemic review is accepted as a local RDPI source, not as memory.

## Implementation boundaries

- Preserve branch/worktree isolation fail-closed behavior.
- Do not expose raw provider errors or secrets in task fields, logs, API payloads, or UI.
- Do not weaken manual-review handling for genuine human judgment, unsafe auto-closure, malformed review output, stalled rework loops, or security/policy-sensitive ambiguity.
- Keep `retry_from_blocked` freshness enforcement in the API path where comments are available.
