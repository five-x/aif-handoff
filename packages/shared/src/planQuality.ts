import {
  getTaskIntentPolicy,
  inferTaskIntent,
  isTaskIntent,
  type TaskIntent,
} from "./taskIntent.js";
import type { TaskIntentChangeCategory } from "./taskIntentContracts.js";
import {
  classifyAuditDecompositionRequest,
  isAuditReportArtifactPath,
  parseExpectedAuditReportArtifactPath,
  parseAuditScopeRoots,
} from "./auditRoadmapContract.js";

export const TASK_PLAN_QUALITY_ISSUE_CODES = [
  "empty_plan",
  "missing_checklist",
  "placeholder_plan",
  "generic_plan",
  "slash_fallback_echo",
  "thinking_artifact",
  "missing_task_specific_artifact_path",
  "missing_diagnostic_report_constraints",
  "diagnostic_report_artifact_mismatch",
  "diagnostic_scope_violation",
  "missing_audit_evidence_targets",
  "missing_audit_exclusions",
  "missing_audit_report_structure",
  "missing_child_audit_report_decision",
  "missing_audit_decomposition",
  "audit_without_concrete_boundaries",
  "missing_plan_manifest",
  "invalid_plan_manifest",
  "unsupported_plan_manifest_version",
  "missing_plan_manifest_fields",
  "plan_manifest_task_mismatch",
  "plan_manifest_intent_mismatch",
  "plan_manifest_missing_scope",
  "plan_manifest_scope_mismatch",
  "plan_manifest_missing_expected_artifacts",
  "plan_manifest_expected_artifact_violation",
  "plan_manifest_untestable_acceptance_criteria",
  "plan_manifest_missing_verification_commands",
  "plan_manifest_infeasible_verification",
  "plan_manifest_allowed_change_violation",
  "plan_manifest_forbidden_change_violation",
  "task_size_split_required",
  "local_aif_validation_forbidden",
] as const;

export type TaskPlanQualityIssueCode = (typeof TASK_PLAN_QUALITY_ISSUE_CODES)[number];

export interface TaskPlanQualityTask {
  id?: string | null;
  title: string;
  description?: string | null;
  taskIntent?: TaskIntent | null;
  tags?: string[] | string | null;
  roadmapAlias?: string | null;
  planPath?: string | null;
  plannerMode?: string | null;
  createdAt?: string | null;
  blockedFromStatus?: string | null;
  blockedReason?: string | null;
  auditArtifactRole?: "report" | "synthesis" | null;
  roadmapBatchId?: string | null;
  sourceReportArtifacts?: TaskPlanQualitySourceReportArtifact[] | null;
}

export interface TaskPlanQualitySourceReportArtifact {
  taskId: string;
  artifactPath: string;
  state: string;
  failureFamily?: string | null;
  trusted?: boolean | null;
}

export interface TaskPlanQualityIssue {
  code: TaskPlanQualityIssueCode;
  message: string;
}

export interface TaskPlanQualityResult {
  ok: boolean;
  issues: TaskPlanQualityIssue[];
  categories: TaskPlanQualityIssueCode[];
  planManifest?: AifPlanManifestValidationSummary;
}

export interface TaskPlanQualityInput {
  task: TaskPlanQualityTask;
  plan: string | null | undefined;
  executionContext?: TaskPlanQualityExecutionContext;
}

export interface TaskPlanQualityExecutionContext {
  packageJsonText?: string | null;
}

export interface AifPlanManifestExpectedArtifact {
  kind: string;
  paths: string[];
}

export interface AifPlanManifestAcceptanceCriterion {
  id: string;
  description: string;
  verification: string;
}

export interface AifPlanManifest {
  version: 1;
  taskId: string;
  intent: TaskIntent;
  scope: string[];
  allowedChanges: string[];
  forbiddenChanges: string[];
  expectedArtifacts: AifPlanManifestExpectedArtifact[];
  acceptanceCriteria: AifPlanManifestAcceptanceCriterion[];
  verificationCommands: string[];
}

export interface AifPlanManifestValidationSummary {
  required: boolean;
  present: boolean;
  status: "missing" | "invalid" | "valid" | "not_required";
  taskId: string | null;
  intent: TaskIntent | null;
  issueCodes: TaskPlanQualityIssueCode[];
}

export interface DeterministicDiagnosticPlanInput {
  task: TaskPlanQualityTask;
  extraText?: Array<string | null | undefined>;
}

export interface NormalizeAifPlanManifestForTaskInput {
  task: TaskPlanQualityTask;
  plan: string;
}

const CHECKLIST_PATTERN = /^\s*[-*]\s+\[(?: |x|X)\]\s+\S/m;
const CHECKLIST_ITEM_PATTERN = /^\s*[-*]\s+\[(?: |x|X)\]\s+(.+)$/gm;
const PLAN_MANIFEST_BLOCK_PATTERN = /```aif-plan-manifest\b[^\r\n]*\r?\n([\s\S]*?)```/gi;
export const PLAN_MANIFEST_REQUIRED_CREATED_AT = "2026-05-16T06:00:00.000Z";
const THINKING_ARTIFACT_PATTERN = /<\/?think\b[^>]*>/i;
const SLASH_FALLBACK_ECHO_PATTERN =
  /(^|\s)(?:\/|\$)aif-plan\b|<aif-plan\b|<\/aif-plan>|^\s*(?:docs|tests)\s*:\s*false\s*$/im;
const PLACEHOLDER_PLAN_PATTERN =
  /\b(?:short task|todo|tbd|placeholder|no implementation needed|task is already complete|i cannot help with that request)\b/i;
const GENERIC_PLAN_PATTERN =
  /^(?:task|todo|fix|fix bug|do task|do it|make changes|update code|small cleanup|implement task|complete task|implement the task)$/i;
const DIAGNOSTIC_TASK_PATTERN =
  /\b(?:audit|discovery|inventory|gap[-_\s]?analysis|findings?|security[-_\s]+review|code[-_\s]+review|review[-_\s]+findings?|validation[-_\s]+(?:task|report|audit|findings?)|verification[-_\s]+(?:task|report|audit|findings?)|(?:validate|verify)[-_\s]+(?:and[-_\s]+)?(?:report|findings?))\b/i;
const REPORT_ARTIFACT_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:(?:docs\/)?(?:[\w.@-]+\/)*[\w.@-]*(?:result|report|audit|review|findings|discovery)[\w.@-]*|(?:reports?|audit|review|reviews|findings|discovery|artifacts)\/(?:[\w.@-]+\/)*[\w.@-]+)\.(?:md|mdx|txt))(?:[:]\d+(?::\d+)?)?/gi;
const REPO_PATH_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+\.(?:jsonc|json|jsx|tsx|yaml|yml|mdx|mjs|cjs|bat|cmd|cpp|css|env|hpp|html|ini|java|lock|md|ps1|py|rs|scss|sh|sql|toml|txt|xml|js|ts|go|kt|cs|c|h))(?:[:]\d+(?::\d+)?)?/gi;
const DIAGNOSTIC_ONLY_PATTERN =
  /\b(?:diagnostic[-\s]?only|report[-\s]?only|audit[-\s]?only|review[-\s]?only|do not implement|must not implement|no implementation|do not create child|must not create child)\b/i;
const DIAGNOSTIC_SCOPE_VIOLATION_PATTERN =
  /\b(?:implement fixes?|fix findings?|patch code|modify source|create child implementation task|queue child implementation task)\b/i;
const LOCAL_AIF_VALIDATION_TERMS_PATTERN =
  /\b(?:localhost|127\.0\.0\.1|local\s+AIF|local\s+dev\s+server|local\s+e2e|AIF_SKIP_DEV_SERVER\s*=\s*0)\b/i;
const LOCAL_AIF_FORBIDDEN_PATTERN =
  /\b(?:forbidden|do not|must not|never|not allowed|disallowed|prohibited)\b/i;
const AUDIT_EVIDENCE_TARGETS_PATTERN =
  /\b(?:scope|scoped evidence targets?|evidence targets?|source targets?|target paths?|authorized source boundaries)\s*:/i;
const AUDIT_EXCLUSIONS_PATTERN =
  /^\s*(?:excluded areas?|exclusions?|out of scope)\s*:[^\S\r\n]*(?:none\b|no\b|\S[^\r\n]*)/im;
const AUDIT_NO_CHILD_REPORTS_PATTERN =
  /\b(?:(?:child audit reports?|child reports?|source reports?)\s*:\s*(?:not required|not needed|none|no)|no child audit reports?\s+(?:are\s+)?(?:required|needed))\b/i;
const AUDIT_CHILD_REPORTS_PATTERN =
  /\b(?:child audit reports?|child reports?|source reports?)\s*:\s*(?:required|yes|create|produce|needed)|\b(?:required|produce|create)\s+(?:child audit reports?|child reports?|source reports?)\b/i;
const AUDIT_SYNTHESIS_PATTERN = /\b(?:synthesis|synthesi[sz]e|summary|final audit report)\b/i;
const AUDIT_EXISTING_CHILD_REPORTS_PATTERN =
  /\b(?:existing|prior|previous|already generated|completed)\b[^\r\n.]{0,80}\b(?:child|source)?\s*audit reports?\b|\b(?:child|source)\s+audit reports?\b[^\r\n.]{0,80}\b(?:existing|prior|previous|already generated|completed)\b/i;
const AUDIT_BOUNDARY_LINE_PATTERN =
  /^\s*(?:scope|scoped evidence targets?|evidence targets?|source targets?|target paths?|authorized source boundaries)\s*:\s*(.+)$/gim;
const TASK_FILE_BOUNDARY_LINE_PATTERN = /^\s*file boundaries?\s*:\s*(.+)$/gim;
const REPORT_ARTIFACT_LINE_PATTERN = /^\s*report artifact\s*:\s*(.+)$/gim;
const CONCRETE_SOURCE_ROOT_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:(?:packages|apps)\/[\w.@-]+(?:\/(?:src|test|tests|__tests__|config)(?:\/[\w.@-]+)*)?|(?:src|test|tests|__tests__|config|docs|scripts|lib|migrations|data)(?:\/[\w.@-]+)*))(?:[\s`'"),.;\]]|$)/gi;
const PLAN_MANIFEST_PLACEHOLDER_PATTERN =
  /^(?:n\/?a|none|no(?:ne)?|tbd|todo|placeholder|manual|not applicable|unknown|later)$/i;
const PLAN_MANIFEST_WEAK_VERIFICATION_PATTERN =
  /^(?:verify|check|review|inspect|test|validate|confirm)(?:\s+(?:manually|the\s+ui|output|results?|it|changes?|behavior|work|works|task|plan|implementation|report|docs?))*\.?$/i;
const PLAN_MANIFEST_COMMAND_PATTERN =
  /^(?:npm(?:\.cmd)?|pnpm|yarn|bun|node|npx|tsx|tsc|vitest|jest|playwright|eslint|prettier|turbo|git|python|py|pytest|ruff|go|cargo|dotnet|mvn|gradle|docker|docker-compose|make|cmake|bash|sh|powershell|pwsh|curl|rg)\b|^[\w./\\-]+(?:\.cmd|\.ps1|\.sh|\.py|\.js|\.ts|\.mjs|\.cjs)\b/i;
const TASK_SIZE_NORMAL_CHANGED_FILE_GROUP_LIMIT = 2;
const TASK_SIZE_HARD_CHANGED_FILE_GROUP_LIMIT = 3;
const TASK_SIZE_NORMAL_MAJOR_SUBSYSTEM_LIMIT = 1;
const TASK_SIZE_HARD_MAJOR_SUBSYSTEM_LIMIT = 2;
const TASK_SIZE_MAX_VERIFICATION_COMMANDS = 4;
const TASK_SIZE_PLACEHOLDER_BOUNDARIES = new Set([
  "n/a",
  "na",
  "none",
  "tbd",
  "todo",
  "unknown",
  "later",
  "manual",
  "repo",
  "repository",
  "codebase",
  "project",
  "application",
  "app",
  "everything",
]);
const TASK_SIZE_BROAD_ROOT_BOUNDARIES = new Set([
  "packages",
  "apps",
  "src",
  "test",
  "tests",
  "__tests__",
  "config",
  "scripts",
  "docs",
  "migrations",
]);
const TASK_SIZE_ROOT_CONFIG_FILES = new Set([
  ".gitignore",
  ".npmrc",
  ".prettierrc",
  ".prettierrc.json",
  ".eslintrc",
  ".eslintrc.json",
  "eslint.config.js",
  "eslint.config.mjs",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "tsconfig.json",
  "tsconfig.base.json",
  "vite.config.ts",
  "vite.config.js",
  "vitest.config.ts",
  "vitest.config.js",
  "turbo.json",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
]);
const TASK_SIZE_SETUP_RUNTIME_COMMAND_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^npm(?:\.cmd)? install\b/, label: "npm install" },
  { pattern: /^npm(?:\.cmd)? ci\b/, label: "npm ci" },
  { pattern: /^pnpm install\b/, label: "pnpm install" },
  { pattern: /^yarn install\b/, label: "yarn install" },
  { pattern: /^bun install\b/, label: "bun install" },
  { pattern: /^npm(?:\.cmd)? run dev\b/, label: "npm run dev" },
  { pattern: /^pnpm dev\b/, label: "pnpm dev" },
  { pattern: /^yarn dev\b/, label: "yarn dev" },
  { pattern: /^bun dev\b/, label: "bun dev" },
  { pattern: /^turbo dev\b/, label: "turbo dev" },
  { pattern: /^docker compose up\b/, label: "docker compose up" },
  { pattern: /^docker-compose up\b/, label: "docker-compose up" },
  { pattern: /^docker build\b/, label: "docker build" },
  { pattern: /^docker compose build\b/, label: "docker compose build" },
  { pattern: /^vite --host\b/, label: "vite --host" },
  { pattern: /^playwright test\b.*\blocalhost\b/, label: "playwright test localhost" },
  { pattern: /^curl\b.*\blocalhost\b/, label: "curl localhost" },
  { pattern: /^curl\b.*\b127\.0\.0\.1\b/, label: "curl 127.0.0.1" },
  { pattern: /^node dist\//, label: "node dist/..." },
];
const TASK_SIZE_AMBIGUITY_TERMS = [
  "skeleton application",
  "application skeleton",
  "project architecture",
  "core engine skeleton",
  "local dev stack",
  "dev stack",
  "base configuration",
  "baseline configuration",
  "scaffold",
  "scaffolding",
  "full stack",
  "entire app",
  "complete setup",
  "end-to-end build",
  "project setup",
  "architecture and core engine",
] as const;
const TASK_INTENT_CHANGE_CATEGORIES: readonly TaskIntentChangeCategory[] = [
  "source",
  "tests",
  "docs",
  "config",
  "report",
  "research",
  "fixtures",
  "metadata",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUsefulManifestString(value: unknown): value is string {
  return isNonEmptyString(value) && !PLAN_MANIFEST_PLACEHOLDER_PATTERN.test(value.trim());
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isUsefulStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isUsefulManifestString);
}

function isConcreteVerificationCommand(value: unknown): value is string {
  if (!isUsefulManifestString(value)) return false;
  const text = value.trim();
  if (PLAN_MANIFEST_WEAK_VERIFICATION_PATTERN.test(text)) return false;
  return PLAN_MANIFEST_COMMAND_PATTERN.test(text);
}

function isConcreteVerificationCommandArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isConcreteVerificationCommand);
}

function parseTags(tags: TaskPlanQualityTask["tags"]): string[] {
  if (Array.isArray(tags)) return tags.filter((tag) => typeof tag === "string");
  if (!tags) return [];
  try {
    const parsed: unknown = JSON.parse(tags);
    if (Array.isArray(parsed)) {
      return parsed.filter((tag): tag is string => typeof tag === "string");
    }
  } catch {
    return tags
      .split(/[,\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function isPlanQualityFeedbackReplan(task: TaskPlanQualityTask): boolean {
  return (
    task.blockedFromStatus === "plan_ready" &&
    typeof task.blockedReason === "string" &&
    task.blockedReason.startsWith("Plan quality guard")
  );
}

function isAtOrAfterPlanManifestRollout(createdAt: string | null | undefined): boolean {
  if (!createdAt) return true;
  const createdTime = Date.parse(createdAt);
  const cutoffTime = Date.parse(PLAN_MANIFEST_REQUIRED_CREATED_AT);
  if (!Number.isFinite(createdTime) || !Number.isFinite(cutoffTime)) return true;
  return createdTime >= cutoffTime;
}

function isPlanManifestRequired(task: TaskPlanQualityTask): boolean {
  return (
    task.plannerMode === "full" &&
    (isAtOrAfterPlanManifestRollout(task.createdAt) || isPlanQualityFeedbackReplan(task))
  );
}

function extractPlanManifestBlocks(plan: string): string[] {
  PLAN_MANIFEST_BLOCK_PATTERN.lastIndex = 0;
  return [...plan.matchAll(PLAN_MANIFEST_BLOCK_PATTERN)].map((match) => match[1]?.trim() ?? "");
}

function buildPlanManifestSummary(input: {
  required: boolean;
  present: boolean;
  status: AifPlanManifestValidationSummary["status"];
  manifest?: Partial<AifPlanManifest> | null;
  issueCodes: TaskPlanQualityIssueCode[];
}): AifPlanManifestValidationSummary {
  return {
    required: input.required,
    present: input.present,
    status: input.status,
    taskId: typeof input.manifest?.taskId === "string" ? input.manifest.taskId : null,
    intent: isTaskIntent(input.manifest?.intent) ? input.manifest.intent : null,
    issueCodes: uniqueIssueCodes(input.issueCodes),
  };
}

function uniqueIssueCodes(codes: TaskPlanQualityIssueCode[]): TaskPlanQualityIssueCode[] {
  return [...new Set(codes)];
}

function isExpectedArtifact(value: unknown): value is AifPlanManifestExpectedArtifact {
  return (
    isObject(value) &&
    isUsefulManifestString(value.kind) &&
    Array.isArray(value.paths) &&
    value.paths.length > 0 &&
    value.paths.every(isUsefulManifestString)
  );
}

function isAcceptanceCriterion(value: unknown): value is AifPlanManifestAcceptanceCriterion {
  return (
    isObject(value) &&
    isUsefulManifestString(value.id) &&
    isUsefulManifestString(value.description) &&
    isConcreteVerificationCommand(value.verification)
  );
}

function parseAifPlanManifest(rawJson: string): Partial<AifPlanManifest> | null {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    return isObject(parsed) ? (parsed as Partial<AifPlanManifest>) : null;
  } catch {
    return null;
  }
}

function looksLikeAifPlanManifest(value: Partial<AifPlanManifest> | null): boolean {
  return (
    value !== null &&
    "version" in value &&
    "taskId" in value &&
    "scope" in value &&
    "allowedChanges" in value &&
    "forbiddenChanges" in value &&
    "expectedArtifacts" in value &&
    "acceptanceCriteria" in value &&
    "verificationCommands" in value
  );
}

export function normalizeAifPlanManifestFence(plan: string): string {
  if (extractPlanManifestBlocks(plan).length > 0) return plan;

  return plan.replace(
    /(^[ \t]{0,3}#{1,6}[ \t]+aif[-_\s]*plan[-_\s]*manifest[^\r\n]*\r?\n(?:[^\S\r\n]*\r?\n)*)(```)(?:json|JSON)([^\r\n]*\r?\n)([\s\S]*?)(```)/gim,
    (
      match,
      heading: string,
      fence: string,
      restOfOpeningLine: string,
      rawJson: string,
      closing: string,
    ) => {
      const manifest = parseAifPlanManifest(rawJson.trim());
      if (!looksLikeAifPlanManifest(manifest)) return match;
      return `${heading}${fence}aif-plan-manifest${restOfOpeningLine}${rawJson.trim()}\n${closing}`;
    },
  );
}

function normalizeChangeCategory(value: string): TaskIntentChangeCategory | null {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  return TASK_INTENT_CHANGE_CATEGORIES.includes(normalized as TaskIntentChangeCategory)
    ? (normalized as TaskIntentChangeCategory)
    : null;
}

function classifyManifestArtifactText(value: string): TaskIntentChangeCategory | null {
  const normalized = value.trim().toLowerCase().replaceAll("\\", "/").replaceAll("-", "_");
  if (!normalized) return null;
  if (
    /\b(?:audit_report|review_report|findings_report|diagnostic_report|report|findings|audit)\b/.test(
      normalized,
    ) ||
    isAuditReportArtifactPath(normalized)
  ) {
    return "report";
  }
  if (
    /\b(?:test|tests|spec|regression)\b/.test(normalized) ||
    /(?:^|\/)__tests__(?:\/|$)/.test(normalized) ||
    /\.(?:test|spec)\.[\w]+$/.test(normalized)
  ) {
    return "tests";
  }
  if (
    /\b(?:fixture|fixtures|snapshot|snapshots)\b/.test(normalized) ||
    /(?:^|\/)fixtures?(?:\/|$)/.test(normalized)
  ) {
    return "fixtures";
  }
  if (/(?:^|\/)\.env(?:[._-].*)?$/.test(normalized)) {
    return "config";
  }
  if (
    /\b(?:docs|documentation|readme|guide|runbook|example)\b/.test(normalized) ||
    normalized.startsWith("docs/") ||
    normalized.endsWith(".md") ||
    normalized.endsWith(".mdx")
  ) {
    return "docs";
  }
  if (normalized === "index.html" || normalized.endsWith(".html")) {
    return "source";
  }
  if (
    /(?:^|\/)src(?:\/|$)/.test(normalized) ||
    /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|c|cpp|h|hpp)$/.test(normalized)
  ) {
    return "source";
  }
  if (
    /\b(?:config|configuration|settings|env|profile)\b/.test(normalized) ||
    /(?:^|\/)(?:config|configs|\.github|\.codex)(?:\/|$)/.test(normalized) ||
    /(?:^|\/)(?:package|tsconfig|vite|vitest|eslint|prettier|turbo|dockerfile|docker_compose)\b/.test(
      normalized,
    )
  ) {
    return "config";
  }
  if (/\b(?:research|design|spike|notes|adr|decision)\b/.test(normalized)) {
    return "research";
  }
  if (/\b(?:metadata|status|index|manifest|catalog)\b/.test(normalized)) {
    return "metadata";
  }
  if (
    /\b(?:source|src|code|implementation|patch|diff|module|component|route|api|worker|service)\b/.test(
      normalized,
    ) ||
    /(?:^|\/)src(?:\/|$)/.test(normalized) ||
    /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|c|cpp|h|hpp)$/.test(normalized)
  ) {
    return "source";
  }
  return null;
}

function classifyExpectedArtifactCategories(
  artifact: AifPlanManifestExpectedArtifact,
): TaskIntentChangeCategory[] {
  const categories = new Set<TaskIntentChangeCategory>();
  const kindCategory = classifyManifestArtifactText(artifact.kind);
  if (kindCategory) categories.add(kindCategory);
  for (const path of artifact.paths) {
    const pathCategory = classifyManifestArtifactText(normalizePath(path));
    if (pathCategory) categories.add(pathCategory);
  }
  return [...categories].sort();
}

function normalizeManifestChangeCategories(value: unknown): Set<TaskIntentChangeCategory> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map(normalizeChangeCategory)
      .filter((entry): entry is TaskIntentChangeCategory => entry !== null),
  );
}

function inferManifestChangeCategory(value: unknown): TaskIntentChangeCategory | null {
  if (typeof value !== "string") return null;
  return normalizeChangeCategory(value) ?? classifyManifestArtifactText(value);
}

function orderedManifestCategories(
  categories: Iterable<TaskIntentChangeCategory>,
): TaskIntentChangeCategory[] {
  const selected = new Set(categories);
  return TASK_INTENT_CHANGE_CATEGORIES.filter((category) => selected.has(category));
}

function normalizeManifestScope(input: {
  manifest: Partial<AifPlanManifest> | null;
  plan: string;
  taskPaths: string[];
}): string[] {
  const scope = new Set<string>();
  if (Array.isArray(input.manifest?.scope)) {
    for (const entry of input.manifest.scope) {
      if (typeof entry !== "string") continue;
      const normalized = normalizePath(entry.trim());
      if (normalized) scope.add(normalized);
    }
  }
  for (const path of input.taskPaths) scope.add(normalizePath(path));
  if (scope.size === 0) {
    for (const path of extractRepoPaths(input.plan)) scope.add(normalizePath(path));
  }
  return [...scope].filter(Boolean).sort();
}

function concreteVerificationCommandsFromText(text: string): string[] {
  const commands = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const normalized = line
      .trim()
      .replace(/^[-*]\s+(?:\[[ xX]\]\s*)?/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^#+\s+/, "")
      .replace(/^`+|`+$/g, "")
      .trim();
    if (isConcreteVerificationCommand(normalized)) commands.add(normalized);
  }
  return [...commands];
}

function normalizeManifestVerificationCommands(input: {
  manifest: Partial<AifPlanManifest> | null;
  plan: string;
}): string[] {
  const commands = new Set<string>();
  if (Array.isArray(input.manifest?.verificationCommands)) {
    for (const entry of input.manifest.verificationCommands) {
      if (isConcreteVerificationCommand(entry)) commands.add(entry.trim());
    }
  }
  for (const command of concreteVerificationCommandsFromText(input.plan)) {
    commands.add(command);
  }
  return [...commands];
}

function normalizeManifestAllowedChanges(input: {
  manifest: Partial<AifPlanManifest> | null;
  taskIntent: TaskIntent;
  scope: string[];
}): TaskIntentChangeCategory[] {
  const policy = getTaskIntentPolicy(input.taskIntent);
  const allowedByPolicy = new Set(policy.allowedChanges.categories);
  const categories = new Set<TaskIntentChangeCategory>();

  if (Array.isArray(input.manifest?.allowedChanges)) {
    for (const entry of input.manifest.allowedChanges) {
      const category = inferManifestChangeCategory(entry);
      if (category && allowedByPolicy.has(category)) categories.add(category);
    }
  }

  if (Array.isArray(input.manifest?.expectedArtifacts)) {
    for (const artifact of input.manifest.expectedArtifacts) {
      if (isExpectedArtifact(artifact)) {
        for (const category of classifyExpectedArtifactCategories(artifact)) {
          if (allowedByPolicy.has(category)) categories.add(category);
        }
      } else if (typeof artifact === "string") {
        const category = inferManifestChangeCategory(artifact);
        if (category && allowedByPolicy.has(category)) categories.add(category);
      }
    }
  }

  for (const path of input.scope) {
    const category = classifyManifestArtifactText(path);
    if (category && allowedByPolicy.has(category)) categories.add(category);
  }

  if (categories.size === 0) {
    for (const category of policy.allowedChanges.categories) categories.add(category);
  }

  return orderedManifestCategories(categories);
}

function normalizeManifestForbiddenChanges(input: {
  manifest: Partial<AifPlanManifest> | null;
  taskIntent: TaskIntent;
  allowedChanges: TaskIntentChangeCategory[];
}): TaskIntentChangeCategory[] {
  const policy = getTaskIntentPolicy(input.taskIntent);
  const forbiddenByPolicy = new Set(policy.forbiddenChanges.categories);
  const allowed = new Set(input.allowedChanges);
  const categories = new Set<TaskIntentChangeCategory>(policy.forbiddenChanges.categories);

  if (Array.isArray(input.manifest?.forbiddenChanges)) {
    for (const entry of input.manifest.forbiddenChanges) {
      const category = inferManifestChangeCategory(entry);
      if (category && forbiddenByPolicy.has(category) && !allowed.has(category)) {
        categories.add(category);
      }
    }
  }

  return orderedManifestCategories(categories);
}

function expectedArtifactKindForCategory(category: TaskIntentChangeCategory): string {
  switch (category) {
    case "source":
      return "source_diff";
    case "tests":
      return "test_delta";
    case "docs":
      return "docs_update";
    case "config":
      return "config_update";
    case "report":
      return "audit_report";
    case "research":
      return "research_artifact";
    case "fixtures":
      return "fixture_delta";
    case "metadata":
      return "metadata_update";
  }
}

function normalizeManifestExpectedArtifacts(input: {
  manifest: Partial<AifPlanManifest> | null;
  scope: string[];
  allowedChanges: TaskIntentChangeCategory[];
}): AifPlanManifestExpectedArtifact[] {
  const allowed = new Set(input.allowedChanges);
  const byCategory = new Map<TaskIntentChangeCategory, Set<string>>();
  for (const path of input.scope) {
    const category = classifyManifestArtifactText(path);
    if (!category || !allowed.has(category)) continue;
    const paths = byCategory.get(category) ?? new Set<string>();
    paths.add(normalizePath(path));
    byCategory.set(category, paths);
  }

  if (byCategory.size > 0) {
    return orderedManifestCategories(byCategory.keys()).map((category) => ({
      kind: expectedArtifactKindForCategory(category),
      paths: [...(byCategory.get(category) ?? [])].sort(),
    }));
  }

  if (Array.isArray(input.manifest?.expectedArtifacts)) {
    const artifacts = input.manifest.expectedArtifacts
      .filter(isExpectedArtifact)
      .map((artifact) => ({
        kind: artifact.kind.trim(),
        paths: [...new Set(artifact.paths.map((path) => normalizePath(path)).filter(Boolean))],
      }))
      .filter((artifact) => artifact.paths.length > 0)
      .filter((artifact) =>
        classifyExpectedArtifactCategories(artifact).every((category) => allowed.has(category)),
      );
    if (artifacts.length > 0) return artifacts;
  }

  return [];
}

function normalizeManifestAcceptanceCriteria(input: {
  manifest: Partial<AifPlanManifest> | null;
  plan: string;
  verificationCommands: string[];
  task: TaskPlanQualityTask;
}): AifPlanManifestAcceptanceCriterion[] {
  const commandFor = (index: number): string | null =>
    input.verificationCommands[index] ?? input.verificationCommands[0] ?? null;
  const criteria: AifPlanManifestAcceptanceCriterion[] = [];

  if (Array.isArray(input.manifest?.acceptanceCriteria)) {
    input.manifest.acceptanceCriteria.forEach((entry, index) => {
      const verification = isObject(entry)
        ? isConcreteVerificationCommand(entry.verification)
          ? entry.verification.trim()
          : commandFor(index)
        : commandFor(index);
      const description = isObject(entry)
        ? isUsefulManifestString(entry.description)
          ? entry.description.trim()
          : null
        : isUsefulManifestString(entry)
          ? entry.trim()
          : null;
      if (!description || !verification) return;
      criteria.push({
        id:
          isObject(entry) && isUsefulManifestString(entry.id)
            ? entry.id.trim()
            : `ac-${criteria.length + 1}`,
        description,
        verification,
      });
    });
  }

  if (criteria.length > 0) return criteria;

  const checklistItems = extractChecklistItemTexts(input.plan).slice(0, 6);
  checklistItems.forEach((item, index) => {
    const verification = commandFor(index);
    if (!verification) return;
    criteria.push({
      id: `ac-${criteria.length + 1}`,
      description: item,
      verification,
    });
  });

  if (criteria.length > 0) return criteria;

  const verification = commandFor(0);
  return verification
    ? [
        {
          id: "ac-1",
          description: `${input.task.title} satisfies the task acceptance criteria.`,
          verification,
        },
      ]
    : [];
}

function buildNormalizedAifPlanManifest(input: {
  task: TaskPlanQualityTask;
  manifest: Partial<AifPlanManifest> | null;
  plan: string;
}): AifPlanManifest | null {
  const taskIntent = inferTaskIntent({
    taskIntent: input.task.taskIntent,
    title: input.task.title,
    description: input.task.description,
    roadmapAlias: input.task.roadmapAlias,
    tags: input.task.tags,
  });
  const taskPaths = extractTaskScopedPaths(combinedTaskText(input.task));
  const scope = normalizeManifestScope({ manifest: input.manifest, plan: input.plan, taskPaths });
  const verificationCommands = normalizeManifestVerificationCommands({
    manifest: input.manifest,
    plan: input.plan,
  });
  const allowedChanges = normalizeManifestAllowedChanges({
    manifest: input.manifest,
    taskIntent,
    scope,
  });
  const forbiddenChanges = normalizeManifestForbiddenChanges({
    manifest: input.manifest,
    taskIntent,
    allowedChanges,
  });
  const expectedArtifacts = normalizeManifestExpectedArtifacts({
    manifest: input.manifest,
    scope,
    allowedChanges,
  });
  const acceptanceCriteria = normalizeManifestAcceptanceCriteria({
    manifest: input.manifest,
    plan: input.plan,
    verificationCommands,
    task: input.task,
  });

  if (
    scope.length === 0 ||
    allowedChanges.length === 0 ||
    expectedArtifacts.length === 0 ||
    acceptanceCriteria.length === 0 ||
    verificationCommands.length === 0
  ) {
    return null;
  }

  return {
    version: 1,
    taskId: fallbackTaskId(input.task),
    intent: taskIntent,
    scope,
    allowedChanges,
    forbiddenChanges,
    expectedArtifacts,
    acceptanceCriteria,
    verificationCommands,
  };
}

export function normalizeAifPlanManifestForTask(
  input: NormalizeAifPlanManifestForTaskInput,
): string {
  const plan = normalizeAifPlanManifestFence(input.plan);
  const blocks = extractPlanManifestBlocks(plan);
  if (blocks.length > 1) return plan;

  if (blocks.length === 0) {
    if (!isPlanManifestRequired(input.task)) return plan;
    const manifest = buildNormalizedAifPlanManifest({
      task: input.task,
      manifest: null,
      plan,
    });
    if (!manifest) return plan;
    return [plan.trimEnd(), "", "## aif-plan-manifest", "", formatAifPlanManifestBlock(manifest)]
      .join("\n")
      .trim();
  }

  const parsed = parseAifPlanManifest(blocks[0] ?? "");
  if (!parsed) return plan;
  const taskIntent = inferTaskIntent({
    taskIntent: input.task.taskIntent,
    title: input.task.title,
    description: input.task.description,
    roadmapAlias: input.task.roadmapAlias,
    tags: input.task.tags,
  });
  const currentValidation = validatePlanManifest({
    task: input.task,
    plan,
    taskIntent,
    taskPaths: extractTaskScopedPaths(combinedTaskText(input.task)),
  });
  if (currentValidation.issues.length === 0) return plan;

  const manifest = buildNormalizedAifPlanManifest({
    task: input.task,
    manifest: parsed,
    plan,
  });
  if (!manifest) return plan;

  let replaced = false;
  PLAN_MANIFEST_BLOCK_PATTERN.lastIndex = 0;
  return plan.replace(PLAN_MANIFEST_BLOCK_PATTERN, (match) => {
    if (replaced) return match;
    replaced = true;
    return formatAifPlanManifestBlock(manifest);
  });
}

function normalizeTaskSizeBoundaryPath(path: string): string {
  return normalizePath(path).trim().replace(/^\/+/, "").replace(/\/+$/g, "").toLowerCase();
}

function collectManifestBoundaryPaths(manifest: Partial<AifPlanManifest>): {
  raw: string[];
  normalized: string[];
} {
  const raw = new Set<string>();
  if (Array.isArray(manifest.scope)) {
    for (const entry of manifest.scope) {
      if (typeof entry === "string") raw.add(entry.trim());
    }
  }
  if (Array.isArray(manifest.expectedArtifacts)) {
    for (const artifact of manifest.expectedArtifacts) {
      if (isObject(artifact) && Array.isArray(artifact.paths)) {
        for (const entry of artifact.paths) {
          if (typeof entry === "string") raw.add(entry.trim());
        }
      }
    }
  }
  return {
    raw: [...raw].filter(Boolean),
    normalized: [...new Set([...raw].map(normalizeTaskSizeBoundaryPath).filter(Boolean))].sort(),
  };
}

function isTaskSizeBroadBoundaryPath(path: string): boolean {
  const normalized = normalizeTaskSizeBoundaryPath(path);
  const raw = path.trim().toLowerCase();
  if (!normalized || raw === "." || raw === "./" || raw === "/") return true;
  if (TASK_SIZE_PLACEHOLDER_BOUNDARIES.has(normalized)) return true;
  if (TASK_SIZE_BROAD_ROOT_BOUNDARIES.has(normalized)) return true;
  if (/^(?:packages|apps)\/[^/]+$/.test(normalized)) return true;
  return normalized.endsWith("/*") || normalized.endsWith("/**");
}

function rootConfigGroupForPath(path: string): string | null {
  if (path.includes("/")) return null;
  const normalized = path.toLowerCase();
  if (TASK_SIZE_ROOT_CONFIG_FILES.has(normalized)) return "root-config";
  if (/^(?:package|tsconfig|vite|vitest|eslint|prettier|turbo|docker-compose)\b/.test(normalized)) {
    return "root-config";
  }
  if (/^\.[\w-]+(?:rc|ignore|env)(?:\..+)?$/.test(normalized)) return "root-config";
  return null;
}

function taskSizePackageArea(parts: string[]): string {
  const candidate = parts[2] ?? "root";
  if (candidate === "test" || candidate === "__tests__") return "tests";
  if (candidate === "src" || candidate === "tests" || candidate === "config") return candidate;
  return candidate;
}

function taskSizeChangedFileGroup(path: string): string {
  const normalized = normalizeTaskSizeBoundaryPath(path);
  const rootConfigGroup = rootConfigGroupForPath(normalized);
  if (rootConfigGroup) return rootConfigGroup;
  const parts = normalized.split("/").filter(Boolean);
  if ((parts[0] === "packages" || parts[0] === "apps") && parts[1]) {
    return `${parts[0]}/${parts[1]}/${taskSizePackageArea(parts)}`;
  }
  if (parts[0] && ["src", "docs", "scripts", "config"].includes(parts[0])) return parts[0];
  return parts[0] ?? normalized;
}

function taskSizeMajorSubsystem(path: string): string {
  const normalized = normalizeTaskSizeBoundaryPath(path);
  const rootConfigGroup = rootConfigGroupForPath(normalized);
  if (rootConfigGroup) return rootConfigGroup;
  const parts = normalized.split("/").filter(Boolean);
  if ((parts[0] === "packages" || parts[0] === "apps") && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  if (parts[0] && ["src", "docs", "scripts", "config"].includes(parts[0])) return parts[0];
  return parts[0] ?? normalized;
}

function normalizedTaskSizeCommand(command: string): string {
  return command.trim().replaceAll("\\", "/").replace(/\s+/g, " ").toLowerCase();
}

function isRunnableWebScaffoldBuildCommand(command: string): boolean {
  const normalized = normalizedTaskSizeCommand(command);
  return (
    /^npm(?:\.cmd)? run build\b/.test(normalized) ||
    /^pnpm (?:run )?build\b/.test(normalized) ||
    /^yarn (?:run )?build\b/.test(normalized) ||
    /^bun (?:run )?build\b/.test(normalized)
  );
}

function findTaskSizeSetupRuntimeCommand(commands: string[]): string | null {
  for (const command of commands.map(normalizedTaskSizeCommand)) {
    const match = TASK_SIZE_SETUP_RUNTIME_COMMAND_PATTERNS.find((entry) =>
      entry.pattern.test(command),
    );
    if (match) return match.label;
  }
  return null;
}

function findTaskSizeAmbiguityTerm(text: string): string | null {
  const normalized = text.toLowerCase();
  return TASK_SIZE_AMBIGUITY_TERMS.find((term) => normalized.includes(term)) ?? null;
}

function taskSizeManifestJson(manifest: Partial<AifPlanManifest>): string {
  try {
    return JSON.stringify(manifest);
  } catch {
    return "";
  }
}

function isTaskSizeTextBoundaryCandidate(path: string): boolean {
  const normalized = normalizeTaskSizeBoundaryPath(path);
  if (!normalized) return false;
  return normalized.includes("/") || rootConfigGroupForPath(normalized) !== null;
}

function isRunnableWebScaffoldBoundaryPath(path: string): boolean {
  const normalized = normalizeTaskSizeBoundaryPath(path);
  if (!normalized) return false;
  if ([".gitignore", "index.html", "package.json", "package-lock.json"].includes(normalized)) {
    return true;
  }
  if (/^tsconfig(?:\*|\.[\w.-]+)?\.json$/.test(normalized)) return true;
  if (/^vite\.config\.(?:\*|ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(normalized)) return true;
  if (normalized === "src/app" || normalized === "src/app/*" || normalized === "src/app/**") {
    return true;
  }
  if (normalized === "src/main.*" || /^src\/main\.[a-z0-9]+$/.test(normalized)) return true;
  if (normalized === "src/index.*" || /^src\/index\.[a-z0-9]+$/.test(normalized)) return true;
  return false;
}

function isRunnableWebScaffoldBoundary(input: {
  paths: string[];
  verificationCommands: string[];
}): boolean {
  const paths = [...new Set(input.paths.map(normalizeTaskSizeBoundaryPath).filter(Boolean))];
  if (paths.length === 0 || paths.some((path) => !isRunnableWebScaffoldBoundaryPath(path))) {
    return false;
  }

  const hasPackage = paths.includes("package.json");
  const hasIndex = paths.includes("index.html");
  const hasViteConfig = paths.some((path) =>
    /^vite\.config\.(?:\*|ts|js|mjs|cjs|mts|cts)$/.test(path),
  );
  const hasSrcEntrypoint = paths.some(
    (path) =>
      path === "src/main.*" ||
      path === "src/index.*" ||
      /^src\/(?:main|index)\.[a-z0-9]+$/.test(path),
  );
  const hasBuildVerification = input.verificationCommands.some(isRunnableWebScaffoldBuildCommand);

  return hasPackage && hasIndex && hasViteConfig && hasSrcEntrypoint && hasBuildVerification;
}

function evaluateTaskSizeSplitIssue(input: {
  task: TaskPlanQualityTask;
  plan: string;
  manifest: Partial<AifPlanManifest>;
  taskIntent: TaskIntent;
}): TaskPlanQualityIssue | null {
  if (input.taskIntent === "audit" || input.taskIntent === "spike") return null;

  const boundaryPaths = collectManifestBoundaryPaths(input.manifest);
  const broadBoundary = boundaryPaths.raw.find(isTaskSizeBroadBoundaryPath) ?? null;
  const fileBoundaries = boundaryPaths.normalized.length === 0 || broadBoundary !== null;
  const changedFileGroups = [
    ...new Set(boundaryPaths.normalized.map(taskSizeChangedFileGroup).filter(Boolean)),
  ].sort();
  const majorSubsystems = [
    ...new Set(boundaryPaths.normalized.map(taskSizeMajorSubsystem).filter(Boolean)),
  ].sort();
  const verificationCommands = Array.isArray(input.manifest.verificationCommands)
    ? input.manifest.verificationCommands.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  const setupRuntimeCommand = findTaskSizeSetupRuntimeCommand(verificationCommands);
  const verificationSurface =
    verificationCommands.length > TASK_SIZE_MAX_VERIFICATION_COMMANDS ||
    setupRuntimeCommand !== null;
  const ambiguityTerm = findTaskSizeAmbiguityTerm(
    [input.task.title, input.task.description, input.plan, taskSizeManifestJson(input.manifest)]
      .filter((value): value is string => typeof value === "string")
      .join("\n"),
  );
  const ambiguity = ambiguityTerm !== null;
  const changedFileGroupsBroad =
    changedFileGroups.length > TASK_SIZE_NORMAL_CHANGED_FILE_GROUP_LIMIT;
  const majorSubsystemsBroad = majorSubsystems.length > TASK_SIZE_NORMAL_MAJOR_SUBSYSTEM_LIMIT;

  const reject =
    fileBoundaries ||
    (changedFileGroupsBroad && majorSubsystemsBroad) ||
    (changedFileGroupsBroad && ambiguity) ||
    (majorSubsystemsBroad && ambiguity) ||
    (verificationSurface && (changedFileGroupsBroad || majorSubsystemsBroad || ambiguity)) ||
    changedFileGroups.length > TASK_SIZE_HARD_CHANGED_FILE_GROUP_LIMIT ||
    majorSubsystems.length > TASK_SIZE_HARD_MAJOR_SUBSYSTEM_LIMIT;

  if (!reject) return null;
  if (
    isRunnableWebScaffoldBoundary({
      paths: boundaryPaths.normalized,
      verificationCommands,
    })
  ) {
    return null;
  }

  const dimensions: string[] = [];
  if (fileBoundaries) {
    dimensions.push(
      broadBoundary
        ? `file_boundaries=broad:${normalizeTaskSizeBoundaryPath(broadBoundary) || broadBoundary}`
        : "file_boundaries=empty",
    );
  }
  if (changedFileGroupsBroad) {
    dimensions.push(
      `changed_file_groups=${changedFileGroups.length}>${TASK_SIZE_NORMAL_CHANGED_FILE_GROUP_LIMIT} (${changedFileGroups.join(", ")})`,
    );
  }
  if (majorSubsystemsBroad) {
    dimensions.push(
      `major_subsystems=${majorSubsystems.length}>${TASK_SIZE_NORMAL_MAJOR_SUBSYSTEM_LIMIT} (${majorSubsystems.join(", ")})`,
    );
  }
  if (verificationSurface) {
    dimensions.push(
      setupRuntimeCommand
        ? `verification_surface=setup_runtime_command:${setupRuntimeCommand}`
        : `verification_surface=${verificationCommands.length}>${TASK_SIZE_MAX_VERIFICATION_COMMANDS}`,
    );
  }
  if (ambiguityTerm) {
    dimensions.push(`ambiguity=${ambiguityTerm}`);
  }

  return issue(
    "task_size_split_required",
    `split_required: task is too broad for one implementation card (dimensions: ${dimensions.join(
      "; ",
    )}). Split into children with concrete file boundaries, acceptance checks, and verification commands.`,
  );
}

function evaluateTaskSizeTextOnlySplitIssue(input: {
  task: TaskPlanQualityTask;
  plan: string;
  taskIntent: TaskIntent;
}): TaskPlanQualityIssue | null {
  if (input.taskIntent === "audit" || input.taskIntent === "spike") return null;

  const text = [combinedTaskText(input.task), input.plan].filter(Boolean).join("\n");
  const ambiguityTerm = findTaskSizeAmbiguityTerm(text);
  const boundaryPaths = [
    ...new Set(
      [
        ...extractRepoPaths(text),
        ...extractTaskFileBoundaryPaths(text),
        ...extractConcreteSourceRoots(text).filter(isTaskSizeTextBoundaryCandidate),
      ]
        .filter((path) => !isAuditReportArtifactPath(path))
        .map(normalizeTaskSizeBoundaryPath)
        .filter(Boolean),
    ),
  ].sort();
  const broadBoundary = boundaryPaths.find(isTaskSizeBroadBoundaryPath) ?? null;
  const missingConcreteBoundary = boundaryPaths.length === 0;
  const changedFileGroups = [
    ...new Set(boundaryPaths.map(taskSizeChangedFileGroup).filter(Boolean)),
  ].sort();
  const majorSubsystems = [
    ...new Set(boundaryPaths.map(taskSizeMajorSubsystem).filter(Boolean)),
  ].sort();
  const verificationCommands = concreteVerificationCommandsFromText(input.plan);
  const setupRuntimeCommand = findTaskSizeSetupRuntimeCommand(verificationCommands);
  const missingConcreteVerification = verificationCommands.length === 0;
  const verificationSurface =
    verificationCommands.length > TASK_SIZE_MAX_VERIFICATION_COMMANDS ||
    setupRuntimeCommand !== null;
  const changedFileGroupsBroad =
    changedFileGroups.length > TASK_SIZE_NORMAL_CHANGED_FILE_GROUP_LIMIT;
  const majorSubsystemsBroad = majorSubsystems.length > TASK_SIZE_NORMAL_MAJOR_SUBSYSTEM_LIMIT;

  const reject =
    broadBoundary !== null ||
    (ambiguityTerm !== null &&
      (missingConcreteBoundary ||
        missingConcreteVerification ||
        changedFileGroupsBroad ||
        majorSubsystemsBroad ||
        verificationSurface)) ||
    (changedFileGroupsBroad && majorSubsystemsBroad) ||
    (verificationSurface && (changedFileGroupsBroad || majorSubsystemsBroad)) ||
    changedFileGroups.length > TASK_SIZE_HARD_CHANGED_FILE_GROUP_LIMIT ||
    majorSubsystems.length > TASK_SIZE_HARD_MAJOR_SUBSYSTEM_LIMIT;

  if (!reject) return null;

  const dimensions: string[] = [];
  if (missingConcreteBoundary) {
    dimensions.push("file_boundaries=missing_concrete");
  } else if (broadBoundary) {
    dimensions.push(`file_boundaries=broad:${broadBoundary}`);
  }
  if (changedFileGroupsBroad) {
    dimensions.push(
      `changed_file_groups=${changedFileGroups.length}>${TASK_SIZE_NORMAL_CHANGED_FILE_GROUP_LIMIT} (${changedFileGroups.join(", ")})`,
    );
  }
  if (majorSubsystemsBroad) {
    dimensions.push(
      `major_subsystems=${majorSubsystems.length}>${TASK_SIZE_NORMAL_MAJOR_SUBSYSTEM_LIMIT} (${majorSubsystems.join(", ")})`,
    );
  }
  if (verificationSurface) {
    dimensions.push(
      setupRuntimeCommand
        ? `verification_surface=setup_runtime_command:${setupRuntimeCommand}`
        : `verification_surface=${verificationCommands.length}>${TASK_SIZE_MAX_VERIFICATION_COMMANDS}`,
    );
  } else if (missingConcreteVerification && ambiguityTerm) {
    dimensions.push("verification_surface=missing_concrete_command");
  }
  if (ambiguityTerm) {
    dimensions.push(`ambiguity=${ambiguityTerm}`);
  }

  return issue(
    "task_size_split_required",
    `split_required: task is too broad for one implementation card (dimensions: ${dimensions.join(
      "; ",
    )}). Split into children with concrete file boundaries, acceptance checks, and verification commands.`,
  );
}

function parsePackageJsonScripts(packageJsonText: string | null | undefined): Set<string> | null {
  if (!packageJsonText?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(packageJsonText);
    if (!isObject(parsed)) return null;
    const scripts = parsed.scripts;
    if (!isObject(scripts)) return new Set();
    return new Set(
      Object.entries(scripts)
        .filter(([, value]) => typeof value === "string")
        .map(([key]) => key),
    );
  } catch {
    return null;
  }
}

function npmScriptNameFromVerificationCommand(command: string): string | null {
  const normalized = command.trim().replace(/^`+|`+$/g, "");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  if (!/^npm(?:\.cmd)?$/i.test(tokens[0] ?? "")) return null;
  const subcommand = tokens[1]?.toLowerCase();
  if (subcommand === "run" || subcommand === "run-script") {
    const script = tokens[2]?.trim();
    return script && !script.startsWith("-") ? script : null;
  }
  return subcommand === "test" ? "test" : null;
}

function manifestScopeAllowsPackageJsonChange(manifest: Partial<AifPlanManifest>): boolean {
  const allowedChanges = normalizeManifestChangeCategories(manifest.allowedChanges);
  if (!allowedChanges.has("config")) return false;
  if (!Array.isArray(manifest.scope)) return false;
  return manifest.scope
    .filter(isUsefulManifestString)
    .map(normalizePath)
    .some((path) => path === "package.json" || path === "." || path === "*" || path === "**");
}

function planManifestExecutionFeasibilityIssues(input: {
  manifest: Partial<AifPlanManifest>;
  executionContext?: TaskPlanQualityExecutionContext;
}): TaskPlanQualityIssue[] {
  const scripts = parsePackageJsonScripts(input.executionContext?.packageJsonText);
  if (scripts === null || !Array.isArray(input.manifest.verificationCommands)) return [];
  const canChangePackageJson = manifestScopeAllowsPackageJsonChange(input.manifest);
  const issues: TaskPlanQualityIssue[] = [];

  for (const command of input.manifest.verificationCommands) {
    if (!isConcreteVerificationCommand(command)) continue;
    const scriptName = npmScriptNameFromVerificationCommand(command);
    if (!scriptName || scripts.has(scriptName) || canChangePackageJson) continue;
    issues.push(
      issue(
        "plan_manifest_infeasible_verification",
        `aif-plan-manifest verification command \`${command.trim()}\` requires package.json script \`${scriptName}\`, but package.json does not define it and the manifest scope does not allow package.json/config changes.`,
      ),
    );
  }

  return issues;
}

function validatePlanManifest(input: {
  task: TaskPlanQualityTask;
  plan: string;
  taskIntent: TaskIntent;
  taskPaths: string[];
  executionContext?: TaskPlanQualityExecutionContext;
}): {
  manifest: Partial<AifPlanManifest> | null;
  summary: AifPlanManifestValidationSummary;
  issues: TaskPlanQualityIssue[];
} {
  const required = isPlanManifestRequired(input.task);
  const blocks = extractPlanManifestBlocks(input.plan);
  const issues: TaskPlanQualityIssue[] = [];
  const issueCodes: TaskPlanQualityIssueCode[] = [];

  const addIssue = (code: TaskPlanQualityIssueCode, message: string): void => {
    issues.push(issue(code, message));
    issueCodes.push(code);
  };

  if (blocks.length === 0) {
    if (required) {
      addIssue(
        "missing_plan_manifest",
        "Full-mode task plan must include an aif-plan-manifest block.",
      );
    }
    return {
      manifest: null,
      summary: buildPlanManifestSummary({
        required,
        present: false,
        status: required ? "missing" : "not_required",
        issueCodes,
      }),
      issues,
    };
  }

  if (blocks.length !== 1) {
    addIssue("invalid_plan_manifest", "Plan must include exactly one aif-plan-manifest block.");
    return {
      manifest: null,
      summary: buildPlanManifestSummary({
        required,
        present: true,
        status: "invalid",
        issueCodes,
      }),
      issues,
    };
  }

  const manifest = parseAifPlanManifest(blocks[0] ?? "");
  if (!manifest) {
    addIssue("invalid_plan_manifest", "aif-plan-manifest block must contain valid JSON.");
    return {
      manifest: null,
      summary: buildPlanManifestSummary({
        required,
        present: true,
        status: "invalid",
        issueCodes,
      }),
      issues,
    };
  }

  const manifestAllowedCategories = normalizeManifestChangeCategories(manifest.allowedChanges);
  const manifestForbiddenCategories = normalizeManifestChangeCategories(manifest.forbiddenChanges);
  const overlappingManifestCategories = [...manifestAllowedCategories].filter((category) =>
    manifestForbiddenCategories.has(category),
  );
  if (overlappingManifestCategories.length > 0) {
    addIssue(
      "plan_manifest_allowed_change_violation",
      `aif-plan-manifest allowedChanges and forbiddenChanges both include: ${overlappingManifestCategories.join(", ")}.`,
    );
  }

  if (manifest.version !== 1) {
    addIssue("unsupported_plan_manifest_version", "aif-plan-manifest version must be 1.");
  }

  const missingFields = [
    !isUsefulManifestString(manifest.taskId) ? "taskId" : null,
    !isTaskIntent(manifest.intent) ? "intent" : null,
    !isUsefulStringArray(manifest.scope) ? "scope" : null,
    !isStringArray(manifest.allowedChanges) || manifest.allowedChanges.length === 0
      ? "allowedChanges"
      : null,
    !isStringArray(manifest.forbiddenChanges) || manifest.forbiddenChanges.length === 0
      ? "forbiddenChanges"
      : null,
    !Array.isArray(manifest.expectedArtifacts) || manifest.expectedArtifacts.length === 0
      ? "expectedArtifacts"
      : null,
    !Array.isArray(manifest.acceptanceCriteria) || manifest.acceptanceCriteria.length === 0
      ? "acceptanceCriteria"
      : null,
    !isConcreteVerificationCommandArray(manifest.verificationCommands)
      ? "verificationCommands"
      : null,
  ].filter((field): field is string => field !== null);

  if (missingFields.length > 0) {
    addIssue(
      "missing_plan_manifest_fields",
      `aif-plan-manifest is missing required field(s): ${missingFields.join(", ")}.`,
    );
  }

  if (isUsefulManifestString(input.task.id) && manifest.taskId !== input.task.id) {
    addIssue(
      "plan_manifest_task_mismatch",
      `aif-plan-manifest taskId must match task ${input.task.id}.`,
    );
  }

  if (isTaskIntent(manifest.intent) && manifest.intent !== input.taskIntent) {
    addIssue(
      "plan_manifest_intent_mismatch",
      `aif-plan-manifest intent ${manifest.intent} must match task intent ${input.taskIntent}.`,
    );
  }

  if (!isUsefulStringArray(manifest.scope)) {
    addIssue("plan_manifest_missing_scope", "aif-plan-manifest scope must name explicit scope.");
  } else if (input.taskPaths.length > 0) {
    const normalizedScope = manifest.scope.map(normalizePath);
    const nonReportTaskPaths = input.taskPaths.filter((path) => !isAuditReportArtifactPath(path));
    const missingScopePaths = nonReportTaskPaths.filter(
      (path) => !normalizedScope.some((scopePath) => planPathSatisfiesTaskPath(scopePath, path)),
    );
    if (missingScopePaths.length > 0) {
      addIssue(
        "plan_manifest_scope_mismatch",
        `aif-plan-manifest scope omitted task-specific path(s): ${missingScopePaths.join(", ")}.`,
      );
    }
  }

  if (
    !Array.isArray(manifest.expectedArtifacts) ||
    manifest.expectedArtifacts.length === 0 ||
    !manifest.expectedArtifacts.every(isExpectedArtifact)
  ) {
    addIssue(
      "plan_manifest_missing_expected_artifacts",
      "aif-plan-manifest expectedArtifacts must list artifact kind and path(s).",
    );
  } else {
    const policy = getTaskIntentPolicy(input.taskIntent);
    const allowedByPolicy = new Set(policy.allowedChanges.categories);
    const forbiddenByPolicy = new Set(policy.forbiddenChanges.categories);
    const invalidExpectedArtifacts = manifest.expectedArtifacts.flatMap((artifact) =>
      classifyExpectedArtifactCategories(artifact)
        .filter(
          (category) =>
            forbiddenByPolicy.has(category) ||
            !allowedByPolicy.has(category) ||
            !manifestAllowedCategories.has(category) ||
            manifestForbiddenCategories.has(category),
        )
        .map((category) => `${artifact.kind}:${category}`),
    );
    if (invalidExpectedArtifacts.length > 0) {
      addIssue(
        "plan_manifest_expected_artifact_violation",
        `aif-plan-manifest expectedArtifacts contradict task intent ${input.taskIntent}: ${[
          ...new Set(invalidExpectedArtifacts),
        ].join(", ")}.`,
      );
    }
  }

  if (
    !Array.isArray(manifest.acceptanceCriteria) ||
    manifest.acceptanceCriteria.length === 0 ||
    !manifest.acceptanceCriteria.every(isAcceptanceCriterion)
  ) {
    addIssue(
      "plan_manifest_untestable_acceptance_criteria",
      "aif-plan-manifest acceptanceCriteria must include id, description, and non-placeholder verification.",
    );
  }

  if (!isConcreteVerificationCommandArray(manifest.verificationCommands)) {
    addIssue(
      "plan_manifest_missing_verification_commands",
      "aif-plan-manifest verificationCommands must include concrete commands.",
    );
  }

  for (const feasibilityIssue of planManifestExecutionFeasibilityIssues({
    manifest,
    executionContext: input.executionContext,
  })) {
    issues.push(feasibilityIssue);
    issueCodes.push(feasibilityIssue.code);
  }

  const policy = getTaskIntentPolicy(input.taskIntent);
  if (Array.isArray(manifest.allowedChanges)) {
    const allowedByPolicy = new Set(policy.allowedChanges.categories);
    const forbiddenByPolicy = new Set(policy.forbiddenChanges.categories);
    const invalidAllowedChanges = manifest.allowedChanges.filter((entry) => {
      const category = normalizeChangeCategory(entry);
      return category === null || !allowedByPolicy.has(category) || forbiddenByPolicy.has(category);
    });
    if (invalidAllowedChanges.length > 0) {
      addIssue(
        "plan_manifest_allowed_change_violation",
        `aif-plan-manifest allowedChanges contradict task intent ${input.taskIntent}: ${invalidAllowedChanges.join(", ")}.`,
      );
    }
  }

  if (Array.isArray(manifest.forbiddenChanges)) {
    const normalizedForbiddenChanges = new Set(
      manifest.forbiddenChanges
        .filter(isUsefulManifestString)
        .map(normalizeChangeCategory)
        .filter((entry): entry is TaskIntentChangeCategory => entry !== null),
    );
    const requiredForbiddenCategories = policy.forbiddenChanges.categories;
    const missingForbiddenCategories = requiredForbiddenCategories.filter(
      (category) => !normalizedForbiddenChanges.has(category),
    );
    if (
      manifest.forbiddenChanges.length === 0 ||
      manifest.forbiddenChanges.some((entry) => !isUsefulManifestString(entry)) ||
      missingForbiddenCategories.length > 0
    ) {
      addIssue(
        "plan_manifest_forbidden_change_violation",
        missingForbiddenCategories.length > 0
          ? `aif-plan-manifest forbiddenChanges must include policy-forbidden categories for task intent ${input.taskIntent}: ${missingForbiddenCategories.join(", ")}.`
          : "aif-plan-manifest forbiddenChanges must list useful forbidden change entries.",
      );
    }
  }

  const taskSizeIssue = evaluateTaskSizeSplitIssue({
    task: input.task,
    plan: input.plan,
    manifest,
    taskIntent: input.taskIntent,
  });
  if (taskSizeIssue) {
    issues.push(taskSizeIssue);
    issueCodes.push(taskSizeIssue.code);
  }

  return {
    manifest,
    summary: buildPlanManifestSummary({
      required,
      present: true,
      status: issues.length === 0 ? "valid" : "invalid",
      manifest,
      issueCodes,
    }),
    issues,
  };
}

function combinedTaskText(task: TaskPlanQualityTask): string {
  return [task.title, task.description, task.taskIntent, task.roadmapAlias, ...parseTags(task.tags)]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
}

function normalizePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/[),.;\]]+$/g, "");
}

function extractRepoPaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(REPO_PATH_PATTERN)) {
    const raw = match[1]?.trim();
    if (raw) paths.add(normalizePath(raw));
  }
  return [...paths].sort();
}

function normalizeTaskBoundaryPath(path: string): string {
  return normalizePath(
    path
      .trim()
      .replace(/^[-*]\s+/, "")
      .replace(/^["'`(\[]+/, "")
      .replace(/["'`)\]]+$/g, "")
      .replace(/^\.\/+/, ""),
  );
}

function looksLikeTaskBoundaryPath(path: string): boolean {
  if (!path || TASK_SIZE_PLACEHOLDER_BOUNDARIES.has(path.toLowerCase())) return false;
  return (
    path.startsWith(".") ||
    path.includes("/") ||
    path.includes("*") ||
    /^[\w.@-]+\.[A-Za-z0-9*.-]+$/.test(path)
  );
}

function extractTaskFileBoundaryPaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(TASK_FILE_BOUNDARY_LINE_PATTERN)) {
    const boundaryText = match[1] ?? "";
    for (const token of boundaryText.split(/[,;]+/)) {
      const normalized = normalizeTaskBoundaryPath(token);
      if (looksLikeTaskBoundaryPath(normalized)) paths.add(normalized);
    }
  }
  return [...paths].sort();
}

function extractTaskScopedPaths(text: string): string[] {
  return [...new Set([...extractRepoPaths(text), ...extractTaskFileBoundaryPaths(text)])].sort();
}

function extractConcreteSourceRoots(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(CONCRETE_SOURCE_ROOT_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const normalized = normalizePath(raw).replace(/\/+$/g, "");
    if (normalized && !isAuditReportArtifactPath(normalized)) paths.add(normalized);
  }
  return [...paths].sort();
}

function extractReportArtifactPaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(REPORT_ARTIFACT_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const normalized = normalizePath(raw);
    if (isAuditReportArtifactPath(normalized)) {
      paths.add(normalized);
    }
  }
  return [...paths].sort();
}

function formatInlinePaths(paths: string[]): string {
  return paths.map((path) => `\`${path}\``).join(", ");
}

function auditBoundaryText(text: string): string {
  return [...text.matchAll(AUDIT_BOUNDARY_LINE_PATTERN)].map((match) => match[1] ?? "").join("\n");
}

function declaredReportArtifactPaths(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(REPORT_ARTIFACT_LINE_PATTERN)].flatMap((match) =>
        extractReportArtifactPaths(match[1] ?? ""),
      ),
    ),
  ].sort();
}

function isConcreteAuditBoundaryPath(path: string): boolean {
  const normalized = normalizePath(path).replace(/\/+$/g, "");
  if (!normalized || isAuditReportArtifactPath(normalized)) return false;
  if (/^[\w.@-]+\.[A-Za-z0-9]+$/.test(normalized)) return true;
  return (
    extractRepoPaths(` ${normalized}`).includes(normalized) ||
    extractConcreteSourceRoots(` ${normalized}`).includes(normalized)
  );
}

function planUsesForbiddenLocalAifValidation(plan: string): boolean {
  return plan
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .some(
      (line) =>
        LOCAL_AIF_VALIDATION_TERMS_PATTERN.test(line) && !LOCAL_AIF_FORBIDDEN_PATTERN.test(line),
    );
}

function concreteAuditBoundariesFromText(text: string): string[] {
  const boundaryText = auditBoundaryText(text);
  const source = boundaryText.length > 0 ? boundaryText : text;
  return [
    ...new Set([
      ...extractRepoPaths(source).filter((path) => !isAuditReportArtifactPath(path)),
      ...extractConcreteSourceRoots(source),
      ...parseAuditScopeRoots(text).filter(isConcreteAuditBoundaryPath),
    ]),
  ].sort();
}

function combinedDiagnosticSourceText(input: DeterministicDiagnosticPlanInput): string {
  const taskText = combinedTaskText(input.task);
  const extraText = (input.extraText ?? [])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  return [taskText, extraText].filter(Boolean).join("\n");
}

function formatAifPlanManifestBlock(manifest: AifPlanManifest): string {
  return ["```aif-plan-manifest", JSON.stringify(manifest, null, 2), "```"].join("\n");
}

function fallbackTaskId(task: TaskPlanQualityTask): string {
  return isUsefulManifestString(task.id) ? task.id : "deterministic-diagnostic-plan";
}

function buildDiagnosticPlanManifest(input: {
  task: TaskPlanQualityTask;
  scope: string[];
  reportPath: string;
  verificationCommands: string[];
  synthesis?: boolean;
}): string {
  const scope = [...new Set(input.scope.map(normalizePath).filter(Boolean))].sort();
  const manifest: AifPlanManifest = {
    version: 1,
    taskId: fallbackTaskId(input.task),
    intent: "audit",
    scope,
    allowedChanges: ["report"],
    forbiddenChanges: ["source", "tests", "docs", "config", "secrets"],
    expectedArtifacts: [
      {
        kind: input.synthesis ? "audit_synthesis_report" : "audit_report",
        paths: [normalizePath(input.reportPath)],
      },
    ],
    acceptanceCriteria: [
      {
        id: "ac-report-artifact",
        description: input.synthesis
          ? "The synthesis report preserves source report state, trust, findings, and inconclusive outcomes."
          : "The diagnostic report includes scoped evidence, findings or no-findings rationale, risks, and verification.",
        verification: input.verificationCommands[0] ?? "git status --short",
      },
      {
        id: "ac-report-only",
        description:
          "The plan remains diagnostic-only and does not authorize source, config, test, or child implementation work.",
        verification: "git status --short",
      },
    ],
    verificationCommands: input.verificationCommands,
  };
  return formatAifPlanManifestBlock(manifest);
}

export function findDeterministicDiagnosticReportPath(
  input: DeterministicDiagnosticPlanInput,
): string | null {
  const sourceText = combinedDiagnosticSourceText(input);
  const taskIntent = inferTaskIntent({
    taskIntent: input.task.taskIntent,
    title: input.task.title,
    description: input.task.description,
    roadmapAlias: input.task.roadmapAlias,
    tags: input.task.tags,
  });
  const hasExplicitTaskIntent = isTaskIntent(input.task.taskIntent);
  const isDiagnosticTask =
    taskIntent === "audit" || (!hasExplicitTaskIntent && DIAGNOSTIC_TASK_PATTERN.test(sourceText));
  if (!isDiagnosticTask) return null;

  const declaredReportPath = input.task.description
    ? parseExpectedAuditReportArtifactPath(input.task.description)
    : null;
  if (declaredReportPath) return normalizePath(declaredReportPath);

  return extractReportArtifactPaths(sourceText)[0] ?? null;
}

export function buildDeterministicDiagnosticPlan(
  input: DeterministicDiagnosticPlanInput,
): string | null {
  const taskText = combinedTaskText(input.task);
  const sourceText = combinedDiagnosticSourceText(input);
  const decomposition = classifyAuditDecompositionRequest(sourceText);
  const broadDecompositionReasons = decomposition.reasonCodes.filter(
    (reason) => reason !== "audit_without_concrete_boundaries",
  );
  if (
    decomposition.requiresDecomposition &&
    broadDecompositionReasons.length > 0 &&
    !isPersistedAuditSourceReportTask(input.task)
  ) {
    return null;
  }

  const reportPath = findDeterministicDiagnosticReportPath(input);
  if (!reportPath) return null;

  if (input.task.auditArtifactRole === "synthesis" && input.task.sourceReportArtifacts?.length) {
    const sourceArtifacts = [...input.task.sourceReportArtifacts]
      .map((artifact) => ({
        ...artifact,
        artifactPath: normalizePath(artifact.artifactPath),
      }))
      .sort((a, b) => a.artifactPath.localeCompare(b.artifactPath));
    const sourcePaths = [...new Set(sourceArtifacts.map((artifact) => artifact.artifactPath))];
    const sourcePathText = formatInlinePaths(sourcePaths);
    const trustedCount = sourceArtifacts.filter((artifact) => artifact.trusted === true).length;
    const weakCount = sourceArtifacts.length - trustedCount;
    const statusLines = sourceArtifacts.map(
      (artifact) =>
        `- ${artifact.artifactPath} | task: ${artifact.taskId} | state: ${artifact.state} | trust: ${
          artifact.trusted ? "trusted" : "untrusted"
        } | failure family: ${artifact.failureFamily ?? "none"}`,
    );
    const plan = [
      "## Deterministic audit synthesis plan",
      "",
      buildDiagnosticPlanManifest({
        task: input.task,
        scope: sourcePaths,
        reportPath,
        verificationCommands: ["git status --short", "git log -1 --name-only --oneline"],
        synthesis: true,
      }),
      "",
      `Report artifact: \`${reportPath}\``,
      "Scope: existing completed source audit reports from this roadmap batch.",
      `Scoped evidence targets: ${sourcePathText}.`,
      `Source report status: ${trustedCount} trusted, ${weakCount} untrusted or terminal weak.`,
      ...statusLines,
      "Excluded areas: source files, config files, tests, generated files, dependency caches, build output, and non-batch audit artifacts.",
      "Expected report structure: child report, artifact state, trust level, finding ID, severity, evidence, risk, proposed fix, confidence, verification, and final outcome.",
      "Child/source reports: required existing completed source audit reports; preserve every source report in the child status table and do not create child reports.",
      "",
      "- [ ] Keep the run diagnostic-only: do not implement fixes; do not patch source, config, or test files; do not create child implementation tasks.",
      `- [ ] Read only the registry-listed source report artifacts ${sourcePathText} as existing inputs for synthesis.`,
      "- [ ] Preserve each child/source report artifact path, task id, artifact state, trust level, evidence, risk, proposed fix, and verification status in the final child report status table.",
      `- [ ] Create or update \`${reportPath}\` as the final synthesis report, carrying forward trusted validated findings and marking the final outcome audit inconclusive when source artifacts are missing, rejected, source_inconclusive, terminal_inconclusive, manual_exception, or otherwise untrusted.`,
      `- [ ] Verify \`${reportPath}\` is the only written artifact and that no source/config/test edits are included.`,
    ].join("\n");

    const quality = evaluateTaskPlanQuality({ task: input.task, plan });
    return quality.ok ? plan : null;
  }

  const taskPaths = concreteAuditBoundariesFromText(taskText);
  if (taskPaths.length === 0) return null;

  const evidenceTargets = taskPaths;
  const taskPathText = formatInlinePaths(taskPaths);
  const evidenceTargetsText = formatInlinePaths(evidenceTargets);
  const remoteTarget =
    sourceText.match(/\bhttps?:\/\/192\.168\.88\.67(?:\/api)?\b/)?.[0] ?? "not declared";
  const evidenceStep =
    taskPaths.length > 0
      ? `- [ ] Inspect the task-specific paths ${taskPathText} and cite exact existing file paths for every finding.`
      : `- [ ] Inspect the scoped evidence needed for \`${reportPath}\` and cite exact existing file paths for every finding.`;

  const plan = [
    "## Diagnostic-only plan",
    "",
    buildDiagnosticPlanManifest({
      task: input.task,
      scope: evidenceTargets,
      reportPath,
      verificationCommands: ["git status --short", "git log -1 --name-only --oneline"],
    }),
    "",
    `Report artifact: \`${reportPath}\``,
    `Scope: ${evidenceTargetsText}`,
    `Scoped evidence targets: ${evidenceTargetsText}`,
    "Contract:",
    "- Task intent: audit",
    "- Diagnostic only: yes",
    `- Expected report artifact: \`${reportPath}\``,
    `- Declared scope: ${evidenceTargetsText}`,
    "- Allowed write paths:",
    `  - \`${reportPath}\``,
    "- Trusted artifact required: yes",
    "- Ledger evidence required: yes",
    "- Manifest required: yes",
    "- Source snapshot required: yes",
    "- Committed blob revalidation required: yes",
    "- No source code changes: yes",
    "- Local AIF service/e2e: forbidden",
    `- Remote validation target: ${remoteTarget}`,
    "Excluded areas: generated files, build output, dependency caches, and vendor directories unless explicitly named by the task.",
    "Expected report structure: finding ID, severity, evidence, risk, proposed fix, confidence, and verification.",
    "Child audit reports: not required for this narrow source report.",
    "",
    "- [ ] Keep the run diagnostic-only: do not implement fixes; do not patch code; do not modify source files; do not create child implementation tasks.",
    evidenceStep,
    `- [ ] Create or update \`${reportPath}\` with finding id, severity, evidence, risk, proposed fix, confidence, and verification command or manual check.`,
    `- [ ] If no issue is found, state that explicitly in \`${reportPath}\` with the evidence checked.`,
    `- [ ] Verify every scoped path referenced in \`${reportPath}\` exists under the project root before closing the audit.`,
  ].join("\n");

  const quality = evaluateTaskPlanQuality({ task: input.task, plan });
  return quality.ok ? plan : null;
}

function normalizedGenericCandidate(plan: string): string {
  return plan
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_[\]()`'"{}:;,.!?/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractChecklistItemTexts(plan: string): string[] {
  return [...plan.matchAll(CHECKLIST_ITEM_PATTERN)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function issue(code: TaskPlanQualityIssueCode, message: string): TaskPlanQualityIssue {
  return { code, message };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wildcardPathPatternMatches(pathPattern: string, candidatePath: string): boolean {
  if (!pathPattern.includes("*")) return false;
  const pattern = `^${escapeRegExp(pathPattern).replace(/\\\*/g, "[^/]*")}$`;
  return new RegExp(pattern, "i").test(candidatePath);
}

function wildcardPathPatternAppearsInText(pathPattern: string, text: string): boolean {
  if (!pathPattern.includes("*")) return false;
  const pattern = escapeRegExp(pathPattern).replace(/\\\*/g, "[^\\s`'\"),;\\]]*");
  return new RegExp(pattern, "i").test(text);
}

function isComposeBoundaryAlias(pathPattern: string, candidatePath: string): boolean {
  const normalizedPattern = normalizePath(pathPattern).toLowerCase();
  const normalizedCandidate = normalizePath(candidatePath).toLowerCase();
  return (
    /^(?:docker-)?compose\*\.ya?ml$/.test(normalizedPattern) &&
    /^docker-compose\.ya?ml$/.test(normalizedCandidate)
  );
}

function composeBoundaryAliasAppearsInText(pathPattern: string, text: string): boolean {
  const normalizedPattern = normalizePath(pathPattern).toLowerCase();
  return (
    /^(?:docker-)?compose\*\.ya?ml$/.test(normalizedPattern) && /docker-compose\.ya?ml/i.test(text)
  );
}

function planPathSatisfiesTaskPath(planPath: string, taskPath: string): boolean {
  const normalizedPlanPath = normalizePath(planPath);
  const normalizedTaskPath = normalizePath(taskPath);
  return (
    normalizedPlanPath === normalizedTaskPath ||
    normalizedPlanPath.startsWith(`${normalizedTaskPath}/`) ||
    normalizedTaskPath.startsWith(`${normalizedPlanPath}/`) ||
    wildcardPathPatternMatches(normalizedTaskPath, normalizedPlanPath) ||
    isComposeBoundaryAlias(normalizedTaskPath, normalizedPlanPath)
  );
}

function hasAnyPlanPath(planPaths: string[], plan: string): boolean {
  const normalizedPlan = normalizePath(plan);
  const mentionedPaths = extractRepoPaths(plan);
  return planPaths.some((path) => {
    const normalizedPath = normalizePath(path);
    return (
      normalizedPlan.includes(normalizedPath) ||
      wildcardPathPatternAppearsInText(normalizedPath, normalizedPlan) ||
      composeBoundaryAliasAppearsInText(normalizedPath, normalizedPlan) ||
      mentionedPaths.some((mentionedPath) => planPathSatisfiesTaskPath(mentionedPath, path))
    );
  });
}

function uniqueCategories(issues: TaskPlanQualityIssue[]): TaskPlanQualityIssueCode[] {
  return [...new Set(issues.map((entry) => entry.code))];
}

function hasAuditReportStructure(plan: string): boolean {
  return (
    /\bfinding\s+id\b/i.test(plan) &&
    /\b(?:severity|confidence)\b/i.test(plan) &&
    /\bevidence\b/i.test(plan) &&
    /\brisk\b/i.test(plan) &&
    /\bproposed\s+fix\b/i.test(plan) &&
    /\bverification\b/i.test(plan)
  );
}

function hasDecomposedAuditStructure(plan: string, reportPaths: string[]): boolean {
  const hasChildReports = AUDIT_CHILD_REPORTS_PATTERN.test(plan);
  const hasSynthesis = AUDIT_SYNTHESIS_PATTERN.test(plan);
  const hasMultipleReports = reportPaths.length >= 2;
  const namesSourceAndSynthesisReports =
    /\b(?:source reports?|child reports?)\b/i.test(plan) &&
    /\b(?:synthesis|final report)\b/i.test(plan);
  return hasChildReports && hasSynthesis && (hasMultipleReports || namesSourceAndSynthesisReports);
}

function hasSynthesisOnlyReportEvidenceTarget(
  plan: string,
  sourceReportArtifacts?: TaskPlanQualitySourceReportArtifact[] | null,
): boolean {
  if (!AUDIT_SYNTHESIS_PATTERN.test(plan) || !AUDIT_EXISTING_CHILD_REPORTS_PATTERN.test(plan)) {
    return false;
  }

  const finalReportPaths = new Set(declaredReportArtifactPaths(plan));
  if (finalReportPaths.size === 0) return false;

  const boundaryText = auditBoundaryText(plan);
  if (!boundaryText) return false;

  const childReportPaths = extractReportArtifactPaths(boundaryText).filter(
    (path) => !finalReportPaths.has(path),
  );
  if (childReportPaths.length === 0) return false;
  const requiredSourcePaths = [
    ...new Set(
      (sourceReportArtifacts ?? [])
        .map((artifact) => normalizePath(artifact.artifactPath))
        .filter(Boolean),
    ),
  ].sort();
  if (
    requiredSourcePaths.length > 0 &&
    !requiredSourcePaths.every((path) => childReportPaths.includes(path))
  ) {
    return false;
  }

  const nonReportPaths = [
    ...extractRepoPaths(boundaryText).filter((path) => !isAuditReportArtifactPath(path)),
    ...extractConcreteSourceRoots(boundaryText),
    ...parseAuditScopeRoots(plan).filter(isConcreteAuditBoundaryPath),
  ];
  return nonReportPaths.length === 0;
}

function isPersistedAuditSourceReportTask(task: TaskPlanQualityTask): boolean {
  return (
    task.taskIntent === "audit" &&
    task.auditArtifactRole === "report" &&
    typeof task.roadmapBatchId === "string" &&
    task.roadmapBatchId.trim().length > 0
  );
}

export function evaluateTaskPlanQuality(input: TaskPlanQualityInput): TaskPlanQualityResult {
  const plan = input.plan?.trim() ?? "";
  const taskText = combinedTaskText(input.task);
  const taskPaths = extractTaskScopedPaths(taskText);
  const taskIntent = inferTaskIntent({
    taskIntent: input.task.taskIntent,
    title: input.task.title,
    description: input.task.description,
    roadmapAlias: input.task.roadmapAlias,
    tags: input.task.tags,
  });
  const hasExplicitTaskIntent = isTaskIntent(input.task.taskIntent);
  const isDiagnosticTask =
    taskIntent === "audit" || (!hasExplicitTaskIntent && DIAGNOSTIC_TASK_PATTERN.test(taskText));
  const declaredReportPath = input.task.description
    ? parseExpectedAuditReportArtifactPath(input.task.description)
    : null;
  const issues: TaskPlanQualityIssue[] = [];
  const planManifestValidation = validatePlanManifest({
    task: input.task,
    plan,
    taskIntent,
    taskPaths,
    executionContext: input.executionContext,
  });

  if (!plan) {
    issues.push(issue("empty_plan", "Plan is empty."));
    issues.push(...planManifestValidation.issues);
    return {
      ok: false,
      issues,
      categories: uniqueCategories(issues),
      planManifest: planManifestValidation.summary,
    };
  }

  issues.push(...planManifestValidation.issues);
  if (!planManifestValidation.summary.present) {
    const textOnlySizeIssue = evaluateTaskSizeTextOnlySplitIssue({
      task: input.task,
      plan,
      taskIntent,
    });
    if (textOnlySizeIssue) issues.push(textOnlySizeIssue);
  }

  if (!CHECKLIST_PATTERN.test(plan)) {
    issues.push(
      issue("missing_checklist", "Plan must contain actionable markdown checklist items."),
    );
  }

  if (PLACEHOLDER_PLAN_PATTERN.test(plan)) {
    issues.push(issue("placeholder_plan", "Plan contains placeholder or refusal-style text."));
  }

  const genericCandidate = normalizedGenericCandidate(plan);
  const genericChecklistItems = extractChecklistItemTexts(plan).filter((item) =>
    GENERIC_PLAN_PATTERN.test(normalizedGenericCandidate(item)),
  );
  if (GENERIC_PLAN_PATTERN.test(genericCandidate) || genericChecklistItems.length > 0) {
    issues.push(issue("generic_plan", "Plan is generic and not task-specific."));
  }

  if (SLASH_FALLBACK_ECHO_PATTERN.test(plan)) {
    issues.push(
      issue("slash_fallback_echo", "Plan appears to contain an AIF slash-command fallback echo."),
    );
  }

  if (THINKING_ARTIFACT_PATTERN.test(plan)) {
    issues.push(issue("thinking_artifact", "Plan leaked thinking markup into persisted output."));
  }

  if (taskPaths.length > 0 && !hasAnyPlanPath(taskPaths, plan)) {
    issues.push(
      issue(
        "missing_task_specific_artifact_path",
        `Plan omitted task-specific repository path(s): ${taskPaths.join(", ")}.`,
      ),
    );
  }

  if (isDiagnosticTask) {
    const reportPaths = extractReportArtifactPaths(plan);
    const missingReportPath = reportPaths.length === 0;
    const missingDiagnosticOnlyConstraint = !DIAGNOSTIC_ONLY_PATTERN.test(plan);
    const normalizedDeclaredReportPath = declaredReportPath
      ? normalizePath(declaredReportPath)
      : null;
    const missingDeclaredReportPath =
      normalizedDeclaredReportPath !== null &&
      !reportPaths.some((path) => normalizePath(path) === normalizedDeclaredReportPath);
    if (missingReportPath || missingDiagnosticOnlyConstraint) {
      const missing = [
        missingReportPath ? "report artifact path" : null,
        missingDiagnosticOnlyConstraint ? "diagnostic-only constraint" : null,
      ]
        .filter(Boolean)
        .join(" and ");
      issues.push(
        issue(
          "missing_diagnostic_report_constraints",
          `Diagnostic task plan is missing ${missing}.`,
        ),
      );
    }

    if (missingDeclaredReportPath) {
      issues.push(
        issue(
          "diagnostic_report_artifact_mismatch",
          `Diagnostic task plan must use declared report artifact path ${declaredReportPath}.`,
        ),
      );
    }

    if (
      DIAGNOSTIC_SCOPE_VIOLATION_PATTERN.test(plan) &&
      !/\b(?:do not|must not|no)\s+(?:implement|fix|patch|modify|create child)\b/i.test(plan)
    ) {
      issues.push(
        issue(
          "diagnostic_scope_violation",
          "Diagnostic task plan appears to implement fixes or child implementation work in the same run.",
        ),
      );
    }

    if (planUsesForbiddenLocalAifValidation(plan)) {
      issues.push(
        issue(
          "local_aif_validation_forbidden",
          "Audit canary plans must use remote-only validation and must not target localhost or a local AIF service.",
        ),
      );
    }

    const missingEvidenceTargets = !AUDIT_EVIDENCE_TARGETS_PATTERN.test(plan);
    const missingExclusions = !AUDIT_EXCLUSIONS_PATTERN.test(plan);
    const missingReportStructure = !hasAuditReportStructure(plan);
    const hasNoChildDecision = AUDIT_NO_CHILD_REPORTS_PATTERN.test(plan);
    const hasDecompositionDecision = hasDecomposedAuditStructure(plan, reportPaths);
    const concreteAuditBoundaries = concreteAuditBoundariesFromText(
      [taskText, plan].filter(Boolean).join("\n"),
    );
    const hasSynthesisOnlyException = hasSynthesisOnlyReportEvidenceTarget(
      plan,
      input.task.sourceReportArtifacts,
    );
    const missingConcreteAuditBoundaries =
      concreteAuditBoundaries.length === 0 && !hasSynthesisOnlyException;
    const missingChildDecision = !hasNoChildDecision && !hasDecompositionDecision;
    const decomposition = classifyAuditDecompositionRequest({
      title: input.task.title,
      description: [input.task.description ?? "", plan].filter(Boolean).join("\n"),
    });

    if (missingEvidenceTargets) {
      issues.push(
        issue(
          "missing_audit_evidence_targets",
          "Audit task plan must declare scoped evidence targets or source boundaries.",
        ),
      );
    }

    if (missingExclusions) {
      issues.push(
        issue(
          "missing_audit_exclusions",
          "Audit task plan must declare excluded areas or explicit out-of-scope boundaries.",
        ),
      );
    }

    if (missingReportStructure) {
      issues.push(
        issue(
          "missing_audit_report_structure",
          "Audit task plan must declare expected report fields: finding ID, severity or confidence, evidence, risk, proposed fix, and verification.",
        ),
      );
    }

    if (missingConcreteAuditBoundaries) {
      issues.push(
        issue(
          "audit_without_concrete_boundaries",
          "Audit task plan must name at least one concrete non-report repository path, source root, declared scope root, or accepted source boundary.",
        ),
      );
    }

    if (missingChildDecision) {
      issues.push(
        issue(
          "missing_child_audit_report_decision",
          "Audit task plan must state whether child/source audit reports are required or not required.",
        ),
      );
    }

    const requiresBroadDecomposition =
      decomposition.requiresDecomposition &&
      decomposition.reasonCodes.some((reason) => reason !== "audit_without_concrete_boundaries") &&
      !isPersistedAuditSourceReportTask(input.task);
    if (requiresBroadDecomposition && !hasDecompositionDecision) {
      issues.push(
        issue(
          "missing_audit_decomposition",
          `Broad audit task plan requires decomposed child/source reports plus synthesis before implementation. Classifier reasons: ${decomposition.reasonCodes.join(", ")}.`,
        ),
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    categories: uniqueCategories(issues),
    planManifest: planManifestValidation.summary,
  };
}

export function formatTaskPlanQualityBlockedReason(result: TaskPlanQualityResult): string {
  const details = result.issues.map((entry) => entry.message).join(" ");
  return `Plan quality guard (${result.categories.join(", ")}): ${details}`;
}

export class TaskPlanQualityError extends Error {
  readonly result: TaskPlanQualityResult;

  constructor(result: TaskPlanQualityResult) {
    super(formatTaskPlanQualityBlockedReason(result));
    this.name = "TaskPlanQualityError";
    this.result = result;
  }
}
