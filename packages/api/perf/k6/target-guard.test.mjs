import { describe, expect, it } from "vitest";
import { assertRemoteOnlyApiTarget, isLocalApiUrl } from "./target-guard.js";

describe("k6 target guard", () => {
  it("detects localhost, loopback, and unspecified bind addresses", () => {
    expect(isLocalApiUrl("http://localhost:3009")).toBe(true);
    expect(isLocalApiUrl("http://127.0.0.1:3009")).toBe(true);
    expect(isLocalApiUrl("http://127.0.0.2:3009")).toBe(true);
    expect(isLocalApiUrl("http://0.0.0.0:3009")).toBe(true);
    expect(isLocalApiUrl("http://[::1]:3009")).toBe(true);
    expect(isLocalApiUrl("http://[::]:3009")).toBe(true);
    expect(isLocalApiUrl("http://[::ffff:127.0.0.1]:3009")).toBe(true);
    expect(isLocalApiUrl("http://[::ffff:127.0.0.2]:3009")).toBe(true);
    expect(isLocalApiUrl("http://[::ffff:7f00:1]:3009")).toBe(true);
    expect(isLocalApiUrl("http://[::ffff:8000:1]:3009")).toBe(false);
    expect(isLocalApiUrl("http://192.168.88.67/api")).toBe(false);
  });

  it("fails closed for local k6 API targets without explicit local opt-in", () => {
    expect(() =>
      assertRemoteOnlyApiTarget({
        baseUrl: "http://[::1]:3009",
        skipDevServer: "1",
      }),
    ).toThrow(/AIF_SKIP_DEV_SERVER=0/);
    expect(() =>
      assertRemoteOnlyApiTarget({
        baseUrl: "http://localhost:3009",
        skipDevServer: undefined,
      }),
    ).toThrow(/AIF_SKIP_DEV_SERVER=0/);
    expect(() =>
      assertRemoteOnlyApiTarget({
        baseUrl: "http://0.0.0.0:3009",
        skipDevServer: "1",
      }),
    ).toThrow(/AIF_SKIP_DEV_SERVER=0/);
    expect(() =>
      assertRemoteOnlyApiTarget({
        baseUrl: "http://127.0.0.2:3009",
        skipDevServer: "1",
      }),
    ).toThrow(/AIF_SKIP_DEV_SERVER=0/);
    expect(() =>
      assertRemoteOnlyApiTarget({
        baseUrl: "http://[::]:3009",
        skipDevServer: "1",
      }),
    ).toThrow(/AIF_SKIP_DEV_SERVER=0/);
    expect(() =>
      assertRemoteOnlyApiTarget({
        baseUrl: "http://[::ffff:127.0.0.1]:3009",
        skipDevServer: "1",
      }),
    ).toThrow(/AIF_SKIP_DEV_SERVER=0/);
    expect(() =>
      assertRemoteOnlyApiTarget({
        baseUrl: "http://localhost:3009",
        skipDevServer: "0",
      }),
    ).not.toThrow();
  });
});
