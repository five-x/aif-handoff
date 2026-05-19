# Plan

## Acceptance criteria

- Deterministic audit fallback roadmap cards use concrete tracked file scopes and avoid hidden/untracked/generated scope roots.
- Deterministic audit fallback risk hypotheses are specific enough for deterministic report generation and do not use generic owner-area filler.
- Non-repairable audit report cards fail before runtime execution instead of invoking `qwen-local-agent`.
- Existing trusted audit reports still close with `auditCardDecision.finalStatus=closed_verified`.
- Targeted tests cover roadmap fallback, implementer pre-runtime guard, and no regression in audit report validation.

## Implementation steps

1. Update `packages/api/src/services/roadmapGeneration.ts`:
   - add tracked/readable audit scope helpers;
   - make `scopeText()` return representative concrete files;
   - remove hidden generated paths from deterministic fallback defaults;
   - make fallback risk hypothesis text path/area-specific.
2. Update `packages/agent/src/subagents/implementer.ts`:
   - add a deterministic terminalization path for first-run audit report cards whose declared scope roots are not locally repairable;
   - include missing/unreadable scope diagnostics in `blockedReason` and implementation log;
   - ensure the runtime query path is not called for that case.
3. Add/update tests:
   - roadmap fallback test proves generated scopes are concrete tracked files and do not include broad `src`, `tests`, `data`, or `.ai-factory` fallback roots when representative files exist;
   - botIntevra-like fallback test proves expected Python files are scoped directly;
   - implementer test proves a non-repairable audit report card terminalizes as `source_inconclusive` without calling the runtime mock.
4. Run targeted verification:
   - `npm.cmd test --workspace=@aif/api -- src/__tests__/roadmapGeneration.test.ts`
   - `npm.cmd test --workspace=@aif/agent -- src/__tests__/implementer.test.ts`
   - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts`
   - `npm.cmd run build --workspace=@aif/api`
   - `npm.cmd run build --workspace=@aif/agent`

## Plan review request

Independent reviewer should check whether this addresses the top-level batch failure rather than only the observed V17 cards.
