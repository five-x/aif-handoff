import type {
  Task,
  WorkflowTimeline,
  CreateTaskInput,
  UpdateTaskInput,
  TaskEvent,
  TaskEventInput,
  TaskComment,
  CreateTaskCommentInput,
  Project,
  CreateProjectInput,
  ChatRequest,
  ChatSession,
  CreateChatSessionInput,
  UpdateChatSessionInput,
  ChatSessionMessage,
  ChatMessageAttachment,
  RuntimeDescriptor,
  RuntimeProfile,
  CreateRuntimeProfileInput,
  UpdateRuntimeProfileInput,
  RuntimeLimitSnapshot,
  TaskIntent,
  MemoryItem,
  CreateMemoryItemInput,
  UpdateMemoryItemInput,
  MemoryItemStatus,
  MemoryScope,
  MemoryUsageEvent,
  MemoryLifecycleEvent,
  TaskOperatorEvidenceResponse,
  TaskRuntimeUsageResponse,
  ProjectRuntimeUsageResponse,
  TaskMemoryCandidatesResponse,
  ProjectKnowledgeResponse,
  ProjectQueueStateResponse,
  TaskWorktreeInspection,
  TaskWorktreeCleanupResult,
  TaskRequirementQuestion,
  TaskRequirementQuestionsResponse,
  TaskRequirementQuestionAnswerInput,
  TaskRequirementQuestionBatchAnswerInput,
  TaskRequirementsSnapshotResponse,
  TaskSplitProposal,
  TaskSplitProposalResponse,
} from "@aif/shared/browser";

export type {
  TaskOperatorEvidenceResponse,
  TaskRuntimeUsageResponse,
  ProjectRuntimeUsageResponse,
  TaskMemoryCandidatesResponse,
  ProjectKnowledgeResponse,
  ProjectQueueStateResponse,
  TaskWorktreeInspection,
  TaskWorktreeCleanupResult,
  TaskRequirementQuestion,
  TaskRequirementQuestionsResponse,
  TaskRequirementQuestionAnswerInput,
  TaskRequirementQuestionBatchAnswerInput,
  TaskSplitProposal,
  TaskSplitProposalResponse,
} from "@aif/shared/browser";

export class ApiError extends Error {
  status: number;
  data?: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export interface AifConfig {
  language?: {
    ui?: string;
    artifacts?: string;
    technical_terms?: string;
  };
  paths?: {
    description?: string;
    architecture?: string;
    docs?: string;
    roadmap?: string;
    research?: string;
    rules_file?: string;
    plan?: string;
    plans?: string;
    fix_plan?: string;
    security?: string;
    references?: string;
    patches?: string;
    evolutions?: string;
    evolution?: string;
    specs?: string;
    rules?: string;
  };
  workflow?: {
    auto_create_dirs?: boolean;
    plan_id_format?: string;
    analyze_updates_architecture?: boolean;
    architecture_updates_roadmap?: boolean;
    verify_mode?: string;
  };
  git?: {
    enabled?: boolean;
    base_branch?: string;
    create_branches?: boolean;
    branch_prefix?: string;
    skip_push_after_commit?: boolean;
  };
  rules?: {
    base?: string;
  };
}

export interface AppRuntimeDefaultsResponse {
  defaultTaskRuntimeProfileId: string | null;
  defaultPlanRuntimeProfileId: string | null;
  defaultReviewRuntimeProfileId: string | null;
  defaultChatRuntimeProfileId: string | null;
  resolvedDefaultTaskRuntimeProfileId: string | null;
  resolvedDefaultPlanRuntimeProfileId: string | null;
  resolvedDefaultReviewRuntimeProfileId: string | null;
  resolvedDefaultChatRuntimeProfileId: string | null;
}

const API_PREFIX = import.meta.env.DEV ? "" : "/api";
const API_BASE = "/tasks";
const REQUEST_TIMEOUT_MS = 15_000;
export const PLAN_FAST_FIX_TIMEOUT_MS = 200_000;
const CHAT_TIMEOUT_MS = 300_000;
const IMPORT_ROADMAP_TIMEOUT_MS = 300_000;

export interface SettingsResponse {
  useSubagents: boolean;
  maxReviewIterations: number;
  autoReviewStrategy: "full_re_review" | "closure_first";
  usageLimitsEnabled: boolean;
  warmupEnabled: boolean;
  runtimeReadiness: {
    availableRuntimeCount: number;
    runtimeProfileCount: number;
    enabledRuntimeProfileCount: number;
  };
  runtimeDefaults: {
    modules: string[];
    openAiBaseUrlConfigured: boolean;
    codexCliPathConfigured: boolean;
    app: AppRuntimeDefaultsResponse;
  };
}

export interface ProjectWarmupSupport {
  supported: boolean;
  skipReason: string | null;
  stage?: string;
  workflowKind?: string;
  profileMode?: string;
  runtimeId: string | null;
  providerId: string | null;
  runtimeProfileId: string | null;
  transport: string | null;
  model: string | null;
  selectionSource: string | null;
}

export interface ProjectWarmupSession {
  id: string;
  projectId: string;
  runtimeProfileId: string | null;
  runtimeId: string;
  providerId: string;
  transport: string | null;
  model: string | null;
  stage: string | null;
  status: "creating" | "ready" | "failed" | "cleared" | "expired";
  ttlSeconds: number;
  expiresAt: string;
  remainingSeconds: number;
  summary: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWarmupResponse {
  enabled: boolean;
  support: ProjectWarmupSupport;
  targets?: ProjectWarmupSupport[];
  warmup: ProjectWarmupSession | null;
  warmups?: ProjectWarmupSession[];
}

export interface ResolvedConfigIssue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  source: string;
  blocksWork: boolean;
  path?: string | null;
}

export interface ConfigAuditEvent {
  id: string;
  projectId: string | null;
  taskId: string | null;
  runtimeProfileId: string | null;
  action: string;
  sourceKind: string;
  actor: string | null;
  reasonCodes: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface ResolvedRuntimeProfileConfigSummary {
  id: string;
  projectId: string | null;
  name: string;
  runtimeId: string;
  providerId: string;
  transport: string | null;
  defaultModel: string | null;
  apiKeyEnvVar: string | null;
  apiKeyConfigured?: boolean;
  enabled: boolean;
  headerKeys: string[];
  optionKeys: string[];
}

export interface ResolvedProjectConfigGovernance {
  projectId: string;
  generatedAt: string;
  fingerprint: string;
  status: "ok" | "warning" | "blocked";
  issues: ResolvedConfigIssue[];
  env: {
    files: { env: boolean; envLocal: boolean };
    runtime: {
      defaultRuntimeId: string;
      defaultProviderId: string;
      modules: string[];
      anthropicBaseUrlConfigured?: boolean;
      openAiBaseUrlConfigured: boolean;
      codexCliPathConfigured: boolean;
    };
    features: {
      useSubagents: boolean;
      memoryEnabled: boolean;
      usageLimitsEnabled: boolean;
      warmupEnabled: boolean;
      taskWorktreesEnabled: boolean;
      bypassPermissions: boolean;
    };
  };
  appRuntimeDefaults: AppRuntimeDefaultsResponse;
  projectRuntimeDefaults: {
    defaultTaskRuntimeProfileId: string | null;
    defaultPlanRuntimeProfileId: string | null;
    defaultReviewRuntimeProfileId: string | null;
    defaultChatRuntimeProfileId: string | null;
  };
  runtimeProfiles: ResolvedRuntimeProfileConfigSummary[];
  projectConfig: {
    exists: boolean;
    path: string;
    paths?: Record<string, string>;
    workflow?: Record<string, unknown>;
    git?: Record<string, unknown>;
    language?: Record<string, unknown>;
  };
  mcp: {
    exists: boolean;
    serverCount: number;
    servers: Array<{
      name: string;
      transport: string | null;
      commandConfigured: boolean;
      urlConfigured: boolean;
      envKeys: string[];
    }>;
  };
  permissionPolicy: {
    modes: string[];
    intents: string[];
    defaultByIntent?: Record<string, string>;
  };
  recentAuditEvents: ConfigAuditEvent[];
}

interface BackendResolvedConfigIssue {
  code?: string;
  reasonCode?: string;
  severity: "info" | "warning" | "error";
  message: string;
  source?: string;
  sourceKind?: string;
  blocksWork: boolean;
  path?: string | null;
}

interface BackendProjectConfigGovernance {
  projectId: string;
  generatedAt: string;
  fingerprint: string;
  status?: "ok" | "warning" | "blocked";
  project?: {
    defaultRuntimeProfileIds?: Partial<Record<"task" | "plan" | "review" | "chat", string | null>>;
  };
  env?: {
    files?: { env?: boolean; envLocal?: boolean };
    runtime?: {
      defaultRuntimeId?: string;
      defaultProviderId?: string;
      modules?: string[];
      openAiBaseUrlConfigured?: boolean;
      codexCliPathConfigured?: boolean;
    };
    runtimeModules?: string[];
    defaultRuntimeId?: string;
    defaultProviderId?: string;
    configuredKeys?: string[];
    flags?: Partial<Record<string, boolean>>;
    features?: Partial<Record<string, boolean>>;
  };
  appRuntimeDefaults?: Partial<Record<"task" | "plan" | "review" | "chat", string | null>> &
    Partial<AppRuntimeDefaultsResponse>;
  projectRuntimeDefaults?: Partial<ResolvedProjectConfigGovernance["projectRuntimeDefaults"]>;
  runtimeProfiles?: ResolvedRuntimeProfileConfigSummary[];
  projectConfig?: ResolvedProjectConfigGovernance["projectConfig"] & { parseOk?: boolean };
  mcp?: {
    exists?: boolean;
    serverCount?: number;
    servers?: Array<{
      name: string;
      transport: string | null;
      hasCommand?: boolean;
      hasUrl?: boolean;
      commandConfigured?: boolean;
      urlConfigured?: boolean;
      envKeys: string[];
    }>;
  };
  permissionPolicy?: {
    bypassEnabled?: boolean;
    modes?: string[];
    intents?: string[];
    defaultByIntent?: Record<string, string>;
  };
  usageLimits?: { enabled?: boolean };
  memory?: { enabled?: boolean };
  issues?: BackendResolvedConfigIssue[];
  recentAuditEvents?: ConfigAuditEvent[];
}

type BackendRuntimeDefaults = Partial<ResolvedProjectConfigGovernance["projectRuntimeDefaults"]> &
  Partial<Record<"task" | "plan" | "review" | "chat", string | null>>;

export interface PartialProjectWarmupResponse {
  enabled?: boolean;
  support: ProjectWarmupSupport;
  targets?: ProjectWarmupSupport[];
  warmup: ProjectWarmupSession | null;
  warmups?: ProjectWarmupSession[];
  partial: true;
  code: string;
  error: string;
  failedTarget?: string | null;
}

export type CreateProjectWarmupResponse = ProjectWarmupResponse | PartialProjectWarmupResponse;

export interface ClearProjectWarmupResponse {
  success: boolean;
  cleared: number;
}

export interface SendChatMessageResponse {
  conversationId: string;
  sessionId: string | null;
  assistantMessage?: string | null;
  attachments?: ChatMessageAttachment[];
  runtimeLimitSnapshot?: RuntimeLimitSnapshot | null;
}

interface ChatSessionRequestContext {
  projectId?: string | null;
  runtimeProfileId?: string | null;
}

function withChatSessionContext(path: string, context?: ChatSessionRequestContext): string {
  if (!context) return path;
  const qs = new URLSearchParams();
  if (context.projectId) qs.set("projectId", context.projectId);
  if (context.runtimeProfileId) qs.set("runtimeProfileId", context.runtimeProfileId);
  const suffix = qs.toString();
  return suffix ? `${path}?${suffix}` : path;
}

async function request<T>(
  url: string,
  options?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${url}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    let message: string | null = null;
    if (typeof body?.error === "string") {
      message = body.error;
    } else if (typeof body?.message === "string") {
      message = body.message;
    } else if (body?.error && typeof body.error === "object") {
      const issues: unknown[] =
        "issues" in body.error && Array.isArray(body.error.issues)
          ? (body.error.issues as unknown[])
          : [];
      const firstIssue = issues.find(
        (issue: unknown): issue is { message?: unknown } =>
          typeof issue === "object" && issue !== null,
      );
      if (typeof firstIssue?.message === "string") {
        message = firstIssue.message;
      }
    }
    if (!message && body?.fieldErrors && typeof body.fieldErrors === "object") {
      const firstFieldError = Object.values(body.fieldErrors).find(
        (value: unknown): value is string[] => Array.isArray(value) && value.length > 0,
      );
      if (firstFieldError) {
        message = firstFieldError[0] ?? null;
      }
    }
    throw new ApiError(message ?? `HTTP ${res.status}`, res.status, body);
  }

  return res.json();
}

function firstString(...values: Array<string | null | undefined>): string | null {
  return (
    values.find((value): value is string => typeof value === "string" && value.length > 0) ?? null
  );
}

function normalizeAppRuntimeDefaults(
  raw: BackendProjectConfigGovernance["appRuntimeDefaults"] | undefined,
): AppRuntimeDefaultsResponse {
  const defaultTaskRuntimeProfileId = firstString(raw?.defaultTaskRuntimeProfileId, raw?.task);
  const defaultPlanRuntimeProfileId = firstString(raw?.defaultPlanRuntimeProfileId, raw?.plan);
  const defaultReviewRuntimeProfileId = firstString(
    raw?.defaultReviewRuntimeProfileId,
    raw?.review,
  );
  const defaultChatRuntimeProfileId = firstString(raw?.defaultChatRuntimeProfileId, raw?.chat);
  return {
    defaultTaskRuntimeProfileId,
    defaultPlanRuntimeProfileId,
    defaultReviewRuntimeProfileId,
    defaultChatRuntimeProfileId,
    resolvedDefaultTaskRuntimeProfileId: firstString(
      raw?.resolvedDefaultTaskRuntimeProfileId,
      defaultTaskRuntimeProfileId,
    ),
    resolvedDefaultPlanRuntimeProfileId: firstString(
      raw?.resolvedDefaultPlanRuntimeProfileId,
      defaultPlanRuntimeProfileId,
      defaultTaskRuntimeProfileId,
    ),
    resolvedDefaultReviewRuntimeProfileId: firstString(
      raw?.resolvedDefaultReviewRuntimeProfileId,
      defaultReviewRuntimeProfileId,
      defaultTaskRuntimeProfileId,
    ),
    resolvedDefaultChatRuntimeProfileId: firstString(
      raw?.resolvedDefaultChatRuntimeProfileId,
      defaultChatRuntimeProfileId,
    ),
  };
}

function normalizeProjectRuntimeDefaults(
  raw: BackendProjectConfigGovernance,
): ResolvedProjectConfigGovernance["projectRuntimeDefaults"] {
  const defaults = (raw.projectRuntimeDefaults ??
    raw.project?.defaultRuntimeProfileIds ??
    {}) as BackendRuntimeDefaults;
  return {
    defaultTaskRuntimeProfileId: firstString(defaults.defaultTaskRuntimeProfileId, defaults.task),
    defaultPlanRuntimeProfileId: firstString(defaults.defaultPlanRuntimeProfileId, defaults.plan),
    defaultReviewRuntimeProfileId: firstString(
      defaults.defaultReviewRuntimeProfileId,
      defaults.review,
    ),
    defaultChatRuntimeProfileId: firstString(defaults.defaultChatRuntimeProfileId, defaults.chat),
  };
}

function normalizeConfigGovernance(
  raw: BackendProjectConfigGovernance,
): ResolvedProjectConfigGovernance {
  const issues = (raw.issues ?? []).map((issue) => ({
    code: issue.code ?? issue.reasonCode ?? "UNKNOWN_CONFIG_ISSUE",
    severity: issue.severity,
    message: issue.message,
    source: issue.source ?? issue.sourceKind ?? "unknown",
    blocksWork: issue.blocksWork,
    path: issue.path ?? null,
  }));
  const flags = { ...(raw.env?.features ?? {}), ...(raw.env?.flags ?? {}) };
  const status =
    raw.status ??
    (issues.some((issue) => issue.blocksWork)
      ? "blocked"
      : issues.some((issue) => issue.severity === "warning" || issue.severity === "error")
        ? "warning"
        : "ok");
  const mcpServers = raw.mcp?.servers ?? [];

  return {
    projectId: raw.projectId,
    generatedAt: raw.generatedAt,
    fingerprint: raw.fingerprint,
    status,
    issues,
    env: {
      files: {
        env: Boolean(raw.env?.files?.env),
        envLocal: Boolean(raw.env?.files?.envLocal),
      },
      runtime: {
        defaultRuntimeId: raw.env?.runtime?.defaultRuntimeId ?? raw.env?.defaultRuntimeId ?? "",
        defaultProviderId: raw.env?.runtime?.defaultProviderId ?? raw.env?.defaultProviderId ?? "",
        modules: raw.env?.runtime?.modules ?? raw.env?.runtimeModules ?? [],
        openAiBaseUrlConfigured: Boolean(raw.env?.runtime?.openAiBaseUrlConfigured),
        codexCliPathConfigured: Boolean(raw.env?.runtime?.codexCliPathConfigured),
      },
      features: {
        useSubagents: Boolean(flags.useSubagents ?? flags.agentUseSubagents),
        memoryEnabled: Boolean(flags.memoryEnabled ?? raw.memory?.enabled),
        usageLimitsEnabled: Boolean(flags.usageLimitsEnabled ?? raw.usageLimits?.enabled),
        warmupEnabled: Boolean(flags.warmupEnabled),
        taskWorktreesEnabled: Boolean(flags.taskWorktreesEnabled),
        bypassPermissions: Boolean(
          flags.bypassPermissions ??
          flags.agentBypassPermissions ??
          raw.permissionPolicy?.bypassEnabled,
        ),
      },
    },
    appRuntimeDefaults: normalizeAppRuntimeDefaults(raw.appRuntimeDefaults),
    projectRuntimeDefaults: normalizeProjectRuntimeDefaults(raw),
    runtimeProfiles: raw.runtimeProfiles ?? [],
    projectConfig: {
      exists: Boolean(raw.projectConfig?.exists),
      path: raw.projectConfig?.path ?? ".ai-factory/config.yaml",
      paths: raw.projectConfig?.paths,
      workflow: raw.projectConfig?.workflow,
      git: raw.projectConfig?.git,
      language: raw.projectConfig?.language,
    },
    mcp: {
      exists: Boolean(raw.mcp?.exists),
      serverCount: raw.mcp?.serverCount ?? mcpServers.length,
      servers: mcpServers.map((server) => ({
        name: server.name,
        transport: server.transport,
        commandConfigured: Boolean(server.commandConfigured ?? server.hasCommand),
        urlConfigured: Boolean(server.urlConfigured ?? server.hasUrl),
        envKeys: server.envKeys,
      })),
    },
    permissionPolicy: {
      modes: raw.permissionPolicy?.modes ?? [],
      intents: raw.permissionPolicy?.intents ?? [],
      defaultByIntent: raw.permissionPolicy?.defaultByIntent,
    },
    recentAuditEvents: raw.recentAuditEvents ?? [],
  };
}

function extractConfigAuditEvents(
  response: ConfigAuditEvent[] | { events?: ConfigAuditEvent[] },
): ConfigAuditEvent[] {
  return Array.isArray(response) ? response : (response.events ?? []);
}

export const api = {
  getSettings(): Promise<SettingsResponse> {
    console.debug("[api] GET /settings");
    return request("/settings");
  },

  getAppRuntimeDefaults(): Promise<AppRuntimeDefaultsResponse> {
    console.debug("[api] GET /settings/runtime-defaults");
    return request("/settings/runtime-defaults");
  },

  updateAppRuntimeDefaults(input: {
    defaultTaskRuntimeProfileId?: string | null;
    defaultPlanRuntimeProfileId?: string | null;
    defaultReviewRuntimeProfileId?: string | null;
    defaultChatRuntimeProfileId?: string | null;
  }): Promise<AppRuntimeDefaultsResponse> {
    console.debug("[api] PUT /settings/runtime-defaults", input);
    return request("/settings/runtime-defaults", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  // Projects
  listProjects(): Promise<Project[]> {
    console.debug("[api] GET /projects");
    return request<Project[]>("/projects");
  },

  createProject(input: CreateProjectInput): Promise<Project> {
    console.debug("[api] POST /projects", input);
    return request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateProject(id: string, input: CreateProjectInput): Promise<Project> {
    console.debug("[api] PUT /projects/%s", id, input);
    return request<Project>(`/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  getAutoQueueMode(id: string): Promise<{ enabled: boolean }> {
    console.debug("[api] GET /projects/%s/auto-queue-mode", id);
    return request<{ enabled: boolean }>(`/projects/${id}/auto-queue-mode`);
  },

  setAutoQueueMode(id: string, enabled: boolean): Promise<{ enabled: boolean }> {
    console.debug("[api] PATCH /projects/%s/auto-queue-mode", id, enabled);
    return request<{ enabled: boolean }>(`/projects/${id}/auto-queue-mode`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
  },

  deleteProject(id: string): Promise<void> {
    console.debug("[api] DELETE /projects/%s", id);
    return request(`/projects/${id}`, { method: "DELETE" });
  },

  getProjectDefaults(id: string): Promise<{
    paths: NonNullable<AifConfig["paths"]>;
    workflow: NonNullable<AifConfig["workflow"]>;
  }> {
    return request(`/projects/${id}/defaults`);
  },

  getProjectMcp(id: string): Promise<{ mcpServers: Record<string, unknown> }> {
    console.debug("[api] GET /projects/%s/mcp", id);
    return request(`/projects/${id}/mcp`);
  },

  getProjectWarmup(id: string): Promise<ProjectWarmupResponse> {
    return request<ProjectWarmupResponse>(`/projects/${id}/warmup`);
  },

  createProjectWarmup(
    id: string,
    input: { ttlSeconds?: number },
  ): Promise<CreateProjectWarmupResponse> {
    return request<CreateProjectWarmupResponse>(
      `/projects/${id}/warmup`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      PLAN_FAST_FIX_TIMEOUT_MS,
    );
  },

  clearProjectWarmup(id: string): Promise<ClearProjectWarmupResponse> {
    return request<ClearProjectWarmupResponse>(`/projects/${id}/warmup`, { method: "DELETE" });
  },

  // Tasks
  listTasks(projectId?: string): Promise<Task[]> {
    const qs = projectId ? `?projectId=${projectId}` : "";
    console.debug("[api] GET /tasks%s", qs);
    return request<Task[]>(`${API_BASE}${qs}`);
  },

  getTask(id: string): Promise<Task> {
    console.debug("[api] GET /tasks/%s", id);
    return request<Task>(`${API_BASE}/${id}`);
  },

  getTaskTimeline(id: string): Promise<WorkflowTimeline> {
    console.debug("[api] GET /tasks/%s/timeline", id);
    return request<WorkflowTimeline>(`${API_BASE}/${id}/timeline`);
  },

  getTaskArtifactTrust(id: string): Promise<Task["artifactTrust"]> {
    console.debug("[api] GET /tasks/%s/artifact-trust", id);
    return request<Task["artifactTrust"]>(`${API_BASE}/${id}/artifact-trust`);
  },

  getTaskEvidence(id: string): Promise<TaskOperatorEvidenceResponse> {
    console.debug("[api] GET /tasks/%s/evidence", id);
    return request<TaskOperatorEvidenceResponse>(`${API_BASE}/${id}/evidence`);
  },

  getTaskMemoryCandidates(id: string): Promise<TaskMemoryCandidatesResponse> {
    console.debug("[api] GET /tasks/%s/memory", id);
    return request<TaskMemoryCandidatesResponse>(`${API_BASE}/${id}/memory`);
  },

  getTaskRuntimeUsage(id: string): Promise<TaskRuntimeUsageResponse> {
    console.debug("[api] GET /tasks/%s/runtime-usage", id);
    return request<TaskRuntimeUsageResponse>(`${API_BASE}/${id}/runtime-usage`);
  },

  getTaskQuestions(id: string): Promise<TaskRequirementQuestionsResponse> {
    console.debug("[api] GET /tasks/%s/questions", id);
    return request<TaskRequirementQuestionsResponse>(`${API_BASE}/${id}/questions`);
  },

  getTaskRequirementsSnapshot(id: string): Promise<TaskRequirementsSnapshotResponse> {
    console.debug("[api] GET /tasks/%s/requirements/snapshot", id);
    return request<TaskRequirementsSnapshotResponse>(`${API_BASE}/${id}/requirements/snapshot`);
  },

  answerTaskQuestion(
    id: string,
    questionId: string,
    input: TaskRequirementQuestionAnswerInput,
  ): Promise<TaskRequirementQuestion> {
    console.debug("[api] POST /tasks/%s/questions/%s/answer", id, questionId);
    return request<TaskRequirementQuestion>(`${API_BASE}/${id}/questions/${questionId}/answer`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  answerTaskQuestionBatch(
    id: string,
    batchId: string,
    input: TaskRequirementQuestionBatchAnswerInput,
  ): Promise<{
    task?: Task;
    response: TaskRequirementQuestionsResponse | null;
    resumed: boolean;
    resumeStatus: string | null;
  }> {
    console.debug("[api] POST /tasks/%s/question-batches/%s/answers", id, batchId);
    return request(`${API_BASE}/${id}/question-batches/${batchId}/answers`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getTaskWorktree(id: string): Promise<TaskWorktreeInspection> {
    console.debug("[api] GET /tasks/%s/worktree", id);
    return request<TaskWorktreeInspection>(`${API_BASE}/${id}/worktree`);
  },

  cleanupTaskWorktree(
    id: string,
    action: "archive" | "delete" = "archive",
  ): Promise<TaskWorktreeCleanupResult> {
    console.debug("[api] POST /tasks/%s/worktree/cleanup", id, action);
    return request<TaskWorktreeCleanupResult>(`${API_BASE}/${id}/worktree/cleanup`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  },

  createTask(input: CreateTaskInput): Promise<Task> {
    console.debug("[api] POST /tasks", input);
    return request<Task>(API_BASE, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    console.debug("[api] PUT /tasks/%s", id, input);
    return request<Task>(`${API_BASE}/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  deleteTask(id: string): Promise<void> {
    console.debug("[api] DELETE /tasks/%s", id);
    return request(`${API_BASE}/${id}`, { method: "DELETE" });
  },

  taskEvent(
    id: string,
    event: TaskEvent,
    options?: Pick<TaskEventInput, "deletePlanFile" | "commitOnApprove">,
  ): Promise<Task> {
    console.debug("[api] POST /tasks/%s/events →", id, event);
    const timeoutMs = event === "fast_fix" ? PLAN_FAST_FIX_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    return request<Task>(
      `${API_BASE}/${id}/events`,
      {
        method: "POST",
        body: JSON.stringify({
          event,
          deletePlanFile: options?.deletePlanFile,
          commitOnApprove: options?.commitOnApprove,
        }),
      },
      timeoutMs,
    );
  },

  listTaskComments(id: string): Promise<TaskComment[]> {
    console.debug("[api] GET /tasks/%s/comments", id);
    return request<TaskComment[]>(`${API_BASE}/${id}/comments`);
  },

  createTaskComment(id: string, input: CreateTaskCommentInput): Promise<TaskComment> {
    console.debug("[api] POST /tasks/%s/comments", id, input);
    return request<TaskComment>(`${API_BASE}/${id}/comments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  reorderTask(id: string, position: number): Promise<Task> {
    console.debug("[api] PATCH /tasks/%s/position →", id, position);
    return request<Task>(`${API_BASE}/${id}/position`, {
      method: "PATCH",
      body: JSON.stringify({ position }),
    });
  },

  syncTaskPlan(id: string): Promise<Task> {
    console.debug("[api] POST /tasks/%s/sync-plan", id);
    return request<Task>(`${API_BASE}/${id}/sync-plan`, {
      method: "POST",
    });
  },

  getTaskPlanFileStatus(id: string): Promise<{ exists: boolean; path: string }> {
    console.debug("[api] GET /tasks/%s/plan-file-status", id);
    return request<{ exists: boolean; path: string }>(`${API_BASE}/${id}/plan-file-status`);
  },

  getProjectKnowledge(id: string): Promise<ProjectKnowledgeResponse> {
    console.debug("[api] GET /projects/%s/knowledge", id);
    return request<ProjectKnowledgeResponse>(`/projects/${id}/knowledge`);
  },

  getProjectRuntimeUsage(id: string): Promise<ProjectRuntimeUsageResponse> {
    console.debug("[api] GET /projects/%s/runtime-usage", id);
    return request<ProjectRuntimeUsageResponse>(`/projects/${id}/runtime-usage`);
  },

  getProjectQueue(id: string): Promise<ProjectQueueStateResponse> {
    console.debug("[api] GET /projects/%s/queue", id);
    return request<ProjectQueueStateResponse>(`/projects/${id}/queue`);
  },

  getProjectConfigGovernance(id: string): Promise<ResolvedProjectConfigGovernance> {
    console.debug("[api] GET /projects/%s/config-governance", id);
    return request<BackendProjectConfigGovernance>(`/projects/${id}/config-governance`).then(
      normalizeConfigGovernance,
    );
  },

  listProjectConfigAudit(id: string): Promise<ConfigAuditEvent[]> {
    console.debug("[api] GET /projects/%s/config-audit", id);
    return request<ConfigAuditEvent[] | { events?: ConfigAuditEvent[] }>(
      `/projects/${id}/config-audit`,
    ).then(extractConfigAuditEvents);
  },

  checkRoadmapStatus(projectId: string): Promise<{ exists: boolean }> {
    console.debug("[api] GET /projects/%s/roadmap/status", projectId);
    return request<{ exists: boolean }>(`/projects/${projectId}/roadmap/status`);
  },

  importRoadmap(
    projectId: string,
    roadmapAlias: string,
    taskIntent?: TaskIntent,
  ): Promise<TaskSplitProposalResponse> {
    console.debug("[api] POST /projects/%s/roadmap/import", projectId, {
      roadmapAlias,
      taskIntent,
    });
    return request(
      `/projects/${projectId}/roadmap/import`,
      {
        method: "POST",
        body: JSON.stringify({ roadmapAlias, taskIntent }),
      },
      IMPORT_ROADMAP_TIMEOUT_MS,
    );
  },

  generateRoadmap(
    projectId: string,
    roadmapAlias: string,
    vision?: string,
    taskIntent?: TaskIntent,
  ): Promise<{ status: string; projectId: string; roadmapAlias: string; taskIntent?: TaskIntent }> {
    console.debug("[api] POST /projects/%s/roadmap/generate", projectId, {
      roadmapAlias,
      vision,
      taskIntent,
    });
    return request(`/projects/${projectId}/roadmap/generate`, {
      method: "POST",
      body: JSON.stringify({ roadmapAlias, vision, taskIntent }),
    });
  },

  approveTaskSplitProposal(projectId: string, proposalId: string): Promise<TaskSplitProposal> {
    console.debug("[api] POST /projects/%s/task-split-proposals/%s/approve", projectId, proposalId);
    return request(`/projects/${projectId}/task-split-proposals/${proposalId}/approve`, {
      method: "POST",
    });
  },

  rejectTaskSplitProposal(
    projectId: string,
    proposalId: string,
    reason?: string,
  ): Promise<TaskSplitProposal> {
    console.debug("[api] POST /projects/%s/task-split-proposals/%s/reject", projectId, proposalId);
    return request(`/projects/${projectId}/task-split-proposals/${proposalId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  getMcpStatus(): Promise<{
    installed: boolean;
    serverName: string;
    runtimes: Array<{ runtimeId: string; installed: boolean; config?: unknown }>;
  }> {
    return request("/settings/mcp");
  },

  installMcp(): Promise<{
    success: boolean;
    serverName: string;
    runtimes: Array<{ runtimeId: string; success: boolean; error?: string }>;
  }> {
    return request("/settings/mcp/install", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  removeMcp(): Promise<{ success: boolean }> {
    return request("/settings/mcp", { method: "DELETE" });
  },

  getConfigStatus(projectId: string): Promise<{ exists: boolean; path: string }> {
    return request(`/settings/config/status?projectId=${encodeURIComponent(projectId)}`);
  },

  getConfig(projectId: string): Promise<{ config: AifConfig }> {
    return request(`/settings/config?projectId=${encodeURIComponent(projectId)}`);
  },

  saveConfig(config: AifConfig, projectId: string): Promise<{ success: boolean }> {
    return request(`/settings/config?projectId=${encodeURIComponent(projectId)}`, {
      method: "PUT",
      body: JSON.stringify({ config }),
    });
  },

  sendChatMessage(input: ChatRequest): Promise<SendChatMessageResponse> {
    console.debug("[api] POST /chat", {
      projectId: input.projectId,
      explore: input.explore,
      sessionId: input.sessionId,
    });
    return request<SendChatMessageResponse>(
      "/chat",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      CHAT_TIMEOUT_MS,
    );
  },

  async abortChat(conversationId: string): Promise<void> {
    console.debug("[api] POST /chat/%s/abort", conversationId);
    const res = await fetch(`${API_PREFIX}/chat/${conversationId}/abort`, { method: "POST" });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to abort chat: ${res.status}`);
    }
  },

  // Chat Sessions
  listChatSessions(projectId: string): Promise<ChatSession[]> {
    console.debug("[api] GET /chat/sessions projectId=%s", projectId);
    return request<ChatSession[]>(`/chat/sessions?projectId=${projectId}`);
  },

  createChatSession(input: CreateChatSessionInput): Promise<ChatSession> {
    console.debug("[api] POST /chat/sessions", input);
    return request<ChatSession>("/chat/sessions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getChatSession(id: string, context?: ChatSessionRequestContext): Promise<ChatSession> {
    console.debug("[api] GET /chat/sessions/%s", id);
    return request<ChatSession>(withChatSessionContext(`/chat/sessions/${id}`, context));
  },

  getChatSessionMessages(
    sessionId: string,
    context?: ChatSessionRequestContext,
  ): Promise<ChatSessionMessage[]> {
    console.debug("[api] GET /chat/sessions/%s/messages", sessionId);
    return request<ChatSessionMessage[]>(
      withChatSessionContext(`/chat/sessions/${sessionId}/messages`, context),
    );
  },

  updateChatSession(id: string, input: UpdateChatSessionInput): Promise<ChatSession> {
    console.debug("[api] PUT /chat/sessions/%s", id, input);
    return request<ChatSession>(`/chat/sessions/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  deleteChatSession(id: string): Promise<void> {
    console.debug("[api] DELETE /chat/sessions/%s", id);
    return request(`/chat/sessions/${id}`, { method: "DELETE" });
  },

  // Memory
  listMemoryItems(params?: {
    projectId?: string;
    status?: MemoryItemStatus;
    scope?: MemoryScope;
    includeGlobal?: boolean;
    limit?: number;
  }): Promise<MemoryItem[]> {
    const qs = new URLSearchParams();
    if (params?.projectId) qs.set("projectId", params.projectId);
    if (params?.status) qs.set("status", params.status);
    if (params?.scope) qs.set("scope", params.scope);
    if (params?.includeGlobal !== undefined) qs.set("includeGlobal", String(params.includeGlobal));
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<MemoryItem[]>(`/memory${suffix}`);
  },

  createMemoryItem(input: CreateMemoryItemInput): Promise<MemoryItem> {
    return request<MemoryItem>("/memory", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateMemoryItem(id: string, input: UpdateMemoryItemInput): Promise<MemoryItem> {
    return request<MemoryItem>(`/memory/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  approveMemoryItem(id: string, note?: string | null): Promise<MemoryItem> {
    return request<MemoryItem>(`/memory/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  },

  rejectMemoryItem(id: string, note?: string | null): Promise<MemoryItem> {
    return request<MemoryItem>(`/memory/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  },

  expireMemoryItem(id: string, note?: string | null): Promise<MemoryItem> {
    return request<MemoryItem>(`/memory/${id}/expire`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  },

  listMemoryUsageEvents(id: string): Promise<MemoryUsageEvent[]> {
    return request<MemoryUsageEvent[]>(`/memory/${id}/usage`);
  },

  listMemoryLifecycleEvents(id: string): Promise<MemoryLifecycleEvent[]> {
    return request<MemoryLifecycleEvent[]>(`/memory/${id}/lifecycle`);
  },

  // Runtime profiles
  listRuntimeProfiles(params?: {
    projectId?: string;
    includeGlobal?: boolean;
    enabledOnly?: boolean;
    scope?: "global" | "project";
  }): Promise<RuntimeProfile[]> {
    const qs = new URLSearchParams();
    if (params?.projectId) qs.set("projectId", params.projectId);
    if (params?.includeGlobal !== undefined) qs.set("includeGlobal", String(params.includeGlobal));
    if (params?.enabledOnly !== undefined) qs.set("enabledOnly", String(params.enabledOnly));
    if (params?.scope) qs.set("scope", params.scope);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<RuntimeProfile[]>(`/runtime-profiles${suffix}`);
  },

  listRuntimes(): Promise<RuntimeDescriptor[]> {
    return request("/runtime-profiles/runtimes");
  },

  createRuntimeProfile(input: CreateRuntimeProfileInput): Promise<RuntimeProfile> {
    return request("/runtime-profiles", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateRuntimeProfile(id: string, input: UpdateRuntimeProfileInput): Promise<RuntimeProfile> {
    return request(`/runtime-profiles/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  deleteRuntimeProfile(id: string): Promise<{ success: boolean }> {
    return request(`/runtime-profiles/${id}`, {
      method: "DELETE",
    });
  },

  validateRuntimeProfile(input: {
    projectId?: string;
    profileId?: string;
    profile?: CreateRuntimeProfileInput;
    modelOverride?: string | null;
    runtimeOptions?: Record<string, unknown> | null;
    apiKey?: string;
    forceRefresh?: boolean;
  }): Promise<{
    ok: boolean;
    message: string;
    details: Record<string, unknown> | null;
    profile: Record<string, unknown>;
  }> {
    return request("/runtime-profiles/validate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listRuntimeModels(input: {
    projectId?: string;
    profileId?: string;
    profile?: CreateRuntimeProfileInput;
    modelOverride?: string | null;
    runtimeOptions?: Record<string, unknown> | null;
    apiKey?: string;
    forceRefresh?: boolean;
  }): Promise<{
    models: Array<{
      id: string;
      label?: string;
      supportsStreaming?: boolean;
      metadata?: Record<string, unknown>;
    }>;
    profile: Record<string, unknown>;
  }> {
    return request("/runtime-profiles/models", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getEffectiveTaskRuntime(taskId: string): Promise<{
    source: string;
    profile: RuntimeProfile | null;
    taskRuntimeProfileId: string | null;
    projectRuntimeProfileId: string | null;
    systemRuntimeProfileId: string | null;
  }> {
    return request(`/runtime-profiles/effective/task/${taskId}`);
  },

  getEffectiveChatRuntime(projectId: string): Promise<{
    source: string;
    profile: RuntimeProfile | null;
    taskRuntimeProfileId: string | null;
    projectRuntimeProfileId: string | null;
    systemRuntimeProfileId: string | null;
    resolved: {
      source: string;
      profileId: string | null;
      runtimeId: string;
      providerId: string;
      transport: string;
      baseUrl: string | null;
      apiKeyEnvVar: string | null;
      hasApiKey: boolean;
      model: string | null;
      headers: string[];
      optionKeys: string[];
      workflowKind: string | null;
    };
  }> {
    return request(`/runtime-profiles/effective/chat/${projectId}`);
  },

  // Codex login proxy (feature-flagged)
  getCodexLoginCapabilities(): Promise<{ loginProxyEnabled: boolean }> {
    console.debug("[api] GET /auth/codex/capabilities");
    return request("/auth/codex/capabilities");
  },

  getCodexLoginStatus(): Promise<
    | {
        active: true;
        sessionId: string;
        verificationUrl: string;
        userCode: string;
        startedAt: string;
      }
    | {
        active: false;
        lastResult?: {
          ok: boolean;
          sessionId: string;
          reason:
            | "success"
            | "exit_nonzero"
            | "signal"
            | "timeout"
            | "parse_timeout"
            | "cancel"
            | "spawn_failed";
          exitCode: number | null;
          signal: string | null;
          finishedAt: string;
        };
      }
  > {
    return request("/auth/codex/login/status");
  },

  startCodexLogin(): Promise<{
    sessionId: string;
    verificationUrl: string;
    userCode: string;
    startedAt: string;
  }> {
    console.debug("[api] POST /auth/codex/login/start");
    return request("/auth/codex/login/start", { method: "POST" }, PLAN_FAST_FIX_TIMEOUT_MS);
  },

  cancelCodexLogin(): Promise<{ ok: boolean; cancelled: boolean }> {
    console.debug("[api] POST /auth/codex/login/cancel");
    return request("/auth/codex/login/cancel", { method: "POST" });
  },
};
