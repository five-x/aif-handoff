# Design - Audit Inconclusive Synthesis Gate

## Goal

Make audit synthesis conclusions explicit and deterministic:

- `validated_findings_present`: at least one source finding survives the evidence filter.
- `validated_no_findings`: no findings survived and the source reports contain substantive owner-grade no-findings evidence.
- `inconclusive_batch_evidence`: the batch is terminal, but the evidence is too weak to support a product-quality no-findings conclusion.

## Shared classifier

Add a shared classifier in `packages/shared/src/auditSynthesisClassifier.ts` and export it from `packages/shared/src/index.ts`.

The classifier should provide:

- `classifyAuditSynthesisSourceReports(...)` for deterministic synthesis, using source report contents plus weak/invalid artifact count.
- `classifyAuditSynthesisOutput(...)` for completion evidence and review gate, using the final synthesis artifact text.
- `parseAuditSynthesisOutcomeFromText(...)` and `formatAuditSynthesisOutcomeForArtifact(...)` so the deterministic artifact records the exact source-report outcome in a machine-readable block.
- A stable `AuditSynthesisOutcomeKind` union and result object with a human-readable reason and report counts.

Classification rules:

- Structured findings require `Evidence:`, `Risk:`, `Proposed fix:`, `Verification:`, concrete existing `path:line` evidence, and no known low-quality placeholder patterns.
- Validated no-findings require `No validated findings`, existing checked file line references, and at least one substantive command-output evidence line.
- Inventory-only commands do not satisfy owner-grade no-findings by themselves. Treat `git ls-files`, `git status`, `git log`, `ls`, `dir`, `find`, `test -e`, and file-existence prose as inventory/existence checks.
- If zero findings survive and any terminal report is weak/invalid/missing/external-blocked, classify the batch as inconclusive.
- If zero findings survive and every valid source report is owner-grade no-findings with no weak terminal source reports, classify as validated no-findings.

## Persisted source-report outcome

The source-report outcome is the authoritative classification. Deterministic synthesis must persist it inside the synthesis artifact and implementation log.

Artifact format:

```markdown
<!-- audit-synthesis-outcome
{"kind":"inconclusive_batch_evidence","sourceReportCount":6,"validatedFindingCount":0,"weakReportCount":0,"reason":"..."}
-->
```

Completion evidence must read this block from the committed synthesis artifact. If the block is missing on an audit synthesis artifact, completion evidence must classify the artifact text conservatively and block when it claims `No validated findings` without a source-report outcome proving substantive source evidence.

If the final artifact text claims a stronger result than the persisted source-report outcome, the source-report outcome wins:

- source outcome `inconclusive_batch_evidence` plus final text `No validated findings` still blocks as `audit_inconclusive`.
- source outcome `validated_no_findings` plus final text `Audit inconclusive` remains inconclusive unless the source classifier is rerun and persisted by deterministic synthesis.
- source outcome `validated_findings_present` requires the final artifact to include validated findings; otherwise completion blocks as `audit_inconclusive` or existing insufficient-evidence issues.

This prevents deterministic synthesis, completion evidence, review gate, and roadmap artifact state from disagreeing.

## Completion evidence

Extend `TaskCompletionEvidenceResult.evidence` with `auditSynthesisOutcome`.

For risky audit synthesis tasks, detected by `isAuditSynthesisTitle(...)` or a synthesis-shaped report artifact task:

- parse the persisted source-report outcome from the synthesis artifact,
- classify the visible synthesis artifact text,
- combine them with source-report outcome precedence,
- store the combined outcome in completion evidence.

If the output classification is `inconclusive_batch_evidence`, add a new completion issue:

- code: `audit_inconclusive`
- message: `Audit inconclusive: batch evidence did not support a product-quality no-findings conclusion.`

This preserves existing path/reference/evidence guards and adds a stricter synthesis-only gate.

## Roadmap batch state and API-visible reason

Add `inconclusive_batch_evidence` to the audit failure-family contract and map `audit_inconclusive` to it.

Do not add a new database state in this task. Store inconclusive synthesis as:

- artifact state: `invalid`
- failure family: `inconclusive_batch_evidence`
- validation details: completion evidence containing `auditSynthesisOutcome.kind = "inconclusive_batch_evidence"`

This keeps schema churn low while making the UI/API-visible blocked reason and roadmap artifact details deterministic and distinct from `No validated findings`.

## Deterministic synthesis output

Update deterministic synthesis in `packages/agent/src/subagents/implementer.ts` to use the shared source-report classifier.

When validated findings are present:

- Continue writing findings, but add an explicit outcome line such as `Audit outcome: Validated findings present.`
- Persist the machine-readable source-report outcome block.

When no findings survive and source no-findings evidence is substantive:

- Write `No validated findings.`
- Add `Audit outcome: Validated no-findings with substantive audit evidence.`
- Carry the source report's substantive command evidence into the synthesis artifact instead of replacing it with only `git ls-files`.
- Persist the machine-readable source-report outcome block.

When evidence is inconclusive:

- Write `# Audit Inconclusive`.
- State that no findings survived evidence validation, but the batch did not perform enough substantive inspection to support a product-quality no-findings conclusion.
- Preserve source report and weak/invalid coverage details.
- Persist the machine-readable source-report outcome block.

## Review gate

No separate review-gate classifier is needed. `packages/agent/src/reviewGate.ts` already calls completion evidence for risky tasks. Once completion evidence emits `audit_inconclusive` from the persisted source-report outcome, review gate will convert it into a blocking `review_gate` finding.

## Non-goals

- Do not special-case `botIntevra`, `audit-v7`, branch names, host URLs, or concrete live artifact paths.
- Do not weaken existing path, scope, line-reference, tool-activity, or report-only guards.
- Do not change local runtime token-cost semantics.
- Do not create child implementation tasks.
