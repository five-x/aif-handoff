# Make Audit Report Rework Deterministic Until Valid

- Task ID: work-20260513-make-audit-report-rework-deterministic-until-valid
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-13
- Due: unset
- Source: audit-v13 server card `f2c5db0c-ac36-4db9-9d20-5e1310b2429c` and post-rollout investigation
- RDPI Needed: yes
- RDPI Path: unset

## Request

Harden audit report rework so strict audit report validation is resolved deterministically before a task returns to review.

When review gate reports manifest, evidence ledger, scope coverage, or substantive-evidence failures, implementation must either rewrite the report artifact into a validator-valid state using deterministic evidence collection, or terminalize the task as inconclusive/manual-review-required with the unresolved validator issues. Do not keep routing the same audit report contract failures back to a general LLM implementer loop.

## Done When

- Audit report rework runs the validator after writing the report and before moving back to review.
- Manifest fields such as taskId, roadmapAlias, contentSha256, sourceSnapshot, and evidenceRefs are generated from runtime state, never from prompt examples or placeholders.
- Ledger-bound evidenceRefs are created or reused deterministically for report evidence.
- Directory scope coverage is satisfied with representative existing file citations plus command/tool evidence naming the directory.
- If deterministic repair cannot satisfy the contract, the card terminalizes as source_inconclusive or manual_review_required with exact validator issue codes and artifact path.
- General LLM implementation is not used as the final authority for strict audit report manifest/evidence repair.
- Tests cover repeated same-issue rework, placeholder manifest rejection, successful deterministic repair, and deterministic inconclusive terminalization.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Keep the fix local to audit report repair, completion evidence validation, and implementer/review handoff behavior.
- Preserve existing successful feature implementation and non-audit task flows.
- Preserve independent review and test gates.

## Notes

- The immediate rollout fix `7a789be` preserves rework state and adds stalled/no-delta guards, but it does not fully remove the weak LLM repair path for strict audit report artifacts.
- The audit-v13 server card repeatedly failed with `missing_report_manifest`, `speculative_audit_claim`, `missing_scope_coverage`, and `missing_substantive_evidence` after sidecar review claimed no blockers.
- The last server artifact still contained placeholder manifest values such as `<computed_sha256>` and `<source_snapshot>`, proving this needs deterministic generation rather than prompt-only instruction.

## Links

- Related server card: `f2c5db0c-ac36-4db9-9d20-5e1310b2429c`
- Related rollout: `7a789be feat: harden plan b audit workflow`
- Related task: work-20260513-terminalize-stalled-audit-rework-loops
