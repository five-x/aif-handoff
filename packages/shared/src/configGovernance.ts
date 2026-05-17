import type { AifProjectConfig } from "./projectConfig.js";
import type { RuntimeStageOrProfileMode } from "./constants.js";

export const CONFIG_ISSUE_SEVERITIES = ["info", "warning", "error"] as const;
export type ConfigIssueSeverity = (typeof CONFIG_ISSUE_SEVERITIES)[number];

export const CONFIG_SOURCE_KINDS = [
  "env",
  "app_settings",
  "project",
  "project_config",
  "mcp",
  "runtime_profile",
  "task_override",
  "permission_policy",
  "usage_limits",
  "memory",
] as const;
export type ConfigSourceKind = (typeof CONFIG_SOURCE_KINDS)[number];

export const CONFIG_AUDIT_ACTIONS = [
  "app_runtime_defaults_updated",
  "project_updated",
  "project_runtime_defaults_updated",
  "project_config_written",
  "runtime_profile_created",
  "runtime_profile_updated",
  "runtime_profile_deleted",
  "task_runtime_override_updated",
] as const;
export type ConfigAuditAction = (typeof CONFIG_AUDIT_ACTIONS)[number];

export const CONFIG_REASON_CODES = [
  "PROJECT_CONFIG_PARSE_FAILED",
  "PROJECT_CONFIG_ROOT_NOT_OBJECT",
  "PROJECT_CONFIG_SECTION_NOT_OBJECT",
  "PROJECT_CONFIG_INVALID_PATH_VALUE",
  "PROJECT_CONFIG_INVALID_BOOLEAN",
  "PROJECT_CONFIG_INVALID_ENUM",
  "PROJECT_CONFIG_INVALID_LANGUAGE_TAG",
  "PROJECT_CONFIG_SECRET_LIKE_KEY",
  "RUNTIME_PROFILE_MISSING",
  "RUNTIME_PROFILE_DISABLED",
  "RUNTIME_PROFILE_SCOPE_MISMATCH",
  "RUNTIME_PROFILE_SECRET_LIKE_HEADER_KEY",
  "RUNTIME_PROFILE_SECRET_LIKE_OPTION_KEY",
  "TASK_RUNTIME_SECRET_LIKE_OPTION_KEY",
  "TASK_RUNTIME_PROFILE_MISSING",
  "TASK_RUNTIME_PROFILE_DISABLED",
  "TASK_RUNTIME_PROFILE_SCOPE_MISMATCH",
  "EFFECTIVE_RUNTIME_PROFILE_MISSING",
  "MCP_SECRET_LIKE_KEY",
] as const;
export type ConfigReasonCode = (typeof CONFIG_REASON_CODES)[number];

export interface ResolvedConfigIssue {
  severity: ConfigIssueSeverity;
  reasonCode: ConfigReasonCode;
  sourceKind: ConfigSourceKind;
  message: string;
  path?: string;
  blocksWork: boolean;
}

export interface RedactedRuntimeProfileConfig {
  id: string;
  projectId: string | null;
  name: string;
  runtimeId: string;
  providerId: string;
  transport: string | null;
  enabled: boolean;
  apiKeyEnvVar: string | null;
  apiKeyConfigured: boolean | null;
  baseUrlConfigured: boolean;
  defaultModelConfigured: boolean;
  headerKeys: string[];
  optionKeys: string[];
}

export interface ResolvedRuntimeSelectionConfig {
  stage: RuntimeStageOrProfileMode | string;
  source: string;
  profileId: string | null;
  profileName: string | null;
  runtimeId: string | null;
  providerId: string | null;
}

export interface ResolvedProjectConfigView {
  projectId: string;
  generatedAt: string;
  fingerprint: string;
  project: {
    name: string;
    rootPath: string;
    parallelEnabled: boolean;
    autoQueueMode: boolean;
    defaultRuntimeProfileIds: Record<string, string | null>;
  };
  env: {
    files: {
      env: boolean;
      envLocal: boolean;
    };
    runtimeModules: string[];
    defaultRuntimeId: string;
    defaultProviderId: string;
    configuredKeys: string[];
    flags: Record<string, boolean>;
  };
  appRuntimeDefaults: Record<string, string | null>;
  projectConfig: {
    exists: boolean;
    parseOk: boolean;
    paths: AifProjectConfig["paths"];
    workflow: AifProjectConfig["workflow"];
    git: AifProjectConfig["git"];
    language: AifProjectConfig["language"];
  };
  mcp: {
    exists: boolean;
    servers: Array<{
      name: string;
      transport: string | null;
      hasCommand: boolean;
      hasUrl: boolean;
      envKeys: string[];
    }>;
  };
  permissionPolicy: {
    bypassEnabled: boolean;
    modes: string[];
    intents: string[];
    defaultByIntent: Record<string, string>;
  };
  usageLimits: {
    enabled: boolean;
  };
  memory: {
    enabled: boolean;
  };
  runtimeProfiles: RedactedRuntimeProfileConfig[];
  effectiveRuntime: ResolvedRuntimeSelectionConfig[];
  issues: ResolvedConfigIssue[];
}

export interface ConfigAuditEvent {
  id: string;
  projectId: string;
  taskId: string | null;
  runtimeProfileId: string | null;
  action: ConfigAuditAction;
  sourceKind: ConfigSourceKind;
  actor: string | null;
  reasonCodes: ConfigReasonCode[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|secret|token|password|credential|authorization|bearer|cookie|session)/i;
const VALID_LANGUAGE_TAG = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/;

export function isSecretLikeConfigKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function findSecretLikeKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const keys: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isSecretLikeConfigKey(key)) keys.push(path);
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      keys.push(...findSecretLikeKeys(nested, path));
    }
  }
  return [...new Set(keys)].sort();
}

function issue(
  input: Omit<ResolvedConfigIssue, "blocksWork"> & { blocksWork?: boolean },
): ResolvedConfigIssue {
  return { ...input, blocksWork: input.blocksWork ?? input.severity === "error" };
}

function section(raw: Record<string, unknown>, key: string, issues: ResolvedConfigIssue[]) {
  const value = raw[key];
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    issues.push(
      issue({
        severity: "error",
        reasonCode: "PROJECT_CONFIG_SECTION_NOT_OBJECT",
        sourceKind: "project_config",
        path: key,
        message: `${key} must be an object`,
      }),
    );
    return null;
  }
  return value as Record<string, unknown>;
}

function validateStringMap(
  source: Record<string, unknown> | null,
  sectionName: string,
  issues: ResolvedConfigIssue[],
): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push(
        issue({
          severity: "error",
          reasonCode: "PROJECT_CONFIG_INVALID_PATH_VALUE",
          sourceKind: "project_config",
          path: `${sectionName}.${key}`,
          message: `${sectionName}.${key} must be a non-empty string`,
        }),
      );
    }
  }
}

function validateBoolean(
  source: Record<string, unknown> | null,
  sectionName: string,
  keys: string[],
  issues: ResolvedConfigIssue[],
): void {
  if (!source) return;
  for (const key of keys) {
    if (source[key] !== undefined && typeof source[key] !== "boolean") {
      issues.push(
        issue({
          severity: "error",
          reasonCode: "PROJECT_CONFIG_INVALID_BOOLEAN",
          sourceKind: "project_config",
          path: `${sectionName}.${key}`,
          message: `${sectionName}.${key} must be a boolean`,
        }),
      );
    }
  }
}

function validateEnum(
  source: Record<string, unknown> | null,
  sectionName: string,
  key: string,
  allowed: string[],
  issues: ResolvedConfigIssue[],
): void {
  if (!source || source[key] === undefined) return;
  if (typeof source[key] !== "string" || !allowed.includes(source[key] as string)) {
    issues.push(
      issue({
        severity: "error",
        reasonCode: "PROJECT_CONFIG_INVALID_ENUM",
        sourceKind: "project_config",
        path: `${sectionName}.${key}`,
        message: `${sectionName}.${key} must be one of: ${allowed.join(", ")}`,
      }),
    );
  }
}

export function validateProjectConfigObject(raw: unknown): ResolvedConfigIssue[] {
  const issues: ResolvedConfigIssue[] = [];
  if (raw == null) return issues;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return [
      issue({
        severity: "error",
        reasonCode: "PROJECT_CONFIG_ROOT_NOT_OBJECT",
        sourceKind: "project_config",
        message: "Project config root must be an object",
      }),
    ];
  }
  const root = raw as Record<string, unknown>;
  for (const key of findSecretLikeKeys(root)) {
    issues.push(
      issue({
        severity: "error",
        reasonCode: "PROJECT_CONFIG_SECRET_LIKE_KEY",
        sourceKind: "project_config",
        path: key,
        message:
          "Project config contains a secret-like key; store secret values in environment variables",
      }),
    );
  }
  const paths = section(root, "paths", issues);
  const workflow = section(root, "workflow", issues);
  const git = section(root, "git", issues);
  const language = section(root, "language", issues);

  validateStringMap(paths, "paths", issues);
  validateBoolean(
    workflow,
    "workflow",
    ["auto_create_dirs", "analyze_updates_architecture", "architecture_updates_roadmap"],
    issues,
  );
  validateEnum(workflow, "workflow", "plan_id_format", ["slug", "timestamp", "uuid"], issues);
  validateEnum(workflow, "workflow", "verify_mode", ["strict", "normal", "lenient"], issues);
  validateBoolean(
    git,
    "git",
    ["enabled", "create_branches", "skip_push_after_commit", "strict_base_update"],
    issues,
  );
  if (git?.base_branch !== undefined && typeof git.base_branch !== "string") {
    issues.push(
      issue({
        severity: "error",
        reasonCode: "PROJECT_CONFIG_INVALID_PATH_VALUE",
        sourceKind: "project_config",
        path: "git.base_branch",
        message: "git.base_branch must be a string",
      }),
    );
  }
  if (git?.branch_prefix !== undefined && typeof git.branch_prefix !== "string") {
    issues.push(
      issue({
        severity: "error",
        reasonCode: "PROJECT_CONFIG_INVALID_PATH_VALUE",
        sourceKind: "project_config",
        path: "git.branch_prefix",
        message: "git.branch_prefix must be a string",
      }),
    );
  }
  for (const key of ["ui", "artifacts"]) {
    const value = language?.[key];
    if (
      value !== undefined &&
      (typeof value !== "string" || !VALID_LANGUAGE_TAG.test(value.trim().toLowerCase()))
    ) {
      issues.push(
        issue({
          severity: "error",
          reasonCode: "PROJECT_CONFIG_INVALID_LANGUAGE_TAG",
          sourceKind: "project_config",
          path: `language.${key}`,
          message: `language.${key} must be a valid language tag`,
        }),
      );
    }
  }
  validateEnum(language, "language", "technical_terms", ["keep", "translate"], issues);
  return issues;
}

export function summarizeRuntimeProfileConfig(profile: {
  id: string;
  projectId: string | null;
  name: string;
  runtimeId: string;
  providerId: string;
  transport: string | null;
  baseUrl: string | null;
  apiKeyEnvVar: string | null;
  defaultModel: string | null;
  headers: Record<string, unknown>;
  options: Record<string, unknown>;
  enabled: boolean;
}): RedactedRuntimeProfileConfig {
  return {
    id: profile.id,
    projectId: profile.projectId,
    name: profile.name,
    runtimeId: profile.runtimeId,
    providerId: profile.providerId,
    transport: profile.transport,
    enabled: profile.enabled,
    apiKeyEnvVar: profile.apiKeyEnvVar,
    apiKeyConfigured: profile.apiKeyEnvVar ? Boolean(process.env[profile.apiKeyEnvVar]) : null,
    baseUrlConfigured: Boolean(profile.baseUrl),
    defaultModelConfigured: Boolean(profile.defaultModel),
    headerKeys: Object.keys(profile.headers).sort(),
    optionKeys: Object.keys(profile.options).sort(),
  };
}

export function summarizeTaskRuntimeOverride(input: {
  runtimeProfileId?: string | null;
  modelOverride?: string | null;
  runtimeOptions?: Record<string, unknown> | null;
}): Record<string, unknown> {
  return {
    runtimeProfileId: input.runtimeProfileId ?? null,
    modelOverrideConfigured: Boolean(input.modelOverride),
    runtimeOptionKeys: Object.keys(input.runtimeOptions ?? {}).sort(),
    secretLikeRuntimeOptionKeys: findSecretLikeKeys(input.runtimeOptions ?? {}),
  };
}

export function summarizeRuntimeProfileForAudit(input: {
  id?: string | null;
  projectId?: string | null;
  name?: string | null;
  runtimeId?: string | null;
  providerId?: string | null;
  transport?: string | null;
  baseUrl?: string | null;
  apiKeyEnvVar?: string | null;
  defaultModel?: string | null;
  headers?: Record<string, unknown> | null;
  options?: Record<string, unknown> | null;
  enabled?: boolean | null;
}): Record<string, unknown> {
  return {
    id: input.id ?? null,
    projectId: input.projectId ?? null,
    name: input.name ?? null,
    runtimeId: input.runtimeId ?? null,
    providerId: input.providerId ?? null,
    transport: input.transport ?? null,
    baseUrlConfigured: Boolean(input.baseUrl),
    apiKeyEnvVar: input.apiKeyEnvVar ?? null,
    defaultModelConfigured: Boolean(input.defaultModel),
    headerKeys: Object.keys(input.headers ?? {}).sort(),
    optionKeys: Object.keys(input.options ?? {}).sort(),
    enabled: input.enabled ?? null,
  };
}

export function fingerprintConfig(value: unknown): string {
  const stable = JSON.stringify(sortForFingerprint(value));
  let hash = 2166136261;
  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sortForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForFingerprint);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortForFingerprint(nested)]),
  );
}
