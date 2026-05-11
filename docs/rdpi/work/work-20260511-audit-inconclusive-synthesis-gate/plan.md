# Plan - Audit Inconclusive Synthesis Gate

## Implementation steps

1. Add shared synthesis classification.
   - Create `packages/shared/src/auditSynthesisClassifier.ts`.
   - Export classifier types/functions from `packages/shared/src/index.ts`.
   - Include helpers for formatting/parsing a machine-readable source-report outcome block in synthesis artifacts.
   - Add focused tests in `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts`.

2. Wire completion evidence to the shared classification.
   - Add `audit_inconclusive` to `TaskCompletionIssueCode`.
   - Add `auditSynthesisOutcome` to completion evidence output.
   - For audit synthesis tasks, parse the persisted source-report outcome from the synthesis artifact and classify the visible synthesis artifact text.
   - Combine both classifications with source-report outcome precedence so final text cannot claim a stronger result than the source reports support.
   - Emit `audit_inconclusive` when the combined outcome is `inconclusive_batch_evidence`.
   - Add task completion evidence regressions for inventory-only synthesis, final-text/source-outcome disagreement, and substantive no-findings synthesis.

3. Wire roadmap failure-family mapping.
   - Add `inconclusive_batch_evidence` to shared audit failure families.
   - Map `audit_inconclusive` to `inconclusive_batch_evidence`.
   - Update the data package local failure-family union.
   - Add/adjust tests proving the mapping and terminal artifact metadata.

4. Update deterministic synthesis.
   - Import the shared source-report classifier in `packages/agent/src/subagents/implementer.ts`.
   - Add explicit outcome text to deterministic synthesis artifacts.
   - Persist the source-report outcome block in every deterministic synthesis artifact.
   - Preserve source report substantive command evidence for valid no-findings synthesis.
   - Generate `Audit inconclusive` output for inventory-only or weak terminal no-findings batches.
   - Add implementer regressions for six inventory-only source reports and valid substantive no-findings.

5. Confirm review-gate behavior through existing completion-evidence integration.
   - Add a focused review-gate regression proving a synthesis artifact whose visible text claims valid no-findings still blocks when the persisted source-report outcome is inconclusive.
   - Ensure the blocking finding includes `audit_inconclusive`.

6. Confirm coordinator and roadmap artifact state.
   - Add or adjust a coordinator regression where six inventory-only zero-finding source reports produce `inconclusive_batch_evidence` through deterministic output, completion evidence, review gate, and roadmap artifact state.

7. Update RDPI result and intake status only after all mandatory gates pass.

## Verification commands

- `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditSynthesisClassifier.test.ts src/__tests__/taskCompletionEvidence.test.ts src/__tests__/auditRoadmapContract.test.ts`
- `npm.cmd test --workspace=@aif/agent -- src/__tests__/implementer.test.ts src/__tests__/reviewGate.test.ts src/__tests__/coordinator.test.ts`
- `npm.cmd test --workspace=@aif/data -- src/__tests__/index.test.ts`
- `npm.cmd run build --workspace=@aif/shared`
- `npm.cmd run build --workspace=@aif/agent`
- `npm.cmd run build --workspace=@aif/data`
- `git diff --check -- packages/shared/src/auditSynthesisClassifier.ts packages/shared/src/index.ts packages/shared/src/taskCompletionEvidence.ts packages/shared/src/auditRoadmapContract.ts packages/shared/src/__tests__/auditSynthesisClassifier.test.ts packages/shared/src/__tests__/taskCompletionEvidence.test.ts packages/shared/src/__tests__/auditRoadmapContract.test.ts packages/data/src/index.ts packages/data/src/__tests__/index.test.ts packages/agent/src/subagents/implementer.ts packages/agent/src/__tests__/implementer.test.ts docs/rdpi/work/work-20260511-audit-inconclusive-synthesis-gate`

## Review gates

- Independent plan review required before implementation. Required verdict: `PLAN PASS`.
- Independent tester required after implementation. Required verdict: `TEST PASS`.
- Independent final reviewer required after `TEST PASS`. Required verdict: `REVIEW PASS`.
