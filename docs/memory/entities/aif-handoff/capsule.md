<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260519-tighten-generic-evidence-gates::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260519-tighten-generic-evidence-gates
source_path: docs/rdpi/work/work-20260519-tighten-generic-evidence-gates
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-19
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/research.md
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/design.md
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/plan.md
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/result.md
  created_at: 2026-05-19
  last_verified_at: 2026-05-19

---

# Summary

Current capsule for entity aif-handoff, refreshed by task work-20260519-tighten-generic-evidence-gates.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Inferred development intent should be enough to require implementation-manifest evidence; persisted intent normalization is not required as a prerequisite for blocking unsafe completion.
- A waiver is not acceptance evidence unless it names explicit waiver authority and points to concrete verification evidence.
- Operator UI should distinguish execution-active status counts from scheduler queue-gating counts instead of overloading one `Active queue` label.
- Use inferred task intent consistently for evidence gates:
- In `evaluateTaskCompletionEvidence()`, require `validateImplementationManifest()` for inferred `feature`, `fix`, `docs`, and `tests` tasks during review handoff and completion.
- In generic data projection, infer workflow kind from persisted fields plus title/description/tags before deciding whether an implementation manifest artifact is required.
- Keep audit weak/discarded findings separate from closure evidence:
- Preserve existing behavior where weak/discarded findings do not block a valid no-findings audit decision by themselves.
