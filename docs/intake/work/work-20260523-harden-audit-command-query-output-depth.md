# Harden Audit Command Query Output Depth

- Task ID: work-20260523-harden-audit-command-query-output-depth
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-23
- Due: after `work-20260523-adversarial-audit-evidence-depth-bypass-review`
- Source: Confirmed bypass from `work-20260523-adversarial-audit-evidence-depth-bypass-review`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth`

## Request

Harden the audit evidence-depth validator so command-output-shaped prose cannot satisfy risk-specific no-findings depth by placing the risk term only in the reported grep/search command while showing output lines that do not actually match that risk term or otherwise substantively address the risk.

The confirmed bypass is a source report that claims auth risk coverage, runs a reported command shaped as `rg -n "auth" src/config.ts`, and shows the actual `timeoutMs` line as the command output. Because the command string contains `auth`, the current depth assessment treats the risk as substantive even though the cited output line is unrelated to auth behavior.

## Reproduction: Self-Reported Command Output

In a temporary git repo with `src/config.ts` containing:

```ts
export const timeoutMs = 1000;
```

Validate this report with `validateAuditReportArtifact()` using `scopeRoots: ["src/config.ts"]`, `reportArtifactPaths: ["audit/runtime-audit.md"]`, and `requireProposedFix: true`:

```md
# Runtime Audit

No validated findings.
Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.

Checked files:

- `src/config.ts:1`

Checked commands:

- Command `rg -n "auth" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`

Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.
```

Observed on 2026-05-23:

- `ok: true`
- `sourceClassification: "validated_no_findings"`
- `substantiveEvidence: true`
- `evidenceDepth.trustedNoFindingsSupported: true`
- `evidenceDepth.reasonCodes: []`

## Reproduction: Ledger-Backed Command Output

The same bypass also passes through the runtime-ledger path when the ledger identity is valid but the output is still non-substantive for the risk.

Use the same repository and report body, but cite `ev-1` as runtime ledger evidence:

```md
# Runtime Audit

No validated findings.
Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.

Checked files:

- `src/config.ts:1`

Runtime ledger evidence:

- Evidence `ev-1` from command `rg -n "auth" src/config.ts` inspected `src/config.ts:1`.

Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.
```

Use a valid manifest with:

- `outcome: "validated_no_findings"`
- `scopeCoverage: [{ root: "src/config.ts", covered: true, evidenceRefs: ["ev-1"] }]`
- `riskHypotheses: [{ id: "risk-auth", description: "auth drift", status: "covered", evidenceRefs: ["ev-1"] }]`
- `noFindingsClaims: [{ id: "nf-1", riskId: "risk-auth", scopeIds: ["src/config.ts"], evidenceRefs: ["ev-1"] }]`
- `evidenceRefs: ["ev-1"]`

Validate with `requireLedgerEvidence: true` and an `AuditEvidenceUnit`:

- `id: "ev-1"`
- `evidenceGrade: "substantive"`
- `evidenceKind: "search"`
- `toolName: "rg"`
- `scopeIds: ["src/config.ts"]`
- `riskHypothesisIds: ["risk-auth"]`
- `command.command: "rg -n \"auth\" src/config.ts"`
- `outputPreview: "src/config.ts:1:export const timeoutMs = 1000;"`
- matching `taskId`, `auditPlanId`, and `sourceSnapshotId`

Observed on 2026-05-23:

- `ok: true`
- `manifestStatus: "valid"`
- `sourceClassification: "validated_no_findings"`
- `substantiveEvidence: true`
- `evidenceDepth.trustedNoFindingsSupported: true`
- `evidenceDepth.reasonCodes: []`

## Expected Classification

The report must not classify as trusted `validated_no_findings`.

Expected behavior:

- `ok: false`
- `sourceClassification: "source_inconclusive"` or another non-green no-findings outcome
- `evidenceDepth.trustedNoFindingsSupported: false`
- include depth reason codes such as `irrelevant_grep_match` and `shallow_evidence`, or a more specific command/query-output mismatch code if introduced

## Done When

- Validator verifies that a risk-term search command's reported output actually contains a risk-substantive match, or otherwise requires independent risk-substantive source/ledger evidence.
- A command query that mentions the risk term cannot by itself make unrelated output risk-specific.
- Regression tests cover the reproduction above.
- Existing positive no-findings cases with genuinely substantive command output remain accepted.
- Ledger-backed no-findings acceptance remains possible when the ledger unit is risk-substantive.

## Constraints

- Do not weaken manifest, source snapshot, content hash, artifact path, ledger identity, scope membership, or synthesis membership checks.
- Do not make no-findings impossible; require pragmatic risk-substantive evidence.
- Do not execute this task as part of the adversarial audit review that created it.
