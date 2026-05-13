# Research

## Task framing and lane

- Task ID: `work-20260513-plan-b-audit-decomposition-regression-suite`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260513-plan-b-audit-decomposition-regression-suite.md`.
- RDPI needed: yes.
- Request: build a deterministic CI-suitable regression suite for Plan B audit decomposition, stalled rework terminalization, parent/child synthesis behavior, weak-plan rejection, and a non-audit canary.
- Scope boundary: this is an implementation/test-suite task, not an audit-only diagnostic. The suite should prove existing Plan B behavior without broad production rewrites unless a missing test seam is discovered during implementation.

## Accepted planning sources or local facts

- Preflight: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- Flow audit: `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- Test framework is Vitest under package workspaces. Root `npm.cmd test` runs Turbo, and focused workspace commands run package-local `vitest run --configLoader runner` (`package.json:30`, `packages/shared/package.json:17`, `packages/agent/package.json:13`, `packages/api/package.json:13`, `packages/data/package.json:12`).
- Existing implementation surfaces are already present from prior Plan B tasks:
  - audit decomposition classification in `packages/shared/src/auditRoadmapContract.ts:554`;
  - broad direct audit rejection in `packages/api/src/routes/tasks.ts:171`;
  - audit roadmap generation and synthesis prompt requirements in `packages/api/src/services/roadmapGeneration.ts:1169`;
  - weak audit plan rejection in `packages/shared/src/planQuality.ts:351`;
  - plan-checker use of plan quality in `packages/agent/src/subagents/planChecker.ts:54`;
  - stalled auto-review loop terminalization in `packages/agent/src/autoReviewHandler.ts:267`;
  - coordinator blocked-state handling for stalled/no-delta rework in `packages/agent/src/coordinator.ts:609`;
  - roadmap batch artifact readiness in `packages/data/src/index.ts:3137`, `packages/data/src/index.ts:3278`, and `packages/data/src/index.ts:3417`;
  - synthesis output classification and source-outcome metadata checks in `packages/shared/src/auditSynthesisClassifier.ts:81` and `packages/shared/src/auditSynthesisClassifier.ts:313`.
- Existing scattered coverage already exercises parts of the requested suite:
  - shared audit decomposition tests in `packages/shared/src/__tests__/auditRoadmapContract.test.ts:141`;
  - API deterministic audit roadmap generation and conversion tests in `packages/api/src/__tests__/roadmapGeneration.test.ts:385`, `packages/api/src/__tests__/roadmapGeneration.test.ts:430`, and `packages/api/src/__tests__/roadmapGeneration.test.ts:946`;
  - API audit import tests proving full-planning/review audit tasks, paused synthesis, batch artifacts, and report/synthesis artifact paths in `packages/api/src/__tests__/roadmapGeneration.test.ts:1111`;
  - auto-review stalled-loop tests in `packages/agent/src/__tests__/autoReviewHandler.test.ts:216`;
  - coordinator no-substantive-delta tests in `packages/agent/src/__tests__/coordinator.test.ts:2472`;
  - weak broad audit plan tests in `packages/shared/src/__tests__/planQuality.test.ts:108`;
  - roadmap batch synthesis readiness tests in `packages/data/src/__tests__/index.test.ts:588`, `packages/data/src/__tests__/index.test.ts:1053`, and `packages/data/src/__tests__/index.test.ts:1145`;
  - synthesis source metadata tests in `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts:176`;
  - task completion synthesis guard tests in `packages/shared/src/__tests__/taskCompletionEvidence.test.ts:2116`.
- Previous RDPI results are accepted local task history:
  - `docs/rdpi/work/work-20260513-terminalize-stalled-audit-rework-loops/result.md` records same-blocker terminalization and no-substantive-delta behavior plus the focused agent/data/shared commands used.
  - `docs/rdpi/work/work-20260513-split-broad-audit-requests-into-micro-report-cards/result.md` records broad audit decomposition, direct broad audit rejection, child status synthesis text, and terminal-source readiness.
  - `docs/rdpi/work/work-20260513-reject-weak-audit-plans-in-plan-checker/result.md` records audit-specific plan quality hardening and focused shared/agent commands.
  - `docs/rdpi/work/work-20260513-audit-v10-false-valid-regression/result.md` records the false-valid source/synthesis readiness regression class.
- Explorer subagent `019e224c-5338-7a21-8e45-445c3ed6d486` independently found the same test surfaces and called out the main gap: coverage is scattered, and there is no single deterministic regression path or command proving the full Plan B incident classes together.
- Current worktree contains many pre-existing Plan B edits and generated RDPI/memory/intake artifacts. This task must work with them and avoid reverting unrelated changes.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS`, consistent with the RDPI boundary.
- Local `docs/memory/**` artifacts may be useful after implementation for memsync context, but local code and RDPI result files above outrank memory artifacts for this task.

## Cross-project reusable patterns

- No cross-project memory was used. This suite is specific to this repository's audit roadmap, review, and plan-quality contracts.

## Rejected or stale memory candidates

- Generic task hierarchy behavior is not accepted as an implementation target for this task because local research found current parent/child audit behavior is roadmap-batch-specific, and generic hierarchy work is queued separately.
- Live runtime/model calls are rejected for this suite because the intake card prefers deterministic unit/integration tests suitable for normal CI.

## Open questions

- Whether to introduce a new single test file or extend existing scattered tests. The working hypothesis is to add a small dedicated Plan B regression suite that imports stable helpers from existing production modules and data APIs, then run only that suite plus focused existing tests for verification.
- Whether all requested behavior can be proven without production changes. If a stable public seam is missing, implementation should add the smallest exported helper or test fixture needed and cover it immediately.

## Hypotheses

- H1: A dedicated shared regression file can cover audit decomposition classification, weak-plan rejection, synthesis metadata fail-closed behavior, and a non-audit canary without service startup.
- H2: A dedicated API regression file can prove broad audit input is converted into source report child cards plus exactly one synthesis card through deterministic roadmap generation/import surfaces without live model extraction.
- H3: A focused agent regression file can cover fast same-blocker terminalization using the existing mocked auto-review handler pattern.
- H4: A focused data regression file can cover missing, stale-boundary, retryable weak, and explicit terminal child report states through the existing roadmap batch artifact API.
- H5: The documented CI command should be a small set of workspace Vitest commands, not root `npm.cmd test`, because the task asks for normal CI suitability and the existing prior RDPI notes report occasional root Turbo noise.
