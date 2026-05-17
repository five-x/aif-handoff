import { describe, expect, it } from "vitest";
import {
  findSecretLikeKeys,
  fingerprintConfig,
  validateProjectConfigObject,
} from "../configGovernance.js";

describe("config governance helpers", () => {
  it("reports stable reason codes for invalid project config values", () => {
    const issues = validateProjectConfigObject({
      paths: { plan: 42 },
      workflow: { auto_create_dirs: "yes", verify_mode: "surprise" },
      language: { artifacts: "not a tag" },
    });

    expect(issues.map((issue) => issue.reasonCode)).toEqual([
      "PROJECT_CONFIG_INVALID_PATH_VALUE",
      "PROJECT_CONFIG_INVALID_BOOLEAN",
      "PROJECT_CONFIG_INVALID_ENUM",
      "PROJECT_CONFIG_INVALID_LANGUAGE_TAG",
    ]);
    expect(issues.every((issue) => issue.blocksWork)).toBe(true);
  });

  it("detects secret-like nested keys without exposing values", () => {
    expect(
      findSecretLikeKeys({
        safe: "value",
        nested: { apiKey: "do-not-return", token_header: "do-not-return" },
      }),
    ).toEqual(["nested.apiKey", "nested.token_header"]);
  });

  it("fingerprints objects deterministically regardless of key order", () => {
    expect(fingerprintConfig({ b: 1, a: { y: 2, x: 3 } })).toBe(
      fingerprintConfig({ a: { x: 3, y: 2 }, b: 1 }),
    );
  });
});
