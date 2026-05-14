// Schema
export {
  projects,
  appSettings,
  tasks,
  taskComments,
  runtimeProfiles,
  chatSessions,
  chatMessages,
  usageEvents,
  memoryItems,
  memoryUsageEvents,
  memoryLifecycleEvents,
  runtimeWarmupSessions,
  roadmapBatches,
  roadmapBatchArtifacts,
  roadmapBatchArtifactAttempts,
  auditEvidenceEvents,
  codexSessions,
  codexSessionFiles,
  codexLimitHeads,
  codexLimitHistory,
  codexIndexCursors,
} from "./schema.js";
export type {
  ProjectRow,
  NewProjectRow,
  AppSettingsRow,
  NewAppSettingsRow,
  TaskRow,
  NewTaskRow,
  TaskCommentRow,
  NewTaskCommentRow,
  RuntimeProfileRow,
  NewRuntimeProfileRow,
  ChatSessionRow,
  NewChatSessionRow,
  ChatMessageRow,
  NewChatMessageRow,
  UsageEventRow,
  NewUsageEventRow,
  MemoryItemRow,
  NewMemoryItemRow,
  MemoryUsageEventRow,
  NewMemoryUsageEventRow,
  MemoryLifecycleEventRow,
  NewMemoryLifecycleEventRow,
  RuntimeWarmupSessionStatus,
  RuntimeWarmupSessionRow,
  NewRuntimeWarmupSessionRow,
  RoadmapBatchRow,
  NewRoadmapBatchRow,
  RoadmapBatchArtifactRow,
  NewRoadmapBatchArtifactRow,
  RoadmapBatchArtifactAttemptRow,
  NewRoadmapBatchArtifactAttemptRow,
  AuditEvidenceEventRow,
  NewAuditEvidenceEventRow,
  CodexSessionRow,
  NewCodexSessionRow,
  CodexSessionFileRow,
  NewCodexSessionFileRow,
  CodexLimitHeadRow,
  NewCodexLimitHeadRow,
  CodexLimitHistoryRow,
  NewCodexLimitHistoryRow,
  CodexIndexCursorRow,
  NewCodexIndexCursorRow,
} from "./schema.js";

// Types
export {
  TASK_STATUSES,
  type TaskStatus,
  type TaskIntent,
  AUTO_REVIEW_STRATEGIES,
  type AutoReviewStrategy,
  AUTO_REVIEW_FINDING_SOURCES,
  type AutoReviewFindingSource,
  type AutoReviewFinding,
  type AutoReviewState,
  type Project,
  type CreateProjectInput,
  type AppSettings,
  type UpdateAppSettingsInput,
  type Task,
  type WorkflowTimeline,
  type WorkflowTimelineArtifact,
  type WorkflowTimelineArtifactState,
  type WorkflowTimelineAttempt,
  type WorkflowTimelineClaim,
  type WorkflowTimelineClaimOutcome,
  type WorkflowTimelineContext,
  type WorkflowTimelineEvent,
  type WorkflowTimelineEventKind,
  type WorkflowTimelineEvidence,
  type WorkflowTimelineEvidenceLink,
  type WorkflowTimelineEvidenceLinkRelation,
  type WorkflowTimelineSourceKind,
  type WorkflowTimelineTrustLevel,
  type CreateTaskInput,
  type UpdateTaskInput,
  type TaskComment,
  type TaskCommentAttachment,
  type CreateTaskCommentInput,
  TASK_EVENTS,
  type TaskEvent,
  type TaskEventInput,
  type ReorderTaskInput,
  MEMORY_ITEM_STATUSES,
  type MemoryItemStatus,
  MEMORY_SCOPES,
  type MemoryScope,
  MEMORY_REDACTION_STATUSES,
  type MemoryRedactionStatus,
  MEMORY_SOURCE_KINDS,
  type MemorySourceKind,
  MEMORY_WORKFLOW_KINDS,
  type MemoryWorkflowKind,
  MEMORY_LIFECYCLE_ACTIONS,
  type MemoryLifecycleAction,
  type MemoryItem,
  type CreateMemoryItemInput,
  type UpdateMemoryItemInput,
  type MemoryUsageEvent,
  type MemoryLifecycleEvent,
  type MemoryItemBroadcastPayload,
  type WsEventType,
  type WsEvent,
  type ChatMessage,
  type ChatMessageAttachment,
  type ChatRequest,
  type ChatStreamTokenPayload,
  type ChatDonePayload,
  type ChatErrorPayload,
  type ChatAction,
  type ChatActionCreateTask,
  isRuntimeTransport,
  RUNTIME_TRANSPORTS,
  RuntimeTransport,
  type RuntimeProfileUsage,
  type RuntimeProfile,
  type CreateRuntimeProfileInput,
  type UpdateRuntimeProfileInput,
  type EffectiveRuntimeProfileSource,
  type EffectiveRuntimeProfileSelection,
  RuntimeLimitSource,
  RuntimeLimitStatus,
  RuntimeLimitPrecision,
  RuntimeLimitScope,
  type RuntimeLimitWindow,
  type RuntimeLimitSnapshot,
  type RuntimeLimitEventPayload,
  type WarmupBroadcastPayload,
  type ChatSessionSource,
  type ChatSession,
  type CreateChatSessionInput,
  type UpdateChatSessionInput,
  type ChatSessionMessage,
} from "./types.js";

// Task intent contract
export {
  TASK_INTENTS,
  TASK_INTENT_CONTRACTS,
  formatTaskIntentContractForPrompt,
  inferTaskIntent,
  isTaskIntent,
  normalizeTaskIntent,
  resolveTaskIntentDefaults,
  validateGeneratedTaskIntent,
  type InferTaskIntentInput,
  type ResolvedTaskIntentDefaults,
  type TaskIntentContract,
  type TaskIntentDefaults,
  type TaskIntentUseSubagentsDefault,
  type ValidateGeneratedTaskIntentInput,
  type ValidateGeneratedTaskIntentResult,
} from "./taskIntent.js";
export {
  WORKFLOW_PACKS,
  getWorkflowPack,
  validateGeneratedWorkflowTask,
  type WorkflowPack,
} from "./workflowPacks.js";
export {
  AUDIT_ARTIFACT_ROLES,
  AUDIT_ARTIFACT_REWORK_STATUSES,
  AUDIT_ARTIFACT_STATES,
  AUDIT_FAILURE_FAMILIES,
  AUDIT_GENERATED_CARD_ISSUE_CODES,
  AUDIT_NO_FINDINGS_PROOF_GUARDRAIL,
  AUDIT_REQUIRED_GENERATED_CARD_MARKERS,
  AUDIT_SUBSTANTIVE_NO_FINDINGS_REQUIREMENT,
  AUDIT_SYNTHESIS_OUTCOME_REQUIREMENT,
  TASK_COMPLETION_ISSUE_FAILURE_FAMILIES,
  buildAuditFailureSignature,
  classifyAuditDecompositionRequest,
  extractAuditPathTokens,
  extractAuditRiskHypothesisIdsFromLine,
  findAuditReportArtifactLine,
  findAuditRiskHypothesesLine,
  findAuditScopeLine,
  hasImplementationShapedAuditText,
  isAuditReportArtifactPath,
  isAuditSynthesisTitle,
  mapTaskCompletionIssueCodeToAuditFailureFamily,
  parseAuditScopeRoots,
  parseAuditReportArtifactPath,
  parseExpectedAuditReportArtifactPath,
  selectAuditArtifactFailureFamily,
  selectTaskCompletionAuditFailureFamily,
  validateGeneratedAuditCard,
  type AuditArtifactReworkStatus,
  type AuditArtifactRole,
  type AuditArtifactState,
  type ClassifyAuditDecompositionRequestInput,
  type AuditDecompositionClassification,
  type AuditDecompositionMode,
  type AuditDecompositionReasonCode,
  type AuditFailureFamily,
  type AuditFailureSignatureInput,
  type AuditGeneratedCardIssueCode,
  type AuditGeneratedCardValidationIssue,
  type ValidateGeneratedAuditCardInput,
  type ValidateGeneratedAuditCardResult,
} from "./auditRoadmapContract.js";

// Database
export { getDb, createTestDb, closeDb } from "./db.js";

// Environment
export { getEnv, validateEnv, resetEnvCache } from "./env.js";
export type { Env } from "./env.js";

// Constants
export {
  STATUS_CONFIG,
  ORDERED_STATUSES,
  WARMUP_TARGETS,
  WARMUP_WORKFLOW_KINDS,
  DEFAULT_WARMUP_TARGET,
  isWarmupWorkflowKind,
  type WarmupTarget,
  type WarmupWorkflowKind,
  type WarmupProfileMode,
} from "./constants.js";
export { applyHumanTaskEvent, HUMAN_ACTIONS_BY_STATUS, CLEAN_STATE_RESET } from "./stateMachine.js";

// Logger
export { logger, rootLogger } from "./logger.js";

// Monorepo root resolution
export { findMonorepoRoot, findMonorepoRootFromUrl } from "./monorepoRoot.js";

// Project initialization
export { initBaseProjectDirectory } from "./projectInit.js";
export {
  slugify,
  generatePlanPath,
  getCanonicalPlanPath,
  syncPlanTextToCanonicalFile,
} from "./planFile.js";
export type { GeneratePlanPathOptions } from "./planFile.js";
export { persistTaskPlan } from "./taskPlan.js";

// Audit report validation (Node-only)
export {
  AUDIT_REPORT_VALIDATION_ISSUE_CODES,
  computeAuditReportArtifactSha256,
  computeAuditReportContentSha256,
  extractAuditReportManifestEvidenceRefs,
  formatAuditReportValidationIssues,
  stripAuditReportManifestBlocks,
  validateAuditReportArtifact,
  type AuditReportManifest,
  type AuditReportManifestStatus,
  type AuditReportScopeCoverage,
  type AuditReportSourceSnapshot,
  type AuditReportValidationInput,
  type AuditReportValidationIssue,
  type AuditReportValidationIssueCode,
  type AuditReportValidationResult,
} from "./auditReportValidator.js";
export {
  AUDIT_SYNTHESIS_OUTCOME_COMMENT,
  AUDIT_SYNTHESIS_OUTCOME_KINDS,
  classifyAuditSynthesisOutput,
  classifyAuditSynthesisSourceReports,
  combineAuditSynthesisOutcomes,
  extractAuditSynthesisCommandEvidence,
  formatAuditSynthesisOutcomeForArtifact,
  parseAuditSynthesisOutcomeFromText,
  type AuditSynthesisOutcome,
  type AuditSynthesisOutcomeKind,
  type AuditSynthesisSourceReport,
} from "./auditSynthesisClassifier.js";
export {
  AUDIT_SOURCE_CLASSIFICATIONS,
  classifyAuditSourceEvidence,
  collectExistingAuditLineEvidenceRefs,
  extractAuditCommandEvidence,
  extractSubstantiveAuditCommandEvidence,
  isInventoryAuditCommand,
  type AuditCommandEvidence,
  type AuditSourceClassification,
  type AuditSourceEvidenceClassification,
} from "./auditSourceEvidence.js";
export {
  AUDIT_EVIDENCE_GRADES,
  AUDIT_EVIDENCE_KINDS,
  AUDIT_EVIDENCE_REDACTION_STATUSES,
  AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE,
  EVIDENCE_UNIT_GRADES,
  EVIDENCE_UNIT_KINDS,
  EVIDENCE_UNIT_REDACTION_STATUSES,
  EVIDENCE_UNIT_RUNTIME_EVENT_TYPE,
  buildAuditEvidencePayload,
  buildAuditEvidenceUnit,
  buildEvidenceUnit,
  buildEvidenceUnitPayload,
  deriveAuditEvidenceScopeIdsFromPaths,
  deriveAuditSourceSnapshotId,
  deriveEvidenceSourceSnapshotId,
  deriveEvidenceUnitScopeIdsFromPaths,
  extractAuditRiskHypothesisIds,
  extractAuditScopeIdsFromText,
  hashEvidenceUnitPath,
  hashEvidenceUnitPathRange,
  hashAuditEvidencePath,
  hashAuditEvidencePathRange,
  normalizeEvidenceUnitIds,
  normalizeEvidenceUnitPath,
  normalizeAuditEvidenceIds,
  readAuditEvidenceRuntimePayload,
  readEvidenceUnitRuntimePayload,
  resolveEvidencePlanId,
  resolveAuditPlanId,
  type AuditEvidenceCommandMetadata,
  type AuditEvidenceGrade,
  type AuditEvidenceKind,
  type AuditEvidenceParsedSummary,
  type AuditEvidencePathRange,
  type AuditEvidenceRedactionStatus,
  type AuditEvidenceRuntimePayload,
  type AuditEvidenceUnit,
  type BuildAuditEvidencePayloadInput,
  type BuildAuditEvidenceUnitContext,
  type BuildEvidenceUnitContext,
  type BuildEvidenceUnitPayloadInput,
  type EvidenceUnit,
  type EvidenceUnitCommandMetadata,
  type EvidenceUnitGrade,
  type EvidenceUnitKind,
  type EvidenceUnitParsedSummary,
  type EvidenceUnitPathRange,
  type EvidenceUnitRedactionStatus,
  type EvidenceUnitRuntimePayload,
} from "./auditEvidenceLedger.js";

// Task completion evidence guard (Node-only)
export {
  evaluateTaskCompletionEvidence,
  formatTaskCompletionBlockedReason,
  hasSubstantiveReportEvidence,
  isRiskyTask,
  type TaskCompletionEvidenceInput,
  type TaskCompletionEvidenceIssue,
  type TaskCompletionEvidenceResult,
  type TaskCompletionEvidenceTask,
  type TaskCompletionIssueCode,
} from "./taskCompletionEvidence.js";

// Task plan quality guard
export {
  TASK_PLAN_QUALITY_ISSUE_CODES,
  TaskPlanQualityError,
  buildDeterministicDiagnosticPlan,
  evaluateTaskPlanQuality,
  findDeterministicDiagnosticReportPath,
  formatTaskPlanQualityBlockedReason,
  type DeterministicDiagnosticPlanInput,
  type TaskPlanQualityInput,
  type TaskPlanQualityIssue,
  type TaskPlanQualityIssueCode,
  type TaskPlanQualityResult,
  type TaskPlanQualityTask,
} from "./planQuality.js";

// Path validation
export { validateProjectRootPath } from "./pathValidation.js";

// Git/worktree isolation utilities (Node-only)
export {
  BranchIsolationError,
  assertCurrentBranch,
  assertWorkingTreeClean,
  branchExists,
  buildBranchName,
  buildTaskWorktreePath,
  describeDirtyWorkingTree,
  ensureFeatureBranch,
  ensureTaskWorktree,
  getCurrentBranch,
  isBranchIsolationError,
  isGitRepo,
  projectSupportsTaskWorktrees,
  projectUsesSharedBranchIsolation,
  restorePersistedBranch,
  slugifyTitle,
  validateBranchName,
  workingTreeClean,
  type EnsureFeatureBranchInput,
  type EnsureFeatureBranchResult,
  type EnsureTaskWorktreeInput,
  type EnsureTaskWorktreeResult,
  type RestorePersistedBranchInput,
} from "./gitIsolation.js";

// Attachment utilities
export {
  parseAttachments,
  isFileBackedAttachment,
  formatAttachmentsForPrompt,
  extractHeadings,
  looksLikeFullPlanUpdate,
  type ParsedAttachment,
} from "./attachments.js";

// Task usage metrics
export { parseTaskTokenUsage, type TaskTokenUsage } from "./taskUsage.js";

// Sync utilities
export {
  type SyncDirection,
  type ConflictResolution,
  type SyncEvent,
  type PlanAnnotation,
  parsePlanAnnotations,
  insertPlanAnnotation,
} from "./sync.js";

// Project config (config.yaml)
export {
  getProjectConfig,
  clearProjectConfigCache,
  type AifProjectConfig,
  type AifProjectPaths,
  type AifProjectWorkflow,
  type AifProjectGit,
  type AifProjectLanguage,
} from "./projectConfig.js";

// Telegram notifications
export {
  escapeMarkdown,
  sendTelegramNotification,
  type TelegramNotificationOptions,
} from "./telegram.js";

// Planner mode defaults
export { defaultsForMode } from "./plannerDefaults.js";
export type { PlannerMode, PlannerFlagDefaults } from "./plannerDefaults.js";

// Utilities
export { withTimeout } from "./withTimeout.js";
export { parseMcpPortSetting, type ParsedMcpPortSetting } from "./mcpPort.js";

// Runtime-limit shared helpers
export {
  buildRuntimeLimitSignature,
  mapSafeRuntimeErrorReason,
  normalizeRuntimeLimitSnapshot,
  redactProviderText,
  redactProviderTextForLogs,
  resolveRuntimeLimitFutureHint,
  sanitizeRuntimeLimitSnapshotForExposure,
  sanitizeProviderMeta,
  selectViolatedWindowForExactThreshold,
  type RuntimeLimitFutureHint,
  type RuntimeLimitFutureHintSource,
  type RuntimeLimitSnapshotExposure,
  type SafeRuntimeErrorCategory,
  type SafeRuntimeErrorReason,
} from "./runtimeLimitUtils.js";
