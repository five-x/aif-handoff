<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::03_invalid_manifest_fallback_fail_closed::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 03_invalid_manifest_fallback_fail_closed
source_path: docs/rdpi/work/03_invalid_manifest_fallback_fail_closed
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
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/research.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/design.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/plan.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

Local-only hypotheses collected during task 03_invalid_manifest_fallback_fail_closed.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- The minimal safe fix is in `packages/agent/src/subagents/implementer.ts`: final validation before persistence must gate `implementationManifestJson`; invalid or missing required manifests must block/rework rather than be repaired into accepted evidence.
- Shared validators probably need no production change because they already return issue codes and `ok=false`; tests can document that `normalizedJson` may exist while still being invalid.
- Focused tests in `packages/agent/src/__tests__/implementer.test.ts` should catch the main regression because the bug exists in implementer extraction/repair/persistence behavior.
