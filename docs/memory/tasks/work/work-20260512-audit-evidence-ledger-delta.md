<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260512-audit-evidence-ledger::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260512-audit-evidence-ledger
source_path: docs/rdpi/work/work-20260512-audit-evidence-ledger
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-12
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260512-audit-evidence-ledger/research.md
- docs/rdpi/work/work-20260512-audit-evidence-ledger/design.md
- docs/rdpi/work/work-20260512-audit-evidence-ledger/plan.md
- docs/rdpi/work/work-20260512-audit-evidence-ledger/result.md
  created_at: 2026-05-12
  last_verified_at: 2026-05-12

---

# Summary

Curated delta for task work-20260512-audit-evidence-ledger.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Evidence ledger entries are append-only, bounded, and redacted.
- General task activity logging remains a concise timeline and never stores full tool responses.
- Inventory evidence is discovery-grade and cannot prove no-findings.
- Manifest evidence IDs become the compatibility bridge until first-class audit plan/source snapshot tables exist.
- Scope and risk IDs are first-class ledger bindings, not prose-only annotations.
- a shared `AuditEvidenceUnit` model and normalizer for bounded evidence capture;
- an append-only `audit_evidence_events` SQLite table with task, audit plan, source snapshot, scope IDs, risk hypothesis IDs, kind, grade, hashes, previews, command metadata, and parsed summary JSON;
- data-layer append/list helpers;
- runtime capture for read/search/shell evidence through agent-side Claude hooks and runtime event metadata where available;
- validator support that can verify manifest `evidenceRefs` against a ledger context.

## Patterns

- Use `redactProviderText` before persisting previews.
- Store raw output hashes separately from previews so reviewers can detect changed observations without reading unsafe payloads.
- Treat missing ledger context as compatibility mode, not provenance trust.
