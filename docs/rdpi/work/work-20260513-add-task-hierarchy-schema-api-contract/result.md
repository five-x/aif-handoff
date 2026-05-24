# Result - Add Task Hierarchy Schema And API Contract

## Outcome

Implemented the first-class task hierarchy schema and API contract.

- Added shared hierarchy enums, task fields, child summaries, parent references, and create/update inputs.
- Added database columns, indexes, and migration coverage for parent/root/depth/role/position/closeout policy.
- Exposed hierarchy fields through REST create/update schemas, task responses, MCP create/update/get tools, and roadmap completion payloads.
- Added controlled REST error mapping for hierarchy contract failures with `TASK_HIERARCHY_INVALID` 4xx responses.
- Added regression coverage for create/update validation failures and path-backed attachment preservation when hierarchy validation fails.

## Review-Fail Revisions

- Added the missing `all_children_done` closeout policy to the shared contract and RDPI contract docs.
- Converted uncaught hierarchy validation failures in task create/update routes into controlled 400/409 responses.
- Fixed failed-update attachment cleanup so only files created from incoming request content are removed; path-backed existing attachments are preserved.

## Gate Verdicts

- Plan review: `PLAN PASS`
- Test gate: `TEST PASS`
- Final review: `REVIEW PASS`
- User waivers: none

## Verification

- `npm.cmd test --workspace=@aif/api -- tasks`: PASS.
- `npm.cmd test --workspace=@aif/data -- index`: PASS.
- `npm.cmd test --workspace=@aif/web -- TaskDetailHeader`: PASS.
- `npm.cmd test`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd run build`: PASS.

Independent tester also reran forced full test, lint, and build with cache bypass and returned `TEST PASS`.

## Memory Sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-add-task-hierarchy-schema-api-contract --project aif-handoff --entity aif-handoff`: completed.
- Report: `docs/memory/reports/work-20260513-add-task-hierarchy-schema-api-contract-memsync-report.md`.
- Auto-publish status: ingested generated decision and pattern documents.
