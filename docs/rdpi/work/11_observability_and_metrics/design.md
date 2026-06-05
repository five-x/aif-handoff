# Design - 11_observability_and_metrics

## Chosen design

Add a shared guardrail observability helper and wire it into existing guard paths.

The helper should live in `packages/shared/src/guardrailObservability.ts` and export:

- the exact counter names from the task as stable constants;
- allowed action values: `blocked`, `rework`, `manual`, `fail_closed`, `accepted`, `rejected`;
- a normalized event shape with required keys: `taskId`, `projectId`, `stage`, `workflowKind`, `runtimeProfileId`, `runtimeId`, `providerId`, `toolName`, `artifactPath`, `fingerprint`, `failureFingerprint`, `action`, and `reasonCode`;
- `buildAgentGuardrailMetric(counter, event)` returning a sorted, redaction-safe structured log envelope with `metricKey: counter`, `metricValue: 1`, and dimensions;
- `formatAgentGuardrailActivityLine(counter, event)` returning a compact readable line for `agentActivityLog`;
- sanitizers that keep ids, stages, status names, paths, hashes, counts, and reason codes, but drop provider diagnostic bodies and secret-like text.

Use structured Pino logs as the counter carrier, matching the existing requirements lifecycle metric pattern. This avoids a new table and keeps metrics scrape/log-pipeline friendly.

Use task activity as the operator-facing readable log. All writes through `appendTaskActivityLog` remain redacted by existing data-layer redaction.

Use `recordTaskStageArtifactAttempt` only for evidence/attempt-related guard events:

- invalid manifest rejection;
- same-failure fail-closed;
- runtime recovery no-delta;
- operator verified completion accepted/rejected;
- prompt contract missing when it blocks artifact acceptance;
- write-path denied or tool-loop blocked when the event is tied to a concrete artifact path.

Do not force every counter into timeline storage. Pure runtime/activity events remain activity plus structured metric unless they are evidence-related.

Diagnostic guardrail attempts must use only the existing schema vocabulary:

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

The `guardrail_event` kind must not replace existing artifacts such as `research`, `design`, `qa`, `acceptance`, `test_result`, `delta_guard`, or `failure_fingerprint`. It is diagnostic metadata only. Implementation tests must prove adding this attempt changes timeline readback but does not change task status, queue status, QA/acceptance freshness checks, or artifact gate state.

Path handling is conservative:

- Normalize path separators to `/`.
- Apply provider-text redaction before storing or logging.
- If a path is absolute and can be proven under the project root, store only the relative path.
- If a path is absolute and cannot be proven under the project root, store `[external-path]`.
- If a path is relative but escapes the project with `..`, store `[external-path]`.
- Redact secret-like path segments, including `.env*`, private-key names, token/key/secret/password segments, and segments already redacted by provider-text redaction.
- Never store raw provider diagnostic text, command output, full error bodies, URLs, emails, or opaque runtime payloads in path, metric, activity, or timeline metadata.

Each guard has one authoritative counter/activity owner:

- Runtime adapters may emit runtime events with sanitized metadata, but do not log counters.
- The agent runtime event bridge logs counters/activity for runtime-originated task events because it has task/project/profile context.
- Implementer/coordinator/API services log counters/activity only for guard decisions they directly own.
- Shared helpers only build sanitized payloads; they do not emit counters by themselves.

## Guard mapping

- `agent_tool_loop_blocked_total`: emitted from the agent runtime event bridge when it receives `repeated_tool_loop_blocked`; action `blocked`; reason code `repeated_tool_loop_blocked`.
- `agent_write_path_denied_total`: qwen emits a neutral sanitized runtime event for `write_path_not_allowed`; the agent event bridge is the authoritative counter/activity owner; action `blocked`; reason code `write_path_not_allowed`.
- `agent_checklist_incomplete_block_total`: emitted from implementer checklist hard stop; action `blocked`; reason code `implementation_checklist_incomplete`.
- `agent_invalid_manifest_rejected_total`: emitted when implementation manifest validation rejects the manifest; action `rework` or `fail_closed` depending on the existing branch; reason code from manifest issue codes.
- `agent_same_failure_fail_closed_total`: emitted from coordinator/API same-fingerprint fail-closed paths; action `fail_closed`; reason code `same_failure_fingerprint`.
- `agent_split_required_decision_total`: emitted when planner creates/reuses a split-required proposal and blocks for manual routing; not emitted for split proposal approval/rejection; action `manual`; reason code `split_required`.
- `agent_prompt_contract_missing_total`: emitted when result/prompt contract validation reports `missing_aif_result_contract`; action `blocked` or `rework` based on existing branch.
- `agent_runtime_recovery_no_delta_total`: emitted from coordinator no-delta recovery guard; action `fail_closed`; reason code starts with `runtime_recovery_no_delta`.
- `agent_operator_verified_completion_accepted_total`: emitted on successful operator verified completion; action `accepted`; reason code `operator_verified_completion`.
- `agent_operator_verified_completion_rejected_total`: emitted from the reject helper; action `rejected`; reason code parsed from existing rejection strings.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: create `research.md`, `design.md`, and `plan.md`; inspect local source/docs; record hypotheses, scope, and verification plans.
- Not allowed before `PLAN PASS`: implementation edits, runtime-visible probing, service checks, log inspection, endpoint checks, downstream runtime/config reads, or shared-memory recall.

## Decision candidates

- Guardrail observability should reuse structured log metrics, task activity, and task-stage attempts instead of new persistent counter storage.
- Guardrail event dimensions should be standardized and redaction-safe across runtime, agent, and API paths.
- Evidence-related guard events should be visible through existing workflow timeline attempts.
