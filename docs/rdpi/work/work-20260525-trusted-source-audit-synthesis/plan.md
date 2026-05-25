# Plan: Trusted Source Audit Synthesis

## Scope

Implement the trusted source artifact boundary for deterministic audit synthesis and focused tests. Do not run local AIF services, browser checks, or local e2e checks.

## Steps

1. Update `packages/shared/src/auditSynthesisClassifier.ts`.
   - Add typed trusted source artifact and source blocker interfaces.
   - Add additive `reasonCodes` and `blockingSourceArtifacts` fields to `AuditSynthesisOutcome`.
   - Make source synthesis classification aggregate only trusted source artifacts.
   - Fail `validated_no_findings` closed when required source blockers exist.
   - Preserve public outcome names and output parser compatibility.

2. Update deterministic synthesis call sites.
   - Update `packages/agent/src/subagents/implementer.ts` so valid report artifacts become typed trusted source records and terminal non-trusted reports become required blocker records.
   - Preserve weak/invalid report display sections and existing deterministic synthesis artifact text.

3. Update exports and tests.
   - Export new classifier types from `packages/shared/src/index.ts`.
   - Update `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts` and related shared classifier corpus tests to use trusted records.
   - Add focused tests for invalid manifest, missing committed source, source-inconclusive source, mixed valid/invalid required reports, and all-valid reports.
   - Add or update data tests if blocker reason-code propagation needs coverage outside the shared classifier.

4. Verify.
   - Run focused shared classifier tests.
   - Run focused data tests requested by intake.
   - Run lint and build.

## Acceptance Criteria

- Synthesis source classification no longer treats raw report content alone as trusted input.
- Invalid manifest plus strong prose cannot produce trusted `validated_no_findings`.
- Missing committed source artifact prevents trusted `validated_no_findings`.
- Required invalid/source-inconclusive report records block trusted no-findings and identify source artifact reason codes.
- Mixed trusted and invalid required reports do not synthesize green.
- All trusted valid no-findings reports still synthesize `validated_no_findings`.
- Existing synthesis membership, hierarchy, and source report classification checks are not weakened.

## Gate Plan

- Independent plan review must return `PLAN PASS` before implementation.
- After implementation, independent tester must return `TEST PASS`.
- After tester pass, independent reviewer must return `REVIEW PASS`.
- If any gate fails, revise and rerun the invalidated gate.
