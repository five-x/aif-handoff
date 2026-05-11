# Audit Inconclusive Synthesis Gate

- Task ID: work-20260511-audit-inconclusive-synthesis-gate
- Lane: work
- Status: backlog
- Priority: high
- Created: 2026-05-11
- Due: unset
- Source: follow-up from live `audit-v7` synthesis review
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260511-audit-inconclusive-synthesis-gate

## Request

Harden the audit batch synthesis and completion flow so AIF does not treat a technically valid but substantively inconclusive audit as a successful product-quality audit.

The observed failure class is `audit-v7`: all source audit reports ended as deterministic or weak `No validated findings` reports, and the synthesis card reached `done` after writing a valid evidence-shaped summary. That result is structurally valid for the report artifact validator, but it is not a reliable conclusion that the audited product has no technical-quality problems.

## Done When

- Audit synthesis distinguishes at least these outcomes: validated findings present, validated no-findings with substantive owner-grade evidence, and inconclusive batch evidence.
- A synthesis card whose source reports are all deterministic repair/fallback reports, weak coverage reports, or no-findings reports backed only by inventory/existence checks does not close as a successful audit conclusion.
- The UI/API-visible blocked or done reason makes the distinction clear: `No validated findings` means no findings survived evidence validation, while `Audit inconclusive` means the batch did not perform enough substantive inspection to support a product-quality conclusion.
- Completion evidence, review gate, roadmap batch artifact state, and deterministic synthesis output use one shared classification so they cannot disagree.
- Regression tests cover the live failure class: six source reports with zero included findings, evidence limited to `git ls-files`/file existence, and final synthesis previously accepted as `done`.
- Regression tests cover a valid no-findings audit that should still pass when it includes substantive commands and scoped file/line evidence, not just inventory.
- The change is platform-level and project-agnostic; it must not special-case `botIntevra`, `audit-v7`, branch names, or specific file paths from the live run.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Do not create child fix tasks in the same run.
- Prefer deterministic classifiers and fixture-based tests over prompt-only wording.
- Keep local runtimes token-cost semantics unchanged: local model token use may be recorded but must not be treated as paid external cost.
- Do not weaken the current path/reference/evidence guard just to make inconclusive reports pass.

## Links

- Live synthesis task: http://192.168.88.67/project/e4a3a101-ec7f-4f93-9b68-e297ffe8952f/task/ca121bae-e977-47fb-864f-7c006c5e262a
- Related completed work: ../../rdpi/work/work-20260511-audit-report-contract-validator
- Related completed work: ../../rdpi/work/work-20260511-audit-review-gate-validator-unification
- Related completed work: ../../rdpi/work/work-20260511-audit-batch-integration-canary
