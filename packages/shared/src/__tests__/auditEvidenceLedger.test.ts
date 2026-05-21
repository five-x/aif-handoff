import { describe, expect, it } from "vitest";
import {
  AUDIT_EVIDENCE_KINDS,
  EVIDENCE_UNIT_KINDS,
  buildAuditEvidencePayload,
  buildAuditEvidenceUnit,
  buildEvidenceUnit,
  buildEvidenceUnitPayload,
  deriveAuditEvidenceScopeIdsFromPaths,
  readEvidenceUnitRuntimePayload,
} from "../auditEvidenceLedger.js";

describe("auditEvidenceLedger", () => {
  it("exposes generic evidence unit aliases over the audit ledger shape", () => {
    expect(EVIDENCE_UNIT_KINDS).toBe(AUDIT_EVIDENCE_KINDS);

    const payload = buildEvidenceUnitPayload({
      id: "ev-generic",
      toolName: "Read",
      evidenceKind: "file_read",
      paths: ["src/index.ts"],
      output: "export const ok = true;\n",
    });
    const parsed = readEvidenceUnitRuntimePayload(payload);
    const auditUnit = buildAuditEvidenceUnit(
      {
        taskId: "task-1",
        auditPlanId: "task:task-1",
        sourceSnapshotId: "git:commit:tree",
      },
      payload,
    );
    const evidenceUnit = buildEvidenceUnit(
      {
        taskId: "task-1",
        auditPlanId: "task:task-1",
        sourceSnapshotId: "git:commit:tree",
      },
      payload,
    );

    expect(parsed).toEqual(payload);
    expect(evidenceUnit).toEqual(auditUnit);
    expect(evidenceUnit).toEqual(
      expect.objectContaining({
        id: "ev-generic",
        taskId: "task-1",
        auditPlanId: "task:task-1",
        evidenceKind: "file_read",
      }),
    );
  });

  it("captures hashes and bounded redacted previews without raw secrets", () => {
    const payload = buildAuditEvidencePayload({
      toolName: "run_shell",
      evidenceKind: "shell_command",
      evidenceGrade: "substantive",
      command: { command: "rg token src", args: ["token", "src"], cwd: "." },
      output: "src/config.ts:1:OPENAI_API_KEY=sk-SECRETSECRETSECRETSECRET\n",
      paths: ["src/config.ts"],
      maxPreviewChars: 80,
    });

    expect(payload.outputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.id).toMatch(/^ev_/);
    expect(payload.outputPreview).toContain("[REDACTED]");
    expect(payload.outputPreview).not.toContain("sk-SECRET");
    expect(payload.pathHashes).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toContain("sk-SECRETSECRETSECRETSECRET");
    expect(payload.redactionStatus).toBe("redacted");
  });

  it("downgrades inventory commands to discovery evidence", () => {
    const payload = buildAuditEvidencePayload({
      toolName: "Bash",
      evidenceKind: "shell_command",
      evidenceGrade: "substantive",
      command: "git status --short",
      output: "M src/config.ts\n",
    });

    expect(payload.evidenceGrade).toBe("discovery");
  });

  it("preserves caller-provided runtime evidence ids", () => {
    const payload = buildAuditEvidencePayload({
      id: "ev_known",
      toolName: "Read",
      evidenceKind: "file_read",
      paths: ["README.md"],
      output: "# test\n",
    });

    expect(payload.id).toBe("ev_known");
  });

  it("hashes secret-like paths without deriving raw scope ids", () => {
    const payload = buildAuditEvidencePayload({
      toolName: "read_file",
      evidenceKind: "file_read",
      paths: ["audit/sk-SECRET.txt"],
      command: { command: "cat", args: ["audit/sk-SECRET.txt"], cwd: null },
      output: "read path references a secret-like path",
    });

    expect(payload.pathHashes).toHaveLength(1);
    expect(payload.scopeIds).toEqual([]);
    expect(payload.command?.args).toEqual(["audit/[REDACTED].txt"]);
    expect(payload.redactionStatus).toBe("redacted");
    expect(JSON.stringify(payload)).not.toContain("sk-SECRET");
  });

  it("does not broaden evidence scope or risks from unit identity context", () => {
    const payload = buildAuditEvidencePayload({
      toolName: "Read",
      evidenceKind: "file_read",
      paths: ["src/config.ts"],
      riskHypothesisIds: ["risk-1"],
      output: "export const timeoutMs = 1000;\n",
    });
    const unit = buildAuditEvidenceUnit(
      {
        taskId: "task-1",
        auditPlanId: "task:task-1",
        sourceSnapshotId: "git:commit:tree",
        scopeIds: ["src"],
        riskHypothesisIds: ["risk-2"],
      },
      payload,
    );

    expect(unit.id).toMatch(/^ev_/);
    expect(unit.scopeIds).toEqual(["src", "src/config.ts"]);
    expect(unit.riskHypothesisIds).toEqual(["risk-1"]);
  });

  it("derives parent scope ids from paths", () => {
    expect(deriveAuditEvidenceScopeIdsFromPaths(["packages/shared/src/index.ts"])).toEqual([
      "packages",
      "packages/shared",
      "packages/shared/src",
      "packages/shared/src/index.ts",
    ]);
  });
});
