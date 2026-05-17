import { describe, it, expect } from "vitest";
import { toAttachmentPayload } from "@/components/task/useTaskDetailActions";

describe("toAttachmentPayload", () => {
  it("should read text content from text file", async () => {
    const file = new File(["hello world"], "notes.txt", { type: "text/plain" });
    const result = await toAttachmentPayload(file);
    expect(result).toEqual({
      name: "notes.txt",
      mimeType: "text/plain",
      size: 11,
      content: "hello world",
    });
  });

  it("should read text content from code file by extension", async () => {
    const file = new File(["const x = 1;"], "app.ts", { type: "" });
    const result = await toAttachmentPayload(file);
    expect(result).toEqual({
      name: "app.ts",
      mimeType: "text/plain",
      size: 12,
      content: "const x = 1;",
    });
  });

  it("should read text content up to the hard attachment limit", async () => {
    const bigContent = "x".repeat(300_000);
    const file = new File([bigContent], "big.txt", { type: "text/plain" });
    const result = await toAttachmentPayload(file);
    expect(result.content).toBe(bigContent);
  });

  it("should encode small image as base64 data URI", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const file = new File([bytes], "icon.png", { type: "image/png" });
    const result = await toAttachmentPayload(file);
    expect(result.content).toMatch(/^data:image\/png;base64,/);
  });

  it("should encode allowed binary files within the hard attachment limit", async () => {
    const bigImage = new Uint8Array(2_000_000);
    const file = new File([bigImage], "huge.png", { type: "image/png" });
    const result = await toAttachmentPayload(file);
    expect(result.content).toMatch(/^data:image\/png;base64,/);
  });

  it("should return null content for binary non-image file", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "data.bin", {
      type: "application/octet-stream",
    });
    const result = await toAttachmentPayload(file);
    expect(result).toEqual({
      name: "data.bin",
      mimeType: "application/octet-stream",
      size: 3,
      content: null,
    });
  });
});
