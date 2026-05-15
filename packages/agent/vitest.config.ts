import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several agent tests do real git operations on tmp work-trees (init,
    // checkout, commit). Full-package Windows runs can push these fixtures
    // past 20s even though their assertions are deterministic, so keep a
    // package-level budget for the slow path.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    server: {
      deps: {
        inline: ["@aif/runtime", "@anthropic-ai/claude-agent-sdk"],
      },
    },
    exclude: ["dist/**", "**/node_modules/**", "**/.git/**", "**/*SFConflict*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/hooks.ts",
        "src/subagents/**",
        "src/queryAudit.ts",
        "src/wakeChannel.ts",
        "src/**/*SFConflict*",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
