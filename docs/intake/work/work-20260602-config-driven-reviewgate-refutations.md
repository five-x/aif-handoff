# Config-Driven ReviewGate Refutations

- Task ID: work-20260602-config-driven-reviewgate-refutations
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-06-02
- Due: TBD
- Source: Follow-up from work-20260602-aif-agent-workflow-stabilization
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260602-config-driven-reviewgate-refutations

## Request

Move project-specific ReviewGate refutations out of generic code and into config-driven providers.

## Done When

- Generic `reviewGate.ts` contains no hardcoded project/business example terms such as prior LoanOffer-specific exceptions.
- Project-specific refutations load through explicit config/provider entries with ids, path scopes, claim patterns, and proof handlers.
- Existing behavior is preserved through config-driven tests.
- Tests prove generic ReviewGate code has no project-specific terms.

## Constraints

- Do not remove ReviewGate.
- Do not weaken blocking review findings.
- Preserve existing generic review behavior outside configured exceptions.
