# Plan - 11_observability_and_metrics

## Implementation plan

1. Add shared guardrail observability primitives.
   - Create `packages/shared/src/guardrailObservability.ts`.
   - Export constants, action types, normalized event type, metric builder, activity formatter, and sanitizers.
   - Export the helper from `packages/shared/src/index.ts` and browser-safe exports if tests require it.

2. Add data/agent/API emission helpers.
   - Add small local wrappers where needed to call `log.info(buildAgentGuardrailMetric(...))`.
   - For task-scoped events, append the formatted activity line through existing activity APIs.
   - For evidence-related events, record a diagnostic `task_stage_artifact_attempt` with kind `guardrail_event`, label `Guardrail event`, sanitized summary/metadata, and the exact state/outcome/trust mapping from `design.md`.
   - Add tests proving `guardrail_event` attempts appear in timeline readback but do not satisfy or invalidate existing artifact gates such as research/design/QA/acceptance.

3. Implement path sanitization.
   - Add helper support for `projectRoot`-relative path normalization where the owner has project-root context.
   - Store `[external-path]` for absolute external paths and escaping relative paths.
   - Redact secret-like path segments, including `.env*`, private-key names, token/key/secret/password segments, URLs, emails, and provider-redacted values.
   - Add tests for Windows absolute paths, POSIX absolute paths, UNC paths, escaping `..` paths, `.env` and private-key paths, token-like segments, and provider diagnostic text.

4. Wire required guard paths with one authoritative emission point per event.
   - `subagentQuery.ts`: tool-loop blocked runtime event; write-path denied runtime/tool event if available.
   - `qwenLocalAgent` runtime path: ensure `write_path_not_allowed` emits enough sanitized event data for the agent bridge; runtime must not also emit structured counter metrics.
   - `implementer.ts`: checklist incomplete hard stop and invalid manifest rejection.
   - `coordinator.ts`: same-failure fail-closed, split-required preservation/decision, prompt-contract missing, runtime recovery no-delta.
   - `taskEvents.ts`: API-side same-failure fail-closed and prompt-contract missing completion-evidence paths.
   - `operatorVerifiedCompletion.ts`: accepted and rejected helper paths.

5. Update timeline/readback only through existing storage.
   - Ensure evidence-related guardrail attempts appear in `buildTaskWorkflowTimeline` with sanitized metadata.
   - Add UI copy only if existing generic attempt rows do not render readable guard metadata; avoid new UI surfaces unless tests show readback is unclear.

6. Update docs and RDPI result.
   - Document guardrail counters in `docs/configuration.md` near requirements observability.
   - In `result.md`, list every event name and where it is written.

## Acceptance criteria

- The ten requested counter names are emitted as structured metrics with `metricValue: 1`.
- Every emitted guard event carries the required keys, using `null` for optional unavailable runtime/tool/artifact fields.
- Activity log lines are readable and contain event name, action, stage, reason code, and relevant tool/artifact/fingerprint data.
- Evidence-related guard events appear as existing timeline/artifact attempts through `/tasks/:id/timeline`.
- No raw provider diagnostics, secrets, or command output are included in structured metric dimensions, activity lines, or timeline metadata.
- Existing behavior of the guards remains unchanged except for observability side effects.

## Verification plan

- `npm.cmd --workspace @aif/shared test -- --run src/__tests__/guardrailObservability.test.ts`
- `npm.cmd --workspace @aif/data test -- --run src/__tests__/workflowTimeline.test.ts -t "guardrail|stage artifact gate"`
- `npm.cmd --workspace @aif/runtime test -- --run src/__tests__/qwenLocalAgent.test.ts -t "write_path_not_allowed|repeated_tool_loop_blocked"`
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/subagentQuery.test.ts -t "guardrail|repeated tool-loop|write path"`
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/implementer.test.ts -t "checklist|manifest"`
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts -t "same_failure|runtime recovery|split_required|prompt contract|guardrail"`
- `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts -t "operator_verified_completion|same_failure|prompt contract|timeline"`
- `npm.cmd run build`
- `npm.cmd test`

If focused test names differ after implementation, record the exact substitute commands in `result.md`.

## Reusable patterns

- Use log-backed metric counters for diagnostic events that do not need transactional storage.
- Use task-stage artifact attempts for timeline-visible evidence/attempt events instead of adding one-off tables.
- Keep guardrail dimensions bounded to ids, categories, counts, hashes, paths, booleans, and status names.
