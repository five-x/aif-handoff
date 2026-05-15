<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260514-deterministic-audit-synthesis-closeout::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260514-deterministic-audit-synthesis-closeout
source_path: docs/rdpi/work/work-20260514-deterministic-audit-synthesis-closeout
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-14
supersedes:
expires_at:
tags:

- aif-handoff
- work
- task-delta
- audit-synthesis
- plan-quality
- roadmap-batch-artifacts
  source_refs:
- docs/rdpi/work/work-20260514-deterministic-audit-synthesis-closeout/research.md
- docs/rdpi/work/work-20260514-deterministic-audit-synthesis-closeout/design.md
- docs/rdpi/work/work-20260514-deterministic-audit-synthesis-closeout/plan.md
- docs/rdpi/work/work-20260514-deterministic-audit-synthesis-closeout/result.md
  created_at: 2026-05-14
  last_verified_at: 2026-05-14

---

# Summary

Curated delta for task `work-20260514-deterministic-audit-synthesis-closeout`.

# Why it matters

Roadmap audit synthesis can now close deterministically from the batch artifact registry even when every source report is weak, missing, rejected, or source-inconclusive. The synthesis output preserves child trust states and closes as audit inconclusive when trusted evidence is insufficient.

# When to reuse

Reuse when reviewing or changing roadmap audit synthesis, plan-quality fallback, deterministic audit synthesis implementation, or completion evidence for synthesis summaries.

# When not to reuse

Do not reuse as permission to relax source report validation or to treat weak, missing, rejected, source-inconclusive, terminal-inconclusive, or manual-exception reports as trusted valid audit evidence.

## Facts

- Synthesis plan-quality context is supplied from the roadmap batch artifact registry through agent-side code, keeping shared plan-quality dependency-free.
- Deterministic synthesis fallback plans enumerate exact source report artifact paths and child statuses from the batch registry.
- Terminal weak source report artifacts can be synthesis inputs only when their latest rework status is terminal; `external_blocked` remains a true blocker.
- Deterministic synthesis now runs for first-run synthesis artifacts as well as rework when synthesis inputs are ready.
- Explicit `Audit inconclusive` text is not enough to pass completion evidence when the summary also contains stronger validated finding or validated no-findings claims.

## Decisions

- The roadmap batch artifact registry is the source of truth for synthesis input boundaries.
- Final synthesis must carry forward trusted validated findings without downgrading them, and must classify the final audit as audit inconclusive when trusted source evidence is insufficient.
- Plan-quality retry exhaustion for eligible synthesis cards should persist a corrected registry-derived plan and route to deterministic synthesis instead of stranding the card in generic `blocked_external`.

## Patterns

- Keep generic validation packages dependency-free by passing typed registry context from orchestration layers instead of importing data-layer APIs.
- For synthesis of audit artifacts, separate readiness from trust: terminal weak artifacts can unblock synthesis, but only trusted valid artifacts can support validated findings or validated no-findings.
- Treat explicit terminal/inconclusive prose as weaker than structured source outcome metadata, manifest outcome, and validated finding/no-findings evidence.
