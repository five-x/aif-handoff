# Design: Reject Weak Audit Plans In Plan Checker

## Design goal

Extend the existing deterministic plan-quality guard so audit plans cannot reach implementation unless they are scoped enough to review and execute.

This task is a pre-implementation plan gate hardening. It does not add audit runtime evidence capture, generic task hierarchy schema, or new roadmap generation behavior.

## Chosen approach

Keep `packages/shared/src/planQuality.ts` as the semantic source of truth and keep `packages/agent/src/subagents/planChecker.ts` as the enforcement point.

Add audit-only plan-quality checks that run after the existing generic checks:

- scoped evidence targets are declared;
- explicit excluded areas are declared, with `none` accepted only when stated intentionally;
- expected report structure is declared;
- child audit report requirement is declared;
- broad audit requests classified as requiring decomposition fail unless the plan itself is a decomposed audit plan.

Use existing `TaskPlanQualityError` and issue messages for plan-review feedback. The coordinator already turns these failures into planner feedback and bounded retries.

## Audit plan contract

For audit or inferred diagnostic audit tasks, an acceptable plan must include all of:

- `Report artifact:` or another recognized audit report path;
- diagnostic-only/report-only constraint;
- scoped evidence targets, such as `Scope:`, `Evidence targets:`, `Scoped evidence targets:`, or concrete files/directories tied to the audit;
- explicit exclusions, such as `Excluded areas:` or `Out of scope:`, including an explicit `none` value when no exclusions exist;
- expected report structure naming finding ID, severity or confidence, evidence, risk, proposed fix, and verification;
- child-report decision, either:
  - no child audit reports are required for a narrow audit, or
  - child/source reports plus synthesis are required for a decomposed audit.

The marker names can be flexible, but the semantic facts must be present.

## Broad and decomposed audit plans

Reuse `classifyAuditDecompositionRequest()` against the task text plus plan text.

If the classifier returns `requiresDecomposition: true`, the plan must have a decomposed-audit shape:

- it explicitly says child/source audit reports are required;
- it names at least two report artifact paths or clearly names source report artifacts plus a synthesis/final report artifact;
- it includes synthesis status/outcome expectations for child report results.

If those facts are absent, fail with feedback that names the decomposition gap and classifier reasons.

For narrow audit plans, require the explicit no-child decision. This keeps single-card audits valid when they are concrete and scoped.

## Deterministic fallback behavior

Keep deterministic fallback only for malformed narrow diagnostic plans that have enough task text to identify a valid report artifact and do not require decomposition.

Update the fallback plan shape to include:

- scoped evidence targets derived from task-mentioned paths and report artifact;
- excluded areas, defaulting to generated/build/cache/vendor paths when no explicit exclusions are in task text;
- expected report structure;
- child audit reports: not required for this narrow source report.

Do not use fallback to turn broad unbounded audit work into a pass. Broad audit plans should fail with plan-quality feedback and go back through replanning/decomposition.

## Non-audit workflow protection

The new checks must be gated to `taskIntent === "audit"` or legacy inferred diagnostic audit tasks. Explicit `taskIntent: "general"` and normal feature/fix/docs/tests plans must remain unaffected.

This preserves AIF Handoff as a general autonomous handoff platform while strengthening the audit workflow.

## Allowed before PLAN PASS

- Read local task card, repo guidance, source files, tests, local docs, and local curated memory documents.
- Write `research.md`, `design.md`, and `plan.md`.
- Ask the independent plan reviewer for `PLAN PASS` or `PLAN FAIL`.

## Not allowed before PLAN PASS

- Code edits in source/test files.
- Runtime service checks, scheduler reads, worker report inspection, endpoint checks, downstream runtime/config reads, or log inspection.
- Shared-memory MCP recall.
- Running implementation/test commands as evidence.

## Risks and mitigations

- Risk: over-rejecting non-audit plans. Mitigation: gate checks on audit intent and add a non-audit regression test.
- Risk: rejecting valid narrow audits because marker wording differs. Mitigation: accept several marker variants while requiring concrete semantic facts.
- Risk: broadness classifier conflicts with concrete scope/report markers. Mitigation: require broad signals to be considered before allowing broad direct plans, matching the existing decomposition task's final review finding.
- Risk: deterministic fallback masks weak plans. Mitigation: bypass fallback for decomposition-required audits and make fallback include the full audit plan contract.
