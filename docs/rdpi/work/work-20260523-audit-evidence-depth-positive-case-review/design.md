# Design

Task ID: `work-20260523-audit-evidence-depth-positive-case-review`

## Scope

Run a diagnostic source-depth positive-case review. The work product is an RDPI result that enumerates legitimate accepted no-findings evidence shapes, checks representative scenarios against the current gate, records whether any false negative exists, and points any missing positive regression coverage at the queued evidence-depth corpus task.

## Non-Goals

- Do not edit production code.
- Do not edit validator tests as part of this diagnostic task.
- Do not loosen existing generic, inventory-only, path-only, query-only, or reused-evidence rejection.
- Do not execute the separate command-output-depth hardening task.
- Do not treat downstream trust propagation as the main subject unless source-positive evidence reveals a propagation-specific issue.

## Evidence Model

Expected accepted positive shapes:

1. Small-file source proof: exact `path:line` evidence from a narrow scoped root, with line content that directly resolves the risk hypothesis.
2. Config-only proof: scoped config line evidence showing the relevant value, guard, disabled option, validation rule, or absence of risky setting in a way tied to the risk claim.
3. Empty-file proof: exact scoped file identity plus an evidence record showing the file has no content, paired with a risk hypothesis where emptiness is behavior-relevant.
4. Narrow scoped root proof: every declared root has at least one scoped substantive citation or ledger unit covering the declared risk, with no reliance on broad inventory.
5. Targeted runtime/test output proof: command output itself contains behavior-relevant facts, not merely a risk term in the command query.
6. Ledger-backed proof: cited evidence units are substantive, scoped, risk-bound, and referenced by manifest no-findings claims.

Expected rejected shapes remain rejected:

- Inventory-only file lists, broad `git ls-files`, `ls`, `find`, or generic dot-grep dumps.
- Path-only risk matches where the risk term appears only in filenames or paths.
- Reused snippets applied to unrelated risks.
- Query-only command output where the output line does not contain behavior-relevant risk evidence.
- Bare no-findings prose without scoped evidence.

## Review Method

After `PLAN PASS`, inspect the validator and current tests to identify existing positive coverage, then run focused one-off validator checks for representative compact scenarios. Prefer source-validator checks first because the intake is about evidence-depth strictness. Expand to synthesis/implementer tests only to verify existing positive coverage, not to perform a broad trust-propagation audit.

## Artifact Strategy

- `result.md` will contain the positive-case matrix, current-gate observations, commands run, gate verdicts, and follow-up decisions.
- If a false negative is confirmed, create a separate intake card plus empty RDPI scaffold; do not implement it.
- If coverage is missing but behavior is acceptable, attach the missing regression to `work-20260523-expand-audit-evidence-depth-regression-corpus` without running that task.

## Risk Controls

- Keep the known command-query-output bypass separate and reference it only as a boundary condition.
- Use exact reproduction shapes for any false negative.
- Keep all one-off checks diagnostic and avoid modifying production or test code.
- Require independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` before marking the task done.
