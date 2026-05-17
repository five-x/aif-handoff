# Plan: System TZ Review Security Rework Closure

## Implementation Steps

1. Extend shared review types.
   - Add closure status, severity, location, claim/fix/verification, closure evidence, security coverage, blocker history, and generic rework snapshot fields to `packages/shared/src/types.ts`.
   - Export the new types through `packages/shared/src/browser.ts` and package index if needed.

2. Preserve enriched state in data hydration.
   - Update `parseAutoReviewState` in `packages/data/src/index.ts` to accept legacy minimal payloads and preserve valid optional metadata.
   - Ensure accepted structured review state is redacted or rejects raw secret-like values before those values can be surfaced through task responses.
   - Add or extend data tests for enriched finding metadata, security coverage, blocker history, and generic rework snapshot fields.

3. Update review contract parsing and canonical comments.
   - Extend `packages/agent/src/reviewContract.ts` to parse all required closure classifications.
   - Add canonical output for security coverage.
   - Redact or reject secret-like values in findings, closure evidence, advisories, and security coverage notes before building canonical review comments or `AutoReviewState`.
   - Keep stable ID generation unchanged.
   - Add review contract tests for round-trip behavior and malformed output rejection.

4. Update review gate decisions.
   - Treat `still_blocking`, `new_blocker`, and `manual_review_required` classifications as unresolved blockers.
   - Treat `not_reproducible` like `resolved` only when concrete closure evidence is present.
   - Preserve current manual handoff for omitted previous IDs, malformed output, closure-first new blockers, and risky review without substantive evidence.
   - Add review gate tests for the new statuses.

5. Harden reviewer and rework prompts.
   - Update `packages/agent/src/subagents/reviewer.ts` output instructions to require security coverage, no raw secrets, exact previous IDs, and the expanded closure statuses.
   - Update `packages/agent/src/subagents/implementer.ts` prompt text so rework explicitly receives exact blocker IDs, required evidence, forbidden unrelated changes, and prior attempt digest/path.
   - Preserve existing chat/log redaction behavior and add tests proving review comments with secret-like text are redacted before runtime prompt context.

6. Add generic rework snapshot and no-delta blocking.
   - Update `packages/agent/src/autoReviewHandler.ts` to create snapshots for non-roadmap tasks using changed-file digest metadata.
   - Update `packages/agent/src/coordinator.ts` to block generic no-substantive rework deltas as `blocked_external` with `manualReviewRequired=true`, preserving exact blocker IDs.
   - Keep existing audit/report artifact snapshot behavior intact.

7. Expose blocker history in the UI.
   - Add a compact TaskDetail section or component that renders current blockers, closure history, security coverage, and rework snapshot data from `task.autoReviewState`.
   - Add a focused TaskDetail test.

8. Verify.
   - Run focused tests for changed packages first:
     - `npm.cmd test --workspace=@aif/agent -- reviewContract reviewGate autoReviewHandler coordinator`
     - `npm.cmd test --workspace=@aif/data -- index`
     - `npm.cmd test --workspace=@aif/api -- chat tasks`
     - `npm.cmd test --workspace=@aif/web -- TaskDetail`
   - Run `npm.cmd run lint`.
   - Run `npm.cmd run build`.
   - If focused commands expose command-shape differences, use the nearest existing workspace test commands and record exact outcomes in `result.md`.

## Acceptance Criteria

- Stable finding IDs remain deterministic and prior unresolved blockers survive malformed or incomplete review output.
- Review closure classifications support `resolved`, `still_blocking`, `new_blocker`, `not_reproducible`, and `manual_review_required`.
- Security sidecar output requires explicit coverage of secret leaks, permission/sandbox, unsafe shell/network/file behavior, and dependency/config risks, without raw secret disclosure.
- Secret-like values in review findings, closure evidence, security coverage, task/chat prompt context, and blocker-history UI are redacted or rejected by tests.
- Rework prompts include exact blocker IDs, required evidence, forbidden unrelated changes, and prior attempt digest/path.
- No-substantive rework delta blocks non-roadmap tasks as well as roadmap artifact tasks.
- Same-blocker loops continue to terminalize as `blocked_external` with `manualReviewRequired=true`.
- Task detail UI exposes blocker history from structured state.

## Verification Plan

- Static type/build verification through `npm.cmd run build`.
- Lint verification through `npm.cmd run lint`.
- Focused tests in agent, data, and web packages for the changed behavior.
- Focused API/chat tests for redacted review-comment context and task payload safety where task review state is exposed.
- Independent `TEST PASS` gate after implementation.
- Independent `REVIEW PASS` gate after tests pass.

## Risks And Mitigations

- Risk: adding too much persistence scope could turn into a schema migration. Mitigation: use backward-compatible optional JSON fields in `auto_review_state_json`.
- Risk: richer prompt contract could break fallback review output. Mitigation: keep parser fail-closed and preserve existing fallback/manual handoff behavior.
- Risk: generic no-delta hashing could accidentally block valid metadata-only rework. Mitigation: hash changed-file identity plus preserve explicit blocker IDs and only block when unresolved blockers remain.
- Risk: UI/API/chat overexposes sensitive review text. Mitigation: redact structured review text before persistence where practical, keep chat/log redaction, and add regression tests that secret-like review values are redacted or rejected in contract output, hydrated state, chat prompt context, and TaskDetail rendering.
