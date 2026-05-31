import crypto from "node:crypto";
import * as data from "@aif/data";
import { createRuntimeWorkflowSpec } from "@aif/runtime";
import { logger } from "@aif/shared";
import { executeSubagentQuery } from "../subagentQuery.js";
import {
  formatRaiseQuestionsPromptGuidance,
  handleRaiseQuestionsOutput,
} from "./raiseQuestions.js";

const log = logger("qa-stage");

export type QaArtifactStatus = "passed" | "failed" | "blocked";
export type QaCheckStatus = "passed" | "failed" | "skipped";

export interface QaMandatoryInventoryItem {
  id: string;
  label?: string | null;
  description?: string | null;
  command?: string | null;
  source?: string | null;
  mandatory?: boolean | null;
  originalStatus?: string | null;
  outputSha256?: string | null;
  outputSummary?: string | null;
  blockingReason?: string | null;
}

export interface ParsedQaCheck {
  id: string;
  command: string | null;
  status: QaCheckStatus;
  summary: string;
  evidence: string | null;
  reason: string | null;
  risk: string | null;
}

export interface ParsedQaArtifactOutput {
  version: 1;
  stage: "qa";
  status: QaArtifactStatus;
  summary: string;
  markdown: string;
  mandatoryChecks: ParsedQaCheck[];
  optionalChecks: ParsedQaCheck[];
  limitations: string[];
  rollbackNotes: string[];
}

interface QaSourceContext {
  markdown: string;
  sourceSnapshotId: string | null;
  sourceFingerprint: string | null;
  mandatoryInventory: QaMandatoryInventoryItem[];
  helperMetadata: Record<string, unknown>;
}

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`aif-qa-artifact.${field} must be a non-empty string`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractQaArtifactJson(output: string): string {
  const matches = [...output.matchAll(/```[ \t]*aif-qa-artifact[^\r\n]*\r?\n([\s\S]*?)\r?\n```/gi)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one fenced aif-qa-artifact JSON block, found ${matches.length}`,
    );
  }
  return matches[0]?.[1]?.trim() ?? "";
}

export function normalizeQaMandatoryInventory(input: unknown): QaMandatoryInventoryItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.map((item, index) => {
    const rawId = typeof item === "string" ? item : isRecord(item) ? item.id : null;
    const id = readRequiredString(rawId, `mandatoryInventory[${index}].id`);
    if (seen.has(id)) {
      throw new Error(`aif-qa-artifact mandatory inventory contains duplicate id ${id}`);
    }
    seen.add(id);
    return {
      id,
      label: isRecord(item) ? readOptionalString(item.label) : null,
      description: isRecord(item) ? readOptionalString(item.description) : null,
      command: isRecord(item) ? readOptionalString(item.command) : null,
      source: isRecord(item) ? readOptionalString(item.source) : null,
      mandatory: isRecord(item) && item.mandatory === true ? true : null,
      originalStatus: isRecord(item) ? readOptionalString(item.originalStatus) : null,
      outputSha256: isRecord(item) ? readOptionalString(item.outputSha256) : null,
      outputSummary: isRecord(item) ? readOptionalString(item.outputSummary) : null,
      blockingReason: isRecord(item) ? readOptionalString(item.blockingReason) : null,
    };
  });
}

function parseQaChecks(
  value: unknown,
  field: "mandatoryChecks" | "optionalChecks",
): ParsedQaCheck[] {
  const rawChecks = Array.isArray(value) ? value : [];
  return rawChecks.map((check, index): ParsedQaCheck => {
    if (!isRecord(check)) throw new Error(`aif-qa-artifact.${field}[${index}] must be an object`);
    const status = check.status;
    if (status !== "passed" && status !== "failed" && status !== "skipped") {
      throw new Error(
        `aif-qa-artifact.${field}[${index}].status must be passed, failed, or skipped`,
      );
    }
    const checkStatus: QaCheckStatus = status;
    const parsed = {
      id: readRequiredString(check.id, `${field}[${index}].id`),
      command: readOptionalString(check.command),
      status: checkStatus,
      summary: readRequiredString(check.summary, `${field}[${index}].summary`),
      evidence: readOptionalString(check.evidence),
      reason: readOptionalString(check.reason),
      risk: readOptionalString(check.risk),
    };
    if (parsed.status === "skipped") {
      if (!parsed.reason) {
        throw new Error(`aif-qa-artifact.${field}[${index}].reason is required when skipped`);
      }
      if (!parsed.risk) {
        throw new Error(`aif-qa-artifact.${field}[${index}].risk is required when skipped`);
      }
    }
    return parsed;
  });
}

function validateMandatoryChecks(
  status: QaArtifactStatus,
  mandatoryInventory: QaMandatoryInventoryItem[],
  mandatoryChecks: ParsedQaCheck[],
): void {
  if (status === "passed" && mandatoryInventory.length === 0) {
    throw new Error("aif-qa-artifact passed output requires a non-empty mandatory inventory");
  }

  const inventoryIds = new Set(mandatoryInventory.map((item) => item.id));
  const seen = new Set<string>();
  for (const check of mandatoryChecks) {
    if (!inventoryIds.has(check.id)) {
      throw new Error(`aif-qa-artifact mandatoryChecks contains unknown mandatory id ${check.id}`);
    }
    if (seen.has(check.id)) {
      throw new Error(
        `aif-qa-artifact mandatoryChecks contains duplicate mandatory id ${check.id}`,
      );
    }
    seen.add(check.id);
  }

  if (status !== "passed") return;
  const unpassable = mandatoryInventory.filter(
    (item) => Boolean(item.blockingReason) || item.source === "completion_guard",
  );
  if (unpassable.length > 0) {
    throw new Error(
      `aif-qa-artifact passed output cannot satisfy blocked mandatory id(s): ${unpassable
        .map((item) => item.id)
        .join(", ")}`,
    );
  }
  const missing = mandatoryInventory.map((item) => item.id).filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(
      `aif-qa-artifact passed output is missing mandatory id(s): ${missing.join(", ")}`,
    );
  }
  const blocking = mandatoryChecks.filter((check) => check.status !== "passed");
  if (blocking.length > 0) {
    throw new Error(
      `aif-qa-artifact passed output has non-passed mandatory id(s): ${blocking
        .map((check) => check.id)
        .join(", ")}`,
    );
  }
}

function readStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`aif-qa-artifact.${field} must be an array`);
  return value.map((entry, index) => readRequiredString(entry, `${field}[${index}]`));
}

export function parseQaArtifactOutput(
  output: string,
  mandatoryInventoryInput: QaMandatoryInventoryItem[] | unknown,
): ParsedQaArtifactOutput {
  const mandatoryInventory = normalizeQaMandatoryInventory(mandatoryInventoryInput);
  const rawJson = extractQaArtifactJson(output);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(
      `aif-qa-artifact JSON is malformed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(parsed)) throw new Error("aif-qa-artifact must be a JSON object");
  if (parsed.version !== 1) throw new Error("aif-qa-artifact.version must be 1");
  if (parsed.stage !== "qa") throw new Error("aif-qa-artifact.stage must be qa");
  const status = parsed.status;
  if (status !== "passed" && status !== "failed" && status !== "blocked") {
    throw new Error("aif-qa-artifact.status must be passed, failed, or blocked");
  }

  const summary = readRequiredString(parsed.summary, "summary");
  const markdown = readRequiredString(parsed.markdown, "markdown");
  const mandatoryChecks = parseQaChecks(parsed.mandatoryChecks, "mandatoryChecks");
  const optionalChecks = parseQaChecks(parsed.optionalChecks, "optionalChecks");
  validateMandatoryChecks(status, mandatoryInventory, mandatoryChecks);
  const limitations = readStringArray(parsed.limitations, "limitations");
  const rollbackNotes = readStringArray(parsed.rollbackNotes, "rollbackNotes");

  return {
    version: 1,
    stage: "qa",
    status,
    summary,
    markdown,
    mandatoryChecks,
    optionalChecks,
    limitations,
    rollbackNotes,
  };
}

function summarizeDeterministicCheck(item: QaMandatoryInventoryItem): string {
  const label = item.label ?? item.id;
  const command = item.command ? ` Command: ${item.command}.` : "";
  const digest = item.outputSha256 ? ` Output sha256: ${item.outputSha256}.` : "";
  return `${label} passed in implementation manifest evidence.${command}${digest}`.trim();
}

export function synthesizeQaArtifactFromMandatoryInventory(input: {
  mandatoryInventory: QaMandatoryInventoryItem[];
  parserError: string;
}): ParsedQaArtifactOutput | null {
  if (input.mandatoryInventory.length === 0) return null;
  const unsupported = input.mandatoryInventory.find(
    (item) =>
      Boolean(item.blockingReason) ||
      item.source === "completion_guard" ||
      item.source !== "implementation_manifest" ||
      item.originalStatus !== "passed",
  );
  if (unsupported) return null;

  const mandatoryChecks = input.mandatoryInventory.map(
    (item): ParsedQaCheck => ({
      id: item.id,
      command: item.command ?? null,
      status: "passed",
      summary: summarizeDeterministicCheck(item),
      evidence: item.outputSha256
        ? `Implementation manifest recorded passed evidence with output sha256 ${item.outputSha256}.`
        : "Implementation manifest recorded passed verification evidence.",
      reason: null,
      risk: null,
    }),
  );

  return {
    version: 1,
    stage: "qa",
    status: "passed",
    summary: "QA passed using deterministic mandatory evidence fallback.",
    markdown: [
      "# QA",
      "",
      "Mandatory implementation verification evidence is present and passed.",
      "QA model output missed the required structured artifact block, so AIF synthesized this strict artifact from the mandatory evidence inventory.",
      "",
      "Mandatory checks:",
      ...mandatoryChecks.map(
        (check) => `- ${check.id}: passed${check.command ? ` (${check.command})` : ""}`,
      ),
    ].join("\n"),
    mandatoryChecks,
    optionalChecks: [],
    limitations: [
      "No new command output was introduced by QA fallback; evidence is derived from the implementation manifest mandatory inventory.",
    ],
    rollbackNotes: [],
  };
}

function readRecordField(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function readSourceFingerprint(context: Record<string, unknown>): string | null {
  return readOptionalString(
    readRecordField(context, ["sourceFingerprint", "sourceInventoryFingerprint", "fingerprint"]),
  );
}

function readSourceMetadata(context: Record<string, unknown>): Record<string, unknown> {
  const metadata = readRecordField(context, ["inventoryMetadata", "sourceMetadata", "metadata"]);
  return isRecord(metadata) ? metadata : {};
}

function readMandatoryInventory(context: Record<string, unknown>): QaMandatoryInventoryItem[] {
  return normalizeQaMandatoryInventory(
    readRecordField(context, ["mandatoryInventory", "mandatoryChecks", "inventory"]),
  );
}

function maybeBuildQaSourceContext(taskId: string): QaSourceContext | null {
  const helpers = data as unknown as Record<string, unknown>;
  for (const helperName of ["buildTaskQaContextForPrompt", "buildTaskQaGateContextForPrompt"]) {
    const helper = helpers[helperName];
    if (typeof helper !== "function") continue;
    const rawContext = (helper as (taskId: string) => unknown)(taskId);
    if (!isRecord(rawContext)) continue;
    const markdown = readOptionalString(
      readRecordField(rawContext, ["markdown", "promptMarkdown"]),
    );
    if (!markdown) continue;
    return {
      markdown,
      sourceSnapshotId: readOptionalString(readRecordField(rawContext, ["sourceSnapshotId"])),
      sourceFingerprint: readSourceFingerprint(rawContext),
      mandatoryInventory: readMandatoryInventory(rawContext),
      helperMetadata: readSourceMetadata(rawContext),
    };
  }
  return null;
}

function buildQaSourceContext(taskId: string): QaSourceContext {
  const helperContext = maybeBuildQaSourceContext(taskId);
  if (helperContext) return helperContext;
  const requirementsContext = data.buildTaskRequirementsContextForPrompt(taskId, "qa");
  return {
    markdown:
      requirementsContext?.markdown ?? "# Task Requirements Context\n\nNo context available.",
    sourceSnapshotId: requirementsContext?.snapshot?.id ?? null,
    sourceFingerprint: null,
    mandatoryInventory: [],
    helperMetadata: {},
  };
}

function formatMandatoryInventory(inventory: QaMandatoryInventoryItem[]): string {
  if (inventory.length === 0) {
    return "(No mandatory QA inventory was supplied. Return status `blocked`; do not return `passed`.)";
  }
  return inventory
    .map((item) => {
      const label = item.label ? ` - ${item.label}` : "";
      const description = item.description ? `: ${item.description}` : "";
      const blocker = item.blockingReason ? ` [BLOCKED: ${item.blockingReason}]` : "";
      return `- ${item.id}${label}${description}${blocker}`;
    })
    .join("\n");
}

function buildPrompt(input: {
  task: NonNullable<ReturnType<typeof data.findTaskById>>;
  requirementsMarkdown: string;
  mandatoryInventory: QaMandatoryInventoryItem[];
}): string {
  return [
    "You are the QA stage for an AIF task lifecycle.",
    "",
    "Return exactly one fenced `aif-qa-artifact` JSON block. Do not write files.",
    "",
    "Allowed schema:",
    "```json",
    JSON.stringify(
      {
        version: 1,
        stage: "qa",
        status: "passed | failed | blocked",
        summary: "Short non-empty summary.",
        markdown: "# QA\n\n...",
        mandatoryChecks: [
          {
            id: input.mandatoryInventory[0]?.id ?? "mandatory-check-id",
            command: input.mandatoryInventory[0]?.command ?? "npm.cmd test",
            status: "passed | failed | skipped",
            summary: "What was verified.",
            evidence: "Specific evidence for the result.",
            reason: "Required when skipped.",
            risk: "Required when skipped.",
          },
        ],
        optionalChecks: [
          {
            id: "optional-check-id",
            command: "Optional command or manual check.",
            status: "passed | failed | skipped",
            summary: "What was verified.",
            evidence: "Specific evidence for the result.",
            reason: "Required when skipped.",
            risk: "Required when skipped.",
          },
        ],
        limitations: ["Known limitation or empty array."],
        rollbackNotes: ["Rollback note or empty array."],
      },
      null,
      2,
    ),
    "```",
    "",
    "Rules:",
    "- Use `passed` only when every mandatory check listed below is present exactly once and has status `passed`.",
    "- If a mandatory inventory item is marked `BLOCKED`, return `blocked`; it cannot be satisfied by declaring the check passed.",
    "- Use `failed` when QA found a product, test, verification, or release-readiness failure.",
    "- Use `blocked` when QA cannot run or mandatory inventory/source material is missing.",
    "- Mandatory checks may not include duplicate or unknown ids.",
    "- Optional skipped checks must include both `reason` and `risk`.",
    "- Record command evidence for each check. If a mandatory inventory item supplies a command, use that command.",
    "- Include limitations and rollback notes arrays; use empty arrays when none are known.",
    "- Never include raw secrets or credentials in markdown or checks.",
    "",
    formatRaiseQuestionsPromptGuidance("qa"),
    "",
    "Mandatory QA inventory:",
    formatMandatoryInventory(input.mandatoryInventory),
    "",
    "Task:",
    `ID: ${input.task.id}`,
    `Title: ${input.task.title}`,
    `Description: ${input.task.description ?? "(No description provided.)"}`,
    "",
    input.requirementsMarkdown,
  ].join("\n");
}

function blockTaskFromQa(input: { taskId: string; summary: string }): void {
  const task = data.findTaskById(input.taskId);
  const nowIso = new Date().toISOString();
  data.setTaskFields(input.taskId, {
    status: "blocked_external",
    blockedFromStatus: "qa",
    blockedReason: `qa_stage_blocked: ${input.summary}`,
    retryAfter: null,
    retryCount: task?.retryCount ?? 0,
    manualReviewRequired: true,
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });
  data.appendTaskActivityLog(
    input.taskId,
    `[${nowIso}] QA stage blocked downstream progress: ${input.summary}`,
  );
}

export async function runQaStage(taskId: string, projectRoot: string): Promise<void> {
  const task = data.findTaskById(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const project = data.findProjectById(task.projectId);
  const sourceContext = buildQaSourceContext(taskId);
  const prompt = buildPrompt({
    task,
    requirementsMarkdown: sourceContext.markdown,
    mandatoryInventory: sourceContext.mandatoryInventory,
  });
  const promptHash = hashText(prompt);
  const scopeConstraint = `IMPORTANT: Your working directory is ${projectRoot}\nAll files must be created and modified inside this directory. Do NOT navigate to parent directories or other projects.`;
  const workflowSpec = createRuntimeWorkflowSpec({
    workflowKind: "reviewer",
    prompt,
    requiredCapabilities: [],
    sessionReusePolicy: "resume_if_available",
    systemPromptAppend: scopeConstraint,
    metadata: {
      lifecycleStage: "qa",
      promptHash,
      sourceFingerprint: sourceContext.sourceFingerprint,
      mandatoryInventory: sourceContext.mandatoryInventory.map((item) => item.id),
    },
  });

  log.info({ taskId }, "Starting QA stage runner");
  const { resultText } = await executeSubagentQuery({
    taskId,
    projectRoot,
    agentName: "qa-stage",
    prompt,
    workflowSpec,
    profileMode: "review",
    maxBudgetUsd: project?.reviewSidecarMaxBudgetUsd ?? project?.plannerMaxBudgetUsd ?? null,
  });

  if (
    handleRaiseQuestionsOutput({
      taskId,
      output: resultText,
      stage: "qa",
      sourceAgent: "qa-stage",
      sourcePromptHash: promptHash,
    })
  ) {
    return;
  }

  const baseMetadata = {
    promptHash,
    sourceFingerprint: sourceContext.sourceFingerprint,
    mandatoryInventory: sourceContext.mandatoryInventory.map((item) => item.id),
    ...sourceContext.helperMetadata,
  };

  const inventoryById = new Map(sourceContext.mandatoryInventory.map((item) => [item.id, item]));
  const toCommandEvidence = (check: ParsedQaCheck, mandatory: boolean) => ({
    id: check.id,
    command: check.command ?? inventoryById.get(check.id)?.command ?? "",
    status: check.status,
    mandatory,
    outputSummary: check.summary,
    outputSha256: null,
    evidence: check.evidence,
    reason: check.reason,
    risk: check.risk,
  });

  let parsed: ParsedQaArtifactOutput;
  let deterministicFallback: {
    parserError: string;
    reason: string;
  } | null = null;
  try {
    parsed = parseQaArtifactOutput(resultText, sourceContext.mandatoryInventory);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    data.recordTaskStageArtifactAttempt({
      taskId,
      stage: "qa",
      kind: "qa",
      label: "QA artifact",
      path: "qa.md",
      state: "rejected",
      outcome: "refuted",
      trustLevel: "untrusted",
      summary: `QA output failed validation: ${message}`,
      sourceSnapshotId: sourceContext.sourceSnapshotId,
      metadata: {
        outputVersion: 1,
        parserError: message,
        ...baseMetadata,
      },
    });
    const synthesized = synthesizeQaArtifactFromMandatoryInventory({
      mandatoryInventory: sourceContext.mandatoryInventory,
      parserError: message,
    });
    if (!synthesized) {
      blockTaskFromQa({
        taskId,
        summary: `QA output failed schema validation and deterministic fallback is unavailable: ${message}`,
      });
      return;
    }
    deterministicFallback = {
      parserError: message,
      reason: "qa_artifact_schema_repair_from_mandatory_inventory",
    };
    data.appendTaskActivityLog(
      taskId,
      `[${new Date().toISOString()}] QA artifact synthesized from mandatory evidence inventory after parser validation failed: ${message}`,
    );
    parsed = synthesized;
  }

  const accepted = parsed.status === "passed";
  data.recordTaskStageArtifactAttempt({
    taskId,
    stage: "qa",
    kind: "qa",
    label: "QA artifact",
    path: "qa.md",
    state: accepted ? "accepted" : "blocked",
    outcome: accepted ? "supported" : "blocked",
    trustLevel: accepted ? "trusted" : "untrusted",
    summary: parsed.summary,
    markdown: parsed.markdown,
    sourceSnapshotId: sourceContext.sourceSnapshotId,
    metadata: {
      outputVersion: parsed.version,
      status: parsed.status,
      mandatoryChecks: parsed.mandatoryChecks.map((check) => ({
        id: check.id,
        status: check.status,
      })),
      optionalChecks: parsed.optionalChecks.map((check) => ({
        id: check.id,
        status: check.status,
      })),
      commands: [
        ...parsed.mandatoryChecks.map((check) => toCommandEvidence(check, true)),
        ...parsed.optionalChecks.map((check) => toCommandEvidence(check, false)),
      ],
      skippedChecks: [
        ...parsed.mandatoryChecks
          .filter((check) => check.status === "skipped")
          .map((check) => toCommandEvidence(check, true)),
        ...parsed.optionalChecks
          .filter((check) => check.status === "skipped")
          .map((check) => toCommandEvidence(check, false)),
      ],
      limitations: parsed.limitations,
      rollbackNotes: parsed.rollbackNotes,
      deterministicFallback,
      ...baseMetadata,
    },
  });

  if (accepted) {
    data.appendTaskActivityLog(
      taskId,
      `[${new Date().toISOString()}] QA artifact accepted: ${parsed.summary}`,
    );
    return;
  }

  blockTaskFromQa({ taskId, summary: parsed.summary });
}

export const runQa = runQaStage;
