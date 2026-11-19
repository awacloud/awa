# `e2e/` — real-browser smoke of the demos and playground

Every page of `demos/` and `playground/`, loaded in Chromium and Firefox.

```bash
bun run test:e2e                     # = node e2e/run.mjs clean
node e2e/run.mjs sentinel            # proves the gate can go red
node e2e/run.mjs clean --out r.json  # the full report as JSON
```

A page passes when it reaches readiness with zero console errors, zero page
errors, zero failed requests and no HTTP status ≥ 400:

- an **entry page** (`demos/<slug>/`, `playground/<slug>/`) sets
  `data-ready="1"` on `<html>` two animation frames after its `run()`
  resolved;
- a **family index page** (`demos/index.html`, `playground/index.html`) is
  static and is waited on `load`.

The pages are discovered from the two directories, not listed, so a new page
is in the smoke the day it lands (`tests/e2e-harness.integration.test.js`
checks the discovery and the readiness line under `bun test`).

## Exit codes

| Code | `clean` | `sentinel` |
|---|---|---|
| 0 | every page passed in both engines | exactly the injected pages failed, in both engines |
| 1 | a page failed (the report names it and why) | the gate missed a fault, or flagged a sound page |
| 2 | INCONCLUSIVE: port 4821 taken, or a browser not installed | same |

`sentinel` serves, through the server's overrides seam (nothing on disk
changes), a throwing `main.js` for `demos/clock` and `playground/easing-lab`
and `demos/scene` without its readiness line: the first two must fail on the
page error, the third on the readiness timeout.

## Rules it follows

- Run with Node, never Playwright under Bun; `bun run test:e2e` spawns Node.
- Browsers come from the main checkout's `third_party/ms-playwright` through
  the repository's one resolver (`tests/e2e/browsers-path.mjs`); install them
  with `node tests/e2e/provision.mjs`. The pin is the repository's
  `@playwright/test`.
- The docroot is the repository root (the pages need `packages/front/fw/src`
  too), served by `e2e/server.mjs` on 127.0.0.1:4821.
- Nothing here is a `*.test.*` file: `bun test` never runs a browser.

An earlier, dated one-off measurement is kept as a record in the source
repository, outside this package.
