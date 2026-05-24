# Plan

## Implementation plan

1. Add focused regression coverage in `packages/shared/src/__tests__/auditReportValidator.test.ts`.
   - Self-reported reproduction: `risk-auth`, `rg -n "auth" src/config.ts`, output `timeoutMs`, expected non-green no-findings with `trustedNoFindingsSupported: false` and `irrelevant_grep_match`/`shallow_evidence`.
   - Ledger-backed reproduction: same report plus valid manifest and identity-bound `AuditEvidenceUnit`, expected non-green no-findings with the same depth failure.
   - Positive guard: genuinely substantive command output remains accepted when the output line contains auth-relevant source content, and ledger-backed no-findings remains accepted when `outputPreview` is risk-substantive.
2. Update `packages/shared/src/auditReportValidator.ts`.
   - Add helpers that identify search-like command evidence and split command/query text from observed output/evidence text.
   - Make risk-specific command depth use output/evidence text for search-like commands instead of the command string alone.
   - Make `substantiveLedgerUnitsForRisk()` or its risk-concept helper require risk-substantive `outputPreview` for search-like ledger units.
   - Keep existing generic grep, inventory-only, empty-file, source snapshot, content hash, artifact path, ledger identity, scope membership, and synthesis membership checks unchanged.
3. Run focused verification after implementation.
4. Use independent tester and final reviewer gates. If either returns `FAIL`, revise and rerun the invalidated gate.
5. Complete `result.md`, run `$memsync MODE=auto LANE=work TASK_ID=work-20260523-harden-audit-command-query-output-depth`, and update only this task entry in `docs/intake/work_status.json` after local memory review succeeds.

## Acceptance criteria

- A risk-term search query cannot by itself satisfy risk-specific no-findings depth when reported command output is unrelated.
- A search-like ledger unit cannot satisfy risk depth solely through `command.command`; its `outputPreview` must be risk-substantive or the report must cite independent risk-substantive evidence.
- The exact self-reported and ledger-backed bypasses from the intake classify as non-green no-findings and report depth reason codes.
- Existing positive no-findings cases with genuinely substantive command output remain accepted.
- Ledger-backed no-findings acceptance remains possible when the ledger unit is identity-bound and risk-substantive.
- Existing manifest, source snapshot, content hash, artifact path, ledger identity, scope membership, and synthesis membership checks are not weakened.

## Verification plan

- Focused shared validator tests: `npm.cmd test --workspace=@aif/shared -- auditReportValidator`.
- Shared regression sweep for corpus and synthesis trust propagation if validator changes affect shared no-findings behavior: `npm.cmd test --workspace=@aif/shared -- auditSynthesisClassifier auditContractCorpus`.
- Run `npm.cmd run lint` and `npm.cmd run build` unless a narrower failure requires iteration first.
- Independent tester must return `TEST PASS`.
- Independent final reviewer must return `REVIEW PASS`.

## Reusable patterns

- For command-output evidence, validate the observed result body separately from the selector/query. Treat query terms as intent, not as evidence substance.
