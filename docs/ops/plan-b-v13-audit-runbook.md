# Plan B V13 Audit Runbook

## Scope

Use this runbook when creating or inspecting Plan B audit cards. It is for operators who decide whether an audit request should be one card or a decomposed parent audit, inspect child source reports, and retry blocked audit work.

This document is operator guidance only. It does not claim Plan B v13 is a separately deployed release. The approved task scope is documentation for behavior covered by completed implementation and regression artifacts, as recorded in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:8](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L8) and [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:49](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L49).

Do not use this runbook to execute audit cards, create child implementation tasks, or infer hidden runtime behavior. If the card state, report artifact, or source code disagrees with this runbook, treat the visible artifact and source reference as authoritative and report the mismatch.

## Operator Model

Plan B audit work has three visible operator surfaces:

- The audit card: the unit operators create, inspect, block, retry, or supersede.
- The report artifact: the written evidence output from an audit card.
- The synthesis artifact: the final parent report for a decomposed audit batch.

For narrow audits, one card can produce one report. For broad audits, the parent request is decomposed into child source-report cards plus exactly one final synthesis card. Current synthesis readiness is roadmap-batch based rather than a generic task hierarchy, as noted in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:47](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L47).

## One Card Or Decomposed Parent

Create one audit card when the request has a concrete boundary:

- a named file, folder, component, API route, or behavior;
- explicit report expectations;
- enough scope to inspect directly without dividing by subsystem, risk class, or owner area.

Create a decomposed parent audit when the request is broad, repository-wide, comprehensive, owner-grade, multi-domain, or lacks source boundaries. Direct broad audit creation is expected to reject with `AUDIT_DECOMPOSITION_REQUIRED`, traced in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:16](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L16) and implemented around [packages/api/src/routes/tasks.ts:187](../../packages/api/src/routes/tasks.ts#L187).

The classifier separates `single_report` from `decomposed_report_batch`. Broad audit classification is documented in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:17](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L17), while narrow single-report exceptions are documented in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:18](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L18).

When in doubt, do not force a broad request into one card. Ask for source boundaries or create a decomposed parent audit.

## Decomposed Parent Shape

A decomposed parent audit should have:

- 6 to 12 small child audit cards;
- concrete source scopes for every child;
- risk hypotheses for every child;
- one report artifact per child;
- exactly one final synthesis task;
- a child report status table before overall synthesis.

These requirements come from the audit roadmap generator prompt, summarized in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:19](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L19) and located around [packages/api/src/services/roadmapGeneration.ts:1173](../../packages/api/src/services/roadmapGeneration.ts#L1173).

Do not add implementation cards under the same parent during the audit run. Audit, review, discovery, and gap-analysis tasks can identify follow-up work, but follow-up implementation must be queued separately.

## Child Source Report Expectations

Each child source report should be independently useful to the final synthesis operator. A valid child report should include:

- the child card ID and source scope inspected;
- findings with stable IDs;
- severity or confidence for each finding;
- exact evidence paths and line references where possible;
- risk and operational impact;
- proposed fix or follow-up intake recommendation;
- verification notes for what was checked;
- explicit no-findings text when no issue is found.

If a child cannot reach a firm conclusion, it should say why. Do not convert `source_inconclusive`, `terminal_inconclusive`, or `manual_exception` into a validated no-findings report. Those states can release the parent for synthesis accounting, but they are not trusted valid evidence. This distinction is recorded in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:22](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L22) and [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:48](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L48).

## Reviewer Unresolved Facts

Reviewers should report unresolved facts back to implementation when the source report leaves an operator unable to decide whether the child is valid, inconclusive, blocked, or needs rework.

Report unresolved facts as concrete questions tied to source paths or report sections. Examples:

- "The report claims route-level rejection but does not cite the API path or response code."
- "The child excludes generated docs but does not say whether managed docs are in or out of scope."
- "The finding lists risk but no evidence path."
- "The no-findings conclusion does not identify inspected files."
- "The report says blocked by parent readiness, but this is a source child and should provide its own evidence."

Do not ask implementation to "improve the report" without naming the missing fact. A retry should have a substantive target: missing source boundary, missing evidence, missing exclusion, missing status rationale, or a corrected child/source-report decision.

## Weak Plan Rejection

Reject weak audit plans before execution. A plan is weak when it omits:

- scoped evidence targets or source boundaries;
- exclusions;
- expected report fields;
- whether child or source reports are required;
- required decomposition for a broad audit.

The plan-quality gate records these requirements in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:21](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L21), with source checks around [packages/shared/src/planQuality.ts:479](../../packages/shared/src/planQuality.ts#L479), [packages/shared/src/planQuality.ts:497](../../packages/shared/src/planQuality.ts#L497), [packages/shared/src/planQuality.ts:515](../../packages/shared/src/planQuality.ts#L515), and [packages/shared/src/planQuality.ts:527](../../packages/shared/src/planQuality.ts#L527).

Operator action: send the card back for plan correction. Do not retry execution until the plan names the evidence scope, report shape, and decomposition decision.

## Parent Synthesis Rules

The parent synthesis should not run as a substitute for missing child evidence. It should wait until child source artifacts are either trusted valid or explicitly terminal in a state that synthesis can account for.

Synthesis can account for these child outcomes:

- valid report artifact;
- invalid report artifact;
- missing report artifact;
- externally blocked child;
- `source_inconclusive`;
- `terminal_inconclusive`;
- `manual_exception`.

The data-layer readiness rule is summarized in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:22](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L22), and the synthesis input accounting is summarized in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:23](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L23).

The synthesis report must preserve child status differences. A terminal inconclusive child should appear as inconclusive or terminal in the synthesis status table, not as a clean pass. A manual exception should include the operator justification.

## Blocked Cards And Retry

Treat blocked audit cards by reason, not by parent/child label alone.

`synthesis_not_ready` means the parent synthesis is waiting for child audit batch artifacts. Operators should inspect child report states, not retry the synthesis blindly. The source path for this blocked family appears around [packages/data/src/index.ts:3052](../../packages/data/src/index.ts#L3052) and [packages/agent/src/coordinator.ts:540](../../packages/agent/src/coordinator.ts#L540).

`stalled_rework_loop` means repeated review cycles hit the same blocker. The card is terminalized as externally blocked with manual review required and preserved diagnostics. This is summarized in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:24](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L24), with source handling around [packages/agent/src/autoReviewHandler.ts:278](../../packages/agent/src/autoReviewHandler.ts#L278) and [packages/agent/src/coordinator.ts:609](../../packages/agent/src/coordinator.ts#L609).

`no_substantive_rework_delta` means the artifact did not materially change between rework attempts. The report artifact SHA check is summarized in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:25](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L25), with coordinator handling around [packages/agent/src/coordinator.ts:656](../../packages/agent/src/coordinator.ts#L656).

Retry only when there is a concrete reason to expect a different outcome:

- the plan now names missing evidence targets or exclusions;
- the child report has a substantive artifact change;
- the blocked reason was external and the external condition changed;
- an operator supplies a manual exception justification;
- an old broad single-card audit is superseded by a new decomposed parent.

Do not use retry to clear diagnostics. Preserve the blocked reason and report it in the parent synthesis or superseding parent notes.

## V13 Prompt Pack

Use these prompt constraints when creating or reviewing Plan B audit prompts:

```text
Create an owner-grade diagnostic audit.

If the request is broad, repository-wide, comprehensive, multi-domain,
owner-grade, or lacks concrete source boundaries, decompose it into a
decomposed_report_batch.

For a decomposed audit:
- create 6 to 12 small source audit children;
- assign each child a concrete source scope;
- include a risk hypothesis for each child;
- require exactly one report artifact from each child;
- create exactly one final synthesis task;
- require the synthesis to include a child report status table before
  the overall conclusion.

For a single-report audit:
- allow one card only when the scope is narrow and concrete;
- require scoped evidence targets or source boundaries;
- require exclusions;
- require expected report fields;
- state whether child/source reports are required or not required.

For every report:
- cite exact source paths for findings;
- include finding ID, severity or confidence, evidence, risk, proposed
  fix, and verification;
- include explicit no-findings text when no issue is found;
- do not treat inconclusive or manual-exception children as validated
  no-findings.
```

The no-findings and synthesis outcome requirements are recorded in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:20](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L20), with prompt-pack source near [packages/shared/src/auditRoadmapContract.ts:126](../../packages/shared/src/auditRoadmapContract.ts#L126).

## Cleanup For V10 V11 V12 Cards

Do not delete old v10, v11, or v12 audit cards. The cleanup policy is preservation plus supersession.

Use this procedure:

1. Identify old broad single-card audits and old child cards that do not meet the current source-report bar.
2. Record that the old card is superseded by a new decomposed parent audit in card comments, operator notes, or the new parent report.
3. Preserve old report artifacts as historical context only.
4. Reuse old report evidence only when it already has concrete source scope, evidence paths, report fields, and no-findings or inconclusive status text that meets this runbook.
5. If an old child is blocked, retry it only after a corrected plan or substantive report update exists.
6. If old cards cannot be cleanly migrated, create a fresh decomposed parent audit and link back to old card IDs, old report artifacts, and the reason each old card was not reused.

The durable cleanup gap is the reason this runbook exists, as recorded in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:32](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L32). The rejected cleanup shortcut is "delete old cards and rerun"; that is explicitly rejected in [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:46](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L46).

If the product does not expose an obsolete or superseded status, leave the current blocked or manual-review diagnostics intact and record the superseding parent in visible notes.

## Operator Checklist

Before starting an audit:

- Is the scope narrow enough for one card?
- If broad, did the request become a decomposed parent audit?
- Does every child have a concrete source scope and risk hypothesis?
- Does the plan state report fields, exclusions, and child/source-report requirements?

Before accepting a child report:

- Does it cite exact source paths?
- Does every finding have ID, severity or confidence, evidence, risk, proposed fix, and verification?
- If no findings were found, does it explicitly say what was inspected?
- If inconclusive, does it explain why and preserve that status?

Before retrying a blocked card:

- Is the blocked reason `synthesis_not_ready`, `stalled_rework_loop`, `no_substantive_rework_delta`, or an external blocker?
- Is there a corrected plan, substantive report delta, changed external condition, or manual exception?
- Are old v10/v11/v12 cards preserved and linked rather than deleted?

Before accepting parent synthesis:

- Does it include the child report status table before the overall conclusion?
- Does it distinguish valid, invalid, missing, blocked, inconclusive, terminal, and manual-exception child outcomes?
- Does it avoid turning terminal or manual-exception children into validated no-findings?

## Source References

- Task scope and audience: [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:8](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L8), [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:9](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L9), [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:10](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L10).
- Dedicated sibling runbook rationale: [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:14](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L14), [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:58](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L58).
- Broad versus narrow audit routing: [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:16](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L16), [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:17](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L17), [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:18](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L18).
- Decomposition and prompt requirements: [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:19](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L19), [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:20](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L20).
- Weak-plan rejection: [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:21](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L21).
- Parent synthesis readiness and accounting: [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:22](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L22), [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:23](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L23).
- Blocked and terminalized rework: [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:24](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L24), [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:25](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L25), [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:26](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L26).
- Legacy cleanup gap and rejected shortcuts: [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:32](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L32), [docs/rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md:46](../rdpi/work/work-20260513-plan-b-v13-audit-runbook/research.md#L46).
