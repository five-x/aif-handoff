# Plan

## Implementation plan

1. Add shared config-governance types and validation helpers.
   - Define issue severities, reason codes, source kinds, audit action kinds, and browser-safe response shapes.
   - Add deterministic secret-like-key detection for persisted runtime profile options/headers and task runtime overrides.
   - Add project-config validation that reports invalid `.ai-factory/config.yaml` shape/value issues instead of silently treating them as operator-invisible fallback.
2. Add durable config audit persistence.
   - Add `config_audit_events` to `packages/shared/src/schema.ts` and `packages/shared/src/db.ts` with a migration and index coverage.
   - Add data-layer append/list mappers in `packages/data/src/index.ts`.
   - Keep all DB access in `@aif/data`.
3. Add resolved project config governance projection.
   - Build the projection from project row, app settings, runtime profiles, effective runtime selections, env summary, project config, `.mcp.json`, memory flags, permission policy summary, and usage-limit settings.
   - Redact values and expose source labels, booleans, keys, profile IDs/names, reason codes, and a config fingerprint.
4. Add API routes and mutation audit hooks.
   - Expose `GET /projects/:id/config-governance` and `GET /projects/:id/config-audit`.
   - Emit config audit events for app runtime default updates, project updates/default changes, project config writes, runtime profile create/update/delete, and task runtime override changes.
   - Return validation reason codes from rejected config mutations where applicable.
5. Add task work blockers.
   - In `handleTaskEvent`, check governance blockers for events that start/resume work: `start_ai`, `accept_existing_plan`, `start_implementation`, `fast_fix`, and `retry_from_blocked`.
   - Return/block with reason codes without doing live provider validation.
6. Add UI exposure.
   - Add API client types/functions.
   - Add a compact governance section to project runtime settings showing resolved runtime defaults, git/workflow, memory, permission policy, usage limits, MCP summaries, blocking issues, and recent audit events.
   - Keep editing in existing forms; the new panel is a resolved view and audit surface.
7. Update docs.
   - Document the new endpoints, reason-code behavior, redaction guarantees, and blocking policy in `docs/api.md` / `docs/configuration.md`.

## Acceptance criteria

- A project has one API-visible resolved config view spanning env metadata, app settings, project settings, runtime profiles, `.ai-factory/config.yaml`, `.mcp.json`, memory, permission policy, and usage-limit flags.
- Invalid project config and invalid runtime profile configuration produce stable reason codes; blocking issues prevent runtime-starting task events.
- Config changes write append-only audit events with redacted before/after summaries.
- Task-level runtime override changes are auditable with before/after metadata and task-visible activity.
- UI exposes the resolved governance view and audit trail without displaying raw runtime secrets.
- Existing runtime profile/app/project/task validation continues to reject invalid profile scope references.

## Verification plan

- Run focused shared/data tests:
  - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/db.test.ts src/__tests__/projectConfig.test.ts`
  - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/runtimeProfiles.test.ts src/__tests__/runtimeProfileResolution.test.ts`
- Run focused API tests:
  - `npm.cmd test --workspace=@aif/api -- --run src/__tests__/projects.test.ts src/__tests__/settings.test.ts src/__tests__/runtimeProfiles.test.ts src/__tests__/tasks.test.ts`
- Run focused web tests:
  - `npm.cmd test --workspace=@aif/web -- --run src/__tests__/ProjectRuntimeSettings.test.tsx src/__tests__/TaskSettings.test.tsx`
- Run package builds for touched packages:
  - `npm.cmd run build --workspace=@aif/shared`
  - `npm.cmd run build --workspace=@aif/data`
  - `npm.cmd run build --workspace=@aif/api`
  - `npm.cmd run build --workspace=@aif/web`
- Run targeted diff whitespace check:
  - `git diff --check -- packages/shared packages/data packages/api packages/web docs`
- Independent gates:
  - Plan reviewer must return `PLAN PASS` before implementation.
  - Tester must return `TEST PASS` after implementation.
  - Final reviewer must return `REVIEW PASS` before close-out.

## Reusable patterns

- Use append-only audit rows for operator-visible governance history.
- Store and display source labels, key names, fingerprints, and booleans for secret-adjacent config; never raw secret values.
- Make deterministic local config validation fail-closed before starting runtime work; keep live provider checks opt-in.
