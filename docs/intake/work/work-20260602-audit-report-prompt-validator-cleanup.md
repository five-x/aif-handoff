# Audit Report Prompt And Validator Cleanup

- Task ID: work-20260602-audit-report-prompt-validator-cleanup
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-06-02
- Due: TBD
- Source: Follow-up from work-20260602-aif-agent-workflow-stabilization
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260602-audit-report-prompt-validator-cleanup

## Request

Clean up audit/report prompts into a short positive trusted-finding contract and move blacklist-style enforcement into validator issue codes and tests.

## Done When

- Audit/report prompt net size decreases.
- Prompt requires exact existing `path:line` evidence, concrete broken behavior or unsafe state, proposed fix, observed verification output, and in-scope evidence.
- Long blacklist-style finding exclusions are represented in validator patterns and issue codes instead of prompt text.
- Existing low-quality audit validation tests still pass.
- Negative fabricated audit canary does not promote weak findings.
- Positive no-findings canary produces trusted no-findings without weak filler.

## Constraints

- Do not remove audit/report flow.
- Do not weaken trust validation.
- No prompt-only guardrail may count as completion.
