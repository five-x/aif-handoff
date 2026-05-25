import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { ConfigAuditAction, ConfigSourceKind } from "./configGovernance.js";
import type {
  MemoryLifecycleAction,
  MemoryFailureFamily,
  MemoryItemStatus,
  MemoryItemType,
  MemoryRedactionStatus,
  MemoryScope,
  MemorySourceKind,
  MemoryWorkflowKind,
  TaskStatus,
  TaskHierarchyRole,
  TaskParentCloseoutPolicy,
  CoordinatorStage,
  UsageEventOutcome,
} from "./types.js";
import type { RuntimeStage } from "./constants.js";
import type { TaskIntent } from "./taskIntent.js";
import type {
  AuditEvidenceGrade,
  AuditEvidenceKind,
  AuditEvidenceRedactionStatus,
} from "./auditEvidenceLedger.js";

export const projects = sqliteTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  rootPath: text("root_path").notNull(),
  plannerMaxBudgetUsd: real("planner_max_budget_usd"),
  planCheckerMaxBudgetUsd: real("plan_checker_max_budget_usd"),
  implementerMaxBudgetUsd: real("implementer_max_budget_usd"),
  reviewSidecarMaxBudgetUsd: real("review_sidecar_max_budget_usd"),
  parallelEnabled: integer("parallel_enabled", { mode: "boolean" }).notNull().default(false),
  autoQueueMode: integer("auto_queue_mode", { mode: "boolean" }).notNull().default(false),
  defaultTaskRuntimeProfileId: text("default_task_runtime_profile_id"),
  defaultPlanRuntimeProfileId: text("default_plan_runtime_profile_id"),
  defaultReviewRuntimeProfileId: text("default_review_runtime_profile_id"),
  defaultChatRuntimeProfileId: text("default_chat_runtime_profile_id"),
  tokenInput: integer("token_input").notNull().default(0),
  tokenOutput: integer("token_output").notNull().default(0),
  tokenTotal: integer("token_total").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey().notNull().default(1),
  defaultTaskRuntimeProfileId: text("default_task_runtime_profile_id"),
  defaultPlanRuntimeProfileId: text("default_plan_runtime_profile_id"),
  defaultReviewRuntimeProfileId: text("default_review_runtime_profile_id"),
  defaultChatRuntimeProfileId: text("default_chat_runtime_profile_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type AppSettingsRow = typeof appSettings.$inferSelect;
export type NewAppSettingsRow = typeof appSettings.$inferInsert;

export const tasks = sqliteTable("tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  attachments: text("attachments").notNull().default("[]"),
  autoMode: integer("auto_mode", { mode: "boolean" }).notNull().default(true),
  taskIntent: text("task_intent").$type<TaskIntent>().notNull().default("general"),
  isFix: integer("is_fix", { mode: "boolean" }).notNull().default(false),
  plannerMode: text("planner_mode").notNull().default("fast"),
  planPath: text("plan_path").notNull().default(".ai-factory/PLAN.md"),
  sourceRef: text("source_ref"),
  planDocs: integer("plan_docs", { mode: "boolean" }).notNull().default(false),
  planTests: integer("plan_tests", { mode: "boolean" }).notNull().default(false),
  skipReview: integer("skip_review", { mode: "boolean" }).notNull().default(false),
  useSubagents: integer("use_subagents", { mode: "boolean" }).notNull().default(false),
  status: text("status").$type<TaskStatus>().notNull().default("backlog"),
  priority: integer("priority").notNull().default(0),
  position: real("position").notNull().default(1000.0),
  parentTaskId: text("parent_task_id"),
  rootTaskId: text("root_task_id"),
  hierarchyDepth: integer("hierarchy_depth").notNull().default(0),
  hierarchyRole: text("hierarchy_role").$type<TaskHierarchyRole>().notNull().default("executable"),
  hierarchyPosition: real("hierarchy_position").notNull().default(1000.0),
  parentCloseoutPolicy: text("parent_closeout_policy").$type<TaskParentCloseoutPolicy | null>(),
  plan: text("plan"),
  implementationLog: text("implementation_log"),
  implementationManifestJson: text("implementation_manifest_json"),
  reviewComments: text("review_comments"),
  agentActivityLog: text("agent_activity_log"),
  blockedReason: text("blocked_reason"),
  blockedFromStatus: text("blocked_from_status").$type<TaskStatus | null>(),
  retryAfter: text("retry_after"),
  retryCount: integer("retry_count").notNull().default(0),
  tokenInput: integer("token_input").notNull().default(0),
  tokenOutput: integer("token_output").notNull().default(0),
  tokenTotal: integer("token_total").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  roadmapAlias: text("roadmap_alias"),
  tags: text("tags").notNull().default("[]"),
  reworkRequested: integer("rework_requested", { mode: "boolean" }).notNull().default(false),
  reviewIterationCount: integer("review_iteration_count").notNull().default(0),
  maxReviewIterations: integer("max_review_iterations").notNull().default(100),
  manualReviewRequired: integer("manual_review_required", { mode: "boolean" })
    .notNull()
    .default(false),
  autoReviewStateJson: text("auto_review_state_json"),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  lastHeartbeatAt: text("last_heartbeat_at"),
  lastSyncedAt: text("last_synced_at"),
  runtimeProfileId: text("runtime_profile_id"),
  modelOverride: text("model_override"),
  runtimeOptionsJson: text("runtime_options_json"),
  sessionId: text("session_id"),
  runtimeLimitSnapshotJson: text("runtime_limit_snapshot_json"),
  runtimeLimitUpdatedAt: text("runtime_limit_updated_at"),
  lockedBy: text("locked_by"),
  lockedUntil: text("locked_until"),
  lockStage: text("lock_stage").$type<CoordinatorStage | null>(),
  coordinatorId: text("coordinator_id"),
  scheduledAt: text("scheduled_at"),
  branchName: text("branch_name"),
  worktreePath: text("worktree_path"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;

export const taskComments = sqliteTable("task_comments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  taskId: text("task_id").notNull(),
  author: text("author").$type<"human" | "agent">().notNull().default("human"),
  message: text("message").notNull(),
  attachments: text("attachments").notNull().default("[]"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type TaskCommentRow = typeof taskComments.$inferSelect;
export type NewTaskCommentRow = typeof taskComments.$inferInsert;

export const roadmapBatches = sqliteTable("roadmap_batches", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull(),
  roadmapAlias: text("roadmap_alias").notNull(),
  taskIntent: text("task_intent").$type<TaskIntent>().notNull().default("general"),
  status: text("status").notNull().default("expected"),
  executionPolicy: text("execution_policy").notNull().default("serialized_shared_checkout"),
  synthesisTaskId: text("synthesis_task_id"),
  expectedArtifactCount: integer("expected_artifact_count").notNull().default(0),
  validArtifactCount: integer("valid_artifact_count").notNull().default(0),
  invalidArtifactCount: integer("invalid_artifact_count").notNull().default(0),
  missingArtifactCount: integer("missing_artifact_count").notNull().default(0),
  externalBlockedArtifactCount: integer("external_blocked_artifact_count").notNull().default(0),
  synthesisReady: integer("synthesis_ready", { mode: "boolean" }).notNull().default(false),
  failureFamily: text("failure_family"),
  summaryJson: text("summary_json"),
  createdTaskIdsJson: text("created_task_ids_json").notNull().default("[]"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type RoadmapBatchRow = typeof roadmapBatches.$inferSelect;
export type NewRoadmapBatchRow = typeof roadmapBatches.$inferInsert;

export const roadmapBatchArtifacts = sqliteTable("roadmap_batch_artifacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  batchId: text("batch_id").notNull(),
  projectId: text("project_id").notNull(),
  roadmapAlias: text("roadmap_alias").notNull(),
  taskId: text("task_id").notNull(),
  role: text("role").notNull().default("report"),
  artifactPath: text("artifact_path").notNull(),
  state: text("state").notNull().default("expected"),
  failureFamily: text("failure_family"),
  validationDetailsJson: text("validation_details_json"),
  branchName: text("branch_name"),
  worktreePath: text("worktree_path"),
  projectRoot: text("project_root"),
  contentSha: text("content_sha"),
  attemptNumber: integer("attempt_number").notNull().default(0),
  attemptBoundaryId: text("attempt_boundary_id"),
  failureSignature: text("failure_signature"),
  validatedAt: text("validated_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type RoadmapBatchArtifactRow = typeof roadmapBatchArtifacts.$inferSelect;
export type NewRoadmapBatchArtifactRow = typeof roadmapBatchArtifacts.$inferInsert;

export const roadmapBatchArtifactAttempts = sqliteTable("roadmap_batch_artifact_attempts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  artifactId: text("artifact_id").notNull(),
  batchId: text("batch_id").notNull(),
  projectId: text("project_id").notNull(),
  roadmapAlias: text("roadmap_alias").notNull(),
  taskId: text("task_id").notNull(),
  role: text("role").notNull().default("report"),
  artifactPath: text("artifact_path").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  attemptBoundaryId: text("attempt_boundary_id"),
  state: text("state").notNull(),
  classification: text("classification"),
  failureFamily: text("failure_family"),
  failureSignature: text("failure_signature"),
  contentSha: text("content_sha"),
  reworkStatus: text("rework_status").notNull().default("not_applicable"),
  validationDetailsJson: text("validation_details_json"),
  sourceSnapshotId: text("source_snapshot_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type RoadmapBatchArtifactAttemptRow = typeof roadmapBatchArtifactAttempts.$inferSelect;
export type NewRoadmapBatchArtifactAttemptRow = typeof roadmapBatchArtifactAttempts.$inferInsert;

export const auditEvidenceEvents = sqliteTable("audit_evidence_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  auditPlanId: text("audit_plan_id").notNull(),
  sourceSnapshotId: text("source_snapshot_id").notNull(),
  toolName: text("tool_name").notNull(),
  evidenceKind: text("evidence_kind").$type<AuditEvidenceKind>().notNull(),
  evidenceGrade: text("evidence_grade").$type<AuditEvidenceGrade>().notNull(),
  scopeIdsJson: text("scope_ids_json").notNull().default("[]"),
  riskHypothesisIdsJson: text("risk_hypothesis_ids_json").notNull().default("[]"),
  pathHashesJson: text("path_hashes_json").notNull().default("[]"),
  pathRangeHashesJson: text("path_range_hashes_json").notNull().default("[]"),
  commandJson: text("command_json"),
  exitCode: integer("exit_code"),
  outputSha256: text("output_sha256"),
  outputPreview: text("output_preview"),
  outputPreviewTruncated: integer("output_preview_truncated", { mode: "boolean" })
    .notNull()
    .default(false),
  parsedSummaryJson: text("parsed_summary_json"),
  redactionStatus: text("redaction_status")
    .$type<AuditEvidenceRedactionStatus>()
    .notNull()
    .default("clean"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type AuditEvidenceEventRow = typeof auditEvidenceEvents.$inferSelect;
export type NewAuditEvidenceEventRow = typeof auditEvidenceEvents.$inferInsert;

export const configAuditEvents = sqliteTable("config_audit_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull(),
  taskId: text("task_id"),
  runtimeProfileId: text("runtime_profile_id"),
  action: text("action").$type<ConfigAuditAction>().notNull(),
  sourceKind: text("source_kind").$type<ConfigSourceKind>().notNull(),
  actor: text("actor"),
  reasonCodesJson: text("reason_codes_json").$type<string>().notNull().default("[]"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ConfigAuditEventRow = typeof configAuditEvents.$inferSelect;
export type NewConfigAuditEventRow = typeof configAuditEvents.$inferInsert;

export const runtimeProfiles = sqliteTable("runtime_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id"),
  name: text("name").notNull(),
  runtimeId: text("runtime_id").notNull(),
  providerId: text("provider_id").notNull(),
  transport: text("transport"),
  baseUrl: text("base_url"),
  apiKeyEnvVar: text("api_key_env_var"),
  defaultModel: text("default_model"),
  headersJson: text("headers_json").notNull().default("{}"),
  optionsJson: text("options_json").notNull().default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  runtimeLimitSnapshotJson: text("runtime_limit_snapshot_json"),
  runtimeLimitUpdatedAt: text("runtime_limit_updated_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type RuntimeProfileRow = typeof runtimeProfiles.$inferSelect;
export type NewRuntimeProfileRow = typeof runtimeProfiles.$inferInsert;

export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull(),
  title: text("title").notNull().default("New Chat"),
  agentSessionId: text("agent_session_id"),
  runtimeProfileId: text("runtime_profile_id"),
  runtimeSessionId: text("runtime_session_id"),
  tokenInput: integer("token_input").notNull().default(0),
  tokenOutput: integer("token_output").notNull().default(0),
  tokenTotal: integer("token_total").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ChatSessionRow = typeof chatSessions.$inferSelect;
export type NewChatSessionRow = typeof chatSessions.$inferInsert;

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id").notNull(),
  role: text("role").$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  attachments: text("attachments"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type NewChatMessageRow = typeof chatMessages.$inferInsert;

/**
 * Append-only token usage log. Every successful LLM call that flows through
 * the runtime registry wrapper produces one row here. Per-entity aggregate
 * counters (on tasks / projects / chat_sessions) are updated in the same
 * transaction so reads stay cheap, but this table is the source of truth for
 * auditing and per-source breakdowns. Scope fields are nullable — a chat run
 * has a `chat_session_id` but no `task_id`, a subagent run has `task_id` but
 * no `chat_session_id`, a commit run has only `project_id`, and so on.
 */
export const usageEvents = sqliteTable("usage_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  source: text("source").notNull(),
  projectId: text("project_id"),
  taskId: text("task_id"),
  chatSessionId: text("chat_session_id"),
  runtimeId: text("runtime_id").notNull(),
  providerId: text("provider_id").notNull(),
  profileId: text("profile_id"),
  transport: text("transport"),
  workflowKind: text("workflow_kind"),
  usageReporting: text("usage_reporting").notNull(),
  outcome: text("outcome").$type<UsageEventOutcome>().notNull().default("success"),
  errorCategory: text("error_category"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costUsd: real("cost_usd"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type UsageEventRow = typeof usageEvents.$inferSelect;
export type NewUsageEventRow = typeof usageEvents.$inferInsert;

export const memoryItems = sqliteTable("memory_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id"),
  scope: text("scope").$type<MemoryScope>().notNull().default("project"),
  sourceTaskId: text("source_task_id"),
  sourceKind: text("source_kind").$type<MemorySourceKind>().notNull().default("task"),
  sourceRef: text("source_ref"),
  itemType: text("item_type").$type<MemoryItemType>().notNull().default("architecture_note"),
  failureFamily: text("failure_family").$type<MemoryFailureFamily | null>(),
  claimsJson: text("claims_json").notNull().default("[]"),
  status: text("status").$type<MemoryItemStatus>().notNull().default("pending"),
  redactionStatus: text("redaction_status")
    .$type<MemoryRedactionStatus>()
    .notNull()
    .default("clean"),
  publishBlockReason: text("publish_block_reason"),
  reviewNote: text("review_note"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  tagsJson: text("tags_json").notNull().default("[]"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  approvedAt: text("approved_at"),
  rejectedAt: text("rejected_at"),
  expiredAt: text("expired_at"),
  expiresAt: text("expires_at"),
});

export type MemoryItemRow = typeof memoryItems.$inferSelect;
export type NewMemoryItemRow = typeof memoryItems.$inferInsert;

export const memoryUsageEvents = sqliteTable("memory_usage_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  memoryItemId: text("memory_item_id").notNull(),
  projectId: text("project_id"),
  taskId: text("task_id"),
  chatSessionId: text("chat_session_id"),
  workflowKind: text("workflow_kind").$type<MemoryWorkflowKind>().notNull(),
  source: text("source").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type MemoryUsageEventRow = typeof memoryUsageEvents.$inferSelect;
export type NewMemoryUsageEventRow = typeof memoryUsageEvents.$inferInsert;

export const memoryLifecycleEvents = sqliteTable("memory_lifecycle_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  memoryItemId: text("memory_item_id").notNull(),
  action: text("action").$type<MemoryLifecycleAction>().notNull(),
  actor: text("actor"),
  note: text("note"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type MemoryLifecycleEventRow = typeof memoryLifecycleEvents.$inferSelect;
export type NewMemoryLifecycleEventRow = typeof memoryLifecycleEvents.$inferInsert;

export type RuntimeWarmupSessionStatus = "creating" | "ready" | "failed" | "cleared" | "expired";

/**
 * Reusable seed sessions created ahead of task execution. A ready row can be
 * forked by compatible runtimes until its TTL expires or a newer warmup
 * clears it for the same runtime/profile/model scope.
 */
export const runtimeWarmupSessions = sqliteTable("runtime_warmup_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull(),
  runtimeProfileId: text("runtime_profile_id"),
  runtimeId: text("runtime_id").notNull(),
  providerId: text("provider_id").notNull(),
  transport: text("transport"),
  model: text("model"),
  stage: text("stage").$type<RuntimeStage>(),
  sourceSessionId: text("source_session_id"),
  status: text("status").$type<RuntimeWarmupSessionStatus>().notNull().default("creating"),
  ttlSeconds: integer("ttl_seconds").notNull(),
  expiresAt: text("expires_at").notNull(),
  summary: text("summary"),
  errorMessage: text("error_message"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type RuntimeWarmupSessionRow = typeof runtimeWarmupSessions.$inferSelect;
export type NewRuntimeWarmupSessionRow = typeof runtimeWarmupSessions.$inferInsert;

export const runtimeEndpointLeases = sqliteTable("runtime_endpoint_leases", {
  endpointKey: text("endpoint_key").primaryKey(),
  profileId: text("profile_id"),
  baseUrl: text("base_url"),
  runtimeId: text("runtime_id"),
  providerId: text("provider_id"),
  holderId: text("holder_id"),
  taskId: text("task_id"),
  leaseToken: text("lease_token"),
  heartbeatAt: text("heartbeat_at"),
  leaseTtlMs: integer("lease_ttl_ms"),
  leaseExpiresAt: text("lease_expires_at"),
  cooldownUntil: text("cooldown_until"),
  cooldownFailureCount: integer("cooldown_failure_count").notNull().default(0),
  cooldownReason: text("cooldown_reason"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type RuntimeEndpointLeaseRow = typeof runtimeEndpointLeases.$inferSelect;
export type NewRuntimeEndpointLeaseRow = typeof runtimeEndpointLeases.$inferInsert;

/**
 * Rebuildable Codex session index used by hot request paths.
 * Source of truth stays on disk (~/.codex/sessions/*.jsonl).
 */
export const codexSessions = sqliteTable("codex_sessions", {
  sessionId: text("session_id").primaryKey(),
  filePath: text("file_path").notNull().unique(),
  title: text("title"),
  projectRoot: text("project_root"),
  accountFingerprint: text("account_fingerprint"),
  sourceCreatedAt: text("source_created_at"),
  sourceUpdatedAt: text("source_updated_at"),
  messageCount: integer("message_count").notNull().default(0),
  previewText: text("preview_text"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  mtimeMs: integer("mtime_ms").notNull().default(0),
  lastIndexedAt: text("last_indexed_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type CodexSessionRow = typeof codexSessions.$inferSelect;
export type NewCodexSessionRow = typeof codexSessions.$inferInsert;

/**
 * Tracks file-level dirtiness/cursors for Codex session reconcile passes.
 */
export const codexSessionFiles = sqliteTable("codex_session_files", {
  filePath: text("file_path").primaryKey(),
  sessionId: text("session_id"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  mtimeMs: integer("mtime_ms").notNull().default(0),
  parsedOffset: integer("parsed_offset").notNull().default(0),
  pendingTail: text("pending_tail").notNull().default(""),
  missing: integer("missing", { mode: "boolean" }).notNull().default(false),
  importVersion: integer("import_version").notNull().default(1),
  lastSeenAt: text("last_seen_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type CodexSessionFileRow = typeof codexSessionFiles.$inferSelect;
export type NewCodexSessionFileRow = typeof codexSessionFiles.$inferInsert;

/**
 * Latest known Codex usage-limit snapshot per account/project/limit scope.
 */
export const codexLimitHeads = sqliteTable("codex_limit_heads", {
  headKey: text("head_key").primaryKey(),
  accountFingerprint: text("account_fingerprint").notNull(),
  projectRoot: text("project_root"),
  limitId: text("limit_id").notNull(),
  model: text("model"),
  source: text("source").notNull().default("codex"),
  snapshotJson: text("snapshot_json").notNull(),
  observedAt: text("observed_at").notNull(),
  sessionId: text("session_id"),
  filePath: text("file_path"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type CodexLimitHeadRow = typeof codexLimitHeads.$inferSelect;
export type NewCodexLimitHeadRow = typeof codexLimitHeads.$inferInsert;

/**
 * Bounded recent Codex limit snapshots used for diagnostics/history.
 */
export const codexLimitHistory = sqliteTable("codex_limit_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  headKey: text("head_key").notNull(),
  accountFingerprint: text("account_fingerprint").notNull(),
  projectRoot: text("project_root"),
  limitId: text("limit_id").notNull(),
  model: text("model"),
  snapshotJson: text("snapshot_json").notNull(),
  observedAt: text("observed_at").notNull(),
  sessionId: text("session_id"),
  filePath: text("file_path"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type CodexLimitHistoryRow = typeof codexLimitHistory.$inferSelect;
export type NewCodexLimitHistoryRow = typeof codexLimitHistory.$inferInsert;

/**
 * Generic index cursor/watermark state for Codex reconcile pipeline.
 */
export const codexIndexCursors = sqliteTable("codex_index_cursors", {
  cursorKey: text("cursor_key").primaryKey(),
  cursorValue: text("cursor_value"),
  cursorJson: text("cursor_json"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type CodexIndexCursorRow = typeof codexIndexCursors.$inferSelect;
export type NewCodexIndexCursorRow = typeof codexIndexCursors.$inferInsert;
