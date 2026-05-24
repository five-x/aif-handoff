import { expect, test } from "@playwright/test";
import { PERF_BUDGETS, apiPath } from "./utils";

// `/chat/sessions` currently pulls Codex session metas from disk. Even with
// the 30s in-memory cache, cold hits traverse ~/.codex/sessions; this spec
// pins the budget so regressions there (e.g. dropping the TTL) surface fast.
test.describe("chat-sessions endpoint timing", () => {
  test("cold and warm reads stay under their budgets", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Pick the first project id surfaced by the API so this spec does not
    // hard-code a fixture that might not exist on a given machine.
    const projectId = await page.evaluate(async (path) => {
      const res = await fetch(path, { credentials: "include" });
      if (!res.ok) return null;
      const body = (await res.json()) as Array<{ id: string }>;
      return body[0]?.id ?? null;
    }, apiPath("/projects"));
    test.skip(!projectId, "No projects present on the target service DB - skip endpoint timing.");

    const query = `?projectId=${encodeURIComponent(projectId!)}`;
    const chatSessionsPath = apiPath("/chat/sessions");
    const cold = await page.evaluate(
      async ({ path, q }) => {
        const started = performance.now();
        const res = await fetch(`${path}${q}`, {
          credentials: "include",
        });
        return { status: res.status, ms: performance.now() - started };
      },
      { path: chatSessionsPath, q: query },
    );

    const warm = await page.evaluate(
      async ({ path, q }) => {
        const started = performance.now();
        const res = await fetch(`${path}${q}`, {
          credentials: "include",
        });
        return { status: res.status, ms: performance.now() - started };
      },
      { path: chatSessionsPath, q: query },
    );

    // eslint-disable-next-line no-console
    console.log("[perf] chat/sessions:", { coldMs: cold.ms, warmMs: warm.ms });

    expect(cold.status).toBe(200);
    expect(warm.status).toBe(200);
    expect(cold.ms).toBeLessThan(PERF_BUDGETS.chatSessionsColdMs);
    expect(warm.ms).toBeLessThan(PERF_BUDGETS.chatSessionsWarmMs);
  });
});
