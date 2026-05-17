import {
  TASK_INTENT_CONTRACTS,
  TASK_INTENTS,
  type InferTaskIntentInput,
  type ResolvedTaskIntentDefaults,
  type TaskIntent,
  type TaskIntentContract,
  type TaskIntentPolicy,
  type ValidateGeneratedTaskIntentInput,
  type ValidateGeneratedTaskIntentResult,
} from "./taskIntentContracts.js";
import {
  isAuditReportArtifactPath,
  parseExpectedAuditReportArtifactPath,
} from "./auditRoadmapContract.js";
import { validateGeneratedWorkflowTask } from "./workflowPacks.js";

export {
  TASK_INTENT_CONTRACTS,
  TASK_INTENTS,
  type InferTaskIntentInput,
  type ResolvedTaskIntentDefaults,
  type TaskIntent,
  type TaskIntentContract,
  type TaskIntentDefaults,
  type TaskIntentPolicy,
  type TaskIntentUseSubagentsDefault,
  type ValidateGeneratedTaskIntentInput,
  type ValidateGeneratedTaskIntentResult,
} from "./taskIntentContracts.js";

export interface ValidateTaskIntentChangedFilesTask extends InferTaskIntentInput {
  plan?: string | null;
  implementationLog?: string | null;
  reviewComments?: string | null;
  agentActivityLog?: string | null;
  expectedReportArtifactPath?: string | null;
}

export interface ValidateTaskIntentChangedFilesInput {
  task: ValidateTaskIntentChangedFilesTask;
  changedFiles: string[];
  meaningfulChangedFiles?: string[];
}

export interface TaskIntentChangedFilesIssue {
  code: "intent_changed_files_contradiction";
  message: string;
  files: string[];
}

export interface ValidateTaskIntentChangedFilesResult {
  ok: boolean;
  intent: TaskIntent;
  issues: TaskIntentChangedFilesIssue[];
}

export function isTaskIntent(value: unknown): value is TaskIntent {
  return typeof value === "string" && TASK_INTENTS.includes(value as TaskIntent);
}

export function normalizeTaskIntent(
  value: string | null | undefined,
  fallback: TaskIntent = "general",
): TaskIntent {
  return isTaskIntent(value) ? value : fallback;
}

function parseTags(tags: InferTaskIntentInput["tags"]): string[] {
  if (Array.isArray(tags)) return tags.filter((tag) => typeof tag === "string");
  if (!tags) return [];
  try {
    const parsed: unknown = JSON.parse(tags);
    if (Array.isArray(parsed)) {
      return parsed.filter((tag): tag is string => typeof tag === "string");
    }
  } catch {
    // Fall back to splitting user-entered tag text.
  }
  return String(tags)
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function combinedIntentText(input: InferTaskIntentInput): string {
  return [input.title, input.description, input.roadmapAlias, ...parseTags(input.tags)]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

export function inferTaskIntent(input: InferTaskIntentInput): TaskIntent {
  if (input.isFix === true) return "fix";
  if (isTaskIntent(input.taskIntent)) return input.taskIntent;

  const text = combinedIntentText(input);
  if (!text) return "general";
  if (
    /\b(audit|auditing|diagnostic|diagnostics|discovery|inventory|gap[-\s]?analysis|code review|security review|findings|validation report|verification report)\b/i.test(
      text,
    ) ||
    text.includes("\u0430\u0443\u0434\u0438\u0442")
  ) {
    return "audit";
  }
  if (
    /\b(fix|bug|defect|regression|broken|debug|repair|not working|fails?|failure)\b/i.test(text)
  ) {
    return "fix";
  }
  if (
    /\b(spike|research|investigate|prototype|proof[-\s]?of[-\s]?concept|poc|explore)\b/i.test(text)
  ) {
    return "spike";
  }
  if (/\b(docs?|documentation|readme|runbook|guide|manual|changelog)\b/i.test(text)) {
    return "docs";
  }
  if (/\b(tests?|testing|coverage|specs?|regression suite|vitest|jest|e2e)\b/i.test(text)) {
    return "tests";
  }
  if (/\b(feature|implement|build|add|create|support|enable|enhancement)\b/i.test(text)) {
    return "feature";
  }
  return "general";
}

export function resolveTaskIntentDefaults(
  intent: TaskIntent,
  options: { envUseSubagents?: boolean } = {},
): ResolvedTaskIntentDefaults {
  const defaults = TASK_INTENT_CONTRACTS[intent].defaults;
  return {
    plannerMode: defaults.plannerMode,
    skipReview: defaults.skipReview,
    planDocs: defaults.planDocs,
    planTests: defaults.planTests,
    isFix: defaults.isFix,
    useSubagents:
      defaults.useSubagents === "env" ? (options.envUseSubagents ?? false) : defaults.useSubagents,
  };
}

export function getTaskIntentContract(intent: TaskIntent): TaskIntentContract {
  return TASK_INTENT_CONTRACTS[intent];
}

export function getTaskIntentPolicy(intent: TaskIntent): TaskIntentPolicy {
  return getTaskIntentContract(intent).policy;
}

function formatSentenceList(values: string[]): string {
  return values.length > 0 ? values.join("; ") : "none";
}

export function formatTaskIntentContractForPrompt(intent: TaskIntent): string {
  const contract = TASK_INTENT_CONTRACTS[intent];
  const policy = contract.policy;
  return [
    `Task intent: ${contract.intent} (${contract.label})`,
    `Decomposition: ${contract.decomposition}`,
    `Allowed changes: ${policy.allowedChanges.summary}`,
    `Forbidden changes: ${policy.forbiddenChanges.summary}`,
    `Expected artifacts: ${formatSentenceList(policy.expectedArtifacts.primary)}`,
    `Optional artifacts: ${formatSentenceList(policy.expectedArtifacts.optional)}`,
    `Verification requirements: ${formatSentenceList(policy.verificationRequirements)}`,
    `Memory rules: ${policy.memoryRules.summary}`,
    `Review rules: ${policy.reviewRules.summary}`,
    `Required gates: ${contract.requiredGates.join(", ")}`,
    contract.hardConstraints.length > 0
      ? `Hard constraints: ${contract.hardConstraints.join("; ")}`
      : "Hard constraints: none",
    `Planning guidance: ${contract.planningPrompt}`,
    `Implementation guidance: ${contract.implementationPrompt}`,
  ].join("\n");
}

export function formatTaskIntentPrimaryConstraints(intent: TaskIntent): string {
  const contract = TASK_INTENT_CONTRACTS[intent];
  const policy = contract.policy;
  return [
    `${contract.label}`,
    `Allowed: ${policy.allowedChanges.summary}`,
    `Forbidden: ${policy.forbiddenChanges.summary}`,
    `Expected: ${formatSentenceList(policy.expectedArtifacts.primary)}`,
  ].join(" | ");
}

export function formatTaskIntentOptionsForPrompt(): string {
  return TASK_INTENTS.map((intent) => {
    const contract = TASK_INTENT_CONTRACTS[intent];
    return [
      `- ${intent} (${contract.label}): ${contract.decomposition}`,
      `Allowed: ${contract.policy.allowedChanges.summary}`,
      `Forbidden: ${contract.policy.forbiddenChanges.summary}`,
      `Expected artifacts: ${formatSentenceList(contract.policy.expectedArtifacts.primary)}`,
    ].join(" ");
  }).join("\n");
}

function normalizeChangedFile(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .toLowerCase();
}

type ChangedFileCategory = "docs" | "tests" | "config" | "report" | "source";

function isReportPath(path: string): boolean {
  const normalized = normalizeChangedFile(path);
  return (
    normalized.startsWith("audit/") ||
    normalized.startsWith("reports/") ||
    /(^|\/)(audit|review|verification)-?reports?\//i.test(normalized)
  );
}

function isDocumentationPath(path: string): boolean {
  const normalized = normalizeChangedFile(path);
  return (
    normalized.startsWith("docs/") ||
    /(^|\/)(readme|changelog|license|contributing|runbook)(\.[\w.-]+)?$/i.test(normalized) ||
    /\.(md|mdx|rst|txt)$/i.test(normalized)
  );
}

function isTestOrFixturePath(path: string): boolean {
  const normalized = normalizeChangedFile(path);
  return (
    /(^|\/)(__tests__|tests?|fixtures|testdata)(\/|$)/i.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(normalized)
  );
}

function isConfigPath(path: string): boolean {
  const normalized = normalizeChangedFile(path);
  return (
    /(^|\/)(package|package-lock|pnpm-lock|yarn.lock|bun.lockb)(\.json)?$/i.test(normalized) ||
    /(^|\/)(tsconfig|eslint|prettier|vitest|vite|jest|playwright|turbo)\.[\w.-]+$/i.test(
      normalized,
    ) ||
    /(^|\/)\.?[\w.-]+rc(\.[\w.-]+)?$/i.test(normalized) ||
    /(^|\/)(config|configs)\//i.test(normalized) ||
    /\.(?:jsonc?|ya?ml|toml|ini|env)$/i.test(normalized)
  );
}

function changedFileCategory(path: string): ChangedFileCategory {
  if (isReportPath(path)) return "report";
  if (isTestOrFixturePath(path)) return "tests";
  if (isDocumentationPath(path)) return "docs";
  if (isConfigPath(path)) return "config";
  return "source";
}

function preImplementationPolicyText(task: ValidateTaskIntentChangedFilesTask): string {
  return [task.title, task.description, task.roadmapAlias, task.plan]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
}

function policyClauses(text: string): string[] {
  return text
    .split(/[\r\n.;]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function prohibitsSupportEdits(text: string): boolean {
  return (
    /\b(?:no|without|never)\s+(?:source|code|test|config|implementation)\s+(?:edits?|changes?)\b/i.test(
      text,
    ) ||
    /\b(?:no|without|never)\s+(?:changing|modifying|touching|editing)\s+(?:source(?:\s+code)?|code|test(?:s|ing)?|fixture(?:s)?|config(?:uration)?|settings?|implementation)\b/i.test(
      text,
    ) ||
    /\b(?:do\s+not|don't|must\s+not|should\s+not|shall\s+not|cannot|can't|never)\b[^\n.]{0,120}\b(?:source|code|test|config|implementation)\s+(?:edits?|changes?)\b/i.test(
      text,
    ) ||
    /\b(?:do\s+not|don't|must\s+not|should\s+not|shall\s+not|cannot|can't|never)\b[^\n.]{0,120}\b(?:change|modify|touch|edit)\s+(?:source(?:\s+code)?|code|test(?:s|ing)?|fixture(?:s)?|config(?:uration)?|settings?|implementation)\b/i.test(
      text,
    ) ||
    /\b(?:do\s+not|don't|must\s+not|should\s+not|shall\s+not|cannot|can't|never)\b[^\n.]{0,120}\bmake\s+(?:any\s+)?(?:edits?|changes?|modifications?)\s+to\s+(?:source(?:\s+code)?|code|test(?:s|ing)?|fixture(?:s)?|config(?:uration)?|settings?|implementation)\b/i.test(
      text,
    ) ||
    /\b(?:source|code|test|config|implementation)\s+(?:edits?|changes?)\b[^\n.]{0,120}\b(?:forbidden|prohibited|disallowed|not\s+(?:allowed|permitted|required|needed))\b/i.test(
      text,
    ) ||
    /\b(?:edits?|changes?|modifications?)\s+to\s+(?:source(?:\s+code)?|code|test(?:s|ing)?|fixture(?:s)?|config(?:uration)?|settings?|implementation)\b[^\n.]{0,120}\b(?:forbidden|prohibited|disallowed|not\s+(?:allowed|permitted|required|needed))\b/i.test(
      text,
    ) ||
    /\b(?:forbidden|prohibited|disallowed)\b[^\n.]{0,120}\b(?:source|code|test|config|implementation)\s+(?:edits?|changes?)\b/i.test(
      text,
    )
  );
}

function categoryTerms(clause: string): Set<ChangedFileCategory> {
  const categories = new Set<ChangedFileCategory>();
  if (/\b(?:source|code|implementation)\b/i.test(clause)) categories.add("source");
  if (/\b(?:test|tests|testing|coverage|regression|fixtures?)\b/i.test(clause)) {
    categories.add("tests");
  }
  if (/\b(?:config|configuration|settings?|package\.json|lockfile)\b/i.test(clause)) {
    categories.add("config");
  }
  if (/\b(?:docs?|documentation|examples?)\b/i.test(clause)) categories.add("docs");
  if (/\b(?:reports?|audit)\b/i.test(clause)) categories.add("report");
  return categories;
}

function docsSupportCategories(text: string): Set<ChangedFileCategory> {
  const categories = new Set<ChangedFileCategory>();
  for (const clause of policyClauses(text)) {
    if (prohibitsSupportEdits(clause)) continue;
    const affirmative =
      /\b(?:source|code|test|config|implementation)\b[^\n.]{0,120}\b(?:docs?|documentation|examples?)\s+correctness\b|\b(?:docs?|documentation|examples?)\s+correctness\b[^\n.]{0,120}\b(?:source|code|test|config|implementation)\b|\b(?:support|supporting)\s+(?:source|code|test|config)\s+(?:edits?|changes?)\s+(?:for|to)\s+(?:docs?|documentation)\b/i.test(
        clause,
      );
    if (!affirmative) continue;
    for (const category of categoryTerms(clause)) {
      if (category !== "docs") categories.add(category);
    }
  }
  return categories;
}

function testSupportCategories(text: string): Set<ChangedFileCategory> {
  const categories = new Set<ChangedFileCategory>();
  for (const clause of policyClauses(text)) {
    if (prohibitsSupportEdits(clause)) continue;
    const affirmative =
      /\b(?:testability\s+hooks?|minimal\s+source\s+changes?|source\s+changes?|supporting\s+source\s+edits?|docs?\s+updates?|documentation\s+updates?|config(?:uration)?\s+changes?)\b[^\n.]{0,120}\b(?:test|tests|testing|coverage|regression)\b|\b(?:test|tests|testing|coverage|regression)\b[^\n.]{0,120}\b(?:testability\s+hooks?|minimal\s+source\s+changes?|source\s+changes?|supporting\s+source\s+edits?|docs?\s+updates?|documentation\s+updates?|config(?:uration)?\s+changes?)\b/i.test(
        clause,
      );
    if (!affirmative) continue;
    for (const category of categoryTerms(clause)) {
      if (category !== "tests") categories.add(category);
    }
  }
  return categories;
}

const POLICY_PATH_PATTERN =
  /(?:^|[\s`'"\[(])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+\.(?:jsonc|json|jsx|tsx|yaml|yml|mdx|mjs|cjs|css|html|md|ps1|py|rs|scss|sh|sql|toml|txt|xml|js|ts|go|c|h))(?:[:]\d+(?::\d+)?)?/gi;

function normalizePolicyPath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/[),.;\]]+$/g, "");
}

function normalizeExactPolicyPath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/[),.;\]]+$/g, "");
}

function extractPolicyPaths(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(POLICY_PATH_PATTERN)].map((match) => normalizePolicyPath(match[1] ?? "")),
    ),
  ]
    .filter(Boolean)
    .sort();
}

function prohibitsSpikeProofOfConceptArtifact(text: string): boolean {
  const pocTerm = String.raw`(?:proof[-\s]?of[-\s]?concept|poc|prototype)`;
  const artifactTerm = String.raw`(?:artifact|file|path|implementation)`;
  const createVerb = String.raw`(?:create|add|write|implement|make|touch|modify|edit)`;
  return (
    new RegExp(
      String.raw`\b(?:no|without|never)\b[^\n]{0,80}\b${pocTerm}\b[^\n]{0,80}\b${artifactTerm}\b`,
      "i",
    ).test(text) ||
    new RegExp(
      String.raw`\b(?:no|without|never)\b[^\n]{0,80}\b${artifactTerm}\b[^\n]{0,80}\b${pocTerm}\b`,
      "i",
    ).test(text) ||
    new RegExp(
      String.raw`\b(?:do\s+not|don't|must\s+not|should\s+not|shall\s+not|cannot|can't|never)\b[^\n]{0,120}\b${createVerb}\b[^\n]{0,80}\b${pocTerm}\b[^\n]{0,80}\b${artifactTerm}\b`,
      "i",
    ).test(text) ||
    new RegExp(
      String.raw`\b(?:do\s+not|don't|must\s+not|should\s+not|shall\s+not|cannot|can't|never)\b[^\n]{0,120}\b${createVerb}\b[^\n]{0,80}\b${artifactTerm}\b[^\n]{0,80}\b${pocTerm}\b`,
      "i",
    ).test(text) ||
    new RegExp(
      String.raw`\b${pocTerm}\b[^\n]{0,80}\b${artifactTerm}\b[^\n]{0,120}\b(?:forbidden|prohibited|disallowed|not\s+(?:allowed|permitted|required|needed))\b`,
      "i",
    ).test(text) ||
    new RegExp(
      String.raw`\b${artifactTerm}\b[^\n]{0,80}\b${pocTerm}\b[^\n]{0,120}\b(?:forbidden|prohibited|disallowed|not\s+(?:allowed|permitted|required|needed))\b`,
      "i",
    ).test(text) ||
    new RegExp(
      String.raw`\b(?:forbidden|prohibited|disallowed)\b[^\n]{0,120}\b${pocTerm}\b[^\n]{0,80}\b${artifactTerm}\b`,
      "i",
    ).test(text)
  );
}

function extractSpikeProofOfConceptArtifactPaths(text: string): string[] {
  const paths = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (prohibitsSpikeProofOfConceptArtifact(line)) continue;
    if (!/\b(?:proof[-\s]?of[-\s]?concept|poc|prototype)\b/i.test(line)) continue;
    if (!/\b(?:artifact|file|path)\b/i.test(line)) continue;
    for (const path of extractPolicyPaths(line)) {
      paths.add(path);
    }
  }
  return [...paths].sort();
}

function pathSetsInclude(paths: string[], file: string): boolean {
  const normalizedFile = normalizeExactPolicyPath(file);
  return paths.some((path) => normalizeExactPolicyPath(path) === normalizedFile);
}

function reportArtifactPathMatches(expectedPath: string, file: string): boolean {
  return (
    normalizePolicyPath(expectedPath).toLowerCase() === normalizePolicyPath(file).toLowerCase()
  );
}

function issue(message: string, files: string[]): TaskIntentChangedFilesIssue {
  return { code: "intent_changed_files_contradiction", message, files };
}

export function validateTaskIntentChangedFiles(
  input: ValidateTaskIntentChangedFilesInput,
): ValidateTaskIntentChangedFilesResult {
  const intent = inferTaskIntent(input.task);
  const files = [...new Set(input.meaningfulChangedFiles ?? input.changedFiles)]
    .map((file) => file.trim())
    .filter(Boolean)
    .sort();
  const text = preImplementationPolicyText(input.task);
  const issues: TaskIntentChangedFilesIssue[] = [];

  if (files.length === 0) {
    return { ok: true, intent, issues };
  }

  const rule = getTaskIntentPolicy(intent).completion.changedFileRule;

  if (rule === "audit_report_only") {
    const expectedReportArtifactPath =
      input.task.expectedReportArtifactPath ?? parseExpectedAuditReportArtifactPath(text);
    const contradictory = files.filter((file) =>
      expectedReportArtifactPath
        ? !reportArtifactPathMatches(expectedReportArtifactPath, file)
        : !isAuditReportArtifactPath(file),
    );
    if (contradictory.length > 0) {
      issues.push(
        issue(
          expectedReportArtifactPath
            ? `Audit intent permits only the declared report artifact ${expectedReportArtifactPath}. Contradictory files: ${contradictory.join(", ")}.`
            : `Audit intent permits audit report artifact changes only. Contradictory files: ${contradictory.join(", ")}.`,
          contradictory,
        ),
      );
    }
  } else if (rule === "docs_only") {
    const allowedSupportCategories = docsSupportCategories(text);
    const contradictory = files.filter((file) => {
      const category = changedFileCategory(file);
      return category !== "docs" && !allowedSupportCategories.has(category);
    });
    if (contradictory.length > 0) {
      issues.push(
        issue(
          `Docs intent permits documentation changes only unless the task context explicitly requires support edits for docs correctness. Contradictory files: ${contradictory.join(", ")}.`,
          contradictory,
        ),
      );
    }
  } else if (rule === "tests_only") {
    const allowedSupportCategories = testSupportCategories(text);
    const contradictory = files.filter((file) => {
      const category = changedFileCategory(file);
      return category !== "tests" && !allowedSupportCategories.has(category);
    });
    if (contradictory.length > 0) {
      issues.push(
        issue(
          `Tests intent permits test and fixture changes only unless the task context explicitly justifies support edits. Contradictory files: ${contradictory.join(", ")}.`,
          contradictory,
        ),
      );
    }
  } else if (rule === "research_only") {
    const pocArtifactPaths = extractSpikeProofOfConceptArtifactPaths(text);
    const contradictory = files.filter(
      (file) => !isDocumentationPath(file) && !pathSetsInclude(pocArtifactPaths, file),
    );
    if (contradictory.length > 0) {
      issues.push(
        issue(
          `Spike intent permits research/design artifacts only unless a proof-of-concept artifact path is explicitly named. Contradictory files: ${contradictory.join(", ")}.`,
          contradictory,
        ),
      );
    }
  }

  return { ok: issues.length === 0, intent, issues };
}

export function validateGeneratedTaskIntent(
  input: ValidateGeneratedTaskIntentInput,
): ValidateGeneratedTaskIntentResult {
  return validateGeneratedWorkflowTask(input);
}
