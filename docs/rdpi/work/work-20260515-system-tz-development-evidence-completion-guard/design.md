# Design

## Contract

Add a shared `ImplementationManifest` v1 contract for development tasks.

Required top-level fields:

- `version: 1`
- `taskId`
- `intent`
- `planManifestHash`
- `changedFiles`
- `diffSummary`
- `verificationEvidence`
- `acceptanceCriteria`
- `evidenceRefs`
- `planChecklist`
- `reviewClosure`
- `commitEvidence`
- `knownLimitations`

The manifest is a structured task-owned artifact, not prose implementation log evidence. It may include bounded output previews and SHA-256 hashes, but not raw full command output.

## Persistence

Use a narrow task-field persistence slice:

- Add `tasks.implementation_manifest_json` to the shared schema and SQLite bootstrap/migration.
- Expose the field through task rows and shared task DTOs as `implementationManifest`.
- Keep `implementationLog` as human/operator context only.

This avoids introducing a generic evidence table inside this task and preserves the Phase 0 freeze rule that audit evidence storage remains compatibility-only until a dedicated migration task changes it.

## Validation

Create a shared implementation manifest parser and validator.

Validation rules:

- The manifest must be valid JSON with `version: 1`.
- `taskId` must match the task.
- `intent` must match the resolved task intent.
- For plan-manifest-backed plans, `planManifestHash` must match the approved `aif-plan-manifest` block hash.
- Manifest `changedFiles` must match the actual meaningful git-changed files collected by the completion guard.
- Acceptance criteria must be present when the plan manifest declares criteria, and every criterion must have a status plus at least one evidence ref unless it is explicitly waived with a limitation.
- `feature` and `fix` tasks must have at least one passing verification evidence item before terminal completion.
- `fix` tasks must include a regression explanation or be blocked. A warning-only policy can be represented later, but this task should fail closed for missing regression explanation.
- `docs` and `tests` continue to use the existing intent changed-file policy: docs source edits require pre-implementation docs-correctness authorization; tests source edits require explicit testability justification.
- Dirty changed files are allowed only when they are listed in the manifest and are not outside the manifest's changed-file set. Extra dirty files block as unintended uncommitted changes.
- Existing audit/report validation remains unchanged and is not made dependent on the development manifest.

## Completion Guard Integration

Extend `evaluateTaskCompletionEvidence` so it returns development manifest validation evidence and issue codes.

Guard behavior:

- `phase = pre_implementation`: keep existing pre-implementation behavior; do not require implementation manifests.
- `phase = review_handoff` and intent in `feature | fix | docs | tests`: require a valid implementation manifest before moving from implementation to review. Review cannot be used as the first place where changed files, verification, acceptance evidence, or checklist drift are discovered.
- `phase = completion` and intent in `feature | fix | docs | tests`: require a valid implementation manifest and verification evidence before moving to `done` or `verified`.
- `phase = completion` and intent `audit`: keep current audit/report semantics.
- Generic tasks remain governed by existing broad evidence checks and task-specific policies; they are not made strict in this slice.
- Coordinator skip-review paths must still call the guard before marking `done`.
- Non-skip coordinator paths must call the guard before moving implementer success to `review`.
- Human/API transition paths must keep the existing `start_implementation` preflight and add development-manifest validation wherever a direct user transition would advance a development task into `review`, `done`, or `verified`.

## Timeline And Trust Projection

Update generic task-record timeline projection:

- `implementation_manifest` artifact is backed by `implementationManifest`, not `implementationLog`.
- `source_diff`, `test_result`, and `commit_evidence` artifacts derive their backing state from manifest sections.
- `implementationLog` can still appear in metadata or operator context, but it must not create a trusted `implementation_manifest` claim by itself.

## Implementer Prompt And Capture

Update the implementer prompt so development tasks return an `aif-implementation-manifest` JSON block or otherwise populate `implementationManifest`.

The first implementation can store a parsed manifest from runtime output into `implementation_manifest_json` after the implementer run. The completion guard still validates persisted JSON against actual git state before terminal transition.

## Non-Goals

- Do not migrate audit evidence tables.
- Do not add a generic evidence ledger table.
- Do not require audit report tasks to produce development manifests.
- Do not change roadmap batch artifact semantics.
- Do not change commit generation or push behavior beyond recording manifest commit evidence.
