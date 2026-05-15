<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260514-harden-source-audit-report-production::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260514-harden-source-audit-report-production
source_path: docs/rdpi/work/work-20260514-harden-source-audit-report-production
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-15
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/work-20260514-harden-source-audit-report-production/research.md
- docs/rdpi/work/work-20260514-harden-source-audit-report-production/design.md
- docs/rdpi/work/work-20260514-harden-source-audit-report-production/plan.md
- docs/rdpi/work/work-20260514-harden-source-audit-report-production/result.md
  created_at: 2026-05-15
  last_verified_at: 2026-05-15

---

# Summary

Current capsule for entity aif-handoff, refreshed by task work-20260514-harden-source-audit-report-production.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Malformed report text should be a validator issue, not a new database state, unless later UI/API work needs a distinct persisted state.
- Missing report artifacts after attempted runtime work should carry explicit artifact diagnostics in attempt metadata even when the task terminalizes as source-inconclusive.
- No-findings reports must remain evidence-bearing: file existence, `git ls-files`, `ls`, broad grep, and inventory-only checks are not enough.
- Add a first-class validator issue for malformed source report text, especially physical one-line markdown containing escaped literal `\n` sequences or report bodies that look like serialized markdown instead of readable markdown.
- Keep artifact storage states stable. Use existing `invalid` state and `invalid_artifact_content` family for malformed report artifacts, rather than adding a new schema-level state that would require migrations and UI/API follow-up.
- Preserve the existing `missing` state and `missing_artifact` family for absent expected report artifacts.
- Harden terminal source-inconclusive paths so a missing declared artifact is explicitly recorded in validation details and attempt history with `missing_report_artifact`, attempted artifact path, branch/worktree/project root, and `contentSha: null`.
- Treat branch/worktree visibility as part of artifact production, not only synthesis. When a report exists only on a producer branch or worktree, content retrieval must either read that declared source or record a structured missing/visibility diagnostic that names the branch/worktree and artifact path.
