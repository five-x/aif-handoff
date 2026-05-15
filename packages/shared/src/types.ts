import type { TaskIntent } from "./taskIntent.js";

export const TASK_STATUSES = [
  "backlog",
  "planning",
  "plan_ready",
  "implementing",
  "review",
  "blocked_external",
  "done",
  "verified",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type { TaskIntent };

export const AUTO_REVIEW_STRATEGIES = ["full_re_review", "closure_first"] as const;

export type AutoReviewStrategy = (typeof AUTO_REVIEW_STRATEGIES)[number];

export const AUTO_REVIEW_FINDING_SOURCES = [
  "code_review",
  "security_audit",
  "review_gate",
] as const;

export type AutoReviewFindingSource = (typeof AUTO_REVIEW_FINDING_SOURCES)[number];

export interface AutoReviewFinding {
  id: string;
  text: string;
  source: AutoReviewFindingSource;
  firstSeenIteration?: number;
  lastSeenIteration?: number;
  streak?: number;
}

export interface AutoReviewReworkSnapshot {
  iteration: number;
  artifactPath: string;
  artifactContentSha: string | null;
  findingIds: string[];
}

export interface AutoReviewState {
  strategy: AutoReviewStrategy;
  iteration: number;
  findings: AutoReviewFinding[];
  reworkSnapshot?: AutoReviewReworkSnapshot;
}

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  plannerMaxBudgetUsd: number | null;
  planCheckerMaxBudgetUsd: number | null;
  implementerMaxBudgetUsd: number | null;
  reviewSidecarMaxBudgetUsd: number | null;
  parallelEnabled: boolean;
  autoQueueMode: boolean;
  defaultTaskRuntimeProfileId?: string | null;
  defaultPlanRuntimeProfileId?: string | null;
  defaultReviewRuntimeProfileId?: string | null;
  defaultChatRuntimeProfileId?: string | null;
  /** Aggregate token/cost usage across ALL sources (tasks, chat, commit, roadmap). */
  tokenInput?: number;
  tokenOutput?: number;
  tokenTotal?: number;
  costUsd?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  rootPath: string;
  plannerMaxBudgetUsd?: number;
  planCheckerMaxBudgetUsd?: number;
  implementerMaxBudgetUsd?: number;
  reviewSidecarMaxBudgetUsd?: number;
  parallelEnabled?: boolean;
  autoQueueMode?: boolean;
  defaultTaskRuntimeProfileId?: string | null;
  defaultPlanRuntimeProfileId?: string | null;
  defaultReviewRuntimeProfileId?: string | null;
  defaultChatRuntimeProfileId?: string | null;
}

export interface AppSettings {
  id: number;
  defaultTaskRuntimeProfileId: string | null;
  defaultPlanRuntimeProfileId: string | null;
  defaultReviewRuntimeProfileId: string | null;
  defaultChatRuntimeProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAppSettingsInput {
  defaultTaskRuntimeProfileId?: string | null;
  defaultPlanRuntimeProfileId?: string | null;
  defaultReviewRuntimeProfileId?: string | null;
  defaultChatRuntimeProfileId?: string | null;
}

export interface TaskCommentAttachment {
  name: string;
  mimeType: string;
  size: number;
  /** Inline content (text or base64). Deprecated for binary files — use `path` instead. */
  content: string | null;
  /** Relative path in storage/ directory. Present for file-backed attachments. */
  path?: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  attachments?: TaskCommentAttachment[];
  autoMode: boolean;
  taskIntent?: TaskIntent;
  isFix: boolean;
  plannerMode: string;
  planPath: string;
  planDocs: boolean;
  planTests: boolean;
  skipReview: boolean;
  useSubagents: boolean;
  status: TaskStatus;
  priority: number;
  position: number;
  plan: string | null;
  implementationLog: string | null;
  reviewComments: string | null;
  agentActivityLog: string | null;
  blockedReason: string | null;
  blockedFromStatus: TaskStatus | null;
  retryAfter: string | null;
  retryCount: number;
  tokenInput?: number;
  tokenOutput?: number;
  tokenTotal?: number;
  costUsd?: number;
  roadmapAlias: string | null;
  tags: string[];
  reworkRequested: boolean;
  reviewIterationCount: number;
  maxReviewIterations: number;
  manualReviewRequired: boolean;
  autoReviewState: AutoReviewState | null;
  paused: boolean;
  lastHeartbeatAt: string | null;
  lastSyncedAt: string | null;
  runtimeProfileId?: string | null;
  modelOverride?: string | null;
  runtimeOptions?: Record<string, unknown> | null;
  sessionId: string | null;
  runtimeLimitSnapshot?: RuntimeLimitSnapshot | null;
  runtimeLimitUpdatedAt?: string | null;
  artifactTrust?: TaskArtifactTrustRollup | null;
  scheduledAt: string | null;
  branchName: string | null;
  worktreePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  author: "human" | "agent";
  message: string;
  attachments: TaskCommentAttachment[];
  createdAt: string;
}

export type WorkflowTimelineSourceKind = "none" | "roadmap_batch";

export type WorkflowTimelineArtifactState =
  | "expected"
  | "accepted"
  | "rejected"
  | "missing"
  | "inconclusive"
  | "blocked"
  | "manual_exception";

export type WorkflowTimelineClaimOutcome =
  | "supported"
  | "refuted"
  | "inconclusive"
  | "blocked"
  | "waived"
  | "not_evaluated";

export type WorkflowTimelineTrustLevel = "trusted" | "weak" | "untrusted";

export type TaskArtifactTrustLevel = WorkflowTimelineTrustLevel;

export type TaskArtifactTrustClaimOutcome = WorkflowTimelineClaimOutcome;

export type TaskArtifactTrustNextAction =
  | "none"
  | "retry_source_rework"
  | "retry_synthesis"
  | "provide_operator_input"
  | "inspect_untrusted_source"
  | "wait_for_source_artifacts";

export interface TaskArtifactTrustBatchCounts {
  trustedValid: number;
  inconclusive: number;
  rejected: number;
  missing: number;
  externalBlocked: number;
  synthesisPending: number;
  total: number;
}

export interface TaskArtifactTrustRollup {
  taskStatus: TaskStatus;
  artifactRole: string;
  artifactState: string;
  artifactTrustLevel: TaskArtifactTrustLevel;
  claimOutcome: TaskArtifactTrustClaimOutcome;
  failureFamily: string | null;
  reasonCodes: string[];
  latestAttemptOutcome: string | null;
  trustedSynthesisInput: boolean;
  synthesisReady: boolean;
  nextAction: TaskArtifactTrustNextAction;
  nextActionLabel: string;
  summary: string;
  artifactPath: string | null;
  batchId: string;
  roadmapAlias: string | null;
  attemptNumber: number;
  failureSignature: string | null;
  branchName: string | null;
  worktreePath: string | null;
  batchCounts: TaskArtifactTrustBatchCounts;
}

export type WorkflowTimelineEvidenceLinkRelation = "supports" | "refutes" | "context";

export type WorkflowTimelineEventKind =
  | "artifact_created"
  | "artifact_updated"
  | "attempt_recorded"
  | "claim_evaluated"
  | "evidence_recorded";

export interface WorkflowTimelineContext {
  taskId: string;
  projectId: string;
  workflowPackId: string | null;
  workflowKind: string;
  roadmapAlias: string | null;
  sourceKind: WorkflowTimelineSourceKind;
  sourceId: string | null;
  status: string;
  generatedAt: string;
}

export interface WorkflowTimelineArtifact {
  id: string;
  taskId: string;
  kind: string;
  label: string;
  path: string | null;
  state: WorkflowTimelineArtifactState;
  currentAttemptNumber: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface WorkflowTimelineAttempt {
  id: string;
  artifactId: string;
  taskId: string;
  attemptNumber: number;
  state: WorkflowTimelineArtifactState;
  outcome: WorkflowTimelineClaimOutcome;
  trustLevel: WorkflowTimelineTrustLevel;
  sourceSnapshotId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface WorkflowTimelineClaim {
  id: string;
  artifactId: string;
  taskId: string;
  attemptId: string | null;
  label: string;
  outcome: WorkflowTimelineClaimOutcome;
  trustLevel: WorkflowTimelineTrustLevel;
  evaluatedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface WorkflowTimelineEvidence {
  id: string;
  taskId: string;
  kind: string;
  grade: string;
  toolName: string;
  summary: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface WorkflowTimelineEvidenceLink {
  id: string;
  evidenceId: string;
  artifactId: string | null;
  claimId: string | null;
  relation: WorkflowTimelineEvidenceLinkRelation;
  metadata: Record<string, unknown>;
}

export interface WorkflowTimelineEvent {
  id: string;
  kind: WorkflowTimelineEventKind;
  occurredAt: string;
  title: string;
  artifactId: string | null;
  attemptId: string | null;
  claimId: string | null;
  evidenceId: string | null;
  metadata: Record<string, unknown>;
}

export interface WorkflowTimeline {
  context: WorkflowTimelineContext;
  artifacts: WorkflowTimelineArtifact[];
  attempts: WorkflowTimelineAttempt[];
  claims: WorkflowTimelineClaim[];
  evidence: WorkflowTimelineEvidence[];
  evidenceLinks: WorkflowTimelineEvidenceLink[];
  events: WorkflowTimelineEvent[];
}

/** POST /tasks/:id/comments body */
export interface CreateTaskCommentInput {
  message: string;
  attachments?: TaskCommentAttachment[];
}

/** POST /tasks body */
export interface CreateTaskInput {
  projectId: string;
  title: string;
  description: string;
  priority?: number;
  autoMode?: boolean;
  taskIntent?: TaskIntent;
  isFix?: boolean;
  plannerMode?: string;
  planPath?: string;
  planDocs?: boolean;
  planTests?: boolean;
  skipReview?: boolean;
  useSubagents?: boolean;
  maxReviewIterations?: number;
  paused?: boolean;
  runtimeProfileId?: string | null;
  modelOverride?: string | null;
  runtimeOptions?: Record<string, unknown> | null;
  roadmapAlias?: string;
  tags?: string[];
  scheduledAt?: string | null;
}

/** PUT /tasks/:id body */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  attachments?: TaskCommentAttachment[];
  priority?: number;
  autoMode?: boolean;
  taskIntent?: TaskIntent;
  isFix?: boolean;
  plannerMode?: string;
  planPath?: string;
  planDocs?: boolean;
  planTests?: boolean;
  skipReview?: boolean;
  useSubagents?: boolean;
  plan?: string | null;
  implementationLog?: string | null;
  reviewComments?: string | null;
  agentActivityLog?: string | null;
  blockedReason?: string | null;
  blockedFromStatus?: TaskStatus | null;
  retryAfter?: string | null;
  retryCount?: number;
  tokenInput?: number;
  tokenOutput?: number;
  tokenTotal?: number;
  costUsd?: number;
  roadmapAlias?: string | null;
  tags?: string[];
  reworkRequested?: boolean;
  reviewIterationCount?: number;
  maxReviewIterations?: number;
  manualReviewRequired?: boolean;
  autoReviewState?: AutoReviewState | null;
  paused?: boolean;
  lastHeartbeatAt?: string | null;
  runtimeProfileId?: string | null;
  modelOverride?: string | null;
  runtimeOptions?: Record<string, unknown> | null;
  scheduledAt?: string | null;
}

export const TASK_EVENTS = [
  "start_ai",
  "accept_existing_plan",
  "start_implementation",
  "request_replanning",
  "fast_fix",
  "approve_done",
  "request_changes",
  "manual_exception",
  "retry_from_blocked",
] as const;

export type TaskEvent = (typeof TASK_EVENTS)[number];

/** POST /tasks/:id/events body */
export interface TaskEventInput {
  event: TaskEvent;
  deletePlanFile?: boolean;
  commitOnApprove?: boolean;
  manualExceptionJustification?: string;
}

/** PATCH /tasks/:id/position body */
export interface ReorderTaskInput {
  position: number;
}

export const MEMORY_ITEM_STATUSES = ["pending", "approved", "rejected", "expired"] as const;

export type MemoryItemStatus = (typeof MEMORY_ITEM_STATUSES)[number];

export const MEMORY_SCOPES = ["project", "global"] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_REDACTION_STATUSES = ["clean", "blocked"] as const;

export type MemoryRedactionStatus = (typeof MEMORY_REDACTION_STATUSES)[number];

export const MEMORY_SOURCE_KINDS = ["task", "manual"] as const;

export type MemorySourceKind = (typeof MEMORY_SOURCE_KINDS)[number];

export const MEMORY_WORKFLOW_KINDS = [
  "planner",
  "implementer",
  "reviewer",
  "security_review",
  "chat",
] as const;

export type MemoryWorkflowKind = (typeof MEMORY_WORKFLOW_KINDS)[number];

export const MEMORY_LIFECYCLE_ACTIONS = [
  "created",
  "edited",
  "approved",
  "rejected",
  "expired",
] as const;

export type MemoryLifecycleAction = (typeof MEMORY_LIFECYCLE_ACTIONS)[number];

export interface MemoryItem {
  id: string;
  projectId: string | null;
  scope: MemoryScope;
  sourceTaskId: string | null;
  sourceKind: MemorySourceKind;
  sourceRef: string | null;
  status: MemoryItemStatus;
  redactionStatus: MemoryRedactionStatus;
  publishBlockReason: string | null;
  reviewNote: string | null;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  expiredAt: string | null;
  expiresAt: string | null;
}

export interface CreateMemoryItemInput {
  projectId?: string | null;
  scope: MemoryScope;
  sourceTaskId?: string | null;
  sourceKind?: MemorySourceKind;
  sourceRef?: string | null;
  title: string;
  summary: string;
  content: string;
  tags?: string[];
  expiresAt?: string | null;
}

export interface UpdateMemoryItemInput {
  scope?: MemoryScope;
  title?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  reviewNote?: string | null;
  expiresAt?: string | null;
}

export interface MemoryUsageEvent {
  id: string;
  memoryItemId: string;
  projectId: string | null;
  taskId: string | null;
  chatSessionId: string | null;
  workflowKind: MemoryWorkflowKind;
  source: string;
  createdAt: string;
}

export interface MemoryLifecycleEvent {
  id: string;
  memoryItemId: string;
  action: MemoryLifecycleAction;
  actor: string | null;
  note: string | null;
  createdAt: string;
}

export interface MemoryItemBroadcastPayload {
  id: string;
  projectId: string | null;
  status: MemoryItemStatus;
}

/** WebSocket event types */
export type WsEventType =
  | "project:created"
  | "project:updated"
  | "project:deleted"
  | "runtime_profile:created"
  | "runtime_profile:updated"
  | "runtime_profile:deleted"
  | "settings:runtime_defaults_updated"
  | "settings:config_updated"
  | "task:created"
  | "task:updated"
  | "task:deleted"
  | "task:moved"
  | "task:comment_created"
  | "agent:wake"
  | "roadmap:complete"
  | "roadmap:error"
  | "chat:token"
  | "chat:done"
  | "chat:error"
  | "chat:session_created"
  | "chat:session_updated"
  | "chat:session_deleted"
  | "chat:session_messages_updated"
  | "sync:task_created"
  | "sync:task_updated"
  | "sync:status_changed"
  | "sync:plan_pushed"
  | "task:activity"
  | "task:scheduled_fired"
  | "project:auto_queue_mode_changed"
  | "project:auto_queue_advanced"
  | "project:runtime_limit_updated"
  | "project:warmup_updated"
  | "task:commit_started"
  | "task:commit_done"
  | "task:commit_failed"
  | "memory:item_created"
  | "memory:item_updated"
  | "memory:item_deleted"
  | "memory:usage_recorded";

export interface RoadmapCompletePayload {
  projectId: string;
  roadmapAlias: string;
  created: number;
  skipped: number;
  taskIds: string[];
  byPhase: Record<number, { created: number; skipped: number }>;
  batchSummary?: RoadmapBatchSummaryPayload;
}

export interface RoadmapBatchSummaryPayload {
  batchId: string;
  projectId: string;
  roadmapAlias: string;
  taskIntent: TaskIntent;
  status: string;
  executionPolicy: string;
  synthesisTaskId: string | null;
  synthesisReady: boolean;
  failureFamily: string | null;
  counts: {
    expected: number;
    valid: number;
    invalid: number;
    missing: number;
    synthesisNotReady: number;
    externalBlocked: number;
    total: number;
  };
  message: string | null;
}

export interface RoadmapErrorPayload {
  projectId: string;
  roadmapAlias: string;
  error: string;
  code: string;
}

/**
 * Emitted when the "create commit" checkbox is used on approve-done, to
 * surface the lifecycle of the fire-and-forget `/aif-commit` run to the UI.
 * `status` is redundant with `type` but makes the payload self-describing.
 */
export interface TaskCommitPayload {
  taskId: string;
  projectId: string;
  status: "started" | "done" | "failed";
  error?: string;
}

export interface RuntimeLimitBroadcastPayload {
  projectId: string;
  runtimeProfileId: string | null;
  taskId?: string | null;
}

export interface WarmupBroadcastPayload {
  projectId: string;
  status: "ready" | "failed" | "partial" | "cleared" | "expired";
}

export interface IdPayload {
  id: string;
}

export interface ProjectScopedIdPayload {
  id: string;
  projectId: string | null;
}

export interface SettingsConfigUpdatedPayload {
  projectId: string;
}

export interface TaskCommentCreatedPayload {
  id: string;
  taskId: string;
  projectId: string;
}

export interface WsEvent {
  type: WsEventType;
  payload:
    | Task
    | Project
    | RuntimeProfile
    | AppSettings
    | IdPayload
    | ProjectScopedIdPayload
    | SettingsConfigUpdatedPayload
    | TaskCommentCreatedPayload
    | RoadmapCompletePayload
    | RoadmapErrorPayload
    | ChatStreamTokenPayload
    | ChatDonePayload
    | ChatErrorPayload
    | ChatSession
    | TaskCommitPayload
    | RuntimeLimitBroadcastPayload
    | WarmupBroadcastPayload
    | MemoryItemBroadcastPayload;
}

export const RuntimeTransport = {
  /** Agent SDK — in-process query */
  SDK: "sdk",
  /** CLI subprocess — spawn a binary and parse stdout */
  CLI: "cli",
  /** Codex app-server subprocess over stdio JSONL */
  APP_SERVER: "app-server",
  /** HTTP API — POST to a remote runtime endpoint */
  API: "api",
} as const;

export type RuntimeTransport = (typeof RuntimeTransport)[keyof typeof RuntimeTransport];

/** All known transport values for validation and UI selects. */
export const RUNTIME_TRANSPORTS: readonly RuntimeTransport[] = Object.values(RuntimeTransport);

export function isRuntimeTransport(value: unknown): value is RuntimeTransport {
  return typeof value === "string" && RUNTIME_TRANSPORTS.includes(value as RuntimeTransport);
}

/** Runtime descriptor returned by GET /runtime-profiles/runtimes */
export interface RuntimeDescriptor {
  id: string;
  providerId: string;
  displayName: string;
  description?: string | null;
  capabilities: Record<string, boolean>;
  defaultTransport?: string | null;
  defaultApiKeyEnvVar?: string | null;
  defaultBaseUrlEnvVar?: string | null;
  defaultBaseUrl?: string | null;
  defaultModelPlaceholder?: string | null;
  supportedTransports?: string[];
}

export interface RuntimeProfileUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number | null;
}

export interface RuntimeProfile {
  id: string;
  projectId: string | null;
  name: string;
  runtimeId: string;
  providerId: string;
  transport: string | null;
  baseUrl: string | null;
  apiKeyEnvVar: string | null;
  defaultModel: string | null;
  headers: Record<string, string>;
  options: Record<string, unknown>;
  enabled: boolean;
  runtimeLimitSnapshot?: RuntimeLimitSnapshot | null;
  runtimeLimitUpdatedAt?: string | null;
  lastUsage?: RuntimeProfileUsage | null;
  lastUsageAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuntimeProfileInput {
  projectId?: string | null;
  name: string;
  runtimeId: string;
  providerId: string;
  transport?: string | null;
  baseUrl?: string | null;
  apiKeyEnvVar?: string | null;
  defaultModel?: string | null;
  headers?: Record<string, string>;
  options?: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateRuntimeProfileInput {
  projectId?: string | null;
  name?: string;
  runtimeId?: string;
  providerId?: string;
  transport?: string | null;
  baseUrl?: string | null;
  apiKeyEnvVar?: string | null;
  defaultModel?: string | null;
  headers?: Record<string, string>;
  options?: Record<string, unknown>;
  enabled?: boolean;
}

export type EffectiveRuntimeProfileSource =
  | "task_override"
  | "project_default"
  | "system_default"
  | "none";

export interface EffectiveRuntimeProfileSelection {
  source: EffectiveRuntimeProfileSource;
  profile: RuntimeProfile | null;
  taskRuntimeProfileId: string | null;
  projectRuntimeProfileId: string | null;
  systemRuntimeProfileId: string | null;
}

export const RuntimeLimitSource = {
  PROVIDER_API: "provider_api",
  SDK_EVENT: "sdk_event",
  API_HEADERS: "api_headers",
  TURN_USAGE: "turn_usage",
} as const;

export type RuntimeLimitSource = (typeof RuntimeLimitSource)[keyof typeof RuntimeLimitSource];

export const RuntimeLimitStatus = {
  OK: "ok",
  WARNING: "warning",
  BLOCKED: "blocked",
  UNKNOWN: "unknown",
} as const;

export type RuntimeLimitStatus = (typeof RuntimeLimitStatus)[keyof typeof RuntimeLimitStatus];

export const RuntimeLimitPrecision = {
  EXACT: "exact",
  HEURISTIC: "heuristic",
} as const;

export type RuntimeLimitPrecision =
  (typeof RuntimeLimitPrecision)[keyof typeof RuntimeLimitPrecision];

export const RuntimeLimitScope = {
  REQUESTS: "requests",
  TOKENS: "tokens",
  TIME: "time",
  SPEND: "spend",
  TURN_USAGE: "turn_usage",
  MODEL_USAGE: "model_usage",
  TOOL_USAGE: "tool_usage",
  OTHER: "other",
} as const;

export type RuntimeLimitScope = (typeof RuntimeLimitScope)[keyof typeof RuntimeLimitScope];

export interface RuntimeLimitWindow {
  scope: RuntimeLimitScope;
  name?: string | null;
  unit?: string | null;
  limit?: number | null;
  remaining?: number | null;
  used?: number | null;
  percentUsed?: number | null;
  percentRemaining?: number | null;
  resetAt?: string | null;
  retryAfterSeconds?: number | null;
  warningThreshold?: number | null;
}

export interface RuntimeLimitSnapshot {
  source: RuntimeLimitSource;
  status: RuntimeLimitStatus;
  precision: RuntimeLimitPrecision;
  checkedAt: string;
  providerId: string;
  runtimeId?: string | null;
  profileId?: string | null;
  primaryScope?: RuntimeLimitScope | null;
  resetAt?: string | null;
  retryAfterSeconds?: number | null;
  warningThreshold?: number | null;
  windows: RuntimeLimitWindow[];
  providerMeta?: Record<string, unknown> | null;
}

export interface RuntimeLimitEventPayload {
  snapshot: RuntimeLimitSnapshot;
  rawType?: string | null;
}

// ── Chat session types ──────────────────────────────────────

export type ChatSessionSource = "web" | "cli" | "agent";

export interface ChatSession {
  id: string;
  projectId: string;
  title: string;
  agentSessionId: string | null;
  runtimeProfileId?: string | null;
  runtimeSessionId?: string | null;
  source: ChatSessionSource;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChatSessionInput {
  projectId: string;
  title?: string;
  runtimeProfileId?: string | null;
  runtimeSessionId?: string | null;
}

export interface UpdateChatSessionInput {
  title?: string;
  agentSessionId?: string | null;
  runtimeProfileId?: string | null;
  runtimeSessionId?: string | null;
}

export interface ChatMessageAttachment {
  name: string;
  mimeType: string;
  size: number;
  path?: string;
}

export interface ChatSessionMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatMessageAttachment[];
  createdAt: string;
}

// ── Chat types ──────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatMessageAttachment[];
}

export interface ChatAttachment {
  name: string;
  mimeType: string;
  size: number;
  content: string | null;
}

export interface ChatRequest {
  projectId: string;
  message: string;
  clientId?: string;
  conversationId?: string;
  sessionId?: string;
  explore?: boolean;
  /** Currently open task ID — provides context to the chat agent */
  taskId?: string;
  attachments?: ChatAttachment[];
}

// ── Chat actions (structured blocks in AI responses) ───────

export interface ChatActionCreateTask {
  type: "create_task";
  title: string;
  description: string;
  taskIntent?: TaskIntent;
  isFix?: boolean;
}

export type ChatAction = ChatActionCreateTask;

export interface ChatStreamTokenPayload {
  conversationId: string;
  token: string;
}

/**
 * Per-turn token usage reported to the frontend alongside the `chat:done`
 * event. Matches `RuntimeUsage` from `@aif/runtime` structurally, duplicated
 * here to avoid forcing `@aif/shared` to depend on the runtime layer.
 */
export interface ChatDoneUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface ChatDonePayload {
  conversationId: string;
  /** Null when the adapter/transport does not report usage for this turn. */
  usage?: ChatDoneUsage | null;
  projectId?: string;
  taskId?: string | null;
  runtimeProfileId?: string | null;
  runtimeLimitSnapshot?: RuntimeLimitSnapshot | null;
}

export interface ChatErrorPayload {
  conversationId: string;
  message: string;
  code?: string;
  projectId?: string;
  taskId?: string | null;
  runtimeProfileId?: string | null;
  runtimeLimitSnapshot?: RuntimeLimitSnapshot | null;
}
