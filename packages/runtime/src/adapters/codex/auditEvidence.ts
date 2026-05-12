import {
  AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE,
  buildAuditEvidencePayload,
  type AuditEvidenceCommandMetadata,
  type AuditEvidenceGrade,
  type AuditEvidenceKind,
} from "@aif/shared";
import type { RuntimeEvent } from "../../types.js";

interface CodexAuditEvidenceDescriptor {
  toolName: string;
  evidenceKind: AuditEvidenceKind;
  evidenceGrade?: AuditEvidenceGrade;
  paths: string[];
  command: string | AuditEvidenceCommandMetadata | null;
  exitCode: number | null;
  output: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringifyEvidenceValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readArguments(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
}

function collectPathValues(value: unknown, paths = new Set<string>(), keyHint = ""): Set<string> {
  if (typeof value === "string") {
    if (
      /(path|file|filename|cwd|directory|dir|root|glob)/i.test(keyHint) &&
      value.trim().length > 0
    ) {
      paths.add(value.trim());
    }
    return paths;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathValues(entry, paths, keyHint);
    }
    return paths;
  }
  const record = asRecord(value);
  for (const [key, entry] of Object.entries(record)) {
    if (/^(output|result|response|content|stdout|stderr|text|error)$/i.test(key)) continue;
    collectPathValues(entry, paths, key);
  }
  return paths;
}

function normalizeToolToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasToolToken(value: string, tokens: string[]): boolean {
  const normalized = normalizeToolToken(value);
  return tokens.some((token) => normalized.includes(token));
}

function readCodexOutput(item: Record<string, unknown>): string | null {
  const parts = [
    stringifyEvidenceValue(item.aggregated_output),
    stringifyEvidenceValue(item.aggregatedOutput),
    stringifyEvidenceValue(item.output),
    stringifyEvidenceValue(item.stdout),
    stringifyEvidenceValue(item.stderr),
    stringifyEvidenceValue(item.result),
    stringifyEvidenceValue(item.response),
    stringifyEvidenceValue(item.content),
    stringifyEvidenceValue(item.contents),
    stringifyEvidenceValue(item.text),
    stringifyEvidenceValue(item.error),
  ].filter((entry): entry is string => Boolean(entry));
  return parts.length > 0 ? parts.join("\n") : null;
}

function readCodexExitCode(item: Record<string, unknown>): number | null {
  return readNumber(item.exit_code) ?? readNumber(item.exitCode) ?? readNumber(item.code);
}

function commandMetadataFromItem(item: Record<string, unknown>): AuditEvidenceCommandMetadata {
  return {
    command: readString(item.command) ?? "",
    args: Array.isArray(item.args)
      ? item.args.filter((entry): entry is string => typeof entry === "string")
      : [],
    cwd:
      readString(item.cwd) ??
      readString(item.working_directory) ??
      readString(item.workingDirectory),
  };
}

function evidenceFromCommandExecution(item: Record<string, unknown>): CodexAuditEvidenceDescriptor {
  const command = commandMetadataFromItem(item);
  const paths = [
    readString(item.cwd),
    readString(item.working_directory),
    readString(item.workingDirectory),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    toolName: "Bash",
    evidenceKind: "shell_command",
    paths,
    command,
    exitCode: readCodexExitCode(item),
    output: readCodexOutput(item),
  };
}

function evidenceFromNativeFileRead(item: Record<string, unknown>): CodexAuditEvidenceDescriptor {
  const paths = [...collectPathValues(item)];
  return {
    toolName: "Read",
    evidenceKind: "file_read",
    evidenceGrade: "substantive",
    paths,
    command: null,
    exitCode: readCodexExitCode(item),
    output: readCodexOutput(item),
  };
}

function evidenceFromMcpToolCall(
  item: Record<string, unknown>,
): CodexAuditEvidenceDescriptor | null {
  const server = readString(item.server) ?? "mcp";
  const tool = readString(item.tool) ?? readString(item.name) ?? "tool";
  const toolKey = `${server} ${tool}`;
  const args = readArguments(item.arguments ?? item.args ?? item.input);
  const paths = [...collectPathValues(args)];
  const repoLikeServer = /(filesystem|fs|file|shell|workspace|repo|git|function|tool)/i.test(
    server,
  );
  const isFileRead = hasToolToken(toolKey, [
    "read_file",
    "readfile",
    "view_file",
    "open_file",
    "get_file",
    "cat",
  ]);
  const isSearch = hasToolToken(toolKey, [
    "grep",
    "rg",
    "search",
    "find",
    "glob",
    "list_files",
    "listfiles",
    "list_dir",
    "list_directory",
    "ls",
  ]);

  if (!isFileRead && !isSearch) return null;
  if (!repoLikeServer && paths.length === 0) return null;

  return {
    toolName: `MCP:${server}/${tool}`,
    evidenceKind: isFileRead ? "file_read" : "search",
    evidenceGrade: isFileRead
      ? "substantive"
      : tool.toLowerCase().includes("list")
        ? "discovery"
        : "substantive",
    paths,
    command: null,
    exitCode: readCodexExitCode(item),
    output: readCodexOutput(item),
  };
}

export function buildCodexAuditEvidenceEvent(
  item: unknown,
  timestamp = new Date().toISOString(),
): RuntimeEvent | null {
  const record = asRecord(item);
  const itemType = readString(record.type);
  if (!itemType) return null;

  let descriptor: CodexAuditEvidenceDescriptor | null = null;
  if (itemType === "command_execution" || itemType === "commandExecution") {
    descriptor = evidenceFromCommandExecution(record);
  } else if (itemType === "file_read" || itemType === "fileRead") {
    descriptor = evidenceFromNativeFileRead(record);
  } else if (itemType === "mcp_tool_call" || itemType === "mcpToolCall") {
    descriptor = evidenceFromMcpToolCall(record);
  }
  if (!descriptor) return null;

  return {
    type: AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE,
    timestamp,
    level: descriptor.exitCode && descriptor.exitCode !== 0 ? "warn" : "info",
    message: `${descriptor.toolName} audit evidence captured`,
    data: {
      auditEvidence: buildAuditEvidencePayload({
        toolName: descriptor.toolName,
        evidenceKind: descriptor.evidenceKind,
        evidenceGrade: descriptor.evidenceGrade,
        paths: descriptor.paths,
        command: descriptor.command,
        exitCode: descriptor.exitCode,
        output: descriptor.output,
      }),
    },
  };
}
