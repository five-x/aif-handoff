# Design

## Chosen design

- Use inferred task intent consistently for evidence gates:
  - In `evaluateTaskCompletionEvidence()`, require `validateImplementationManifest()` for inferred `feature`, `fix`, `docs`, and `tests` tasks during review handoff and completion.
  - In generic data projection, infer workflow kind from persisted fields plus title/description/tags before deciding whether an implementation manifest artifact is required.
- Keep audit weak/discarded findings separate from closure evidence:
  - Preserve existing behavior where weak/discarded findings do not block a valid no-findings audit decision by themselves.
  - Add an evidence-presence guard so `classifyAuditCardDecision()` cannot emit `closed_verified` when either implementation evidence or verification evidence is empty.
- Make acceptance waivers explicit:
  - Extend implementation-manifest acceptance criteria with optional `waiverAuthority` and `waiverEvidenceRefs`.
  - Treat `status: "waived"` as supported only when `waiverAuthority` is non-empty and `waiverEvidenceRefs` resolve to concrete verification evidence with output identity; `knownLimitations` alone is not acceptance evidence.
  - Keep satisfied criteria behavior unchanged.
- Separate TaskDetail queue counts:
  - Add `executionActiveCount` and `queueGatingActiveCount` to `ProjectQueueStateResponse`.
  - Compute `queueGatingActiveCount` with `countActivePipelineTasksForProject()` so the API and UI use scheduler semantics.
  - Compute `executionActiveCount` from non-terminal execution statuses only, excluding backlog.
  - Render TaskDetail rows as separate counts instead of the current ambiguous `Active queue`.

## Pre-PLAN boundary

- Before `PLAN PASS`, only local static source/test review, task framing, design choices, and verification planning are allowed.
- No live server checks, scheduler reads, log reads, endpoint checks, downstream runtime/config reads, shared-memory recall, or implementation changes are allowed before plan review passes.

## Decision candidates

- Inferred development intent should be enough to require implementation-manifest evidence; persisted intent normalization is not required as a prerequisite for blocking unsafe completion.
- A waiver is not acceptance evidence unless it names explicit waiver authority and points to concrete verification evidence.
- Operator UI should distinguish execution-active status counts from scheduler queue-gating counts instead of overloading one `Active queue` label.
