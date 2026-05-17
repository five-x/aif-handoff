<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-system-tz-source-backed-memory-knowledge::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-system-tz-source-backed-memory-knowledge
source_path: docs/rdpi/work/work-20260515-system-tz-source-backed-memory-knowledge
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-16
supersedes:
expires_at:
tags:

- aif-handoff
- work
- task-delta
- memory
  source_refs:
- docs/rdpi/work/work-20260515-system-tz-source-backed-memory-knowledge/research.md
- docs/rdpi/work/work-20260515-system-tz-source-backed-memory-knowledge/design.md
- docs/rdpi/work/work-20260515-system-tz-source-backed-memory-knowledge/plan.md
- docs/rdpi/work/work-20260515-system-tz-source-backed-memory-knowledge/result.md
  created_at: 2026-05-16
  last_verified_at: 2026-05-16

---

# Summary

Task delta for `work-20260515-system-tz-source-backed-memory-knowledge`.

# Why it matters

This task upgraded AIF Handoff's existing SQLite product memory into a typed, source-backed knowledge layer without creating a second source of truth.

# When to reuse

Reuse this when changing memory approval, memory prompt briefs, memory redaction, or Memory Review UI source visibility.

# When not to reuse

Do not treat this as guidance for Codex shared-memory publishing or filesystem knowledge exports. This task stayed on the server-owned SQLite memory path.

## Facts

- `memory_items` remains the product memory source of truth for AIF Handoff.
- DB version 28 adds `item_type`, `failure_family`, and `claims_json` to `memory_items`.
- Approved memory now requires clean redaction status and at least one source-backed claim.
- Retrieval and prompt formatting filter to approved, clean, non-blocking, source-backed memory and continue to write usage events.
- Memory Review UI exposes item-level source links and claim source links for operator review.

## Decisions

- Store the initial claim graph as bounded JSON on `memory_items` rather than adding first-class claim/source tables in this slice.
- Keep `.aif-knowledge/` export out of scope; any export remains a cache/export concern, not the source of truth.
- Treat redaction markers as approval blockers so sanitized stored source fields cannot become approvable through unrelated edits.

## Patterns

- Redaction-blocked memory must preserve taint across unrelated clean edits until the tainted field or claim is explicitly replaced with clean source-backed data.
- Memory prompt briefs should cite memory and claim ids, remain bounded, and preserve explicit non-overriding language.

## Gates

- `PLAN PASS`: completed.
- `TEST PASS`: completed after final patch.
- `REVIEW PASS`: completed after final patch.
