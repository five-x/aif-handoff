# Design: Structured Audit Report Manifest

## Scope

Implement the first manifest rollout in the existing shared validator and audit batch artifact pipeline.

In scope:

- Parse a versioned fenced manifest block from markdown reports.
- Validate manifest identity fields against known task, batch, artifact path, source snapshot, outcome, and content hash expectations.
- Validate source line references against a declared Git commit/tree snapshot when present.
- Expose manifest status, manifest version, artifact hash, body hash, and source snapshot binding in `AuditReportValidationResult`.
- Persist content hash and manifest/snapshot validation details through existing roadmap batch artifact fields.
- Downgrade legacy markdown-only no-findings reports so they are not counted as trusted source no-findings.
- Add focused shared/data/agent/API tests around manifest success, contradiction failure, snapshot line-reference drift, and artifact persistence.

Out of scope:

- No new evidence ledger.
- No first-class audit plan table.
- No first-class source snapshot table.
- No first-class source inconclusive lifecycle state migration.
- No UI/API surface expansion beyond existing validation details.

## Manifest format

Use a fenced JSON block so reports remain readable markdown:

````
```audit-report-manifest
{
  "version": 1,
  "auditPlanId": "audit-plan-or-task-id",
  "taskId": "task-id",
  "batchId": "roadmap-batch-id",
  "roadmapAlias": "roadmap-alias",
  "artifactPath": "audit/source.md",
  "contentSha256": "<sha256 of markdown body with manifest blocks removed>",
  "sourceSnapshot": {
    "id": "git:<commit>:<tree>",
    "commit": "<40 hex commit>",
    "tree": "<40 hex tree>",
    "branch": "optional branch name",
    "dirty": false
  },
  "outcome": "validated_findings_present",
  "scopeCoverage": [
    { "root": "src", "covered": true, "evidenceRefs": ["ev-1"] }
  ],
  "riskHypotheses": [
    { "id": "risk-1", "description": "Risk tested", "status": "covered" }
  ],
  "findings": [
    { "id": "finding-1", "evidenceRefs": ["ev-1"] }
  ],
  "noFindingsClaims": [],
  "evidenceRefs": ["ev-1"]
}
```
````

`contentSha256` intentionally hashes the report body after removing manifest block(s), not the full artifact. The validator separately computes `artifactSha256` over the exact full markdown text and persists that to `roadmap_batch_artifacts.content_sha`.

## Validation behavior

The shared validator should add manifest issue codes for:

- missing or unparsable manifest structure when a manifest block is present;
- unsupported manifest version;
- missing required manifest fields;
- task, batch, alias, artifact path, or audit plan mismatch when expected values are provided;
- content hash mismatch;
- outcome mismatch between manifest and deterministic source classification;
- missing or invalid source snapshot binding;
- source snapshot ID mismatch when commit/tree are available;
- source line reference invalid against the declared snapshot.

Expected identity inputs:

- `auditPlanId` rollout rule: until a first-class audit-plan table exists, the expected audit plan ID is `task:<taskId>` for standalone audit artifacts and `batch:<batchId>:task:<taskId>` when a roadmap batch ID is available. A manifest may use the exact expected value only.
- `sourceSnapshot` rollout rule: the validator receives expected source snapshot fields from the artifact validation context when available; otherwise it derives them from the validation root with `git rev-parse HEAD`, `git rev-parse HEAD^{tree}`, and current branch. If Git cannot provide a commit/tree, manifest-backed trusted no-findings cannot pass.
- For batch artifacts, the expected snapshot is the source state restored for artifact validation: task worktree root when `worktreePath` exists, otherwise the task branch after restoration, otherwise the validation root. The manifest's `sourceSnapshot.commit`, `tree`, and `id` must match that expected source snapshot.

Legacy behavior:

- Markdown-only findings can continue through compatibility validation when the deterministic validator finds substantive scoped findings.
- Markdown-only no-findings reports may still expose compatibility evidence, but data-layer trusted batch counting should not count them as trusted `validated_no_findings`.
- A report with a manifest that contradicts expected identity or source state fails closed rather than falling back to markdown heuristics.

## Snapshot semantics

When a manifest declares `sourceSnapshot.commit` or `sourceSnapshot.tree`, source line reference validation reads files from that Git object instead of the live worktree.

Rules:

- `commit` must resolve as a Git commit if provided.
- `tree` must resolve as a Git tree if provided.
- If both are provided, `commit^{tree}` must equal `tree`.
- `sourceSnapshot.id` should match `git:<commit>:<tree>` when both commit and tree are known.
- `dirty: true` is not trusted for source snapshot validation in this rollout unless the report still provides a reproducible commit/tree binding.
- Dirty report artifacts remain governed by existing completion evidence; source snapshot binding is about inspected source state, not whether the report file itself is committed.

The validator should use one source-reader abstraction for all repository source checks:

- referenced path classification;
- line count checks;
- false missing path claims;
- scope root existence and directory representative-file listing;
- existing line evidence refs used by substantive evidence and source classification.

This prevents a report from declaring an older snapshot while still being classified against files that only exist in the current worktree.

## Persistence

Keep using existing schema:

- Store full `artifactSha256` in `roadmap_batch_artifacts.content_sha` on valid and invalid validation updates.
- Store full `auditReportValidation` details under `validationDetailsJson.evidence.auditReportValidation`, including `manifestVersion`, `manifestStatus`, `artifactSha256`, `contentSha256`, and `sourceSnapshot`.
- Pass `roadmapBatchId`, `roadmapAlias`, artifact path, expected audit plan ID, and expected source snapshot from `RoadmapBatchArtifactRow` context into `evaluateTaskCompletionEvidence()` from coordinator, API task events, and review/auto-review paths that already evaluate audit artifacts.
- Update trusted batch counting so `validated_no_findings` requires a valid structured manifest with snapshot binding. Preserve compatibility findings counting for `validated_findings_present`.

## Risk controls

- Avoid a broad schema migration in this task because storage already has `content_sha` and `validation_details_json`.
- Keep the manifest parser strict and JSON-only to avoid new YAML dependencies or ambiguous parsing.
- Do not attempt to backfill existing reports.
- Preserve existing markdown validation tests by adding manifest-backed fixtures where trusted no-findings is required.
