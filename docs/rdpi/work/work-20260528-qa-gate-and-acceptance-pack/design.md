# Design

## Task

work-20260528-qa-gate-and-acceptance-pack

## Status

Design complete on 2026-05-29. Implementation has not started.

## Lifecycle Contract

Add a new `qa` task status and coordinator stage. QA is active only when both `AIF_REQUIREMENTS_INTAKE_ENABLED` and a new `AIF_REQUIREMENTS_QA_ENABLED` flag are true. The new flag defaults to false to preserve current behavior.

When QA is disabled, the existing flow remains:

`review -> done -> verified`

When QA is enabled, the automated flow becomes:

`review -> qa -> done -> verified`

The `verified` transition remains human-only through `approve_done`.

## Routing

- Add `qa` to shared status/config/order and runtime stage/profile contracts.
- Add a QA runner to the coordinator pipeline after reviewer.
- In `activePipeline`, change the reviewer `onSuccess` target to `qa` only when QA is enabled.
- Keep the QA stage out of `activePipeline` when QA is disabled.
- Change explicit accepted auto-review routing to use a helper target: `qa` when QA is required, otherwise `done`.
- Change the implementer `skipReview` direct-done path to target `qa` when QA is required.
- Add a final done-handoff guard so any future coordinator path that tries to move directly to `done` while QA is required is rerouted or blocked unless an accepted QA artifact exists.

## QA Artifact Contract

Create `packages/agent/src/subagents/qa.ts` using the research/design stage runner style.

Before prompting the QA runner, build a deterministic mandatory-check inventory. The inventory is part of the runner prompt and parser validation, not a free-form model decision.

Mandatory inventory rules:

- Each `implementationManifest.verificationEvidence` entry becomes a mandatory QA check with stable id `manifest:<verificationEvidence.id>`, command text, original status, and original output hash/summary when present.
- If development completion evidence requires a manifest but no verification evidence exists, synthesize a blocking mandatory check `implementation-manifest:verification-evidence` so a `passed` QA artifact is impossible until the implementation supplies command evidence.
- If a plan manifest exposes required verification/checklist items that are not represented in implementation verification evidence, add stable `plan:<hash>` mandatory checks for those items.
- A `passed` QA artifact must include exactly one result for every mandatory inventory id and every result must be `passed`.
- A `passed` QA artifact with an empty inventory, omitted inventory id, duplicate inventory id, unknown mandatory id, all-optional evidence, failed mandatory result, or skipped mandatory result is rejected.

The runner returns exactly one fenced `aif-qa-artifact` JSON block. Parsed status values are:

- `passed`: mandatory checks passed; records an accepted `qa.md` artifact.
- `failed`: at least one mandatory check failed or was skipped; records a blocked `qa.md` artifact and blocks the task from done.
- `blocked`: QA could not run for operator/environment reasons; records a blocked `qa.md` artifact and blocks the task.

The artifact records:

- command evidence: command, status, mandatory flag, output summary, optional output sha, risk
- skipped checks: id/name, command when available, mandatory flag, reason, risk
- limitations
- rollback notes
- markdown body for `qa.md`

Validation rules:

- exactly one fenced block
- non-empty summary and markdown
- all commands have command text, status, mandatory boolean, and output/risk details appropriate for the status
- all skipped checks have reason and risk
- every mandatory inventory id is present exactly once
- `passed` is rejected if any mandatory command/check is failed, skipped, missing, duplicated, or not declared by the inventory
- `failed` or `blocked` never transitions directly to `done`

## Blocking Behavior

On QA failure or blocked output, keep the task fail-closed by moving it to `blocked_external` with `blockedFromStatus: "qa"` and a QA-specific blocked reason. This is conservative and avoids unbounded automated loops. The persisted blocked QA artifact gives the operator the evidence needed to request changes or retry.

## Acceptance Pack

Use task stage artifacts rather than a new table.

Add shared/data types for a `TaskAcceptancePack` read model and add `acceptancePack?: TaskAcceptancePack | null` to `Task`.

Add data helpers:

- Compute a QA source fingerprint from the current requirements snapshot/waiver id, normalized implementation manifest hash, changed-files digest from the manifest, review comments hash, review iteration count, skip-review flag, auto-review state digest, plan manifest hash, and mandatory-check inventory hash.
- Build an acceptance pack from the current task, requirements snapshot/waiver, implementation manifest/log, review comments/auto-review state, accepted QA artifact metadata, and current stage artifacts.
- Record the generated pack as stage `acceptance`, kind `acceptance`, path `acceptance.md`, state `accepted`.
- Check for accepted QA and accepted acceptance artifacts only when their stored QA source fingerprint matches the current task fingerprint.
- Bind the acceptance artifact to the current QA artifact id, QA attempt number, QA source fingerprint, and acceptance-pack source fingerprint.

Acceptance pack fields:

- covered requirements
- changed files
- review result
- QA result
- limitations
- rollback notes
- readiness for human acceptance
- generated timestamp and source artifact ids

The coordinator records the acceptance artifact immediately before moving a QA-passed task to `done`. The API `approve_done` path checks the same accepted artifacts when QA is enabled; if a task somehow reaches `done` without them, approval is rejected.

When `request_changes` sends a task back to implementation, the later implementation/review state changes the fingerprint. Old QA and acceptance artifacts remain in the timeline as history but no longer satisfy the done or verified gates.

## Queue Semantics

The new status must participate in every queue/active-work query that currently treats `review` as in-flight automated work:

- coordinator candidate selection for `CoordinatorStage = "qa"` returns tasks with `status = "qa"`
- active child rollups count `qa` as active
- active pipeline counts include `qa`
- project queue state `executionActiveCount` includes `qa`
- branch-bound active-task detection includes `qa`
- stale claim cleanup treats `qa` as in-progress
- stale in-progress watchdog recovery includes `qa`
- requirement resume status allows `qa` where downstream requirement answers may need to resume a late-stage task

## UI / Read Model

- Add a QA board column and owner badge.
- Add an `Acceptance` tab in task detail.
- Show acceptance readiness in the overview when an acceptance pack exists.
- In the acceptance tab, display the read-model fields and link them to the artifact/timeline context already exposed by the task/timeline data.
- Avoid new explanatory help text; present the operational state.

## Compatibility

- With `AIF_REQUIREMENTS_QA_ENABLED=false`, current review-to-done behavior is preserved.
- With `AIF_REQUIREMENTS_INTAKE_ENABLED=false`, QA remains disabled even if the QA flag is true.
- No database migration is needed because statuses are text and task stage artifacts are generic.
- New enum literals require TypeScript/UI/test updates.

## Open Decisions Resolved

- Mandatory skipped checks block `passed` because skipped mandatory verification is not equivalent to passed verification.
- Optional skipped checks are allowed only with reason and risk.
- QA failures block externally instead of silently auto-reworking, because the task only authorizes the QA gate and acceptance pack, not a new autonomous rework loop.
- Stale accepted artifacts fail closed by fingerprint mismatch rather than by destructive cleanup, preserving historical timeline evidence.

## Plan Review History

- 2026-05-29: Independent reviewer returned `PLAN FAIL`.
- Revisions added deterministic mandatory-check inventory enforcement, freshness-bound QA/acceptance artifacts, complete queue/watchdog semantics for `qa`, and explicit disabled-mode regression coverage.
