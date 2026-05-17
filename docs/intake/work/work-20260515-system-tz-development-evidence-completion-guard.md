# System TZ Development Evidence Completion Guard

- Task ID: work-20260515-system-tz-development-evidence-completion-guard
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-15
- Due: after PlanManifest quality gate planning
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 6, 23 Phase 4, 25 P0/P1
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-development-evidence-completion-guard

## Request

Add development evidence and an implementation completion guard for feature, fix, tests, and docs tasks.

The platform should stop treating implementation logs as proof. It must capture changed files, diff summary, test/lint/build execution, commit evidence, plan checklist sync, review closure evidence, and an ImplementationManifest tied to the approved PlanManifest.

## Done When

- ImplementationManifest schema records task id, intent, plan manifest hash, changed files, verification evidence, acceptance criteria status, evidence refs, and known limitations.
- Completion guard blocks done/review transitions when diff scope violates intent, forbidden files changed, acceptance criteria lack evidence, verification status is missing, plan checklist drift exists, or unintended uncommitted changes are present.
- Feature/fix tasks without verification cannot become `done`.
- Fix tasks without regression explanation warn or block according to policy.
- Docs tasks with source changes block unless routed as a separate non-docs intent.
- Tests tasks with source changes require explicit plan justification.

## Constraints

- Do not require audit reports to use development evidence semantics.
- Do not store raw full command output if the approved design chooses hash plus preview.
- Preserve skipReview behavior only if the minimum completion guard passes.
- Local validation commands are part of implementation verification, not intake.

## Notes

- This card covers both P0 development completion guard and P1 development evidence ledger concerns.
