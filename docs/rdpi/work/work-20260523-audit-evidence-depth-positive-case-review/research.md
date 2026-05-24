# Research

Task ID: `work-20260523-audit-evidence-depth-positive-case-review`
Lane: `work`
RDPI Needed: `yes`

## Task Framing And Lane

This is a diagnostic review task in the `work` lane. The intake asks whether the current no-findings evidence-depth gate is too strict for legitimate reports where substantive evidence is necessarily compact: small files, config-only files, empty-file proof, narrow scoped roots, targeted runtime/test command output, and other behavior-relevant short evidence.

The task is explicitly diagnostic-only. It must not change production code and must not loosen rejection of generic, inventory-only, path-only, or reused evidence. Any confirmed false negative must become a separate queued implementation task with exact reproduction and desired behavior. Any missing positive regression case should be attached to the existing evidence-depth corpus follow-up.

## Accepted Planning Sources Or Local Facts

- `AGENTS.md` confirms this is a Node/TypeScript repository and identifies `docs/rdpi/` as the task history source of truth. It also requires local repo facts before memory recall and preserves audit/review/discovery tasks as diagnostic unless implementation is explicitly requested.
- `docs/intake/work/work-20260523-audit-evidence-depth-positive-case-review.md` is the immutable task intent. It defines the positive-case review scope, done-when criteria, constraints, and verification plan.
- `docs/intake/work_status.json` lists the selected task as queued, high priority, RDPI-backed, and mapped to `docs/rdpi/work/work-20260523-audit-evidence-depth-positive-case-review`.
- `docs/rdpi/work/work-20260522-harden-audit-evidence-depth-gates/result.md` records the recently implemented evidence-depth hardening, including no-findings depth assessments, rejection reason codes, risk-specific evidence requirements, and broad test coverage.
- `docs/rdpi/work/work-20260523-adversarial-audit-evidence-depth-bypass-review/result.md` records the known command-query-output false positive. This review must not treat that bypass as a legitimate positive case.
- `docs/rdpi/work/work-20260523-audit-synthesis-trust-propagation-review/result.md` records that downstream trust propagation fails closed for shallow or inconclusive no-findings evidence, so this task can stay focused on source-report positive cases unless evidence shows a broader gap.
- Explorer subagent planning review confirmed the task framing, accepted local planning sources, source-validator-first scope, and the need to defer live evidence collection until after `PLAN PASS`.

## Same-Project Memory

Not consulted before `PLAN PASS`. The RDPI boundary for audit/review work prohibits shared-memory recall before the plan gate unless explicitly waived.

After `PLAN PASS`, shared-memory status was healthy with 1979 processed items. A local-mode recall for the exact positive-case/evidence-depth topic returned no context. A broader hybrid lookup returned older project notes for source report classification and deterministic synthesis closeout:

- `docs/memory/tasks/work/work-20260512-align-source-report-classification-delta.md`: source report validation rejects inventory-only no-findings before synthesis and counts only trusted source classifications.
- `docs/memory/tasks/work/work-20260514-deterministic-audit-synthesis-closeout-delta.md`: weak or inconclusive reports can unblock synthesis as untrusted inputs but cannot support validated findings or validated no-findings.

These memory candidates are accepted only as background. They do not override current local source, test, and RDPI evidence.

## Cross-Project Reusable Patterns

Not consulted before `PLAN PASS`. No cross-project pattern is needed for the planning gate, and local audit-validator artifacts outrank reusable memory for this repo-specific diagnostic.

## Rejected Or Stale Memory Candidates

- Exact local-mode memory recall for this task returned no context, so it was not used as evidence.
- Operational deployment memory returned by the broader query was unrelated to this source-validator diagnostic and was ignored.

## Planning Hypotheses

- H1: The current gate already accepts legitimate positive no-findings reports when compact evidence is risk-specific, scoped, and substantive.
- H2: Empty-file proof may be a legitimate positive case only when the empty content itself is behavior-relevant to the declared risk and is bound to exact scope plus evidence IDs or exact command output.
- H3: Config-only and small-file reports should pass when the cited line content resolves the risk hypothesis, even if the evidence is short.
- H4: Targeted runtime/test command output should pass when the output itself contains behavior-relevant facts, but not when only the command query carries the risk term.
- H5: If any legitimate compact report currently fails, the fix belongs in a separate implementation card rather than this diagnostic task.
