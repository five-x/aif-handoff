# Design

## Chosen design

Add an implementer-side fail-closed manifest finalization step before `taskPatch.implementationManifestJson` can be populated.

The finalization step will:

- Treat missing required development manifests as invalid evidence. The implementer must not create accepted `implementationManifestJson` through deterministic fallback when the agent omitted the required manifest.
- Validate any extracted `implementationManifestJson` against current task, plan, and git-change evidence.
- Return a trusted manifest only when `validation.ok=true`.
- Preserve `validation.normalizedJson` only as diagnostic context in logs/activity, not in `implementationManifestJson`.
- If validation fails, block before the final successful task patch is written.
- Use issue codes in `blockedReason`: `implementation_manifest_invalid: <issueCodes>`.
- Request implementation rework below the implementation evidence rework cap using the same counter policy as the coordinator implementation evidence guard: `retryCount + 1`, capped by `min(bounded maxReviewIterations, AGENT_IMPLEMENTATION_EVIDENCE_MAX_REWORK)`. Below cap, set `status="implementing"`, `manualReviewRequired=false`, `reworkRequested=true`, and `retryCount=nextIteration`.
- After the cap, use `blockedReason="implementation_manifest_invalid_after_rework_limit: <issueCodes>"`, `manualReviewRequired=true`, `reworkRequested=false`.

The explicit repair behavior that upgrades invalid extracted agent output into deterministic fallback accepted evidence will be removed or bypassed. Deterministic implementation manifest fallback will not be used as accepted evidence for missing required manifests. Any diagnostic normalized JSON may appear only in logs/activity, not in the trusted task field.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: static local file inspection, planning artifacts, and independent plan review.
- Disallowed before `PLAN PASS`: runtime checks, test execution, service checks, live endpoint checks, shared-memory recall, or production code edits.

## Decision candidates

- "Implementation evidence finalization must be fail-closed: normalized diagnostics are not trusted evidence unless validator returns `ok=true`."
- "Deterministic fallback must not fill missing required implementation manifests or repair invalid agent evidence into accepted evidence."
