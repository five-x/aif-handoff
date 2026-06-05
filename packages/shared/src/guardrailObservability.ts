import { relative } from "node:path";
import { redactProviderText } from "./runtimeLimitUtils.js";

export const AGENT_GUARDRAIL_COUNTERS = {
  TOOL_LOOP_BLOCKED: "agent_tool_loop_blocked_total",
  CHECKLIST_INCOMPLETE_BLOCK: "agent_checklist_incomplete_block_total",
  INVALID_MANIFEST_REJECTED: "agent_invalid_manifest_rejected_total",
  SAME_FAILURE_FAIL_CLOSED: "agent_same_failure_fail_closed_total",
  SPLIT_REQUIRED_DECISION: "agent_split_required_decision_total",
  PROMPT_CONTRACT_MISSING: "agent_prompt_contract_missing_total",
  WRITE_PATH_DENIED: "agent_write_path_denied_total",
  RUNTIME_RECOVERY_NO_DELTA: "agent_runtime_recovery_no_delta_total",
  OPERATOR_VERIFIED_COMPLETION_ACCEPTED: "agent_operator_verified_completion_accepted_total",
  OPERATOR_VERIFIED_COMPLETION_REJECTED: "agent_operator_verified_completion_rejected_total",
} as const;

export type AgentGuardrailCounter =
  (typeof AGENT_GUARDRAIL_COUNTERS)[keyof typeof AGENT_GUARDRAIL_COUNTERS];

export const AGENT_GUARDRAIL_ACTIONS = [
  "blocked",
  "rework",
  "manual",
  "fail_closed",
  "accepted",
  "rejected",
] as const;

export type AgentGuardrailAction = (typeof AGENT_GUARDRAIL_ACTIONS)[number];

export interface AgentGuardrailEvent {
  taskId: string | null;
  projectId: string | null;
  stage: string | null;
  workflowKind: string | null;
  runtimeProfileId: string | null;
  runtimeId: string | null;
  providerId: string | null;
  toolName: string | null;
  artifactPath: string | null;
  fingerprint: string | null;
  failureFingerprint: string | null;
  action: AgentGuardrailAction;
  reasonCode: string;
}

export interface BuildAgentGuardrailEventInput extends Partial<
  Omit<AgentGuardrailEvent, "action" | "reasonCode" | "artifactPath">
> {
  action: AgentGuardrailAction;
  reasonCode: string;
  artifactPath?: string | null;
  projectRoot?: string | null;
}

export interface AgentGuardrailMetric {
  event: AgentGuardrailCounter;
  metricKey: AgentGuardrailCounter;
  metricValue: 1;
  dimensions: Record<string, string | number | boolean | null>;
}

const EXTERNAL_PATH = "[external-path]";
const REDACTED_VALUE = "[redacted]";
const SECRET_SEGMENT_PATTERN =
  /(^\.env($|\.)|^\.ssh$|^keys?$|^id_(rsa|dsa|ecdsa|ed25519)$|private[-_]?key|token|secret|password|passwd|api[-_]?key|access[-_]?key|^key$)/i;
const WINDOWS_ABSOLUTE_PATTERN = /^[a-zA-Z]:[\\/]/;
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function sanitizeScalar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const withoutProviderText = redactProviderText(value)
    .replace(/\[REDACTED\]/g, REDACTED_VALUE)
    .replace(URL_PATTERN, REDACTED_VALUE)
    .replace(EMAIL_PATTERN, REDACTED_VALUE)
    .trim();
  if (!withoutProviderText) return null;
  if (withoutProviderText.length > 160) return `${withoutProviderText.slice(0, 157)}...`;
  return withoutProviderText;
}

function normalizePathSeparators(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function isAbsoluteLikePath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("//") ||
    WINDOWS_ABSOLUTE_PATTERN.test(value) ||
    value.startsWith("\\\\")
  );
}

function sanitizePathSegments(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .map((segment) =>
      SECRET_SEGMENT_PATTERN.test(segment) || segment.includes(REDACTED_VALUE)
        ? REDACTED_VALUE
        : segment,
    )
    .join("/");
}

export function sanitizeAgentGuardrailPath(
  value: unknown,
  options: { projectRoot?: string | null } = {},
): string | null {
  const sanitized = sanitizeScalar(value);
  if (!sanitized) return null;
  if (sanitized.includes(REDACTED_VALUE) && !/[\\/]/.test(sanitized)) return REDACTED_VALUE;
  if (/^\.\.(?:[\\/]|$)/.test(sanitized)) return EXTERNAL_PATH;

  const normalizedInput = normalizePathSeparators(sanitized);
  const normalizedRoot = options.projectRoot
    ? normalizePathSeparators(redactProviderText(options.projectRoot).trim())
    : null;

  if (isAbsoluteLikePath(normalizedInput)) {
    if (
      normalizedRoot &&
      normalizedInput.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ) {
      return sanitizePathSegments(normalizedInput.slice(normalizedRoot.length + 1)) || null;
    }
    if (normalizedRoot && normalizedInput.toLowerCase() === normalizedRoot.toLowerCase())
      return ".";
    return EXTERNAL_PATH;
  }

  if (normalizedRoot) {
    const rel = normalizePathSeparators(
      relative(normalizedRoot, `${normalizedRoot}/${normalizedInput}`),
    );
    if (rel.startsWith("../") || rel === "..") return EXTERNAL_PATH;
  }

  return sanitizePathSegments(normalizedInput) || null;
}

export function buildAgentGuardrailEvent(
  input: BuildAgentGuardrailEventInput,
): AgentGuardrailEvent {
  return {
    taskId: sanitizeScalar(input.taskId) ?? null,
    projectId: sanitizeScalar(input.projectId) ?? null,
    stage: sanitizeScalar(input.stage) ?? null,
    workflowKind: sanitizeScalar(input.workflowKind) ?? null,
    runtimeProfileId: sanitizeScalar(input.runtimeProfileId) ?? null,
    runtimeId: sanitizeScalar(input.runtimeId) ?? null,
    providerId: sanitizeScalar(input.providerId) ?? null,
    toolName: sanitizeScalar(input.toolName) ?? null,
    artifactPath: sanitizeAgentGuardrailPath(input.artifactPath, {
      projectRoot: input.projectRoot,
    }),
    fingerprint: sanitizeScalar(input.fingerprint) ?? null,
    failureFingerprint: sanitizeScalar(input.failureFingerprint) ?? null,
    action: input.action,
    reasonCode: sanitizeScalar(input.reasonCode) ?? "unknown",
  };
}

export function buildAgentGuardrailMetric(
  counter: AgentGuardrailCounter,
  event: AgentGuardrailEvent,
): AgentGuardrailMetric {
  return {
    event: counter,
    metricKey: counter,
    metricValue: 1,
    dimensions: Object.fromEntries(
      Object.entries(event).sort(([left], [right]) => left.localeCompare(right)),
    ) as Record<string, string | number | boolean | null>,
  };
}

export function formatAgentGuardrailActivityLine(
  counter: AgentGuardrailCounter,
  event: AgentGuardrailEvent,
): string {
  const details = [
    `action=${event.action}`,
    `stage=${event.stage ?? "unknown"}`,
    `reason=${event.reasonCode}`,
    event.toolName ? `tool=${event.toolName}` : null,
    event.artifactPath ? `artifact=${event.artifactPath}` : null,
    event.fingerprint ? `fingerprint=${event.fingerprint}` : null,
    event.failureFingerprint ? `failureFingerprint=${event.failureFingerprint}` : null,
  ].filter(Boolean);
  return `${counter}: ${details.join("; ")}`;
}

export function mapAgentGuardrailAttemptTrust(action: AgentGuardrailAction): {
  state: "accepted" | "rejected" | "blocked";
  outcome: "supported" | "refuted" | "blocked";
  trustLevel: "weak" | "untrusted";
} {
  if (action === "accepted") {
    return { state: "accepted", outcome: "supported", trustLevel: "weak" };
  }
  if (action === "rejected" || action === "rework") {
    return { state: "rejected", outcome: "refuted", trustLevel: "untrusted" };
  }
  return { state: "blocked", outcome: "blocked", trustLevel: "untrusted" };
}
