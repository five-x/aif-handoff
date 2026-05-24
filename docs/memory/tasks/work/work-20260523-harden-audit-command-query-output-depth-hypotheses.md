<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260523-harden-audit-command-query-output-depth::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260523-harden-audit-command-query-output-depth
source_path: docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-23
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/research.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/design.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/plan.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/result.md
  created_at: 2026-05-23
  last_verified_at: 2026-05-23

---

# Summary

Local-only hypotheses collected during task work-20260523-harden-audit-command-query-output-depth.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: The self-reported bypass passes because `riskSubstantiveCommands` is derived from command text; the output line does not need to mention the risk concept.
- H2: The ledger-backed bypass passes because `evidenceUnitMentionsRiskConcept()` accepts the command query as risk substance instead of requiring `outputPreview` to contain a risk-substantive match.
- H3: Requiring search command output/evidence text to mention the risk concept, while still preserving non-search command and empty-file proof behavior, will block both bypasses without making trusted no-findings impossible.
