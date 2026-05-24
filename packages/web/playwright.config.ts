import { defineConfig, devices } from "@playwright/test";
import { assertRemoteOnlyValidationTargets } from "./scripts/target-guard.mjs";

// Perf suite targets the URL in AIF_WEB_URL when AIF_SKIP_DEV_SERVER=1.
// The webServer block is a manual-development fallback only; Codex validation
// for this repo must use the deployed service at 192.168.88.67 unless a user
// explicitly authorizes local service checks for the current turn.
const SKIP_DEV_SERVER = process.env.AIF_SKIP_DEV_SERVER !== "0";
const WEB_BASE_URL =
  process.env.AIF_WEB_URL ?? (SKIP_DEV_SERVER ? "http://192.168.88.67" : "http://localhost:5180");
const API_BASE_URL =
  process.env.AIF_API_URL ??
  (SKIP_DEV_SERVER ? "http://192.168.88.67/api" : "http://localhost:3009");

assertRemoteOnlyValidationTargets({
  skipDevServer: SKIP_DEV_SERVER,
  urls: [WEB_BASE_URL, API_BASE_URL],
  errorMessage:
    "Local Playwright perf validation requires explicit local opt-in: set AIF_SKIP_DEV_SERVER=0.",
});

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  use: {
    baseURL: WEB_BASE_URL,
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  webServer: SKIP_DEV_SERVER
    ? undefined
    : {
        command: "npm run dev:perf --prefix ../..",
        env: {
          ...process.env,
          AIF_ENABLE_CODEX_LOGIN_PROXY: "false",
        },
        url: "http://localhost:5180",
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
  projects: [
    {
      name: "chromium-cold",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
