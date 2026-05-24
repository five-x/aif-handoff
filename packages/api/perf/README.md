# API load suite (k6)

Backend-level perf tests. Fire N concurrent virtual users against key API
routes so we catch stampede, cache-thrash, and DB regressions that a single
browser in the Playwright suite cannot reveal.

## Validation target

The deployed service lives at `192.168.88.67`. Codex must not run API load,
perf, live API, or service validation against a locally booted dev stack by
default.

Use the remote service unless the user explicitly authorizes local validation
for the current turn.

## Prerequisites

- **k6 >= 1.0** on PATH. macOS: `brew install k6`. Linux/Windows: see
  <https://k6.io/docs/get-started/installation/>.
- API reachable at `AIF_API_URL`, normally `http://192.168.88.67/api`.
- Codex validation is remote-by-default; local dev stack launch requires
  explicit `AIF_SKIP_DEV_SERVER=0` opt-in.
- Remote-only guards treat `localhost`, the full `127.0.0.0/8` loopback range,
  IPv4-mapped loopback addresses, and bind addresses such as `0.0.0.0` or
  `[::]` as local targets.

## Run

```powershell
# one-shot via the root alias used by ai:validate (remote by default)
$env:AIF_SKIP_DEV_SERVER = "1"
$env:AIF_API_URL = "http://192.168.88.67/api"
npm run ai:load

# or invoke a single script manually against the remote API
k6 run --env AIF_API_URL=http://192.168.88.67/api packages/api/perf/k6/runtime-profiles.js
```

Summaries land in `packages/api/perf/reports/<script>.summary.json`;
`run.json` records which scripts were executed.

## Scripts

- `runtime-profiles.js` - 20 VU ramp + sustain on
  `/runtime-profiles?includeGlobal=true`. Thresholds: failure rate < 1%,
  p95 < 8s, p99 < 12s. Aimed at the server-side Codex session scan.
- `chat-sessions.js` - 10 VU constant load on
  `/chat/sessions?projectId=<first>`. Thresholds: p95 < 3s, p99 < 6s.
- `tasks.js` - 20 VU constant load on `/tasks`. Thresholds: p95 < 500ms,
  p99 < 1s. This endpoint must not touch the filesystem.

## Adding a script

1. Drop a new `*.js` into `k6/` exporting `options` with thresholds and a
   default function.
2. Import helpers from `./common.js` for consistent tagging and the shared
   `resolveFirstProjectId()` setup.
3. The orchestrator picks up runnable `*.js` scripts automatically and
   excludes helper modules such as `common.js` and `target-guard.js`; update
   `run.test.mjs` when adding another helper.
