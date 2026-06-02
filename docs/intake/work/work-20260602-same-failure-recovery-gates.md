# Same-Failure And Recovery Gates

- Task ID: work-20260602-same-failure-recovery-gates
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-06-02
- Due: TBD
- Source: Follow-up from work-20260602-aif-agent-workflow-stabilization
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260602-same-failure-recovery-gates

## Request

Add same-failure fingerprints and artifact-delta recovery gating so repeated validation/runtime failures fail closed instead of starting another agent rework attempt.

## Done When

- Failure fingerprints include task id, stage, artifact path, artifact/content sha, validator issue codes, validation fingerprint, blocking finding ids, source snapshot id, and allowed write paths.
- Two identical fingerprints in sequence block as `blocked_external` without starting a third agent attempt.
- Audit/report same-failure blocks set `manualReviewRequired = true` when manual validation is required.
- Runtime recovery compares artifact delta, validator fingerprint, tool-loop pattern, and blocked-reason family before retrying.
- Recovery retry is allowed only when fresh evidence or artifact delta exists.
- Activity log records `same_failure_fingerprint_fail_closed` or equivalent structured evidence.

## Constraints

- Do not weaken existing audit artifact validation.
- Do not rely on prompt instructions to stop repeated rework.
- Keep deterministic fallback paths fail-closed when evidence is invalid or stale.
