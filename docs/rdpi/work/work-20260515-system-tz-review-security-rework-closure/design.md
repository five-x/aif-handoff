# Design: System TZ Review Security Rework Closure

## Approach

Build on the existing review compatibility model instead of replacing it wholesale. The current system already routes review blockers through `reviewComments`, `autoReviewState`, `reviewIterationCount`, and `manualReviewRequired`. This task will enrich that model with structured closure metadata, security category coverage, blocker history, and generic no-delta evidence.

## Data Shape

Extend shared browser-safe types in `packages/shared/src/types.ts`:

- Add `AutoReviewPreviousFindingStatus` with `resolved`, `still_blocking`, `new_blocker`, `not_reproducible`, and `manual_review_required`.
- Add optional finding fields for `severity`, `claim`, `requiredFix`, `verification`, `location`, `decision`, and `closureEvidence`.
- Add security coverage metadata for secret leak checks, permission/sandbox issues, unsafe shell/network behavior, and dependency/config risks.
- Add blocker history entries to `AutoReviewState` so the UI can render current and prior closure decisions without reparsing raw comments.
- Extend `AutoReviewReworkSnapshot` so non-roadmap tasks can record `changedFilesDigest`, `requiredEvidenceByFindingId`, and `forbiddenChanges`.

Persistence remains in `auto_review_state_json` for this task. `packages/data/src/index.ts` will parse and preserve new optional fields while staying compatible with legacy payloads.

## Review Contract

Update `packages/agent/src/reviewContract.ts` so structured sidecar output supports richer previous finding status:

- `resolved` means the reviewer found current-attempt evidence proving closure.
- `still_blocking` means the same blocker remains.
- `new_blocker` means a previous ID exposed a distinct new blocker and should not be silently treated as closed.
- `not_reproducible` means the reviewer could not reproduce the prior blocker and must include concrete inspection evidence.
- `manual_review_required` means automatic closure is unsafe and the original ID must remain visible for operator resolution.

The canonical review comment builder should preserve these classifications in `## Previous Findings` and include security coverage metadata in a deterministic section. Blocking findings should continue to use stable IDs.

## Review Gate

Update `packages/agent/src/reviewGate.ts` so closure-first decisions are classification-aware:

- `still_blocking`, `new_blocker`, and `manual_review_required` keep or create blocking findings.
- `resolved` and `not_reproducible` are accepted only with closure evidence that passes the existing evidence heuristic.
- if previous findings exist but structured output omits any ID, keep the existing manual handoff behavior;
- if prior blockers are closed but new blockers appear under `closure_first`, keep the existing manual handoff behavior;
- deterministic review-gate findings still override reviewer claims.

The same-blocker streak behavior remains in `autoReviewHandler.ts`, but blocker history should make the terminal reason easier to inspect.

## Security Sidecar

Update `packages/agent/src/subagents/reviewer.ts`:

- Keep code-review and security sidecars read-only.
- Require the security sidecar to explicitly report coverage for:
  - secret leak checks;
  - permission/sandbox issues;
  - unsafe shell/file/network behavior;
  - dependency/config risks.
- Require blocking security findings to carry claim, required fix, verification, and severity in the text contract until first-class fields are fully stored.
- Forbid raw secret values in sidecar output. The prompt should require redacted references and existing redaction utilities continue to protect chat/log contexts.

Add code-level containment where structured review state is built or persisted:

- canonical review comments and structured `AutoReviewState` fields must be redacted with existing provider text redaction before they are persisted or rendered;
- security coverage metadata should record that a secret check happened without copying the secret-like token;
- task API, WebSocket, and chat contexts must continue to use redacted task text, and tests should prove review comments containing secret-like values are not forwarded raw through chat/runtime context.

## Rework Closure

Update `packages/agent/src/autoReviewHandler.ts` and `packages/agent/src/coordinator.ts`:

- Rework snapshots should exist for roadmap artifacts as they do today and for generic tasks by hashing the task branch/worktree changed-file list.
- Snapshots should include exact blocker IDs, required evidence by ID, and forbidden unrelated changes.
- The no-substantive delta guard should block when a rework returns to review with the same snapshot digest and unresolved blockers, even when no roadmap artifact is attached.
- Terminal no-delta and stalled-loop outcomes should remain `blocked_external` with `manualReviewRequired=true`.

## UI

Add a compact blocker history panel to `packages/web/src/components/task/TaskDetail.tsx`, backed by `task.autoReviewState`. It should show:

- current review strategy and iteration;
- active blocker IDs, source, severity if present, streak, and last seen iteration;
- closure/history entries when present;
- rework snapshot blocker IDs and baseline digest/path when present.

Do not add a new landing page or unrelated visual treatment.

## Tests

Focused tests should cover:

- review contract parsing and round-trip for new closure statuses and security coverage;
- review contract and state-building redaction/rejection for secret-like values in findings, closure evidence, advisories, and security coverage notes;
- review gate behavior for `not_reproducible`, `manual_review_required`, and `new_blocker`;
- data parser preservation of optional structured review metadata and legacy compatibility;
- data/API payload tests proving enriched `autoReviewState` does not preserve raw secret-like values when persisted through supported paths;
- chat context tests proving review comments are redacted before runtime prompt construction;
- auto-review handler snapshot creation for generic tasks;
- coordinator no-delta blocking for generic rework;
- TaskDetail rendering of blocker history without raw secret-like text.

## Rollout

This is a backward-compatible JSON enrichment. Existing rows with minimal `autoReviewState` remain valid. New UI only renders when structured state is present.
