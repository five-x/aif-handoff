<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260519-tighten-generic-evidence-gates::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260519-tighten-generic-evidence-gates
source_path: docs/rdpi/work/work-20260519-tighten-generic-evidence-gates
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-19
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/research.md
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/design.md
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/plan.md
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/result.md
  created_at: 2026-05-19
  last_verified_at: 2026-05-19

---

# Summary

Local-only hypotheses collected during task work-20260519-tighten-generic-evidence-gates.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- If completion evidence uses inferred development intents before deciding whether a manifest is required, generic feature/fix/docs/tests tasks without normalized `taskIntent` will be blocked until they carry the same structured evidence as explicit development tasks.
- If generic timeline projection also uses inferred development intents, terminal inferred development tasks without valid manifests will project as untrusted instead of trusted generic task records.
- If `classifyAuditCardDecision()` requires non-empty implementation and verification evidence for `closed_verified`, weak/discarded audit findings can remain non-blocking while zero-evidence verified closure is rejected.
- If waived criteria require both explicit waiver authority and concrete waiver evidence refs, `knownLimitations` alone cannot satisfy normal development completion.
- If the queue API exposes scheduler queue-gating active count separately from execution-active status count, TaskDetail can stop presenting backlog as active pipeline work while preserving scheduler semantics.
