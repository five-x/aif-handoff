# Route Recoverable Audit Failures To Rework Or Input

- Task ID: work-20260514-route-recoverable-audit-failures-to-rework-or-input
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-14
- Due: unset
- Source: audit-v14 rollout follow-up after deploy `0f02891` and project-goal clarification
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260514-route-recoverable-audit-failures-to-rework-or-input

## Request

Change task lifecycle behavior so recoverable audit plan/report/content failures do not fall into `blocked_external` by default.

The project goal is that a task runs to completion: if the implementation or audit report is incomplete, the card should be enriched with exact failure diagnostics and returned to the same work loop; if external input is missing, the system should ask a concrete operator question and resume after the answer. `blocked_external` should be reserved for true external blockers such as missing access, runtime/provider limits, dirty or unsafe git isolation, missing secrets, or an explicit operator-required decision.

## Done When

- Recoverable audit validator issue codes such as `missing_scope_coverage`, `speculative_audit_claim`, `invalid_report_manifest`, `missing_report_manifest`, `missing_substantive_evidence`, and related report-contract issues route back to `implementing` with `reworkRequested=true` while rework budget remains.
- Deterministic audit repair failures fall through to a normal runtime implementer rework attempt with a structured repair snapshot instead of immediately terminalizing as `manual_review_required`.
- Terminal `manual_review_required` is used only after the configured no-progress or same-blocker guard proves that further local rework is not productive, or when the task truly needs external input.
- Missing external input creates a durable operator question or equivalent waiting state with concrete requested inputs, not a generic block. After the answer is recorded, the task can resume with the new context.
- Plan-quality checks understand source audit cards inside an already decomposed audit batch and do not re-block those child cards for missing broad-audit decomposition.
- Auto-queue continues past terminal historical/manual audit cards without requiring database patches, while preserving `blocked_external` semantics for real external blockers.
- Tests cover audit report validator rework routing, deterministic repair fallback to runtime rework, child audit plan checking inside a batch, operator-input waiting/resume behavior, and preserved external-blocker behavior.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Preserve strict audit validation; do not weaken report, manifest, evidence, or scope checks to make cards pass.
- Preserve true `blocked_external` behavior for access, runtime/provider, permission, and branch/worktree-isolation failures.
- Avoid manual database patch workflows as the normal operator path.
- Keep non-audit task lifecycle behavior compatible unless a shared mechanism is intentionally introduced.

## Notes

- `audit-v14` architecture source card reached `blocked_external` with `manual_review_required` after deterministic repair could not resolve `missing_scope_coverage` and `speculative_audit_claim`.
- `audit-v14` security source card hit the plan-quality guard for `missing_audit_decomposition` even though it is already a child/source card inside a decomposed audit batch.
- Existing project memory states that recoverable audit artifact/content failures map to rework, not `blocked_external`.
- Existing project memory states that `blocked_external` is for external failures: runtime capability/provider limits, branch/worktree isolation, missing access, and operator-required external intervention.

## Links

- Related deploy: `0f02891 fix: harden deterministic audit report repair`
- Related decision: docs/memory/decisions/decision-7e281ad210f9b29c.md
- Related decision: docs/memory/decisions/decision-8a60d30eaec0ac60.md
- Related task: work-20260513-make-audit-report-rework-deterministic-until-valid
- Related task: work-20260513-terminalize-stalled-audit-rework-loops
