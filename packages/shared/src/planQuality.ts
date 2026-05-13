import { inferTaskIntent, isTaskIntent, type TaskIntent } from "./taskIntent.js";
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
] as const;

export type TaskPlanQualityIssueCode = (typeof TASK_PLAN_QUALITY_ISSUE_CODES)[number];

export interface TaskPlanQualityTask {
  title: string;
  description?: string | null;
  taskIntent?: TaskIntent | null;
  tags?: string[] | string | null;
  roadmapAlias?: string | null;
  planPath?: string | null;
}

export interface TaskPlanQualityIssue {
  code: TaskPlanQualityIssueCode;
  message: string;
}

export interface TaskPlanQualityResult {
  ok: boolean;
  issues: TaskPlanQualityIssue[];
  categories: TaskPlanQualityIssueCode[];
}

export interface TaskPlanQualityInput {
  task: TaskPlanQualityTask;
  plan: string | null | undefined;
}

export interface DeterministicDiagnosticPlanInput {
  task: TaskPlanQualityTask;
  extraText?: Array<string | null | undefined>;
}

const CHECKLIST_PATTERN = /^\s*[-*]\s+\[(?: |x|X)\]\s+\S/m;
const CHECKLIST_ITEM_PATTERN = /^\s*[-*]\s+\[(?: |x|X)\]\s+(.+)$/gm;
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
const REPORT_ARTIFACT_LINE_PATTERN = /^\s*report artifact\s*:\s*(.+)$/gim;
const CONCRETE_SOURCE_ROOT_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:(?:packages|apps)\/[\w.@-]+(?:\/(?:src|test|tests|__tests__|config)(?:\/[\w.@-]+)*)?|(?:src|test|tests|__tests__|config|docs|scripts|lib|migrations|data)(?:\/[\w.@-]+)*))(?:[\s`'"),.;\]]|$)/gi;

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
  return (
    extractRepoPaths(` ${normalized}`).includes(normalized) ||
    extractConcreteSourceRoots(` ${normalized}`).includes(normalized)
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
  if (decomposition.requiresDecomposition && broadDecompositionReasons.length > 0) return null;

  const reportPath = findDeterministicDiagnosticReportPath(input);
  if (!reportPath) return null;

  const taskPaths = concreteAuditBoundariesFromText(taskText);
  if (taskPaths.length === 0) return null;

  const evidenceTargets = taskPaths;
  const taskPathText = formatInlinePaths(taskPaths);
  const evidenceTargetsText = formatInlinePaths(evidenceTargets);
  const evidenceStep =
    taskPaths.length > 0
      ? `- [ ] Inspect the task-specific paths ${taskPathText} and cite exact existing file paths for every finding.`
      : `- [ ] Inspect the scoped evidence needed for \`${reportPath}\` and cite exact existing file paths for every finding.`;

  const plan = [
    "## Diagnostic-only plan",
    "",
    `Report artifact: \`${reportPath}\``,
    `Scope: ${evidenceTargetsText}`,
    `Scoped evidence targets: ${evidenceTargetsText}`,
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

function hasAnyPlanPath(planPaths: string[], plan: string): boolean {
  const normalizedPlan = normalizePath(plan);
  return planPaths.some((path) => normalizedPlan.includes(path));
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

function hasSynthesisOnlyReportEvidenceTarget(plan: string): boolean {
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

  const nonReportPaths = [
    ...extractRepoPaths(boundaryText).filter((path) => !isAuditReportArtifactPath(path)),
    ...extractConcreteSourceRoots(boundaryText),
    ...parseAuditScopeRoots(plan).filter(isConcreteAuditBoundaryPath),
  ];
  return nonReportPaths.length === 0;
}

export function evaluateTaskPlanQuality(input: TaskPlanQualityInput): TaskPlanQualityResult {
  const plan = input.plan?.trim() ?? "";
  const taskText = combinedTaskText(input.task);
  const taskPaths = extractRepoPaths(taskText);
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

  if (!plan) {
    issues.push(issue("empty_plan", "Plan is empty."));
    return { ok: false, issues, categories: uniqueCategories(issues) };
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

    const missingEvidenceTargets = !AUDIT_EVIDENCE_TARGETS_PATTERN.test(plan);
    const missingExclusions = !AUDIT_EXCLUSIONS_PATTERN.test(plan);
    const missingReportStructure = !hasAuditReportStructure(plan);
    const hasNoChildDecision = AUDIT_NO_CHILD_REPORTS_PATTERN.test(plan);
    const hasDecompositionDecision = hasDecomposedAuditStructure(plan, reportPaths);
    const concreteAuditBoundaries = concreteAuditBoundariesFromText(
      [taskText, plan].filter(Boolean).join("\n"),
    );
    const hasSynthesisOnlyException = hasSynthesisOnlyReportEvidenceTarget(plan);
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
      decomposition.reasonCodes.some((reason) => reason !== "audit_without_concrete_boundaries");
    if (requiresBroadDecomposition && !hasDecompositionDecision) {
      issues.push(
        issue(
          "missing_audit_decomposition",
          `Broad audit task plan requires decomposed child/source reports plus synthesis before implementation. Classifier reasons: ${decomposition.reasonCodes.join(", ")}.`,
        ),
      );
    }
  }

  return { ok: issues.length === 0, issues, categories: uniqueCategories(issues) };
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
