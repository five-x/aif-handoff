# Research - Audit Quality System Analysis

## Task framing and lane

- Task ID: `work-20260511-audit-quality-system-analysis`
- Lane: `work`
- User intent: stop repeating narrow fixes for audit roadmap failures, analyze the full platform failure mode, and queue implementation tasks that should close the issue after completion.
- Scope: `aif-handoff` platform code, not the canary repository being audited by AIF.
- Output boundary: planning and task decomposition only. Do not implement child fixes in the same run.
- Token/cost note from user: local model token usage can be ignored as a spend constraint; external model usage and cost should continue to be accounted for.

## Accepted planning sources or local facts

- RDPI preflight: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- Current git state is clean relative to `origin/main` except pre-existing untracked `.bak` files under `docs/kb/**` and `docs/memory/**`; those are unrelated and must not be staged.
- Prior intake `docs/intake/work/work-20260510-harden-audit-roadmap-flow-contract.md` already framed the target as the platform-wide audit roadmap lifecycle, with `botIntevra` only a canary.
- Prior RDPI `docs/rdpi/work/work-20260511-harden-audit-runtime-quality-contract/*` added report-only delta enforcement, deterministic legacy blocking parser, prompt tightening, and report-only commit prompts.
- `packages/shared/src/taskCompletionEvidence.ts` is the current deterministic completion guard. It validates report presence, commit cleanliness, changed files, path references, substantive evidence, and low-quality patterns.
- The low-quality report guard is still pattern-list based. It catches `123abc`, `abc123`, long placeholder hashes, placeholder author metadata, speculative phrases, false missing-path claims, and some governance phrases, but the observed `1234567 (HEAD -> main)` git output is outside the current hash patterns.
- `hasSubstantiveReportEvidence()` treats concrete path-line references plus command output or structured finding fields as substantive. It does not prove that the cited evidence covers the task's declared `Scope:` roots.
- The observed failed report had concrete but weak references to `AGENTS.md`, `README.md`, and `pyproject.toml`; this can satisfy structural evidence while missing scoped product files such as `src` and `src/bot_intevra`.
- The observed report included both findings and a `No Validated Findings` section. The current validator has a positive path for `No validated findings` evidence, but no contradiction detector that rejects mixed finding/no-finding semantics.
- `packages/agent/src/coordinator.ts` has `reworkCompletionEvidenceAlreadySatisfied()`. For `reworkRequested` report tasks it can skip the implementer and go straight back to review when completion evidence is currently `ok`.
- The observed manual `request_changes` rework was skipped by that shortcut because the deterministic evidence guard still returned `ok`; the rework comment itself was not treated as a freshness/content-change requirement.
- `packages/agent/src/reviewGate.ts` can accept review comments when the report artifact appears substantive. Its `requiresSubstantiveReviewEvidence()` path checks the evidence shape, not the full issue result from `evaluateTaskCompletionEvidence()`.
- `packages/agent/src/subagents/reviewer.ts` prompt asks reviewers to block placeholders, fake command output, non-actionable findings, and unverified claims, but the observed review still accepted those issues. Prompt-only review cannot be the primary safety boundary.
- Runtime usage docs in `docs/providers.md` describe `qwen-local-agent` as `UsageReporting.PARTIAL`, with usage recorded only when the llama.cpp-compatible response includes usage fields. `packages/runtime/src/adapters/qwenLocalAgent/api.ts` normalizes token usage and leaves `costUsd` undefined unless the provider reports a cost.
- `packages/agent/src/subagentQuery.ts` passes stage budget fields into `RuntimeExecutionIntent.maxBudgetUsd`; the Qwen local adapter does not appear to enforce a cost budget, while Claude options do forward `maxBudgetUsd`.

## Same-project memory

- Shared memory was not consulted in this planning pass because the RDPI boundary says not to perform shared-memory recall before `PLAN PASS` unless explicitly waived.
- Local docs and code are sufficient to identify the platform gaps.

## Cross-project reusable patterns

- None accepted. This is a local `aif-handoff` audit pipeline contract problem.

## Rejected or stale memory candidates

- No memory candidates were queried.

## Failure model

1. Markdown report quality is validated by scattered evidence heuristics instead of a single audit-report contract.
2. Evidence can be structurally substantive while still failing the actual audit mandate because it does not cover the declared product scope.
3. Human or automatic rework does not invalidate previously accepted completion evidence; the coordinator can skip the implementer even when a rework comment demands report changes.
4. Review gate and completion evidence are not a single source of truth. Review can accept weak artifacts, leaving completion evidence as the only real guard.
5. The current negative tests cover earlier examples, but not the observed combined failure: numeric placeholder git output, mixed findings/no-findings, weak governance findings with concrete doc citations, and manual rework skipped without a report content change.

## Proposed acceptance focus

- A single audit report validator should reject the observed bad report as a fixture, independent of reviewer output.
- Declared audit scope should become machine-checkable coverage evidence.
- Rework should require either a report content change or an explicit, validated no-change closure that addresses the rework reason.
- Review gate should import validator findings as blocking findings rather than relying on sidecar self-assessment.
- Integration coverage should exercise the batch lifecycle from audit report generation through invalid artifact rework and synthesis readiness.
- Local runtimes may record tokens but should not trip paid-spend logic; external runtimes should keep usage and budget behavior.
