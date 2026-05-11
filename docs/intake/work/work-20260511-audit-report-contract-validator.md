# Shared Audit Report Contract Validator

- Task ID: work-20260511-audit-report-contract-validator
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-11
- Due: unset
- Source: follow-up from `work-20260511-audit-quality-system-analysis`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260511-audit-report-contract-validator

## Request

Build a shared audit report artifact validator and migrate completion evidence to use it. The validator must reject the observed weak audit report class instead of relying on scattered prompts and narrow regex patches.

## Done When

- The observed bad report fixture is rejected: synthetic git output like `1234567` / `HEAD -> main`, contradictory findings plus `No Validated Findings`, governance/documentation observations presented as technical architecture findings, speculative claims, and fake command output.
- The validator returns typed issue codes usable by completion evidence, review gate, approve flow, and roadmap batch artifact state.
- Valid no-findings reports with checked files/commands still pass.
- Valid findings reports with concrete `path:line` evidence, `Risk:`, `Proposed fix:`, and `Verification:` still pass.
- Existing audit report path and report-only delta behavior remains intact.

## Constraints

- Platform-level `aif-handoff` fix; do not special-case a canary project.
- Prefer deterministic validation over prompt-only guidance.
- Keep validator tests focused and fixture-driven.
- Do not execute child follow-up tasks in the same run.

## Links

- Parent analysis: ../../rdpi/work/work-20260511-audit-quality-system-analysis
