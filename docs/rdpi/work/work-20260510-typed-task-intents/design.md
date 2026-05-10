# Design

## Chosen design

Introduce a shared typed task-intent contract in `@aif/shared` and thread it through persistence, API/MCP creation, roadmap generation/import, agent prompts, and evidence gates.

The contract will cover these executable intents:

- `general`
- `audit`
- `feature`
- `fix`
- `spike`
- `docs`
- `tests`

The shared contract will define, per intent:

- decomposition rules
- default `plannerMode`
- default `skipReview`
- default `useSubagents`
- `planDocs` and `planTests` defaults
- whether generated cards may enter the executable backlog immediately
- allowed file-change scope
- evidence requirements
- required planning, implementation, review, and test gates
- planning/implementer prompt guidance

## Intent defaults matrix

These defaults are the implementation target. "Default" means callers may override unless the row says hard constraint. "Generated validation" means roadmap/import generated cards must include enough text to satisfy that requirement before entering the executable backlog.

| Intent    | Decomposition                                                                                                                                               | Defaults                                                                                                                     | Executable backlog                                                         | Allowed file changes                                                                              | Evidence requirements                                                                                                                                    | Required gates                                                                                   | Hard constraints                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `general` | Preserve existing broad roadmap behavior as high-level implementable tasks.                                                                                 | `plannerMode: fast`, `skipReview: true`, `useSubagents: env default`, `planDocs: false`, `planTests: false`, `isFix: false`. | Yes.                                                                       | Normal implementation scope from task text.                                                       | Task-specific acceptance and verification when generated.                                                                                                | Planner and implementer; review/test only when explicit settings require them.                   | None beyond valid task shape.                                                                |
| `audit`   | Produce only diagnostic audit cards plus exactly one synthesis card. No fix, refactor, hardening, test-expansion, deployment, or docs implementation cards. | `plannerMode: full`, `skipReview: false`, `useSubagents: true`, `planDocs: true`, `planTests: true`, `isFix: false`.         | Yes only if diagnostic validation passes. Invalid audit cards fail closed. | Only the named report artifact or synthesis artifact. No source/config/test edits.                | Report artifact path, exact `path:line` or symbol evidence, `Risk:`, `Verification: Command ... output ...`, and git status/add/commit/log verification. | Planner, plan checker, implementation, review, security/review sidecar, completion evidence.     | Diagnostic-only scope, review not skipped, subagents enabled, report-only changes.           |
| `feature` | Decompose broad feature requests into small dependency-ordered implementation cards with acceptance criteria.                                               | `plannerMode: full`, `skipReview: false`, `useSubagents: env default`, `planDocs: true`, `planTests: true`, `isFix: false`.  | Yes.                                                                       | Source, tests, docs, and config only as needed for the feature.                                   | Acceptance criteria plus verification commands and expected behavior.                                                                                    | Planner, plan checker, implementation, review, relevant tests.                                   | Generated cards must not be vague roadmap milestones; they need acceptance and verification. |
| `fix`     | Keep narrow defect-focused cards; preserve reproduction, root-cause hypothesis, patch scope, and regression checks.                                         | `plannerMode: full`, `skipReview: false`, `useSubagents: env default`, `planDocs: false`, `planTests: true`, `isFix: true`.  | Yes.                                                                       | Smallest source/test/docs changes needed for the defect.                                          | Reproduction or observed failure, root cause, regression verification command.                                                                           | Planner, implementation, review, regression tests.                                               | `isFix` must be true; generated cards must include reproduction/evidence.                    |
| `spike`   | Time-box research/design cards; output findings and recommendation, not production implementation.                                                          | `plannerMode: full`, `skipReview: false`, `useSubagents: true`, `planDocs: true`, `planTests: false`, `isFix: false`.        | Yes only when it names a research artifact and time-box/exit criteria.     | Research/design notes and optional small proof-of-concept artifact explicitly named in the card.  | Research artifact path, questions answered, options/tradeoffs, recommendation, and next-step boundaries.                                                 | Planner, review; tests only for explicit proof-of-concept code.                                  | Must not silently become implementation work.                                                |
| `docs`    | Documentation-only or documentation-primary cards with clear source and verification scope.                                                                 | `plannerMode: fast`, `skipReview: false`, `useSubagents: env default`, `planDocs: true`, `planTests: false`, `isFix: false`. | Yes.                                                                       | Documentation and examples; source/test changes only when explicitly needed for docs correctness. | Docs paths changed, source references checked, render/link/lint verification when available.                                                             | Planner, implementation, review; build/test only when docs tooling or source changes require it. | Generated docs cards must name docs target and verification.                                 |
| `tests`   | Focused test work tied to target behavior or regression.                                                                                                    | `plannerMode: full`, `skipReview: false`, `useSubagents: env default`, `planDocs: false`, `planTests: true`, `isFix: false`. | Yes.                                                                       | Tests and test fixtures; source changes only for minimal testability hooks explicitly justified.  | Target behavior, failing/passing command, expected coverage/regression outcome.                                                                          | Planner, implementation, review, test command evidence.                                          | Generated tests cards must not become broad refactors or unrelated source work.              |

Direct API/MCP/web/chat task creation applies these settings as defaults when fields are omitted. Roadmap import applies them as defaults and then validates generated-card requirements. Hard constraints override caller values only where listed above. `isFix` remains backward-compatible: omitted `taskIntent` plus `isFix: true` resolves to `fix`, and explicit `taskIntent: "fix"` persists `isFix: true`.

## Data and API contract

- Add `TaskIntent` and `TASK_INTENTS` to shared types.
- Persist `task_intent TEXT NOT NULL DEFAULT 'general'` in SQLite.
- Add migration version 22 for existing databases.
- Add `taskIntent` to `Task`, `CreateTaskInput`, `UpdateTaskInput`, task rows, summaries, API schemas, MCP schemas, web task creation payloads, and chat create-task actions.
- Keep `isFix` for backward compatibility, but normalize it with `taskIntent`:
  - `taskIntent: "fix"` implies `isFix: true`.
  - legacy `isFix: true` with omitted `taskIntent` infers `fix`.
  - explicit non-`fix` `taskIntent` with `isFix: true` is normalized to `fix` for compatibility rather than storing contradictory task metadata.

## Roadmap generation and import

- Replace the audit-only local `RoadmapIntent` with shared `TaskIntent` inference.
- Allow `general` fallback for current broad roadmap behavior.
- Generate and extract typed task JSON that includes `taskIntent`.
- For audit roadmaps, require only diagnostic audit cards plus exactly one synthesis card; reject generated fix/refactor/hardening/test-expansion implementation cards.
- For feature/fix/spike/docs/tests, add prompt rules that keep decomposition aligned with the intent:
  - feature: small implementation cards with acceptance criteria, verification, and dependency order.
  - fix: narrow defect cards with reproduction and regression checks.
  - spike: time-boxed research/design output, not implementation.
  - docs: documentation changes with appropriate review/verification.
  - tests: focused test work with target behavior, commands, and expected regression outcomes.
- During import, apply intent defaults from the shared contract and add stable tags such as `kind:<intent>`.
- Fail closed on invalid generated cards by throwing `RoadmapGenerationError("VALIDATION_ERROR", ...)`.

## Agent and evidence alignment

- Planner prompt should include intent-specific planning guidance and execution constraints from the shared contract.
- Implementer prompt should include intent-specific allowed-change and evidence requirements.
- Completion evidence should use persisted `taskIntent` first, then fall back to existing text/tag inference for legacy tasks.
- Review gate should use persisted `taskIntent` first for risky audit/review/discovery behavior while preserving existing legacy detection.

## Pre-PLAN boundary

- Before `PLAN PASS`, only local source/docs inspection and RDPI planning artifact edits are allowed.
- No live server checks, live roadmap generation, runtime profile mutation, downstream runtime/config probing, validation-card creation, or shared-memory recall before the plan gate.

## Decision candidates

- The shared intent contract is reusable project knowledge after implementation if tests and review pass.
- The compatibility rule between `isFix` and `taskIntent: "fix"` may be worth documenting in memory after close-out.
