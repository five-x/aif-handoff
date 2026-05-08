# Prevent Hallucinated Zero-Delta Task Verification

- Task ID: work-20260508-prevent-hallucinated-zero-delta-verification
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-08
- Due: unset
- Source: user request, 2026-05-08
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification

## Request

Prevent AIF from verifying tasks that produced hallucinated findings, generic or invalid plans, and no meaningful code or report delta. The immediate motivation is the `botIntevra` audit run, where tasks reached `verified` even though the audit output appeared to include non-existent files, weak/generic plan artifacts, and no committed project changes.

## Done When

- AIF has a fail-closed validation path that blocks or requires manual review before `verified` when a task has no meaningful code, documentation, report, or persisted artifact delta.
- Review/audit/discovery tasks must produce a concrete, inspectable report artifact with validated file references before they can be considered complete.
- Findings that reference non-existent files, impossible paths, or unrelated tech stacks are surfaced as hallucination/invalid-evidence risk instead of being treated as actionable project findings.
- Generic plan output such as placeholder "Short task" content is rejected before implementation or verification.
- The UI/API exposes a clear blocked reason so the operator understands whether the issue is zero delta, invalid evidence, missing report artifact, branch isolation, or manual review required.
- Existing valid fast/simple tasks are not broken by the stricter checks.
- The change is covered by tests and is ready to deploy to production after normal validation.

## Constraints

- Intake only for this turn; do not implement the fix or inspect live production runtime as part of intake.
- Follow RDPI before any non-trivial repository change.
- Keep the first implementation narrow: protect verification and audit/review closure without redesigning the whole workflow.
- Preserve legitimate no-code tasks only when they produce an explicit accepted artifact or manual approval path.
- Do not create follow-up implementation tasks from discovered findings during the same run; queue them separately if needed.
- After implementation, use the repository validation path and include focused regression tests for state transitions and review/audit artifacts.

## Notes

- Lane inferred as `work` because this is a product/runtime quality fix for `aif-handoff` before production rollout.
- This task should distinguish project findings from workflow findings: the product bug is allowing unverifiable output to reach `verified`.
- RDPI should identify the exact transition points that can move tasks to `done` or `verified`, then design checks with minimal false positives.
- Completed on 2026-05-08 after TEST PASS, REVIEW PASS, and successful `memsync MODE=auto`.

## Links

- RDPI scaffold: ../../rdpi/work/work-20260508-prevent-hallucinated-zero-delta-verification
