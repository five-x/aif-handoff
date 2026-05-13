# Harden Audit Quality Gate For Substantive Findings

- Task ID: work-20260509-harden-audit-quality-gate
- Server Task ID: fead5a05-6fc5-4e1a-adfb-8f629d36b31b
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-09
- Due: unset
- Source: follow-up from `work-20260509-make-audit-pipeline-toolful`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260509-harden-audit-quality-gate

## Request

Harden the server-67 audit pipeline so audit cards are not accepted merely because an agent used repository tools and committed a report. The previous canary proved mechanical execution, but its report was generic and self-referential rather than a substantive audit.

The current weak canary report should be retired or deleted from the active validation surface during execution, then replaced by new audit quality canaries until the accepted result is both mechanically valid and substantively useful.

## Done When

- A weak generic audit report like `audit/2026-05-09-aif-runtime-canary-audit.md` is rejected, blocked, or sent to rework rather than marked done.
- Audit reports must cite exact existing repository paths and, where practical, line/function/symbol references or command outputs.
- Reports whose evidence is only "this report exists", "the task ran", or similarly circular statements are rejected.
- Auto-review fallback/parser acceptance cannot approve audit output unless substantive review evidence is present.
- Review/security sidecars or the review gate use repository tools while validating audit quality.
- The old weak canary card/output is deleted or clearly retired from active validation after PLAN PASS.
- Live server-67 validation includes at least one negative quality canary and one positive quality canary.
- The accepted positive canary produces a committed report with concrete evidence that a human can inspect.
- RDPI `result.md` records task ids, report paths, tool activity, rework/block evidence, and final accepted quality evidence.
- Independent `TEST PASS` and `REVIEW PASS` gates pass before close-out.
- Mempublish/memsync close-out records only curated non-secret facts.

## Constraints

- Intake only for this turn; do not start or unpause the server task yet.
- Follow RDPI before implementation.
- Before `PLAN PASS`, do not probe live server state, delete live outputs, inspect live logs, or create new validation cards.
- Do not create and execute child implementation tasks in the same run.
- Keep raw secrets out of repository files, task logs, and shared memory.
- Prefer explicit, reviewable code/tests over hidden runtime behavior.
- Keep the task card paused until the operator explicitly says to start or execute it.

## Notes

- Server 67 task card: `fead5a05-6fc5-4e1a-adfb-8f629d36b31b`.
- The task card is paused to avoid auto-queue execution.
- Previous mechanical execution task: `work-20260509-make-audit-pipeline-toolful`.
- Weak canary report to reject during validation: `audit/2026-05-09-aif-runtime-canary-audit.md`.
- Positive mechanical canary task: `6c10a354-13e6-4495-a350-044d764a1329`.
- Negative text-only runtime canary task: `1250d717-9a60-4414-8c38-2f178f6a7e58`.

## Links

- RDPI scaffold: ../../rdpi/work/work-20260509-harden-audit-quality-gate
- Previous RDPI result: ../../rdpi/work/work-20260509-make-audit-pipeline-toolful/result.md
