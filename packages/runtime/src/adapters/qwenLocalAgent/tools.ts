/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { spawn } from "node:child_process";
import { lstat, mkdtemp, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildAuditEvidenceUnit,
  computeAuditReportContentSha256,
  decideShellPermission,
  deriveAuditSourceSnapshotId,
  extractAuditScopeIdsFromText,
  getPermissionExecutionPolicy,
  normalizeAuditEvidenceIds,
  normalizeEvidenceUnitPath,
  redactProviderText,
  resolveAuditPlanId,
  validateAuditReportArtifact,
} from "@aif/shared";
import { RuntimeExecutionError } from "../../errors.js";
const DEFAULT_MAX_FILE_BYTES = 16_000;
const DEFAULT_MAX_FILE_LINES = 240;
const MAX_FILE_LINES = 800;
const DEFAULT_MAX_DIRECTORY_ENTRIES = 200;
const DEFAULT_MAX_SEARCH_MATCHES = 80;
const DEFAULT_MAX_SEARCH_FILE_BYTES = 256_000;
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_CHARS = 12_000;
const DEFAULT_MAX_PATCH_BYTES = 256_000;
const AUDIT_REPORT_MANIFEST_BLOCK_PATTERN =
  /(^|\n)```audit-report-manifest\s*\r?\n([\s\S]*?)\r?\n```/gi;
const PLANNER_MAX_FILE_BYTES = 8_000;
const PLANNER_MAX_FILE_LINES = 120;
const PLANNER_MAX_DIRECTORY_ENTRIES = 120;
const PLANNER_MAX_SEARCH_MATCHES = 30;
const PLANNER_MAX_OUTPUT_CHARS = 6_000;
const SECRET_SEGMENT_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.netrc$/i,
  /^auth\.json$/i,
  /(?:secret|credential|credentials|token|password|passwd|private[_-]?key)/i,
  /\.(?:pem|key|p12|pfx)$/i,
];
const SAFE_ENV_TEMPLATE_FILENAMES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.dist",
]);
const SECRET_DIRECTORY_SEGMENTS = new Set([
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".gcloud",
  ".codex",
]);
const VCS_CONTROL_DIRECTORY_SEGMENTS = new Set([".git", ".hg", ".svn"]);
const SEARCH_SKIP_DIRECTORY_SEGMENTS = new Set([
  ".git",
  ".hg",
  ".svn",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".venv",
  "venv",
]);
const GENERATED_WRITE_DENY_DIRECTORY_SEGMENTS = new Set([
  "node_modules",
  ".npm-cache",
  ".pnpm-store",
  ".yarn",
  ".cache",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "out",
]);
const SEARCH_SKIP_FILE_EXTENSIONS = new Set([
  ".7z",
  ".bin",
  ".bmp",
  ".class",
  ".db",
  ".dll",
  ".egg",
  ".exe",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".lock",
  ".pdf",
  ".png",
  ".pyc",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tgz",
  ".webp",
  ".zip",
]);
const ALLOWED_ENV_KEYS = new Set([
  "PATH",
  "Path",
  "HOME",
  "USERPROFILE",
  "SYSTEMROOT",
  "SystemRoot",
  "WINDIR",
  "windir",
  "COMSPEC",
  "ComSpec",
  "PATHEXT",
  "TEMP",
  "TMP",
  "CI",
  "HANDOFF_MODE",
  "HANDOFF_TASK_ID",
  "HANDOFF_BRANCH_PREPARED",
  "HANDOFF_BRANCH_NAME",
  "HANDOFF_SKIP_REVIEW",
  "NPM_CONFIG_AUDIT",
  "NPM_CONFIG_CACHE",
  "NPM_CONFIG_FUND",
  "npm_config_audit",
  "npm_config_cache",
  "npm_config_fund",
]);
function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}
export const QWEN_LOCAL_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files or directories under the configured project root.",
      parameters: objectSchema({
        path: { type: "string", description: "Relative directory path. Defaults to ." },
        maxEntries: { type: "number", description: "Maximum entries to return." },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a non-secret file under the configured project root. Use startLine and lineCount to inspect large files in bounded windows.",
      parameters: objectSchema(
        {
          path: { type: "string", description: "Relative file path." },
          maxBytes: { type: "number", description: "Maximum UTF-8 bytes to return." },
          startLine: { type: "number", description: "1-based first line to read. Defaults to 1." },
          lineCount: {
            type: "number",
            description: "Maximum lines to return. Defaults to a bounded window.",
          },
        },
        ["path"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description:
        "Search non-secret text files under a relative path and return bounded path:line previews.",
      parameters: objectSchema(
        {
          query: { type: "string", description: "Literal text or regex pattern to search for." },
          path: { type: "string", description: "Relative directory or file path. Defaults to ." },
          regex: { type: "boolean", description: "Treat query as a JavaScript regex." },
          caseSensitive: { type: "boolean", description: "Use case-sensitive matching." },
          maxMatches: { type: "number", description: "Maximum matches to return." },
        },
        ["query"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or replace a non-secret file under the configured project root.",
      parameters: objectSchema(
        {
          path: { type: "string", description: "Relative file path." },
          content: { type: "string", description: "Complete file content." },
        },
        ["path", "content"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "apply_patch",
      description: "Apply a unified diff patch inside the configured project root.",
      parameters: objectSchema(
        {
          patch: { type: "string", description: "Unified diff patch content." },
        },
        ["patch"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "run_shell",
      description:
        "Run a narrow structured command inside the project root. This is not a shell string. Supports pwd, ls, safe npm dependency hydration such as npm.cmd install, and package-manager verification scripts such as npm.cmd run build.",
      parameters: objectSchema(
        {
          command: {
            type: "string",
            enum: ["pwd", "ls", "npm", "npm.cmd", "pnpm", "yarn", "bun"],
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Command arguments from the documented allowlist.",
          },
          cwd: { type: "string", description: "Relative working directory. Defaults to ." },
          timeoutMs: { type: "number", description: "Per-command timeout in milliseconds." },
        },
        ["command"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description: "Return git status for the configured project root.",
      parameters: objectSchema({}),
    },
  },
  {
    type: "function",
    function: {
      name: "compute_audit_report_hash",
      description:
        "Compute the audit-report-manifest contentSha256 for an existing audit report file after stripping audit-report-manifest blocks.",
      parameters: objectSchema(
        {
          path: { type: "string", description: "Relative audit report file path." },
        },
        ["path"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "finalize_audit_report_manifest",
      description:
        "Update the contentSha256 field in an existing audit-report-manifest block to the exact hash for the current report body.",
      parameters: objectSchema(
        {
          path: { type: "string", description: "Relative audit report file path." },
        },
        ["path"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "validate_audit_report",
      description:
        "Run the strict audit report validator against the scoped audit report artifact before committing it.",
      parameters: objectSchema(
        {
          path: { type: "string", description: "Relative audit report file path." },
        },
        ["path"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "git_commit",
      description: "Stage explicit relative paths and create a git commit.",
      parameters: objectSchema(
        {
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Relative file paths to stage.",
          },
          message: { type: "string", description: "Commit message." },
        },
        ["paths", "message"],
      ),
    },
  },
];
const QWEN_LOCAL_AGENT_TOOL_NAMES = new Set(
  QWEN_LOCAL_AGENT_TOOLS.map((tool) => tool.function.name),
);
export function sanitizeQwenToolNameForLog(toolName) {
  return QWEN_LOCAL_AGENT_TOOL_NAMES.has(toolName) ? toolName : "unknown_qwen_tool";
}
function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
function readString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function readStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
}
function readPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : fallback;
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), max);
}
function normalizePathForPolicy(value) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}
function globBoundaryToRegExp(boundary) {
  let pattern = "^";
  for (let index = 0; index < boundary.length; index += 1) {
    const char = boundary[index];
    const next = boundary[index + 1];
    if (char === "*" && next === "*") {
      pattern += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      pattern += "[^/]*";
      continue;
    }
    pattern += char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
  }
  pattern += "$";
  return new RegExp(pattern);
}
function pathMatchesAllowedWriteBoundary(normalizedPath, allowedBoundary) {
  if (allowedBoundary.includes("*")) {
    return globBoundaryToRegExp(allowedBoundary).test(normalizedPath);
  }
  return normalizedPath === allowedBoundary || normalizedPath.startsWith(`${allowedBoundary}/`);
}
export function isSecretLikePath(value) {
  const normalized = normalizePathForPolicy(value);
  const segments = normalized.split("/").filter(Boolean);
  return segments.some((segment, index) => {
    if (SECRET_DIRECTORY_SEGMENTS.has(segment)) return true;
    const isFinalEnvTemplate =
      index === segments.length - 1 && SAFE_ENV_TEMPLATE_FILENAMES.has(segment.toLowerCase());
    return !isFinalEnvTemplate && SECRET_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment));
  });
}
function assertNoNullByte(value, label) {
  if (value.includes("\0")) {
    throw new RuntimeExecutionError(`${label} contains a null byte`, undefined, "permission");
  }
}
function assertNotSecretPath(value, label) {
  if (isSecretLikePath(value)) {
    throw new RuntimeExecutionError(
      `${label} references a secret-like path`,
      undefined,
      "permission",
    );
  }
}
function assertNotVcsControlPath(value, label) {
  const normalized = normalizePathForPolicy(value);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => VCS_CONTROL_DIRECTORY_SEGMENTS.has(segment))) {
    throw new RuntimeExecutionError(
      `${label} references a protected VCS control path`,
      undefined,
      "permission",
    );
  }
}
function assertNotAborted(signal, label) {
  if (signal?.aborted) {
    throw new RuntimeExecutionError(`${label} aborted`, undefined, "timeout");
  }
}
function resolveProjectRoot(projectRoot) {
  if (!path.isAbsolute(projectRoot)) {
    throw new RuntimeExecutionError(
      "Qwen local agent requires an absolute projectRoot",
      undefined,
      "permission",
    );
  }
  return path.resolve(projectRoot);
}
export function resolveInsideProjectRoot(projectRoot, relativePath, label, options = {}) {
  const root = resolveProjectRoot(projectRoot);
  const rawPath = relativePath && relativePath.trim().length > 0 ? relativePath.trim() : ".";
  assertNoNullByte(rawPath, label);
  if (path.isAbsolute(rawPath)) {
    throw new RuntimeExecutionError(`${label} must be relative`, undefined, "permission");
  }
  if (options.allowSecretPath !== true) {
    assertNotSecretPath(rawPath, label);
  }
  assertNotVcsControlPath(rawPath, label);
  const absolutePath = path.resolve(root, rawPath);
  const rel = path.relative(root, absolutePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new RuntimeExecutionError(`${label} escapes project root`, undefined, "permission");
  }
  const normalizedRel = rel.length > 0 ? rel : ".";
  if (options.allowSecretPath !== true) {
    assertNotSecretPath(normalizedRel, label);
  }
  assertNotVcsControlPath(normalizedRel, label);
  return { absolutePath, relativePath: normalizedRel };
}
function isInsideResolvedRoot(realRoot, candidate) {
  const rel = path.relative(realRoot, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
async function getRealProjectRoot(projectRoot) {
  const root = resolveProjectRoot(projectRoot);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory()) {
    throw new RuntimeExecutionError("projectRoot is not a directory", undefined, "permission");
  }
  return realpath(root);
}
async function assertExistingPathHasNoSymlinkComponents(projectRoot, absolutePath, label) {
  const root = resolveProjectRoot(projectRoot);
  const realRoot = await getRealProjectRoot(root);
  const rel = path.relative(root, absolutePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new RuntimeExecutionError(`${label} escapes project root`, undefined, "permission");
  }
  if (rel === "") return;
  let current = root;
  for (const segment of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch {
      throw new RuntimeExecutionError(`${label} does not exist`, undefined, "permission");
    }
    if (info.isSymbolicLink()) {
      throw new RuntimeExecutionError(
        `${label} crosses a symbolic link or junction`,
        undefined,
        "permission",
      );
    }
    const realCurrent = await realpath(current);
    if (!isInsideResolvedRoot(realRoot, realCurrent)) {
      throw new RuntimeExecutionError(`${label} escapes project root`, undefined, "permission");
    }
  }
}
async function assertPathHasNoSymlinkComponentsIfExists(projectRoot, absolutePath, label) {
  try {
    await assertExistingPathHasNoSymlinkComponents(projectRoot, absolutePath, label);
  } catch (error) {
    if (error instanceof RuntimeExecutionError && error.message === `${label} does not exist`) {
      return;
    }
    throw error;
  }
}
async function resolveExistingPathInsideProjectRoot(projectRoot, relativePath, label) {
  const target = resolveInsideProjectRoot(projectRoot, relativePath, label);
  await assertExistingPathHasNoSymlinkComponents(projectRoot, target.absolutePath, label);
  const info = await lstat(target.absolutePath);
  if (info.isSymbolicLink()) {
    throw new RuntimeExecutionError(
      `${label} crosses a symbolic link or junction`,
      undefined,
      "permission",
    );
  }
  return { ...target, info };
}
async function ensureSafeDirectoryInsideProjectRoot(projectRoot, directoryPath, label) {
  const root = resolveProjectRoot(projectRoot);
  const realRoot = await getRealProjectRoot(root);
  const rel = path.relative(root, directoryPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new RuntimeExecutionError(`${label} escapes project root`, undefined, "permission");
  }
  let current = root;
  const segments = rel === "" ? [] : rel.split(path.sep).filter(Boolean);
  for (const segment of segments) {
    current = path.join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch {
      await mkdir(current);
      info = await lstat(current);
    }
    if (info.isSymbolicLink()) {
      throw new RuntimeExecutionError(
        `${label} crosses a symbolic link or junction`,
        undefined,
        "permission",
      );
    }
    if (!info.isDirectory()) {
      throw new RuntimeExecutionError(
        `${label} parent is not a directory`,
        undefined,
        "permission",
      );
    }
    const realCurrent = await realpath(current);
    if (!isInsideResolvedRoot(realRoot, realCurrent)) {
      throw new RuntimeExecutionError(`${label} escapes project root`, undefined, "permission");
    }
  }
}
async function resolveWritablePathInsideProjectRoot(projectRoot, relativePath, label) {
  const target = resolveInsideProjectRoot(projectRoot, relativePath, label);
  await ensureSafeDirectoryInsideProjectRoot(projectRoot, path.dirname(target.absolutePath), label);
  try {
    const info = await lstat(target.absolutePath);
    if (info.isSymbolicLink()) {
      throw new RuntimeExecutionError(
        `${label} crosses a symbolic link or junction`,
        undefined,
        "permission",
      );
    }
    if (!info.isFile()) {
      throw new RuntimeExecutionError(`${label} is not a file`, undefined, "permission");
    }
    await assertExistingPathHasNoSymlinkComponents(projectRoot, target.absolutePath, label);
  } catch (error) {
    if (error instanceof RuntimeExecutionError) throw error;
    if (error.code !== "ENOENT") throw error;
  }
  return target;
}
function truncateForModel(value, maxChars) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}
function safeModelText(value, maxChars) {
  return truncateForModel(redactProviderText(value, { maxLength: null }), maxChars);
}
const TOOL_ARGUMENT_KEYS = {
  list_files: new Set(["path", "maxEntries"]),
  read_file: new Set(["path", "maxBytes", "startLine", "lineCount"]),
  search_files: new Set(["query", "path", "regex", "caseSensitive", "maxMatches"]),
  write_file: new Set(["path", "content"]),
  apply_patch: new Set(["patch"]),
  run_shell: new Set(["command", "args", "cwd", "timeoutMs"]),
  git_status: new Set(),
  compute_audit_report_hash: new Set(["path"]),
  finalize_audit_report_manifest: new Set(["path"]),
  validate_audit_report: new Set(["path"]),
  git_commit: new Set(["paths", "message"]),
};
function sanitizeToolArgumentValue(value, depth = 0) {
  if (typeof value === "string") return redactProviderText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value == null) return value;
  if (depth >= 4) return "[nested]";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeToolArgumentValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const sanitized = {};
    for (const [key, child] of Object.entries(value).slice(0, 50)) {
      sanitized[redactProviderText(key)] = sanitizeToolArgumentValue(child, depth + 1);
    }
    return sanitized;
  }
  return String(value);
}
export function sanitizeToolArguments(toolName, args) {
  const allowedKeys = TOOL_ARGUMENT_KEYS[toolName] ?? new Set();
  const sanitized = {};
  for (const [key, value] of Object.entries(args)) {
    if (!allowedKeys.has(key)) continue;
    if (key === "content" || key === "patch") {
      sanitized[key] = typeof value === "string" ? `[${key}:${value.length} chars]` : `[${key}]`;
      continue;
    }
    sanitized[key] = sanitizeToolArgumentValue(value);
  }
  return { toolName: sanitizeQwenToolNameForLog(toolName), ...sanitized };
}
function summarizeToolUse(toolName, args) {
  switch (toolName) {
    case "read_file":
    case "write_file":
      return readString(args.path) ? ` ${redactProviderText(readString(args.path) ?? "")}` : "";
    case "list_files":
      return readString(args.path) ? ` ${redactProviderText(readString(args.path) ?? "")}` : " .";
    case "search_files": {
      const query = readString(args.query);
      const targetPath = readString(args.path) ?? ".";
      return ` ${redactProviderText(query ?? "")} in ${redactProviderText(targetPath)}`;
    }
    case "run_shell": {
      const command = redactProviderText(readString(args.command) ?? "");
      const commandArgs = readStringArray(args.args)
        .map((arg) => redactProviderText(arg))
        .join(" ");
      return ` ${[command, commandArgs].filter(Boolean).join(" ")}`.trimEnd();
    }
    case "git_commit":
      return " git commit";
    case "git_status":
      return " git status";
    case "compute_audit_report_hash":
    case "finalize_audit_report_manifest":
    case "validate_audit_report":
      return readString(args.path) ? ` ${redactProviderText(readString(args.path) ?? "")}` : "";
    case "apply_patch":
      return " unified diff";
    default:
      return "";
  }
}
export function summarizeQwenToolUse(toolName, args) {
  return summarizeToolUse(toolName, args);
}
export function buildSanitizedToolEnv(source = process.env, extras = {}) {
  const env = {};
  for (const key of ALLOWED_ENV_KEYS) {
    const value = source[key];
    if (value != null) {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(extras)) {
    if (ALLOWED_ENV_KEYS.has(key) && value != null) {
      env[key] = value;
    }
  }
  return env;
}
function assertShellArgumentsAreSafe(args) {
  for (const arg of args) {
    assertNoNullByte(arg, "shell argument");
    assertNotSecretPath(arg, "shell argument");
    assertNotVcsControlPath(arg, "shell argument");
    if (path.isAbsolute(arg)) {
      throw new RuntimeExecutionError(
        "shell argument must not be an absolute path",
        undefined,
        "permission",
      );
    }
    if (arg.split(/[\\/]+/).includes("..")) {
      throw new RuntimeExecutionError(
        "shell argument escapes project root",
        undefined,
        "permission",
      );
    }
  }
}
function readOptionalPositiveInt(value, max = Number.MAX_SAFE_INTEGER) {
  if (value == null) return null;
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(Math.floor(raw), max);
}
function isPlannerLikeWorkflow(workflowKind) {
  return workflowKind === "planner" || workflowKind === "plan-checker";
}
function readAllowedWritePaths(input, projectRoot) {
  const raw = input.execution?.allowedWritePaths;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const allowed = [];
  const seen = new Set();
  for (const value of raw) {
    if (typeof value !== "string" || value.trim().length === 0) continue;
    const resolved = resolveInsideProjectRoot(projectRoot, value, "allowed write path");
    const normalized = normalizePathForPolicy(resolved.relativePath);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      allowed.push(normalized);
    }
  }
  return allowed;
}
function readOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function readOptionalProjectPath(value, projectRoot, label) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const resolved = resolveInsideProjectRoot(projectRoot, value, label);
  return normalizePathForPolicy(resolved.relativePath);
}
function readAuditReportValidationContext(input, projectRoot) {
  const execution = input.execution ?? {};
  const expectedReportArtifactPath = readOptionalProjectPath(
    execution.auditReportArtifactPath,
    projectRoot,
    "audit report artifact path",
  );
  return {
    expectedReportArtifactPath,
    taskDescription: readOptionalString(execution.auditReportTaskDescription),
    taskId: readOptionalString(execution.auditReportTaskId),
    roadmapBatchId: readOptionalString(execution.auditReportRoadmapBatchId),
    roadmapAlias: readOptionalString(execution.auditReportRoadmapAlias),
    auditPlanId: readOptionalString(execution.auditReportAuditPlanId),
  };
}
function readAuditEvidenceUnits(input) {
  const raw = input.execution?.auditReportEvidenceUnits;
  return Array.isArray(raw) ? raw.filter((entry) => entry && typeof entry === "object") : [];
}
function auditTaskDescriptionSection(text, startLabel) {
  const match = text.match(new RegExp(`\\b${startLabel}\\s*:\\s*`, "i"));
  if (!match || match.index == null) return "";
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  return (
    rest.split(
      /\b(?:Allowed changes|Report artifact|Acceptance criteria|Evidence requirements|Manifest requirements|Quality bar|No-findings rule|No-findings proof guardrail|Substantive no-findings requirement|Git requirements|Constraint|Verification|Dependencies)\s*:/i,
    )[0] ?? ""
  );
}
function extractAuditRiskHypothesisScopeLinks(taskDescription, scopeIds) {
  const riskSection = auditTaskDescriptionSection(taskDescription, "Risk hypotheses");
  if (!riskSection) return [];
  const matches = [...riskSection.matchAll(/\brisk-[A-Za-z0-9_.-]+\b/gi)];
  const links = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const riskId = match[0];
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? riskSection.length;
    const description = riskSection.slice(start, end);
    for (const scopeId of scopeIds) {
      if (description.includes(scopeId)) links.push({ riskId, scopeId });
    }
  }
  return links;
}
function scopeIdsOverlap(left, right) {
  if (!left || !right) return false;
  const normalizedLeft = normalizeEvidenceUnitPath(left);
  const normalizedRight = normalizeEvidenceUnitPath(right);
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`)
  );
}
function riskHypothesisIdsForEvidence(unitContext, payload) {
  const riskIds = new Set(payload.riskHypothesisIds ?? []);
  const payloadScopeIds = payload.scopeIds ?? [];
  for (const link of unitContext.riskHypothesesByScopeId ?? []) {
    if (payloadScopeIds.some((scopeId) => scopeIdsOverlap(scopeId, link.scopeId))) {
      riskIds.add(link.riskId);
    }
  }
  return normalizeAuditEvidenceIds([...riskIds]);
}
function buildAuditEvidenceUnitContext(auditReportValidation, projectRoot) {
  const taskId = auditReportValidation.taskId;
  if (!taskId) return null;
  const taskDescription = auditReportValidation.taskDescription ?? "";
  const scopeIds = extractAuditScopeIdsFromText(taskDescription);
  return {
    taskId,
    auditPlanId: resolveAuditPlanId({
      taskId,
      auditPlanId: auditReportValidation.auditPlanId,
      roadmapBatchId: auditReportValidation.roadmapBatchId,
    }),
    sourceSnapshotId: deriveAuditSourceSnapshotId(projectRoot),
    scopeIds: [],
    riskHypothesisIds: [],
    riskHypothesesByScopeId: extractAuditRiskHypothesisScopeLinks(taskDescription, scopeIds),
  };
}
export function appendQwenAuditEvidenceUnit(context, payload) {
  if (!payload) return null;
  const unitContext = context.auditEvidenceUnitContext;
  if (!unitContext) return payload;
  const payloadWithMappedRisk = {
    ...payload,
    riskHypothesisIds: riskHypothesisIdsForEvidence(unitContext, payload),
  };
  const unit = buildAuditEvidenceUnit(unitContext, payloadWithMappedRisk);
  const units = context.auditEvidenceUnits ?? [];
  if (!units.some((entry) => entry?.id === unit.id)) {
    units.push(unit);
  }
  context.auditEvidenceUnits = units;
  return unit;
}
function assertWritePathAllowed(context, relativePath, label) {
  const allowed = context.allowedWritePaths ?? [];
  const normalized = normalizePathForPolicy(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  const deniedSegment = segments.find((segment) =>
    GENERATED_WRITE_DENY_DIRECTORY_SEGMENTS.has(segment),
  );
  if (deniedSegment) {
    throw new RuntimeExecutionError(
      `${label} targets generated/dependency directory ${deniedSegment}`,
      undefined,
      "permission",
    );
  }
  if (allowed.length === 0) return;
  if (allowed.some((allowedPath) => pathMatchesAllowedWriteBoundary(normalized, allowedPath))) {
    return;
  }
  throw new RuntimeExecutionError(
    `${label} is outside this workflow's allowed write paths (${allowed.join(", ")})`,
    undefined,
    "permission",
  );
}
function shouldSkipSearchPath(relativePath) {
  const normalized = normalizePathForPolicy(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => SEARCH_SKIP_DIRECTORY_SEGMENTS.has(segment))) {
    return true;
  }
  return SEARCH_SKIP_FILE_EXTENSIONS.has(path.extname(normalized));
}
function validateStructuredShellCommand(command, args) {
  if (command === "pwd") {
    if (args.length > 0) {
      throw new RuntimeExecutionError("pwd does not accept arguments", undefined, "permission");
    }
    return;
  }
  if (command === "ls") {
    const allowedFlags = new Set(["-la", "-al", "-l", "-a"]);
    for (const arg of args) {
      if (!arg.startsWith("-")) {
        throw new RuntimeExecutionError(
          `${command} path arguments are not supported; use cwd or list_files instead`,
          undefined,
          "permission",
        );
      }
      if (!allowedFlags.has(arg)) {
        throw new RuntimeExecutionError(
          `unsupported ${command} flag: ${arg}`,
          undefined,
          "permission",
        );
      }
    }
    return;
  }
  if (isPackageManagerCommand(command)) {
    validatePackageManagerShellArgs(command, args);
    return;
  }
  throw new RuntimeExecutionError(`unsupported shell command: ${command}`, undefined, "permission");
}
function isPackageManagerCommand(command) {
  return ["npm", "npm.cmd", "pnpm", "yarn", "bun"].includes(command);
}
const DISALLOWED_PACKAGE_MANAGER_SCRIPT_NAMES = new Set([
  "add",
  "audit",
  "ci",
  "i",
  "install",
  "pack",
  "postinstall",
  "preinstall",
  "prepare",
  "prepack",
  "prepublish",
  "publish",
  "rebuild",
  "remove",
  "uninstall",
  "update",
  "upgrade",
]);
const LONG_RUNNING_PACKAGE_MANAGER_SCRIPT_NAMES = new Set([
  "dev",
  "preview",
  "serve",
  "start",
  "watch",
]);
const DEPENDENCY_MUTATION_SCRIPT_PATTERN =
  /\b(?:npm(?:\.cmd)?|pnpm|yarn|bun)\s+(?:add|audit|ci|i|install|pack|publish|rebuild|remove|uninstall|update|upgrade)\b|\bnpx\b/i;
const LONG_RUNNING_PACKAGE_MANAGER_ARG_PATTERN =
  /^(?:--watch(?:all)?|-w|--host|--serve|--open|--inspect(?:-brk)?|--listen)$/i;
const LONG_RUNNING_PACKAGE_MANAGER_SCRIPT_PATTERN =
  /(?:^|[;&|]\s*)(?:vite|next\s+dev|nuxt\s+dev|astro\s+dev|webpack\s+serve|vite\s+preview|nodemon|storybook\s+dev)\b(?![^\n]*\bbuild\b)|\b(?:--watch|--watchall|-w|--host|--serve|vite\s+preview|webpack\s+serve)\b/i;
function packageManagerScriptName(args) {
  const verb = args[0];
  if (verb === "test") return "test";
  if (verb === "run") return args[1] ?? null;
  return null;
}
const NPM_SAFE_INSTALL_VERBS = new Set(["ci", "install"]);
const NPM_SAFE_INSTALL_FLAGS = new Set([
  "--ignore-scripts",
  "--no-audit",
  "--audit=false",
  "--no-fund",
  "--fund=false",
  "--prefer-offline",
  "--package-lock-only",
]);
function isNpmDependencyHydrationCommand(command, args) {
  return (command === "npm" || command === "npm.cmd") && NPM_SAFE_INSTALL_VERBS.has(args[0] ?? "");
}
function validateNpmDependencyHydrationArgs(command, args) {
  for (const arg of args.slice(1)) {
    if (!arg.startsWith("-")) {
      throw new RuntimeExecutionError(
        `${command} ${args[0]} does not support package specs; edit package.json/package-lock.json in scope, then run dependency hydration`,
        undefined,
        "permission",
      );
    }
    if (!NPM_SAFE_INSTALL_FLAGS.has(arg)) {
      throw new RuntimeExecutionError(
        `${command} ${args[0]} flag is not supported for local-agent dependency hydration: ${arg}`,
        undefined,
        "permission",
      );
    }
  }
}
function normalizeNpmDependencyHydrationArgs(command, args) {
  if (!isNpmDependencyHydrationCommand(command, args)) return args;
  const next = [...args];
  for (const flag of ["--ignore-scripts", "--no-audit", "--no-fund"]) {
    if (!next.includes(flag)) next.push(flag);
  }
  return next;
}
function validatePackageManagerShellArgs(command, args) {
  const verb = args[0];
  if (!verb) {
    throw new RuntimeExecutionError(
      `${command} requires an allowlisted script verb`,
      undefined,
      "permission",
    );
  }
  if (isNpmDependencyHydrationCommand(command, args)) {
    validateNpmDependencyHydrationArgs(command, args);
    return;
  }
  assertNoLongRunningPackageManagerArgs(command, args);
  if (verb === "test") return;
  if (verb === "run") {
    if (!args[1] || args[1].startsWith("-")) {
      throw new RuntimeExecutionError(
        `${command} run requires a script name`,
        undefined,
        "permission",
      );
    }
    const scriptName = args[1].toLowerCase();
    if (LONG_RUNNING_PACKAGE_MANAGER_SCRIPT_NAMES.has(scriptName)) {
      throw new RuntimeExecutionError(
        `${command} run ${args[1]} is not supported; long-running dev/watch/server scripts require an explicit operator workflow`,
        undefined,
        "permission",
      );
    }
    if (DISALLOWED_PACKAGE_MANAGER_SCRIPT_NAMES.has(scriptName)) {
      throw new RuntimeExecutionError(
        `${command} run ${args[1]} is not supported; dependency-management scripts require an explicit operator workflow`,
        undefined,
        "permission",
      );
    }
    return;
  }
  throw new RuntimeExecutionError(
    `${command} supports only test or run <script>`,
    undefined,
    "permission",
  );
}
function assertNoLongRunningPackageManagerArgs(command, args) {
  const deniedArg = args.find((arg) => LONG_RUNNING_PACKAGE_MANAGER_ARG_PATTERN.test(arg));
  if (!deniedArg) return;
  throw new RuntimeExecutionError(
    `${command} ${args.join(" ")} is not supported because ${deniedArg} can start a long-running dev/watch/server process; run bounded build/test/lint verification instead`,
    undefined,
    "permission",
  );
}
async function validatePackageManagerProjectScript(command, args, cwd) {
  const scriptName = packageManagerScriptName(args);
  if (!scriptName) return;
  const packageJsonPath = path.join(cwd, "package.json");
  let packageJsonText;
  try {
    packageJsonText = await readFile(packageJsonPath, "utf8");
  } catch {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(packageJsonText);
  } catch {
    throw new RuntimeExecutionError(
      `${command} ${args.join(" ")} cannot run because package.json is not valid JSON`,
      undefined,
      "permission",
    );
  }
  const script = parsed?.scripts?.[scriptName];
  if (typeof script !== "string") return;
  if (DEPENDENCY_MUTATION_SCRIPT_PATTERN.test(script)) {
    throw new RuntimeExecutionError(
      `${command} ${args.join(" ")} is not supported because package.json script ${scriptName} mutates dependencies or executes package-manager install/update commands`,
      undefined,
      "permission",
    );
  }
  if (LONG_RUNNING_PACKAGE_MANAGER_SCRIPT_PATTERN.test(script)) {
    throw new RuntimeExecutionError(
      `${command} ${args.join(" ")} is not supported because package.json script ${scriptName} starts a long-running dev/watch/server process; run bounded build/test/lint verification instead`,
      undefined,
      "permission",
    );
  }
}
function packageManagerEnvExtras(command) {
  if (!isPackageManagerCommand(command)) return {};
  const cachePath = path.join(tmpdir(), "aif-qwen-npm-cache");
  return {
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_CACHE: cachePath,
    NPM_CONFIG_FUND: "false",
    npm_config_audit: "false",
    npm_config_cache: cachePath,
    npm_config_fund: "false",
  };
}
function resolveStructuredShellInvocation(command, args) {
  const normalizedArgs = normalizeNpmDependencyHydrationArgs(command, args);
  if (command === "npm.cmd" && process.platform !== "win32") {
    return { command: "npm", args: normalizedArgs };
  }
  if (command === "npm.cmd" && process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd", ...normalizedArgs],
    };
  }
  return { command, args: normalizedArgs };
}
export function spawnProcess(input) {
  if (input.signal?.aborted) {
    return Promise.resolve({
      ok: false,
      output: "",
      error: "tool aborted",
      exitCode: null,
      touchedFiles: [],
    });
  }
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(input.command, input.args, {
        cwd: input.cwd,
        env: input.env,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        ok: false,
        output: "",
        error: safeModelText(
          error instanceof Error ? error.message : String(error),
          input.maxOutputChars,
        ),
        exitCode: null,
        touchedFiles: [],
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let closed = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const killChild = () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      setTimeout(() => {
        if (!closed && !settled) child.kill("SIGKILL");
      }, 500).unref?.();
    };
    timer = setTimeout(() => {
      timedOut = true;
      killChild();
    }, input.timeoutMs);
    const onAbort = () => {
      aborted = true;
      killChild();
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk) => {
      stdout = truncateForModel(stdout + chunk.toString("utf8"), input.maxOutputChars * 2);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = truncateForModel(stderr + chunk.toString("utf8"), input.maxOutputChars * 2);
    });
    child.on("error", (error) => {
      finish({
        ok: false,
        output: "",
        error: safeModelText(error.message, input.maxOutputChars),
        exitCode: null,
        touchedFiles: [],
      });
    });
    child.on("close", (code) => {
      closed = true;
      const cleanStdout = safeModelText(stdout, input.maxOutputChars);
      const cleanStderr = safeModelText(stderr, input.maxOutputChars);
      if (timedOut || aborted) {
        finish({
          ok: false,
          output: cleanStdout,
          error: timedOut ? `tool timed out after ${input.timeoutMs}ms` : "tool aborted",
          exitCode: code,
          touchedFiles: [],
        });
        return;
      }
      finish({
        ok: code === 0,
        output: [cleanStdout, cleanStderr ? `stderr:\n${cleanStderr}` : ""]
          .filter(Boolean)
          .join("\n"),
        ...(code === 0 ? {} : { error: cleanStderr || `process exited with code ${code}` }),
        exitCode: code,
        touchedFiles: [],
      });
    });
    if (input.stdin) {
      child.stdin?.write(input.stdin);
    }
    child.stdin?.end();
  });
}
async function listFiles(args, context) {
  assertNotAborted(context.signal, "list_files");
  const maxEntries = readPositiveInt(
    args.maxEntries,
    context.maxDirectoryEntries ?? DEFAULT_MAX_DIRECTORY_ENTRIES,
    context.maxDirectoryEntries ?? DEFAULT_MAX_DIRECTORY_ENTRIES,
  );
  const target = await resolveExistingPathInsideProjectRoot(
    context.projectRoot,
    readString(args.path),
    "list path",
  );
  if (!target.info.isDirectory()) {
    throw new RuntimeExecutionError("list path is not a directory", undefined, "permission");
  }
  const entries = await readdir(target.absolutePath, { withFileTypes: true });
  const visible = entries.slice(0, maxEntries).map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
  }));
  const suffix =
    entries.length > visible.length
      ? `\n[truncated ${entries.length - visible.length} entries]`
      : "";
  return {
    ok: true,
    output: `${JSON.stringify(visible, null, 2)}${suffix}`,
    touchedFiles: [],
  };
}
async function readFileTool(args, context) {
  assertNotAborted(context.signal, "read_file");
  const requestedMax = readPositiveInt(
    args.maxBytes,
    context.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    context.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
  );
  const startLine = readOptionalPositiveInt(args.startLine) ?? 1;
  const lineCount =
    readOptionalPositiveInt(args.lineCount, context.maxFileLines ?? DEFAULT_MAX_FILE_LINES) ??
    context.maxFileLines ??
    DEFAULT_MAX_FILE_LINES;
  const target = await resolveExistingPathInsideProjectRoot(
    context.projectRoot,
    readString(args.path),
    "read path",
  );
  if (!target.info.isFile()) {
    throw new RuntimeExecutionError("read path is not a file", undefined, "permission");
  }
  const content = await readFile(target.absolutePath, "utf8");
  const lines = content.split(/\r?\n/);
  const lineStartIndex = Math.min(startLine - 1, lines.length);
  const lineEndIndex = Math.min(lineStartIndex + lineCount, lines.length);
  const selected = lines.slice(lineStartIndex, lineEndIndex).join("\n");
  const truncated = truncateForModel(selected, Math.floor(requestedMax));
  const lineStart = lineStartIndex + 1;
  const lineEnd = lineEndIndex;
  const lineWindowTruncated = lineStart > 1 || lineEnd < lines.length;
  const byteWindowTruncated = selected.length > requestedMax;
  const suffix = [
    lineWindowTruncated
      ? `Use read_file with startLine=${Math.min(lineEnd + 1, lines.length)} lineCount=${lineCount} to continue.`
      : "",
    byteWindowTruncated ? `Increase maxBytes to read more of this line window.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    ok: true,
    output: [
      `[read_file ${target.relativePath} lines ${lineStart}-${lineEnd} of ${lines.length}]`,
      truncated,
      suffix ? `[truncated] ${suffix}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    touchedFiles: [],
  };
}
async function collectSearchFiles(projectRoot, target, files, signal, limit = 500) {
  if (files.length >= limit) return;
  assertNotAborted(signal, "search_files");
  if (target.info.isFile()) {
    files.push(target);
    return;
  }
  if (!target.info.isDirectory()) return;
  const entries = await readdir(target.absolutePath, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= limit) return;
    const relativePath =
      target.relativePath === "." ? entry.name : path.join(target.relativePath, entry.name);
    if (isSecretLikePath(relativePath) || shouldSkipSearchPath(relativePath)) {
      continue;
    }
    const child = await resolveExistingPathInsideProjectRoot(
      projectRoot,
      relativePath,
      "search path",
    );
    if (child.info.isDirectory() || child.info.isFile()) {
      await collectSearchFiles(projectRoot, child, files, signal, limit);
    }
  }
}
function buildSearchMatcher(args) {
  const query = readString(args.query);
  if (!query) {
    throw new RuntimeExecutionError("search_files requires query", undefined, "permission");
  }
  if (args.regex === true) {
    try {
      const flags = args.caseSensitive === true ? "" : "i";
      return {
        query,
        test: (value) => new RegExp(query, flags).test(value),
      };
    } catch (error) {
      throw new RuntimeExecutionError(
        `invalid search regex: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "permission",
      );
    }
  }
  const needle = args.caseSensitive === true ? query : query.toLowerCase();
  return {
    query,
    test: (value) => {
      const haystack = args.caseSensitive === true ? value : value.toLowerCase();
      return haystack.includes(needle);
    },
  };
}
async function searchFilesTool(args, context) {
  assertNotAborted(context.signal, "search_files");
  const matcher = buildSearchMatcher(args);
  const maxMatches = readPositiveInt(
    args.maxMatches,
    context.maxSearchMatches ?? DEFAULT_MAX_SEARCH_MATCHES,
    context.maxSearchMatches ?? 200,
  );
  const target = await resolveExistingPathInsideProjectRoot(
    context.projectRoot,
    readString(args.path),
    "search path",
  );
  const files = [];
  await collectSearchFiles(context.projectRoot, target, files, context.signal);
  const matches = [];
  let skippedLargeFiles = 0;
  for (const file of files) {
    if (matches.length >= maxMatches) break;
    if (file.info.size > DEFAULT_MAX_SEARCH_FILE_BYTES) {
      skippedLargeFiles += 1;
      continue;
    }
    let content;
    try {
      content = await readFile(file.absolutePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (matches.length >= maxMatches) break;
      const line = lines[index] ?? "";
      if (!matcher.test(line)) continue;
      matches.push(
        `${file.relativePath.replaceAll("\\", "/")}:${index + 1}: ${safeModelText(
          line.trim(),
          240,
        )}`,
      );
    }
  }
  const suffix =
    matches.length >= maxMatches
      ? `\n[truncated after ${maxMatches} matches]`
      : skippedLargeFiles > 0
        ? `\n[skipped ${skippedLargeFiles} large files]`
        : "";
  const output =
    `[search_files query=${JSON.stringify(redactProviderText(matcher.query))} path=${target.relativePath.replaceAll("\\", "/")} files=${files.length} matches=${matches.length}]` +
    `\n${matches.join("\n")}${suffix}`;
  return {
    ok: true,
    output: safeModelText(output, context.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS),
    touchedFiles: [],
  };
}
async function writeFileTool(args, context) {
  assertNotAborted(context.signal, "write_file");
  const content = typeof args.content === "string" ? args.content : null;
  if (content == null) {
    throw new RuntimeExecutionError("write_file requires string content", undefined, "permission");
  }
  const requestedPath = readString(args.path);
  const targetPath = resolveInsideProjectRoot(context.projectRoot, requestedPath, "write path");
  assertWritePathAllowed(context, targetPath.relativePath, "write path");
  const target = await resolveWritablePathInsideProjectRoot(
    context.projectRoot,
    targetPath.relativePath,
    "write path",
  );
  assertNotAborted(context.signal, "write_file");
  await writeFile(target.absolutePath, content, "utf8");
  return {
    ok: true,
    output: `wrote ${content.length} chars to ${target.relativePath}`,
    touchedFiles: [target.relativePath],
  };
}
function extractPatchPaths(patch) {
  const paths = new Set();
  for (const line of patch.split(/\r?\n/)) {
    if (!line.startsWith("--- ") && !line.startsWith("+++ ")) continue;
    const headerPath = line.slice(4).trim();
    if (headerPath.includes('"')) {
      throw new RuntimeExecutionError(
        "quoted patch paths are not supported",
        undefined,
        "permission",
      );
    }
    if (/\s/.test(headerPath)) {
      throw new RuntimeExecutionError(
        "patch paths containing whitespace are not supported",
        undefined,
        "permission",
      );
    }
    const raw = headerPath;
    if (!raw || raw === "/dev/null") continue;
    const cleaned = raw.replace(/^[ab]\//, "");
    if (cleaned && cleaned !== "/dev/null") paths.add(cleaned);
  }
  return [...paths];
}
async function applyPatchTool(args, context) {
  const patch = readString(args.patch);
  if (!patch) {
    throw new RuntimeExecutionError("apply_patch requires patch content", undefined, "permission");
  }
  if (Buffer.byteLength(patch, "utf8") > DEFAULT_MAX_PATCH_BYTES) {
    throw new RuntimeExecutionError("patch exceeds maximum size", undefined, "permission");
  }
  const touchedFiles = extractPatchPaths(patch);
  if (touchedFiles.length === 0) {
    throw new RuntimeExecutionError(
      "patch does not include any file paths",
      undefined,
      "permission",
    );
  }
  if (/\b(?:new|old|deleted) file mode 120000\b/m.test(patch) || /\b120000\b/.test(patch)) {
    throw new RuntimeExecutionError(
      "patch must not create or modify symlinks",
      undefined,
      "permission",
    );
  }
  if (/\b100755\b/.test(patch)) {
    throw new RuntimeExecutionError(
      "patch must not create or modify executable files",
      undefined,
      "permission",
    );
  }
  for (const patchPath of touchedFiles) {
    const candidate = resolveInsideProjectRoot(context.projectRoot, patchPath, "patch path");
    assertWritePathAllowed(context, candidate.relativePath, "patch path");
    await resolveWritablePathInsideProjectRoot(
      context.projectRoot,
      candidate.relativePath,
      "patch path",
    );
  }
  assertNotAborted(context.signal, "apply_patch");
  const result = await spawnProcess({
    command: "git",
    args: ["apply", "--whitespace=nowarn"],
    cwd: resolveProjectRoot(context.projectRoot),
    env: buildSanitizedToolEnv(context.env),
    timeoutMs: context.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    maxOutputChars: context.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
    stdin: patch,
    signal: context.signal,
  });
  if (result.ok) {
    for (const patchPath of touchedFiles) {
      try {
        await assertPathHasNoSymlinkComponentsIfExists(
          context.projectRoot,
          resolveInsideProjectRoot(context.projectRoot, patchPath, "patch path").absolutePath,
          "patch path",
        );
      } catch (error) {
        throw error;
      }
    }
  }
  return { ...result, touchedFiles: result.ok ? touchedFiles : [] };
}
async function runShellTool(args, context) {
  assertNotAborted(context.signal, "run_shell");
  const command = readString(args.command);
  if (!command) {
    throw new RuntimeExecutionError("run_shell requires command", undefined, "permission");
  }
  if (command.includes("/") || command.includes("\\")) {
    throw new RuntimeExecutionError(
      "run_shell command must be an allowlisted basename",
      undefined,
      "permission",
    );
  }
  const commandArgs = readStringArray(args.args);
  assertShellArgumentsAreSafe(commandArgs);
  const permissionPolicy = context.permissionPolicy ?? getPermissionExecutionPolicy("general");
  const commandText = [command, ...commandArgs].join(" ");
  const shellDecision = decideShellPermission({
    intent: permissionPolicy.intent,
    command: commandText,
    requestedMode: permissionPolicy.defaultMode,
    humanApprovalBridgeAvailable: false,
  });
  if (!shellDecision.allowed) {
    throw new RuntimeExecutionError(
      shellDecision.reasons.join(" ") || "Shell command denied by permission policy.",
      undefined,
      "permission",
    );
  }
  validateStructuredShellCommand(command, commandArgs);
  const cwd = await resolveExistingPathInsideProjectRoot(
    context.projectRoot,
    readString(args.cwd),
    "shell cwd",
  );
  if (!cwd.info.isDirectory()) {
    throw new RuntimeExecutionError("shell cwd is not a directory", undefined, "permission");
  }
  if (isPackageManagerCommand(command)) {
    await validatePackageManagerProjectScript(command, commandArgs, cwd.absolutePath);
  }
  const timeoutMs = readPositiveInt(
    args.timeoutMs,
    context.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    context.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
  );
  if (command === "pwd") {
    return {
      ok: true,
      output: cwd.absolutePath,
      exitCode: 0,
      touchedFiles: [],
    };
  }
  const invocation = resolveStructuredShellInvocation(command, commandArgs);
  return spawnProcess({
    command: invocation.command,
    args: invocation.args,
    cwd: cwd.absolutePath,
    env: buildSanitizedToolEnv(context.env, packageManagerEnvExtras(command)),
    timeoutMs,
    maxOutputChars: context.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
    signal: context.signal,
  });
}
async function gitStatusTool(context) {
  assertNotAborted(context.signal, "git_status");
  return spawnProcess({
    command: "git",
    args: ["status", "--short", "--branch"],
    cwd: resolveProjectRoot(context.projectRoot),
    env: buildSanitizedToolEnv(context.env),
    timeoutMs: context.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    maxOutputChars: context.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
    signal: context.signal,
  });
}
async function computeAuditReportHashTool(args, context) {
  assertNotAborted(context.signal, "compute_audit_report_hash");
  const target = await resolveExistingPathInsideProjectRoot(
    context.projectRoot,
    readString(args.path),
    "audit report hash path",
  );
  assertWritePathAllowed(context, target.relativePath, "audit report hash path");
  if (!target.info.isFile()) {
    throw new RuntimeExecutionError(
      "audit report hash path is not a file",
      undefined,
      "permission",
    );
  }
  const content = await readFile(target.absolutePath, "utf8");
  const contentSha256 = computeAuditReportContentSha256(content);
  return {
    ok: true,
    output: `contentSha256 ${target.relativePath.replaceAll("\\", "/")} ${contentSha256}`,
    exitCode: 0,
    touchedFiles: [],
  };
}
function isAllowedPathForContext(context, relativePath) {
  const allowed = context.allowedWritePaths ?? [];
  const normalized = normalizePathForPolicy(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => GENERATED_WRITE_DENY_DIRECTORY_SEGMENTS.has(segment))) {
    return false;
  }
  if (allowed.length === 0) return true;
  return allowed.some((allowedPath) => pathMatchesAllowedWriteBoundary(normalized, allowedPath));
}
const MIN_EXPANDABLE_AUDIT_EVIDENCE_REF_LENGTH = "ev_00000000".length;

function buildAuditEvidenceRefExpander(auditEvidenceUnits = []) {
  const ids = [
    ...new Set(
      auditEvidenceUnits
        .map((unit) => (unit && typeof unit.id === "string" ? unit.id : null))
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) return null;
  const exactIds = new Set(ids);
  return (ref) => {
    if (exactIds.has(ref)) return ref;
    if (ref.length < MIN_EXPANDABLE_AUDIT_EVIDENCE_REF_LENGTH) return ref;
    const matches = ids.filter((id) => id.startsWith(ref));
    return matches.length === 1 ? matches[0] : ref;
  };
}

function expandAuditEvidenceRefPrefixesInContent(content, expandEvidenceRef) {
  if (!expandEvidenceRef) return { content, expandedCount: 0 };
  let expandedCount = 0;
  const updated = content.replace(/\bev_[A-Za-z0-9][A-Za-z0-9_-]*\b/g, (ref) => {
    const expanded = expandEvidenceRef(ref);
    if (expanded !== ref) expandedCount += 1;
    return expanded;
  });
  return { content: updated, expandedCount };
}

function normalizeAuditManifestEvidenceRefs(value, expandEvidenceRef) {
  if (!expandEvidenceRef) return value;
  if (typeof value === "string") return expandEvidenceRef(value);
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeAuditManifestEvidenceRefs(entry, expandEvidenceRef));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "evidenceRefs" ? normalizeAuditManifestEvidenceRefs(entry, expandEvidenceRef) : entry,
    ]),
  );
}

function applyAuditReportManifestRuntimeIdentity(manifest, auditReportValidation, artifactPath) {
  if (!auditReportValidation) return manifest;
  const updated = { ...manifest };
  if (auditReportValidation.taskId) updated.taskId = auditReportValidation.taskId;
  if (auditReportValidation.roadmapBatchId) {
    updated.batchId = auditReportValidation.roadmapBatchId;
  }
  if (auditReportValidation.roadmapAlias) updated.roadmapAlias = auditReportValidation.roadmapAlias;
  if (artifactPath) updated.artifactPath = artifactPath;
  if (auditReportValidation.taskId || auditReportValidation.auditPlanId) {
    updated.auditPlanId = resolveAuditPlanId({
      taskId: auditReportValidation.taskId,
      auditPlanId: auditReportValidation.auditPlanId,
      roadmapBatchId: auditReportValidation.roadmapBatchId,
    });
  }
  return updated;
}
function updateAuditReportManifestContentSha256(
  content,
  label,
  auditEvidenceUnits = [],
  auditReportValidation = null,
  artifactPath = null,
) {
  const expandEvidenceRef = buildAuditEvidenceRefExpander(auditEvidenceUnits);
  const expanded = expandAuditEvidenceRefPrefixesInContent(content, expandEvidenceRef);
  const normalizedContent = expanded.content;
  const matches = [...normalizedContent.matchAll(AUDIT_REPORT_MANIFEST_BLOCK_PATTERN)];
  if (matches.length !== 1) {
    throw new RuntimeExecutionError(
      matches.length === 0
        ? `${label} is missing an exact audit report manifest fence; the opening line must be \`\`\`audit-report-manifest`
        : `${label} must include exactly one audit report manifest fence`,
      undefined,
      "permission",
    );
  }
  const match = matches[0];
  const prefix = match[1] ?? "";
  const manifestText = match[2] ?? "";
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
    manifest = normalizeAuditManifestEvidenceRefs(manifest, expandEvidenceRef);
    manifest = applyAuditReportManifestRuntimeIdentity(
      manifest,
      auditReportValidation,
      artifactPath,
    );
  } catch (error) {
    throw new RuntimeExecutionError(
      `audit report manifest JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      "permission",
    );
  }
  const contentSha256 = computeAuditReportContentSha256(normalizedContent);
  manifest.contentSha256 = contentSha256;
  const replacement = `${prefix}\`\`\`audit-report-manifest\n${JSON.stringify(
    manifest,
    null,
    2,
  )}\n\`\`\``;
  const updated =
    normalizedContent.slice(0, match.index) +
    replacement +
    normalizedContent.slice(match.index + match[0].length);
  return { updated, contentSha256, expandedEvidenceRefCount: expanded.expandedCount };
}
async function finalizeAuditReportManifestTool(args, context) {
  assertNotAborted(context.signal, "finalize_audit_report_manifest");
  const target = await resolveExistingPathInsideProjectRoot(
    context.projectRoot,
    readString(args.path),
    "audit report finalize path",
  );
  assertWritePathAllowed(context, target.relativePath, "audit report finalize path");
  if (!target.info.isFile()) {
    throw new RuntimeExecutionError(
      "audit report finalize path is not a file",
      undefined,
      "permission",
    );
  }
  const content = await readFile(target.absolutePath, "utf8");
  const { updated, contentSha256, expandedEvidenceRefCount } =
    updateAuditReportManifestContentSha256(
      content,
      "audit report finalize path",
      context.auditEvidenceUnits ?? [],
      context.auditReportValidation ?? null,
      target.relativePath.replaceAll("\\", "/"),
    );
  assertNotAborted(context.signal, "finalize_audit_report_manifest");
  if (updated !== content) {
    await writeFile(target.absolutePath, updated, "utf8");
  }
  return {
    ok: true,
    output: `updated contentSha256 ${target.relativePath.replaceAll("\\", "/")} ${contentSha256}${expandedEvidenceRefCount > 0 ? `; expanded ${expandedEvidenceRefCount} audit evidence ref prefix(es)` : ""}`,
    exitCode: 0,
    touchedFiles: [target.relativePath],
  };
}
function extractAuditFindingHeadings(content) {
  const findingsSection = content.match(
    /(?:^|\n)##\s+Findings\b[\s\S]*?(?=\n##\s+(?:No-Validated-Finding Claims|Verification|Scope Coverage|Weak|Discarded|Limitations|$))/i,
  )?.[0];
  const source = findingsSection ?? content;
  const headings = [];
  for (const match of source.matchAll(/^\s{0,3}#{3,6}\s+(.+?)\s*$/gm)) {
    const heading = String(match[1] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!heading || /\b(?:weak|discarded|no-validated|verification|scope)\b/i.test(heading)) {
      continue;
    }
    headings.push(heading);
  }
  return [...new Set(headings)].slice(0, 8);
}
function formatAuditReportIssueActions(validation, issueCodes) {
  const issueCodeSet = new Set(issueCodes);
  const actions = [];
  if (validation.sourceClassification === "inventory_only_invalid") {
    actions.push(
      "inventory_only_invalid => discard the current report body shape and rebuild from scoped source evidence; inventory, file lists, generated plans, and path existence cannot support trusted findings or no-findings.",
    );
  }
  if (issueCodeSet.has("non_actionable_audit_observation")) {
    actions.push(
      "non_actionable_audit_observation => delete broad architecture/maintainability-smell findings unless the report proves a concrete broken behavior, unsafe runtime boundary, data-loss path, or security/control failure.",
    );
  }
  if (issueCodeSet.has("governance_observation_as_finding")) {
    actions.push(
      "governance_observation_as_finding => move documentation/ownership/API-boundary observations out of trusted findings; they may only appear as weak/discarded context or be omitted.",
    );
  }
  if (issueCodeSet.has("unverified_inspection_claim")) {
    actions.push(
      "unverified_inspection_claim => remove claims based on skipped large-file searches, budget limits, 'too large', 'not visible', 'would show', or other unobserved evidence; skipped search output cannot prove no-callers/no-wiring/unused-code/orphaned-module claims.",
    );
  }
  if (issueCodeSet.has("missing_scope_coverage")) {
    const uncovered = validation.scopeCoverage
      .filter((entry) => entry.exists && !entry.ok)
      .map((entry) => entry.root)
      .slice(0, 8);
    actions.push(
      `missing_scope_coverage => cover every declared scope root${uncovered.length ? ` (${uncovered.join(", ")})` : ""} with exact existing path:line or path:start-end citations to substantive lines; do not use line 1 when it is only a heading, import, comment, docstring, blank line, brace, or metadata.`,
    );
  }
  if (issueCodeSet.has("audit_evidence_scope_mismatch")) {
    actions.push(
      "audit_evidence_scope_mismatch => every manifest scopeCoverage, finding, and noFindingsClaims evidenceRefs entry must cite actual ev_* ledger IDs whose scopeIds cover that exact declared scope root; finding labels, risk IDs, paths, and AOB-style IDs are not evidenceRefs.",
    );
  }
  if (issueCodeSet.has("audit_evidence_risk_mismatch")) {
    actions.push(
      "audit_evidence_risk_mismatch => every manifest finding and noFindingsClaims entry must cite ledger IDs whose riskHypothesisIds match the claimed risk ID; do not reuse unrelated evidence IDs.",
    );
  }
  if (issueCodeSet.has("irrelevant_audit_evidence")) {
    actions.push(
      "irrelevant_audit_evidence => remove hidden/generated files such as `.ai-factory/*`, generated plans, prior audit artifacts, or unscoped docs from every Evidence, limitation, manifest, and rationale field unless they are explicitly in the task Scope.",
    );
  }
  if (issueCodeSet.has("missing_report_file_references")) {
    actions.push(
      "missing_report_file_references => replace bare basenames like `bot.py` or `backup_crypto.py` with full repository-relative paths everywhere, including headings, tables, and limitations.",
    );
  }
  if (issueCodeSet.has("invalid_or_missing_file_references")) {
    actions.push(
      "invalid_or_missing_file_references => remove nonexistent/future paths and basename-only tokens from Evidence, Risk, Proposed fix, limitations, and manifest fields; use existing repository-relative paths with lines or describe remediation generically.",
    );
  }
  if (issueCodeSet.has("low_quality_report_evidence")) {
    actions.push(
      "low_quality_report_evidence => delete orphan/no-wiring/dead-code guesses, late-import/mixed-import/split-import/cold-start-footprint observations, duplicated-initialization/DRY, import-chain/tight-coupling, private-method/direct-store, and partially inspected source_inconclusive findings unless existing ledger evidence proves concrete broken behavior.",
    );
  }
  if (issueCodeSet.has("invalid_line_reference")) {
    actions.push(
      "invalid_line_reference => cite real source lines only; do not place `read_file(...)`, `search_files(...)`, shell commands, or tool-output snippets immediately after a source path:line as if they were source text.",
    );
  }
  if (issueCodeSet.has("missing_audit_evidence_ref")) {
    actions.push(
      "missing_audit_evidence_ref => copy exact actual runtime audit ledger IDs (`ev_*`) from the ledger; do not abbreviate or invent ev_* IDs.",
    );
  }
  if (issueCodeSet.has("manifest_outcome_mismatch")) {
    actions.push(
      `manifest_outcome_mismatch => set manifest outcome to match the repaired report. Validator currently classifies the report as ${validation.sourceClassification}.`,
    );
  }
  if (issueCodeSet.has("missing_report_manifest_fields")) {
    actions.push(
      "missing_report_manifest_fields => if outcome is validated_no_findings, include non-empty noFindingsClaims with riskId/root/evidenceRefs; if trusted findings exist, do not also claim no-findings.",
    );
  }
  if (issueCodeSet.has("contradictory_findings_and_no_findings")) {
    actions.push(
      "contradictory_findings_and_no_findings => choose exactly one trusted outcome shape; do not mix ### Finding or ### Risk sections with No validated findings; use a checklist/table for no-findings claims instead.",
    );
  }
  if (issueCodeSet.has("manifest_identity_mismatch")) {
    actions.push(
      "manifest_identity_mismatch => call `finalize_audit_report_manifest` after editing; the tool normalizes runtime identity fields such as taskId, batchId, roadmapAlias, auditPlanId, and artifactPath.",
    );
  }
  return actions.slice(0, 10);
}
function formatAuditReportValidationResult(validation, content = "") {
  const issueCodes =
    validation.issueCodes ?? [...new Set(validation.issues.map((entry) => entry.code))].sort();
  const issueLines = validation.issues
    .slice(0, 12)
    .map((entry) => {
      const paths = entry.paths?.length ? ` paths=${entry.paths.slice(0, 5).join(",")}` : "";
      return `- ${entry.code}: ${entry.message}${paths}`;
    })
    .join("\n");
  const suffix =
    validation.issues.length > 12
      ? `\n- ... ${validation.issues.length - 12} more issue(s) omitted`
      : "";
  return [
    `sourceClassification=${validation.sourceClassification}`,
    `manifestStatus=${validation.manifestStatus}`,
    `issueCodes=${issueCodes.length > 0 ? issueCodes.join(",") : "none"}`,
    `repairMode=${validation.repairMode ?? "unknown"}`,
    `validationFingerprint=${validation.validationFingerprint ?? "unknown"}`,
    `blockingIssues=${validation.blockingIssues?.length ?? validation.issues.length}`,
    formatAuditReportRepairDirective(validation, issueCodes, content),
    `referencedPaths=${validation.referencedPaths.length}`,
    `missingReferencedPaths=${validation.missingReferencedPaths.length}`,
    issueLines ? `issues:\n${issueLines}${suffix}` : "issues: none",
  ]
    .filter(Boolean)
    .join("\n");
}
function formatAuditReportRepairDirective(validation, issueCodes, content = "") {
  const issueCodeSet = new Set(issueCodes);
  const lowQualityCodes = [
    "fake_or_placeholder_command_output",
    "future_tense_git_verification",
    "governance_observation_as_finding",
    "non_actionable_audit_observation",
    "speculative_audit_claim",
    "synthetic_git_output",
    "unverified_inspection_claim",
  ];
  const lowQualityIssuePresent = lowQualityCodes.some((code) => issueCodeSet.has(code));
  const invalidTrustedOutcome =
    issueCodeSet.has("manifest_outcome_mismatch") &&
    ["insufficient_substantive_evidence", "inventory_only_invalid", "source_inconclusive"].includes(
      validation.sourceClassification,
    );
  if (!lowQualityIssuePresent && !invalidTrustedOutcome) return "";
  const rejectedFindingHeadings = extractAuditFindingHeadings(content);
  const issueActions = formatAuditReportIssueActions(validation, issueCodes);
  return [
    "repairDirective=LOW_QUALITY_AUDIT_REPORT_REPAIR_REQUIRED",
    "reviewerRepairBrief=The deterministic reviewer rejected the current trusted-report shape. Treat this as a new report repair brief, not as a request to cosmetically rewrite the same findings.",
    "rejectedShapeSummary=line-count, central-hub, orphan/no-wiring/dead-code, late-import/mixed-import/split-import/cold-start-footprint, duplicated-initialization/DRY, import-chain/tight-coupling, private-method/direct-store, optional-dependency/runtime-guard, and skipped-large-file absence claims are not trusted findings without concrete broken behavior.",
    "Absence summary: no-callers/no-wiring/unused-code/orphaned-module claims require targeted scoped evidence that covers skipped files.",
    "Path summary: replace basename-only paths and future paths with existing repository-relative path:line evidence.",
    "Do not cite `.ai-factory/*`, generated plans, prior audit artifacts, or unscoped docs unless explicitly scoped.",
    ...(rejectedFindingHeadings.length > 0
      ? [
          "rejectedFindingCandidates:",
          ...rejectedFindingHeadings.map((heading) => `- ${heading}`),
          "Do not keep, rename, or rephrase the rejected finding candidates as trusted findings unless you can replace them with a concrete broken behavior proven by existing ledger-backed evidence.",
        ]
      : []),
    ...(issueActions.length > 0
      ? ["requiredRepairActions:", ...issueActions.map((entry) => `- ${entry}`)]
      : []),
    "Delete every finding that depends on the rejected observation; do not rephrase it as another trusted finding.",
    "Do not spend more source-inspection budget during this repair; use the existing ledger evidence and edit only the audit report artifact, then finalize it again.",
    "If no finding remains after deleting weak observations, rewrite the report as validated_no_findings with an Evidence Register and risk-by-risk no-findings claims tied to observed file:line evidence.",
    "For validated_no_findings, do not create `### Finding` or `### Risk` sections; use a concise checklist/table in the body and manifest noFindingsClaims with matching ledger evidenceRefs.",
    "For validated_no_findings, every declared scope root must appear in the Evidence Register and manifest scopeCoverage/noFindingsClaims with a real path:line citation from that exact root and matching ev_* ledger evidence.",
    "If existing ledger evidence cannot support either trusted findings or substantive no-findings coverage, set the report outcome to source_inconclusive and state the exact coverage gap instead of looping.",
    "Manifest evidenceRefs arrays must contain actual runtime audit ledger IDs (`ev_*`) only. Do not put finding labels, risk IDs, path names, AOB-style IDs, or invented short tokens in evidenceRefs.",
    "Every repository path in Evidence, Risk, Proposed fix, limitations, and manifest fields must be an existing repository-relative path with concrete lines when used as evidence. Remove basename-only paths and future file names.",
    "Do not cite or mention `.ai-factory/*`, generated plans, prior audit artifacts, or unscoped docs as source evidence, report limitations, or manifest rationale unless explicitly scoped.",
    "Zero-match searches and search output that skipped large files cannot prove no callers, no wiring, unused code, or orphaned modules; use targeted scoped reads/searches that cover the skipped files, or omit the claim/source_inconclusive.",
    "Do not promote line-count, central-hub, monolithic-file, import-count, orphan/no-wiring/dead-code guesses, late-import/mixed-import/split-import/cold-start-footprint observations, duplicated-initialization/DRY, import-chain/tight-coupling-without-real-cycle, private-method/direct-store/abstraction-bypass, module-boundary-documentation, __all__, optional-dependency/runtime-guard, source_inconclusive-as-finding, or missing-doc mapping observations unless a concrete broken behavior is proven by ledger-backed evidence.",
  ].join("\n");
}
function runAuditReportValidationForTarget(context, target, content) {
  const auditContext = context.auditReportValidation ?? {};
  return validateAuditReportArtifact({
    text: content,
    projectRoot: context.projectRoot,
    taskId: auditContext.taskId ?? null,
    roadmapBatchId: auditContext.roadmapBatchId ?? null,
    roadmapAlias: auditContext.roadmapAlias ?? null,
    auditPlanId: auditContext.auditPlanId ?? null,
    taskDescription: auditContext.taskDescription ?? null,
    reportArtifactPaths: [target.relativePath],
    expectedReportArtifactPath: auditContext.expectedReportArtifactPath ?? target.relativePath,
    requireProposedFix: true,
    auditEvidenceUnits: context.auditEvidenceUnits ?? [],
    requireLedgerEvidence: (context.auditEvidenceUnits ?? []).length > 0,
  });
}
async function validateAuditReportTool(args, context) {
  assertNotAborted(context.signal, "validate_audit_report");
  const target = await resolveExistingPathInsideProjectRoot(
    context.projectRoot,
    readString(args.path),
    "audit report validation path",
  );
  assertWritePathAllowed(context, target.relativePath, "audit report validation path");
  if (!target.info.isFile()) {
    throw new RuntimeExecutionError(
      "audit report validation path is not a file",
      undefined,
      "permission",
    );
  }
  const content = await readFile(target.absolutePath, "utf8");
  const validation = runAuditReportValidationForTarget(context, target, content);
  return {
    ok: validation.ok,
    output: `audit report validation ${validation.ok ? "passed" : "failed"} ${target.relativePath.replaceAll("\\", "/")}\n${formatAuditReportValidationResult(validation, content)}`,
    ...(validation.ok ? {} : { error: "audit report validation failed" }),
    auditReportValidation: {
      ok: validation.ok,
      issueCodes: validation.issueCodes,
      blockingIssues: validation.blockingIssues,
      repairMode: validation.repairMode,
      validationFingerprint: validation.validationFingerprint,
      sourceClassification: validation.sourceClassification,
      manifestStatus: validation.manifestStatus,
    },
    exitCode: validation.ok ? 0 : 1,
    touchedFiles: [],
  };
}
async function assertAuditReportReadyForCommitIfApplicable(context, relativePath) {
  if (!isAllowedPathForContext(context, relativePath)) return;
  const normalized = normalizePathForPolicy(relativePath);
  if (!normalized.startsWith("audit/") || !normalized.endsWith(".md")) return;
  const target = await resolveExistingPathInsideProjectRoot(
    context.projectRoot,
    relativePath,
    "git commit audit report path",
  );
  if (!target.info.isFile()) return;
  const content = await readFile(target.absolutePath, "utf8");
  const matches = [...content.matchAll(AUDIT_REPORT_MANIFEST_BLOCK_PATTERN)];
  if (matches.length !== 1) {
    throw new RuntimeExecutionError(
      matches.length === 0
        ? "audit report must include an exact manifest fence before git_commit; opening line must be ```audit-report-manifest. Call finalize_audit_report_manifest after fixing the fence."
        : "audit report must include exactly one manifest fence before git_commit",
      undefined,
      "permission",
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(matches[0][2] ?? "");
  } catch (error) {
    throw new RuntimeExecutionError(
      `audit report manifest JSON is invalid before git_commit: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      "permission",
    );
  }
  const expected = computeAuditReportContentSha256(content);
  if (manifest.contentSha256 !== expected) {
    throw new RuntimeExecutionError(
      "audit report contentSha256 is not finalized before git_commit; call finalize_audit_report_manifest with the report path and then retry git_commit",
      undefined,
      "permission",
    );
  }
  const validation = runAuditReportValidationForTarget(context, target, content);
  if (!validation.ok) {
    throw new RuntimeExecutionError(
      `audit report validation failed before git_commit; call validate_audit_report, fix the report, finalize the manifest, and retry git_commit.\n${formatAuditReportValidationResult(validation)}`,
      undefined,
      "permission",
    );
  }
}
async function gitCommitTool(args, context) {
  assertNotAborted(context.signal, "git_commit");
  const paths = readStringArray(args.paths);
  const message = readString(args.message);
  if (paths.length === 0) {
    throw new RuntimeExecutionError(
      "git_commit requires at least one path",
      undefined,
      "permission",
    );
  }
  if (!message) {
    throw new RuntimeExecutionError(
      "git_commit requires a commit message",
      undefined,
      "permission",
    );
  }
  const relativePaths = paths.map(
    (entry) => resolveInsideProjectRoot(context.projectRoot, entry, "git commit path").relativePath,
  );
  for (const entry of relativePaths) {
    assertWritePathAllowed(context, entry, "git commit path");
  }
  for (const entry of relativePaths) {
    const target = await resolveExistingPathInsideProjectRoot(
      context.projectRoot,
      entry,
      "git commit path",
    );
    if (!target.info.isFile()) {
      throw new RuntimeExecutionError("git commit path is not a file", undefined, "permission");
    }
  }
  for (const entry of relativePaths) {
    await assertAuditReportReadyForCommitIfApplicable(context, entry);
  }
  const root = resolveProjectRoot(context.projectRoot);
  const env = buildSanitizedToolEnv(context.env);
  const timeoutMs = context.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const maxOutputChars = context.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  assertNotAborted(context.signal, "git_commit");
  const addResult = await spawnProcess({
    command: "git",
    args: ["add", "--", ...relativePaths],
    cwd: root,
    env,
    timeoutMs,
    maxOutputChars,
    signal: context.signal,
  });
  if (!addResult.ok) {
    return addResult;
  }
  const hooksPath = await mkdtemp(path.join(tmpdir(), "qwen-git-hooks-disabled-"));
  assertNotAborted(context.signal, "git_commit");
  const commitResult = await spawnProcess({
    command: "git",
    args: [
      "-c",
      `core.hooksPath=${hooksPath}`,
      "commit",
      "--no-verify",
      "-m",
      message,
      "--",
      ...relativePaths,
    ],
    cwd: root,
    env,
    timeoutMs,
    maxOutputChars,
    signal: context.signal,
  });
  return { ...commitResult, touchedFiles: commitResult.ok ? relativePaths : [] };
}
export async function executeQwenLocalTool(toolName, rawArgs, context) {
  const args = isRecord(rawArgs) ? rawArgs : {};
  const safeToolName = sanitizeQwenToolNameForLog(toolName);
  try {
    assertNotAborted(context.signal, safeToolName);
    switch (toolName) {
      case "list_files":
        return await listFiles(args, context);
      case "read_file":
        return await readFileTool(args, context);
      case "search_files":
        return await searchFilesTool(args, context);
      case "write_file":
        return await writeFileTool(args, context);
      case "apply_patch":
        return await applyPatchTool(args, context);
      case "run_shell":
        return await runShellTool(args, context);
      case "git_status":
        return await gitStatusTool(context);
      case "compute_audit_report_hash":
        return await computeAuditReportHashTool(args, context);
      case "finalize_audit_report_manifest":
        return await finalizeAuditReportManifestTool(args, context);
      case "validate_audit_report":
        return await validateAuditReportTool(args, context);
      case "git_commit":
        return await gitCommitTool(args, context);
      default:
        throw new RuntimeExecutionError(
          `unknown qwen-local-agent tool: ${safeToolName}`,
          undefined,
          "permission",
        );
    }
  } catch (error) {
    if (error instanceof RuntimeExecutionError) {
      return {
        ok: false,
        output: "",
        error: safeModelText(error.message, context.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS),
        exitCode: null,
        touchedFiles: [],
      };
    }
    return {
      ok: false,
      output: "",
      error: safeModelText(
        error instanceof Error ? error.message : String(error),
        context.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
      ),
      exitCode: null,
      touchedFiles: [],
    };
  }
}
export function qwenToolResultForModel(
  result,
  maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS,
  auditEvidence = null,
) {
  return JSON.stringify({
    ok: result.ok,
    output: safeModelText(result.output ?? "", maxOutputChars),
    ...(result.error ? { error: safeModelText(result.error, maxOutputChars) } : {}),
    ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
    touchedFiles: result.touchedFiles,
    ...(auditEvidence
      ? {
          auditEvidence: {
            id: auditEvidence.id,
            evidenceKind: auditEvidence.evidenceKind,
            evidenceGrade: auditEvidence.evidenceGrade,
            scopeIds: auditEvidence.scopeIds,
            riskHypothesisIds: auditEvidence.riskHypothesisIds,
            outputSha256: auditEvidence.outputSha256,
            outputPreview: auditEvidence.outputPreview,
            outputPreviewTruncated: auditEvidence.outputPreviewTruncated,
          },
        }
      : {}),
  });
}
export function createDefaultQwenToolContext(input) {
  const projectRoot = input.projectRoot ?? input.cwd;
  if (!projectRoot) {
    throw new RuntimeExecutionError(
      "qwen-local-agent requires projectRoot",
      undefined,
      "permission",
    );
  }
  const options = input.options ?? {};
  const plannerLike = isPlannerLikeWorkflow(input.workflowKind);
  const defaultMaxFileBytes = plannerLike ? PLANNER_MAX_FILE_BYTES : DEFAULT_MAX_FILE_BYTES;
  const defaultMaxFileLines = plannerLike ? PLANNER_MAX_FILE_LINES : DEFAULT_MAX_FILE_LINES;
  const defaultMaxDirectoryEntries = plannerLike
    ? PLANNER_MAX_DIRECTORY_ENTRIES
    : DEFAULT_MAX_DIRECTORY_ENTRIES;
  const defaultMaxSearchMatches = plannerLike
    ? PLANNER_MAX_SEARCH_MATCHES
    : DEFAULT_MAX_SEARCH_MATCHES;
  const defaultMaxOutputChars = plannerLike ? PLANNER_MAX_OUTPUT_CHARS : DEFAULT_MAX_OUTPUT_CHARS;
  const maxFileBytesLimit = plannerLike ? PLANNER_MAX_FILE_BYTES : Number.MAX_SAFE_INTEGER;
  const maxFileLinesLimit = plannerLike ? PLANNER_MAX_FILE_LINES : MAX_FILE_LINES;
  const maxDirectoryEntriesLimit = plannerLike
    ? PLANNER_MAX_DIRECTORY_ENTRIES
    : Number.MAX_SAFE_INTEGER;
  const maxSearchMatchesLimit = plannerLike ? PLANNER_MAX_SEARCH_MATCHES : Number.MAX_SAFE_INTEGER;
  const maxOutputCharsLimit = plannerLike ? PLANNER_MAX_OUTPUT_CHARS : Number.MAX_SAFE_INTEGER;
  const env = { ...process.env, ...(input.environment ?? {}) };
  const projectRootPath = resolveProjectRoot(projectRoot);
  const auditReportValidation = readAuditReportValidationContext(input, projectRootPath);
  return {
    projectRoot: projectRootPath,
    signal: input.signal,
    env,
    maxFileBytes: readPositiveInt(options.maxFileBytes, defaultMaxFileBytes, maxFileBytesLimit),
    maxFileLines: readPositiveInt(options.maxFileLines, defaultMaxFileLines, maxFileLinesLimit),
    maxDirectoryEntries: readPositiveInt(
      options.maxDirectoryEntries,
      defaultMaxDirectoryEntries,
      maxDirectoryEntriesLimit,
    ),
    maxSearchMatches: readPositiveInt(
      options.maxSearchMatches,
      defaultMaxSearchMatches,
      maxSearchMatchesLimit,
    ),
    maxOutputChars: readPositiveInt(
      options.maxOutputChars,
      defaultMaxOutputChars,
      maxOutputCharsLimit,
    ),
    toolTimeoutMs: readPositiveInt(options.toolTimeoutMs, DEFAULT_TOOL_TIMEOUT_MS),
    permissionPolicy: input.execution?.permissionPolicy ?? getPermissionExecutionPolicy("general"),
    allowedWritePaths: readAllowedWritePaths(input, projectRootPath),
    auditReportValidation,
    auditEvidenceUnits: readAuditEvidenceUnits(input),
    auditEvidenceUnitContext: buildAuditEvidenceUnitContext(auditReportValidation, projectRootPath),
  };
}
export function createTempPathForTests(name) {
  return path.join(tmpdir(), name);
}
