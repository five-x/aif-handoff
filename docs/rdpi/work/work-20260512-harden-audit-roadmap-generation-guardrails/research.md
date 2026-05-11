# Research: Harden Audit Roadmap Generation Guardrails

Task: `work-20260512-harden-audit-roadmap-generation-guardrails`

## Task Intent

Harden platform-level audit roadmap generation and import so future audit-shaped roadmaps preserve canonical audit guardrails without manual card edits.

This task is implementation work, not a diagnostic audit. It must preserve existing typed audit batch metadata, report artifact creation, paused synthesis behavior, and roadmap dedupe semantics.

## Local Findings

- `packages/api/src/services/roadmapGeneration.ts` owns roadmap file generation, source markdown validation, deterministic audit fallback generation, deterministic audit markdown-to-task conversion, typed task validation, and import defaults.
- Audit roadmap import is already deterministic. `generateRoadmapTasks` validates audit source markdown, builds audit tasks from unchecked markdown items, and does not call the extraction model for `taskIntent: "audit"`.
- `importGeneratedTasks` validates typed audit batches before creating tasks, creates audit batch/artifact metadata, sets audit task defaults, and pauses synthesis cards with `synthesis_not_ready`.
- `packages/shared/src/auditRoadmapContract.ts` contains shared audit generated-card validation, artifact path parsing, audit synthesis title detection, issue codes, and failure-family mapping.
- Existing required audit markers cover shape (`Scope:`, `Audit mandate:`, `Allowed changes:`, `Report artifact:`, `Evidence requirements:`, `Quality bar:`, `No-findings rule:`, git requirements, etc.) but do not require the newly requested canonical no-findings proof exclusions or synthesis outcome requirements.
- The current deterministic report card text says inventory notes, "uses X", "file exists", tests pass, broad maintainability smells, product-scope gaps, and speculative claims are not findings. It does not explicitly reject `git ls-files`, `git status`, directory listings, file-existence checks, and broad inventory-only observations as sufficient proof for no-findings.
- Current synthesis text says not to promote weak observations and asks for `No validated findings` if no source finding meets the bar. It does not explicitly require the three synthesis outcomes: validated findings present, validated no-findings with substantive evidence, and audit inconclusive.
- Existing regression tests in `packages/api/src/__tests__/roadmapGeneration.test.ts` cover audit prompt content, deterministic fallback, source validation, deterministic audit conversion, import defaults, and import validation.
- Existing shared tests in `packages/shared/src/__tests__/auditRoadmapContract.test.ts` cover canonical generated-card validation and stable legacy validation messages.
- Prior completed RDPI work `work-20260510-harden-audit-roadmap-flow-contract` established typed audit batch/artifact records and paused synthesis behavior.
- Prior completed RDPI work `work-20260511-audit-inconclusive-synthesis-gate` established the synthesis outcome taxonomy: `validated_findings_present`, `validated_no_findings`, and `inconclusive_batch_evidence`.

## Constraints Confirmed

- Do not special-case live project names, `audit-v7`, `audit-v8`, branch names, task ids, or paths.
- Prefer deterministic validators and fixture tests over prompt-only wording.
- Keep generic roadmap import behavior unchanged.
- Do not weaken existing audit completion evidence, review, or synthesis gates.
- Before `PLAN PASS`, this research used local repo files and prior local RDPI docs only. No runtime-visible probing or shared-memory recall was used.

## Working Hypothesis

The durable fix should make canonical audit guardrail text shared and validator-enforced, then have `roadmapGeneration.ts` consume that contract in prompt examples, deterministic fallback cards, source markdown validation, generated batch validation, and import validation.
