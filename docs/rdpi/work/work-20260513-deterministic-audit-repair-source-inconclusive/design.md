# Design - Deterministic Audit Repair Emits Source Inconclusive

## Goal

Make deterministic audit report repair fail closed when it lacks risk-specific product-scope evidence. The repair path must not turn generic `git grep "."` over arbitrary files into a trusted `validated_no_findings` source report.

## Repair decision model

Add a small repair decision layer in `packages/agent/src/subagents/implementer.ts` before manifest generation.

The decision should distinguish:

- `validated_no_findings`: allowed only when deterministic repair has concrete declared scope, parseable risk hypotheses, product-scope files, successful substantive command evidence, and ledger evidence units for those roots.
- `source_inconclusive`: used when repair can normalize the report artifact but cannot prove trusted no-findings.

Do not keep a fallback from missing scope to `["."]`. Missing parseable scope is itself an inconclusive reason.

The trusted-repair predicate must be explicit and fail closed:

- every parsed risk hypothesis must reference at least one declared product scope root;
- every risk hypothesis must have at least one captured evidence unit whose `scopeIds` include both the relevant root and the risk ID, or another deterministic binding that is equally local and machine-readable;
- generic source-presence commands such as `git grep -n -m 5 "."` are insufficient for trusted no-findings even when they mention product files;
- a deterministic no-findings repair must inspect risk-specific terms derived from the risk hypothesis text or otherwise mark the result `source_inconclusive`;
- if any declared risk lacks bound substantive evidence, the whole repair is non-trusted.

## Scope and hidden tooling rules

Deterministic repair should use the newer audit card contract as an input boundary:

- parse concrete roots from `Scope:`;
- parse `Risk hypotheses:` and `risk-*` IDs from the task description;
- require at least one risk hypothesis for trusted deterministic no-findings repair;
- require selected evidence files to be under declared product scope roots;
- exclude hidden tooling roots such as `.agents/**`, `.ai-factory/**`, `.claude/**`, `.codex/**`, `.github/**`, and generated audit/runtime metadata unless those exact roots are explicitly declared in scope.

When a hidden tooling path is explicitly scoped, it may be inspected only for that explicit task scope. A broad root must not satisfy product audit evidence by walking into hidden tooling folders.

## Manifest and report content

Replace the unconditional manifest outcome in `buildAuditReportManifest()` with an input-driven outcome.

For trusted no-findings:

- keep the existing report body shape with `No validated findings.`;
- include `outcome: "validated_no_findings"`;
- include risk hypotheses derived from the task description;
- include no-findings claims only when all trusted repair prerequisites pass.

For inconclusive repair:

- write a clear source audit report that says the deterministic repair is inconclusive, not no-findings;
- include `outcome: "source_inconclusive"`;
- include scope coverage for attempted roots;
- include parsed risk hypotheses when available;
- do not include a trusted no-findings claim;
- include evidence refs only for evidence that was actually captured.

The content remains a deterministic report artifact, but the machine-readable state is non-trusted.

## Artifact lifecycle

After deterministic repair writes an inconclusive report, update the roadmap batch artifact state to a non-trusted state if the task has a batch artifact:

- use `state: "source_inconclusive"`;
- use `classification: "source_inconclusive"`;
- set a failure family such as `source_inconclusive`;
- preserve validation details, content SHA, attempt boundary/history, project root, and source snapshot metadata where available.

The task implementation log should not claim repair success as no-findings. It can state that deterministic repair completed as source inconclusive and that synthesis should not treat the artifact as trusted.

For the task row, make the lifecycle decision concrete:

- trusted repair clears `reworkRequested` as it does today;
- inconclusive repair clears `reworkRequested` only because `source_inconclusive` is a terminal non-trusted artifact outcome in the existing lifecycle, not because the report was accepted as valid;
- the implementation log must name that distinction;
- the roadmap artifact attempt row must preserve the failed/non-trusted classification so audit history remains reviewable;
- tests must assert `reworkRequested` behavior, artifact state, attempt creation, and trusted valid count.

## Compatibility

Safe deterministic repairs remain:

- artifact path metadata is still repaired;
- source snapshot and content hash are still written;
- existing attempt/history behavior is preserved through `updateRoadmapBatchArtifactState()`;
- narrow explicit product-scope reports with risk hypotheses can still become trusted no-findings when the deterministic evidence satisfies the contract.

This design intentionally does not change the global source validator's definition of substantive command evidence. The narrower task is to keep deterministic repair from manufacturing trusted source reports when its own inputs are insufficient.

## Risks and mitigations

- Risk: valid legacy repair tests fail because they have no risk hypotheses. Mitigation: update positive fixtures to include the new source-card risk contract or expect `source_inconclusive`.
- Risk: inconclusive repair loops repeatedly. Mitigation: persist artifact state and attempt details as `source_inconclusive`, clear `reworkRequested` only as terminal inconclusive handling, and make the implementation log explicit that this is not a trusted valid repair.
- Risk: hiding `.agents/**` breaks explicit audits of automation files. Mitigation: allow explicitly declared hidden tooling roots while blocking broad-root traversal into them.
- Risk: data-layer trusted counts still increment. Mitigation: tests must assert artifact state and `validArtifactCount`, not only report text.
