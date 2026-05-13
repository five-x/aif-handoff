# Research - Audit Roadmap Explicit Scope And Risk Contract

## Task Framing And Lane

- Task ID: `work-20260513-audit-roadmap-explicit-scope-risk-contract`
- Lane: `work`
- Intake: `docs/intake/work/work-20260513-audit-roadmap-explicit-scope-risk-contract.md`
- RDPI path: `docs/rdpi/work/work-20260513-audit-roadmap-explicit-scope-risk-contract`
- Date: 2026-05-13

The task asks to harden typed audit roadmap generation so source audit cards cannot be created with broad repository-root scope such as `Scope: .` and cannot omit explicit, locally parseable risk hypotheses. The observed audit-v10 failure was that six source cards used `Scope: .`, which let later deterministic repair and validation treat arbitrary repository files as enough evidence for a trusted `validated_no_findings` result.

This is implementation work, not a diagnostic audit. The task must preserve diagnostic-only behavior for generated audit cards: source audit cards may create or update only their named report artifact.

## Accepted Planning Sources Or Local Facts

- `AGENTS.md` defines this repository as a Node/TypeScript project and names the standard commands: `npm.cmd run build`, `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run dev`.
- `.agents/skills/runtask/SKILL.md` requires `codex-ensure-rdpi.py`, `codex-flow-audit.py --repo .`, RDPI gates, no child task execution, and status update only after successful completion.
- `codex-ensure-rdpi.py` returned `STATUS: refreshed` on 2026-05-13. `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- The current working tree already contains unrelated modified and untracked intake/RDPI/memory files. This run must avoid cleaning or reverting unrelated files.
- `packages/api/src/services/roadmapGeneration.ts` owns audit roadmap file generation, deterministic fallback content, audit source markdown validation before import, deterministic audit markdown-to-task conversion, and generated task import.
- `packages/shared/src/auditRoadmapContract.ts` owns generated audit card validation, canonical audit marker text, allowed-changes validation, report artifact validation, and implementation-shaped audit text detection.
- `packages/shared/src/auditReportValidator.ts` already rejects `.` as a report-time parsed scope root, but generation-time validation does not reject a source card containing `Scope: .`; that can leave no declared root for later source coverage.
- `packages/shared/src/auditEvidenceLedger.ts` already extracts risk hypothesis IDs from `risk-*` tokens, which gives a compatible local parse target for generated source-card risk hypotheses.
- `packages/agent/src/subagents/implementer.ts` deterministic audit repair currently falls back to `["."]` when no scope roots parse from a task description. A separate queued task covers repair behavior, so this task should focus on generation/import contracts while avoiding broader repair changes unless required by tests.

## Existing Behavior Relevant To This Task

- `validateAuditRoadmapSource()` in `packages/api/src/services/roadmapGeneration.ts` validates extracted source roadmap cards with `validateGeneratedAuditCard()`, report artifact text, implementation-shaped text, and allowed changes checks.
- `validateAuditGeneratedBatch()` validates task descriptions after deterministic conversion, but it also depends on `validateGeneratedAuditCard()` for card-level semantics.
- `buildAuditRoadmapItem()` generates source and synthesis cards. It currently emits `Scope: ...`, manifest requirements mentioning `riskHypotheses`, and finding-level `Risk:` evidence requirements, but it does not emit a concrete `Risk hypotheses:` line.
- `scopeText()` can return `"."` when neither preferred candidates nor fallback candidates exist. Normal projects usually have `README.md`, `package.json`, `src`, `tests`, or similar paths, but the root-scope fallback remains allowed.
- The audit generation prompt asks for `Scope: <3-10 concrete files or directories to inspect>`, but deterministic validation does not enforce that instruction.
- Synthesis card scope is currently report-artifact scope: `all audit/<date>-*-audit.md reports from this audit batch`. This correctly differs from product source scope, but there is no explicit validator that source cards must have product scope while synthesis cards may have report scope.

## Relevant Prior Local Docs

- `docs/rdpi/work/work-20260512-harden-audit-roadmap-generation-guardrails/result.md` records that prompts and deterministic fallback were previously hardened with no-findings proof guardrails, substantive no-findings requirements, and synthesis outcome requirements.
- `docs/rdpi/work/work-20260511-audit-scope-coverage-contract/result.md` records that report validation now parses `Scope:` roots and enforces representative coverage at report validation time.
- `docs/kb/audit-evidence-provenance-contract.md` defines the target model: audit plans declare scope roots and risk hypotheses, source reports bind evidence to both, and trusted no-findings requires coverage of all required scope roots and risk hypotheses.

## Same-Project Memory

Shared-memory recall was not used before plan review because the RDPI planning boundary for this task forbids shared-memory recall before `PLAN PASS` unless explicitly waived. Local intake cards, RDPI records, KB docs, and source files provided enough same-project context for planning.

## Cross-Project Reusable Patterns

No cross-project memory was used. The applicable pattern is local and already visible in this repo: typed audit generation is a fail-closed boundary, and deterministic validators must enforce semantics rather than relying only on prompt wording.

## Rejected Or Stale Memory Candidates

- No shared-memory candidates were queried.
- Existing local memory artifacts under `docs/memory/**` were not treated as authoritative over current source files or current RDPI/KB docs.

## Scope Boundaries

In scope:

- Add deterministic generation/import validation that rejects broad source-card scope such as `.`, repository root only, wildcard/global scope, or unconstrained natural-language scope.
- Add a locally parseable source-card risk hypothesis contract using stable `risk-*` IDs.
- Tie source-card risk hypotheses to concrete scope roots.
- Update deterministic fallback generation to emit concrete product scope roots and risk hypotheses.
- Preserve synthesis cards using report-artifact scope rather than product source scope.
- Add focused regression tests for a botIntevra-like audit request that previously could produce `Scope: .`.

Out of scope:

- Changing runtime deterministic audit repair to emit source inconclusive. That is covered by `work-20260513-deterministic-audit-repair-source-inconclusive`.
- Adding full first-class audit plan persistence or ledger schema changes.
- Running a live botIntevra audit or probing external runtime state.
- Creating or executing follow-up implementation cards in this run.

## Hypotheses

- The smallest compatible risk-hypothesis format is a `Risk hypotheses:` line containing entries like `risk-architecture-scope covers README.md, package.json: boundary or ownership drift...`.
- A shared parser/validator in `auditRoadmapContract.ts` can make both source roadmap validation and generated task validation fail closed without duplicating logic in the API service.
- Synthesis cards should be exempt from product scope and risk hypothesis requirements, but should be explicitly checked for report-batch scope so source-report scope and product audit scope remain separate.
- Deterministic fallback generation should never return `Scope: .`; if no preferred source roots exist, it should use concrete existing repo files such as `README.md`, `AGENTS.md`, `package.json`, project config files, or explicitly named directories.

## Proposed Evidence And Verification Plan

- Shared unit tests in `packages/shared/src/__tests__/auditRoadmapContract.test.ts`:
  - reject source audit cards with `Scope: .`;
  - reject broad natural-language or wildcard source scopes;
  - reject source audit cards missing `Risk hypotheses:`;
  - reject risk hypotheses not tied to declared scope roots;
  - allow synthesis cards with report-artifact batch scope and synthesis outcome requirements.
- API tests in `packages/api/src/__tests__/roadmapGeneration.test.ts`:
  - reject an audit source roadmap containing `Scope: .` before runtime extraction/import;
  - replace invalid generated audit roadmaps with deterministic fallback that contains no source card `Scope: .`;
  - generate a botIntevra-like deterministic audit roadmap with concrete scope roots and parseable `risk-*` hypotheses.
- Focused verification commands:
  - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditRoadmapContract.test.ts`
  - `npm.cmd test --workspace=@aif/api -- src/__tests__/roadmapGeneration.test.ts`
  - `npm.cmd run build --workspace=@aif/shared`
  - `npm.cmd run build --workspace=@aif/api`
  - `npm.cmd run lint --workspace=@aif/shared`
  - `npm.cmd run lint --workspace=@aif/api`
  - `git diff --check`
