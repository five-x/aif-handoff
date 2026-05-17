# Research

## Task framing and lane

- Task: `work-20260515-harden-audit-report-runtime-rework`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260515-harden-audit-report-runtime-rework.md`.
- RDPI needed: yes.
- Scope: harden strict audit report repair so deterministic repair is the only authority that can repair manifest-bearing audit report artifacts; after deterministic repair fails validator requirements, runtime/model rewrite must not hand-author a repaired `audit-report-manifest`.

## Accepted planning sources or local facts

- `AGENTS.md` and `.agents/skills/rdpi/SKILL.md` require local repo facts first, planning-only RDPI artifacts before `PLAN PASS`, and independent plan/test/review gates.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`; no mixed-intake-model quarantine was required.
- The intake card requires fail-closed behavior: deterministic audit report repair must emit a validator-valid strict report or terminalize the source as `source_inconclusive`; runtime/model rewrite must not claim repaired strict manifests that still fail `invalid_report_manifest`, `missing_scope_coverage`, `missing_substantive_evidence`, or related checks.
- `docs/kb/audit-evidence-provenance-contract.md` defines the trust boundary: inventory-only evidence cannot prove no-findings, source snapshots and evidence refs must bind report claims, and `source_inconclusive` is terminal non-trusted rather than trusted valid.
- `packages/shared/src/auditReportValidator.ts` already validates strict manifest shape, required fields, content hash, source snapshot identity, manifest outcome, evidence refs, scope coverage, risk hypotheses, and substantive evidence.
- `packages/agent/src/subagents/implementer.ts` currently has the unsafe runtime boundary:
  - `runDeterministicAuditReportRepair()` can return `runtime_rework_required` after deterministic repair fails strict validation.
  - `persistDeterministicAuditRepairRuntimeRework()` records `rework_requested` and its diagnostics explicitly allow one normal runtime implementation attempt.
  - `runImplementer()` continues into the model prompt after first failed deterministic repair and after repeated deterministic repair.
- Existing implementer tests currently encode the unsafe behavior: repeated deterministic audit report repair calls the runtime query and expects `Runtime implementer result`.
- `packages/agent/src/reviewGate.ts` regenerates deterministic validator findings from completion evidence, but previous finding closure evidence is regex-based; strict audit report blocker closure should remain fail-closed unless the current validator evidence is actually clean.
- `packages/data/src/index.ts` excludes terminal audit artifacts from active pipeline counts and allows explicitly terminal source artifacts to release synthesis accounting without counting as trusted valid. This task should preserve fail-closed trusted-success accounting.
- Explorer gate result: current code contradicts the earlier intended decision by still routing repeated strict deterministic failures to runtime implementation; likely edit points are `implementer.ts`, `reviewGate.ts`, `implementer.test.ts`, and narrow data/auto-queue tests if synthesis readiness behavior needs lock-in.

## Same-project memory

- Local memory/task delta for `work-20260513-make-audit-report-rework-deterministic-until-valid` records validated decisions:
  - deterministic report repair must self-validate before review handoff;
  - repeated strict validator failures should terminalize with exact validator issue codes instead of falling through to general LLM implementation;
  - `source_inconclusive` remains terminal non-trusted, not trusted valid.
- Local memory/task delta for `work-20260514-harden-source-audit-report-production` records that malformed report text should remain a validator issue, missing report artifacts should preserve explicit diagnostics, no-findings reports must be evidence-bearing, and validator issue codes/messages must pass through rework/attempt metadata.
- Local memory/task delta for `work-20260515-enforce-exact-rework-closure` records that audit/report validators must remain strict and additive, unresolved manual-review outcomes block externally, and exact unresolved finding IDs should be preserved in `blockedReason`, `autoReviewState`, artifact validation details, and activity logs.

## Cross-project reusable patterns

- No cross-project memory was queried. Local repo facts and same-project curated memory were sufficient.
- Reusable pattern from same-project memory: strict artifact repair must run deterministic validator authority in the same stage that writes or classifies the artifact, before handing the task to an LLM or review loop.

## Rejected or stale memory candidates

- The old runtime-fallback behavior in `packages/agent/src/__tests__/implementer.test.ts` is rejected as stale because it conflicts with the selected intake card and validated local decisions.
- Shared-memory recall was not used before `PLAN PASS`, per RDPI's pre-plan boundary.

## Open questions

- Whether terminal invalid strict reports should release synthesis only to produce a terminal inconclusive synthesis artifact, or should block synthesis entirely. Existing data behavior distinguishes synthesis accounting from trusted-valid counts; this task should at minimum ensure such sources cannot become successful/trusted synthesis input.
- Whether all unresolved deterministic repair validation failures should become `source_inconclusive` or `manualReviewRequired`. The intake explicitly asks for terminal `source_inconclusive`; plan should prefer that unless tests reveal a narrower existing contract.

## Hypotheses

- Replacing both first-failed and repeated deterministic repair runtime fallthroughs with terminal `source_inconclusive` handling will close the unsafe boundary with limited blast radius.
- Removing `runtime_rework_required` from strict audit report repair results will naturally prevent runtime implementer prompts from asking the model to hand-author or patch strict manifests after deterministic failure.
- The review gate can preserve strict previous blocker IDs by treating strict audit validator finding closures as unresolved whenever deterministic validator findings for those codes are still present.
