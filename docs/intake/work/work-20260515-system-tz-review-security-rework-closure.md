# System TZ Review Security Rework Closure

- Task ID: work-20260515-system-tz-review-security-rework-closure
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-15
- Due: after development evidence and completion guard planning
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 7, 25 P1
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-review-security-rework-closure

## Request

Make review, security review, and rework closure structured, stable-id based, and closure-first across workflow types.

Review outputs should persist stable findings with severity, source, path/line when applicable, claim, required fix, verification, and decision. Rework prompts and gates must carry exact blocker ids, closure condition, required evidence, forbidden unrelated changes, prior attempt hash, and context needed to prove closure.

## Done When

- Review findings have stable ids and unresolved blockers are not lost across auto-review iterations.
- Security sidecar output captures security findings, secret leak checks, permission/sandbox issues, unsafe shell/network behavior, and dependency/config risks.
- Rework implementer input is scoped to exact blocker ids and required evidence.
- Reviewer closure classifications include resolved, still_blocking, new_blocker, not_reproducible, and manual_review_required.
- Rework without substantive delta blocks.
- Same blocker fingerprint loops terminalize to `blocked_external` with `manualReviewRequired=true`.
- UI exposes blocker history.

## Constraints

- Build on the existing exact rework closure hardening instead of replacing it wholesale.
- Do not let reviewer output close a blocker without evidence tied to the current attempt.
- Do not allow security review to expose raw secrets in logs, evidence, WebSocket payloads, or chat.

## Notes

- This task generalizes prior audit/rework fixes to development, docs, tests, and other workflow types.
