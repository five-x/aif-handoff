import { Hono } from "hono";
import { z } from "zod";
import {
  buildCodexAuthFingerprint,
  createRuntimeWorkflowSpec,
  getCodexAuthIdentity,
  isValidEnvVarName,
  redactResolvedRuntimeProfile,
  resolveClaudeProviderIdentity,
  resolveRuntimeProfile,
  RuntimeTransport,
} from "@aif/runtime";
import {
  getEnv,
  findSecretLikeKeys,
  isQwenLocalRuntimeProfile,
  logger,
  normalizeRuntimeLimitSnapshot,
  summarizeRuntimeProfileForAudit,
  type RuntimeLimitSnapshot,
} from "@aif/shared";
import {
  createRuntimeProfile,
  appendConfigAuditEvent,
  deleteRuntimeProfile,
  findRuntimeProfileById,
  findProjectById,
  findTaskById,
  getRuntimeProfileResponseById,
  listRuntimeProfileResponses,
  getAppDefaultRuntimeProfileId,
  resolveEffectiveRuntimeProfile,
  toRuntimeProfileResponse,
  updateRuntimeProfile,
} from "@aif/data";
import {
  createRuntimeProfileSchema,
  runtimeProfileListQuerySchema,
  runtimeProfileModelsSchema,
  runtimeProfileValidationSchema,
  updateRuntimeProfileSchema,
} from "../schemas.js";
import { getApiRuntimeModelDiscoveryService, getApiRuntimeRegistry } from "../services/runtime.js";
import { resolveCachedCodexOverlaySnapshot } from "../services/codexOverlayCache.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { jsonValidator, queryValidator } from "../middleware/zodValidator.js";
import { broadcast } from "../ws.js";

const log = logger("runtime-profile-route");

const validationRateLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });
const mutationRateLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

const canaryPassVerdictSchema = z.enum([
  "pass",
  "test_pass",
  "review_pass",
  "TEST PASS",
  "REVIEW PASS",
]);
const canaryChangedFileSchema = z
  .string()
  .min(1)
  .max(300)
  .refine(
    (value) =>
      !value.includes("\0") &&
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !/^[A-Za-z]:[\\/]/.test(value) &&
      !value.split(/[\\/]+/).includes(".."),
    "changedFiles must contain relative repository paths",
  );

const implementerCanaryEvidenceSchema = z
  .object({
    operator: z.string().trim().min(1).max(200).optional(),
    canaryId: z.string().trim().min(1).max(120).optional(),
    runtimeStage: z.literal("implementer").optional(),
    profileId: z.string().trim().min(1).optional(),
    runtimeId: z.string().trim().min(1).max(100).optional(),
    providerId: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(300).optional(),
    endpoint: z.string().trim().min(1).max(1000).optional(),
    wallClockMs: z.number().int().positive().max(3_600_000),
    toolTurns: z.number().int().positive().max(500),
    repeatedToolCalls: z.number().int().min(0).max(50),
    repeatedToolCallLimit: z.number().int().positive().max(20),
    maxToolTurns: z.number().int().positive().max(500),
    timeoutMs: z.number().int().positive().max(3_600_000),
    wallClockTimeoutMs: z.number().int().positive().max(3_600_000).optional(),
    maxOutput: z.number().int().positive().max(200_000).optional(),
    verificationCommand: z.string().trim().min(1).max(300),
    verificationExitCode: z.literal(0),
    changedFiles: z.array(canaryChangedFileSchema).min(1).max(50),
    toolUseObserved: z.literal(true),
    testVerdict: canaryPassVerdictSchema,
    reviewVerdict: canaryPassVerdictSchema,
    summary: z.string().trim().min(10).max(1000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.toolTurns > value.maxToolTurns) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toolTurns"],
        message: "toolTurns must not exceed maxToolTurns",
      });
    }
    if (value.repeatedToolCalls > value.repeatedToolCallLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repeatedToolCalls"],
        message: "repeatedToolCalls must not exceed repeatedToolCallLimit",
      });
    }
    const wallClockLimit = value.wallClockTimeoutMs ?? value.timeoutMs;
    if (value.wallClockMs > wallClockLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["wallClockMs"],
        message: "wallClockMs must not exceed the configured wall-clock limit",
      });
    }
  });

export const runtimeProfilesRouter = new Hono();
type CreateRuntimeProfilePayload = z.infer<typeof createRuntimeProfileSchema>;
type UpdateRuntimeProfilePayload = z.infer<typeof updateRuntimeProfileSchema>;
type RuntimeProfileValidationPayload = z.infer<typeof runtimeProfileValidationSchema>;
type RuntimeProfileModelsPayload = z.infer<typeof runtimeProfileModelsSchema>;
type ImplementerCanaryEvidencePayload = z.infer<typeof implementerCanaryEvidenceSchema>;

const ALLOWED_HEADER_PREFIXES = [
  "content-",
  "accept",
  "x-request-id",
  "x-correlation-id",
  "x-trace-id",
  "user-agent",
  "cache-control",
  "if-",
];

function listSensitiveHeaderKeys(headers: Record<string, string> | undefined): string[] {
  if (!headers) return [];
  return Object.keys(headers).filter((key) => {
    const lowered = key.toLowerCase();
    return !ALLOWED_HEADER_PREFIXES.some(
      (prefix) => lowered === prefix || lowered.startsWith(prefix),
    );
  });
}

function inferApiKeyEnvVar(profile: {
  runtimeId: string;
  providerId: string;
  apiKeyEnvVar?: string | null;
}): string {
  const explicitEnvVar = profile.apiKeyEnvVar?.trim();
  if (isValidEnvVarName(explicitEnvVar)) return explicitEnvVar;
  if (explicitEnvVar) {
    log.warn(
      {
        runtimeId: profile.runtimeId,
        providerId: profile.providerId,
        invalidApiKeyEnvVar: explicitEnvVar,
      },
      "WARN [runtime-profile-route] Invalid apiKeyEnvVar provided for temporary validation key; using inferred fallback",
    );
  }

  // Delegate provider-specific logic to the resolution layer via a lightweight resolve pass.
  const resolved = resolveRuntimeProfile({
    source: "api-key-inference",
    profile: { runtimeId: profile.runtimeId, providerId: profile.providerId },
    fallbackRuntimeId: profile.runtimeId,
    fallbackProviderId: profile.providerId,
  });
  return resolved.apiKeyEnvVar ?? "OPENAI_API_KEY";
}

function sanitizeBooleanQuery(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readImplementerCapabilityFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const record = isObjectRecord(value) ? value : {};
  for (const key of ["enabled", "allowed", "capable"] as const) {
    if (typeof record[key] === "boolean") return record[key];
  }
  return null;
}

function listDisallowedQwenImplementerOptionPaths(input: {
  id?: string | null;
  runtimeId: string;
  providerId: string;
  options?: Record<string, unknown> | null;
}): string[] {
  if (
    !isQwenLocalRuntimeProfile({
      id: input.id ?? "pending-runtime-profile",
      runtimeId: input.runtimeId,
      providerId: input.providerId,
      options: input.options ?? {},
    })
  ) {
    return [];
  }

  const options = input.options ?? {};
  const paths: string[] = [];
  const stageCapabilities = isObjectRecord(options.stageCapabilities)
    ? options.stageCapabilities
    : {};
  if (readImplementerCapabilityFlag(stageCapabilities.implementer) === true) {
    paths.push("options.stageCapabilities.implementer");
  }

  const qwenOptions = isObjectRecord(options.qwenLocalAgent) ? options.qwenLocalAgent : {};
  for (const key of [
    "allowImplementation",
    "implementationEnabled",
    "implementationCapable",
    "implementationCanaryPassed",
  ] as const) {
    if (qwenOptions[key] === true) {
      paths.push(`options.qwenLocalAgent.${key}`);
    }
  }

  const implementationCanary = isObjectRecord(qwenOptions.implementationCanary)
    ? qwenOptions.implementationCanary
    : {};
  if (implementationCanary.passed === true) {
    paths.push("options.qwenLocalAgent.implementationCanary");
  }

  const canaryOptions = isObjectRecord(options.canary) ? options.canary : {};
  const legacyImplementationCanary = isObjectRecord(canaryOptions.implementation)
    ? canaryOptions.implementation
    : {};
  if (isObjectRecord(legacyImplementationCanary) && legacyImplementationCanary.passed === true) {
    paths.push("options.canary.implementation");
  }

  return paths;
}

function stripQwenImplementationBypassFlags(
  options: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...options };
  const qwenOptions = isObjectRecord(next.qwenLocalAgent) ? { ...next.qwenLocalAgent } : {};
  delete qwenOptions.allowImplementation;
  delete qwenOptions.implementationEnabled;
  delete qwenOptions.implementationCapable;
  delete qwenOptions.implementationCanaryPassed;
  next.qwenLocalAgent = qwenOptions;
  return next;
}

function normalizeCanaryVerdict(
  value: ImplementerCanaryEvidencePayload["testVerdict"],
  defaultPassVerdict: "TEST PASS" | "REVIEW PASS",
): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, "_");
  if (normalized === "review_pass") return "REVIEW PASS";
  if (normalized === "test_pass") return "TEST PASS";
  if (normalized === "pass") return defaultPassVerdict;
  return "TEST PASS";
}

function buildImplementerCanaryRecord(input: {
  id: string;
  profile: ReturnType<typeof toRuntimeProfileResponse>;
  evidence: ImplementerCanaryEvidencePayload;
}): Record<string, unknown> {
  const evidence = input.evidence;
  return {
    passed: true,
    source: "structured_evidence",
    canaryId: evidence.canaryId ?? crypto.randomUUID(),
    passedAt: new Date().toISOString(),
    operator: evidence.operator ?? "api",
    runtimeStage: "implementer",
    profileId: input.id,
    runtimeId: input.profile.runtimeId,
    providerId: input.profile.providerId,
    model: evidence.model ?? input.profile.defaultModel ?? null,
    endpoint: evidence.endpoint ?? input.profile.baseUrl ?? null,
    wallClockMs: evidence.wallClockMs,
    toolTurns: evidence.toolTurns,
    repeatedToolCalls: evidence.repeatedToolCalls,
    repeatedToolCallLimit: evidence.repeatedToolCallLimit,
    maxToolTurns: evidence.maxToolTurns,
    timeoutMs: evidence.timeoutMs,
    wallClockTimeoutMs: evidence.wallClockTimeoutMs ?? evidence.timeoutMs,
    maxOutput: evidence.maxOutput ?? null,
    verificationCommand: evidence.verificationCommand,
    verificationExitCode: evidence.verificationExitCode,
    changedFiles: evidence.changedFiles,
    toolUseObserved: evidence.toolUseObserved,
    testVerdict: normalizeCanaryVerdict(evidence.testVerdict, "TEST PASS"),
    reviewVerdict: normalizeCanaryVerdict(evidence.reviewVerdict, "REVIEW PASS"),
    summary: evidence.summary,
  };
}

function isLocalCodexProfile(profile: { runtimeId: string; transport?: string | null }): boolean {
  return profile.runtimeId === "codex"
    ? profile.transport === RuntimeTransport.SDK ||
        profile.transport === RuntimeTransport.CLI ||
        profile.transport === RuntimeTransport.APP_SERVER
    : false;
}

function isClaudeProfile(profile: { runtimeId: string }): boolean {
  return profile.runtimeId === "claude";
}

function readProviderMetaString(
  providerMeta: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = providerMeta?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

interface LocalCodexAccountProfileLike {
  id: string;
  projectId?: string | null;
  runtimeId: string;
  providerId: string;
  transport?: string | null;
  defaultModel?: string | null;
  runtimeLimitSnapshot?: RuntimeLimitSnapshot | null;
  runtimeLimitUpdatedAt?: string | null;
}

interface ClaudeIdentityProfileLike {
  runtimeId: string;
  providerId: string;
  transport?: string | null;
  baseUrl?: string | null;
  apiKeyEnvVar?: string | null;
  defaultModel?: string | null;
  runtimeLimitSnapshot?: RuntimeLimitSnapshot | null;
}

function enrichProfileWithCodexIdentity<T extends LocalCodexAccountProfileLike>(
  profile: T,
  identity: Awaited<ReturnType<typeof getCodexAuthIdentity>>,
): T {
  if (!isLocalCodexProfile(profile) || !profile.runtimeLimitSnapshot || !identity) {
    return profile;
  }

  const snapshot = profile.runtimeLimitSnapshot;
  const providerMeta = isObjectRecord(snapshot.providerMeta) ? snapshot.providerMeta : {};
  const nextProviderMeta = {
    ...providerMeta,
    ...(readProviderMetaString(providerMeta, "accountId") ? {} : { accountId: identity.accountId }),
    ...(readProviderMetaString(providerMeta, "authMode") ? {} : { authMode: identity.authMode }),
    ...(readProviderMetaString(providerMeta, "accountName")
      ? {}
      : { accountName: identity.accountName }),
    ...(readProviderMetaString(providerMeta, "accountEmail")
      ? {}
      : { accountEmail: identity.accountEmail }),
    ...(readProviderMetaString(providerMeta, "planType") ? {} : { planType: identity.planType }),
  };

  return {
    ...profile,
    runtimeLimitSnapshot: normalizeRuntimeLimitSnapshot({
      ...snapshot,
      providerMeta: nextProviderMeta,
    }),
  };
}

async function enrichProfilesWithCodexIdentity<T extends LocalCodexAccountProfileLike>(
  profiles: T[],
): Promise<T[]> {
  if (!profiles.some((profile) => isLocalCodexProfile(profile) && profile.runtimeLimitSnapshot)) {
    return profiles;
  }

  const identity = await getCodexAuthIdentity();
  if (!identity) {
    return profiles;
  }

  return profiles.map((profile) => enrichProfileWithCodexIdentity(profile, identity));
}

function parseTimestampMs(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function applyCodexSnapshotToProfile<T extends RuntimeLimitSnapshot>(
  snapshot: T,
  profileId: string,
): T {
  const nextSnapshot = snapshot.profileId === profileId ? snapshot : { ...snapshot, profileId };
  return normalizeRuntimeLimitSnapshot(nextSnapshot) as unknown as T;
}

function createCodexIndexedSnapshotLookup() {
  let authFingerprintPromise: Promise<string | null> | null = null;

  const readAuthFingerprint = async (): Promise<string | null> => {
    if (!authFingerprintPromise) {
      authFingerprintPromise = getCodexAuthIdentity().then((identity) =>
        buildCodexAuthFingerprint(identity),
      );
    }
    return await authFingerprintPromise;
  };

  return {
    async resolveAccountFingerprint(profile: LocalCodexAccountProfileLike): Promise<string | null> {
      const providerMeta = isObjectRecord(profile.runtimeLimitSnapshot?.providerMeta)
        ? profile.runtimeLimitSnapshot?.providerMeta
        : null;
      const embeddedFingerprint = readProviderMetaString(providerMeta, "accountFingerprint");
      if (embeddedFingerprint) {
        return embeddedFingerprint;
      }
      return await readAuthFingerprint();
    },
    getSelected(input: {
      accountFingerprint: string;
      projectRoot?: string | null;
      preferredLimitId?: string | null;
      model?: string | null;
    }): RuntimeLimitSnapshot | null {
      return resolveCachedCodexOverlaySnapshot({
        accountFingerprint: input.accountFingerprint,
        projectRoot: input.projectRoot ?? null,
        preferredLimitId: input.preferredLimitId ?? null,
        model: input.model ?? null,
      });
    },
  };
}

async function refreshProfileWithIndexedCodexLimit<T extends LocalCodexAccountProfileLike>(
  profile: T,
  selectedProjectId?: string | null,
  snapshotLookup = createCodexIndexedSnapshotLookup(),
): Promise<T> {
  // Usage-limits feature is the expensive-I/O path (Codex session scan,
  // Claude identity network call). Gate here so a deployment can opt out
  // via AIF_USAGE_LIMITS_ENABLED=false and skip all associated work.
  if (!getEnv().AIF_USAGE_LIMITS_ENABLED) {
    return profile;
  }

  if (!isLocalCodexProfile(profile)) {
    return profile;
  }

  const model = profile.defaultModel?.trim() ?? null;
  if (!model) {
    return profile;
  }

  const effectiveProjectId = profile.projectId ?? selectedProjectId ?? null;
  const projectRoot = effectiveProjectId
    ? (findProjectById(effectiveProjectId)?.rootPath ?? null)
    : null;
  const persistedProviderMeta = isObjectRecord(profile.runtimeLimitSnapshot?.providerMeta)
    ? profile.runtimeLimitSnapshot.providerMeta
    : null;
  const persistedLimitId = readProviderMetaString(persistedProviderMeta, "limitId");
  const accountFingerprint = await snapshotLookup.resolveAccountFingerprint(profile);
  if (!accountFingerprint) {
    log.debug(
      {
        profileId: profile.id,
        projectId: effectiveProjectId,
        projectRoot,
      },
      "[runtime-profile-route] Skipping indexed Codex overlay because no account fingerprint is available",
    );
    return profile;
  }

  const selectedSnapshot = snapshotLookup.getSelected({
    accountFingerprint,
    projectRoot,
    preferredLimitId: persistedLimitId,
    model,
  });
  if (!selectedSnapshot) {
    log.debug(
      {
        profileId: profile.id,
        projectId: effectiveProjectId,
        projectRoot,
      },
      "[runtime-profile-route] No indexed Codex overlay snapshot selected for profile",
    );
    return profile;
  }

  const persistedAtMs = Math.max(
    parseTimestampMs(profile.runtimeLimitUpdatedAt ?? null),
    parseTimestampMs(profile.runtimeLimitSnapshot?.checkedAt ?? null),
  );
  const indexedCheckedAtMs = parseTimestampMs(selectedSnapshot.checkedAt);
  log.debug(
    {
      profileId: profile.id,
      projectId: effectiveProjectId,
      projectRoot,
      persistedAtMs: Number.isFinite(persistedAtMs) ? persistedAtMs : null,
      indexedCheckedAtMs: Number.isFinite(indexedCheckedAtMs) ? indexedCheckedAtMs : null,
    },
    "[runtime-profile-route] Evaluated indexed Codex overlay snapshot freshness",
  );
  if (persistedAtMs > indexedCheckedAtMs) {
    return profile;
  }

  return {
    ...profile,
    runtimeLimitSnapshot: applyCodexSnapshotToProfile(selectedSnapshot, profile.id),
    runtimeLimitUpdatedAt: selectedSnapshot.checkedAt,
  };
}

async function refreshProfilesWithIndexedCodexLimits<T extends LocalCodexAccountProfileLike>(
  profiles: T[],
  selectedProjectId?: string | null,
): Promise<T[]> {
  if (!getEnv().AIF_USAGE_LIMITS_ENABLED) {
    return profiles;
  }
  const snapshotLookup = createCodexIndexedSnapshotLookup();
  return await Promise.all(
    profiles.map((profile) =>
      refreshProfileWithIndexedCodexLimit(profile, selectedProjectId, snapshotLookup),
    ),
  );
}

async function enrichProfileWithClaudeIdentity<T extends ClaudeIdentityProfileLike>(
  profile: T,
): Promise<T> {
  if (!getEnv().AIF_USAGE_LIMITS_ENABLED) {
    return profile;
  }
  if (!isClaudeProfile(profile) || !profile.runtimeLimitSnapshot) {
    return profile;
  }

  const identity = await resolveClaudeProviderIdentity({
    providerId: profile.providerId,
    transport: profile.transport ?? null,
    baseUrl: profile.baseUrl ?? null,
    apiKeyEnvVar: profile.apiKeyEnvVar ?? null,
    defaultModel: profile.defaultModel ?? null,
    env: process.env,
  });
  const snapshot = profile.runtimeLimitSnapshot;
  const providerMeta = isObjectRecord(snapshot.providerMeta) ? snapshot.providerMeta : {};
  const nextProviderMeta = {
    ...providerMeta,
    ...(readProviderMetaString(providerMeta, "providerFamily")
      ? {}
      : { providerFamily: identity.providerFamily }),
    ...(readProviderMetaString(providerMeta, "providerLabel")
      ? {}
      : { providerLabel: identity.providerLabel }),
    ...(readProviderMetaString(providerMeta, "quotaSource")
      ? {}
      : { quotaSource: identity.quotaSource }),
    ...(readProviderMetaString(providerMeta, "accountFingerprint")
      ? {}
      : { accountFingerprint: identity.accountFingerprint }),
    ...(readProviderMetaString(providerMeta, "accountLabel")
      ? {}
      : { accountLabel: identity.accountLabel }),
  };

  return {
    ...profile,
    runtimeLimitSnapshot: normalizeRuntimeLimitSnapshot({
      ...snapshot,
      providerMeta: nextProviderMeta,
    }),
  };
}

async function enrichProfilesWithProviderIdentity<
  T extends LocalCodexAccountProfileLike & ClaudeIdentityProfileLike,
>(profiles: T[]): Promise<T[]> {
  if (!getEnv().AIF_USAGE_LIMITS_ENABLED) {
    return profiles;
  }
  const withCodexIdentity = await enrichProfilesWithCodexIdentity(profiles);
  return await Promise.all(
    withCodexIdentity.map((profile) => enrichProfileWithClaudeIdentity(profile)),
  );
}

function compareVisibleRuntimeProfiles(
  left: { id: string; projectId: string | null; createdAt: string },
  right: { id: string; projectId: string | null; createdAt: string },
): number {
  const leftRank = left.projectId == null ? 0 : 1;
  const rightRank = right.projectId == null ? 0 : 1;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  return left.id.localeCompare(right.id);
}

function resolveValidationProfile(input: {
  profileId?: string;
  projectId?: string;
  profile?:
    | {
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
    | undefined;
}) {
  if (input.profileId) {
    const row = findRuntimeProfileById(input.profileId);
    if (!row) return null;
    return {
      source: "profile_id",
      profile: toRuntimeProfileResponse(row),
    } as const;
  }

  if (input.profile) {
    return {
      source: "payload",
      profile: {
        id: null,
        projectId: input.profile.projectId ?? null,
        name: input.profile.name,
        runtimeId: input.profile.runtimeId,
        providerId: input.profile.providerId,
        transport: input.profile.transport ?? null,
        baseUrl: input.profile.baseUrl ?? null,
        apiKeyEnvVar: input.profile.apiKeyEnvVar ?? null,
        defaultModel: input.profile.defaultModel ?? null,
        headers: input.profile.headers ?? {},
        options: input.profile.options ?? {},
        enabled: input.profile.enabled ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    } as const;
  }

  if (input.projectId) {
    const systemDefaultRuntimeProfileId = getAppDefaultRuntimeProfileId("task");
    const effective = resolveEffectiveRuntimeProfile({
      projectId: input.projectId,
      mode: "task",
      systemDefaultRuntimeProfileId,
    });
    if (!effective.profile) {
      return null;
    }
    return {
      source: `effective:${effective.source}`,
      profile: effective.profile,
    } as const;
  }

  return null;
}

// GET /runtime-profiles/runtimes
runtimeProfilesRouter.get("/runtimes", async (c) => {
  const registry = await getApiRuntimeRegistry();
  return c.json(
    registry.listRuntimes().map((runtime) => ({
      id: runtime.id,
      providerId: runtime.providerId,
      displayName: runtime.displayName,
      description: runtime.description ?? null,
      capabilities: runtime.capabilities,
      defaultTransport: runtime.defaultTransport ?? null,
      defaultApiKeyEnvVar: runtime.defaultApiKeyEnvVar ?? null,
      defaultBaseUrlEnvVar: runtime.defaultBaseUrlEnvVar ?? null,
      defaultBaseUrl: runtime.defaultBaseUrlEnvVar
        ? (process.env[runtime.defaultBaseUrlEnvVar] ?? null)
        : null,
      defaultModelPlaceholder: runtime.defaultModelPlaceholder ?? null,
      supportedTransports: runtime.supportedTransports ?? [],
    })),
  );
});

// GET /runtime-profiles?projectId=...&includeGlobal=...&enabledOnly=...&scope=...
runtimeProfilesRouter.get("/", queryValidator(runtimeProfileListQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const projectId = query.projectId;
  const includeGlobal = sanitizeBooleanQuery(query.includeGlobal, true);
  const enabledOnly = sanitizeBooleanQuery(query.enabledOnly, false);
  const scope = query.scope ?? "visible";

  log.debug(
    { projectId, includeGlobal, enabledOnly, scope },
    "[runtime-profile-route] List request",
  );
  if (scope === "project" && !projectId) {
    return c.json({ error: "projectId is required when scope=project" }, 400);
  }

  let profiles;
  if (scope === "global") {
    profiles = listRuntimeProfileResponses({ enabledOnly }).filter(
      (profile) => profile.projectId == null,
    );
  } else if (scope === "project") {
    profiles = listRuntimeProfileResponses({
      projectId,
      includeGlobal: false,
      enabledOnly,
    }).filter((profile) => profile.projectId === projectId);
  } else {
    profiles = listRuntimeProfileResponses({ projectId, includeGlobal, enabledOnly }).sort(
      compareVisibleRuntimeProfiles,
    );
  }
  const refreshedProfiles = await refreshProfilesWithIndexedCodexLimits(
    profiles,
    projectId ?? null,
  );
  return c.json(await enrichProfilesWithProviderIdentity(refreshedProfiles));
});

// GET /runtime-profiles/:id
runtimeProfilesRouter.get("/:id", async (c) => {
  const { id } = c.req.param();
  const profile = getRuntimeProfileResponseById(id);
  if (!profile) return c.json({ error: "Runtime profile not found" }, 404);
  const refreshedProfile = await refreshProfileWithIndexedCodexLimit(
    profile,
    profile.projectId ?? null,
  );
  return c.json((await enrichProfilesWithProviderIdentity([refreshedProfile]))[0]);
});

// POST /runtime-profiles
runtimeProfilesRouter.post(
  "/",
  mutationRateLimit,
  jsonValidator(createRuntimeProfileSchema),
  async (c) => {
    const body = c.req.valid("json") as CreateRuntimeProfilePayload;
    const sensitiveHeaderKeys = listSensitiveHeaderKeys(body.headers);
    const secretLikeOptionKeys = findSecretLikeKeys(body.options ?? {});
    if (sensitiveHeaderKeys.length > 0) {
      log.warn(
        { profileName: body.name, runtimeId: body.runtimeId, sensitiveHeaderKeys },
        "WARN [runtime-profile-route] Rejected create request with sensitive header keys",
      );
      return c.json(
        {
          error: "Sensitive header keys are not allowed in persisted runtime profiles",
          fieldErrors: {
            headers: sensitiveHeaderKeys.map((key) => `Disallowed header key: ${key}`),
          },
        },
        400,
      );
    }
    if (secretLikeOptionKeys.length > 0) {
      return c.json(
        {
          error: "Secret-like option keys are not allowed in persisted runtime profiles",
          reasonCodes: ["RUNTIME_PROFILE_SECRET_LIKE_OPTION_KEY"],
          fieldErrors: {
            options: secretLikeOptionKeys.map((key) => `Disallowed option key: ${key}`),
          },
        },
        400,
      );
    }
    const disallowedImplementerPaths = listDisallowedQwenImplementerOptionPaths({
      runtimeId: body.runtimeId,
      providerId: body.providerId,
      options: body.options ?? {},
    });
    if (disallowedImplementerPaths.length > 0) {
      return c.json(
        {
          error:
            "Qwen implementer approval cannot be set through runtime profile options; submit structured canary evidence instead",
          fieldErrors: {
            options: disallowedImplementerPaths.map(
              (path) => `Disallowed implementer approval path: ${path}`,
            ),
          },
        },
        400,
      );
    }

    const created = createRuntimeProfile(body);
    if (!created) return c.json({ error: "Failed to create runtime profile" }, 500);
    log.debug(
      { profileId: created.id, runtimeId: created.runtimeId, providerId: created.providerId },
      "[runtime-profile-route] Created runtime profile",
    );
    const response = toRuntimeProfileResponse(created);
    appendConfigAuditEvent({
      projectId: created.projectId ?? "global",
      runtimeProfileId: created.id,
      action: "runtime_profile_created",
      sourceKind: "runtime_profile",
      actor: "api",
      after: summarizeRuntimeProfileForAudit(response),
    });
    broadcast({ type: "runtime_profile:created", payload: response });
    return c.json(response, 201);
  },
);

// PUT /runtime-profiles/:id
runtimeProfilesRouter.put(
  "/:id",
  mutationRateLimit,
  jsonValidator(updateRuntimeProfileSchema),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json") as UpdateRuntimeProfilePayload;
    const existing = findRuntimeProfileById(id);
    if (!existing) return c.json({ error: "Runtime profile not found" }, 404);
    const sensitiveHeaderKeys = listSensitiveHeaderKeys(body.headers);
    const secretLikeOptionKeys = findSecretLikeKeys(body.options ?? {});
    if (sensitiveHeaderKeys.length > 0) {
      log.warn(
        { profileId: id, runtimeId: existing.runtimeId, sensitiveHeaderKeys },
        "WARN [runtime-profile-route] Rejected update request with sensitive header keys",
      );
      return c.json(
        {
          error: "Sensitive header keys are not allowed in persisted runtime profiles",
          fieldErrors: {
            headers: sensitiveHeaderKeys.map((key) => `Disallowed header key: ${key}`),
          },
        },
        400,
      );
    }
    if (secretLikeOptionKeys.length > 0) {
      return c.json(
        {
          error: "Secret-like option keys are not allowed in persisted runtime profiles",
          reasonCodes: ["RUNTIME_PROFILE_SECRET_LIKE_OPTION_KEY"],
          fieldErrors: {
            options: secretLikeOptionKeys.map((key) => `Disallowed option key: ${key}`),
          },
        },
        400,
      );
    }
    if (body.options !== undefined) {
      const disallowedImplementerPaths = listDisallowedQwenImplementerOptionPaths({
        id,
        runtimeId: body.runtimeId ?? existing.runtimeId,
        providerId: body.providerId ?? existing.providerId,
        options: body.options,
      });
      if (disallowedImplementerPaths.length > 0) {
        return c.json(
          {
            error:
              "Qwen implementer approval cannot be set through runtime profile options; submit structured canary evidence instead",
            fieldErrors: {
              options: disallowedImplementerPaths.map(
                (path) => `Disallowed implementer approval path: ${path}`,
              ),
            },
          },
          400,
        );
      }
    }
    const before = toRuntimeProfileResponse(existing);
    const updated = updateRuntimeProfile(id, body);
    if (!updated) return c.json({ error: "Failed to update runtime profile" }, 500);
    const response = toRuntimeProfileResponse(updated);
    appendConfigAuditEvent({
      projectId: updated.projectId ?? existing.projectId ?? "global",
      runtimeProfileId: id,
      action: "runtime_profile_updated",
      sourceKind: "runtime_profile",
      actor: "api",
      before: summarizeRuntimeProfileForAudit(before),
      after: summarizeRuntimeProfileForAudit(response),
    });
    broadcast({ type: "runtime_profile:updated", payload: response });
    return c.json(response);
  },
);

// POST /runtime-profiles/:id/implementer-canary/evidence
runtimeProfilesRouter.post(
  "/:id/implementer-canary/evidence",
  mutationRateLimit,
  jsonValidator(implementerCanaryEvidenceSchema),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json") as ImplementerCanaryEvidencePayload;
    const existing = findRuntimeProfileById(id);
    if (!existing) return c.json({ error: "Runtime profile not found" }, 404);

    const before = toRuntimeProfileResponse(existing);
    if (!before.enabled) {
      return c.json(
        { error: "Runtime profile must be enabled before implementer canary approval" },
        409,
      );
    }
    if (
      !isQwenLocalRuntimeProfile({
        id,
        runtimeId: before.runtimeId,
        providerId: before.providerId,
        options: before.options,
      })
    ) {
      return c.json(
        { error: "Implementer canary approvals are only supported for Qwen local profiles" },
        409,
      );
    }
    if (body.profileId && body.profileId !== id) {
      return c.json({ error: "Canary evidence profileId does not match route profile id" }, 400);
    }
    if (body.runtimeId && body.runtimeId !== before.runtimeId) {
      return c.json({ error: "Canary evidence runtimeId does not match runtime profile" }, 409);
    }
    if (body.providerId && body.providerId !== before.providerId) {
      return c.json({ error: "Canary evidence providerId does not match runtime profile" }, 409);
    }
    if (body.model && before.defaultModel && body.model !== before.defaultModel) {
      return c.json({ error: "Canary evidence model does not match runtime profile" }, 409);
    }
    if (body.endpoint && before.baseUrl && body.endpoint !== before.baseUrl) {
      return c.json({ error: "Canary evidence endpoint does not match runtime profile" }, 409);
    }

    const canary = buildImplementerCanaryRecord({ id, profile: before, evidence: body });
    const nextOptions = stripQwenImplementationBypassFlags(
      isObjectRecord(before.options) ? before.options : {},
    );
    const qwenOptions = isObjectRecord(nextOptions.qwenLocalAgent)
      ? { ...nextOptions.qwenLocalAgent }
      : {};
    qwenOptions.implementationCanary = canary;
    nextOptions.qwenLocalAgent = qwenOptions;

    const updated = updateRuntimeProfile(id, { options: nextOptions });
    if (!updated) return c.json({ error: "Failed to update runtime profile" }, 500);
    const response = toRuntimeProfileResponse(updated);
    appendConfigAuditEvent({
      projectId: updated.projectId ?? existing.projectId ?? "global",
      runtimeProfileId: id,
      action: "runtime_profile_updated",
      sourceKind: "runtime_profile",
      actor: "api",
      before: summarizeRuntimeProfileForAudit(before),
      after: summarizeRuntimeProfileForAudit(response),
    });
    broadcast({ type: "runtime_profile:updated", payload: response });
    return c.json({ profile: response, canary });
  },
);

// DELETE /runtime-profiles/:id
runtimeProfilesRouter.delete("/:id", mutationRateLimit, async (c) => {
  const { id } = c.req.param();
  const existing = findRuntimeProfileById(id);
  if (!existing) return c.json({ error: "Runtime profile not found" }, 404);
  const before = toRuntimeProfileResponse(existing);
  deleteRuntimeProfile(id);
  appendConfigAuditEvent({
    projectId: existing.projectId ?? "global",
    runtimeProfileId: id,
    action: "runtime_profile_deleted",
    sourceKind: "runtime_profile",
    actor: "api",
    before: summarizeRuntimeProfileForAudit(before),
    after: null,
  });
  broadcast({
    type: "runtime_profile:deleted",
    payload: { id, projectId: existing.projectId ?? null },
  });
  return c.json({ success: true });
});

// GET /runtime-profiles/effective/task/:taskId
runtimeProfilesRouter.get("/effective/task/:taskId", async (c) => {
  const { taskId } = c.req.param();
  const task = findTaskById(taskId);
  if (!task) return c.json({ error: "Task not found" }, 404);

  const systemDefaultRuntimeProfileId = getAppDefaultRuntimeProfileId("task");
  const effective = resolveEffectiveRuntimeProfile({
    taskId,
    projectId: task.projectId,
    mode: "task",
    systemDefaultRuntimeProfileId,
  });

  return c.json({
    source: effective.source,
    profile: effective.profile
      ? (
          await enrichProfilesWithProviderIdentity([
            await refreshProfileWithIndexedCodexLimit(effective.profile, task.projectId),
          ])
        )[0]
      : effective.profile,
    taskRuntimeProfileId: effective.taskRuntimeProfileId,
    projectRuntimeProfileId: effective.projectRuntimeProfileId,
    systemRuntimeProfileId: effective.systemRuntimeProfileId,
  });
});

// GET /runtime-profiles/effective/chat/:projectId
runtimeProfilesRouter.get("/effective/chat/:projectId", async (c) => {
  const { projectId } = c.req.param();
  const systemDefaultRuntimeProfileId = getAppDefaultRuntimeProfileId("chat");
  const effective = resolveEffectiveRuntimeProfile({
    projectId,
    mode: "chat",
    systemDefaultRuntimeProfileId,
  });

  const workflow = createRuntimeWorkflowSpec({
    workflowKind: "chat",
    prompt: "Resolve effective chat runtime profile",
    requiredCapabilities: [],
    sessionReusePolicy: "never",
  });
  const resolved = resolveRuntimeProfile({
    source: effective.source,
    profile: effective.profile,
    workflow,
    fallbackRuntimeId: getEnv().AIF_DEFAULT_RUNTIME_ID,
    fallbackProviderId: getEnv().AIF_DEFAULT_PROVIDER_ID,
    env: process.env,
    allowDisabled: true,
  });

  return c.json({
    source: effective.source,
    profile: effective.profile
      ? (
          await enrichProfilesWithProviderIdentity([
            await refreshProfileWithIndexedCodexLimit(effective.profile, projectId),
          ])
        )[0]
      : effective.profile,
    taskRuntimeProfileId: effective.taskRuntimeProfileId,
    projectRuntimeProfileId: effective.projectRuntimeProfileId,
    systemRuntimeProfileId: effective.systemRuntimeProfileId,
    resolved: redactResolvedRuntimeProfile(resolved),
  });
});

// POST /runtime-profiles/validate
runtimeProfilesRouter.post(
  "/validate",
  validationRateLimit,
  jsonValidator(runtimeProfileValidationSchema),
  async (c) => {
    const body = c.req.valid("json") as RuntimeProfileValidationPayload;
    const resolvedInput = resolveValidationProfile({
      profileId: body.profileId,
      projectId: body.projectId,
      profile: body.profile,
    });

    if (!resolvedInput) {
      return c.json(
        {
          error:
            "Provide profileId, profile payload, or projectId with an existing effective profile",
        },
        400,
      );
    }

    const env: Record<string, string | undefined> = {};
    if (body.apiKey) {
      const envKey = inferApiKeyEnvVar(resolvedInput.profile);
      env[envKey] = body.apiKey;
      log.warn(
        { source: resolvedInput.source, envKey },
        "WARN [runtime-profile-route] Temporary API key received for validation only",
      );
    }

    const workflow = createRuntimeWorkflowSpec({
      workflowKind: "runtime-validate",
      prompt: "Validate runtime connectivity",
      requiredCapabilities: [],
      sessionReusePolicy: "never",
    });

    const resolved = resolveRuntimeProfile({
      source: resolvedInput.source,
      profile: resolvedInput.profile,
      workflow,
      modelOverride: body.modelOverride ?? null,
      runtimeOptionsOverride: body.runtimeOptions ?? null,
      allowDisabled: true,
      env: Object.keys(env).length > 0 ? env : undefined,
    });

    try {
      const discovery = await getApiRuntimeModelDiscoveryService();
      const validation = await discovery.validateConnection(resolved, body.forceRefresh ?? true);

      log.info(
        {
          runtimeId: resolved.runtimeId,
          providerId: resolved.providerId,
          profileId: resolved.profileId,
          ok: validation.ok,
        },
        "INFO [runtime-profile-route] Validation completed",
      );

      return c.json({
        ok: validation.ok,
        message: validation.message,
        details: validation.details ?? null,
        profile: redactResolvedRuntimeProfile(resolved),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err, runtimeId: resolved.runtimeId }, "Runtime profile validation failed");
      return c.json({
        ok: false,
        message,
        details: null,
        profile: redactResolvedRuntimeProfile(resolved),
      });
    }
  },
);

// POST /runtime-profiles/models
runtimeProfilesRouter.post(
  "/models",
  validationRateLimit,
  jsonValidator(runtimeProfileModelsSchema),
  async (c) => {
    const body = c.req.valid("json") as RuntimeProfileModelsPayload;
    const resolvedInput = resolveValidationProfile({
      profileId: body.profileId,
      projectId: body.projectId,
      profile: body.profile,
    });

    if (!resolvedInput) {
      return c.json(
        {
          error:
            "Provide profileId, profile payload, or projectId with an existing effective profile",
        },
        400,
      );
    }

    const env: Record<string, string | undefined> = {};
    if (body.apiKey) {
      const envKey = inferApiKeyEnvVar(resolvedInput.profile);
      env[envKey] = body.apiKey;
      log.warn(
        { source: resolvedInput.source, envKey },
        "WARN [runtime-profile-route] Temporary API key received for model discovery only",
      );
    }

    const workflow = createRuntimeWorkflowSpec({
      workflowKind: "runtime-models",
      prompt: "List runtime models",
      requiredCapabilities: ["supportsModelDiscovery"],
      sessionReusePolicy: "never",
    });

    const resolved = resolveRuntimeProfile({
      source: resolvedInput.source,
      profile: resolvedInput.profile,
      workflow,
      modelOverride: body.modelOverride ?? null,
      runtimeOptionsOverride: body.runtimeOptions ?? null,
      allowDisabled: true,
      env: Object.keys(env).length > 0 ? env : undefined,
    });

    try {
      const discovery = await getApiRuntimeModelDiscoveryService();
      const models = await discovery.listModels(resolved, body.forceRefresh ?? true);

      log.info(
        {
          runtimeId: resolved.runtimeId,
          providerId: resolved.providerId,
          profileId: resolved.profileId,
          modelCount: models.length,
        },
        "INFO [runtime-profile-route] Model discovery completed",
      );

      return c.json({
        models,
        profile: redactResolvedRuntimeProfile(resolved),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err, runtimeId: resolved.runtimeId }, "Runtime model discovery failed");
      return c.json(
        { error: message, models: [], profile: redactResolvedRuntimeProfile(resolved) },
        422,
      );
    }
  },
);
