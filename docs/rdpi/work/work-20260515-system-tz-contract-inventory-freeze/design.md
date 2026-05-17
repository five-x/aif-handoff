# Design

## Chosen design

Create a static contract inventory/freeze document at `docs/kb/system-tz-contract-inventory-freeze.md`.

The document will act as the accepted Phase 0 planning source for later System TZ tasks. It will map current repo contracts to the target trust backbone without changing runtime behavior. It will distinguish:

- current authoritative sources;
- compatibility overlays;
- audit-specific containment that must not be weakened;
- duplicated or stale exposure surfaces;
- blocked decisions and follow-up task references.

## Document structure

The inventory/freeze document will include:

1. Scope, freeze status, source inputs, and non-goals.
2. Target System TZ backbone summary.
3. Current package and data-flow boundary.
4. Task intent inventory across shared types, data persistence, API, MCP, web/chat, planner, implementer, reviewer/security, and audit flows.
5. Artifact state and artifact attempt inventory.
6. Evidence event and workflow timeline inventory.
7. Memory and runtime usage inventory.
8. Branch/worktree/orchestration inventory.
9. API, WebSocket, MCP, and UI exposure inventory.
10. Review findings and review/security gate inventory.
11. Duplicated, obsolete, audit-specific, or compatibility-only code paths with file references.
12. Open decisions and follow-up mapping to queued System TZ cards.
13. Freeze rules for later implementation tasks.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: read the task card, repo guidance, local docs, local code, and static file maps; write planning-only `research.md`, `design.md`, and `plan.md`.
- Not allowed before `PLAN PASS`: live server probes, scheduler reads, logs, worker report inspection, endpoint checks, downstream runtime/config reads, shared-memory recall, runtime behavior changes, or task status close-out.

## Implementation boundary after PLAN PASS

- Allowed after `PLAN PASS`: create or update documentation and RDPI result/memory review artifacts, run static verification commands, and update only the matching work status entry after all gates and local memory review pass.
- Not allowed in this task: database migrations, source code behavior changes, validator weakening, API contract changes, runtime probing, executing sibling System TZ implementation cards, or editing the immutable intake card.

## Decision candidates

- Freeze current audit validators as immediate containment while marking their migration into a unified trust backbone as future work.
- Treat generic workflow timeline rows as compatibility DTOs over audit/roadmap persistence until generic artifact/claim/evidence persistence is implemented by a later task.
- Treat docs/code exposure mismatches as documented follow-up decisions, not bugs to patch in this inventory task.
- Keep `docs/kb/system-tz-contract-inventory-freeze.md` as the planning source for the remaining queued System TZ tasks.
