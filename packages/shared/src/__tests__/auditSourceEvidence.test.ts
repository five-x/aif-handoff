import { describe, expect, it } from "vitest";
import { isLowSignalAuditEvidenceLine } from "../auditSourceEvidence.js";

describe("audit source evidence line scoring", () => {
  it("treats markdown image and URL lines as low-signal audit evidence", () => {
    expect(
      isLowSignalAuditEvidenceLine({
        path: "README.md",
        line: 1,
        text: "![logo](https://example.test/image.png)",
      }),
    ).toBe(true);
    expect(
      isLowSignalAuditEvidenceLine({
        path: "README.md",
        line: 9,
        text: "See [runtime docs](https://example.test/runtime) for setup details.",
      }),
    ).toBe(true);
    expect(
      isLowSignalAuditEvidenceLine({
        path: "README.md",
        line: 12,
        text: "The API health endpoint returns status and uptime for runtime checks.",
      }),
    ).toBe(false);
  });
});
