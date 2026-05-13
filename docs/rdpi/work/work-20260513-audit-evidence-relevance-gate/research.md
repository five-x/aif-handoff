# Research

## Task framing and lane

- Task: `work-20260513-audit-evidence-relevance-gate`
- Lane: `work`
- Intake source: `docs/intake/work/work-20260513-audit-evidence-relevance-gate.md`
- RDPI path: `docs/rdpi/work/work-20260513-audit-evidence-relevance-gate`
- Task intent: harden audit report validation/classification so evidence must be relevant to the declared audit scope and risk hypotheses, not merely resolvable under the repository.
- RDPI preflight: `codex-ensure-rdpi.py` reported `STATUS: ready`; `codex-flow-audit.py --repo .` reported `STATUS: clean`.

## Accepted planning sources

- Governing local instructions:
  - `AGENTS.md` task routing/RDPI contract: run RDPI, require independent gates, avoid live evidence before `PLAN PASS`.
  - `.agents/skills/runtask/SKILL.md`: selected intake card is immutable task intent and RDPI-backed close-out must run memsync.
  - `.agents/skills/rdpi/SKILL.md`: before `PLAN PASS`, keep artifacts planning-only; use explorer, reviewer, coder, tester, and final reviewer gates.
- Intake acceptance criteria:
  - Trusted no-findings source reports require non-empty risk hypotheses or equivalent scoped no-findings claims.
  - Evidence refs must bind to the same task, audit plan, source snapshot, scope, and risk.
  - `Scope: .` must be rejected for source audit reports or require representative product-scope coverage.
  - `.agents/**`, `.ai-factory/**`, generated plans, and report artifacts must not count as product-code evidence unless explicitly scoped.
  - `path:1` citations must not be sufficient when they only prove file existence or metadata headers.
  - Validation details must distinguish missing scope, missing risk hypotheses, irrelevant evidence, and insufficient substantive evidence.
- Local contract doc:
  - `docs/kb/audit-evidence-provenance-contract.md` defines `AuditPlan` as the source of scope roots and risk hypotheses; the classifier must validate scope/risk coverage and fail closed when evidence is missing, stale, contradictory, or unbound.
  - The same contract says trusted no-findings require all required scope roots and risk hypotheses to be covered, substantive evidence for absence of each scoped risk, and inventory evidence cannot prove absence.
- Current implementation surfaces:
  - `packages/shared/src/auditReportValidator.ts` owns issue codes, manifest parsing, scope coverage, manifest/source snapshot checks, and runtime ledger evidence ref validation.
  - `packages/shared/src/auditSourceEvidence.ts` classifies source report prose; current no-findings classification accepts existing line refs plus non-inventory command evidence.
  - `packages/shared/src/auditSynthesisClassifier.ts` delegates source report no-findings trust to `classifyAuditSourceEvidence`.
  - `packages/shared/src/auditRoadmapContract.ts` maps validation issue codes into audit failure families.
  - `packages/shared/src/__tests__/auditReportValidator.test.ts` and `packages/shared/src/__tests__/auditContractCorpus.test.ts` cover validator behavior and corpus mutations.
  - `packages/shared/src/__tests__/fixtures/auditContractCorpus.ts` contains valid and invalid source-report corpus fixtures plus manifest/ledger helper builders.
- Current behavior found from local source inspection:
  - Ledger evidence validation already checks cited evidence ID existence, task ID, audit plan ID, manifest source snapshot ID, substantive grade, scope IDs, and risk IDs.
  - Those checks become vacuous when manifest scope or risk IDs are empty.
  - Manifest required fields for `validated_no_findings` currently require `noFindingsClaims` and `evidenceRefs`, but not non-empty risk hypotheses or claim-level risk IDs.
  - `Scope: .` is rejected for generated roadmap cards elsewhere, but report validation currently normalizes `.` away, which can skip scope coverage checks.
  - Directory representative file traversal ignores `.git`, `node_modules`, `dist`, `build`, and `coverage`, but not `.agents`, `.ai-factory`, `.codex`, generated RDPI/intake/memory docs, or audit report artifact directories.
  - Line reference checks validate that `path:line` exists, but do not distinguish substantive product lines from line-one metadata/header citations.

## Same-project memory

- Shared memory was not queried before `PLAN PASS` because this task is repo-specific and the RDPI boundary forbids pre-plan shared-memory recall unless explicitly waived.
- Same-project curated memory may be considered after the plan gate only if local facts conflict or the implementation requires prior-decision context that local docs do not provide.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- Reusable local pattern accepted from instructions: strengthen existing shared validators instead of adding one-off gates; keep issue codes deterministic and map them through shared audit failure-family helpers.

## Rejected or stale memory candidates

- No memory candidates were accepted or rejected.
- Historical task memory about earlier audit validator work is intentionally not used as authority over the current local source and KB contract.

## Open questions

- Compatibility stance: markdown-only no-findings reports still have positive fixtures. The implementation should avoid requiring manifests/ledger for every no-findings report in this task unless existing local tests and call sites are updated deliberately.
- Product evidence definition: product-code/product-scope filtering must be deterministic but conservative enough not to reject explicitly scoped audits of `.agents/**`, `.ai-factory/**`, generated docs, or audit artifacts.
- `path:1` metadata detection should avoid rejecting real one-line source files such as `export const timeoutMs = 1000;`.

## Hypotheses

- Extending the existing shared validator and source-evidence classifier is enough to close the audit-v10 false-valid class without adding a second report gate.
- Requiring non-empty risk IDs for manifest-backed trusted no-findings will close the vacuous manifest risk path while preserving valid positive corpus fixtures.
- Treating `Scope: .` as invalid source-report scope will be simpler and safer than trying to infer representative product coverage from the whole repository.
- Excluding hidden/generated/report paths from product evidence unless directly scoped will make broad-scope and no-scope false positives fail as irrelevant evidence or missing substantive evidence.
- A conservative metadata-line heuristic can reject line-one README/front-matter/header-only evidence while preserving one-line code/config positives.
