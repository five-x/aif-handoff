<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::12_operator_closeout_idempotency_and_trust_rollup::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 12_operator_closeout_idempotency_and_trust_rollup
source_path: docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-06-05
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/research.md
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/design.md
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/plan.md
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/result.md
  created_at: 2026-06-05
  last_verified_at: 2026-06-05

---

# Summary

Current capsule for entity aif-handoff, refreshed by task 12_operator_closeout_idempotency_and_trust_rollup.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Terminal operator closeout retries should be idempotent only when stable evidence fingerprints match.
- User-facing generic trust card summaries should select strongest terminal evidence while timeline projections preserve all artifacts.
- Route broadcasts should reflect mutations; no-op idempotent retries should not emit move/trust/timeline updates.
- `commitSha`
- normalized/sorted `changedFiles`
- verification entries as `command`, `status`, and `outputSha256`
- `worktreeClean`
- overridden blockers and blocker override justification
