# Plan - 01_hard_tool_loop_guard

## Acceptance criteria

- Guard is not prompt-only.
- Repeated tool call is physically not executed after the limit is exceeded.
- Limits work for `audit`, `synthesis`, and `implementer`.
- Task does not enter infinite rework after the guard trips.
- `result.md` records the covered tool fingerprints after implementation.

## Implementation steps

1. Harden qwen-local-agent fingerprinting in `packages/runtime/src/adapters/qwenLocalAgent/api.ts`.
   - Add workflow-to-stage normalization.
   - Build a stable fingerprint input with `workflowKind`, `stage`, `toolName`, `cwd`, `normalizedArgs`, `targetPath`, and `allowedWritePaths`.
   - Implement the required normalization rules:
     - paths use `/`, remove leading `./`, and collapse duplicate separators;
     - JSON object keys sort recursively;
     - shell calls include `command`, ordered `args`, and normalized `cwd`;
     - `read_file` includes normalized `path` and range/offset inputs such as `startLine` and `lineCount`;
     - `search_files` includes query, normalized scope/path, regex/case flags, and max-match inputs;
     - `git_status` includes normalized path filter inputs if present;
     - `git_commit` includes normalized staged paths and audit artifact path/state.
   - Preserve audit/report file-state extension for artifact-delta retries.
   - Compute SHA-256 and use the hash as `fingerprint`.
   - Keep the normalized input under an internal diagnostic key.

2. Preserve and clarify special tool limits in `packages/runtime/src/adapters/qwenLocalAgent/api.ts`.
   - Keep stricter special caps for `read_file`, `list_files`, `git_status`, `git_commit`, `finalize_audit_report_manifest`, and `validate_audit_report`.
   - Ensure the blocked branch happens before `executeQwenLocalTool`.
   - Ensure blocked event data includes stage, tool, limit, repeated count, hash, and target/artifact path.

3. Add fail-closed stage classification in `packages/agent/src/stageErrorHandler.ts`.
   - Detect provider status `repeated_tool_loop_blocked`.
   - Format implementer reason as `implementation_tool_loop: <toolName> repeated <count>/<limit>`.
   - Format audit/report reason as `repeated_tool_loop: <toolName> repeated <count>/<limit>; artifact=<path>`.
   - Keep raw provider diagnostics out of persisted blocked reasons.

4. Persist the blocked-loop activity line in `packages/agent/src/subagentQuery.ts`.
   - In the runtime `onEvent` bridge, detect `repeated_tool_loop_blocked`.
   - Log `repeated_tool_loop_blocked: stage=<stage>; tool=<tool>; limit=<limit>; fingerprint=<hash>`.
   - Keep existing audit evidence and usage-limit event behavior intact.

5. Update tests.
   - `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`:
     - update existing repeated-loop assertions for hash + internal fingerprint input;
     - assert blocked attempt has no `tool:result` and no execution side effect;
     - assert required normalization cases for paths, shell args/cwd, read ranges, search scope/flags, and git commit artifact/staged paths;
     - cover `synthesis` repeated limit behavior if not already covered.
   - `packages/shared/src/__tests__/runtimeStagePolicy.test.ts`:
     - keep/adjust audit and synthesis repeated cap assertions.
   - `packages/agent/src/__tests__/stageErrorHandler.test.ts`:
     - add repeated-tool-loop blocked reason tests.
   - `packages/agent/src/__tests__/subagentQuery.test.ts` or a focused nearby test:
     - assert blocked-loop runtime events persist to activity log.

## Verification plan

Run targeted tests first:

```text
npm.cmd test -- --run packages/shared/src/__tests__/runtimeStagePolicy.test.ts
npm.cmd test -- --run packages/runtime/src/__tests__/qwenLocalAgent.test.ts
npm.cmd test -- --run packages/agent/src/__tests__/stageErrorHandler.test.ts
npm.cmd test -- --run packages/agent/src/__tests__/subagentQuery.test.ts
```

Run a post-implementation canary after targeted tests:

```text
npm.cmd test -- --run packages/runtime/src/__tests__/qwenLocalAgent.test.ts -t "canary"
```

The canary must simulate repeated `read_file` or `git_status` attempts and record evidence that the run fails closed, does not hang, does not execute the blocked tool call, does not auto-retry to a larger context/profile, and does not continue a repeated provider session loop. If the final test name differs during implementation, record the exact command and rationale in `result.md`.

Then run broader validation if targeted tests pass:

```text
npm.cmd run build
npm.cmd test
```

If the full suite is too slow or fails for unrelated existing reasons, record exact commands, results, and the smallest trustworthy passing subset in `result.md`.

## Gate plan

- Required plan-review gate: independent `reviewer` must return `PLAN PASS` before implementation.
- Required implementation gate: independent `coder` performs file edits only after `PLAN PASS`.
- Required test gate: independent `tester` runs the verification plan and returns `TEST PASS` or `TEST FAIL`.
- Required final-review gate: independent `reviewer` returns `REVIEW PASS` or `REVIEW FAIL` after `TEST PASS`.

## Scope boundaries

- Do not touch the pre-existing dirty file `docs/kb/windows-codex-bootstrap-validation.md`.
- Do not commit or push unless explicitly requested.
- Do not add prompt-only guardrails as the main solution.
- Do not broaden shell/tool permissions.
- Do not run live runtime canaries or endpoint probes before `PLAN PASS`; after implementation, run the controlled canary described in the verification plan.
- In `result.md`, state that this task covers the AIF-owned `qwen-local-agent` tool loop across workflow stages, not every external runtime adapter.
