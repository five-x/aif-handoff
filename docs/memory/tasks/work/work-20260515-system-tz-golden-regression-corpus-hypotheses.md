<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-system-tz-golden-regression-corpus::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-system-tz-golden-regression-corpus
source_path: docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus
stability: draft
sensitivity: forbidden
kind: hypothesis
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
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus/research.md
- docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus/design.md
- docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus/plan.md
- docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus/result.md
  created_at: 2026-05-17
  last_verified_at: 2026-05-17

---

# Summary

Local-only hypotheses collected during task work-20260515-system-tz-golden-regression-corpus.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: Extending the existing audit corpus with exact System TZ failure-family IDs is lower risk than introducing a second audit fixture system.
- H2: A focused shared golden corpus can cover plan, implementation, audit, permission, and review closure validators without broad production changes.
- H3: Passed implementation verification that lacks output identity is a real corpus gap; strengthening `validateImplementationManifest` to require output hash and preview for passed verification will make `tests_no_run_output` and mutation coverage meaningful.
- H4: Data-layer memory, runtime, and timeline coverage can remain targeted because the relevant surfaces already have focused tests, but this task still needs unconditional deterministic corpus tests or commands for those named targets. The corpus should not force new generic persistence or change compatibility sources.
