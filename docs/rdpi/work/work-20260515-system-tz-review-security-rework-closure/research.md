# Research: System TZ Review Security Rework Closure

- Task ID: `work-20260515-system-tz-review-security-rework-closure`
- Lane: `work`
- Intake: `docs/intake/work/work-20260515-system-tz-review-security-rework-closure.md`
- RDPI needed: yes
- Date: 2026-05-16

## Task Framing And Lane

This task must make review, security review, and rework closure structured, stable-id based, and closure-first across workflow types. It is an implementation task, not an audit-only task. It may change runtime code, tests, and UI after `PLAN PASS`.

The immutable intake requires:

- stable review finding IDs with unresolved blockers preserved across auto-review iterations;
- security sidecar output that captures security findings, secret leak checks, permission/sandbox issues, unsafe shell/network behavior, and dependency/config risks;
- rework implementer input scoped to exact blocker IDs and required evidence;
- reviewer closure classifications: `resolved`, `still_blocking`, `new_blocker`, `not_reproducible`, and `manual_review_required`;
- no-substantive rework delta blocking;
- repeated same-blocker fingerprint loops terminalizing to `blocked_external` with `manualReviewRequired=true`;
- UI exposure for blocker history.

## Accepted Planning Sources Or Local Facts

- `AGENTS.md` identifies this as a Node/TypeScript repo and records the real commands: build `npm.cmd run build`, test `npm.cmd test`, lint `npm.cmd run lint`, run `npm.cmd run dev`.
- `docs/kb/system-tz-contract-inventory-freeze.md` is the accepted Phase 0 planning source for this System TZ batch. It freezes current review/security behavior as compatibility state in `review_comments`, `manual_review_required`, and `auto_review_state_json`, and assigns review/security closure changes to this task.
- `docs/kb/system-tz-contract-inventory-freeze.md` also freezes that `api` and `agent` should use `@aif/data` for durable workflow state and that this task should not rename or reinterpret unrelated audit tables in place.
- Current shared review state is in `packages/shared/src/types.ts`: `AutoReviewFinding` has `id`, `text`, `source`, and optional iteration/streak metadata; `AutoReviewState` has `strategy`, `iteration`, `findings`, and optional `reworkSnapshot`.
- Current browser-safe exports in `packages/shared/src/browser.ts` expose `AutoReviewFinding`, `AutoReviewState`, and related types to the web package.
- Current review parsing/building is in `packages/agent/src/reviewContract.ts`. Finding IDs are stable hashes of `source + normalized text`. Structured sidecar output parses `Blocking Findings`, `Advisories`, and `Previous Findings`; previous finding status is only `resolved` or `still_blocking`.
- Current review gating is in `packages/agent/src/reviewGate.ts`. It merges still-blocking previous findings, new structured blockers, deterministic review-gate findings, and preserved strict audit validator blockers. It manual-handoffs malformed/stale structured output when previous findings exist.
- Current auto-review handling is in `packages/agent/src/autoReviewHandler.ts`. It increments review iteration, invokes the review gate, persists `autoReviewState`, records rework snapshots for roadmap report/synthesis artifacts, and terminalizes repeated blocker streaks at `AGENT_AUTO_REVIEW_STALL_THRESHOLD` as manual review.
- Current coordinator handling is in `packages/agent/src/coordinator.ts`. Manual-review outcomes become `blocked_external` with `manualReviewRequired=true`. `blockTaskForNoSubstantiveReworkDeltaIfNeeded` blocks unchanged rework only when `autoReviewState.reworkSnapshot.artifactPath` is present and the artifact SHA is unchanged.
- Current reviewer prompts are in `packages/agent/src/subagents/reviewer.ts`. Code-review and security sidecars share one markdown output contract. The security prompt focuses on auth, validation, secrets, injection, and unsafe shell/file handling, but does not require explicit category coverage for secret leak checks, permission/sandbox issues, unsafe network behavior, or dependency/config risks.
- Current implementer rework prompt is in `packages/agent/src/subagents/implementer.ts`. It includes `REWORK_BLOCKED_REASON`, `FULL_REVIEW_COMMENTS`, and `BLOCKING_FINDINGS_SNAPSHOT`, and instructs the implementer to self-check each blocking ID before review handoff.
- Current task persistence in `packages/data/src/index.ts` parses `auto_review_state_json` and preserves known optional finding metadata and the existing `reworkSnapshot`. Unknown richer metadata is not currently preserved.
- Current task payloads already expose `manualReviewRequired` and `autoReviewState` through data responses and API tests, while update schemas do not expose these fields for arbitrary user mutation.
- Current UI in `packages/web/src/components/task/TaskDetail.tsx` shows a manual-review warning and raw review comments, but no structured blocker history panel. `packages/web/src/components/kanban/TaskCard.tsx` shows a manual review badge and blocked reason, but not blocker history.
- Current tests already cover review contracts, review gate behavior, auto-review handler behavior, coordinator rework outcomes, data parsing of `autoReviewState`, and TaskDetail manual review banners.
- The worktree was dirty before this task, with many existing System TZ and memory changes. This task must preserve those edits and keep changes scoped to review/security/rework closure surfaces.

## Same-Project Memory

- `docs/memory/tasks/work/work-20260515-enforce-exact-rework-closure-delta.md` says unresolved manual-review outcomes should move to `blocked_external` with `manualReviewRequired=true`, exact unresolved finding IDs should be preserved in `blockedReason`, `autoReviewState`, artifact validation details, and activity log, and malformed/stale review closure output should preserve original blocker IDs.
- `docs/memory/tasks/work/work-20260515-enforce-exact-rework-closure-delta.md` also says previous finding closure evidence must include concrete references such as file/artifact references, command output/status, manifest/evidenceRef detail, scope coverage detail, or status-field evidence.
- `docs/memory/tasks/work/work-20260515-harden-audit-report-runtime-rework-delta.md` records that strict validator-valid report artifacts and terminal non-trusted `source_inconclusive` outcomes should be represented explicitly rather than silently trusted.
- `docs/memory/projects/aif-handoff/capsule.md` is a compact project capsule refreshed by the development evidence completion guard task. It does not add task-specific facts beyond current local artifacts.

## Cross-Project Reusable Patterns

- No cross-project reusable memory was needed. Local code, local docs, and same-project curated memory were sufficient.

## Rejected Or Stale Memory Candidates

- No same-project memory contradicted local code. The prior exact rework closure memory is accepted as context, but current local code remains authoritative where behavior has already changed.
- No shared-memory recall was used before `PLAN PASS`; local memory documents on disk were treated as repository artifacts.

## Explorer Gate Summary

The required read-only explorer gate inspected only static repo files and docs. It reported:

- stable IDs mostly exist through `createAutoReviewFindingId`, but previous IDs survive only when structured output echoes exact previous IDs and sources;
- closure classification is too narrow because it supports only `resolved` and `still_blocking`;
- security sidecar output is not structured enough to require secret leak, permission/sandbox, unsafe network, or dependency/config coverage;
- rework prompt carries IDs but lacks typed required evidence per blocker and persisted closure history;
- no-substantive delta blocking is currently audit/roadmap-artifact specific;
- same-blocker loops already terminalize to `blocked_external` with `manualReviewRequired=true`, but classification is mostly free text;
- the UI exposes raw review comments and current manual-review status, but not structured blocker history.

## Planning Hypotheses

- Extending the existing `AutoReviewState` JSON shape is lower risk than introducing a new table in this task because existing task payloads, data hydration, and UI already carry the state.
- Adding optional fields to `AutoReviewFinding` and `AutoReviewReworkSnapshot` can remain backward-compatible if parsers preserve legacy minimal shapes.
- A generic rework snapshot can use task branch/worktree diff identity and reviewed changed files when no roadmap artifact exists, while retaining artifact SHA behavior for audit/report tasks.
- The UI can satisfy blocker-history exposure by rendering current and historical `autoReviewState` metadata in TaskDetail without adding a new endpoint.

## Scope Boundaries

- In scope: shared review types, review contract parser/builder, reviewer prompt contract, review gate closure decisions, auto-review state enrichment, generic rework no-delta guard, data parser preservation, task detail UI blocker history, and focused tests.
- Out of scope: new durable review findings table, full WorkflowTimeline event-sourced migration, WebSocket/MCP complete trust-surface unification, security permission policy beyond review-surface capture, runtime budget governance, and broad schema migrations unless a narrow compatibility field becomes unavoidable.
