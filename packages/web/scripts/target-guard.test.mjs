import { describe, expect, it } from "vitest";
import { assertRemoteOnlyValidationTargets, isLocalValidationUrl } from "./target-guard.mjs";

describe("web validation target guard", () => {
  it("detects localhost, loopback, and unspecified bind addresses", () => {
    expect(isLocalValidationUrl("http://localhost:5180")).toBe(true);
    expect(isLocalValidationUrl("http://127.0.0.1:5180")).toBe(true);
    expect(isLocalValidationUrl("http://127.0.0.2:5180")).toBe(true);
    expect(isLocalValidationUrl("http://0.0.0.0:5180")).toBe(true);
    expect(isLocalValidationUrl("http://[::1]:5180")).toBe(true);
    expect(isLocalValidationUrl("http://[::]:5180")).toBe(true);
    expect(isLocalValidationUrl("http://[::ffff:127.0.0.1]:5180")).toBe(true);
    expect(isLocalValidationUrl("http://[::ffff:127.0.0.2]:5180")).toBe(true);
    expect(isLocalValidationUrl("http://[::ffff:7f00:1]:5180")).toBe(true);
    expect(isLocalValidationUrl("http://[::ffff:8000:1]:5180")).toBe(false);
    expect(isLocalValidationUrl("http://192.168.88.67")).toBe(false);
  });

  it("fails closed for local web or API targets without explicit local opt-in", () => {
    const errorMessage =
      "Local Playwright perf validation requires explicit local opt-in: set AIF_SKIP_DEV_SERVER=0.";
    expect(() =>
      assertRemoteOnlyValidationTargets({
        skipDevServer: true,
        urls: ["http://0.0.0.0:5180", "http://192.168.88.67/api"],
        errorMessage,
      }),
    ).toThrow(/AIF_SKIP_DEV_SERVER=0/);
    expect(() =>
      assertRemoteOnlyValidationTargets({
        skipDevServer: true,
        urls: ["http://127.0.0.2:5180", "http://192.168.88.67/api"],
        errorMessage,
      }),
    ).toThrow(/AIF_SKIP_DEV_SERVER=0/);
    expect(() =>
      assertRemoteOnlyValidationTargets({
        skipDevServer: true,
        urls: ["http://192.168.88.67", "http://[::]:3009"],
        errorMessage,
      }),
    ).toThrow(/AIF_SKIP_DEV_SERVER=0/);
    expect(() =>
      assertRemoteOnlyValidationTargets({
        skipDevServer: true,
        urls: ["http://192.168.88.67", "http://[::ffff:127.0.0.1]:3009"],
        errorMessage,
      }),
    ).toThrow(/AIF_SKIP_DEV_SERVER=0/);
    expect(() =>
      assertRemoteOnlyValidationTargets({
        skipDevServer: false,
        urls: ["http://0.0.0.0:5180", "http://[::]:3009"],
        errorMessage,
      }),
    ).not.toThrow();
  });
});
