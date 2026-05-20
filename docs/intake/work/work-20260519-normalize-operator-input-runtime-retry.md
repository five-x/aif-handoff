# Normalize Operator Input And Runtime Retry

- Task ID: work-20260519-normalize-operator-input-runtime-retry
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-19
- Due: after `work-20260519-enforce-non-green-inconclusive-lifecycle`
- Source: Follow-up from `docs/rdpi/work/work-20260519-systemic-task-lifecycle-review/result.md`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260519-normalize-operator-input-runtime-retry`

## Request

Make retry and blocked behavior deterministic and actionable. When the system needs data, access, config, or a decision, it must ask the operator for exactly that instead of silently retrying, generic-blocking, or closing.

## Done When

- Auth and permission runtime failures block with no automatic retry and a sanitized operator/config action.
- Ambiguous review output becomes structured `operator_input_required:` when the needed operator input is concrete.
- Manual review remains reserved for human judgment, unsafe auto-closure, or policy/security-sensitive ambiguity.
- Unknown stage errors persist a sanitized failure reason and retry counter instead of silently reverting to an in-progress status.
- Retry/backoff is deterministic for the same task/stage/failure signature or fixed by attempt count.
- `retry_from_blocked` for operator input still requires a newer human answer comment.
- Tests cover auth/permission failure, unknown stage failure, deterministic backoff, and operator-input resume.

## Constraints

- Do not expose raw provider errors or secrets in task fields, logs, API payloads, or UI.
- Preserve existing branch/worktree isolation fail-closed behavior.
