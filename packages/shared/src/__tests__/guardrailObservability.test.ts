import { describe, expect, it } from "vitest";
import {
  AGENT_GUARDRAIL_COUNTERS,
  buildAgentGuardrailEvent,
  buildAgentGuardrailMetric,
  formatAgentGuardrailActivityLine,
  mapAgentGuardrailAttemptTrust,
  sanitizeAgentGuardrailPath,
} from "../guardrailObservability.js";

describe("guardrailObservability", () => {
  it("builds sorted metric dimensions with required keys", () => {
    const event = buildAgentGuardrailEvent({
      taskId: "task-1",
      projectId: "proj-1",
      stage: "implementer",
      workflowKind: "implementation",
      runtimeProfileId: "profile-1",
      runtimeId: "runtime-1",
      providerId: "provider-1",
      toolName: "write_file",
      artifactPath: "src/app.ts",
      fingerprint: "a".repeat(64),
      action: "blocked",
      reasonCode: "write_path_not_allowed",
    });

    const metric = buildAgentGuardrailMetric(AGENT_GUARDRAIL_COUNTERS.WRITE_PATH_DENIED, event);

    expect(metric).toEqual({
      event: "agent_write_path_denied_total",
      metricKey: "agent_write_path_denied_total",
      metricValue: 1,
      dimensions: {
        action: "blocked",
        artifactPath: "src/app.ts",
        failureFingerprint: null,
        fingerprint: "a".repeat(64),
        projectId: "proj-1",
        providerId: "provider-1",
        reasonCode: "write_path_not_allowed",
        runtimeId: "runtime-1",
        runtimeProfileId: "profile-1",
        stage: "implementer",
        taskId: "task-1",
        toolName: "write_file",
        workflowKind: "implementation",
      },
    });
    expect(Object.keys(metric.dimensions)).toEqual([...Object.keys(metric.dimensions)].sort());
  });

  it("formats compact readable activity", () => {
    const event = buildAgentGuardrailEvent({
      taskId: "task-1",
      projectId: "proj-1",
      stage: "runtime_recovery",
      action: "fail_closed",
      reasonCode: "runtime_recovery_no_delta_timeout",
      failureFingerprint: "fp-1",
    });

    expect(
      formatAgentGuardrailActivityLine(AGENT_GUARDRAIL_COUNTERS.RUNTIME_RECOVERY_NO_DELTA, event),
    ).toBe(
      "agent_runtime_recovery_no_delta_total: action=fail_closed; stage=runtime_recovery; reason=runtime_recovery_no_delta_timeout; failureFingerprint=fp-1",
    );
  });

  it("sanitizes absolute, escaping, and secret-like paths", () => {
    expect(
      sanitizeAgentGuardrailPath("C:\\repo\\project\\src\\app.ts", {
        projectRoot: "C:\\repo\\project",
      }),
    ).toBe("src/app.ts");
    expect(sanitizeAgentGuardrailPath("C:\\Users\\name\\.ssh\\id_rsa")).toBe("[external-path]");
    expect(sanitizeAgentGuardrailPath("\\\\server\\share\\secret.txt")).toBe("[external-path]");
    expect(sanitizeAgentGuardrailPath("/etc/passwd", { projectRoot: "/repo/project" })).toBe(
      "[external-path]",
    );
    expect(sanitizeAgentGuardrailPath("../outside.ts", { projectRoot: "/repo/project" })).toBe(
      "[external-path]",
    );
    expect(sanitizeAgentGuardrailPath("config/.env.local")).toBe("config/[redacted]");
    expect(sanitizeAgentGuardrailPath("keys/private-key.pem")).toBe("[redacted]/[redacted]");
    expect(sanitizeAgentGuardrailPath(".ssh/id_rsa")).toBe("[redacted]/[redacted]");
    expect(sanitizeAgentGuardrailPath("credentials/key")).toBe("credentials/[redacted]");
    expect(sanitizeAgentGuardrailPath("secrets/api-token.txt")).toBe("[redacted]/[redacted]");
    expect(sanitizeAgentGuardrailPath("https://example.test/path/file.ts")).toBe("[redacted]");
    expect(sanitizeAgentGuardrailPath("user@example.test")).toBe("[redacted]");
  });

  it("maps guardrail actions to diagnostic attempt trust fields", () => {
    expect(mapAgentGuardrailAttemptTrust("accepted")).toEqual({
      state: "accepted",
      outcome: "supported",
      trustLevel: "weak",
    });
    expect(mapAgentGuardrailAttemptTrust("rework")).toEqual({
      state: "rejected",
      outcome: "refuted",
      trustLevel: "untrusted",
    });
    expect(mapAgentGuardrailAttemptTrust("fail_closed")).toEqual({
      state: "blocked",
      outcome: "blocked",
      trustLevel: "untrusted",
    });
  });
});
