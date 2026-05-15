# Enforce Exact Rework Closure Before Done

- Task ID: work-20260515-enforce-exact-rework-closure
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-15
- Due: before audit-v16
- Source: audit-v15 live failure: repeated review blockers were reworked unsuccessfully, then the source card reached `done` with an untrusted artifact
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-enforce-exact-rework-closure

## Request

Fix the generic review/rework loop contract so a task cannot be marked complete after repeated unresolved reviewer findings. When a reviewer or deterministic gate returns blocking findings, the next implementer/editor pass must address the exact finding IDs and must prove closure before handing the task back to review.

This applies beyond audit reports. Audit source reports are the immediate canary, but the contract must generalize to code, docs, artifacts, and future workflow packs.

## Done When

- `done` is reserved for successful completion: accepted review, trusted artifact when applicable, and no unresolved blocking findings.
- A repeated same-finding failure after rework does not become `done`; it becomes an explicit blocked/manual state with the unresolved finding IDs and closure evidence gap.
- Implementer/editor prompts receive the exact blocking finding IDs, required closure conditions, and prior failed attempt context.
- Implementer/editor handoff back to review requires a pre-review self-check against the same deterministic validator or finding-closure contract when one exists.
- Review gate compares current output against prior blocking findings and reports `resolved` only when closure evidence is present.
- Audit report rework specifically proves valid manifest, bound evidenceRefs, scope coverage, and substantive evidence before review handoff.
- Tests cover a repeated blocker loop, a successful exact-finding closure, an audit report validator failure, and a non-audit code/docs rework case.

## Constraints

- Do not weaken validators or accept weak reports as trusted.
- Do not hide inconclusive or failed outcomes behind green `done`.
- Do not create a child implementation task from the same audit/discovery run.
- Preserve operator-visible diagnostics: unresolved finding IDs, repeated fingerprint, attempted fixes, and next action.
- Follow RDPI gates before implementation.

## Notes

- `audit-v15` live cards were cleared before this intake so v16 can start from a clean queue after the workflow fix.
- The current observed failure mode was `done` plus `artifactTrust.trustedSynthesisInput=false`; that must become impossible for success-labeled completion.
