# System TZ Plan Manifest Quality Gate

- Task ID: work-20260515-system-tz-plan-manifest-quality-gate
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-15
- Due: after TaskIntentContract v2 planning
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 5, 23 Phase 1, 25 P0
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-plan-manifest-quality-gate

## Request

Add a structured PlanManifest layer and deterministic plan quality gate for all new full-mode tasks.

The manifest should capture task id, intent, scope, allowed and forbidden changes, expected artifacts, acceptance criteria, and verification commands. The plan quality gate must reject missing, generic, intent-mismatched, underspecified, or untestable plans.

## Done When

- Plans can include a machine-readable `aif-plan-manifest` block with a validated schema.
- Plan quality checks verify manifest presence, task intent match, explicit scope, testable acceptance criteria, verification commands, allowed change consistency, and non-generic implementation detail.
- Replan feedback is structured and persisted in task activity logs.
- Replan exhaustion follows the policy: first feedback, stricter second feedback, third failure to `blocked_external` with `manualReviewRequired=true`.
- UI exposes plan quality result and blocker reason.

## Constraints

- Do not allow audit, spike, or docs tasks to be converted into feature/fix work by a plan.
- Do not use deterministic fallback plans to hide missing evidence.
- Do not require local verification commands to run during intake.
- Preserve existing RDPI gates.

## Notes

- This task is a P0 item in the System TZ.
- It is related to, but broader than, earlier weak audit plan checker hardening.
