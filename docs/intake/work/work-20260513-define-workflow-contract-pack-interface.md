# Define Workflow Contract Pack Interface

- Task ID: work-20260513-define-workflow-contract-pack-interface
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-13
- Due: unset
- Source: Codex planning thread after reviewing Karpathy LLM Wiki ideas against AIF Handoff's original autonomous task handoff goals.
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface

## Why This Epic Exists

AIF Handoff's original product goal is autonomous task management through a Kanban UI, API, provider-neutral runtime, and AI subagents. The next reliability epic exists to protect that goal: make handoff between planning, implementation, review, and close-out more trustworthy across workflow types without turning the platform into an audit-only system.

Audit is the first stress-test because the current blocking work exposed concrete failures around weak evidence, false valid no-findings, stale rework, and source/synthesis mismatch. Those failures should shape the first rollout, but they must not define the core architecture.

## Goal Lock

Design a workflow contract pack interface that keeps universal handoff mechanics in core and domain-specific semantics in packs.

Core should own concepts such as workflow kind, artifact kind, evidence unit, claim, validation gate, memory brief, lifecycle state, provenance/source references, and review status.

Workflow packs should own domain semantics such as audit findings/no-findings, feature acceptance, analytics conclusions, finance reconciliation, or future workflow-specific validators.

## Request

Plan a core-vs-pack architecture for AIF Handoff workflow reliability so `audit`, `feature_dev`, and future analytical or finance workflows can share one provenance, memory, and validation model without overfitting the platform to the current audit incident.

The RDPI pass should answer:

- which existing task, roadmap, memory, evidence, and review concepts are already generic;
- where audit-specific rules have leaked into generic flow;
- what minimum `WorkflowPack` interface is needed before adding typed claims or workflow-specific memory briefs;
- how the first audit rollout can remain compatible with a second feature-development canary;
- what should be deferred until analytics or finance workflows are real requirements.

## Done When

- `research.md` maps the current planner, implementer, reviewer, security, roadmap, memory, and audit evidence flows.
- `design.md` draws a clear boundary between core handoff primitives and workflow-pack semantics.
- `plan.md` defines a smallest implementation slice that improves audit reliability while proving the design is not audit-only.
- The plan includes an explicit feature-development canary or equivalent anti-overfit check.
- The plan review gate directly answers: "Does this preserve AIF Handoff as an autonomous task handoff platform rather than turning it into an audit product?"
- Follow-up implementation tasks can be queued independently after the plan, instead of bundling the whole epic into one risky change.

## Constraints

- Do not execute implementation during this intake task.
- Do not add finance or analytics implementation now; use them only as future-fit design checks.
- Do not rewrite existing audit validators as part of this planning task.
- Do not introduce new database schema before PLAN PASS.
- Do not make Obsidian, markdown wiki structure, or any external note tool a core runtime dependency.
- Preserve the existing server-side memory loop as reference-only context unless the plan proves a stricter reviewed claim path.
- Preserve the audit evidence ledger as evidence/provenance infrastructure, not as a generic truth oracle.
- Follow RDPI gates before implementation.

## Notes

- Current audit work remains the highest-priority rollout because it blocks the original task path.
- The architecture should treat audit as the first workflow pack and feature development as the second validation pack.
- The motivating principle is workflow reliability: agents should know what prior decisions matter, what artifacts prove progress, what evidence is trusted, and why a handoff gate accepted or rejected work.

## Links

- ../../rdpi/work/work-20260513-define-workflow-contract-pack-interface
- ../../rdpi/work/work-20260512-server-side-memory-loop/result.md
- ../../rdpi/work/work-20260512-audit-evidence-ledger/result.md
- ../../kb/audit-evidence-provenance-contract.md
