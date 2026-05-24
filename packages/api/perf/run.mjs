#!/usr/bin/env node
// k6 orchestrator: probes the API, optionally boots the dev stack, runs every
// script in ./k6 sequentially, aggregates summaries, exits non-zero if any
// threshold fails. Called from the root `ai:load` script and from CI.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, "..", "..", "..");
const k6Dir = join(__dir, "k6");
const reportsDir = join(__dir, "reports");

const LOCAL_API_URL = "http://localhost:3009";
const REMOTE_API_URL = "http://192.168.88.67/api";
const LOCAL_DEV_OPT_IN = process.env.AIF_SKIP_DEV_SERVER === "0";
const API_URL = process.env.AIF_API_URL || (LOCAL_DEV_OPT_IN ? LOCAL_API_URL : REMOTE_API_URL);
const SKIP_DEV_SERVER = !LOCAL_DEV_OPT_IN;
const HEALTH_TIMEOUT_MS = 120_000;
const K6_HELPER_MODULES = new Set(["common.js", "target-guard.js"]);

export function isLocalUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const ipv4MappedDottedLoopback = /^::ffff:127(?:\.\d{1,3}){3}$/.test(hostname);
    const ipv4MappedHexLoopback = hostname.match(/^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/);
    const ipv4MappedHexFirstHextet = ipv4MappedHexLoopback
      ? Number.parseInt(ipv4MappedHexLoopback[1], 16)
      : Number.NaN;
    return (
      hostname === "localhost" ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "::" ||
      hostname === "0:0:0:0:0:0:0:0" ||
      ipv4MappedDottedLoopback ||
      (Number.isFinite(ipv4MappedHexFirstHextet) &&
        ipv4MappedHexFirstHextet >= 0x7f00 &&
        ipv4MappedHexFirstHextet <= 0x7fff)
    );
  } catch {
    return false;
  }
}

function assertValidationTargetAllowed() {
  if (SKIP_DEV_SERVER && isLocalUrl(API_URL)) {
    console.error(
      "[ai:load] Local API validation requires explicit local opt-in: set AIF_SKIP_DEV_SERVER=0.",
    );
    process.exit(1);
  }
}

/** Ping `/health` until it returns 200 or the deadline elapses. */
async function waitForApi(url, deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // connection refused while dev boots; keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Run a single k6 script and write its JSON summary to reports/. */
function runK6(scriptPath) {
  return new Promise((resolvePromise) => {
    const scriptName = basename(scriptPath, ".js");
    const summaryPath = join(reportsDir, `${scriptName}.summary.json`);
    const child = spawn(
      "k6",
      ["run", `--summary-export=${summaryPath}`, `--env`, `AIF_API_URL=${API_URL}`, scriptPath],
      { stdio: "inherit" },
    );
    child.on("close", (code) => resolvePromise({ scriptPath, code, summaryPath }));
    child.on("error", (error) => {
      console.error(`[ai:load] failed to spawn k6 for ${scriptPath}: ${error.message}`);
      resolvePromise({ scriptPath, code: 127, summaryPath });
    });
  });
}

export function discoverK6Scripts(directory = k6Dir) {
  return readdirSync(directory)
    .filter((file) => file.endsWith(".js") && !K6_HELPER_MODULES.has(file))
    .map((file) => join(directory, file));
}

async function ensureK6Installed() {
  return new Promise((resolvePromise) => {
    const probe = spawn("k6", ["version"], { stdio: "ignore" });
    probe.on("close", (code) => resolvePromise(code === 0));
    probe.on("error", () => resolvePromise(false));
  });
}

function spawnDevStack() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm", "run", "dev:perf"]
      : ["run", "dev:perf"];
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, AIF_ENABLE_CODEX_LOGIN_PROXY: "false" },
  });
  child.unref();
  return child;
}

function stopDevStack(child) {
  if (!child?.pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-child.pid);
  } catch {
    // dev stack may have already exited
  }
}

async function main() {
  assertValidationTargetAllowed();

  if (SKIP_DEV_SERVER && !(await waitForApi(API_URL, Date.now() + 2_000))) {
    console.error(`[ai:load] API not reachable at ${API_URL}. Local dev stack is opt-in only.`);
    process.exit(1);
  }

  if (!(await ensureK6Installed())) {
    console.error(
      "[ai:load] k6 binary not found on PATH. Install via `brew install k6` (macOS) or " +
        "see https://k6.io/docs/get-started/installation/. Skipping load step.",
    );
    // Do not fail the whole ai:validate chain on a missing optional tool —
    // developers iterating on unrelated code should not be forced to install.
    process.exit(0);
  }

  let devProcess = null;
  const alreadyUp = await waitForApi(API_URL, Date.now() + 2_000);
  if (!alreadyUp) {
    if (SKIP_DEV_SERVER) {
      console.error(`[ai:load] API not reachable at ${API_URL}. Local dev stack is opt-in only.`);
      process.exit(1);
    }
    console.log("[ai:load] API not reachable — booting dev stack...");
    devProcess = spawnDevStack();
    const booted = await waitForApi(API_URL, Date.now() + HEALTH_TIMEOUT_MS);
    if (!booted) {
      console.error(`[ai:load] API did not come up within ${HEALTH_TIMEOUT_MS}ms. Abort.`);
      stopDevStack(devProcess);
      process.exit(1);
    }
  }

  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

  const scripts = discoverK6Scripts(k6Dir);

  const results = [];
  for (const script of scripts) {
    console.log(`[ai:load] running ${script}`);
    results.push(await runK6(script));
  }

  const failed = results.filter((r) => r.code !== 0);

  writeFileSync(
    join(reportsDir, "run.json"),
    JSON.stringify(
      {
        apiUrl: API_URL,
        startedAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );

  stopDevStack(devProcess);

  if (failed.length > 0) {
    console.error(`[ai:load] ${failed.length} of ${results.length} k6 scripts failed thresholds.`);
    process.exit(1);
  }

  console.log(`[ai:load] all ${results.length} k6 scripts passed thresholds.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ai:load] orchestrator crashed: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}
