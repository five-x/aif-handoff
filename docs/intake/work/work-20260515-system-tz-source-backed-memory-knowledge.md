# System TZ Source Backed Memory Knowledge

- Task ID: work-20260515-system-tz-source-backed-memory-knowledge
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-15
- Due: after trust backbone design
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 10, 23 Phase 5, 25 P1
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-source-backed-memory-knowledge

## Request

Upgrade the existing server-side memory model into a source-backed knowledge layer without creating a parallel memory source of truth.

Add typed memory items and claims that can reference tasks, artifacts, evidence, and code paths, then generate bounded, source-backed memory briefs for planner, implementer, reviewer, security review, and chat.

## Done When

- Memory item types include decision, failure_family, architecture_note, workflow_contract, regression_pattern, review_learning, runtime_policy, and security_policy.
- Memory claims include claim id, type, status, text, sources, supersedes, contradicts, and last validated timestamp.
- Memory without sources cannot be approved.
- Memory with blocked redaction status cannot be approved.
- Known failure families such as inventory_only_no_findings, stale_rework_evidence, branch_drift, plan_quality_generic, runtime_limit_blocked, review_loop_stalled, and no_substantive_rework_delta can be represented.
- Memory briefs are reference-only, bounded, source-backed, audited through memory usage events, and cannot override local repo facts.
- UI shows memory to tasks/artifacts/evidence links.

## Constraints

- Do not replace shared-memory or server-side memory with filesystem knowledge.
- Optional `.aif-knowledge/` output, if implemented, must be export/cache only.
- Do not store raw secrets in memory or memory briefs.
- Do not publish unreviewed raw RDPI notes as memory.

## Notes

- This task should reuse the server-side memory loop and docs/memory review-first contract already present in the repository.
