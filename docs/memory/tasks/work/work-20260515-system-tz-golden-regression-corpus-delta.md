<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-system-tz-golden-regression-corpus::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-system-tz-golden-regression-corpus
source_path: docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-17
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus/research.md
- docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus/design.md
- docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus/plan.md
- docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus/result.md
  created_at: 2026-05-17
  last_verified_at: 2026-05-17

---

# Summary

Curated delta for task work-20260515-system-tz-golden-regression-corpus.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Golden corpus fixtures should stay deterministic, redacted, and local-only.
- Passed verification evidence should carry output identity, not only a command string.
- Rework-without-delta is distinct from review blocker closure; corpus coverage must prove both stale/no-delta rework and unclosed blockers fail.
- Audit report cases reuse `validateAuditReportArtifact`, `classifyAuditSynthesisSourceReports`, and `selectAuditArtifactFailureFamily`.
- Development cases use `evaluateTaskCompletionEvidence`, `validateImplementationManifest`, `evaluateTaskPlanQuality`, and `decideShellPermission`.
- Data/runtime cases use deterministic package-local tests for workflow timeline rollup, memory redaction, and runtime resolution. These are required coverage targets, not conditional stretch checks.
- Mutation cases alter evidence refs, source snapshots, command/test output, changed files, acceptance criteria, and review closure proof, then assert validator failure codes.
- Any validator gap found by the corpus is hardened narrowly instead of weakening fixtures.

## Patterns

- Golden corpus cases should be named after failure families, not test implementation details.
- Mutation tests should start from a known valid fixture and mutate exactly one trust boundary at a time.
- Corpus fixtures should remain redacted, deterministic, and independent of live services.
