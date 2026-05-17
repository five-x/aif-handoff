import { describe, it, expect } from "vitest";
import {
  parseAttachments,
  formatAttachmentsForPrompt,
  isSafeAttachmentFilename,
  isSafeAttachmentStoragePath,
  extractHeadings,
  looksLikeFullPlanUpdate,
} from "../attachments.js";

describe("parseAttachments", () => {
  it("returns empty array for null", () => {
    expect(parseAttachments(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseAttachments("")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseAttachments("{not json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseAttachments('{"key": "value"}')).toEqual([]);
  });

  it("parses valid attachments", () => {
    const input = JSON.stringify([
      { name: "file.txt", mimeType: "text/plain", size: 100, content: "hello" },
    ]);
    const result = parseAttachments(input);
    expect(result).toEqual([
      { name: "file.txt", mimeType: "text/plain", size: 100, content: "hello" },
    ]);
  });

  it("applies defaults for missing fields", () => {
    const input = JSON.stringify([{}]);
    const result = parseAttachments(input);
    expect(result).toEqual([
      { name: "file", mimeType: "application/octet-stream", size: 0, content: null },
    ]);
  });

  it("filters out non-object items", () => {
    const input = JSON.stringify([null, "string", 123, { name: "ok.txt" }]);
    const result = parseAttachments(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("ok.txt");
  });
});

describe("formatAttachmentsForPrompt", () => {
  it("returns placeholder for null", () => {
    expect(formatAttachmentsForPrompt(null)).toBe("No task attachments were provided.");
  });

  it("returns placeholder for empty array", () => {
    expect(formatAttachmentsForPrompt("[]")).toBe("No task attachments were provided.");
  });

  it("formats attachments with content", () => {
    const input = JSON.stringify([
      { name: "test.ts", mimeType: "text/typescript", size: 42, content: "const x = 1;" },
    ]);
    const result = formatAttachmentsForPrompt(input);
    expect(result).toContain("1. test.ts");
    expect(result).toContain("text/typescript");
    expect(result).toContain("42 bytes");
    expect(result).toContain("const x = 1;");
  });

  it("formats attachments without content", () => {
    const input = JSON.stringify([
      { name: "img.png", mimeType: "image/png", size: 1024, content: null },
    ]);
    const result = formatAttachmentsForPrompt(input);
    expect(result).toContain("[not provided]");
  });

  it("formats file-backed attachments with path", () => {
    const input = JSON.stringify([
      {
        name: "img.png",
        mimeType: "image/png",
        size: 1024,
        content: null,
        path: ".ai-factory/files/tasks/t1/img.png",
      },
    ]);
    const result = formatAttachmentsForPrompt(input);
    expect(result).toContain("file: .ai-factory/files/tasks/t1/img.png");
    expect(result).not.toContain("[not provided]");
  });

  it("truncates long content at 4000 chars", () => {
    const longContent = "x".repeat(5000);
    const input = JSON.stringify([
      { name: "big.txt", mimeType: "text/plain", size: 5000, content: longContent },
    ]);
    const result = formatAttachmentsForPrompt(input);
    expect(result).not.toContain("x".repeat(5000));
    expect(result.length).toBeLessThan(5000 + 200);
  });

  it("does not inline binary content", () => {
    const input = JSON.stringify([
      { name: "img.png", mimeType: "image/png", size: 1024, content: "aGVsbG8=" },
    ]);
    const result = formatAttachmentsForPrompt(input);
    expect(result).toContain("[binary content omitted]");
    expect(result).not.toContain("aGVsbG8=");
  });

  it("includes attachment provenance when present", () => {
    const input = JSON.stringify([
      {
        name: "notes.txt",
        mimeType: "text/plain",
        size: 12,
        content: "hello",
        sourceRef: "task:t1",
        redactionStatus: "none",
      },
    ]);
    const result = formatAttachmentsForPrompt(input);
    expect(result).toContain("source: task:t1");
  });
});

describe("attachment safety helpers", () => {
  it("rejects unsafe attachment filenames", () => {
    expect(isSafeAttachmentFilename("notes.txt")).toBe(true);
    expect(isSafeAttachmentFilename("../notes.txt")).toBe(false);
    expect(isSafeAttachmentFilename("bad:name.txt")).toBe(false);
  });

  it("validates context-bound storage paths", () => {
    expect(
      isSafeAttachmentStoragePath(".ai-factory/files/tasks/t1/notes.txt", { taskId: "t1" }),
    ).toBe(true);
    expect(
      isSafeAttachmentStoragePath(".ai-factory/files/tasks/t2/notes.txt", { taskId: "t1" }),
    ).toBe(false);
    expect(isSafeAttachmentStoragePath(".ai-factory/files/tasks/t1/../x.txt")).toBe(false);
  });
});

describe("extractHeadings", () => {
  it("returns empty array for no headings", () => {
    expect(extractHeadings("just plain text")).toEqual([]);
  });

  it("extracts h1-h6 headings lowercased", () => {
    const md = "# Title\n## Section\n### Sub Section\ntext\n#### Deep";
    expect(extractHeadings(md)).toEqual(["title", "section", "sub section", "deep"]);
  });

  it("handles headings with leading whitespace", () => {
    const md = "  ## Indented Heading  ";
    expect(extractHeadings(md)).toEqual(["indented heading"]);
  });
});

describe("looksLikeFullPlanUpdate", () => {
  it("returns true when previous is empty and next has content", () => {
    expect(looksLikeFullPlanUpdate("", "# New Plan\n- [ ] Task 1")).toBe(true);
  });

  it("returns false when next is empty", () => {
    expect(looksLikeFullPlanUpdate("# Plan\n- [ ] Task", "")).toBe(false);
  });

  it("returns false when next is too short", () => {
    expect(looksLikeFullPlanUpdate("# Plan with substantial content here", "ok")).toBe(false);
  });

  it("returns true for short plans with adequate replacement", () => {
    expect(looksLikeFullPlanUpdate("short plan", "updated short plan")).toBe(true);
  });

  it("returns true when headings overlap", () => {
    const prev = "# " + "A".repeat(400) + "\n## Architecture\n## Tasks\n- [ ] Task 1";
    const next = "# " + "A".repeat(400) + "\n## Architecture\n## Tasks\n- [x] Task 1\n- [ ] Task 2";
    expect(looksLikeFullPlanUpdate(prev, next)).toBe(true);
  });

  it("returns false when headings do not overlap in long plans", () => {
    const prev = "# " + "A".repeat(400) + "\n## Architecture\n## Tasks";
    const next = "# " + "B".repeat(400) + "\n## Completely Different\n## Other Stuff";
    expect(looksLikeFullPlanUpdate(prev, next)).toBe(false);
  });
});
