# Research: Ledger-Only Audit Completion Evidence

## Task framing and lane

- Task ID: `work-20260525-ledger-only-audit-completion-evidence`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260525-ledger-only-audit-completion-evidence.md`
- RDPI needed: `yes`
- Scope: make trusted audit completion evidence ledger-only in trusted mode. Legacy/text report evidence may remain visible diagnostically but must not mark trusted audit state valid.
- Out of scope: local AIF service, local browser, local e2e, live endpoint checks, scheduler/log probing, and child follow-up task execution.

## Accepted planning sources or local facts

- The task card requires an explicit trust boundary where only a strict trusted audit artifact condition can make a roadmap audit artifact valid in trusted mode. The requested condition is `validation.ok && manifestValid && !sourceInconclusive && ledgerValid && committedBlobVerified`.
- The task card requires tests for legacy evidence true with trusted validator false, missing ledger in trusted mode, placeholder hash, stale snapshot, and committed blob pass.
- Repository instructions require Node commands through `npm.cmd`, RDPI artifacts under `docs/rdpi/<lane>/<task-id>/`, and local repo facts above memory recall.
- Preflight completed with `STATUS: refreshed`; flow audit completed with `STATUS: clean`.
- The prior completed task `work-20260525-trusted-audit-artifact-lifecycle` added lifecycle verification for draft text, valid manifest, worktree validation, committed artifact in `HEAD`, committed blob revalidation, hash equality, and `artifact_state_valid` in `docs/rdpi/work/work-20260525-trusted-audit-artifact-lifecycle/result.md`.
- `TaskCompletionEvidenceInput` has `requireAuditLedgerEvidence` but no explicit trust-mode field in `packages/shared/src/taskCompletionEvidence.ts`.
- `evaluateTaskCompletionEvidence()` passes `requireAuditLedgerEvidence` through to `validateAuditReportArtifact()` and `verifyAuditArtifactLifecycle()` in `packages/shared/src/taskCompletionEvidence.ts`.
- The remaining mismatch is in `packages/shared/src/taskCompletionEvidence.ts`: `substantiveReportEvidence` is currently computed from `auditReportValidation.substantiveEvidence || legacySubstantiveReportEvidence` after validator blocking issue filtering. That allows legacy prose/text heuristics to participate in trusted completion evidence.
- `committedSubstantiveReportAvailable` uses `substantiveReportEvidence` and can bypass the latest implementation-stage activity issue for risky tasks when a committed substantive report exists.
- `validateAuditReportArtifact()` already validates manifests, ledger references, source snapshot identity, manifest content hash, and missing ledger/manifest conditions in `packages/shared/src/auditReportValidator.ts`.
- `validateAuditReportArtifact()` still derives a current git snapshot and uses a live source reader when no manifest snapshot exists. This is acceptable for diagnostic evaluation but not as trusted artifact proof.
- `verifyAuditArtifactLifecycle()` already verifies committed artifact presence, clean artifact path, committed blob revalidation, and worktree/committed hash equality in `packages/shared/src/auditReportValidator.ts`.
- The data layer trust predicate in `packages/data/src/index.ts` already rejects partial and legacy lifecycle stubs by requiring all lifecycle states true, empty lifecycle issues, matching worktree/committed hashes, committed validation ok, and manifest status valid.
- Current tests already cover missing ledger, uncommitted lifecycle evidence, committed blob mismatch, manifest/hash failures, missing manifest, and full committed pass in `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`.
- Current data tests already reject markdown-only, shallow, missing lifecycle, partial lifecycle, and legacy lifecycle trusted-count bypasses in `packages/data/src/__tests__/index.test.ts`.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS` because the RDPI boundary for this task does not permit shared-memory recall before the plan gate.
- Local same-project memory artifacts were read only as repo files. `docs/memory/tasks/work/work-20260525-trusted-audit-artifact-lifecycle-delta.md` contains no promoted facts, decisions, or patterns beyond pointing back to the prior RDPI task.

## Cross-project reusable patterns

- No cross-project reusable memory was consulted. Local repo facts and the prior same-repo lifecycle task were sufficient for planning.

## Rejected or stale memory candidates

- No shared-memory candidates were retrieved.
- Legacy persisted roadmap rows or tests that encode `state: "valid"` without lifecycle evidence are treated as compatibility hazards, not trusted evidence, because the prior lifecycle task intentionally rejects partial/legacy lifecycle shapes.

## Likely implementation touch points

- `packages/shared/src/taskCompletionEvidence.ts`: add `AuditTrustMode`, compute strict trusted artifact state, keep legacy evidence diagnostic-only, and distinguish trusted-vs-legacy reason codes.
- `packages/shared/src/auditReportValidator.ts`: reuse existing manifest, ledger, source snapshot, and lifecycle evidence. Avoid treating live snapshot fallback as trusted proof.
- `packages/shared/src/index.ts`: export the trust-mode type and any trusted artifact evidence type.
- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`: add focused coverage for legacy text evidence in diagnostic mode versus trusted mode, missing ledger in trusted mode, placeholder hash, stale snapshot, and committed blob pass.
- `packages/data/src/index.ts` and `packages/data/src/__tests__/index.test.ts`: only adjust if reason-code propagation needs an explicit trusted/text-only distinction beyond current lifecycle predicates.

## Risks

- Changing `substantiveReportEvidence` semantics globally could break diagnostic/reporting paths that use it as a broad "report looked substantive" signal.
- Trusted no-findings must remain possible when manifest, ledger evidence, source snapshot, validator outcome, and committed lifecycle are all valid.
- The default trust mode must preserve non-roadmap diagnostic behavior while making roadmap audit artifacts trusted-only where completion can update artifact state to valid.
- Some consumers may read only `result.evidence.substantiveReportEvidence`; the design should provide explicit trusted evidence without removing diagnostic visibility.

## Proposed verification scope

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskCompletionEvidence.test.ts src/__tests__/auditReportValidator.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts` if roadmap/API reason-code propagation changes.
- `npm.cmd run lint`
- `npm.cmd run build`
