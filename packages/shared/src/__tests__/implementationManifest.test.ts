import { describe, expect, it } from "vitest";
import {
  extractImplementationManifestBlock,
  normalizeImplementationManifestJson,
  validateImplementationManifest,
} from "../implementationManifest.js";

describe("implementation manifest extraction", () => {
  it("extracts a JSON fence when the model labels it as aif-implementation-manifest", () => {
    const text = `Done.

**aif-implementation-manifest:**

\`\`\`json
{"version":1,"taskId":"task-1","intent":"feature"}
\`\`\``;

    expect(extractImplementationManifestBlock(text)).toBe(
      '{"version":1,"taskId":"task-1","intent":"feature"}',
    );
  });

  it("normalizes common model-shaped manifests without trusting weak evidence", () => {
    const raw = JSON.stringify({
      version: 1,
      taskId: "task-1",
      intent: "feature",
      planManifestHash: null,
      changedFiles: ["src/index.ts"],
      diffSummary: "Implemented src/index.ts",
      verificationEvidence: [
        {
          command: "npm test",
          status: "passed",
          outputSha256: "placeholder",
          outputPreview: "tests passed",
          outputPreviewTruncated: false,
        },
      ],
      acceptanceCriteria: ["Implementation exists"],
      planChecklist: [],
      reviewClosure: [],
      commitEvidence: [],
      knownLimitations: [],
    });

    const normalized = normalizeImplementationManifestJson(raw);
    expect(normalized).toBeTruthy();

    const result = validateImplementationManifest({
      task: { id: "task-1", title: "Build feature", taskIntent: "feature" },
      manifestJson: normalized,
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).not.toContain(
      "invalid_implementation_manifest",
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "missing_verification_evidence",
        "missing_acceptance_evidence",
        "plan_checklist_drift",
      ]),
    );
  });
});
