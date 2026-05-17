# Design: Source-Backed Memory Knowledge

## Summary

Extend the existing server-owned memory loop in place. `memory_items` remains the product memory source of truth; new fields make each item typed and allow it to carry a bounded JSON claim graph. Approval remains human-reviewed and now also requires source-backed claims. Prompt retrieval still returns approved, clean, non-expired memory only, records usage events, and renders a bounded reference-only memory brief.

## Data model

Add compatibility fields to `memory_items`:

- `item_type TEXT NOT NULL DEFAULT 'architecture_note'`
- `failure_family TEXT`
- `claims_json TEXT NOT NULL DEFAULT '[]'`

The type vocabulary is:

- `decision`
- `failure_family`
- `architecture_note`
- `workflow_contract`
- `regression_pattern`
- `review_learning`
- `runtime_policy`
- `security_policy`

The initial failure-family vocabulary includes:

- `inventory_only_no_findings`
- `stale_rework_evidence`
- `branch_drift`
- `plan_quality_generic`
- `runtime_limit_blocked`
- `review_loop_stalled`
- `no_substantive_rework_delta`

Existing audit failure families may still appear in roadmap artifact state. Memory failure-family records get their own memory-specific vocabulary so the task's known families can be represented without weakening audit validators.

## Claim shape

Each memory item can carry zero or more claims while pending, but approval requires at least one valid source-backed claim or compatible source fields that can be represented as a default claim.

Claim DTO:

```ts
interface MemoryClaim {
  claimId: string;
  type: MemoryItemType;
  status: MemoryClaimStatus;
  text: string;
  sources: MemoryClaimSource[];
  supersedes: string[];
  contradicts: string[];
  lastValidatedAt: string | null;
}
```

Claim source DTO:

```ts
interface MemoryClaimSource {
  kind: "task" | "artifact" | "evidence" | "code" | "memory" | "document" | "commit" | "url";
  taskId?: string;
  artifactId?: string;
  evidenceId?: string;
  memoryId?: string;
  path?: string;
  ref?: string;
  label?: string;
  excerpt?: string;
  observedAt?: string;
}
```

Validation rules:

- Claim text is redacted and bounded like other memory text.
- Every approved claim must have at least one structurally valid source.
- A task source must have `taskId` or `ref`.
- An artifact source must have `artifactId`, `path`, or `ref`.
- An evidence source must have `evidenceId` or `ref`.
- A code source must have `path`.
- A memory source must have `memoryId` or `ref`.
- A document source must have `path` or `ref`.
- A commit source must have `ref`.
- A URL source must have an `http` or `https` `ref`.
- `supersedes` and `contradicts` are bounded string arrays.
- Approval stamps missing `lastValidatedAt` on approved claims with the approval timestamp.

Existing `sourceTaskId/sourceRef` remain compatibility fields. If an old or newly-created item has no explicit claims but does have a task/source ref, the data layer can expose a synthesized compatibility claim so the item can still pass source-backed approval.

## Approval behavior

Approval fails when:

- memory is redaction-blocked;
- there is no source-backed claim and no compatible source ref;
- any claim lacks structurally valid sources.

When an approved item is edited into a blocked redaction state, current behavior already demotes it to pending and clears `approvedAt`; that behavior stays. If claim text or source data is edited, the item remains reviewable through the existing lifecycle event path.

## Memory brief

Keep the existing retrieval path and usage event audit:

- planner, implementer, reviewer, and security review call `buildTaskMemoryContext`;
- chat calls `retrieveApprovedMemoryForPrompt`, `recordMemoryUsageEvents`, and `formatMemoryContextForPrompt`;
- retrieval is bounded by the existing default and max limits;
- retrieval returns only approved, clean, non-expired memory in project/global scope.

Change the rendered prompt block from generic "context" wording into a source-backed memory brief:

- include item type, failure family, scope, summary, tags, expiry, sources, and a bounded list of claims;
- include explicit non-overriding language;
- keep `[memory:<id>]` and add `[claim:<id>]` references;
- keep source details short and structured so the brief remains bounded.

This satisfies the role-specific brief requirement without adding a new source of truth or a second retrieval pipeline.

## API and UI

API:

- accept and return `type`, `failureFamily`, and `claims`;
- validate item type and failure-family vocabulary;
- validate claim/source object shape;
- keep existing routes and status transitions.

UI:

- show item type and failure-family badges;
- show source task/source ref compatibility fields;
- show claim rows with status, type, last validation timestamp, supersedes/contradicts, and task/artifact/evidence/code/memory/document/commit/url source links;
- keep approval disabled for redaction-blocked and sourceless items, with the API guard as the fail-closed boundary.

The UI does not need to implement a full claim graph editor in this slice. API and candidate generation provide the source-backed fields; the review UI exposes them for operator inspection.

## Documentation

Update existing memory docs only:

- `docs/api.md` memory payload and usage/lifecycle notes;
- `docs/architecture.md` memory model and prompt brief wording;
- `docs/configuration.md` AIF memory description if needed.

No `.aif-knowledge/` export is added.

## Risks and mitigations

- Risk: Adding a new table could over-model the slice. Mitigation: use JSON compatibility fields on `memory_items` for claim graph data while retaining the existing lifecycle/usage tables.
- Risk: Source-required approval may break old manual memory tests. Mitigation: update tests and create default claims for task-sourced candidates.
- Risk: Claim JSON could leak secrets. Mitigation: run claim text and label/ref/path fields through existing memory redaction, include claims in redaction evaluation, and keep blocked approval behavior fail-closed.
- Risk: Prompt blocks grow too large. Mitigation: cap retrieved item count, cap item content, and render only a bounded number of compact claims per item.

## Acceptance mapping

- Memory item types: shared constants and API validation.
- Memory claims: shared DTOs, schema JSON, data normalization, API response.
- Memory without sources cannot be approved: data-layer approval guard and API test.
- Redaction-blocked memory cannot be approved: existing guard retained and claim text included in redaction evaluation.
- Known failure families can be represented: shared constants, item field, API/data tests.
- Memory briefs are reference-only, bounded, source-backed, usage-audited, and non-overriding: retrieval/formatting update plus existing usage events.
- UI shows memory links: Memory Review dialog displays compatibility sources and claim sources.
