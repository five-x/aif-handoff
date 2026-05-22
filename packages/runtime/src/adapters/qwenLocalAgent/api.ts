/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import {
  AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE,
  buildAuditEvidencePayload,
  redactProviderText,
  redactProviderTextForLogs,
} from "@aif/shared";
import { RuntimeExecutionError } from "../../errors.js";
import { buildToolUseEvents } from "../../toolEvents.js";
import { classifyQwenLocalAgentRuntimeError } from "./errors.js";
import {
  QWEN_LOCAL_AGENT_TOOLS,
  createDefaultQwenToolContext,
  executeQwenLocalTool,
  appendQwenAuditEvidenceUnit,
  qwenToolResultForModel,
  sanitizeQwenToolNameForLog,
  sanitizeToolArguments,
  summarizeQwenToolUse,
} from "./tools.js";
const DEFAULT_BASE_URL_ENV_VAR = "QWEN_BASE_URL";
const DEFAULT_API_KEY_ENV_VAR = "QWEN_API_KEY";
const DEFAULT_MODEL_ENV_VAR = "QWEN_MODEL";
const DEFAULT_MAX_TOOL_TURNS = 12;
const MAX_CONFIGURED_TOOL_TURNS = 400;
const DEFAULT_REPEATED_TOOL_CALL_LIMIT = 6;
const REPEATED_TOOL_CALL_FINAL_SUPPRESSIONS = 2;
const REPOSITORY_INSPECTION_BUDGET_FINAL_DENIALS = 3;
const DEFAULT_REPOSITORY_INSPECTION_BUDGET_FINAL_RESPONSE_TIMEOUT_MS = 3 * 60 * 1000;
const TOKEN_ESTIMATE_CHARS_PER_TOKEN = 3;
const MIN_FINALIZATION_OUTPUT_TOKENS = 512;
const DEFAULT_ENDPOINT_COOLDOWN_MS = 30_000;
const DEFAULT_ENDPOINT_HEALTH_TIMEOUT_MS = 5_000;
const DEFAULT_ENDPOINT_COOLDOWN_WAIT_MAX_MS = 45_000;
const DEFAULT_ENDPOINT_HTTP_RETRY_LIMIT = 1;
const MAX_ENDPOINT_HTTP_RETRY_LIMIT = 3;
const REPOSITORY_INSPECTION_BUDGET_EXHAUSTED_STATUS = "repository_inspection_budget_exhausted";
const LOCAL_ENDPOINT_BUDGETS = new Map([
  [
    "8003",
    {
      maxInputTokens: 20_000,
      compactTargetInputTokens: 16_000,
      maxOutputTokens: 4_000,
      highInputMaxOutputTokens: 2_000,
      totalTokens: 24_000,
      toolResultMaxChars: 1_500,
      ledgerPreviewMaxChars: 320,
    },
  ],
  [
    "8005",
    {
      maxInputTokens: 60_000,
      compactTargetInputTokens: 48_000,
      maxOutputTokens: 8_000,
      highInputMaxOutputTokens: 4_000,
      totalTokens: 68_000,
      toolResultMaxChars: 3_000,
      ledgerPreviewMaxChars: 480,
    },
  ],
]);
const NONCONSECUTIVE_LOOP_PRONE_TOOLS = new Set([
  "finalize_audit_report_manifest",
  "git_commit",
  "validate_audit_report",
]);
const AUDIT_REPORT_REPEATED_TOOL_CALL_LIMIT = 2;
const TOOLLESS_WORKFLOWS = new Set(["roadmap-generate", "roadmap-extract"]);
const READ_ONLY_TOOL_NAMES = new Set([
  "list_files",
  "read_file",
  "search_files",
  "run_shell",
  "git_status",
]);
const REPOSITORY_INSPECTION_TOOL_NAMES = new Set([
  "list_files",
  "read_file",
  "search_files",
  "run_shell",
]);
const AUDIT_ARTIFACT_MAINTENANCE_TOOL_NAMES = new Set(["list_files", "read_file"]);
const MAX_REPOSITORY_INSPECTION_TOOL_BUDGET = 200;
const REPOSITORY_INSPECTION_BUDGET_FINALIZATION_CONTROLLED_FAILURE = "controlled_failure";
const LOCAL_WAIT_ABORT = Symbol("qwenLocalAgentLocalWaitAbort");
const endpointSemaphores = new Map();
const endpointCircuitBreakers = new Map();
const READ_ONLY_WORKFLOWS = new Set([
  "planner",
  "plan-checker",
  "reviewer",
  "review-gate",
  "review-security",
  "security_review",
]);
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function readString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function normalizeRepositoryBudgetPath(value) {
  const raw = readString(value);
  if (!raw) return null;
  const normalized = raw
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
  return normalized || ".";
}
function dirnameForRepositoryBudgetPath(normalizedPath) {
  const index = normalizedPath.lastIndexOf("/");
  return index > 0 ? normalizedPath.slice(0, index) : ".";
}
function isAuditArtifactMaintenanceToolCall(input, toolContext, toolName, args) {
  if (input.workflowKind !== "audit") return false;
  if (!AUDIT_ARTIFACT_MAINTENANCE_TOOL_NAMES.has(toolName)) return false;
  const artifactPath = normalizeRepositoryBudgetPath(
    toolContext.auditReportValidation?.expectedReportArtifactPath ??
      input.execution?.auditReportArtifactPath,
  );
  if (!artifactPath) return false;
  const allowed = toolContext.allowedWritePaths ?? [];
  if (allowed.length > 0 && !allowed.includes(artifactPath)) return false;
  const requestedPath = normalizeRepositoryBudgetPath(args.path);
  if (!requestedPath) return false;
  if (toolName === "read_file") return requestedPath === artifactPath;
  if (toolName === "list_files") {
    return requestedPath === dirnameForRepositoryBudgetPath(artifactPath);
  }
  return false;
}
function isRepositoryInspectionToolCall(input, toolContext, toolName, args) {
  return (
    REPOSITORY_INSPECTION_TOOL_NAMES.has(toolName) &&
    !isAuditArtifactMaintenanceToolCall(input, toolContext, toolName, args)
  );
}
function readNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function safeProviderErrorMessage(rawText, fallbackMessage) {
  const trimmed = rawText.trim();
  return trimmed.length > 0 ? redactProviderText(trimmed) : fallbackMessage;
}
export function assertQwenLocalAgentApiTransport(input) {
  if (input.transport && input.transport !== "api") {
    throw new RuntimeExecutionError(
      `qwen-local-agent supports only api transport, got ${input.transport}`,
      undefined,
      "permission",
    );
  }
}
function resolveBaseUrl(input) {
  const options = asRecord(input.options);
  const baseUrl =
    ("baseUrl" in input ? readString(input.baseUrl) : null) ??
    readString(options.baseUrl) ??
    readString(process.env[DEFAULT_BASE_URL_ENV_VAR]);
  if (!baseUrl) {
    throw new RuntimeExecutionError(
      "qwen-local-agent requires profile baseUrl or QWEN_BASE_URL",
      undefined,
      "transport",
    );
  }
  return baseUrl.replace(/\/+$/, "");
}
function parseEndpoint(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const port =
      url.port || (url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : "");
    if (!port) return null;
    return {
      key: `${url.protocol}//${url.hostname}:${port}`,
      port,
      label: `${url.hostname}:${port}`,
    };
  } catch {
    return null;
  }
}
function resolveEndpointPolicy(input) {
  const baseUrl = resolveBaseUrl(input);
  const endpoint = parseEndpoint(baseUrl);
  const budget = endpoint ? (LOCAL_ENDPOINT_BUDGETS.get(endpoint.port) ?? null) : null;
  return { baseUrl, endpoint, budget };
}
export function resetQwenLocalAgentEndpointStateForTests() {
  endpointSemaphores.clear();
  endpointCircuitBreakers.clear();
}
export function getQwenLocalAgentEndpointPolicyForTests(input) {
  return resolveEndpointPolicy(input);
}
function resolveApiKeyEnvVar(input) {
  const options = asRecord(input.options);
  return (
    ("apiKeyEnvVar" in input ? readString(input.apiKeyEnvVar) : null) ??
    readString(options.apiKeyEnvVar) ??
    DEFAULT_API_KEY_ENV_VAR
  );
}
function resolveApiKey(input) {
  const options = asRecord(input.options);
  const apiKeyEnvVar = resolveApiKeyEnvVar(input);
  return (
    ("apiKey" in input ? readString(input.apiKey) : null) ??
    readString(options.apiKey) ??
    readString(process.env[apiKeyEnvVar])
  );
}
function resolveModel(input) {
  const options = asRecord(input.options);
  const model =
    readString(input.model) ??
    readString(options.model) ??
    readString(process.env[DEFAULT_MODEL_ENV_VAR]);
  if (!model) {
    throw new RuntimeExecutionError(
      "qwen-local-agent requires a model from profile defaultModel, options.model, or QWEN_MODEL",
      undefined,
      "model_not_found",
    );
  }
  return model;
}
function buildHeaders(input) {
  const headers = new Headers({ "Content-Type": "application/json" });
  const apiKey = resolveApiKey(input);
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  const rawHeaders = {
    ...asRecord(asRecord(input.options).headers),
    ...("headers" in input ? asRecord(input.headers) : {}),
  };
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === "string") {
      headers.set(key, value);
    }
  }
  return headers;
}
function buildRunTimeoutSignal(input) {
  const runMs = input.execution?.runTimeoutMs;
  const externalAbort = input.execution?.abortController;
  const signals = [];
  if (typeof runMs === "number" && Number.isFinite(runMs) && runMs > 0) {
    signals.push(AbortSignal.timeout(Math.floor(runMs)));
  }
  if (externalAbort) {
    signals.push(externalAbort.signal);
  }
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  return AbortSignal.any(signals);
}
function buildCombinedTimeoutSignal(baseSignal, timeoutMs) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return baseSignal;
  }
  const timeoutSignal = AbortSignal.timeout(Math.floor(timeoutMs));
  if (!baseSignal) return timeoutSignal;
  return AbortSignal.any([baseSignal, timeoutSignal]);
}
function isAbortTimeoutError(error) {
  return (
    error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
  );
}
function abortError(message) {
  return new DOMException(message, "AbortError");
}
function localWaitAbortError(message) {
  const error = abortError(message);
  Object.defineProperty(error, LOCAL_WAIT_ABORT, { value: true });
  return error;
}
function isLocalWaitAbortError(error) {
  return Boolean(error && typeof error === "object" && error[LOCAL_WAIT_ABORT]);
}
function truncateTextForRequest(value, maxChars) {
  const text = String(value ?? "");
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
  const note = `\n[... compacted ${text.length - maxChars} chars for local endpoint budget ...]\n`;
  const available = Math.max(0, maxChars - note.length);
  if (available <= 0) return "[... compacted for local endpoint budget ...]";
  const head = Math.ceil(available * 0.65);
  const tail = available - head;
  return `${text.slice(0, head).trimEnd()}${note}${text.slice(text.length - tail).trimStart()}`;
}
function estimateMessagesInputTokens(input, messages) {
  const options = asRecord(input.options);
  const tools =
    options.toolsEnabled !== false ? resolveQwenToolsForWorkflow(input.workflowKind) : [];
  const serialized = JSON.stringify({
    messages,
    ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
  });
  return Math.ceil(serialized.length / TOKEN_ESTIMATE_CHARS_PER_TOKEN);
}
export function estimateQwenLocalAgentInputTokens(input, messages = buildMessages(input)) {
  return estimateMessagesInputTokens(input, messages);
}
function countToolCallsInMessages(messages) {
  return messages.reduce((count, message) => {
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0;
    return count + toolCalls;
  }, 0);
}
function buildCompactAuditEvidenceLedger(toolContext, maxPreviewChars) {
  const units = Array.isArray(toolContext?.auditEvidenceUnits)
    ? toolContext.auditEvidenceUnits
    : [];
  if (units.length === 0) {
    return "No runtime audit evidence units are available in this compacted transcript.";
  }
  const visible = units.slice(-40);
  const omitted = Math.max(0, units.length - visible.length);
  return [
    `Runtime audit evidence units available: ${units.length}${omitted > 0 ? ` (${omitted} earlier unit(s) omitted)` : ""}.`,
    "Use exact ev_* IDs only; do not invent or abbreviate evidence IDs.",
    ...visible.map((unit) => {
      const preview = truncateTextForRequest(
        (unit.outputPreview ?? "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 3)
          .join(" / "),
        maxPreviewChars,
      );
      return [
        `- ${unit.id}`,
        `kind=${unit.evidenceKind}/${unit.evidenceGrade}`,
        `tool=${unit.toolName}`,
        `scope=${Array.isArray(unit.scopeIds) ? unit.scopeIds.join(",") : "none"}`,
        `risks=${
          Array.isArray(unit.riskHypothesisIds) ? unit.riskHypothesisIds.join(",") : "none"
        }`,
        preview ? `preview=${preview}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
    }),
  ].join("\n");
}
function compactMessagesForEndpointBudget(input, messages, toolContext, reason, budget) {
  const systemMessage = messages.find((message) => message?.role === "system") ?? messages[0];
  const firstUser = messages.find((message) => message?.role === "user");
  const allowedWritePaths = input.execution?.allowedWritePaths ?? [];
  const auditArtifactPath = input.execution?.auditReportArtifactPath ?? null;
  const originalPrompt =
    typeof input.prompt === "string" && input.prompt.trim().length > 0
      ? input.prompt
      : typeof firstUser?.content === "string"
        ? firstUser.content
        : "";
  const taskPrompt = truncateTextForRequest(
    originalPrompt,
    budget.compactTargetInputTokens * TOKEN_ESTIMATE_CHARS_PER_TOKEN * 0.35,
  );
  const ledger = buildCompactAuditEvidenceLedger(toolContext, budget.ledgerPreviewMaxChars);
  const compactUser = [
    "QWEN COMPACT CONTEXT MODE",
    `reason=${reason}`,
    "The prior transcript was compacted to protect the local endpoint context and memory budget.",
    "Do not request broad repository inspection. Use existing evidence and write/finalize the requested artifact, or produce a controlled source_inconclusive result with exact coverage gaps.",
    auditArtifactPath ? `Expected audit report artifact: ${auditArtifactPath}` : null,
    allowedWritePaths.length > 0 ? `Allowed write paths: ${allowedWritePaths.join(", ")}` : null,
    "",
    "Original task prompt (compacted):",
    taskPrompt,
    "",
    "Compact audit evidence ledger:",
    ledger,
  ]
    .filter((entry) => entry !== null)
    .join("\n");
  return [
    systemMessage,
    {
      role: "user",
      content: compactUser,
    },
  ].filter(Boolean);
}
function endpointMaxOutputTokensForInput(budget, estimatedInputTokens) {
  const endpointMax =
    estimatedInputTokens >= budget.compactTargetInputTokens
      ? Math.min(budget.maxOutputTokens, budget.highInputMaxOutputTokens)
      : budget.maxOutputTokens;
  return Math.min(endpointMax, Math.max(0, budget.totalTokens - estimatedInputTokens));
}
function maxOutputTokensForBudget(options, budget, estimatedInputTokens) {
  const configured = readNumber(options.maxTokens);
  if (!budget) return configured;
  const endpointCap = endpointMaxOutputTokensForInput(budget, estimatedInputTokens);
  const requested = configured == null ? budget.maxOutputTokens : configured;
  return Math.min(requested, endpointCap);
}
function remainingEndpointOutputBudget(budget, estimatedInputTokens) {
  if (!budget) return null;
  return Math.min(budget.maxOutputTokens, Math.max(0, budget.totalTokens - estimatedInputTokens));
}
function shouldCompactAuditTranscriptForSoftEndpointBudget(
  input,
  repositoryInspectionToolCalls,
  estimatedInputTokens,
  budget,
) {
  return (
    input.workflowKind === "audit" &&
    repositoryInspectionToolCalls > 0 &&
    estimatedInputTokens > budget.compactTargetInputTokens
  );
}
function requestEstimateFailureClass(error) {
  if (error instanceof RuntimeExecutionError) {
    const status = asRecord(error.providerMeta).status;
    return typeof status === "string" ? status : error.category;
  }
  return endpointFailureCategory(error);
}
function buildMessages(input) {
  const messages = [];
  const baseSystem =
    "You are qwen-local-agent, an AIF-controlled repository worker. Use only the provided tools. All paths are relative to the project root. Do not request, read, print, or summarize secrets. Finish with a concise result.";
  let systemContent = input.systemPrompt ? `${baseSystem}\n\n${input.systemPrompt}` : baseSystem;
  if (input.execution?.systemPromptAppend) {
    systemContent = `${systemContent}\n\n${input.execution.systemPromptAppend}`;
  }
  messages.push({ role: "system", content: systemContent });
  messages.push({ role: "user", content: input.prompt });
  return messages;
}
function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const parsed = usage;
  const inputTokens = parsed.prompt_tokens ?? parsed.inputTokens ?? 0;
  const outputTokens = parsed.completion_tokens ?? parsed.outputTokens ?? 0;
  const totalTokens = parsed.total_tokens ?? parsed.totalTokens ?? inputTokens + outputTokens;
  const costUsd =
    typeof parsed.cost === "number"
      ? parsed.cost
      : typeof parsed.costUsd === "number"
        ? parsed.costUsd
        : undefined;
  return { inputTokens, outputTokens, totalTokens, costUsd };
}
function addUsage(left, right) {
  if (!right) return left;
  if (!left) return right;
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    costUsd:
      left.costUsd != null || right.costUsd != null
        ? (left.costUsd ?? 0) + (right.costUsd ?? 0)
        : undefined,
  };
}
export function buildQwenLocalAgentRequestBody(input, messages = buildMessages(input)) {
  const options = asRecord(input.options);
  const { budget } = resolveEndpointPolicy(input);
  const estimatedInputTokens = estimateMessagesInputTokens(input, messages);
  if (budget && estimatedInputTokens > budget.maxInputTokens) {
    throw new RuntimeExecutionError(
      `qwen-local-agent request estimate ${estimatedInputTokens} input token(s) exceeds endpoint input budget ${budget.maxInputTokens}`,
      undefined,
      "context_length",
      {
        providerMeta: {
          status: "endpoint_input_budget_exceeded",
          category: "context_length",
        },
      },
    );
  }
  const body = {
    model: resolveModel(input),
    messages,
    stream: false,
  };
  const tools = resolveQwenToolsForWorkflow(input.workflowKind);
  if (options.toolsEnabled !== false && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const temperature = readNumber(options.temperature);
  const maxTokens = maxOutputTokensForBudget(options, budget, estimatedInputTokens);
  const topP = readNumber(options.topP);
  if (temperature != null) body.temperature = temperature;
  if (maxTokens != null) {
    const remainingOutputBudget = remainingEndpointOutputBudget(budget, estimatedInputTokens);
    if (remainingOutputBudget != null && remainingOutputBudget < MIN_FINALIZATION_OUTPUT_TOKENS) {
      throw new RuntimeExecutionError(
        `qwen-local-agent request estimate ${estimatedInputTokens} input token(s) leaves only ${remainingOutputBudget} output token(s), below minimum ${MIN_FINALIZATION_OUTPUT_TOKENS}`,
        undefined,
        "context_length",
        {
          providerMeta: {
            status: "endpoint_total_budget_exceeded",
            category: "context_length",
          },
        },
      );
    }
    body.max_tokens = Math.floor(maxTokens);
  }
  if (topP != null) body.top_p = topP;
  return body;
}
function resolveQwenToolsForWorkflow(workflowKind) {
  if (TOOLLESS_WORKFLOWS.has(workflowKind)) return [];
  if (READ_ONLY_WORKFLOWS.has(workflowKind)) {
    return QWEN_LOCAL_AGENT_TOOLS.filter((tool) => READ_ONLY_TOOL_NAMES.has(tool.function.name));
  }
  return QWEN_LOCAL_AGENT_TOOLS;
}
function isQwenToolAllowedForWorkflow(workflowKind, toolName) {
  return resolveQwenToolsForWorkflow(workflowKind).some((tool) => tool.function.name === toolName);
}
function readMaxToolTurns(input) {
  const options = asRecord(input.options);
  const raw =
    typeof input.execution?.maxTurns === "number"
      ? input.execution.maxTurns
      : typeof options.maxToolTurns === "number"
        ? options.maxToolTurns
        : DEFAULT_MAX_TOOL_TURNS;
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_TOOL_TURNS;
  return Math.max(1, Math.min(Math.floor(raw), MAX_CONFIGURED_TOOL_TURNS));
}
function readRepositoryInspectionToolBudget(input) {
  const options = asRecord(input.options);
  const raw =
    typeof input.execution?.repositoryInspectionToolBudget === "number"
      ? input.execution.repositoryInspectionToolBudget
      : typeof options.repositoryInspectionToolBudget === "number"
        ? options.repositoryInspectionToolBudget
        : null;
  if (raw == null) return null;
  if (!Number.isFinite(raw) || raw < 0) return null;
  return Math.max(0, Math.min(Math.floor(raw), MAX_REPOSITORY_INSPECTION_TOOL_BUDGET));
}
function readRepositoryInspectionBudgetFinalResponseTimeoutMs(input) {
  const options = asRecord(input.options);
  const raw =
    typeof input.execution?.repositoryInspectionBudgetFinalResponseTimeoutMs === "number"
      ? input.execution.repositoryInspectionBudgetFinalResponseTimeoutMs
      : typeof options.repositoryInspectionBudgetFinalResponseTimeoutMs === "number"
        ? options.repositoryInspectionBudgetFinalResponseTimeoutMs
        : DEFAULT_REPOSITORY_INSPECTION_BUDGET_FINAL_RESPONSE_TIMEOUT_MS;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.floor(raw);
}
function readRepositoryInspectionBudgetFinalizationMode(input) {
  const options = asRecord(input.options);
  const raw =
    typeof input.execution?.repositoryInspectionBudgetFinalizationMode === "string"
      ? input.execution.repositoryInspectionBudgetFinalizationMode
      : typeof options.repositoryInspectionBudgetFinalizationMode === "string"
        ? options.repositoryInspectionBudgetFinalizationMode
        : null;
  return raw === REPOSITORY_INSPECTION_BUDGET_FINALIZATION_CONTROLLED_FAILURE
    ? REPOSITORY_INSPECTION_BUDGET_FINALIZATION_CONTROLLED_FAILURE
    : "compact_final_response";
}
function readRepeatedToolCallLimit(input) {
  const options = asRecord(input.options);
  const raw =
    typeof options.repeatedToolCallLimit === "number"
      ? options.repeatedToolCallLimit
      : DEFAULT_REPEATED_TOOL_CALL_LIMIT;
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_REPEATED_TOOL_CALL_LIMIT;
  return Math.max(2, Math.min(Math.floor(raw), 12));
}
function repeatedToolCallLimitForTool(workflowKind, toolName, fallbackLimit) {
  if (
    workflowKind === "audit" &&
    (toolName === "finalize_audit_report_manifest" || toolName === "validate_audit_report")
  ) {
    return Math.min(fallbackLimit, AUDIT_REPORT_REPEATED_TOOL_CALL_LIMIT);
  }
  return fallbackLimit;
}
function parseToolArguments(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed);
    return asRecord(parsed);
  }
  return asRecord(raw);
}
function normalizeToolCalls(value) {
  if (!Array.isArray(value)) return [];
  const calls = [];
  for (const item of value) {
    const record = asRecord(item);
    const fn = asRecord(record.function);
    const name = readString(fn.name);
    if (!name) continue;
    const rawArgs = fn.arguments;
    calls.push({
      id: readString(record.id) ?? `tool-${calls.length + 1}`,
      type: "function",
      function: {
        name,
        arguments: typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs ?? {}),
      },
    });
  }
  return calls;
}
function stableToolValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableToolValue(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableToolValue(child)]),
  );
}
function buildToolCallSignature(toolName, args) {
  return JSON.stringify({ toolName, args: stableToolValue(args) });
}
function emitEvent(input, events, event) {
  events.push(event);
  input.execution?.onEvent?.(event);
}
function emitToolUse(input, events, toolCall, args) {
  const timestamp = new Date().toISOString();
  const safeToolName = sanitizeQwenToolNameForLog(toolCall.function.name);
  const sanitizedArgs = sanitizeToolArguments(toolCall.function.name, args);
  const detail = summarizeQwenToolUse(safeToolName, sanitizedArgs);
  for (const event of buildToolUseEvents({
    toolName: safeToolName,
    toolUseId: redactProviderText(toolCall.id),
    input: sanitizedArgs,
    timestamp,
    detailSuffix: detail,
  })) {
    emitEvent(input, events, event);
  }
  input.execution?.onToolUse?.(safeToolName, detail);
}
function emitToolResult(input, events, toolCall, result) {
  const safeToolName = sanitizeQwenToolNameForLog(toolCall.function.name);
  emitEvent(input, events, {
    type: "tool:result",
    timestamp: new Date().toISOString(),
    level: result.ok ? "info" : "warn",
    message: `${safeToolName} ${result.ok ? "ok" : "failed"}`,
    data: {
      name: safeToolName,
      id: redactProviderText(toolCall.id),
      ok: result.ok,
      exitCode: result.exitCode ?? null,
      touchedFiles: result.touchedFiles.map((file) => redactProviderText(file)),
      ...(result.error ? { error: redactProviderText(result.error) } : {}),
    },
  });
}
function buildAuditEvidenceResultForTool(input, toolContext, toolCall, args, result) {
  if (result.repositoryInspectionBudgetExhausted === true) return;
  if (result.auditReportRepairInspectionDenied === true) return;
  const toolName = sanitizeQwenToolNameForLog(toolCall.function.name);
  if (isAuditArtifactMaintenanceToolCall(input, toolContext, toolName, args)) return;
  let evidenceKind = null;
  let evidenceGrade = undefined;
  let paths = [];
  let command = null;
  if (toolName === "read_file") {
    evidenceKind = "file_read";
    evidenceGrade = "substantive";
    if (typeof args.path === "string") paths = [args.path];
  } else if (toolName === "list_files") {
    evidenceKind = "search";
    evidenceGrade = "discovery";
    if (typeof args.path === "string") paths = [args.path];
  } else if (toolName === "search_files") {
    evidenceKind = "search";
    evidenceGrade = "substantive";
    if (typeof args.path === "string") paths = [args.path];
  } else if (toolName === "run_shell") {
    evidenceKind = "shell_command";
    command = {
      command: typeof args.command === "string" ? args.command : "",
      args: Array.isArray(args.args) ? args.args.filter((entry) => typeof entry === "string") : [],
      cwd: typeof args.cwd === "string" ? args.cwd : null,
    };
    if (typeof args.cwd === "string") paths = [args.cwd];
  } else if (toolName === "git_status") {
    evidenceKind = "shell_command";
    evidenceGrade = "discovery";
    command = { command: "git status", args: ["--short", "--branch"], cwd: null };
  }
  if (!evidenceKind) return;
  const output = [result.output, result.error ? `error:\n${result.error}` : ""]
    .filter(Boolean)
    .join("\n");
  return buildAuditEvidencePayload({
    toolName,
    evidenceKind,
    evidenceGrade,
    paths,
    command,
    exitCode: result.exitCode ?? null,
    output,
  });
}
function emitAuditEvidenceResult(input, events, toolCall, evidenceUnit, result) {
  if (!evidenceUnit) return;
  emitEvent(input, events, {
    type: AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE,
    timestamp: new Date().toISOString(),
    level: result.ok ? "info" : "warn",
    message: `${sanitizeQwenToolNameForLog(toolCall.function.name)} audit evidence captured`,
    data: {
      auditEvidence: evidenceUnit,
      evidenceUnit,
    },
  });
}
function repeatedToolCallResult(toolName, repeatedCount, repeatedToolCallLimit) {
  const safeToolName = sanitizeQwenToolNameForLog(toolName);
  return {
    ok: false,
    output: "",
    error: [
      `Repeated identical ${safeToolName} call suppressed after ${repeatedCount} consecutive attempts.`,
      "Do not call the same tool with the same arguments again.",
      "Use a different verification step, commit required artifacts, or finish with the final result.",
      `repeatLimit=${repeatedToolCallLimit}`,
    ].join(" "),
    exitCode: null,
    touchedFiles: [],
  };
}
function repositoryInspectionBudgetExhaustedResult(toolName, budget) {
  const safeToolName = sanitizeQwenToolNameForLog(toolName);
  return {
    ok: false,
    output: "",
    error: [
      `Repository inspection budget exhausted after ${budget} inspection tool call(s).`,
      `Do not call ${safeToolName} or other repository-inspection tools again in this run.`,
      "Use the evidence already collected to write the required artifact with write_file or apply_patch,",
      "then use git_status/git_commit if needed, or finish with explicit limitations.",
      `repositoryInspectionToolBudget=${budget}`,
    ].join(" "),
    exitCode: null,
    touchedFiles: [],
    repositoryInspectionBudgetExhausted: true,
  };
}
function repositoryInspectionBudgetControlledFailure(toolCalls, budget) {
  return new RuntimeExecutionError(
    `qwen-local-agent stopped before finalization after repository inspection budget exhausted (${budget} inspection tool call(s)).`,
    undefined,
    "context_length",
    {
      providerMeta: {
        status: REPOSITORY_INSPECTION_BUDGET_EXHAUSTED_STATUS,
        category: "context_length",
        reason: "controlled_failure_after_repository_inspection_budget_exhaustion",
        repositoryInspectionToolCalls: toolCalls,
        repositoryInspectionToolBudget: budget,
      },
    },
  );
}
function auditReportRepairInspectionDeniedResult(toolName) {
  const safeToolName = sanitizeQwenToolNameForLog(toolName);
  return {
    ok: false,
    output: "",
    error: [
      `Audit report low-quality repair lock is active; ${safeToolName} cannot inspect source files during this repair.`,
      "Use the existing ledger evidence and edit only the audit report artifact.",
      "If the rejected findings cannot be made concrete from existing evidence, delete them and rewrite the report as validated_no_findings or source_inconclusive as appropriate.",
      "Then call finalize_audit_report_manifest and validate_audit_report again.",
    ].join(" "),
    exitCode: null,
    touchedFiles: [],
    auditReportRepairInspectionDenied: true,
  };
}
function isLowQualityAuditReportRepairValidationResult(toolName, result) {
  return (
    toolName === "validate_audit_report" &&
    result?.ok === false &&
    typeof result.output === "string" &&
    result.output.includes("repairDirective=LOW_QUALITY_AUDIT_REPORT_REPAIR_REQUIRED")
  );
}
function readEndpointCooldownMs(input) {
  const options = asRecord(input.options);
  const raw = readNumber(options.endpointCooldownMs);
  if (raw == null || raw <= 0) return DEFAULT_ENDPOINT_COOLDOWN_MS;
  return Math.max(1_000, Math.floor(raw));
}
function readEndpointHealthTimeoutMs(input) {
  const options = asRecord(input.options);
  const raw = readNumber(options.endpointHealthTimeoutMs);
  if (raw == null || raw <= 0) return DEFAULT_ENDPOINT_HEALTH_TIMEOUT_MS;
  return Math.max(1_000, Math.floor(raw));
}
function readEndpointCooldownWaitMaxMs(input) {
  const options = asRecord(input.options);
  const raw = readNumber(options.endpointCooldownWaitMaxMs);
  if (raw == null || raw < 0) return DEFAULT_ENDPOINT_COOLDOWN_WAIT_MAX_MS;
  return Math.floor(raw);
}
function readEndpointHttpRetryLimit(input) {
  const options = asRecord(input.options);
  const raw = readNumber(options.endpointHttpRetryLimit);
  if (raw == null || raw < 0) return DEFAULT_ENDPOINT_HTTP_RETRY_LIMIT;
  return Math.min(MAX_ENDPOINT_HTTP_RETRY_LIMIT, Math.floor(raw));
}
async function delayWithAbort(ms, signal, message) {
  if (ms <= 0) return;
  if (signal?.aborted) {
    throw localWaitAbortError(message);
  }
  await new Promise((resolve, reject) => {
    let timeout;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener?.("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(localWaitAbortError(message));
    };
    timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}
function endpointFailureCategory(error) {
  if (error instanceof RuntimeExecutionError) return error.category;
  if (isAbortTimeoutError(error)) return "timeout";
  return classifyQwenLocalAgentRuntimeError(error).category;
}
function shouldTripEndpointCircuit(error) {
  return ["transport", "stream", "timeout"].includes(endpointFailureCategory(error));
}
function isHttp5xxEndpointTransportError(error) {
  if (!(error instanceof RuntimeExecutionError)) return false;
  return (
    error.category === "transport" &&
    typeof error.httpStatus === "number" &&
    error.httpStatus >= 500 &&
    error.httpStatus < 600
  );
}
function isEndpointCooldownRuntimeError(error) {
  return (
    error instanceof RuntimeExecutionError &&
    asRecord(error.providerMeta).status === "endpoint_cooldown"
  );
}
function withEndpointCooldown(error, retryAfterSeconds) {
  return new RuntimeExecutionError(
    error instanceof Error ? error.message : String(error),
    error,
    endpointFailureCategory(error),
    {
      retryAfterSeconds,
      providerMeta: {
        status: "endpoint_cooldown",
        category: endpointFailureCategory(error),
        retryAfterSeconds,
      },
    },
  );
}
function withRepositoryInspectionBudgetStatus(error, categoryOverride) {
  const category = categoryOverride ?? endpointFailureCategory(error);
  return new RuntimeExecutionError(
    error instanceof Error ? error.message : String(error),
    error,
    category,
    {
      retryAfterSeconds: error instanceof RuntimeExecutionError ? error.retryAfterSeconds : null,
      providerMeta: {
        ...(error instanceof RuntimeExecutionError ? (error.providerMeta ?? {}) : {}),
        status: REPOSITORY_INSPECTION_BUDGET_EXHAUSTED_STATUS,
        category,
      },
    },
  );
}
function buildEndpointCircuitError(endpoint, retryAfterSeconds, cause) {
  return new RuntimeExecutionError(
    `qwen-local-agent endpoint ${endpoint.label} is cooling down after transport/timeout failure`,
    cause,
    "transport",
    {
      retryAfterSeconds,
      providerMeta: {
        status: "endpoint_cooldown",
        category: "transport",
        retryAfterSeconds,
      },
    },
  );
}
async function checkEndpointHealth(input, baseUrl, signal) {
  const timeoutSignal = buildCombinedTimeoutSignal(signal, readEndpointHealthTimeoutMs(input));
  const response = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers: buildHeaders(input),
    ...(timeoutSignal ? { signal: timeoutSignal } : {}),
  });
  if (!response.ok) {
    throw classifyQwenLocalAgentRuntimeError(
      new Error(`Qwen local endpoint health check failed with status ${response.status}`),
      response.status,
    );
  }
}
async function assertEndpointCircuitAllowsRequest(input, policy, signal, logger) {
  if (!policy.endpoint || !policy.budget) return;
  const maxWaitMs = readEndpointCooldownWaitMaxMs(input);
  for (;;) {
    const state = endpointCircuitBreakers.get(policy.endpoint.key);
    if (!state) return;
    const remainingMs = Math.max(0, (state.cooldownUntilMs ?? 0) - Date.now());
    if (remainingMs > 0) {
      const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      if (remainingMs > maxWaitMs) {
        throw buildEndpointCircuitError(policy.endpoint, remainingSeconds);
      }
      logger?.info?.(
        {
          runtimeId: input.runtimeId,
          profileId: input.profileId ?? null,
          baseUrl: policy.baseUrl,
          endpointKey: policy.endpoint.key,
          cooldownWaitMs: remainingMs,
        },
        "Waiting for qwen-local-agent endpoint circuit cooldown before health check",
      );
      await delayWithAbort(remainingMs, signal, "qwen-local-agent endpoint cooldown wait aborted");
      continue;
    }
    try {
      await checkEndpointHealth(input, policy.baseUrl, signal);
      endpointCircuitBreakers.delete(policy.endpoint.key);
      logger?.info?.(
        {
          runtimeId: input.runtimeId,
          profileId: input.profileId ?? null,
          baseUrl: policy.baseUrl,
          endpointKey: policy.endpoint.key,
        },
        "Qwen local endpoint circuit closed after health check",
      );
      return;
    } catch (error) {
      const currentState = endpointCircuitBreakers.get(policy.endpoint.key) ?? state;
      const cooldownMs = readEndpointCooldownMs(input);
      const failures = (currentState.failures ?? 0) + 1;
      endpointCircuitBreakers.set(policy.endpoint.key, {
        failures,
        cooldownUntilMs: Date.now() + cooldownMs,
      });
      throw buildEndpointCircuitError(
        policy.endpoint,
        Math.ceil(cooldownMs / 1000),
        classifyQwenLocalAgentRuntimeError(error),
      );
    }
  }
}
function recordEndpointFailure(input, policy, error, logger) {
  if (isLocalWaitAbortError(error)) return null;
  if (isEndpointCooldownRuntimeError(error)) return null;
  if (!policy.endpoint || !policy.budget || !shouldTripEndpointCircuit(error)) return null;
  const previous = endpointCircuitBreakers.get(policy.endpoint.key);
  const cooldownMs = readEndpointCooldownMs(input);
  const failures = (previous?.failures ?? 0) + 1;
  const multiplier = Math.min(failures, 4);
  const retryAfterSeconds = Math.ceil((cooldownMs * multiplier) / 1000);
  endpointCircuitBreakers.set(policy.endpoint.key, {
    failures,
    cooldownUntilMs: Date.now() + retryAfterSeconds * 1000,
  });
  logger?.warn?.(
    {
      runtimeId: input.runtimeId,
      profileId: input.profileId ?? null,
      baseUrl: policy.baseUrl,
      endpointKey: policy.endpoint.key,
      endpointFailureCategory: endpointFailureCategory(error),
      failures,
      retryAfterSeconds,
    },
    "Opened qwen-local-agent endpoint circuit after runtime failure",
  );
  return retryAfterSeconds;
}
async function acquireEndpointSemaphore(policy, signal) {
  if (!policy.endpoint || !policy.budget) return () => {};
  let state = endpointSemaphores.get(policy.endpoint.key);
  if (!state) {
    state = { active: false, queue: [] };
    endpointSemaphores.set(policy.endpoint.key, state);
  }
  if (signal?.aborted) {
    throw localWaitAbortError("qwen-local-agent endpoint semaphore wait aborted");
  }
  if (state.active) {
    await new Promise((resolve, reject) => {
      const entry = {
        resolve: () => {
          cleanup();
          resolve();
        },
        reject,
        onAbort: () => {
          const index = state.queue.indexOf(entry);
          if (index >= 0) state.queue.splice(index, 1);
          cleanup();
          reject(localWaitAbortError("qwen-local-agent endpoint semaphore wait aborted"));
        },
      };
      const cleanup = () => {
        signal?.removeEventListener?.("abort", entry.onAbort);
      };
      signal?.addEventListener?.("abort", entry.onAbort, { once: true });
      state.queue.push(entry);
    });
  }
  state.active = true;
  return () => {
    const next = state.queue.shift();
    if (next) {
      next.resolve();
    } else {
      state.active = false;
    }
  };
}
async function withEndpointSemaphore(policy, signal, fn) {
  if (!policy.endpoint || !policy.budget) return fn();
  const release = await acquireEndpointSemaphore(policy, signal);
  try {
    return await fn();
  } finally {
    release();
  }
}
async function postChatCompletions(input, messages, signal, requestMeta, logger) {
  const policy = resolveEndpointPolicy(input);
  const estimatedInputTokens = estimateMessagesInputTokens(input, messages);
  let body;
  const projectedMaxOutputTokens = maxOutputTokensForBudget(
    asRecord(input.options),
    policy.budget,
    estimatedInputTokens,
  );
  const baseRetryCount = requestMeta?.retryCount ?? 0;
  const maxHttpRetries = policy.budget ? readEndpointHttpRetryLimit(input) : 0;
  const baseLogContext = {
    runtimeId: input.runtimeId,
    profileId: input.profileId ?? null,
    baseUrl: policy.baseUrl,
    estimatedInputTokens,
    maxOutputTokens:
      typeof projectedMaxOutputTokens === "number" ? Math.floor(projectedMaxOutputTokens) : null,
    toolCallCount: requestMeta?.toolCallCount ?? countToolCallsInMessages(messages),
    turn: requestMeta?.turn ?? null,
  };
  let attempt = 0;
  const buildStartedAt = Date.now();
  try {
    body = buildQwenLocalAgentRequestBody(input, messages);
  } catch (error) {
    logger?.warn?.(
      {
        ...baseLogContext,
        retryCount: baseRetryCount,
        durationMs: Date.now() - buildStartedAt,
        failureClass: requestEstimateFailureClass(error),
      },
      "qwen-local-agent request estimate",
    );
    throw error;
  }
  baseLogContext.maxOutputTokens =
    typeof body.max_tokens === "number" ? body.max_tokens : baseLogContext.maxOutputTokens;
  for (;;) {
    const startedAt = Date.now();
    const logContext = {
      ...baseLogContext,
      retryCount: baseRetryCount + attempt,
    };
    try {
      const response = await withEndpointSemaphore(policy, signal, async () => {
        await assertEndpointCircuitAllowsRequest(input, policy, signal, logger);
        return fetch(`${policy.baseUrl}/chat/completions`, {
          method: "POST",
          headers: buildHeaders(input),
          body: JSON.stringify(body),
          ...(signal ? { signal } : {}),
        });
      });
      logger?.info?.(
        {
          ...logContext,
          durationMs: Date.now() - startedAt,
          failureClass: response.ok ? null : `http_${response.status}`,
        },
        "qwen-local-agent request estimate",
      );
      if (response.ok) {
        if (policy.endpoint) endpointCircuitBreakers.delete(policy.endpoint.key);
        return response;
      }
      const httpError = classifyQwenLocalAgentRuntimeError(
        new Error(`Qwen local agent request failed with status ${response.status}`),
        response.status,
      );
      const retryAfterSeconds = recordEndpointFailure(input, policy, httpError, logger);
      if (
        retryAfterSeconds != null &&
        attempt < maxHttpRetries &&
        isHttp5xxEndpointTransportError(httpError)
      ) {
        attempt += 1;
        logger?.warn?.(
          {
            ...baseLogContext,
            retryCount: baseRetryCount + attempt,
            retryAfterSeconds,
            failureClass: `http_${response.status}`,
          },
          "Retrying qwen-local-agent request after endpoint HTTP 5xx cooldown",
        );
        continue;
      }
      if (retryAfterSeconds != null) {
        throw withEndpointCooldown(httpError, retryAfterSeconds);
      }
      return response;
    } catch (error) {
      const retryAfterSeconds = recordEndpointFailure(input, policy, error, logger);
      logger?.warn?.(
        {
          ...logContext,
          durationMs: Date.now() - startedAt,
          failureClass: requestEstimateFailureClass(error),
          retryAfterSeconds,
        },
        "qwen-local-agent request estimate",
      );
      if (retryAfterSeconds != null) {
        throw withEndpointCooldown(error, retryAfterSeconds);
      }
      throw error;
    }
  }
}
export async function runQwenLocalAgentApi(input, logger) {
  assertQwenLocalAgentApiTransport(input);
  const signal = buildRunTimeoutSignal(input);
  let messages = buildMessages(input);
  const events = [];
  const maxTurns = readMaxToolTurns(input);
  const repositoryInspectionToolBudget = readRepositoryInspectionToolBudget(input);
  const repositoryInspectionBudgetFinalResponseTimeoutMs =
    readRepositoryInspectionBudgetFinalResponseTimeoutMs(input);
  const repositoryInspectionBudgetFinalizationMode =
    readRepositoryInspectionBudgetFinalizationMode(input);
  const repeatedToolCallLimit = readRepeatedToolCallLimit(input);
  const toolContext = createDefaultQwenToolContext({
    projectRoot: input.projectRoot,
    cwd: input.cwd,
    workflowKind: input.workflowKind,
    signal,
    options: asRecord(input.options),
    environment: input.execution?.environment,
    execution: input.execution,
  });
  let usage = null;
  let sessionId = null;
  let raw = null;
  let lastToolCallSignature = null;
  let repeatedToolCallCount = 0;
  let repeatedToolCallSuppressions = 0;
  let repositoryInspectionToolCalls = 0;
  let repositoryInspectionBudgetWarnings = 0;
  let repositoryInspectionBudgetCompacted = false;
  let toolCallCount = 0;
  let auditLowQualityRepairLock = false;
  const toolCallSignatureCounts = new Map();
  logger?.info?.(
    {
      runtimeId: input.runtimeId,
      profileId: input.profileId ?? null,
      model: input.model ?? null,
      maxTurns,
      repositoryInspectionToolBudget,
    },
    "Starting qwen-local-agent run",
  );
  try {
    for (let turn = 0; turn < maxTurns; turn += 1) {
      const repositoryInspectionBudgetExhausted =
        repositoryInspectionToolBudget != null &&
        repositoryInspectionToolCalls >= repositoryInspectionToolBudget;
      if (
        repositoryInspectionBudgetExhausted &&
        repositoryInspectionBudgetFinalizationMode ===
          REPOSITORY_INSPECTION_BUDGET_FINALIZATION_CONTROLLED_FAILURE
      ) {
        logger?.warn?.(
          {
            runtimeId: input.runtimeId,
            profileId: input.profileId ?? null,
            repositoryInspectionToolCalls,
            repositoryInspectionToolBudget,
          },
          "Stopped qwen-local-agent with controlled failure after repository inspection budget exhaustion",
        );
        throw repositoryInspectionBudgetControlledFailure(
          repositoryInspectionToolCalls,
          repositoryInspectionToolBudget,
        );
      }
      const budgetFinalizationTimeoutActive =
        repositoryInspectionBudgetExhausted &&
        repositoryInspectionBudgetFinalResponseTimeoutMs != null;
      const policy = resolveEndpointPolicy(input);
      const estimatedBeforeCompaction = estimateMessagesInputTokens(input, messages);
      const shouldCompactForHardEndpointBudget = Boolean(
        policy.budget && estimatedBeforeCompaction > policy.budget.maxInputTokens,
      );
      const shouldCompactForRepositoryInspectionBudget = Boolean(
        policy.budget && budgetFinalizationTimeoutActive && !repositoryInspectionBudgetCompacted,
      );
      const shouldCompactForSoftEndpointBudget = Boolean(
        policy.budget &&
        !shouldCompactForRepositoryInspectionBudget &&
        shouldCompactAuditTranscriptForSoftEndpointBudget(
          input,
          repositoryInspectionToolCalls,
          estimatedBeforeCompaction,
          policy.budget,
        ),
      );
      const shouldCompactForEndpointBudget = Boolean(
        policy.budget &&
        (shouldCompactForHardEndpointBudget ||
          shouldCompactForSoftEndpointBudget ||
          shouldCompactForRepositoryInspectionBudget),
      );
      if (shouldCompactForEndpointBudget) {
        const compactionReason = shouldCompactForRepositoryInspectionBudget
          ? "repository_inspection_budget_exhausted"
          : shouldCompactForHardEndpointBudget
            ? "endpoint_input_budget"
            : "endpoint_input_soft_budget";
        messages = compactMessagesForEndpointBudget(
          input,
          messages,
          toolContext,
          compactionReason,
          policy.budget,
        );
        if (shouldCompactForRepositoryInspectionBudget) {
          repositoryInspectionBudgetCompacted = true;
        }
        logger?.warn?.(
          {
            runtimeId: input.runtimeId,
            profileId: input.profileId ?? null,
            baseUrl: policy.baseUrl,
            turn,
            compactionReason,
            estimatedInputTokensBefore: estimatedBeforeCompaction,
            estimatedInputTokensAfter: estimateMessagesInputTokens(input, messages),
            maxInputTokens: policy.budget.maxInputTokens,
            compactTargetInputTokens: policy.budget.compactTargetInputTokens,
            repositoryInspectionToolCalls,
            repositoryInspectionToolBudget,
          },
          "Compacted qwen-local-agent transcript before local endpoint request",
        );
      }
      let response;
      try {
        response = await postChatCompletions(
          input,
          messages,
          budgetFinalizationTimeoutActive
            ? buildCombinedTimeoutSignal(signal, repositoryInspectionBudgetFinalResponseTimeoutMs)
            : signal,
          { turn, toolCallCount, retryCount: 0 },
          logger,
        );
      } catch (error) {
        const finalizationFailureCategory = endpointFailureCategory(error);
        if (
          repositoryInspectionBudgetExhausted &&
          finalizationFailureCategory === "context_length"
        ) {
          throw withRepositoryInspectionBudgetStatus(error, "context_length");
        }
        if (
          budgetFinalizationTimeoutActive &&
          (isAbortTimeoutError(error) || finalizationFailureCategory === "timeout")
        ) {
          const runtimeError = error instanceof RuntimeExecutionError ? error : null;
          throw new RuntimeExecutionError(
            `Finalization timeout: qwen-local-agent exceeded ${repositoryInspectionBudgetFinalResponseTimeoutMs}ms after repository inspection budget exhaustion (${repositoryInspectionToolBudget} inspection tool call(s)).`,
            error,
            "timeout",
            {
              retryAfterSeconds: runtimeError?.retryAfterSeconds ?? null,
              providerMeta: {
                ...(runtimeError?.providerMeta ?? {}),
                status: REPOSITORY_INSPECTION_BUDGET_EXHAUSTED_STATUS,
                category: "timeout",
              },
            },
          );
        }
        throw error;
      }
      const rawText = await response.text();
      if (!response.ok) {
        throw classifyQwenLocalAgentRuntimeError(
          new Error(safeProviderErrorMessage(rawText, "Qwen local agent request failed")),
          response.status,
        );
      }
      const payload = rawText.trim().length > 0 ? JSON.parse(rawText) : {};
      raw = payload;
      sessionId = readString(asRecord(payload).id) ?? sessionId;
      usage = addUsage(usage, normalizeUsage(asRecord(payload).usage));
      const rawChoices = asRecord(payload).choices;
      const choices = Array.isArray(rawChoices) ? rawChoices : [];
      const choice = asRecord(choices[0]);
      const message = asRecord(choice.message);
      const content = typeof message.content === "string" ? message.content : "";
      const toolCalls = normalizeToolCalls(message.tool_calls);
      toolCallCount += toolCalls.length;
      if (toolCalls.length === 0) {
        logger?.debug?.(
          {
            runtimeId: input.runtimeId,
            turn,
            outputLength: content.length,
            eventCount: events.length,
          },
          "qwen-local-agent run completed",
        );
        return {
          outputText: content,
          sessionId,
          usage,
          events,
          raw,
        };
      }
      messages.push({
        role: "assistant",
        content: content || null,
        tool_calls: toolCalls,
      });
      for (const toolCall of toolCalls) {
        let args;
        try {
          args = parseToolArguments(toolCall.function.arguments);
        } catch (error) {
          args = {};
          const parseResult = {
            ok: false,
            output: "",
            error: redactProviderText(error instanceof Error ? error.message : String(error)),
            exitCode: null,
            touchedFiles: [],
          };
          emitToolUse(input, events, toolCall, args);
          emitToolResult(input, events, toolCall, parseResult);
          emitAuditEvidenceResult(input, events, toolCall, args, parseResult);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(parseResult),
          });
          continue;
        }
        emitToolUse(input, events, toolCall, args);
        const signature = buildToolCallSignature(toolCall.function.name, args);
        const effectiveRepeatedToolCallLimit = repeatedToolCallLimitForTool(
          input.workflowKind,
          toolCall.function.name,
          repeatedToolCallLimit,
        );
        const signatureCount = (toolCallSignatureCounts.get(signature) ?? 0) + 1;
        toolCallSignatureCounts.set(signature, signatureCount);
        if (signature === lastToolCallSignature) {
          repeatedToolCallCount += 1;
        } else {
          lastToolCallSignature = signature;
          repeatedToolCallCount = 1;
          repeatedToolCallSuppressions = 0;
        }
        const repeatedNonconsecutiveLoop =
          NONCONSECUTIVE_LOOP_PRONE_TOOLS.has(toolCall.function.name) &&
          signatureCount > effectiveRepeatedToolCallLimit;
        const shouldSuppressRepeatedCall =
          repeatedToolCallCount > effectiveRepeatedToolCallLimit || repeatedNonconsecutiveLoop;
        const toolAllowed = isQwenToolAllowedForWorkflow(
          input.workflowKind,
          toolCall.function.name,
        );
        const isRepositoryInspectionTool = isRepositoryInspectionToolCall(
          input,
          toolContext,
          toolCall.function.name,
          args,
        );
        const shouldDenyRepositoryInspection =
          toolAllowed &&
          !shouldSuppressRepeatedCall &&
          repositoryInspectionToolBudget != null &&
          isRepositoryInspectionTool &&
          repositoryInspectionToolCalls >= repositoryInspectionToolBudget;
        const shouldDenyAuditRepairInspection =
          toolAllowed &&
          !shouldSuppressRepeatedCall &&
          auditLowQualityRepairLock &&
          isRepositoryInspectionTool;
        const result = shouldSuppressRepeatedCall
          ? repeatedToolCallResult(
              toolCall.function.name,
              Math.max(repeatedToolCallCount, signatureCount),
              effectiveRepeatedToolCallLimit,
            )
          : shouldDenyAuditRepairInspection
            ? auditReportRepairInspectionDeniedResult(toolCall.function.name)
            : shouldDenyRepositoryInspection
              ? repositoryInspectionBudgetExhaustedResult(
                  toolCall.function.name,
                  repositoryInspectionToolBudget,
                )
              : !toolAllowed
                ? {
                    ok: false,
                    output: "",
                    error: `${sanitizeQwenToolNameForLog(toolCall.function.name)} is not allowed for ${input.workflowKind} workflow`,
                    exitCode: null,
                    touchedFiles: [],
                  }
                : await executeQwenLocalTool(toolCall.function.name, args, toolContext);
        if (
          toolAllowed &&
          !shouldSuppressRepeatedCall &&
          isLowQualityAuditReportRepairValidationResult(toolCall.function.name, result)
        ) {
          auditLowQualityRepairLock = true;
        }
        if (
          toolAllowed &&
          !shouldSuppressRepeatedCall &&
          isRepositoryInspectionTool &&
          !shouldDenyRepositoryInspection &&
          !shouldDenyAuditRepairInspection
        ) {
          repositoryInspectionToolCalls += 1;
        }
        if (shouldSuppressRepeatedCall) {
          repeatedToolCallSuppressions += repeatedNonconsecutiveLoop
            ? REPEATED_TOOL_CALL_FINAL_SUPPRESSIONS
            : 1;
        }
        if (shouldDenyRepositoryInspection) {
          repositoryInspectionBudgetWarnings += 1;
          if (repositoryInspectionBudgetWarnings === 1) {
            logger?.warn?.(
              {
                runtimeId: input.runtimeId,
                profileId: input.profileId ?? null,
                repositoryInspectionToolBudget,
                deniedToolName: sanitizeQwenToolNameForLog(toolCall.function.name),
              },
              "Denied qwen-local-agent repository inspection after budget exhaustion",
            );
          }
        }
        const auditEvidenceResult = buildAuditEvidenceResultForTool(
          input,
          toolContext,
          toolCall,
          args,
          result,
        );
        const auditEvidenceUnit = appendQwenAuditEvidenceUnit(toolContext, auditEvidenceResult);
        emitToolResult(input, events, toolCall, result);
        emitAuditEvidenceResult(
          input,
          events,
          toolCall,
          auditEvidenceUnit ?? auditEvidenceResult,
          result,
        );
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: qwenToolResultForModel(
            result,
            Math.min(
              toolContext.maxOutputChars,
              resolveEndpointPolicy(input).budget?.toolResultMaxChars ?? toolContext.maxOutputChars,
            ),
            auditEvidenceUnit ?? auditEvidenceResult,
          ),
        });
        if (repeatedToolCallSuppressions >= REPEATED_TOOL_CALL_FINAL_SUPPRESSIONS) {
          const safeToolName = sanitizeQwenToolNameForLog(toolCall.function.name);
          logger?.warn?.(
            {
              runtimeId: input.runtimeId,
              profileId: input.profileId ?? null,
              repeatedToolName: safeToolName,
              repeatedToolCallCount,
              repeatedToolCallLimit: effectiveRepeatedToolCallLimit,
            },
            "Stopped qwen-local-agent after repeated identical tool calls",
          );
          return {
            outputText:
              `Stopped after a repeated ${safeToolName} tool-call loop. ` +
              "Partial repository changes may exist; coordinator evidence checks must decide whether rework is required.",
            sessionId,
            usage,
            events,
            raw,
          };
        }
        if (
          shouldDenyRepositoryInspection &&
          repositoryInspectionBudgetWarnings >= REPOSITORY_INSPECTION_BUDGET_FINAL_DENIALS
        ) {
          logger?.warn?.(
            {
              runtimeId: input.runtimeId,
              profileId: input.profileId ?? null,
              repositoryInspectionToolBudget,
              repositoryInspectionBudgetWarnings,
              deniedToolName: sanitizeQwenToolNameForLog(toolCall.function.name),
            },
            "Stopped qwen-local-agent after repeated repository-inspection budget denials",
          );
          throw new RuntimeExecutionError(
            `qwen-local-agent did not finalize after repository inspection budget exhausted (${repositoryInspectionToolBudget} inspection tool call(s)); denied ${repositoryInspectionBudgetWarnings} additional repository-inspection request(s).`,
            undefined,
            "context_length",
            {
              providerMeta: {
                status: REPOSITORY_INSPECTION_BUDGET_EXHAUSTED_STATUS,
                category: "context_length",
                reason: "repeated_repository_inspection_after_budget_exhaustion",
              },
            },
          );
        }
      }
      if (
        repositoryInspectionToolBudget != null &&
        repositoryInspectionToolCalls >= repositoryInspectionToolBudget &&
        !repositoryInspectionBudgetCompacted
      ) {
        const policyAfterTools = resolveEndpointPolicy(input);
        if (policyAfterTools.budget) {
          messages = compactMessagesForEndpointBudget(
            input,
            messages,
            toolContext,
            "repository_inspection_budget_exhausted",
            policyAfterTools.budget,
          );
          repositoryInspectionBudgetCompacted = true;
          logger?.warn?.(
            {
              runtimeId: input.runtimeId,
              profileId: input.profileId ?? null,
              baseUrl: policyAfterTools.baseUrl,
              repositoryInspectionToolCalls,
              repositoryInspectionToolBudget,
              estimatedInputTokensAfter: estimateMessagesInputTokens(input, messages),
            },
            "Compacted qwen-local-agent transcript after repository inspection budget exhaustion",
          );
        }
      }
    }
    if (
      repositoryInspectionToolBudget != null &&
      repositoryInspectionToolCalls >= repositoryInspectionToolBudget
    ) {
      throw new RuntimeExecutionError(
        `qwen-local-agent exceeded max tool turns (${maxTurns}) after repository inspection budget exhausted (${repositoryInspectionToolBudget} inspection tool call(s)).`,
        undefined,
        "context_length",
        {
          providerMeta: {
            status: REPOSITORY_INSPECTION_BUDGET_EXHAUSTED_STATUS,
            category: "context_length",
            reason: "max_tool_turns_after_repository_inspection_budget_exhaustion",
          },
        },
      );
    }
    throw new RuntimeExecutionError(
      `qwen-local-agent exceeded max tool turns (${maxTurns})`,
      undefined,
      "timeout",
    );
  } catch (error) {
    if (isAbortTimeoutError(error)) {
      throw classifyQwenLocalAgentRuntimeError(
        new RuntimeExecutionError(
          `Run timeout: qwen-local-agent exceeded ${input.execution?.runTimeoutMs}ms limit`,
          error,
          "timeout",
        ),
      );
    }
    throw classifyQwenLocalAgentRuntimeError(error);
  }
}
export async function validateQwenLocalAgentApiConnection(input) {
  try {
    assertQwenLocalAgentApiTransport(input);
    const baseUrl = resolveBaseUrl(input);
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: buildHeaders(input),
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `Qwen local agent health check failed with status ${response.status}`,
      };
    }
    return { ok: true, message: "Qwen local agent API connection validated" };
  } catch (error) {
    if (error instanceof RuntimeExecutionError) {
      return { ok: false, message: error.message };
    }
    throw classifyQwenLocalAgentRuntimeError(error);
  }
}
export async function listQwenLocalAgentModels(input) {
  assertQwenLocalAgentApiTransport(input);
  const baseUrl = resolveBaseUrl(input);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: buildHeaders(input),
    });
    if (!response.ok) {
      const rawText = await response.text();
      throw classifyQwenLocalAgentRuntimeError(
        new Error(safeProviderErrorMessage(rawText, "Qwen local agent model listing failed")),
        response.status,
      );
    }
    const payload = await response.json();
    return (payload.data ?? []).map((model) => ({
      id: model.id,
      label: model.name ?? model.id,
      supportsStreaming: false,
      metadata: { owned_by: model.owned_by },
    }));
  } catch (error) {
    loggerDebugParseFailure(input, error);
    throw classifyQwenLocalAgentRuntimeError(error);
  }
}
function loggerDebugParseFailure(input, error) {
  void input;
  if (error instanceof SyntaxError) {
    console.debug(
      "[runtime:qwen-local-agent] Failed to parse model listing",
      redactProviderTextForLogs(error.message),
    );
  }
}
