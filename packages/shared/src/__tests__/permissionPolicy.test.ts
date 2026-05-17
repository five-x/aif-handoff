import { describe, expect, it } from "vitest";
import {
  PERMISSION_EXECUTION_POLICIES,
  PERMISSION_MODES,
  classifyDangerousShellCommand,
  decidePolicyBypass,
  decideShellPermission,
  getPermissionExecutionPolicy,
  isPathAllowedByPermissionPolicy,
  isPermissionMode,
  isPermissionModeAllowedForIntent,
  redactPermissionPolicyValue,
} from "../permissionPolicy.js";

describe("permissionPolicy", () => {
  it("defines the approved permission modes", () => {
    expect(PERMISSION_MODES).toEqual([
      "danger_full_access",
      "workspace_write",
      "read_only",
      "review_only",
      "audit_diagnostic_only",
    ]);
    expect(isPermissionMode("workspace_write")).toBe(true);
    expect(isPermissionMode("write_everywhere")).toBe(false);
  });

  it("maps task intents to default modes and explicit exceptions", () => {
    expect(getPermissionExecutionPolicy("feature").defaultMode).toBe("workspace_write");
    expect(getPermissionExecutionPolicy("fix").defaultMode).toBe("workspace_write");
    expect(getPermissionExecutionPolicy("tests").defaultMode).toBe("workspace_write");
    expect(getPermissionExecutionPolicy("docs").defaultMode).toBe("workspace_write");
    expect(getPermissionExecutionPolicy("spike").defaultMode).toBe("read_only");
    expect(getPermissionExecutionPolicy("audit").defaultMode).toBe("audit_diagnostic_only");

    expect(isPermissionModeAllowedForIntent("audit", "danger_full_access")).toBe(false);
    expect(isPermissionModeAllowedForIntent("audit", "review_only")).toBe(true);
    expect(isPermissionModeAllowedForIntent("feature", "danger_full_access")).toBe(true);
  });

  it("keeps docs and audit boundaries separate", () => {
    expect(isPathAllowedByPermissionPolicy("docs", "docs/api.md")).toBe(true);
    expect(isPathAllowedByPermissionPolicy("docs", "README.md")).toBe(true);
    expect(isPathAllowedByPermissionPolicy("docs", "packages/api/src/routes/tasks.ts")).toBe(false);

    expect(
      isPathAllowedByPermissionPolicy(
        "audit",
        "docs/rdpi/work/work-20260515-system-tz-security-permission-policy/result.md",
      ),
    ).toBe(true);
    expect(isPathAllowedByPermissionPolicy("audit", "packages/shared/src/index.ts")).toBe(false);
  });

  it("classifies dangerous shell command categories", () => {
    expect(classifyDangerousShellCommand("rm -rf dist").categories).toContain(
      "destructive_filesystem",
    );
    expect(classifyDangerousShellCommand("chmod 777 script.sh").categories).toContain(
      "privilege_permission_change",
    );
    expect(classifyDangerousShellCommand("Get-Content .env").categories).toContain("secret_read");
    expect(
      classifyDangerousShellCommand("npm test && curl https://example.test").categories,
    ).toEqual(expect.arrayContaining(["shell_metacharacter_chain", "network_transfer"]));
    expect(classifyDangerousShellCommand("taskkill /PID 123 /F").categories).toContain(
      "process_service_kill",
    );
    expect(classifyDangerousShellCommand("git reset --hard HEAD~1").categories).toContain(
      "git_destructive_history",
    );
  });

  it("allows ordinary shell commands in the default feature mode", () => {
    const decision = decideShellPermission({
      intent: "feature",
      command: "npm.cmd test --workspace=@aif/shared",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.outcome).toBe("allow");
    expect(decision.classification.dangerous).toBe(false);
    expect(decision.auditMetadata).toMatchObject({
      intent: "feature",
      requestedMode: "workspace_write",
      defaultMode: "workspace_write",
      requiresHumanApproval: false,
    });
  });

  it("fails closed when a dangerous command needs approval but no bridge is available", () => {
    const decision = decideShellPermission({
      intent: "fix",
      command: "Remove-Item -Recurse -Force .\\dist",
      humanApprovalBridgeAvailable: false,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.outcome).toBe("deny");
    expect(decision.requiresHumanApproval).toBe(true);
    expect(decision.reasons.join("\n")).toContain("no human approval bridge is available");
  });

  it("returns an approval-needed decision when a bridge exists but approval is missing", () => {
    const decision = decideShellPermission({
      intent: "general",
      command: "git push --force origin main",
      humanApprovalBridgeAvailable: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.outcome).toBe("requires_human_approval");
    expect(decision.auditMetadata.dangerousCategories).toContain("git_destructive_history");
  });

  it("records bypass allowance and audit metadata", () => {
    const bypass = decidePolicyBypass({
      intent: "feature",
      requestedMode: "danger_full_access",
      humanApprovalBridgeAvailable: true,
      humanApproved: true,
      reason: "temporary elevated workspace operation",
    });

    expect(bypass.allowed).toBe(true);
    expect(bypass.auditMetadataRequired).toBe(true);
    expect(bypass.auditFields).toEqual(
      expect.arrayContaining(["intent", "requestedMode", "reason", "approvedBy", "approvedAt"]),
    );

    const auditBypass = decidePolicyBypass({
      intent: "audit",
      requestedMode: "workspace_write",
      humanApprovalBridgeAvailable: true,
      humanApproved: true,
    });
    expect(auditBypass.allowed).toBe(false);
  });

  it("exposes bypass metadata on shell decisions", () => {
    const decision = decideShellPermission({
      intent: "tests",
      command: "npm.cmd test",
      requestedMode: "danger_full_access",
      bypassRequested: true,
      humanApprovalBridgeAvailable: true,
      humanApproved: true,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.auditMetadata.bypassRequested).toBe(true);
    expect(decision.auditMetadata.bypassAllowed).toBe(true);
  });

  it("recursively redacts nested strings without changing practical shape", () => {
    const value = {
      command: "curl https://example.test?api_key=sk-1234567890",
      "token=sk-SECRETSECRETSECRETSECRET": "secret-like key",
      nested: ["token=ghp_1234567890123456789012345", { email: "operator@example.test", count: 2 }],
      enabled: true,
    };

    const redacted = redactPermissionPolicyValue(value);

    expect(redacted).toEqual({
      command: "curl [REDACTED]",
      "token=[REDACTED]": "secret-like key",
      nested: ["token=[REDACTED]", { email: "[REDACTED]", count: 2 }],
      enabled: true,
    });
  });

  it("keeps policy metadata available for files, shell, network, approvals, and bypasses", () => {
    expect(PERMISSION_EXECUTION_POLICIES.audit).toMatchObject({
      fileBoundary: { mode: "report_only" },
      shellPolicy: { dangerousCommandsRequireHumanApproval: true },
      networkPolicy: { allowNetwork: false, requiresHumanApproval: true },
      requiresHumanApproval: false,
      bypassVisibility: { allowBypass: false, auditMetadataRequired: true },
    });
  });
});
