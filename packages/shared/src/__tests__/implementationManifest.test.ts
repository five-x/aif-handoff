import { describe, expect, it } from "vitest";
import {
  extractImplementationManifestBlock,
  normalizeImplementationManifestJson,
  validateImplementationManifest,
} from "../implementationManifest.js";

describe("implementation manifest extraction", () => {
  function validManifest(overrides: Record<string, unknown> = {}) {
    return {
      version: 1,
      taskId: "task-feature",
      intent: "feature",
      planManifestHash: null,
      changedFiles: [{ path: "src/index.ts", status: "modified" }],
      diffSummary: { summary: "Implemented src/index.ts", filesChanged: 1 },
      verificationEvidence: [
        {
          id: "ver-1",
          command: "npm test",
          status: "passed",
          outputSha256: "a".repeat(64),
          outputPreview: "PASS tests/app.test.ts",
          outputPreviewTruncated: false,
        },
      ],
      acceptanceCriteria: [{ id: "AC-1", status: "satisfied", evidenceRefs: ["ver-1"] }],
      evidenceRefs: ["ver-1"],
      planChecklist: { total: 1, completed: 1, pending: 0, synced: true, pendingItems: [] },
      reviewClosure: { status: "pending", evidenceRefs: [] },
      commitEvidence: { status: "not_required", evidenceRefs: [] },
      knownLimitations: [],
      ...overrides,
    };
  }

  function validActivityLog(command = "npm test") {
    return [
      "[2026-05-29T10:00:00.000Z] Agent: implement-coordinator started",
      `[2026-05-29T10:00:01.000Z] Tool: run_shell ${command}`,
      "[2026-05-29T10:00:02.000Z] Agent: implement-coordinator complete",
    ].join("\n");
  }

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

  it("rejects passed verification that uses the empty-output sha as placeholder evidence", () => {
    const manifest = {
      version: 1,
      taskId: "task-empty-hash",
      intent: "feature",
      planManifestHash: null,
      changedFiles: [{ path: "src/index.ts", status: "added" }],
      diffSummary: { summary: "Implemented src/index.ts", filesChanged: 1 },
      verificationEvidence: [
        {
          id: "ver-1",
          command: "npm test",
          status: "passed",
          outputSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          outputPreview: "npm test completed successfully.",
          outputPreviewTruncated: false,
        },
      ],
      acceptanceCriteria: [{ id: "AC-1", status: "satisfied", evidenceRefs: ["ver-1"] }],
      evidenceRefs: ["ver-1"],
      planChecklist: { total: 1, completed: 1, pending: 0, synced: true, pendingItems: [] },
      reviewClosure: { status: "pending", evidenceRefs: [] },
      commitEvidence: { status: "not_required", evidenceRefs: [] },
      knownLimitations: [],
    };

    const result = validateImplementationManifest({
      task: { id: "task-empty-hash", title: "Build feature", taskIntent: "feature" },
      manifestJson: JSON.stringify(manifest),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).toContain("missing_verification_evidence");
  });

  it("rejects passed verification when known limitations admit placeholder execution output", () => {
    const manifest = {
      version: 1,
      taskId: "task-placeholder-limit",
      intent: "feature",
      planManifestHash: null,
      changedFiles: [{ path: "src/index.ts", status: "added" }],
      diffSummary: { summary: "Implemented src/index.ts", filesChanged: 1 },
      verificationEvidence: [
        {
          id: "ver-1",
          command: "npm test",
          status: "passed",
          outputSha256: "a".repeat(64),
          outputPreview: "PASS tests/app.test.ts.",
          outputPreviewTruncated: false,
        },
      ],
      acceptanceCriteria: [{ id: "AC-1", status: "satisfied", evidenceRefs: ["ver-1"] }],
      evidenceRefs: ["ver-1"],
      planChecklist: { total: 1, completed: 1, pending: 0, synced: true, pendingItems: [] },
      reviewClosure: { status: "pending", evidenceRefs: [] },
      commitEvidence: { status: "not_required", evidenceRefs: [] },
      knownLimitations: [
        "outputSha256 values are placeholders because commands were not executed.",
      ],
    };

    const result = validateImplementationManifest({
      task: { id: "task-placeholder-limit", title: "Build feature", taskIntent: "feature" },
      manifestJson: JSON.stringify(manifest),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).toContain("missing_verification_evidence");
  });

  it("rejects passed verification that says the command was not executed", () => {
    const manifest = validManifest({
      verificationEvidence: [
        {
          id: "ver-1",
          command: "npm test",
          status: "passed",
          outputSha256: "b".repeat(64),
          outputPreview: "Tests were not executed in this environment.",
          outputPreviewTruncated: false,
        },
      ],
    });

    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: validActivityLog(),
      },
      manifestJson: JSON.stringify(manifest),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).toContain("contradictory_verification_claim");
  });

  it("rejects passed verification command absent from latest implementation activity", () => {
    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: [
          "[2026-05-29T10:00:00.000Z] Agent: implement-coordinator started",
          "[2026-05-29T10:00:01.000Z] Tool: read_file src/index.ts",
          "[2026-05-29T10:00:02.000Z] Agent: implement-coordinator complete",
        ].join("\n"),
      },
      manifestJson: JSON.stringify(validManifest()),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).toContain("verification_command_not_observed");
  });

  it("accepts passed verification command observed in latest implementation activity", () => {
    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: validActivityLog(),
      },
      manifestJson: JSON.stringify(validManifest()),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
