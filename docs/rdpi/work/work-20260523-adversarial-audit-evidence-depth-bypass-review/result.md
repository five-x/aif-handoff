# Result

## Outcome summary

Diagnostic audit found one confirmed evidence-depth bypass class: risk-specific command output can be accepted as trusted no-findings evidence even when the command output only contains a non-risk-bearing line whose only risk match comes from the query term or command context.

No production code or test code was changed. This task remains diagnostic-only; remediation was queued separately and not executed here.

Follow-up implementation card already queued by Lead:

- `docs/intake/work/work-20260523-harden-audit-command-query-output-depth.md`
- Empty RDPI scaffold created at `docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/`

## Bypass matrix

| Bypass class                        | Attempted input shape                                                                                          | Outcome                                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mixed claims                        | One substantive explicit risk claim adjacent to shallow scoped or no-risk absence claims.                      | PASS: blocked by current gate.                                                | Existing constructed coverage rejects mixed/no-risk scoped claims in `packages/shared/src/__tests__/auditReportValidator.test.ts` lines 1912-2118. Source inspection found scoped no-risk segment parsing at `packages/shared/src/auditReportValidator.ts` lines 2252-2295 and assessment/downgrade paths at lines 2518-2723 and 2855-2859.                                     |
| No-risk scoped claims               | Absence language without manifest risk IDs, including scoped no-risk segment forms.                            | PASS: blocked by current gate.                                                | Existing constructed coverage rejects scoped no-risk claims in `auditReportValidator.test.ts` lines 1912-2118. Source inspection found scoped no-risk segment parsing at `auditReportValidator.ts` lines 2252-2295.                                                                                                                                                             |
| Path-only risk term matches         | Risk terms appear only in path-like tokens or file names, not in behavior-relevant evidence.                   | PASS: blocked by current gate.                                                | Existing constructed coverage rejects path-only risk terms in `auditReportValidator.test.ts` lines 410-449 and 452-515. Source inspection found risk/path stripping at `auditReportValidator.ts` lines 2360-2397.                                                                                                                                                               |
| Generic or quoted dot-grep variants | Broad dot-grep output shaped like source evidence, including generic `grep`/`rg` forms.                        | PASS: blocked by current gate.                                                | Existing constructed coverage rejects generic grep dumps in `auditReportValidator.test.ts` lines 256-295. Source inspection found generic dot-grep detection at `auditReportValidator.ts` lines 2130-2141 and reused generic detection at lines 2484-2516.                                                                                                                      |
| Reused snippets                     | Same source snippets reused across unrelated risk hypotheses.                                                  | PASS: blocked by current gate.                                                | Existing constructed coverage rejects reused generic evidence in `auditReportValidator.test.ts` lines 517-575. Source inspection found risk-specific refs and ledger units at `auditReportValidator.ts` lines 2417-2481 and reused generic detection at lines 2484-2516.                                                                                                        |
| Ledger identity without substance   | Valid manifest and identity-bound ledger unit, but evidence is inventory/generic rather than risk-substantive. | PASS for unbacked/generic ledger; FAIL for command-query output bypass below. | Existing constructed coverage rejects unbacked command output when a ledger is required in `auditReportValidator.test.ts` lines 2923-2958. Data trust rejects shallow valid manifests in `packages/data/src/__tests__/index.test.ts` lines 1768-1818. A valid ledger unit carrying command output whose output line is not risk-substantive still passed; see confirmed bypass. |
| Command-output-shaped prose         | Report text or evidence imitates command output without risk-substantive source content.                       | FAIL: confirmed bypass for query-driven command output.                       | One-off `tsx` script with `src/config.ts = export const timeoutMs = 1000;` and report command `rg -n "auth" src/config.ts` output `src/config.ts:1:export const timeoutMs = 1000;` returned `ok: true`, `sourceClassification: validated_no_findings`, `substantiveEvidence: true`, `evidenceDepth.trustedNoFindingsSupported: true`, and `reasonCodes: []`.                    |
| Adjacent risk wording leakage       | Risk wording in one nearby segment causes another shallow line to appear risk-specific.                        | PASS: blocked by current gate.                                                | Existing mixed/no-risk scoped claim coverage rejects adjacent leakage patterns in `auditReportValidator.test.ts` lines 1912-2118. Source inspection found segment parsing and downgrade paths at `auditReportValidator.ts` lines 2252-2295 and 2518-2723.                                                                                                                       |

## Confirmed bypass

### Validator-level self-reported command output

Reproduction shape:

- Temporary repository file: `src/config.ts`
- File content: `export const timeoutMs = 1000;`
- Reported command: `rg -n "auth" src/config.ts`
- Reported output: `src/config.ts:1:export const timeoutMs = 1000;`
- Claimed no-findings risk: `risk-auth`

Observed classification:

- `ok: true`
- `sourceClassification: validated_no_findings`
- `substantiveEvidence: true`
- `evidenceDepth.trustedNoFindingsSupported: true`
- `reasonCodes: []`

Expected diagnostic classification:

- The report should not be trusted as substantive no-findings evidence for `risk-auth` because the source line shown in the output does not contain behavior-relevant authentication evidence. The command query term alone should not make a non-risk-bearing result line risk-substantive.

### Ledger-backed command output

Reproduction shape:

- Valid manifest.
- `AuditEvidenceUnit` id `ev-1`.
- `evidenceGrade: substantive`.
- `riskHypothesisIds: [risk-auth]`.
- `command.command: rg -n "auth" src/config.ts`.
- `outputPreview: src/config.ts:1:export const timeoutMs = 1000;`.

Observed classification:

- `ok: true`
- `manifestStatus: valid`
- `sourceClassification: validated_no_findings`
- `substantiveEvidence: true`
- `evidenceDepth.trustedNoFindingsSupported: true`
- `reasonCodes: []`

Expected diagnostic classification:

- The ledger unit should remain identity-bound but should not satisfy trusted no-findings depth unless the output preview contains risk-substantive source content independent of the command query.

## Source inspection summary

- Evidence-depth issue codes and result type are defined in `packages/shared/src/auditReportValidator.ts` lines 56-60 and 127-180.
- Generic dot-grep detection exists at `auditReportValidator.ts` lines 2130-2141.
- Scoped no-risk segment parsing exists at `auditReportValidator.ts` lines 2252-2295.
- Risk/path stripping exists at `auditReportValidator.ts` lines 2360-2397.
- Risk-specific references and ledger units are evaluated at `auditReportValidator.ts` lines 2417-2481.
- Generic evidence detection is reused at `auditReportValidator.ts` lines 2484-2516.
- Evidence-depth assessment and downgrade logic exists at `auditReportValidator.ts` lines 2518-2723 and 2855-2859.
- Depth issue emission exists at `auditReportValidator.ts` lines 3088-3094.
- Synthesis revalidates source reports and counts only `sourceClassification: validated_no_findings` with `evidenceDepth.trustedNoFindingsSupported` at `packages/shared/src/auditSynthesisClassifier.ts` lines 130-148.
- Synthesis returns `validated_no_findings` only when every source report is substantive at `auditSynthesisClassifier.ts` lines 175-181.
- Data trust requires a valid manifest plus trusted depth for no-findings at `packages/data/src/index.ts` lines 4955-4975.

## Existing regression coverage observed

- Generic grep dump rejected: `packages/shared/src/__tests__/auditReportValidator.test.ts` lines 256-295.
- Path-only risk term rejected: `auditReportValidator.test.ts` lines 410-449 and 452-515.
- Reused generic evidence rejected: `auditReportValidator.test.ts` lines 517-575.
- Mixed/no-risk scoped claims rejected: `auditReportValidator.test.ts` lines 1912-2118.
- Unbacked command output rejected when ledger is required: `auditReportValidator.test.ts` lines 2923-2958.
- Data trust rejects shallow valid manifest: `packages/data/src/__tests__/index.test.ts` lines 1768-1818.
- Synthesis generic/no-risk reports are inconclusive: `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts` lines 265-331.
- Reviewer has generic synthesis bypass regression: `packages/agent/src/__tests__/reviewer.test.ts` lines 928-1140.
- Positive ledger no-findings remains accepted: `auditReportValidator.test.ts` lines 835-919 and `packages/agent/src/__tests__/implementer.test.ts` lines 1911-2085.

## Commands run by Lead

All commands exited with code 0:

```powershell
npm.cmd test --workspace=@aif/shared -- auditReportValidator
```

Result: 1 file, 116 tests passed.

```powershell
npm.cmd test --workspace=@aif/shared -- auditSynthesisClassifier taskCompletionEvidence auditContractCorpus
```

Result: 3 files, 168 tests passed.

```powershell
npm.cmd test --workspace=@aif/data -- index
```

Result: passed. Output was very verbose with database migration logs.

```powershell
npm.cmd test --workspace=@aif/agent -- implementer reviewer
```

Result: passed. Output was very verbose with database/runtime logs.

Additional one-off `tsx` diagnostic scripts were run by Lead to confirm the validator-level and ledger-backed command-output bypasses described above.

## Independent test gate

Tester verdict: `TEST PASS`.

Tester reran:

- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"`: exit 0, `STATUS: ready`.
- `python -m json.tool docs/intake/work_status.json`: exit 0.
- `npm.cmd test --workspace=@aif/shared -- auditReportValidator`: exit 0, 1 file and 116 tests passed.
- `npm.cmd test --workspace=@aif/shared -- auditSynthesisClassifier taskCompletionEvidence auditContractCorpus`: exit 0, 3 files and 168 tests passed.
- `npm.cmd test --workspace=@aif/data -- index`: exit 0, passed with verbose DB migration logs.
- `npm.cmd test --workspace=@aif/agent -- implementer reviewer`: exit 0, passed with verbose DB/runtime logs.

Tester confirmed the result preserves diagnostic-only scope, the confirmed bypass is captured, the follow-up implementation card exists and is queued, and the bypass matrix covers all requested classes.

## Gate verdicts

- PLAN: PASS, received before evidence collection and this result write-up.
- Implementation: diagnostic result artifact written only to `docs/rdpi/work/work-20260523-adversarial-audit-evidence-depth-bypass-review/result.md`.
- TEST: PASS.
- REVIEW: PASS.
- Mempublish/memsync: success.

## Independent final review gate

Reviewer verdict: `REVIEW PASS`.

Reviewer found no blocking issues and confirmed:

- Diagnostic-only scope is preserved.
- All intake-required bypass classes are addressed in the bypass matrix.
- The confirmed bypass has an exact queued reproduction in `work-20260523-harden-audit-command-query-output-depth.md`, including self-reported and ledger-backed variants.
- Gate/status wording is coherent before final close-out.
- `work_status.json` validates as JSON.

## Memory sync

`$memsync MODE=auto LANE=work TASK_ID=work-20260523-adversarial-audit-evidence-depth-bypass-review` completed successfully.

- Command: `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260523-adversarial-audit-evidence-depth-bypass-review --project aif-handoff --entity aif-handoff`
- Status: `success`
- Reason: `ingested 4 shared-memory items`
- Report: `docs/memory/reports/work-20260523-adversarial-audit-evidence-depth-bypass-review-memsync-report.md`
- Task delta: `docs/memory/tasks/work/work-20260523-adversarial-audit-evidence-depth-bypass-review-delta.md`

## Scope control

- Production code changed: no.
- Test code changed: no.
- Intake changed: yes, only to queue the separate follow-up implementation task `work-20260523-harden-audit-command-query-output-depth`, create its empty RDPI scaffold, and mark this selected audit task done after gates and memsync succeeded.
- Follow-up implementation executed: no.
- Files intentionally changed for this diagnostic task: RDPI artifacts for this task, the follow-up intake card, the follow-up empty RDPI scaffold, and intake index/status entries.
