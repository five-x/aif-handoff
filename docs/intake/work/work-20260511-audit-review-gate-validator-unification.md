# Review Gate Uses Audit Validator

- Task ID: work-20260511-audit-review-gate-validator-unification
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-11
- Due: unset
- Source: follow-up from `work-20260511-audit-quality-system-analysis`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260511-audit-review-gate-validator-unification

## Request

Unify review gate acceptance with the shared audit report validator. Sidecar review output may add findings, but it must not be able to accept a report artifact that deterministic validation rejects.

## Done When

- Review gate runs or consumes the shared audit report validator for risky audit/review/discovery report artifacts.
- Validator issues are converted into structured blocking findings.
- Completion guard, approve-time checks, review gate, and roadmap batch artifact state agree on report validity.
- Reviewer advisories cannot pass a report with synthetic git evidence, contradictory no-findings semantics, missing scope coverage, or weak governance-only findings.
- Existing advisory-only behavior remains valid when the report passes deterministic validation.

## Constraints

- Do not rely on prompt wording as the primary safety boundary.
- Keep sidecar findings additive.
- Preserve malformed-output manual review behavior where deterministic validation cannot decide.

## Links

- Parent analysis: ../../rdpi/work/work-20260511-audit-quality-system-analysis
