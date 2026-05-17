# Research

## Task framing and lane

- Task ID: `work-20260515-system-tz-plan-manifest-quality-gate`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260515-system-tz-plan-manifest-quality-gate.md`
- RDPI path: `docs/rdpi/work/work-20260515-system-tz-plan-manifest-quality-gate`
- RDPI needed: yes

The immutable intake request is to add a structured `aif-plan-manifest` layer and deterministic plan quality gate for new full-mode tasks. The gate must reject missing, generic, intent-mismatched, underspecified, or untestable plans; persist structured replan feedback; exhaust replanning with `blocked_external` plus `manualReviewRequired=true`; and expose plan quality status and blocker reasons in the UI.

## Accepted planning sources or local facts

- `AGENTS.md` says this Node/TypeScript repo uses `npm.cmd run build`, `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run dev`. It also makes `docs/rdpi/` the task history source of truth and requires diffable, reviewable changes.
- The task source `C:\Users\apron\Desktop\aif_handoff_system_tz.md` section 5 defines the target `aif-plan-manifest` shape with `version`, `taskId`, `intent`, `scope`, `allowedChanges`, `forbiddenChanges`, `expectedArtifacts`, `acceptanceCriteria`, and `verificationCommands`. It also requires deterministic checks for manifest presence, intent match, explicit scope, testable acceptance criteria, verification commands, allowed-change consistency, non-generic implementation detail, and no audit/spike/docs conversion into feature/fix work.
- `packages/shared/src/planQuality.ts` already owns deterministic plan-quality validation and `TaskPlanQualityError`. Existing checks cover empty plans, missing checklists, placeholder/generic plans, slash-command echoes, thinking markup, task path omission, diagnostic-only audit constraints, audit evidence targets, exclusions, report structure, child-report decisions, and broad audit decomposition.
- `packages/agent/src/subagents/planChecker.ts` is the enforcement point before implementation. It validates existing plans, locally converted plans, deterministic diagnostic fallback plans, and LLM-normalized plans with `evaluateTaskPlanQuality()`.
- `packages/agent/src/subagents/planner.ts` already injects the task intent contract and prior plan-quality feedback into planner context. This is the right prompt point to request a plan manifest for full-mode plans.
- `packages/agent/src/coordinator.ts` already distinguishes `TaskPlanQualityError`, requeues planning for two failures, preserves retry count across replanner success, and blocks after the retry limit. The non-roadmap terminal path currently does not set `manualReviewRequired=true`; the roadmap source-report path does.
- `packages/shared/src/taskIntentContracts.ts` now exposes structured task intent policies, including allowed and forbidden change categories, expected artifacts, verification requirements, memory rules, review rules, and completion rules. The plan manifest validator should reuse these policies rather than duplicating intent semantics.
- `packages/web/src/components/task/TaskDetailHeader.tsx`, `packages/web/src/components/task/TaskDetail.tsx`, and `packages/web/src/components/kanban/TaskCard.tsx` already render manual-review, blocked-reason, runtime-limit, and artifact-trust information. Plan-quality replan feedback is stored as `blockedReason` while the task is in `planning`, so current card/detail displays can miss it unless they look for plan-quality reasons outside `blocked_external`.
- Existing tests cover `planQuality`, `planChecker`, coordinator retry/exhaustion, API task blockers, and task UI surfaces. Focused verification can stay in shared, agent, and web test suites before full build/lint.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: refreshed`; `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.

## Same-project memory

- `docs/memory/tasks/work/work-20260508-harden-planner-replan-loop-delta.md` records validated facts that `planQuality.ts` owns deterministic plan-quality evaluation, `planChecker.ts` enforces it before implementation, `coordinator.ts` requeues for two retries then blocks externally, and `planner.ts` includes prior plan-quality feedback.
- `docs/rdpi/work/work-20260515-system-tz-task-intent-contract-v2/result.md` records the immediately preceding task that introduced structured task intent policy data and changed-file contradiction checks. This task should build on that policy surface.
- `docs/memory/tasks/work/work-20260513-reject-weak-audit-plans-in-plan-checker-hypotheses.md` is a draft/forbidden hypothesis document. Its useful local clue is that audit-specific plan quality should reuse existing audit decomposition logic instead of inventing broadness heuristics, but it is not treated as validated memory.

## Cross-project reusable patterns

- None used. Local repo facts and same-project artifacts were sufficient.

## Rejected or stale memory candidates

- No shared-memory server recall was used before `PLAN PASS`, consistent with the RDPI planning boundary.
- Draft or forbidden memory candidates were not promoted above current source. They were used only as local historical context where they matched current code.

## Scope boundaries and risks

- In scope: shared plan manifest parsing and validation; plan-checker and planner prompt integration; deterministic fallback plan manifest support; coordinator structured feedback and manual-review terminal behavior; focused UI surfacing; tests and RDPI artifacts.
- Out of scope: persistence schema changes for first-class plan manifests, workflow timeline schema changes, implementation manifests, development evidence ledger, runtime service probing, and new child tasks.
- Main compatibility risk: existing fast-mode, test-only, or pre-rollout full-mode plans without manifests must keep passing unless a manifest is present and invalid. The new required manifest should apply to new full-mode tasks and to old full-mode tasks only after they are intentionally replanned under the new plan-quality contract.
- Main safety risk: deterministic fallback plans must not bypass manifest requirements or hide missing evidence. They can only be generated for the existing narrow diagnostic fallback paths and must include a manifest that still passes the same validator.
