import { describe, expect, it } from "vitest";
import {
  buildImplementationRecoveryPack,
  buildImplementationRecoverySplitProposalFingerprint,
  renderImplementationRecoveryPackMarkdown,
  type BuildImplementationRecoveryPackInput,
} from "../implementationRecoveryPack.js";

function baseInput(
  overrides: Partial<BuildImplementationRecoveryPackInput> = {},
): BuildImplementationRecoveryPackInput {
  return {
    task: {
      id: "task-recovery",
      projectId: "project-1",
      title: "Recover implementation",
      status: "implementing",
      taskIntent: "feature",
      plan: [
        "## Plan",
        "- [x] Wire the existing service.",
        "- [ ] Finish the timeout recovery pack.",
        "- [ ] Run focused tests.",
      ].join("\n"),
    },
    projectRoot: "C:/repo",
    generatedAt: "2026-05-30T00:00:00.000Z",
    sourceStatus: "plan_ready",
    blockedFromStatus: "implementing",
    retryCount: 2,
    runtimeCategory: "timeout",
    runtimeStatus: "max_tool_turns_exhausted",
    getGitSnapshot: () => ({
      baselineHeadSha: "abc123",
      changedFilesDigest: "f".repeat(64),
      changedFilesSummary: [
        " M packages/agent/src/coordinator.ts",
        "?? packages/agent/src/implementationRecoveryPack.ts",
      ],
    }),
    ...overrides,
  };
}

describe("implementation recovery pack", () => {
  it("captures partial changes, pending checklist items, and proposed children", () => {
    const pack = buildImplementationRecoveryPack(baseInput());

    expect(pack.kind).toBe("implementation_timeout_recovery_pack");
    expect(pack.changedFiles).toMatchObject({
      source: "git",
      baselineHeadSha: "abc123",
      changedFilesDigest: "f".repeat(64),
      hasChanges: true,
    });
    expect(pack.changedFiles.changedFilesSummary).toEqual([
      "M packages/agent/src/coordinator.ts",
      "?? packages/agent/src/implementationRecoveryPack.ts",
    ]);
    expect(pack.checklist.completed).toEqual(["Wire the existing service."]);
    expect(pack.checklist.pending).toEqual([
      "Finish the timeout recovery pack.",
      "Run focused tests.",
    ]);
    expect(pack.remainingAcceptance).toEqual(
      expect.arrayContaining(["Finish the timeout recovery pack.", "Run focused tests."]),
    );
    expect(pack.proposedChildren).toHaveLength(2);
    expect(pack.proposedChildren[0]).toMatchObject({
      taskIntent: "feature",
      phaseName: "Implementation recovery",
      sequence: 1,
    });
    expect(pack.proposedChildren[0]?.description).toContain("Recovery pack:");
    expect(pack.proposedChildren[0]?.description).toContain("Changed-files digest:");
  });

  it("proposes a safe split child when there are no changed files", () => {
    const pack = buildImplementationRecoveryPack(
      baseInput({
        task: {
          id: "task-no-change",
          projectId: "project-1",
          title: "No changes",
          status: "implementing",
          taskIntent: "feature",
          plan: "## Plan\nNo checklist was recorded.",
        },
        getGitSnapshot: () => ({
          baselineHeadSha: "def456",
          changedFilesDigest: "0".repeat(64),
          changedFilesSummary: [],
        }),
      }),
    );

    expect(pack.changedFiles.hasChanges).toBe(false);
    expect(pack.proposedChildren).toHaveLength(1);
    expect(pack.proposedChildren[0]?.title).toBe("Split implementation after timeout");
    expect(pack.proposedChildren[0]?.description).toContain("decompose");
  });

  it("redacts secret-like text from markdown, metadata, and proposed children", () => {
    const manifest = {
      verificationEvidence: [
        {
          command: "curl https://internal.example.test?api_key=sk-SECRETSECRET",
          status: "failed",
          outputSha256: "abc",
          outputPreview: "token=oauth-secret bearer abc.def.ghi user@example.test",
          outputPreviewTruncated: false,
        },
      ],
      acceptanceCriteria: [
        {
          id: "AC-secret",
          status: "unsatisfied",
          description: "Remove client_secret=super-secret-value from the path",
          evidenceRefs: ["api_key=source-secret-value"],
        },
      ],
    };

    const pack = buildImplementationRecoveryPack(
      baseInput({
        task: {
          id: "task-secret",
          projectId: "project-1",
          title: "Secret api_key=title-secret-value",
          status: "implementing",
          taskIntent: "feature",
          plan: "- [ ] Fix token=plan-secret-value in https://example.test",
          implementationManifestJson: JSON.stringify(manifest),
          branchName: "feature/api_key=branch-secret-value",
          worktreePath: "C:/repo/client_secret=worktree-secret-value",
        },
        runtimeCategory: "timeout",
        runtimeStatus: "max_tool_turns_exhausted token=runtime-secret-value",
        getGitSnapshot: () => ({
          baselineHeadSha: "abc123",
          changedFilesDigest: "f".repeat(64),
          changedFilesSummary: [" M src/token=changed-secret-value.ts"],
        }),
      }),
    );
    const serialized = JSON.stringify(pack);
    const markdown = renderImplementationRecoveryPackMarkdown(pack);
    const combined = `${serialized}\n${markdown}`;

    expect(combined).not.toContain("title-secret-value");
    expect(combined).not.toContain("plan-secret-value");
    expect(combined).not.toContain("runtime-secret-value");
    expect(combined).not.toContain("branch-secret-value");
    expect(combined).not.toContain("worktree-secret-value");
    expect(combined).not.toContain("changed-secret-value");
    expect(combined).not.toContain("source-secret-value");
    expect(combined).not.toContain("super-secret-value");
    expect(combined).not.toContain("oauth-secret");
    expect(combined).not.toContain("user@example.test");
    expect(combined).not.toContain("https://example.test");
    expect(combined).toContain("[REDACTED]");
  });

  it("builds a deterministic fingerprint excluding generated time", () => {
    const first = buildImplementationRecoveryPack(
      baseInput({ generatedAt: "2026-05-30T00:00:00.000Z" }),
    );
    const second = buildImplementationRecoveryPack(
      baseInput({ generatedAt: "2026-05-30T01:00:00.000Z" }),
    );
    const changed = buildImplementationRecoveryPack(
      baseInput({
        generatedAt: "2026-05-30T01:00:00.000Z",
        task: {
          id: "task-recovery",
          projectId: "project-1",
          title: "Recover implementation",
          status: "implementing",
          taskIntent: "feature",
          plan: "## Plan\n- [ ] Different remaining item.",
        },
      }),
    );

    expect(buildImplementationRecoverySplitProposalFingerprint(first)).toBe(
      buildImplementationRecoverySplitProposalFingerprint(second),
    );
    expect(buildImplementationRecoverySplitProposalFingerprint(changed)).not.toBe(
      buildImplementationRecoverySplitProposalFingerprint(first),
    );
  });
});
