/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeAuditReportContentSha256 } from "@aif/shared";
import { RuntimeExecutionError } from "../errors.js";
import {
  buildQwenLocalAgentRequestBody,
  listQwenLocalAgentModels,
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
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
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
    expect(parameters.properties?.command?.enum).toEqual(["pwd", "ls"]);
  });
  it("builds chat-completions requests with function tools", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-request-"));
    const body = buildQwenLocalAgentRequestBody(createRunInput(root));
    expect(body.model).toBe("Qwen3-32B-Q4_K_M.gguf");
    expect(body.stream).toBe(false);
    expect(body.tool_choice).toBe("auto");
    expect(body.tools).toEqual(QWEN_LOCAL_AGENT_TOOLS);
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
    ).rejects.toThrow("qwen-local-agent exceeded max tool turns (41)");
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

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        execution: {
          allowedWritePaths: ["audit/report.md"],
        },
      }),
    );

    expect(result.outputText).toBe("done");
    await expect(readFile(path.join(root, "tmp_body.txt"), "utf8")).rejects.toThrow();
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    const toolMessage = secondBody.messages.find((message) => message.role === "tool");
    const toolResult = JSON.parse(toolMessage.content);
    expect(toolResult.ok).toBe(false);
    expect(toolResult.error).toContain("allowed write paths (audit/report.md)");
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
  it("denies repository inspection after the configured budget and still allows report finalization", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qwen-inspection-budget-"));
    await mkdir(path.join(root, "audit"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Project\nArchitecture notes.\n", "utf8");
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
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-read-2",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "AGENTS.md" }),
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
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-write-report",
                    type: "function",
                    function: {
                      name: "write_file",
                      arguments: JSON.stringify({
                        path: "audit/architecture.md",
                        content: "# Audit\n\nNo validated findings.\n",
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
          id: "chat-inspection-budget",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      );

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        execution: {
          repositoryInspectionToolBudget: 1,
          onEvent: (event) => events.push(event),
        },
      }),
    );

    expect(result.outputText).toBe("done");
    expect(await readFile(path.join(root, "audit", "architecture.md"), "utf8")).toContain(
      "No validated findings",
    );
    expect(JSON.stringify(result.events)).toContain("Repository inspection budget exhausted");
    const auditEvents = events.filter((event) => event.type === "audit:evidence");
    expect(auditEvents).toHaveLength(1);
    expect(JSON.stringify(auditEvents)).not.toContain("AGENTS.md");
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

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        options: {
          baseUrl: "http://qwen.local/v1",
          repeatedToolCallLimit: 2,
          maxToolTurns: 20,
        },
      }),
    );

    expect(result.outputText).toContain("repeated run_shell tool-call loop");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(result.events)).toContain("Repeated identical run_shell call suppressed");
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

    const result = await runQwenLocalAgentApi(
      createRunInput(root, {
        options: {
          baseUrl: "http://qwen.local/v1",
          repeatedToolCallLimit: 2,
          maxToolTurns: 20,
        },
      }),
    );

    expect(result.outputText).toContain("repeated git_commit tool-call loop");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(result.events)).toContain(
      "Repeated identical git_commit call suppressed",
    );
  }, 15_000);

  it("stops repeated audit report validation loops before stage timeout", async () => {
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

    const result = await runQwenLocalAgentApi(
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
    );

    expect(result.outputText).toContain("repeated validate_audit_report tool-call loop");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(result.events)).toContain(
      "Repeated identical validate_audit_report call suppressed",
    );
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
    expect(toolMessage.content).toContain("Delete every finding");
    expect(toolMessage.content).toContain("do not rephrase");
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
    expect(`${deniedWrite.error} ${deniedPatch.error} ${deniedCommit.error}`).toContain(
      "allowed write paths (audit/report.md)",
    );
    await expect(readFile(path.join(root, "tmp_hash.py"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(root, "tmp_body.txt"), "utf8")).rejects.toThrow();
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
  it("denies npm script execution even after package.json is model-editable", async () => {
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
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unsupported shell command");
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
