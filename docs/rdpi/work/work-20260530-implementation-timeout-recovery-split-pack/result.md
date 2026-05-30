# Result

## Summary

Implemented an implementation timeout recovery pack flow.

- Implementer runtime exhaustion and wrapper stage timeouts now fail closed with `implementation_runtime_exhausted_requires_split` before same-scope retry, runtime fallback, or audit post-write recovery can run.
- The coordinator records a sanitized `recovery_pack` task stage artifact and creates or reuses a pending `implementation_recovery` task split proposal.
- Recovery proposals use a deterministic sanitized fingerprint and never approve, create, wake, or execute child tasks from the timeout path.
- Recovery packs include task state, changed-file digest/summary, checklist and verification summaries, remaining acceptance work, and proposed next child specs.
- Repository-inspection budget exhaustion remains on the existing audit-specific source-inconclusive path rather than generic implementation recovery.
- API docs now describe implementation recovery as a task split proposal source and clarify `agent:wake` behavior on proposal approval.

## Files Changed

- `packages/agent/src/implementationRecoveryPack.ts`
- `packages/agent/src/__tests__/implementationRecoveryPack.test.ts`
- `packages/agent/src/stageErrorHandler.ts`
- `packages/agent/src/__tests__/stageErrorHandler.test.ts`
- `packages/agent/src/coordinator.ts`
- `packages/agent/src/__tests__/coordinator.test.ts`
- `packages/data/src/__tests__/index.test.ts`
- `packages/shared/src/types.ts`
- `docs/api.md`
- `docs/rdpi/work/work-20260530-implementation-timeout-recovery-split-pack/research.md`
- `docs/rdpi/work/work-20260530-implementation-timeout-recovery-split-pack/design.md`
- `docs/rdpi/work/work-20260530-implementation-timeout-recovery-split-pack/plan.md`

## Verification

- `npm.cmd test --workspace=@aif/agent -- implementationRecoveryPack stageErrorHandler coordinator` - pass
- `npm.cmd test --workspace=@aif/data -- index` - pass
- `npm.cmd run format:check` - pass
- `npm.cmd run lint` - pass with an existing unrelated warning in `packages/agent/src/subagents/reviewer.ts`
- `npm.cmd test` - pass
- `npm.cmd run build` - pass

## Gates

- `PLAN PASS` - independent reviewer after RDPI artifact revision.
- `TEST PASS` - independent tester after the post-write audit timeout ordering fix.
- `REVIEW PASS` - independent reviewer after the post-write audit timeout ordering fix.

## Notes

- The first review gate found an ordering bug where audit post-write timeout recovery could bypass the recovery pack path. The implementation was revised so implementation runtime exhaustion is handled first, and a regression now covers that scenario.
- Memsync auto completed with status `skipped`: no publishable curated documents.
- No follow-up child tasks were created or executed during this run.
