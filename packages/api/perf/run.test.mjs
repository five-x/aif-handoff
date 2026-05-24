import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverK6Scripts, isLocalUrl } from "./run.mjs";

describe("k6 script discovery", () => {
  it("excludes shared helper modules from runnable k6 scripts", () => {
    expect(discoverK6Scripts().map((script) => basename(script)).sort()).toEqual([
      "chat-sessions.js",
      "runtime-profiles.js",
      "tasks.js",
    ]);
  });

  it("classifies loopback and bind addresses as local", () => {
    expect(isLocalUrl("http://127.0.0.2:3009")).toBe(true);
    expect(isLocalUrl("http://[::ffff:127.0.0.1]:3009")).toBe(true);
    expect(isLocalUrl("http://[::ffff:127.0.0.2]:3009")).toBe(true);
    expect(isLocalUrl("http://[::ffff:7f00:1]:3009")).toBe(true);
    expect(isLocalUrl("http://[::ffff:8000:1]:3009")).toBe(false);
    expect(isLocalUrl("http://192.168.88.67/api")).toBe(false);
  });
});
