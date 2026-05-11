# Plan - Harden Audit Runtime Quality Contract

1. Update shared completion evidence.
   - Add `unexpected_non_report_changes` to `TaskCompletionIssueCode`.
   - Add `unexpectedNonReportChangedFiles` to the evidence payload.
   - In completion phase, when a risky task has an expected report artifact, fail if meaningful changed files include anything other than that report artifact.
   - Include a clear blocked reason naming the unexpected file list.

2. Update audit failure taxonomy.
   - Map `unexpected_non_report_changes` to `invalid_artifact_content` in `auditRoadmapContract.ts`.
   - Add or adjust tests for the mapping.

3. Add completion-evidence regression tests.
   - Audit task with declared report artifact plus committed `AGENTS.md` fails.
   - Clean committed report-only audit still passes.
   - Dirty extra non-report file also fails.

4. Add deterministic legacy review blocking parser.
   - Implement section parser in `reviewGate.ts`.
   - Use it before the model fallback when at least one `Blocking Findings` section is present.
   - Preserve existing model fallback when legacy comments have no parseable blocking section.

5. Add review-gate regression tests.
   - Legacy advisory-only review with `Blocking Findings: none` returns success if report evidence is substantive.
   - Legacy review with a non-none blocking bullet returns request changes.
   - Existing structured review tests continue to pass.

6. Tighten audit evidence repair prompt.
   - Update `packages/agent/src/subagents/implementer.ts` audit repair instructions to require a bounded report-only transaction and no repeated empty commits.
   - Add/adjust prompt tests if existing implementer prompt tests cover this section.

7. Tighten report-only commit prompts.
   - Update `packages/api/src/services/commitGeneration.ts` so generic commits still use `git add -A`.
   - When a task is risky/report-intent and declares an expected report artifact, generate a prompt that stages only that artifact and leaves other changed files unstaged.
   - Add/adjust `commitGeneration` tests for both generic and report-only behavior.

8. Verification commands.
   - `npm.cmd test --workspace=@aif/shared -- src/__tests__/taskCompletionEvidence.test.ts src/__tests__/auditRoadmapContract.test.ts`
   - `npm.cmd test --workspace=@aif/agent -- src/__tests__/reviewGate.test.ts src/__tests__/implementer.test.ts`
   - `npm.cmd test --workspace=@aif/api -- src/__tests__/commitGeneration.test.ts`
   - If focused tests pass, run `npm.cmd run lint --workspace=@aif/shared`, `npm.cmd run lint --workspace=@aif/agent`, and then broader build if the touched package graph requires it.

## PLAN PASS Criteria

- The plan stays scoped to `aif-handoff` platform code.
- No change depends on `botIntevra` paths, branches, logs, or database state.
- The deterministic guard catches the observed non-report edit class.
- The review-gate change removes advisory-only manual-review loops without accepting malformed/no-evidence audit closures.
- The commit workflow no longer encourages broad staging for report-only audit cards.
