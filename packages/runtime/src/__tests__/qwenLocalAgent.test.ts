/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { chmod, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeAuditReportContentSha256 } from "@aif/shared";
import { RuntimeExecutionError } from "../errors.js";
import {
  buildQwenLocalAgentRequestBody,
  estimateQwenLocalAgentInputTokens,
  listQwenLocalAgentModels,
  resetQwenLocalAgentEndpointStateForTests,
  runQwenLocalAgentApi,
  validateQwenLocalAgentApiConnection,
} from "../adapters/qwenLocalAgent/api.js";
import { createQwenLocalAgentRuntimeAdapter } from "../adapters/qwenLocalAgent/index.js";
import {
  buildSanitizedToolEnv,
  createDefaultQwenToolContext,
  executeQwenLocalTool,
  QWEN_LOCAL_AGENT_TOOLS,
  qwenToolResultForModel,
  spawnProcess,
} from "../adapters/qwenLocalAgent/tools.js";
import { TEST_USAGE_CONTEXT } from "./helpers/usageContext.js";
function createRunInput(projectRoot, overrides = {}) {
  return {
    runtimeId: "qwen-local-agent",
    providerId: "qwen",
    profileId: "profile-qwen",
    workflowKind: "implementer",
    transport: "api",
    prompt: "Create the audit file.",
    model: "Qwen3-32B-Q4_K_M.gguf",
    projectRoot,
    cwd: projectRoot,
    options: {
      baseUrl: "http://qwen.local/v1",
      toolTimeoutMs: 5_000,
      maxOutputChars: 4_000,
    },
    usageContext: TEST_USAGE_CONTEXT,
    ...overrides,
  };
}
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function createEndpointLeaseStore(overrides = {}) {
  return {
    holderId: "holder-a",
    acquire: vi.fn(async () => ({
      acquired: true,
      holderId: "holder-a",
      leaseToken: "lease-token-a",
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    })),
    heartbeat: vi.fn(async () => true),
    release: vi.fn(async () => true),
    cancel: vi.fn(async () => 1),
    readCooldown: vi.fn(async () => null),
    setCooldown: vi.fn(async () => undefined),
    ...overrides,
  };
}
function createSharedEndpointLeaseStore(holderId, state) {
  return {
    holderId,
    acquire: vi.fn(async (input) => {
      const now = Date.now();
      if (state.holderId && state.leaseExpiresAtMs <= now) {
        state.holderId = null;
        state.leaseToken = null;
      }
      if (!state.holderId) {
        state.holderId = holderId;
        state.leaseToken = `${holderId}-token`;
        state.leaseExpiresAtMs = now + input.leaseTtlMs;
        return {
          acquired: true,
          holderId,
          leaseToken: state.leaseToken,
          heartbeatAt: new Date(now).toISOString(),
          leaseExpiresAt: new Date(state.leaseExpiresAtMs).toISOString(),
        };
      }
      if (state.holderId === holderId) {
        return {
          acquired: true,
          holderId,
          leaseToken: state.leaseToken,
          heartbeatAt: new Date(now).toISOString(),
          leaseExpiresAt: new Date(state.leaseExpiresAtMs).toISOString(),
        };
      }
      return {
        acquired: false,
        reason: "held",
        holderId: state.holderId,
        leaseExpiresAt: new Date(state.leaseExpiresAtMs).toISOString(),
        retryAfterMs: Math.max(0, state.leaseExpiresAtMs - now),
      };
    }),
    heartbeat: vi.fn(async (input) => {
      if (state.holderId !== holderId || state.leaseToken !== input.leaseToken) return false;
      state.leaseExpiresAtMs = Date.now() + input.leaseTtlMs;
      return true;
    }),
    release: vi.fn(async (input) => {
      if (state.holderId !== holderId || state.leaseToken !== input.leaseToken) return false;
      state.holderId = null;
      state.leaseToken = null;
      state.leaseExpiresAtMs = 0;
      return true;
    }),
    cancel: vi.fn(async () => 0),
    readCooldown: vi.fn(async () => null),
    setCooldown: vi.fn(async () => undefined),
  };
}
async function tryCreateDirectoryLink(target, linkPath) {
  try {
    await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch {
    return false;
  }
}
async function expectSpawnOk(root, args) {
  const result = await spawnProcess({
    command: "git",
    args,
    cwd: root,
    env: buildSanitizedToolEnv(process.env),
    timeoutMs: 10_000,
    maxOutputChars: 4_000,
  });
  expect(result.ok, result.error ?? result.output).toBe(true);
}
describe("qwen-local-agent adapter", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    resetQwenLocalAgentEndpointStateForTests();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  function enqueueToolTurns(runId, calls) {
    for (const [index, call] of calls.entries()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: runId,
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-${index + 1}`,
                    type: "function",
                    function: {
                      name: call.name,
                      arguments: JSON.stringify(call.args ?? {}),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }
  }
  it("advertises repository tools for capability-gated workflows", () => {
    const adapter = createQwenLocalAgentRuntimeAdapter();
    expect(adapter.descriptor.capabilities.supportsRepositoryTools).toBe(true);
  });
  it("declares OpenAI function-style tools", async () => {
    expect(QWEN_LOCAL_AGENT_TOOLS.length).toBeGreaterThan(0);
    expect(QWEN_LOCAL_AGENT_TOOLS.every((tool) => tool.type === "function")).toBe(true);
    expect(QWEN_LOCAL_AGENT_TOOLS.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining([
        "list_files",
        "read_file",
        "search_files",
        "write_file",
        "apply_patch",
        "run_shell",
        "git_status",
        "compute_audit_report_hash",
        "finalize_audit_report_manifest",
        "validate_audit_report",
        "git_commit",
      ]),
    );
    const shellTool = QWEN_LOCAL_AGENT_TOOLS.find((tool) => tool.function.name === "run_shell");
    const parameters = shellTool?.function.parameters;
    expect(parameters.properties?.command?.enum).toEqual([
      "pwd",
      "ls",
      "npm",
      "npm.cmd",
      "pnpm",
      "yarn",
      "bun",
    ]);
  });
  it("builds chat-completions requests with function tools", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-request-"));
    const body = buildQwenLocalAgentRequestBody(createRunInput(root));
    expect(body.model).toBe("Qwen3-32B-Q4_K_M.gguf");
    expect(body.stream).toBe(false);
    expect(body.tool_choice).toBe("auto");
    expect(body.tools).toEqual(QWEN_LOCAL_AGENT_TOOLS);
  });
  it("caps local endpoint output tokens by the 8003 profile budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-budget-8003-"));
    const body = buildQwenLocalAgentRequestBody(
      createRunInput(root, {
        options: {
          baseUrl: "http://192.168.88.62:8003/v1",
          maxTokens: 99_999,
        },
      }),
    );

    expect(body.max_tokens).toBeLessThanOrEqual(4_000);
    expect(estimateQwenLocalAgentInputTokens(createRunInput(root))).toBeGreaterThan(0);
  });
  it("reduces 8003 output tokens at the soft high-input budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-budget-8003-high-input-"));
    const input = createRunInput(root, {
      options: {
        baseUrl: "http://192.168.88.62:8003/v1",
        maxTokens: 4_000,
      },
    });
    const messages = [
      { role: "system", content: "system" },
      { role: "user", content: "x".repeat(45_000) },
    ];
    const estimate = estimateQwenLocalAgentInputTokens(input, messages);

    expect(estimate).toBeGreaterThanOrEqual(16_000);
    expect(estimate).toBeLessThanOrEqual(20_000);
    expect(buildQwenLocalAgentRequestBody(input, messages).max_tokens).toBe(2_000);
  });
  it("reduces 8005 output tokens at the soft high-input budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-budget-8005-high-input-"));
    const input = createRunInput(root, {
      options: {
        baseUrl: "http://192.168.88.62:8005/v1",
        maxTokens: 8_000,
      },
    });
    const messages = [
      { role: "system", content: "system" },
      { role: "user", content: "x".repeat(140_000) },
    ];
    const estimate = estimateQwenLocalAgentInputTokens(input, messages);

    expect(estimate).toBeGreaterThanOrEqual(48_000);
    expect(estimate).toBeLessThanOrEqual(60_000);
    expect(buildQwenLocalAgentRequestBody(input, messages).max_tokens).toBe(4_000);
  });
  it("keeps the full 8005 output cap below the soft high-input budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-budget-8005-low-input-"));
    const input = createRunInput(root, {
      options: {
        baseUrl: "http://192.168.88.62:8005/v1",
        maxTokens: 99_999,
      },
    });

    expect(buildQwenLocalAgentRequestBody(input).max_tokens).toBe(8_000);
  });
  it("allows small configured output caps when the endpoint total budget has room", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-budget-small-output-"));
    const body = buildQwenLocalAgentRequestBody(
      createRunInput(root, {
        options: {
          baseUrl: "http://192.168.88.62:8003/v1",
          maxTokens: 256,
        },
      }),
    );

    expect(body.max_tokens).toBe(256);
  });
  it("fails closed before sending a request that exceeds the 8003 input budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-budget-overflow-"));
    const hugeMessages = [
      { role: "system", content: "system" },
      { role: "user", content: "x".repeat(80_000) },
    ];

    expect(() =>
      buildQwenLocalAgentRequestBody(
        createRunInput(root, {
          options: { baseUrl: "http://192.168.88.62:8003/v1" },
        }),
        hugeMessages,
      ),
    ).toThrow(/endpoint input budget/);
  });
  it("enforces configured context caps before sending a request", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-stage-context-cap-"));
    const messages = [
      { role: "system", content: "system" },
      { role: "user", content: "x".repeat(2_000) },
    ];

    expect(() =>
      buildQwenLocalAgentRequestBody(
        createRunInput(root, {
          options: {
            baseUrl: "http://192.168.88.62:8005/v1",
            contextWindowTokens: 100,
            maxOutputTokens: 64,
          },
        }),
        messages,
      ),
    ).toThrow(/endpoint input budget 100/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("logs request estimates when endpoint budget rejects before fetch", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-budget-log-reject-"));
    const warn = vi.fn();

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          systemPrompt: "x".repeat(80_000),
          options: { baseUrl: "http://192.168.88.62:8003/v1" },
        }),
        { warn },
      ),
    ).rejects.toMatchObject({
      category: "context_length",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-qwen",
        baseUrl: "http://192.168.88.62:8003/v1",
        estimatedInputTokens: expect.any(Number),
        maxOutputTokens: expect.any(Number),
        toolCallCount: 0,
        retryCount: 0,
        durationMs: expect.any(Number),
        failureClass: "endpoint_input_budget_exceeded",
      }),
      "qwen-local-agent request estimate",
    );
  });
  it("logs retryCount independently from successful tool turns", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-retry-count-turns-"));
    await writeFile(path.join(root, "README.md"), "test\n", "utf8");
    const logger = { info: vi.fn() };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-retry-count-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-list",
                    type: "function",
                    function: {
                      name: "list_files",
                      arguments: JSON.stringify({ path: "." }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-retry-count-2",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );

    await runQwenLocalAgentApi(createRunInput(root), logger);

    const estimateCalls = logger.info.mock.calls
      .filter(([, message]) => message === "qwen-local-agent request estimate")
      .map(([context]) => context);
    expect(estimateCalls).toHaveLength(2);
    expect(estimateCalls[0]).toEqual(
      expect.objectContaining({
        turn: 0,
        toolCallCount: 0,
        retryCount: 0,
        failureClass: null,
      }),
    );
    expect(estimateCalls[1]).toEqual(
      expect.objectContaining({
        turn: 1,
        toolCallCount: 1,
        retryCount: 0,
        failureClass: null,
      }),
    );
  });
  it("compacts audit transcripts before sending requests above the 8005 soft input budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-soft-compact-8005-"));
    await writeFile(path.join(root, "README.md"), "# Project\nRuntime notes.\n", "utf8");
    const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-soft-compact-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: "evidence ".repeat(17_000),
                tool_calls: [
                  {
                    id: "call-read-readme",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-soft-compact-2",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://192.168.88.62:8005/v1",
          maxTokens: 8_000,
          toolTimeoutMs: 5_000,
          maxOutputChars: 4_000,
        },
        execution: {
          allowedWritePaths: ["audit/integration.md"],
          auditReportArtifactPath: "audit/integration.md",
          repositoryInspectionToolBudget: 60,
        },
      }),
      logger,
    );

    expect(result.outputText).toBe("done");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const compactUserMessage = secondBody.messages.find((message) => message.role === "user");

    expect(compactUserMessage.content).toContain("QWEN COMPACT CONTEXT MODE");
    expect(compactUserMessage.content).toContain("reason=endpoint_input_soft_budget");
    expect(compactUserMessage.content).toContain("Compact audit evidence ledger:");
    expect(compactUserMessage.content).not.toContain("evidence ".repeat(1_000));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://192.168.88.62:8005/v1",
        compactionReason: "endpoint_input_soft_budget",
        estimatedInputTokensBefore: expect.any(Number),
        estimatedInputTokensAfter: expect.any(Number),
        maxInputTokens: 60_000,
        compactTargetInputTokens: 48_000,
        repositoryInspectionToolCalls: 1,
        repositoryInspectionToolBudget: 60,
      }),
      "Compacted qwen-local-agent transcript before local endpoint request",
    );
  });
  it("compacts audit transcripts again when they regrow above the 8005 soft input budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-soft-recompact-8005-"));
    await writeFile(path.join(root, "README.md"), "# Project\nRuntime notes.\n", "utf8");
    const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    const runInput = createRunInput(root, {
      workflowKind: "audit",
      options: {
        baseUrl: "http://192.168.88.62:8005/v1",
        maxTokens: 8_000,
        toolTimeoutMs: 5_000,
        maxOutputChars: 4_000,
      },
      execution: {
        allowedWritePaths: ["audit/integration.md"],
        auditReportArtifactPath: "audit/integration.md",
        repositoryInspectionToolBudget: 60,
      },
    });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-soft-recompact-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: "first evidence ".repeat(10_000),
                tool_calls: [
                  {
                    id: "call-read-readme-1",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-soft-recompact-2",
          choices: [
            {
              message: {
                role: "assistant",
                content: "second evidence ".repeat(9_000),
                tool_calls: [
                  {
                    id: "call-read-readme-2",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-soft-recompact-3",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(runInput, logger);

    expect(result.outputText).toBe("done");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requestBodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    const secondBody = requestBodies[1];
    const thirdBody = requestBodies[2];
    const secondUserMessage = secondBody.messages.find((message) => message.role === "user");
    const thirdUserMessage = thirdBody.messages.find((message) => message.role === "user");

    expect(secondUserMessage.content).toContain("reason=endpoint_input_soft_budget");
    expect(thirdUserMessage.content).toContain("reason=endpoint_input_soft_budget");
    expect(secondUserMessage.content).not.toContain("first evidence ".repeat(1_000));
    expect(thirdUserMessage.content).not.toContain("second evidence ".repeat(1_000));
    for (const body of requestBodies.slice(1)) {
      expect(estimateQwenLocalAgentInputTokens(runInput, body.messages)).toBeLessThanOrEqual(
        48_000,
      );
    }
    const softCompactionLogs = logger.warn.mock.calls.filter(
      ([context, message]) =>
        message === "Compacted qwen-local-agent transcript before local endpoint request" &&
        context?.compactionReason === "endpoint_input_soft_budget",
    );
    expect(softCompactionLogs).toHaveLength(2);
  });
  it("compacts audit transcripts above the 8005 soft input budget without an inspection budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-soft-compact-no-budget-8005-"));
    await writeFile(path.join(root, "README.md"), "# Project\nRuntime notes.\n", "utf8");
    const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-soft-no-budget-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: "budgetless evidence ".repeat(8_000),
                tool_calls: [
                  {
                    id: "call-read-readme-no-budget",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-soft-no-budget-2",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://192.168.88.62:8005/v1",
          maxTokens: 8_000,
          toolTimeoutMs: 5_000,
          maxOutputChars: 4_000,
        },
        execution: {
          allowedWritePaths: ["audit/integration.md"],
          auditReportArtifactPath: "audit/integration.md",
        },
      }),
      logger,
    );

    expect(result.outputText).toBe("done");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const secondUserMessage = secondBody.messages.find((message) => message.role === "user");

    expect(secondUserMessage.content).toContain("reason=endpoint_input_soft_budget");
    expect(secondUserMessage.content).not.toContain("budgetless evidence ".repeat(1_000));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://192.168.88.62:8005/v1",
        compactionReason: "endpoint_input_soft_budget",
        repositoryInspectionToolCalls: 1,
        repositoryInspectionToolBudget: null,
      }),
      "Compacted qwen-local-agent transcript before local endpoint request",
    );
  });
  it("logs hard endpoint budget compaction before soft budget compaction", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-hard-before-soft-8005-"));
    await writeFile(path.join(root, "README.md"), "# Project\nRuntime notes.\n", "utf8");
    const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-hard-before-soft-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: "hard evidence ".repeat(16_000),
                tool_calls: [
                  {
                    id: "call-read-readme-hard",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-hard-before-soft-2",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );

    await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://192.168.88.62:8005/v1",
          maxTokens: 8_000,
          toolTimeoutMs: 5_000,
          maxOutputChars: 4_000,
        },
        execution: {
          allowedWritePaths: ["audit/integration.md"],
          auditReportArtifactPath: "audit/integration.md",
        },
      }),
      logger,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://192.168.88.62:8005/v1",
        compactionReason: "endpoint_input_budget",
        estimatedInputTokensBefore: expect.any(Number),
        maxInputTokens: 60_000,
        compactTargetInputTokens: 48_000,
        repositoryInspectionToolCalls: 1,
        repositoryInspectionToolBudget: null,
      }),
      "Compacted qwen-local-agent transcript before local endpoint request",
    );
  });
  it("limits planner workflows to read-only repository tools", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-planner-readonly-"));
    const body = buildQwenLocalAgentRequestBody(createRunInput(root, { workflowKind: "planner" }));
    const toolNames = body.tools?.map((tool) => tool.function.name);

    expect(body.tool_choice).toBe("auto");
    expect(toolNames).toEqual([
      "list_files",
      "read_file",
      "search_files",
      "run_shell",
      "git_status",
    ]);
    expect(toolNames).not.toContain("write_file");
    expect(toolNames).not.toContain("apply_patch");
    expect(toolNames).not.toContain("git_commit");
  });
  it("denies write-capable shell operations in read-only planner workflows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-planner-shell-deny-"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({}), "utf8");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-readonly-shell-deny",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-install",
                    type: "function",
                    function: {
                      name: "run_shell",
                      arguments: JSON.stringify({
                        command: process.platform === "win32" ? "npm.cmd" : "npm",
                        args: ["install"],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-readonly-shell-deny-final",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(createRunInput(root, { workflowKind: "planner" }));

    expect(result.outputText).toBe("done");
    expect(JSON.stringify(result.events)).toContain("workflow is read-only");
    await expect(readFile(path.join(root, "package-lock.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it.each(["roadmap-generate", "roadmap-extract"])(
    "omits repository tools for %s one-shot workflows",
    async (workflowKind) => {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-roadmap-toolless-"));
      const body = buildQwenLocalAgentRequestBody(createRunInput(root, { workflowKind }));
      expect(body.model).toBe("Qwen3-32B-Q4_K_M.gguf");
      expect(body.stream).toBe(false);
      expect(body.tool_choice).toBeUndefined();
      expect(body.tools).toBeUndefined();
    },
  );
  it("respects explicit toolsEnabled=false runtime option", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-toolless-option-"));
    const body = buildQwenLocalAgentRequestBody(
      createRunInput(root, { options: { baseUrl: "http://qwen.local/v1", toolsEnabled: false } }),
    );
    expect(body.tool_choice).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });
  it("respects configured maxToolTurns values above the legacy 40-turn cap", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-high-tool-turns-"));
    let turn = 0;
    fetchMock.mockImplementation(async () => {
      turn += 1;
      return jsonResponse({
        id: "chat-high-tool-turns",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: `call-${turn}`,
                  type: "function",
                  function: {
                    name: "unknown_test_tool",
                    arguments: JSON.stringify({ turn }),
                  },
                },
              ],
            },
          },
        ],
      });
    });

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            maxToolTurns: 41,
          },
        }),
      ),
    ).rejects.toMatchObject({
      message: "qwen-local-agent exceeded max tool turns (41)",
      category: "timeout",
      providerMeta: expect.objectContaining({
        status: "max_tool_turns_exhausted",
        category: "timeout",
        maxToolTurns: 41,
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(41);
  });
  it("executes a tool-call loop and emits sanitized tool events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-loop-"));
    const events = [];
    const onToolUse = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-write",
                    type: "function",
                    function: {
                      name: "write_file",
                      arguments: JSON.stringify({
                        path: "audit/test-agent-runtime.md",
                        content: "api_key=sk-SECRET\n",
                      }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-1",
          choices: [{ message: { role: "assistant", content: "done" } }],
          usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
        }),
      );
    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        execution: {
          onEvent: (event) => events.push(event),
          onToolUse,
        },
      }),
    );
    expect(result.outputText).toBe("done");
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });
    expect(await readFile(path.join(root, "audit/test-agent-runtime.md"), "utf8")).toBe(
      "api_key=sk-SECRET\n",
    );
    expect(onToolUse).toHaveBeenCalledWith("write_file", " audit/test-agent-runtime.md");
    expect(events.some((event) => event.type === "tool:use")).toBe(true);
    expect(events.some((event) => event.type === "tool:result")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("sk-SECRET");
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(secondBody.messages.some((message) => message.role === "tool")).toBe(true);
  });
  it("enforces execution allowed write paths during api tool calls", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-allowed-write-api-"));
    const events = [];
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-allowed-write-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-write",
                    type: "function",
                    function: {
                      name: "write_file",
                      arguments: JSON.stringify({
                        path: "tmp_body.txt",
                        content: "helper file\n",
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-allowed-write-2",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          execution: {
            allowedWritePaths: ["audit/report.md"],
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        reason: "policy_violation",
        policyViolation: true,
        toolName: "write_file",
        targetPath: "tmp_body.txt",
      }),
    });
    await expect(readFile(path.join(root, "tmp_body.txt"), "utf8")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.find((event) => event.type === "tool:result")).toMatchObject({
      data: expect.objectContaining({
        ok: false,
        policyViolation: true,
        error: expect.stringContaining("write_path_not_allowed: tmp_body.txt"),
      }),
    });
  });
  it("rejects rogue write tool calls during planner workflows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-planner-rogue-write-"));
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-planner-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-write",
                    type: "function",
                    function: {
                      name: "write_file",
                      arguments: JSON.stringify({
                        path: "package.json",
                        content: '{"scripts":{"build":"tsc"}}\n',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-planner-2",
          choices: [{ message: { role: "assistant", content: "# Plan\n" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(createRunInput(root, { workflowKind: "planner" }));

    expect(result.outputText).toBe("# Plan\n");
    await expect(readFile(path.join(root, "package.json"), "utf8")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("emits bounded audit evidence events for read search and shell tools", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-evidence-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "config.ts"),
      "export const token = 'sk-SECRETSECRETSECRETSECRET';\n",
      "utf8",
    );
    const events = [];
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-evidence",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "src/config.ts" }),
                    },
                  },
                  {
                    id: "call-list",
                    type: "function",
                    function: {
                      name: "list_files",
                      arguments: JSON.stringify({ path: "src" }),
                    },
                  },
                  {
                    id: "call-shell",
                    type: "function",
                    function: {
                      name: "run_shell",
                      arguments: JSON.stringify({ command: "pwd", cwd: "src" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-evidence",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );

    await runQwenLocalAgentApi(
      createRunInput(root, {
        execution: {
          onEvent: (event) => events.push(event),
        },
      }),
    );

    const auditEvents = events.filter((event) => event.type === "audit:evidence");
    const evidence = auditEvents.map((event) => event.data.auditEvidence);
    expect(evidence).toHaveLength(3);
    expect(evidence.every((entry) => /^ev_/.test(entry.id))).toBe(true);
    expect(evidence.map((entry) => entry.evidenceKind)).toEqual(
      expect.arrayContaining(["file_read", "search", "shell_command"]),
    );
    expect(
      auditEvents.every((event) => event.data.evidenceUnit.id === event.data.auditEvidence.id),
    ).toBe(true);
    expect(evidence.find((entry) => entry.toolName === "list_files").evidenceGrade).toBe(
      "discovery",
    );
    expect(evidence.every((entry) => /^[a-f0-9]{64}$/.test(entry.outputSha256))).toBe(true);
    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1].body);
    const toolPayloads = secondRequest.messages
      .filter((message) => message.role === "tool")
      .map((message) => JSON.parse(message.content));
    expect(toolPayloads).toHaveLength(3);
    expect(toolPayloads.map((payload) => payload.auditEvidence?.id)).toEqual(
      evidence.map((entry) => entry.id),
    );
    expect(toolPayloads.every((payload) => payload.auditEvidence?.evidenceKind)).toBe(true);
    expect(
      toolPayloads.every((payload) => /^[a-f0-9]{64}$/.test(payload.auditEvidence?.outputSha256)),
    ).toBe(true);
    expect(
      toolPayloads.every((payload) => typeof payload.auditEvidence?.outputPreview === "string"),
    ).toBe(true);
    expect(JSON.stringify(auditEvents)).toContain("[REDACTED]");
    expect(JSON.stringify(auditEvents)).not.toContain("sk-SECRETSECRETSECRETSECRET");
  });
  it("binds qwen audit evidence scope and risk ids to inspected paths only", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-evidence-scope-"));
    await mkdir(path.join(root, ".ai-factory", "plans"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, ".ai-factory", "plans", "audit.md"), "Scope plan\n", "utf8");
    await writeFile(path.join(root, "README.md"), "# Readme\n", "utf8");
    await writeFile(path.join(root, "src", "config.ts"), "export const value = 1;\n", "utf8");
    const events = [];
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-evidence-scope",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read-plan",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: ".ai-factory/plans/audit.md" }),
                    },
                  },
                  {
                    id: "call-read-readme",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-evidence-scope-done",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );

    await runQwenLocalAgentApi(
      createRunInput(root, {
        execution: {
          onEvent: (event) => events.push(event),
          auditReportTaskId: "task-1",
          auditReportAuditPlanId: "task:task-1",
          auditReportTaskDescription: [
            "Scope: README.md, src/config.ts",
            "Risk hypotheses: risk-1 README.md may hide ownership ambiguity; risk-2 src/config.ts may hide configuration coupling",
          ].join("\n"),
        },
      }),
    );

    const evidence = events
      .filter((event) => event.type === "audit:evidence")
      .map((event) => event.data.auditEvidence);
    const planEvidence = evidence.find((entry) =>
      entry.scopeIds.includes(".ai-factory/plans/audit.md"),
    );
    const readmeEvidence = evidence.find((entry) => entry.scopeIds.includes("README.md"));

    expect(planEvidence).toBeTruthy();
    expect(planEvidence.scopeIds).not.toContain("README.md");
    expect(planEvidence.riskHypothesisIds).toEqual([]);
    expect(readmeEvidence).toBeTruthy();
    expect(readmeEvidence.scopeIds).toEqual(expect.arrayContaining(["README.md"]));
    expect(readmeEvidence.riskHypothesisIds).toEqual(["risk-1"]);
  });
  it("terminalizes after the configured repository-inspection budget without another model request", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");
    await writeFile(path.join(root, "audit", "architecture.md"), "# Audit\n\nDraft.\n", "utf8");
    const events = [];
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read-1",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget",
          choices: [{ message: { role: "assistant", content: "late finalization" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://192.168.88.62:8003/v1",
          toolTimeoutMs: 5_000,
          maxOutputChars: 4_000,
        },
        execution: {
          allowedWritePaths: ["audit/architecture.md"],
          auditReportArtifactPath: "audit/architecture.md",
          repositoryInspectionToolBudget: 1,
          onEvent: (event) => events.push(event),
        },
      }),
    );

    expect(result.outputText).toContain("no further LLM finalization request was made");
    expect(result.outputText).not.toContain("late finalization");
    expect(await readFile(path.join(root, "audit", "architecture.md"), "utf8")).toContain("Draft.");
    expect(JSON.stringify(result.events)).toContain("read_file ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const auditEvents = events.filter((event) => event.type === "audit:evidence");
    expect(auditEvents).toHaveLength(1);
    expect(JSON.stringify(auditEvents)).not.toContain("audit/architecture.md");
  });
  it("stops instead of hanging when repository inspection continues after budget exhaustion", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-loop-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");
    await writeFile(path.join(root, "src", "app.ts"), "export const app = true;\n", "utf8");
    const events = [];
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-loop",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read-allowed",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-loop",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read-denied",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "src/app.ts" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-loop",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-search-denied",
                    type: "function",
                    function: {
                      name: "search_files",
                      arguments: JSON.stringify({ path: "src", pattern: "app" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-loop",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-list-denied",
                    type: "function",
                    function: {
                      name: "list_files",
                      arguments: JSON.stringify({ path: "src" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-loop",
          choices: [{ message: { role: "assistant", content: "late finalization" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://192.168.88.62:8003/v1",
          toolTimeoutMs: 5_000,
          maxOutputChars: 4_000,
        },
        execution: {
          repositoryInspectionToolBudget: 1,
          onEvent: (event) => events.push(event),
        },
      }),
    );

    expect(result.outputText).toContain("no further LLM finalization request was made");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.outputText).toContain("repositoryInspectionToolBudget=1");
    expect(JSON.stringify(events)).toContain("README.md");
    expect(JSON.stringify(events)).not.toContain("late finalization");
  });
  it("stops before emitting repository-inspection denials for batched calls after budget exhaustion", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-batched-stop-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");
    await writeFile(path.join(root, "src", "app.ts"), "export const app = true;\n", "utf8");
    const events = [];
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-inspection-budget-batched-stop",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-read-allowed",
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: JSON.stringify({ path: "README.md" }),
                  },
                },
                {
                  id: "call-search-skipped",
                  type: "function",
                  function: {
                    name: "search_files",
                    arguments: JSON.stringify({ path: "src", pattern: "app" }),
                  },
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        execution: {
          repositoryInspectionToolBudget: 1,
          onEvent: (event) => events.push(event),
        },
      }),
    );

    expect(result.outputText).toContain("no further LLM finalization request was made");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(events)).toContain("read_file ok");
    expect(JSON.stringify(events)).not.toContain("search_files");
    expect(JSON.stringify(events)).not.toContain("Repository inspection budget exhausted");
  });
  it("auto-commits and completes after audit validation passes during budget finalization", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-validated-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "config.ts"), "export const timeoutMs = 1000;\n");
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.com"]);
    await expectSpawnOk(root, ["config", "user.name", "Test User"]);
    await expectSpawnOk(root, ["add", "src/config.ts"]);
    await expectSpawnOk(root, ["commit", "-m", "init", "--no-verify"]);
    await writeFile(path.join(root, "src", "unrelated.ts"), "export const unrelated = true;\n");
    const commitSha = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    const treeSha = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD^{tree}"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    const evidenceId = "ev_11111111-1111-4111-8111-111111111111";
    const reportBody = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");
    const reportManifest = {
      version: 1,
      auditPlanId: "task:task-1",
      taskId: "task-1",
      artifactPath: "audit/report.md",
      contentSha256: computeAuditReportContentSha256(reportBody),
      sourceSnapshot: {
        id: `git:${commitSha}:${treeSha}`,
        commit: commitSha,
        tree: treeSha,
        dirty: false,
      },
      outcome: "validated_no_findings",
      scopeCoverage: [{ root: "src/config.ts", evidenceRefs: [evidenceId] }],
      riskHypotheses: [
        { id: "risk-1", description: "Runtime configuration drift", status: "covered" },
      ],
      findings: [],
      noFindingsClaims: [
        { id: "nf-1", root: "src/config.ts", riskId: "risk-1", evidenceRefs: [evidenceId] },
      ],
      evidenceRefs: [evidenceId],
    };
    await writeFile(
      path.join(root, "audit", "report.md"),
      `${reportBody}\n\`\`\`audit-report-manifest\n${JSON.stringify(reportManifest)}\n\`\`\`\n`,
      "utf8",
    );
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-validated",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "src/config.ts" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-validated",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-validate",
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-validated",
          choices: [{ message: { role: "assistant", content: "late finalization" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://192.168.88.62:8003/v1",
          maxToolTurns: 8,
        },
        execution: {
          allowedWritePaths: ["audit/report.md"],
          auditReportArtifactPath: "audit/report.md",
          auditReportTaskDescription:
            "Scope: src/config.ts\nRisk hypotheses: risk-1 Runtime configuration drift",
          auditReportTaskId: "task-1",
          auditReportAuditPlanId: "task:task-1",
          auditReportEvidenceUnits: [
            {
              id: evidenceId,
              taskId: "task-1",
              auditPlanId: "task:task-1",
              sourceSnapshotId: `git:${commitSha}:${treeSha}`,
              toolName: "Grep",
              evidenceKind: "search",
              evidenceGrade: "substantive",
              scopeIds: ["src/config.ts"],
              riskHypothesisIds: ["risk-1"],
              pathHashes: [],
              pathRangeHashes: [],
              command: { command: 'rg -n "timeoutMs" src/config.ts', args: [], cwd: null },
              exitCode: 0,
              outputSha256: "1".repeat(64),
              outputPreview: "src/config.ts:1:export const timeoutMs = 1000;",
              outputPreviewTruncated: false,
              parsedSummary: {
                outputBytes: 46,
                outputLineCount: 1,
                previewChars: 46,
                exitCode: null,
              },
              redactionStatus: "clean",
              createdAt: "2026-05-22T00:00:00.000Z",
            },
          ],
          repositoryInspectionToolBudget: 1,
        },
      }),
    );

    expect(result.outputText).toContain("Automatic bounded report-only git_commit completed");
    expect(result.outputText).not.toContain("late finalization");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.events)).toContain("git_commit ok");
    const gitLog = await spawnProcess({
      command: "git",
      args: ["log", "-1", "--name-only", "--oneline", "--", "audit/report.md"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 4_000,
    });
    expect(gitLog.ok).toBe(true);
    expect(gitLog.output).toContain("audit/report.md");
    const committedFiles = await spawnProcess({
      command: "git",
      args: ["show", "--name-only", "--format=", "HEAD"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 4_000,
    });
    expect(committedFiles.ok).toBe(true);
    expect(committedFiles.output.split(/\r?\n/).filter(Boolean)).toEqual(["audit/report.md"]);
    const stagedAfterCommit = await spawnProcess({
      command: "git",
      args: ["diff", "--cached", "--name-only"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 4_000,
    });
    expect(stagedAfterCommit.ok).toBe(true);
    expect(stagedAfterCommit.output).not.toContain("src/unrelated.ts");
    const statusAfterCommit = await spawnProcess({
      command: "git",
      args: ["status", "--short"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 4_000,
    });
    expect(statusAfterCommit.ok).toBe(true);
    expect(statusAfterCommit.output).toContain("?? src/unrelated.ts");
  });
  it("rejects when aborted before automatic budget finalization commit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-commit-abort-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "config.ts"), "export const timeoutMs = 1000;\n");
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.com"]);
    await expectSpawnOk(root, ["config", "user.name", "Test User"]);
    await expectSpawnOk(root, ["add", "src/config.ts"]);
    await expectSpawnOk(root, ["commit", "-m", "init", "--no-verify"]);
    const commitSha = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    const treeSha = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD^{tree}"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    const evidenceId = "ev_22222222-2222-4222-8222-222222222222";
    const reportBody = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");
    const reportManifest = {
      version: 1,
      auditPlanId: "task:task-1",
      taskId: "task-1",
      artifactPath: "audit/report.md",
      contentSha256: computeAuditReportContentSha256(reportBody),
      sourceSnapshot: {
        id: `git:${commitSha}:${treeSha}`,
        commit: commitSha,
        tree: treeSha,
        dirty: false,
      },
      outcome: "validated_no_findings",
      scopeCoverage: [{ root: "src/config.ts", evidenceRefs: [evidenceId] }],
      riskHypotheses: [
        { id: "risk-1", description: "Runtime configuration drift", status: "covered" },
      ],
      findings: [],
      noFindingsClaims: [
        { id: "nf-1", root: "src/config.ts", riskId: "risk-1", evidenceRefs: [evidenceId] },
      ],
      evidenceRefs: [evidenceId],
    };
    await writeFile(
      path.join(root, "audit", "report.md"),
      `${reportBody}\n\`\`\`audit-report-manifest\n${JSON.stringify(reportManifest)}\n\`\`\`\n`,
      "utf8",
    );
    const abort = new AbortController();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-inspection-budget-commit-abort",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-read",
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: JSON.stringify({ path: "src/config.ts" }),
                  },
                },
              ],
            },
          },
        ],
      }),
    );

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          workflowKind: "audit",
          options: {
            baseUrl: "http://192.168.88.62:8003/v1",
            maxToolTurns: 8,
          },
          execution: {
            abortController: abort,
            allowedWritePaths: ["audit/report.md"],
            auditReportArtifactPath: "audit/report.md",
            auditReportTaskDescription:
              "Scope: src/config.ts\nRisk hypotheses: risk-1 Runtime configuration drift",
            auditReportTaskId: "task-1",
            auditReportAuditPlanId: "task:task-1",
            auditReportEvidenceUnits: [
              {
                id: evidenceId,
                taskId: "task-1",
                auditPlanId: "task:task-1",
                sourceSnapshotId: `git:${commitSha}:${treeSha}`,
                toolName: "Grep",
                evidenceKind: "search",
                evidenceGrade: "substantive",
                scopeIds: ["src/config.ts"],
                riskHypothesisIds: ["risk-1"],
                pathHashes: [],
                pathRangeHashes: [],
                command: { command: 'rg -n "timeoutMs" src/config.ts', args: [], cwd: null },
                exitCode: 0,
                outputSha256: "2".repeat(64),
                outputPreview: "src/config.ts:1:export const timeoutMs = 1000;",
                outputPreviewTruncated: false,
                parsedSummary: {
                  outputBytes: 46,
                  outputLineCount: 1,
                  previewChars: 46,
                  exitCode: null,
                },
                redactionStatus: "clean",
                createdAt: "2026-05-22T00:00:00.000Z",
              },
            ],
            repositoryInspectionToolBudget: 1,
            runTimeoutMs: 30_000,
            onEvent: (event) => {
              if (event.type === "tool:use" && event.data?.name === "git_commit") {
                abort.abort(new DOMException("The operation was aborted", "AbortError"));
              }
            },
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "timeout",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headAfterAbort = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    expect(headAfterAbort).toBe(commitSha);
    const reportLog = await spawnProcess({
      command: "git",
      args: ["log", "-1", "--name-only", "--format=", "--", "audit/report.md"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 4_000,
    });
    expect(reportLog.ok).toBe(true);
    expect(reportLog.output.trim()).toBe("");
  });
  it("returns bounded validation failure after budget finalization instead of waiting for another LLM turn", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-invalid-report-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");
    await writeFile(path.join(root, "audit", "report.md"), "# Audit\n\nNo validated findings.\n");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-invalid-report",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-invalid-report",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-validate",
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-invalid-report",
          choices: [{ message: { role: "assistant", content: "late finalization" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://192.168.88.62:8003/v1",
          maxToolTurns: 8,
        },
        execution: {
          allowedWritePaths: ["audit/report.md"],
          auditReportArtifactPath: "audit/report.md",
          repositoryInspectionToolBudget: 1,
        },
      }),
    );

    expect(result.outputText).toContain(
      "Audit report validation failed during repository-inspection budget finalization",
    );
    expect(result.outputText).toContain("validate_audit_report output");
    expect(result.outputText).not.toContain("late finalization");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("returns bounded validation failure when a batched inspection call exhausts budget before validation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-batched-validate-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");
    await writeFile(path.join(root, "audit", "report.md"), "# Audit\n\nNo validated findings.\n");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-batched-validate",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                  {
                    id: "call-validate",
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-batched-validate",
          choices: [{ message: { role: "assistant", content: "late finalization" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://192.168.88.62:8003/v1",
          maxToolTurns: 8,
        },
        execution: {
          allowedWritePaths: ["audit/report.md"],
          auditReportArtifactPath: "audit/report.md",
          repositoryInspectionToolBudget: 1,
        },
      }),
    );

    expect(result.outputText).toContain(
      "Audit report validation failed during repository-inspection budget finalization",
    );
    expect(result.outputText).not.toContain("late finalization");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("skips the finalization model request after repository inspection budget is exhausted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-finalize-timeout-"));
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-finalize-timeout",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read-allowed",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockImplementationOnce((_url, init = {}) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "TimeoutError"));
          });
        });
      });

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        execution: {
          repositoryInspectionToolBudget: 1,
          repositoryInspectionBudgetFinalResponseTimeoutMs: 5,
          runTimeoutMs: 30_000,
        },
      }),
    );

    expect(result.outputText).toContain("no further LLM finalization request was made");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects when aborted before local budget finalization can mutate an audit report", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-finalize-abort-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");
    const reportPath = path.join(root, "audit", "report.md");
    const reportBefore = [
      "# Audit",
      "",
      "No validated findings.",
      "```audit-report-manifest",
      JSON.stringify({
        version: 1,
        auditPlanId: "task:task-1",
        taskId: "task-1",
        artifactPath: "audit/report.md",
        contentSha256: "0".repeat(64),
        outcome: "validated_no_findings",
        scopeCoverage: [],
        riskHypotheses: [],
        findings: [],
        noFindingsClaims: [],
        evidenceRefs: [],
      }),
      "```",
      "",
    ].join("\n");
    await writeFile(reportPath, reportBefore, "utf8");
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.com"]);
    await expectSpawnOk(root, ["config", "user.name", "Test User"]);
    await expectSpawnOk(root, ["add", "README.md", "audit/report.md"]);
    await expectSpawnOk(root, ["commit", "-m", "init", "--no-verify"]);
    const abort = new AbortController();
    fetchMock.mockImplementationOnce(() => {
      abort.abort(new DOMException("The operation was aborted", "AbortError"));
      return Promise.resolve(
        jsonResponse({
          id: "chat-inspection-budget-finalize-abort",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read-allowed",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    });

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          workflowKind: "audit",
          execution: {
            abortController: abort,
            allowedWritePaths: ["audit/report.md"],
            auditReportArtifactPath: "audit/report.md",
            repositoryInspectionToolBudget: 1,
            runTimeoutMs: 30_000,
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "timeout",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await readFile(reportPath, "utf8")).toBe(reportBefore);
    const committedFiles = await spawnProcess({
      command: "git",
      args: ["show", "--name-only", "--format=", "HEAD"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 4_000,
    });
    expect(committedFiles.ok).toBe(true);
    expect(committedFiles.output.split(/\r?\n/).filter(Boolean)).toEqual([
      "README.md",
      "audit/report.md",
    ]);
  });
  it("can controlled-fail instead of posting finalization after repository inspection budget exhaustion", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-controlled-failure-"));
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-inspection-budget-controlled-failure",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-read-budgeted",
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: JSON.stringify({ path: "README.md" }),
                  },
                },
              ],
            },
          },
        ],
      }),
    );

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          workflowKind: "audit",
          options: {
            baseUrl: "http://qwen.local/v1",
            toolTimeoutMs: 5_000,
            maxOutputChars: 4_000,
            repositoryInspectionBudgetFinalizationMode: "controlled_failure",
          },
          execution: {
            repositoryInspectionToolBudget: 1,
            runTimeoutMs: 30_000,
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "context_length",
      message: expect.stringContaining("stopped before finalization"),
      providerMeta: expect.objectContaining({
        status: "repository_inspection_budget_exhausted",
        reason: "controlled_failure_after_repository_inspection_budget_exhaustion",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("returns bounded budget exhaustion text without compacted finalization when endpoint input is large", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-finalize-budget-"));
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");
    let baseUrlReads = 0;
    const dynamicOptions = {
      get baseUrl() {
        baseUrlReads += 1;
        return baseUrlReads <= 3 ? "http://qwen.local/v1" : "http://192.168.88.62:8003/v1";
      },
      toolTimeoutMs: 5_000,
      maxOutputChars: 4_000,
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-inspection-budget-finalize-budget",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-read-allowed",
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: JSON.stringify({ path: "README.md" }),
                  },
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        systemPrompt: "x".repeat(80_000),
        options: dynamicOptions,
        execution: {
          repositoryInspectionToolBudget: 1,
          repositoryInspectionBudgetFinalResponseTimeoutMs: 5_000,
        },
      }),
    );

    expect(result.outputText).toContain("no further LLM finalization request was made");
    expect(result.outputText).toContain("repositoryInspectionToolBudget=1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("returns bounded budget exhaustion text before max turns can run after compaction", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-max-turns-"));
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-max-turns",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read-allowed",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-inspection-budget-max-turns",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-git-status",
                    type: "function",
                    function: {
                      name: "git_status",
                      arguments: JSON.stringify({}),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://192.168.88.62:8003/v1",
          maxToolTurns: 2,
        },
        execution: {
          repositoryInspectionToolBudget: 1,
        },
      }),
    );

    expect(result.outputText).toContain("no further LLM finalization request was made");
    expect(result.outputText).toContain("repositoryInspectionToolBudget=1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("stops repeated identical tool calls before exhausting the run turn limit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-repeated-tool-loop-"));
    const repeatedToolCall = {
      type: "function",
      function: {
        name: "run_shell",
        arguments: JSON.stringify({ command: "ls", args: ["-la"] }),
      },
    };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-repeated-tools",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "call-1", ...repeatedToolCall }],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-repeated-tools",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "call-2", ...repeatedToolCall }],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-repeated-tools",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "call-3", ...repeatedToolCall }],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-repeated-tools",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "call-4", ...repeatedToolCall }],
              },
            },
          ],
        }),
      );

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 2,
            maxToolTurns: 20,
          },
          execution: {
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "run_shell",
        repeatedToolCallLimit: 2,
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const blockedEvent = events.find((event) => event.type === "repeated_tool_loop_blocked");
    expect(blockedEvent).toMatchObject({
      level: "warn",
      data: expect.objectContaining({
        workflowKind: "implementer",
        stage: "implementer",
        toolName: "run_shell",
        repeatedCount: 3,
        repeatedToolCallLimit: 2,
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
        fingerprintInput: expect.objectContaining({
          workflowKind: "implementer",
          stage: "implementer",
          toolName: "run_shell",
          targetPath: null,
          normalizedArgs: { args: ["-la"], command: "ls" },
          allowedWritePaths: [],
        }),
      }),
    });
  });

  it("blocks repeated read tools by normalized fingerprint and special cap", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-read-loop-fingerprint-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "a.ts"), "export const a = 1;\n", "utf8");
    const readCalls = [
      { lineCount: 10, path: "src\\a.ts", startLine: 1 },
      { startLine: 1, path: "./src/a.ts", lineCount: 10 },
      { path: "src/a.ts", startLine: 1, lineCount: 10 },
    ];
    for (const [index, args] of readCalls.entries()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-read-loop-fingerprint",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-read-${index + 1}`,
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify(args),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 6,
            maxToolTurns: 20,
          },
          execution: {
            allowedWritePaths: ["audit/report.md"],
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "read_file",
        repeatedToolCallLimit: 2,
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(events.find((event) => event.type === "repeated_tool_loop_blocked")).toMatchObject({
      data: expect.objectContaining({
        signatureCount: 3,
        repeatedCount: 3,
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
        fingerprintInput: expect.objectContaining({
          workflowKind: "implementer",
          stage: "implementer",
          toolName: "read_file",
          targetPath: "src/a.ts",
          normalizedArgs: { lineCount: 10, path: "src/a.ts", startLine: 1 },
          allowedWritePaths: ["audit/report.md"],
        }),
      }),
    });
  });

  it("canary honors repeatedToolCallLimit 1 before executing a blocked repeated read_file call", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-read-loop-canary-"));
    await writeFile(path.join(root, "README.md"), "# Canary\n", "utf8");
    for (const index of [1, 2]) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-read-loop-canary",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-read-canary-${index}`,
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "README.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 1,
            maxToolTurns: 20,
          },
          execution: {
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        stage: "implementer",
        toolName: "read_file",
        repeatedCount: 2,
        repeatedToolCallLimit: 1,
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.type === "tool:result")).toHaveLength(1);
    expect(events.find((event) => event.type === "repeated_tool_loop_blocked")).toMatchObject({
      data: expect.objectContaining({
        stage: "implementer",
        toolName: "read_file",
        repeatedCount: 2,
        repeatedToolCallLimit: 1,
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
      }),
    });
  });

  it("blocks interleaved repeated read_file calls by signature count", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-read-interleaved-"));
    await expectSpawnOk(root, ["init", "-b", "main"]);
    await writeFile(path.join(root, "README.md"), "# Readme\n", "utf8");
    enqueueToolTurns("chat-read-interleaved", [
      { name: "read_file", args: { path: "README.md" } },
      { name: "git_status", args: {} },
      { name: "read_file", args: { path: "./README.md" } },
      { name: "git_status", args: {} },
      { name: "read_file", args: { path: "README.md" } },
    ]);

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 2,
            maxToolTurns: 20,
          },
          execution: {
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "read_file",
        signatureCount: 3,
        repeatedToolCallLimit: 2,
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      events.filter((event) => event.type === "tool:result" && event.data?.name === "read_file"),
    ).toHaveLength(2);
    expect(events.find((event) => event.type === "repeated_tool_loop_blocked")).toMatchObject({
      data: expect.objectContaining({
        toolName: "read_file",
        signatureCount: 3,
        repeatedToolCallCount: 1,
        repeatedCount: 3,
        repeatedToolCallLimit: 2,
        nonconsecutive: true,
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
        fingerprintInput: expect.objectContaining({
          targetPath: "README.md",
          normalizedArgs: { path: "README.md" },
        }),
        targetPath: "README.md",
      }),
    });
  });

  it("honors repeatedToolCallLimit=1 for interleaved read_file calls", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-read-interleaved-limit-1-"));
    await expectSpawnOk(root, ["init", "-b", "main"]);
    await writeFile(path.join(root, "README.md"), "# Readme\n", "utf8");
    enqueueToolTurns("chat-read-interleaved-limit-1", [
      { name: "read_file", args: { path: "README.md" } },
      { name: "git_status", args: {} },
      { name: "read_file", args: { path: "README.md" } },
    ]);

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 1,
            maxToolTurns: 20,
          },
          execution: {
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "read_file",
        signatureCount: 2,
        repeatedToolCallLimit: 1,
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      events.filter((event) => event.type === "tool:result" && event.data?.name === "read_file"),
    ).toHaveLength(1);
    expect(events.find((event) => event.type === "repeated_tool_loop_blocked")).toMatchObject({
      data: expect.objectContaining({
        toolName: "read_file",
        signatureCount: 2,
        repeatedCount: 2,
        repeatedToolCallLimit: 1,
        nonconsecutive: true,
      }),
    });
  });

  it("blocks interleaved repeated list_files calls by signature count", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-list-interleaved-"));
    await expectSpawnOk(root, ["init", "-b", "main"]);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Readme\n", "utf8");
    enqueueToolTurns("chat-list-interleaved", [
      { name: "list_files", args: { path: "src" } },
      { name: "git_status", args: {} },
      { name: "list_files", args: { path: "./src/" } },
      { name: "read_file", args: { path: "README.md" } },
      { name: "list_files", args: { path: "src" } },
    ]);

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 2,
            maxToolTurns: 20,
          },
          execution: {
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "list_files",
        signatureCount: 3,
        targetPath: "src",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      events.filter((event) => event.type === "tool:result" && event.data?.name === "list_files"),
    ).toHaveLength(2);
    expect(events.find((event) => event.type === "repeated_tool_loop_blocked")).toMatchObject({
      data: expect.objectContaining({
        toolName: "list_files",
        targetPath: "src",
        signatureCount: 3,
        repeatedCount: 3,
        nonconsecutive: true,
      }),
    });
  });

  it("blocks interleaved repeated search_files calls by signature count", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-search-interleaved-"));
    await expectSpawnOk(root, ["init", "-b", "main"]);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "a.ts"), "export const needle = 1;\n", "utf8");
    await writeFile(path.join(root, "README.md"), "# Readme\n", "utf8");
    enqueueToolTurns("chat-search-interleaved", [
      { name: "search_files", args: { query: "needle", path: "src", regex: false } },
      { name: "git_status", args: {} },
      { name: "search_files", args: { path: "./src", query: "needle", regex: false } },
      { name: "read_file", args: { path: "README.md" } },
      { name: "search_files", args: { query: "needle", path: "src/", regex: false } },
    ]);

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 2,
            maxToolTurns: 20,
          },
          execution: {
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "search_files",
        signatureCount: 3,
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      events.filter((event) => event.type === "tool:result" && event.data?.name === "search_files"),
    ).toHaveLength(2);
    expect(events.find((event) => event.type === "repeated_tool_loop_blocked")).toMatchObject({
      data: expect.objectContaining({
        toolName: "search_files",
        targetPath: "src",
        signatureCount: 3,
        repeatedCount: 3,
        nonconsecutive: true,
        fingerprintInput: expect.objectContaining({
          normalizedArgs: { path: "src", query: "needle", regex: false },
        }),
      }),
    });
  });

  it("blocks interleaved repeated stable git_status checks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-status-interleaved-"));
    await expectSpawnOk(root, ["init", "-b", "main"]);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Readme\n", "utf8");
    enqueueToolTurns("chat-git-status-interleaved", [
      { name: "git_status", args: {} },
      { name: "read_file", args: { path: "README.md" } },
      { name: "git_status", args: {} },
      { name: "list_files", args: { path: "." } },
      { name: "git_status", args: {} },
    ]);

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 2,
            maxToolTurns: 20,
          },
          execution: {
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "git_status",
        gitStatusStateRepeated: true,
        gitStatusResultFingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      events.filter((event) => event.type === "tool:result" && event.data?.name === "git_status"),
    ).toHaveLength(2);
    expect(events.find((event) => event.type === "repeated_tool_loop_blocked")).toMatchObject({
      data: expect.objectContaining({
        toolName: "git_status",
        signatureCount: 3,
        repeatedCount: 3,
        repeatedToolCallLimit: 2,
        nonconsecutive: true,
        gitStatusStateRepeated: true,
        gitStatusResultFingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
      }),
    });
  });

  it("does not block git_status when repository state changes between checks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-status-state-change-"));
    await expectSpawnOk(root, ["init", "-b", "main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.com"]);
    await expectSpawnOk(root, ["config", "user.name", "Test User"]);
    await mkdir(path.join(root, "src"), { recursive: true });
    enqueueToolTurns("chat-git-status-state-change", [
      { name: "git_status", args: {} },
      { name: "write_file", args: { path: "src/a.ts", content: "export const a = 1;\n" } },
      { name: "git_status", args: {} },
      { name: "git_commit", args: { paths: ["src/a.ts"], message: "add a" } },
      { name: "git_status", args: {} },
    ]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-git-status-state-change",
        choices: [{ message: { role: "assistant", content: "done" } }],
      }),
    );

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 2,
            maxToolTurns: 20,
          },
          execution: {
            allowedWritePaths: ["src/a.ts"],
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).resolves.toMatchObject({ outputText: "done" });

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(events.find((event) => event.type === "repeated_tool_loop_blocked")).toBeUndefined();
    expect(
      events.filter((event) => event.type === "tool:result" && event.data?.name === "git_status"),
    ).toHaveLength(3);
  }, 15_000);

  it("blocks repeated list_files calls by normalized path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-list-loop-fingerprint-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    for (const [index, args] of [{ path: "src" }, { path: "./src/" }, { path: "src" }].entries()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-list-loop-fingerprint",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-list-${index + 1}`,
                    type: "function",
                    function: {
                      name: "list_files",
                      arguments: JSON.stringify(args),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 6,
            maxToolTurns: 20,
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "list_files",
        repeatedToolCallLimit: 2,
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
        fingerprintInput: expect.objectContaining({
          targetPath: "src",
          normalizedArgs: { path: "src" },
        }),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("normalizes search_files fingerprints by query, scope path, and flags", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-search-loop-fingerprint-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "a.ts"), "export const needle = 1;\n", "utf8");
    const calls = [
      { query: "needle", path: "src\\", regex: false, caseSensitive: false, maxMatches: 5 },
      { maxMatches: 5, caseSensitive: false, regex: false, path: "./src", query: "needle" },
      { path: "src", query: "needle", regex: false, caseSensitive: false, maxMatches: 5 },
    ];
    for (const [index, args] of calls.entries()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-search-loop-fingerprint",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-search-${index + 1}`,
                    type: "function",
                    function: {
                      name: "search_files",
                      arguments: JSON.stringify(args),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 2,
            maxToolTurns: 20,
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "search_files",
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
        fingerprintInput: expect.objectContaining({
          toolName: "search_files",
          targetPath: "src",
          normalizedArgs: {
            caseSensitive: false,
            maxMatches: 5,
            path: "src",
            query: "needle",
            regex: false,
          },
        }),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("blocks repeated clean git_status checks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-status-loop-"));
    await expectSpawnOk(root, ["init", "-b", "main"]);
    for (const index of [1, 2, 3]) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-git-status-loop",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-status-${index}`,
                    type: "function",
                    function: { name: "git_status", arguments: JSON.stringify({}) },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 6,
            maxToolTurns: 20,
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "git_status",
        repeatedToolCallLimit: 2,
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops interleaved repeated git_commit loops before exhausting the run turn limit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-commit-loop-"));
    await expectSpawnOk(root, ["init", "-b", "main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.com"]);
    await expectSpawnOk(root, ["config", "user.name", "Test User"]);
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(path.join(root, "audit", "summary.md"), "# Summary\n", "utf8");

    const repeatedCommitCall = {
      type: "function",
      function: {
        name: "git_commit",
        arguments: JSON.stringify({
          paths: ["audit/summary.md"],
          message: "add audit summary",
        }),
      },
    };
    const statusCall = {
      type: "function",
      function: {
        name: "git_status",
        arguments: JSON.stringify({}),
      },
    };
    for (const [index, toolCall] of [
      repeatedCommitCall,
      statusCall,
      repeatedCommitCall,
      statusCall,
      repeatedCommitCall,
    ].entries()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-git-commit-loop",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: `call-${index + 1}`, ...toolCall }],
              },
            },
          ],
        }),
      );
    }

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 2,
            maxToolTurns: 20,
          },
          execution: {
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "git_commit",
        repeatedToolCallLimit: 1,
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(events.find((event) => event.type === "repeated_tool_loop_blocked")).toMatchObject({
      data: expect.objectContaining({
        repeatedCount: 2,
        nonconsecutive: true,
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
        fingerprintInput: expect.objectContaining({
          workflowKind: "implementer",
          stage: "implementer",
          toolName: "git_commit",
          targetPath: "audit/summary.md",
          allowedWritePaths: [],
        }),
      }),
    });
  }, 15_000);

  it("allows git_commit retry after audit report content repair then blocks no-delta retry", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-commit-repair-retry-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "config.ts"),
      "export const timeoutMs = 1000;\n",
      "utf8",
    );
    await writeFile(path.join(root, "audit", "report.md"), "# Audit\n\nNo manifest yet.\n", "utf8");
    await expectSpawnOk(root, ["init", "-b", "main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.com"]);
    await expectSpawnOk(root, ["config", "user.name", "Test User"]);
    await expectSpawnOk(root, ["add", "src/config.ts"]);
    await expectSpawnOk(root, ["commit", "-m", "init", "--no-verify"]);
    const commitSha = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    const treeSha = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD^{tree}"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    const evidenceId = "ev_33333333-3333-4333-8333-333333333333";
    const reportBody = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");
    const repairedReport = `${reportBody}\n\`\`\`audit-report-manifest\n${JSON.stringify({
      version: 1,
      auditPlanId: "task:task-commit-retry",
      taskId: "task-commit-retry",
      artifactPath: "audit/report.md",
      contentSha256: computeAuditReportContentSha256(reportBody),
      sourceSnapshot: {
        id: `git:${commitSha}:${treeSha}`,
        commit: commitSha,
        tree: treeSha,
        dirty: false,
      },
      outcome: "validated_no_findings",
      scopeCoverage: [{ root: "src/config.ts", evidenceRefs: [evidenceId] }],
      riskHypotheses: [
        { id: "risk-1", description: "Runtime configuration drift", status: "covered" },
      ],
      findings: [],
      noFindingsClaims: [
        { id: "nf-1", root: "src/config.ts", riskId: "risk-1", evidenceRefs: [evidenceId] },
      ],
      evidenceRefs: [evidenceId],
    })}\n\`\`\`\n`;
    const commitCall = {
      type: "function",
      function: {
        name: "git_commit",
        arguments: JSON.stringify({
          paths: ["audit/report.md"],
          message: "commit repaired report",
        }),
      },
    };
    for (const [index, toolCall] of [
      commitCall,
      {
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({ path: "audit/report.md", content: repairedReport }),
        },
      },
      {
        type: "function",
        function: {
          name: "finalize_audit_report_manifest",
          arguments: JSON.stringify({ path: "audit/report.md" }),
        },
      },
      commitCall,
      commitCall,
    ].entries()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-git-commit-repair-retry",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: `call-commit-retry-${index + 1}`, ...toolCall }],
              },
            },
          ],
        }),
      );
    }

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 6,
            maxToolTurns: 20,
          },
          execution: {
            allowedWritePaths: ["audit/report.md"],
            auditReportArtifactPath: "audit/report.md",
            auditReportTaskDescription:
              "Scope: src/config.ts\nRisk hypotheses: risk-1 Runtime configuration drift",
            auditReportTaskId: "task-commit-retry",
            auditReportAuditPlanId: "task:task-commit-retry",
            auditReportEvidenceUnits: [
              {
                id: evidenceId,
                taskId: "task-commit-retry",
                auditPlanId: "task:task-commit-retry",
                sourceSnapshotId: `git:${commitSha}:${treeSha}`,
                toolName: "Grep",
                evidenceKind: "search",
                evidenceGrade: "substantive",
                scopeIds: ["src/config.ts"],
                riskHypothesisIds: ["risk-1"],
                pathHashes: [],
                pathRangeHashes: [],
                command: { command: 'rg -n "timeoutMs" src/config.ts', args: [], cwd: null },
                exitCode: 0,
                outputSha256: "1".repeat(64),
                outputPreview: "src/config.ts:1:export const timeoutMs = 1000;",
                outputPreviewTruncated: false,
                parsedSummary: {
                  outputBytes: 46,
                  outputLineCount: 1,
                  previewChars: 46,
                  exitCode: null,
                },
                redactionStatus: "clean",
                createdAt: "2026-05-22T00:00:00.000Z",
              },
            ],
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "git_commit",
        repeatedToolCallLimit: 1,
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      events.filter((event) => event.type === "tool:result" && event.data?.name === "git_commit"),
    ).toHaveLength(2);
    expect(
      events.find((event) => event.type === "tool:result" && event.data?.name === "git_commit")
        ?.data?.ok,
    ).toBe(false);
    expect(
      events.filter((event) => event.type === "tool:result" && event.data?.name === "git_commit")[1]
        ?.data?.ok,
    ).toBe(true);
  }, 20_000);

  it("stops interleaved repeated run_shell loops before exhausting the run turn limit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-run-shell-loop-"));
    const repeatedShellCall = {
      type: "function",
      function: {
        name: "run_shell",
        arguments: JSON.stringify({ command: "ls", args: ["-la"] }),
      },
    };
    const statusCall = {
      type: "function",
      function: {
        name: "git_status",
        arguments: JSON.stringify({}),
      },
    };
    for (const [index, toolCall] of [
      repeatedShellCall,
      statusCall,
      repeatedShellCall,
      statusCall,
      repeatedShellCall,
    ].entries()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-run-shell-loop",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: `call-${index + 1}`, ...toolCall }],
              },
            },
          ],
        }),
      );
    }

    const events = [];
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 2,
            maxToolTurns: 20,
          },
          execution: {
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "run_shell",
        repeatedToolCallLimit: 2,
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(events.find((event) => event.type === "repeated_tool_loop_blocked")).toMatchObject({
      data: expect.objectContaining({
        repeatedCount: 3,
        nonconsecutive: true,
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
        fingerprintInput: expect.objectContaining({
          workflowKind: "implementer",
          stage: "implementer",
          toolName: "run_shell",
          normalizedArgs: { args: ["-la"], command: "ls" },
        }),
      }),
    });
  }, 15_000);

  it("blocks repeated finalize_audit_report_manifest calls per artifact", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-finalize-loop-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(path.join(root, "audit", "report.md"), "# Audit\n", "utf8");
    for (const index of [1, 2, 3]) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-finalize-loop",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-finalize-${index}`,
                    type: "function",
                    function: {
                      name: "finalize_audit_report_manifest",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          workflowKind: "audit",
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 6,
            maxToolTurns: 20,
          },
          execution: {
            allowedWritePaths: ["audit/report.md"],
            auditReportArtifactPath: "audit/report.md",
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "finalize_audit_report_manifest",
        repeatedToolCallLimit: 2,
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
        fingerprintInput: expect.objectContaining({
          stage: "audit",
          targetPath: "audit/report.md",
        }),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops repeated audit report validation fingerprints before generic tool-loop suppression", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-validate-loop-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(
      path.join(root, "audit", "report.md"),
      "# Audit\n\nNo validated findings.\n",
      "utf8",
    );

    const repeatedValidateCall = {
      type: "function",
      function: {
        name: "validate_audit_report",
        arguments: JSON.stringify({ path: "audit/report.md" }),
      },
    };
    const statusCall = {
      type: "function",
      function: {
        name: "git_status",
        arguments: JSON.stringify({}),
      },
    };
    for (const [index, toolCall] of [
      repeatedValidateCall,
      statusCall,
      repeatedValidateCall,
      statusCall,
      repeatedValidateCall,
    ].entries()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-loop",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: `call-${index + 1}`, ...toolCall }],
              },
            },
          ],
        }),
      );
    }

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          workflowKind: "audit",
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 6,
            maxToolTurns: 20,
          },
          execution: {
            allowedWritePaths: ["audit/report.md"],
            auditReportArtifactPath: "audit/report.md",
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "validate_audit_report",
        auditValidation: expect.objectContaining({
          deterministicRoute: expect.any(String),
          fingerprint: expect.any(String),
        }),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops repeated same audit validation fingerprint before generic tool-loop suppression", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-validate-fingerprint-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(
      path.join(root, "audit", "report.md"),
      "# Audit\n\nEvidence: `missing-one.ts:1`\n",
      "utf8",
    );

    for (const [index, toolName] of ["validate_audit_report", "validate_audit_report"].entries()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-fingerprint",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-${index + 1}`,
                    type: "function",
                    function: {
                      name: toolName,
                      arguments:
                        toolName === "validate_audit_report"
                          ? JSON.stringify({ path: "audit/report.md" })
                          : JSON.stringify({}),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          workflowKind: "audit",
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 6,
            maxToolTurns: 20,
          },
          execution: {
            allowedWritePaths: ["audit/report.md"],
            auditReportArtifactPath: "audit/report.md",
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "validate_audit_report",
        auditValidation: expect.objectContaining({
          repairMode: "bounded_deterministic_repair",
          deterministicRoute: "bounded_deterministic_repair",
          fingerprint: expect.any(String),
        }),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("routes repeated source-inconclusive audit validation fingerprints deterministically", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-validate-source-inconclusive-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "config.ts"),
      "export const timeoutMs = 1000;\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "audit", "report.md"),
      [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "Risk hypotheses: risk-auth for `src/config.ts` auth drift was covered and is absent.",
        "",
        "Checked files:",
        "- `src/config.ts:1`",
        "",
        "Checked commands:",
        '- Command `rg -n "auth" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
        "",
        "Absence reasoning: risk-auth covered `src/config.ts:1`; no auth drift was identified.",
        "",
      ].join("\n"),
      "utf8",
    );

    for (const index of [1, 2]) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-source-inconclusive",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-validate-${index}`,
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          workflowKind: "audit",
          options: {
            baseUrl: "http://qwen.local/v1",
            maxToolTurns: 20,
          },
          execution: {
            allowedWritePaths: ["audit/report.md"],
            auditReportArtifactPath: "audit/report.md",
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "validate_audit_report",
        auditValidation: expect.objectContaining({
          repairMode: "source_inconclusive",
          deterministicRoute: "source_inconclusive",
          sourceClassification: "source_inconclusive",
          issueCodes: expect.arrayContaining(["shallow_evidence"]),
          fingerprint: expect.any(String),
        }),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("routes repeated operator-input audit validation fingerprints deterministically", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-validate-operator-input-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "config.ts"),
      "export const timeoutMs = 1000;\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "audit", "report.md"),
      [
        "# Runtime Audit",
        "",
        "No validated findings.",
        "",
        "Checked files:",
        "- `src/config.ts:1`",
        "",
        "Checked commands:",
        '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
        "",
      ].join("\n"),
      "utf8",
    );

    for (const index of [1, 2]) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-operator-input",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-validate-${index}`,
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          workflowKind: "audit",
          options: {
            baseUrl: "http://qwen.local/v1",
            maxToolTurns: 20,
          },
          execution: {
            allowedWritePaths: ["audit/report.md"],
            auditReportArtifactPath: "audit/report.md",
            auditReportTaskDescription: "Scope: .",
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "validate_audit_report",
        auditValidation: expect.objectContaining({
          repairMode: "operator_input_required",
          deterministicRoute: "operator_input_required",
          issueCodes: expect.arrayContaining(["missing_scope_coverage"]),
          fingerprint: expect.any(String),
        }),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows changed audit validation fingerprints after report repair", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-validate-changed-fingerprint-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(
      path.join(root, "audit", "report.md"),
      "# Audit\n\nEvidence: `missing-one.ts:1`\n",
      "utf8",
    );

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-changed-fingerprint",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-validate-1",
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-changed-fingerprint",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-write",
                    type: "function",
                    function: {
                      name: "write_file",
                      arguments: JSON.stringify({
                        path: "audit/report.md",
                        content: "# Audit\n\nEvidence: `missing-two.ts:1`\n",
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-changed-fingerprint",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-validate-2",
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-changed-fingerprint",
          choices: [{ message: { role: "assistant", content: "final after changed fingerprint" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://qwen.local/v1",
          maxToolTurns: 20,
        },
        execution: {
          allowedWritePaths: ["audit/report.md"],
          auditReportArtifactPath: "audit/report.md",
        },
      }),
    );

    expect(result.outputText).toContain("final after changed fingerprint");
    expect(result.outputText).not.toContain(
      "Stopped after repeated audit report validation fingerprint",
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("blocks repeated successful audit validation loops by stable report state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-validate-success-loop-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "config.ts"),
      "export const timeoutMs = 1000;\n",
      "utf8",
    );
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.com"]);
    await expectSpawnOk(root, ["config", "user.name", "Test User"]);
    await expectSpawnOk(root, ["add", "src/config.ts"]);
    await expectSpawnOk(root, ["commit", "-m", "init", "--no-verify"]);
    const commitSha = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    const treeSha = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD^{tree}"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    const evidenceId = "ev_22222222-2222-4222-8222-222222222222";
    const reportBody = [
      "# Runtime Audit",
      "",
      "No validated findings.",
      "Risk hypotheses: risk-1 for `src/config.ts` timeout drift was covered and is absent.",
      "",
      "Checked files:",
      "- `src/config.ts:1`",
      "",
      "Checked commands:",
      '- Command `rg -n "timeoutMs" src/config.ts` output: `1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");
    const manifest = {
      version: 1,
      auditPlanId: "task:task-success-loop",
      taskId: "task-success-loop",
      artifactPath: "audit/report.md",
      contentSha256: computeAuditReportContentSha256(reportBody),
      sourceSnapshot: {
        id: `git:${commitSha}:${treeSha}`,
        commit: commitSha,
        tree: treeSha,
        dirty: false,
      },
      outcome: "validated_no_findings",
      scopeCoverage: [{ root: "src/config.ts", evidenceRefs: [evidenceId] }],
      riskHypotheses: [
        { id: "risk-1", description: "Runtime configuration drift", status: "covered" },
      ],
      findings: [],
      noFindingsClaims: [
        { id: "nf-1", root: "src/config.ts", riskId: "risk-1", evidenceRefs: [evidenceId] },
      ],
      evidenceRefs: [evidenceId],
    };
    await writeFile(
      path.join(root, "audit", "report.md"),
      `${reportBody}\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest)}\n\`\`\`\n`,
      "utf8",
    );
    const validateCall = {
      type: "function",
      function: {
        name: "validate_audit_report",
        arguments: JSON.stringify({ path: "audit/report.md" }),
      },
    };
    const statusCall = {
      type: "function",
      function: { name: "git_status", arguments: JSON.stringify({}) },
    };
    for (const [index, toolCall] of [
      validateCall,
      statusCall,
      validateCall,
      statusCall,
      validateCall,
    ].entries()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-success-loop",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: `call-success-${index + 1}`, ...toolCall }],
              },
            },
          ],
        }),
      );
    }

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          workflowKind: "audit",
          options: {
            baseUrl: "http://qwen.local/v1",
            repeatedToolCallLimit: 6,
            maxToolTurns: 20,
          },
          execution: {
            allowedWritePaths: ["audit/report.md"],
            auditReportArtifactPath: "audit/report.md",
            auditReportTaskDescription:
              "Scope: src/config.ts\nRisk hypotheses: risk-1 Runtime configuration drift",
            auditReportTaskId: "task-success-loop",
            auditReportAuditPlanId: "task:task-success-loop",
            auditReportEvidenceUnits: [
              {
                id: evidenceId,
                taskId: "task-success-loop",
                auditPlanId: "task:task-success-loop",
                sourceSnapshotId: `git:${commitSha}:${treeSha}`,
                toolName: "Grep",
                evidenceKind: "search",
                evidenceGrade: "substantive",
                scopeIds: ["src/config.ts"],
                riskHypothesisIds: ["risk-1"],
                pathHashes: [],
                pathRangeHashes: [],
                command: { command: 'rg -n "timeoutMs" src/config.ts', args: [], cwd: null },
                exitCode: 0,
                outputSha256: "1".repeat(64),
                outputPreview: "src/config.ts:1:export const timeoutMs = 1000;",
                outputPreviewTruncated: false,
                parsedSummary: {
                  outputBytes: 46,
                  outputLineCount: 1,
                  previewChars: 46,
                  exitCode: null,
                },
                redactionStatus: "clean",
                createdAt: "2026-05-22T00:00:00.000Z",
              },
            ],
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "validate_audit_report",
        repeatedToolCallLimit: 2,
        fingerprint: expect.stringMatching(SHA256_HEX_PATTERN),
        fingerprintInput: expect.objectContaining({
          fileStates: [
            expect.objectContaining({
              path: "audit/report.md",
              status: "file",
              sha256: expect.any(String),
            }),
          ],
        }),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("stops after max audit validation failure passes even when fingerprints change", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-validate-max-passes-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(
      path.join(root, "audit", "report.md"),
      "# Audit\n\nEvidence: `missing-one.ts:1`\n",
      "utf8",
    );

    for (const [index, pathToken] of [
      "missing-one.ts",
      "missing-two.ts",
      "missing-three.ts",
      "missing-four.ts",
    ].entries()) {
      if (index > 0) {
        fetchMock.mockResolvedValueOnce(
          jsonResponse({
            id: "chat-audit-validate-max-passes",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: `call-write-${index}`,
                      type: "function",
                      function: {
                        name: "write_file",
                        arguments: JSON.stringify({
                          path: "audit/report.md",
                          content: `# Audit\n\nEvidence: \`${pathToken}:1\`\n`,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        );
      }
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-max-passes",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-validate-${index + 1}`,
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        options: {
          baseUrl: "http://qwen.local/v1",
          maxToolTurns: 20,
        },
        execution: {
          allowedWritePaths: ["audit/report.md"],
          auditReportArtifactPath: "audit/report.md",
        },
      }),
    );

    expect(result.outputText).toContain("Audit report validation pass limit exhausted");
    expect(result.outputText).toContain("validationFingerprint=");
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("routes repeated manual-review audit validation fingerprints fail-closed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-validate-manual-review-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# test\n", "utf8");
    await writeFile(
      path.join(root, "audit", "report.md"),
      [
        "# Audit",
        "",
        "## Finding",
        "Evidence: `README.md:1` documents the project.",
        "Risk: `README.md` does not exist, so operators cannot read the project overview.",
        "Proposed fix: Restore `README.md`.",
        'Verification: Command `rg -n "test" README.md` output:',
        "```",
        "README.md:1:# test",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );

    for (const index of [1, 2]) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "chat-audit-validate-manual-review",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-validate-${index}`,
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          workflowKind: "audit",
          options: {
            baseUrl: "http://qwen.local/v1",
            maxToolTurns: 20,
          },
          execution: {
            allowedWritePaths: ["audit/report.md"],
            auditReportArtifactPath: "audit/report.md",
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        status: "repeated_tool_loop_blocked",
        toolName: "validate_audit_report",
        auditValidation: expect.objectContaining({
          repairMode: "manual_review_required",
          deterministicRoute: "manual_review_required",
          fingerprint: expect.any(String),
        }),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("directs low-quality audit report repairs to delete weak findings", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-low-quality-repair-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "config.ts"),
      "export const timeoutMs = 1000;\n",
      "utf8",
    );
    const body = [
      "# Audit",
      "",
      "### Finding AOB-1: bot.py is a monolithic hub file with cross-module responsibilities",
      "Evidence: `src/config.ts:1` defines the runtime timeout.",
      "Risk: The file contains 1871 lines and serves as the central hub that imports and coordinates submodules, creating a single point of architectural failure.",
      "Proposed fix: Extract a dispatcher and add `__all__` declarations.",
      "",
      "### Finding AOB-2: optional dependency without runtime guard",
      "Evidence: `src/config.ts:1` defines the runtime timeout.",
      "Risk: The optional dependency guard creates a latent runtime failure.",
      "Proposed fix: Add a runtime guard.",
      "",
    ].join("\n");
    await writeFile(
      path.join(root, "audit", "report.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(
        {
          version: 1,
          auditPlanId: "task:task-audit",
          taskId: "task-audit",
          artifactPath: "audit/report.md",
          contentSha256: computeAuditReportContentSha256(body),
          sourceSnapshot: { id: "git:abc:def", commit: "abc", tree: "def", dirty: false },
          outcome: "validated_findings_present",
          scopeCoverage: [{ root: "src/config.ts", evidenceRefs: ["ev-1"] }],
          riskHypotheses: [{ id: "risk-1", description: "weak architecture", status: "covered" }],
          findings: [{ id: "AOB-1", evidenceRefs: ["ev-1"] }],
          noFindingsClaims: [],
          evidenceRefs: ["ev-1"],
        },
        null,
        2,
      )}\n\`\`\`\n`,
      "utf8",
    );

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-low-quality-validate",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-1",
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-low-quality-final",
          choices: [{ message: { role: "assistant", content: "stopped for repair" } }],
        }),
      );

    await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        execution: {
          allowedWritePaths: ["audit/report.md"],
          auditReportArtifactPath: "audit/report.md",
          auditReportTaskId: "task-audit",
        },
      }),
    );

    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1].body);
    const toolMessage = secondRequest.messages.find((message) => message.role === "tool");
    expect(toolMessage.content).toContain("LOW_QUALITY_AUDIT_REPORT_REPAIR_REQUIRED");
    expect(toolMessage.content).toContain("reviewerRepairBrief=");
    expect(toolMessage.content).toContain("rejectedFindingCandidates");
    expect(toolMessage.content).toContain(
      "Finding AOB-1: bot.py is a monolithic hub file with cross-module responsibilities",
    );
    expect(toolMessage.content).toContain(
      "Finding AOB-2: optional dependency without runtime guard",
    );
    expect(toolMessage.content).toContain("requiredRepairActions");
    expect(toolMessage.content).toContain("non_actionable_audit_observation => delete broad");
    expect(toolMessage.content).toContain("Delete every finding");
    expect(toolMessage.content).toContain("do not rephrase");
    expect(toolMessage.content).toContain("do not create `### Finding` or `### Risk` sections");
    expect(toolMessage.content).toContain("actual runtime audit ledger IDs");
    expect(toolMessage.content).toContain("AOB-style IDs");
    expect(toolMessage.content).toContain("duplicated-initialization/DRY");
    expect(toolMessage.content).toContain("basename-only paths");
    expect(toolMessage.content).toContain("Do not cite `.ai-factory/*`");
    expect(toolMessage.content).toContain("no-callers/no-wiring/unused-code/orphaned-module");
    expect(toolMessage.content).toContain(
      "late-import/mixed-import/split-import/cold-start-footprint",
    );
    expect(toolMessage.content).toContain("every declared scope root");
    expect(toolMessage.content).toContain("source_inconclusive");
    expect(toolMessage.content).toContain("Do not spend more source-inspection budget");
  });

  it("blocks source inspection after a low-quality audit report repair directive", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-repair-lock-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "config.ts"),
      "export const timeoutMs = 1000;\n",
      "utf8",
    );
    const body = [
      "# Audit",
      "",
      "### Finding AOB-1: bot.py is a monolithic hub file with cross-module responsibilities",
      "Evidence: `src/config.ts:1` defines the runtime timeout.",
      "Risk: The file contains 1871 lines and serves as the central hub, creating a single point of architectural failure.",
      "Proposed fix: Extract handlers.",
      "",
    ].join("\n");
    await writeFile(
      path.join(root, "audit", "report.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(
        {
          version: 1,
          auditPlanId: "task:task-audit",
          taskId: "task-audit",
          artifactPath: "audit/report.md",
          contentSha256: computeAuditReportContentSha256(body),
          sourceSnapshot: { id: "git:abc:def", commit: "abc", tree: "def", dirty: false },
          outcome: "validated_findings_present",
          scopeCoverage: [{ root: "src/config.ts", evidenceRefs: ["ev-1"] }],
          riskHypotheses: [{ id: "risk-1", description: "weak architecture", status: "covered" }],
          findings: [{ id: "AOB-1", evidenceRefs: ["ev-1"] }],
          noFindingsClaims: [],
          evidenceRefs: ["ev-1"],
        },
        null,
        2,
      )}\n\`\`\`\n`,
      "utf8",
    );

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-repair-lock-validate",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-1",
                    type: "function",
                    function: {
                      name: "validate_audit_report",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-repair-lock-source-read",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-2",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "src/config.ts" }),
                    },
                  },
                  {
                    id: "call-3",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "audit/report.md" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-repair-lock-final",
          choices: [{ message: { role: "assistant", content: "stopped for repair" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        workflowKind: "audit",
        execution: {
          allowedWritePaths: ["audit/report.md"],
          auditReportArtifactPath: "audit/report.md",
          auditReportTaskId: "task-audit",
        },
      }),
    );

    const thirdRequest = JSON.parse(fetchMock.mock.calls[2][1].body);
    const toolMessages = thirdRequest.messages.filter((message) => message.role === "tool");
    const deniedSourceRead = toolMessages.find((message) => message.tool_call_id === "call-2");
    const allowedArtifactRead = toolMessages.find((message) => message.tool_call_id === "call-3");
    expect(deniedSourceRead.content).toContain("low-quality repair lock is active");
    expect(deniedSourceRead.content).toContain("Use the existing ledger evidence");
    expect(allowedArtifactRead.content).toContain("# Audit");
    expect(JSON.stringify(result.events)).not.toContain("read_file audit evidence captured");
  });

  it("does not log raw provider-supplied unknown tool names or ids", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-unknown-tool-redaction-"));
    const events = [];
    const onToolUse = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-unknown-tool",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-token=sk-SECRET",
                    type: "function",
                    function: {
                      name: "token=sk-SECRET",
                      arguments: "{}",
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-unknown-tool",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );
    await runQwenLocalAgentApi(
      createRunInput(root, {
        execution: {
          onEvent: (event) => events.push(event),
          onToolUse,
        },
      }),
    );
    const serializedEvents = JSON.stringify(events);
    const serializedCallbacks = JSON.stringify(onToolUse.mock.calls);
    expect(serializedEvents).toContain("unknown_qwen_tool");
    expect(serializedEvents).not.toContain("sk-SECRET");
    expect(serializedEvents).not.toContain("call-token=sk-SECRET");
    expect(serializedCallbacks).not.toContain("sk-SECRET");
    expect(onToolUse).toHaveBeenCalledWith("unknown_qwen_tool", "");
  });
  it("redacts touched file paths in tool result events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-touched-redaction-"));
    const events = [];
    const tokenLikePath = "audit/ghp_123456789012345678901234567890123456.md";
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-touched-redaction",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-write",
                    type: "function",
                    function: {
                      name: "write_file",
                      arguments: JSON.stringify({
                        path: tokenLikePath,
                        content: "safe\n",
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-touched-redaction",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );
    await runQwenLocalAgentApi(
      createRunInput(root, {
        execution: {
          onEvent: (event) => events.push(event),
        },
      }),
    );
    expect(await readFile(path.join(root, tokenLikePath), "utf8")).toBe("safe\n");
    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain("ghp_123456789012345678901234567890123456");
    expect(serializedEvents).toContain("[REDACTED]");
  });
  it("denies secret-like file paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-secret-"));
    await writeFile(path.join(root, ".env"), "OPENAI_API_KEY=sk-SECRET\n", "utf8");
    const result = await executeQwenLocalTool(
      "read_file",
      { path: ".env" },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("secret-like path");
    expect(result.error).not.toContain("sk-SECRET");
  });
  it("allows .env.example template writes without permitting real env files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-env-template-"));
    const context = createDefaultQwenToolContext({
      projectRoot: root,
      execution: { allowedWritePaths: [".env.example"] },
      options: { maxOutputChars: 2_000 },
    });

    const written = await executeQwenLocalTool(
      "write_file",
      {
        path: ".env.example",
        content: "API_BASE_URL=http://localhost:3009\nAPP_MODE=development\n",
      },
      context,
    );
    const read = await executeQwenLocalTool("read_file", { path: ".env.example" }, context);
    const denied = await executeQwenLocalTool(
      "write_file",
      { path: ".env.local", content: "API_BASE_URL=http://localhost:3009\n" },
      context,
    );

    expect(written.ok).toBe(true);
    expect(read.ok).toBe(true);
    expect(read.output).toContain("API_BASE_URL=http://localhost:3009");
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("secret-like path");
    expect(() =>
      createDefaultQwenToolContext({
        projectRoot: root,
        execution: { allowedWritePaths: [".env.local"] },
      }),
    ).toThrow(/secret-like path/);
  });
  it("reads large files in bounded line windows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-read-window-"));
    await writeFile(
      path.join(root, "large.py"),
      Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n"),
      "utf8",
    );
    const first = await executeQwenLocalTool(
      "read_file",
      { path: "large.py" },
      { projectRoot: root, maxFileLines: 5, maxFileBytes: 200, maxOutputChars: 2_000 },
    );
    expect(first.ok).toBe(true);
    expect(first.output).toContain("lines 1-5 of 20");
    expect(first.output).toContain("line 5");
    expect(first.output).not.toContain("line 6");
    expect(first.output).toContain("startLine=6");

    const second = await executeQwenLocalTool(
      "read_file",
      { path: "large.py", startLine: 6, lineCount: 3 },
      { projectRoot: root, maxFileLines: 5, maxFileBytes: 200, maxOutputChars: 2_000 },
    );
    expect(second.ok).toBe(true);
    expect(second.output).toContain("lines 6-8 of 20");
    expect(second.output).toContain("line 8");
    expect(second.output).not.toContain("line 9");
  });
  it("searches non-secret files with bounded path-line previews", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-search-"));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "app.py"), "alpha\nneedle here\n", "utf8");
    await writeFile(path.join(root, ".env"), "needle secret\n", "utf8");
    const result = await executeQwenLocalTool(
      "search_files",
      { query: "needle", path: ".", maxMatches: 10 },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("src/app.py:2");
    expect(result.output).not.toContain(".env");
  });
  it("caps planner tool budgets below profile-wide qwen defaults", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-planner-budget-"));
    const context = createDefaultQwenToolContext({
      projectRoot: root,
      workflowKind: "planner",
      options: {
        maxFileBytes: 50_000,
        maxFileLines: 500,
        maxDirectoryEntries: 500,
        maxSearchMatches: 100,
        maxOutputChars: 50_000,
      },
    });

    expect(context.maxFileBytes).toBe(8_000);
    expect(context.maxFileLines).toBe(120);
    expect(context.maxDirectoryEntries).toBe(120);
    expect(context.maxSearchMatches).toBe(30);
    expect(context.maxOutputChars).toBe(6_000);
  });
  it("allows only scoped report artifact writes when execution allowedWritePaths is set", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-allowed-write-tools-"));
    const context = createDefaultQwenToolContext({
      projectRoot: root,
      execution: { allowedWritePaths: ["audit/report.md"] },
    });

    const allowed = await executeQwenLocalTool(
      "write_file",
      { path: "audit/report.md", content: "report\n" },
      context,
    );
    const deniedWrite = await executeQwenLocalTool(
      "write_file",
      { path: "tmp_hash.py", content: "print('hash')\n" },
      context,
    );
    const deniedPatch = await executeQwenLocalTool(
      "apply_patch",
      {
        patch: [
          "diff --git a/tmp_body.txt b/tmp_body.txt",
          "new file mode 100644",
          "--- /dev/null",
          "+++ b/tmp_body.txt",
          "@@ -0,0 +1 @@",
          "+helper",
          "",
        ].join("\n"),
      },
      context,
    );
    const deniedCommit = await executeQwenLocalTool(
      "git_commit",
      { paths: ["tmp_hash.py"], message: "commit helper" },
      context,
    );

    expect(allowed.ok).toBe(true);
    expect(await readFile(path.join(root, "audit", "report.md"), "utf8")).toBe("report\n");
    expect(deniedWrite.ok).toBe(false);
    expect(deniedPatch.ok).toBe(false);
    expect(deniedCommit.ok).toBe(false);
    expect(deniedWrite.error).toMatch(/^write_path_not_allowed: tmp_hash\.py/);
    expect(deniedWrite.policyViolation).toBe(true);
    expect(JSON.parse(qwenToolResultForModel(deniedWrite)).policyViolation).toBe(true);
    expect(deniedPatch.policyViolation).toBe(true);
    expect(deniedCommit.policyViolation).toBe(true);
    expect(deniedWrite.error).toContain("write_path_not_allowed: tmp_hash.py");
    expect(deniedPatch.error).toContain("write_path_not_allowed: tmp_body.txt");
    expect(deniedCommit.error).toContain("write_path_not_allowed: tmp_hash.py");
    expect(`${deniedWrite.error} ${deniedPatch.error} ${deniedCommit.error}`).toContain(
      "allowed write paths (audit/report.md)",
    );
    await expect(readFile(path.join(root, "tmp_hash.py"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(root, "tmp_body.txt"), "utf8")).rejects.toThrow();
  });
  it("stops immediately after a policy-violation tool result", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-policy-stop-"));
    const events = [];
    enqueueToolTurns("chat-policy-stop", [
      { name: "write_file", args: { path: "src/outside.ts", content: "bad\n" } },
    ]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-policy-stop",
        choices: [{ message: { role: "assistant", content: "should-not-run" } }],
      }),
    );

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          execution: {
            allowedWritePaths: ["audit/report.md"],
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        reason: "policy_violation",
        policyViolation: true,
        toolName: "write_file",
        targetPath: "src/outside.ts",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.find((event) => event.type === "tool:result")).toMatchObject({
      data: expect.objectContaining({
        name: "write_file",
        ok: false,
        policyViolation: true,
        error: expect.stringMatching(/^write_path_not_allowed: src\/outside\.ts/),
      }),
    });
    await expect(readFile(path.join(root, "src", "outside.ts"), "utf8")).rejects.toThrow();
  });
  it("stops after a scoped package-manager dynamic write target policy violation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-policy-stop-run-shell-dynamic-"));
    const events = [];
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"const fs=require('fs'); const target='src/out.ts'; fs.writeFileSync('audit/report.md','ok'); fs.writeFileSync(target,'bad')\"",
        },
      }),
      "utf8",
    );
    enqueueToolTurns("chat-policy-stop-run-shell-dynamic", [
      {
        name: "run_shell",
        args: { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
      },
    ]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-policy-stop-run-shell-dynamic",
        choices: [{ message: { role: "assistant", content: "should-not-run" } }],
      }),
    );

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          execution: {
            allowedWritePaths: ["audit/report.md"],
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        reason: "policy_violation",
        policyViolation: true,
        toolName: "run_shell",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.find((event) => event.type === "tool:result")).toMatchObject({
      data: expect.objectContaining({
        name: "run_shell",
        ok: false,
        policyViolation: true,
        error: expect.stringContaining(
          "can write files but does not declare a scoped write target",
        ),
      }),
    });
    await expect(readFile(path.join(root, "audit", "report.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(path.join(root, "src", "out.ts"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("stops after a scoped package-manager workspace policy violation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-policy-stop-run-shell-workspace-"));
    const events = [];
    await mkdir(path.join(root, "subpkg", "src"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        workspaces: ["subpkg"],
        scripts: {
          test: "node -e \"require('fs').writeFileSync('audit/report.md','root')\"",
        },
      }),
      "utf8",
    );
    await writeFile(
      path.join(root, "subpkg", "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"require('fs').writeFileSync('src/out.ts','bad')\"",
        },
      }),
      "utf8",
    );
    enqueueToolTurns("chat-policy-stop-run-shell-workspace", [
      {
        name: "run_shell",
        args: {
          command: process.platform === "win32" ? "npm.cmd" : "npm",
          args: ["run", "test", "--workspace", "subpkg"],
        },
      },
    ]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-policy-stop-run-shell-workspace",
        choices: [{ message: { role: "assistant", content: "should-not-run" } }],
      }),
    );

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          execution: {
            allowedWritePaths: ["audit/report.md"],
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        reason: "policy_violation",
        policyViolation: true,
        toolName: "run_shell",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.find((event) => event.type === "tool:result")).toMatchObject({
      data: expect.objectContaining({
        name: "run_shell",
        ok: false,
        policyViolation: true,
        error: expect.stringContaining("workspace or alternate package-root arguments"),
      }),
    });
    await expect(readFile(path.join(root, "audit", "report.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(path.join(root, "subpkg", "src", "out.ts"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("stops after a scoped package-manager nested script policy violation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-policy-stop-run-shell-nested-"));
    const events = [];
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "npm run write-out",
          "write-out": "node -e \"require('fs').writeFileSync('src/out.ts','bad')\"",
        },
      }),
      "utf8",
    );
    enqueueToolTurns("chat-policy-stop-run-shell-nested", [
      {
        name: "run_shell",
        args: { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
      },
    ]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-policy-stop-run-shell-nested",
        choices: [{ message: { role: "assistant", content: "should-not-run" } }],
      }),
    );

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          execution: {
            allowedWritePaths: ["audit/report.md"],
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        reason: "policy_violation",
        policyViolation: true,
        toolName: "run_shell",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.find((event) => event.type === "tool:result")).toMatchObject({
      data: expect.objectContaining({
        name: "run_shell",
        ok: false,
        policyViolation: true,
        error: expect.stringContaining("delegates to another package-manager script"),
      }),
    });
    await expect(readFile(path.join(root, "src", "out.ts"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("stops after a scoped package-manager local script file policy violation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-policy-stop-run-shell-local-file-"));
    const events = [];
    await mkdir(path.join(root, "scripts"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "scripts", "write-out.js"),
      "require('fs').writeFileSync('src/out.ts','bad')\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node scripts/write-out.js",
        },
      }),
      "utf8",
    );
    enqueueToolTurns("chat-policy-stop-run-shell-local-file", [
      {
        name: "run_shell",
        args: { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
      },
    ]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-policy-stop-run-shell-local-file",
        choices: [{ message: { role: "assistant", content: "should-not-run" } }],
      }),
    );

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          execution: {
            allowedWritePaths: ["audit/report.md"],
            onEvent: (event) => events.push(event),
          },
        }),
      ),
    ).rejects.toMatchObject({
      category: "permission",
      providerMeta: expect.objectContaining({
        reason: "policy_violation",
        policyViolation: true,
        toolName: "run_shell",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.find((event) => event.type === "tool:result")).toMatchObject({
      data: expect.objectContaining({
        name: "run_shell",
        ok: false,
        policyViolation: true,
        error: expect.stringContaining("delegates to a local script file"),
      }),
    });
    await expect(readFile(path.join(root, "src", "out.ts"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("treats directory and glob allowed write paths as scoped boundaries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-allowed-write-glob-"));
    const context = createDefaultQwenToolContext({
      projectRoot: root,
      execution: { allowedWritePaths: ["src/app/**", "tsconfig*.json"] },
    });

    const nested = await executeQwenLocalTool(
      "write_file",
      { path: "src/app/index.ts", content: "export const ok = true;\n" },
      context,
    );
    const globbed = await executeQwenLocalTool(
      "write_file",
      { path: "tsconfig.node.json", content: "{}\n" },
      context,
    );
    const denied = await executeQwenLocalTool(
      "write_file",
      { path: "src/other.ts", content: "export const no = true;\n" },
      context,
    );

    expect(nested.ok).toBe(true);
    expect(globbed.ok).toBe(true);
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("allowed write paths (src/app/**, tsconfig*.json)");
  });
  it("denies writes to generated dependency directories even when no explicit write scope is set", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-generated-write-deny-"));
    const context = createDefaultQwenToolContext({ projectRoot: root });

    const deniedWrite = await executeQwenLocalTool(
      "write_file",
      { path: "node_modules/@types/node/index.d.ts", content: "declare const process: unknown;\n" },
      context,
    );
    const deniedPatch = await executeQwenLocalTool(
      "apply_patch",
      {
        patch: [
          "diff --git a/dist/index.js b/dist/index.js",
          "new file mode 100644",
          "--- /dev/null",
          "+++ b/dist/index.js",
          "@@ -0,0 +1 @@",
          "+console.log('built');",
          "",
        ].join("\n"),
      },
      context,
    );
    const deniedCommit = await executeQwenLocalTool(
      "git_commit",
      { paths: ["dist/index.js"], message: "commit build output" },
      context,
    );

    expect(deniedWrite.ok).toBe(false);
    expect(deniedPatch.ok).toBe(false);
    expect(deniedCommit.ok).toBe(false);
    expect(`${deniedWrite.error} ${deniedPatch.error} ${deniedCommit.error}`).toContain(
      "generated/dependency directory",
    );
    await expect(
      readFile(path.join(root, "node_modules", "@types", "node", "index.d.ts"), "utf8"),
    ).rejects.toThrow();
    await expect(readFile(path.join(root, "dist", "index.js"), "utf8")).rejects.toThrow();
  });
  it("computes and finalizes audit report manifest hashes for the scoped artifact only", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-report-hash-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    const reportBody = [
      "# Architecture Audit",
      "",
      "No validated findings.",
      "",
      "Evidence: README.md:1",
      "",
    ].join("\n");
    const report = [
      reportBody,
      "```audit-report-manifest",
      '{"contentSha256":"PLACEHOLDER"}',
      "```",
      "",
    ].join("\n");
    await writeFile(path.join(root, "audit", "report.md"), report, "utf8");
    await writeFile(path.join(root, "audit", "other.md"), report, "utf8");
    const context = createDefaultQwenToolContext({
      projectRoot: root,
      execution: { allowedWritePaths: ["audit/report.md"] },
    });

    const result = await executeQwenLocalTool(
      "compute_audit_report_hash",
      { path: "audit/report.md" },
      context,
    );
    const finalized = await executeQwenLocalTool(
      "finalize_audit_report_manifest",
      { path: "audit/report.md" },
      context,
    );
    const denied = await executeQwenLocalTool(
      "compute_audit_report_hash",
      { path: "audit/other.md" },
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.touchedFiles).toEqual([]);
    expect(result.output).toContain("contentSha256 audit/report.md");
    expect(result.output).toContain(computeAuditReportContentSha256(report));
    expect(finalized.ok).toBe(true);
    expect(finalized.output).toContain(computeAuditReportContentSha256(report));
    expect(finalized.touchedFiles.map((entry) => entry.replaceAll("\\", "/"))).toEqual([
      "audit/report.md",
    ]);
    const finalizedContent = await readFile(path.join(root, "audit", "report.md"), "utf8");
    expect(finalizedContent).toContain(
      `"contentSha256": "${computeAuditReportContentSha256(report)}"`,
    );
    expect(finalizedContent).not.toContain("PLACEHOLDER");
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("allowed write paths (audit/report.md)");
  });
  it("expands unique shortened audit evidence refs when finalizing audit manifests", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-report-evidence-ref-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    const fullEvidenceId = "ev_abcdef12-3456-4abc-8def-abcdef123456";
    const shortEvidenceId = "ev_abcdef12";
    const body = ["# Architecture Audit", "", `Evidence ledger ref: ${shortEvidenceId}`, ""].join(
      "\n",
    );
    const manifest = {
      version: 1,
      contentSha256: "PLACEHOLDER",
      evidenceRefs: [shortEvidenceId],
      scopeCoverage: [{ root: "src/config.ts", evidenceRefs: [shortEvidenceId] }],
      findings: [{ id: "finding-1", evidenceRefs: [shortEvidenceId] }],
    };
    await writeFile(
      path.join(root, "audit", "report.md"),
      `${body}\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest)}\n\`\`\`\n`,
      "utf8",
    );
    const context = createDefaultQwenToolContext({
      projectRoot: root,
      execution: {
        allowedWritePaths: ["audit/report.md"],
        auditReportEvidenceUnits: [{ id: fullEvidenceId }],
      },
    });

    const finalized = await executeQwenLocalTool(
      "finalize_audit_report_manifest",
      { path: "audit/report.md" },
      context,
    );

    expect(finalized.ok).toBe(true);
    expect(finalized.output).toContain("expanded 4 audit evidence ref prefix(es)");
    const finalizedContent = await readFile(path.join(root, "audit", "report.md"), "utf8");
    expect(finalizedContent).toContain(fullEvidenceId);
    expect(finalizedContent).not.toMatch(/\bev_abcdef12(?!-)/);
    const manifestMatch = finalizedContent.match(
      /```audit-report-manifest\s*\r?\n([\s\S]*?)\r?\n```/,
    );
    expect(manifestMatch).toBeTruthy();
    const finalizedManifest = JSON.parse(manifestMatch?.[1] ?? "{}");
    expect(finalizedManifest.evidenceRefs).toEqual([fullEvidenceId]);
    expect(finalizedManifest.scopeCoverage[0].evidenceRefs).toEqual([fullEvidenceId]);
    expect(finalizedManifest.findings[0].evidenceRefs).toEqual([fullEvidenceId]);
    expect(finalizedManifest.contentSha256).toBe(computeAuditReportContentSha256(finalizedContent));
  });
  it("normalizes audit manifest identity from runtime context when finalizing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-report-identity-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    const body = ["# Architecture Audit", "", "No validated findings.", ""].join("\n");
    const manifest = {
      version: 1,
      auditPlanId: "task:wrong-task",
      taskId: "wrong-task",
      batchId: "wrong-batch",
      roadmapAlias: "abadapt-strong-typo",
      artifactPath: "audit/wrong.md",
      contentSha256: "PLACEHOLDER",
      evidenceRefs: [],
    };
    await writeFile(
      path.join(root, "audit", "report.md"),
      `${body}\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest)}\n\`\`\`\n`,
      "utf8",
    );
    const context = createDefaultQwenToolContext({
      projectRoot: root,
      execution: {
        allowedWritePaths: ["audit/report.md"],
        auditReportTaskId: "task-123",
        auditReportRoadmapBatchId: "batch-456",
        auditReportRoadmapAlias: "abaudit-strong-20260521-dz",
        auditReportAuditPlanId: "batch:batch-456:task:task-123",
        auditReportArtifactPath: "audit/report.md",
      },
    });

    const finalized = await executeQwenLocalTool(
      "finalize_audit_report_manifest",
      { path: "audit/report.md" },
      context,
    );

    expect(finalized.ok).toBe(true);
    const finalizedContent = await readFile(path.join(root, "audit", "report.md"), "utf8");
    const manifestMatch = finalizedContent.match(
      /```audit-report-manifest\s*\r?\n([\s\S]*?)\r?\n```/,
    );
    expect(manifestMatch).toBeTruthy();
    const finalizedManifest = JSON.parse(manifestMatch?.[1] ?? "{}");
    expect(finalizedManifest).toEqual(
      expect.objectContaining({
        auditPlanId: "batch:batch-456:task:task-123",
        taskId: "task-123",
        batchId: "batch-456",
        roadmapAlias: "abaudit-strong-20260521-dz",
        artifactPath: "audit/report.md",
        contentSha256: computeAuditReportContentSha256(finalizedContent),
      }),
    );
  });
  it("blocks git_commit when a scoped audit report hash is not finalized", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-report-commit-guard-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(
      path.join(root, "audit", "report.md"),
      [
        "# Audit",
        "",
        "Evidence: README.md:1",
        "",
        "```audit-report-manifest",
        '{"contentSha256":"COMPUTE_ME"}',
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    const context = createDefaultQwenToolContext({
      projectRoot: root,
      execution: { allowedWritePaths: ["audit/report.md"] },
    });

    const result = await executeQwenLocalTool(
      "git_commit",
      { paths: ["audit/report.md"], message: "commit report" },
      context,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("contentSha256 is not finalized");
    expect(result.error).toContain("finalize_audit_report_manifest");
  });
  it("blocks git_commit when strict scoped audit report validation fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-report-strict-guard-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "src", "bot_intevra"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "readme line\n", "utf8");
    await writeFile(path.join(root, "src", "bot_intevra", "bot.py"), "one\ntwo\n", "utf8");
    const manifest = {
      version: 1,
      auditPlanId: "task:task-1",
      taskId: "task-1",
      artifactPath: "audit/report.md",
      contentSha256: "PLACEHOLDER",
      sourceSnapshot: { id: "git:abc:tree", commit: "abc", tree: "tree", dirty: false },
      outcome: "validated_findings_present",
      scopeCoverage: [],
      riskHypotheses: ["risk-1"],
      findings: [
        {
          id: "finding-1",
          title: "bare bot path",
          classification: "blocking",
          evidence: "bot.py:1-99",
          riskHypothesis: "risk-1",
        },
      ],
      noFindingsClaims: [],
      evidenceRefs: ["ev_1"],
    };
    await writeFile(
      path.join(root, "audit", "report.md"),
      [
        "# Audit",
        "",
        "### Finding 1",
        "Evidence: bot.py:1-99",
        "Risk: the report cites a bare path and an impossible range.",
        "Proposed fix: cite the exact scoped file path and real line range.",
        "Verification: Command grep -n bot.py audit/report.md output bot.py:1-99",
        "",
        "```audit-report-manifest",
        JSON.stringify(manifest),
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    const context = createDefaultQwenToolContext({
      projectRoot: root,
      execution: {
        allowedWritePaths: ["audit/report.md"],
        auditReportArtifactPath: "audit/report.md",
        auditReportTaskDescription: [
          "Scope: README.md, src/bot_intevra/bot.py",
          "Risk hypotheses: risk-1 bot.py may hide ownership boundary failures",
        ].join("\n"),
        auditReportTaskId: "task-1",
        auditReportAuditPlanId: "task:task-1",
      },
    });
    await executeQwenLocalTool(
      "finalize_audit_report_manifest",
      { path: "audit/report.md" },
      context,
    );

    const validation = await executeQwenLocalTool(
      "validate_audit_report",
      { path: "audit/report.md" },
      context,
    );
    const commit = await executeQwenLocalTool(
      "git_commit",
      { paths: ["audit/report.md"], message: "commit report" },
      context,
    );

    expect(validation.ok).toBe(false);
    expect(validation.output).toContain("missing_report_file_references");
    expect(validation.output).toContain("missing_declared_scope_root");
    expect(commit.ok).toBe(false);
    expect(commit.error).toContain("audit report validation failed before git_commit");
    expect(commit.error).toContain("validate_audit_report");
  });
  it("blocks git_commit when audit report line evidence quotes text from the wrong source line", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-audit-report-line-quote-guard-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "config.ts"),
      "export const timeoutMs = 1000;\n",
      "utf8",
    );
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await expectSpawnOk(root, ["config", "user.email", "t@t.local"]);
    await expectSpawnOk(root, ["config", "user.name", "T"]);
    await expectSpawnOk(root, ["add", "src/config.ts"]);
    await expectSpawnOk(root, ["commit", "-m", "init", "--no-verify"]);
    const commitSha = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    const treeSha = (
      await spawnProcess({
        command: "git",
        args: ["rev-parse", "HEAD^{tree}"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      })
    ).output.trim();
    const body = [
      "# Audit",
      "",
      "### Finding 1",
      "Evidence: `src/config.ts:1` - `export const retryCount = 3;`",
      "Risk: a reviewer would trust a source line claim that was not actually present.",
      "Proposed fix: cite the exact source line that was inspected.",
      'Verification: Command `rg -n "timeoutMs" src/config.ts` output: `src/config.ts:1:export const timeoutMs = 1000;`',
      "",
    ].join("\n");
    const manifest = {
      version: 1,
      auditPlanId: "task:task-1",
      taskId: "task-1",
      artifactPath: "audit/report.md",
      contentSha256: computeAuditReportContentSha256(body),
      sourceSnapshot: {
        id: `git:${commitSha}:${treeSha}`,
        commit: commitSha,
        tree: treeSha,
        dirty: false,
      },
      outcome: "validated_findings_present",
      scopeCoverage: [{ root: "src/config.ts", evidenceRefs: ["ev_1"] }],
      riskHypotheses: ["risk-1"],
      findings: [{ id: "finding-1", evidenceRefs: ["ev_1"] }],
      noFindingsClaims: [],
      evidenceRefs: ["ev_1"],
    };
    await writeFile(
      path.join(root, "audit", "report.md"),
      `${body}\n\n\`\`\`audit-report-manifest\n${JSON.stringify(manifest)}\n\`\`\`\n`,
      "utf8",
    );
    const context = createDefaultQwenToolContext({
      projectRoot: root,
      execution: {
        allowedWritePaths: ["audit/report.md"],
        auditReportArtifactPath: "audit/report.md",
        auditReportTaskDescription: "Scope: src/config.ts\nRisk hypotheses: risk-1",
        auditReportTaskId: "task-1",
        auditReportAuditPlanId: "task:task-1",
        auditReportEvidenceUnits: [
          {
            id: "ev_1",
            taskId: "task-1",
            auditPlanId: "task:task-1",
            sourceSnapshotId: `git:${commitSha}:${treeSha}`,
            toolName: "search_files",
            evidenceKind: "search",
            evidenceGrade: "substantive",
            scopeIds: ["src", "src/config.ts"],
            riskHypothesisIds: ["risk-1"],
            pathHashes: ["0".repeat(64)],
            pathRangeHashes: [],
            command: null,
            exitCode: null,
            outputSha256: "1".repeat(64),
            outputPreview: "src/config.ts:1:export const timeoutMs = 1000;",
            outputPreviewTruncated: false,
            parsedSummary: {
              outputBytes: 46,
              outputLineCount: 1,
              previewChars: 46,
              exitCode: null,
            },
            redactionStatus: "clean",
            createdAt: "2026-05-21T00:00:00.000Z",
          },
        ],
      },
    });

    const validation = await executeQwenLocalTool(
      "validate_audit_report",
      { path: "audit/report.md" },
      context,
    );
    const commit = await executeQwenLocalTool(
      "git_commit",
      { paths: ["audit/report.md"], message: "commit report" },
      context,
    );

    expect(validation.ok).toBe(false);
    expect(validation.output).toContain("invalid_line_reference");
    expect(commit.ok).toBe(false);
    expect(commit.error).toContain("audit report validation failed before git_commit");
    expect(commit.error).toContain("invalid_line_reference");
  });
  it("applies context search caps and skips binary/cache paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-search-cap-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "__pycache__"), { recursive: true });
    await writeFile(path.join(root, "__pycache__", "cached.pyc"), "needle\n", "utf8");
    for (let index = 0; index < 12; index += 1) {
      await writeFile(path.join(root, "src", `file-${index}.py`), `needle ${index}\n`, "utf8");
    }

    const result = await executeQwenLocalTool(
      "search_files",
      { query: "needle", path: ".", maxMatches: 50 },
      { projectRoot: root, maxSearchMatches: 5, maxOutputChars: 2_000 },
    );

    expect(result.ok).toBe(true);
    expect(result.output).toContain("matches=5");
    expect(result.output).toContain("[truncated after 5 matches]");
    expect(result.output).not.toContain("__pycache__");
  });
  it("bounds tool result content before feeding it back to qwen", () => {
    const serialized = qwenToolResultForModel(
      {
        ok: true,
        output: "x".repeat(500),
        touchedFiles: [],
      },
      100,
    );
    const parsed = JSON.parse(serialized);
    expect(parsed.output.length).toBeLessThan(160);
    expect(parsed.output).toContain("[truncated");
  });
  it("denies shell arguments that reference secret-like paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-secret-"));
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: "ls", args: [".env"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("secret-like path");
  });
  it("denies file tools that cross symlink or junction components", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-link-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "qwen-link-outside-"));
    await writeFile(path.join(outside, "outside.txt"), "outside secret\n", "utf8");
    if (!(await tryCreateDirectoryLink(outside, path.join(root, "linked-out")))) {
      return;
    }
    const listResult = await executeQwenLocalTool(
      "list_files",
      { path: "linked-out" },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const readResult = await executeQwenLocalTool(
      "read_file",
      { path: "linked-out/outside.txt" },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const writeResult = await executeQwenLocalTool(
      "write_file",
      { path: "linked-out/new.txt", content: "bad\n" },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(listResult.ok).toBe(false);
    expect(readResult.ok).toBe(false);
    expect(writeResult.ok).toBe(false);
    expect(`${listResult.error} ${readResult.error} ${writeResult.error}`).toContain(
      "symbolic link or junction",
    );
    expect(await readFile(path.join(outside, "outside.txt"), "utf8")).toBe("outside secret\n");
  });
  it("denies git and patch tools that cross symlink or junction components", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-link-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "qwen-git-link-outside-"));
    await writeFile(path.join(outside, "outside.txt"), "outside\n", "utf8");
    if (!(await tryCreateDirectoryLink(outside, path.join(root, "linked-out")))) {
      return;
    }
    const patchResult = await executeQwenLocalTool(
      "apply_patch",
      {
        patch: [
          "diff --git a/linked-out/new.txt b/linked-out/new.txt",
          "new file mode 100644",
          "--- /dev/null",
          "+++ b/linked-out/new.txt",
          "@@ -0,0 +1 @@",
          "+bad",
          "",
        ].join("\n"),
      },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const commitResult = await executeQwenLocalTool(
      "git_commit",
      { paths: ["linked-out/outside.txt"], message: "bad" },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(patchResult.ok).toBe(false);
    expect(commitResult.ok).toBe(false);
    expect(`${patchResult.error} ${commitResult.error}`).toContain("symbolic link or junction");
  });
  it("denies VCS control paths for file, patch, and git tools", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-vcs-deny-"));
    const readResult = await executeQwenLocalTool(
      "read_file",
      { path: ".git/config" },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const writeResult = await executeQwenLocalTool(
      "write_file",
      { path: ".git/hooks/pre-commit", content: "#!/bin/sh\nexit 1\n" },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const patchResult = await executeQwenLocalTool(
      "apply_patch",
      {
        patch: [
          "diff --git a/.git/config b/.git/config",
          "new file mode 100644",
          "--- /dev/null",
          "+++ b/.git/config",
          "@@ -0,0 +1 @@",
          "+bad",
          "",
        ].join("\n"),
      },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const commitResult = await executeQwenLocalTool(
      "git_commit",
      { paths: [".git/config"], message: "bad" },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(readResult.ok).toBe(false);
    expect(writeResult.ok).toBe(false);
    expect(patchResult.ok).toBe(false);
    expect(commitResult.ok).toBe(false);
    expect(
      `${readResult.error} ${writeResult.error} ${patchResult.error} ${commitResult.error}`,
    ).toContain("protected VCS control path");
  });
  it("denies shell cwd and path arguments that cross symlink or junction components", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-link-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "qwen-shell-link-outside-"));
    await writeFile(path.join(outside, "outside.txt"), "outside shell secret\n", "utf8");
    if (!(await tryCreateDirectoryLink(outside, path.join(root, "linked-out")))) {
      return;
    }
    const cwdResult = await executeQwenLocalTool(
      "run_shell",
      { command: "pwd", cwd: "linked-out" },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const argResult = await executeQwenLocalTool(
      "run_shell",
      { command: "ls", args: ["linked-out"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(cwdResult.ok).toBe(false);
    expect(cwdResult.error).toContain("symbolic link or junction");
    expect(argResult.ok).toBe(false);
    expect(argResult.output).not.toContain("outside shell secret");
    expect(argResult.error).toContain("path arguments are not supported");
  });
  it("denies quoted patch paths before git apply can follow links", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-quoted-patch-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "qwen-quoted-patch-outside-"));
    if (!(await tryCreateDirectoryLink(outside, path.join(root, "linked out")))) {
      return;
    }
    const result = await executeQwenLocalTool(
      "apply_patch",
      {
        patch: [
          'diff --git "a/linked out/new.txt" "b/linked out/new.txt"',
          "new file mode 100644",
          "--- /dev/null",
          '+++ "b/linked out/new.txt"',
          "@@ -0,0 +1 @@",
          "+bad",
          "",
        ].join("\n"),
      },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("quoted patch paths are not supported");
    await expect(readFile(path.join(outside, "new.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("denies unquoted patch paths with spaces before git apply can follow links", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-space-patch-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "qwen-space-patch-outside-"));
    if (!(await tryCreateDirectoryLink(outside, path.join(root, "linked out")))) {
      return;
    }
    const result = await executeQwenLocalTool(
      "apply_patch",
      {
        patch: [
          "diff --git a/linked out/new.txt b/linked out/new.txt",
          "new file mode 100644",
          "--- /dev/null",
          "+++ b/linked out/new.txt",
          "@@ -0,0 +1 @@",
          "+bad",
          "",
        ].join("\n"),
      },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("patch paths containing whitespace are not supported");
    await expect(readFile(path.join(outside, "new.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("denies executable patch modes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-exec-patch-"));
    const result = await executeQwenLocalTool(
      "apply_patch",
      {
        patch: [
          "diff --git a/scripts/run.sh b/scripts/run.sh",
          "new file mode 100755",
          "--- /dev/null",
          "+++ b/scripts/run.sh",
          "@@ -0,0 +1,2 @@",
          "+#!/bin/sh",
          "+echo bad",
          "",
        ].join("\n"),
      },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("executable files");
    await expect(readFile(path.join(root, "scripts", "run.sh"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("denies interpreters as shell commands", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-deny-"));
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: "node", args: ["-e", "console.log(process.env.OPENAI_API_KEY)"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unsupported shell command");
  });
  it("denies raw git and package-manager broad git wrappers before execution", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-broad-git-deny-"));
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await writeFile(path.join(root, "target.txt"), "target\n", "utf8");
    const scripts = {
      commit: "git add . && git commit -m bad",
      gitExeAdd: "git.exe add .",
      gitCmdAdd: "git.cmd add .",
      gitEnvAdd: "GIT_DIR=.git git add .",
      gitDashCAdd: "git -C . add .",
      gitConfigAdd: "git -c user.name=x add -A",
      gitDirAdd: "git --git-dir=.git add .",
      nodeEvalAdd: "node -e \"require('child_process').execSync('git add .')\"",
      nodeEvalEqualsAdd: "node --eval=\"require('child_process').execSync('git add .')\"",
      nodeEvalBacktickAdd: "node --eval=\"require('child_process').execSync(`git add .`)\"",
      shellEvalAdd: 'sh -c "git add ."',
      nodeEvalGitDashCAdd: "node -e \"require('child_process').execSync('git -C . add .')\"",
      nodeEvalChainAdd:
        "node -e \"require('child_process').execSync('git add . && git commit -m bad')\"",
      nodeEvalConcatAdd: "node -e \"require('child_process').execSync('git ' + 'add .')\"",
      nodeEvalEnvAdd:
        "CMD='git add .' node -e \"require('child_process').execSync(process.env.CMD)\"",
    };
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts }), "utf8");

    const rawGit = await executeQwenLocalTool(
      "run_shell",
      { command: "git", args: ["add", "."] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const wrappedGit = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["run", "commit"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );

    expect(rawGit.ok).toBe(false);
    expect(rawGit.policyViolation).toBe(true);
    expect(rawGit.error).toContain("unsupported shell command: git");
    expect(wrappedGit.ok).toBe(false);
    expect(wrappedGit.policyViolation).toBe(true);
    expect(wrappedGit.error).toContain("broad git staging or commit commands");
    for (const scriptName of [
      "gitExeAdd",
      "gitCmdAdd",
      "gitEnvAdd",
      "gitDashCAdd",
      "gitConfigAdd",
      "gitDirAdd",
      "nodeEvalAdd",
      "nodeEvalEqualsAdd",
      "nodeEvalBacktickAdd",
      "shellEvalAdd",
      "nodeEvalGitDashCAdd",
      "nodeEvalChainAdd",
      "nodeEvalConcatAdd",
      "nodeEvalEnvAdd",
    ]) {
      const result = await executeQwenLocalTool(
        "run_shell",
        {
          command: process.platform === "win32" ? "npm.cmd" : "npm",
          args: ["run", scriptName],
        },
        { projectRoot: root, maxOutputChars: 2_000 },
      );
      const staged = await spawnProcess({
        command: "git",
        args: ["diff", "--cached", "--name-only"],
        cwd: root,
        env: buildSanitizedToolEnv(process.env),
        timeoutMs: 10_000,
        maxOutputChars: 4_000,
      });

      expect(result.ok).toBe(false);
      expect(result.policyViolation).toBe(true);
      expect(result.error).toContain("broad git staging or commit commands");
      expect(staged.ok).toBe(true);
      expect(staged.output).not.toContain("target.txt");
      expect(staged.output).toBe("");
    }
  });
  it("blocks dangerous shell commands through the shared permission policy", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-policy-deny-"));
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: "curl", args: ["https://example.test"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network transfer shell commands require human approval");
  });
  it("does not advertise or execute dir as a shell command", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-dir-deny-"));
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: "dir" },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unsupported shell command");
  });
  it("runs only structured shell commands with a sanitized environment", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-env-"));
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: "pwd", timeoutMs: 10_000 },
      {
        projectRoot: root,
        maxOutputChars: 2_000,
        env: { ...process.env, OPENAI_API_KEY: "sk-SECRET" },
      },
    );
    expect(result.ok).toBe(true);
    expect(result.output).not.toContain("sk-SECRET");
    expect(
      buildSanitizedToolEnv({ OPENAI_API_KEY: "sk-SECRET", PATH: "x" }).OPENAI_API_KEY,
    ).toBeUndefined();
  });
  it("allows package-manager verification scripts with a sanitized environment", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-timeout-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"console.log(process.env.OPENAI_API_KEY || 'none')\"",
        },
      }),
      "utf8",
    );
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("none");
    expect(result.output).not.toContain("sk-");
  });
  it("denies package-manager scripts that can write outside allowed write paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-write-scope-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"require('fs').writeFileSync('src/out.ts','bad')\"",
        },
      }),
      "utf8",
    );
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 2_000,
        execution: { allowedWritePaths: ["audit/report.md"] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("write_path_not_allowed: src/out.ts");
    await expect(readFile(path.join(root, "src", "out.ts"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("denies package-manager script writes resolved from subpackage cwd", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-cwd-scope-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await mkdir(path.join(root, "subpkg", "audit"), { recursive: true });
    await writeFile(
      path.join(root, "subpkg", "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"require('fs').writeFileSync('audit/report.md','bad')\"",
        },
      }),
      "utf8",
    );
    const result = await executeQwenLocalTool(
      "run_shell",
      {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["test"],
        cwd: "subpkg",
      },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 2_000,
        execution: { allowedWritePaths: ["audit/report.md"] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("write_path_not_allowed: subpkg/audit/report.md");
    await expect(
      readFile(path.join(root, "subpkg", "audit", "report.md"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  for (const invocation of [
    { label: "npm", command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
    { label: "pnpm", command: "pnpm", args: ["test"] },
    { label: "yarn", command: "yarn", args: ["test"] },
    { label: "bun", command: "bun", args: ["test"] },
  ]) {
    it(`denies ${invocation.label} package-manager scripts resolved from nested package cwd`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-nested-cwd-scope-"));
      await mkdir(path.join(root, "audit"), { recursive: true });
      await mkdir(path.join(root, "src", "nested"), { recursive: true });
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          scripts: {
            test: "node -e \"require('fs').writeFileSync('src/out.ts','bad')\"",
          },
        }),
        "utf8",
      );
      const result = await executeQwenLocalTool(
        "run_shell",
        {
          command: invocation.command,
          args: invocation.args,
          cwd: "src/nested",
        },
        createDefaultQwenToolContext({
          projectRoot: root,
          maxOutputChars: 2_000,
          execution: { allowedWritePaths: ["audit/report.md"] },
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain("write_path_not_allowed: src/out.ts");
      await expect(readFile(path.join(root, "src", "out.ts"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  }
  for (const workspaceInvocation of [
    { label: "--workspace", args: ["run", "test", "--workspace", "subpkg"] },
    { label: "-w", args: ["run", "test", "-w", "subpkg"] },
    { label: "-w=", args: ["run", "test", "-w=subpkg"] },
  ]) {
    it(`denies scoped package-manager workspace scripts before alternate package execution with ${workspaceInvocation.label}`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-workspace-scope-"));
      await mkdir(path.join(root, "audit"), { recursive: true });
      await mkdir(path.join(root, "subpkg", "src"), { recursive: true });
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          workspaces: ["subpkg"],
          scripts: {
            test: "node -e \"require('fs').writeFileSync('audit/report.md','root')\"",
          },
        }),
        "utf8",
      );
      await writeFile(
        path.join(root, "subpkg", "package.json"),
        JSON.stringify({
          scripts: {
            test: "node -e \"require('fs').writeFileSync('src/out.ts','bad')\"",
          },
        }),
        "utf8",
      );
      const result = await executeQwenLocalTool(
        "run_shell",
        {
          command: process.platform === "win32" ? "npm.cmd" : "npm",
          args: workspaceInvocation.args,
        },
        createDefaultQwenToolContext({
          projectRoot: root,
          maxOutputChars: 2_000,
          execution: { allowedWritePaths: ["audit/report.md"] },
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain("workspace or alternate package-root arguments");
      expect(result.policyViolation).toBe(true);
      await expect(readFile(path.join(root, "audit", "report.md"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(
        readFile(path.join(root, "subpkg", "src", "out.ts"), "utf8"),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  }
  for (const lifecycle of [
    {
      name: "pretest",
      args: ["test"],
      scripts: {
        pretest: "node -e \"require('fs').writeFileSync('src/out.ts','bad')\"",
        test: "node -e \"require('fs').writeFileSync('audit/report.md','ok')\"",
      },
    },
    {
      name: "posttest",
      args: ["test"],
      scripts: {
        test: "node -e \"require('fs').writeFileSync('audit/report.md','ok')\"",
        posttest: "node -e \"require('fs').writeFileSync('src/out.ts','bad')\"",
      },
    },
    {
      name: "prebuild",
      args: ["run", "build"],
      scripts: {
        prebuild: "node -e \"require('fs').writeFileSync('src/out.ts','bad')\"",
        build: "node -e \"require('fs').writeFileSync('audit/report.md','ok')\"",
      },
    },
    {
      name: "postbuild",
      args: ["run", "build"],
      scripts: {
        build: "node -e \"require('fs').writeFileSync('audit/report.md','ok')\"",
        postbuild: "node -e \"require('fs').writeFileSync('src/out.ts','bad')\"",
      },
    },
  ]) {
    it(`denies scoped package-manager lifecycle script ${lifecycle.name} before execution`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-lifecycle-scope-"));
      await mkdir(path.join(root, "audit"), { recursive: true });
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ scripts: lifecycle.scripts }),
        "utf8",
      );
      const result = await executeQwenLocalTool(
        "run_shell",
        { command: process.platform === "win32" ? "npm.cmd" : "npm", args: lifecycle.args },
        createDefaultQwenToolContext({
          projectRoot: root,
          maxOutputChars: 2_000,
          execution: { allowedWritePaths: ["audit/report.md"] },
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain(`package.json script ${lifecycle.name}`);
      expect(result.error).toContain("write_path_not_allowed: src/out.ts");
      await expect(readFile(path.join(root, "audit", "report.md"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(readFile(path.join(root, "src", "out.ts"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  }
  it("denies scoped package-manager scripts that delegate to another package script", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-nested-run-scope-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "npm run write-out",
          "write-out": "node -e \"require('fs').writeFileSync('src/out.ts','bad')\"",
        },
      }),
      "utf8",
    );
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 2_000,
        execution: { allowedWritePaths: ["audit/report.md"] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("delegates to another package-manager script");
    expect(result.policyViolation).toBe(true);
    await expect(readFile(path.join(root, "src", "out.ts"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  for (const delegation of [
    { label: "unquoted", script: "node scripts/write-out.js" },
    { label: "double-quoted", script: 'node "scripts/write-out.js"' },
    { label: "single-quoted", script: "node 'scripts/write-out.js'" },
    { label: "dot-backslash", script: "node .\\scripts\\write-out.js" },
    { label: "quoted dot-backslash", script: 'node ".\\scripts\\write-out.js"' },
  ]) {
    it(`denies scoped package-manager scripts that delegate to local script files with ${delegation.label} paths`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-local-file-scope-"));
      await mkdir(path.join(root, "scripts"), { recursive: true });
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(
        path.join(root, "scripts", "write-out.js"),
        "require('fs').writeFileSync('src/out.ts','bad')\n",
        "utf8",
      );
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          scripts: {
            test: delegation.script,
          },
        }),
        "utf8",
      );
      const result = await executeQwenLocalTool(
        "run_shell",
        { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
        createDefaultQwenToolContext({
          projectRoot: root,
          maxOutputChars: 2_000,
          execution: { allowedWritePaths: ["audit/report.md"] },
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain("delegates to a local script file");
      expect(result.policyViolation).toBe(true);
      await expect(readFile(path.join(root, "src", "out.ts"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  }
  it("denies package-manager scripts with mixed scoped and dynamic writes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-dynamic-write-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"const fs=require('fs'); const target='src/out.ts'; fs.writeFileSync('audit/report.md','ok'); fs.writeFileSync(target,'bad')\"",
        },
      }),
      "utf8",
    );
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 2_000,
        execution: { allowedWritePaths: ["audit/report.md"] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("can write files but does not declare a scoped write target");
    expect(result.policyViolation).toBe(true);
    await expect(readFile(path.join(root, "audit", "report.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(path.join(root, "src", "out.ts"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  for (const unsafe of [
    {
      name: "copyFileSync",
      script: "node -e \"require('fs').copyFileSync('audit/report.md','src/out.ts')\"",
    },
    {
      name: "cpSync",
      script: "node -e \"require('fs').cpSync('audit/report.md','src/out.ts')\"",
    },
    {
      name: "copyFile",
      script: "node -e \"require('fs').copyFile('audit/report.md','src/out.ts',()=>{})\"",
    },
  ]) {
    it(`denies package-manager scripts with scoped ${unsafe.name} destination writes`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-copy-write-"));
      await mkdir(path.join(root, "audit"), { recursive: true });
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "audit", "report.md"), "source", "utf8");
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          scripts: {
            test: unsafe.script,
          },
        }),
        "utf8",
      );
      const result = await executeQwenLocalTool(
        "run_shell",
        { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
        createDefaultQwenToolContext({
          projectRoot: root,
          maxOutputChars: 2_000,
          execution: { allowedWritePaths: ["audit/report.md"] },
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain("write_path_not_allowed: src/out.ts");
      await expect(readFile(path.join(root, "src", "out.ts"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  }
  for (const unsafe of [
    {
      name: "copyFileSync",
      script: "node -e \"require('fs').copyFileSync('src/out.ts','audit/report.md')\"",
    },
    {
      name: "cpSync",
      script: "node -e \"require('fs').cpSync('src/out.ts','audit/report.md')\"",
    },
    {
      name: "copyFile",
      script: "node -e \"require('fs').copyFile('src/out.ts','audit/report.md',()=>{})\"",
    },
    {
      name: "cp",
      script: "node -e \"require('fs').cp('src/out.ts','audit/report.md',()=>{})\"",
    },
    {
      name: "fs.promises.copyFile",
      script: "node -e \"require('fs').promises.copyFile('src/out.ts','audit/report.md')\"",
    },
    {
      name: "fs.promises.cp",
      script: "node -e \"require('fs').promises.cp('src/out.ts','audit/report.md')\"",
    },
  ]) {
    it(`denies package-manager scripts with scoped ${unsafe.name} source reads`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-copy-source-"));
      await mkdir(path.join(root, "audit"), { recursive: true });
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "audit", "report.md"), "target", "utf8");
      await writeFile(path.join(root, "src", "out.ts"), "source", "utf8");
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          scripts: {
            test: unsafe.script,
          },
        }),
        "utf8",
      );
      const result = await executeQwenLocalTool(
        "run_shell",
        { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
        createDefaultQwenToolContext({
          projectRoot: root,
          maxOutputChars: 2_000,
          execution: { allowedWritePaths: ["audit/report.md"] },
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain("write_path_not_allowed: src/out.ts");
      expect(await readFile(path.join(root, "src", "out.ts"), "utf8")).toBe("source");
      expect(await readFile(path.join(root, "audit", "report.md"), "utf8")).toBe("target");
    });
  }
  for (const unsafe of [
    {
      name: "rename destination",
      script: "require('fs').rename('audit/report.md','src/out.ts',()=>{})",
      deniedPath: "src/out.ts",
      sourcePath: "audit/report.md",
      sourceContent: "source",
      destinationPath: "src/out.ts",
      destinationContent: null,
    },
    {
      name: "fs.promises.rename destination",
      script: "require('fs').promises.rename('audit/report.md','src/out.ts')",
      deniedPath: "src/out.ts",
      sourcePath: "audit/report.md",
      sourceContent: "source",
      destinationPath: "src/out.ts",
      destinationContent: null,
    },
    {
      name: "rename source",
      script: "require('fs').rename('src/out.ts','audit/report.md',()=>{})",
      deniedPath: "src/out.ts",
      sourcePath: "src/out.ts",
      sourceContent: "source",
      destinationPath: "audit/report.md",
      destinationContent: "target",
    },
    {
      name: "fs.promises.rename source",
      script: "require('fs').promises.rename('src/out.ts','audit/report.md')",
      deniedPath: "src/out.ts",
      sourcePath: "src/out.ts",
      sourceContent: "source",
      destinationPath: "audit/report.md",
      destinationContent: "target",
    },
  ]) {
    it(`denies package-manager scripts with scoped ${unsafe.name} writes`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-rename-write-"));
      await mkdir(path.join(root, "audit"), { recursive: true });
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, unsafe.sourcePath), unsafe.sourceContent, "utf8");
      if (unsafe.destinationContent !== null) {
        await writeFile(path.join(root, unsafe.destinationPath), unsafe.destinationContent, "utf8");
      }
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          scripts: {
            test: `node -e "${unsafe.script}"`,
          },
        }),
        "utf8",
      );
      const result = await executeQwenLocalTool(
        "run_shell",
        { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
        createDefaultQwenToolContext({
          projectRoot: root,
          maxOutputChars: 2_000,
          execution: { allowedWritePaths: ["audit/report.md"] },
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain(`write_path_not_allowed: ${unsafe.deniedPath}`);
      expect(await readFile(path.join(root, unsafe.sourcePath), "utf8")).toBe(unsafe.sourceContent);
      if (unsafe.destinationContent === null) {
        await expect(
          readFile(path.join(root, unsafe.destinationPath), "utf8"),
        ).rejects.toMatchObject({
          code: "ENOENT",
        });
      } else {
        expect(await readFile(path.join(root, unsafe.destinationPath), "utf8")).toBe(
          unsafe.destinationContent,
        );
      }
    });
  }
  for (const unsafe of [
    {
      name: "rm -rf",
      script: "node -e \"require('fs').writeFileSync('audit/report.md','ok')\" && rm -rf src",
    },
    {
      name: "rm -fr",
      script: "node -e \"require('fs').writeFileSync('audit/report.md','ok')\" && rm -fr src",
    },
    {
      name: "rm -r -f",
      script: "node -e \"require('fs').writeFileSync('audit/report.md','ok')\" && rm -r -f src",
    },
    {
      name: "sed -i",
      script:
        "node -e \"require('fs').writeFileSync('audit/report.md','ok')\" && sed -i s/original/changed/ src/out.ts",
    },
    {
      name: "sed -E -i",
      script:
        "node -e \"require('fs').writeFileSync('audit/report.md','ok')\" && sed -E -i s/original/changed/ src/out.ts",
    },
    {
      name: "sed -E -i.bak",
      script:
        "node -e \"require('fs').writeFileSync('audit/report.md','ok')\" && sed -E -i.bak s/original/changed/ src/out.ts",
    },
    {
      name: "find -delete",
      script: "node -e \"require('fs').writeFileSync('audit/report.md','ok')\" && find src -delete",
    },
    {
      name: "cp",
      script:
        "node -e \"require('fs').writeFileSync('audit/report.md','ok')\" && cp audit/report.md src/out.ts",
    },
    {
      name: "mv",
      script:
        "node -e \"require('fs').writeFileSync('audit/report.md','ok')\" && mv audit/report.md src/out.ts",
    },
    {
      name: "del",
      script: "node -e \"require('fs').writeFileSync('audit/report.md','ok')\" && del src/out.ts",
    },
  ]) {
    it(`denies package-manager scripts with mixed scoped and unparsed ${unsafe.name} writes`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-script-unparsed-write-"));
      await mkdir(path.join(root, "audit"), { recursive: true });
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src", "out.ts"), "original", "utf8");
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          scripts: {
            test: unsafe.script,
          },
        }),
        "utf8",
      );
      const result = await executeQwenLocalTool(
        "run_shell",
        { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["test"] },
        createDefaultQwenToolContext({
          projectRoot: root,
          maxOutputChars: 2_000,
          execution: { allowedWritePaths: ["audit/report.md"] },
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.policyViolation).toBe(true);
      expect(result.error).toContain("can write files but does not declare a scoped write target");
      await expect(readFile(path.join(root, "audit", "report.md"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await readFile(path.join(root, "src", "out.ts"), "utf8")).toBe("original");
    });
  }
  it("allows safe npm dependency hydration without lifecycle scripts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-npm-install-safe-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          preinstall: "node -e \"require('fs').writeFileSync('preinstall-ran','1')\"",
        },
      }),
      "utf8",
    );
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["install"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok, result.error ?? result.output).toBe(true);
    await expect(readFile(path.join(root, "preinstall-ran"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(path.join(root, "package-lock.json"), "utf8")).toContain(
      '"lockfileVersion"',
    );
  });
  it("denies npm dependency hydration outside allowed write paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-npm-install-scope-deny-"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({}), "utf8");
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["install"] },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 2_000,
        execution: { allowedWritePaths: ["audit/report.md"] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("write_path_not_allowed: package.json");
    await expect(readFile(path.join(root, "package-lock.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("denies npm dependency hydration from subpackage cwd outside allowed write paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-npm-install-subpkg-scope-deny-"));
    await mkdir(path.join(root, "subpkg"), { recursive: true });
    await writeFile(path.join(root, "package.json"), JSON.stringify({}), "utf8");
    await writeFile(path.join(root, "subpkg", "package.json"), JSON.stringify({}), "utf8");
    const result = await executeQwenLocalTool(
      "run_shell",
      {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["install"],
        cwd: "subpkg",
      },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 2_000,
        execution: { allowedWritePaths: ["package.json", "package-lock.json"] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("write_path_not_allowed: subpkg/package.json");
    await expect(
      readFile(path.join(root, "subpkg", "package-lock.json"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("denies npm dependency hydration from nested cwd below subpackage root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-npm-install-nested-subpkg-deny-"));
    await mkdir(path.join(root, "subpkg", "src"), { recursive: true });
    await writeFile(path.join(root, "package.json"), JSON.stringify({}), "utf8");
    await writeFile(path.join(root, "subpkg", "package.json"), JSON.stringify({}), "utf8");
    const result = await executeQwenLocalTool(
      "run_shell",
      {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["install"],
        cwd: "subpkg/src",
      },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 2_000,
        execution: { allowedWritePaths: ["package.json", "package-lock.json"] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("write_path_not_allowed: subpkg/package.json");
    await expect(
      readFile(path.join(root, "subpkg", "package-lock.json"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("denies npm dependency hydration with package specs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-npm-install-spec-deny-"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({}), "utf8");
    const result = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["install", "left-pad"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("does not support package specs");
  });
  it("denies package-manager dependency mutation through run scripts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-npm-script-install-deny-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          install: "npm install --ignore-scripts --cache ./.npm-cache",
          build: "npm install && tsc",
        },
      }),
      "utf8",
    );

    const installScript = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["run", "install"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const mutatingBuildScript = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["run", "build"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );

    expect(installScript.ok).toBe(false);
    expect(installScript.error).toContain("dependency-management scripts");
    expect(mutatingBuildScript.ok).toBe(false);
    expect(mutatingBuildScript.error).toContain("mutates dependencies");
  });
  it("denies long-running package-manager dev server scripts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-npm-dev-server-deny-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          dev: "vite --host 0.0.0.0",
          build: "vite --host 0.0.0.0",
          test: "vitest",
        },
      }),
      "utf8",
    );

    const devScript = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["run", "dev"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const longRunningBuildScript = await executeQwenLocalTool(
      "run_shell",
      { command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["run", "build"] },
      { projectRoot: root, maxOutputChars: 2_000 },
    );
    const watchTest = await executeQwenLocalTool(
      "run_shell",
      {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["test", "--", "--watch"],
      },
      { projectRoot: root, maxOutputChars: 2_000 },
    );

    expect(devScript.ok).toBe(false);
    expect(devScript.error).toContain("long-running dev/watch/server scripts");
    expect(longRunningBuildScript.ok).toBe(false);
    expect(longRunningBuildScript.error).toContain("long-running dev/watch/server process");
    expect(watchTest.ok).toBe(false);
    expect(watchTest.error).toContain("long-running dev/watch/server process");
  });
  it("does not execute git hooks during git_commit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-hooks-"));
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.local"]);
    await expectSpawnOk(root, ["config", "user.name", "Qwen Test"]);
    await writeFile(path.join(root, "file.txt"), "hello\n", "utf8");
    const hookPath = path.join(root, ".git", "hooks", "pre-commit");
    await writeFile(hookPath, "#!/bin/sh\necho hook-ran > hook-ran.txt\nexit 1\n", "utf8");
    await chmod(hookPath, 0o755);
    const result = await executeQwenLocalTool(
      "git_commit",
      { paths: ["file.txt"], message: "commit without hooks" },
      { projectRoot: root, maxOutputChars: 4_000 },
    );
    expect(result.ok, result.error ?? result.output).toBe(true);
    await expect(readFile(path.join(root, "hook-ran.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("rejects git_commit when the index already contains staged paths outside allowedWritePaths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-staged-policy-"));
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.local"]);
    await expectSpawnOk(root, ["config", "user.name", "Qwen Test"]);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "allowed.txt"), "allowed\n", "utf8");
    await writeFile(path.join(root, "src", "outside.ts"), "bad\n", "utf8");
    await expectSpawnOk(root, ["add", "src/outside.ts"]);

    const result = await executeQwenLocalTool(
      "git_commit",
      { paths: ["allowed.txt"], message: "commit allowed" },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 4_000,
        execution: { allowedWritePaths: ["allowed.txt"] },
      }),
    );
    const log = await spawnProcess({
      command: "git",
      args: ["log", "--oneline"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 4_000,
    });

    expect(result.ok).toBe(false);
    expect(result.policyViolation).toBe(true);
    expect(result.error).toMatch(/^write_path_not_allowed: src\/outside\.ts/);
    expect(log.ok).toBe(false);
    expect(log.error).toContain("does not have any commits yet");
  });
  it("rejects git_commit when a staged outside path appears beyond the output truncation boundary", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-staged-policy-truncated-"));
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.local"]);
    await expectSpawnOk(root, ["config", "user.name", "Qwen Test"]);
    await mkdir(path.join(root, "allowed"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    for (let index = 0; index < 80; index += 1) {
      const suffix = String(index).padStart(3, "0");
      await writeFile(
        path.join(root, "allowed", `file-${suffix}.ts`),
        `allowed ${suffix}\n`,
        "utf8",
      );
    }
    await writeFile(path.join(root, "src", "outside.ts"), "bad\n", "utf8");
    await expectSpawnOk(root, ["add", "allowed", "src/outside.ts"]);

    const result = await executeQwenLocalTool(
      "git_commit",
      { paths: ["allowed/file-000.ts"], message: "commit allowed" },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 24,
        execution: { allowedWritePaths: ["allowed"] },
      }),
    );
    const log = await spawnProcess({
      command: "git",
      args: ["log", "--oneline"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 4_000,
    });

    expect(result.ok).toBe(false);
    expect(result.policyViolation).toBe(true);
    expect(result.error).toMatch(/^write_path_not_allowed: src\/outside\.ts/);
    expect(log.ok).toBe(false);
    expect(log.error).toContain("does not have any commits yet");
  });
  it("rejects git_commit when the index already contains staged deletions outside allowedWritePaths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-staged-delete-policy-"));
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.local"]);
    await expectSpawnOk(root, ["config", "user.name", "Qwen Test"]);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "allowed.txt"), "allowed\n", "utf8");
    await writeFile(path.join(root, "src", "outside.ts"), "bad\n", "utf8");
    await expectSpawnOk(root, ["add", "allowed.txt", "src/outside.ts"]);
    await expectSpawnOk(root, ["commit", "-m", "init", "--no-verify"]);
    await rm(path.join(root, "src", "outside.ts"));
    await expectSpawnOk(root, ["add", "src/outside.ts"]);

    const result = await executeQwenLocalTool(
      "git_commit",
      { paths: ["allowed.txt"], message: "commit allowed" },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 4_000,
        execution: { allowedWritePaths: ["allowed.txt"] },
      }),
    );
    const status = await spawnProcess({
      command: "git",
      args: ["status", "--short"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 4_000,
    });

    expect(result.ok).toBe(false);
    expect(result.policyViolation).toBe(true);
    expect(result.error).toMatch(/^write_path_not_allowed: src\/outside\.ts/);
    expect(status.ok).toBe(true);
    expect(status.output).toContain("D  src/outside.ts");
  });
  it("rejects git_commit when a staged rename moves an outside path into allowedWritePaths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-git-staged-rename-policy-"));
    await expectSpawnOk(root, ["init", "--initial-branch=main"]);
    await expectSpawnOk(root, ["config", "user.email", "test@example.local"]);
    await expectSpawnOk(root, ["config", "user.name", "Qwen Test"]);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "outside.ts"), "tracked\n", "utf8");
    await expectSpawnOk(root, ["add", "src/outside.ts"]);
    await expectSpawnOk(root, ["commit", "-m", "init", "--no-verify"]);
    await rename(path.join(root, "src", "outside.ts"), path.join(root, "allowed.txt"));
    await expectSpawnOk(root, ["add", "-A"]);

    const result = await executeQwenLocalTool(
      "git_commit",
      { paths: ["allowed.txt"], message: "commit allowed rename" },
      createDefaultQwenToolContext({
        projectRoot: root,
        maxOutputChars: 4_000,
        execution: { allowedWritePaths: ["allowed.txt"] },
      }),
    );
    const log = await spawnProcess({
      command: "git",
      args: ["log", "--oneline"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 4_000,
    });

    expect(result.ok).toBe(false);
    expect(result.policyViolation).toBe(true);
    expect(result.error).toMatch(/^write_path_not_allowed: src\/outside\.ts/);
    expect(log.ok).toBe(true);
    expect(
      String(log.output ?? "")
        .trim()
        .split(/\r?\n/),
    ).toHaveLength(1);
  });
  it("redacts raw tool arguments from tool-use events and callbacks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-redact-events-"));
    const events = [];
    const onToolUse = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read-secret-arg",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "audit/sk-SECRET.txt" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-1",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );
    await runQwenLocalAgentApi(
      createRunInput(root, {
        execution: {
          onEvent: (event) => events.push(event),
          onToolUse,
        },
      }),
    );
    expect(JSON.stringify(events)).not.toContain("sk-SECRET");
    expect(JSON.stringify(onToolUse.mock.calls)).not.toContain("sk-SECRET");
  });
  it("drops unknown nested tool arguments from events and callbacks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-redact-nested-events-"));
    const events = [];
    const onToolUse = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-1",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-nested-secret-arg",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({
                        path: "missing.txt",
                        extra: {
                          apiKey: "sk-SECRET",
                          values: [{ token: "ghp_123456789012345678901234567890123456" }],
                        },
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-1",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );
    await runQwenLocalAgentApi(
      createRunInput(root, {
        execution: {
          onEvent: (event) => events.push(event),
          onToolUse,
        },
      }),
    );
    const serialized = JSON.stringify({ events, calls: onToolUse.mock.calls });
    expect(serialized).not.toContain("sk-SECRET");
    expect(serialized).not.toContain("ghp_123456789012345678901234567890123456");
    expect(serialized).not.toContain("apiKey");
  });
  it("reports process timeouts clearly at the spawn boundary", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-timeout-"));
    const result = await spawnProcess({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 1000)"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 50,
      maxOutputChars: 2_000,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
  });
  it("does not spawn when the signal is already aborted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-preaborted-spawn-"));
    const abort = new AbortController();
    abort.abort();
    const result = await spawnProcess({
      command: process.execPath,
      args: ["-e", "console.log('bad')"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 10_000,
      maxOutputChars: 2_000,
      signal: abort.signal,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("aborted");
    expect(result.output).not.toContain("bad");
  });
  it("does not write files when the signal is already aborted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-preaborted-write-"));
    const abort = new AbortController();
    abort.abort();
    const result = await executeQwenLocalTool(
      "write_file",
      { path: "late.txt", content: "bad\n" },
      { projectRoot: root, maxOutputChars: 2_000, signal: abort.signal },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("aborted");
    await expect(readFile(path.join(root, "late.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("escalates timed-out processes that ignore SIGTERM", async () => {
    if (process.platform === "win32") {
      return;
    }
    const root = await mkdtemp(path.join(tmpdir(), "qwen-shell-ignore-term-"));
    const startedAt = Date.now();
    const result = await spawnProcess({
      command: process.execPath,
      args: ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
      cwd: root,
      env: buildSanitizedToolEnv(process.env),
      timeoutMs: 50,
      maxOutputChars: 2_000,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });
  it("validates and lists models through /models", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const validation = await validateQwenLocalAgentApiConnection({
      runtimeId: "qwen-local-agent",
      options: { baseUrl: "http://qwen.local/v1" },
    });
    expect(validation.ok).toBe(true);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "Qwen3-32B-Q4_K_M.gguf", owned_by: "llama.cpp" }] }),
    );
    const models = await listQwenLocalAgentModels({
      runtimeId: "qwen-local-agent",
      options: { baseUrl: "http://qwen.local/v1" },
    });
    expect(models[0]).toMatchObject({
      id: "Qwen3-32B-Q4_K_M.gguf",
      supportsStreaming: false,
    });
  });
  it("redacts model discovery failures before logging fallback model warnings", async () => {
    const warn = vi.fn();
    const adapter = createQwenLocalAgentRuntimeAdapter({
      logger: { warn },
    });
    fetchMock.mockRejectedValueOnce(new Error("token=sk-SECRET"));
    const models = await adapter.listModels?.({
      runtimeId: "qwen-local-agent",
      options: { baseUrl: "http://qwen.local/v1" },
    });
    expect(models?.[0]?.id).toBe("Qwen3-32B-Q4_K_M.gguf");
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sk-SECRET");
  });
  it("throws a classified timeout when the run aborts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-timeout-"));
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted", "TimeoutError"));
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          execution: { runTimeoutMs: 100 },
        }),
      ),
    ).rejects.toMatchObject({
      name: "QwenLocalAgentRuntimeAdapterError",
      category: "timeout",
    });
  });
  it("serializes concurrent requests to the same protected local endpoint", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-semaphore-"));
    let active = 0;
    let maxActive = 0;
    let releaseFirst: (() => void) | null = null;
    const firstStarted = new Promise<void>((resolve) => {
      fetchMock.mockImplementation(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (fetchMock.mock.calls.length === 1) {
          resolve();
          await new Promise<void>((release) => {
            releaseFirst = release;
          });
        }
        active -= 1;
        return jsonResponse({
          id: "chat",
          choices: [{ message: { role: "assistant", content: "done" } }],
        });
      });
    });

    const input = createRunInput(root, {
      options: { baseUrl: "http://192.168.88.62:8003/v1" },
    });
    const first = runQwenLocalAgentApi(input);
    await firstStarted;
    const second = runQwenLocalAgentApi(input);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });
  it("acquires and releases a shared endpoint lease around protected endpoint dispatch", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-lease-"));
    const leaseStore = createEndpointLeaseStore();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-lease",
        choices: [{ message: { role: "assistant", content: "leased done" } }],
      }),
    );

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          profileId: "profile-qwen-8003",
          options: { baseUrl: "http://192.168.88.62:8003/v1" },
          execution: { runtimeEndpointLeaseStore: leaseStore },
          usageContext: { ...TEST_USAGE_CONTEXT, taskId: "task-lease" },
        }),
      ),
    ).resolves.toMatchObject({ outputText: "leased done" });

    expect(leaseStore.acquire).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointKey: "http://192.168.88.62:8003",
        profileId: "profile-qwen-8003",
        baseUrl: "http://192.168.88.62:8003/v1",
        runtimeId: "qwen-local-agent",
        providerId: "qwen",
        taskId: "task-lease",
        leaseTtlMs: expect.any(Number),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(leaseStore.release).toHaveBeenCalledWith({
      endpointKey: "http://192.168.88.62:8003",
      holderId: "holder-a",
      leaseToken: "lease-token-a",
    });
  });
  it("holds a shared endpoint lease until the response body is consumed across contenders", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-lease-body-"));
    const state = { holderId: null, leaseToken: null, leaseExpiresAtMs: 0 };
    const firstStore = createSharedEndpointLeaseStore("holder-a", state);
    const secondStore = createSharedEndpointLeaseStore("holder-b", state);
    const encoder = new TextEncoder();
    let releaseFirstBody = null;
    let activeBodies = 0;
    let maxActiveBodies = 0;
    const firstHeadersReturned = new Promise((resolve) => {
      fetchMock.mockImplementationOnce(async () => {
        activeBodies += 1;
        maxActiveBodies = Math.max(maxActiveBodies, activeBodies);
        const stream = new ReadableStream({
          start(controller) {
            resolve();
            releaseFirstBody = () => {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    id: "chat-first",
                    choices: [{ message: { role: "assistant", content: "first done" } }],
                  }),
                ),
              );
              controller.close();
              activeBodies -= 1;
            };
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
    });
    fetchMock.mockImplementationOnce(async () => {
      activeBodies += 1;
      maxActiveBodies = Math.max(maxActiveBodies, activeBodies);
      activeBodies -= 1;
      return jsonResponse({
        id: "chat-second",
        choices: [{ message: { role: "assistant", content: "second done" } }],
      });
    });

    const first = runQwenLocalAgentApi(
      createRunInput(root, {
        profileId: "profile-qwen-8003-a",
        options: {
          baseUrl: "http://192.168.88.62:8003/v1",
          endpointQueueTimeoutMs: 1_000,
        },
        execution: { runtimeEndpointLeaseStore: firstStore },
      }),
    );
    await firstHeadersReturned;
    const second = runQwenLocalAgentApi(
      createRunInput(root, {
        profileId: "profile-qwen-8003-b",
        options: {
          baseUrl: "http://127.0.0.1:8003/v1",
          endpointQueueTimeoutMs: 1_000,
        },
        execution: { runtimeEndpointLeaseStore: secondStore },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    releaseFirstBody?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ outputText: "first done" }),
      expect.objectContaining({ outputText: "second done" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(maxActiveBodies).toBe(1);
    expect(secondStore.acquire.mock.results.length).toBeGreaterThan(1);
  });
  it("fails before fetch when a shared endpoint lease holder exceeds queue wait", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-lease-timeout-"));
    const leaseStore = createEndpointLeaseStore({
      acquire: vi.fn(async () => ({
        acquired: false,
        reason: "held",
        holderId: "remote-holder",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      })),
    });

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          profileId: "profile-qwen-8003",
          options: {
            baseUrl: "http://192.168.88.62:8003/v1",
            endpointQueueTimeoutMs: 10,
            endpointCooldownMs: 1_000,
            endpointCooldownWaitMaxMs: 0,
          },
          execution: { runtimeEndpointLeaseStore: leaseStore },
          usageContext: { ...TEST_USAGE_CONTEXT, taskId: "task-lease-timeout" },
        }),
      ),
    ).rejects.toMatchObject({
      category: "timeout",
      providerMeta: expect.objectContaining({
        status: "endpoint_queue_timeout",
        endpointKey: "http://192.168.88.62:8003",
        holderId: "remote-holder",
        distributedLease: true,
      }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(leaseStore.release).not.toHaveBeenCalled();
    expect(leaseStore.setCooldown).not.toHaveBeenCalled();
  });
  it("records cooldown before releasing a shared endpoint lease after in-flight timeout", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-lease-timeout-release-"));
    const order = [];
    const leaseStore = createEndpointLeaseStore({
      release: vi.fn(async () => {
        order.push("release");
        return true;
      }),
      setCooldown: vi.fn(async () => {
        order.push("cooldown");
      }),
    });
    fetchMock.mockImplementationOnce((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(init.signal.reason ?? new DOMException("timeout", "TimeoutError")),
          { once: true },
        );
      });
    });

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          profileId: "profile-qwen-8005",
          options: {
            baseUrl: "http://192.168.88.62:8005/v1",
            endpointCooldownMs: 1_000,
            endpointCooldownWaitMaxMs: 0,
          },
          execution: { runTimeoutMs: 10, runtimeEndpointLeaseStore: leaseStore },
          usageContext: { ...TEST_USAGE_CONTEXT, taskId: "task-lease-runtime-timeout" },
        }),
      ),
    ).rejects.toMatchObject({
      category: "timeout",
      providerMeta: expect.objectContaining({
        status: "endpoint_cooldown",
        previousStatus: "endpoint_request_timeout",
        endpointKey: "http://192.168.88.62:8005",
      }),
    });

    expect(leaseStore.release).toHaveBeenCalledWith({
      endpointKey: "http://192.168.88.62:8005",
      holderId: "holder-a",
      leaseToken: "lease-token-a",
    });
    expect(leaseStore.setCooldown).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointKey: "http://192.168.88.62:8005",
        cooldownReason: "timeout",
      }),
    );
    expect(order).toEqual(["cooldown", "release"]);
  });
  it("aborts and cools down when shared endpoint lease heartbeat loses ownership", async () => {
    vi.useFakeTimers();
    try {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-lease-heartbeat-false-"));
      const leaseStore = createEndpointLeaseStore({
        heartbeat: vi.fn(async () => false),
      });
      fetchMock.mockImplementationOnce((_url, init) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        });
      });

      const run = runQwenLocalAgentApi(
        createRunInput(root, {
          profileId: "profile-qwen-8005",
          options: {
            baseUrl: "http://192.168.88.62:8005/v1",
            endpointLeaseHeartbeatMs: 1_000,
            endpointLeaseTtlMs: 5_000,
            endpointCooldownMs: 1_000,
            endpointCooldownWaitMaxMs: 0,
          },
          execution: { runtimeEndpointLeaseStore: leaseStore },
        }),
      );
      const rejection = run.then(
        () => {
          throw new Error("expected heartbeat lease loss to reject");
        },
        (error) => error,
      );

      await vi.advanceTimersByTimeAsync(1_000);
      const error = await rejection;
      expect(error).toMatchObject({
        category: "timeout",
        providerMeta: expect.objectContaining({
          status: "endpoint_cooldown",
          previousStatus: "endpoint_lease_lost",
          endpointKey: "http://192.168.88.62:8005",
        }),
      });
      expect(error.providerMeta).not.toHaveProperty("leaseToken");
      expect(JSON.stringify(error)).not.toContain("lease-token-a");
      expect(leaseStore.setCooldown).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointKey: "http://192.168.88.62:8005",
          cooldownReason: "timeout",
        }),
      );
      expect(leaseStore.release).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("aborts and cools down when shared endpoint lease heartbeat throws", async () => {
    vi.useFakeTimers();
    try {
      const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-lease-heartbeat-throw-"));
      const leaseStore = createEndpointLeaseStore({
        heartbeat: vi.fn(async () => {
          throw new Error("lease store unavailable");
        }),
      });
      fetchMock.mockImplementationOnce((_url, init) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        });
      });

      const run = runQwenLocalAgentApi(
        createRunInput(root, {
          profileId: "profile-qwen-8005",
          options: {
            baseUrl: "http://192.168.88.62:8005/v1",
            endpointLeaseHeartbeatMs: 1_000,
            endpointLeaseTtlMs: 5_000,
            endpointCooldownMs: 1_000,
            endpointCooldownWaitMaxMs: 0,
          },
          execution: { runtimeEndpointLeaseStore: leaseStore },
        }),
      );
      const rejection = run.then(
        () => {
          throw new Error("expected heartbeat lease loss to reject");
        },
        (error) => error,
      );

      await vi.advanceTimersByTimeAsync(1_000);
      const error = await rejection;
      expect(error).toMatchObject({
        category: "timeout",
        providerMeta: expect.objectContaining({
          status: "endpoint_cooldown",
          previousStatus: "endpoint_lease_lost",
          endpointKey: "http://192.168.88.62:8005",
        }),
      });
      expect(error.providerMeta).not.toHaveProperty("leaseToken");
      expect(JSON.stringify(error)).not.toContain("lease-token-a");
      expect(leaseStore.setCooldown).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointKey: "http://192.168.88.62:8005",
          cooldownReason: "timeout",
        }),
      );
      expect(leaseStore.release).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("honors shared endpoint cooldown before dispatching a protected request", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-shared-cooldown-"));
    const leaseStore = createEndpointLeaseStore({
      readCooldown: vi.fn(async () => ({
        cooldownUntil: new Date(Date.now() + 60_000).toISOString(),
        cooldownFailureCount: 1,
        cooldownReason: "timeout",
      })),
    });

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          profileId: "profile-qwen-8003",
          options: {
            baseUrl: "http://192.168.88.62:8003/v1",
            endpointCooldownWaitMaxMs: 0,
          },
          execution: { runtimeEndpointLeaseStore: leaseStore },
        }),
      ),
    ).rejects.toMatchObject({
      category: "transport",
      providerMeta: expect.objectContaining({
        status: "endpoint_cooldown",
        endpointKey: "http://192.168.88.62:8003",
      }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(leaseStore.acquire).not.toHaveBeenCalled();
  });
  it("fails queued protected endpoint requests before fetch when the queue timeout expires", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-queue-timeout-"));
    const logger = { info: vi.fn(), warn: vi.fn() };
    let releaseFirst: (() => void) | null = null;
    const firstStarted = new Promise<void>((resolve) => {
      fetchMock.mockImplementationOnce(() => {
        resolve();
        return new Promise((resolveFetch) => {
          releaseFirst = () =>
            resolveFetch(
              jsonResponse({
                id: "chat-queue-timeout-first",
                choices: [{ message: { role: "assistant", content: "first done" } }],
              }),
            );
        });
      });
    });

    const input = createRunInput(root, {
      profileId: "profile-qwen-8003",
      model: "Qwen3-32B-Q4_K_M.gguf",
      options: {
        baseUrl: "http://192.168.88.62:8003/v1",
        endpointQueueTimeoutMs: 10,
        endpointCooldownMs: 1_000,
        endpointCooldownWaitMaxMs: 0,
      },
      usageContext: { ...TEST_USAGE_CONTEXT, taskId: "task-queue-timeout" },
    });
    const first = runQwenLocalAgentApi(input, logger);
    await firstStarted;

    await expect(runQwenLocalAgentApi(input, logger)).rejects.toMatchObject({
      category: "timeout",
      providerMeta: expect.objectContaining({
        status: "endpoint_queue_timeout",
        profileId: "profile-qwen-8003",
        baseUrl: "http://192.168.88.62:8003/v1",
        model: "Qwen3-32B-Q4_K_M.gguf",
        endpointKey: "http://192.168.88.62:8003",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-queue-timeout",
        profileId: "profile-qwen-8003",
        baseUrl: "http://192.168.88.62:8003/v1",
        model: "Qwen3-32B-Q4_K_M.gguf",
        endpointKey: "http://192.168.88.62:8003",
        durationMs: expect.any(Number),
        failureClass: "endpoint_queue_timeout",
      }),
      "qwen-local-agent request queue timeout",
    );

    releaseFirst?.();
    await expect(first).resolves.toMatchObject({ outputText: "first done" });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-after-queue-timeout",
        choices: [{ message: { role: "assistant", content: "after queue timeout" } }],
      }),
    );
    await expect(runQwenLocalAgentApi(input, logger)).resolves.toMatchObject({
      outputText: "after queue timeout",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "http://192.168.88.62:8003/v1/chat/completions",
    );
  });
  it("fails protected endpoint requests before fetch when the process-local queue is full", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-queue-full-"));
    const logger = { info: vi.fn(), warn: vi.fn() };
    let releaseFirst: (() => void) | null = null;
    const firstStarted = new Promise<void>((resolve) => {
      fetchMock.mockImplementationOnce(() => {
        resolve();
        return new Promise((resolveFetch) => {
          releaseFirst = () =>
            resolveFetch(
              jsonResponse({
                id: "chat-queue-full-first",
                choices: [{ message: { role: "assistant", content: "first done" } }],
              }),
            );
        });
      });
    });

    const input = createRunInput(root, {
      profileId: "profile-qwen-8005",
      options: {
        baseUrl: "http://192.168.88.62:8005/v1",
        endpointQueueLimit: 1,
        endpointQueueTimeoutMs: 1_000,
        endpointCooldownMs: 1_000,
        endpointCooldownWaitMaxMs: 0,
      },
      usageContext: { ...TEST_USAGE_CONTEXT, taskId: "task-queue-full" },
    });
    const first = runQwenLocalAgentApi(input, logger);
    await firstStarted;
    const queued = runQwenLocalAgentApi(input, logger);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-queue-full-second",
        choices: [{ message: { role: "assistant", content: "queued done" } }],
      }),
    );

    try {
      await expect(runQwenLocalAgentApi(input, logger)).rejects.toMatchObject({
        category: "timeout",
        providerMeta: expect.objectContaining({
          status: "endpoint_queue_full",
          profileId: "profile-qwen-8005",
          baseUrl: "http://192.168.88.62:8005/v1",
          endpointKey: "http://192.168.88.62:8005",
        }),
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-queue-full",
          profileId: "profile-qwen-8005",
          baseUrl: "http://192.168.88.62:8005/v1",
          model: "Qwen3-32B-Q4_K_M.gguf",
          endpointKey: "http://192.168.88.62:8005",
          durationMs: expect.any(Number),
          failureClass: "endpoint_queue_full",
        }),
        "qwen-local-agent request queue full",
      );
    } finally {
      releaseFirst?.();
    }
    await expect(first).resolves.toMatchObject({ outputText: "first done" });
    await expect(queued).resolves.toMatchObject({ outputText: "queued done" });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-after-queue-full",
        choices: [{ message: { role: "assistant", content: "after queue full" } }],
      }),
    );
    await expect(runQwenLocalAgentApi(input, logger)).resolves.toMatchObject({
      outputText: "after queue full",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "http://192.168.88.62:8005/v1/chat/completions",
    );
  });
  it("cancels a request while it is waiting for the protected endpoint semaphore", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-semaphore-abort-"));
    let releaseFirst: (() => void) | null = null;
    const firstStarted = new Promise<void>((resolve) => {
      fetchMock.mockImplementationOnce(() => {
        resolve();
        return new Promise((resolveFetch) => {
          releaseFirst = () =>
            resolveFetch(
              jsonResponse({
                id: "chat",
                choices: [{ message: { role: "assistant", content: "done" } }],
              }),
            );
        });
      });
    });

    const first = runQwenLocalAgentApi(
      createRunInput(root, {
        options: { baseUrl: "http://192.168.88.62:8003/v1" },
      }),
    );
    await firstStarted;
    const abort = new AbortController();
    const second = runQwenLocalAgentApi(
      createRunInput(root, {
        options: { baseUrl: "http://192.168.88.62:8003/v1" },
        execution: { abortController: abort },
      }),
    );
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    abort.abort(new Error("stage timeout"));

    await expect(second).rejects.toMatchObject({ category: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    releaseFirst?.();
    await expect(first).resolves.toMatchObject({ outputText: "done" });
  });
  it("releases the protected endpoint slot when a queued waiter aborts during dequeue handoff", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-handoff-abort-"));
    const abort = new AbortController();
    const logger = {
      info: vi.fn((_metadata, message) => {
        if (message === "qwen-local-agent request dequeued") {
          abort.abort(new Error("handoff abort"));
        }
      }),
      warn: vi.fn(),
    };
    let releaseFirst: (() => void) | null = null;
    const firstStarted = new Promise<void>((resolve) => {
      fetchMock.mockImplementationOnce(() => {
        resolve();
        return new Promise((resolveFetch) => {
          releaseFirst = () =>
            resolveFetch(
              jsonResponse({
                id: "chat-handoff-first",
                choices: [{ message: { role: "assistant", content: "first done" } }],
              }),
            );
        });
      });
    });
    const input = createRunInput(root, {
      profileId: "profile-qwen-8003",
      options: {
        baseUrl: "http://192.168.88.62:8003/v1",
        endpointQueueLimit: 1,
        endpointQueueTimeoutMs: 25,
        endpointCooldownMs: 1_000,
        endpointCooldownWaitMaxMs: 0,
      },
      usageContext: { ...TEST_USAGE_CONTEXT, taskId: "task-handoff-abort" },
    });

    const first = runQwenLocalAgentApi(input, logger);
    await firstStarted;
    const queued = runQwenLocalAgentApi(
      {
        ...input,
        execution: { abortController: abort },
      },
      logger,
    );
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const queuedFailure = expect(queued).rejects.toMatchObject({
      category: "timeout",
      providerMeta: expect.objectContaining({
        status: "endpoint_request_cancelled",
        profileId: "profile-qwen-8003",
        baseUrl: "http://192.168.88.62:8003/v1",
        endpointKey: "http://192.168.88.62:8003",
      }),
    });
    releaseFirst?.();
    await expect(first).resolves.toMatchObject({ outputText: "first done" });
    await queuedFailure;

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat-after-handoff-abort",
        choices: [{ message: { role: "assistant", content: "after handoff abort" } }],
      }),
    );
    await expect(runQwenLocalAgentApi(input, logger)).resolves.toMatchObject({
      outputText: "after handoff abort",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "http://192.168.88.62:8003/v1/chat/completions",
    );
  });
  it("waits for short endpoint cooldowns before health-checking and retrying a new request", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-cooldown-"));
    const input = createRunInput(root, {
      options: {
        baseUrl: "http://192.168.88.62:8003/v1",
        endpointCooldownMs: 1_000,
      },
    });
    fetchMock
      .mockRejectedValueOnce(new DOMException("The operation was aborted", "TimeoutError"))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-after-cooldown",
          choices: [{ message: { role: "assistant", content: "done after cooldown" } }],
        }),
      );

    await expect(runQwenLocalAgentApi(input)).rejects.toMatchObject({
      category: "timeout",
      retryAfterSeconds: expect.any(Number),
    });
    await expect(runQwenLocalAgentApi(input)).resolves.toMatchObject({
      outputText: "done after cooldown",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://192.168.88.62:8003/v1/models");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "http://192.168.88.62:8003/v1/chat/completions",
    );
  });
  it("retries one local endpoint HTTP 5xx after cooldown health check inside the same run", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-http-retry-"));
    const logger = { info: vi.fn(), warn: vi.fn() };
    const input = createRunInput(root, {
      options: {
        baseUrl: "http://192.168.88.62:8005/v1",
        endpointCooldownMs: 1_000,
        endpointCooldownWaitMaxMs: 1_200,
      },
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "busy" }, 500))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chat-after-http-500",
          choices: [{ message: { role: "assistant", content: "done after http retry" } }],
        }),
      );

    await expect(runQwenLocalAgentApi(input, logger)).resolves.toMatchObject({
      outputText: "done after http retry",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://192.168.88.62:8005/v1/chat/completions",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://192.168.88.62:8005/v1/models");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "http://192.168.88.62:8005/v1/chat/completions",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        failureClass: "http_500",
        retryCount: 0,
      }),
      "qwen-local-agent request estimate",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        failureClass: "http_500",
        retryAfterSeconds: 1,
        retryCount: 1,
      }),
      "Retrying qwen-local-agent request after endpoint HTTP 5xx cooldown",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        failureClass: null,
        retryCount: 1,
      }),
      "qwen-local-agent request estimate",
    );
  });
  it("does not retry non-transport HTTP endpoint failures", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-http-no-retry-"));
    const input = createRunInput(root, {
      options: {
        baseUrl: "http://192.168.88.62:8005/v1",
        endpointCooldownMs: 1_000,
      },
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "prompt too large" }, 413));

    await expect(runQwenLocalAgentApi(input)).rejects.toMatchObject({
      category: "context_length",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://192.168.88.62:8005/v1/chat/completions",
    );
  });
  it("stops after one local endpoint HTTP 5xx retry by default", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-http-retry-bound-"));
    const input = createRunInput(root, {
      options: {
        baseUrl: "http://192.168.88.62:8005/v1",
        endpointCooldownMs: 1_000,
        endpointCooldownWaitMaxMs: 1_200,
      },
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "busy" }, 500))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "still busy" }, 502));

    await expect(runQwenLocalAgentApi(input)).rejects.toMatchObject({
      category: "transport",
      providerMeta: expect.objectContaining({ status: "endpoint_cooldown" }),
      retryAfterSeconds: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://192.168.88.62:8005/v1/chat/completions",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://192.168.88.62:8005/v1/models");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "http://192.168.88.62:8005/v1/chat/completions",
    );
  });
  it("does not extend endpoint cooldown when aborting during the local cooldown wait", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-cooldown-abort-"));
    const options = {
      baseUrl: "http://192.168.88.62:8003/v1",
      endpointCooldownMs: 1_000,
      endpointCooldownWaitMaxMs: 1_200,
    };
    const input = createRunInput(root, { options });
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted", "TimeoutError"));

    await expect(runQwenLocalAgentApi(input)).rejects.toMatchObject({
      category: "timeout",
      retryAfterSeconds: expect.any(Number),
    });

    const abort = new AbortController();
    const waiting = runQwenLocalAgentApi(
      createRunInput(root, {
        options,
        execution: { abortController: abort },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    abort.abort(new Error("stage timeout"));

    await expect(waiting).rejects.toMatchObject({ category: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 1_050));
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] })).mockResolvedValueOnce(
      jsonResponse({
        id: "chat-after-aborted-cooldown-wait",
        choices: [{ message: { role: "assistant", content: "done after abort" } }],
      }),
    );

    await expect(runQwenLocalAgentApi(input)).resolves.toMatchObject({
      outputText: "done after abort",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://192.168.88.62:8003/v1/models");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "http://192.168.88.62:8003/v1/chat/completions",
    );
  });
  it("serializes cooldown health checks when concurrent waiters see a reopened circuit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-cooldown-concurrent-"));
    const options = {
      baseUrl: "http://192.168.88.62:8003/v1",
      endpointCooldownMs: 1_000,
      endpointCooldownWaitMaxMs: 1_200,
    };
    const input = createRunInput(root, { options });
    fetchMock
      .mockRejectedValueOnce(new DOMException("The operation was aborted", "TimeoutError"))
      .mockRejectedValueOnce(new Error("health check still failing"));

    await expect(runQwenLocalAgentApi(input)).rejects.toMatchObject({
      category: "timeout",
      retryAfterSeconds: expect.any(Number),
    });

    const abort = new AbortController();
    const firstWaiter = runQwenLocalAgentApi(input);
    const secondWaiter = runQwenLocalAgentApi(
      createRunInput(root, {
        options,
        execution: { abortController: abort },
      }),
    );

    await expect(firstWaiter).rejects.toMatchObject({
      category: "transport",
      retryAfterSeconds: expect.any(Number),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://192.168.88.62:8003/v1/models");

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    abort.abort(new Error("stop queued waiter"));

    await expect(secondWaiter).rejects.toMatchObject({ category: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("keeps long endpoint cooldowns bounded instead of sleeping indefinitely", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-endpoint-long-cooldown-"));
    const input = createRunInput(root, {
      profileId: "profile-qwen-8003",
      model: "Qwen3-32B-Q4_K_M.gguf",
      options: {
        baseUrl: "http://192.168.88.62:8003/v1",
        endpointCooldownMs: 5_000,
        endpointCooldownWaitMaxMs: 0,
      },
      usageContext: { ...TEST_USAGE_CONTEXT, taskId: "task-open-circuit" },
    });
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted", "TimeoutError"));

    await expect(runQwenLocalAgentApi(input)).rejects.toMatchObject({
      category: "timeout",
      retryAfterSeconds: expect.any(Number),
    });
    await expect(runQwenLocalAgentApi(input)).rejects.toMatchObject({
      category: "transport",
      retryAfterSeconds: expect.any(Number),
      providerMeta: expect.objectContaining({
        status: "endpoint_cooldown",
        profileId: "profile-qwen-8003",
        taskId: "task-open-circuit",
        baseUrl: "http://192.168.88.62:8003/v1",
        model: "Qwen3-32B-Q4_K_M.gguf",
        endpointKey: "http://192.168.88.62:8003",
        retryAfterSeconds: expect.any(Number),
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("propagates external aborts to the upstream chat completion request", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-external-abort-"));
    const abort = new AbortController();
    const logger = { info: vi.fn(), warn: vi.fn() };
    let requestSignal: AbortSignal | null = null;
    const requestStarted = new Promise<void>((resolve) => {
      fetchMock.mockImplementationOnce((_url, init = {}) => {
        requestSignal = init.signal ?? null;
        resolve();
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        });
      });
    });

    const run = runQwenLocalAgentApi(
      createRunInput(root, {
        profileId: "profile-qwen-8003",
        options: {
          baseUrl: "http://192.168.88.62:8003/v1",
          endpointCooldownMs: 1_000,
          endpointCooldownWaitMaxMs: 0,
        },
        execution: { abortController: abort },
        usageContext: { ...TEST_USAGE_CONTEXT, taskId: "task-external-abort" },
      }),
      logger,
    );
    await requestStarted;
    abort.abort(new Error("stage timeout"));

    await expect(run).rejects.toMatchObject({
      category: "timeout",
      providerMeta: expect.objectContaining({
        status: "endpoint_request_cancelled",
        profileId: "profile-qwen-8003",
        baseUrl: "http://192.168.88.62:8003/v1",
        model: "Qwen3-32B-Q4_K_M.gguf",
        endpointKey: "http://192.168.88.62:8003",
      }),
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-external-abort",
        profileId: "profile-qwen-8003",
        baseUrl: "http://192.168.88.62:8003/v1",
        model: "Qwen3-32B-Q4_K_M.gguf",
        endpointKey: "http://192.168.88.62:8003",
        timeoutMs: null,
      }),
      "qwen-local-agent request start",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-external-abort",
        profileId: "profile-qwen-8003",
        baseUrl: "http://192.168.88.62:8003/v1",
        model: "Qwen3-32B-Q4_K_M.gguf",
        endpointKey: "http://192.168.88.62:8003",
        durationMs: expect.any(Number),
        failureClass: "endpoint_request_cancelled",
      }),
      "qwen-local-agent request cancel",
    );
  });
  it("aborts in-flight fetch when the run timeout fires and logs lifecycle metadata", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inflight-run-timeout-"));
    const logger = { info: vi.fn(), warn: vi.fn() };
    let requestSignal: AbortSignal | null = null;
    fetchMock.mockImplementationOnce((_url, init = {}) => {
      requestSignal = init.signal ?? null;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "TimeoutError"));
        });
      });
    });

    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          profileId: "profile-qwen-8005",
          options: {
            baseUrl: "http://192.168.88.62:8005/v1",
            endpointCooldownMs: 1_000,
            endpointCooldownWaitMaxMs: 0,
          },
          execution: { runTimeoutMs: 10 },
          usageContext: { ...TEST_USAGE_CONTEXT, taskId: "task-inflight-timeout" },
        }),
        logger,
      ),
    ).rejects.toMatchObject({
      category: "timeout",
      providerMeta: expect.objectContaining({
        status: "endpoint_cooldown",
        previousStatus: "endpoint_request_timeout",
        profileId: "profile-qwen-8005",
        baseUrl: "http://192.168.88.62:8005/v1",
        model: "Qwen3-32B-Q4_K_M.gguf",
        endpointKey: "http://192.168.88.62:8005",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-inflight-timeout",
        profileId: "profile-qwen-8005",
        baseUrl: "http://192.168.88.62:8005/v1",
        model: "Qwen3-32B-Q4_K_M.gguf",
        endpointKey: "http://192.168.88.62:8005",
        timeoutMs: 10,
      }),
      "qwen-local-agent request start",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-inflight-timeout",
        profileId: "profile-qwen-8005",
        baseUrl: "http://192.168.88.62:8005/v1",
        model: "Qwen3-32B-Q4_K_M.gguf",
        endpointKey: "http://192.168.88.62:8005",
        durationMs: expect.any(Number),
        timeoutMs: 10,
        failureClass: "endpoint_request_timeout",
      }),
      "qwen-local-agent request timeout",
    );
  });
  it("does not write tool files after the run timeout has already fired", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-timeout-before-tool-"));
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(
                jsonResponse({
                  id: "chat-timeout-before-tool",
                  choices: [
                    {
                      message: {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                          {
                            id: "call-late-write",
                            type: "function",
                            function: {
                              name: "write_file",
                              arguments: JSON.stringify({ path: "late.txt", content: "bad\n" }),
                            },
                          },
                        ],
                      },
                    },
                  ],
                }),
              );
            }, 25);
          }),
      )
      .mockImplementationOnce((_url, init = {}) => {
        if (init.signal?.aborted) {
          throw new DOMException("The operation was aborted", "TimeoutError");
        }
        return jsonResponse({ choices: [{ message: { role: "assistant", content: "done" } }] });
      });
    await expect(
      runQwenLocalAgentApi(
        createRunInput(root, {
          execution: { runTimeoutMs: 5 },
        }),
      ),
    ).rejects.toMatchObject({ category: "timeout" });
    await expect(readFile(path.join(root, "late.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("rejects unsupported transports clearly", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-transport-"));
    await expect(
      runQwenLocalAgentApi(createRunInput(root, { transport: "cli" })),
    ).rejects.toBeInstanceOf(RuntimeExecutionError);
    const validation = await validateQwenLocalAgentApiConnection({
      runtimeId: "qwen-local-agent",
      transport: "cli",
      options: { baseUrl: "http://qwen.local/v1" },
    });
    expect(validation).toMatchObject({
      ok: false,
      message: "qwen-local-agent supports only api transport, got cli",
    });
    await expect(
      listQwenLocalAgentModels({
        runtimeId: "qwen-local-agent",
        transport: "cli",
        options: { baseUrl: "http://qwen.local/v1" },
      }),
    ).rejects.toBeInstanceOf(RuntimeExecutionError);
    const adapter = createQwenLocalAgentRuntimeAdapter();
    await expect(
      adapter.listModels({
        runtimeId: "qwen-local-agent",
        transport: "cli",
        options: { baseUrl: "http://qwen.local/v1" },
      }),
    ).rejects.toBeInstanceOf(RuntimeExecutionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
