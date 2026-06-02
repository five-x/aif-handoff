# Research

## Task framing and lane

- Task: `work-20260602-close-aif-roadmap-blockers`.
- Lane: `work`.
- Intake source: `docs/intake/work/work-20260602-close-aif-roadmap-blockers.md`.
- RDPI needed: yes.
- Goal: close systemic AIF roadmap execution blockers exposed by the `zai-mi` production-like roadmap run without weakening fail-closed production gates or adding paid OpenAI/Codex fallback routing.

## Accepted planning sources and local facts

- Global/project instructions require RDPI, independent plan/test/review gates, and local repo facts before memory.
- Platform preflight returned `STATUS: refreshed`; flow audit returned `STATUS: clean`.
- Current implementation already has partial coverage for the failure pattern:
  - Full-mode manifest prompts and validators: `packages/agent/src/subagents/planner.ts`, `packages/agent/src/subagents/planChecker.ts`, `packages/shared/src/planQuality.ts`.
  - `accept_existing_plan` reads and validates a disk plan before persisting it: `packages/api/src/services/taskEvents.ts`.
  - QA artifact parser and deterministic fallback exist: `packages/agent/src/subagents/qa.ts`.
  - QA/acceptance freshness helpers and acceptance pack persistence exist: `packages/data/src/index.ts`.
  - Container rollup can set parents to `done`: `packages/data/src/index.ts`.
  - Requirements actor question heuristics exist: `packages/agent/src/subagents/requirementsAnalyst.ts`.
  - Qwen-local planner tools are limited to read-only tool names but still expose `run_shell`: `packages/runtime/src/adapters/qwenLocalAgent/api.ts`.
  - Codex adapter sandbox defaults are `workspace-write` unless runtime options/hooks override them: `packages/runtime/src/adapters/codex/cli.ts`, `packages/runtime/src/adapters/codex/sdk.ts`, `packages/runtime/src/adapters/codex/appServer/run.ts`.

## Explorer gate summary

- Independent explorer ran read-only and reported no edits, tests, live endpoint checks, or memory usage.
- Key findings:
  - `normalizeAifPlanManifestForTask` currently leaves malformed JSON manifests unchanged, so repair can still require operator intervention.
  - `accept_existing_plan` validates raw disk plan content and does not attempt deterministic normalization first.
  - Planning write safety is mostly prompt/tool-list level, not a deterministic stage policy for shell or Codex sandbox options.
  - QA fallback is already present but only passes strict implementation-manifest evidence.
  - Container parents are still subject to executable QA/acceptance checks during `approve_done`.
  - Requirements actor heuristics lack explicit internal/test-only short-circuit markers.
  - Acceptance readiness collapses deploy readiness into one boolean/reason.

## Same-project memory

- Not queried before `PLAN PASS` per RDPI boundary.
- Same-project curated memory may be useful after gates only for closeout/memsync, not for deciding current code behavior.

## Cross-project reusable patterns

- Not queried before `PLAN PASS`.
- Local reusable pattern from instructions: keep deterministic gates fail-closed and prefer scoped, reviewable patches over broad automation.

## Rejected or stale memory candidates

- None evaluated before `PLAN PASS`.

## Open questions

- None blocking. The task card is broad, but local code shows concrete edit surfaces for each blocker.

## Hypotheses

- Full-mode and accept-existing-plan failures can be reduced by normalizing/repairing plan manifests before quality evaluation while preserving task-size split rejection.
- Pre-implementation write safety can be hardened by forcing read-only Codex sandbox options and denying write-like `run_shell` commands in read-only Qwen workflows.
- QA missing-block fallback can remain fail-closed by requiring strict fresh passed mandatory evidence and broadening only evidence summaries/metadata, not pass conditions.
- Container parent closeout can skip executable QA/acceptance freshness only when the task is a container and direct children satisfy its closeout policy.
- Requirements intake can avoid irrelevant actor questions by recognizing explicit internal/test-only/operator cards as actor-specified.
- Deploy readiness can be clarified in acceptance pack metadata/markdown without creating an external deployment requirement.
