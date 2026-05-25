# Remote Audit Quality Trust Canary

- Task ID: work-20260525-remote-audit-quality-trust-canary
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-25
- Due: after P0 trusted audit artifact tasks and before declaring audit quality fixed
- Source: External independent review `operator-supplied external review file aif-independent-code-review-6713a389.md`, failed remote audit-quality canary `866c5874-6f42-412b-a8a6-45adb1c5b728`, and operator requirement for remote-only e2e validation.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260525-remote-audit-quality-trust-canary`

## Request

Run a dedicated remote-only audit-quality canary to prove the audit pipeline now fails closed on weak or fabricated audit evidence and produces actionable machine-readable failure reasons.

This task is diagnostic and validation-only. It must target the deployed AIF service on `192.168.88.67`; do not start or use a local AIF service, loopback browser target, or local e2e runtime.

## Done When

- Remote canary runs only against `192.168.88.67`.
- A weak/fabricated report cannot produce trusted `validated_no_findings`.
- A valid ledger-backed and committed audit artifact can produce trusted pass.
- Failure output includes concrete issue codes, fingerprints, blocked lifecycle state, and next action.
- The result records whether audit quality is fixed, still blocked by trust boundary, or blocked by runtime saturation.
- Any new defect discovered by the canary is queued as a separate intake task rather than fixed inside this diagnostic task.

## Constraints

- Diagnostic only. Do not implement fixes in this task.
- Do not run local AIF service, local browser, or local e2e checks.
- Do not use remote success as quality proof unless the artifact is manifest-valid, ledger-valid, source-snapshot-valid, committed-blob-verified, and trusted by synthesis.
- Do not create and execute follow-up implementation tasks during this canary run.

## Verification Plan

- Confirm target base URL points to `192.168.88.67`.
- Run one negative audit-quality scenario with intentionally weak or fabricated evidence.
- Run one positive audit-quality scenario with a valid trusted artifact if the P0 implementation supports it.
- Capture remote API status, audit artifact state, validator reason codes, lifecycle state, and synthesis trust state.
