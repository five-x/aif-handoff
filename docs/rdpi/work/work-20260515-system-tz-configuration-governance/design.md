# Design

## Chosen design

Implement a narrow, deterministic configuration governance layer over existing configuration sources.

The selected approach has four pieces:

1. Add shared/data models for a redacted resolved project config view and append-only config audit events.
2. Add API endpoints and guards that project the resolved view, list audit events, validate deterministic config issues, and block task work when blocking config issues exist.
3. Emit audit events from app defaults, project settings, project config, runtime profile mutations, and task runtime override changes.
4. Surface the resolved governance view in the project runtime/settings UI, including runtime defaults, git/workflow settings, memory settings, permission policy, usage limits, MCP config, validation issues, and recent audit events.

This avoids a risky migration to make `.env` files or `.ai-factory/config.yaml` authoritative across environments. The resolved view is an operator projection over existing sources, with redacted summaries and deterministic reason codes.

## Pre-PLAN boundary

- Before `PLAN PASS`, only task framing, static local files, docs, and planning artifacts are allowed.
- No live endpoint checks, server starts, log reads, scheduler reads, downstream runtime config reads, or shared-memory recall were used.
- Implementation starts only after an independent reviewer returns `PLAN PASS`.

## Scope boundaries

- In scope:
  - Redacted resolved config projection per project.
  - Deterministic validation and reason codes for project config and runtime profile governance.
  - Blocking task event transitions that start or resume runtime work when blocking config issues exist.
  - Append-only config audit events for settings/profile/project-config/task-override changes.
  - UI read surface for the governance projection and recent audit events.
  - Tests for data, API, shared validation, and UI rendering.
- Out of scope:
  - Live provider connectivity checks on every task start.
  - Generic workflow timeline persistence migration.
  - Persisting raw secrets or promoting `.env` files to portable source-of-truth config.
  - Resolving filesystem knowledge export policy questions.
  - Committing or pushing changes.

## Data and API model

- Add `config_audit_events` with project/task/profile scope, action, source kind, actor, reason codes, redacted before/after JSON, and timestamp.
- Add shared browser-safe types:
  - `ResolvedProjectConfigView`
  - `ResolvedConfigIssue`
  - `ConfigAuditEvent`
  - related source/action/reason-code string unions.
- Add data functions:
  - `buildProjectConfigGovernance(projectId)`
  - `appendConfigAuditEvent(input)`
  - `listConfigAuditEvents(input)`
  - deterministic validation helpers for project config and runtime references.
- Add API routes:
  - `GET /projects/:id/config-governance`
  - `GET /projects/:id/config-audit`
  - optional task-scoped audit read through `GET /tasks/:id/config-audit` if low-risk.

## Blocking policy

- Block task events that start or resume work when governance issues include `severity = "error"` and `blocksWork = true`.
- Use clear reason codes in the API error response and task blocked reason where a task state change is being applied.
- Do not block simple read/list/config-edit endpoints on warnings.
- Do not run live network validation inside the blocker; the check is deterministic and local.

## Redaction policy

- Runtime profile `apiKeyEnvVar` may be shown as an env var name plus `configured: boolean`.
- Header and option values are never shown; only keys and secret-like-key blockers are exposed.
- `.mcp.json` entries are summarized by server name, transport, command/url presence, and env key names only.
- `.env` / `.env.local` are summarized by existence and known feature/runtime key presence, not values.
- Config audit event before/after snapshots store redacted summaries, not raw payloads.

## Decision candidates

- Config governance should be an operator projection and audit layer over existing config sources, not a new source of truth.
- Secret-like dynamic keys in runtime options and MCP/env summaries are blocking config issues unless they are represented as env var names or redacted key-only metadata.
- Task runtime override changes deserve durable append-only audit events, not only generic task updated broadcasts.
