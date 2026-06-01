import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { getProjectConfig } from "./projectConfig.js";
import {
  isAuditReportArtifactPath,
  parseExpectedAuditReportArtifactPath,
} from "./auditRoadmapContract.js";
import {
  classifyAuditSynthesisOutput,
  parseAuditSynthesisOutcomeFromText,
  type AuditSynthesisOutcome,
} from "./auditSynthesisClassifier.js";
import { countValidatedAuditFindings } from "./auditSourceEvidence.js";
import {
  stripNonBlockingWeakFindingSections,
  validateAuditReportArtifact,
  verifyAuditArtifactLifecycle,
  type AuditArtifactLifecycleEvidence,
  type AuditReportSourceSnapshot,
  type AuditReportValidationIssueCode,
  type AuditReportValidationResult,
} from "./auditReportValidator.js";
import type { AuditEvidenceUnit } from "./auditEvidenceLedger.js";
import {
  isDevelopmentImplementationIntent,
  validateImplementationManifest,
  type ImplementationManifestIssueCode,
  type ImplementationManifestValidationResult,
} from "./implementationManifest.js";
import {
  inferTaskIntent,
  isTaskIntent,
  validateTaskIntentChangedFiles,
  type TaskIntent,
  type TaskIntentChangedFilesIssue,
} from "./taskIntent.js";
import { evaluateTaskPlanQuality, type TaskPlanQualityIssueCode } from "./planQuality.js";

export type TaskCompletionIssueCode =
  | "zero_delta"
  | "generic_plan"
  | "missing_report_artifact"
  | "uncommitted_report_artifact"
  | "audit_artifact_uncommitted"
  | "committed_blob_mismatch"
  | "legacy_text_evidence_untrusted"
  | "deterministic_fallback_report"
  | "missing_implementation_tool_activity"
  | "missing_review_tool_activity"
  | "unexpected_non_report_changes"
  | "invalid_or_missing_file_references"
  | "insufficient_report_evidence"
  | "low_quality_report_evidence"
  | "audit_inconclusive"
  | "branch_isolation"
  | "manual_review_required"
  | "intent_changed_files_contradiction"
  | TaskPlanQualityIssueCode
  | ImplementationManifestIssueCode
  | AuditReportValidationIssueCode;

export interface TaskCompletionEvidenceTask {
  id: string;
  title: string;
  description?: string | null;
  taskIntent?: TaskIntent | null;
  tags?: string[] | string | null;
  roadmapAlias?: string | null;
  plan?: string | null;
  planPath?: string | null;
  plannerMode?: string | null;
  createdAt?: string | null;
  blockedFromStatus?: string | null;
  blockedReason?: string | null;
  implementationLog?: string | null;
  implementationManifestJson?: string | null;
  reviewComments?: string | null;
  agentActivityLog?: string | null;
  manualReviewRequired?: boolean | null;
  skipReview?: boolean | null;
  isFix?: boolean | null;
  expectedReportArtifactPath?: string | null;
  allowedEvidenceArtifactPaths?: string[] | null;
  auditArtifactRole?: "report" | "synthesis" | null;
  roadmapBatchId?: string | null;
  auditPlanId?: string | null;
}

export interface TaskCompletionEvidenceIssue {
  code: TaskCompletionIssueCode;
  message: string;
}

export type AuditTrustMode = "diagnostic" | "trusted_artifact";

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
    unexpectedNonReportChangedFiles: string[];
    reportArtifactFiles: string[];
    committedReportRequired: boolean;
    uncommittedReportArtifactFiles: string[];
    deterministicFallbackReport: boolean;
    implementationToolActivityCount: number;
    reviewStageToolActivityCount: number;
    auditTrustMode: AuditTrustMode;
    substantiveReportEvidence: boolean;
    legacySubstantiveReportEvidence: boolean;
    trustedAuditArtifact: boolean;
    reportQualityIssues: string[];
    referencedPaths: string[];
    missingReferencedPaths: string[];
    existingReferencedPaths: string[];
    reportReferencedPaths: string[];
    missingReportReferencedPaths: string[];
    existingReportReferencedPaths: string[];
    auditReportValidation: AuditReportValidationResult;
    auditArtifactLifecycle: AuditArtifactLifecycleEvidence | null;
    auditSynthesisOutcome: AuditSynthesisOutcome | null;
    expectedReportArtifactPath: string | null;
    intentPolicyIssues: TaskIntentChangedFilesIssue[];
    implementationManifestValidation: ImplementationManifestValidationResult | null;
  };
}

export interface TaskCompletionChangedFiles {
  gitAvailable: boolean;
  changedFiles: string[];
  dirtyChangedFiles: string[];
  committedFiles: string[];
  meaningfulChangedFiles: string[];
  meaningfulDirtyChangedFiles: string[];
}

export type TaskCompletionEvidencePhase = "pre_implementation" | "review_handoff" | "completion";

export interface TaskCompletionEvidenceInput {
  task: TaskCompletionEvidenceTask;
  projectRoot: string;
  branchIsolationReason?: string | null;
  requireManualReview?: boolean;
  phase?: TaskCompletionEvidencePhase;
  auditTrustMode?: AuditTrustMode;
  expectedSourceSnapshot?: AuditReportSourceSnapshot | null;
  auditEvidenceUnits?: AuditEvidenceUnit[];
  requireAuditLedgerEvidence?: boolean;
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
  /\bDeterministic diagnostic report generated\b|\bDiagnostic-only repository inventory report\b|\bNo blocking issue found by deterministic inventory check\b|\bThis report records evidence only\b|\bprevious candidate findings did not meet the audit finding contract\b/i;

const LOW_QUALITY_REPORT_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern:
      /(?:\bPLACEHOLDER_[A-Z0-9_]+\b|\b(?:123abc|abc123|1234567890abcdef[0-9a-f]*)\b[^\n]{0,80}\b(?:placeholder|fake|commit|hash)\b|\b(?:commit|hash|sha|git\s+(?:log|show|rev-parse))\b[^\n]{0,80}\b(?:123abc|abc123|1234567890abcdef[0-9a-f]*)\b|^\s*(?:123abc|abc123|1234567890abcdef[0-9a-f]*)(?:\s+\(|\s+[A-Z])[^\n]*)/im,
    message: "Report artifact contains placeholder commit hashes instead of real command output.",
  },
  {
    pattern: /\b(?:Author:\s+Your Name|your\.email@example\.com)\b/i,
    message: "Report artifact contains placeholder author metadata instead of real git output.",
  },
  {
    pattern:
      /\b(?:root-commit|Date:\s+Mon May 10 12:34:56 2026|Author:\s+qwen-local-agent\s+<>|Signed-off-by:\s+qwen-local-agent\s+<>|commit\s+[0-9a-f]*0c0c[0-9a-f]*\b)/i,
    message: "Report artifact contains synthetic-looking git verification output.",
  },
  {
    pattern:
      /\b(?:too large to (?:be )?(?:read|inspect)|reported as too large|file is too large|bytes\s*>\s*\d+\s*byte limit|could not (?:read|inspect|access)|not visible|would show|should show|expected to show|direct (?:file )?reads? (?:were )?not completed|direct read not completed|budget constraints|limited full inspection|remaining \d+ lines were sampled)\b/i,
    message: "Report artifact contains unverified inspection claims instead of observed evidence.",
  },
  {
    pattern:
      /\b(?:will be committed|created and will be committed|has been created and will be committed)\b/i,
    message:
      "Report artifact contains future-tense git verification instead of observed commit output.",
  },
  {
    pattern:
      /\b(?:may contain|likely used|likely indicates|likely constructs|presumably [^.:\n]+|if [\w./-]+ provides|if (?:intended|meant|expected) to|no evidence of sensitive content|confirmed (?:the )?file exists|confirmed .* exists)\b/i,
    message: "Report artifact contains speculative audit claims that are not backed by evidence.",
  },
  {
    pattern:
      /\b(?:lacks?\s+multi-user support|limits scalability|auto-generated content may not reflect actual usage|dependencies are defined|specific version constraints may lead to compatibility issues|lack of abstraction could tightly couple|appears to be thorough|hardcoded test data[^.\n]+harder to adapt|bot started successfully|all modules compiled successfully|monolithic (?:hub|router|module|file)|single-file (?:router|bottleneck)|coupling bottleneck|coupling concentration|coupling density|high fan-in coupling|central hub(?: module)?|hub file|single file coordinates|single point of (?:architectural fragility|architectural failure|change)|massive file|\b(?:\d{3,5}|[0-9],[0-9]{3}) lines\b[^.\n]+(?:central hub|monolithic|single point|coupling|broad responsibility)|dead[- ]code risk|not imported by (?:the )?(?:main )?(?:application )?(?:entry point|runtime|bot\.py)|not wired into (?:the )?(?:application|runtime|lifecycle|scoped runtime entry point)|no (?:cli )?command exists|no command exists|direct import dependency|directly imports?|late imports?|mixed import style|split import responsibility|cold-start footprint|module[- ]load time dependency|module load time|hard runtime dependency|transitive dependency chain|imports? from (?:five|six|\d+) distinct|imports? (?:data model types|concrete data model types|render functions)|one-directional coupling|import coupling[^.\n]+single point of change|schema change[^.\n]+(?:requires?|breaks?) [^.:\n]*imports?|adding (?:a )?(?:new )?ui output[^.\n]+requires? modifying|structural change[^.\n]+require a coordinated change|downstream consumer[^.\n]+internal shape|absolute (?:package |intra-package )?imports?[^.\n]+relative imports?|relative imports are more resilient|package (?:renaming|restructuring|reorganized|moved)|no action needed|module-level consumer|requires editing this entire file|extract handler methods into dedicated route modules|introduce (?:a )?handlerregistry|depend on interface contracts|facade or application-layer module|silently swallows? (?:a )?missing [\w.-]+ dependency|(?:no|without (?:a )?) runtime guard|latent runtime failure|NameError on [\w.]+)\b/i,
    message:
      "Report artifact contains non-actionable audit observations instead of concrete technical-quality findings.",
  },
  {
    pattern:
      /\b(?:duplicated initialization|duplicate(?:d)? init(?:ialization)?|same [\w-]+ initialization appears|extract (?:the )?.{0,80}(?:helper|factory|context)|DRY|import chain forms (?:a )?(?:tight coupling|dependency)|tight coupling[^.\n]+import|top-level import error[^.\n]+fail(?:s)? to start|transient import-time side-effect|future change[^.\n]+(?:must|needs to|requires?) be duplicated|private method call|direct store access|service\.store\.create_note|bypassing (?:the )?service layer|violates? (?:the )?(?:service-layer )?abstraction|abstraction bypass)\b/i,
    message:
      "Report artifact contains refactor/abstraction-smell observations instead of concrete broken behavior.",
  },
  {
    pattern:
      /\b(?:overlap in task\/workflow routing|duplication in responsibilities|distributed configuration|configuration in multiple files|centralized configuration management|missing documentation for submodules|lack of ownership clarity for branches|missing ownership clarity|incomplete ownership clarity|does not (?:explicitly )?define (?:module )?ownership(?: boundaries)?|does not explicitly define boundaries|does not map each stage to a responsible module|does not map (?:these |the |conceptual )?layers? to (?:actual )?module (?:paths?|boundaries)|module-to-(?:layer|stage) mapping|module-path mappings?|cannot determine which module owns|branch naming convention and ownership policy|unclear ownership|orphaned (?:utility|module|code)|orphaned module|undocumented integration|no visible invocation|audit all imports of|missing [`']?__all__[`']?|without an? [`']?__all__[`']? declaration|not enforced via __all__|no explicit public api boundary|absence from (?:the )?package(?:'s)? public boundary|public (?:api|interface) surface|documented interface contract|documented as an ownership boundary|document the contract between|module docstrings?|module-level docstrings?|ownership documentation|ownership gap|no documented owner|no documented ownership|no integration point|wire [^.:\n]+ into [^.:\n]+ lifecycle|intentionally decoupled[^.\n]+owned by|owned by a separate subsystem|cross-reference documentation)\b/i,
    message:
      "Report artifact contains governance/documentation observations instead of concrete technical-quality findings.",
  },
  {
    pattern: /\bprevious candidate findings did not meet the audit finding contract\b/i,
    message:
      "Report artifact contains a template no-findings conclusion from deterministic repair instead of a source-specific audit decision.",
  },
];

const SLASH_PATH_TOKEN_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z0-9]{1,12})(?::\d+(?::\d+)?)?/g;
const ROOT_FILE_TOKEN_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.env(?:\.[\w-]+)+)|[\w.-]+\.(?:jsonc|json|jsx|tsx|yaml|yml|mdx|mjs|cjs|bat|cmd|cpp|css|env|hpp|html|ini|java|lock|md|ps1|py|rs|scss|sh|sql|toml|txt|xml|js|ts|go|kt|cs|c|h))(?::\d+(?::\d+)?)?(?=$|[\s`'"\]),.;])/gi;
const DIRECTORY_LINE_REFERENCE_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+\d+(?:-\d+)?)(?=$|[\s`'"\]),.;])/g;

function normalizeRelativePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

function normalizePathForComparison(path: string): string {
  const normalized = normalizeRelativePath(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isSameRepositoryPath(left: string, right: string): boolean {
  return normalizePathForComparison(left) === normalizePathForComparison(right);
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

function hasExplicitGeneralEvidenceIntent(task: TaskCompletionEvidenceTask): boolean {
  return parseTags(task.tags).some((tag) =>
    ["intent:general", "kind:general"].includes(tag.trim().toLowerCase()),
  );
}

function taskForEvidenceInference(task: TaskCompletionEvidenceTask): TaskCompletionEvidenceTask {
  if (task.taskIntent !== "general" || hasExplicitGeneralEvidenceIntent(task)) {
    return task;
  }
  return { ...task, taskIntent: null };
}

export function isRiskyTask(task: TaskCompletionEvidenceTask): boolean {
  const inferenceTask = taskForEvidenceInference(task);
  const taskIntent = inferTaskIntent({
    taskIntent: inferenceTask.taskIntent,
    title: inferenceTask.title,
    description: inferenceTask.description,
    roadmapAlias: inferenceTask.roadmapAlias,
    tags: inferenceTask.tags,
  });
  if (taskIntent === "audit" || taskIntent === "spike") return true;
  if (isTaskIntent(inferenceTask.taskIntent)) return false;
  const text = [
    inferenceTask.title,
    inferenceTask.description,
    inferenceTask.taskIntent,
    inferenceTask.roadmapAlias,
    ...parseTags(inferenceTask.tags),
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

  const configuredBaseBranch = getProjectConfig(projectRoot).git.base_branch || "main";
  const baseBranch = resolveExistingBaseBranch(projectRoot, configuredBaseBranch);
  const baseDiffArgs = baseBranch
    ? [
        ["diff", "--name-only", `${baseBranch}...HEAD`],
        ["diff", "--name-only", `${baseBranch}..HEAD`],
      ]
    : [];
  const diffArgs = [...baseDiffArgs, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]];
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

function resolveExistingBaseBranch(
  projectRoot: string,
  configuredBaseBranch: string,
): string | null {
  const candidates = [
    configuredBaseBranch,
    configuredBaseBranch && !configuredBaseBranch.includes("/")
      ? `origin/${configuredBaseBranch}`
      : null,
    "main",
    "origin/main",
    "master",
    "origin/master",
  ].filter((entry): entry is string => Boolean(entry));
  for (const candidate of [...new Set(candidates)]) {
    const ref = runGit(projectRoot, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]);
    if (ref) return candidate;
  }
  return null;
}

function isPlanArtifact(path: string, task: TaskCompletionEvidenceTask): boolean {
  const normalized = normalizeRelativePath(path);
  const taskPlanPath = normalizeRelativePath(task.planPath || ".ai-factory/PLAN.md");
  const name = basename(normalized).toLowerCase();
  if (normalized === taskPlanPath) return true;
  if (
    normalized.startsWith(".ai-factory/") &&
    (name === "plan.md" || name === "fix_plan.md" || normalized.includes("/plans/"))
  ) {
    return true;
  }
  if (/^docs\/rdpi\/.+\/(?:research|design|plan|result)\.md$/i.test(normalized)) return true;
  if (normalized.startsWith("docs/intake/")) return true;
  if (normalized === "docs/work_status.json" || normalized === "docs/work_index.md") return true;
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

function isGeneratedDependencyArtifactPath(path: string): boolean {
  const normalized = normalizeRelativePath(path);
  return (
    normalized.startsWith("node_modules/") ||
    normalized.startsWith(".npm-cache/") ||
    normalized.startsWith(".pnpm-store/") ||
    normalized.startsWith(".yarn/cache/") ||
    normalized.startsWith(".cache/") ||
    normalized.startsWith(".turbo/") ||
    normalized.startsWith("dist/") ||
    normalized.startsWith("build/") ||
    normalized.startsWith("coverage/") ||
    normalized.startsWith("out/") ||
    normalized.endsWith(".tsbuildinfo")
  );
}

function isReportArtifactPath(path: string, task: TaskCompletionEvidenceTask): boolean {
  const normalized = normalizeRelativePath(path);
  if (isPlanArtifact(normalized, task)) return false;
  return isAuditReportArtifactPath(normalized);
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

function countImplementationToolActivity(agentActivityLog: string | null | undefined): number {
  if (!agentActivityLog) return 0;
  const lines = agentActivityLog.split(/\r?\n/);
  const mainImplementerStart = /\]\s+Agent:\s+(?:implement-coordinator|aif-implement)\s+started\b/i;
  const anyAgentStart = /\]\s+Agent:\s+.+\s+started\b/i;
  const mainImplementerEnd =
    /\]\s+Agent:\s+(?:implement-coordinator|aif-implement)\s+(?:complete|failed)\b/i;

  let active = false;
  let count = 0;
  for (const line of lines) {
    if (mainImplementerStart.test(line)) {
      active = true;
      continue;
    }
    if (active && mainImplementerEnd.test(line)) {
      active = false;
      continue;
    }
    if (active && anyAgentStart.test(line)) {
      active = false;
      continue;
    }
    if (active && /\]\s+Tool:\s+\S+/.test(line)) {
      count += 1;
    }
  }
  return count;
}

function countReviewStageRepositoryToolActivity(
  agentActivityLog: string | null | undefined,
): number {
  if (!agentActivityLog) return 0;
  const lines = agentActivityLog.split(/\r?\n/);
  const reviewAgentEvent =
    /\]\s+Agent:\s+(?:review-sidecar|security-sidecar|aif-review|aif-security-checklist|review-gate|review-correctness|review-security-data-loss|review-regression-api-contract|review-audit-evidence)\s+(started|complete|failed)\b/i;

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

function extractDelimitedColonLineReference(
  text: string,
  rawPath: string,
  matchIndex: number,
): ExtractedLineReference | null {
  const rawStart = text.indexOf(rawPath, matchIndex);
  if (rawStart < 0) return null;
  const afterPath = text.slice(rawStart + rawPath.length, rawStart + rawPath.length + 32);
  const match = afterPath.match(/^[`'"]?\s*:(\d+)(?::(\d+))?\b/);
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end, source: "colon" };
}

function extractAdjacentLineFieldReference(
  text: string,
  rawPath: string,
  matchIndex: number,
): ExtractedLineReference | null {
  const rawStart = text.indexOf(rawPath, matchIndex);
  if (rawStart < 0) return null;
  const lineStart = Math.max(0, text.lastIndexOf("\n", rawStart) + 1);
  const lineEnd = text.indexOf("\n", rawStart);
  const currentLine = text.slice(lineStart, lineEnd >= 0 ? lineEnd : text.length);
  if (!/\b(?:file|path)\s*(?:\*\*)?\s*:/i.test(currentLine)) return null;

  const nextLines = text.slice(
    lineEnd >= 0 ? lineEnd : rawStart + rawPath.length,
    rawStart + rawPath.length + 180,
  );
  const match = nextLines.match(
    /(?:^|\n)\s*(?:[-*]\s*)?(?:\*\*)?\s*(?:line|lines)\s*(?:\*\*)?\s*:\s*(\d+)(?:\s*[-\u2013]\s*(\d+))?/i,
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
  return (
    extractLineReference(fullToken) ??
    extractDelimitedColonLineReference(text, rawPath, matchIndex) ??
    extractNearbyLineReference(text, rawPath, matchIndex) ??
    extractAdjacentLineFieldReference(text, rawPath, matchIndex)
  );
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
  const commandNames =
    "npm|pnpm|yarn|rg|grep|cat|ls|sed|head|tail|find|wc|git|vitest|jest|tsc|eslint|node|curl|read_file|list_files|search_files";
  const outputWords =
    "exit code|output|stdout|stderr|passed|failed|matched|returned|included|error";
  return new RegExp(
    `(?:\\b(?:command|cmd|shell|powershell|pwsh)\\s*:?[^\\n]{0,160}\\b(?:${commandNames})\\b[^\\n]{0,160}\\b(?:${outputWords})\\b|\\b(?:${commandNames})\\b[^\\n]{0,160}\\b(?:${outputWords})\\b)`,
    "i",
  ).test(text);
}

function extractEvidenceFieldBlocks(section: string): string[] {
  const lines = section.split(/\r?\n/);
  const blocks: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\bEvidence\s*:/i.test(lines[index])) continue;
    const block = [lines[index]];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (!line.trim()) break;
      if (
        /^\s*(?:[-*]\s*)?(?:\*\*)?(?:Risk|Proposed fix|Verification|Confidence|Severity)(?:\*\*)?\s*:/i.test(
          line,
        ) ||
        /^#{1,6}\s+\S/.test(line)
      ) {
        break;
      }
      block.push(line);
    }
    blocks.push(block.join("\n"));
  }
  return blocks;
}

function hasConcreteEvidenceFieldLineReference(
  section: string,
  projectRoot: string,
  excludedPaths: Set<string>,
): boolean {
  return extractEvidenceFieldBlocks(section).some(
    (block) => collectExistingRefsWithLineNumbers(block, projectRoot, excludedPaths).length > 0,
  );
}

function collectFalseMissingPathClaims(text: string, projectRoot: string): string[] {
  const claimedMissingPaths = new Set<string>();
  const patterns = [
    /`([^`\r\n]+)`\s+(?:directory\s+|file\s+)?does not exist/gi,
    /(?:directory|file)\s+`([^`\r\n]+)`\s+does not exist/gi,
    /(?:ls|dir):\s+cannot access ['"`]?([^'"`\s\r\n]+)['"`]?:\s+No such file or directory/gi,
    /cannot find path ['"`]?([^'"`\s\r\n]+)['"`]?/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const rawPath = match[1]?.trim();
      if (!rawPath || rawPath.includes("*")) continue;
      const normalized = normalizeRelativePath(rawPath);
      const absPath = resolve(projectRoot, normalized);
      if (isInsideRoot(projectRoot, absPath) && existsSync(absPath)) {
        claimedMissingPaths.add(normalized);
      }
    }
  }

  return [...claimedMissingPaths].sort();
}

function collectLowQualityReportEvidenceIssues(text: string, projectRoot: string): string[] {
  if (!text.trim()) return [];
  const issues = new Set<string>();

  for (const { pattern, message } of LOW_QUALITY_REPORT_PATTERNS) {
    if (pattern.test(text)) {
      issues.add(message);
    }
  }

  const falseMissingPaths = collectFalseMissingPathClaims(text, projectRoot);
  if (falseMissingPaths.length > 0) {
    issues.add(
      `Report artifact claims existing paths are missing: ${formatPathExamples(falseMissingPaths)}.`,
    );
  }

  return [...issues].sort();
}

function hasStructuredFindingEvidence(
  text: string,
  projectRoot: string,
  existingPaths: string[],
  excludedPaths: Set<string>,
  requireProposedFix: boolean,
): boolean {
  const findingSections = text.split(/(?:^|\n)#{2,4}\s+|\n(?=-\s+(?:finding|issue|risk)\b)/i);
  return findingSections.some((section) => {
    if (!/\bEvidence\s*:/i.test(section)) return false;
    if (!/\bRisk\s*:/i.test(section)) return false;
    if (requireProposedFix && !/\bProposed fix\s*:/i.test(section)) return false;
    if (!/\bVerification\s*:/i.test(section)) return false;
    if (requireProposedFix) {
      return (
        hasConcreteEvidenceFieldLineReference(section, projectRoot, excludedPaths) &&
        hasCommandOutputEvidence(section)
      );
    }
    return (
      collectExistingRefsWithLineNumbers(section, projectRoot, excludedPaths).length > 0 ||
      hasSymbolEvidenceTiedToExistingPath(section, existingPaths, excludedPaths) ||
      hasCommandOutputEvidence(section)
    );
  });
}

function hasStructuredFindingEvidenceWithAllowedArtifactPath(
  text: string,
  allowedArtifactPaths: string[],
  requireProposedFix: boolean,
): boolean {
  if (allowedArtifactPaths.length === 0) return false;
  if (requireProposedFix) return false;
  const findingSections = text.split(/(?:^|\n)#{2,4}\s+|\n(?=-\s+(?:finding|issue|risk)\b)/i);
  return findingSections.some((section) => {
    if (!/\bEvidence\s*:/i.test(section)) return false;
    if (!/\bRisk\s*:/i.test(section)) return false;
    if (requireProposedFix && !/\bProposed fix\s*:/i.test(section)) return false;
    if (!/\bVerification\s*:/i.test(section)) return false;
    return allowedArtifactPaths.some((artifactPath) => {
      const escaped = artifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped, "i").test(section);
    });
  });
}

function hasValidatedNoFindingsEvidence(
  text: string,
  projectRoot: string,
  excludedPaths: Set<string>,
): boolean {
  if (!/\bNo validated findings\b/i.test(text)) return false;
  if (DETERMINISTIC_FALLBACK_REPORT_PATTERN.test(text)) return false;
  if (
    !/\b(?:Checked files|Checked commands|Inspection matrix|Commands run|Files inspected)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return (
    collectExistingRefsWithLineNumbers(text, projectRoot, excludedPaths).length > 0 &&
    hasCommandOutputEvidence(text)
  );
}

export function hasSubstantiveReportEvidence(input: {
  text: string;
  projectRoot: string;
  existingReferencedPaths?: string[];
  excludedReferencedPaths?: string[];
  allowedEvidenceArtifactPaths?: string[];
  requireProposedFix?: boolean;
}): boolean {
  const excludedPaths = new Set((input.excludedReferencedPaths ?? []).map(normalizeRelativePath));
  const allowedArtifactPaths = [
    ...new Set((input.allowedEvidenceArtifactPaths ?? []).map(normalizeRelativePath)),
  ];
  const requireProposedFix = input.requireProposedFix ?? false;
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
  if (
    requireProposedFix &&
    hasValidatedNoFindingsEvidence(input.text, input.projectRoot, excludedPaths)
  ) {
    return true;
  }
  if (
    !requireProposedFix &&
    collectExistingRefsWithLineNumbers(input.text, input.projectRoot, excludedPaths).length > 0
  ) {
    return true;
  }
  if (
    !requireProposedFix &&
    hasSymbolEvidenceTiedToExistingPath(input.text, evidencePaths, excludedPaths)
  ) {
    return true;
  }
  if (
    hasStructuredFindingEvidenceWithAllowedArtifactPath(
      input.text,
      allowedArtifactPaths,
      requireProposedFix,
    )
  ) {
    return true;
  }
  return hasStructuredFindingEvidence(
    input.text,
    input.projectRoot,
    evidencePaths,
    excludedPaths,
    requireProposedFix,
  );
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

function isInsideMarkdownFence(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const fenceCount = (before.match(/(?:^|\n)```/g) ?? []).length;
  return fenceCount % 2 === 1;
}

function isInsideCommandOutputFence(text: string, index: number): boolean {
  if (!isInsideMarkdownFence(text, index)) return false;
  const before = text.slice(0, index);
  const fenceMatches = [...before.matchAll(/(?:^|\n)```[^\n]*\r?\n?/g)];
  const openingFence = fenceMatches[fenceMatches.length - 1];
  if (!openingFence) return false;
  const intro = before
    .slice(0, openingFence.index)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join("\n");
  const commandNames =
    "npm|pnpm|yarn|rg|grep|cat|ls|sed|head|tail|find|wc|git|vitest|jest|tsc|eslint|node|curl|read_file|list_files|search_files";
  return new RegExp(
    `\\b(?:command|cmd|shell|powershell|pwsh)\\b[^\\n]{0,240}\\b(?:${commandNames})\\b[^\\n]{0,240}\\b(?:output|stdout|stderr)\\s*:`,
    "i",
  ).test(intro);
}

function isBareMissingPath(rawPath: string, projectRoot: string): boolean {
  const normalized = normalizeRelativePath(rawPath.replace(/[),.;\]]+$/g, ""));
  return Boolean(normalized && !existsSync(resolve(projectRoot, normalized)));
}

function isBareMissingCommandOutputPathReference(
  text: string,
  match: RegExpMatchArray,
  rawPath: string,
  projectRoot: string,
): boolean {
  if (extractLineReference(match[0] ?? "")) return false;
  return (
    isBareMissingPath(rawPath, projectRoot) && isInsideCommandOutputFence(text, match.index ?? 0)
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
    if (!raw) continue;
    if (isBareMissingCommandOutputPathReference(text, match, raw, projectRoot)) continue;
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
        isInsideMarkdownFence(text, match.index ?? 0) ||
        (!isDelimitedReference(text, match, raw) &&
          !(options.includeUndelimitedMissingRootFiles && isInReferenceSentence(text, match)))
      ) {
        continue;
      }
    }
    addReferencedPath(refs, projectRoot, raw);
  }
  return [...refs].sort();
}

function extractDirectoryLineReferences(text: string, projectRoot: string): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(DIRECTORY_LINE_REFERENCE_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const normalized = normalizeRelativePath(raw.replace(/[),.;\]]+$/g, ""));
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash <= 0) continue;
    const directory = normalized.slice(0, lastSlash);
    const absDirectory = resolve(projectRoot, directory);
    if (!isInsideRoot(projectRoot, absDirectory) || !existsSync(absDirectory)) continue;
    try {
      if (statSync(absDirectory).isDirectory()) {
        refs.add(normalized);
      }
    } catch {
      // Ignore races between existsSync and statSync; missing paths are handled by normal refs.
    }
  }
  return [...refs].sort();
}

function classifyReferencedPaths(
  projectRoot: string,
  refs: string[],
  allowedEvidenceArtifactPaths: Set<string> = new Set(),
): { existing: string[]; missing: string[] } {
  const existing: string[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    if (allowedEvidenceArtifactPaths.has(normalizeRelativePath(ref))) {
      existing.push(ref);
      continue;
    }
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

function isLedgerOrManifestValidationIssue(code: string): boolean {
  return (
    code === "missing_report_manifest" ||
    code === "invalid_report_manifest" ||
    code === "unsupported_report_manifest_version" ||
    code === "missing_report_manifest_fields" ||
    code.startsWith("manifest_") ||
    code === "missing_audit_evidence_ref" ||
    code.startsWith("audit_evidence_")
  );
}

function isTrustedAuditSourceClassification(sourceClassification: string): boolean {
  return (
    sourceClassification === "validated_findings_present" ||
    sourceClassification === "validated_no_findings"
  );
}

function isTrustedAuditArtifactTask(task: TaskCompletionEvidenceTask): boolean {
  return (
    task.roadmapBatchId != null ||
    task.auditArtifactRole === "report" ||
    task.auditArtifactRole === "synthesis"
  );
}

function resolveAuditTrustMode(input: TaskCompletionEvidenceInput): AuditTrustMode {
  return (
    input.auditTrustMode ??
    (isTrustedAuditArtifactTask(input.task) ? "trusted_artifact" : "diagnostic")
  );
}

function gitSnapshotForRef(projectRoot: string, ref: string): AuditReportSourceSnapshot | null {
  const commit = runGit(projectRoot, ["rev-parse", ref]);
  const tree = runGit(projectRoot, ["rev-parse", `${ref}^{tree}`]);
  if (!commit || !tree) return null;
  const branch = runGit(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    id: `git:${commit}:${tree}`,
    commit,
    tree,
    branch: branch && branch !== "HEAD" ? branch : null,
    dirty: false,
  };
}

function isHeadReportArtifactOnlyCommit(
  projectRoot: string,
  reportArtifactFiles: string[],
): boolean {
  if (reportArtifactFiles.length === 0) return false;
  const changed = runGit(projectRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
  if (!changed) return false;
  const reportArtifactSet = new Set(reportArtifactFiles.map(normalizePathForComparison));
  const changedFiles = changed.split(/\r?\n/).map(normalizePathForComparison).filter(Boolean);
  return (
    changedFiles.length > 0 &&
    changedFiles.every((file) => reportArtifactSet.has(file)) &&
    runGit(projectRoot, ["rev-parse", "HEAD^"]) != null
  );
}

function deriveTrustedAuditSourceSnapshot(
  projectRoot: string,
  reportArtifactFiles: string[],
): AuditReportSourceSnapshot | null {
  const ref = isHeadReportArtifactOnlyCommit(projectRoot, reportArtifactFiles) ? "HEAD^" : "HEAD";
  return gitSnapshotForRef(projectRoot, ref);
}

function hasTrustedAuditArtifactProof(input: {
  requireAuditLedgerEvidence?: boolean;
  auditReportValidation: AuditReportValidationResult;
  auditArtifactLifecycle: AuditArtifactLifecycleEvidence | null;
}): boolean {
  const { auditReportValidation, auditArtifactLifecycle } = input;
  return (
    auditReportValidation.ok &&
    auditReportValidation.manifestStatus === "valid" &&
    isTrustedAuditSourceClassification(auditReportValidation.sourceClassification) &&
    input.requireAuditLedgerEvidence === true &&
    auditArtifactLifecycle?.ok === true &&
    auditArtifactLifecycle.states.artifact_state_valid === true &&
    auditArtifactLifecycle.committedValidation?.ok === true &&
    isTrustedAuditSourceClassification(
      auditArtifactLifecycle.committedValidation.sourceClassification,
    )
  );
}

function hasVisibleValidatedFindingSection(text: string): boolean {
  return /(^|\n)\s*#{2,6}\s+(?:Validated\s+)?Finding\s+\d+(?:[.:)\s-]|$)/i.test(text);
}

function hasVisibleValidatedNoFindingsClaim(text: string): boolean {
  return (
    /(^|\n)\s*(?:[-*]\s*)?(?:Audit|Final) outcome\s*:\s*Validated\b/i.test(text) ||
    /\bvalidated\s+no[- ]findings\s+with\b/i.test(text) ||
    /\bfinal\s+validated\s+no[- ]findings\b/i.test(text) ||
    /\bsubstantive\s+no[- ]findings\s+evidence\b/i.test(text)
  );
}

function hasStrongerSynthesisClaim(input: {
  text: string;
  projectRoot: string;
  auditReportValidation: AuditReportValidationResult;
}): boolean {
  const sourceOutcome = parseAuditSynthesisOutcomeFromText(input.text);
  if (
    sourceOutcome?.kind === "validated_findings_present" ||
    sourceOutcome?.kind === "validated_no_findings"
  ) {
    return true;
  }
  const manifestOutcome = input.auditReportValidation.manifest?.outcome;
  if (
    manifestOutcome === "validated_findings_present" ||
    manifestOutcome === "validated_no_findings"
  ) {
    return true;
  }
  if (
    countValidatedAuditFindings({
      text: input.text,
      projectRoot: input.projectRoot,
      requireProposedFix: true,
    }) > 0
  ) {
    return true;
  }
  return (
    hasVisibleValidatedFindingSection(input.text) || hasVisibleValidatedNoFindingsClaim(input.text)
  );
}

function hasExplicitAuditInconclusiveSynthesisConclusion(input: {
  text: string;
  projectRoot: string;
  auditReportValidation: AuditReportValidationResult;
}): boolean {
  const { text } = input;
  const normalized = text.replace(/\r/g, "");
  const explicitInconclusive =
    /(^|\n)\s*#{1,6}\s*Audit Inconclusive\b/i.test(normalized) ||
    /(^|\n)\s*(?:[-*]\s*)?(?:Audit|Final) outcome\s*:\s*Audit inconclusive\b/i.test(normalized);
  return explicitInconclusive && !hasStrongerSynthesisClaim(input);
}

function formatPathExamples(paths: string[], limit = 8): string {
  const shown = paths.slice(0, limit).map((path) => `\`${path}\``);
  const remaining = paths.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")} and ${remaining} more` : shown.join(", ");
}

function taskExplicitlyRequiresImplementationManifest(task: TaskCompletionEvidenceTask): boolean {
  const inferenceTask = taskForEvidenceInference(task);
  const taskIntent = inferTaskIntent({
    taskIntent: inferenceTask.taskIntent,
    isFix: inferenceTask.isFix,
    title: inferenceTask.title,
    description: inferenceTask.description,
    roadmapAlias: inferenceTask.roadmapAlias,
    tags: inferenceTask.tags,
  });
  return isDevelopmentImplementationIntent(taskIntent);
}

export function collectTaskCompletionChangedFiles(input: {
  task: TaskCompletionEvidenceTask;
  projectRoot: string;
}): TaskCompletionChangedFiles {
  const gitEvidence = collectChangedFiles(input.projectRoot);
  const meaningfulChangedFiles = gitEvidence.files.filter(
    (file) =>
      !isPlanArtifact(file, input.task) &&
      !isMetadataOnlyPath(file) &&
      !isGeneratedDependencyArtifactPath(file),
  );
  const meaningfulDirtyChangedFiles = gitEvidence.dirtyFiles.filter(
    (file) =>
      !isPlanArtifact(file, input.task) &&
      !isMetadataOnlyPath(file) &&
      !isGeneratedDependencyArtifactPath(file),
  );
  return {
    gitAvailable: gitEvidence.gitAvailable,
    changedFiles: gitEvidence.files,
    dirtyChangedFiles: gitEvidence.dirtyFiles,
    committedFiles: gitEvidence.committedFiles,
    meaningfulChangedFiles,
    meaningfulDirtyChangedFiles,
  };
}

function readProjectPackageJsonText(projectRoot: string): string | null {
  const packageJsonPath = resolve(projectRoot, "package.json");
  if (!existsSync(packageJsonPath)) return null;
  try {
    return readFileSync(packageJsonPath, "utf8");
  } catch {
    return null;
  }
}

export function evaluateTaskCompletionEvidence(
  input: TaskCompletionEvidenceInput,
): TaskCompletionEvidenceResult {
  const { task, projectRoot } = input;
  const phase = input.phase ?? "completion";
  const auditTrustMode = resolveAuditTrustMode(input);
  const effectiveRequireAuditLedgerEvidence =
    input.requireAuditLedgerEvidence || auditTrustMode === "trusted_artifact";
  const inferenceTask = taskForEvidenceInference(task);
  const riskyTask = isRiskyTask(task);
  const genericPlan = hasGenericPlan(task);
  const preImplementationPlanQuality =
    phase === "pre_implementation"
      ? evaluateTaskPlanQuality({
          task: inferenceTask,
          plan: task.plan,
          executionContext: {
            packageJsonText: readProjectPackageJsonText(projectRoot),
          },
        })
      : null;
  const includeAllPreImplementationPlanIssues =
    task.plannerMode === "full" || /```aif-plan-manifest\b/i.test(task.plan ?? "");
  const changedFileEvidence = collectTaskCompletionChangedFiles({ task, projectRoot });
  const gitEvidence = {
    gitAvailable: changedFileEvidence.gitAvailable,
    files: changedFileEvidence.changedFiles,
    dirtyFiles: changedFileEvidence.dirtyChangedFiles,
    committedFiles: changedFileEvidence.committedFiles,
  };
  const meaningfulChangedFiles = changedFileEvidence.meaningfulChangedFiles;
  const meaningfulDirtyChangedFiles = changedFileEvidence.meaningfulDirtyChangedFiles;
  const intentPolicyResult =
    phase !== "pre_implementation"
      ? validateTaskIntentChangedFiles({
          task: inferenceTask,
          changedFiles: gitEvidence.files,
          meaningfulChangedFiles,
        })
      : null;
  const implementationManifestValidation =
    phase !== "pre_implementation" && taskExplicitlyRequiresImplementationManifest(task)
      ? validateImplementationManifest({
          task: inferenceTask,
          manifestJson: task.implementationManifestJson,
          changedFiles: gitEvidence.files,
          meaningfulChangedFiles,
          dirtyChangedFiles: meaningfulDirtyChangedFiles,
          phase,
        })
      : null;
  const expectedReportArtifactPath =
    task.expectedReportArtifactPath ??
    (task.description ? parseExpectedAuditReportArtifactPath(task.description) : null);
  const allowedEvidenceArtifactPaths = new Set(
    (task.allowedEvidenceArtifactPaths ?? []).map(normalizeRelativePath),
  );
  const reportArtifactFiles = expectedReportArtifactPath
    ? gitEvidence.files.filter(
        (file) =>
          isSameRepositoryPath(file, expectedReportArtifactPath) &&
          isReportArtifactPath(file, task),
      )
    : gitEvidence.files.filter((file) => isReportArtifactPath(file, task));
  const reportText = collectReportText(projectRoot, reportArtifactFiles);
  const hasReportArtifactForValidation = reportArtifactFiles.length > 0;
  const expectedSourceSnapshot =
    input.expectedSourceSnapshot ??
    (hasReportArtifactForValidation && auditTrustMode === "trusted_artifact"
      ? deriveTrustedAuditSourceSnapshot(projectRoot, reportArtifactFiles)
      : null);
  const reportClassificationText = stripNonBlockingWeakFindingSections(reportText);
  const committedReportRequired = riskyTask || requiresCommittedReport(task);
  const committedFileSet = new Set(gitEvidence.committedFiles.map(normalizePathForComparison));
  const dirtyFileSet = new Set(gitEvidence.dirtyFiles.map(normalizePathForComparison));
  const uncommittedReportArtifactFiles = committedReportRequired
    ? reportArtifactFiles.filter(
        (file) =>
          !committedFileSet.has(normalizePathForComparison(file)) ||
          dirtyFileSet.has(normalizePathForComparison(file)),
      )
    : [];
  const unexpectedNonReportChangedFiles =
    riskyTask && expectedReportArtifactPath
      ? meaningfulChangedFiles.filter(
          (file) => !isSameRepositoryPath(file, expectedReportArtifactPath),
        )
      : [];
  const deterministicFallbackReport =
    phase === "completion" &&
    riskyTask &&
    reportArtifactFiles.length > 0 &&
    hasDeterministicFallbackReport(task, reportText);
  const implementationToolActivityCount = countLatestImplementationToolActivity(
    task.agentActivityLog,
  );
  const implementationToolActivityTotal = countImplementationToolActivity(task.agentActivityLog);
  const reviewStageToolActivityCount = countReviewStageRepositoryToolActivity(
    task.agentActivityLog,
  );
  const taskReferencedPaths = extractReferencedPaths(combinedTaskText(task), projectRoot);
  const reportReferencedPaths = [
    ...new Set([
      ...extractReferencedPaths(reportClassificationText, projectRoot, {
        includeUndelimitedMissingRootFiles: true,
      }),
      ...extractDirectoryLineReferences(reportClassificationText, projectRoot),
    ]),
  ].sort();
  const referencedPaths = [...new Set([...taskReferencedPaths, ...reportReferencedPaths])].sort();
  const { existing, missing } = classifyReferencedPaths(
    projectRoot,
    referencedPaths,
    allowedEvidenceArtifactPaths,
  );
  const { existing: reportExisting, missing: reportMissing } = classifyReferencedPaths(
    projectRoot,
    reportReferencedPaths,
    allowedEvidenceArtifactPaths,
  );
  const auditReportValidation = validateAuditReportArtifact({
    text: reportText,
    projectRoot,
    taskId: task.id,
    roadmapBatchId: task.roadmapBatchId,
    roadmapAlias: task.roadmapAlias,
    auditPlanId: task.auditPlanId,
    taskDescription: task.description,
    reportArtifactPaths: reportArtifactFiles,
    expectedReportArtifactPath,
    allowedEvidenceArtifactPaths: [...allowedEvidenceArtifactPaths],
    requireProposedFix: /\bProposed fix\s*:/i.test(combinedTaskText(task)),
    expectedSourceSnapshot,
    auditEvidenceUnits: hasReportArtifactForValidation ? input.auditEvidenceUnits : undefined,
    requireLedgerEvidence: hasReportArtifactForValidation && effectiveRequireAuditLedgerEvidence,
  });
  const lifecycleArtifactPath = reportArtifactFiles[0] ?? null;
  const requiresAuditArtifactLifecycle =
    phase === "completion" &&
    lifecycleArtifactPath != null &&
    (auditTrustMode === "trusted_artifact" ||
      task.auditArtifactRole === "report" ||
      task.auditArtifactRole === "synthesis" ||
      task.roadmapBatchId != null);
  const auditArtifactLifecycle = requiresAuditArtifactLifecycle
    ? verifyAuditArtifactLifecycle({
        text: reportText,
        projectRoot,
        taskId: task.id,
        roadmapBatchId: task.roadmapBatchId,
        roadmapAlias: task.roadmapAlias,
        auditPlanId: task.auditPlanId,
        taskDescription: task.description,
        reportArtifactPaths: [lifecycleArtifactPath],
        expectedReportArtifactPath: lifecycleArtifactPath,
        allowedEvidenceArtifactPaths: [...allowedEvidenceArtifactPaths],
        requireProposedFix: /\bProposed fix\s*:/i.test(combinedTaskText(task)),
        expectedSourceSnapshot,
        auditEvidenceUnits: hasReportArtifactForValidation ? input.auditEvidenceUnits : undefined,
        requireLedgerEvidence: effectiveRequireAuditLedgerEvidence,
        artifactPath: lifecycleArtifactPath,
        worktreeValidation: auditReportValidation,
      })
    : null;
  const auditSynthesisTask = task.auditArtifactRole === "synthesis";
  const auditSynthesisOutcome =
    riskyTask && auditSynthesisTask && reportText.trim()
      ? classifyAuditSynthesisOutput({
          text: reportText,
          projectRoot,
          artifactPath: lifecycleArtifactPath,
          taskId: task.id,
          roadmapBatchId: task.roadmapBatchId,
          roadmapAlias: task.roadmapAlias,
          auditPlanId: task.auditPlanId,
          auditEvidenceUnits: hasReportArtifactForValidation ? input.auditEvidenceUnits : undefined,
        })
      : null;
  const terminalAuditInconclusiveSynthesis =
    auditSynthesisTask &&
    (auditSynthesisOutcome?.kind === "source_inconclusive" ||
      auditSynthesisOutcome?.kind === "inconclusive_batch_evidence") &&
    hasExplicitAuditInconclusiveSynthesisConclusion({
      text: reportText,
      projectRoot,
      auditReportValidation,
    });
  const ledgerOrManifestBlockingIssues = auditReportValidation.issues.filter((entry) =>
    isLedgerOrManifestValidationIssue(entry.code),
  );
  const validatorEvidenceBlockingIssues = auditReportValidation.issues.filter(
    (entry) =>
      [
        "malformed_report_artifact",
        "invalid_line_reference",
        "missing_declared_scope_root",
        "missing_scope_coverage",
        "shallow_evidence",
        "inventory_only_evidence",
        "irrelevant_grep_match",
        "insufficient_scope_depth",
        "reused_generic_evidence",
        "self_reported_command_output",
      ].includes(entry.code) ||
      (entry.code === "missing_substantive_evidence" &&
        !terminalAuditInconclusiveSynthesis &&
        (auditReportValidation.scopeRoots.length > 0 ||
          auditReportValidation.sourceClassification === "inventory_only_invalid")) ||
      ledgerOrManifestBlockingIssues.some((issue) => issue.code === entry.code),
  );
  const legacySubstantiveReportEvidence = hasSubstantiveReportEvidence({
    text: reportClassificationText,
    projectRoot,
    existingReferencedPaths: reportExisting,
    excludedReferencedPaths: reportArtifactFiles,
    allowedEvidenceArtifactPaths: [...allowedEvidenceArtifactPaths],
    requireProposedFix: /\bProposed fix\s*:/i.test(combinedTaskText(task)),
  });
  const trustedAuditArtifact = hasTrustedAuditArtifactProof({
    requireAuditLedgerEvidence: input.requireAuditLedgerEvidence,
    auditReportValidation,
    auditArtifactLifecycle,
  });
  const substantiveReportEvidence =
    auditTrustMode === "trusted_artifact"
      ? trustedAuditArtifact
      : validatorEvidenceBlockingIssues.length === 0 &&
        (auditReportValidation.substantiveEvidence || legacySubstantiveReportEvidence);
  const reportQualityIssues = [
    ...new Set([
      ...collectLowQualityReportEvidenceIssues(reportClassificationText, projectRoot),
      ...auditReportValidation.reportQualityIssues,
    ]),
  ].sort();
  const committedSubstantiveReportAvailable =
    reportArtifactFiles.length > 0 &&
    uncommittedReportArtifactFiles.length === 0 &&
    substantiveReportEvidence;

  const issues: TaskCompletionEvidenceIssue[] = [];
  if (input.branchIsolationReason) {
    issues.push(issue("branch_isolation", input.branchIsolationReason));
  }
  if (genericPlan) {
    issues.push(
      issue("generic_plan", "Task plan looks like placeholder or generic planner output."),
    );
  }
  for (const planIssue of preImplementationPlanQuality?.issues ?? []) {
    if (!includeAllPreImplementationPlanIssues && planIssue.code !== "task_size_split_required") {
      continue;
    }
    issues.push(issue(planIssue.code, planIssue.message));
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
    if (
      auditArtifactLifecycle?.issues.some((entry) => entry.code === "audit_artifact_uncommitted")
    ) {
      issues.push(
        issue(
          "audit_artifact_uncommitted",
          `Audit artifact ${auditArtifactLifecycle.artifactPath ?? "(unknown)"} must be committed cleanly before it can be trusted valid.`,
        ),
      );
    }
    if (auditArtifactLifecycle?.issues.some((entry) => entry.code === "committed_blob_mismatch")) {
      issues.push(
        issue(
          "committed_blob_mismatch",
          `Committed audit artifact blob for ${auditArtifactLifecycle.artifactPath ?? "(unknown)"} differs from the validated worktree artifact.`,
        ),
      );
    }
    for (const validationIssue of auditArtifactLifecycle?.issues ?? []) {
      if (
        validationIssue.code === "audit_artifact_uncommitted" ||
        validationIssue.code === "committed_blob_mismatch"
      ) {
        continue;
      }
      issues.push(issue(validationIssue.code, validationIssue.message));
    }
    if (deterministicFallbackReport) {
      issues.push(
        issue(
          "deterministic_fallback_report",
          "Audit/review/discovery completion cannot rely on the deterministic inventory fallback report as the final artifact.",
        ),
      );
    }
    if (
      auditSynthesisOutcome?.kind === "source_inconclusive" ||
      auditSynthesisOutcome?.kind === "inconclusive_batch_evidence"
    ) {
      issues.push(
        issue("audit_inconclusive", `Audit inconclusive: ${auditSynthesisOutcome.reason}`),
      );
    }
    if (unexpectedNonReportChangedFiles.length > 0) {
      issues.push(
        issue(
          "unexpected_non_report_changes",
          `Audit/review/discovery tasks with a declared report artifact may only change that report artifact. Unexpected changed files: ${unexpectedNonReportChangedFiles.join(", ")}.`,
        ),
      );
    }
    if (
      riskyTask &&
      implementationToolActivityCount === 0 &&
      !(committedSubstantiveReportAvailable && implementationToolActivityTotal > 0)
    ) {
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
          "Audit/review/discovery tasks require repository tool activity during review-sidecar, security-sidecar, specialized reviewer, aif-review, aif-security-checklist, or review-gate validation.",
        ),
      );
    }

    let invalidEvidenceMessage: string | null = null;
    if (reportMissing.length > 0) {
      invalidEvidenceMessage = `Report artifact contains repository path references that do not resolve under the project root: ${formatPathExamples(reportMissing)}. Replace them with concrete existing file paths and line references, or remove unsupported citations.`;
    } else if (
      auditReportValidation.issues.some((entry) => entry.code === "missing_declared_scope_root")
    ) {
      invalidEvidenceMessage = auditReportValidation.issues
        .filter((entry) => entry.code === "missing_declared_scope_root")
        .map((entry) => entry.message)
        .join(" ");
    } else if (riskyTask && reportArtifactFiles.length > 0 && reportReferencedPaths.length === 0) {
      invalidEvidenceMessage =
        "Audit/review/discovery report artifact does not cite any repository file references to validate. Add concrete existing file references such as `path/to/file.ext:line`.";
    } else if (referencedPaths.length > 0 && missing.length > 0 && existing.length === 0) {
      invalidEvidenceMessage = `Repository path references in task evidence do not resolve under the project root: ${formatPathExamples(missing)}. Replace them with concrete existing file paths and line references, or remove unsupported citations.`;
    }

    if (invalidEvidenceMessage) {
      issues.push(issue("invalid_or_missing_file_references", invalidEvidenceMessage));
    }
    for (const validationIssue of ledgerOrManifestBlockingIssues) {
      issues.push(issue(validationIssue.code, validationIssue.message));
    }
    if (
      auditTrustMode === "trusted_artifact" &&
      hasReportArtifactForValidation &&
      input.requireAuditLedgerEvidence !== true &&
      !issues.some((entry) => entry.code === "missing_audit_evidence_ref")
    ) {
      issues.push(
        issue(
          "missing_audit_evidence_ref",
          "Trusted audit artifact mode requires ledger-backed audit evidence to be enabled.",
        ),
      );
    }
    for (const validationIssue of validatorEvidenceBlockingIssues.filter(
      (entry) => entry.code === "malformed_report_artifact",
    )) {
      issues.push(issue(validationIssue.code, validationIssue.message));
    }
    if (
      auditTrustMode === "trusted_artifact" &&
      legacySubstantiveReportEvidence &&
      !trustedAuditArtifact
    ) {
      issues.push(
        issue(
          "legacy_text_evidence_untrusted",
          "Legacy text-only audit evidence is diagnostic only and cannot satisfy trusted audit artifact completion.",
        ),
      );
    }
    if (
      riskyTask &&
      reportArtifactFiles.length > 0 &&
      reportMissing.length === 0 &&
      reportReferencedPaths.length > 0 &&
      !terminalAuditInconclusiveSynthesis &&
      !substantiveReportEvidence
    ) {
      const scopeCoverageDetails = auditReportValidation.issues
        .filter((entry) => entry.code === "missing_scope_coverage")
        .map((entry) => entry.message)
        .join(" ");
      issues.push(
        issue(
          "insufficient_report_evidence",
          scopeCoverageDetails ||
            "Audit/review/discovery report artifact lacks substantive evidence markers such as path+line references, symbol references tied to files, command output, or structured findings with evidence/risk/verification.",
        ),
      );
    }
    if (
      (riskyTask && reportQualityIssues.length > 0) ||
      ledgerOrManifestBlockingIssues.length > 0
    ) {
      issues.push(
        issue(
          "low_quality_report_evidence",
          `Audit/review/discovery report artifact contains low-quality or unverified evidence: ${[
            ...new Set([
              ...reportQualityIssues,
              ...ledgerOrManifestBlockingIssues.map((entry) => entry.message),
            ]),
          ]
            .sort()
            .join(" ")}`,
        ),
      );
    }
  }
  for (const policyIssue of intentPolicyResult?.issues ?? []) {
    issues.push(issue(policyIssue.code, policyIssue.message));
  }
  for (const manifestIssue of implementationManifestValidation?.issues ?? []) {
    issues.push(issue(manifestIssue.code, manifestIssue.message));
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
      unexpectedNonReportChangedFiles,
      reportArtifactFiles,
      committedReportRequired,
      uncommittedReportArtifactFiles,
      deterministicFallbackReport,
      implementationToolActivityCount,
      reviewStageToolActivityCount,
      auditTrustMode,
      substantiveReportEvidence,
      legacySubstantiveReportEvidence,
      trustedAuditArtifact,
      reportQualityIssues,
      referencedPaths,
      missingReferencedPaths: missing,
      existingReferencedPaths: existing,
      reportReferencedPaths,
      missingReportReferencedPaths: reportMissing,
      existingReportReferencedPaths: reportExisting,
      auditReportValidation,
      auditArtifactLifecycle,
      auditSynthesisOutcome,
      expectedReportArtifactPath,
      intentPolicyIssues: intentPolicyResult?.issues ?? [],
      implementationManifestValidation,
    },
  };
}

export function formatTaskCompletionBlockedReason(
  result: TaskCompletionEvidenceResult,
  options: { suppressManualReviewWhenActionable?: boolean } = {},
): string {
  const actionableIssues =
    options.suppressManualReviewWhenActionable && result.issues.length > 1
      ? result.issues.filter((entry) => entry.code !== "manual_review_required")
      : result.issues;
  const issues = actionableIssues.length > 0 ? actionableIssues : result.issues;
  const codes = [...new Set(issues.map((entry) => entry.code))];
  const details = issues.map((entry) => entry.message);
  return `Completion evidence guard (${codes.join(", ")}): ${details.join(" ")}`;
}
