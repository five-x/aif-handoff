import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { getProjectConfig } from "./projectConfig.js";
import { inferTaskIntent, isTaskIntent, type TaskIntent } from "./taskIntent.js";

export type TaskCompletionIssueCode =
  | "zero_delta"
  | "generic_plan"
  | "missing_report_artifact"
  | "uncommitted_report_artifact"
  | "deterministic_fallback_report"
  | "missing_implementation_tool_activity"
  | "missing_review_tool_activity"
  | "invalid_or_missing_file_references"
  | "insufficient_report_evidence"
  | "branch_isolation"
  | "manual_review_required";

export interface TaskCompletionEvidenceTask {
  id: string;
  title: string;
  description?: string | null;
  taskIntent?: TaskIntent | null;
  tags?: string[] | string | null;
  roadmapAlias?: string | null;
  plan?: string | null;
  planPath?: string | null;
  implementationLog?: string | null;
  reviewComments?: string | null;
  agentActivityLog?: string | null;
  manualReviewRequired?: boolean | null;
}

export interface TaskCompletionEvidenceIssue {
  code: TaskCompletionIssueCode;
  message: string;
}

export interface TaskCompletionEvidenceResult {
  ok: boolean;
  issues: TaskCompletionEvidenceIssue[];
  evidence: {
    riskyTask: boolean;
    genericPlan: boolean;
    gitAvailable: boolean;
    changedFiles: string[];
    dirtyChangedFiles: string[];
    committedChangedFiles: string[];
    meaningfulChangedFiles: string[];
    reportArtifactFiles: string[];
    committedReportRequired: boolean;
    uncommittedReportArtifactFiles: string[];
    deterministicFallbackReport: boolean;
    implementationToolActivityCount: number;
    reviewStageToolActivityCount: number;
    substantiveReportEvidence: boolean;
    referencedPaths: string[];
    missingReferencedPaths: string[];
    existingReferencedPaths: string[];
    reportReferencedPaths: string[];
    missingReportReferencedPaths: string[];
    existingReportReferencedPaths: string[];
  };
}

export type TaskCompletionEvidencePhase = "pre_implementation" | "completion";

export interface TaskCompletionEvidenceInput {
  task: TaskCompletionEvidenceTask;
  projectRoot: string;
  branchIsolationReason?: string | null;
  requireManualReview?: boolean;
  phase?: TaskCompletionEvidencePhase;
}

const RISKY_TASK_PATTERN =
  /\b(audit|аудит|discovery|inventory|gap[-_\s]?analysis|findings?|validation|verification|security\s+review|code\s+review|review\s+findings|анализ|проверка)\b/i;

const CONTEXTUAL_VALIDATION_PATTERN =
  /\b(?:(?:validation|verification)\s+(?:audit|review|report|findings?|evidence|task|check)|(?:audit|review|report|findings?|evidence)\s+(?:validation|verification)|verify(?:ing)?\s+(?:findings?|evidence|report))\b/i;

const GENERIC_PLAN_PATTERNS = [
  /short task/i,
  /<aif-plan\b/i,
  /<\/think>/i,
  /\bdocs\s*:\s*false\b/i,
  /\btests\s*:\s*false\b/i,
  /\bno implementation needed\b/i,
  /\btask is already complete\b/i,
];

const COMMITTED_REPORT_PATTERN =
  /\bcommitted\s+(?:report|artifact)\b|\b(?:report|report artifact|artifact)\b[^\n.]{0,120}\bcommitted\b/i;

const DETERMINISTIC_FALLBACK_REPORT_PATTERN =
  /\bDeterministic diagnostic report generated\b|\bDiagnostic-only repository inventory report\b|\bNo blocking issue found by deterministic inventory check\b|\bThis report records evidence only\b/i;

const SLASH_PATH_TOKEN_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z0-9]{1,12})(?::\d+(?::\d+)?)?/g;
const ROOT_FILE_TOKEN_PATTERN =
  /(?:^|[\s`'"\[(])([\w.-]+\.(?:jsonc|json|jsx|tsx|yaml|yml|mdx|mjs|cjs|bat|cmd|cpp|css|env|hpp|html|ini|java|lock|md|ps1|py|rs|scss|sh|sql|toml|txt|xml|js|ts|go|kt|cs|c|h))(?::\d+(?::\d+)?)?(?=$|[\s`'"\]),.;])/gi;

function normalizeRelativePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

function isInsideRoot(projectRoot: string, candidatePath: string): boolean {
  const rel = relative(projectRoot, candidatePath);
  return (
    rel === "" ||
    (!rel.startsWith("..") && !rel.includes(`..${sep}`) && !resolve(rel).startsWith(".."))
  );
}

function parseTags(tags: string[] | string | null | undefined): string[] {
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

function combinedTaskText(task: TaskCompletionEvidenceTask): string {
  return [
    task.title,
    task.description,
    task.taskIntent,
    task.roadmapAlias,
    ...parseTags(task.tags),
    task.plan,
    task.implementationLog,
    task.reviewComments,
    task.agentActivityLog,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
}

export function isRiskyTask(task: TaskCompletionEvidenceTask): boolean {
  const taskIntent = inferTaskIntent({
    taskIntent: task.taskIntent,
    title: task.title,
    description: task.description,
    roadmapAlias: task.roadmapAlias,
    tags: task.tags,
  });
  if (taskIntent === "audit" || taskIntent === "spike") return true;
  if (isTaskIntent(task.taskIntent)) return false;
  const text = [
    task.title,
    task.description,
    task.taskIntent,
    task.roadmapAlias,
    ...parseTags(task.tags),
  ]
    .filter(Boolean)
    .join("\n");
  if (CONTEXTUAL_VALIDATION_PATTERN.test(text)) return true;
  const withoutStandaloneValidation = text.replace(/\b(validation|verification)\b/gi, "");
  return RISKY_TASK_PATTERN.test(withoutStandaloneValidation);
}

function hasGenericPlan(task: TaskCompletionEvidenceTask): boolean {
  const plan = task.plan?.trim() ?? "";
  if (!plan) return false;
  if (GENERIC_PLAN_PATTERNS.some((pattern) => pattern.test(plan))) return true;
  const nonEmptyLines = plan.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const hasChecklist = /-\s*\[[ xX]\]/.test(plan);
  const hasHeading = /^#{1,4}\s+\S/m.test(plan);
  const normalized = plan
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return (
    nonEmptyLines.length <= 2 &&
    !hasChecklist &&
    !hasHeading &&
    /^(task|todo|fix|fix bug|do task|do it|make changes|update code|small cleanup|implement task|complete task)$/i.test(
      normalized,
    )
  );
}

function runGit(projectRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function listGitTrackedFiles(projectRoot: string): string[] {
  const output = runGit(projectRoot, ["ls-files"]);
  if (!output) return [];
  return output.split(/\r?\n/).map(normalizeRelativePath).filter(Boolean);
}

function resolveUniqueTrackedBasename(trackedFiles: string[], rootFileName: string): string | null {
  if (!rootFileName || rootFileName.includes("/") || rootFileName.includes("\\")) return null;
  const matches = trackedFiles.filter((file) => basename(file) === rootFileName);
  return matches.length === 1 ? matches[0] : null;
}

function parseStatusFiles(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(2).trimStart();
      const renameIndex = path.indexOf(" -> ");
      return normalizeRelativePath(renameIndex >= 0 ? path.slice(renameIndex + 4) : path);
    })
    .filter(Boolean);
}

function collectChangedFiles(projectRoot: string): {
  gitAvailable: boolean;
  files: string[];
  dirtyFiles: string[];
  committedFiles: string[];
} {
  const inside = runGit(projectRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") {
    return { gitAvailable: false, files: [], dirtyFiles: [], committedFiles: [] };
  }

  const files = new Set<string>();
  const dirtyFiles = new Set<string>();
  const committedFiles = new Set<string>();
  const status = runGit(projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) {
    for (const file of parseStatusFiles(status)) {
      dirtyFiles.add(file);
      files.add(file);
    }
  }

  const baseBranch = getProjectConfig(projectRoot).git.base_branch || "main";
  const diffArgs = [
    ["diff", "--name-only", `${baseBranch}...HEAD`],
    ["diff", "--name-only", `${baseBranch}..HEAD`],
  ];
  for (const args of diffArgs) {
    const diff = runGit(projectRoot, args);
    if (diff) {
      for (const file of diff.split(/\r?\n/).map(normalizeRelativePath).filter(Boolean)) {
        committedFiles.add(file);
        files.add(file);
      }
    }
  }

  return {
    gitAvailable: true,
    files: [...files].sort(),
    dirtyFiles: [...dirtyFiles].sort(),
    committedFiles: [...committedFiles].sort(),
  };
}

function isPlanArtifact(path: string, task: TaskCompletionEvidenceTask): boolean {
  const normalized = normalizeRelativePath(path);
  const taskPlanPath = normalizeRelativePath(task.planPath || ".ai-factory/PLAN.md");
  const name = basename(normalized).toLowerCase();
  if (normalized === taskPlanPath) return true;
  if (name === "plan.md" || name === "fix_plan.md") return true;
  if (normalized.includes("/plans/")) return true;
  if (/^docs\/rdpi\/.+\/(research|design|plan)\.md$/i.test(normalized)) return true;
  return false;
}

function isMetadataOnlyPath(path: string): boolean {
  const normalized = normalizeRelativePath(path);
  return (
    normalized.startsWith(".git/") ||
    normalized === ".DS_Store" ||
    normalized.endsWith(".log") ||
    normalized.endsWith(".tmp")
  );
}

function isReportArtifactPath(path: string, task: TaskCompletionEvidenceTask): boolean {
  const normalized = normalizeRelativePath(path);
  if (isPlanArtifact(normalized, task)) return false;
  if (/^(src|packages\/[^/]+\/src)\//i.test(normalized)) return false;
  const name = basename(normalized).toLowerCase();
  if (!/\.(md|mdx|txt)$/i.test(name)) return false;
  if (/^(result|report|audit|review|findings|discovery)\.(md|mdx|txt)$/i.test(name)) return true;
  return /(^|\/)(reports?|audit|review|reviews|findings|discovery|artifacts)(\/|$)/i.test(
    normalized,
  );
}

function requiresCommittedReport(task: TaskCompletionEvidenceTask): boolean {
  return COMMITTED_REPORT_PATTERN.test(combinedTaskText(task));
}

function hasDeterministicFallbackReport(
  task: TaskCompletionEvidenceTask,
  reportText: string,
): boolean {
  return DETERMINISTIC_FALLBACK_REPORT_PATTERN.test(
    [task.implementationLog, task.reviewComments, task.agentActivityLog, reportText]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join("\n"),
  );
}

function countLatestImplementationToolActivity(
  agentActivityLog: string | null | undefined,
): number {
  if (!agentActivityLog) return 0;
  const lines = agentActivityLog.split(/\r?\n/);
  const mainImplementerStart = /\]\s+Agent:\s+(?:implement-coordinator|aif-implement)\s+started\b/i;
  const anyAgentStart = /\]\s+Agent:\s+.+\s+started\b/i;
  const mainImplementerEnd =
    /\]\s+Agent:\s+(?:implement-coordinator|aif-implement)\s+(?:complete|failed)\b/i;

  let latestStart = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (mainImplementerStart.test(lines[index])) {
      latestStart = index;
    }
  }
  if (latestStart < 0) return 0;

  let end = lines.length;
  for (let index = latestStart + 1; index < lines.length; index += 1) {
    if (mainImplementerEnd.test(lines[index]) || anyAgentStart.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(latestStart + 1, end).filter((line) => /\]\s+Tool:\s+\S+/.test(line)).length;
}

function countReviewStageRepositoryToolActivity(
  agentActivityLog: string | null | undefined,
): number {
  if (!agentActivityLog) return 0;
  const lines = agentActivityLog.split(/\r?\n/);
  const reviewAgentEvent =
    /\]\s+Agent:\s+(?:review-sidecar|security-sidecar|aif-review|aif-security-checklist|review-gate)\s+(started|complete|failed)\b/i;

  let count = 0;
  let activeReviewAgents = 0;
  for (const line of lines) {
    const event = line.match(reviewAgentEvent)?.[1]?.toLowerCase();
    if (event === "started") {
      activeReviewAgents += 1;
      continue;
    }
    if (event === "complete" || event === "failed") {
      activeReviewAgents = Math.max(0, activeReviewAgents - 1);
      continue;
    }
    if (activeReviewAgents > 0 && isReviewInspectionToolLine(line)) {
      count += 1;
    }
  }
  return count;
}

function isReviewInspectionToolLine(line: string): boolean {
  const match = line.match(/\]\s+Tool:\s+(\S+)(?:\s+(.+))?$/);
  if (!match) return false;
  const tool = match[1].toLowerCase();
  const detail = match[2]?.trim() ?? "";

  if (
    [
      "read_file",
      "list_files",
      "search_files",
      "grep",
      "rg",
      "git_status",
      "git_diff",
      "git_show",
      "git_log",
    ].includes(tool)
  ) {
    return true;
  }

  if (tool !== "run_shell") return false;
  return isReadOnlyInspectionShellCommand(detail);
}

function isReadOnlyInspectionShellCommand(detail: string): boolean {
  const command = detail.trim();
  if (!command || hasShellMutationRisk(command)) return false;
  return /^(?:rg|grep|findstr|select-string|git\s+(?:status|diff|show|log|ls-files|grep)|ls|dir|get-childitem|cat|type|sed|head|tail|find|test|wc)\b/i.test(
    command,
  );
}

function hasShellMutationRisk(command: string): boolean {
  const lower = command.toLowerCase();
  if (/[;&|<>]/.test(command) || /`/.test(command) || /\$\(/.test(command)) {
    return true;
  }
  if (/^find\b/.test(lower) && /\s-(?:delete|exec|execdir|ok|okdir)\b/.test(lower)) {
    return true;
  }
  if (/^sed\b/.test(lower) && /(?:^|\s)(?:-i(?:\b|[^a-z])|--in-place(?:=|\b))/.test(lower)) {
    return true;
  }
  if (/^git\s+(?:diff|show|log|grep)\b/.test(lower) && /(?:^|\s)--output(?:=|\b)/.test(lower)) {
    return true;
  }
  return false;
}

function collectReportText(projectRoot: string, reportFiles: string[]): string {
  const chunks: string[] = [];
  for (const file of reportFiles) {
    const absPath = resolve(projectRoot, file);
    if (!isInsideRoot(projectRoot, absPath) || !existsSync(absPath)) continue;
    try {
      const stat = statSync(absPath);
      if (!stat.isFile() || stat.size > 512_000) continue;
      chunks.push(readFileSync(absPath, "utf8"));
    } catch {
      // Ignore unreadable report candidates; path validation still uses the file path itself.
    }
  }
  return chunks.join("\n");
}

function isExcludedEvidencePath(path: string, excludedPaths: Set<string>): boolean {
  return excludedPaths.has(normalizeRelativePath(path));
}

function hasNonCircularEvidenceContext(text: string, rawPath: string, matchIndex: number): boolean {
  const lineStart = Math.max(0, text.lastIndexOf("\n", matchIndex) + 1);
  const lineEnd = text.indexOf("\n", matchIndex);
  const line = text.slice(lineStart, lineEnd >= 0 ? lineEnd : text.length);
  if (
    /\b(?:this\s+report|report\s+artifact|report\s+exists|task\s+ran|agent\s+(?:used|activity)|repository\s+tools|tool\s+activity|committed|commit(?:ted)?|runtime\s+mechanics|mechanical\s+execution)\b/i.test(
      line,
    )
  ) {
    return false;
  }
  return (
    !/^\s*(?:report|artifact|self)\s*(?:path|reference)?\s*:/i.test(line) || !line.includes(rawPath)
  );
}

interface ExtractedLineReference {
  start: number;
  end: number;
  source: "colon" | "nearby_phrase";
}

function extractLineReference(fullToken: string): ExtractedLineReference | null {
  const match = fullToken.match(/:(\d+)(?::(\d+))?\b/);
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end, source: "colon" };
}

function extractNearbyLineReference(
  text: string,
  rawPath: string,
  matchIndex: number,
): ExtractedLineReference | null {
  const rawStart = text.indexOf(rawPath, matchIndex);
  if (rawStart < 0) return null;
  const afterPath = text.slice(rawStart + rawPath.length, rawStart + rawPath.length + 80);
  const match = afterPath.match(
    /^[`'"]?\s*(?:\(|,)?\s*(?:line|lines)\s+(\d+)(?:\s*[-–]\s*(\d+))?/i,
  );
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end, source: "nearby_phrase" };
}

function extractLineReferenceForPath(
  text: string,
  fullToken: string,
  rawPath: string,
  matchIndex: number,
): ExtractedLineReference | null {
  return extractLineReference(fullToken) ?? extractNearbyLineReference(text, rawPath, matchIndex);
}

function fileLineCount(projectRoot: string, path: string): number | null {
  const absPath = resolve(projectRoot, path);
  if (!isInsideRoot(projectRoot, absPath) || !existsSync(absPath)) return null;
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > 512_000) return null;
    const content = readFileSync(absPath, "utf8");
    if (content.length === 0) return 0;
    return content.split(/\r?\n/).length;
  } catch {
    return null;
  }
}

function isValidLineReference(
  projectRoot: string,
  normalizedPath: string,
  reference: ExtractedLineReference,
): boolean {
  if (reference.start < 1 || reference.end < reference.start) return false;
  const lines = fileLineCount(projectRoot, normalizedPath);
  if (lines === null) return false;
  if (reference.source === "nearby_phrase") {
    return reference.start <= lines;
  }
  return reference.end <= lines;
}

function hasInvalidExistingLineReference(
  text: string,
  projectRoot: string,
  excludedPaths: Set<string>,
): boolean {
  for (const match of text.matchAll(SLASH_PATH_TOKEN_PATTERN)) {
    const full = match[0] ?? "";
    const raw = match[1]?.trim();
    if (!raw) continue;
    const reference = extractLineReferenceForPath(text, full, raw, match.index ?? 0);
    if (!reference) continue;
    const normalized = normalizeRelativePath(raw);
    if (
      existsSync(resolve(projectRoot, normalized)) &&
      !isExcludedEvidencePath(normalized, excludedPaths) &&
      !isValidLineReference(projectRoot, normalized, reference)
    ) {
      return true;
    }
  }
  for (const match of text.matchAll(ROOT_FILE_TOKEN_PATTERN)) {
    const full = match[0] ?? "";
    const raw = match[1]?.trim();
    if (!raw || raw.includes("/") || raw.includes("\\")) continue;
    const reference = extractLineReferenceForPath(text, full, raw, match.index ?? 0);
    if (!reference) continue;
    const normalized = normalizeRelativePath(raw);
    if (
      existsSync(resolve(projectRoot, normalized)) &&
      !isExcludedEvidencePath(normalized, excludedPaths) &&
      !isValidLineReference(projectRoot, normalized, reference)
    ) {
      return true;
    }
  }
  return false;
}

function collectExistingRefsWithLineNumbers(
  text: string,
  projectRoot: string,
  excludedPaths: Set<string> = new Set(),
): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(SLASH_PATH_TOKEN_PATTERN)) {
    const full = match[0] ?? "";
    const raw = match[1]?.trim();
    if (!raw) continue;
    const reference = extractLineReferenceForPath(text, full, raw, match.index ?? 0);
    if (!reference) continue;
    const normalized = addReferencedPath(refs, projectRoot, raw);
    if (
      normalized &&
      (!existsSync(resolve(projectRoot, normalized)) ||
        !isValidLineReference(projectRoot, normalized, reference) ||
        isExcludedEvidencePath(normalized, excludedPaths) ||
        !hasNonCircularEvidenceContext(text, raw, match.index ?? 0))
    ) {
      refs.delete(normalized);
    }
  }
  for (const match of text.matchAll(ROOT_FILE_TOKEN_PATTERN)) {
    const full = match[0] ?? "";
    const raw = match[1]?.trim();
    if (!raw || raw.includes("/") || raw.includes("\\")) continue;
    const reference = extractLineReferenceForPath(text, full, raw, match.index ?? 0);
    if (!reference) continue;
    const normalized = addReferencedPath(refs, projectRoot, raw);
    if (
      normalized &&
      (!existsSync(resolve(projectRoot, normalized)) ||
        !isValidLineReference(projectRoot, normalized, reference) ||
        isExcludedEvidencePath(normalized, excludedPaths) ||
        !hasNonCircularEvidenceContext(text, raw, match.index ?? 0))
    ) {
      refs.delete(normalized);
    }
  }
  return [...refs].sort();
}

function hasSymbolEvidenceTiedToExistingPath(
  text: string,
  existingPaths: string[],
  excludedPaths: Set<string> = new Set(),
): boolean {
  return existingPaths
    .filter((path) => !isExcludedEvidencePath(path, excludedPaths))
    .some((path) => {
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pathPattern = new RegExp(escaped, "i");
      const lines = text.split(/\r?\n/);
      return lines.some((line, index) => {
        if (!pathPattern.test(line)) return false;
        const windowText = lines.slice(Math.max(0, index - 1), index + 2).join("\n");
        return /\b(?:function|class|method|symbol|handler|component|interface|type|const|let|var|export)\s+[`'"]?[A-Za-z_$][\w$]*|[`'"]?[A-Za-z_$][\w$]*(?:\(\)|#\w+)\b/.test(
          windowText,
        );
      });
    });
}

function hasCommandOutputEvidence(text: string): boolean {
  return /(?:\b(?:command|cmd|shell|powershell|pwsh)\s*:?[^\n]{0,160}\b(?:npm|pnpm|yarn|rg|vitest|jest|tsc|eslint|node|curl)\b[^\n]{0,160}\b(?:exit code|output|stdout|stderr|passed|failed|matched|returned)\b|\b(?:npm|pnpm|yarn|rg|vitest|jest|tsc|eslint)\b[^\n]{0,160}\b(?:exit code|output|stdout|stderr|passed|failed|matched|returned)\b)/i.test(
    text,
  );
}

function hasStructuredFindingEvidence(
  text: string,
  projectRoot: string,
  existingPaths: string[],
  excludedPaths: Set<string>,
): boolean {
  const findingSections = text.split(/(?:^|\n)#{2,4}\s+|\n(?=-\s+(?:finding|issue|risk)\b)/i);
  return findingSections.some(
    (section) =>
      /\bEvidence\s*:/i.test(section) &&
      /\bRisk\s*:/i.test(section) &&
      /\bVerification\s*:/i.test(section) &&
      (collectExistingRefsWithLineNumbers(section, projectRoot, excludedPaths).length > 0 ||
        hasSymbolEvidenceTiedToExistingPath(section, existingPaths, excludedPaths) ||
        hasCommandOutputEvidence(section)),
  );
}

export function hasSubstantiveReportEvidence(input: {
  text: string;
  projectRoot: string;
  existingReferencedPaths?: string[];
  excludedReferencedPaths?: string[];
}): boolean {
  const excludedPaths = new Set((input.excludedReferencedPaths ?? []).map(normalizeRelativePath));
  if (hasInvalidExistingLineReference(input.text, input.projectRoot, excludedPaths)) return false;
  const existingPaths =
    input.existingReferencedPaths ??
    classifyReferencedPaths(
      input.projectRoot,
      extractReferencedPaths(input.text, input.projectRoot),
    ).existing;
  const evidencePaths = existingPaths.filter(
    (path) => !isExcludedEvidencePath(path, excludedPaths),
  );
  if (evidencePaths.length === 0) return false;
  if (collectExistingRefsWithLineNumbers(input.text, input.projectRoot, excludedPaths).length > 0) {
    return true;
  }
  if (hasSymbolEvidenceTiedToExistingPath(input.text, evidencePaths, excludedPaths)) return true;
  return hasStructuredFindingEvidence(input.text, input.projectRoot, evidencePaths, excludedPaths);
}

function addReferencedPath(
  refs: Set<string>,
  projectRoot: string,
  rawPath: string | undefined,
): string | null {
  const raw = rawPath?.trim();
  if (!raw || /^[a-z]+:\/\//i.test(raw)) return null;
  const normalized = normalizeRelativePath(raw.replace(/[),.;\]]+$/g, ""));
  if (!normalized || normalized.startsWith("node_modules/")) return null;
  const absPath = resolve(projectRoot, normalized);
  if (!isInsideRoot(projectRoot, absPath)) return null;
  refs.add(normalized);
  return normalized;
}

function isDelimitedReference(text: string, match: RegExpMatchArray, rawPath: string): boolean {
  const matchStart = match.index ?? 0;
  const rawStart = text.indexOf(rawPath, matchStart);
  if (rawStart <= 0) return false;
  return /[`'"\[(]/.test(text[rawStart - 1] ?? "");
}

function isInReferenceSentence(text: string, match: RegExpMatchArray): boolean {
  const index = match.index ?? 0;
  const sentenceStart = Math.max(0, text.lastIndexOf("\n", index) + 1, index - 120);
  const nextNewline = text.indexOf("\n", index);
  const sentenceEnd = nextNewline >= 0 ? nextNewline : Math.min(text.length, index + 120);
  return /\b(cite|cites|cited|reference|references|referenced|path|paths|file|files|see|inspect|finding|findings)\b/i.test(
    text.slice(sentenceStart, sentenceEnd),
  );
}

function extractReferencedPaths(
  text: string,
  projectRoot: string,
  options: { includeUndelimitedMissingRootFiles?: boolean } = {},
): string[] {
  const refs = new Set<string>();
  let trackedFiles: string[] | null = null;
  const resolveMissingRootFile = (fileName: string): string | null => {
    trackedFiles ??= listGitTrackedFiles(projectRoot);
    return resolveUniqueTrackedBasename(trackedFiles, fileName);
  };

  for (const match of text.matchAll(SLASH_PATH_TOKEN_PATTERN)) {
    const raw = match[1]?.trim();
    addReferencedPath(refs, projectRoot, raw);
  }
  for (const match of text.matchAll(ROOT_FILE_TOKEN_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw || raw.includes("/") || raw.includes("\\")) continue;
    const normalized = normalizeRelativePath(raw.replace(/[),.;\]]+$/g, ""));
    const absPath = resolve(projectRoot, normalized);
    if (!existsSync(absPath)) {
      const resolved = resolveMissingRootFile(normalized);
      if (resolved) {
        addReferencedPath(refs, projectRoot, resolved);
        continue;
      }
      if (
        !isDelimitedReference(text, match, raw) &&
        !(options.includeUndelimitedMissingRootFiles && isInReferenceSentence(text, match))
      ) {
        continue;
      }
    }
    addReferencedPath(refs, projectRoot, raw);
  }
  return [...refs].sort();
}

function classifyReferencedPaths(
  projectRoot: string,
  refs: string[],
): { existing: string[]; missing: string[] } {
  const existing: string[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    const absPath = resolve(projectRoot, ref);
    if (existsSync(absPath)) {
      existing.push(ref);
    } else {
      missing.push(ref);
    }
  }
  return { existing, missing };
}

function issue(code: TaskCompletionIssueCode, message: string): TaskCompletionEvidenceIssue {
  return { code, message };
}

export function evaluateTaskCompletionEvidence(
  input: TaskCompletionEvidenceInput,
): TaskCompletionEvidenceResult {
  const { task, projectRoot } = input;
  const phase = input.phase ?? "completion";
  const riskyTask = isRiskyTask(task);
  const genericPlan = hasGenericPlan(task);
  const gitEvidence = collectChangedFiles(projectRoot);
  const meaningfulChangedFiles = gitEvidence.files.filter(
    (file) => !isPlanArtifact(file, task) && !isMetadataOnlyPath(file),
  );
  const reportArtifactFiles = gitEvidence.files.filter((file) => isReportArtifactPath(file, task));
  const reportText = collectReportText(projectRoot, reportArtifactFiles);
  const committedReportRequired = riskyTask || requiresCommittedReport(task);
  const committedFileSet = new Set(gitEvidence.committedFiles);
  const dirtyFileSet = new Set(gitEvidence.dirtyFiles);
  const uncommittedReportArtifactFiles = committedReportRequired
    ? reportArtifactFiles.filter((file) => !committedFileSet.has(file) || dirtyFileSet.has(file))
    : [];
  const deterministicFallbackReport =
    phase === "completion" &&
    riskyTask &&
    reportArtifactFiles.length > 0 &&
    hasDeterministicFallbackReport(task, reportText);
  const implementationToolActivityCount = countLatestImplementationToolActivity(
    task.agentActivityLog,
  );
  const reviewStageToolActivityCount = countReviewStageRepositoryToolActivity(
    task.agentActivityLog,
  );
  const taskReferencedPaths = extractReferencedPaths(combinedTaskText(task), projectRoot);
  const reportReferencedPaths = extractReferencedPaths(reportText, projectRoot, {
    includeUndelimitedMissingRootFiles: true,
  });
  const referencedPaths = [...new Set([...taskReferencedPaths, ...reportReferencedPaths])].sort();
  const { existing, missing } = classifyReferencedPaths(projectRoot, referencedPaths);
  const { existing: reportExisting, missing: reportMissing } = classifyReferencedPaths(
    projectRoot,
    reportReferencedPaths,
  );
  const substantiveReportEvidence = hasSubstantiveReportEvidence({
    text: reportText,
    projectRoot,
    existingReferencedPaths: reportExisting,
    excludedReferencedPaths: reportArtifactFiles,
  });

  const issues: TaskCompletionEvidenceIssue[] = [];
  if (input.branchIsolationReason) {
    issues.push(issue("branch_isolation", input.branchIsolationReason));
  }
  if (genericPlan) {
    issues.push(
      issue("generic_plan", "Task plan looks like placeholder or generic planner output."),
    );
  }

  if (phase === "completion") {
    if (riskyTask && reportArtifactFiles.length === 0) {
      issues.push(
        issue(
          "missing_report_artifact",
          "Audit/review/discovery tasks require a concrete report artifact, not only a plan or source delta.",
        ),
      );
    }
    if ((riskyTask || genericPlan) && meaningfulChangedFiles.length === 0) {
      issues.push(
        issue(
          "zero_delta",
          "No meaningful code, documentation, report, or persisted artifact delta was detected.",
        ),
      );
    }
    if (uncommittedReportArtifactFiles.length > 0) {
      issues.push(
        issue(
          "uncommitted_report_artifact",
          `Task requires a committed report, but these report artifacts are not committed cleanly on the task branch: ${uncommittedReportArtifactFiles.join(", ")}.`,
        ),
      );
    }
    if (deterministicFallbackReport) {
      issues.push(
        issue(
          "deterministic_fallback_report",
          "Audit/review/discovery completion cannot rely on the deterministic inventory fallback report as the final artifact.",
        ),
      );
    }
    if (riskyTask && implementationToolActivityCount === 0) {
      issues.push(
        issue(
          "missing_implementation_tool_activity",
          "Audit/review/discovery tasks require repository tool activity during the latest implementation stage.",
        ),
      );
    }
    if (riskyTask && reviewStageToolActivityCount === 0) {
      issues.push(
        issue(
          "missing_review_tool_activity",
          "Audit/review/discovery tasks require repository tool activity during review-sidecar, security-sidecar, aif-review, aif-security-checklist, or review-gate validation.",
        ),
      );
    }

    let invalidEvidenceMessage: string | null = null;
    if (reportMissing.length > 0) {
      invalidEvidenceMessage =
        "Report artifact contains repository path references that do not resolve under the project root.";
    } else if (riskyTask && reportArtifactFiles.length > 0 && reportReferencedPaths.length === 0) {
      invalidEvidenceMessage =
        "Audit/review/discovery report artifact does not cite any repository file references to validate.";
    } else if (referencedPaths.length > 0 && missing.length > 0 && existing.length === 0) {
      invalidEvidenceMessage =
        "Repository path references in task evidence do not resolve under the project root.";
    }

    if (invalidEvidenceMessage) {
      issues.push(issue("invalid_or_missing_file_references", invalidEvidenceMessage));
    }
    if (
      riskyTask &&
      reportArtifactFiles.length > 0 &&
      reportMissing.length === 0 &&
      reportReferencedPaths.length > 0 &&
      !substantiveReportEvidence
    ) {
      issues.push(
        issue(
          "insufficient_report_evidence",
          "Audit/review/discovery report artifact lacks substantive evidence markers such as path+line references, symbol references tied to files, command output, or structured findings with evidence/risk/verification.",
        ),
      );
    }
  }
  if (
    input.requireManualReview ||
    Boolean(task.manualReviewRequired && (issues.length > 0 || meaningfulChangedFiles.length === 0))
  ) {
    issues.push(
      issue(
        "manual_review_required",
        "Manual review is required before this task can be verified without stronger evidence.",
      ),
    );
  }

  const ok = issues.length === 0;
  return {
    ok,
    issues,
    evidence: {
      riskyTask,
      genericPlan,
      gitAvailable: gitEvidence.gitAvailable,
      changedFiles: gitEvidence.files,
      dirtyChangedFiles: gitEvidence.dirtyFiles,
      committedChangedFiles: gitEvidence.committedFiles,
      meaningfulChangedFiles,
      reportArtifactFiles,
      committedReportRequired,
      uncommittedReportArtifactFiles,
      deterministicFallbackReport,
      implementationToolActivityCount,
      reviewStageToolActivityCount,
      substantiveReportEvidence,
      referencedPaths,
      missingReferencedPaths: missing,
      existingReferencedPaths: existing,
      reportReferencedPaths,
      missingReportReferencedPaths: reportMissing,
      existingReportReferencedPaths: reportExisting,
    },
  };
}

export function formatTaskCompletionBlockedReason(result: TaskCompletionEvidenceResult): string {
  const codes = [...new Set(result.issues.map((entry) => entry.code))];
  const details = result.issues.map((entry) => entry.message);
  return `Completion evidence guard (${codes.join(", ")}): ${details.join(" ")}`;
}
