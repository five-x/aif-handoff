import { expect, test } from "@playwright/test";
import {
  PERF_API_URL,
  PERF_BUDGETS,
  readNavigationTiming,
  readWebVitals,
  recordNetwork,
} from "./utils";

// This spec exercises the cold dashboard render: open `/`, wait for the app
// shell to be present, then snapshot timing + network. "Cold" here means the
// browser has no HTTP cache for bundles; the API still uses its server-side
// cache, so early runs right after starting dev will hit worst-case latencies.
test.describe("dashboard cold load", () => {
  test("renders kanban shell within LCP/DOM-ready budgets", async ({ page, context }) => {
    await context.clearCookies();
    const network = recordNetwork(page, (url) => url.startsWith(PERF_API_URL));

    const nav = page.goto("/", { waitUntil: "domcontentloaded" });
    const response = await nav;
    expect(response?.status() ?? 500).toBeLessThan(400);

    // Wait until the dashboard paints either the populated kanban board or the
    // empty-project state used by a fresh local database.
    await expect(
      page.getByText(/Backlog|Planning|Implementing|No projects yet/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    const timing = await readNavigationTiming(page);
    const vitals = await readWebVitals(page);
    const apiCalls = network.stop();

    // eslint-disable-next-line no-console
    console.log("[perf] dashboard timing:", {
      nav: timing,
      vitals,
      apiCalls: apiCalls.map(({ url, durationMs, status }) => ({
        url: url.replace(PERF_API_URL, ""),
        durationMs,
        status,
      })),
    });

    expect(timing.domContentLoadedMs).toBeLessThan(PERF_BUDGETS.dashboardDomReadyMs);
    if (vitals.lcpMs != null) {
      expect(vitals.lcpMs).toBeLessThan(PERF_BUDGETS.dashboardLcpMs);
    }
  });
});
