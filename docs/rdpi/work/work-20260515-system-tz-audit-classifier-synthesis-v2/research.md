# Research

## Task framing and lane

- Task ID: `work-20260515-system-tz-audit-classifier-synthesis-v2`
- Lane: `work`
- Intake: `docs/intake/work/work-20260515-system-tz-audit-classifier-synthesis-v2.md`
- RDPI needed: yes
- Task intent: unify audit report validation, artifact trust classification, deterministic repair outcomes, and synthesis input selection around one strict classifier model.
- Requested public source-report outcomes: `validated_findings_present`, `validated_no_findings`, and `source_inconclusive`.
- Requested artifact trust/failure exposure: explicit rejected, missing, inconclusive, blocked, manual exception, and failure classifications.
- Constraints: do not weaken validators, do not accept inventory-only no-findings as trusted, do not patch live audit-v16 cards, and keep this diagnostic-only.

## Accepted planning sources or local facts

- RDPI/runtask preflight: `codex-ensure-rdpi.py` reported `STATUS: ready`; `codex-flow-audit.py --repo .` reported `STATUS: clean`.
- The worktree was already dirty before this task, including audit/trust files. Implementation must keep changes scoped and must not revert unrelated existing edits.
- `docs/kb/system-tz-contract-inventory-freeze.md` is the accepted Phase 0 planning source for System TZ tasks. It freezes current behavior and says audit validator containment must remain fail-closed until this task changes it.
- `packages/shared/src/auditSourceEvidence.ts` currently exposes five source classifications: `validated_findings_present`, `validated_no_findings`, `inventory_only_invalid`, `insufficient_substantive_evidence`, and `source_inconclusive`. The first two are trusted report outcomes; the latter three are rejection/diagnostic classifications.
- `packages/shared/src/auditReportValidator.ts` currently validates strict report content and manifest integrity. The validator checks malformed reports, missing/invalid references, low-quality/fake evidence patterns, scope coverage, risk hypotheses, manifest identity, content hash, source snapshot, manifest outcome mismatch, ledger evidence references, evidence ownership, scope/risk binding, and discovery-only ledger evidence.
- `packages/shared/src/auditReportValidator.ts` currently supports manifest `version: 1` and allows all source classifications as manifest outcomes. That means weak classifications can appear as manifest outcome values, contrary to the requested public report-outcome contract.
- `packages/shared/src/auditSynthesisClassifier.ts` currently has a separate synthesis outcome vocabulary: `validated_findings_present`, `validated_no_findings`, and `inconclusive_batch_evidence`. It re-derives source-report evidence by calling lower-level evidence helpers instead of consuming one public classifier result.
- `packages/shared/src/auditRoadmapContract.ts` already has artifact states and failure families for `invalid`, `missing`, `source_inconclusive`, `terminal_inconclusive`, `manual_exception`, `external_blocked`, `invalid_inventory_only`, `insufficient_substantive_evidence`, and `inconclusive_batch_evidence`.
- `packages/data/src/index.ts` already excludes `source_inconclusive` and other terminal weak artifacts from trusted synthesis input. Only `state === "valid"` report artifacts with trusted source classification count as valid.
- `packages/agent/src/subagents/implementer.ts` already separates `validatedArtifacts` from `weakArtifacts` for synthesis, and deterministic report repair can terminalize weak strict repairs as `source_inconclusive`.
- `packages/shared/src/taskCompletionEvidence.ts` validates report artifacts and, for synthesis tasks, calls `classifyAuditSynthesisOutput`; inconclusive synthesis can be terminal only when the artifact explicitly says audit inconclusive.

## Same-project memory

- Local memory/report artifacts for `work-20260515-system-tz-contract-inventory-freeze` state that `docs/kb/system-tz-contract-inventory-freeze.md` is the accepted planning source, current timeline/trust surfaces are compatibility read models, and audit validators/completion evidence/synthesis classifier/review gate must remain fail-closed.
- The same local memory says future System TZ tasks must preserve artifact path, batch id, attempt number, source snapshot id, audit plan id, evidence ids, and branch/worktree provenance when migrating trust behavior.

## Cross-project reusable patterns

- No cross-project memory was used. Local repo facts and same-project curated artifacts were sufficient.

## Rejected or stale memory candidates

- No stale memory candidate was accepted above local code facts.
- No shared-memory recall was used before `PLAN PASS`; local docs and local memory files were enough for planning and respect the pre-plan runtime boundary.

## Implementation implications

- Add a public report-outcome layer instead of weakening the lower-level evidence classifier. The lower-level classifier can still expose `inventory_only_invalid` and `insufficient_substantive_evidence` as diagnostic classifications, but public report outcomes and manifest outcomes should collapse invalid/weak evidence to `source_inconclusive`.
- Keep manifest validation fail-closed. Add support for strict manifest v2 while preserving v1 compatibility where needed unless tests prove a narrower migration is safe.
- Make synthesis classification consume the same public source-report outcome and preserve a terminal diagnostic outcome for batches that do not produce trusted findings or no-findings.
- Ensure inventory-only/path-only/directory-listing/self-reported command-output reports continue to be rejected and cannot increase trusted valid counts.
- Keep deterministic repair deterministic. Strict-manifest reports that fail validation should be terminalized as `source_inconclusive`; they must not be routed to free-form model rewrite.
- Expand diagnostics so failures expose family, reason codes, artifact path, and next action through existing validation details/trust rollup surfaces without broad schema churn.
