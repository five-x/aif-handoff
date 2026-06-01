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

  it("extracts one immediately labeled bare JSON manifest when the fence is omitted", () => {
    const text = `Done.

aif-implementation-manifest
{
  "version": 1,
  "taskId": "task-1",
  "intent": "feature",
  "diffSummary": { "summary": "No changes required." }
}`;

    expect(extractImplementationManifestBlock(text)).toBe(`{
  "version": 1,
  "taskId": "task-1",
  "intent": "feature",
  "diffSummary": { "summary": "No changes required." }
}`);
  });

  it("does not extract arbitrary later JSON after a manifest label with prose in between", () => {
    const text = `The aif-implementation-manifest should be returned later.

Here is unrelated JSON:
{"version":1,"taskId":"task-1","intent":"feature"}`;

    expect(extractImplementationManifestBlock(text)).toBeNull();
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

  it("normalizes already_committed commit evidence without accepting weak evidence", () => {
    const raw = JSON.stringify({
      ...validManifest({
        verificationEvidence: [
          {
            id: "ver-1",
            command: "npm test",
            status: "passed",
            outputSha256: "placeholder",
            outputPreview: "tests were not run",
            outputPreviewTruncated: false,
          },
        ],
        commitEvidence: { status: "already_committed", evidenceRefs: ["git_status"] },
      }),
    });

    const normalized = normalizeImplementationManifestJson(raw);
    expect(normalized).toBeTruthy();
    expect(JSON.parse(normalized as string).commitEvidence.status).toBe("committed");

    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: validActivityLog(),
      },
      manifestJson: normalized,
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).not.toContain(
      "invalid_implementation_manifest",
    );
    expect(result.issues.map((issue) => issue.code)).toContain("missing_verification_evidence");
  });

  it("normalizes completed commit evidence without rejecting the manifest shape", () => {
    const raw = JSON.stringify({
      ...validManifest({
        commitEvidence: { status: "completed", evidenceRefs: ["git_status"] },
      }),
    });

    const normalized = normalizeImplementationManifestJson(raw);
    expect(normalized).toBeTruthy();
    expect(JSON.parse(normalized as string).commitEvidence.status).toBe("committed");

    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: validActivityLog(),
      },
      manifestJson: normalized,
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).not.toContain(
      "invalid_implementation_manifest",
    );
  });

  it("normalizes resolved review closure without rejecting the manifest shape", () => {
    const raw = JSON.stringify({
      ...validManifest({
        reviewClosure: { status: "resolved", evidenceRefs: ["ver-1"] },
      }),
    });

    const normalized = normalizeImplementationManifestJson(raw);
    expect(normalized).toBeTruthy();
    expect(JSON.parse(normalized as string).reviewClosure.status).toBe("passed");

    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: validActivityLog(),
      },
      manifestJson: normalized,
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).not.toContain(
      "invalid_implementation_manifest",
    );
  });

  it("normalizes blocked environment verification evidence without rejecting the manifest shape", () => {
    const raw = JSON.stringify({
      ...validManifest({
        verificationEvidence: [
          {
            id: "ver-1",
            command: "npm test",
            status: "blocked_by_environment",
            outputSha256: "b".repeat(64),
            outputPreview: "npm test could not run because package.json was unavailable.",
            outputPreviewTruncated: false,
          },
        ],
        acceptanceCriteria: [{ id: "AC-1", status: "unsatisfied", evidenceRefs: [] }],
        evidenceRefs: ["ver-1"],
      }),
    });

    const normalized = normalizeImplementationManifestJson(raw);
    expect(normalized).toBeTruthy();
    expect(JSON.parse(normalized as string).verificationEvidence[0].status).toBe("skipped");

    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: validActivityLog(),
      },
      manifestJson: normalized,
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).not.toContain(
      "invalid_implementation_manifest",
    );
    expect(result.issues.map((issue) => issue.code)).toContain("missing_verification_evidence");
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

  it("rejects passed verification when command output contains a compiler failure masked by the shell", () => {
    const manifest = validManifest({
      verificationEvidence: [
        {
          id: "ver-1",
          command: "npm.cmd run build",
          status: "passed",
          outputSha256: "c".repeat(64),
          outputPreview: [
            "> zai-mi@0.0.1 build",
            "> tsc --noEmit --skipLibCheck --allowJs --checkJs false 2>/dev/null || echo 'TypeScript check complete'",
            "",
            "error TS18003: No inputs were found in config file '/home/www/zai-mi/tsconfig.json'.",
            "TypeScript check complete",
          ].join("\n"),
          outputPreviewTruncated: false,
        },
      ],
    });

    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: validActivityLog("npm.cmd run build"),
      },
      manifestJson: JSON.stringify(manifest),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "contradictory_verification_claim",
        "missing_verification_evidence",
        "missing_acceptance_evidence",
      ]),
    );
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

  it("rejects repository inspection tools as passed implementation verification", () => {
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
      manifestJson: JSON.stringify(
        validManifest({
          verificationEvidence: [
            {
              id: "ver-1",
              command: "read_file src/index.ts",
              status: "passed",
              outputSha256: "a".repeat(64),
              outputPreview: "src/index.ts contains the implementation.",
              outputPreviewTruncated: false,
            },
          ],
        }),
      ),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.issues.map((issue) => issue.code)).toContain("unsupported_verification_command");
    expect(result.issues.map((issue) => issue.code)).toContain("missing_verification_evidence");
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

  it("treats npm.cmd and npm as the same observed verification command on Linux runners", () => {
    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: validActivityLog("npm run build"),
      },
      manifestJson: JSON.stringify(
        validManifest({
          verificationEvidence: [
            {
              id: "ver-1",
              command: "npm.cmd run build",
              status: "passed",
              outputSha256: "a".repeat(64),
              outputPreview: "> app@1.0.0 build\n> tsc\n",
              outputPreviewTruncated: false,
            },
          ],
        }),
      ),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.ok).toBe(true);
    expect(result.issues.map((entry) => entry.code)).not.toContain(
      "verification_command_not_observed",
    );
  });

  it("treats npm exec tsc as equivalent to npx tsc for observed verification", () => {
    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: validActivityLog("npm.cmd exec -- tsc --noEmit -p tsconfig.app.json"),
      },
      manifestJson: JSON.stringify(
        validManifest({
          verificationEvidence: [
            {
              id: "ver-1",
              command: "npx tsc --noEmit",
              status: "passed",
              outputSha256: "a".repeat(64),
              outputPreview: "tsc passed",
              outputPreviewTruncated: false,
            },
          ],
        }),
      ),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.ok).toBe(true);
    expect(result.issues.map((entry) => entry.code)).not.toContain(
      "verification_command_not_observed",
    );
  });

  it("keeps audit evidence lines inside the latest implementation activity section", () => {
    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: [
          "[2026-05-29T10:00:00.000Z] Agent: aif-implement started",
          "[2026-05-29T10:00:01.000Z] Agent: AuditEvidence ev-1 shell_command/discovery tool=run_shell redaction=clean",
          "[2026-05-29T10:00:02.000Z] Tool: run_shell npm.cmd run build",
          "[2026-05-29T10:00:03.000Z] Agent: aif-implement complete",
          "[2026-05-29T10:00:04.000Z] Agent: aif-review started",
        ].join("\n"),
      },
      manifestJson: JSON.stringify(
        validManifest({
          verificationEvidence: [
            {
              id: "ver-1",
              command: "npm.cmd run build",
              status: "passed",
              outputSha256: "a".repeat(64),
              outputPreview: "> app@1.0.0 build\n> tsc\n",
              outputPreviewTruncated: false,
            },
          ],
        }),
      ),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.ok).toBe(true);
    expect(result.issues.map((entry) => entry.code)).not.toContain(
      "verification_command_not_observed",
    );
  });

  it("does not block on synced=false when plan checklist counts are complete", () => {
    const result = validateImplementationManifest({
      task: {
        id: "task-feature",
        title: "Build feature",
        taskIntent: "feature",
        agentActivityLog: validActivityLog(),
      },
      manifestJson: JSON.stringify(
        validManifest({
          planChecklist: {
            total: 4,
            completed: 4,
            pending: 0,
            synced: false,
            pendingItems: [],
          },
        }),
      ),
      changedFiles: ["src/index.ts"],
      meaningfulChangedFiles: ["src/index.ts"],
      dirtyChangedFiles: ["src/index.ts"],
      phase: "review_handoff",
    });

    expect(result.ok).toBe(true);
    expect(result.issues.map((entry) => entry.code)).not.toContain("plan_checklist_drift");
  });
});
