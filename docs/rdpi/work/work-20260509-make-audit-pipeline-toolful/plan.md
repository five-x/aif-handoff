# Plan

## Implementation

1. Add optional `supportsRepositoryTools` to runtime capabilities and default it to `false`.
2. Mark `supportsRepositoryTools: true` only for exact runtime/transport paths that own controlled repo tools and emit tool events:
   - `qwen-local-agent` API true,
   - Claude SDK/CLI true,
   - Codex CLI/SDK true only where adapter hooks emit local tool activity,
   - Codex API, Claude API, OpenRouter API, and Codex app-server false for this patch.
3. Require `supportsRepositoryTools` in the implementer workflow, preserving soft `supportsAgentDefinitions` fallback behavior for local Qwen.
4. Require `supportsRepositoryTools` in reviewer/security sidecar workflows.
5. Remove implementer-side deterministic diagnostic report generation and update tests so diagnostic audit plans invoke the runtime.
6. Treat risky audit/review/discovery report artifacts as commit-required even when the prompt did not explicitly say "committed report".
7. Add `missing_implementation_tool_activity` to task completion evidence for risky completion-phase tasks whose latest main implementer block has no `Tool:` entries.
8. Treat runtime capability failures as non-retryable configuration blocks and keep the task in `blocked_external` with a sanitized operator-facing reason.
9. Add/update focused tests for capability gating, completion evidence, and capability-failure stage handling.

## Validation

1. Run targeted tests for:
   - `packages/agent/src/__tests__/implementer.test.ts`
   - `packages/agent/src/__tests__/subagentQuery.test.ts`
   - `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
   - relevant runtime capability tests.
2. Run broader package tests/build if the targeted tests pass.
3. Deploy changed code to server 67 and rebuild/restart affected containers.
4. Configure or verify the botIntevra runtime defaults use the `qwen-local-agent` profile for task/review execution.
5. Delete or ignore the old bad manual audit card and create a fresh audit card.
6. Let the coordinator run it to terminal state.
7. Verify live evidence:
   - activity log contains `Tool:` entries,
   - those `Tool:` entries are inside the latest main implementation-agent block,
   - report artifact exists,
   - required report artifact is committed on the task branch,
   - completion either reaches `done` with evidence or blocks/reworks with explicit findings.

## Gates

- PLAN gate: independent reviewer must return `PLAN PASS`.
- TEST gate: independent tester must return `TEST PASS`.
- REVIEW gate: independent reviewer must return `REVIEW PASS`.

## Close-Out

1. Write `result.md` with local tests, deployment, live audit evidence, and gate verdicts.
2. Run `$memsync MODE=auto LANE=work TASK_ID=work-20260509-make-audit-pipeline-toolful`.
3. Commit code, RDPI artifacts, and memory artifacts.
