# Design

## Chosen design

Implement Variant B for identical retries and Variant A for mismatched retries.

For `task.status === "done"`, `handleOperatorVerifiedCompletion` should build a stable fingerprint from the incoming operator evidence and compare it with the latest accepted `operator_verified_completion` evidence already attached to the task. If the fingerprints match, return the current task unchanged and mark the result as idempotent. If no accepted evidence exists, or the fingerprint differs, reject with an `operator_verified_completion rejected: reason=already_done...` error before git validation, lifecycle mutation, activity acceptance, or accepted stage artifact recording.

The stable fingerprint should include only terminal evidence fields that define the trusted closeout:

- `commitSha`
- normalized/sorted `changedFiles`
- verification entries as `command`, `status`, and `outputSha256`
- `worktreeClean`
- overridden blockers and blocker override justification

It should exclude volatile or display-only fields such as `acceptedAt`, `dirtyUnrelatedFiles`, and `outputPreview`.

The API route should treat an idempotent ok result as a no-op response. It should return the normal task response, but skip `task:moved` and timeline/trust broadcasts because no state or artifact changed.

For trust rollup, keep timeline completeness unchanged. Adjust only generic rollup selection so terminal trusted evidence outranks unrelated plan-manifest failures for `done`/`verified` tasks. Preferred terminal card evidence order:

1. accepted `operator_verified_completion` stage artifact with supported/trusted claim;
2. accepted/trusted `implementation_manifest`;
3. other accepted/trusted terminal evidence;
4. existing failure-first selector when no terminal trusted evidence exists.

This preserves bad plan artifacts in `/timeline` while ensuring `/artifact-trust`, list cards, and detail cards surface the most relevant terminal evidence.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: static source reading, local documentation review, planning artifacts, and plan-review delegation.
- Not allowed before `PLAN PASS`: runtime-visible endpoint checks, server/service probing, logs, scheduler reads, shared-memory recall, implementation, or test execution that would collect live validation evidence.

## Decision candidates

- Terminal operator closeout retries should be idempotent only when stable evidence fingerprints match.
- User-facing generic trust card summaries should select strongest terminal evidence while timeline projections preserve all artifacts.
- Route broadcasts should reflect mutations; no-op idempotent retries should not emit move/trust/timeline updates.
