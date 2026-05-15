# Surface Audit Trust State And Next Actions

- Task ID: work-20260514-surface-audit-trust-state-and-next-actions
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-14
- Due: unset
- Source: operator confusion during `audit-v14` where source tasks showed `done` but artifacts were untrusted
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260514-surface-audit-trust-state-and-next-actions

## Request

Expose audit artifact trust state, synthesis readiness, and next operator action clearly in API and UI so a `done` task with an untrusted artifact cannot be mistaken for a successful audit conclusion.

## Problem Statement

After the latest audit changes, source tasks may correctly leave the active queue as `done` while their artifacts are `source_inconclusive`, `rejected`, `missing`, or otherwise untrusted. This is technically useful for synthesis accounting, but it is misleading for operators when the primary task card only shows `done`.

In live `audit-v14`, all source cards were `done`, but none produced a trusted valid source report. The final synthesis then blocked, and the visible workflow looked like a repeated failure loop rather than a clear "audit inconclusive because source reports are untrusted" state.

## Done When

- API task responses expose a compact audit rollup for roadmap audit cards:
  - task status;
  - artifact role;
  - artifact state;
  - artifact trust level;
  - failure family and reason codes;
  - latest attempt outcome;
  - whether the card is trusted synthesis input;
  - next suggested action.
- UI task cards display `done / untrusted artifact` distinctly from `done / trusted valid`.
- Roadmap or batch view shows child source report counts by trusted valid, inconclusive, rejected, missing, external blocked, and synthesis pending.
- The final synthesis card explains why it is waiting or blocked:
  - waiting for source artifacts;
  - source artifacts terminal but untrusted;
  - plan-quality failure;
  - report artifact missing;
  - true external blocker.
- Retry actions are contextual:
  - retry source rework when recoverable local issues remain;
  - retry synthesis after deterministic plan fix or source terminalization;
  - ask operator input only when concrete external input is missing;
  - do not suggest blind retry for terminal inconclusive reports.
- Timeline view links artifact claims, evidence units, attempt states, and report paths in one place.
- Tests cover API payload shape and UI rendering for `done+valid`, `done+source_inconclusive`, `done+rejected`, `blocked_external+plan_quality`, `synthesis_not_ready`, and final `audit inconclusive`.

## Forward-Looking Guardrails

- Assume users will read `done` as success. Any untrusted artifact must be visibly marked on the same row/card, not hidden only in timeline.
- Assume future workflow packs will have non-audit artifacts. Keep naming generic enough to reuse `artifactTrust`, `claimOutcome`, and `nextAction`, while preserving audit-specific labels.
- Assume operators need to recover old stuck cards. Include enough identifiers in the UI/API to retry the right card without database access.
- Do not require users to understand internal state names like `source_inconclusive` before seeing the plain-language meaning.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Do not change artifact trust semantics only for display.
- Do not hide strict validation failures behind green `done` badges.
- Keep existing timeline endpoints compatible or versioned if response shape changes.

## Notes

- This task is intentionally separate from synthesis closeout. Even after synthesis is fixed, operators still need to see which source reports were trusted and which were not.
- This should build on artifact claim and evidence timeline work rather than creating a separate audit-only status surface.

## Links

- Related task: work-20260513-add-artifact-claim-evidence-timelines
- Related task: work-20260513-design-generic-artifact-claim-persistence
- Related task: work-20260513-surface-task-hierarchy-in-ui
- Related code: packages/api
- Related code: packages/web
