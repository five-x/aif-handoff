# Research - Deterministic Audit Repair Emits Source Inconclusive

## Task framing and lane

- Task ID: `work-20260513-deterministic-audit-repair-source-inconclusive`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260513-deterministic-audit-repair-source-inconclusive.md`
- RDPI path: `docs/rdpi/work/work-20260513-deterministic-audit-repair-source-inconclusive`
- Date: 2026-05-13

The task asks to stop deterministic audit report repair from manufacturing a trusted `validated_no_findings` source report from generic scoped evidence. If the runtime cannot repair a weak source audit report with risk-specific product-scope evidence, deterministic repair must emit or persist `source_inconclusive` or another non-trusted state.

## Accepted planning sources or local facts

- `AGENTS.md` defines this repository as a Node/TypeScript project and names the standard commands: `npm.cmd run build`, `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run dev`.
- `.agents/skills/runtask/SKILL.md` requires RDPI, `codex-ensure-rdpi.py`, `codex-flow-audit.py --repo .`, independent gates, memory sync, and updating only the selected intake status after close-out.
- `codex-ensure-rdpi.py` returned `STATUS: ready`.
- `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- The selected intake card is present at `docs/intake/work/work-20260513-deterministic-audit-repair-source-inconclusive.md` and declares `RDPI Needed: yes`.
- The working tree already contains unrelated modified and untracked intake, RDPI, roadmap, and memory files. This run must preserve them and edit only files needed for this task.
- `packages/agent/src/subagents/implementer.ts:783` builds audit report manifests for deterministic report repair.
- `packages/agent/src/subagents/implementer.ts:814` currently writes `outcome: "validated_no_findings"` unconditionally for deterministic report repair.
- `packages/agent/src/subagents/implementer.ts:816` currently writes `riskHypotheses: []` and `packages/agent/src/subagents/implementer.ts:818` writes a no-findings claim even when evidence is generic.
- `packages/agent/src/subagents/implementer.ts:899` builds deterministic repair report content with `No validated findings.` from selected scope files.
- `packages/agent/src/subagents/implementer.ts:904` falls back to `roots = ["."]` when the task description has no parseable audit scope.
- `packages/agent/src/subagents/implementer.ts:601` ignores `.git`, `node_modules`, `dist`, `build`, `coverage`, and `__pycache__`, but not hidden agent/tooling roots such as `.agents` or `.ai-factory`.
- `packages/agent/src/subagents/implementer.ts:658` recursively selects the first sorted text files under a scope root, which can turn broad scope into arbitrary first-file evidence.
- `packages/agent/src/subagents/implementer.ts:1876` runs deterministic report repair for expected audit report artifacts, and `packages/agent/src/subagents/implementer.ts:1887` clears `reworkRequested` after the write.
- `packages/shared/src/auditSourceEvidence.ts` currently treats `git grep -n "."` as non-inventory command evidence, so deterministic repair can satisfy the existing source no-findings classifier even when the inspected content is not risk-specific.
- `packages/shared/src/auditReportValidator.ts:333` accepts `source_inconclusive` as manifest outcome vocabulary.
- `packages/shared/src/auditReportValidator.ts:1292` requires `noFindingsClaims` for `validated_no_findings`, but not for `source_inconclusive`.
- `packages/shared/src/auditRoadmapContract.ts` now requires source audit cards to have concrete scope and parseable `Risk hypotheses:` IDs; deterministic repair currently ignores those risk hypotheses.
- `packages/data/src/index.ts` already supports artifact states `source_inconclusive` and `terminal_inconclusive`.
- `packages/data/src/index.ts:2946` counts report artifacts as trusted valid only when state is `valid` and validation details contain trusted source classification; `validated_no_findings` also requires a valid manifest status.
- `packages/agent/src/coordinator.ts` maps terminal `source_inconclusive` and `insufficient_substantive_evidence` failures to `source_inconclusive`, but deterministic repair currently bypasses that path by directly writing a success-shaped report.
- Existing implementer tests around `packages/agent/src/__tests__/implementer.test.ts:1056` and `packages/agent/src/__tests__/implementer.test.ts:1178` assert deterministic repair produces valid no-findings reports and will need new expectations.

An independent read-only explorer confirmed the same code facts and identified `packages/agent/src/subagents/implementer.ts` plus `packages/agent/src/__tests__/implementer.test.ts` as the primary change targets.

## Same-project memory

Local curated memory and prior RDPI artifacts were consulted after source files:

- `docs/memory/tasks/work/work-20260512-align-source-report-classification-delta.md` records that source report validation now rejects inventory-only no-findings, trusted report counts require `validated_findings_present` or `validated_no_findings`, and deterministic repair switched from `git ls-files` to `git grep -n "."`.
- `docs/memory/tasks/work/work-20260512-audit-artifact-lifecycle-hypotheses.md` records draft lifecycle hypotheses for `source_inconclusive`, `terminal_inconclusive`, attempt history, and non-trusted manual exceptions.
- `docs/kb/audit-evidence-provenance-contract.md` defines the target trust boundary: trusted no-findings require declared scope, risk hypotheses, source snapshot binding, runtime-captured evidence units, and deterministic conclusion rules.
- `docs/rdpi/work/work-20260513-audit-roadmap-explicit-scope-risk-contract/*` records that generation/import now rejects broad source scope and requires parseable risk hypotheses.

Shared-memory MCP recall was not used before `PLAN PASS` because the RDPI planning boundary forbids shared-memory recall during pre-plan work unless explicitly waived. Local docs and local curated memory artifacts were sufficient.

## Cross-project reusable patterns

None used. This is repository-specific containment work in the local audit pipeline.

## Rejected or stale memory candidates

- `docs/memory/tasks/work/work-20260512-audit-artifact-lifecycle-hypotheses.md` is useful direction but is marked draft/hypothesis, so it is not treated as validated behavior.
- `docs/memory/tasks/work/work-20260513-audit-roadmap-explicit-scope-risk-contract-delta.md` currently contains no facts, decisions, or patterns.
- No cross-project or shared-memory candidates were queried.

## Scope boundaries

In scope:

- Stop deterministic report repair from unconditionally producing `validated_no_findings`.
- Require concrete product scope and risk hypotheses before deterministic repair may write a trusted no-findings report.
- Remove the broad `.` fallback for deterministic repair evidence selection.
- Exclude hidden agent/tooling files such as `.agents/**` and `.ai-factory/**` from product-scope repair evidence unless explicitly scoped.
- Preserve safe deterministic artifact repair such as artifact path metadata, manifest shape, content hash, source snapshot, and attempt/history behavior.
- Add implementer regressions where the first tracked text files live under `.agents/**`.

Out of scope:

- Full audit evidence relevance scoring across all validator paths. That is separately queued as `work-20260513-audit-evidence-relevance-gate`.
- End-to-end audit-v10 batch canary. That is separately queued as `work-20260513-audit-v10-false-valid-regression`.
- Schema migration for first-class lifecycle states; the current data layer already supports the needed states.
- Running a live product audit or probing external runtime services.

## Hypotheses

- H1: The smallest safe containment is repair-local: classify deterministic repair readiness from task scope, risk hypotheses, selected files, and ledger units before choosing the manifest outcome.
- H2: Missing risk hypotheses, missing concrete scope, broad root fallback, or only hidden tooling evidence should produce a `source_inconclusive` report and artifact state rather than a trusted no-findings report.
- H3: Trusted deterministic no-findings repair should remain possible for narrow, explicit source scope with parseable risk hypotheses and product files, preserving the current safe metadata repair behavior.
- H4: The data-layer trusted count protections should already prevent `source_inconclusive` from incrementing `validArtifactCount` if implementer persists the artifact state as `source_inconclusive` or otherwise avoids `state: "valid"`.
- H5: Tests should verify both artifact content and batch artifact state, because a non-trusted report body alone is insufficient if the artifact row is still marked valid.

## Proposed evidence plan

- Targeted agent tests:
  - `npm.cmd test --workspace=@aif/agent -- src/__tests__/implementer.test.ts`
- Data lifecycle spot check if artifact state persistence is touched:
  - `npm.cmd test --workspace=@aif/data -- src/__tests__/index.test.ts`
- Shared validator spot check if manifest or source classification vocabulary is touched:
  - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/auditRoadmapContract.test.ts`
- Build and lint for touched workspaces:
  - `npm.cmd run build --workspace=@aif/agent`
  - `npm.cmd run lint --workspace=@aif/agent`
  - Additional shared/data build/lint only if those workspaces are changed.
- Repository hygiene:
  - `git diff --check`
