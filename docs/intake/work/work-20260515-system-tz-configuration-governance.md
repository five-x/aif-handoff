# System TZ Configuration Governance

- Task ID: work-20260515-system-tz-configuration-governance
- Lane: work
- Status: done
- Priority: medium
- Created: 2026-05-15
- Due: after runtime governance and security policy planning
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 21, 26
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-configuration-governance

## Request

Add effective configuration governance so operators can see the resolved project configuration, detect config drift, validate runtime and project settings, audit task-level overrides, and avoid raw secret exposure.

## Done When

- The platform can present a single resolved config view per project across `.env`, `.env.local`, runtime profiles, app settings, project settings, `.ai-factory/config.yaml`, and `.mcp.json` where applicable.
- Invalid project config and invalid runtime profile config block work with clear reason codes.
- Config changes create audit or timeline events.
- Task-level override changes have an audit trail.
- UI exposes runtime defaults, git settings, workflow settings, memory settings, security/permission policy, and usage limits.
- Runtime secrets are never displayed.

## Constraints

- Do not persist raw secrets.
- Do not make local `.env` files a cross-environment source of truth.
- Treat filesystem knowledge export questions as open until source-backed memory design decides them.

## Notes

- Open System TZ questions about merge/push verified flow, evidence retention, sandbox level, and operator roles may produce follow-up tasks after RDPI.
