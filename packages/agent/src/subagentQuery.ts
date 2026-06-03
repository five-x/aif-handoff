import {
  clearRuntimeProfileLimitSnapshot,
  createDbRuntimeEndpointLeaseStore,
  createDbUsageSink,
  expireStaleRuntimeWarmupSessions,
  findActiveReadyRuntimeWarmupSession,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  getAppDefaultRuntimeProfileId,
  getRuntimeProfileResponseById,
  getTaskSessionId,
  listAuditEvidenceEvents,
  persistRuntimeProfileLimitSnapshot,
  renewTaskClaim,
  resolveEffectiveRuntimeProfile,
  saveTaskSessionId,
  updateTaskHeartbeat,
} from "@aif/data";
import {
  assertRuntimeCapabilities,
  buildRuntimeLimitBroadcastCacheKey,
  buildRuntimeLimitCacheSignature,
  bootstrapRuntimeRegistry,
  checkRuntimeSessionForkSupport,
  createRuntimeMemoryCache,
  createRuntimeWorkflowSpec,
  extractLatestRuntimeLimitSnapshot,
  extractRuntimeLimitSnapshotFromError,
  mapSafeRuntimeErrorReason,
  normalizeRuntimeLimitSnapshot,
  observeRuntimeLimitEvent,
  sanitizeProviderMeta,
  getResultSessionId,
  redactResolvedRuntimeProfile,
  resolveAdapterCapabilities,
  resolveRuntimeProfile,
  resolveRuntimePromptPolicy,
  RuntimeCapabilityError,
  RuntimeExecutionError,
  RUNTIME_TRUST_TOKEN,
  UsageSource,
  type RuntimeAdapter,
  type RuntimeCapabilities,
  type RuntimeCapabilityName,
  type RuntimeRegistry,
  type RuntimeRegistryLogger,
  type RuntimeLimitSnapshot,
  type RuntimeSessionReusePolicy,
  type RuntimeTransport,
  type RuntimeWorkflowSpec,
} from "@aif/runtime";
import {
  AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE,
  decidePolicyBypass,
  getEnv,
  getPermissionExecutionPolicy,
  buildRetryContextForRuntimePrompt,
  getRetryContextThresholds,
  isPermissionPolicyIntent,
  isWarmupWorkflowKind,
  logger,
  normalizeRuntimeStage,
  evaluateRuntimeProfileStageCapability,
  redactProviderTextForLogs,
  type EffectiveRuntimeProfileSource,
  type RuntimeStage,
  type RuntimeStageCaps,
  type RuntimeStageOrProfileMode,
} from "@aif/shared";
import { createAuditEvidenceLogger, logActivity, persistAuditEvidencePayload } from "./hooks.js";
import { PROJECT_SCOPE_SYSTEM_APPEND, REVIEW_DIFF_SCOPE_SYSTEM_APPEND } from "./constants.js";
import { createStderrCollector } from "./stderrCollector.js";
import { writeQueryAudit } from "./queryAudit.js";
import { getActiveStageAbortController } from "./stageAbort.js";
import { notifyProjectRuntimeLimitBroadcast } from "./notifier.js";
import { splitRuntimeRecoveryOptions } from "./runtimeRecoveryOptions.js";

const log = logger("subagent-query");

const HEARTBEAT_INTERVAL_MS = 30_000;
const OPERATOR_CANCEL_WATCH_INTERVAL_MS = 1_000;

const FIRST_ACTIVITY_TIMEOUT_ERROR = "first_activity_timeout";
const FIRST_ACTIVITY_MAX_RETRIES = 2;
const runtimeLimitStateCache = createRuntimeMemoryCache<string>({ defaultTtlMs: 30_000 });
const runtimeLimitBroadcastCache = createRuntimeMemoryCache<string>({ defaultTtlMs: 30_000 });

function notifyRuntimeUsageRefresh(input: {
  projectId?: string | null;
  runtimeProfileId?: string | null;
  taskId?: string | null;
}): void {
  if (!input.projectId || !input.runtimeProfileId) {
    return;
  }
  void notifyProjectRuntimeLimitBroadcast(input.projectId, input.runtimeProfileId, {
    taskId: input.taskId ?? null,
  });
}

function findRuntimeExecutionError(error: unknown): RuntimeExecutionError | null {
  if (error instanceof RuntimeExecutionError) {
    return error;
  }
  if (error instanceof Error && "cause" in error && error.cause) {
    return findRuntimeExecutionError(error.cause);
  }
  return null;
}

function findRuntimeCapabilityError(error: unknown): RuntimeCapabilityError | null {
  if (error instanceof RuntimeCapabilityError) {
    return error;
  }
  if (error instanceof Error && "cause" in error && error.cause) {
    return findRuntimeCapabilityError(error.cause);
  }
  return null;
}

function isOperatorCancelledTask(task: ReturnType<typeof findTaskById>): boolean {
  return (
    task?.status === "blocked_external" &&
    task.blockedReason?.startsWith("operator_cancelled:") === true
  );
}

function startOperatorCancelWatcher(taskId: string, abort: AbortController): NodeJS.Timeout {
  return setInterval(() => {
    if (abort.signal.aborted) return;
    const task = findTaskById(taskId);
    if (!isOperatorCancelledTask(task)) return;
    abort.abort(new Error("operator_cancelled"));
    logActivity(taskId, "Agent", "active attempt aborted because task was cancelled by operator");
  }, OPERATOR_CANCEL_WATCH_INTERVAL_MS);
}

function clearOperatorCancelWatcher(timer: NodeJS.Timeout | null): void {
  if (!timer) return;
  clearInterval(timer);
}

function buildSanitizedSubagentError(
  error: unknown,
  safeReason: ReturnType<typeof mapSafeRuntimeErrorReason>,
  providerId?: string | null,
): Error {
  const runtimeError = findRuntimeExecutionError(error);
  if (!runtimeError && findRuntimeCapabilityError(error)) {
    return new RuntimeCapabilityError(
      "Runtime capability check failed. Check the configured runtime profile for this stage.",
    );
  }
  if (!runtimeError) {
    return new Error(safeReason.reason);
  }

  const normalizedSnapshot = runtimeError.limitSnapshot
    ? normalizeRuntimeLimitSnapshot(runtimeError.limitSnapshot)
    : null;

  return new RuntimeExecutionError(safeReason.reason, undefined, runtimeError.category, {
    adapterCode: runtimeError.adapterCode,
    httpStatus: runtimeError.httpStatus,
    resetAt: normalizedSnapshot?.resetAt ?? runtimeError.resetAt,
    retryAfterMs: runtimeError.retryAfterMs,
    retryAfterSeconds: runtimeError.retryAfterSeconds,
    limitSnapshot: normalizedSnapshot,
    providerMeta:
      normalizedSnapshot?.providerMeta ??
      sanitizeProviderMeta(
        normalizedSnapshot?.providerId ?? runtimeError.limitSnapshot?.providerId ?? providerId,
        runtimeError.providerMeta ?? null,
      ),
  });
}

function clearRuntimeLimitBroadcastCacheKeyIfUnchanged(
  broadcastCacheKey: string,
  signature: string,
): void {
  if (runtimeLimitBroadcastCache.get(broadcastCacheKey) === signature) {
    runtimeLimitBroadcastCache.delete(broadcastCacheKey);
  }
}

function refreshRuntimeProfileLimitState(input: {
  runtimeProfileId?: string | null;
  runtimeId?: string | null;
  providerId?: string | null;
  snapshot?: RuntimeLimitSnapshot | null;
  clearOnMissing?: boolean;
  taskId: string;
  workflowKind?: string | null;
  reason: string;
}): void {
  const normalizedSnapshot = input.snapshot ? normalizeRuntimeLimitSnapshot(input.snapshot) : null;
  const runtimeProfileId = input.runtimeProfileId ?? normalizedSnapshot?.profileId ?? null;
  if (!runtimeProfileId) {
    log.debug(
      {
        taskId: input.taskId,
        runtimeId: input.runtimeId ?? normalizedSnapshot?.runtimeId ?? null,
        providerId: input.providerId ?? normalizedSnapshot?.providerId ?? null,
        workflowKind: input.workflowKind ?? null,
        reason: input.reason,
      },
      "Skipping runtime limit state refresh because no runtime profile is associated",
    );
    return;
  }

  const signature = buildRuntimeLimitCacheSignature(
    normalizedSnapshot,
    input.clearOnMissing === true,
  );
  if (!signature) {
    log.debug(
      {
        taskId: input.taskId,
        runtimeProfileId,
        runtimeId: input.runtimeId ?? normalizedSnapshot?.runtimeId ?? null,
        providerId: input.providerId ?? normalizedSnapshot?.providerId ?? null,
        workflowKind: input.workflowKind ?? null,
        reason: input.reason,
      },
      "No runtime limit snapshot or clear action available for refresh",
    );
    return;
  }

  const cachedSignature = runtimeLimitStateCache.get(runtimeProfileId);
  const shouldPersist = cachedSignature !== signature;
  if (!shouldPersist) {
    log.debug(
      {
        taskId: input.taskId,
        runtimeProfileId,
        runtimeId: input.runtimeId ?? normalizedSnapshot?.runtimeId ?? null,
        providerId: input.providerId ?? normalizedSnapshot?.providerId ?? null,
        workflowKind: input.workflowKind ?? null,
        reason: input.reason,
      },
      "Skipped runtime limit DB write because identical state is still cached",
    );
  }

  const persistedAt = new Date().toISOString();
  const taskRow = findTaskById(input.taskId);
  const projectId = taskRow?.projectId ?? null;
  const broadcastCacheKey = buildRuntimeLimitBroadcastCacheKey({
    projectId,
    taskId: input.taskId,
    runtimeProfileId,
  });
  const cachedBroadcastSignature = broadcastCacheKey
    ? runtimeLimitBroadcastCache.get(broadcastCacheKey)
    : null;
  const shouldBroadcast = Boolean(broadcastCacheKey) && cachedBroadcastSignature !== signature;

  try {
    if (shouldPersist) {
      log.debug(
        {
          taskId: input.taskId,
          runtimeProfileId,
          runtimeId: input.runtimeId ?? normalizedSnapshot?.runtimeId ?? null,
          providerId: input.providerId ?? normalizedSnapshot?.providerId ?? null,
          workflowKind: input.workflowKind ?? null,
          reason: input.reason,
          action: normalizedSnapshot ? "persist" : "clear",
        },
        "Refreshing runtime profile limit state for subagent execution",
      );

      if (normalizedSnapshot) {
        persistRuntimeProfileLimitSnapshot(runtimeProfileId, normalizedSnapshot, persistedAt);
      } else {
        clearRuntimeProfileLimitSnapshot(runtimeProfileId, persistedAt);
      }
      runtimeLimitStateCache.set(runtimeProfileId, signature);
    }

    if (shouldBroadcast && projectId && broadcastCacheKey) {
      runtimeLimitBroadcastCache.set(broadcastCacheKey, signature);
      void notifyProjectRuntimeLimitBroadcast(projectId, runtimeProfileId, {
        taskId: input.taskId,
      })
        .then((sent) => {
          if (!sent) {
            clearRuntimeLimitBroadcastCacheKeyIfUnchanged(broadcastCacheKey, signature);
            log.warn(
              {
                taskId: input.taskId,
                projectId,
                runtimeProfileId,
              },
              "Runtime limit broadcast was not delivered",
            );
          }
        })
        .catch((error) => {
          clearRuntimeLimitBroadcastCacheKeyIfUnchanged(broadcastCacheKey, signature);
          log.warn(
            {
              taskId: input.taskId,
              projectId,
              runtimeProfileId,
              errorName: error instanceof Error ? error.name : typeof error,
              errorMessage:
                error instanceof Error
                  ? redactProviderTextForLogs(error.message)
                  : redactProviderTextForLogs(String(error)),
            },
            "Runtime limit broadcast failed",
          );
        });
    }
  } catch (error) {
    log.warn(
      {
        taskId: input.taskId,
        runtimeProfileId,
        runtimeId: input.runtimeId ?? normalizedSnapshot?.runtimeId ?? null,
        providerId: input.providerId ?? normalizedSnapshot?.providerId ?? null,
        workflowKind: input.workflowKind ?? null,
        reason: input.reason,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage:
          error instanceof Error
            ? redactProviderTextForLogs(error.message)
            : redactProviderTextForLogs(String(error)),
      },
      "Failed to refresh runtime profile limit state for subagent execution",
    );
  }
}

function getLockRenewalMs(): number {
  return Math.max(getEnv().AGENT_STAGE_RUN_TIMEOUT_MS, 60_000) + 5 * 60 * 1000;
}

/**
 * First-activity watchdog: aborts the agent if no runtime activity
 * arrives within AGENT_FIRST_ACTIVITY_TIMEOUT_MS after "started".
 * Detects hung agents early (~60s) instead of waiting for the 90-min stale timeout.
 */
function createFirstActivityWatchdog(
  timeoutMs: number,
  abortController: AbortController | undefined,
  onStall: () => void,
): { clear: () => void; markActivity: () => void; didFire: boolean } {
  if (timeoutMs <= 0) {
    return { clear: () => {}, markActivity: () => {}, didFire: false };
  }

  let fired = false;
  let cleared = false;

  const timer = setTimeout(() => {
    if (cleared) return;
    fired = true;
    onStall();
    if (abortController && !abortController.signal.aborted) {
      abortController.abort(new Error(FIRST_ACTIVITY_TIMEOUT_ERROR));
    }
  }, timeoutMs);

  return {
    get didFire() {
      return fired;
    },
    clear() {
      if (!fired && !cleared) {
        cleared = true;
        clearTimeout(timer);
      }
    },
    markActivity() {
      if (!fired && !cleared) {
        cleared = true;
        clearTimeout(timer);
      }
    },
  };
}

let runtimeRegistryPromise: Promise<RuntimeRegistry> | null = null;

const runtimeStageFallbackProfiles = new Map<
  string,
  {
    profileId: string;
    source: EffectiveRuntimeProfileSource;
    createdAtMs: number;
  }
>();

const RUNTIME_STAGE_FALLBACK_TTL_MS = 5 * 60 * 1000;

function runtimeStageFallbackKey(taskId: string, stage: RuntimeStage): string {
  return `${taskId}:${stage}`;
}

export function setRuntimeStageFallbackProfile(input: {
  taskId: string;
  stage: RuntimeStage;
  profileId: string | null;
  source?: EffectiveRuntimeProfileSource;
}): void {
  const key = runtimeStageFallbackKey(input.taskId, input.stage);
  if (!input.profileId) {
    runtimeStageFallbackProfiles.delete(key);
    return;
  }
  runtimeStageFallbackProfiles.set(key, {
    profileId: input.profileId,
    source: input.source ?? "system_default",
    createdAtMs: Date.now(),
  });
}

function getRuntimeStageFallbackProfile(
  taskId: string,
  stage: RuntimeStage,
): { profileId: string; source: EffectiveRuntimeProfileSource } | null {
  const key = runtimeStageFallbackKey(taskId, stage);
  const fallback = runtimeStageFallbackProfiles.get(key);
  if (!fallback) return null;
  if (Date.now() - fallback.createdAtMs > RUNTIME_STAGE_FALLBACK_TTL_MS) {
    runtimeStageFallbackProfiles.delete(key);
    return null;
  }
  return { profileId: fallback.profileId, source: fallback.source };
}

function hasConfiguredRuntimeProfileCandidate(input: {
  taskRuntimeProfileId: string | null;
  projectRuntimeProfileId: string | null;
  systemRuntimeProfileId: string | null;
}): boolean {
  return Boolean(
    input.taskRuntimeProfileId || input.projectRuntimeProfileId || input.systemRuntimeProfileId,
  );
}

function runtimeStageCapabilityError(input: {
  status: "runtime_stage_not_capable" | "no_implementation_capable_profile";
  stage: RuntimeStage;
  runtimeId?: string | null;
  providerId?: string | null;
  profileId?: string | null;
  reason?: string | null;
}): RuntimeExecutionError {
  const reason =
    input.status === "no_implementation_capable_profile"
      ? "no implementation-capable runtime profile is configured"
      : "selected runtime profile is not capable for this stage";
  return new RuntimeExecutionError(
    "Runtime profile is not capable for this stage.",
    undefined,
    "permission",
    {
      providerMeta: {
        status: input.status,
        category: "permission",
        reason,
        stage: input.stage,
        runtimeId: input.runtimeId ?? null,
        profileId: input.profileId ?? null,
        policyReason: input.reason ?? null,
      },
    },
  );
}

function capNumber(value: number | null | undefined, cap: number | undefined): number | null {
  if (cap === undefined) return value ?? null;
  if (value === null || value === undefined || !Number.isFinite(value)) return cap;
  return Math.min(value, cap);
}

function capInteger(value: number | null | undefined, cap: number | undefined): number | undefined {
  const capped = capNumber(value, cap);
  if (capped === null || !Number.isFinite(capped)) return undefined;
  return Math.max(0, Math.floor(capped));
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function applyNumericOptionCap(
  target: Record<string, unknown>,
  key: string,
  cap: number | undefined,
): void {
  if (cap === undefined) return;
  const current = readFiniteNumber(target[key]);
  target[key] = current === undefined ? cap : Math.min(current, cap);
}

function applyRuntimeStageCapsToAdapterOptions(
  options: Record<string, unknown>,
  caps: RuntimeStageCaps,
): Record<string, unknown> {
  const capped = { ...options };
  applyNumericOptionCap(capped, "maxToolTurns", caps.maxToolTurns);
  applyNumericOptionCap(capped, "runTimeoutMs", caps.wallClockMs);
  applyNumericOptionCap(capped, "repeatedToolCallLimit", caps.repeatedToolCallLimit);
  applyNumericOptionCap(capped, "tokenBudget", caps.tokenBudget);
  applyNumericOptionCap(capped, "contextTokens", caps.contextTokens);
  applyNumericOptionCap(capped, "contextWindowTokens", caps.contextTokens);
  applyNumericOptionCap(capped, "maxInputTokens", caps.contextTokens);
  applyNumericOptionCap(capped, "maxTokens", caps.maxOutputTokens);
  applyNumericOptionCap(capped, "maxOutputTokens", caps.maxOutputTokens);
  applyNumericOptionCap(
    capped,
    "repositoryInspectionToolBudget",
    caps.repositoryInspectionToolBudget,
  );
  if (caps.sandboxMode) {
    capped.sandboxMode = caps.sandboxMode;
  }
  if (caps.approvalPolicy) {
    capped.approvalPolicy = caps.approvalPolicy;
  }
  return capped;
}

export interface SubagentQueryOptions {
  taskId: string;
  projectRoot: string;
  agentName: string;
  prompt: string;
  maxBudgetUsd?: number | null;
  /** Preferred agent definition name. Runtime prompt policy may fallback to slash strategy. */
  agent?: string;
  /** Optional slash command fallback used when agent definitions are unavailable. */
  fallbackSlashCommand?: string;
  /** Runtime profile resolution mode — determines which project default is used. */
  profileMode?: RuntimeStageOrProfileMode;
  /** Whether to skip code review stage (implementing → done instead of implementing → review). */
  skipReview?: boolean;
  /** Optional override for tests/tuning: timeout waiting for first message from query stream. */
  queryStartTimeoutMs?: number;
  /** Optional override for tests/tuning: delay before retrying after query_start_timeout. */
  queryStartRetryDelayMs?: number;
  /** AbortController for cancelling a running query from outside (e.g. stage timeout). */
  abortController?: AbortController;
  /** Optional explicit workflow spec. If omitted, a default one is generated from options. */
  workflowSpec?: RuntimeWorkflowSpec;
  /** Optional workflow kind used when auto-generating workflow spec. */
  workflowKind?: string;
  /** Required capabilities for this workflow. */
  requiredCapabilities?: RuntimeCapabilityName[];
  /** Session reuse policy for this workflow. */
  sessionReusePolicy?: RuntimeSessionReusePolicy;
  /** Runtime-level model override for this invocation. */
  modelOverride?: string | null;
  /** Disable task/profile model fallback and force adapter invocation without model. */
  suppressModelFallback?: boolean;
  /** Optional custom system append for the runtime workflow. */
  systemPromptAppend?: string;
  /** Optional partial-message stream mode (chat-like workflows). */
  includePartialMessages?: boolean;
  /** Optional max turns for runtime adapters that support it. */
  maxTurns?: number;
  /** Optional repository-inspection tool-call budget for runtime adapters that support it. */
  repositoryInspectionToolBudget?: number;
  /** Optional post-budget behavior for adapters that support repository-inspection budgets. */
  repositoryInspectionBudgetFinalizationMode?: "compact_final_response" | "controlled_failure";
  /** Optional per-invocation run timeout. Defaults to the global stage timeout. */
  runTimeoutMs?: number;
  /** Optional adapter option overrides for one invocation. */
  adapterOptions?: Record<string, unknown>;
}

export interface SubagentQueryResult {
  resultText: string;
}

type WarmupSkipReason =
  | "feature_disabled"
  | "retry_context_compacted"
  | "workflow_not_enabled"
  | "existing_task_session"
  | "expired"
  | "unsupported_runtime"
  | "missing_adapter_method"
  | "runtime_mismatch";

function sessionIdSuffix(sessionId: string | null | undefined): string | null {
  if (!sessionId) return null;
  return sessionId.slice(-8);
}

// Reasoning-effort key per runtime: claude/openrouter use `effort`,
// codex uses `modelReasoningEffort`, opencode uses `reasoningEffort`.
// Mirrors MANAGED_OPTION_KEYS in packages/web/src/components/settings/RuntimeProfileForm.tsx.
const EFFORT_OPTION_KEYS = ["effort", "modelReasoningEffort", "reasoningEffort"] as const;
const runtimeEndpointLeaseStore = createDbRuntimeEndpointLeaseStore({
  holderId: `agent-subagent:${process.pid}:${crypto.randomUUID()}`,
});

function pickEffort(options: Record<string, unknown>): string | null {
  for (const key of EFFORT_OPTION_KEYS) {
    const value = options[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function createRuntimeRegistryLogger(): RuntimeRegistryLogger {
  return {
    debug(context, message) {
      log.debug({ ...context }, `[runtime-registry] ${message}`);
    },
    warn(context, message) {
      log.warn({ ...context }, `WARN [runtime-module] ${message}`);
    },
    error(context, message) {
      log.error({ ...context }, `ERROR [runtime-registry] ${message}`);
    },
  };
}

async function getRuntimeRegistry(): Promise<RuntimeRegistry> {
  if (runtimeRegistryPromise) return runtimeRegistryPromise;

  runtimeRegistryPromise = bootstrapRuntimeRegistry({
    logger: createRuntimeRegistryLogger(),
    runtimeModules: getEnv().AIF_RUNTIME_MODULES,
    runtimeEndpointLeaseStore,
    usageSink: createDbUsageSink({
      onRecorded: (event) => {
        if (event.outcome && event.outcome !== "success") return;
        notifyRuntimeUsageRefresh({
          projectId: event.context.projectId ?? null,
          runtimeProfileId: event.profileId ?? null,
          taskId: event.context.taskId ?? null,
        });
      },
    }),
  }).catch((error) => {
    runtimeRegistryPromise = null;
    throw error;
  });

  return runtimeRegistryPromise;
}

/**
 * Resolve the RuntimeAdapter that would handle a given task.
 * Useful for reading adapter metadata (e.g. lightModel) without running a query.
 * This helper is intentionally limited to task-stage modes; chat resolution
 * goes through the API runtime service instead.
 */
export async function resolveAdapterForTask(
  taskId: string,
  mode: RuntimeStageOrProfileMode = "task",
): Promise<RuntimeAdapter> {
  const task = findTaskById(taskId);
  const systemDefaultRuntimeProfileId = getAppDefaultRuntimeProfileId(mode);
  const effective = resolveEffectiveRuntimeProfile({
    taskId,
    projectId: task?.projectId,
    mode,
    systemDefaultRuntimeProfileId,
  });
  const resolved = resolveRuntimeProfile({
    source: effective.source,
    profile: effective.profile,
    fallbackRuntimeId: getEnv().AIF_DEFAULT_RUNTIME_ID,
    fallbackProviderId: getEnv().AIF_DEFAULT_PROVIDER_ID,
  });
  const registry = await getRuntimeRegistry();
  return registry.resolveRuntime(resolved.runtimeId);
}

function runtimeStageForWorkflow(
  workflowKind: string,
  profileMode: RuntimeStageOrProfileMode,
): RuntimeStage {
  if (workflowKind === "planner") return "planner";
  if (workflowKind === "plan-checker") return "plan_checker";
  if (workflowKind === "implementer") return "implementer";
  if (workflowKind === "reviewer") return "reviewer";
  if (workflowKind === "review-security" || workflowKind === "security_review") return "security";
  if (workflowKind === "audit") return "audit";
  if (workflowKind === "synthesis") return "synthesis";
  if (workflowKind === "chat") return "chat";
  return normalizeRuntimeStage(profileMode);
}

function buildWorkflowSpec(options: SubagentQueryOptions): RuntimeWorkflowSpec {
  if (options.workflowSpec) return options.workflowSpec;

  return createRuntimeWorkflowSpec({
    workflowKind: options.workflowKind ?? options.agentName,
    prompt: options.prompt,
    requiredCapabilities: options.requiredCapabilities ?? [],
    agentDefinitionName: options.agent,
    fallbackSlashCommand: options.fallbackSlashCommand,
    sessionReusePolicy: options.sessionReusePolicy ?? "resume_if_available",
    systemPromptAppend: options.systemPromptAppend ?? PROJECT_SCOPE_SYSTEM_APPEND,
  });
}

async function resolveExecutionContext(options: SubagentQueryOptions): Promise<{
  workflow: RuntimeWorkflowSpec;
  runtimeStage: RuntimeStage;
  stageCaps: RuntimeStageCaps;
  runtimeId: string;
  providerId: string;
  profileId: string | null;
  transport: RuntimeTransport;
  capabilities: RuntimeCapabilities;
  model: string | null;
  effort: string | null;
  headers: Record<string, string>;
  options: Record<string, unknown>;
  prompt: string;
  systemPromptAppend: string;
  agentDefinitionName?: string;
  canResume: boolean;
  retryContextCompacted: boolean;
}> {
  const task = findTaskById(options.taskId);
  const profileMode = options.profileMode ?? "task";
  const workflow = buildWorkflowSpec(options);
  const runtimeStage = runtimeStageForWorkflow(workflow.workflowKind, profileMode);
  const systemDefaultRuntimeProfileId = getAppDefaultRuntimeProfileId(runtimeStage);
  let effective = resolveEffectiveRuntimeProfile({
    taskId: options.taskId,
    projectId: task?.projectId,
    mode: runtimeStage,
    systemDefaultRuntimeProfileId,
  });
  const runtimeOptionsOverride = splitRuntimeRecoveryOptions(
    task?.runtimeOptionsJson,
  ).adapterOptions;
  const fallbackProfile = getRuntimeStageFallbackProfile(options.taskId, runtimeStage);
  if (fallbackProfile && fallbackProfile.profileId !== effective.profile?.id) {
    const profile = getRuntimeProfileResponseById(fallbackProfile.profileId);
    if (profile?.enabled) {
      effective = {
        ...effective,
        source: fallbackProfile.source,
        profile,
      };
      log.info(
        {
          taskId: options.taskId,
          runtimeStage,
          runtimeProfileId: fallbackProfile.profileId,
          source: fallbackProfile.source,
        },
        "Applied coordinator-selected runtime gate fallback profile",
      );
    } else {
      setRuntimeStageFallbackProfile({
        taskId: options.taskId,
        stage: runtimeStage,
        profileId: null,
      });
    }
  }
  const stageDecision = effective.profile
    ? evaluateRuntimeProfileStageCapability(effective.profile, runtimeStage)
    : null;
  if (stageDecision && !stageDecision.allowed) {
    throw runtimeStageCapabilityError({
      status: "runtime_stage_not_capable",
      stage: runtimeStage,
      runtimeId: effective.profile?.runtimeId ?? null,
      providerId: effective.profile?.providerId ?? null,
      profileId: effective.profile?.id ?? null,
      reason: stageDecision.reason,
    });
  }
  if (
    !effective.profile &&
    runtimeStage === "implementer" &&
    hasConfiguredRuntimeProfileCandidate(effective)
  ) {
    throw runtimeStageCapabilityError({
      status: "no_implementation_capable_profile",
      stage: runtimeStage,
      reason: "configured runtime profiles are unavailable or not implementer-capable",
    });
  }
  let stageCaps = stageDecision?.caps ?? {};
  const suppressModelFallback = options.suppressModelFallback === true;
  const modelOverride =
    options.modelOverride ?? (suppressModelFallback ? null : (task?.modelOverride ?? null));

  const resolved = resolveRuntimeProfile({
    source: effective.source,
    profile: effective.profile,
    workflow,
    modelOverride,
    suppressModelFallback,
    runtimeOptionsOverride,
    fallbackRuntimeId: getEnv().AIF_DEFAULT_RUNTIME_ID,
    fallbackProviderId: getEnv().AIF_DEFAULT_PROVIDER_ID,
    env: process.env,
    logger: {
      debug(context, message) {
        log.debug({ ...context }, `[runtime-resolution] ${message}`);
      },
      info(context, message) {
        log.info({ ...context }, `INFO [runtime-validation] ${message}`);
      },
      warn(context, message) {
        log.warn({ ...context }, `WARN [runtime-validation] ${message}`);
      },
    },
  });

  if (!effective.profile) {
    const fallbackDecision = evaluateRuntimeProfileStageCapability(
      {
        id: resolved.profileId ?? "environment-runtime-default",
        runtimeId: resolved.runtimeId,
        providerId: resolved.providerId,
        options: resolved.options,
      },
      runtimeStage,
    );
    if (!fallbackDecision.allowed) {
      throw runtimeStageCapabilityError({
        status: "runtime_stage_not_capable",
        stage: runtimeStage,
        runtimeId: resolved.runtimeId,
        providerId: resolved.providerId,
        profileId: resolved.profileId,
        reason: fallbackDecision.reason,
      });
    }
    stageCaps = fallbackDecision.caps;
  }

  // Resolve adapter after profile — lightModel is NOT injected into the
  // general resolution chain. Callers that need lightModel (reviewGate)
  // pass it explicitly via modelOverride.
  const registry = await getRuntimeRegistry();
  const adapter = registry.resolveRuntime(resolved.runtimeId);

  // Use transport-aware capabilities — adapters like Codex expose different
  // capabilities depending on the active transport (SDK vs CLI vs API).
  const capabilities = resolveAdapterCapabilities(adapter, resolved.transport);

  // Assert hard requirements, but exclude supportsAgentDefinitions —
  // promptPolicy handles fallback to slash commands when agent defs are unsupported.
  const hardRequired = workflow.requiredCapabilities.filter(
    (cap) => cap !== "supportsAgentDefinitions",
  );
  if (hardRequired.length > 0) {
    assertRuntimeCapabilities({
      runtimeId: resolved.runtimeId,
      workflowKind: workflow.workflowKind,
      capabilities,
      required: hardRequired,
      logger: {
        debug(context, message) {
          log.debug({ ...context }, `[runtime-capabilities] ${message}`);
        },
        warn(context, message) {
          log.warn({ ...context }, `WARN [runtime-capabilities] ${message}`);
        },
      },
    });
  }

  const promptPolicy = resolveRuntimePromptPolicy({
    runtimeId: resolved.runtimeId,
    capabilities,
    workflow,
    logger: {
      debug(context, message) {
        log.debug({ ...context }, `[runtime-workflow] ${message}`);
      },
      warn(context, message) {
        log.warn({ ...context }, `WARN [runtime-workflow] ${message}`);
      },
    },
  });

  // Review-stage subagents (review-sidecar, security-sidecar) must only audit
  // the current task's diff, not the full codebase. Inject the scope rule here
  // so every review-mode query gets it regardless of the agent definition file.
  const effectiveSystemPromptAppend =
    effective.profileMode === "review"
      ? `${promptPolicy.systemPromptAppend}\n\n${REVIEW_DIFF_SCOPE_SYSTEM_APPEND}`.trim()
      : promptPolicy.systemPromptAppend;
  const retryContext = task
    ? buildRetryContextForRuntimePrompt(task, getRetryContextThresholds(getEnv()))
    : null;
  const effectivePrompt =
    retryContext?.compacted === true
      ? `${retryContext.prompt}\n\n---\n\n${promptPolicy.prompt}`
      : promptPolicy.prompt;

  const canResume =
    workflow.sessionReusePolicy === "resume_if_available" && capabilities.supportsResume;
  const effectiveCanResume = canResume && retryContext?.compacted !== true;

  const profileLogContext = redactResolvedRuntimeProfile(resolved);
  log.info(
    {
      taskId: options.taskId,
      workflowKind: workflow.workflowKind,
      ...profileLogContext,
      usedFallbackSlashCommand: promptPolicy.usedFallbackSlashCommand,
      suppressModelFallback,
      canResume: effectiveCanResume,
      retryContextCompacted: retryContext?.compacted === true,
    },
    "Resolved runtime execution context for subagent query",
  );

  if (!resolved.apiKey && resolved.transport !== "cli") {
    log.warn(
      {
        taskId: options.taskId,
        runtimeId: resolved.runtimeId,
        apiKeyEnvVar: resolved.apiKeyEnvVar,
      },
      "Runtime execution resolved without API key; adapter may fail depending on provider setup",
    );
  }

  return {
    workflow,
    runtimeStage,
    runtimeId: resolved.runtimeId,
    providerId: resolved.providerId,
    profileId: resolved.profileId,
    transport: resolved.transport,
    capabilities,
    model: resolved.model,
    effort: pickEffort(resolved.options),
    headers: resolved.headers,
    options: {
      ...applyRuntimeStageCapsToAdapterOptions(
        {
          ...resolved.options,
          ...(options.adapterOptions ?? {}),
          ...(resolved.baseUrl ? { baseUrl: resolved.baseUrl } : {}),
          ...(resolved.apiKeyEnvVar ? { apiKeyEnvVar: resolved.apiKeyEnvVar } : {}),
          projectRoot: options.projectRoot,
        },
        stageCaps,
      ),
    },
    prompt: effectivePrompt,
    systemPromptAppend: effectiveSystemPromptAppend,
    agentDefinitionName: promptPolicy.agentDefinitionName,
    canResume: effectiveCanResume,
    retryContextCompacted: retryContext?.compacted === true,
    stageCaps,
  };
}

function buildExecutionIntent(
  options: SubagentQueryOptions,
  systemPromptAppend: string,
  agentDefinitionName: string | undefined,
  workflowMetadata: Record<string, unknown> | undefined,
  stageCaps: RuntimeStageCaps,
  stderr: (chunk: string) => void,
): import("@aif/runtime").RuntimeExecutionIntent {
  const env = getEnv();
  const bypassRequested = env.AGENT_BYPASS_PERMISSIONS;
  const explicitAbort =
    options.abortController ?? getActiveStageAbortController(options.taskId) ?? undefined;
  const task = findTaskById(options.taskId);
  const permissionIntent = isPermissionPolicyIntent(task?.taskIntent) ? task.taskIntent : "general";
  const permissionPolicy = getPermissionExecutionPolicy(permissionIntent);
  const bypassDecision = bypassRequested
    ? decidePolicyBypass({
        intent: permissionIntent,
        requestedMode: "danger_full_access",
        humanApprovalBridgeAvailable: true,
        humanApproved: true,
        reason: `AGENT_BYPASS_PERMISSIONS for ${permissionIntent}`,
      })
    : null;
  const bypassPermissions = bypassRequested && bypassDecision?.allowed === true;
  const allowedWritePaths = readAllowedWritePathsFromWorkflowMetadata(workflowMetadata);
  const auditReportArtifactPath = readAuditReportArtifactPathFromWorkflowMetadata(
    workflowMetadata,
    allowedWritePaths,
  );
  const auditArtifact =
    task && auditReportArtifactPath ? findRoadmapBatchArtifactByTaskId(task.id) : undefined;
  const auditReportAuditPlanId =
    task && auditReportArtifactPath
      ? auditArtifact?.batchId
        ? `batch:${auditArtifact.batchId}:task:${task.id}`
        : `task:${task.id}`
      : null;
  const auditReportEvidenceUnits =
    task && auditReportArtifactPath && auditReportAuditPlanId
      ? listAuditEvidenceEvents({ taskId: task.id, auditPlanId: auditReportAuditPlanId })
      : [];
  if (bypassPermissions && !task?.agentActivityLog?.includes("[permission-policy:bypass]")) {
    logActivity(
      options.taskId,
      "Agent",
      `[permission-policy:bypass] intent=${permissionIntent} defaultMode=${permissionPolicy.defaultMode}`,
    );
  }
  if (
    bypassRequested &&
    !bypassPermissions &&
    !task?.agentActivityLog?.includes("[permission-policy:bypass")
  ) {
    logActivity(
      options.taskId,
      "Agent",
      `[permission-policy:bypass-blocked] intent=${permissionIntent} defaultMode=${permissionPolicy.defaultMode} reason=${bypassDecision?.reasons.join(" ") ?? "not allowed"}`,
    );
  }
  const branchEnvironment: Record<string, string> = task?.branchName
    ? {
        HANDOFF_BRANCH_PREPARED: "1",
        HANDOFF_BRANCH_NAME: task.branchName,
      }
    : {};

  return {
    maxBudgetUsd: capNumber(options.maxBudgetUsd ?? null, stageCaps.maxBudgetUsd),
    maxTurns: capInteger(options.maxTurns, stageCaps.maxToolTurns),
    repositoryInspectionToolBudget: capInteger(
      options.repositoryInspectionToolBudget,
      stageCaps.repositoryInspectionToolBudget,
    ),
    repositoryInspectionBudgetFinalizationMode: options.repositoryInspectionBudgetFinalizationMode,
    startTimeoutMs: options.queryStartTimeoutMs ?? env.AGENT_QUERY_START_TIMEOUT_MS,
    startRetryDelayMs: options.queryStartRetryDelayMs ?? env.AGENT_QUERY_START_RETRY_DELAY_MS,
    runTimeoutMs:
      capInteger(options.runTimeoutMs ?? env.AGENT_STAGE_RUN_TIMEOUT_MS, stageCaps.wallClockMs) ??
      env.AGENT_STAGE_RUN_TIMEOUT_MS,
    includePartialMessages: options.includePartialMessages ?? false,
    agentDefinitionName,
    systemPromptAppend,
    bypassPermissions,
    permissionPolicy,
    ...(allowedWritePaths.length > 0 ? { allowedWritePaths } : {}),
    ...(task && auditReportArtifactPath
      ? {
          auditReportArtifactPath,
          auditReportTaskDescription: task.description ?? null,
          auditReportTaskId: task.id,
          auditReportRoadmapBatchId: auditArtifact?.batchId ?? null,
          auditReportRoadmapAlias: auditArtifact?.roadmapAlias ?? task.roadmapAlias ?? null,
          auditReportAuditPlanId,
          auditReportEvidenceUnits,
        }
      : {}),
    environment: {
      HANDOFF_MODE: "1",
      HANDOFF_TASK_ID: options.taskId,
      ...branchEnvironment,
      ...(options.skipReview ? { HANDOFF_SKIP_REVIEW: "1" } : {}),
    },
    abortController: explicitAbort,
    onStderr: stderr,
    onToolUse: (toolName, detail) => {
      logActivity(options.taskId, "Tool", `${toolName}${detail}`);
    },
    onSubagentStart: (name, id) => {
      const idSuffix = id ? ` (${id.slice(0, 8)})` : "";
      logActivity(options.taskId, "Subagent", `${name} started${idSuffix}`);
    },
    // Adapter-specific options — adapters read what they need, ignore the rest
    hooks: {
      _trustToken: RUNTIME_TRUST_TOKEN,
      settings: { attribution: { commit: "", pr: "" } },
      settingSources: ["project"],
      postToolUseHooks: [createAuditEvidenceLogger(options.taskId, options.projectRoot)],
    },
  };
}

function readAllowedWritePathsFromWorkflowMetadata(
  metadata: Record<string, unknown> | undefined,
): string[] {
  const raw = metadata?.allowedWritePaths;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const allowed: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) continue;
    if (normalized.split("/").includes("..")) continue;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      allowed.push(normalized);
    }
  }
  return allowed;
}

function normalizeWorkflowRelativePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null;
  if (normalized.split("/").includes("..")) return null;
  return normalized;
}

function readAuditReportArtifactPathFromWorkflowMetadata(
  metadata: Record<string, unknown> | undefined,
  allowedWritePaths: string[],
): string | null {
  const normalized = normalizeWorkflowRelativePath(metadata?.auditReportArtifactPath);
  if (!normalized) return null;
  if (allowedWritePaths.length > 0 && !allowedWritePaths.includes(normalized)) return null;
  return normalized;
}

/**
 * Execute a runtime-backed subagent query with standardized:
 * - heartbeat timer
 * - stderr collection
 * - audit logging
 * - activity logging
 * - token usage tracking
 * - error diagnosis
 */
export async function executeSubagentQuery(
  options: SubagentQueryOptions,
): Promise<SubagentQueryResult> {
  const { taskId, projectRoot, agentName } = options;
  const stderrCollector = createStderrCollector();
  const heartbeatTimer = startHeartbeat(taskId);

  let runtimeIdForError = getEnv().AIF_DEFAULT_RUNTIME_ID;
  let providerIdForError = getEnv().AIF_DEFAULT_PROVIDER_ID;
  let runtimeProfileIdForError: string | null = null;
  let workflowKindForError: string | null = null;
  let latestLimitSnapshot: RuntimeLimitSnapshot | null = null;
  let adapter: RuntimeAdapter | null = null;
  let watchdog: ReturnType<typeof createFirstActivityWatchdog> | null = null;
  let operatorCancelWatcher: NodeJS.Timeout | null = null;
  const runtimeUsageLimitsEnabled = getEnv().AIF_USAGE_LIMITS_ENABLED;

  try {
    const context = await resolveExecutionContext(options);
    runtimeIdForError = context.runtimeId;
    providerIdForError = context.providerId;
    runtimeProfileIdForError = context.profileId;
    workflowKindForError = context.workflow.workflowKind;
    const effortSuffix = context.effort ? `, effort=${context.effort}` : "";
    logActivity(
      taskId,
      "Agent",
      `${agentName} started (runtime=${context.runtimeId}, transport=${context.transport}, model=${context.model ?? "default"}${effortSuffix})`,
    );
    const existingSessionId = context.canResume ? getTaskSessionId(taskId) : null;
    const shouldResume = Boolean(existingSessionId && context.canResume);

    writeQueryAudit({
      timestamp: new Date().toISOString(),
      taskId,
      agentName,
      projectRoot,
      prompt: context.prompt,
      options: {
        runtimeId: context.runtimeId,
        providerId: context.providerId,
        profileId: context.profileId,
        workflowKind: context.workflow.workflowKind,
        model: context.model,
        systemPromptAppend: context.systemPromptAppend,
        maxBudgetUsd: options.maxBudgetUsd ?? null,
      },
    });

    const registry = await getRuntimeRegistry();
    adapter = registry.resolveRuntime(context.runtimeId);
    let warmupSourceSessionId: string | null = null;
    let warmupId: string | null = null;
    let usedWarmupFork = false;

    const logWarmupSkip = (skipReason: WarmupSkipReason) => {
      log.debug(
        {
          taskId,
          workflowKind: context.workflow.workflowKind,
          runtimeId: context.runtimeId,
          runtimeProfileId: context.profileId,
          runtimeStage: context.runtimeStage,
          transport: context.transport,
          model: context.model,
          skipReason,
        },
        "Skipping warmup fork",
      );
    };

    if (!getEnv().AIF_WARMUP_ENABLED) {
      logWarmupSkip("feature_disabled");
    } else if (context.retryContextCompacted) {
      logWarmupSkip("retry_context_compacted");
    } else if (!isWarmupWorkflowKind(context.workflow.workflowKind)) {
      logWarmupSkip("workflow_not_enabled");
    } else if (existingSessionId) {
      logWarmupSkip("existing_task_session");
    } else {
      const forkSupport = checkRuntimeSessionForkSupport({
        runtimeId: context.runtimeId,
        transport: context.transport,
        capabilities: context.capabilities,
        hasForkSessionMethod: typeof adapter.forkSession === "function",
        sourceSessionId: "__warmup_probe__",
        logger: {
          debug(runtimeContext, message) {
            log.debug({ taskId, ...runtimeContext }, `[runtime-warmup] ${message}`);
          },
          warn(runtimeContext, message) {
            log.warn({ taskId, ...runtimeContext }, `WARN [runtime-warmup] ${message}`);
          },
        },
      });
      if (!forkSupport.ok) {
        logWarmupSkip(
          forkSupport.skipReason === "missing_adapter_method"
            ? "missing_adapter_method"
            : "unsupported_runtime",
        );
      } else {
        const expiredCount = expireStaleRuntimeWarmupSessions();
        const projectId = findTaskById(taskId)?.projectId ?? null;
        const warmup =
          projectId == null
            ? undefined
            : findActiveReadyRuntimeWarmupSession({
                projectId,
                runtimeProfileId: context.profileId,
                runtimeId: context.runtimeId,
                providerId: context.providerId,
                transport: context.transport,
                model: context.model,
                stage: context.runtimeStage,
              });
        if (!warmup?.sourceSessionId) {
          logWarmupSkip(expiredCount > 0 ? "expired" : "runtime_mismatch");
        } else {
          warmupSourceSessionId = warmup.sourceSessionId;
          warmupId = warmup.id;
          log.info(
            {
              taskId,
              warmupId,
              runtimeId: context.runtimeId,
              runtimeProfileId: context.profileId,
              runtimeStage: context.runtimeStage,
              sourceSessionIdSuffix: sessionIdSuffix(warmupSourceSessionId),
            },
            "Warmup fork selected",
          );
        }
      }
    }

    // First-activity watchdog requires a transport that surfaces incremental
    // runtime activity in real time. SDK / CLI adapters emit RuntimeEvent
    // callbacks for streamed text, reasoning, and tool summaries, so any such
    // event proves the runtime is alive even if the workflow performs no tool
    // calls. API transport is pure HTTP — no intermediate events — and must
    // stay disabled.
    //
    // CLI gets a 2x buffer over SDK because it carries extra cold-start cost
    // the SDK path doesn't have: binary spawn (~1-3s) and the initial
    // system/init exchange with the full tool/MCP catalogue. Without the
    // buffer, slow first-turn startup on CLI can false-positive the watchdog.
    const baseFirstActivityTimeoutMs = getEnv().AGENT_FIRST_ACTIVITY_TIMEOUT_MS;
    const firstActivityTimeoutMs =
      context.transport === "api"
        ? 0
        : context.transport === "cli"
          ? baseFirstActivityTimeoutMs * 2
          : baseFirstActivityTimeoutMs;
    const firstActivityMaxRetries =
      context.stageCaps.retryCount === undefined
        ? FIRST_ACTIVITY_MAX_RETRIES
        : Math.min(
            FIRST_ACTIVITY_MAX_RETRIES,
            Math.max(0, Math.floor(context.stageCaps.retryCount)),
          );
    let result: Awaited<ReturnType<RuntimeAdapter["run"]>> | undefined;

    // Retry loop: if agent stalls (no runtime activity after start), kill and restart
    for (let attempt = 0; attempt <= firstActivityMaxRetries; attempt++) {
      latestLimitSnapshot = null;
      // Fresh AbortController per attempt — AbortController is single-use
      const attemptAbort = new AbortController();
      operatorCancelWatcher = startOperatorCancelWatcher(taskId, attemptAbort);
      // Chain to the external abort if provided (stage timeout, shutdown)
      const externalAbort =
        options.abortController ?? getActiveStageAbortController(taskId) ?? undefined;
      if (externalAbort?.signal.aborted) {
        attemptAbort.abort(externalAbort.signal.reason);
      } else {
        externalAbort?.signal.addEventListener(
          "abort",
          () => attemptAbort.abort(externalAbort.signal.reason),
          { once: true },
        );
      }

      const executionIntent = buildExecutionIntent(
        options,
        context.systemPromptAppend,
        context.agentDefinitionName,
        context.workflow.metadata,
        context.stageCaps,
        stderrCollector.onStderr,
      );
      // Override the abort controller with our per-attempt one
      executionIntent.abortController = attemptAbort;
      // API transport is pure HTTP — no incremental stream — so the
      // start-timeout watchdog has nothing to observe and must stay off.
      // SDK streams in-process and CLI now streams JSONL events (system/init
      // arrives in the first few hundred ms), so both tolerate start timeout.
      if (context.transport === "api") {
        executionIntent.startTimeoutMs = 0;
      }

      // Set up first-activity watchdog for this attempt
      watchdog = createFirstActivityWatchdog(firstActivityTimeoutMs, attemptAbort, () => {
        const timeoutSec = Math.round(firstActivityTimeoutMs / 1000);
        logActivity(
          taskId,
          "Agent",
          `${agentName} stalled — no runtime activity within ${timeoutSec}s after start (attempt ${attempt + 1}/${firstActivityMaxRetries + 1}), restarting`,
        );
        log.warn(
          { taskId, agentName, firstActivityTimeoutMs, attempt: attempt + 1 },
          "First-activity watchdog triggered: killing and restarting agent",
        );
      });

      // Install an onEvent bridge even when the caller did not request
      // streamed events directly: the watchdog needs a callback to observe
      // runtime activity for tool-less workflows such as checklist sync.
      const wd = watchdog!;
      const originalOnEvent = executionIntent.onEvent ?? (() => undefined);
      const originalOnToolUse = executionIntent.onToolUse;
      const originalOnSubagentStart = executionIntent.onSubagentStart;
      executionIntent.onEvent = (event) => {
        wd.markActivity();
        if (event.type === AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE) {
          persistAuditEvidencePayload(
            taskId,
            projectRoot,
            event.data?.auditEvidence ?? event.data?.evidenceUnit,
          );
        }
        if (event.type === "repeated_tool_loop_blocked") {
          const data = event.data && typeof event.data === "object" ? event.data : {};
          const stage = typeof data.stage === "string" ? data.stage : context.runtimeStage;
          const tool =
            typeof data.toolName === "string"
              ? data.toolName
              : typeof data.tool === "string"
                ? data.tool
                : "unknown_tool";
          const limit =
            typeof data.repeatedToolCallLimit === "number" &&
            Number.isFinite(data.repeatedToolCallLimit)
              ? Math.floor(data.repeatedToolCallLimit)
              : "unknown";
          const fingerprint = typeof data.fingerprint === "string" ? data.fingerprint : "unknown";
          logActivity(
            taskId,
            "Agent",
            `repeated_tool_loop_blocked: stage=${stage}; tool=${tool}; limit=${limit}; fingerprint=${fingerprint}`,
          );
        }
        if (runtimeUsageLimitsEnabled) {
          latestLimitSnapshot = observeRuntimeLimitEvent(event, latestLimitSnapshot, {
            logger: log,
            observedMessage: "Observed runtime limit event during subagent execution",
            malformedMessage: "Dropped runtime limit event with malformed snapshot payload",
            logContext: {
              taskId,
              runtimeId: context.runtimeId,
              runtimeProfileId: context.profileId,
              workflowKind: context.workflow.workflowKind,
              attempt: attempt + 1,
            },
          });
        }
        originalOnEvent(event);
      };
      if (originalOnToolUse) {
        executionIntent.onToolUse = (toolName, detail) => {
          wd.markActivity();
          originalOnToolUse(toolName, detail);
        };
      }
      if (originalOnSubagentStart) {
        executionIntent.onSubagentStart = (name, id) => {
          wd.markActivity();
          originalOnSubagentStart(name, id);
        };
      }

      // Look up project scope fresh per attempt so a retry that sees a
      // re-parented task still records against the correct project.
      const projectIdForUsage = findTaskById(taskId)?.projectId ?? null;

      const runInput = {
        runtimeId: context.runtimeId,
        providerId: context.providerId,
        profileId: context.profileId,
        workflowKind: context.workflow.workflowKind,
        transport: context.transport,
        prompt: context.prompt,
        model: context.model ?? undefined,
        sessionId: existingSessionId,
        resume: shouldResume,
        projectRoot,
        cwd: projectRoot,
        headers: context.headers,
        options: context.options,
        execution: executionIntent,
        usageContext: {
          source: UsageSource.SUBAGENT,
          projectId: projectIdForUsage,
          taskId,
        },
      } as const;

      try {
        if (warmupSourceSessionId && adapter.forkSession) {
          result = await adapter.forkSession({
            ...runInput,
            sourceSessionId: warmupSourceSessionId,
          });
          usedWarmupFork = true;
        } else {
          result =
            shouldResume && adapter.resume
              ? await adapter.resume({ ...runInput, sessionId: existingSessionId as string })
              : await adapter.run(runInput);
        }
        // Success — break out of retry loop
        watchdog.clear();
        clearOperatorCancelWatcher(operatorCancelWatcher);
        operatorCancelWatcher = null;
        break;
      } catch (err) {
        const stalledByWatchdog = watchdog.didFire;
        watchdog.clear();
        clearOperatorCancelWatcher(operatorCancelWatcher);
        operatorCancelWatcher = null;
        if (stalledByWatchdog && attempt < firstActivityMaxRetries) {
          // Agent stalled — kill and retry
          log.info(
            { taskId, agentName, attempt: attempt + 1, maxRetries: firstActivityMaxRetries },
            "Restarting agent after first-activity stall",
          );
          continue;
        }
        // Not a stall or retries exhausted — re-throw
        throw err;
      }
    }

    if (!result) {
      throw new Error(
        `${agentName}: all ${firstActivityMaxRetries + 1} attempts stalled without runtime activity`,
      );
    }

    if (runtimeUsageLimitsEnabled) {
      latestLimitSnapshot = extractLatestRuntimeLimitSnapshot(result.events) ?? latestLimitSnapshot;
      if (latestLimitSnapshot) {
        refreshRuntimeProfileLimitState({
          runtimeProfileId: context.profileId,
          runtimeId: context.runtimeId,
          providerId: context.providerId,
          snapshot: latestLimitSnapshot,
          taskId,
          workflowKind: context.workflow.workflowKind,
          reason: "subagent:success",
        });
      } else {
        log.debug(
          {
            taskId,
            runtimeProfileId: context.profileId,
            runtimeId: context.runtimeId,
            providerId: context.providerId,
            workflowKind: context.workflow.workflowKind,
          },
          "Preserving runtime limit state after successful subagent execution without an authoritative recovery signal",
        );
      }
    }

    const runtimeSessionId = getResultSessionId(result, context.capabilities);
    if (runtimeSessionId && (context.canResume || usedWarmupFork)) {
      saveTaskSessionId(taskId, runtimeSessionId);
      log.debug(
        {
          taskId,
          agentName,
          runtimeSessionIdSuffix: sessionIdSuffix(runtimeSessionId),
          usedWarmupFork,
          warmupId,
        },
        "Captured runtime session ID",
      );
      if (usedWarmupFork) {
        log.info(
          {
            taskId,
            warmupId,
            runtimeId: context.runtimeId,
            runtimeProfileId: context.profileId,
            childSessionIdSuffix: sessionIdSuffix(runtimeSessionId),
          },
          "Warmup fork succeeded",
        );
      }
    } else if (runtimeSessionId) {
      log.debug(
        {
          taskId,
          agentName,
          runtimeSessionId,
          sessionReusePolicy: context.workflow.sessionReusePolicy,
        },
        "Skipped runtime session persistence for non-resumable workflow",
      );
    }

    // Usage is recorded automatically by the registry wrapper via the DB
    // usage sink (see packages/data createDbUsageSink + packages/runtime
    // registry.wrapAdapter). No manual increment needed here.

    const resultText = result.outputText ?? "";

    log.info(
      {
        taskId,
        agentName,
        runtimeId: context.runtimeId,
        profileId: context.profileId,
        model: context.model,
        resumed: shouldResume,
      },
      "Subagent query completed successfully",
    );
    logActivity(
      taskId,
      "Agent",
      `${agentName} complete (runtime=${context.runtimeId}, transport=${context.transport}, model=${context.model ?? "default"}${effortSuffix})`,
    );

    return { resultText };
  } catch (error) {
    if (runtimeUsageLimitsEnabled) {
      refreshRuntimeProfileLimitState({
        runtimeProfileId: runtimeProfileIdForError,
        runtimeId: runtimeIdForError,
        providerId: providerIdForError,
        snapshot: extractRuntimeLimitSnapshotFromError(error),
        clearOnMissing: false,
        taskId,
        workflowKind: workflowKindForError,
        reason: "subagent:error",
      });
    }
    const safeReason = mapSafeRuntimeErrorReason(error);
    let diagnosticsReason: string | null = null;
    if (adapter?.diagnoseError) {
      diagnosticsReason = await adapter.diagnoseError({
        error,
        stderrTail: stderrCollector.getTail(),
        projectRoot,
      });
    } else {
      diagnosticsReason = error instanceof Error ? error.message : String(error);
    }
    if (
      diagnosticsReason &&
      diagnosticsReason.trim().length > 0 &&
      diagnosticsReason.trim() !== safeReason.reason
    ) {
      log.debug(
        {
          taskId,
          runtimeId: runtimeIdForError,
          category: safeReason.category,
          diagnosticsReason: redactProviderTextForLogs(diagnosticsReason),
        },
        "Redacted runtime diagnostics before writing task activity",
      );
    }
    logActivity(
      taskId,
      "Agent",
      `${agentName} failed (runtime=${runtimeIdForError}) — ${safeReason.reason}`,
    );
    log.error(
      {
        taskId,
        runtimeId: runtimeIdForError,
        category: safeReason.category,
        errorName: error instanceof Error ? error.name : typeof error,
        diagnosticsReason:
          diagnosticsReason && diagnosticsReason.trim().length > 0
            ? redactProviderTextForLogs(diagnosticsReason)
            : null,
        runtimeStderr: redactProviderTextForLogs(stderrCollector.getTail()),
      },
      `${agentName} execution failed`,
    );
    throw buildSanitizedSubagentError(error, safeReason, providerIdForError);
  } finally {
    try {
      watchdog?.clear();
    } catch {
      // safety guard
    }
    try {
      clearOperatorCancelWatcher(operatorCancelWatcher);
    } catch {
      // safety guard
    }
    try {
      clearInterval(heartbeatTimer);
    } catch {
      // safety guard
    }
  }
}

// Coordinator ID injected at startup to avoid circular imports
let _coordinatorId: string | null = null;
export function setCoordinatorId(id: string): void {
  _coordinatorId = id;
}

/** Start a periodic heartbeat that updates the task's lastHeartbeatAt and renews the lock. */
export function startHeartbeat(taskId: string): NodeJS.Timeout {
  return setInterval(() => {
    updateTaskHeartbeat(taskId);
    if (_coordinatorId) {
      renewTaskClaim(taskId, _coordinatorId, getLockRenewalMs());
    }
  }, HEARTBEAT_INTERVAL_MS);
}
