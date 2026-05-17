import { redactProviderText } from "./runtimeLimitUtils.js";

export const PERMISSION_MODES = [
  "danger_full_access",
  "workspace_write",
  "read_only",
  "review_only",
  "audit_diagnostic_only",
] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const PERMISSION_POLICY_INTENTS = [
  "general",
  "feature",
  "fix",
  "tests",
  "docs",
  "spike",
  "audit",
] as const;

export type PermissionPolicyIntent = (typeof PERMISSION_POLICY_INTENTS)[number];

export type PermissionFileBoundaryMode =
  | "task_scope"
  | "docs_only"
  | "tests_only"
  | "research_only"
  | "report_only";

export interface PermissionFileBoundaryPolicy {
  mode: PermissionFileBoundaryMode;
  writeAllowed: boolean;
  allowedPathGlobs: string[];
  forbiddenPathGlobs: string[];
  summary: string;
}

export interface PermissionShellPolicy {
  allowShell: boolean;
  dangerousCommandsRequireHumanApproval: boolean;
  allowNetworkTransferCommands: boolean;
  summary: string;
}

export interface PermissionNetworkPolicy {
  allowNetwork: boolean;
  requiresHumanApproval: boolean;
  summary: string;
}

export interface PermissionBypassVisibilityPolicy {
  allowBypass: boolean;
  requiresHumanApproval: boolean;
  auditMetadataRequired: boolean;
  auditFields: string[];
  summary: string;
}

export interface PermissionExecutionPolicy {
  intent: PermissionPolicyIntent;
  defaultMode: PermissionMode;
  allowedModeExceptions: PermissionMode[];
  fileBoundary: PermissionFileBoundaryPolicy;
  shellPolicy: PermissionShellPolicy;
  networkPolicy: PermissionNetworkPolicy;
  requiresHumanApproval: boolean;
  bypassVisibility: PermissionBypassVisibilityPolicy;
}

export const PERMISSION_EXECUTION_POLICIES: Record<
  PermissionPolicyIntent,
  PermissionExecutionPolicy
> = {
  general: {
    intent: "general",
    defaultMode: "workspace_write",
    allowedModeExceptions: ["read_only", "review_only", "danger_full_access"],
    fileBoundary: {
      mode: "task_scope",
      writeAllowed: true,
      allowedPathGlobs: ["**/*"],
      forbiddenPathGlobs: [".git/**", "**/.env*", "**/*secret*", "**/*credential*"],
      summary: "Writes are limited to the approved task scope.",
    },
    shellPolicy: {
      allowShell: true,
      dangerousCommandsRequireHumanApproval: true,
      allowNetworkTransferCommands: false,
      summary: "Normal shell commands are allowed; dangerous commands require human approval.",
    },
    networkPolicy: {
      allowNetwork: true,
      requiresHumanApproval: false,
      summary: "Network access is allowed when task-relevant.",
    },
    requiresHumanApproval: false,
    bypassVisibility: {
      allowBypass: true,
      requiresHumanApproval: true,
      auditMetadataRequired: true,
      auditFields: ["intent", "requestedMode", "reason", "approvedBy", "approvedAt"],
      summary: "Bypasses must be human-approved and recorded.",
    },
  },
  feature: {
    intent: "feature",
    defaultMode: "workspace_write",
    allowedModeExceptions: ["read_only", "review_only", "danger_full_access"],
    fileBoundary: {
      mode: "task_scope",
      writeAllowed: true,
      allowedPathGlobs: ["**/*"],
      forbiddenPathGlobs: [".git/**", "**/.env*", "**/*secret*", "**/*credential*"],
      summary: "Feature writes are limited to approved implementation scope.",
    },
    shellPolicy: {
      allowShell: true,
      dangerousCommandsRequireHumanApproval: true,
      allowNetworkTransferCommands: false,
      summary:
        "Normal implementation shell commands are allowed; dangerous commands require approval.",
    },
    networkPolicy: {
      allowNetwork: true,
      requiresHumanApproval: false,
      summary: "Network access is allowed when needed for implementation or verification.",
    },
    requiresHumanApproval: false,
    bypassVisibility: {
      allowBypass: true,
      requiresHumanApproval: true,
      auditMetadataRequired: true,
      auditFields: ["intent", "requestedMode", "reason", "approvedBy", "approvedAt"],
      summary: "Bypasses must be visible in audit metadata.",
    },
  },
  fix: {
    intent: "fix",
    defaultMode: "workspace_write",
    allowedModeExceptions: ["read_only", "review_only", "danger_full_access"],
    fileBoundary: {
      mode: "task_scope",
      writeAllowed: true,
      allowedPathGlobs: ["**/*"],
      forbiddenPathGlobs: [".git/**", "**/.env*", "**/*secret*", "**/*credential*"],
      summary: "Fix writes are limited to approved bugfix scope.",
    },
    shellPolicy: {
      allowShell: true,
      dangerousCommandsRequireHumanApproval: true,
      allowNetworkTransferCommands: false,
      summary:
        "Normal diagnosis and verification commands are allowed; dangerous commands require approval.",
    },
    networkPolicy: {
      allowNetwork: true,
      requiresHumanApproval: false,
      summary: "Network access is allowed when needed to reproduce or verify the fix.",
    },
    requiresHumanApproval: false,
    bypassVisibility: {
      allowBypass: true,
      requiresHumanApproval: true,
      auditMetadataRequired: true,
      auditFields: ["intent", "requestedMode", "reason", "approvedBy", "approvedAt"],
      summary: "Bypasses must be visible in audit metadata.",
    },
  },
  tests: {
    intent: "tests",
    defaultMode: "workspace_write",
    allowedModeExceptions: ["read_only", "review_only"],
    fileBoundary: {
      mode: "tests_only",
      writeAllowed: true,
      allowedPathGlobs: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/fixtures/**"],
      forbiddenPathGlobs: [".git/**", "src/**", "packages/*/src/**/!(*.test|*.spec).*"],
      summary: "Writes are limited to tests, specs, and fixtures.",
    },
    shellPolicy: {
      allowShell: true,
      dangerousCommandsRequireHumanApproval: true,
      allowNetworkTransferCommands: false,
      summary: "Test and inspection commands are allowed; dangerous commands require approval.",
    },
    networkPolicy: {
      allowNetwork: false,
      requiresHumanApproval: true,
      summary: "Network use is blocked unless explicitly approved.",
    },
    requiresHumanApproval: false,
    bypassVisibility: {
      allowBypass: true,
      requiresHumanApproval: true,
      auditMetadataRequired: true,
      auditFields: ["intent", "requestedMode", "reason", "approvedBy", "approvedAt"],
      summary: "Bypasses must be approved and recorded.",
    },
  },
  docs: {
    intent: "docs",
    defaultMode: "workspace_write",
    allowedModeExceptions: ["read_only", "review_only"],
    fileBoundary: {
      mode: "docs_only",
      writeAllowed: true,
      allowedPathGlobs: ["docs/**", "**/*.md", "**/*.mdx", "README*", "CHANGELOG*"],
      forbiddenPathGlobs: ["src/**", "packages/**/src/**", ".git/**"],
      summary: "Writes are limited to documentation artifacts.",
    },
    shellPolicy: {
      allowShell: true,
      dangerousCommandsRequireHumanApproval: true,
      allowNetworkTransferCommands: false,
      summary:
        "Inspection and documentation verification commands are allowed; dangerous commands require approval.",
    },
    networkPolicy: {
      allowNetwork: true,
      requiresHumanApproval: false,
      summary: "Network access is allowed for source lookup when relevant to documentation.",
    },
    requiresHumanApproval: false,
    bypassVisibility: {
      allowBypass: true,
      requiresHumanApproval: true,
      auditMetadataRequired: true,
      auditFields: ["intent", "requestedMode", "reason", "approvedBy", "approvedAt"],
      summary: "Documentation boundary bypasses must be visible in audit metadata.",
    },
  },
  spike: {
    intent: "spike",
    defaultMode: "read_only",
    allowedModeExceptions: ["review_only", "workspace_write"],
    fileBoundary: {
      mode: "research_only",
      writeAllowed: false,
      allowedPathGlobs: ["docs/rdpi/**", "docs/intake/**", "docs/research/**"],
      forbiddenPathGlobs: ["src/**", "packages/**/src/**", ".git/**"],
      summary: "Default spike work is read-only; research artifact writes require an exception.",
    },
    shellPolicy: {
      allowShell: true,
      dangerousCommandsRequireHumanApproval: true,
      allowNetworkTransferCommands: false,
      summary: "Read-only inspection commands are allowed; dangerous commands require approval.",
    },
    networkPolicy: {
      allowNetwork: true,
      requiresHumanApproval: false,
      summary: "Network access is allowed for research.",
    },
    requiresHumanApproval: false,
    bypassVisibility: {
      allowBypass: true,
      requiresHumanApproval: true,
      auditMetadataRequired: true,
      auditFields: ["intent", "requestedMode", "reason", "approvedBy", "approvedAt"],
      summary: "Spike write or mode bypasses must be recorded.",
    },
  },
  audit: {
    intent: "audit",
    defaultMode: "audit_diagnostic_only",
    allowedModeExceptions: ["read_only", "review_only"],
    fileBoundary: {
      mode: "report_only",
      writeAllowed: true,
      allowedPathGlobs: ["docs/rdpi/**/result.md", "docs/rdpi/**/audit*.md", "reports/**"],
      forbiddenPathGlobs: ["src/**", "packages/**/src/**", "docs/**/*.ts", ".git/**"],
      summary: "Only diagnostic report artifacts may be written.",
    },
    shellPolicy: {
      allowShell: true,
      dangerousCommandsRequireHumanApproval: true,
      allowNetworkTransferCommands: false,
      summary: "Diagnostic shell commands are allowed; dangerous commands require approval.",
    },
    networkPolicy: {
      allowNetwork: false,
      requiresHumanApproval: true,
      summary: "Audit networking is blocked unless explicitly approved.",
    },
    requiresHumanApproval: false,
    bypassVisibility: {
      allowBypass: false,
      requiresHumanApproval: true,
      auditMetadataRequired: true,
      auditFields: ["intent", "requestedMode", "reason", "approvedBy", "approvedAt"],
      summary: "Audit implementation bypass is not allowed by policy.",
    },
  },
};

export type DangerousShellCategory =
  | "destructive_filesystem"
  | "privilege_permission_change"
  | "secret_read"
  | "shell_metacharacter_chain"
  | "network_transfer"
  | "process_service_kill"
  | "git_destructive_history";

export interface DangerousShellCommandClassification {
  dangerous: boolean;
  categories: DangerousShellCategory[];
  reasons: string[];
}

interface DangerousPattern {
  category: DangerousShellCategory;
  pattern: RegExp;
  reason: string;
}

const DANGEROUS_SHELL_PATTERNS: DangerousPattern[] = [
  {
    category: "destructive_filesystem",
    pattern:
      /\b(rm\s+-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)|remove-item\b.*(?:^|\s)-recurse\b|del\s+\/[sq]|rmdir\s+\/s|rd\s+\/s|format\b|shred\b|dd\s+.*\bof=|git\s+clean\s+-[^\s]*[fd])/i,
    reason: "Command can recursively or forcefully delete filesystem content.",
  },
  {
    category: "privilege_permission_change",
    pattern: /\b(chmod|chown|chgrp|icacls|takeown|setfacl|attrib|sudo|runas)\b/i,
    reason: "Command can change privileges, ownership, or permissions.",
  },
  {
    category: "secret_read",
    pattern:
      /\b(cat|type|get-content|gc|more|less|select-string)\b.*(\.env\b|id_rsa|id_dsa|id_ed25519|\.pem\b|\.pfx\b|\.p12\b|npmrc\b|credentials?|secrets?|tokens?)/i,
    reason: "Command appears to read secret-bearing files or credentials.",
  },
  {
    category: "shell_metacharacter_chain",
    pattern: /(^|[^&|])(;|&&|\|\||`|\$\(|\|)([^&|]|$)/,
    reason: "Command uses shell metacharacters that can chain or inject commands.",
  },
  {
    category: "network_transfer",
    pattern:
      /\b(curl|wget|invoke-webrequest|iwr|invoke-restmethod|irm|scp|sftp|ftp|rsync|nc|netcat|certutil\s+-urlcache)\b/i,
    reason: "Command can transfer data over the network.",
  },
  {
    category: "process_service_kill",
    pattern:
      /\b(kill\s+-9|pkill|killall|taskkill|stop-process|systemctl\s+(?:stop|restart|disable)|service\s+\S+\s+(?:stop|restart)|net\s+stop|sc\s+stop)\b/i,
    reason: "Command can kill processes or stop services.",
  },
  {
    category: "git_destructive_history",
    pattern:
      /\bgit\s+(reset\s+--hard|checkout\s+--|restore\s+.*\s--source=|rebase\b|push\s+.*--force|branch\s+-D|reflog\s+expire|filter-branch)\b/i,
    reason: "Command can rewrite or discard git history or working tree state.",
  },
];

export interface ShellPermissionDecisionInput {
  intent: PermissionPolicyIntent;
  command: string;
  requestedMode?: PermissionMode | null;
  humanApprovalBridgeAvailable?: boolean;
  humanApproved?: boolean;
  bypassRequested?: boolean;
}

export type PermissionDecisionOutcome = "allow" | "deny" | "requires_human_approval";

export interface PermissionAuditMetadata {
  intent: PermissionPolicyIntent;
  requestedMode: PermissionMode;
  defaultMode: PermissionMode;
  requiresHumanApproval: boolean;
  bypassRequested: boolean;
  bypassAllowed: boolean;
  dangerousCategories: DangerousShellCategory[];
}

export interface ShellPermissionDecision {
  outcome: PermissionDecisionOutcome;
  allowed: boolean;
  mode: PermissionMode;
  requiresHumanApproval: boolean;
  reasons: string[];
  classification: DangerousShellCommandClassification;
  auditMetadata: PermissionAuditMetadata;
}

export interface ApprovalDecisionInput {
  requiresHumanApproval: boolean;
  humanApprovalBridgeAvailable?: boolean;
  humanApproved?: boolean;
  reason: string;
}

export interface ApprovalDecision {
  outcome: PermissionDecisionOutcome;
  allowed: boolean;
  reasons: string[];
}

export interface BypassDecisionInput {
  intent: PermissionPolicyIntent;
  requestedMode?: PermissionMode | null;
  humanApprovalBridgeAvailable?: boolean;
  humanApproved?: boolean;
  reason?: string | null;
}

export interface BypassDecision {
  outcome: PermissionDecisionOutcome;
  allowed: boolean;
  requiresHumanApproval: boolean;
  auditMetadataRequired: boolean;
  auditFields: string[];
  reasons: string[];
}

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === "string" && PERMISSION_MODES.includes(value as PermissionMode);
}

export function isPermissionPolicyIntent(value: unknown): value is PermissionPolicyIntent {
  return (
    typeof value === "string" && PERMISSION_POLICY_INTENTS.includes(value as PermissionPolicyIntent)
  );
}

export function getPermissionExecutionPolicy(
  intent: PermissionPolicyIntent,
): PermissionExecutionPolicy {
  return PERMISSION_EXECUTION_POLICIES[intent];
}

export function isPermissionModeAllowedForIntent(
  intent: PermissionPolicyIntent,
  mode: PermissionMode,
): boolean {
  const policy = getPermissionExecutionPolicy(intent);
  return policy.defaultMode === mode || policy.allowedModeExceptions.includes(mode);
}

export function classifyDangerousShellCommand(
  command: string,
): DangerousShellCommandClassification {
  const categories: DangerousShellCategory[] = [];
  const reasons: string[] = [];
  for (const entry of DANGEROUS_SHELL_PATTERNS) {
    if (!entry.pattern.test(command)) continue;
    if (!categories.includes(entry.category)) {
      categories.push(entry.category);
      reasons.push(entry.reason);
    }
  }
  return {
    dangerous: categories.length > 0,
    categories,
    reasons,
  };
}

export function decideHumanApproval(input: ApprovalDecisionInput): ApprovalDecision {
  if (!input.requiresHumanApproval) {
    return { outcome: "allow", allowed: true, reasons: [] };
  }
  if (!input.humanApprovalBridgeAvailable) {
    return {
      outcome: "deny",
      allowed: false,
      reasons: [
        `${input.reason} requires human approval, but no human approval bridge is available; failing closed.`,
      ],
    };
  }
  if (!input.humanApproved) {
    return {
      outcome: "requires_human_approval",
      allowed: false,
      reasons: [`${input.reason} requires human approval.`],
    };
  }
  return { outcome: "allow", allowed: true, reasons: [`${input.reason} approved by human.`] };
}

export function decidePolicyBypass(input: BypassDecisionInput): BypassDecision {
  const policy = getPermissionExecutionPolicy(input.intent);
  const bypass = policy.bypassVisibility;
  const reasons: string[] = [];
  if (!bypass.allowBypass) {
    return {
      outcome: "deny",
      allowed: false,
      requiresHumanApproval: bypass.requiresHumanApproval,
      auditMetadataRequired: bypass.auditMetadataRequired,
      auditFields: bypass.auditFields,
      reasons: [`Bypass is not allowed for ${input.intent} tasks.`],
    };
  }
  const approval = decideHumanApproval({
    requiresHumanApproval: bypass.requiresHumanApproval,
    humanApprovalBridgeAvailable: input.humanApprovalBridgeAvailable,
    humanApproved: input.humanApproved,
    reason: input.reason ?? `Policy bypass for ${input.intent}`,
  });
  reasons.push(...approval.reasons);
  return {
    outcome: approval.outcome,
    allowed: approval.allowed,
    requiresHumanApproval: bypass.requiresHumanApproval,
    auditMetadataRequired: bypass.auditMetadataRequired,
    auditFields: bypass.auditFields,
    reasons,
  };
}

export function decideShellPermission(
  input: ShellPermissionDecisionInput,
): ShellPermissionDecision {
  const policy = getPermissionExecutionPolicy(input.intent);
  const mode = input.requestedMode ?? policy.defaultMode;
  const classification = classifyDangerousShellCommand(input.command);
  const reasons: string[] = [];
  let outcome: PermissionDecisionOutcome = "allow";
  let allowed = true;
  let requiresHumanApproval = policy.requiresHumanApproval;
  let bypassAllowed = false;

  if (!policy.shellPolicy.allowShell) {
    outcome = "deny";
    allowed = false;
    reasons.push(`Shell execution is not allowed for ${input.intent} tasks.`);
  }

  if (!isPermissionModeAllowedForIntent(input.intent, mode)) {
    if (!input.bypassRequested) {
      outcome = "deny";
      allowed = false;
      reasons.push(`Mode ${mode} is not allowed for ${input.intent} tasks without a bypass.`);
    } else {
      const bypass = decidePolicyBypass({
        intent: input.intent,
        requestedMode: mode,
        humanApprovalBridgeAvailable: input.humanApprovalBridgeAvailable,
        humanApproved: input.humanApproved,
        reason: `Mode ${mode} bypass for ${input.intent}`,
      });
      bypassAllowed = bypass.allowed;
      reasons.push(...bypass.reasons);
      if (!bypass.allowed) {
        outcome = bypass.outcome;
        allowed = false;
      }
    }
  }

  if (
    classification.categories.includes("network_transfer") &&
    !policy.shellPolicy.allowNetworkTransferCommands
  ) {
    requiresHumanApproval = true;
    reasons.push("Network transfer shell commands require human approval.");
  }

  if (classification.dangerous && policy.shellPolicy.dangerousCommandsRequireHumanApproval) {
    requiresHumanApproval = true;
    const approval = decideHumanApproval({
      requiresHumanApproval: true,
      humanApprovalBridgeAvailable: input.humanApprovalBridgeAvailable,
      humanApproved: input.humanApproved,
      reason: "Dangerous shell command",
    });
    reasons.push(...classification.reasons, ...approval.reasons);
    if (!approval.allowed) {
      outcome = approval.outcome;
      allowed = false;
    }
  }

  return {
    outcome,
    allowed,
    mode,
    requiresHumanApproval,
    reasons,
    classification,
    auditMetadata: {
      intent: input.intent,
      requestedMode: mode,
      defaultMode: policy.defaultMode,
      requiresHumanApproval,
      bypassRequested: input.bypassRequested === true,
      bypassAllowed,
      dangerousCategories: classification.categories,
    },
  };
}

function normalizePolicyPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function pathMatchesGlob(path: string, glob: string): boolean {
  const normalizedPath = normalizePolicyPath(path).toLowerCase();
  const normalizedGlob = normalizePolicyPath(glob).toLowerCase();
  if (normalizedGlob === "**/*") return true;
  const escaped = normalizedGlob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**/", "\u0000")
    .replaceAll("**", "\u0001")
    .replaceAll("*", "\u0002")
    .replaceAll("\u0000", "(?:.*/)?")
    .replaceAll("\u0001", ".*")
    .replaceAll("\u0002", "[^/]*");
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(normalizedPath);
}

export function isPathAllowedByPermissionPolicy(
  intent: PermissionPolicyIntent,
  path: string,
): boolean {
  const boundary = getPermissionExecutionPolicy(intent).fileBoundary;
  const normalized = normalizePolicyPath(path);
  if (boundary.forbiddenPathGlobs.some((glob) => pathMatchesGlob(normalized, glob))) return false;
  return boundary.allowedPathGlobs.some((glob) => pathMatchesGlob(normalized, glob));
}

export type RedactedPermissionPolicyValue<T> = T extends string
  ? string
  : T extends Array<infer U>
    ? Array<RedactedPermissionPolicyValue<U>>
    : T extends object
      ? { [K in keyof T]: RedactedPermissionPolicyValue<T[K]> }
      : T;

export function redactPermissionPolicyValue<T>(value: T): RedactedPermissionPolicyValue<T> {
  if (typeof value === "string") {
    return redactProviderText(value) as RedactedPermissionPolicyValue<T>;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      redactPermissionPolicyValue(entry),
    ) as RedactedPermissionPolicyValue<T>;
  }
  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const redactedKey = redactPermissionPolicyValue(key) as string;
      redacted[redactedKey] = redactPermissionPolicyValue(entry);
    }
    return redacted as RedactedPermissionPolicyValue<T>;
  }
  return value as RedactedPermissionPolicyValue<T>;
}
