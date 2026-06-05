<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::12_operator_closeout_idempotency_and_trust_rollup::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 12_operator_closeout_idempotency_and_trust_rollup
source_path: docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-06-05
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/research.md
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/design.md
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/plan.md
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/result.md
  created_at: 2026-06-05
  last_verified_at: 2026-06-05

---

# Summary

Local-only hypotheses collected during task 12_operator_closeout_idempotency_and_trust_rollup.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: An early terminal idempotency branch in `handleOperatorVerifiedCompletion` can return the current task unchanged for the same evidence fingerprint and reject differing evidence before lifecycle mutation.
- H2: Extending the ok result with an idempotency marker lets the route avoid a misleading `task:moved` broadcast for no-op retries.
- H3: Making `selectGenericRollupArtifact` terminal-aware can keep all artifacts in the timeline while selecting accepted operator closeout or implementation manifest evidence for the card-level rollup.
- H4: Focused API and data tests are sufficient for this hardening slice; full repository tests can remain an optional broader verification if focused tests pass and time permits.
