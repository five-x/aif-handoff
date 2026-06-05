<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::12_operator_closeout_idempotency_and_trust_rollup::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 12_operator_closeout_idempotency_and_trust_rollup
source_path: docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup
stability: validated
sensitivity: local-only
kind: artifact
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
- task-delta
  source_refs:
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/research.md
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/design.md
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/plan.md
- docs/rdpi/work/12_operator_closeout_idempotency_and_trust_rollup/result.md
  created_at: 2026-06-05
  last_verified_at: 2026-06-05

---

# Summary

Curated delta for task 12_operator_closeout_idempotency_and_trust_rollup.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- Operator closeout retries on `done` tasks are now governed by a stable evidence fingerprint, excluding volatile fields such as acceptance time and output preview.
- Generic task timeline completeness is separate from card-level trust selection; cards summarize strongest relevant terminal evidence while timelines preserve all artifacts.

## Decisions

- Terminal operator closeout retries should be idempotent only when stable evidence fingerprints match.
- User-facing generic trust card summaries should select strongest terminal evidence while timeline projections preserve all artifacts.
- Route broadcasts should reflect mutations; no-op idempotent retries should not emit move/trust/timeline updates.
- `commitSha`
- normalized/sorted `changedFiles`
- verification entries as `command`, `status`, and `outputSha256`
- `worktreeClean`
- overridden blockers and blocker override justification
- accepted `operator_verified_completion` stage artifact with supported/trusted claim;
- accepted/trusted `implementation_manifest`;
- other accepted/trusted terminal evidence;
- existing failure-first selector when no terminal trusted evidence exists.

## Patterns

- Prefer stable evidence fingerprints over full object equality for idempotency when records include timestamps or display previews.
- Separate timeline completeness from card-level rollup selection; cards should summarize the strongest relevant current state, not every historical artifact.
- For terminal idempotency, compare stable evidence fields and return a no-op result before mutation.
- For user-facing trust cards, prefer current terminal evidence while keeping historical or lower-priority artifacts in timeline/readback views.
