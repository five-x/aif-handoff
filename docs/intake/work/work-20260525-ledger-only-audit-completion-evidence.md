# Ledger-Only Audit Completion Evidence

- Task ID: work-20260525-ledger-only-audit-completion-evidence
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-25
- Due: after `work-20260525-trusted-audit-artifact-lifecycle`
- Source: External independent review `operator-supplied external review file aif-independent-code-review-6713a389.md` for commit `6713a389e326cadbeeb5f7c244f491a02ec15c55`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260525-ledger-only-audit-completion-evidence`

## Request

Make trusted audit completion evidence ledger-only in trusted mode. The completion guard must not promote audit completion through legacy text-only evidence, markdown report prose, or live snapshot fallbacks when trusted audit evidence is required.

Introduce or wire an explicit trust mode such as `AuditTrustMode = "diagnostic" | "trusted_artifact"` and ensure trusted mode accepts only a single strict condition:

```ts
trustedAuditArtifact =
  validation.ok && manifestValid && !sourceInconclusive && ledgerValid && committedBlobVerified;
```

Only `trustedAuditArtifact` may make a roadmap audit artifact valid in trusted mode.

## Done When

- `taskCompletionEvidence` no longer uses `legacySubstantiveReportEvidence` to satisfy trusted audit completion.
- Diagnostic mode may surface legacy/text signals for operator visibility, but those signals cannot mark trusted audit state valid.
- Trusted mode fails closed when manifest, ledger, source snapshot, or committed blob verification is missing.
- Reason codes distinguish legacy/text-only evidence from trusted artifact evidence.
- Tests cover legacy evidence true with trusted validator false, missing ledger in trusted mode, placeholder hash, stale snapshot, and committed blob pass.

## Constraints

- Preserve public audit outcome vocabulary: `validated_findings_present`, `validated_no_findings`, and `source_inconclusive`.
- Do not make trusted no-findings impossible; require ledger-backed and committed artifact proof.
- Do not run local AIF service, local browser, or local e2e checks. Runtime/e2e verification is remote-only against `192.168.88.67`.
- This intake card does not execute the task.

## Verification Plan

- Focused tests around `packages/shared/src/taskCompletionEvidence.ts`.
- Validator tests that prove text-only report evidence remains diagnostic and not trusted.
- Data/API tests for roadmap artifact validity and reason-code propagation.
- `npm.cmd test --workspace=@aif/shared -- taskCompletionEvidence auditReportValidator`
- `npm.cmd test --workspace=@aif/data -- index`
- `npm.cmd run lint`
- `npm.cmd run build`
