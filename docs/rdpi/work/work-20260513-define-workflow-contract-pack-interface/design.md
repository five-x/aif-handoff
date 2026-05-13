# Design - Define Workflow Contract Pack Interface

## Design Goal

Create a workflow contract pack boundary that keeps AIF Handoff's core responsible for autonomous handoff mechanics and lets workflow packs define domain semantics.

Audit remains the first strict reliability pack. Feature development becomes the second canary. Future analytics and finance workflows are compatibility checks only.

## Boundary Principle

Core owns nouns and state transitions that every workflow can share:

- workflow kind and task intent routing;
- artifact identity and artifact lifecycle;
- evidence unit identity, capture metadata, provenance/source references, redaction, hashes, and source snapshot binding;
- claim identity and claim status;
- validation gate input/output envelope;
- review status, blocking findings, advisories, and manual handoff;
- memory brief envelope, approval state, sensitivity/redaction, retrieval, and usage tracking;
- runtime workflow spec and workflow-kind usage accounting.

Packs own workflow semantics:

- required task-card markers and decomposition rules;
- artifact kinds and allowed artifact paths;
- claim taxonomy and outcome taxonomy;
- evidence expectations and minimum evidence quality;
- validators/classifiers;
- memory brief content shape;
- roadmap prompt fragments and import validation;
- canary fixtures that prove the pack is behaving as intended.

## Proposed Core Model

### `WorkflowKind`

Use the existing `TaskIntent` vocabulary as the user-facing workflow kind for product tasks:

- `general`
- `audit`
- `feature`
- `fix`
- `spike`
- `docs`
- `tests`

Do not replace runtime `workflowKind` such as `planner`, `implementer`, or `reviewer`. Runtime workflow kind is a stage/agent execution kind. Workflow pack kind is the task semantics kind.

### `HandoffArtifact`

Core artifact envelope:

```ts
type HandoffArtifact = {
  id: string;
  taskId: string;
  workflowKind: TaskIntent;
  packId: string;
  artifactKind: string;
  path: string;
  state:
    | "expected"
    | "capturing"
    | "validating"
    | "valid"
    | "invalid"
    | "inconclusive"
    | "manual_review_required"
    | "external_blocked";
  attemptNumber: number;
  sourceSnapshotId?: string | null;
  contentSha256?: string | null;
  validationDetails?: unknown;
};
```

Audit can map current roadmap batch artifacts into this envelope:

- `role: report | synthesis` becomes `artifactKind: audit.source_report | audit.synthesis_report`.
- `source_inconclusive` and `terminal_inconclusive` map to core `inconclusive` with audit-specific failure details.
- Existing failure family names remain audit pack details during migration.

Feature development can use:

- `artifactKind: feature.patch`
- `artifactKind: feature.test_evidence`
- optional docs or release-note artifacts only when the feature card requires them.

### `EvidenceUnit`

Generalize the current audit evidence shape instead of weakening it:

```ts
type EvidenceUnit = {
  id: string;
  taskId: string;
  workflowKind: TaskIntent;
  planId?: string | null;
  sourceSnapshotId?: string | null;
  evidenceKind: string;
  evidenceGrade: "discovery" | "substantive" | "reviewer_judgment";
  artifactIds: string[];
  claimIds: string[];
  scopeIds: string[];
  riskOrAcceptanceIds: string[];
  pathHashes: string[];
  command?: { command: string; args: string[]; cwd: string | null } | null;
  outputSha256?: string | null;
  outputPreview?: string | null;
  redactionStatus: "clean" | "redacted";
  createdAt: string;
};
```

Audit keeps `riskHypothesisIds` as a pack alias of `riskOrAcceptanceIds`.

Feature development can bind evidence to acceptance criteria IDs, test IDs, UI behavior IDs, or regression IDs.

### `WorkflowClaim`

Core claim envelope:

```ts
type WorkflowClaim = {
  id: string;
  workflowKind: TaskIntent;
  artifactId?: string | null;
  claimKind: string;
  status: "asserted" | "supported" | "rejected" | "inconclusive";
  summary: string;
  evidenceUnitIds: string[];
  sourceRefs: string[];
  packData?: unknown;
};
```

Audit claim kinds:

- `audit.finding`
- `audit.no_findings`
- `audit.source_inconclusive`
- `audit.batch_outcome`

Feature claim kinds:

- `feature.acceptance_met`
- `feature.regression_fixed`
- `feature.test_passed`
- `feature.manual_check`

Core does not know whether a no-findings claim is strong enough. The audit pack decides that.

### `ValidationGate`

Core validation envelope:

```ts
type ValidationGateInput = {
  workflowKind: TaskIntent;
  task: Task;
  artifact?: HandoffArtifact | null;
  evidenceUnits: EvidenceUnit[];
  claims: WorkflowClaim[];
  phase: "pre_implementation" | "completion" | "review" | "memory";
};

type ValidationGateResult = {
  status: "pass" | "fail" | "inconclusive" | "manual_review_required";
  issues: Array<{ code: string; message: string; severity: "blocking" | "advisory" }>;
  claims: WorkflowClaim[];
  artifactState?: HandoffArtifact["state"];
  packData?: unknown;
};
```

Core handles routing, persistence, status transitions, and fail-closed behavior. The pack returns semantic issues and claim states.

### `MemoryBrief`

Core memory brief envelope:

```ts
type MemoryBrief = {
  id: string;
  workflowKind: TaskIntent;
  sourceTaskId: string;
  sourceArtifacts: string[];
  claims: WorkflowClaim[];
  summary: string;
  decisions: string[];
  reusablePatterns: string[];
  sensitivity: "local-only" | "shareable" | "forbidden";
};
```

Audit memory brief content can summarize validated findings, no-findings limits, source inconclusive reasons, and evidence contract lessons.

Feature memory brief content can summarize accepted behavior, implementation decisions, changed public contracts, and verification commands.

## Minimum `WorkflowPack` Interface

The first implementation slice should avoid a large framework. A small registry is enough:

```ts
interface WorkflowPack {
  id: TaskIntent;
  label: string;
  taskContract: TaskIntentContract;

  validateGeneratedTask(input: {
    title: string;
    description: string;
  }): ValidateGeneratedTaskIntentResult;

  roadmap?: {
    buildGenerationPrompt?(ctx: RoadmapPromptContext): string;
    buildExtractionPrompt?(ctx: RoadmapExtractionContext): string;
    normalizeGeneratedTasks?(input: RoadmapGenerationResult): RoadmapGenerationResult;
    validateBatch?(input: RoadmapGenerationResult): ValidationGateResult;
    importSideEffects?(input: RoadmapImportContext): RoadmapImportSideEffect[];
  };

  artifacts?: {
    expectedArtifacts(input: Task): HandoffArtifact[];
    classifyArtifact(input: ArtifactValidationContext): ValidationGateResult;
  };

  completion: {
    evaluate(input: ValidationGateInput): ValidationGateResult;
  };

  review?: {
    deterministicFindings(input: ValidationGateInput): AutoReviewFinding[];
    requiresSubstantiveReviewEvidence?(input: ValidationGateInput): boolean;
  };

  memory?: {
    buildBrief(input: MemoryBriefContext): MemoryBrief | null;
  };
}
```

This interface can initially be compile-time TypeScript only. No database schema is required for the planning task.

## Audit Pack Migration Shape

Keep current behavior, move ownership:

- `validateGeneratedAuditCard` becomes the audit pack generated-task validator.
- `validateAuditRoadmapSource`, deterministic audit fallback, and synthesis card validation become audit pack roadmap behavior.
- `validateAuditReportArtifact`, `classifyAuditSynthesisOutput`, and audit failure family mapping become audit pack artifact/completion behavior.
- Audit evidence ledger types stay compatible, but core should eventually expose a generic `EvidenceUnit` alias and let the audit pack map `riskHypothesisIds`.
- Coordinator and review gate call `getWorkflowPack(task.taskIntent).completion.evaluate(...)` and `pack.review.deterministicFindings(...)` rather than checking audit details directly.

## Feature Development Canary

The feature canary should prove core is not audit-only without building a broad feature system.

Canary shape:

- Create or validate one `taskIntent: "feature"` roadmap card with `Acceptance criteria:`, `Verification:`, `Dependencies:`, `Scope:`, `Evidence requirements:`, and `Allowed changes:`.
- Validate that it is allowed to change source/tests/docs as needed.
- Validate that it does not require `Report artifact:`, audit risk hypotheses, audit manifest, audit synthesis, audit evidence ledger refs, or report-only allowed changes.
- Validate that completion evidence accepts a normal code/test/docs delta plus verification command evidence.
- Validate that memory brief generation can record accepted behavior and verification, not findings/no-findings.

This canary is enough to answer the product question: the core stays an autonomous task handoff platform, not an audit product.

## Deferred Until Real Requirements

- Finance reconciliation schemas, accounting terms, monetary precision rules, and external ledger integrations.
- Analytics conclusion taxonomy, statistical confidence semantics, BI/dashboard lineage, and query reproducibility rules.
- New database schema for generic artifacts/claims/evidence.
- UI changes for generic artifact timelines or claim inspection.
- Rewriting all audit validators or migrating existing audit tables in one pass.
- Obsidian or external note-tool dependencies.
- Cross-project memory publication strategy for workflow-pack knowledge.

## Risks And Mitigations

- Risk: over-abstracting before a second workflow proves the interface. Mitigation: implement only audit pack extraction plus a feature canary.
- Risk: weakening audit containment. Mitigation: preserve current audit validators and exact tests while moving ownership behind the pack interface.
- Risk: schema churn. Mitigation: first slice is code boundary and tests only; database generalization is deferred.
- Risk: confusing task intent and runtime workflow kind. Mitigation: document task workflow kind as pack selection and runtime workflow kind as stage execution.
- Risk: feature canary becomes superficial. Mitigation: require tests that reject audit-only requirements on feature tasks and prove feature acceptance/verification remains first-class.
