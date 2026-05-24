# Plan

## Acceptance Criteria

- Validator returns and persists explicit `evidenceDepth` for the source report, declared risks, and scoped roots.
- Shallow/inventory/generic/reused evidence cannot support trusted `validated_no_findings`.
- Deterministic repair can terminalize as `source_inconclusive` with reason codes, but cannot repair shallow evidence into trusted no-findings.
- Synthesis cannot return `validated_no_findings` when required source reports are shallow or inconclusive.
- Trust/API/UI wording does not call shallow no-findings artifacts trusted/supported.
- Positive no-findings examples with genuine behavior-relevant evidence still pass.

## Implementation Steps

1. Extend shared evidence-depth types and helpers.
   - Add depth reason-code types and JSON-safe assessment interfaces.
   - Add helpers to collect line refs with line text, classify shallow vs behavior-relevant source lines, detect generic inventory/search commands, and detect repeated generic evidence across no-findings risks.

2. Integrate depth into `validateAuditReportArtifact()`.
   - Compute `evidenceDepth` using report text, manifest, scope roots, scope coverage, line refs, command evidence, and ledger units.
   - Add validator issue codes for `shallow_evidence`, `inventory_only_evidence`, `irrelevant_grep_match`, `insufficient_scope_depth`, `reused_generic_evidence`, and `self_reported_command_output` if implemented separately. If self-reported command output is folded into another depth issue, add tests that prove unbound command-output-shaped prose still blocks trusted no-findings.
   - For no-findings reports, require depth support before returning `validated_no_findings` or `substantiveEvidence = true`.
   - Keep findings-present and existing manifest/snapshot/hash checks intact.

3. Persist and consume depth in completion/trust paths.
   - Ensure `taskCompletionEvidence` includes depth failures in evidence blockers and quality issues.
   - Update roadmap artifact trusted-input logic to require persisted depth support for `validated_no_findings` report artifacts.
   - Preserve backwards-compatible handling for older validation details without throwing.

4. Harden synthesis and deterministic repair/review.
   - Make synthesis no-findings classification use depth-aware source evidence so shallow reports count as weak/inconclusive instead of substantive.
   - Confirm deterministic repair acceptance depends on strict validator depth. Add explicit terminal source-inconclusive metadata/reason-code coverage if the strict validator already supplies it.
   - Confirm reviewer deterministic validation uses the same depth-aware result.

5. Add regression tests.
   - Validator: import-only, first class declaration, generic `git grep -n .`, loose grep word match, reused evidence across unrelated risks, shallow manifest mismatch, and positive substantive no-findings.
   - Synthesis: one shallow source report prevents `validated_no_findings` and increments weak/inconclusive counts.
   - Completion/data trust: persisted shallow no-findings artifact is untrusted and surfaces depth reason codes; substantive no-findings remains trusted.
   - Deterministic repair/review: shallow repair output terminalizes or fails as source-inconclusive rather than accepted trusted.

6. Run verification.
   - Targeted shared tests first: `npm.cmd test --workspace=@aif/shared -- auditReportValidator auditSynthesisClassifier taskCompletionEvidence`
   - Targeted data/API/web tests if touched.
   - `npm.cmd run lint`
   - `npm.cmd test`
   - `npm.cmd run build`
   - The intake's two fresh botIntevra audit roadmap E2E canaries are a post-deploy/live-runtime check. Run them only after local gates if the runtime is available and they can be executed without violating the RDPI evidence boundary or current environment limits. The canary checklist must include explicit artifact review proving each source report is either a substantive validated report or an explicit `source_inconclusive` report with depth reason codes.

## Review Gates

- Plan review: independent reviewer must return `PLAN PASS` before implementation.
- Implementation: coding starts only after `PLAN PASS`.
- Test gate: independent tester must return `TEST PASS` after verification.
- Final review: independent reviewer must return `REVIEW PASS` before close-out.
- Memsync: after result write, run local memory sync in `MODE=auto` and report status.

## Open Questions To Resolve During Implementation

- Exact thresholds for very small files should be encoded by positive tests, not by a brittle line-count-only rule.
- If old persisted valid no-findings artifacts lack `evidenceDepth`, trusted status should fail closed for no-findings unless current validation details explicitly prove depth support.
- If adding a separate UI label proves too invasive, existing untrusted trust level plus depth reason codes is sufficient for this task's UI/API wording requirement.
