<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260519-tighten-generic-evidence-gates::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260519-tighten-generic-evidence-gates
source_path: docs/rdpi/work/work-20260519-tighten-generic-evidence-gates
stability: validated
sensitivity: local-only
kind: artifact
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
- task-delta
  source_refs:
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/research.md
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/design.md
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/plan.md
- docs/rdpi/work/work-20260519-tighten-generic-evidence-gates/result.md
  created_at: 2026-05-19
  last_verified_at: 2026-05-19

---

# Summary

Curated delta for task work-20260519-tighten-generic-evidence-gates.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Inferred development intent should be enough to require implementation-manifest evidence; persisted intent normalization is not required as a prerequisite for blocking unsafe completion.
- A waiver is not acceptance evidence unless it names explicit waiver authority and points to concrete verification evidence.
- Operator UI should distinguish execution-active status counts from scheduler queue-gating counts instead of overloading one `Active queue` label.
- Use inferred task intent consistently for evidence gates:
- In `evaluateTaskCompletionEvidence()`, require `validateImplementationManifest()` for inferred `feature`, `fix`, `docs`, and `tests` tasks during review handoff and completion.
- In generic data projection, infer workflow kind from persisted fields plus title/description/tags before deciding whether an implementation manifest artifact is required.
- Keep audit weak/discarded findings separate from closure evidence:
- Preserve existing behavior where weak/discarded findings do not block a valid no-findings audit decision by themselves.
- Add an evidence-presence guard so `classifyAuditCardDecision()` cannot emit `closed_verified` when either implementation evidence or verification evidence is empty.
- Make acceptance waivers explicit:
- Extend implementation-manifest acceptance criteria with optional `waiverAuthority` and `waiverEvidenceRefs`.
- Treat `status: "waived"` as supported only when `waiverAuthority` is non-empty and `waiverEvidenceRefs` resolve to concrete verification evidence with output identity; `knownLimitations` alone is not acceptance evidence.
- Keep satisfied criteria behavior unchanged.
- Separate TaskDetail queue counts:
- Add `executionActiveCount` and `queueGatingActiveCount` to `ProjectQueueStateResponse`.
- Compute `queueGatingActiveCount` with `countActivePipelineTasksForProject()` so the API and UI use scheduler semantics.
- Compute `executionActiveCount` from non-terminal execution statuses only, excluding backlog.
- Render TaskDetail rows as separate counts instead of the current ambiguous `Active queue`.

## Patterns

- Evidence guards should decide from normalized/inferred intent before accepting terminal status.
- UI counts that affect operator trust should either use the same server-side semantics as schedulers or be labeled as distinct concepts.
