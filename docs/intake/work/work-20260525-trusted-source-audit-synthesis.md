# Trusted Source Audit Synthesis

- Task ID: work-20260525-trusted-source-audit-synthesis
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-25
- Due: after `work-20260525-trusted-audit-artifact-lifecycle` and `work-20260525-ledger-only-audit-completion-evidence`
- Source: External independent review `operator-supplied external review file aif-independent-code-review-6713a389.md` for commit `6713a389e326cadbeeb5f7c244f491a02ec15c55`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260525-trusted-source-audit-synthesis`

## Request

Change audit synthesis trust propagation so synthesis operates over trusted source audit artifact records, not raw report content or semi-trusted artifact text.

Only source reports that are manifest-valid, ledger-valid, source-snapshot-valid, committed-blob-verified, and trusted by the completion guard may contribute to synthesis findings or trusted no-findings. Required source reports that are invalid, untrusted, missing, or `source_inconclusive` must prevent synthesis from producing `validated_no_findings`.

## Done When

- Synthesis input uses a typed trusted source artifact contract such as `TrustedSourceAuditArtifact`.
- Invalid manifest plus strong prose cannot count as trusted no-findings.
- Missing committed source artifact prevents trusted `validated_no_findings`.
- Mixed valid and invalid required reports cannot synthesize green unless the invalid report is explicitly non-required and excluded by contract.
- Synthesis reason codes identify which required source artifact blocked trust.
- Tests cover invalid manifest, missing committed source, source-inconclusive source report, mixed valid/invalid reports, and all-valid reports.

## Constraints

- Do not weaken existing synthesis membership, hierarchy, or source report classification checks.
- Do not change public outcome names unless a separate migration task approves that change.
- Do not run local AIF service, local browser, or local e2e checks. Runtime/e2e verification is remote-only against `192.168.88.67`.
- This intake card does not execute the task.

## Verification Plan

- Focused tests for `packages/shared/src/auditSynthesisClassifier.ts`.
- Data rollup tests for required/optional source artifact combinations.
- API/UI state tests only if reason-code propagation changes public payloads.
- `npm.cmd test --workspace=@aif/shared -- auditSynthesisClassifier`
- `npm.cmd test --workspace=@aif/data -- index workflowTimeline`
- `npm.cmd run lint`
- `npm.cmd run build`
