# Browser performance suite

Playwright-driven synthetic perf tests. These exercise the real web stack
(API + web bundle) and enforce latency budgets so regressions fail the suite
instead of shipping.

## Validation target

The deployed service lives at `192.168.88.67`. Codex must not run browser,
e2e, perf, or service validation against a locally booted dev stack by default.

Use the remote service unless the user explicitly authorizes local validation
for the current turn.

## Run

```powershell
# one-time: install browsers
npm run perf:install --workspace=@aif/web

# remote service validation (default; env lines are explicit for clarity)
$env:AIF_SKIP_DEV_SERVER = "1"
$env:AIF_WEB_URL = "http://192.168.88.67"
$env:AIF_API_URL = "http://192.168.88.67/api"
npm run perf --workspace=@aif/web
```

The Playwright config can launch a dev server for manual development, but Codex
validation is remote-by-default and local launch requires explicit
`AIF_SKIP_DEV_SERVER=0` opt-in. `AIF_API_URL` is used for direct API probes and
its `/api` path is inferred for browser-side endpoint timing. The remote-only
guard treats `localhost`, the full `127.0.0.0/8` loopback range,
IPv4-mapped loopback addresses, and bind addresses such as `0.0.0.0` or
`[::]` as local targets.

## What each spec measures

- `perf/dashboard-load.spec.ts` - cold kanban render. Asserts DOM-ready and
  LCP budgets after the dashboard shell paints.
- `perf/runtime-profiles-endpoint.spec.ts` - cold + warm `/runtime-profiles`
  timings from inside the browser.
- `perf/chat-sessions-endpoint.spec.ts` - cold + warm `/chat/sessions`
  timings keyed to the first project present in the service DB.

## Budgets

Budgets live in `e2e/perf/utils.ts` (`PERF_BUDGETS`). Tune them after a few
remote runs so the suite flags real regressions and not natural variance. Each
spec also prints the raw metrics to stdout so you can spot drift even when the
assertions still pass.

## Report

After a run, an HTML report is written to `playwright-report/`. Open it with:

```powershell
npm run perf:report --workspace=@aif/web
```

Traces for failed runs live next to the report; open them in
`npx playwright show-trace <path>` for flame charts and network waterfalls.
