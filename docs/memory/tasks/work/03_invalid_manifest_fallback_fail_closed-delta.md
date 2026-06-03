<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::03_invalid_manifest_fallback_fail_closed::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 03_invalid_manifest_fallback_fail_closed
source_path: docs/rdpi/work/03_invalid_manifest_fallback_fail_closed
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
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/research.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/design.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/plan.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

Curated delta for task 03_invalid_manifest_fallback_fail_closed.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- "Implementation evidence finalization must be fail-closed: normalized diagnostics are not trusted evidence unless validator returns `ok=true`."
- "Deterministic fallback must not fill missing required implementation manifests or repair invalid agent evidence into accepted evidence."
- Treat missing required development manifests as invalid evidence. The implementer must not create accepted `implementationManifestJson` through deterministic fallback when the agent omitted the required manifest.
- Validate any extracted `implementationManifestJson` against current task, plan, and git-change evidence.
- Return a trusted manifest only when `validation.ok=true`.
- Preserve `validation.normalizedJson` only as diagnostic context in logs/activity, not in `implementationManifestJson`.
- If validation fails, block before the final successful task patch is written.
- Use issue codes in `blockedReason`: `implementation_manifest_invalid: <issueCodes>`.
- Request implementation rework below the implementation evidence rework cap using the same counter policy as the coordinator implementation evidence guard: `retryCount + 1`, capped by `min(bounded maxReviewIterations, AGENT_IMPLEMENTATION_EVIDENCE_MAX_REWORK)`. Below cap, set `status="implementing"`, `manualReviewRequired=false`, `reworkRequested=true`, and `retryCount=nextIteration`.
- After the cap, use `blockedReason="implementation_manifest_invalid_after_rework_limit: <issueCodes>"`, `manualReviewRequired=true`, `reworkRequested=false`.

## Patterns

- Final evidence persistence must validate at the last write boundary, not only at parse/normalization time.
- Diagnostic normalized artifacts may be logged, but cannot cross into trusted evidence fields without a passing validator result.
