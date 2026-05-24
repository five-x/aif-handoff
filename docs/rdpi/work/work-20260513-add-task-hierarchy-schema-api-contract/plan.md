<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Plan

## Implementation Plan

1. Extend shared schema and runtime migrations with hierarchy columns and indexes.
2. Extend shared task types and API schemas with hierarchy read fields, child summary types, and the writable-only create/update hierarchy inputs.
3. Add data-layer hierarchy helpers for direct children, child summaries, create/update validation, sibling position, and safe defaults.
4. Extend REST route responses to expose hierarchy fields and direct children on detail.
5. Extend MCP create/update/get/list tools for hierarchy parity.
6. Add focused tests for schema defaults, data create/update validation, API create/update/list/detail fields, MCP parity, and caller-supplied computed field rejection/ignore behavior.

## Verification Plan

- `npm.cmd test --workspace=@aif/shared -- schema`
- `npm.cmd test --workspace=@aif/data -- index`
- `npm.cmd test --workspace=@aif/api -- tasks`
- `npm.cmd test --workspace=@aif/mcp -- tools`
- `npm.cmd run lint`
- `npm.cmd run build`

## Acceptance Criteria

- Flat tasks still create/read/update without hierarchy input.
- Child creation computes hierarchy metadata.
- Invalid relationships fail closed.
- `rootTaskId`, `hierarchyDepth`, `hierarchyPosition`, `childSummary`, and `children` cannot be persisted from caller input.
- API and MCP responses expose hierarchy contract fields.
- Runtime rollup/UI/audit bridge remain explicitly out of scope for this card.

## Reusable patterns

- Keep schema, shared types, REST schemas, data mappers, and MCP schemas in sync in one slice.
- Validate hierarchy in the data layer so REST and MCP share the same relationship rules.
