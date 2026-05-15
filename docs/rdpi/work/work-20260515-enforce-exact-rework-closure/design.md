<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Design

## Chosen design

Enforce completion as a success-only state in the agent coordinator:

- Keep `done` for accepted review plus passing completion evidence.
- Move unresolved manual-review outcomes to `blocked_external` with `manualReviewRequired=true`.
- Change roadmap source-report inconclusive terminalization from task `done` to `blocked_external` while preserving artifact `source_inconclusive` diagnostics.
- Preserve exact unresolved finding IDs in `blockedReason`, `autoReviewState`, artifact validation details, and activity log.
- Keep audit/report validators strict and additive; do not downgrade validation failures into successful completion.

## Rework closure contract

Implementer/editor rework prompts must receive:

- exact blocking finding IDs from `autoReviewState.findings`
- prior failed context from `reviewComments`, `blockedReason`, and rework snapshot
- required closure conditions for each finding
- self-check instructions before review handoff

Reviewer prompts must:

- compare current output against prior finding IDs
- mark `resolved` only when the implementation log, diff, artifact validation, or concrete inspected evidence proves closure
- mark unresolved IDs as `still_blocking` with a closure evidence gap

## Audit/report-specific closure

Audit report rework remains validator-backed:

- valid report manifest when required
- bound evidence refs when manifest-backed
- declared scope coverage
- substantive evidence and concrete file/command references
- no placeholder or synthetic verification output

If these fail after rework, the task is blocked/manual, not `done`.

## Compatibility

- No schema migration is needed.
- `blocked_external` plus `manualReviewRequired=true` is the existing operator-visible manual state.
- Artifact timeline state can remain `source_inconclusive` for roadmap reports, but task status changes to blocked/manual.
- Docs that explicitly allow manual handoffs in `done` should be updated.

## Non-goals

- Do not add a new task status.
- Do not weaken audit validators.
- Do not create or execute child tasks.
- Do not change runtime transports or provider behavior.
