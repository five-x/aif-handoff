# System TZ Workflow Timeline Trust Backbone

- Task ID: work-20260515-system-tz-workflow-timeline-trust-backbone
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-15
- Due: after contract inventory and before broad UI trust rollout
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 3, 9, 23 Phase 2, 25 P0
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-workflow-timeline-trust-backbone

## Request

Make WorkflowTimeline and ArtifactTrustRollup the central trust backbone for all workflow kinds, not only audit.

Extend the existing timeline surface so every important output can be represented as artifacts, attempts, claims, evidence, evidence links, events, trust rollup, and next action.

## Done When

- Generic artifact types cover plan, plan manifest, implementation manifest, source diff, test result, review report, security report, audit report, audit synthesis, memory candidate, and commit evidence.
- Claim outcomes include supported, refuted, inconclusive, blocked, waived, and not_evaluated.
- Trust levels include trusted, weak, and untrusted with deterministic rollup rules.
- TaskArtifactTrustRollup exposes task status, artifact role/state/trust, claim outcome, failure family, reason codes, synthesis readiness, next action, artifact path, batch id, attempt number, failure signature, branch, and worktree data as applicable.
- Any trusted artifact has an attempt and any blocker can be traced to a claim or evidence link.

## Constraints

- Reuse existing workflow timeline and audit trust work where possible.
- Do not make the audit evidence ledger a generic truth oracle.
- Manual exceptions must preserve operator justification.
- Do not hide untrusted artifacts behind a green task status.

## Notes

- This task should reconcile completed timeline work with the broader System TZ trust backbone.
- It should not duplicate already completed timeline UI work unless gaps remain after research.
