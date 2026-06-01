import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAutoReviewFindingId } from "../reviewContract.js";
import { formatAuditSynthesisOutcomeForArtifact } from "@aif/shared";

const {
  executeSubagentQueryMock,
  findRoadmapBatchArtifactByTaskIdMock,
  listAuditEvidenceEventsMock,
} = vi.hoisted(() => ({
  executeSubagentQueryMock: vi.fn(),
  findRoadmapBatchArtifactByTaskIdMock: vi.fn(),
  listAuditEvidenceEventsMock: vi.fn(),
}));

vi.mock("../subagentQuery.js", () => ({
  executeSubagentQuery: executeSubagentQueryMock,
}));

vi.mock("@aif/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aif/data")>();
  return {
    ...actual,
    findRoadmapBatchArtifactByTaskId: findRoadmapBatchArtifactByTaskIdMock,
    listAuditEvidenceEvents: listAuditEvidenceEventsMock,
  };
});

import { evaluateReviewCommentsForAutoMode } from "../reviewGate.js";

describe("evaluateReviewCommentsForAutoMode", () => {
  const originalAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const baseInput = {
    taskId: "test-task-1",
    projectRoot: "/tmp/test-project",
    strategy: "full_re_review" as const,
    iteration: 1,
    previousFindings: [],
    reviewComments: [
      "## Auto Review Metadata",
      "- Strategy: full_re_review",
      "- Review Iteration: 1",
      "",
      "## Previous Findings",
      "- none",
      "",
      "## Blocking Findings",
      "- none",
      "",
      "## Advisories",
      "- code_review | Looks good",
      "",
      "## Security Coverage",
      "- secret_leaks | covered | Checked secret handling",
      "- permissions_sandbox | covered | Checked sandbox boundaries",
      "- unsafe_shell_network_file | covered | Checked shell network and file operations",
      "- dependency_config | covered | Checked dependency configuration",
    ].join("\n"),
  };

  beforeEach(() => {
    executeSubagentQueryMock.mockReset();
    findRoadmapBatchArtifactByTaskIdMock.mockReset();
    findRoadmapBatchArtifactByTaskIdMock.mockReturnValue(null);
    listAuditEvidenceEventsMock.mockReset();
    listAuditEvidenceEventsMock.mockReturnValue([]);
    delete process.env.ANTHROPIC_BASE_URL;
  });

  afterAll(() => {
    if (originalAnthropicBaseUrl == null) {
      delete process.env.ANTHROPIC_BASE_URL;
      return;
    }
    process.env.ANTHROPIC_BASE_URL = originalAnthropicBaseUrl;
  });

  function initReportRepo(): string {
    return initReportRepoWithReport(
      [
        "## Finding",
        "Evidence: `src/config.ts:1` exports the reviewed configuration marker.",
        "Risk: The audit scope depends on that source configuration marker.",
        'Verification: Command `rg -n "reviewed" src/config.ts` output: `src/config.ts:1:export const reviewed = true;`',
        "",
      ].join("\n"),
    );
  }

  function initReportRepoWithReport(reportText: string): string {
    const root = mkdtempSync(join(tmpdir(), "aif-review-gate-"));
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });
    writeFileSync(join(root, "README.md"), "# reviewed\n", "utf8");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "config.ts"), "export const reviewed = true;\n", "utf8");
    execFileSync("git", ["add", "README.md", "src/config.ts"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "-m", "init", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["checkout", "-b", "feature/audit-report"], {
      cwd: root,
      stdio: "ignore",
    });
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, "reports", "audit.md"), reportText, "utf8");
    execFileSync("git", ["add", "reports/audit.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add audit report", "--no-verify"], {
      cwd: root,
      stdio: "ignore",
    });
    return root;
  }

  it("returns operator_input_required for explicit operator input findings", async () => {
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- [op-1] code_review | operator_input_required: provide the missing staging account id token=abc123",
        "",
        "## Advisories",
        "- code_review | none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("operator_input_required");
    if (result.status !== "operator_input_required") {
      throw new Error("expected operator_input_required");
    }
    expect(result.blockingFindings[0]?.text).toContain("operator_input_required:");
    expect(result.blockingFindings[0]?.text).not.toContain("abc123");
    expect(JSON.stringify(result.autoReviewState)).not.toContain("abc123");
  });

  it("normalizes concrete unprefixed operator input findings", async () => {
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- [op-2] code_review | Operator must provide the source system account id before this can be verified",
        "",
        "## Advisories",
        "- code_review | none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("operator_input_required");
    if (result.status !== "operator_input_required") {
      throw new Error("expected operator_input_required");
    }
    expect(result.blockingFindings[0]?.text).toMatch(/^operator_input_required:/);
    expect(result.blockingFindings[0]?.text).toContain("source system account id");
  });

  it("keeps repository evidence requests in implementation rework", async () => {
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- [repo-1] code_review | operator_input_required: provide the output of cat package.json and cat vitest.config.ts to confirm the current repository state",
        "",
        "## Advisories",
        "- code_review | none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }
    expect(result.blockingFindings[0]?.id).toBe("repo-1");
    expect(result.fixesMarkdown).toContain("cat package.json");
  });

  it("keeps mixed operator input and code blockers in request changes", async () => {
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- [op-3] code_review | operator_input_required: provide the target staging account id",
        "- [code-1] code_review | Fix the failing unit test in packages/agent/src/__tests__/reviewGate.test.ts before closure",
        "",
        "## Advisories",
        "- code_review | none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }
    expect(result.blockingFindings).toHaveLength(2);
    expect(result.blockingFindings.map((finding) => finding.id)).toEqual(["op-3", "code-1"]);
    expect(result.fixesMarkdown).toContain("target staging account id");
    expect(result.fixesMarkdown).toContain("Fix the failing unit test");
    expect(result.autoReviewState.findings.map((finding) => finding.id)).toEqual([
      "op-3",
      "code-1",
    ]);
  });

  it("keeps policy and security-sensitive ambiguity as manual review", async () => {
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- [sec-1] security_audit | manual_review_required: security evidence is ambiguous and unsafe to auto-close",
        "",
        "## Advisories",
        "- security_audit | none",
        "",
        "## Security Coverage",
        "- secret_leaks | not_checked | Security evidence is ambiguous",
        "- permissions_sandbox | not_checked | Security evidence is ambiguous",
        "- unsafe_shell_network_file | not_checked | Security evidence is ambiguous",
        "- dependency_config | not_checked | Security evidence is ambiguous",
      ].join("\n"),
    });

    expect(result.status).toBe("manual_review_required");
  });

  it("routes manual-review audit validator fingerprints fail-closed", async () => {
    const root = initReportRepoWithReport(
      [
        "## Finding",
        "Evidence: `README.md:1` contains the repository root documentation.",
        "Risk: `README.md` does not exist, so operators cannot read the project overview.",
        "Proposed fix: Restore `README.md`.",
        'Verification: Command `rg -n "reviewed" README.md` output: `README.md:1:# reviewed`',
        "",
      ].join("\n"),
    );
    findRoadmapBatchArtifactByTaskIdMock.mockReturnValue({
      taskId: "audit-task",
      role: "report",
      artifactPath: "reports/audit.md",
      batchId: "batch-1",
    });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      taskId: "audit-task",
      projectRoot: root,
      task: {
        id: "audit-task",
        title: "Audit report",
        description: "Scope: README.md\nReport artifact: reports/audit.md",
        agentActivityLog: agentActivityLog(),
      },
    });

    expect(result.status).toBe("manual_review_required");
    const text = result.blockingFindings.map((finding) => finding.text).join("\n");
    expect(text).toContain("manual_review_required: Audit report validator blocked completion");
    expect(text).toContain("validationFingerprint=");
    expect(text).toContain("repairMode=manual_review_required");
  });

  function structuredAdvisoryOnlyReviewComments(): string {
    return [
      "## Auto Review Metadata",
      "- Strategy: full_re_review",
      "- Review Iteration: 1",
      "",
      "## Previous Findings",
      "- none",
      "",
      "## Blocking Findings",
      "- none",
      "",
      "## Advisories",
      "- code_review | The audit report was committed and reviewed.",
      "",
      "## Security Coverage",
      "- secret_leaks | covered | Checked secret handling",
      "- permissions_sandbox | covered | Checked sandbox boundaries",
      "- unsafe_shell_network_file | covered | Checked shell network and file operations",
      "- dependency_config | covered | Checked dependency configuration",
    ].join("\n");
  }

  function agentActivityLog(
    input: {
      implementationTools?: boolean;
      reviewTools?: boolean;
    } = {},
  ): string {
    const implementationTools = input.implementationTools ?? true;
    const reviewTools = input.reviewTools ?? true;
    return [
      "[2026-05-11T00:00:00.000Z] Agent: implement-coordinator started",
      ...(implementationTools ? ["[2026-05-11T00:00:01.000Z] Tool: read_file README.md"] : []),
      "[2026-05-11T00:00:02.000Z] Agent: implement-coordinator complete",
      "[2026-05-11T00:00:03.000Z] Agent: review-sidecar started",
      ...(reviewTools ? ["[2026-05-11T00:00:04.000Z] Tool: read_file README.md"] : []),
      "[2026-05-11T00:00:05.000Z] Agent: review-sidecar complete",
    ].join("\n");
  }

  function syntheticGitReport(): string {
    return [
      "## Finding",
      "Evidence: `README.md:1` contains the repository root documentation.",
      "Risk: Placeholder git output can make a weak audit report look verified.",
      "Proposed fix: Replace placeholder git output with observed command output.",
      "Verification: Command `git log -1 --oneline -- reports/audit.md` output:",
      "```",
      "1234567 (HEAD -> main)",
      "```",
      "",
    ].join("\n");
  }

  it.each([
    {
      name: "malformed audit report manifest JSON",
      issueCode: "invalid_report_manifest",
      description: "Report artifact: reports/audit.md",
      reportText: () =>
        [
          "No validated findings.",
          "",
          "Checked files:",
          "- `README.md:1`",
          "",
          "```audit-report-manifest",
          '{"version":1,"contentSha256":',
          "```",
          "",
        ].join("\n"),
    },
    {
      name: "placeholder manifest hash and snapshot",
      issueCode: "missing_report_manifest_fields",
      description: "Report artifact: reports/audit.md",
      reportText: () =>
        [
          "No validated findings.",
          "",
          "Checked files:",
          "- `README.md:1`",
          "",
          "```audit-report-manifest",
          JSON.stringify(
            {
              version: 1,
              auditPlanId: "audit-task",
              taskId: "audit-task",
              artifactPath: "reports/audit.md",
              contentSha256: "<computed_sha256>",
              sourceSnapshot: {
                id: "<snapshot>",
                commit: "<commit>",
                tree: "<tree>",
                branch: "feature/audit-report",
                dirty: false,
              },
              outcome: "validated_no_findings",
              scopeCoverage: [],
              riskHypotheses: [],
              findings: [],
              noFindingsClaims: [],
              evidenceRefs: [],
            },
            null,
            2,
          ),
          "```",
          "",
        ].join("\n"),
    },
    {
      name: "synthetic git output",
      issueCode: "synthetic_git_output",
      description: "Report artifact: reports/audit.md",
      reportText: syntheticGitReport,
    },
    {
      name: "contradictory no-findings semantics",
      issueCode: "contradictory_findings_and_no_findings",
      description: "Report artifact: reports/audit.md",
      reportText: () =>
        [
          "## Finding",
          "Evidence: `README.md:1` contains the repository root documentation.",
          "Risk: The report contradicts itself about whether findings exist.",
          "Proposed fix: Remove the contradictory no-findings claim.",
          "- Verification: Command `rg reviewed README.md` output: `1:# reviewed`",
          "",
          "No validated findings.",
          "",
          "Checked files:",
          "- `README.md:1`",
          "",
          "Checked commands:",
          "- Command `rg reviewed README.md` output: `1:# reviewed`",
          "",
        ].join("\n"),
    },
    {
      name: "missing declared scope coverage",
      issueCode: "missing_scope_coverage",
      description: [
        "Scope: src",
        "Report artifact: reports/audit.md",
        "Evidence requirements: include Evidence:, Risk:, Proposed fix:, and Verification:.",
      ].join("\n"),
      reportText: () =>
        [
          "No validated findings.",
          "",
          "Checked files:",
          "- `README.md:1`",
          "",
          "Checked commands:",
          "- Command `rg reviewed README.md` output: `1:# reviewed`",
          "",
        ].join("\n"),
    },
    {
      name: "governance-only findings",
      issueCode: "governance_observation_as_finding",
      description: "Report artifact: reports/audit.md",
      reportText: () =>
        [
          "## Finding",
          "Evidence: `README.md:1` contains the repository root documentation.",
          "Risk: Overlap in task/workflow routing can make ownership unclear.",
          "Proposed fix: Add a branch naming convention and ownership policy.",
          "- Verification: Command `rg reviewed README.md` output: `1:# reviewed`",
          "",
        ].join("\n"),
    },
  ])(
    "converts validator rejection for $name into structured blocking findings",
    async ({ issueCode, description, reportText }) => {
      const root = initReportRepoWithReport(reportText());

      const result = await evaluateReviewCommentsForAutoMode({
        ...baseInput,
        projectRoot: root,
        reviewComments: structuredAdvisoryOnlyReviewComments(),
        task: {
          id: "audit-task",
          title: "Full repository audit",
          description,
        },
      });

      expect(result.status).toBe("request_changes");
      expect(result.metrics.parserMode).toBe("structured");
      expect(result.blockingFindings.some((finding) => finding.source === "review_gate")).toBe(
        true,
      );
      expect(result.blockingFindings.map((finding) => finding.text).join("\n")).toContain(
        `(${issueCode})`,
      );
      expect(result.fixesMarkdown).toContain("Audit report validator blocked completion");
      expect(executeSubagentQueryMock).not.toHaveBeenCalled();
    },
  );

  it("returns success for structured review comments with no blocking findings", async () => {
    const result = await evaluateReviewCommentsForAutoMode(baseInput);

    expect(result).toEqual({
      status: "success",
      metrics: expect.objectContaining({
        strategy: "full_re_review",
        iteration: 1,
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      }),
      blockingFindings: [],
      fixesMarkdown: "- none",
      autoReviewState: null,
    });
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "missing Security Coverage",
      securityCoverage: [] as string[],
    },
    {
      name: "partial Security Coverage",
      securityCoverage: [
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
      ],
    },
    {
      name: "duplicate Security Coverage",
      securityCoverage: [
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- secret_leaks | covered | Checked secret handling again",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ],
    },
  ])(
    "requests exact rework for first malformed structured comments with $name",
    async ({ securityCoverage }) => {
      const reviewComments = [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Looks good",
        ...(securityCoverage.length > 0 ? ["", ...securityCoverage] : []),
      ].join("\n");
      const result = await evaluateReviewCommentsForAutoMode({
        ...baseInput,
        reviewComments,
      });

      expect(result.status).toBe("request_changes");
      if (result.status !== "request_changes") {
        throw new Error("expected request_changes");
      }
      expect(result.metrics.parserMode).toBe("structured");
      expect(result.blockingFindings).toEqual([
        expect.objectContaining({
          source: "review_gate",
          text: expect.stringContaining("Structured review parse error"),
        }),
      ]);
      expect(result.fixesMarkdown).toContain(
        "Repair the structured review output exactly as follows",
      );
      expect(executeSubagentQueryMock).not.toHaveBeenCalled();
    },
  );

  it("manual-handoffs repeated same malformed structured parse fingerprint", async () => {
    const reviewComments = [
      "## Auto Review Metadata",
      "- Strategy: full_re_review",
      "- Review Iteration: 2",
      "",
      "## Previous Findings",
      "- none",
      "",
      "## Blocking Findings",
      "- none",
      "",
      "## Advisories",
      "- code_review | Looks good",
    ].join("\n");
    const firstResult = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      reviewComments,
    });
    expect(firstResult.status).toBe("request_changes");
    if (firstResult.status !== "request_changes") {
      throw new Error("expected first request_changes");
    }

    const repeatedResult = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 3,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 3",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Looks good",
      ].join("\n"),
      previousFindings: firstResult.blockingFindings,
    });

    expect(repeatedResult.status).toBe("manual_review_required");
    if (repeatedResult.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }
    expect(repeatedResult.handoffReason).toBe("malformed_structured_review_contract");
    expect(repeatedResult.blockingFindings.map((finding) => finding.id)).toContain(
      firstResult.blockingFindings[0]?.id,
    );
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it.each(["1abc", "1.5"])(
    "fails closed instead of accepting malformed Review Iteration metadata %s",
    async (iteration) => {
      const result = await evaluateReviewCommentsForAutoMode({
        ...baseInput,
        reviewComments: [
          "## Auto Review Metadata",
          "- Strategy: full_re_review",
          `- Review Iteration: ${iteration}`,
          "",
          "## Previous Findings",
          "- none",
          "",
          "## Blocking Findings",
          "- none",
          "",
          "## Advisories",
          "- code_review | packages/agent/src/reviewGate.ts:1 was inspected.",
          "",
          "## Security Coverage",
          "- secret_leaks | covered | Checked secret handling",
          "- permissions_sandbox | covered | Checked sandbox boundaries",
          "- unsafe_shell_network_file | covered | Checked shell network and file operations",
          "- dependency_config | covered | Checked dependency configuration",
        ].join("\n"),
      });

      expect(result.status).toBe("request_changes");
      if (result.status !== "request_changes") {
        throw new Error("expected request_changes");
      }
      expect(result.autoReviewState.findings).toEqual([
        expect.objectContaining({
          source: "review_gate",
          text: expect.stringContaining("invalid_metadata"),
        }),
      ]);
      expect(executeSubagentQueryMock).not.toHaveBeenCalled();
    },
  );

  it("routes reviewer-generated sidecar contract failure comments to rework", async () => {
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "- Contract Failure: structured_review_sidecar",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- [structured-review-contract] review_gate | Structured review contract not satisfied: review output must include complete unique Security Coverage rows for secret_leaks, permissions_sandbox, unsafe_shell_network_file, and dependency_config. Failed sidecar(s): security_audit.",
        "",
        "## Advisories",
        "- review_gate | Raw sidecar output is retained below with provider-text redaction applied.",
        "",
        "## Security Coverage",
        "- secret_leaks | not_checked | Structured review contract failed before secret-leak coverage could be trusted.",
        "- permissions_sandbox | not_checked | Structured review contract failed before permission and sandbox coverage could be trusted.",
        "- unsafe_shell_network_file | not_checked | Structured review contract failed before shell, network, and file-operation coverage could be trusted.",
        "- dependency_config | not_checked | Structured review contract failed before dependency and configuration coverage could be trusted.",
        "",
        "## Raw Code Review",
        "## Blocking Findings",
        "- none",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }
    expect(result.metrics.parserMode).toBe("structured");
    expect(result.blockingFindings).toEqual([
      expect.objectContaining({
        source: "review_gate",
        text: expect.stringContaining("complete unique Security Coverage rows"),
      }),
    ]);
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it("preserves specialized role blockers when sidecar contract failure comments are malformed", async () => {
    const specializedText =
      "manual_review_required: security_data_loss reviewer was unavailable: runtime policy blocked reviewer role.";
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "- Contract Failure: structured_review_sidecar",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- [structured-review-contract] review_gate | Structured review contract not satisfied: review output must include complete unique Security Coverage rows for secret_leaks, permissions_sandbox, unsafe_shell_network_file, and dependency_config. Failed sidecar(s): security_audit.",
        `- [specialized-security] security_data_loss | ${specializedText}`,
        "",
        "## Advisories",
        "- review_gate | Raw sidecar output is retained below with provider-text redaction applied.",
        "- security_data_loss | Raw specialized reviewer output is retained below with provider-text redaction applied.",
        "",
        "## Security Coverage",
        "- secret_leaks | not_checked | Structured review contract failed before secret-leak coverage could be trusted.",
        "- permissions_sandbox | not_checked | Structured review contract failed before permission and sandbox coverage could be trusted.",
        "- unsafe_shell_network_file | not_checked | Structured review contract failed before shell, network, and file-operation coverage could be trusted.",
        "- dependency_config | not_checked | Structured review contract failed before dependency and configuration coverage could be trusted.",
        "",
        "## Raw Code Review",
        "## Blocking Findings",
        "- none",
      ].join("\n"),
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }
    expect(result.autoReviewState.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "specialized-security",
          source: "security_data_loss",
          text: specializedText,
        }),
      ]),
    );
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it("ignores raw embedded sidecar headings when parsing the canonical summary", async () => {
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | README.md:1 was inspected.",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
        "",
        "## Raw Code Review",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- README.md:1 was inspected.",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Raw Security Audit",
        "## Blocking Findings",
        "- none",
      ].join("\n"),
    });

    expect(result.status).toBe("success");
    expect(result.metrics.parserMode).toBe("structured");
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it("returns request_changes with persisted autoReviewState for structured blockers", async () => {
    const blockerId = createAutoReviewFindingId("code_review", "Add null guard before plan sync");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        `- [${blockerId}] code_review | Add null guard before plan sync`,
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }

    expect(result.metrics).toEqual(
      expect.objectContaining({
        previousBlockingCount: 0,
        stillBlockingCount: 0,
        newBlockingCount: 1,
        totalBlockingCount: 1,
        parserMode: "structured",
      }),
    );
    expect(result.autoReviewState.findings).toEqual([
      {
        id: blockerId,
        source: "code_review",
        text: "Add null guard before plan sync",
        firstSeenIteration: 1,
        lastSeenIteration: 1,
        streak: 1,
      },
    ]);
    expect(result.fixesMarkdown).toContain(blockerId);
  });

  it("increments streak metadata when the same blocker survives rework", async () => {
    const blockerId = createAutoReviewFindingId("code_review", "Keep the audit report scoped");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "code_review",
          text: "Keep the audit report scoped",
          firstSeenIteration: 1,
          lastSeenIteration: 1,
          streak: 1,
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${blockerId}] code_review | still_blocking | Keep the audit report scoped`,
        "",
        "## Blocking Findings",
        `- [${blockerId}] code_review | Keep the audit report scoped`,
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }
    expect(result.autoReviewState.findings[0]).toEqual(
      expect.objectContaining({
        id: blockerId,
        firstSeenIteration: 1,
        lastSeenIteration: 2,
        streak: 2,
      }),
    );
  });

  it("does not accept a previous finding marked still_blocking when the blocking section is empty", async () => {
    const blockerId = createAutoReviewFindingId("code_review", "Keep the audit report scoped");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "code_review",
          text: "Keep the audit report scoped",
          firstSeenIteration: 1,
          lastSeenIteration: 1,
          streak: 1,
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${blockerId}] code_review | still_blocking | Closure evidence is missing`,
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }
    expect(result.blockingFindings).toEqual([
      expect.objectContaining({
        id: blockerId,
        text: "Closure evidence is missing",
        streak: 2,
      }),
    ]);
  });

  it("accepts exact previous-finding closure when the structured review marks it resolved", async () => {
    const blockerId = createAutoReviewFindingId("code_review", "Add null guard before plan sync");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "code_review",
          text: "Add null guard before plan sync",
          firstSeenIteration: 1,
          lastSeenIteration: 1,
          streak: 1,
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${blockerId}] code_review | resolved | Guard is present in \`packages/agent/src/planSync.ts\` around the changed plan sync path`,
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Reviewed the changed guard path.",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("success");
    expect(result.metrics).toEqual(
      expect.objectContaining({
        previousBlockingCount: 1,
        stillBlockingCount: 0,
        newBlockingCount: 0,
        totalBlockingCount: 0,
        parserMode: "structured",
      }),
    );
  });

  it("accepts not_reproducible previous-finding closure only with concrete evidence", async () => {
    const blockerId = createAutoReviewFindingId("security_audit", "Remove token echo from logs");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "security_audit",
          text: "Remove token echo from logs",
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${blockerId}] security_audit | not_reproducible | Inspected \`packages/agent/src/reviewContract.ts\`; command output showed no token echo path remains`,
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("success");
    expect(result.metrics.stillBlockingCount).toBe(0);
  });

  it("requires manual review for not_reproducible without concrete evidence", async () => {
    const blockerId = createAutoReviewFindingId("security_audit", "Remove token echo from logs");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "security_audit",
          text: "Remove token echo from logs",
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${blockerId}] security_audit | not_reproducible | Could not reproduce`,
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }
    expect(result.autoReviewState.findings).toEqual([
      expect.objectContaining({
        id: blockerId,
        text: "Remove token echo from logs",
      }),
    ]);
  });

  it.each(["new_blocker", "manual_review_required"] as const)(
    "keeps previous finding status %s as an unresolved blocker",
    async (status) => {
      const blockerId = createAutoReviewFindingId("code_review", "Keep exact blocker IDs");
      const result = await evaluateReviewCommentsForAutoMode({
        ...baseInput,
        iteration: 2,
        previousFindings: [
          {
            id: blockerId,
            source: "code_review",
            text: "Keep exact blocker IDs",
          },
        ],
        reviewComments: [
          "## Auto Review Metadata",
          "- Strategy: full_re_review",
          "- Review Iteration: 2",
          "",
          "## Previous Findings",
          `- [${blockerId}] code_review | ${status} | Reviewer requires operator-visible closure in \`packages/agent/src/reviewGate.ts\``,
          "",
          "## Blocking Findings",
          "- none",
          "",
          "## Advisories",
          "- none",
          "",
          "## Security Coverage",
          "- secret_leaks | covered | Checked secret handling",
          "- permissions_sandbox | covered | Checked sandbox boundaries",
          "- unsafe_shell_network_file | covered | Checked shell network and file operations",
          "- dependency_config | covered | Checked dependency configuration",
        ].join("\n"),
      });

      expect(result.status).toBe("request_changes");
      if (result.status !== "request_changes") {
        throw new Error("expected request_changes");
      }
      expect(result.metrics.stillBlockingCount).toBe(1);
      expect(result.autoReviewState.findings).toEqual([
        expect.objectContaining({
          id: blockerId,
          status,
          text: "Reviewer requires operator-visible closure in `packages/agent/src/reviewGate.ts`",
        }),
      ]);
      expect(result.autoReviewState.blockerHistory).toEqual([
        expect.objectContaining({
          id: blockerId,
          status,
        }),
      ]);
    },
  );

  it.each(["still_blocking", "new_blocker", "manual_review_required"] as const)(
    "preserves previous finding status %s when canonical blocking rows repeat the same id",
    async (status) => {
      const blockerId = createAutoReviewFindingId("code_review", "Keep exact blocker IDs");
      const result = await evaluateReviewCommentsForAutoMode({
        ...baseInput,
        iteration: 2,
        previousFindings: [
          {
            id: blockerId,
            source: "code_review",
            text: "Keep exact blocker IDs",
          },
        ],
        reviewComments: [
          "## Auto Review Metadata",
          "- Strategy: full_re_review",
          "- Review Iteration: 2",
          "",
          "## Previous Findings",
          `- [${blockerId}] code_review | ${status} | Reviewer requires operator-visible closure in \`packages/agent/src/reviewGate.ts\``,
          "",
          "## Blocking Findings",
          `- [${blockerId}] code_review | Reviewer requires operator-visible closure in \`packages/agent/src/reviewGate.ts\``,
          "",
          "## Advisories",
          "- none",
          "",
          "## Security Coverage",
          "- secret_leaks | covered | Checked secret handling",
          "- permissions_sandbox | covered | Checked sandbox boundaries",
          "- unsafe_shell_network_file | covered | Checked shell network and file operations",
          "- dependency_config | covered | Checked dependency configuration",
        ].join("\n"),
      });

      expect(result.status).toBe("request_changes");
      if (result.status !== "request_changes") {
        throw new Error("expected request_changes");
      }
      expect(result.autoReviewState.findings).toEqual([
        expect.objectContaining({
          id: blockerId,
          status,
          text: "Reviewer requires operator-visible closure in `packages/agent/src/reviewGate.ts`",
        }),
      ]);
    },
  );

  it("does not close strict audit validator blockers from resolved prose while validation still fails", async () => {
    const root = initReportRepoWithReport(
      [
        "No validated findings.",
        "",
        "Checked files:",
        "- `README.md:1`",
        "",
        "Checked commands:",
        "- Command `rg reviewed README.md` output: `1:# reviewed`",
        "",
      ].join("\n"),
    );
    const blockerId = "deterministic_repair_missing_scope_coverage";
    const previousText =
      "Audit report validator blocked completion (missing_scope_coverage): Report artifact does not cover declared audit scope roots.";

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "review_gate",
          text: previousText,
          firstSeenIteration: 1,
          lastSeenIteration: 1,
          streak: 1,
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${blockerId}] review_gate | resolved | Manifest, evidenceRefs, and scope coverage are present in \`reports/audit.md\` after the deterministic rewrite`,
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Reviewer claimed the audit report was resolved.",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
      task: {
        id: "audit-task",
        title: "Full repository audit",
        description: [
          "Scope: src",
          "Report artifact: reports/audit.md",
          "Evidence requirements: include Evidence:, Risk:, Proposed fix:, and Verification:.",
        ].join("\n"),
        agentActivityLog: agentActivityLog(),
      },
    });

    expect(result.status).toBe("request_changes");
    expect(result.metrics.stillBlockingCount).toBe(1);
    expect(result.blockingFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: blockerId,
          text: previousText,
          streak: 2,
        }),
      ]),
    );
    expect(result.blockingFindings.map((finding) => finding.text).join("\n")).toContain(
      "(missing_scope_coverage)",
    );
  });

  it("does not accept a vague resolved note as previous-finding closure evidence", async () => {
    const blockerId = createAutoReviewFindingId("code_review", "Add null guard before plan sync");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "code_review",
          text: "Add null guard before plan sync",
          firstSeenIteration: 1,
          lastSeenIteration: 1,
          streak: 1,
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${blockerId}] code_review | resolved | fixed`,
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }
    expect(result.handoffReason).toBe("malformed_review_output_fallback");
    expect(result.autoReviewState.findings).toEqual([
      expect.objectContaining({
        id: blockerId,
        source: "code_review",
        text: "Add null guard before plan sync",
        streak: 2,
      }),
    ]);
  });

  it("does not accept keyword-only resolved notes as concrete closure evidence", async () => {
    const blockerId = createAutoReviewFindingId("code_review", "Add null guard before plan sync");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "code_review",
          text: "Add null guard before plan sync",
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${blockerId}] code_review | resolved | verified in tests after applying the fix`,
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }
    expect(result.autoReviewState.findings.map((finding) => finding.id)).toEqual([blockerId]);
  });

  it.each([
    {
      name: "strategy",
      metadata: ["- Strategy: closure_first", "- Review Iteration: 2"],
    },
    {
      name: "iteration",
      metadata: ["- Strategy: full_re_review", "- Review Iteration: 1"],
    },
  ])("does not accept stale structured review metadata for $name", async ({ metadata }) => {
    const blockerId = createAutoReviewFindingId("code_review", "Add null guard before plan sync");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "code_review",
          text: "Add null guard before plan sync",
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        ...metadata,
        "",
        "## Previous Findings",
        `- [${blockerId}] code_review | resolved | Guard is present in \`packages/agent/src/planSync.ts\` around the changed plan sync path`,
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }
    expect(result.autoReviewState.findings.map((finding) => finding.id)).toEqual([blockerId]);
  });

  it("does not accept structured success when previous findings are omitted", async () => {
    const blockerId = createAutoReviewFindingId("code_review", "Add null guard before plan sync");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "code_review",
          text: "Add null guard before plan sync",
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Looks good.",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }
    expect(result.autoReviewState.findings.map((finding) => finding.id)).toContain(blockerId);
    expect(result.autoReviewState.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "review_gate",
          text: expect.stringContaining("missing_previous_finding"),
        }),
      ]),
    );
    expect(result.metrics).toEqual(
      expect.objectContaining({
        previousBlockingCount: 1,
        stillBlockingCount: 1,
        totalBlockingCount: 2,
      }),
    );
  });

  it("does not accept structured success when one of multiple previous findings is missing", async () => {
    const firstId = createAutoReviewFindingId("code_review", "Add null guard before plan sync");
    const secondId = createAutoReviewFindingId("security_audit", "Validate shell argument");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: firstId,
          source: "code_review",
          text: "Add null guard before plan sync",
        },
        {
          id: secondId,
          source: "security_audit",
          text: "Validate shell argument",
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${firstId}] code_review | resolved | Guard is present in \`packages/agent/src/planSync.ts\``,
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }
    expect(result.autoReviewState.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([firstId, secondId]),
    );
    expect(result.autoReviewState.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "review_gate",
          text: expect.stringContaining("missing_previous_finding"),
        }),
      ]),
    );
  });

  it("does not accept structured success when a previous finding has the wrong source", async () => {
    const blockerId = createAutoReviewFindingId("code_review", "Add null guard before plan sync");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: blockerId,
          source: "code_review",
          text: "Add null guard before plan sync",
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${blockerId}] security_audit | resolved | Guard is present in \`packages/agent/src/planSync.ts\``,
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }
    expect(result.autoReviewState.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: blockerId,
          source: "code_review",
        }),
        expect.objectContaining({
          source: "review_gate",
          text: expect.stringContaining("malformed_previous_finding"),
        }),
      ]),
    );
  });

  it("requests parser rework when specialized manual blockers omit previous finding rows", async () => {
    const previousId = createAutoReviewFindingId(
      "security_data_loss",
      "Verify local service validation cannot run by default",
    );
    const unavailableText =
      "manual_review_required: security_data_loss reviewer was unavailable: runtime policy blocked reviewer role.";
    const unavailableId = createAutoReviewFindingId("security_data_loss", unavailableText);

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: previousId,
          source: "security_data_loss",
          text: "Verify local service validation cannot run by default",
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        `- [${unavailableId}] security_data_loss | ${unavailableText}`,
        "",
        "## Advisories",
        "- security_data_loss | Raw specialized reviewer output is retained below with provider-text redaction applied.",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }
    expect(result.autoReviewState.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: previousId,
          source: "security_data_loss",
          text: "Verify local service validation cannot run by default",
        }),
        expect.objectContaining({
          source: "review_gate",
          text: expect.stringContaining("missing_previous_finding"),
        }),
      ]),
    );
    expect(result.autoReviewState.findings).toHaveLength(2);
    expect(result.autoReviewState.findings.map((finding) => finding.id)).not.toContain(
      unavailableId,
    );
  });

  it("starts a fresh streak for a new blocker", async () => {
    const oldId = createAutoReviewFindingId("code_review", "Remove stale evidence");
    const newId = createAutoReviewFindingId("code_review", "Add current verification output");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      iteration: 2,
      previousFindings: [
        {
          id: oldId,
          source: "code_review",
          text: "Remove stale evidence",
          firstSeenIteration: 1,
          lastSeenIteration: 1,
          streak: 1,
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${oldId}] code_review | resolved | Stale evidence was removed from \`reports/audit.md\``,
        "",
        "## Blocking Findings",
        `- [${newId}] code_review | Add current verification output`,
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }
    expect(result.autoReviewState.findings[0]).toEqual(
      expect.objectContaining({
        id: newId,
        firstSeenIteration: 2,
        lastSeenIteration: 2,
        streak: 1,
      }),
    );
  });

  it("returns manual_review_required in closure_first when previous blockers are resolved but new blockers appear", async () => {
    const previousId = "prev-1";
    const newId = createAutoReviewFindingId("code_review", "Add manual review badge to done tasks");
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      strategy: "closure_first",
      iteration: 2,
      previousFindings: [
        {
          id: previousId,
          source: "code_review",
          text: "Keep rework banner visible until human action",
        },
      ],
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: closure_first",
        "- Review Iteration: 2",
        "",
        "## Previous Findings",
        `- [${previousId}] code_review | resolved | Banner is now shown in \`packages/web/src/components/tasks/TaskDetail.tsx\``,
        "",
        "## Blocking Findings",
        `- [${newId}] code_review | Add manual review badge to done tasks`,
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }

    expect(result.handoffReason).toBe("new_blockers_after_rework");
    expect(result.metrics).toEqual(
      expect.objectContaining({
        strategy: "closure_first",
        previousBlockingCount: 1,
        stillBlockingCount: 0,
        newBlockingCount: 1,
        totalBlockingCount: 1,
        parserMode: "structured",
      }),
    );
  });

  it("uses legacy fallback extraction for malformed first-pass review comments", async () => {
    executeSubagentQueryMock.mockResolvedValueOnce({
      resultText: "- Fix missing error handling in api.ts\n- Add input validation",
    });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: "## Code Review\n\nNeed fixes.",
    });

    expect(result.status).toBe("request_changes");
    if (result.status !== "request_changes") {
      throw new Error("expected request_changes");
    }

    expect(result.metrics.parserMode).toBe("fallback");
    expect(result.metrics.newBlockingCount).toBe(2);
    expect(result.autoReviewState.findings[0]?.source).toBe("review_gate");
    expect(executeSubagentQueryMock).toHaveBeenCalledTimes(1);
  });

  it("accepts legacy blocking-none comments without model fallback when report evidence is substantive", async () => {
    const root = initReportRepo();

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      reviewComments: [
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Report evidence was inspected.",
      ].join("\n"),
      task: {
        id: "audit-task",
        title: "Full repository audit",
        description: "Report artifact: reports/audit.md",
        agentActivityLog: agentActivityLog(),
      },
    });

    expect(result.status).toBe("success");
    expect(result.metrics.parserMode).toBe("fallback");
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it("does not let legacy blocking-none comments accept validator-rejected reports", async () => {
    const root = initReportRepoWithReport(syntheticGitReport());

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      reviewComments: [
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Looks good.",
      ].join("\n"),
      task: {
        id: "audit-task",
        title: "Full repository audit",
        description: "Report artifact: reports/audit.md",
        agentActivityLog: agentActivityLog(),
      },
    });

    expect(result.status).toBe("request_changes");
    expect(result.metrics.parserMode).toBe("fallback");
    expect(result.blockingFindings.map((finding) => finding.text).join("\n")).toContain(
      "(synthetic_git_output)",
    );
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it("does not accept legacy blocking-none comments as closure proof after previous blockers", async () => {
    const root = initReportRepo();
    const previous = {
      id: createAutoReviewFindingId("review_gate", "Fix the report evidence citation"),
      source: "review_gate" as const,
      text: "Fix the report evidence citation",
    };

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      strategy: "closure_first",
      iteration: 2,
      previousFindings: [previous],
      reviewComments: [
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Keep the evidence register concise.",
      ].join("\n"),
      task: {
        id: "audit-task",
        title: "Full repository audit",
        description: "Report artifact: reports/audit.md",
        agentActivityLog: agentActivityLog(),
      },
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }
    expect(result.handoffReason).toBe("malformed_review_output_fallback");
    expect(result.metrics).toEqual(
      expect.objectContaining({
        previousBlockingCount: 1,
        stillBlockingCount: 1,
        newBlockingCount: 0,
        totalBlockingCount: 1,
        parserMode: "fallback",
      }),
    );
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it("requests changes from legacy blocking findings without model fallback", async () => {
    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: [
        "## Blocking Findings",
        "- Fix the report evidence citation",
        "- Remove unrelated source edits",
        "",
        "## Advisories",
        "- none",
      ].join("\n"),
    });

    expect(result.status).toBe("request_changes");
    expect(result.metrics.parserMode).toBe("fallback");
    expect(result.blockingFindings.map((finding) => finding.text)).toEqual([
      "Fix the report evidence citation",
      "Remove unrelated source edits",
    ]);
    expect(executeSubagentQueryMock).not.toHaveBeenCalled();
  });

  it("keeps sidecar blockers additive when deterministic validation also fails", async () => {
    const root = initReportRepoWithReport(syntheticGitReport());
    const blockerId = createAutoReviewFindingId("code_review", "Fix the reviewer-noted risk");

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        `- [${blockerId}] code_review | Fix the reviewer-noted risk`,
        "",
        "## Advisories",
        "- none",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
      task: {
        id: "audit-task",
        title: "Full repository audit",
        description: "Report artifact: reports/audit.md",
      },
    });

    expect(result.status).toBe("request_changes");
    expect(result.blockingFindings.map((finding) => finding.text)).toEqual(
      expect.arrayContaining([
        "Fix the reviewer-noted risk",
        expect.stringContaining("(synthetic_git_output)"),
      ]),
    );
  });

  it("requires manual review when malformed rework output falls back after previous blockers exist", async () => {
    executeSubagentQueryMock.mockResolvedValueOnce({
      resultText: "- New blocker discovered during fallback",
    });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      strategy: "closure_first",
      iteration: 2,
      previousFindings: [
        {
          id: "persisted-1",
          source: "code_review",
          text: "Ensure request_changes clears manual flag",
        },
      ],
      reviewComments: "legacy malformed review text",
    });

    expect(result.status).toBe("manual_review_required");
    if (result.status !== "manual_review_required") {
      throw new Error("expected manual_review_required");
    }

    expect(result.handoffReason).toBe("malformed_review_output_fallback");
    expect(result.metrics.parserMode).toBe("fallback");
    expect(result.metrics.previousBlockingCount).toBe(1);
    expect(result.metrics.stillBlockingCount).toBe(1);
    expect(result.autoReviewState.findings).toHaveLength(2);
  });

  it("throws on empty fallback response", async () => {
    executeSubagentQueryMock.mockResolvedValueOnce({ resultText: "   " });

    await expect(
      evaluateReviewCommentsForAutoMode({
        ...baseInput,
        reviewComments: "legacy malformed review text",
      }),
    ).rejects.toThrow("Review auto-check returned empty response");
  });

  it("delegates model resolution to subagentQuery on fallback (no modelOverride)", async () => {
    executeSubagentQueryMock.mockResolvedValueOnce({ resultText: "SUCCESS" });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      reviewComments: "legacy malformed review text",
    });

    expect(result.status).toBe("success");
    const call = executeSubagentQueryMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call.modelOverride).toBeUndefined();
    expect(call.suppressModelFallback).toBeUndefined();
    expect(call.workflowSpec).toEqual(expect.objectContaining({ sessionReusePolicy: "never" }));
  });

  it("does not let fallback SUCCESS accept validator-rejected reports", async () => {
    const root = initReportRepoWithReport(syntheticGitReport());
    executeSubagentQueryMock.mockResolvedValueOnce({ resultText: "SUCCESS" });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      reviewComments: "Looks good.",
      task: {
        id: "audit-task",
        title: "Full repository audit",
        description: "Report artifact: reports/audit.md",
      },
    });

    expect(result.status).toBe("request_changes");
    expect(result.metrics.parserMode).toBe("fallback");
    expect(result.blockingFindings.map((finding) => finding.text).join("\n")).toContain(
      "(synthetic_git_output)",
    );
    expect(executeSubagentQueryMock).toHaveBeenCalledTimes(1);
  });

  it("requires a report artifact even when review comments contain substantive evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "aif-review-gate-"));
    writeFileSync(join(root, "README.md"), "# reviewed\n", "utf8");

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | Evidence reviewed",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
        "",
        "## Evidence",
        "Evidence: `README.md:1` was inspected for the audit report.",
        "Risk: The report scope depends on the repository root documentation.",
        "Verification: Command `rg reviewed README.md` output matched the inspected line.",
      ].join("\n"),
      task: {
        id: "audit-task",
        title: "Full repository audit",
      },
    });

    expect(result.status).toBe("request_changes");
    expect(result.blockingFindings.map((finding) => finding.text).join("\n")).toContain(
      "(missing_report_artifact)",
    );
  });

  it("does not read unsafe persisted artifact paths while collecting review evidence refs", async () => {
    const root = mkdtempSync(join(tmpdir(), "aif-review-gate-"));
    const outsideName = `outside-audit-${Date.now()}-${Math.random().toString(16).slice(2)}.md`;
    writeFileSync(
      join(root, "..", outsideName),
      [
        "```audit-report-manifest",
        JSON.stringify({ version: 1, evidenceRefs: ["outside-ref"] }),
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    findRoadmapBatchArtifactByTaskIdMock.mockReturnValue({
      id: "artifact-1",
      batchId: "batch-1",
      taskId: "audit-task",
      artifactPath: `../${outsideName}`,
      role: "report",
      state: "expected",
    });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      taskId: "audit-task",
      projectRoot: root,
      reviewComments: structuredAdvisoryOnlyReviewComments(),
      task: {
        id: "audit-task",
        title: "Full repository audit",
        taskIntent: "audit",
        agentActivityLog: agentActivityLog(),
      },
    });

    expect(result.status).toBe("request_changes");
    expect(listAuditEvidenceEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceIds: undefined, limit: undefined }),
    );
    expect(result.blockingFindings.map((finding) => finding.text).join("\n")).toContain(
      "(missing_report_artifact)",
    );
  });

  it.each([
    {
      name: "implementation tool activity",
      issueCode: "missing_implementation_tool_activity",
      activity: agentActivityLog({ implementationTools: false, reviewTools: true }),
    },
    {
      name: "review-stage tool activity",
      issueCode: "missing_review_tool_activity",
      activity: agentActivityLog({ implementationTools: true, reviewTools: false }),
    },
  ])("blocks risky report acceptance when $name is missing", async ({ issueCode, activity }) => {
    const root = initReportRepo();

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      reviewComments: structuredAdvisoryOnlyReviewComments(),
      task: {
        id: "audit-task",
        title: "Full repository audit",
        description: "Report artifact: reports/audit.md",
        agentActivityLog: activity,
      },
    });

    expect(result.status).toBe("request_changes");
    expect(result.metrics.parserMode).toBe("structured");
    expect(result.blockingFindings.map((finding) => finding.text).join("\n")).toContain(
      `(${issueCode})`,
    );
    expect(result.fixesMarkdown).toContain("Audit completion evidence blocked review gate");
  });

  it("blocks synthesis review when persisted source outcome is inconclusive", async () => {
    const root = initReportRepoWithReport(
      [
        "# Audit Summary",
        "",
        formatAuditSynthesisOutcomeForArtifact({
          kind: "inconclusive_batch_evidence",
          reason: "Audit inconclusive: source reports were limited to inventory checks.",
          sourceReportCount: 6,
          validatedFindingCount: 0,
          substantiveNoFindingsReportCount: 0,
          inventoryOnlyNoFindingsReportCount: 6,
          weakReportCount: 0,
        }),
        "",
        "No validated findings.",
        "",
        "## Checked Files",
        "- `README.md:1`",
        "",
        "## Checked Commands",
        '- Command `rg -n "reviewed" README.md` output: `README.md:1:# reviewed`',
        "",
      ].join("\n"),
    );

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      reviewComments: structuredAdvisoryOnlyReviewComments(),
      task: {
        id: "audit-synthesis-task",
        title: "Synthesize audit findings",
        description: "Report artifact: reports/audit.md",
        taskIntent: "audit",
        auditArtifactRole: "synthesis",
        allowedEvidenceArtifactPaths: ["audit/source-a.md"],
        agentActivityLog: agentActivityLog(),
      },
    });

    expect(result.status).toBe("request_changes");
    expect(result.blockingFindings.map((finding) => finding.text).join("\n")).toContain(
      "(audit_inconclusive)",
    );
  });

  it("accepts explicit terminal audit inconclusive synthesis without forcing substantive no-findings evidence", async () => {
    const root = initReportRepoWithReport(
      [
        "# Audit Inconclusive",
        "",
        formatAuditSynthesisOutcomeForArtifact({
          kind: "inconclusive_batch_evidence",
          reason: "Audit inconclusive: source reports were weak or terminal.",
          sourceReportCount: 6,
          validatedFindingCount: 0,
          substantiveNoFindingsReportCount: 0,
          inventoryOnlyNoFindingsReportCount: 2,
          weakReportCount: 4,
        }),
        "",
        "Audit outcome: Audit inconclusive.",
        "",
        "## Child Report Status",
        "",
        "| Source report | Task | Status | Notes |",
        "| --- | --- | --- | --- |",
        "| `audit/source-a.md` | `task-source-a` | inconclusive | terminal non-trusted |",
        "",
        "## Weak/discarded findings",
        "",
        "No weak or discarded findings were promoted to validated findings.",
      ].join("\n"),
    );
    findRoadmapBatchArtifactByTaskIdMock.mockReturnValue({
      id: "artifact-synthesis",
      batchId: "batch-synthesis",
      taskId: "audit-synthesis-task",
      artifactPath: "reports/audit.md",
      role: "synthesis",
      state: "expected",
    });

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      taskId: "audit-synthesis-task",
      projectRoot: root,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "- Deterministic Review: audit_synthesis_inconclusive",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- review_gate | Deterministic review accepted terminal audit inconclusive output.",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Deterministic review inspected only the synthesis artifact.",
        "- permissions_sandbox | covered | Deterministic review used read-only artifact validation.",
        "- unsafe_shell_network_file | covered | No shell/network/file mutation was required.",
        "- dependency_config | not_applicable | No dependency or runtime configuration changed.",
      ].join("\n"),
      task: {
        id: "audit-synthesis-task",
        title: "Synthesize audit findings",
        description: "Report artifact: reports/audit.md",
        taskIntent: "audit",
        auditArtifactRole: "synthesis",
        allowedEvidenceArtifactPaths: ["audit/source-a.md"],
        agentActivityLog: agentActivityLog(),
      },
    });

    expect(result.status).toBe("success");
  });

  it("allows risky structured success when the committed report artifact is substantive", async () => {
    const root = initReportRepo();

    const result = await evaluateReviewCommentsForAutoMode({
      ...baseInput,
      projectRoot: root,
      reviewComments: [
        "## Auto Review Metadata",
        "- Strategy: full_re_review",
        "- Review Iteration: 1",
        "",
        "## Previous Findings",
        "- none",
        "",
        "## Blocking Findings",
        "- none",
        "",
        "## Advisories",
        "- code_review | The audit report was committed and reviewed.",
        "",
        "## Security Coverage",
        "- secret_leaks | covered | Checked secret handling",
        "- permissions_sandbox | covered | Checked sandbox boundaries",
        "- unsafe_shell_network_file | covered | Checked shell network and file operations",
        "- dependency_config | covered | Checked dependency configuration",
      ].join("\n"),
      task: {
        id: "audit-task",
        title: "Full repository audit",
        description: "Report artifact: reports/audit.md",
        agentActivityLog: agentActivityLog(),
      },
    });

    expect(result.status).toBe("success");
  });
});
