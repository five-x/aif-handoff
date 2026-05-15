<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260514-harden-source-audit-report-production::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260514-harden-source-audit-report-production
source_path: docs/rdpi/work/work-20260514-harden-source-audit-report-production
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-15
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260514-harden-source-audit-report-production/research.md
- docs/rdpi/work/work-20260514-harden-source-audit-report-production/design.md
- docs/rdpi/work/work-20260514-harden-source-audit-report-production/plan.md
- docs/rdpi/work/work-20260514-harden-source-audit-report-production/result.md
  created_at: 2026-05-15
  last_verified_at: 2026-05-15

---

# Summary

Curated delta for task work-20260514-harden-source-audit-report-production.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Malformed report text should be a validator issue, not a new database state, unless later UI/API work needs a distinct persisted state.
- Missing report artifacts after attempted runtime work should carry explicit artifact diagnostics in attempt metadata even when the task terminalizes as source-inconclusive.
- No-findings reports must remain evidence-bearing: file existence, `git ls-files`, `ls`, broad grep, and inventory-only checks are not enough.
- Add a first-class validator issue for malformed source report text, especially physical one-line markdown containing escaped literal `\n` sequences or report bodies that look like serialized markdown instead of readable markdown.
- Keep artifact storage states stable. Use existing `invalid` state and `invalid_artifact_content` family for malformed report artifacts, rather than adding a new schema-level state that would require migrations and UI/API follow-up.
- Preserve the existing `missing` state and `missing_artifact` family for absent expected report artifacts.
- Harden terminal source-inconclusive paths so a missing declared artifact is explicitly recorded in validation details and attempt history with `missing_report_artifact`, attempted artifact path, branch/worktree/project root, and `contentSha: null`.
- Treat branch/worktree visibility as part of artifact production, not only synthesis. When a report exists only on a producer branch or worktree, content retrieval must either read that declared source or record a structured missing/visibility diagnostic that names the branch/worktree and artifact path.
- Keep deterministic repair output readable by relying on normal markdown assembly and adding regression checks that reject escaped-newline report blobs.
- Pass concrete validator issue codes and messages through rework/attempt metadata; do not broaden any invalid report into a trusted completion.

## Patterns

- Model artifact absence and artifact invalidity as separate states/families.
- Add first-class issue codes for new report failure classes before routing them to broader failure families.
- Keep terminal inconclusive artifacts useful by preserving reason codes, expected paths, branches/worktrees, content hashes, and last validator details.
