# Design: Roadmap Audit Decomposition Ordered E2E

## Scope

Implement an ordered audit-roadmap hardening layer over existing broad audit decomposition and trusted artifact lifecycle paths.

In scope:

- Make generated audit child card contracts explicit and validation-backed.
- Enforce child execution order for audit roadmap report cards in queue/scheduler advancement.
- Preserve final synthesis gating on trusted child reports or accepted terminal inconclusive outcomes.
- Add focused local tests for classification, generation/import contracts, order gating, deterministic plans, and synthesis fail-closed behavior.
- Run required local gates and then remote-only positive/negative e2e after plan approval.

Out of scope:

- Weakening audit report validation, source snapshot, ledger-only trusted mode, committed blob lifecycle, or synthesis classifier trust rules.
- Accepting raw report text as trusted evidence.
- Editing `docs/kb/windows-codex-bootstrap-validation.md`.
- Creating or executing follow-up implementation task cards.

## Proposed code changes

1. Shared audit card contract

- Add a canonical audit child order/lifecycle requirement string in `packages/shared/src/auditRoadmapContract.ts`.
- Extend required generated card markers and validation so audit cards must include:
  - `Task intent: audit`
  - `Expected report artifact: <audit/*.md>`
  - `Allowed write paths: <same artifact only>`
  - `Dependency order: ...`
  - `Trusted artifact lifecycle: manifest, ledger evidence, source snapshot, git commit, committed blob revalidation, artifact_state_valid`
- Keep legacy `Report artifact:` parsing as the source of the artifact path so existing direct audit contract code remains stable.

2. Roadmap generation and extraction

- Update deterministic fallback card generation and prompt templates in `packages/api/src/services/roadmapGeneration.ts` to include the explicit contract lines.
- For generated source report cards, include deterministic dependency/order text derived from sequence:
  - first source card has no predecessor;
  - later source cards depend on the immediately previous source audit card;
  - synthesis depends on all source report cards reaching trusted valid or accepted terminal inconclusive/manual-exception states.
- Keep phase/sequence sorting unchanged and continue to create exactly one synthesis card.

3. Queue/scheduler order enforcement

- Add data-layer helpers in `packages/data/src/index.ts` to determine whether an audit roadmap report task has unfinished predecessor report children in the same batch.
- Filter `nextBacklogTaskByPosition()` and `listDueScheduledTasks()` so out-of-order audit roadmap report children do not advance while a predecessor report child is not terminal.
- Guard `claimBacklogTaskForAdvance()` with the same predecessor check so manual scheduler/auto-queue races fail closed.
- Define predecessor release with the same trusted-artifact semantics used for synthesis readiness:
  - release when the predecessor report artifact is trusted valid according to roadmap artifact validity/trust checks; or
  - release when it is an accepted terminal inconclusive/manual-exception artifact with persisted machine-readable issue codes and terminal rework status.
- Do not release a successor merely because a predecessor task row is `done`, `verified`, or `blocked_external` if the report artifact is missing, invalid, stale, dirty, untrusted, or lacks accepted terminal inconclusive/manual-exception evidence.
- Do not apply this to synthesis readiness directly; synthesis remains controlled by roadmap batch artifact readiness and existing paused/unpaused logic.

4. Operator visibility

- Prefer existing hierarchy and artifact-trust UI/API surfaces. If the API response already exposes `children` ordered by `hierarchyPosition` and artifact trust, add tests rather than new UI components.
- If the implementation reveals an API gap, keep it small: expose existing order/dependency state through task descriptions/tags and child ordering, not a new broad schema.

## Data and compatibility

- No database migration is planned.
- Ordering is derived from existing persisted task ordering and roadmap batch membership.
- Existing direct audit one-report contracts remain valid.
- Existing artifact state names and trust projection stay unchanged.

## Failure behavior

- Broad direct audit requests still fail before direct execution with `AUDIT_DECOMPOSITION_REQUIRED`.
- Missing or invalid child report artifacts remain untrusted and block final trusted synthesis.
- Source-inconclusive or terminal-inconclusive child reports can release the next child and synthesis only through the existing accepted terminal path with machine-readable issue codes.
- Invalid, missing, stale, dirty, or otherwise untrusted predecessor artifacts do not release later children, even if the predecessor task row has reached a terminal-looking task status.
- Raw source report text remains a blocking/untrusted synthesis input.
- Out-of-order child execution attempts remain in backlog/not advanced instead of starting.

## Verification strategy

Local verification:

- Shared contract/unit tests for explicit generated-card markers and broad/narrow classification.
- API roadmap generation/import tests proving:
  - at least three report cards plus one synthesis card can be produced for stable scopes;
  - imported audit child cards have explicit task intent, expected artifact, allowed write path, dependency order, and lifecycle contract text;
  - synthesis starts paused and has the parent hierarchy relationship.
- Data/agent auto-queue tests proving parallel projects do not advance later audit report children before earlier report children are terminal.
- Planner/plan-checker tests proving deterministic plans include ordered child/source report decisions and still reject broad direct audit plans.
- Synthesis/completion tests for raw/untrusted child evidence fail-closed behavior.

Remote verification after local gates:

- `curl http://192.168.88.67/api/health`
- Remote-only positive e2e with `AIF_SKIP_DEV_SERVER=1`, `AIF_WEB_URL=http://192.168.88.67`, and `AIF_API_URL=http://192.168.88.67/api`, using the requested stable scope set.
- Remote-only negative e2e proving fail-closed behavior for invalid decomposition or child evidence.

## Risks

- Existing worktree modifications overlap likely target files. The implementation must preserve user/pre-existing changes and avoid unrelated cleanup.
- Order enforcement through derived existing columns is less expressive than a full DAG schema, but it is reviewable, migration-free, and sufficient for the required strict ordered child path.
- Remote e2e may expose operational blockers unrelated to local code; those must be recorded explicitly rather than papered over.
