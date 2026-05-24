# Design

## Approach

Add a first-class evidence-depth layer to the existing audit report validator and let existing completion, roadmap artifact trust, deterministic repair, synthesis, API, and UI paths consume it through the already-persisted validation details.

The design keeps public outcome vocabulary stable. Public manifests still use `validated_findings_present`, `validated_no_findings`, and `source_inconclusive`. New lower-level depth reason codes remain validator diagnostics unless a report must be downgraded to the public `source_inconclusive` outcome.

## Evidence-Depth Model

Extend the validation result with an `evidenceDepth` object:

- `status`: `substantive`, `shallow`, or `inconclusive`
- `trustedNoFindingsSupported`: boolean
- `reasonCodes`: stable strings such as `shallow_evidence`, `inventory_only_evidence`, `irrelevant_grep_match`, `insufficient_scope_depth`, `reused_generic_evidence`, and `self_reported_command_output`
- `report`: source-report level summary
- `scopeRoots`: one assessment per declared scoped file/root
- `riskHypotheses`: one assessment per declared risk hypothesis when manifest risk IDs or text risk IDs are available

Each scope/risk assessment should include the id/root, status, reason codes, cited evidence refs or line refs, and a short summary. It should be JSON-safe because `taskCompletionEvidence` already persists `auditReportValidation` inside validation details.

Use `self_reported_command_output` only for command-output-shaped prose that is not bound to a concrete source citation, ledger unit, or verifiable command evidence. If implementation folds that case into an existing reason code, tests must prove the same failure still blocks trusted no-findings.

## Depth Rules

A no-findings report can remain trusted only when the validator finds substantive no-findings evidence and the depth model says `trustedNoFindingsSupported = true`.

Depth should reject:

- import-only, comment-only, metadata, file header, bootstrap, first-lines-only, and declaration-only citations;
- path inventory, directory listings, file existence checks, `git ls-files`, `ls`, broad `find`, and generic `git grep -n .` dumps when used as absence proof;
- grep/search output that merely contains query words without behavior-specific interpretation tied to the declared risk;
- identical evidence reused across unrelated risk hypotheses or across all no-findings claims without risk-specific reasoning;
- self-reported command output that is not paired with risk-specific interpretation and concrete source citations.

Depth should allow:

- implementation bodies, branch/error/authorization/config/persistence/runtime paths, function/class bodies with behavior lines, targeted command output, and empty-file proof when the scoped file is actually empty;
- very small files when the cited line is the behavior/config boundary being audited and the reasoning explicitly ties it to the declared risk;
- findings-present reports when a structured finding still passes existing Evidence/Risk/Proposed fix/Verification checks. This task focuses trust hardening for no-findings promotion.

## Integration

- `auditSourceEvidence.ts`: keep the existing low-signal filter, but add reusable helpers for concrete line refs, shallow line detection, generic command detection, and depth classification inputs.
- `auditReportValidator.ts`: compute the depth object after manifest/scope/source classification inputs are known. Add explicit issue codes for depth failures. If a report claims `validated_no_findings` but depth is not trusted, add blocking depth issues, force or preserve `sourceClassification` as non-green, and make manifest outcome mismatch fail when the manifest still says `validated_no_findings`.
- `taskCompletionEvidence.ts`: treat depth-failure issue codes as validator evidence blockers and include depth reason messages in `reportQualityIssues`.
- `data/index.ts`: require trusted no-findings source artifacts to have valid manifest status and persisted `evidenceDepth.trustedNoFindingsSupported === true`. Keep `validated_findings_present` behavior intact except for existing validator failures.
- `auditSynthesisClassifier.ts`: classify source report text through the depth-aware source classifier or validator-compatible helper so shallow source reports cannot contribute to `substantiveNoFindingsReportCount`.
- Deterministic repair/review: rely on strict validator output. Repair may emit bounded `source_inconclusive` with depth reason codes, but must not legalize shallow evidence into trusted no-findings.
- API/UI: use existing `artifactTrust.reasonCodes`, artifact trust level, and timeline reason-code surfaces. Add tests proving depth codes show up in persisted reason codes; avoid adding a new endpoint unless needed.

## Compatibility

- Old validation details without `evidenceDepth` should not crash projections. They should remain untrusted for no-findings unless current validation details prove depth support.
- Existing strict manifest, source snapshot, content hash, artifact path, ledger identity, source membership, and synthesis membership checks stay in place.
- Public manifest v2 vocabulary stays stable. Lower-level reason codes remain validation details.
