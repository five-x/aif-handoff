<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260602-close-aif-roadmap-blockers::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260602-close-aif-roadmap-blockers
source_path: docs/rdpi/work/work-20260602-close-aif-roadmap-blockers
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-06-02
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/research.md
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/design.md
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/plan.md
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/result.md
  created_at: 2026-06-02
  last_verified_at: 2026-06-02

---

# Summary

Curated delta for task work-20260602-close-aif-roadmap-blockers.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Non-implementation lifecycle stages should default to read-only execution, with explicit write scopes reserved for implementation or deterministic artifact finalization.
- Container parent approval should be based on child closeout state, not parent-owned executable QA artifacts.
- Deterministic schema fallback may pass only from fresh mandatory evidence; malformed or missing evidence remains blocked.
- Stage write safety:
- Extend runtime stage caps with read-only execution defaults for researcher, designer, planner, plan-checker, reviewer, QA, security, audit, and synthesis.
- Apply these defaults to Codex adapter options so non-bypass pre-implementation stages resolve `sandboxMode: read-only`.
- Add Qwen-local read-only shell denial for write-capable shell commands while keeping inspection commands available.
- Plan manifest repair:
- Teach manifest normalization to replace malformed single manifest blocks when a deterministic manifest can be built from the task and plan.
- Normalize `accept_existing_plan` disk content before quality evaluation and persist the normalized plan if valid.
- Keep broad/multi-area cards fail-closed through existing task-size quality checks.
- QA artifact fallback:
- Keep strict fallback pass conditions: every mandatory item must be unblocked, from fresh implementation evidence, and `passed`.
- Improve fallback metadata/markdown so schema repair is auditable and deterministic when the model omits `aif-qa-artifact`.
- Container closeout:
- Add a data helper that determines whether a container parent has satisfied direct-child closeout policy.
- Exempt only such container parents from executable QA/acceptance freshness checks during `approve_done`.
- Preserve child task QA/acceptance and completion-evidence gates.
- Requirements actor intake:
- Treat explicit internal/test-only/operator/system-maintenance cards as having an actor signal when scope and acceptance are already declared.
- Deploy/readiness handoff:
- Expand acceptance pack readiness metadata and markdown to distinguish built artifacts, preview smoke, public domain routing, and git remote/push availability.
- Report unknown/unconfigured deploy signals as limitations rather than failed evidence unless the task explicitly requires public deployment.

## Patterns

- Deterministic repair may replace malformed structured output only when local task context can produce a valid, scoped contract.
- Parent container closeout gates should consume child trust state rather than inventing parent implementation evidence.
