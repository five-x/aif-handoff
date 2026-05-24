import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertRemoteOnlyValidationTargets } from "./target-guard.mjs";

const SKIP_DEV_SERVER = process.env.AIF_SKIP_DEV_SERVER !== "0";
const READY_URL =
  process.env.AIF_WEB_URL ?? (SKIP_DEV_SERVER ? "http://192.168.88.67" : "http://localhost:5180");
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 500;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, "..");
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, "../..");

function npmCliPath() {
  if (process.env.npm_execpath?.endsWith(".js")) {
    return process.env.npm_execpath;
  }

  return resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
}

function commandSpec(name, args) {
  if (process.platform === "win32" && name === "npm") {
    return { command: process.execPath, args: [npmCliPath(), ...args] };
  }

  if (process.platform === "win32" && name === "playwright") {
    return {
      command: process.execPath,
      args: [resolve(WORKSPACE_ROOT, "node_modules/@playwright/test/cli.js"), ...args],
    };
  }

  return { command: name, args };
}

function spawnInherited(command, args, options = {}) {
  const spec = commandSpec(command, args);

  return spawn(spec.command, spec.args, {
    stdio: "inherit",
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

function assertValidationTargetAllowed() {
  assertRemoteOnlyValidationTargets({
    skipDevServer: SKIP_DEV_SERVER,
    urls: [READY_URL],
    errorMessage:
      "Local web perf validation requires explicit local opt-in: set AIF_SKIP_DEV_SERVER=0.",
  });
}

async function waitForReady(child) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    if (child && child.exitCode !== null) {
      throw new Error(`dev:perf exited before ${READY_URL} became ready`);
    }

    try {
      const response = await fetch(READY_URL, { method: "HEAD" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Server is still booting.
    }

    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }

  throw new Error(`Timed out waiting ${READY_TIMEOUT_MS}ms for ${READY_URL}`);
}

function stopDevServer(child) {
  if (child.exitCode !== null) return;

  try {
    if (child.pid && process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }

    if (child.pid && process.platform !== "win32") {
      process.kill(-child.pid, "SIGTERM");
      return;
    }
    child.kill("SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

async function run() {
  assertValidationTargetAllowed();

  if (SKIP_DEV_SERVER) {
    await waitForReady(null);
    const perf = spawnInherited("playwright", ["test", "--config=playwright.config.ts"], {
      env: {
        AIF_SKIP_DEV_SERVER: "1",
        AIF_WEB_URL: READY_URL,
        AIF_API_URL: process.env.AIF_API_URL ?? "http://192.168.88.67/api",
      },
    });
    const [code, signal] = await once(perf, "exit");
    if (code !== 0) {
      throw new Error(`playwright exited with ${code ?? signal}`);
    }
    return;
  }

  const dev = spawnInherited("npm", ["run", "dev:perf", "--prefix", "../.."], {
    detached: process.platform !== "win32",
    env: { AIF_ENABLE_CODEX_LOGIN_PROXY: "false" },
  });

  const devExit = once(dev, "exit").then(([code, signal]) => ({ code, signal }));

  try {
    await waitForReady(dev);

    const perf = spawnInherited("playwright", ["test", "--config=playwright.config.ts"], {
      env: {
        AIF_SKIP_DEV_SERVER: "0",
        AIF_WEB_URL: READY_URL,
        AIF_API_URL: process.env.AIF_API_URL ?? "http://localhost:3009",
      },
    });
    const [code, signal] = await once(perf, "exit");
    if (code !== 0) {
      throw new Error(`playwright exited with ${code ?? signal}`);
    }
  } finally {
    stopDevServer(dev);
    await Promise.race([devExit, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
