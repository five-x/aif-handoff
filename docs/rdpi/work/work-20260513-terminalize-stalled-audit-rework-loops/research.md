# Research: Terminalize Stalled Audit Rework Loops

## Task framing and lane

- Task ID: `work-20260513-terminalize-stalled-audit-rework-loops`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260513-terminalize-stalled-audit-rework-loops.md`
- RDPI needed: `yes`
- Request: implement a deterministic terminalization guard for audit review/rework loops so repeated unresolved facts stop in a clear blocked state with diagnostics instead of looping until the task-level `maxReviewIterations` limit.

## Accepted planning sources or local facts

- `AGENTS.md` and `.agents/skills/runtask/SKILL.md` require RDPI, independent plan/test/review gates, and scoped updates to only the selected intake task.
- `.agents/skills/rdpi/SKILL.md` requires local repo facts first, planning-only artifacts before `PLAN PASS`, and no shared-memory recall before `PLAN PASS` without explicit waiver.
- `docs/architecture.md:142` describes the auto-review lifecycle as `Review -> request_changes -> Implementing`, driven by structured blocking findings.
- `docs/architecture.md:186` documents `AGENT_AUTO_REVIEW_STRATEGY`; `full_re_review` may keep reworking current blockers, while `closure_first` handoffs on newly discovered blockers after closure.
- `docs/configuration.md:57` documents `AGENT_AUTO_REVIEW_STRATEGY`, but there is no separate same-blocker stall threshold documented today.
- `packages/shared/src/env.ts:105` defaults `AGENT_MAX_REVIEW_ITERATIONS` to `100`; this task explicitly says not to lower that limit.
- `packages/agent/src/autoReviewHandler.ts:140` is the auto-review gate entrypoint. It calculates `currentIteration` and `maxIterations` at `packages/agent/src/autoReviewHandler.ts:149`-`150`, returns max-iteration manual handoff at `packages/agent/src/autoReviewHandler.ts:201`, and otherwise returns rework at `packages/agent/src/autoReviewHandler.ts:247`.
- `packages/agent/src/reviewGate.ts:306` builds structured review decisions and already computes previous/still/new blocker metrics from stable finding ids.
- `packages/agent/src/reviewGate.ts:376` and `packages/agent/src/reviewGate.ts:445` cover fallback and legacy blocking-section paths. They preserve previous blockers in some malformed-output cases, but do not maintain a blocker streak count.
- `packages/agent/src/reviewContract.ts:78` creates stable finding ids from normalized `source:text`; this is the right blocker fingerprint base.
- `packages/agent/src/reviewContract.ts:309` persists `AutoReviewState` with the current iteration and finding list.
- `packages/shared/src/types.ts:30`-`39` define `AutoReviewFinding` and `AutoReviewState`; findings currently store only `id`, `text`, and `source`.
- `packages/data/src/index.ts:447` parses persisted `autoReviewStateJson`, but `packages/data/src/index.ts:486`-`510` currently drops any extra finding metadata. This must be updated if streak metadata is added.
- `packages/agent/src/coordinator.ts:991` handles `manual_review_required` outcomes from the auto-review gate; `packages/agent/src/coordinator.ts:1041` handles `rework_requested`.
- `packages/agent/src/coordinator.ts:448` already detects repeated audit artifact failure signatures for completion evidence guard loops, and `packages/agent/src/coordinator.ts:716` terminalizes those to `blocked_external`.
- `packages/agent/src/subagents/implementer.ts:2114` builds rework context for the implementer. `packages/agent/src/subagents/implementer.ts:2285` skips repeated deterministic audit report repair and falls through to runtime implementation, which can still re-enter review.
- `packages/agent/src/subagents/implementer.ts:2581` clears `reworkRequested` after runtime implementation result persistence; no current guard proves that the expected audit artifact changed before the coordinator sends the task back to review.
- `packages/data/src/index.ts:3181` updates roadmap batch artifact rows and `packages/data/src/index.ts:3195` accepts persisted `contentSha`; this is a suitable baseline for artifact-content delta checks.
- `packages/agent/src/subagents/implementer.ts:1940` writes deterministic audit report repairs and persists `contentSha` for terminal source-inconclusive repairs at `packages/agent/src/subagents/implementer.ts:1963`.
- Explorer subagent `019e215e-386c-7a22-a74a-761a7c9b868e` independently identified the same edit surfaces and noted that the current stable audit failure signature intentionally ignores content SHA, so content/delta diagnostics should be added beside that signature rather than replacing it.
- Independent plan review initially returned `PLAN FAIL` because the first plan only terminalized after repeated review, and still allowed implementation to immediately resubmit unchanged artifacts to review before the stall threshold. The revised design must add a pre-review no-substantive-delta guard.

## Same-project memory

- Local curated memory artifact `docs/memory/tasks/work/work-20260511-audit-review-gate-validator-unification-delta.md` says the auto review gate treats deterministic audit/completion validation as authoritative for risky report artifacts and keeps review-sidecar findings additive.
- Local curated memory artifact `docs/memory/tasks/work/work-20260512-audit-artifact-lifecycle-hypotheses.md` records that retryable invalid/inconclusive source attempts should not silently release terminal synthesis readiness.
- Shared-memory MCP recall was not used before `PLAN PASS` because the repository RDPI boundary forbids shared-memory recall before plan approval unless explicitly waived. Local curated memory documents were sufficient for planning context.

## Cross-project reusable patterns

- No cross-project reusable memory was used. The task is tightly bound to local task lifecycle and audit artifact state code.

## Rejected or stale memory candidates

- Existing docs that describe max-iteration handoff as `done + manualReviewRequired` are not accepted as sufficient for this task, because the selected intake card requires a clear blocked state when same unresolved facts repeat.
- Existing artifact failure signatures remain useful, but changing them to include content hash is rejected because prior lifecycle work intentionally groups the same factual failure independently of incidental content edits.

## Hypotheses

- H1: Persisting a same-blocker streak on each auto-review finding is the smallest deterministic way to group repeated reviewer failures by stable fingerprint.
- H2: A separate environment setting, for example `AGENT_AUTO_REVIEW_STALL_THRESHOLD`, can terminalize repeated blocker loops without changing `maxReviewIterations`.
- H3: For audit/report tasks, diagnostics should include both stable blocker ids and report artifact content hash/attempt context when available, but terminalization should not depend on changing the existing audit failure signature algorithm.
- H4: Coordinator should surface stalled auto-review loops as `blocked_external` with `manualReviewRequired=true`, `reworkRequested=false`, preserved `autoReviewState`, and a blocked reason listing unresolved finding ids/text.
- H5: Fresh blocker progression should not stall the task. A cycle with new blocker ids should reset or start separate streaks for those blockers.
- H6: For roadmap audit/report rework, recording an artifact-content snapshot at `request_changes` and comparing it after implementation is the narrowest way to reject immediate unchanged resubmission while still allowing genuine artifact edits to proceed to review.

## Proposed verification and evidence plan

- Add unit tests around `reviewGate` or `reviewContract` proving streak metadata is carried for repeated blockers and starts over for fresh blockers.
- Add `autoReviewHandler` tests for repeated same-blocker terminalization below `maxReviewIterations`, fresh blocker progression, and successful rework.
- Add a coordinator test proving stalled rework handoff becomes `blocked_external` with clear diagnostics and preserved `autoReviewState`.
- Add a coordinator test proving audit/report rework with the same artifact content hash is blocked before review, and a paired test proving changed artifact content proceeds to review.
- Add env parsing and docs tests/updates for the new threshold.
- Run targeted Vitest suites for `reviewGate`, `autoReviewHandler`, `coordinator`, shared env, and data parsing before broader `npm.cmd test` if targeted checks pass.
