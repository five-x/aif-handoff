<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::04_aif_result_contract_and_output::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 04_aif_result_contract_and_output
source_path: docs/rdpi/work/04_aif_result_contract_and_output
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-06-03
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/04_aif_result_contract_and_output/research.md
- docs/rdpi/work/04_aif_result_contract_and_output/design.md
- docs/rdpi/work/04_aif_result_contract_and_output/plan.md
- docs/rdpi/work/04_aif_result_contract_and_output/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

Local-only hypotheses collected during task 04_aif_result_contract_and_output.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- The safest change is to make `packages/shared/src/aifResultContract.ts` the single strict schema parser/validator and keep prompt/implementer code as consumers.
- The implementer rework prompt should require exactly the new JSON block and move closure evidence into `resolvedBlockers`, `unresolvedBlockers`, and `verification`, removing prose-oriented final-result instructions.
- Deterministic `aif-result` builders should emit the new schema so internal deterministic closeouts do not fail their own validator.
- The missing/invalid `aif-result` hierarchy can be implemented in shared completion-evidence code as a small helper that classifies stronger trusted evidence, then used by implementer rework handoff to decide whether an invalid/missing block is a blocker.
- Focused shared and agent tests are sufficient for the behavioral surface, with full lint/test/build retained as final verification.
