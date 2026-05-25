# Typed Structured Review Errors

- Task ID: work-20260525-typed-structured-review-errors
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-25
- Due: after P0 trusted audit artifact tasks
- Source: External independent review `operator-supplied external review file aif-independent-code-review-6713a389.md` for commit `6713a389e326cadbeeb5f7c244f491a02ec15c55`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260525-typed-structured-review-errors`

## Request

Replace null/ambiguous structured review parser failures with typed parse errors and machine-actionable reason codes.

The parser must distinguish malformed review output from valid fail/pass review output and expose actionable parse failures such as missing required sections, duplicate rows, missing verdicts, pass-with-blockers, missing security coverage, missing previous findings coverage, and evidence-free pass claims.

## Done When

- Structured review parsing returns a typed success or typed parse-error result, not `null`.
- Parse errors include stable issue codes and a deterministic fingerprint.
- First malformed output routes to rework with exact repair instructions.
- Repeated same fingerprint routes to manual block or operator input instead of generic retry churn.
- Tests cover missing Security Coverage, duplicate rows, missing Previous Findings, missing verdict, PASS with blockers, and PASS without concrete evidence.

## Constraints

- Do not weaken review gate fail-closed behavior.
- Do not treat malformed structured review output as pass.
- Do not run local AIF service, local browser, or local e2e checks. Runtime/e2e verification is remote-only against `192.168.88.67`.
- This intake card does not execute the task.

## Verification Plan

- Parser unit tests for each typed error.
- Review gate routing tests for first failure versus repeated same fingerprint.
- `npm.cmd test --workspace=@aif/agent -- reviewer`
- `npm.cmd test --workspace=@aif/shared -- review`
- `npm.cmd run lint`
- `npm.cmd run build`
