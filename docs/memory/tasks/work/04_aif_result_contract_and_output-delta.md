<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::04_aif_result_contract_and_output::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 04_aif_result_contract_and_output
source_path: docs/rdpi/work/04_aif_result_contract_and_output
stability: validated
sensitivity: local-only
kind: artifact
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
- task-delta
  source_refs:
- docs/rdpi/work/04_aif_result_contract_and_output/research.md
- docs/rdpi/work/04_aif_result_contract_and_output/design.md
- docs/rdpi/work/04_aif_result_contract_and_output/plan.md
- docs/rdpi/work/04_aif_result_contract_and_output/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

Curated delta for task 04_aif_result_contract_and_output.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Strict `aif-result` output blocks should be schema-validated in shared code, not by prompt-only conventions.
- Lower-priority missing narrative/contract evidence should not override higher-priority trusted implementation or operator evidence.
- Replace the old loose schema with a strict result model:
- statuses: `completed`, `blocked`, `needs_input`;
- stop reasons: `done`, `blocked_by_validation`, `blocked_by_scope`, `needs_human_input`;
- structured verification entries;
- structured resolved and unresolved blocker entries;
- `taskId` validation against an optional expected task id.
- Keep parsing exactly one fenced `aif-result` block. Multiple blocks, invalid JSON, unsupported status/stop reason, missing `taskId`, completed-with-unresolved-blockers, and completed-without-passed-verification all fail validation.
- Treat `blocked` and `needs_input` as valid structured outputs, but not as successful rework completion. The implementer should persist a structured blocked state instead of pretending completion succeeded.
- Replace rework final-output prompt guidance with a single-block contract and remove prompt language that requires narrative final result text, explicit prose listings, or restating the task.
- Update deterministic `aif-result` appenders to emit the new schema with `taskId`, `verification[]`, blocker objects, and `stopReason`.
- Add a shared stronger-evidence helper to `taskCompletionEvidence.ts` so missing/invalid `aif-result` is not considered fatal when trusted evidence already exists:
- valid current implementation manifest;
- valid current `aif-result` plus observed/passed verification;
- accepted operator verified completion evidence represented by trusted committed files and trusted verification commands;
- deterministic recovery manifest only when its validation is `ok=true`.

## Patterns

- Centralize machine-readable result contracts in shared validators and let prompts consume the validator contract.
- Keep evidence hierarchy explicit: higher-trust manifests/operator evidence can override lower-trust missing closeout text, but invalid deterministic recovery cannot.
