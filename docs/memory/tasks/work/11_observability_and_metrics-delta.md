<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::11_observability_and_metrics::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 11_observability_and_metrics
source_path: docs/rdpi/work/11_observability_and_metrics
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-06-05
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/11_observability_and_metrics/research.md
- docs/rdpi/work/11_observability_and_metrics/design.md
- docs/rdpi/work/11_observability_and_metrics/plan.md
- docs/rdpi/work/11_observability_and_metrics/result.md
  created_at: 2026-06-05
  last_verified_at: 2026-06-05

---

# Summary

Curated delta for task 11_observability_and_metrics.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Guardrail observability should reuse structured log metrics, task activity, and task-stage attempts instead of new persistent counter storage.
- Guardrail event dimensions should be standardized and redaction-safe across runtime, agent, and API paths.
- Evidence-related guard events should be visible through existing workflow timeline attempts.
- the exact counter names from the task as stable constants;
- allowed action values: `blocked`, `rework`, `manual`, `fail_closed`, `accepted`, `rejected`;
- a normalized event shape with required keys: `taskId`, `projectId`, `stage`, `workflowKind`, `runtimeProfileId`, `runtimeId`, `providerId`, `toolName`, `artifactPath`, `fingerprint`, `failureFingerprint`, `action`, and `reasonCode`;
- `buildAgentGuardrailMetric(counter, event)` returning a sorted, redaction-safe structured log envelope with `metricKey: counter`, `metricValue: 1`, and dimensions;
- `formatAgentGuardrailActivityLine(counter, event)` returning a compact readable line for `agentActivityLog`;
- sanitizers that keep ids, stages, status names, paths, hashes, counts, and reason codes, but drop provider diagnostic bodies and secret-like text.
- invalid manifest rejection;
- same-failure fail-closed;
- runtime recovery no-delta;
- operator verified completion accepted/rejected;
- prompt contract missing when it blocks artifact acceptance;
- write-path denied or tool-loop blocked when the event is tied to a concrete artifact path.
- `kind`: exactly `guardrail_event`.
- `label`: `Guardrail event`.
- `stage`: the guard's owning stage, such as `implementer`, `review`, `runtime_recovery`, `operator_verified_completion`, or `planning`.
- `path`: sanitized artifact path when the guard is tied to a concrete artifact; otherwise `null`.
- `state` / `outcome` / `trustLevel`:
- `accepted`: `state="accepted"`, `outcome="supported"`, `trustLevel="weak"`.
- `rejected`: `state="rejected"`, `outcome="refuted"`, `trustLevel="untrusted"`.
- `rework`: `state="rejected"`, `outcome="refuted"`, `trustLevel="untrusted"`.
- `blocked`: `state="blocked"`, `outcome="blocked"`, `trustLevel="untrusted"`.
- `fail_closed`: `state="blocked"`, `outcome="blocked"`, `trustLevel="untrusted"`.
- `manual`: `state="blocked"`, `outcome="blocked"`, `trustLevel="untrusted"`.
- Normalize path separators to `/`.
- Apply provider-text redaction before storing or logging.
- If a path is absolute and can be proven under the project root, store only the relative path.
- If a path is absolute and cannot be proven under the project root, store `[external-path]`.
- If a path is relative but escapes the project with `..`, store `[external-path]`.
- Redact secret-like path segments, including `.env*`, private-key names, token/key/secret/password segments, and segments already redacted by provider-text redaction.
- Never store raw provider diagnostic text, command output, full error bodies, URLs, emails, or opaque runtime payloads in path, metric, activity, or timeline metadata.
- Runtime adapters may emit runtime events with sanitized metadata, but do not log counters.
- The agent runtime event bridge logs counters/activity for runtime-originated task events because it has task/project/profile context.
- Implementer/coordinator/API services log counters/activity only for guard decisions they directly own.
- Shared helpers only build sanitized payloads; they do not emit counters by themselves.

## Patterns

- Use log-backed metric counters for diagnostic events that do not need transactional storage.
- Use task-stage artifact attempts for timeline-visible evidence/attempt events instead of adding one-off tables.
- Keep guardrail dimensions bounded to ids, categories, counts, hashes, paths, booleans, and status names.
