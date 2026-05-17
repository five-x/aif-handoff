# Plan

## Implementation plan

1. Re-check the precise static file references needed for the inventory document.
   - Use `rg`, `Select-String`, and targeted file reads only.
   - Do not run live server probes, scheduler reads, log reads, worker-report reads, endpoint checks, downstream runtime/config reads, or shared-memory recall.

2. Create `docs/kb/system-tz-contract-inventory-freeze.md`.
   - Summarize accepted System TZ sections 2, 3, 23 Phase 0, and 27.
   - Map current contracts to `TaskIntentContract`, `PlanManifest`, `WorkflowTimeline`, `EvidenceLedger`, `ArtifactTrustRollup`, `MemoryClaim`, and `RuntimeUsage`.
   - Cover shared types/schema, data persistence, API, MCP, web/chat, planner, implementer, reviewer/security, audit flows, artifact states/attempts, evidence events, timeline DTOs, memory records, usage events, branch/worktree fields, and review findings.
   - List duplicated, obsolete, audit-specific, compatibility-only, or stale code paths with file references.
   - Convert open questions into blocked decisions or follow-up references to existing queued System TZ tasks.
   - State freeze rules for later System TZ work.

3. Verify the inventory artifact.
   - Confirm the document exists and contains all requested Done When categories.
   - Run `git diff --check`.
   - Run markdown/text-focused checks with `rg` against the new doc for required headings and target concepts.
   - No build/test run is required because this task changes documentation only, but record that decision explicitly.

4. Complete RDPI close-out.
   - Require independent `PLAN PASS` before writing the inventory document.
   - Require independent `TEST PASS` after documentation verification.
   - Require independent `REVIEW PASS` after test pass.
   - Write `docs/rdpi/work/work-20260515-system-tz-contract-inventory-freeze/result.md` with gate outcomes and stable facts.
   - Run `$memsync MODE=auto LANE=work TASK_ID=work-20260515-system-tz-contract-inventory-freeze`.
   - If local memory review succeeds, update only the matching `docs/intake/work_status.json` entry to `done`, preserving other task entries.

## Acceptance criteria

- The inventory/freeze document exists at `docs/kb/system-tz-contract-inventory-freeze.md`.
- Current task intent behavior is documented across shared types, data persistence, API, MCP, web/chat, planner, implementer, reviewer/security, and audit flows.
- Current artifact states, artifact attempts, evidence events, timeline rows, memory records, runtime usage events, branch/worktree fields, and review findings are mapped to target System TZ backbone concepts.
- Duplicated, obsolete, audit-specific, compatibility-only, or stale code paths are listed with file references.
- Open questions are converted into blocked decisions or follow-up references to queued System TZ tasks.
- No runtime behavior, schema, validators, source code, or immutable intake card is changed.

## Verification plan

- Independent plan review: pass task card plus `research.md`, `design.md`, and `plan.md` to a reviewer and require `PLAN PASS`.
- Documentation verification after implementation:
  - `Test-Path docs/kb/system-tz-contract-inventory-freeze.md`
  - `rg -n "TaskIntentContract|PlanManifest|WorkflowTimeline|EvidenceLedger|ArtifactTrustRollup|MemoryClaim|RuntimeUsage" docs/kb/system-tz-contract-inventory-freeze.md`
  - `rg -n "Duplicated|Compatibility|Open Decisions|Freeze Rules" docs/kb/system-tz-contract-inventory-freeze.md`
  - `git diff --check`
- Independent test gate: pass the changed docs and verification outputs to a tester and require `TEST PASS`.
- Independent final review: pass the changed docs, RDPI artifacts, and verification outputs to a reviewer and require `REVIEW PASS`.

## Reusable patterns

- Phase 0 inventory tasks should freeze current behavior and compatibility surfaces first, then route behavior changes into separate implementation cards.
- Documentation-only RDPI still requires independent plan/test/review gates when the artifact becomes an accepted planning source for later platform work.
