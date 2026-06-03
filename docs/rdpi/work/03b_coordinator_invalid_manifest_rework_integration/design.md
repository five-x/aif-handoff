# Design

## Scope

Modify only:

- `packages/agent/src/coordinator.ts`
- `packages/agent/src/__tests__/coordinator.test.ts`

Create/update RDPI and memory artifacts required by the RDPI workflow. Do not touch the unrelated dirty file `docs/kb/windows-codex-bootstrap-validation.md`.

## Behavior

Add a coordinator helper that recognizes implementer-owned invalid-manifest self-rework:

```ts
function isImplementerInternalManifestReworkState(task: TaskRow): boolean;
```

The helper returns true only when:

- the task is still `implementing`;
- `reworkRequested === true`;
- `manualReviewRequired !== true`;
- `blockedReason` starts with `implementation_manifest_invalid:`;
- `implementationManifestJson == null`.

This intentionally excludes after-cap `implementation_manifest_invalid_after_rework_limit:*` because after-cap state is `blocked_external` and must stay handled by the existing terminal branch.

## Coordinator flow

After `runStageWithTimeout(...)`, `flushActivityQueue(...)`, and `latestTask` reload:

1. Keep the existing operator-cancelled preservation.
2. Keep the existing `needs_input` handling.
3. Keep lifecycle runner-owned status handling unchanged.
4. Keep the existing implementer `blocked_external` branch unchanged and first among implementer terminal/self-owned branches.
5. Add the invalid-manifest self-rework branch after the `blocked_external` branch and before skip-review, reviewer handoff, completion evidence guard, and success reset.

When the branch matches:

- call `clearTaskRuntimeLimitSnapshot(task.id)`;
- append an activity line containing `Implementer requested implementation manifest rework before review handoff`;
- log the preserved state;
- return `false`;
- do not call `updateTaskStatus`;
- do not reset `reworkRequested`, `manualReviewRequired`, `retryCount`, or `implementationManifestJson`.

## Tests

Add coordinator tests near the existing implementer handoff/terminalization coverage:

1. `preserves implementer invalid-manifest rework state without review handoff`
   - mocked implementer writes `status="implementing"`, `blockedReason="implementation_manifest_invalid: missing_implementation_manifest"`, `retryCount=1`, `implementationManifestJson=null`, `manualReviewRequired=false`, `reworkRequested=true`;
   - assert state is preserved, reviewer not called, activity log contains the short-circuit message, and retry count is still 1.

2. `preserves implementer implementation_changed_files_mismatch rework state`
   - same shape with `implementation_changed_files_mismatch`;
   - assert implementing/rework state and reviewer not called.

3. `does not override implementer after-cap invalid-manifest terminal block`
   - mocked implementer writes `status="blocked_external"` and `blockedReason="implementation_manifest_invalid_after_rework_limit: missing_implementation_manifest"`;
   - assert existing terminal behavior is preserved and reviewer not called.

4. `does not treat unrelated implementing status as manifest rework`
   - mocked implementer writes `status="implementing"`, `blockedReason="some_other_reason"`, `reworkRequested=true`, `manualReviewRequired=false`;
   - use a development task (`taskIntent="feature"`) so legacy review-handoff evidence remains observable;
   - assert the manifest self-rework activity message is absent and the state is not swallowed by the new helper. The expected current behavior may be review-handoff evidence blocking due missing implementation manifest, but it must not be the new preservation path.

## Non-goals

- Do not change `validateImplementationManifest`.
- Do not change `validateImplementationManifestForPersistence`.
- Do not add `missing_implementation_manifest` to `IMPLEMENTATION_EVIDENCE_REWORK_ISSUES`.
- Do not restore deterministic implementation manifest fallback as accepted evidence.
- Do not change prompt instructions, operator verified closeout, audit/report artifact validation, or review gate behavior.

## Risks

- A broad `status="implementing"` guard would hide unrelated coordinator states. Mitigation: require the exact invalid-manifest prefix and null manifest.
- Running before the existing `blocked_external` branch could be safe by status mismatch, but preserving the current terminal branch first is lower-risk.
- Activity log tests can be brittle if they compare timestamps. Mitigation: assert only a stable substring.
