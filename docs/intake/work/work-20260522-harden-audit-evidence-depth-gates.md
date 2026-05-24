# Harden Audit Evidence Depth Gates

- Task ID: work-20260522-harden-audit-evidence-depth-gates
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-22
- Due: after roadmap audit E2E OOM stabilization is accepted as complete
- Source: Follow-up from `auditstrong20260522oom21` and `auditstrong20260522oom22` clean E2E runs after `fb0461a9`; both runs were pipeline-clean but the accepted source audit reports contained shallow no-findings evidence.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260522-harden-audit-evidence-depth-gates`

## Request

Raise audit report acceptance from "pipeline-valid artifact" to "substantive diagnostic audit evidence" so shallow no-findings reports cannot be treated as trusted source reports or synthesis input.

The immediate regression is that `auditstrong20260522oom22` correctly avoided OOM/retry-storm failure and did not hallucinate concrete findings, but several accepted source reports justified broad no-findings claims with shallow evidence such as import lines, first class declarations, generic `git grep -n .` excerpts, or loosely relevant grep matches. The synthesis then correctly preserved the validator's classification, but the classification was too permissive: it reported `validated_no_findings`, `weakReportCount=0`, and no report quality issues for evidence that was not deep enough to support the apparent audit confidence.

The platform must distinguish:

- a syntactically valid audit artifact and manifest,
- a report with substantive risk-specific audit evidence,
- a shallow or inventory-only report that should be terminal/inconclusive or rejected from synthesis.

## Done When

- Audit report validation computes and persists an explicit evidence-depth assessment for each source report, each declared risk hypothesis, and each scoped file/root.
- Shallow evidence is detected and cannot satisfy no-findings claims by itself. This includes import-only snippets, file headers, first-lines-only evidence, path inventory, directory listings, generic `git grep -n .` dumps, grep matches that merely contain query words, repeated identical evidence reused across unrelated audit categories, and self-reported command output without risk-specific interpretation.
- No-findings claims require behavior-relevant evidence tied to the declared risk. Acceptable evidence can include function/class bodies, configuration branches, authorization/error-handling paths, persistence boundaries, runtime/test command outputs, or targeted source excerpts with explicit reasoning that connects the evidence to the risk.
- Reports that are manifest-valid but depth-insufficient classify as `source_inconclusive` or an equivalent non-green outcome, with reason codes such as `shallow_evidence`, `inventory_only_evidence`, `irrelevant_grep_match`, `insufficient_scope_depth`, or `reused_generic_evidence`.
- `valid/trusted/supported` UI/API wording no longer overstates shallow audit artifacts. Either add a separate surfaced depth/trust dimension or make depth failure prevent trusted/supported classification for no-findings reports.
- Deterministic repair cannot legalize shallow evidence into trusted no-findings. It may produce a bounded inconclusive report with exact reason codes and next actions.
- Deterministic synthesis refuses `validated_no_findings` when any required source report is shallow/inconclusive, and its summary lists the rejected or inconclusive source reports instead of promoting confidence.
- Regression tests include captured examples modeled on the `auditstrong20260522oom22` artifacts where import-line/first-line evidence was previously accepted, and those examples now fail or classify inconclusive.
- Positive regression tests prove a genuinely substantive no-findings report can still pass without requiring impossible proof of absence.
- After deploy, two fresh botIntevra audit roadmap E2E runs pass without OOM/retry-storm regression and with source reports that are either substantive validated reports or explicit inconclusive reports; no shallow report is accepted as trusted no-findings.

## Constraints

- Do not weaken the OOM, request-budget, semaphore, circuit-breaker, or cancellation hardening delivered in `fb0461a9` and its predecessor commits.
- Do not make no-findings impossible. The gate should require pragmatic substantive evidence, not formal proof that a defect cannot exist.
- Keep audit diagnostic-only. Do not fix botIntevra findings or create child implementation tasks as part of audit execution.
- Keep bounded context behavior after repository-inspection budget exhaustion; do not reintroduce finalization model retry storms.
- Preserve current strict manifest, source snapshot, content hash, artifact path, and synthesis membership checks.
- Avoid accepting date/path freshness ambiguity as proof of artifact freshness; manifest alias/task/batch/source snapshot must remain the authoritative freshness checks.

## Problem Examples To Encode

- Architecture/ownership report accepted no-findings while citing `src/bot_intevra/bot.py:11-13` import lines as evidence for an ownership-boundary risk.
- Security/configuration report accepted broad security no-findings while much of the evidence was imports, dataclass declarations, default URL constants, or a single loose grep match.
- Several category reports reused the same small source snippets across unrelated risks and were still counted as `substantiveNoFindingsReportCount`.
- The synthesis accurately reflected the source report classifications, but because those classifications were too permissive it produced `validated_no_findings` with `weakReportCount=0`.

## Verification Plan

- Shared validator unit tests for shallow evidence rejection and substantive evidence acceptance.
- Synthesis tests proving shallow/inconclusive source reports cannot produce `validated_no_findings`.
- Runtime/report-production tests proving deterministic repair emits bounded inconclusive output rather than trusted shallow no-findings.
- API/UI tests or snapshots for the surfaced evidence-depth/trust state if the task changes user-visible classification.
- Fresh botIntevra audit roadmap E2E canary after deploy, with two runs and explicit artifact review for evidence depth.

## Open Questions

- What exact threshold should define "substantive" for very small files where relevant behavior may only be a few lines?
- Should evidence-depth be a new orthogonal field, or should existing artifact trust levels absorb it?
- Should shallow source reports block the whole batch as inconclusive, or allow synthesis to summarize partial validated coverage plus explicit gaps?
