# Plan: Audit Evidence Provenance Contract

## Implementation steps

1. Add `docs/kb/audit-evidence-provenance-contract.md`.
2. Define the current problem statement and compatibility boundary:
   - markdown validators are containment, not the target proof source;
   - existing inconclusive synthesis behavior is preserved;
   - runtime logging/schema work is deferred.
3. Define domain contracts for `AuditPlan`, `SourceSnapshot`, `EvidenceLedger`, `AuditReportManifest`, `AuditReportClassifier`, and `AuditBatchClassifier`.
4. Document trust invariants for trusted source reports and trusted no-findings claims.
5. Document inventory/discovery evidence as insufficient to prove scoped risk absence.
6. Define classification vocabulary and map it to existing compatibility names/failure families.
7. Document source report artifact and batch state transition rules, including stale rework boundaries and the current `validationDetailsJson` migration bridge.
8. Align the rollout section with the queued sibling cards:
   - `work-20260512-align-source-report-classification` for near-term containment;
   - `work-20260512-structured-audit-report-manifest` for manifest/snapshot binding;
   - `work-20260512-audit-evidence-ledger` for runtime evidence units;
   - `work-20260512-audit-artifact-lifecycle` for attempt history and inconclusive states.
9. Document compatibility and rollout order, separating immediate containment from future runtime/evidence ledger work.
10. Add RDPI `result.md` after implementation and verification.
11. Run memsync auto and update intake status only after `PLAN PASS`, `TEST PASS`, `REVIEW PASS`, and successful local memory review.

## Verification

- Static contract check:
  - confirm `docs/kb/audit-evidence-provenance-contract.md` contains all required domains, invariants, classification vocabulary, state transitions, compatibility handling, rollout order, and immediate/deferred decision boundaries.
- Targeted regression tests:
  - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/auditSynthesisClassifier.test.ts src/__tests__/auditRoadmapContract.test.ts`
- Hygiene:
  - `git diff --check`

## Gate requirements

- Independent `PLAN PASS` before file implementation.
- Independent `TEST PASS` after implementation and verification.
- Independent `REVIEW PASS` after test pass.
- If any gate fails, revise the relevant artifact/change and rerun the invalidated gate.

## Non-goals

- Do not add database tables or migrations.
- Do not add runtime logging or evidence-capture code.
- Do not inspect live worker reports or runtime logs.
- Do not create or execute child implementation tasks in this run.
