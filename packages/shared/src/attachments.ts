/**
 * Shared attachment parsing and formatting utilities.
 * Used by API routes and agent subagents.
 */

import { redactProviderText } from "./runtimeLimitUtils.js";

export const ATTACHMENT_MAX_BYTES = 10_000_000;
export const ATTACHMENT_CONTENT_MAX_CHARS = Math.ceil((ATTACHMENT_MAX_BYTES * 4) / 3) + 256;
export const ATTACHMENT_PROMPT_CONTENT_LIMIT = 4000;

export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export type AttachmentSourceKind = "task" | "comment" | "chat";
export type AttachmentRedactionStatus = "none" | "redacted" | "not_scanned";

export interface ParsedAttachment {
  name: string;
  mimeType: string;
  size: number;
  content: string | null;
  /** Relative path in storage/ directory. Present for file-backed attachments. */
  path?: string;
  sourceKind?: AttachmentSourceKind;
  sourceRef?: string;
  redactionStatus?: AttachmentRedactionStatus;
}

export interface AttachmentStoragePathContext {
  taskId?: string;
  commentId?: string;
  chatSessionId?: string;
}

export function normalizeAttachmentMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAllowedAttachmentMimeType(mimeType: string): boolean {
  return (ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(
    normalizeAttachmentMimeType(mimeType),
  );
}

export function isTextAttachmentMimeType(mimeType: string): boolean {
  const normalized = normalizeAttachmentMimeType(mimeType);
  return (
    normalized === "text/plain" ||
    normalized === "text/markdown" ||
    normalized === "text/csv" ||
    normalized === "application/json" ||
    normalized.startsWith("text/")
  );
}

export function isBinaryAttachmentMimeType(mimeType: string): boolean {
  return isAllowedAttachmentMimeType(mimeType) && !isTextAttachmentMimeType(mimeType);
}

export function isSafeAttachmentFilename(name: string): boolean {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.trim() !== name) return false;
  if (name === "." || name === "..") return false;
  if (/[\x00-\x1f/\\:*?"<>|]/.test(name)) return false;
  return true;
}

function normalizeStoragePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isSafeAttachmentStoragePath(
  path: string,
  context: AttachmentStoragePathContext = {},
): boolean {
  if (typeof path !== "string" || path.length === 0 || path.trim() !== path) return false;
  if (path.includes("\0") || path.includes(":")) return false;
  const normalized = normalizeStoragePath(path);
  if (normalized !== path) return false;
  if (normalized.startsWith("/") || normalized.startsWith("./")) return false;

  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return false;
  }
  if (segments[0] !== ".ai-factory" || segments[1] !== "files" || segments.length < 4) {
    return false;
  }

  let expectedPrefix = ".ai-factory/files/";
  if (context.chatSessionId) {
    expectedPrefix = `.ai-factory/files/chat/${context.chatSessionId}/`;
  } else if (context.taskId && context.commentId) {
    expectedPrefix = `.ai-factory/files/tasks/${context.taskId}/comments/${context.commentId}/`;
  } else if (context.taskId) {
    expectedPrefix = `.ai-factory/files/tasks/${context.taskId}/`;
  }

  return normalized.startsWith(expectedPrefix) && normalized.length > expectedPrefix.length;
}

export function isValidBase64AttachmentContent(content: string): boolean {
  const data = content.match(/^data:[^;]+;base64,(.+)$/s)?.[1] ?? content;
  const compact = data.replace(/\s/g, "");
  if (compact.length === 0 || compact.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return false;
  try {
    const decoded = Buffer.from(compact, "base64");
    return decoded.toString("base64") === compact;
  } catch {
    return false;
  }
}

export function redactAttachmentTextContent(content: string): {
  content: string;
  redactionStatus: AttachmentRedactionStatus;
} {
  const redacted = redactProviderText(content);
  return {
    content: redacted,
    redactionStatus: redacted === content ? "none" : "redacted",
  };
}

/**
 * Parse a JSON-serialized attachment array from DB.
 * Handles both legacy (content-only) and new (path-based) records.
 */
export function parseAttachments(raw: string | null): ParsedAttachment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const attachment: ParsedAttachment = {
          name: typeof item.name === "string" ? item.name : "file",
          mimeType: typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream",
          size: typeof item.size === "number" ? item.size : 0,
          content: typeof item.content === "string" ? item.content : null,
        };
        if (typeof item.path === "string" && item.path.length > 0) {
          attachment.path = item.path;
        }
        if (
          item.sourceKind === "task" ||
          item.sourceKind === "comment" ||
          item.sourceKind === "chat"
        ) {
          attachment.sourceKind = item.sourceKind;
        }
        if (typeof item.sourceRef === "string" && item.sourceRef.length > 0) {
          attachment.sourceRef = item.sourceRef;
        }
        if (
          item.redactionStatus === "none" ||
          item.redactionStatus === "redacted" ||
          item.redactionStatus === "not_scanned"
        ) {
          attachment.redactionStatus = item.redactionStatus;
        }
        return attachment;
      });
  } catch {
    return [];
  }
}

/**
 * Check whether an attachment is file-backed (has a storage path).
 */
export function isFileBackedAttachment(attachment: ParsedAttachment): boolean {
  return typeof attachment.path === "string" && attachment.path.length > 0;
}

/** Thresholds for looksLikeFullPlanUpdate heuristic. */
const PLAN_SHORT_THRESHOLD = 120;
const PLAN_HEADING_THRESHOLD = 400;
const SHORT_PLAN_RETENTION = 0.6;
const LONG_PLAN_RETENTION = 0.5;
const SHORT_PLAN_MIN_LENGTH = 10;
const LONG_PLAN_MIN_LENGTH = 80;

/**
 * Format attachments for agent prompts.
 * File-backed attachments show their path relative to project root —
 * agents run with cwd=projectRoot so they can read files directly.
 *
 * @param raw - JSON-serialized attachment array from DB
 */
export function formatAttachmentsForPrompt(raw: string | null): string {
  const attachments = parseAttachments(raw);
  if (attachments.length === 0) return "No task attachments were provided.";

  return attachments
    .map((file, index) => {
      const metadata: string[] = [];
      if (file.sourceRef) metadata.push(`source: ${file.sourceRef}`);
      if (file.redactionStatus === "redacted") metadata.push("redaction: redacted");
      if (file.redactionStatus === "not_scanned") metadata.push("redaction: not scanned");

      let detail = "";
      if (file.content && isTextAttachmentMimeType(file.mimeType)) {
        const redacted = redactAttachmentTextContent(file.content);
        const preview = redacted.content.slice(0, ATTACHMENT_PROMPT_CONTENT_LIMIT);
        const truncated = redacted.content.length > ATTACHMENT_PROMPT_CONTENT_LIMIT;
        const indentedPreview = preview
          .split("\n")
          .map((line) => `      ${line}`)
          .join("\n");
        detail = `\n    content:\n${indentedPreview}`;
        if (truncated) detail += "\n      [truncated]";
        if (redacted.redactionStatus === "redacted" && !metadata.includes("redaction: redacted")) {
          metadata.push("redaction: redacted");
        }
      } else if (file.content && isBinaryAttachmentMimeType(file.mimeType)) {
        detail = "\n    content: [binary content omitted]";
      } else if (file.path) {
        detail = `\n    file: ${file.path}`;
      } else {
        detail = "\n    content: [not provided]";
      }

      const metadataDetail = metadata.length > 0 ? `\n    ${metadata.join("\n    ")}` : "";
      return `${index + 1}. ${file.name} (${file.mimeType}, ${file.size} bytes)${metadataDetail}${detail}`;
    })
    .join("\n");
}

export function extractHeadings(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, "").toLowerCase());
}

export function looksLikeFullPlanUpdate(previousPlan: string, updatedPlan: string): boolean {
  const prev = previousPlan.trim();
  const next = updatedPlan.trim();
  if (!prev) return next.length > 0;
  if (!next) return false;
  const minLength =
    prev.length < PLAN_SHORT_THRESHOLD
      ? Math.max(SHORT_PLAN_MIN_LENGTH, Math.floor(prev.length * SHORT_PLAN_RETENTION))
      : Math.max(LONG_PLAN_MIN_LENGTH, Math.floor(prev.length * LONG_PLAN_RETENTION));
  if (next.length < minLength) return false;

  const prevHeadings = extractHeadings(prev);
  if (prev.length < PLAN_HEADING_THRESHOLD || prevHeadings.length === 0) return true;
  const nextHeadings = new Set(extractHeadings(next));
  return prevHeadings.some((heading) => nextHeadings.has(heading));
}
