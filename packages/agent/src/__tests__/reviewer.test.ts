import { beforeEach, describe, expect, it, vi } from "vitest";
import { projects, tasks } from "@aif/shared";
import { createTestDb } from "@aif/shared/server";

const testDb = { current: createTestDb() };
const { executeSubagentQueryMock } = vi.hoisted(() => ({
  executeSubagentQueryMock: vi.fn(),
}));

vi.mock("@aif/shared/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/shared/server")>();
  return {
    ...actual,
    getDb: () => testDb.current,
  };
});

vi.mock("../subagentQuery.js", () => ({
  executeSubagentQuery: executeSubagentQueryMock,
  startHeartbeat: () => setInterval(() => undefined, 60_000),
}));

const { runReviewer } = await import("../subagents/reviewer.js");

function sidecarOutput(previousFindingId: string): string {
  return [
    "## Blocking Findings",
    "- none",
    "",
    "## Advisories",
    "- src/review.ts:1 was inspected for the current attempt.",
    "",
    "## Previous Findings",
    `- [${previousFindingId}] still_blocking | Current attempt still lacks verification evidence in src/review.ts:1.`,
    "",
    "## Security Coverage",
    "- secret_leaks | covered | Checked changed review paths for raw secrets.",
    "- permissions_sandbox | covered | Checked permission and sandbox boundaries.",
    "- unsafe_shell_network_file | covered | Checked shell, network, and file operations.",
    "- dependency_config | covered | Checked dependency and configuration risks.",
  ].join("\n");
}

describe("runReviewer", () => {
  beforeEach(() => {
    testDb.current = createTestDb();
    executeSubagentQueryMock.mockReset();
  });

  it("passes redacted rework snapshot context to code and security sidecars", async () => {
    const prompts = new Map<string, string>();
    executeSubagentQueryMock.mockImplementation(
      async (input: { agentName: string; prompt: string }) => {
        prompts.set(input.agentName, input.prompt);
        return {
          resultText: input.agentName.includes("security")
            ? sidecarOutput("sec-1")
            : sidecarOutput("code-1"),
        };
      },
    );

    const db = testDb.current;
    db.insert(projects)
      .values({
        id: "project-1",
        name: "Reviewer Context",
        rootPath: "/tmp/reviewer-context",
      })
      .run();
    db.insert(tasks)
      .values({
        id: "task-reviewer-context",
        projectId: "project-1",
        title: "Review context",
        description: "Verify reviewer receives closure context",
        status: "review",
        useSubagents: true,
        implementationLog: "Changed src/review.ts and ran npm.cmd test.",
        reviewIterationCount: 1,
        autoReviewStateJson: JSON.stringify({
          strategy: "closure_first",
          iteration: 2,
          findings: [
            {
              id: "code-1",
              source: "code_review",
              text: "Preserve prior blocker status without echoing sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
            },
            {
              id: "sec-1",
              source: "security_audit",
              text: "Verify secret leak handling remains redacted",
            },
          ],
          reworkSnapshot: {
            iteration: 2,
            artifactPath: ".",
            artifactContentSha: null,
            findingIds: ["code-1", "sec-1"],
            baselineHeadSha: "abc123",
            changedFilesDigest: "digest-abc",
            changedFilesSummary: [
              "M packages/agent/src/reviewGate.ts",
              "M packages/agent/src/subagents/reviewer.ts",
            ],
            requiredEvidenceByFindingId: {
              "code-1":
                "Run npm.cmd test and do not expose sk-proj-abcdefghijklmnopqrstuvwxyz1234567890.",
              "sec-1": "Confirm https://private.example.invalid/secrets is redacted.",
            },
            forbiddenChanges: [
              "Do not edit unrelated files or print token=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890.",
            ],
          },
        }),
      })
      .run();

    await runReviewer("task-reviewer-context", "/tmp/reviewer-context");

    const reviewPrompt = prompts.get("review-sidecar") ?? "";
    const securityPrompt = prompts.get("security-sidecar") ?? "";

    for (const prompt of [reviewPrompt, securityPrompt]) {
      expect(prompt).toContain("Auto-review rework context:");
      expect(prompt).toContain("exact blocker ids: code-1, sec-1");
      expect(prompt).toContain("required evidence by blocker id:");
      expect(prompt).toContain("[code-1]");
      expect(prompt).toContain("[sec-1]");
      expect(prompt).toContain("forbidden unrelated changes:");
      expect(prompt).toContain("baselineHeadSha: abc123");
      expect(prompt).toContain("changedFilesDigest: digest-abc");
      expect(prompt).toContain("M packages/agent/src/reviewGate.ts");
      expect(prompt).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz1234567890");
      expect(prompt).not.toContain("https://private.example.invalid/secrets");
    }
  });
});
