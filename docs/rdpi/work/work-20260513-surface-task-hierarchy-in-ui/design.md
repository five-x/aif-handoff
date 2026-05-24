<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Design

## Approach

Add small hierarchy signals to existing card, list, and detail surfaces without changing the Kanban model or adding tree editing.

## Kanban Card

- Show a container badge when `hierarchyRole === container`.
- Show child summary counts when `childSummary.childCount > 0`.
- Show parent context for child tasks when available.
- Keep tags/roadmap filters unchanged.

## List View

- Indent children based on `hierarchyDepth`.
- Show parent short id/title context when available.
- Keep backlog ordering controls only where safe.

## Detail View

- Add overview rows for role, parent, depth, closeout policy, and child counts.
- Add a compact children section with direct children, statuses, and blocked/verified counts.
- Disable or hide unsafe execution actions for containers through existing action guards where practical.

## Compatibility

- Flat tasks should render exactly as before except for no-op hierarchy defaults.
- No drag-and-drop tree editing in this slice.

## Chosen design

- Add small hierarchy indicators to existing operational views instead of introducing a separate tree editor.
- Use API-provided `childSummary`, parent metadata, and direct children rather than deriving relationships client-side.
- Preserve status-first Kanban as the primary scan model.

## Pre-PLAN boundary

- Planning relied on the local task card, parent RDPI design, current repository files, and explorer output only.
- No live runtime probing, browser testing, endpoint checks, or shared-memory recall were used before `PLAN PASS`.

## Decision candidates

- Prefer compact badges, indentation, and detail sections over nested cards.
- Prefer hiding or disabling unsafe container actions where the role is known in the current response.
