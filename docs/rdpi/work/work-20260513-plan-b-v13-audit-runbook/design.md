# Design

## Chosen design

Create a dedicated operator runbook at `docs/ops/plan-b-v13-audit-runbook.md`.

The runbook will be organized for operators, not implementation owners:

- decision rules for one audit card versus a decomposed parent audit;
- expected shape of decomposed parent, child source reports, and final synthesis;
- what reviewers should report back as unresolved facts during implementation and review loops;
- how to interpret blocked parent and child cards, including `stalled_rework_loop`, `no_substantive_rework_delta`, and `synthesis_not_ready`;
- weak-plan rejection rules and the v13 audit prompt constraints used for validation;
- cleanup and retry procedure for old v10/v11/v12 audit cards.

The dedicated file avoids large edits to `docs/ops/runbook.md`, which is marked as managed. If implementation finds a visible compiler source for `docs/ops/runbook.md`, a small pointer may be added through that source; otherwise the runbook remains a sibling under `docs/ops/`.

## Pre-PLAN boundary

- Before `PLAN PASS`, only planning artifacts under `docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/` may be written.
- No runtime-visible evidence, live endpoint checks, scheduler reads, logs, worker reports, or shared-memory recall are required before `PLAN PASS`.
- The intake card remains immutable task intent.

## Documentation structure

The runbook should use these sections:

1. `Scope`
2. `Operator Model`
3. `One Card Or Decomposed Parent`
4. `Decomposed Parent Shape`
5. `Child Source Report Expectations`
6. `Reviewer Unresolved Facts`
7. `Weak Plan Rejection`
8. `Parent Synthesis Rules`
9. `Blocked Cards And Retry`
10. `V13 Prompt Pack`
11. `Cleanup For V10 V11 V12 Cards`
12. `Operator Checklist`
13. `Source References`

## Cleanup policy design

Legacy cards should not be deleted. Operators should:

- identify old broad single-card audits and mark them as superseded by a new decomposed parent audit through card comments or notes;
- keep old report artifacts as historical context only until they meet the v13 source-report bar;
- retry blocked old child cards only after a substantive report update or corrected plan exists;
- create a fresh decomposed parent audit when old cards cannot be cleanly migrated;
- preserve links from the new parent to old card IDs, old report artifacts, and the reason the old card was not reused.

If the product lacks an explicit obsolete/superseded status, the operator guidance should use the existing semantics: leave blocked/manual-review diagnostics intact, avoid `retry_from_blocked` until the required plan or report delta exists, and record the superseding parent in comments or the audit report.

## Decision candidates

- Broad audit operator procedure: broad audit requests should become decomposed parent audits with independent source report children and one final synthesis, while narrow concrete audit requests may remain one card.
- Legacy audit cleanup procedure: old audit cards are preserved as historical context and superseded by a fresh v13 parent when they fail the new decomposition, evidence, or synthesis standards.
